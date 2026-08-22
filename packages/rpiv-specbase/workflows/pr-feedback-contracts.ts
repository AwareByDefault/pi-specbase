import { type Static, Type } from "typebox";

export const PR_FEEDBACK_WORKFLOW_NAME = "specbase-pr-feedback";
export const PR_FEEDBACK_CAPABILITY_ID = "specbase.pr-feedback";
export const PR_FEEDBACK_ARTIFACT_ROOT = ".rpiv/artifacts/specbase-pr-feedback";
export const PR_FEEDBACK_MAX_FIXES = 1;

const sha = Type.String({ pattern: "^[0-9a-f]{40}$" });
const uuid = Type.String({
	pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
	patternFlags: "i",
});
const repository = Type.String({ pattern: "^[^/\\s]+/[^/\\s]+$" });
const commandResultSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	passed: Type.Boolean(),
	exitCode: Type.Union([Type.Integer(), Type.Null()]),
	summary: Type.String(),
});
const checkpointSchema = Type.Object({
	sha,
	parent: sha,
	paths: Type.Array(Type.String({ minLength: 1 })),
	commands: Type.Array(commandResultSchema),
	verificationFingerprint: Type.String({ pattern: "^[0-9a-f]{64}$" }),
	tree: Type.String({ minLength: 1 }),
});

export const pullRequestContextSchema = Type.Object({
	number: Type.Integer({ minimum: 1 }),
	url: Type.String({ minLength: 1 }),
	repository,
	base: Type.String({ minLength: 1 }),
	head: Type.String({ minLength: 1 }),
	headSha: sha,
	state: Type.Optional(Type.String({ minLength: 1 })),
	runId: Type.Optional(Type.String({ minLength: 1 })),
});
export type PullRequestContext = Static<typeof pullRequestContextSchema>;

export const feedbackAuthorizationSchema = Type.Object({
	catalogVersion: Type.Integer({ minimum: 1 }),
	actionId: Type.Literal("pr-feedback"),
	capabilityId: Type.Literal(PR_FEEDBACK_CAPABILITY_ID),
	changeId: Type.String({ minLength: 1 }),
	storeId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	root: Type.String({ minLength: 1 }),
	pullRequest: pullRequestContextSchema,
});
export type FeedbackAuthorization = Static<typeof feedbackAuthorizationSchema>;

export const feedbackLaunchSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: uuid,
	authorization: feedbackAuthorizationSchema,
});
export type FeedbackLaunch = Static<typeof feedbackLaunchSchema>;

export const feedbackNamespaceSchema = Type.Union([Type.Literal("review-thread"), Type.Literal("general-comment")]);
export type FeedbackNamespace = Static<typeof feedbackNamespaceSchema>;

export const feedbackRevisionSchema = Type.Object({
	version: Type.Literal(1),
	repository,
	pullRequest: Type.Integer({ minimum: 1 }),
	namespace: feedbackNamespaceSchema,
	commentId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	threadId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	updatedAt: Type.String({ minLength: 1 }),
	bodyDigest: Type.String({ pattern: "^[0-9a-f]{64}$" }),
	headSha: sha,
	resolvable: Type.Boolean(),
});
export type FeedbackRevision = Static<typeof feedbackRevisionSchema>;

export const frozenFeedbackSchema = Type.Intersect([
	feedbackRevisionSchema,
	Type.Object({ body: Type.String(), untrusted: Type.Literal(true) }),
]);
export type FrozenFeedback = Static<typeof frozenFeedbackSchema>;

export const feedbackSnapshotSchema = Type.Object({
	version: Type.Literal(1),
	repository,
	pullRequest: Type.Integer({ minimum: 1 }),
	headSha: sha,
	items: Type.Array(frozenFeedbackSchema),
});
export type FeedbackSnapshot = Static<typeof feedbackSnapshotSchema>;

export const feedbackContextSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: uuid,
	runId: Type.String({ minLength: 1 }),
	authorization: feedbackAuthorizationSchema,
	snapshot: feedbackSnapshotSchema,
	startHead: sha,
	baselineDirtyPaths: Type.Array(Type.String()),
	journalPath: Type.String({ minLength: 1 }),
});
export type FeedbackContext = Static<typeof feedbackContextSchema>;

