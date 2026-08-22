import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	runWorkflowByName: vi.fn(),
	readLastStage: vi.fn(),
	registerBuiltInsProvider: vi.fn(),
	registerBuiltIns: vi.fn(),
	registerSkillContractsProvider: vi.fn(),
	registerSkillContracts: vi.fn(),
}));

vi.mock("@juicesharp/rpiv-workflow/startup", () => ({
	registerBuiltInsProvider: mocks.registerBuiltInsProvider,
	registerBuiltIns: mocks.registerBuiltIns,
	registerSkillContractsProvider: mocks.registerSkillContractsProvider,
	registerSkillContracts: mocks.registerSkillContracts,
}));
vi.mock("@juicesharp/rpiv-workflow", async (importOriginal) => ({
	...(await importOriginal<typeof import("@juicesharp/rpiv-workflow")>()),
	runWorkflowByName: mocks.runWorkflowByName,
	readLastStage: mocks.readLastStage,
}));

import {
	resolveWorkflowChildToolPolicy,
	SPECBASE_READY_TO_REVIEW_WORKFLOW,
} from "../../rpiv-pi/extensions/rpiv-core/local-delivery-tool-policy.js";
import { deliveryLeasePath, readDeliveryLease } from "./lease.js";
import {
	__resetSpecbaseLocalDeliveryRegistration,
	createDraftPrCapabilityHandler,
	createLocalDeliveryCapabilityHandler,
	createReadyToReviewCapabilityHandler,
	createSpecbaseCapabilityDispatcher,
} from "./register.js";

const roots: string[] = [];
const root = () => {
	const path = mkdtempSync(join(tmpdir(), "rpiv-specbase-capability-"));
	roots.push(path);
	return path;
};

const request = {
	descriptor: {
		actionId: "deliver-local",
		label: "Deliver locally",
		availability: "available" as const,
		blocker: null,
		dispatch: {
			kind: "capability" as const,
			capabilityId: "specbase.local-delivery" as const,
			arguments: { changeId: "change-1", storeId: "acme" },
		},
	},
	intent: {
		version: 2,
		storeId: "acme",
		workItemId: "change-1",
		actionId: "deliver-local",
		dispatchKind: "capability" as const,
	},
	trigger: {
		kind: "programmatic" as const,
		source: "rpiv-specbase" as const,
		meta: {
			catalogVersion: 2,
			storeId: "acme",
			workItemId: "change-1",
			actionId: "deliver-local",
			dispatchKind: "capability" as const,
		},
	},
};

