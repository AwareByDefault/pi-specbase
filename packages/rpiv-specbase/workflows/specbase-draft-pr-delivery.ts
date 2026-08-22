import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	acts,
	defineRoute,
	defineWorkflow,
	fs,
	gitCommitOutcome,
	handleToString,
	jsonBodyParser,
	produces,
	type RunView,
	terminal,
	transcriptPathCollector,
	typeboxSchema,
	validateWorkflow,
	type Workflow,
} from "@juicesharp/rpiv-workflow/registration";
import { Value } from "typebox/value";
import {
	type DeterministicGate,
	DRAFT_PR_MAX_FIXES,
	DRAFT_PR_WORKFLOW_NAME,
	type DraftPrContext,
	type DraftPrDescriptor,
	type DraftPrLaunch,
	deterministicGateSchema,
	draftPrContextSchema,
	draftPrDescriptorSchema,
	draftPrLaunchSchema,
	type PanelDisposition,
	panelDispositionSchema,
	remoteHeadSchema,
	reviewingObservationSchema,
} from "./draft-pr-contracts.js";
import {
	captureDraftPrContext,
	ensureDraftPullRequest,
	githubCliAdapter,
	localRemoteGitAdapter,
	publishVerifiedHead,
	recordCanonicalDraftResult,
	registerDraftRunId,
	restoreDraftPanelFootprint,
	runDraftDeterministicGate,
	validatePanelDisposition,
	verifyPanelFixCommit,
	writeDraftArtifact,
} from "./draft-pr-delivery.js";
import { acquireDeliveryLease, attachRunToDeliveryLease, releaseDeliveryLease } from "./lease.js";

const resumedLeases = new Map<string, { path: string; ownerId: string }>();

function parseLaunch(input: string): DraftPrLaunch {
	const candidate: unknown = JSON.parse(input);
	if (!Value.Check(draftPrLaunchSchema, candidate)) throw new Error("Invalid draft-PR launch envelope.");
	return candidate as DraftPrLaunch;
}

const artifactOutcome = (name: string, file: string) => ({
	name,
	collector: transcriptPathCollector({
		pattern: new RegExp(`SPECBASE_DRAFT_PR_ARTIFACT:\\s+(\\S*${file.replace(".", "\\.")})`, "u"),
	}),
	parser: jsonBodyParser,
});

const panelOutcome = artifactOutcome("panel-disposition", "panel-disposition.json");

function context(state: RunView): DraftPrContext {
	const value = state.named.capture?.at(-1)?.data;
	if (!value) throw new Error("Draft-PR delivery requires its frozen capture context.");
	return value as DraftPrContext;
}

function finalGate(state: RunView): DeterministicGate {
	const value = state.named["final-gate"]?.at(-1)?.data;
	if (!value) throw new Error("Draft-PR delivery requires a final deterministic gate.");
	return value as DeterministicGate;
}

function panel(state: RunView): PanelDisposition {
	const value = state.named["panel-disposition"]?.at(-1)?.data;
	if (!value) throw new Error("Draft-PR delivery requires a typed panel disposition.");
	return value as PanelDisposition;
}

function descriptor(state: RunView): DraftPrDescriptor {
	const value = state.named["draft-pr"]?.at(-1)?.data;
	if (!value) throw new Error("Draft-PR delivery requires a confirmed draft descriptor.");
	return value as DraftPrDescriptor;
}

function runGate(
	ctx: DraftPrContext,
	allowDirtyFix = false,
	allowedDirtyPaths: readonly string[] = [],
): DeterministicGate {
	return runDraftDeterministicGate(
		ctx,
		(id) => {
			const file = id === "strict-change" ? "specbase" : "npm";
			const args =
				id === "strict-change"
					? ["validate", ctx.authorization.changeId, "--type", "change", "--strict", "--no-interactive"]
					: ["test"];
			const result = spawnSync(file, args, { cwd: ctx.authorization.root, encoding: "utf8", timeout: 120_000 });
			return {
				passed: !result.error && result.status === 0,
				summary: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-2_000),
			};
		},
		{ allowDirtyFix, allowedDirtyPaths },
	);
}

const dispositionRoute = defineRoute(
	["final-gate", "panel-local-fix", "stop-replan", "stop-fix-budget"],
	({ output, state }) => {
		const disposition = (output?.data as { disposition?: unknown } | undefined)?.disposition;
		if (disposition === "clean" || disposition === "advisory") return "final-gate";
		if (disposition === "replan") return "stop-replan";
		if (disposition !== "local-fix") return "stop-replan";
		return (state.named["panel-local-fix"]?.length ?? 0) >= DRAFT_PR_MAX_FIXES
			? "stop-fix-budget"
			: "panel-local-fix";
	},
);