export const feedbackClassificationSchema = Type.Object({
	revision: feedbackRevisionSchema,
	classification: Type.Union([Type.Literal("fix"), Type.Literal("reconsider"), Type.Literal("non-actionable")]),
	rationale: Type.String({ minLength: 1, maxLength: 4_000 }),
	behaviorDefect: Type.Boolean(),
});
export type FeedbackClassification = Static<typeof feedbackClassificationSchema>;

/** The classifier must account for every frozen revision before a mutation can start. */
export const feedbackClassificationScopeSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: uuid,
	snapshotHeadSha: sha,
	classifications: Type.Array(feedbackClassificationSchema),
	selectedRevisionKey: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	evidencePaths: Type.Array(Type.String({ minLength: 1 })),
	productionPaths: Type.Array(Type.String({ minLength: 1 })),
	commands: Type.Array(Type.String({ minLength: 1 })),
});
export type FeedbackClassificationScope = Static<typeof feedbackClassificationScopeSchema>;

export const feedbackCheckpointJournalSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: uuid,
	startHead: sha,
	red: Type.Optional(checkpointSchema),
	green: Type.Optional(checkpointSchema),
	refactor: Type.Optional(Type.Union([checkpointSchema, Type.Literal("skipped")])),
	gate: Type.Optional(
		Type.Object({ sha, passed: Type.Boolean(), fingerprint: Type.String({ pattern: "^[0-9a-f]{64}$" }) }),
	),
	panel: Type.Optional(
		Type.Object({
			sha,
			disposition: Type.Union([Type.Literal("clean"), Type.Literal("advisory")]),
			fingerprint: Type.String({ pattern: "^[0-9a-f]{64}$" }),
		}),
	),
});
export type FeedbackCheckpointJournal = Static<typeof feedbackCheckpointJournalSchema>;

export const feedbackVerificationSchema = Type.Object({
	verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
	journal: feedbackCheckpointJournalSchema,
	paths: Type.Array(Type.String()),
	commands: Type.Array(commandResultSchema),
	reason: Type.Union([Type.String(), Type.Null()]),
});
export type FeedbackVerification = Static<typeof feedbackVerificationSchema>;

export const feedbackPanelSchema = Type.Object({
	ownerId: uuid,
	headSha: sha,
	disposition: Type.Union([Type.Literal("clean"), Type.Literal("advisory"), Type.Literal("stop")]),
	report: Type.String({ minLength: 1 }),
	findings: Type.Array(Type.Unknown()),
});
export type FeedbackPanel = Static<typeof feedbackPanelSchema>;

export const reobserveOutcomeSchema = Type.Object({
	revision: feedbackRevisionSchema,
	status: Type.Union([Type.Literal("unchanged"), Type.Literal("re-observe")]),
	reason: Type.Union([Type.String(), Type.Null()]),
	current: Type.Union([feedbackRevisionSchema, Type.Null()]),
});
export type ReobserveOutcome = Static<typeof reobserveOutcomeSchema>;

export const feedbackReplySchema = Type.Object({
	revision: feedbackRevisionSchema,
	status: Type.Union([Type.Literal("posted"), Type.Literal("existing"), Type.Literal("re-observe")]),
	replyId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	marker: Type.String({ minLength: 1 }),
	fixingSha: sha,
});
export type FeedbackReply = Static<typeof feedbackReplySchema>;

export const feedbackResolutionSchema = Type.Object({
	revision: feedbackRevisionSchema,
	status: Type.Union([Type.Literal("resolved"), Type.Literal("reply-only"), Type.Literal("re-observe")]),
	reason: Type.Union([Type.String(), Type.Null()]),
});
export type FeedbackResolution = Static<typeof feedbackResolutionSchema>;

export const feedbackStopSchema = Type.Object({
	status: Type.Union([Type.Literal("stopped"), Type.Literal("re-observe"), Type.Literal("complete")]),
	reason: Type.String({ minLength: 1 }),
});
export type FeedbackStop = Static<typeof feedbackStopSchema>;
