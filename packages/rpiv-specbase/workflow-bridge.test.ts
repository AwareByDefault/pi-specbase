import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	acts,
	defineWorkflow,
	type LifecycleContext,
	type LifecycleListeners,
	type RunRecap,
	type RunStatus,
	type RunSummary,
} from "@juicesharp/rpiv-workflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowActivityStore } from "./kanban/workflow-activity.js";
import type { PublicWorkflowReaders } from "./workflow-bridge.js";
import {
	__resetWorkflowActivityBridge,
	registerWorkflowActivityBridgeHook,
	WorkflowActivityBridge,
} from "./workflow-bridge.js";

const workflow = defineWorkflow({
	name: "deliver",
	start: "plan",
	stages: { plan: acts({ skill: "plan" }), implement: acts({ skill: "implement" }) },
	edges: { plan: "implement", implement: "stop" },
});
const trigger = {
	kind: "programmatic" as const,
	source: "rpiv-specbase",
	meta: {
		catalogVersion: 1,
		storeId: "acme",
		workItemId: "change-1",
		actionId: "deliver-local",
		dispatchKind: "capability",
	},
};

function readers(overrides: Partial<PublicWorkflowReaders> = {}) {
	let listeners: LifecycleListeners | undefined;
	const dispose = vi.fn();
	const value: PublicWorkflowReaders = {
		registerLifecycle: vi.fn((bundle) => {
			listeners = bundle;
			return dispose;
		}),
		listRuns: vi.fn(() => []),
		loadWorkflows: vi.fn(async () => ({ workflows: [workflow] })),
		readRunStatus: vi.fn(async () => undefined),
		summarizeRun: vi.fn(() => undefined),
		...overrides,
	};
	return { value, bundle: () => listeners!, dispose };
}

function fakePi() {
	const events = new Map<string, Array<(...args: never[]) => unknown>>();
	const pi = {
		on: vi.fn((name: string, handler: (...args: never[]) => unknown) => {
			const handlers = events.get(name) ?? [];
			handlers.push(handler);
			events.set(name, handlers);
		}),
	} as unknown as ExtensionAPI;
	return {
		pi,
		fire: async (name: string, ctx: object = {}) => {
			for (const handler of events.get(name) ?? [])
				await (handler as unknown as (event: unknown, context: unknown) => unknown)({}, ctx);
		},
	};
}

function context(runId = "run-1", state: object = {}): LifecycleContext {
	return {
		cwd: "/registered/acme",
		runId,
		workflow: "deliver",
		totalStages: 2,
		trigger,
		state: state as LifecycleContext["state"],
	};
}

beforeEach(() => __resetWorkflowActivityBridge());
afterEach(() => __resetWorkflowActivityBridge());

