import { resolve } from "node:path";
import type {
	LifecycleContext,
	LoopCapInfo,
	LoopStartInfo,
	RunRecap,
	RunStatus,
	RunSummary,
	RunTrigger,
	RunWorkflowResult,
	StageRef,
	UnitEvent,
} from "@juicesharp/rpiv-workflow";
import type { BoardSnapshot } from "./types.js";

export type WorkflowActivityStatus =
	| "pending"
	| "interrupted"
	| "running"
	| "retry"
	| "completed"
	| "stopped"
	| "failed"
	| "aborted"
	| "cancelled";

export interface WorkflowCorrelation {
	readonly storeKey: string;
	readonly storeId: string | null;
	readonly workItemId: string;
	readonly actionId: string;
	readonly intentKey: string;
}

export interface WorkflowActivity {
	readonly storeKey: string;
	readonly workItemId: string;
	readonly actionId: string;
	readonly intentKey: string;
	readonly runId: string;
	readonly workflow: string;
	readonly status: WorkflowActivityStatus;
	readonly live: boolean;
	readonly resumed: boolean;
	readonly resumable: boolean;
	readonly stage?: string;
	readonly stageNumber?: number;
	readonly stageStatus?: "running" | "completed" | "retry" | "failed";
	readonly units?: { readonly done: number; readonly total: number; readonly label?: string };
	readonly retryAttempt?: number;
	readonly reason?: string;
	readonly order: number;
	readonly startedAt: string;
	readonly updatedAt: string;
}

type Listener = () => void;

/** Bounded immutable lifecycle projection keyed independently from canonical cards. */
export class WorkflowActivityStore {
	private readonly records = new Map<string, WorkflowActivity>();
	private readonly listeners = new Set<{ storeKey: string; listener: Listener }>();
	private readonly runKeys = new Map<string, string>();
	private readonly activeInstances = new Map<string, object>();
	private readonly completedUnits = new Map<string, Set<number>>();
	private nextOrder = 0;

	constructor(private readonly maxRecords = 100) {}

	subscribe(root: string, storeId: string | null, listener: Listener): { dispose(): void } {
		const entry = { storeKey: canonicalStoreKey(root, storeId), listener };
		this.listeners.add(entry);
		return { dispose: () => this.listeners.delete(entry) };
	}

	get(root: string, storeId: string | null, workItemId: string): WorkflowActivity | undefined {
		return this.records.get(cardKey(canonicalStoreKey(root, storeId), workItemId));
	}

	start(ctx: LifecycleContext): void {
		const correlation = parseWorkflowCorrelation(ctx.trigger, ctx.cwd);
		const existingKey = this.runKeys.get(ctx.runId);
		const key = correlation ? cardKey(correlation.storeKey, correlation.workItemId) : existingKey;
		if (!key) return;
		const existing = this.records.get(key);
		if (!correlation && existing?.runId !== ctx.runId) return;
		if (existing && existing.runId !== ctx.runId && existing.runId.localeCompare(ctx.runId) > 0) return;
		if (existing && existing.runId !== ctx.runId) this.cleanupRun(existing.runId);
		const identity = correlation ?? correlationOf(existing!);
		this.activeInstances.set(ctx.runId, ctx.state as object);
		this.completedUnits.set(ctx.runId, new Set());
		this.runKeys.set(ctx.runId, key);
		this.replace(key, {
			...identity,
			runId: ctx.runId,
			workflow: ctx.workflow,
			status: "running",
			live: true,
			resumed: existing?.runId === ctx.runId,
			resumable: true,
			order: this.order(),
			startedAt: existing?.runId === ctx.runId ? existing.startedAt : now(),
			updatedAt: now(),
		});
	}

	stageStart(stage: StageRef, ctx: LifecycleContext): void {
		this.updateLive(ctx, {
			status: "running",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			stageStatus: "running",
			retryAttempt: undefined,
			reason: undefined,
			units: undefined,
		});
	}

	stageEnd(stage: StageRef, ctx: LifecycleContext): void {
		this.updateLive(ctx, {
			status: "running",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			stageStatus: "completed",
			retryAttempt: undefined,
		});
	}

	stageRetry(stage: StageRef, attempt: number, ctx: LifecycleContext): void {
		this.updateLive(ctx, {
			status: "retry",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			stageStatus: "retry",
			retryAttempt: attempt,
		});
	}

	loopStart(stage: StageRef, info: LoopStartInfo, ctx: LifecycleContext): void {
		this.completedUnits.set(ctx.runId, new Set());
		this.updateLive(ctx, {
			status: "running",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			stageStatus: "running",
			units: info.units ? { done: 0, total: info.units.length } : undefined,
		});
	}

