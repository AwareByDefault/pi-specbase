import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { LifecycleListeners, RunRecap, RunStatus, RunSummary, Workflow } from "@juicesharp/rpiv-workflow";
import type { BoardSnapshot } from "./kanban/types.js";
import {
	canonicalStoreKey,
	composeWorkflowActivity,
	parseWorkflowCorrelation,
	WorkflowActivityStore,
} from "./kanban/workflow-activity.js";

export interface PublicWorkflowReaders {
	registerLifecycle(listeners: LifecycleListeners): () => void;
	listRuns(cwd: string): RunSummary[];
	loadWorkflows(cwd: string): Promise<{ workflows: readonly Workflow[] }>;
	readRunStatus(cwd: string, runId: string, workflow: Workflow): Promise<RunStatus | undefined>;
	summarizeRun(cwd: string, runId: string): RunRecap | undefined;
}

export interface WorkflowActivityBoardAdapter {
	hydrate(): Promise<void>;
	subscribe(listener: () => void): { dispose(): void };
	compose(snapshot: BoardSnapshot): BoardSnapshot;
}

/** Observation-only public RPIV adapter. Every boundary is fail-soft. */
export class WorkflowActivityBridge {
	private readers: PublicWorkflowReaders | undefined;
	private lifecycleDispose: (() => void) | undefined;

	constructor(
		readonly store: WorkflowActivityStore,
		private readonly diagnostic: (message: string) => void = (message) =>
			console.warn(`[rpiv-specbase] workflow activity: ${message}`),
	) {}

	register(readers: PublicWorkflowReaders): () => void {
		this.lifecycleDispose?.();
		this.readers = readers;
		const safe =
			<A extends unknown[]>(label: string, fn: (...args: A) => void) =>
			(...args: A): void => {
				try {
					fn(...args);
				} catch (error) {
					this.diagnostic(`${label}: ${errorMessage(error)}`);
				}
			};
		this.lifecycleDispose = readers.registerLifecycle({
			onWorkflowStart: safe("workflow start", (ctx) => this.store.start(ctx)),
			onStageStart: safe("stage start", (stage, ctx) => this.store.stageStart(stage, ctx)),
			onStageEnd: safe("stage end", (stage, _output, ctx) => this.store.stageEnd(stage, ctx)),
			onStageRetry: safe("stage retry", (stage, attempt, ctx) => this.store.stageRetry(stage, attempt, ctx)),
			onStageError: safe("stage error", (stage, error, ctx) => this.store.stageError(stage, error, ctx)),
			onRoute: safe("route", (from, to, ctx) => this.store.route(from, to, ctx)),
			onLoopStart: safe("loop start", (stage, info, ctx) => this.store.loopStart(stage, info, ctx)),
			onUnitStart: safe("unit start", (stage, unit, ctx) => this.store.unitStart(stage, unit, ctx)),
			onUnitEnd: safe("unit end", (stage, unit, _output, ctx) => this.store.unitEnd(stage, unit, ctx)),
			onUnitHalt: safe("unit halt", (stage, unit, reason, ctx) => this.store.unitHalt(stage, unit, reason, ctx)),
			onLoopCap: safe("loop cap", (stage, info, ctx) => this.store.loopCap(stage, info, ctx)),
			onWorkflowEnd: safe("workflow end", (result, ctx) => {
				const recap = readers.summarizeRun(ctx.cwd, ctx.runId);
				this.store.end(result, ctx, recap);
			}),
		});
		return () => this.dispose();
	}

	board(root: string, storeId: string | null): WorkflowActivityBoardAdapter {
		return {
			hydrate: () => this.hydrate(root, storeId),
			subscribe: (listener) => this.store.subscribe(root, storeId, listener),
			compose: (snapshot) => composeWorkflowActivity(snapshot, root, storeId, this.store),
		};
	}

	async hydrate(root: string, storeId: string | null): Promise<void> {
		const readers = this.readers;
		if (!readers) return;
		try {
			const expectedStore = canonicalStoreKey(root, storeId);
			const latest = new Map<string, RunSummary>();
			for (const summary of readers.listRuns(root)) {
				const correlation = parseWorkflowCorrelation(summary.trigger, root);
				if (!correlation || correlation.storeKey !== expectedStore) continue;
				const prior = latest.get(correlation.workItemId);
				if (!prior || timestamp(summary.ts) >= timestamp(prior.ts)) latest.set(correlation.workItemId, summary);
			}
			if (latest.size === 0) return;
			const loaded = await readers.loadWorkflows(root);
			const workflows = new Map(loaded.workflows.map((workflow) => [workflow.name, workflow]));
			for (const summary of latest.values()) {
				const workflow = workflows.get(summary.workflow);
				if (!workflow) {
					this.diagnostic(`cannot hydrate run ${summary.runId}: workflow '${summary.workflow}' is unavailable`);
					continue;
				}
				const status = await readers.readRunStatus(root, summary.runId, workflow);
				if (!status) continue;
				const recap = status.terminal ? readers.summarizeRun(root, summary.runId) : undefined;
				this.store.hydrate(root, summary, status, recap);
			}
		} catch (error) {
			this.diagnostic(`hydration failed: ${errorMessage(error)}`);
		}
	}

