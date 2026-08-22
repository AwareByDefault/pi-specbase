import { writeFileSync } from "node:fs";
import {
	acts,
	defineRoute,
	defineWorkflow,
	fs,
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
import { readinessSchema } from "./contracts.js";
import { type PanelDisposition, panelDispositionSchema, remoteHeadSchema } from "./draft-pr-contracts.js";
import {
	captureReadyPrContext,
	ensureReadyPullRequest,
	githubCliAdapter,
	localRemoteGitAdapter,
	publishVerifiedHead,
	validatePanelDisposition,
} from "./draft-pr-delivery.js";
import { acquireDeliveryLease, attachRunToDeliveryLease, releaseDeliveryLease } from "./lease.js";
import { validateCanonicalDeliveryAuthorization } from "./local-delivery.js";
import {
	checkpointJournalSchema,
	checkpointVerdictSchema,
	READY_TO_REVIEW_MAX_FIXES,
	READY_TO_REVIEW_WORKFLOW_NAME,
	type ReadyContext,
	type ReadyRemoteContext,
	readyContextSchema,
	readyLaunchSchema,
	readyPrDescriptorSchema,
	readyRemoteContextSchema,
	readyResultSchema,
	refactorDecisionSchema,
} from "./ready-to-review-contracts.js";
import {
	assertPublishableHead,
	attestPublicationCandidate,
	captureReadyContext,
	commitVerifiedPhase,
	markRefactorSkipped,
	type PhaseVerification,
	recordCanonicalReadyResult,
	registerReadyRunId,
	validateReadyResume,
	verifyCandidateGate,
	verifyCheckpointJournal,
	verifyGreenPhase,
	verifyRedPhase,
	writeReadyArtifact,
} from "./ready-to-review-delivery.js";

const resumedLeases = new Map<string, { path: string; ownerId: string }>();

function launch(input: string) {
	const value: unknown = JSON.parse(input);
	if (!Value.Check(readyLaunchSchema, value)) throw new Error("Invalid ready-to-review launch envelope.");
	return value;
}

const artifactOutcome = (name: string, file: string) => ({
	name,
	collector: transcriptPathCollector({
		pattern: new RegExp(`SPECBASE_READY_ARTIFACT:\\s+(\\S*${file.replace(".", "\\.")})`, "u"),
	}),
	parser: jsonBodyParser,
});

function context(state: RunView): ReadyContext {
	const value = state.named.capture?.at(-1)?.data;
	if (!value || !Value.Check(readyContextSchema, value))
		throw new Error("Ready-to-review requires its frozen capture context.");
	return value as ReadyContext;
}

function verification(
	state: RunView,
	stage: "verify-red" | "verify-green" | "verify-refactor" | "verify-fix",
): PhaseVerification {
	const value = state.named[stage]?.at(-1)?.data;
	if (!value || !Value.Check(checkpointVerdictSchema, value))
		throw new Error(`${stage} did not produce a valid phase verification.`);
	return value as PhaseVerification;
}

function remoteContext(state: RunView): ReadyRemoteContext {
	const value = state.named["prepare-remote"]?.at(-1)?.data;
	if (!value || !Value.Check(readyRemoteContextSchema, value))
		throw new Error("Remote delivery requires its frozen remote context.");
	return value as ReadyRemoteContext;
}

function panel(state: RunView): PanelDisposition {
	const value = state.named["panel-disposition"]?.at(-1)?.data;
	if (!value) throw new Error("Ready-to-review panel disposition is missing.");
	return validatePanelDisposition(value as PanelDisposition);
}

function stop(reason: string) {
	return terminal.script({
		run: ({ state }) => {
			const ctx = context(state);
			writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "terminal.json", {
				reason,
				stoppedAt: new Date().toISOString(),
			});
		},
	});
}

function phaseOutput(ctx: ReadyContext, name: string, result: PhaseVerification) {
	const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, `${name}.json`, result);
	return { kind: "json" as const, artifacts: [{ handle: fs(path), role: "primary" as const }], data: result };
}