beforeEach(() => {
	__resetSpecbaseLocalDeliveryRegistration();
	for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(() => {
	for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function editWithPhase(
	cwd: string,
	ownerId: string,
	prompt: string,
	path: string,
	oldText: string,
	newText: string,
): Promise<void> {
	const policy = resolveWorkflowChildToolPolicy(SPECBASE_READY_TO_REVIEW_WORKFLOW, JSON.stringify({ ownerId }), cwd)!;
	const tool = policy.createToolDefinitions(cwd, prompt).find((candidate) => candidate.name === "edit")!;
	await tool.execute("edit", { path, edits: [{ oldText, newText }] }, undefined, undefined, {} as never);
}

describe("specbase.ready-to-review phase policy", () => {
	it("confines evidence, implementation, and read-only children to their host-owned mutation phases", async () => {
		const cwd = root();
		const ownerId = "owner-phase";
		const ownerDir = join(cwd, ".rpiv", "artifacts", "specbase-ready-to-review", ownerId);
		mkdirSync(ownerDir, { recursive: true });
		mkdirSync(join(cwd, "test"), { recursive: true });
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specbase", "changes", "change-1"), { recursive: true });
		writeFileSync(join(cwd, "test", "evidence.test.ts"), "RED\n");
		writeFileSync(join(cwd, "src", "implementation.ts"), "before\n");
		writeFileSync(join(cwd, "specbase", "changes", "change-1", "tasks.md"), "- [ ] task\n");
		const deliveryPath = join(ownerDir, "delivery-context.json");
		writeFileSync(deliveryPath, JSON.stringify({ evidenceUnits: [{ paths: ["test/evidence.test.ts"] }] }));
		writeFileSync(
			join(ownerDir, "ready-context.json"),
			JSON.stringify({ deliveryContextPath: deliveryPath, productionRoots: ["src"] }),
		);
		const policy = resolveWorkflowChildToolPolicy(
			SPECBASE_READY_TO_REVIEW_WORKFLOW,
			JSON.stringify({ ownerId }),
			cwd,
		)!;
		expect(policy.allowedToolNamesForPrompt?.("specbase-implement-green")).not.toContain("Agent");
		expect(policy.allowedToolNamesForPrompt?.("specbase-review-panel")).toContain("Agent");

		await editWithPhase(cwd, ownerId, "specbase-author-red-evidence", "test/evidence.test.ts", "RED", "RED changed");
		expect(readFileSync(join(cwd, "test", "evidence.test.ts"), "utf8")).toContain("RED changed");
		await expect(
			editWithPhase(cwd, ownerId, "specbase-author-red-evidence", "src/implementation.ts", "before", "bad"),
		).rejects.toThrow(/undeclared evidence mutation/iu);

		await editWithPhase(cwd, ownerId, "specbase-implement-green", "src/implementation.ts", "before", "after");
		await expect(
			editWithPhase(cwd, ownerId, "specbase-implement-green", "test/evidence.test.ts", "RED", "weakened"),
		).rejects.toThrow(/frozen evidence mutation/iu);
		await expect(
			editWithPhase(
				cwd,
				ownerId,
				"specbase-implement-green",
				"specbase/changes/change-1/tasks.md",
				"- [ ] task",
				"- [x] task",
			),
		).rejects.toThrow(/frozen planning artifact mutation/iu);
		await expect(
			editWithPhase(cwd, ownerId, "specbase-review-panel", "src/implementation.ts", "after", "bad"),
		).rejects.toThrow(/panel metadata-only mutation/iu);
	});
});

describe("current Specbase capability dispatcher", () => {
	it("registers only the canonical ready-to-review capability and rejects legacy board dispatch", async () => {
		const cwd = root();
		const dispatcher = createSpecbaseCapabilityDispatcher({} as never, { cwd } as never, cwd);
		await expect(dispatcher.dispatch(request)).resolves.toEqual({
			accepted: false,
			reason: "No dispatcher is registered for capability 'specbase.local-delivery'.",
		});
		expect(mocks.runWorkflowByName).not.toHaveBeenCalled();
	});
});

describe("specbase.local-delivery capability handler", () => {
	it("starts the built-in programmatically and preserves exact correlation metadata", async () => {
		const cwd = root();
		mocks.runWorkflowByName.mockImplementation(async (_ctx, name, input, options) => {
			options.lifecycle.onWorkflowStart({ runId: "run-123" });
			expect(name).toBe("specbase-local-delivery");
			expect(JSON.parse(input)).toMatchObject({
				authorization: {
					catalogVersion: 2,
					actionId: "deliver-local",
					changeId: "change-1",
					storeId: "acme",
					root: cwd,
				},
			});
			expect(options.trigger).toBe(request.trigger);
			return { runId: "run-123", success: true, stagesCompleted: 1, termination: "completed" };
		});
		const pi = {} as never;
		const ctx = { cwd: "/launcher", hasUI: true } as never;
		const result = await createLocalDeliveryCapabilityHandler(pi, ctx, cwd)(request);
		expect(result).toEqual({ accepted: true, runId: "run-123" });
		expect(mocks.runWorkflowByName.mock.calls[0][0]).toMatchObject({ cwd });
		await vi.waitFor(() =>
			expect(
				readDeliveryLease(deliveryLeasePath({ root: cwd, storeId: "acme", changeId: "change-1" })),
			).toBeUndefined(),
		);
	});

	it("refuses a no-run preflight failure and releases the lease", async () => {
		const cwd = root();
		mocks.runWorkflowByName.mockResolvedValue({ success: false, stagesCompleted: 0, error: "workflow unavailable" });
		const result = await createLocalDeliveryCapabilityHandler({} as never, { cwd } as never, cwd)(request);
		expect(result).toEqual({ accepted: false, reason: "workflow unavailable" });
		expect(
			readDeliveryLease(deliveryLeasePath({ root: cwd, storeId: "acme", changeId: "change-1" })),
		).toBeUndefined();
	});
});

describe("specbase.ready-to-review capability handler", () => {
	it("launches the single canonical delivery workflow with the exact fresh action", async () => {
		const cwd = root();
		const readyRequest = {
			...request,
			descriptor: {
				...request.descriptor,
				actionId: "ready-to-review",
				dispatch: {
					kind: "capability" as const,
					capabilityId: "specbase.ready-to-review" as const,
					arguments: { changeId: "change-1", storeId: "acme" },
				},
			},
			intent: { ...request.intent, actionId: "ready-to-review" },
			trigger: { ...request.trigger, meta: { ...request.trigger.meta, actionId: "ready-to-review" } },
		};
		mocks.runWorkflowByName.mockImplementation(async (_ctx, name, input, options) => {
			options.lifecycle.onWorkflowStart({ runId: "ready-run" });
			expect(name).toBe("specbase-ready-to-review");
			expect(JSON.parse(input)).toMatchObject({
				authorization: {
					capabilityId: "specbase.ready-to-review",
					actionId: "ready-to-review",
					changeId: "change-1",
					root: cwd,
				},
			});
			return { runId: "ready-run", success: true, stagesCompleted: 1, termination: "completed" };
		});
		await expect(
			createReadyToReviewCapabilityHandler({} as never, { cwd } as never, cwd)(readyRequest),
		).resolves.toEqual({ accepted: true, runId: "ready-run" });
	});
});

describe("specbase.draft-pr-delivery capability handler", () => {
	it("launches the separate remote workflow with exact correlation", async () => {
		const cwd = root();
		const draftRequest = {
			...request,
			descriptor: {
				...request.descriptor,
				actionId: "open-draft-pr",
				dispatch: {
					kind: "capability" as const,
					capabilityId: "specbase.draft-pr-delivery" as const,
					arguments: { changeId: "change-1", storeId: "acme" },
				},
			},
			intent: { ...request.intent, actionId: "open-draft-pr" },
			trigger: { ...request.trigger, meta: { ...request.trigger.meta, actionId: "open-draft-pr" } },
		};
		mocks.runWorkflowByName.mockImplementation(async (_ctx, name, input, options) => {
			options.lifecycle.onWorkflowStart({ runId: "draft-run" });
			expect(name).toBe("specbase-draft-pr-delivery");
			expect(JSON.parse(input)).toMatchObject({
				authorization: { capabilityId: "specbase.draft-pr-delivery", changeId: "change-1", root: cwd },
			});
			return { runId: "draft-run", success: true, stagesCompleted: 1, termination: "completed" };
		});
		await expect(createDraftPrCapabilityHandler({} as never, { cwd } as never, cwd)(draftRequest)).resolves.toEqual({
			accepted: true,
			runId: "draft-run",
		});
	});
});