	dispose(): void {
		try {
			this.lifecycleDispose?.();
		} catch (error) {
			this.diagnostic(`disposal failed: ${errorMessage(error)}`);
		}
		this.lifecycleDispose = undefined;
		this.readers = undefined;
	}
}

const STORE_SLOT = Symbol.for("@juicesharp/rpiv-specbase:workflowActivityStore");
const BRIDGE_SLOT = Symbol.for("@juicesharp/rpiv-specbase:workflowActivityBridge");
const GUARD_SLOT = Symbol.for("@juicesharp/rpiv-specbase:workflowActivityGuard");

interface RegistrationGuard {
	generation: number;
	promise?: Promise<void>;
	dispose?: () => void;
}

export function getWorkflowActivityStore(): WorkflowActivityStore {
	const global = globalThis as Record<symbol, unknown>;
	let store = global[STORE_SLOT] as WorkflowActivityStore | undefined;
	if (!store) {
		store = new WorkflowActivityStore();
		global[STORE_SLOT] = store;
	}
	return store;
}

export function getWorkflowActivityBridge(): WorkflowActivityBridge {
	const global = globalThis as Record<symbol, unknown>;
	let bridge = global[BRIDGE_SLOT] as WorkflowActivityBridge | undefined;
	if (!bridge) {
		bridge = new WorkflowActivityBridge(getWorkflowActivityStore());
		global[BRIDGE_SLOT] = bridge;
	}
	return bridge;
}

/** Root interactive-session hook with process-global concurrent reload protection. */
export function registerWorkflowActivityBridgeHook(
	pi: ExtensionAPI,
	bridge: WorkflowActivityBridge = getWorkflowActivityBridge(),
	load: () => Promise<PublicWorkflowReaders> = loadPublicWorkflowReaders,
): void {
	pi.on("session_start", async (_event: unknown, ctx: { hasUI?: boolean; ui?: ExtensionUIContext }) => {
		if (!ctx.hasUI || isLaneRelayUiContext(ctx.ui)) return;
		const guard = registrationGuard();
		if (guard.dispose) return;
		if (!guard.promise) {
			const generation = ++guard.generation;
			guard.promise = load()
				.then((readers) => {
					if (guard.generation !== generation) return;
					guard.dispose = bridge.register(readers);
				})
				.catch((error) => {
					if (!isMissingWorkflowPackage(error))
						console.warn(`[rpiv-specbase] workflow activity bridge unavailable: ${errorMessage(error)}`);
				})
				.finally(() => {
					guard.promise = undefined;
				});
		}
		await guard.promise;
	});
	pi.on("session_shutdown", (_event: unknown, ctx: { ui?: ExtensionUIContext }) => {
		if (isLaneRelayUiContext(ctx.ui)) return;
		const guard = registrationGuard();
		try {
			guard.dispose?.();
		} finally {
			guard.generation++;
			guard.dispose = undefined;
			guard.promise = undefined;
		}
	});
}

export function __resetWorkflowActivityBridge(): void {
	const global = globalThis as Record<symbol, unknown>;
	const guard = registrationGuard();
	guard.dispose?.();
	guard.generation++;
	guard.dispose = undefined;
	guard.promise = undefined;
	(global[BRIDGE_SLOT] as WorkflowActivityBridge | undefined)?.dispose();
	(global[STORE_SLOT] as WorkflowActivityStore | undefined)?.clear();
	delete global[BRIDGE_SLOT];
	delete global[STORE_SLOT];
}

async function loadPublicWorkflowReaders(): Promise<PublicWorkflowReaders> {
	return (await import("@juicesharp/rpiv-workflow")) as PublicWorkflowReaders;
}

function registrationGuard(): RegistrationGuard {
	const global = globalThis as Record<symbol, unknown>;
	let guard = global[GUARD_SLOT] as RegistrationGuard | undefined;
	if (!guard) {
		guard = { generation: 0 };
		global[GUARD_SLOT] = guard;
	}
	return guard;
}

const LANE_RELAY_BRAND = Symbol.for("rpiv:laneRelayUiContext");

function isLaneRelayUiContext(ui: unknown): boolean {
	return typeof ui === "object" && ui !== null && (ui as Record<symbol, unknown>)[LANE_RELAY_BRAND] === true;
}

function timestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function isMissingWorkflowPackage(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return (
		code === "ERR_MODULE_NOT_FOUND" || /Cannot find (?:package|module).*rpiv-workflow/iu.test(errorMessage(error))
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
