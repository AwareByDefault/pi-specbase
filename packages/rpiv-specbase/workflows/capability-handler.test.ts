import { mkdtempSync, rmSync } from "node:fs";
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

import { deliveryLeasePath, readDeliveryLease } from "./lease.js";
import { __resetSpecbaseLocalDeliveryRegistration, createLocalDeliveryCapabilityHandler } from "./register.js";

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
		version: 4,
		storeId: "acme",
		workItemId: "change-1",
		actionId: "deliver-local",
		dispatchKind: "capability" as const,
	},
	trigger: {
		kind: "programmatic" as const,
		source: "rpiv-specbase" as const,
		meta: {
			catalogVersion: 4,
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

describe("specbase.local-delivery capability handler", () => {
	it("starts the built-in programmatically and preserves exact correlation metadata", async () => {
		const cwd = root();
		mocks.runWorkflowByName.mockImplementation(async (_ctx, name, input, options) => {
			options.lifecycle.onWorkflowStart({ runId: "run-123" });
			expect(name).toBe("specbase-local-delivery");
			expect(JSON.parse(input)).toMatchObject({
				authorization: {
					catalogVersion: 4,
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
