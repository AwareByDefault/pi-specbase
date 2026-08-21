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
