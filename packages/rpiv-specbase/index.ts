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
