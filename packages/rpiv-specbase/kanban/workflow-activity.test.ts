import type { Theme } from "@earendil-works/pi-coding-agent";
import { makeTheme } from "@juicesharp/rpiv-test-utils";
import type { LifecycleContext, RunStatus, RunSummary } from "@juicesharp/rpiv-workflow";
import { describe, expect, it, vi } from "vitest";
import { FixtureBoard } from "./fixture-board.js";
import type { BoardSnapshot } from "./types.js";
import {
	composeWorkflowActivity,
	formatWorkflowActivity,
	parseWorkflowCorrelation,
	WorkflowActivityStore,
} from "./workflow-activity.js";

const validTrigger = {
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

function context(
	runId: string,
	state: object = {},
	trigger: LifecycleContext["trigger"] = validTrigger,
): LifecycleContext {
	return {
		cwd: "/project",
		runId,
		workflow: "deliver",
		totalStages: 4,
		trigger,
		state: state as LifecycleContext["state"],
	};
}

function board(): BoardSnapshot {
	return {
		id: "board",
		title: "Board",
		columns: [
			{
				id: "implementing",
				label: "Implementing",
				cards: [{ id: "change-1", title: "Change", summary: "implementing · tasks 1/2", actions: [] }],
			},
		],
		source: Object.freeze({ canonical: true }),
	};
}

describe("workflow activity projection", () => {
	it("correlates only complete rpiv-specbase trigger metadata", () => {
		expect(parseWorkflowCorrelation(validTrigger, "/project")).toMatchObject({
			storeKey: "store:acme",
			workItemId: "change-1",
			actionId: "deliver-local",
		});
		expect(
			parseWorkflowCorrelation({ kind: "programmatic", source: "another", meta: validTrigger.meta }, "/project"),
		).toBeUndefined();
		expect(
			parseWorkflowCorrelation(
				{ kind: "programmatic", source: "rpiv-specbase", meta: { ...validTrigger.meta, actionId: "" } },
				"/project",
			),
		).toBeUndefined();
		expect(
			parseWorkflowCorrelation({ kind: "command", name: "wf", meta: validTrigger.meta }, "/project"),
		).toBeUndefined();
	});

	it("publishes immutable stage, fan-out, retry, halt, and loop-cap overlays", () => {
		const store = new WorkflowActivityStore();
		const notify = vi.fn();
		store.subscribe("/registered/acme", "acme", notify);
		const ctx = context("run-1");
		store.start(ctx);
		const implement = { kind: "skill" as const, name: "implement", stageNumber: 2, skill: "implement" };
		store.stageStart(implement, ctx);
		store.stageEnd(implement, ctx);
		expect(store.get("/registered/acme", "acme", "change-1")).toMatchObject({ stageStatus: "completed" });
		store.stageRetry(implement, 2, ctx);
		store.loopStart(
			{ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" },
			{
				kind: "fanout",
				units: [
					{ label: "phase 1", prompt: "p1" },
					{ label: "phase 2", prompt: "p2" },
				],
			},
			ctx,
		);
		store.unitStart(
			{ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" },
			{ role: "produce", index: 1, unitId: "p2", label: "phase 2", skill: "implement" },
			ctx,
		);
		store.unitEnd(
			{ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" },
			{ role: "produce", index: 1, unitId: "p2", label: "phase 2", skill: "implement" },
			ctx,
		);
		store.unitHalt(
			{ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" },
			{ role: "produce", index: 0, unitId: "p1", label: "phase 1", skill: "implement" },
			"validation failed",
			ctx,
		);
		store.loopCap(
			{ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" },
			{ kind: "fanout", count: 2, max: 2, policy: "advance" },
			ctx,
		);
		const activity = store.get("/registered/acme", "acme", "change-1")!;
		expect(activity).toMatchObject({
			status: "running",
			stage: "implement",
			stageNumber: 2,
			units: { done: 2, total: 2, label: "phase 1" },
			reason: "fanout cap 2/2 (advance)",
		});
		expect(Object.isFrozen(activity)).toBe(true);
		expect(Object.isFrozen(activity.units)).toBe(true);
		expect(notify).toHaveBeenCalled();
	});

	it.each([
		["completed", undefined],
		["failed", "build failed"],
		["aborted", "operator aborted"],
		["cancelled", "operator cancelled"],
	] as const)("preserves the %s terminal result", (status, reason) => {
		const store = new WorkflowActivityStore();
		const ctx = context(`run-${status}`);
		store.start(ctx);
		store.end(
			{
				runId: ctx.runId,
				stagesCompleted: 1,
				success: status === "completed",
				termination: reason ? { status, error: reason } : { status: "completed" },
			},
			ctx,
			{ outcome: status, artifacts: [], workflow: "deliver", ...(reason ? { failureReason: reason } : {}) },
		);
		expect(store.get("/project", "acme", "change-1")).toMatchObject({
			status,
			live: false,
			...(reason ? { reason } : {}),
		});
	});

	it("does not advertise resume when a failure row was dropped", () => {
		const store = new WorkflowActivityStore();
		const ctx = context("unsafe-run");
		store.start(ctx);
		store.stageError({ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" }, "disk full", ctx);
		expect(store.get("/project", "acme", "change-1")).toMatchObject({ status: "interrupted", live: true });
		store.end(
			{
				runId: ctx.runId,
				stagesCompleted: 1,
				success: false,
				termination: { status: "failed", error: "disk full" },
				droppedFailureRows: ["implement"],
			},
			ctx,
			{ outcome: "failed", artifacts: [], workflow: "deliver", failureReason: "disk full" },
		);
		expect(store.get("/project", "acme", "change-1")).toMatchObject({
			status: "failed",
			live: false,
			resumable: false,
		});
	});

	it("preserves a route stop when workflow termination reports completed", () => {
		const store = new WorkflowActivityStore();
		const ctx = context("run-stop");
		store.start(ctx);
		store.route({ kind: "skill", name: "approval", stageNumber: 3, skill: "grade" }, "stop", ctx);
		store.end({ runId: ctx.runId, stagesCompleted: 3, success: true, termination: { status: "completed" } }, ctx, {
			outcome: "stopped",
			artifacts: [],
			workflow: "deliver",
			failureReason: "stopped at approval: rejected",
		});
		expect(store.get("/project", "acme", "change-1")).toMatchObject({
			status: "stopped",
			reason: "stopped at approval: rejected",
		});
	});

	it("reactivates a resumed run and ignores a late predecessor terminal event", () => {
		const store = new WorkflowActivityStore();
		const predecessor = context("same-run", {});
		store.start(predecessor);
		store.stageError({ kind: "skill", name: "implement", stageNumber: 2, skill: "implement" }, "boom", predecessor);
		const resumed = context("same-run", {}, { kind: "command", name: "wf", meta: { resumedFrom: "@same-run" } });
		store.start(resumed);
		const resumedActivity = store.get("/project", "acme", "change-1")!;
		expect(resumedActivity).toMatchObject({ status: "running", resumed: true });
		expect(resumedActivity.reason).toBeUndefined();
		store.end(
			{ runId: "same-run", stagesCompleted: 2, success: false, termination: { status: "failed", error: "late" } },
			predecessor,
			{ outcome: "failed", artifacts: [], failureReason: "late" },
		);
		expect(store.get("/project", "acme", "change-1")).toMatchObject({ status: "running", live: true });
	});

	it("ignores a delayed older run start for the same card", () => {
		const store = new WorkflowActivityStore();
		store.start(context("2026-08-21_12-00-00-bbbb"));
		store.start(context("2026-08-21_11-00-00-aaaa"));
		expect(store.get("/project", "acme", "change-1")?.runId).toBe("2026-08-21_12-00-00-bbbb");
	});

	it("correlates a restart resume from the preserved original trigger without prior hydration", () => {
		const store = new WorkflowActivityStore();
		store.start(
			context("resumed-after-restart", {}, { ...validTrigger, meta: { ...validTrigger.meta, resumedFrom: "@old" } }),
		);
		expect(store.get("/project", "acme", "change-1")).toMatchObject({
			runId: "resumed-after-restart",
			status: "running",
			live: true,
		});
	});

	it("hydrates exact interrupted state and never trusts a misleading completed recap", () => {
		const store = new WorkflowActivityStore();
		const summary: RunSummary = {
			runId: "persisted",
			workflow: "deliver",
			input: "ignored",
			ts: "2026-08-21T10:00:00Z",
			trigger: validTrigger,
		};
		const status: RunStatus = {
			status: "interrupted",
			terminal: false,
			resumable: true,
			lastStage: "plan",
			stageNumber: 1,
		};
		store.hydrate("/project", summary, status, { outcome: "completed", artifacts: [], workflow: "deliver" });
		const activity = store.get("/project", "acme", "change-1")!;
		expect(activity).toMatchObject({ status: "interrupted", live: false, resumable: true, stage: "plan" });
		expect(formatWorkflowActivity(activity)).toContain(
			"RPIV interrupted · deliver · stage plan #1 completed · resume available",
		);
	});

	it("composes onto matching cards without mutating canonical snapshots or painting phantom cards", () => {
		const store = new WorkflowActivityStore();
		store.start(context("run-card"));
		const canonical = board();
		const composed = composeWorkflowActivity(canonical, "/registered/acme", "acme", store);
		expect(composed).not.toBe(canonical);
		expect(composed.source).toBe(canonical.source);
		expect(canonical.columns[0]!.cards[0]!.summary).toBe("implementing · tasks 1/2");
		expect(composed.columns[0]!.cards[0]!.summary).toContain("RPIV running · deliver");
		expect(composed.columns[0]!.cards[0]!.activity).toContain("run run-card");
		const rendered = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme: makeTheme() as unknown as Theme,
			snapshot: composed,
			done: vi.fn(),
		})
			.render(120)
			.join("\n");
		expect(rendered).toContain("RPIV running");

		store.start(
			context("missing-card", {}, { ...validTrigger, meta: { ...validTrigger.meta, workItemId: "removed" } }),
		);
		expect(composeWorkflowActivity(canonical, "/registered/acme", "acme", store).columns[0]!.cards).toHaveLength(1);
	});

	it("bounds terminal recap cache entries without evicting live runs", () => {
		const store = new WorkflowActivityStore(2);
		for (const id of ["one", "two", "three"]) {
			const ctx = context(`run-${id}`, {}, { ...validTrigger, meta: { ...validTrigger.meta, workItemId: id } });
			store.start(ctx);
			store.end(
				{ runId: `run-${id}`, stagesCompleted: 1, success: true, termination: { status: "completed" } },
				ctx,
				{ outcome: "completed", artifacts: [], workflow: "deliver" },
			);
		}
		expect(store.get("/project", "acme", "one")).toBeUndefined();
		expect(store.get("/project", "acme", "two")).toBeDefined();
		expect(store.get("/project", "acme", "three")).toBeDefined();
	});
});
