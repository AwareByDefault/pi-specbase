import { type Static, Type } from "typebox";

export const LOCAL_DELIVERY_WORKFLOW_NAME = "specbase-local-delivery";
export const LOCAL_DELIVERY_CAPABILITY_ID = "specbase.local-delivery";
export const LOCAL_DELIVERY_ARTIFACT_ROOT = ".rpiv/artifacts/specbase-local-delivery";
export const LOCAL_DELIVERY_MAX_REMEDIATIONS = 2;
export const LOCAL_DELIVERY_MAX_LOCAL_FIXES = 2;

export const commandSpecSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	file: Type.String({ minLength: 1 }),
	args: Type.Array(Type.String()),
	cwd: Type.String({ minLength: 1 }),
});
export type DeliveryCommand = Static<typeof commandSpecSchema>;

export const deliveryUnitSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	label: Type.String({ minLength: 1 }),
	kind: Type.Union([Type.Literal("evidence"), Type.Literal("task")]),
	paths: Type.Array(Type.String()),
	commands: Type.Array(commandSpecSchema),
	covers: Type.Array(Type.String()),
});
export type DeliveryUnit = Static<typeof deliveryUnitSchema>;

export const deliveryAuthorizationSchema = Type.Object({
	catalogVersion: Type.Integer({ minimum: 1 }),
	actionId: Type.String({ minLength: 1 }),
	capabilityId: Type.Union([Type.Literal(LOCAL_DELIVERY_CAPABILITY_ID), Type.Literal("specbase.ready-to-review")]),
	changeId: Type.String({ minLength: 1 }),
	storeId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
	root: Type.String({ minLength: 1 }),
});
export type DeliveryAuthorization = Static<typeof deliveryAuthorizationSchema>;

export const deliveryLaunchSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	authorization: deliveryAuthorizationSchema,
});
export type DeliveryLaunch = Static<typeof deliveryLaunchSchema>;

export const deliveryContextSchema = Type.Object({
	version: Type.Literal(1),
	ownerId: Type.String({ minLength: 1 }),
	capturedAt: Type.String({ minLength: 1 }),
	authorization: deliveryAuthorizationSchema,
	leasePath: Type.String({ minLength: 1 }),
	changeRoot: Type.String({ minLength: 1 }),
	artifactPaths: Type.Array(Type.String()),
	stack: Type.Object({
		id: Type.Union([Type.String(), Type.Null()]),
		position: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
		total: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
		requiredPredecessor: Type.Union([Type.String(), Type.Null()]),
		projection: Type.Union([Type.String(), Type.Null()]),
		successorLaunchAllowed: Type.Literal(false),
	}),
	startHead: Type.Union([Type.String(), Type.Null()]),
	baselineDirtyPaths: Type.Array(Type.String()),
	baselineFingerprints: Type.Array(
		Type.Object({
			path: Type.String({ minLength: 1 }),
			workingHash: Type.Union([Type.String(), Type.Null()]),
			indexEntry: Type.String(),
		}),
	),
	allowedRoots: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	evidenceUnits: Type.Array(deliveryUnitSchema),
	taskUnits: Type.Array(deliveryUnitSchema),
	gateCommands: Type.Array(commandSpecSchema),
	implementationRecordPath: Type.String({ minLength: 1 }),
});
export type DeliveryContext = Static<typeof deliveryContextSchema>;

export const readinessSchema = Type.Object({
	disposition: Type.Union([Type.Literal("ready"), Type.Literal("blocked"), Type.Literal("replan")]),
	reasons: Type.Array(Type.String()),
	contextOwnerId: Type.String({ minLength: 1 }),
});
export type DeliveryReadiness = Static<typeof readinessSchema>;

export const commandOutcomeSchema = Type.Object({
	commandId: Type.String({ minLength: 1 }),
	passed: Type.Boolean(),
	exitCode: Type.Union([Type.Integer(), Type.Null()]),
	summary: Type.String(),
});
export type DeliveryCommandOutcome = Static<typeof commandOutcomeSchema>;

export const localGateSchema = Type.Object({
	verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
	attempt: Type.Integer({ minimum: 0 }),
	failedChecks: Type.Array(Type.String()),
	outsideScopePaths: Type.Array(Type.String()),
	incompleteEvidence: Type.Array(Type.String()),
	incompleteTasks: Type.Array(Type.String()),
	commandOutcomes: Type.Array(commandOutcomeSchema),
});
export type LocalGateResult = Static<typeof localGateSchema>;

export const localReviewSchema = Type.Object({
	disposition: Type.Union([Type.Literal("clean"), Type.Literal("local-fix"), Type.Literal("replan")]),
	findings: Type.Array(
		Type.Object({
			id: Type.String({ minLength: 1 }),
			path: Type.String(),
			summary: Type.String({ minLength: 1 }),
		}),
	),
});
export type LocalReviewResult = Static<typeof localReviewSchema>;

export const commitOutcomeSchema = Type.Object({
	commits: Type.Array(Type.String()),
	paths: Type.Array(Type.String()),
});
export type DeliveryCommitOutcome = Static<typeof commitOutcomeSchema>;

export const finalGateSchema = Type.Object({
	verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
	commitIds: Type.Array(Type.String()),
	committedPaths: Type.Array(Type.String()),
	runOwnedDirtyPaths: Type.Array(Type.String()),
	baselineDirtyPaths: Type.Array(Type.String()),
	changedBaselinePaths: Type.Array(Type.String()),
	forbiddenRequests: Type.Array(Type.String()),
	commandOutcomes: Type.Array(commandOutcomeSchema),
	reasons: Type.Array(Type.String()),
});
export type FinalGateResult = Static<typeof finalGateSchema>;

export type DeliveryAuditEvent = {
	readonly ts: string;
	readonly kind:
		| "capture"
		| "readiness"
		| "unit-start"
		| "unit-complete"
		| "unit-failed"
		| "gate"
		| "remediate"
		| "review"
		| "local-fix"
		| "commit"
		| "final"
		| "stop";
	readonly unitId?: string;
	readonly detail: Readonly<Record<string, unknown>>;
};

export const LOCAL_DELIVERY_SKILLS = Object.freeze({
	readiness: "specbase-delivery-readiness",
	evidence: "specbase-implement-evidence",
	task: "specbase-implement-task",
	remediate: "specbase-local-remediate",
	review: "specbase-local-review",
	fix: "specbase-local-fix",
	commit: "specbase-local-commit",
});
