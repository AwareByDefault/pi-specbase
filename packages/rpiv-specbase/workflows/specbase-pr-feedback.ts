import { join, resolve } from "node:path";
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
import { Type } from "typebox";
import { Value } from "typebox/value";
import { localRemoteGitAdapter } from "./draft-pr-delivery.js";
import { acquireDeliveryLease, attachRunToDeliveryLease, releaseDeliveryLease } from "./lease.js";
import {
	type FeedbackClassificationScope,
	type FeedbackContext,
	type FeedbackPanel,
	feedbackCheckpointJournalSchema,
	feedbackClassificationScopeSchema,
	feedbackContextSchema,
	feedbackLaunchSchema,
	feedbackPanelSchema,
	feedbackReplySchema,
	feedbackResolutionSchema,
	feedbackVerificationSchema,
	PR_FEEDBACK_ARTIFACT_ROOT,
	PR_FEEDBACK_MAX_FIXES,
	PR_FEEDBACK_WORKFLOW_NAME,
	reobserveOutcomeSchema,
} from "./pr-feedback-contracts.js";
import { captureFeedbackSnapshot, githubCliFeedbackAdapter } from "./pr-feedback-delivery.js";
import {
	assertFeedbackPublishable,
	attestFeedbackPublication,
	commitFeedbackCheckpoint,
	createFeedbackContext,
	feedbackArtifact,
	publishFeedbackCandidate,
	reobserveFeedbackScope,
	replyFeedbackScope,
	resolveFeedbackScope,
	selectedFeedback,
	skipFeedbackRefactor,
	validateFeedbackClassificationScope,
	validateFeedbackResume,
	verifyFeedbackGate,
	verifyFeedbackGreen,
	verifyFeedbackRed,
} from "./pr-feedback-execution.js";

const resumedLeases = new Map<string, { path: string; ownerId: string }>();
const feedbackRunIds = new Map<string, string>();

function launch(input: string) {
	const value: unknown = JSON.parse(input);
	if (!Value.Check(feedbackLaunchSchema, value)) throw new Error("Invalid PR-feedback launch envelope.");
	return value;
}

function context(state: RunView): FeedbackContext {
	const value = state.named.capture?.at(-1)?.data;
	if (!value || !Value.Check(feedbackContextSchema, value))
		throw new Error("PR feedback requires a frozen capture context.");
	return value as FeedbackContext;
}

function classification(state: RunView): FeedbackClassificationScope {
	const ctx = context(state);
	const value = state.named.classify?.at(-1)?.data;
	return validateFeedbackClassificationScope(ctx, value);
}

function verification(state: RunView, stage: "verify-red" | "verify-green" | "gate") {
	const value = state.named[stage]?.at(-1)?.data;
	if (!value || !Value.Check(feedbackVerificationSchema, value))
		throw new Error(`${stage} did not produce a valid receipt.`);
	return value as ReturnType<typeof verifyFeedbackRed>;
}

function panel(state: RunView): FeedbackPanel {
	const ctx = context(state);
	const output = state.named.panel?.at(-1);
	const value = output?.data;
	if (!output || !value || !Value.Check(feedbackPanelSchema, value))
		throw new Error("Feedback panel did not produce a typed receipt.");
	const artifact = output.artifacts[0];
	const expected = resolve(join(ctx.authorization.root, PR_FEEDBACK_ARTIFACT_ROOT, ctx.ownerId, "panel.json"));
	if (!artifact || resolve(handleToString(artifact.handle)) !== expected)
		throw new Error("Feedback panel artifact escaped its frozen owner directory.");
	const receipt = value as FeedbackPanel;
	const gate = verification(state, "gate").journal;
	const head = gate.refactor && gate.refactor !== "skipped" ? gate.refactor.sha : gate.green?.sha;
	if (receipt.ownerId !== ctx.ownerId || !head || receipt.headSha !== head)
		throw new Error("Feedback panel receipt does not bind the frozen owner and current gated head.");
	return receipt;
}

