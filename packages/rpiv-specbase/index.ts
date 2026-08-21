import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpecbaseKanbanExtension } from "./extension.js";

export default function (pi: ExtensionAPI): void {
	registerSpecbaseKanbanExtension(pi);
}

export { registerSpecbaseKanbanExtension } from "./extension.js";
export type { BoardIntent, BoardSelectionIntent, BoardSnapshot } from "./kanban/types.js";
