import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
	ActionDispatchCoordinator,
	type ActionDispatchFeedback,
	ActionInFlightRegistry,
	type CapabilityDispatcher,
	CapabilityDispatcherRegistry,
} from "./kanban/action-dispatch.js";
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
import {
	getWorkflowActivityBridge,
	registerWorkflowActivityBridgeHook,
	type WorkflowActivityBridge,
} from "./workflow-bridge.js";

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
	/** Delivery owners register capability handlers here; this package never names their workflows. */
	readonly capabilityDispatcher?: CapabilityDispatcher;
	/** Optional public-RPIV observer; false keeps the board fully activity-unaware. */
	readonly workflowActivityBridge?: WorkflowActivityBridge | false;
}

function notifyDispatchFeedback(ctx: ExtensionCommandContext, feedback: ActionDispatchFeedback): void {
	const level =
		feedback.phase === "rejected" || feedback.phase === "duplicate"
			? "warning"
			: feedback.phase === "accepted"
				? "info"
				: "info";
	ctx.ui.notify(feedback.message, level);
}

export function registerSpecbaseKanbanExtension(
	pi: ExtensionAPI,
	presentDemo: KanbanPresenter = presentFixtureBoard,
	dependencies: SpecbaseKanbanDependencies = {},
): BoardSessions {
	const sessions = new BoardSessions();
	const workflowActivity =
		dependencies.workflowActivityBridge === false
			? undefined
			: (dependencies.workflowActivityBridge ?? getWorkflowActivityBridge());
	const loadApi = dependencies.loadApi ?? loadSpecbasePublicApi;
	const presentLive = dependencies.presentLive ?? presentLiveBoard;
	const capabilities = dependencies.capabilityDispatcher ?? new CapabilityDispatcherRegistry();
	const inFlight = new ActionInFlightRegistry();
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

			if (request.source === "demo") {
				const intent = await presentDemo(ctx, sessions);
				if (intent.kind === "selected") {
					ctx.ui.notify(
						`Fixture intent selected: ${intent.cardId} / ${intent.actionId}. No action was dispatched.`,
						"info",
					);
				} else {
					ctx.ui.notify("Specbase kanban cancelled. No action was dispatched.", "info");
				}
				return;
			}

			let source: LiveBoardSource;
			let api: SpecbasePublicApi;
			try {
				api = await loadApi();
				source = await createLiveBoardSource(
					request.source,
					ctx.cwd,
					api,
					workflowActivity ? (root, storeId) => workflowActivity.board(root, storeId) : undefined,
				);
			} catch (error) {
				const message = errorMessage(error);
				const nextStep = /next step:/iu.test(message)
					? message
					: `${message} Next step: run specbase init in a project or pass --store <registered-id>.`;
				ctx.ui.notify(nextStep, "error");
				return;
			}

			const coordinator = new ActionDispatchCoordinator({
				validate: (selection) => api.validateDirectActionIntent(selection, { root: source.root }),
				conversation: {
					sendUserMessage: (invocation, options) => pi.sendUserMessage(invocation, options),
				},
				capabilities,
				assertSource: () => source.assertCurrent(),
				inFlight,
				feedback: (feedback) => notifyDispatchFeedback(ctx, feedback),
			});

			while (true) {
				const intent = await presentLive(ctx, sessions, source);
				if (intent.kind === "cancelled") {
					ctx.ui.notify("Specbase kanban cancelled. No action was dispatched.", "info");
					return;
				}
				if (!intent.selection) {
					ctx.ui.notify(
						"The selected row has no canonical dispatch authority. Refresh and choose a live action.",
						"warning",
					);
					continue;
				}
				if (
					intent.selection.workItemId !== intent.cardId ||
					intent.selection.actionId !== intent.actionId ||
					intent.selection.storeId !== source.storeId
				) {
					ctx.ui.notify(
						"The selected action no longer matches the presented card or store. Refresh and choose again.",
						"warning",
					);
					continue;
				}

				// The presenter has resolved and disposed its overlay before either terminal adapter runs.
				const outcome = await coordinator.dispatch(intent.selection);
				if (outcome.status === "accepted" && outcome.route === "skill") return;
				// Reopen on stale/refused selections and after autonomous acknowledgement.
				// The live presenter performs a fresh canonical load on every opening.
			}
		},
	});
	pi.on("session_shutdown", () => sessions.dispose());
	if (workflowActivity) registerWorkflowActivityBridgeHook(pi, workflowActivity);
	return sessions;
}