function publishedHead(state: RunView): string {
	const pushed = state.named.push?.at(-1)?.data as { status?: unknown; headSha?: unknown } | undefined;
	if (pushed?.status === "pushed" || pushed?.status === "unchanged") {
		if (typeof pushed.headSha === "string" && /^[0-9a-f]{40}$/u.test(pushed.headSha)) return pushed.headSha;
	}
	return context(state).startHead;
}

function artifactOutcome(file: string) {
	return {
		collector: transcriptPathCollector({
			pattern: new RegExp(`SPECBASE_PR_FEEDBACK_ARTIFACT:\\s+(\\S*${file.replace(".", "\\.")})`, "u"),
		}),
		parser: jsonBodyParser,
	};
}

function output(ctx: FeedbackContext, name: string, value: unknown) {
	const path = feedbackArtifact(ctx, name, value);
	return { kind: "json" as const, artifacts: [{ handle: fs(path), role: "primary" as const }], data: value };
}

function stop(status: "stopped" | "re-observe" | "complete", reason: string) {
	return terminal.script({
		run: ({ state }) => {
			feedbackArtifact(context(state), "terminal.json", { status, reason });
		},
	});
}

const workflow = defineWorkflow({
	name: PR_FEEDBACK_WORKFLOW_NAME,
	description:
		"A resumable PR-feedback workflow that freezes and classifies every feedback revision, uses host-verified RED/GREEN checkpoints, publishes only a current-head gated and panel-attested commit, then re-observes the published head before idempotent replies and conditional thread resolution.",
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
			validateFeedbackResume(value.authorization.root, value.ownerId);
			feedbackRunIds.set(value.ownerId, runId);
			resumedLeases.set(runId, { path: lease.path, ownerId: value.ownerId });
		},
		after: ({ runId }) => {
			const lease = resumedLeases.get(runId);
			if (!lease) return;
			resumedLeases.delete(runId);
			releaseDeliveryLease(lease.path, lease.ownerId);
		},
	},
	start: "capture",
	stages: {
		capture: produces.script({
			outputSchema: typeboxSchema(feedbackContextSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const value = launch(state.originalInput);
				const runId = feedbackRunIds.get(value.ownerId);
				if (!runId) throw new Error("PR-feedback capture requires a lifecycle-assigned run ID.");
				feedbackRunIds.delete(value.ownerId);
				const snapshot = await captureFeedbackSnapshot(
					value.authorization.pullRequest,
					githubCliFeedbackAdapter(value.authorization.root),
				);
				const captured = createFeedbackContext(value.ownerId, runId, value.authorization, snapshot);
				return output(captured, "capture.json", captured);
			},
		}),
		classify: produces({
			skill: "specbase-pr-feedback-classify",
			reads: ["capture"],
			outcome: artifactOutcome("classification.json"),
			outputSchema: typeboxSchema(feedbackClassificationScopeSchema),
			onInvalid: "halt",
		}),
		"author-red-evidence": acts({ skill: "specbase-pr-feedback-author-red", reads: ["capture", "classify"] }),
		"verify-red": produces.script({
			outputSchema: typeboxSchema(feedbackVerificationSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(ctx, "red-verification.json", verifyFeedbackRed(ctx, classification(state)));
			},
		}),
		"commit-red": produces.script({
			outputSchema: typeboxSchema(feedbackCheckpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(
					ctx,
					"red-checkpoint.json",
					commitFeedbackCheckpoint(ctx, classification(state), "red", verification(state, "verify-red")),
				);
			},
		}),
		implementation: acts({
			skill: "specbase-pr-feedback-implement-green",
			reads: ["capture", "classify", "commit-red"],
		}),
		"verify-green": produces.script({
			outputSchema: typeboxSchema(feedbackVerificationSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(ctx, "green-verification.json", verifyFeedbackGreen(ctx, classification(state)));
			},
		}),
		"commit-green": produces.script({
			outputSchema: typeboxSchema(feedbackCheckpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(
					ctx,
					"green-checkpoint.json",
					commitFeedbackCheckpoint(ctx, classification(state), "green", verification(state, "verify-green")),
				);
			},
		}),
		"skip-refactor": produces.script({
			outputSchema: typeboxSchema(feedbackCheckpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(ctx, "refactor-skipped.json", skipFeedbackRefactor(ctx));
			},
		}),
		gate: produces.script({
			outputSchema: typeboxSchema(feedbackVerificationSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(ctx, "gate.json", verifyFeedbackGate(ctx, classification(state)));
			},
		}),
		panel: produces({
			skill: "specbase-pr-feedback-panel",
			reads: ["capture", "classify", "gate"],
			outcome: artifactOutcome("panel.json"),
			outputSchema: typeboxSchema(feedbackPanelSchema),
			onInvalid: "halt",
		}),
		"remote-preflight": produces.script({
			outputSchema: typeboxSchema(feedbackCheckpointJournalSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const ctx = context(state);
				return output(
					ctx,
					"remote-preflight.json",
					attestFeedbackPublication(ctx, verification(state, "gate"), panel(state)),
				);
			},
		}),
		push: produces.script({
			outputSchema: typeboxSchema(
				Type.Object({
					status: Type.Union([Type.Literal("pushed"), Type.Literal("unchanged"), Type.Literal("blocked")]),
					remote: Type.String(),
					branch: Type.String(),
					headSha: Type.Union([Type.String(), Type.Null()]),
					reason: Type.Union([Type.String(), Type.Null()]),
				}),
			),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const result = await publishFeedbackCandidate(
					ctx,
					assertFeedbackPublishable(ctx),
					localRemoteGitAdapter(ctx.authorization.root),
				);
				return output(ctx, "remote-head.json", result);
			},
		}),
		"reobserve-before-reply": produces.script({
			outputSchema: typeboxSchema(Type.Array(reobserveOutcomeSchema)),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				return output(
					ctx,
					"reobserve-reply.json",
					await reobserveFeedbackScope(
						classification(state),
						publishedHead(state),
						githubCliFeedbackAdapter(ctx.authorization.root),
					),
				);
			},
		}),
		reply: produces.script({
			outputSchema: typeboxSchema(Type.Array(feedbackReplySchema)),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				return output(
					ctx,
					"replies.json",
					await replyFeedbackScope(
						classification(state),
						publishedHead(state),
						githubCliFeedbackAdapter(ctx.authorization.root),
					),
				);
			},
		}),
		"reobserve-before-resolve": produces.script({
			outputSchema: typeboxSchema(Type.Array(reobserveOutcomeSchema)),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				return output(
					ctx,
					"reobserve-resolve.json",
					await reobserveFeedbackScope(
						classification(state),
						publishedHead(state),
						githubCliFeedbackAdapter(ctx.authorization.root),
					),
				);
			},
		}),
		resolve: produces.script({
			outputSchema: typeboxSchema(Type.Array(feedbackResolutionSchema)),
			onInvalid: "halt",
			run: async ({ state }) => {
				const ctx = context(state);
				const replies = state.named.reply?.at(-1)?.data;
				if (!Array.isArray(replies) || replies.some((reply) => !Value.Check(feedbackReplySchema, reply)))
					throw new Error("Feedback replies are missing or malformed.");
				return output(
					ctx,
					"resolutions.json",
					await resolveFeedbackScope(
						classification(state),
						replies,
						publishedHead(state),
						githubCliFeedbackAdapter(ctx.authorization.root),
					),
				);
			},
		}),
		"stop-classification": stop(
			"stopped",
			"every frozen feedback item must be classified; multiple actionable items require explicit selection",
		),
		"stop-reconsider": stop(
			"stopped",
			"feedback changes intent; select the canonical comment-aware Explore action before mutation",
		),
		"complete-noop": stop("complete", "all frozen feedback was classified non-actionable; no remote write occurred"),
		"stop-red": stop("stopped", "RED evidence was not established"),
		"stop-green": stop("stopped", "GREEN verification was not established"),
		"stop-final-gate": stop("stopped", "current-head gate or panel receipt did not attest publication"),
		"re-observe": stop("re-observe", "feedback changed, disappeared, or was resolved after capture"),
		complete: stop(
			"complete",
			"every frozen feedback item was replied to and only actionable review threads were resolved",
		),
	},
	edges: {
		capture: "classify",
		classify: defineRoute(
			["author-red-evidence", "stop-reconsider", "complete-noop", "stop-classification"],
			({ state }) => {
				const scope = classification(state);
				if (selectedFeedback(scope)) return "author-red-evidence";
				if (scope.classifications.some((item) => item.classification === "fix")) return "stop-classification";
				if (scope.classifications.some((item) => item.classification === "reconsider")) return "stop-reconsider";
				return "complete-noop";
			},
		),
		"author-red-evidence": "verify-red",
		"verify-red": defineRoute(["commit-red", "stop-red"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "commit-red" : "stop-red",
		),
		"commit-red": "implementation",
		implementation: "verify-green",
		"verify-green": defineRoute(["commit-green", "stop-green"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "commit-green" : "stop-green",
		),
		"commit-green": "skip-refactor",
		"skip-refactor": "gate",
		gate: defineRoute(["panel", "stop-final-gate"], ({ output }) =>
			(output?.data as { verdict?: string } | undefined)?.verdict === "pass" ? "panel" : "stop-final-gate",
		),
		panel: defineRoute(["remote-preflight", "stop-final-gate"], ({ output }) =>
			["clean", "advisory"].includes(String((output?.data as { disposition?: unknown } | undefined)?.disposition))
				? "remote-preflight"
				: "stop-final-gate",
		),
		"remote-preflight": "push",
		push: defineRoute(["reobserve-before-reply", "stop-final-gate"], ({ output }) =>
			["pushed", "unchanged"].includes(String((output?.data as { status?: unknown } | undefined)?.status))
				? "reobserve-before-reply"
				: "stop-final-gate",
		),
		"reobserve-before-reply": defineRoute(["reply", "re-observe"], ({ output }) =>
			Array.isArray(output?.data) &&
			output.data.every((item) => (item as { status?: string }).status === "unchanged")
				? "reply"
				: "re-observe",
		),
		reply: defineRoute(["reobserve-before-resolve", "re-observe", "complete"], ({ output, state }) => {
			if (
				!Array.isArray(output?.data) ||
				output.data.some((item) => (item as { status?: string }).status === "re-observe")
			)
				return "re-observe";
			return selectedFeedback(classification(state)) ? "reobserve-before-resolve" : "complete";
		}),
		"reobserve-before-resolve": defineRoute(["resolve", "re-observe"], ({ output }) =>
			Array.isArray(output?.data) &&
			output.data.every((item) => (item as { status?: string }).status === "unchanged")
				? "resolve"
				: "re-observe",
		),
		resolve: defineRoute(["complete", "re-observe"], ({ output }) =>
			Array.isArray(output?.data) &&
			output.data.every((item) => (item as { status?: string }).status !== "re-observe")
				? "complete"
				: "re-observe",
		),
		"stop-classification": "stop",
		"stop-reconsider": "stop",
		"complete-noop": "stop",
		"stop-red": "stop",
		"stop-green": "stop",
		"stop-final-gate": "stop",
		"re-observe": "stop",
		complete: "stop",
	},
});

void PR_FEEDBACK_MAX_FIXES;

export function validatedSpecbasePrFeedbackWorkflow(): Workflow {
	const issues = validateWorkflow(workflow).filter((issue) => issue.severity === "error");
	if (issues.length)
		throw new Error(`Invalid ${PR_FEEDBACK_WORKFLOW_NAME}: ${issues.map((issue) => issue.message).join("; ")}`);
	return workflow;
}

export const specbasePrFeedbackWorkflow = validatedSpecbasePrFeedbackWorkflow();
