import type { Theme } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { KANBAN_COMMAND, parseKanbanRequest, registerSpecbaseKanbanExtension } from "../extension.js";
import { FixtureBoard } from "./fixture-board.js";
import { LiveBoard, LiveBoardController } from "./live-board.js";
import {
	type CanonicalKanbanSnapshot,
	createLiveBoardSource,
	projectCanonicalSnapshot,
	type SpecbasePublicApi,
} from "./live-source.js";
import type { BoardSnapshot } from "./types.js";

const theme = makeTheme() as unknown as Theme;

function canonicalSnapshot(options: { empty?: boolean; project?: string } = {}): CanonicalKanbanSnapshot {
	const change = {
		kind: "change" as const,
		id: "change-stable-id",
		title: "Open live stores",
		created: "2026-08-21",
		artifacts: { completed: 5, total: 5 },
		tasks: { completed: 3, total: 9 },
		lifecycle: "implementing" as const,
		diagnostics: [
			{
				source: "specbase/changes/open-live",
				code: "example_warning",
				message: "Representative warning",
				remediation: "Inspect the change",
			},
		],
	};
	const spec = {
		kind: "spec" as const,
		id: "behavior.specbase-kanban",
		locator: "behavior/specbase-kanban",
		title: "behavior/specbase-kanban",
		requirementCount: 3,
		requirements: ["Live store selection", "Projection", "Refresh"],
		diagnostic: null,
	};
	return {
		version: 3,
		project: { name: options.project ?? "canonical-project" },
		summary: {
			acceptedSpecs: 1,
			requirements: 3,
			openIdeas: 0,
			lanes: {
				proposed: 0,
				enforcement: 0,
				"ready-to-apply": 0,
				implementing: options.empty ? 0 : 1,
				reviewing: 0,
				archived: 0,
			},
			completedTasks: options.empty ? 0 : 3,
			totalTasks: options.empty ? 0 : 9,
		},
		lanes: {
			ideas: [],
			proposed: [],
			enforcement: [],
			"ready-to-apply": [],
			implementing: options.empty ? [] : [change],
			reviewing: [],
			archived: [],
		},
		specs: [spec],
		diagnostics: options.empty
			? []
			: [{ source: "specbase", code: "board_warning", message: "Board warning", remediation: "Inspect it" }],
	};
}

function fakeApi(snapshot: CanonicalKanbanSnapshot = canonicalSnapshot()): SpecbasePublicApi {
	return {
		KANBAN_BOARD_VERSION: 3,
		deriveKanbanBoard: vi.fn(async () => snapshot),
		validateKanbanBoardSnapshot: vi.fn((value, version) =>
			version === 3 && value === snapshot
				? { valid: true as const, snapshot, diagnostics: [] as const }
				: {
						valid: false as const,
						snapshot: null,
						diagnostics: [{ message: "Invalid snapshot", remediation: "Derive it again" }],
					},
		),
		resolveRegisteredStore: vi.fn(async ({ id }) => ({ id, storeRoot: `/registered/${id}` })),
		resolveCurrentPlanningHomeSync: vi.fn(() => ({ root: "/nearest/project" })),
	};
}

