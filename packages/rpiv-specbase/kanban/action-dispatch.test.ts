import { createMockCtx, createMockPi } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { KANBAN_COMMAND, registerSpecbaseKanbanExtension } from "../extension.js";
import {
	ActionDispatchCoordinator,
	ActionInFlightRegistry,
	CapabilityDispatcherRegistry,
	type CapabilityDispatchRequest,
	type DirectActionCatalog,
	type DirectActionDescriptor,
	type DirectActionSelection,
} from "./action-dispatch.js";
import {
	type CanonicalKanbanSnapshot,
	createLiveBoardSource,
	projectCanonicalSnapshot,
	type SpecbasePublicApi,
} from "./live-source.js";

const selection: DirectActionSelection = Object.freeze({
	version: 2,
	storeId: "acme",
	workItemId: "change-1",
	actionId: "apply",
	dispatchKind: "skill",
});

const skillDescriptor: DirectActionDescriptor = {
	actionId: "apply",
	label: "Apply conversationally",
	availability: "available",
	blocker: null,
	dispatch: {
		kind: "skill",
		skillId: "specbase-apply-change",
		arguments: { changeId: "change-1", storeId: "acme" },
	},
};

function capabilityDescriptor(
	capabilityId:
		| "specbase.local-delivery"
		| "specbase.draft-pr-delivery"
		| "specbase.ready-to-review" = "specbase.local-delivery",
): DirectActionDescriptor {
	return {
		actionId:
			capabilityId === "specbase.ready-to-review"
				? "ready-to-review"
				: capabilityId === "specbase.local-delivery"
					? "deliver-local"
					: "open-draft-pr",
		label:
			capabilityId === "specbase.ready-to-review"
				? "Deliver to human review"
				: capabilityId === "specbase.local-delivery"
					? "Deliver locally"
					: "Open draft PR",
		availability: "available",
		blocker: null,
		dispatch: { kind: "capability", capabilityId, arguments: { changeId: "change-1", storeId: "acme" } },
	};
}

function accepted(descriptor: DirectActionDescriptor) {
	return { accepted: true as const, descriptor, diagnostics: [] as const };
}

function canonicalSnapshot(): CanonicalKanbanSnapshot {
	return {
		version: 4,
		project: { name: "action-fixture" },
		summary: {},
		lanes: {
			ideas: [
				{
					kind: "idea",
					id: "idea-1",
					title: "Idea one",
					created: null,
					members: [],
				},
			],
			proposed: [],
			enforcement: [],
			"ready-to-apply": [],
			implementing: [
				{
					kind: "change",
					id: "change-1",
					title: "Change one",
					created: null,
					artifacts: { completed: 5, total: 5 },
					tasks: { completed: 1, total: 2 },
					lifecycle: "implementing",
				},
			],
			reviewing: [],
			archived: [],
		},
		diagnostics: [],
	};
}

function catalog(workItemId: string, actions: readonly DirectActionDescriptor[] = []): DirectActionCatalog {
	return {
		version: 2,
		target: { storeId: "acme", workItemId, position: workItemId.startsWith("idea") ? "idea" : "active" },
		actions,
		diagnostics: [],
	};
}

