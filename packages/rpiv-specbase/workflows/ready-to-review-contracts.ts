import { type Static, Type } from "typebox";

export const READY_TO_REVIEW_WORKFLOW_NAME = "specbase-ready-to-review";
export const READY_TO_REVIEW_CAPABILITY_ID = "specbase.ready-to-review";
export const READY_TO_REVIEW_ARTIFACT_ROOT = ".rpiv/artifacts/specbase-ready-to-review";
export const READY_TO_REVIEW_MAX_FIXES = 1;

export const readyAuthorizationSchema = Type.Object({
	catalogVersion: Type.Integer({ minimum: 1 }),
	actionId: Type.String({ minLength: 1 }),
	capabilityId: Type.Literal(READY_TO_REVIEW_CAPABILITY_ID),
	changeId: Type.String({ minLength: 1 }),
	storeId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	root: Type.String({ minLength: 1 }),
});
export type ReadyAuthorization = Static<typeof readyAuthorizationSchema>;

export const readyLaunchSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	authorization: readyAuthorizationSchema,
});
export type ReadyLaunch = Static<typeof readyLaunchSchema>;

const commandResultSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	passed: Type.Boolean(),
	exitCode: Type.Union([Type.Integer(), Type.Null()]),
	summary: Type.String(),
});

const checkpointSchema = Type.Object({
	sha: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	parent: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	paths: Type.Array(Type.String({ minLength: 1 })),
	commands: Type.Array(commandResultSchema),
	verificationFingerprint: Type.String({ pattern: "^[0-9a-f]{64}$" }),
	tree: Type.String({ minLength: 1 }),
});
export type ReadyCheckpoint = Static<typeof checkpointSchema>;

export const checkpointJournalSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	startHead: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	red: Type.Optional(checkpointSchema),
	green: Type.Optional(checkpointSchema),
	refactor: Type.Optional(Type.Union([checkpointSchema, Type.Literal("skipped")])),
	gate: Type.Optional(
		Type.Object({
			sha: Type.String({ pattern: "^[0-9a-f]{40}$" }),
			passed: Type.Boolean(),
			fingerprint: Type.String(),
		}),
	),
	panel: Type.Optional(
		Type.Object({
			sha: Type.String({ pattern: "^[0-9a-f]{40}$" }),
			disposition: Type.Union([Type.Literal("clean"), Type.Literal("advisory")]),
			fingerprint: Type.String(),
		}),
	),
});
export type CheckpointJournal = Static<typeof checkpointJournalSchema>;

export const readyContextSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	runId: Type.String({ minLength: 1 }),
	authorization: readyAuthorizationSchema,
	startHead: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	deliveryContextPath: Type.String({ minLength: 1 }),
	productionRoots: Type.Array(Type.String({ minLength: 1 })),
	journalPath: Type.String({ minLength: 1 }),
});
export type ReadyContext = Static<typeof readyContextSchema>;

export const checkpointVerdictSchema = Type.Object({
	verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
	journal: checkpointJournalSchema,
	paths: Type.Array(Type.String()),
	commands: Type.Array(commandResultSchema),
	reason: Type.Union([Type.String(), Type.Null()]),
});

export const readyRemoteContextSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	runId: Type.String({ minLength: 1 }),
	authorization: readyAuthorizationSchema,
	branch: Type.String({ minLength: 1 }),
	startHead: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	remote: Type.String({ minLength: 1 }),
	repository: Type.String({ minLength: 1 }),
	base: Type.String({ minLength: 1 }),
	head: Type.String({ minLength: 1 }),
	baselineDirtyPaths: Type.Array(Type.String()),
	changeMetadataPath: Type.String({ minLength: 1 }),
	changeMetadataBeforePanel: Type.String(),
	localDeliveryRunId: Type.String({ minLength: 1 }),
	localDeliveryCommits: Type.Array(Type.String({ pattern: "^[0-9a-f]{40}$" }), { minItems: 1 }),
});
export type ReadyRemoteContext = Static<typeof readyRemoteContextSchema>;

export const refactorDecisionSchema = Type.Object({
	decision: Type.Union([Type.Literal("skip"), Type.Literal("apply"), Type.Literal("replan")]),
	reasons: Type.Array(Type.String()),
});

export const readyPrDescriptorSchema = Type.Object({
	number: Type.Integer({ minimum: 1 }),
	url: Type.String({ minLength: 1 }),
	repository: Type.String({ minLength: 1 }),
	base: Type.String({ minLength: 1 }),
	head: Type.String({ minLength: 1 }),
	headSha: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	state: Type.Literal("ready"),
	runId: Type.String({ minLength: 1 }),
});
export type ReadyPrDescriptor = Static<typeof readyPrDescriptorSchema>;

export const readyResultSchema = Type.Object({
	status: Type.Union([Type.Literal("reviewing"), Type.Literal("failed")]),
	changeId: Type.String({ minLength: 1 }),
	url: Type.Union([Type.String(), Type.Null()]),
	reason: Type.Union([Type.String(), Type.Null()]),
});