function boardSnapshot(id: string, columns: BoardSnapshot["columns"]): BoardSnapshot {
	return { id, title: id, columns };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe("live Specbase board", () => {
	it("parses nearest, registered, and explicit demo sources before UI creation", () => {
		expect(parseKanbanRequest("")).toEqual({ ok: true, source: { kind: "nearest" } });
		expect(parseKanbanRequest("--store acme")).toEqual({
			ok: true,
			source: { kind: "store", storeId: "acme" },
		});
		expect(parseKanbanRequest("--demo")).toEqual({ ok: true, source: "demo" });
		expect(parseKanbanRequest("--demo --store acme")).toMatchObject({ ok: false });
		expect(parseKanbanRequest("--store")).toMatchObject({ ok: false });
		expect(parseKanbanRequest("--unknown")).toMatchObject({ ok: false });
	});

	it("resolves nearest and registered roots only through canonical public API fakes", async () => {
		const nearestApi = fakeApi();
		const nearest = await createLiveBoardSource({ kind: "nearest" }, "/work/nested", nearestApi);
		expect(nearestApi.resolveCurrentPlanningHomeSync).toHaveBeenCalledWith({
			startPath: "/work/nested",
			allowImplicitRepoRoot: false,
		});
		await nearest.load();
		expect(nearestApi.deriveKanbanBoard).toHaveBeenCalledWith("/nearest/project");
		expect(nearestApi.validateKanbanBoardSnapshot).toHaveBeenCalledWith(expect.anything(), 3);

		const registeredApi = fakeApi();
		const registered = await createLiveBoardSource({ kind: "store", storeId: "acme" }, "/ignored", registeredApi);
		expect(registeredApi.resolveRegisteredStore).toHaveBeenCalledWith({ id: "acme" });
		await registered.load();
		expect(registeredApi.deriveKanbanBoard).toHaveBeenCalledWith("/registered/acme");
		expect(registeredApi.resolveCurrentPlanningHomeSync).not.toHaveBeenCalled();
	});

	it("keeps demo deterministic without loading the optional live peer", async () => {
		const { pi, captured } = createMockPi();
		const presentDemo = vi.fn(async () => ({ kind: "cancelled" as const }));
		const loadApi = vi.fn(async () => fakeApi());
		registerSpecbaseKanbanExtension(pi, presentDemo, { loadApi });
		const command = captured.commands.get(KANBAN_COMMAND)!;
		await command.handler("--demo", createMockCtx({ hasUI: true, mode: "tui" }) as never);
		expect(presentDemo).toHaveBeenCalledTimes(1);
		expect(loadApi).not.toHaveBeenCalled();
	});

	it("reports canonical store failures without opening demo or live fixture fallback", async () => {
		const { pi, captured } = createMockPi();
		const presentDemo = vi.fn();
		const presentLive = vi.fn();
		const api = fakeApi();
		vi.mocked(api.resolveRegisteredStore).mockRejectedValue(
			Object.assign(new Error("Unknown store 'missing'"), {
				diagnostic: { fix: "Run specbase store list to see registered stores." },
			}),
		);
		registerSpecbaseKanbanExtension(pi, presentDemo, { loadApi: async () => api, presentLive });
		const command = captured.commands.get(KANBAN_COMMAND)!;
		const ctx = createMockCtx({ hasUI: true, mode: "tui" });
		await command.handler("--store missing", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringMatching(/Unknown store.*Next step.*store list/isu),
			"error",
		);
		expect(presentDemo).not.toHaveBeenCalled();
		expect(presentLive).not.toHaveBeenCalled();
	});

	it("projects every canonical lane and spec by exact identity while retaining source objects", () => {
		const canonical = canonicalSnapshot();
		const projected = projectCanonicalSnapshot(canonical, "acme", "store acme");
		expect(projected.source).toBe(canonical);
		expect(projected.columns.map((column) => column.id)).toEqual([
			"ideas",
			"proposed",
			"enforcement",
			"ready-to-apply",
			"implementing",
			"reviewing",
			"archived",
			"specs",
		]);
		const implementing = projected.columns.find((column) => column.id === "implementing")!;
		expect(implementing.source).toBe(canonical.lanes.implementing);
		expect(implementing.cards[0]).toMatchObject({
			id: "change-stable-id",
			summary: expect.stringContaining("example_warning: Representative warning Next step: Inspect the change"),
			actions: [],
		});
		expect(implementing.cards[0]!.source).toBe(canonical.lanes.implementing[0]);
		expect(projected.notices).toEqual(["board_warning: Board warning Next step: Inspect it"]);
		expect(projected.columns.at(-1)?.cards[0]?.id).toBe("behavior.specbase-kanban");
		expect(projected.title).toContain("1 diagnostics");
	});

	it("treats a validated cardless canonical snapshot as an empty live store", async () => {
		const api = fakeApi(canonicalSnapshot({ empty: true }));
		const source = await createLiveBoardSource({ kind: "nearest" }, "/work", api);
		const controller = new LiveBoardController(source);
		await controller.refresh();
		expect(controller.state).toMatchObject({ kind: "empty", error: null });
	});

	it("distinguishes initial failure from empty state and permits retry", async () => {
		const recovered = boardSnapshot("recovered", [{ id: "one", label: "One", cards: [] }]);
		const load = vi.fn().mockRejectedValueOnce(new Error("initial unavailable")).mockResolvedValueOnce(recovered);
		const controller = new LiveBoardController({ id: "live", label: "live", root: "/live", load });
		await controller.refresh();
		expect(controller.state).toEqual({ kind: "failure", snapshot: null, error: "initial unavailable" });
		await controller.refresh();
		expect(controller.state).toMatchObject({ kind: "empty", snapshot: recovered, error: null });
	});

	it("reconciles selection by identity, then nearest same-column card, then board order", () => {
		const first = boardSnapshot("first", [
			{
				id: "one",
				label: "One",
				cards: [
					{ id: "a", title: "A", summary: "A", actions: [] },
					{ id: "selected", title: "Selected", summary: "Selected", actions: [] },
				],
			},
			{ id: "two", label: "Two", cards: [] },
		]);
		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			snapshot: first,
			done: vi.fn(),
		});
		board.handleInput("j");
		board.replaceSnapshot(
			boardSnapshot("moved", [
				{ id: "one", label: "One", cards: [{ id: "a", title: "A", summary: "A", actions: [] }] },
				{
					id: "two",
					label: "Two",
					cards: [{ id: "selected", title: "Selected", summary: "Selected", actions: [] }],
				},
			]),
		);
		expect(board.getFocus()).toMatchObject({ columnId: "two", cardId: "selected" });
		board.replaceSnapshot(
			boardSnapshot("missing", [
				{ id: "one", label: "One", cards: [{ id: "first", title: "First", summary: "First", actions: [] }] },
				{
					id: "two",
					label: "Two",
					cards: [{ id: "same-column", title: "Same", summary: "Same", actions: [] }],
				},
			]),
		);
		expect(board.getFocus()).toMatchObject({ columnId: "two", cardId: "same-column" });
		board.replaceSnapshot(
			boardSnapshot("board-order", [
				{ id: "one", label: "One", cards: [{ id: "first", title: "First", summary: "First", actions: [] }] },
				{ id: "two", label: "Two", cards: [] },
			]),
		);
		expect(board.getFocus()).toMatchObject({ columnId: "one", cardId: "first" });
	});

	it("navigates every live column after replacing the one-column loading placeholder", async () => {
		const load = deferred<BoardSnapshot>();
		const board = new LiveBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			source: { id: "live", label: "live", root: "/live", load: () => load.promise },
			done: vi.fn(),
		});
		load.resolve(projectCanonicalSnapshot(canonicalSnapshot(), "live", "live"));
		await vi.waitFor(() => expect(board.controller.state.kind).toBe("ready"));
		expect(board.getFocus()).toMatchObject({ columnId: "implementing", cardId: "change-stable-id" });
		board.handleInput("l");
		expect(board.getFocus().columnId).toBe("reviewing");
		board.handleInput("l");
		expect(board.getFocus().columnId).toBe("archived");
		board.handleInput("h");
		board.handleInput("h");
		expect(board.getFocus()).toMatchObject({ columnId: "implementing", cardId: "change-stable-id" });
		board.handleInput("\r");
		expect(board.render(120).join("\n")).toContain("no actions in this snapshot");
		board.dispose();
	});

	it("invalidates pending refresh generations when disposed", async () => {
		const pending = deferred<BoardSnapshot>();
		const controller = new LiveBoardController({
			id: "live",
			label: "live",
			root: "/live",
			load: () => pending.promise,
		});
		const states: string[] = [];
		controller.subscribe((state) => states.push(state.kind));
		const refresh = controller.refresh();
		controller.dispose();
		pending.resolve(boardSnapshot("late", [{ id: "one", label: "One", cards: [] }]));
		await refresh;
		expect(states).toEqual(["loading", "loading"]);
		expect(controller.state.kind).toBe("loading");
	});

	it("commits only the newest refresh generation when requests resolve out of order", async () => {
		const older = deferred<BoardSnapshot>();
		const newer = deferred<BoardSnapshot>();
		const load = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
		const controller = new LiveBoardController({ id: "live", label: "live", root: "/live", load });
		const olderRefresh = controller.refresh();
		const newerRefresh = controller.refresh();
		newer.resolve(boardSnapshot("newer", [{ id: "one", label: "One", cards: [] }]));
		await newerRefresh;
		expect(controller.state.snapshot?.id).toBe("newer");
		older.resolve(boardSnapshot("older", [{ id: "one", label: "One", cards: [] }]));
		await olderRefresh;
		expect(controller.state.snapshot?.id).toBe("newer");
	});

	it("keeps the last good board stale on failure and exposes r retry to recover", async () => {
		const first = boardSnapshot("first", [
			{ id: "one", label: "One", cards: [{ id: "a", title: "A", summary: "A", actions: [] }] },
		]);
		const recovered = boardSnapshot("recovered", [
			{ id: "one", label: "One", cards: [{ id: "a", title: "A2", summary: "A2", actions: [] }] },
		]);
		const load = vi
			.fn()
			.mockResolvedValueOnce(first)
			.mockRejectedValueOnce(new Error("refresh unavailable"))
			.mockResolvedValueOnce(recovered);
		const board = new LiveBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			source: { id: "live", label: "store live", root: "/live", load },
			done: vi.fn(),
		});
		expect(board.render(120).join("\n")).toContain("Loading store live");
		await vi.waitFor(() => expect(board.controller.state.kind).toBe("ready"));
		board.handleInput("r");
		await vi.waitFor(() => expect(board.controller.state.kind).toBe("stale"));
		const stale = board.render(120).join("\n");
		expect(stale).toContain("Stale: refresh unavailable");
		expect(stale).toContain("r retry");
		expect(board.controller.state.snapshot).toBe(first);
		board.handleInput("r");
		await vi.waitFor(() => expect(board.controller.state.snapshot?.id).toBe("recovered"));
		expect(board.controller.state.kind).toBe("ready");
		board.dispose();
	});
});
