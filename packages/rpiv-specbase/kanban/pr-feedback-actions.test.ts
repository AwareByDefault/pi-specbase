import { describe, expect, it, vi } from "vitest";
import {
	ActionDispatchCoordinator,
	CapabilityDispatcherRegistry,
	type CapabilityDispatchRequest,
	canonicalSkillInvocation,
	type DirectActionDescriptor,
	type DirectActionSelection,
} from "./action-dispatch.js";

const pullRequest = {
	number: 42,
	url: "https://github.com/acme/widget/pull/42",
	repository: "acme/widget",
	base: "main",
	head: "feature/change-1",
	headSha: "a".repeat(40),
	runId: "delivery-run",
	state: "ready",
};

const selection: DirectActionSelection = {
	version: 2,
	storeId: "acme",
	workItemId: "change-1",
	actionId: "pr-feedback",
	dispatchKind: "capability",
};

const feedbackDescriptor = {
	actionId: "pr-feedback",
	label: "Address pull-request feedback",
	availability: "available",
	blocker: null,
	dispatch: {
		kind: "capability",
		capabilityId: "specbase.pr-feedback",
		arguments: { changeId: "change-1", storeId: "acme", pullRequest },
	},
} as unknown as DirectActionDescriptor;

describe("Reviewing PR feedback actions", () => {
	it("dispatches exact PR feedback identity through only the registered canonical capability", async () => {
		const registry = new CapabilityDispatcherRegistry();
		const handler = vi.fn(async (_request: CapabilityDispatchRequest) => ({
			accepted: true as const,
			runId: "feedback-run",
		}));
		registry.register("specbase.pr-feedback" as never, handler);
		const coordinator = new ActionDispatchCoordinator({
			validate: vi.fn(async () => ({
				accepted: true as const,
				descriptor: feedbackDescriptor,
				diagnostics: [] as const,
			})),
			conversation: { sendUserMessage: vi.fn() },
			capabilities: registry,
		});
		await expect(coordinator.dispatch(selection)).resolves.toMatchObject({
			status: "accepted",
			route: "capability",
			runId: "feedback-run",
		});
		const request = handler.mock.calls[0]![0];
		expect(request.descriptor.dispatch).toEqual(feedbackDescriptor.dispatch);
		expect(request.intent).toEqual(selection);
	});

	it("serializes immutable pull-request context into the conversational Explore invocation", () => {
		const invocation = canonicalSkillInvocation({
			kind: "skill",
			skillId: "specbase-explore",
			arguments: { workItemId: "change-1", storeId: "acme", pullRequest },
		});
		expect(invocation).toContain("/skill:specbase-explore change-1");
		expect(invocation).toContain("--pull-request");
		expect(invocation).toContain("acme/widget");
		expect(invocation).toContain(pullRequest.headSha);
	});

	it("keeps Archive a separate conversational action", () => {
		expect(
			canonicalSkillInvocation({
				kind: "skill",
				skillId: "specbase-archive-change",
				arguments: { changeId: "change-1", storeId: "acme" },
			}),
		).toBe("/skill:specbase-archive-change change-1 --store acme");
	});
});