const stop = terminal.script({ run: () => {} });

const workflow = defineWorkflow({
	name: DRAFT_PR_WORKFLOW_NAME,
	description:
		"Legacy recovery workflow: run the generated panel, publish one exact verified head without force, ensure one draft PR, and record a non-Reviewing draft observation when the historical contract remains available.",
	resume: {
		before: ({ input, runId }) => {
			const launch = parseLaunch(input);
			const lease = acquireDeliveryLease(
				{
					root: launch.authorization.root,
					storeId: launch.authorization.storeId,
					changeId: launch.authorization.changeId,
				},
				launch.ownerId,
			);
			if (!lease.acquired) throw new Error(lease.reason);
			attachRunToDeliveryLease(lease.path, launch.ownerId, runId);
			registerDraftRunId(launch.ownerId, runId);
			resumedLeases.set(runId, { path: lease.path, ownerId: launch.ownerId });
		},
		after: ({ runId, input }) => {
			const launch = parseLaunch(input);
			const lease = resumedLeases.get(runId);
			try {
				restoreDraftPanelFootprint(launch.authorization.root, launch.ownerId);
			} finally {
				if (lease) {
					resumedLeases.delete(runId);
					releaseDeliveryLease(lease.path, lease.ownerId);
				}
			}
		},
	},
	start: "capture",
	stages: {
		capture: produces.script({
			outputSchema: typeboxSchema(draftPrContextSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const captured = captureDraftPrContext(parseLaunch(state.originalInput));
				const path = writeDraftArtifact(
					captured.authorization.root,
					captured.ownerId,
					"review-context.json",
					captured,
				);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: captured };
			},
		}),
		"preflight-gate": produces.script({
			outputSchema: typeboxSchema(deterministicGateSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const result = runGate(ctx);
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "preflight-gate.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"review-panel": acts({ skill: "specbase-review-panel", reads: ["capture", "preflight-gate"] }),
		"panel-disposition": produces({
			prompt:
				"Materialize the complete review panel report from this session. Preserve each finding's lens, severity, verification note, and strength='review'. Route only as clean, advisory, local-fix, or replan. Write panel-disposition.json under the frozen review context owner directory and end with SPECBASE_DRAFT_PR_ARTIFACT: <path>.",
			sessionPolicy: "continue",
			outcome: panelOutcome,
			outputSchema: typeboxSchema(panelDispositionSchema),
			onInvalid: "halt",
		}),
		"restore-panel-footprint": produces.script({
			outputSchema: typeboxSchema(panelDispositionSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const output = state.named["panel-disposition"]?.at(-1);
				if (!output) throw new Error("Panel materialization output is missing.");
				const expected = resolve(
					ctx.authorization.root,
					".rpiv",
					"artifacts",
					"specbase-draft-pr-delivery",
					ctx.ownerId,
					"panel-disposition.json",
				);
				const actual = output.artifacts[0] ? resolve(handleToString(output.artifacts[0]!.handle)) : "";
				if (actual !== expected) throw new Error("Panel disposition artifact escaped its frozen owner directory.");
				const value = validatePanelDisposition(output.data as PanelDisposition);
				writeFileSync(ctx.changeMetadataPath, ctx.changeMetadataBeforePanel, "utf8");
				return { kind: "json", artifacts: [{ handle: fs(expected), role: "primary" }], data: value };
			},
		}),
		"panel-local-fix": acts({ skill: "specbase-panel-local-fix", reads: ["capture", "restore-panel-footprint"] }),
		"fix-gate": produces.script({
			outputSchema: typeboxSchema(deterministicGateSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const result = runGate(
					ctx,
					true,
					panel(state)
						.findings.map((finding) => finding.path)
						.filter(Boolean),
				);
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "fix-gate.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"commit-fix": acts({
			skill: "specbase-commit-panel-fix",
			outcome: gitCommitOutcome,
			reads: ["capture", "fix-gate", "panel-disposition"],
		}),
		"verify-fix-commit": produces.script({
			outputSchema: typeboxSchema(deterministicGateSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const data = state.output?.data as { sha?: unknown; prevSha?: unknown } | undefined;
				if (typeof data?.sha !== "string" || typeof data.prevSha !== "string") {
					throw new Error("Panel-fix verification requires the exact git commit outcome.");
				}
				const ctx = context(state);
				const result = verifyPanelFixCommit(ctx, panel(state), { sha: data.sha, prevSha: data.prevSha });
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "verify-fix-commit.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"final-gate": produces.script({
			outputSchema: typeboxSchema(deterministicGateSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const result = runGate(ctx);
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "final-gate.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		push: produces.script({
			outputSchema: typeboxSchema(remoteHeadSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const gate = finalGate(state);
				if (!gate.finalVerifiedHead) throw new Error("Push requires finalVerifiedHead.");
				const result = await publishVerifiedHead(
					ctx,
					gate.finalVerifiedHead,
					localRemoteGitAdapter(ctx.authorization.root),
				);
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "remote-head.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"ensure-draft-pr": produces.script({
			outputSchema: typeboxSchema(draftPrDescriptorSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const gate = finalGate(state);
				if (!gate.finalVerifiedHead) throw new Error("Draft PR requires finalVerifiedHead.");
				const remote = localRemoteGitAdapter(ctx.authorization.root);
				const result = await ensureDraftPullRequest(
					ctx,
					gate.finalVerifiedHead,
					ctx.runId,
					panel(state),
					githubCliAdapter(ctx.authorization.root),
					() => remote.readHead(ctx.remote, ctx.head),
				);
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "draft-pr.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"record-pr": produces.script({
			outputSchema: typeboxSchema(reviewingObservationSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const result = await recordCanonicalDraftResult(ctx, descriptor(state));
				const path = writeDraftArtifact(ctx.authorization.root, ctx.ownerId, "reviewing.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"stop-preflight": stop,
		"stop-replan": stop,
		"stop-fix-budget": stop,
		"stop-fix-gate": stop,
		"stop-fix-commit": stop,
		"stop-final-gate": stop,
		"stop-push": stop,
		"stop-record": stop,
		complete: stop,
	},
	edges: {
		capture: "preflight-gate",
		"preflight-gate": defineRoute(["review-panel", "stop-preflight"], ({ output }) =>
			(output?.data as { verdict?: unknown } | undefined)?.verdict === "pass" ? "review-panel" : "stop-preflight",
		),
		"review-panel": "panel-disposition",
		"panel-disposition": "restore-panel-footprint",
		"restore-panel-footprint": dispositionRoute,
		"panel-local-fix": "fix-gate",
		"fix-gate": defineRoute(["commit-fix", "stop-fix-gate"], ({ output }) =>
			(output?.data as { verdict?: unknown } | undefined)?.verdict === "pass" ? "commit-fix" : "stop-fix-gate",
		),
		"commit-fix": "verify-fix-commit",
		"verify-fix-commit": defineRoute(["review-panel", "stop-fix-commit"], ({ output }) =>
			(output?.data as { verdict?: unknown } | undefined)?.verdict === "pass" ? "review-panel" : "stop-fix-commit",
		),
		"final-gate": defineRoute(["push", "stop-final-gate"], ({ output }) =>
			(output?.data as { verdict?: unknown } | undefined)?.verdict === "pass" ? "push" : "stop-final-gate",
		),
		push: defineRoute(["ensure-draft-pr", "stop-push"], ({ output }) =>
			["pushed", "unchanged"].includes(String((output?.data as { status?: unknown } | undefined)?.status))
				? "ensure-draft-pr"
				: "stop-push",
		),
		"ensure-draft-pr": "record-pr",
		"record-pr": defineRoute(["complete", "stop-record"], ({ output }) =>
			(output?.data as { status?: unknown } | undefined)?.status === "reviewing" ? "complete" : "stop-record",
		),
		"stop-preflight": "stop",
		"stop-replan": "stop",
		"stop-fix-budget": "stop",
		"stop-fix-gate": "stop",
		"stop-fix-commit": "stop",
		"stop-final-gate": "stop",
		"stop-push": "stop",
		"stop-record": "stop",
		complete: "stop",
	},
});

void handleToString;

export function validatedSpecbaseDraftPrWorkflow(): Workflow {
	const issues = validateWorkflow(workflow).filter((issue) => issue.severity === "error");
	if (issues.length)
		throw new Error(`Invalid ${DRAFT_PR_WORKFLOW_NAME}: ${issues.map((issue) => issue.message).join("; ")}`);
	return workflow;
}

export const specbaseDraftPrWorkflow = validatedSpecbaseDraftPrWorkflow();
