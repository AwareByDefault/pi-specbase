import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpecbaseKanbanExtension } from "./extension.js";

export default function (pi: ExtensionAPI): void {
	registerSpecbaseKanbanExtension(pi);
}

export { parseKanbanRequest, registerSpecbaseKanbanExtension } from "./extension.js";
export type {
	ActionDispatchFeedback,
	ActionDispatchOutcome,
	CapabilityDispatcher,
	CapabilityDispatchRequest,
	CapabilityDispatchResult,
	DirectActionCatalog,
	DirectActionDescriptor,
	DirectActionSelection,
} from "./kanban/action-dispatch.js";
export {
	ActionDispatchCoordinator,
	CapabilityDispatcherRegistry,
	canonicalSkillInvocation,
	createDirectActionSelection,
} from "./kanban/action-dispatch.js";
export { LiveBoard, LiveBoardController } from "./kanban/live-board.js";
export {
	createLiveBoardSource,
	loadSpecbasePublicApi,
	projectCanonicalSnapshot,
} from "./kanban/live-source.js";
export type { BoardIntent, BoardSelectionIntent, BoardSnapshot } from "./kanban/types.js";
export type { WorkflowActivity, WorkflowActivityStatus, WorkflowCorrelation } from "./kanban/workflow-activity.js";
export {
	composeWorkflowActivity,
	formatWorkflowActivity,
	parseWorkflowCorrelation,
	WorkflowActivityStore,
} from "./kanban/workflow-activity.js";
export type { PublicWorkflowReaders, WorkflowActivityBoardAdapter } from "./workflow-bridge.js";
export {
	getWorkflowActivityBridge,
	getWorkflowActivityStore,
	registerWorkflowActivityBridgeHook,
	WorkflowActivityBridge,
} from "./workflow-bridge.js";
export {
	LOCAL_DELIVERY_CAPABILITY_ID,
	LOCAL_DELIVERY_WORKFLOW_NAME,
} from "./workflows/contracts.js";
export {
	DRAFT_PR_CAPABILITY_ID,
	DRAFT_PR_WORKFLOW_NAME,
} from "./workflows/draft-pr-contracts.js";
export type {
	FeedbackCheckpointJournal,
	FeedbackClassification,
	FeedbackClassificationScope,
	FeedbackContext,
	FeedbackRevision,
	FeedbackSnapshot,
	FrozenFeedback,
	PullRequestContext,
} from "./workflows/pr-feedback-contracts.js";
export {
	feedbackClassificationScopeSchema,
	feedbackLaunchSchema,
	feedbackRevisionSchema,
	feedbackSnapshotSchema,
	PR_FEEDBACK_CAPABILITY_ID,
	PR_FEEDBACK_WORKFLOW_NAME,
} from "./workflows/pr-feedback-contracts.js";
export {
	acknowledgeFeedback,
	captureFeedbackSnapshot,
	classifyFeedback,
	feedbackBodyDigest,
	feedbackReplyMarker,
	githubCliFeedbackAdapter,
	publishFeedbackHead,
	reobserveFeedbackRevision,
	replyToFeedback,
	resolveFeedbackThread,
} from "./workflows/pr-feedback-delivery.js";
export {
	assertFeedbackPublishable,
	attestFeedbackPublication,
	commitFeedbackCheckpoint,
	createFeedbackContext,
	publishFeedbackCandidate,
	reobserveFeedbackScope,
	replyFeedbackScope,
	resolveFeedbackScope,
	validateFeedbackClassificationScope,
	validateFeedbackResume,
	verifyFeedbackGate,
	verifyFeedbackGreen,
	verifyFeedbackRed,
} from "./workflows/pr-feedback-execution.js";
export {
	READY_TO_REVIEW_CAPABILITY_ID,
	READY_TO_REVIEW_WORKFLOW_NAME,
} from "./workflows/ready-to-review-contracts.js";
export {
	createDraftPrCapabilityHandler,
	createLocalDeliveryCapabilityHandler,
	createPrFeedbackCapabilityHandler,
	createReadyToReviewCapabilityHandler,
	createSpecbaseCapabilityDispatcher,
	ensureSpecbaseLocalDeliveryRuntime,
} from "./workflows/register.js";
export { specbasePrFeedbackWorkflow, validatedSpecbasePrFeedbackWorkflow } from "./workflows/specbase-pr-feedback.js";
