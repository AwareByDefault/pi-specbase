import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { FixtureBoard } from "./kanban/fixture-board.js";
import { DEMO_BOARD_SNAPSHOT } from "./kanban/fixtures.js";
import { LiveBoard } from "./kanban/live-board.js";
import {
	createLiveBoardSource,
	errorMessage,
	type LiveBoardSource,
	type LiveSourceRequest,
	loadSpecbasePublicApi,
	type SpecbasePublicApi,
} from "./kanban/live-source.js";
import type { BoardIntent } from "./kanban/types.js";

export const KANBAN_COMMAND = "spcb:kanban";
export const KANBAN_USAGE = "Usage: /spcb:kanban [--demo | --store <registered-id>]";

export type KanbanRequest =
	| { readonly ok: true; readonly source: "demo" | LiveSourceRequest }
	| {
			readonly ok: false;
			readonly message: string;
	  };

export type KanbanMode = "demo" | "nearest" | "store" | "unsupported";

export function parseKanbanRequest(args: string): KanbanRequest {
	const tokens = args.trim() ? args.trim().split(/\s+/u) : [];
	if (tokens.length === 0) return { ok: true, source: { kind: "nearest" } };
	if (tokens[0] === "--demo") {
		if (tokens.length === 1) return { ok: true, source: "demo" };
		return { ok: false, message: `${KANBAN_USAGE}\n--demo cannot be combined with another source.` };
	}
	if (tokens[0] === "--store") {
		if (tokens.length === 2 && tokens[1]) return { ok: true, source: { kind: "store", storeId: tokens[1] } };
		if (tokens.length === 1)
			return { ok: false, message: `${KANBAN_USAGE}\n--store requires a registered store id.` };
		return { ok: false, message: `${KANBAN_USAGE}\nSelect exactly one registered store id.` };
	}
	return { ok: false, message: `${KANBAN_USAGE}\nUnsupported kanban source request.` };
}

/** Compatibility helper retained for callers that only classify source mode. */
export function parseKanbanMode(args: string): KanbanMode {
	const parsed = parseKanbanRequest(args);
	if (!parsed.ok) return "unsupported";
	return parsed.source === "demo" ? "demo" : parsed.source.kind;
}

export interface BoardSession {
	cancel(): void;
	dispose(): void;
}

export class BoardSessions {
	private readonly boards = new Set<BoardSession>();

	add(board: BoardSession): void {
		this.boards.add(board);
	}

	delete(board: BoardSession): void {
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
export type LiveKanbanPresenter = (
	ctx: ExtensionCommandContext,
	sessions: BoardSessions,
	source: LiveBoardSource,
) => Promise<BoardIntent>;

const OVERLAY_OPTIONS = {
	overlay: true,
	overlayOptions: {
		anchor: "top-center" as const,
		width: "100%" as const,
		maxHeight: "45%" as const,
		margin: { top: 0, right: 0, bottom: 0, left: 0 },
	},
};

export async function presentFixtureBoard(ctx: ExtensionCommandContext, sessions: BoardSessions): Promise<BoardIntent> {
	let board: FixtureBoard | undefined;
	const result = await ctx.ui.custom<BoardIntent | undefined>((tui, theme, keybindings, done) => {
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
	}, OVERLAY_OPTIONS);
	board?.dispose();
	return result ?? { kind: "cancelled" };
}

export async function presentLiveBoard(
	ctx: ExtensionCommandContext,
	sessions: BoardSessions,
	source: LiveBoardSource,
): Promise<BoardIntent> {
	let board: LiveBoard | undefined;
	const result = await ctx.ui.custom<BoardIntent | undefined>((tui, theme, keybindings, done) => {
		board = new LiveBoard({
			tui: tui as Pick<TUI, "requestRender"> & { terminal?: { rows: number; columns: number } },
			theme,
			keybindings,
			getTheme: () => ctx.ui.theme ?? theme,
			source,
			done,
			onDispose: () => {
				if (board) sessions.delete(board);
			},
		});
		sessions.add(board);
		return board;
	}, OVERLAY_OPTIONS);
	board?.dispose();
	return result ?? { kind: "cancelled" };
}

export interface SpecbaseKanbanDependencies {
	readonly loadApi?: () => Promise<SpecbasePublicApi>;
	readonly presentLive?: LiveKanbanPresenter;
}

export function registerSpecbaseKanbanExtension(
	pi: ExtensionAPI,
	presentDemo: KanbanPresenter = presentFixtureBoard,
	dependencies: SpecbaseKanbanDependencies = {},
): BoardSessions {
	const sessions = new BoardSessions();
	const loadApi = dependencies.loadApi ?? loadSpecbasePublicApi;
	const presentLive = dependencies.presentLive ?? presentLiveBoard;
	pi.registerCommand(KANBAN_COMMAND, {
		description: "Open the nearest, registered, or explicit demo Specbase kanban",
		handler: async (args, ctx) => {
			const request = parseKanbanRequest(args);
			if (!request.ok) {
				ctx.ui.notify(request.message, "error");
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/spcb:kanban requires an interactive Pi TUI session.", "error");
				return;
			}

			let intent: BoardIntent;
			if (request.source === "demo") {
				intent = await presentDemo(ctx, sessions);
			} else {
				let source: LiveBoardSource;
				try {
					const api = await loadApi();
					source = await createLiveBoardSource(request.source, ctx.cwd, api);
				} catch (error) {
					const message = errorMessage(error);
					const nextStep = /next step:/iu.test(message)
						? message
						: `${message} Next step: run specbase init in a project or pass --store <registered-id>.`;
					ctx.ui.notify(nextStep, "error");
					return;
				}
				intent = await presentLive(ctx, sessions, source);
			}

			if (intent.kind === "selected") {
				const prefix = request.source === "demo" ? "Fixture" : "Specbase";
				ctx.ui.notify(
					`${prefix} intent selected: ${intent.cardId} / ${intent.actionId}. No action was dispatched.`,
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