describe("Specbase workflow lifecycle bridge", () => {
	it("registers only for a root UI session and stays idempotent across concurrent reload starts", async () => {
		const bridge = new WorkflowActivityBridge(new WorkflowActivityStore());
		const api = readers();
		const load = vi.fn(async () => api.value);
		const host = fakePi();
		registerWorkflowActivityBridgeHook(host.pi, bridge, load);

		await host.fire("session_start", { hasUI: false });
		expect(load).not.toHaveBeenCalled();
		await Promise.all([
			host.fire("session_start", { hasUI: true, ui: {} }),
			host.fire("session_start", { hasUI: true, ui: {} }),
		]);
		expect(load).toHaveBeenCalledTimes(1);
		expect(api.value.registerLifecycle).toHaveBeenCalledTimes(1);

		const relayUi = { [Symbol.for("rpiv:laneRelayUiContext")]: true };
		await host.fire("session_start", { hasUI: true, ui: relayUi });
		await host.fire("session_shutdown", { ui: relayUi });
		expect(api.dispose).not.toHaveBeenCalled();

		await host.fire("session_shutdown", { ui: {} });
		expect(api.dispose).toHaveBeenCalledTimes(1);
	});

	it("does not register after root shutdown wins a pending import race", async () => {
		const host = fakePi();
		const api = readers();
		let resolve!: (value: PublicWorkflowReaders) => void;
		const pending = new Promise<PublicWorkflowReaders>((done) => {
			resolve = done;
		});
		registerWorkflowActivityBridgeHook(
			host.pi,
			new WorkflowActivityBridge(new WorkflowActivityStore()),
			() => pending,
		);
		const starting = host.fire("session_start", { hasUI: true, ui: {} });
		await host.fire("session_shutdown", { ui: {} });
		resolve(api.value);
		await starting;
		expect(api.value.registerLifecycle).not.toHaveBeenCalled();
	});

	it("degrades without RPIV and permits a later registration retry", async () => {
		const host = fakePi();
		const api = readers();
		const load = vi
			.fn<() => Promise<PublicWorkflowReaders>>()
			.mockRejectedValueOnce(
				Object.assign(new Error("Cannot find package rpiv-workflow"), { code: "ERR_MODULE_NOT_FOUND" }),
			)
			.mockResolvedValueOnce(api.value);
		registerWorkflowActivityBridgeHook(host.pi, new WorkflowActivityBridge(new WorkflowActivityStore()), load);
		await expect(host.fire("session_start", { hasUI: true, ui: {} })).resolves.toBeUndefined();
		await expect(host.fire("session_start", { hasUI: true, ui: {} })).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledTimes(2);
		expect(api.value.registerLifecycle).toHaveBeenCalledTimes(1);
	});

	it("isolates projection failures from lifecycle dispatch", () => {
		const diagnostics = vi.fn();
		const store = new WorkflowActivityStore();
		const api = readers();
		const bridge = new WorkflowActivityBridge(store, diagnostics);
		bridge.register(api.value);
		vi.spyOn(store, "stageStart").mockImplementation(() => {
			throw new Error("projection exploded");
		});
		expect(() =>
			api.bundle().onStageStart?.({ kind: "skill", name: "plan", stageNumber: 1, skill: "plan" }, context()),
		).not.toThrow();
		expect(diagnostics).toHaveBeenCalledWith(expect.stringContaining("projection exploded"));
	});

	it("hydrates the latest correlated run through public headers, status, and recap readers", async () => {
		const latest = {
			runId: "run-new",
			workflow: "deliver",
			input: "opaque",
			ts: "2026-08-21T11:00:00Z",
			trigger,
		};
		const api = readers({
			listRuns: vi.fn((): RunSummary[] => [
				{ ...latest, runId: "run-old", ts: "2026-08-21T10:00:00Z" },
				latest,
				{ ...latest, runId: "unrelated", trigger: { kind: "programmatic" as const, source: "other" } },
			]),
			readRunStatus: vi.fn(
				async (): Promise<RunStatus> => ({
					status: "stopped",
					terminal: true,
					resumable: false,
					lastStage: "approval",
					stageNumber: 2,
					reason: "stopped at approval: rejected",
				}),
			),
			summarizeRun: vi.fn(
				(): RunRecap => ({
					outcome: "stopped",
					artifacts: [],
					workflow: "deliver",
					failureReason: "stopped at approval: rejected",
				}),
			),
		});
		const store = new WorkflowActivityStore();
		const bridge = new WorkflowActivityBridge(store);
		bridge.register(api.value);
		await bridge.board("/registered/acme", "acme").hydrate();
		expect(api.value.readRunStatus).toHaveBeenCalledTimes(1);
		expect(api.value.readRunStatus).toHaveBeenCalledWith("/registered/acme", "run-new", workflow);
		expect(store.get("/registered/acme", "acme", "change-1")).toMatchObject({
			runId: "run-new",
			status: "stopped",
			stage: "approval",
		});
	});

	it("classifies a restarted non-terminal run as interrupted without consulting a misleading recap", async () => {
		const summarizeRun = vi.fn(() => ({ outcome: "completed" as const, artifacts: [], workflow: "deliver" }));
		const api = readers({
			listRuns: vi.fn(() => [
				{ runId: "cut-off", workflow: "deliver", input: "opaque", ts: "2026-08-21T11:00:00Z", trigger },
			]),
			readRunStatus: vi.fn(
				async (): Promise<RunStatus> => ({
					status: "interrupted",
					terminal: false,
					resumable: true,
					lastStage: "plan",
					stageNumber: 1,
				}),
			),
			summarizeRun,
		});
		const store = new WorkflowActivityStore();
		const bridge = new WorkflowActivityBridge(store);
		bridge.register(api.value);
		await bridge.board("/registered/acme", "acme").hydrate();
		expect(summarizeRun).not.toHaveBeenCalled();
		expect(store.get("/registered/acme", "acme", "change-1")).toMatchObject({
			status: "interrupted",
			live: false,
			resumable: true,
		});
	});

	it("repaints subscribed boards for live events and disposes subscriptions", () => {
		const store = new WorkflowActivityStore();
		const bridge = new WorkflowActivityBridge(store);
		const board = bridge.board("/registered/acme", "acme");
		const repaint = vi.fn();
		const subscription = board.subscribe(repaint);
		store.start(context());
		expect(repaint).toHaveBeenCalledTimes(1);
		subscription.dispose();
		store.stageStart({ kind: "skill", name: "plan", stageNumber: 1, skill: "plan" }, context("run-1", {}));
		expect(repaint).toHaveBeenCalledTimes(1);
	});

	it("uses no private RPIV state path or JSONL reader", () => {
		const source = readFileSync(new URL("./workflow-bridge.ts", import.meta.url), "utf8");
		expect(source).not.toContain(".rpiv/workflows");
		expect(source).not.toContain("stateFilePath");
		expect(source).not.toContain("readAllStages");
		expect(source).not.toContain("readFileSync(");
	});
});
