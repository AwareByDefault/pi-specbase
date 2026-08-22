import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { KANBAN_COMMAND, parseKanbanMode, registerSpecbaseKanbanExtension } from "../extension.js";
import { FixtureBoard } from "./fixture-board.js";
import { DEMO_BOARD_SNAPSHOT } from "./fixtures.js";
import { getBoardLayout, MAX_BOARD_ROWS, MIN_CHAT_ROWS } from "./layout.js";
import type { BoardIntent } from "./types.js";

const theme = makeTheme() as unknown as Theme;

function createBoard(options: { rows?: number; columns?: number; subscribe?: () => { dispose(): void } } = {}) {
	const requestRender = vi.fn();
	const done = vi.fn<(intent: BoardIntent) => void>();
	const board = new FixtureBoard({
		tui: {
			requestRender,
			terminal: { rows: options.rows ?? 40, columns: options.columns ?? 120 },
		},
		theme,
		snapshot: DEMO_BOARD_SNAPSHOT,
		done,
		subscribe: options.subscribe ? () => options.subscribe!() : undefined,
	});
	return { board, done, requestRender };
}

describe("fixture board", () => {
	it("keeps explicit demo mode independent while classifying live sources", () => {
		expect(parseKanbanMode("--demo")).toBe("demo");
		expect(parseKanbanMode("")).toBe("nearest");
		expect(parseKanbanMode("--store local")).toBe("store");
		expect(parseKanbanMode("--demo --store local")).toBe("unsupported");
	});

	it("moves focus safely across populated and empty columns", () => {
		const { board, requestRender } = createBoard();
		expect(board.getFocus()).toMatchObject({ columnId: "idea", cardId: "fixture-idea-kanban" });
		board.handleInput("\u001b[C");
		expect(board.getFocus()).toEqual({ stage: "cards", columnId: "planned" });
		board.handleInput("\u001b[C");
		expect(board.getFocus()).toMatchObject({ columnId: "applying", cardId: "fixture-package-boundary" });
		expect(requestRender).toHaveBeenCalledTimes(2);
	});

	it("honors Pi cancellation bindings, Ctrl+C, and vim navigation", () => {
		const customCancel = createBoard();
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			keybindings: { matches: (data, action) => action === "tui.select.cancel" && data === "x" },
			snapshot: DEMO_BOARD_SNAPSHOT,
			done: customCancel.done,
		});
		board.handleInput("l");
		expect(board.getFocus().columnId).toBe("planned");
		board.handleInput("h");
		expect(board.getFocus().columnId).toBe("idea");
		board.handleInput("x");
		expect(customCancel.done).toHaveBeenCalledWith({ kind: "cancelled" });

		const ctrlC = createBoard();
		ctrlC.board.handleInput("\u0003");
		expect(ctrlC.done).toHaveBeenCalledWith({ kind: "cancelled" });
	});

	it("returns selected and cancelled intents, rerenders transitions, and disposes subscriptions", () => {
		const dispose = vi.fn();
		const { board, done, requestRender } = createBoard({ subscribe: () => ({ dispose }) });
		board.handleInput("\r");
		board.handleInput("\r");
		board.handleInput("\r");
		expect(done).toHaveBeenCalledWith({ kind: "selected", cardId: "fixture-idea-kanban", actionId: "explore" });
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(requestRender).toHaveBeenCalledTimes(3);

		const cancelled = createBoard();
		cancelled.board.handleInput("\u001b");
		expect(cancelled.done).toHaveBeenCalledWith({ kind: "cancelled" });
	});

	it("does not dispatch a selected fixture action", async () => {
		const { pi, captured } = createMockPi();
		const present = vi.fn(
			async () => ({ kind: "selected", cardId: "fixture-idea-kanban", actionId: "explore" }) as BoardIntent,
		);
		registerSpecbaseKanbanExtension(pi, present);
		const command = captured.commands.get(KANBAN_COMMAND)!;
		const ctx = createMockCtx({ hasUI: true, mode: "tui" });
		await command.handler("--demo", ctx as never);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(pi.exec).not.toHaveBeenCalled();
	});

	it("caps board rows, reserves eight chat rows, and enters compact mode when constrained", () => {
		const wide = getBoardLayout(40, 120);
		expect(wide.maxRows).toBeLessThanOrEqual(MAX_BOARD_ROWS);
		expect(wide.visibleChatRows).toBeGreaterThanOrEqual(MIN_CHAT_ROWS);
		expect(wide.compact).toBe(false);
		const constrained = getBoardLayout(22, 40);
		expect(constrained.maxRows).toBeLessThanOrEqual(Math.floor(22 * 0.45));
		expect(constrained.visibleChatRows).toBeGreaterThanOrEqual(MIN_CHAT_ROWS);
		expect(constrained.compact).toBe(true);
	});

	it("redraws from the active theme after invalidation", () => {
		const initial = makeTheme({ fg: (color, text) => `<initial:${color}>${text}` }) as unknown as Theme;
		const switched = makeTheme({ fg: (color, text) => `<switched:${color}>${text}` }) as unknown as Theme;
		let activeTheme = initial;
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme: initial,
			getTheme: () => activeTheme,
			snapshot: DEMO_BOARD_SNAPSHOT,
			done: vi.fn(),
		});
		expect(board.render(120).join("\n")).toContain("<initial:accent>");
		activeTheme = switched;
		board.invalidate();
		expect(board.render(120).join("\n")).toContain("<switched:accent>");
	});

	it("keeps compact action controls, blocked feedback, and focused rows visible", () => {
		const compact = createBoard({ rows: 22, columns: 40 });
		compact.board.handleInput("\r");
		compact.board.handleInput("\r");
		compact.board.handleInput("\u001b[B");
		const blocked = compact.board.render(40).join("\n");
		expect(blocked).toContain("blocked");
		expect(blocked).toContain("Blocked:");
		expect(blocked).toContain("Esc/Ctrl+C");

		const tooShort = createBoard({ rows: 14, columns: 40 });
		expect(tooShort.board.render(40).join("\n")).toContain("too short");
		expect(tooShort.board.render(40).join("\n")).toContain("Esc/Ctrl+C");
	});

	it("windows long card lists around the focused card", () => {
		const cards = Array.from({ length: 8 }, (_, index) => ({
			id: `card-${index}`,
			title: `Card ${index}`,
			summary: `Summary ${index}`,
			actions: [{ id: "open", label: "Open", enabled: true }],
		}));
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 20, columns: 80 } },
			theme,
			snapshot: { id: "long", title: "Long", columns: [{ id: "one", label: "One", cards }] },
			done: vi.fn(),
		});
		for (let index = 0; index < 7; index++) board.handleInput("j");
		const frame = board.render(80).join("\n");
		expect(board.getFocus().cardId).toBe("card-7");
		expect(frame).toContain("› Card 7");
	});

	it("never emits a line wider than Pi supplies and pads stable columns", () => {
		const { board } = createBoard({ rows: 40, columns: 120 });
		const lines = board.render(72);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(72);
		const headerSeparator = lines[1]!.indexOf("│");
		const cardSeparator = lines[2]!.indexOf("│");
		expect(headerSeparator).toBeGreaterThan(0);
		expect(cardSeparator).toBe(headerSeparator);
	});

	it("wraps ANSI-styled titles into no more than two display-width-safe card rows", () => {
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 30 } },
			theme,
			snapshot: {
				id: "wrapped-title",
				title: "Wrapped title",
				columns: [
					{
						id: "one",
						label: "One",
						cards: [
							{
								id: "wrapped",
								title: "\u001b[31mwrap-start alpha beta gamma delta wrap-tail\u001b[0m",
								summary: "Summary",
								actions: [],
							},
						],
					},
				],
			},
			done: vi.fn(),
		});
		const lines = board.render(30);
		const titleRows = lines.filter((line) => line.includes("wrap-start") || line.includes("wrap-tail"));
		expect(titleRows).toHaveLength(2);
		for (const line of titleRows) expect(visibleWidth(line)).toBeLessThanOrEqual(30);
	});

	it("moves one logical card at a time and windows mixed-height cards by complete rendered rows", () => {
		const cards = [
			{ id: "card-0", title: "Card zero", summary: "Summary", actions: [] },
			{ id: "card-1", title: "Card one", summary: "Summary", actions: [] },
			{ id: "card-2", title: "Card two", summary: "Summary", actions: [] },
			{ id: "card-3", title: "Card three", summary: "Summary", actions: [] },
			{ id: "card-4", title: "Card four", summary: "Summary", actions: [] },
			{ id: "card-5", title: "Card five", summary: "Summary", actions: [] },
			{
				id: "card-6",
				title: "\u001b[36mfocus-start alpha beta gamma delta epsilon focus-tail\u001b[0m",
				summary: "Summary",
				actions: [],
			},
		];
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 22, columns: 42 } },
			theme,
			snapshot: { id: "mixed-height", title: "Mixed height", columns: [{ id: "one", label: "One", cards }] },
			done: vi.fn(),
		});
		for (let index = 0; index < 6; index++) board.handleInput("j");
		expect(board.getFocus().cardId).toBe("card-6");
		const focused = board.render(42).join("\n");
		expect(focused).toContain("focus-start");
		expect(focused).toContain("focus-tail");
		board.handleInput("k");
		expect(board.getFocus().cardId).toBe("card-5");
		board.handleInput("j");
		expect(board.getFocus().cardId).toBe("card-6");
	});

	it("returns only populated sparse rows below the safe board cap", () => {
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			snapshot: {
				id: "sparse",
				title: "Sparse",
				columns: [
					{
						id: "one",
						label: "One",
						cards: [{ id: "only", title: "Only card", summary: "Summary", actions: [] }],
					},
				],
			},
			done: vi.fn(),
		});
		const lines = board.render(120);
		expect(lines).toHaveLength(4);
		expect(lines.length).toBeLessThan(getBoardLayout(40, 120).maxRows);
	});
});