function fakeApi(
	options: {
		validate?: SpecbasePublicApi["validateDirectActionIntent"];
		getActions?: SpecbasePublicApi["getDirectActions"];
	} = {},
): SpecbasePublicApi {
	const snapshot = canonicalSnapshot();
	return {
		KANBAN_BOARD_VERSION: 4,
		DIRECT_ACTION_CATALOG_VERSION: 2,
		deriveKanbanBoard: vi.fn(async () => snapshot),
		validateKanbanBoardSnapshot: vi.fn(() => ({ valid: true as const, snapshot, diagnostics: [] as const })),
		getChangeStackContext: vi.fn(async () => null),
		getDirectActions:
			options.getActions ??
			vi.fn(async ({ workItemId }) => catalog(workItemId, workItemId === "change-1" ? [skillDescriptor] : [])),
		validateDirectActionIntent: options.validate ?? vi.fn(async () => accepted(skillDescriptor)),
		recordDirectActionResult: vi.fn(async () => ({ accepted: true, snapshot: {}, diagnostics: [] })),
		resolveRegisteredStore: vi.fn(async ({ id }) => ({ id, storeRoot: `/stores/${id}` })),
		resolveCurrentPlanningHomeSync: vi.fn(() => ({ root: "/nearest" })),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("canonical action presentation", () => {
	it("calls getDirectActions for each canonical work card and preserves exact descriptors and blockers", async () => {
		const blocked: DirectActionDescriptor = {
			actionId: "archive",
			label: "Archive",
			availability: "blocked",
			blocker: {
				code: "direct_action_tasks_incomplete",
				message: "Implementation tasks are incomplete.",
				remediation: "Complete every tracked implementation task before archiving.",
			},
			dispatch: {
				kind: "skill",
				skillId: "specbase-archive-change",
				arguments: { changeId: "change-1", storeId: "acme" },
			},
		};
		const getActions = vi.fn(async ({ workItemId }: { workItemId: string }) =>
			catalog(workItemId, workItemId === "change-1" ? [skillDescriptor, blocked] : []),
		);
		const api = fakeApi({ getActions });
		const source = await createLiveBoardSource({ kind: "store", storeId: "acme" }, "/ignored", api);
		const board = await source.load();

		expect(getActions).toHaveBeenCalledTimes(2);
		expect(getActions).toHaveBeenCalledWith({ workItemId: "idea-1", storeId: "acme" });
		expect(getActions).toHaveBeenCalledWith({ workItemId: "change-1", storeId: "acme" });
		const card = board.columns.find((column) => column.id === "implementing")!.cards[0]!;
		expect(card.actions.map((action) => [action.id, action.enabled])).toEqual([
			["apply", true],
			["archive", false],
		]);
		expect(card.actions[0]!.source).toBe(skillDescriptor);
		expect(card.actions[0]!.selection).toEqual(selection);
		expect(Object.isFrozen(card.actions[0]!.selection)).toBe(true);
		expect(card.actions[1]!.source).toBe(blocked);
		expect(card.actions[1]!.detail).toBe(
			"Implementation tasks are incomplete. Next step: Complete every tracked implementation task before archiving.",
		);
		expect(card.actions[0]).not.toHaveProperty("command");
	});

	it("renders only supplied catalog actions rather than action-looking card fields", () => {
		const snapshot = canonicalSnapshot();
		const sourceCard = snapshot.lanes.implementing[0] as (typeof snapshot.lanes.implementing)[number] & {
			actions: unknown[];
		};
		sourceCard.actions = [{ id: "forged", label: "Run arbitrary", enabled: true, command: "rm -rf /" }];
		const projected = projectCanonicalSnapshot(snapshot, "acme", "store acme", new Map());
		expect(projected.columns.find((column) => column.id === "implementing")!.cards[0]!.actions).toEqual([]);
	});
});

describe("action dispatch coordinator", () => {
	it("freshly validates and sends the exact rpiv-args-compatible skill invocation", async () => {
		const validate = vi.fn(async () => accepted(skillDescriptor));
		const sendUserMessage = vi.fn();
		const capabilities = { dispatch: vi.fn() };
		const refresh = vi.fn();
		const feedback: string[] = [];
		const coordinator = new ActionDispatchCoordinator({
			validate,
			conversation: { sendUserMessage },
			capabilities,
			refresh,
			feedback: ({ phase }) => feedback.push(phase),
		});

		await expect(coordinator.dispatch(selection)).resolves.toEqual({
			status: "accepted",
			route: "skill",
			actionId: "apply",
			refresh: { ok: true },
		});
		expect(validate).toHaveBeenCalledWith(selection);
		expect(sendUserMessage).toHaveBeenCalledWith("/skill:specbase-apply-change change-1 --store acme", {
			deliverAs: "followUp",
		});
		expect(capabilities.dispatch).not.toHaveBeenCalled();
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(feedback).toEqual(["validating", "dispatching", "accepted"]);
	});

	it("rejects stale, malformed, and mismatched selections before either side-effect port", async () => {
		const staleDiagnostic = {
			code: "direct_action_apply_complete",
			target: { storeId: "acme", workItemId: "change-1" },
			actionId: "apply",
			message: "All tracked implementation tasks are complete.",
			remediation: "Run review.",
		};
		const sendUserMessage = vi.fn();
		const dispatch = vi.fn();
		const refresh = vi.fn();

		for (const [value, validation] of [
			[selection, { accepted: false as const, descriptor: null, diagnostics: [staleDiagnostic] }],
			[
				{ ...selection, command: "rm -rf /" },
				{
					accepted: false as const,
					descriptor: null,
					diagnostics: [{ ...staleDiagnostic, code: "direct_action_intent_executable_field" }],
				},
			],
		] as const) {
			const validate = vi.fn(async () => validation);
			const coordinator = new ActionDispatchCoordinator({
				validate,
				conversation: { sendUserMessage },
				capabilities: { dispatch },
				refresh,
			});
			const outcome = await coordinator.dispatch(value);
			expect(outcome).toMatchObject({ status: "rejected", recoverable: true });
			expect(validate).toHaveBeenCalledWith(value);
		}

		const mismatched = { ...skillDescriptor, actionId: "review" };
		const coordinator = new ActionDispatchCoordinator({
			validate: vi.fn(async () => accepted(mismatched)),
			conversation: { sendUserMessage },
			capabilities: { dispatch },
			refresh,
		});
		await expect(coordinator.dispatch(selection)).resolves.toMatchObject({
			status: "rejected",
			reason: expect.stringContaining("mismatched"),
		});
		expect(sendUserMessage).not.toHaveBeenCalled();
		expect(dispatch).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("shares duplicate suppression across coordinators and rejects a moved source after validation", async () => {
		const pending = deferred<ReturnType<typeof accepted>>();
		const inFlight = new ActionInFlightRegistry();
		const firstSender = vi.fn();
		const first = new ActionDispatchCoordinator({
			validate: vi.fn(() => pending.promise),
			conversation: { sendUserMessage: firstSender },
			capabilities: { dispatch: vi.fn() },
			inFlight,
		});
		const second = new ActionDispatchCoordinator({
			validate: vi.fn(async () => accepted(skillDescriptor)),
			conversation: { sendUserMessage: vi.fn() },
			capabilities: { dispatch: vi.fn() },
			inFlight,
		});
		const firstRun = first.dispatch(selection);
		await expect(second.dispatch(selection)).resolves.toEqual({ status: "duplicate", actionId: "apply" });
		pending.resolve(accepted(skillDescriptor));
		await firstRun;
		expect(firstSender).toHaveBeenCalledTimes(1);

		const moved = new ActionDispatchCoordinator({
			validate: vi.fn(async () => accepted(skillDescriptor)),
			conversation: { sendUserMessage: vi.fn() },
			capabilities: { dispatch: vi.fn() },
			assertSource: vi.fn(async () => {
				throw new Error("registered store moved");
			}),
		});
		await expect(moved.dispatch(selection)).resolves.toMatchObject({
			status: "rejected",
			reason: expect.stringContaining("registered store moved"),
		});
	});

	it("suppresses a duplicate while the same immutable selection is in flight", async () => {
		const pending = deferred<ReturnType<typeof accepted>>();
		const validate = vi.fn(() => pending.promise);
		const sendUserMessage = vi.fn();
		const coordinator = new ActionDispatchCoordinator({
			validate,
			conversation: { sendUserMessage },
			capabilities: { dispatch: vi.fn() },
		});
		const first = coordinator.dispatch(selection);
		await expect(coordinator.dispatch(selection)).resolves.toEqual({ status: "duplicate", actionId: "apply" });
		expect(validate).toHaveBeenCalledTimes(1);
		pending.resolve(accepted(skillDescriptor));
		await first;
		expect(sendUserMessage).toHaveBeenCalledTimes(1);
	});

	it.each(["specbase.ready-to-review", "specbase.local-delivery", "specbase.draft-pr-delivery"] as const)(
		"passes the exact %s descriptor and immutable correlation to the injected registry",
		async (capabilityId) => {
			const descriptor = capabilityDescriptor(capabilityId);
			const capabilitySelection: DirectActionSelection = Object.freeze({
				...selection,
				actionId: descriptor.actionId,
				dispatchKind: "capability",
			});
			const registry = new CapabilityDispatcherRegistry();
			const handler = vi.fn(async (_request: CapabilityDispatchRequest) => ({
				accepted: true as const,
				runId: `run-${capabilityId}`,
			}));
			registry.register(capabilityId, handler);
			const refresh = vi.fn();
			const coordinator = new ActionDispatchCoordinator({
				validate: vi.fn(async () => accepted(descriptor)),
				conversation: { sendUserMessage: vi.fn() },
				capabilities: registry,
				refresh,
			});

			await expect(coordinator.dispatch(capabilitySelection)).resolves.toMatchObject({
				status: "accepted",
				route: "capability",
				runId: `run-${capabilityId}`,
			});
			const request = handler.mock.calls[0]![0];
			expect(request.descriptor).toBe(descriptor);
			expect(request.intent).toEqual(capabilitySelection);
			expect(Object.isFrozen(request.intent)).toBe(true);
			expect(request.trigger).toEqual({
				kind: "programmatic",
				source: "rpiv-specbase",
				meta: {
					catalogVersion: 2,
					storeId: "acme",
					workItemId: "change-1",
					actionId: descriptor.actionId,
					dispatchKind: "capability",
				},
			});
			expect(refresh).toHaveBeenCalledTimes(1);
		},
	);

	it.each([
		{ arguments: { changeId: "other-change", storeId: "acme" }, label: "change" },
		{ arguments: { changeId: "change-1", storeId: "other-store" }, label: "store" },
		{ arguments: { changeId: "change-1" }, label: "missing store" },
	])(
		"rejects a canonical capability descriptor whose $label identity differs from the card",
		async ({ arguments: args }) => {
			const base = capabilityDescriptor();
			const descriptor = { ...base, dispatch: { ...base.dispatch, arguments: args } } as DirectActionDescriptor;
			const capabilitySelection = { ...selection, actionId: base.actionId, dispatchKind: "capability" as const };
			const dispatch = vi.fn();
			const coordinator = new ActionDispatchCoordinator({
				validate: vi.fn(async () => accepted(descriptor)),
				conversation: { sendUserMessage: vi.fn() },
				capabilities: { dispatch },
			});
			await expect(coordinator.dispatch(capabilitySelection)).resolves.toMatchObject({
				status: "rejected",
				reason: expect.stringContaining("does not match"),
			});
			expect(dispatch).not.toHaveBeenCalled();
		},
	);

	it("keeps accepted dispatch accepted when refresh fails and skips refresh after dispatcher refusal", async () => {
		const descriptor = capabilityDescriptor();
		const capabilitySelection = { ...selection, actionId: descriptor.actionId, dispatchKind: "capability" as const };
		const acceptedRefresh = new ActionDispatchCoordinator({
			validate: vi.fn(async () => accepted(descriptor)),
			conversation: { sendUserMessage: vi.fn() },
			capabilities: { dispatch: vi.fn(async () => ({ accepted: true as const, runId: "run-1" })) },
			refresh: vi.fn(async () => {
				throw new Error("store unavailable");
			}),
		});
		await expect(acceptedRefresh.dispatch(capabilitySelection)).resolves.toMatchObject({
			status: "accepted",
			refresh: { ok: false, error: "store unavailable" },
		});

		const refresh = vi.fn();
		const refused = new ActionDispatchCoordinator({
			validate: vi.fn(async () => accepted(descriptor)),
			conversation: { sendUserMessage: vi.fn() },
			capabilities: { dispatch: vi.fn(async () => ({ accepted: false as const, reason: "approval missing" })) },
			refresh,
		});
		await expect(refused.dispatch(capabilitySelection)).resolves.toEqual({
			status: "rejected",
			actionId: "deliver-local",
			reason: "approval missing",
			recoverable: true,
		});
		expect(refresh).not.toHaveBeenCalled();
	});
});

describe("Pi integration", () => {
	it("reopens and freshly reloads after a stale rejection without dispatching", async () => {
		const { pi, captured } = createMockPi();
		const stale = {
			code: "direct_action_state_changed",
			target: { storeId: "acme", workItemId: "change-1" },
			actionId: "apply",
			message: "The planning store changed.",
			remediation: "Refresh and select the action again.",
		};
		const api = fakeApi({
			validate: vi.fn(async () => ({ accepted: false as const, descriptor: null, diagnostics: [stale] })),
		});
		const intents = [
			{ kind: "selected" as const, cardId: "change-1", actionId: "apply", selection },
			{ kind: "cancelled" as const },
		];
		const presentLive = vi.fn(async (_ctx, _sessions, source) => {
			await source.load();
			return intents.shift()!;
		});
		registerSpecbaseKanbanExtension(pi, vi.fn(), { loadApi: async () => api, presentLive });
		const command = captured.commands.get(KANBAN_COMMAND)!;
		await command.handler("--store acme", createMockCtx({ hasUI: true, mode: "tui" }) as never);

		expect(presentLive).toHaveBeenCalledTimes(2);
		expect(api.deriveKanbanBoard).toHaveBeenCalledTimes(2);
		expect(api.validateDirectActionIntent).toHaveBeenCalledTimes(1);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(pi.exec).not.toHaveBeenCalled();
	});

	it("rejects a selection that does not match the presented card and store", async () => {
		const { pi, captured } = createMockPi();
		const api = fakeApi();
		const mismatched = { ...selection, workItemId: "other-change" };
		const intents = [
			{ kind: "selected" as const, cardId: "change-1", actionId: "apply", selection: mismatched },
			{ kind: "cancelled" as const },
		];
		const presentLive = vi.fn(async () => intents.shift()!);
		registerSpecbaseKanbanExtension(pi, vi.fn(), { loadApi: async () => api, presentLive });
		const command = captured.commands.get(KANBAN_COMMAND)!;
		const ctx = createMockCtx({ hasUI: true, mode: "tui" });
		await command.handler("--store acme", ctx as never);
		expect(api.validateDirectActionIntent).not.toHaveBeenCalled();
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("presented card or store"), "warning");
	});

	it("closes the live overlay before sending a validated skill and performs no real side effects", async () => {
		const order: string[] = [];
		const { pi, captured } = createMockPi();
		vi.mocked(pi.sendUserMessage).mockImplementation(() => {
			order.push("pi-send");
		});
		const api = fakeApi();
		const presentLive = vi.fn(async () => {
			order.push("overlay-closed");
			return { kind: "selected" as const, cardId: "change-1", actionId: "apply", selection };
		});
		registerSpecbaseKanbanExtension(pi, vi.fn(), { loadApi: async () => api, presentLive });
		const command = captured.commands.get(KANBAN_COMMAND)!;
		await command.handler("--store acme", createMockCtx({ hasUI: true, mode: "tui" }) as never);

		expect(order.slice(0, 2)).toEqual(["overlay-closed", "pi-send"]);
		expect(pi.sendUserMessage).toHaveBeenCalledWith("/skill:specbase-apply-change change-1 --store acme", {
			deliverAs: "followUp",
		});
		expect(pi.exec).not.toHaveBeenCalled();
		expect(api.validateDirectActionIntent).toHaveBeenCalledWith(selection, { root: "/stores/acme" });
		expect(api.resolveRegisteredStore).toHaveBeenCalled();
	});
});
