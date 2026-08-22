import type { Theme } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { KANBAN_COMMAND, parseKanbanRequest, registerSpecbaseKanbanExtension } from "../extension.js";
import { FixtureBoard } from "./fixture-board.js";
import { LiveBoard, LiveBoardController } from "./live-board.js";
import {
	type CanonicalKanbanSnapshot,
	createLiveBoardSource,
	type LiveBoardSource,
	projectCanonicalSnapshot,
	type SpecbasePublicApi,
} from "./live-source.js";
import type { BoardSnapshot } from "./types.js";

const theme = makeTheme() as unknown as Theme;

type CanonicalStack = { readonly id: string; readonly position: number; readonly total: number };
type CanonicalStackContext = Readonly<Record<string, unknown>>;
type StackAwareBoardCard = {
	readonly stack?: CanonicalStack;
	readonly stackLabel?: string;
	readonly stackContext?: CanonicalStackContext;
};
type StackAwareApi = SpecbasePublicApi & {
	readonly getChangeStackContext: (root: string, memberId: string) => Promise<CanonicalStackContext>;
};

function stackCard(card: unknown): StackAwareBoardCard {
	return card as StackAwareBoardCard;
}

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
	return {
		version: 4,
		project: { name: options.project ?? "canonical-project" },
		summary: {
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
		diagnostics: options.empty
			? []
			: [{ source: "specbase", code: "board_warning", message: "Board warning", remediation: "Inspect it" }],
	};
}

function fakeApi(snapshot: CanonicalKanbanSnapshot = canonicalSnapshot()): SpecbasePublicApi {
	return {
		KANBAN_BOARD_VERSION: 4,
		DIRECT_ACTION_CATALOG_VERSION: 2,
		deriveKanbanBoard: vi.fn(async () => snapshot),
		validateKanbanBoardSnapshot: vi.fn((value, version) =>
			version === 4 && value === snapshot
				? { valid: true as const, snapshot, diagnostics: [] as const }
				: {
						valid: false as const,
						snapshot: null,
						diagnostics: [{ message: "Invalid snapshot", remediation: "Derive it again" }],
					},
		),
		getChangeStackContext: vi.fn(async () => null),
		getDirectActions: vi.fn(async ({ workItemId, storeId }) => ({
			version: 2,
			target: { storeId: storeId ?? null, workItemId, position: "active" as const },
			actions: [],
			diagnostics: [],
		})),
		validateDirectActionIntent: vi.fn(async () => ({
			accepted: false as const,
			descriptor: null,
			diagnostics: [],
		})),
		recordDirectActionResult: vi.fn(async () => ({ accepted: true, snapshot: {}, diagnostics: [] })),
		resolveRegisteredStore: vi.fn(async ({ id }) => ({ id, storeRoot: `/registered/${id}` })),
		resolveCurrentPlanningHomeSync: vi.fn(() => ({ root: "/nearest/project" })),
	};
}

function boardSnapshot(id: string, columns: BoardSnapshot["columns"]): BoardSnapshot {
	return { id, title: id, columns };
}