	unitStart(stage: StageRef, unit: UnitEvent, ctx: LifecycleContext): void {
		const current = this.currentLive(ctx);
		const units = current?.units;
		this.updateLive(ctx, {
			status: "running",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			units: units ? { ...units, label: unit.label } : undefined,
		});
	}

	unitEnd(stage: StageRef, unit: UnitEvent, ctx: LifecycleContext): void {
		const current = this.currentLive(ctx);
		const completed = this.completedUnits.get(ctx.runId) ?? new Set<number>();
		completed.add(unit.index);
		this.completedUnits.set(ctx.runId, completed);
		this.updateLive(ctx, {
			status: "running",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			units: current?.units ? { done: completed.size, total: current.units.total, label: unit.label } : undefined,
		});
	}

	unitHalt(stage: StageRef, unit: UnitEvent, reason: string, ctx: LifecycleContext): void {
		this.unitEnd(stage, unit, ctx);
		this.updateLive(ctx, { reason: `${unit.label}: ${reason}` });
	}

	loopCap(stage: StageRef, info: LoopCapInfo, ctx: LifecycleContext): void {
		this.updateLive(ctx, {
			stage: stage.name,
			stageNumber: stage.stageNumber,
			reason: `${info.kind} cap ${info.count}/${info.max} (${info.policy})`,
		});
	}

	route(from: StageRef, to: string, ctx: LifecycleContext): void {
		if (to !== "stop") return;
		this.updateLive(ctx, {
			status: "stopped",
			stage: from.name,
			stageNumber: from.stageNumber,
			reason: `stopped at ${from.name}`,
		});
	}

	stageError(stage: StageRef, error: string, ctx: LifecycleContext): void {
		this.updateLive(ctx, {
			status: "interrupted",
			stage: stage.name,
			stageNumber: stage.stageNumber,
			stageStatus: "failed",
			reason: error,
		});
	}

	end(result: RunWorkflowResult, ctx: LifecycleContext, recap: RunRecap | undefined): void {
		const current = this.currentLive(ctx);
		if (!current) {
			this.cleanupRun(ctx.runId);
			return;
		}
		const outcome = recap?.outcome === "stopped" ? "stopped" : result.termination?.status;
		if (!outcome || outcome === "running") return;
		this.activeInstances.delete(ctx.runId);
		this.completedUnits.delete(ctx.runId);
		this.runKeys.delete(ctx.runId);
		const resumeSafe = !result.droppedFailureRows?.length;
		this.replace(cardKey(current.storeKey, current.workItemId), {
			...current,
			status: outcome,
			live: false,
			resumable: resumeSafe && (outcome === "failed" || outcome === "aborted" || outcome === "cancelled"),
			...(recap?.failureReason || result.termination?.error || !resumeSafe
				? {
						reason:
							recap?.failureReason ??
							result.termination?.error ??
							"Resume unavailable because a failure row was not persisted.",
					}
				: {}),
			order: this.order(),
			updatedAt: now(),
		});
	}

	hydrate(cwd: string, summary: RunSummary, status: RunStatus, recap: RunRecap | undefined): void {
		const correlation = parseWorkflowCorrelation(summary.trigger, cwd);
		if (!correlation) return;
		const key = cardKey(correlation.storeKey, correlation.workItemId);
		const current = this.records.get(key);
		if (current?.live) return;
		if (current && Date.parse(current.startedAt) > Date.parse(summary.ts)) return;
		const mappedStatus = status.status;
		this.runKeys.set(summary.runId, key);
		this.replace(key, {
			...correlation,
			runId: summary.runId,
			workflow: summary.workflow,
			status: mappedStatus,
			live: false,
			resumed: false,
			resumable: status.resumable,
			...(status.lastStage ? { stage: status.lastStage, stageStatus: terminalStageStatus(status) } : {}),
			...(status.stageNumber !== undefined ? { stageNumber: status.stageNumber } : {}),
			...(status.reason || recap?.failureReason ? { reason: status.reason ?? recap?.failureReason } : {}),
			order: this.order(),
			startedAt: summary.ts,
			updatedAt: now(),
		});
	}

	clear(): void {
		this.records.clear();
		this.runKeys.clear();
		this.activeInstances.clear();
		this.completedUnits.clear();
		for (const entry of this.listeners) entry.listener();
	}

	private currentLive(ctx: LifecycleContext): WorkflowActivity | undefined {
		if (this.activeInstances.get(ctx.runId) !== (ctx.state as object)) return undefined;
		const key = this.runKeys.get(ctx.runId);
		if (!key) return undefined;
		const current = this.records.get(key);
		return current?.runId === ctx.runId ? current : undefined;
	}

	private updateLive(ctx: LifecycleContext, patch: Partial<WorkflowActivity>): void {
		const current = this.currentLive(ctx);
		if (!current) return;
		this.replace(cardKey(current.storeKey, current.workItemId), {
			...current,
			...patch,
			order: this.order(),
			updatedAt: now(),
		});
	}

