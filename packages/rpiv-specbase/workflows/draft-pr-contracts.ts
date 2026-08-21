import { type Static, Type } from "typebox";

export const DRAFT_PR_WORKFLOW_NAME = "specbase-draft-pr-delivery";
export const DRAFT_PR_CAPABILITY_ID = "specbase.draft-pr-delivery";
export const DRAFT_PR_MAX_FIXES = 2;

export const draftPrLaunchSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	authorization: Type.Object({
		catalogVersion: Type.Integer({ minimum: 1 }),
		actionId: Type.Literal("open-draft-pr"),
		capabilityId: Type.Literal(DRAFT_PR_CAPABILITY_ID),
		changeId: Type.String({ minLength: 1 }),
		storeId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
		root: Type.String({ minLength: 1 }),
	}),
});
export type DraftPrLaunch = Static<typeof draftPrLaunchSchema>;

export const draftPrContextSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	runId: Type.String({ minLength: 1 }),
	authorization: draftPrLaunchSchema.properties.authorization,
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
export type DraftPrContext = Static<typeof draftPrContextSchema>;

export const deterministicGateSchema = Type.Object({
	verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
	finalVerifiedHead: Type.Union([Type.String({ pattern: "^[0-9a-f]{40}$" }), Type.Null()]),
	checks: Type.Array(Type.Object({ id: Type.String(), passed: Type.Boolean(), summary: Type.String() })),
	reasons: Type.Array(Type.String()),
});
export type DeterministicGate = Static<typeof deterministicGateSchema>;

export const panelDispositionSchema = Type.Object({
	disposition: Type.Union([
		Type.Literal("clean"),
		Type.Literal("advisory"),
		Type.Literal("local-fix"),
		Type.Literal("replan"),
	]),
	report: Type.String(),
	findings: Type.Array(
		Type.Object({
			id: Type.String({ minLength: 1 }),
			lens: Type.String({ minLength: 1 }),
			severity: Type.String({ minLength: 1 }),
			verification: Type.String(),
			strength: Type.Literal("review"),
			path: Type.String(),
			summary: Type.String({ minLength: 1 }),
		}),
	),
});
export type PanelDisposition = Static<typeof panelDispositionSchema>;

export const remoteHeadSchema = Type.Object({
	status: Type.Union([Type.Literal("pushed"), Type.Literal("unchanged"), Type.Literal("blocked")]),
	remote: Type.String(),
	branch: Type.String(),
	headSha: Type.Union([Type.String({ pattern: "^[0-9a-f]{40}$" }), Type.Null()]),
	reason: Type.Union([Type.String(), Type.Null()]),
});
export type RemoteHeadResult = Static<typeof remoteHeadSchema>;

export const draftPrDescriptorSchema = Type.Object({
	number: Type.Integer({ minimum: 1 }),
	url: Type.String({ minLength: 1 }),
	repository: Type.String({ minLength: 1 }),
	base: Type.String({ minLength: 1 }),
	head: Type.String({ minLength: 1 }),
	headSha: Type.String({ pattern: "^[0-9a-f]{40}$" }),
	runId: Type.String({ minLength: 1 }),
});
export type DraftPrDescriptor = Static<typeof draftPrDescriptorSchema>;

export const reviewingObservationSchema = Type.Object({
	status: Type.Union([Type.Literal("reviewing"), Type.Literal("failed")]),
	changeId: Type.String(),
	url: Type.Union([Type.String(), Type.Null()]),
	reason: Type.Union([Type.String(), Type.Null()]),
});