const workflow = defineWorkflow({
	name: READY_TO_REVIEW_WORKFLOW_NAME,
	description:
		"Deliver one fresh canonical Specbase action through spec review, host-verified RED and GREEN commits, optional green-preserving refactor, deterministic gate, generated panel and bounded fix, exact-head non-force publication, one ready pull request, and canonical Reviewing observation.",
	resume: {
		before: ({ input, runId }) => {
			const value = launch(input);
			const lease = acquireDeliveryLease(
				{
					root: value.authorization.root,
					storeId: value.authorization.storeId,
					changeId: value.authorization.changeId,
				},
				value.ownerId,
			);
			if (!lease.acquired) throw new Error(lease.reason);
			attachRunToDeliveryLease(lease.path, value.ownerId, runId);
			validateReadyResume(value.authorization.root, value.ownerId);
			registerReadyRunId(value.ownerId, runId);
			resumedLeases.set(runId, { path: lease.path, ownerId: value.ownerId });
		},
		after: ({ runId }) => {
			const lease = resumedLeases.get(runId);
			if (lease) {
				resumedLeases.delete(runId);
				releaseDeliveryLease(lease.path, lease.ownerId);
			}
		},
	},
	start: "capture",
	stages: {
		capture: produces.script({
			outputSchema: typeboxSchema(readyContextSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const value = launch(state.originalInput);
				await validateCanonicalDeliveryAuthorization(value.authorization as never, "capture");
				const captured = captureReadyContext(value.ownerId, value.authorization);
				return {
					kind: "json",
					artifacts: [{ handle: fs(captured.deliveryContextPath), role: "primary" }],
					data: captured,
				};
			},
		}),
		"spec-review": produces({
			skill: "specbase-ready-review-readiness",
			outcome: artifactOutcome("spec-review", "readiness.json"),
			reads: ["capture"],
			outputSchema: typeboxSchema(readinessSchema),
			onInvalid: "halt",
		}),
		"author-evidence": acts({ skill: "specbase-author-red-evidence", reads: ["capture", "spec-review"] }),
		"verify-red": produces.script({
			outputSchema: typeboxSchema(checkpointVerdictSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return phaseOutput(ctx, "red-verification", verifyRedPhase(ctx));
			},
		}),
		"commit-red": produces.script({
			outputSchema: typeboxSchema(checkpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const journal = commitVerifiedPhase(ctx, "red", verification(state, "verify-red"));
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "red-checkpoint.json", journal);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: journal };
			},
		}),
		implementation: acts({ skill: "specbase-implement-green", reads: ["capture", "commit-red"] }),
		"verify-green": produces.script({
			outputSchema: typeboxSchema(checkpointVerdictSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return phaseOutput(ctx, "green-verification", verifyGreenPhase(ctx));
			},
		}),
		"commit-green": produces.script({
			outputSchema: typeboxSchema(checkpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const journal = commitVerifiedPhase(ctx, "green", verification(state, "verify-green"));
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "green-checkpoint.json", journal);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: journal };
			},
		}),
		"refactor-decision": produces({
			skill: "specbase-refactor-decision",
			reads: ["capture", "commit-green"],
			outcome: artifactOutcome("refactor-decision", "refactor-decision.json"),
			outputSchema: typeboxSchema(refactorDecisionSchema),
			onInvalid: "halt",
		}),
		"skip-refactor": produces.script({
			outputSchema: typeboxSchema(checkpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const journal = markRefactorSkipped(ctx);
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "refactor-skipped.json", journal);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: journal };
			},
		}),
		refactor: acts({
			skill: "specbase-green-refactor",
			reads: ["capture", "commit-green", "refactor-decision"],
		}),
		"verify-refactor": produces.script({
			outputSchema: typeboxSchema(checkpointVerdictSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return phaseOutput(ctx, "refactor-verification", verifyGreenPhase(ctx));
			},
		}),
		gate: produces.script({
			outputSchema: typeboxSchema(checkpointVerdictSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return phaseOutput(ctx, "gate", verifyCandidateGate(ctx));
			},
		}),
		"prepare-remote": produces.script({
			outputSchema: typeboxSchema(readyRemoteContextSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const journal = verifyCheckpointJournal(ctx);
				const commits = [
					journal.red?.sha,
					journal.green?.sha,
					journal.refactor && journal.refactor !== "skipped" ? journal.refactor.sha : undefined,
				].filter((sha): sha is string => Boolean(sha));
				const remote = captureReadyPrContext({
					ownerId: ctx.ownerId,
					runId: ctx.runId,
					authorization: ctx.authorization,
					commits,
				});
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "remote-context.json", remote);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: remote };
			},
		}),
		panel: acts({ skill: "specbase-review-panel", reads: ["capture", "gate", "prepare-remote"] }),
		"panel-disposition": produces({
			prompt:
				"Materialize the complete generated Specbase panel report from this session. Preserve lens, severity, verification, and strength='review'. Route only clean, advisory, local-fix, or replan. Write panel-disposition.json under the frozen ready-to-review owner directory and end with SPECBASE_READY_ARTIFACT: <path>.",
			sessionPolicy: "continue",
			outcome: artifactOutcome("panel-disposition", "panel-disposition.json"),
			outputSchema: typeboxSchema(panelDispositionSchema),
			onInvalid: "halt",
		}),
		"restore-panel-footprint": produces.script({
			outputSchema: typeboxSchema(panelDispositionSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const remote = remoteContext(state);
				const output = state.named["panel-disposition"]?.at(-1);
				const value = panel(state);
				if (!output) throw new Error("Panel disposition output is missing.");
				writeFileSync(remote.changeMetadataPath, remote.changeMetadataBeforePanel, "utf8");
				return { kind: "json" as const, artifacts: output.artifacts, data: value };
			},
		}),
		"panel-fix": acts({ skill: "specbase-panel-local-fix", reads: ["capture", "restore-panel-footprint"] }),
		"verify-fix": produces.script({
			outputSchema: typeboxSchema(checkpointVerdictSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return phaseOutput(ctx, "fix-verification", verifyGreenPhase(ctx));
			},
		}),
		"commit-refactor": produces.script({
			outputSchema: typeboxSchema(checkpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				const source = state.named["verify-fix"]?.at(-1) ? "verify-fix" : "verify-refactor";
				const journal = commitVerifiedPhase(ctx, "refactor", verification(state, source));
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "refactor-checkpoint.json", journal);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: journal };
			},
		}),
		"remote-preflight": produces.script({
			outputSchema: typeboxSchema(checkpointJournalSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				await validateCanonicalDeliveryAuthorization(ctx.authorization as never, "final");
				const panelReceipt = panel(state);
				if (panelReceipt.disposition !== "clean" && panelReceipt.disposition !== "advisory")
					throw new Error("Remote preflight requires a clean/advisory panel.");
				const gate = state.named.gate?.at(-1)?.data;
				if (!gate || !Value.Check(checkpointVerdictSchema, gate) || gate.verdict !== "pass")
					throw new Error("Remote preflight requires the exact current-head gate receipt.");
				const journal = attestPublicationCandidate(ctx, gate as PhaseVerification, {
					disposition: panelReceipt.disposition,
					report: panelReceipt.report,
					findings: panelReceipt.findings,
				});
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "remote-preflight.json", journal);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: journal };
			},
		}),
		push: produces.script({
			outputSchema: typeboxSchema(remoteHeadSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const remote = remoteContext(state);
				const head = assertPublishableHead(ctx);
				const result = await publishVerifiedHead(remote, head, localRemoteGitAdapter(ctx.authorization.root));
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "remote-head.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"ensure-ready-pr": produces.script({
			outputSchema: typeboxSchema(readyPrDescriptorSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const remote = remoteContext(state);
				const head = assertPublishableHead(ctx);
				const git = localRemoteGitAdapter(ctx.authorization.root);
				const github = githubCliAdapter(ctx.authorization.root);
				if (!github.markReady) throw new Error("GitHub adapter cannot mark a pull request ready.");
				const descriptor = await ensureReadyPullRequest(
					remote,
					head,
					ctx.runId,
					panel(state),
					github as Required<typeof github>,
					() => git.readHead(remote.remote, remote.head),
				);
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "ready-pr.json", descriptor);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: descriptor };
			},
		}),
		"record-ready-result": produces.script({
			outputSchema: typeboxSchema(readyResultSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				assertPublishableHead(ctx);
				const descriptor = state.named["ensure-ready-pr"]?.at(-1)?.data;
				if (!descriptor || !Value.Check(readyPrDescriptorSchema, descriptor))
					throw new Error("Ready PR descriptor is missing.");
				const result = await recordCanonicalReadyResult(ctx, descriptor as Record<string, unknown>);
				const path = writeReadyArtifact(ctx.authorization.root, ctx.ownerId, "ready-result.json", result);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"stop-review": stop("spec review requires replan"),
		"stop-red": stop("expected RED checkpoint was not established"),
		"stop-green": stop("GREEN checkpoint was not established"),
		"stop-panel": stop("panel requires replan or exceeded bounded fixes"),
		"stop-remote": stop("remote preflight denied publication"),
		"stop-record": stop("canonical ready result was not observed"),
		complete: stop("canonical Reviewing observed"),
	},
	edges: {
		capture: "spec-review",
		"spec-review": defineRoute(["author-evidence", "stop-review"], ({ output }) =>
			(output?.data as { disposition?: string } | undefined)?.disposition === "ready"
				? "author-evidence"
				: "stop-review",
		),
		"author-evidence": "verify-red",
		"verify-red": defineRoute(["commit-red", "stop-red"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "commit-red" : "stop-red",
		),
		"commit-red": "implementation",
		implementation: "verify-green",
		"verify-green": defineRoute(["commit-green", "stop-green"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "commit-green" : "stop-green",
		),
		"commit-green": "refactor-decision",
		"refactor-decision": defineRoute(["skip-refactor", "refactor", "stop-review"], ({ output }) => {
			const decision = (output?.data as { decision?: string } | undefined)?.decision;
			if (decision === "skip") return "skip-refactor";
			if (decision === "apply") return "refactor";
			return "stop-review";
		}),
		"skip-refactor": "gate",
		refactor: "verify-refactor",
		"verify-refactor": defineRoute(["commit-refactor", "stop-green"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "commit-refactor" : "stop-green",
		),
		gate: defineRoute(["prepare-remote", "stop-green"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "prepare-remote" : "stop-green",
		),
		"prepare-remote": "panel",
		panel: "panel-disposition",
		"panel-disposition": "restore-panel-footprint",
		"restore-panel-footprint": defineRoute(["remote-preflight", "panel-fix", "stop-panel"], ({ output, state }) => {
			const disposition = (output?.data as { disposition?: string } | undefined)?.disposition;
			if (disposition === "clean" || disposition === "advisory") return "remote-preflight";
			if (
				disposition === "local-fix" &&
				(state.named["panel-fix"]?.length ?? 0) < READY_TO_REVIEW_MAX_FIXES &&
				(state.named["commit-refactor"]?.length ?? 0) === 0
			)
				return "panel-fix";
			return "stop-panel";
		}),
		"panel-fix": "verify-fix",
		"verify-fix": defineRoute(["commit-refactor", "stop-green"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "commit-refactor" : "stop-green",
		),
		"commit-refactor": "gate",
		"remote-preflight": defineRoute(["push", "stop-remote"], ({ output }) => {
			const journal = output?.data as { gate?: { passed?: boolean }; panel?: unknown } | undefined;
			return journal?.gate?.passed && journal.panel ? "push" : "stop-remote";
		}),
		push: defineRoute(["ensure-ready-pr", "stop-remote"], ({ output }) =>
			["pushed", "unchanged"].includes(String((output?.data as { status?: unknown } | undefined)?.status))
				? "ensure-ready-pr"
				: "stop-remote",
		),
		"ensure-ready-pr": "record-ready-result",
		"record-ready-result": defineRoute(["complete", "stop-record"], ({ output }) =>
			(output?.data as { status?: string } | undefined)?.status === "reviewing" ? "complete" : "stop-record",
		),
		"stop-review": "stop",
		"stop-red": "stop",
		"stop-green": "stop",
		"stop-panel": "stop",
		"stop-remote": "stop",
		"stop-record": "stop",
		complete: "stop",
	},
});

void handleToString;

export function validatedSpecbaseReadyToReviewWorkflow(): Workflow {
	const issues = validateWorkflow(workflow).filter((issue) => issue.severity === "error");
	if (issues.length)
		throw new Error(`Invalid ${READY_TO_REVIEW_WORKFLOW_NAME}: ${issues.map((issue) => issue.message).join("; ")}`);
	return workflow;
}

export const specbaseReadyToReviewWorkflow = validatedSpecbaseReadyToReviewWorkflow();