	private replace(key: string, value: WorkflowActivity): void {
		const frozen = freezeActivity(value);
		this.records.delete(key);
		this.records.set(key, frozen);
		while (this.records.size > this.maxRecords) {
			const oldest = Array.from(this.records.entries()).find(([, record]) => !record.live)?.[0];
			if (!oldest) break;
			const removed = this.records.get(oldest);
			this.records.delete(oldest);
			if (removed) this.cleanupRun(removed.runId);
		}
		for (const entry of this.listeners) if (entry.storeKey === frozen.storeKey) entry.listener();
	}

	private cleanupRun(runId: string): void {
		this.runKeys.delete(runId);
		this.activeInstances.delete(runId);
		this.completedUnits.delete(runId);
	}

	private order(): number {
		return ++this.nextOrder;
	}
}

export function parseWorkflowCorrelation(
	trigger: RunTrigger | undefined,
	cwd: string,
): WorkflowCorrelation | undefined {
	if (trigger?.kind !== "programmatic" || trigger.source !== "rpiv-specbase" || !trigger.meta) return undefined;
	const meta = trigger.meta;
	if (
		!Number.isInteger(meta.catalogVersion) ||
		(meta.catalogVersion as number) < 1 ||
		!(meta.storeId === null || nonEmpty(meta.storeId)) ||
		!nonEmpty(meta.workItemId) ||
		!nonEmpty(meta.actionId) ||
		meta.dispatchKind !== "capability"
	)
		return undefined;
	const storeId = meta.storeId as string | null;
	const workItemId = meta.workItemId as string;
	const actionId = meta.actionId as string;
	return Object.freeze({
		storeKey: canonicalStoreKey(cwd, storeId),
		storeId,
		workItemId,
		actionId,
		intentKey: JSON.stringify([meta.catalogVersion, storeId, workItemId, actionId, meta.dispatchKind]),
	});
}

export function composeWorkflowActivity(
	snapshot: BoardSnapshot,
	root: string,
	storeId: string | null,
	store: WorkflowActivityStore,
): BoardSnapshot {
	let changed = false;
	const columns = snapshot.columns.map((column) => {
		const cards = column.cards.map((card) => {
			const activity = store.get(root, storeId, card.id);
			if (!activity) return card;
			changed = true;
			const rendered = formatWorkflowActivity(activity);
			return { ...card, activity: rendered, summary: `${card.summary} · ${rendered}` };
		});
		return cards.some((card, index) => card !== column.cards[index]) ? { ...column, cards } : column;
	});
	return changed ? { ...snapshot, columns } : snapshot;
}

export function formatWorkflowActivity(activity: WorkflowActivity): string {
	const parts = [`RPIV ${activity.status}`, activity.workflow];
	if (activity.stage)
		parts.push(
			`stage ${activity.stage}${activity.stageNumber ? ` #${activity.stageNumber}` : ""}${activity.stageStatus ? ` ${activity.stageStatus}` : ""}`,
		);
	if (activity.units)
		parts.push(
			`units ${activity.units.done}/${activity.units.total}${activity.units.label ? ` ${activity.units.label}` : ""}`,
		);
	if (activity.retryAttempt !== undefined) parts.push(`retry ${activity.retryAttempt}`);
	if (activity.reason) parts.push(activity.reason);
	if (activity.resumed && activity.live) parts.push("resumed");
	if (activity.resumable && !activity.live) parts.push("resume available");
	parts.push(`run ${activity.runId}`);
	return parts.join(" · ");
}

export function canonicalStoreKey(root: string, storeId: string | null): string {
	return storeId === null ? `root:${resolve(root)}` : `store:${storeId}`;
}

function correlationOf(activity: WorkflowActivity): WorkflowCorrelation {
	return {
		storeKey: activity.storeKey,
		storeId: activity.storeKey.startsWith("store:") ? activity.storeKey.slice("store:".length) : null,
		workItemId: activity.workItemId,
		actionId: activity.actionId,
		intentKey: activity.intentKey,
	};
}

function cardKey(storeKey: string, workItemId: string): string {
	return JSON.stringify([storeKey, workItemId]);
}

function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function terminalStageStatus(status: RunStatus): WorkflowActivity["stageStatus"] {
	return status.status === "failed" || status.status === "aborted" || status.status === "cancelled"
		? "failed"
		: "completed";
}

function freezeActivity(value: WorkflowActivity): WorkflowActivity {
	const units = value.units ? Object.freeze({ ...value.units }) : undefined;
	return Object.freeze({ ...value, ...(units ? { units } : {}) });
}

function now(): string {
	return new Date().toISOString();
}