function testSource(load: LiveBoardSource["load"]): LiveBoardSource {
	return {
		id: "live",
		label: "live",
		root: "/live",
		storeId: null,
		assertCurrent: vi.fn(async () => {}),
		load,
	};
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
		expect(nearestApi.validateKanbanBoardSnapshot).toHaveBeenCalledWith(expect.anything(), 4);

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

	it("projects all seven canonical v4 work lanes while omitting accepted-spec cards", () => {
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
		expect(projected.columns.some((column) => column.id === "specs")).toBe(false);
		expect(projected.title).toContain("1 diagnostics");
	});

	it("preserves exact v4 stack data, shares one stable rail label, and requests context only for stacked cards", async () => {
		const base = canonicalSnapshot();
		const stack: CanonicalStack = { id: "delivery-rail", position: 2, total: 3 };
		const stacked = { ...base.lanes.implementing[0]!, stack };
		const unstacked = { ...stacked, id: "change-unstacked", title: "Unstacked change", stack: undefined };
		const canonical = {
			...base,
			lanes: { ...base.lanes, proposed: [unstacked], implementing: [stacked] },
		};
		const fullContext: CanonicalStackContext = Object.freeze({
			id: "delivery-rail",
			members: ["change-foundation", "change-stable-id", "change-follow-up"],
			predecessor: "change-foundation",
			successor: "change-follow-up",
		});
		const api = Object.assign(fakeApi(canonical), {
			getChangeStackContext: vi.fn(async () => fullContext),
		}) as unknown as StackAwareApi;
		const source = await createLiveBoardSource({ kind: "store", storeId: "acme" }, "/ignored", api);
		const projected = await source.load();
		const projectedStacked = projected.columns.find((column) => column.id === "implementing")!.cards[0]!;
		const projectedUnstacked = projected.columns.find((column) => column.id === "proposed")!.cards[0]!;

		expect(api.getChangeStackContext).toHaveBeenCalledTimes(1);
		expect(api.getChangeStackContext).toHaveBeenCalledWith("/registered/acme", "change-stable-id");
		expect(stackCard(projectedStacked).stack).toBe(stack);
		expect(stackCard(projectedStacked).stackLabel).toBe(stack.id);
		expect(stackCard(projectedStacked).stackContext).toBe(fullContext);
		expect(stackCard(projectedUnstacked).stack).toBeUndefined();
		expect(stackCard(projectedUnstacked).stackLabel).toBeUndefined();
		expect(stackCard(projectedUnstacked).stackContext).toBeUndefined();

		const board = new FixtureBoard({
			tui: { requestRender: vi.fn(), terminal: { rows: 40, columns: 120 } },
			theme,
			snapshot: projected,
			done: vi.fn(),
		});
		for (let index = 0; index < 4; index++) board.handleInput("l");
		const rail = board.render(120).join("\n");
		expect(rail).toContain("delivery-rail");
		expect(rail).toContain("2/3");
		board.handleInput("\r");
		const detail = board.render(120).join("\n");
		expect(detail).toContain("change-foundation");
		expect(detail).toContain("change-follow-up");
	});

	it("keeps the validated board and rail when optional stack-detail hydration fails", async () => {
		const base = canonicalSnapshot();
		const canonical = {
			...base,
			lanes: {
				...base.lanes,
				implementing: [{ ...base.lanes.implementing[0]!, stack: { id: "delivery", position: 1, total: 2 } }],
			},
		};
		const api = fakeApi(canonical);
		vi.mocked(api.getChangeStackContext).mockRejectedValue(new Error("projection unavailable"));
		const source = await createLiveBoardSource({ kind: "nearest" }, "/work", api);
		const projected = await source.load();
		const card = projected.columns.find((column) => column.id === "implementing")!.cards[0]!;
		expect(stackCard(card).stack).toEqual({ id: "delivery", position: 1, total: 2 });
		expect(stackCard(card).stackContext).toBeUndefined();
		expect(projected.notices).toContainEqual(expect.stringContaining("projection unavailable"));
	});

	it("retains stacked archived PR context without requesting direct actions", async () => {
		const base = canonicalSnapshot({ empty: true });
		const archived = {
			kind: "archive" as const,
			id: "archived-change",
			title: "Archived change",
			archived: "2026-08-22",
			tasks: { completed: 2, total: 2 },
			stack: { id: "delivery", position: 2, total: 2 },
			pullRequest: {
				number: 42,
				url: "https://github.com/acme/widget/pull/42",
				repository: "acme/widget",
				base: "main",
				head: "feature/archived-change",
				headSha: "a".repeat(40),
				runId: "run-42",
				state: "ready" as const,
			},
		};
		const canonical = {
			...base,
			summary: { ...base.summary, lanes: { ...(base.summary.lanes as Record<string, number>), archived: 1 } },
			lanes: { ...base.lanes, archived: [archived] },
		};
		const api = fakeApi(canonical);
		vi.mocked(api.getChangeStackContext).mockResolvedValue({ id: "delivery", member: "archived-change" });
		const source = await createLiveBoardSource({ kind: "nearest" }, "/work", api);
		const projected = await source.load();
		const card = projected.columns.find((column) => column.id === "archived")!.cards[0]!;
		expect(api.getDirectActions).not.toHaveBeenCalled();
		expect(api.getChangeStackContext).toHaveBeenCalledWith("/nearest/project", "archived-change");
		expect(card.summary).toContain("ready PR #42");
		expect(stackCard(card).stackContext).toEqual({ id: "delivery", member: "archived-change" });
	});

	it("shows a canonically recorded ready PR link in Reviewing card detail", () => {
		const base = canonicalSnapshot();
		const change = {
			...base.lanes.implementing[0]!,
			lifecycle: "reviewing" as const,
			pullRequest: {
				number: 42,
				url: "https://github.com/acme/widget/pull/42",
				repository: "acme/widget",
				base: "main",
				head: "feature/change",
				headSha: "a".repeat(40),
				runId: "run-42",
				state: "ready" as const,
			},
		};
		const canonical = {
			...base,
			lanes: { ...base.lanes, implementing: [], reviewing: [change] },
		};
		const reviewing = projectCanonicalSnapshot(canonical, "nearest", "nearest").columns.find(
			(column) => column.id === "reviewing",
		)!;
		expect(reviewing.cards[0]?.summary).toContain("PR #42 https://github.com/acme/widget/pull/42");
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
		const controller = new LiveBoardController(testSource(load));
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
			source: testSource(() => load.promise),
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
		const controller = new LiveBoardController(testSource(() => pending.promise));
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
		const controller = new LiveBoardController(testSource(load));
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
			source: { ...testSource(load), label: "store live" },
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
