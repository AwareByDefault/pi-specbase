import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { FixtureBoard } from "./kanban/fixture-board.js";
import { DEMO_BOARD_SNAPSHOT } from "./kanban/fixtures.js";
import type { BoardIntent } from "./kanban/types.js";

export const KANBAN_COMMAND = "spcb:kanban";
export const KANBAN_USAGE = "Usage: /spcb:kanban --demo";

export type KanbanMode = "demo" | "unsupported";

export function parseKanbanMode(args: string): KanbanMode {
	return args.trim() === "--demo" ? "demo" : "unsupported";
}

export class BoardSessions {
	private readonly boards = new Set<FixtureBoard>();

	add(board: FixtureBoard): void {
		this.boards.add(board);
	}

	delete(board: FixtureBoard): void {
		this.boards.delete(board);
	}

	dispose(): void {
		for (const board of this.boards) board.cancel();
		this.boards.clear();
	}

	get size(): number {
		return this.boards.size;
	}
}

export type KanbanPresenter = (ctx: ExtensionCommandContext, sessions: BoardSessions) => Promise<BoardIntent>;

export async function presentFixtureBoard(ctx: ExtensionCommandContext, sessions: BoardSessions): Promise<BoardIntent> {
	let board: FixtureBoard | undefined;
	const result = await ctx.ui.custom<BoardIntent | undefined>(
		(tui, theme, keybindings, done) => {
			board = new FixtureBoard({
				tui: tui as Pick<TUI, "requestRender"> & { terminal?: { rows: number; columns: number } },
				theme,
				keybindings,
				getTheme: () => ctx.ui.theme ?? theme,
				snapshot: DEMO_BOARD_SNAPSHOT,
				done,
				onDispose: () => {
					if (board) sessions.delete(board);
				},
			});
			sessions.add(board);
			return board;
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "top-center",
				width: "100%",
				maxHeight: "45%",
				margin: { top: 0, right: 0, bottom: 0, left: 0 },
			},
		},
	);
	board?.dispose();
	return result ?? { kind: "cancelled" };
}

export function registerSpecbaseKanbanExtension(
	pi: ExtensionAPI,
	present: KanbanPresenter = presentFixtureBoard,
): BoardSessions {
	const sessions = new BoardSessions();
	pi.registerCommand(KANBAN_COMMAND, {
		description: "Open the fixture-backed Specbase kanban (`--demo` only)",
		handler: async (args, ctx) => {
			if (parseKanbanMode(args) !== "demo") {
				ctx.ui.notify(
					`${KANBAN_USAGE}\nDemo mode is explicit; live Specbase sources are not available yet.`,
					"error",
				);
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/spcb:kanban --demo requires an interactive Pi TUI session.", "error");
				return;
			}
			const intent = await present(ctx, sessions);
			if (intent.kind === "selected") {
				ctx.ui.notify(
					`Fixture intent selected: ${intent.cardId} / ${intent.actionId}. No action was dispatched.`,
					"info",
				);
			} else {
				ctx.ui.notify("Specbase kanban cancelled. No action was dispatched.", "info");
			}
		},
	});
	pi.on("session_shutdown", () => sessions.dispose());
	return sessions;
}
