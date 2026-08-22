import type { Theme } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { BoardSessions, KANBAN_COMMAND, presentFixtureBoard, registerSpecbaseKanbanExtension } from "./extension.js";
import { FixtureBoard } from "./kanban/fixture-board.js";
import type { BoardIntent, BoardSnapshot } from "./kanban/types.js";

const theme = makeTheme() as unknown as Theme;

function sourceNeutralSnapshot(): BoardSnapshot {
	return {
		id: "external-snapshot",
		title: "An adapter-owned snapshot",
		columns: [
			{
				id: "adapter-column",
				label: "Adapter column",
				cards: [
					{
						id: "adapter-card",
						title: "Adapter-provided card",
						summary: "Presentation receives only display fields.",
						actions: [{ id: "adapter-action", label: "Select", enabled: true }],
					},
				],
			},
		],
	};
}

describe("rpiv-specbase extension", () => {
	it("owns the Specbase command without requiring another RPIV package", () => {
		const { pi, captured } = createMockPi();
		registerSpecbaseKanbanExtension(pi);
		const command = captured.commands.get(KANBAN_COMMAND);
		expect(command?.description).toContain("Specbase kanban");
	});

	it("uses the production top overlay contract and restores sessions after host disposal", async () => {
		let component: FixtureBoard | undefined;
		let overlayOptions: Record<string, unknown> | undefined;
		const custom = vi.fn(async (factory: (...args: never[]) => FixtureBoard, options: Record<string, unknown>) => {
			overlayOptions = options;
			component = factory(
				{ requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } } as never,
				theme as never,
				{ matches: vi.fn(() => false) } as never,
				vi.fn() as never,
			);
			return undefined;
		});
		const ctx = createMockCtx({ hasUI: true, mode: "tui", ui: { custom } as never });
		const sessions = new BoardSessions();
		await presentFixtureBoard(ctx as never, sessions);
		expect(custom).toHaveBeenCalledTimes(1);
		expect(overlayOptions).toMatchObject({
			overlay: true,
			overlayOptions: { anchor: "top-center", width: "100%", maxHeight: "45%" },
		});
		expect(component?.render(120).join("\n")).toContain("Specbase kanban");
		expect(sessions.size).toBe(0);
	});

	it("keeps the renderer source-neutral and returns its selection to the caller", () => {
		const done = vi.fn<(intent: BoardIntent) => void>();
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			snapshot: sourceNeutralSnapshot(),
			done,
		});
		board.handleInput("\r");
		board.handleInput("\r");
		board.handleInput("\r");
		expect(done).toHaveBeenCalledWith({ kind: "selected", cardId: "adapter-card", actionId: "adapter-action" });
	});

	it("reports usage and interactive-session failures without opening a board", async () => {
		const { pi, captured } = createMockPi();
		const present = vi.fn(async () => ({ kind: "cancelled" }) as BoardIntent);
		registerSpecbaseKanbanExtension(pi, present);
		const command = captured.commands.get(KANBAN_COMMAND)!;
		const usageCtx = createMockCtx({ hasUI: true, mode: "tui" });
		await command.handler("--unsupported", usageCtx as never);
		expect(usageCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "error");
		const headlessCtx = createMockCtx({ hasUI: false, mode: "print" });
		await command.handler("--demo", headlessCtx as never);
		expect(headlessCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("interactive"), "error");
		expect(present).not.toHaveBeenCalled();
	});

	it("disposes session-scoped boards on session shutdown with no lingering subscriptions or timers", async () => {
		vi.useFakeTimers();
		const { pi, captured } = createMockPi();
		const sessions = registerSpecbaseKanbanExtension(pi);
		const disposeSubscription = vi.fn();
		const done = vi.fn();
		let board: FixtureBoard;
		board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			snapshot: sourceNeutralSnapshot(),
			done,
			subscribe: () => ({ dispose: disposeSubscription }),
			onDispose: () => sessions.delete(board),
		});
		sessions.add(board);
		const shutdown = captured.events.get("session_shutdown")?.[0];
		await shutdown?.({}, createMockCtx());
		expect(disposeSubscription).toHaveBeenCalledTimes(1);
		expect(done).toHaveBeenCalledWith({ kind: "cancelled" });
		expect(sessions.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	});
});
