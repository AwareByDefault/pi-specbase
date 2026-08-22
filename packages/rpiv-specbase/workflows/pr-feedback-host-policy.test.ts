import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertLocalDeliveryCommand,
	resolveWorkflowChildToolPolicy,
	SPECBASE_PR_FEEDBACK_WORKFLOW,
} from "../../rpiv-pi/extensions/rpiv-core/local-delivery-tool-policy.js";

const roots: string[] = [];
const root = () => {
	const value = mkdtempSync(join(tmpdir(), "pr-feedback-policy-"));
	roots.push(value);
	return value;
};
afterEach(() => {
	for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

async function editWithFeedbackPhase(
	cwd: string,
	ownerId: string,
	prompt: string,
	path: string,
	oldText: string,
	newText: string,
): Promise<void> {
	const policy = resolveWorkflowChildToolPolicy(SPECBASE_PR_FEEDBACK_WORKFLOW, JSON.stringify({ ownerId }), cwd)!;
	const tool = policy.createToolDefinitions(cwd, prompt).find((candidate) => candidate.name === "edit")!;
	await tool.execute("edit", { path, edits: [{ oldText, newText }] }, undefined, undefined, {} as never);
}

describe("PR feedback host policy", () => {
	it("permits declared local evidence commands but rejects network, credentials, force, lifecycle escalation, and Git injection flags", () => {
		const policy = resolveWorkflowChildToolPolicy(
			SPECBASE_PR_FEEDBACK_WORKFLOW,
			JSON.stringify({ ownerId: "owner" }),
			root(),
		);
		expect(policy?.allowedToolNames).toEqual(expect.arrayContaining(["read", "grep", "ls", "bash", "edit", "write"]));
		expect(policy?.excludedToolNames).toEqual(
			expect.arrayContaining(["browser", "mcp", "web_fetch", "gh", "github"]),
		);
		expect(() => assertLocalDeliveryCommand("npm test -- focused.test.ts")).not.toThrow();
		for (const command of [
			"git status --output=/tmp/status",
			"git -c core.hooksPath=/tmp status",
			"curl https://example.test",
			"gh pr merge 1",
			"git push --force",
			"specbase archive",
			"git commit -m bad",
			"npm test; gh api /user",
		]) {
			expect(() => assertLocalDeliveryCommand(command)).toThrow();
		}
	});

	it("loads only the UUID-owned frozen classification scope before permitting feedback mutations", async () => {
		const cwd = root();
		const ownerId = "123e4567-e89b-42d3-a456-426614174000";
		const owner = join(cwd, ".rpiv", "artifacts", "specbase-pr-feedback", ownerId);
		mkdirSync(owner, { recursive: true });
		mkdirSync(join(cwd, "test"), { recursive: true });
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specbase", "changes", "change"), { recursive: true });
		writeFileSync(join(cwd, "test", "feedback.test.ts"), "RED\n");
		writeFileSync(join(cwd, "src", "repair.ts"), "before\n");
		writeFileSync(join(cwd, "specbase", "changes", "change", "tasks.md"), "- [ ] task\n");
		writeFileSync(
			join(owner, "classification.json"),
			JSON.stringify({ ownerId, evidencePaths: ["test/feedback.test.ts"], productionPaths: ["src"] }),
		);

		await editWithFeedbackPhase(
			cwd,
			ownerId,
			"specbase-pr-feedback-author-red",
			"test/feedback.test.ts",
			"RED",
			"RED changed",
		);
		expect(readFileSync(join(cwd, "test", "feedback.test.ts"), "utf8")).toContain("RED changed");
		await expect(
			editWithFeedbackPhase(cwd, ownerId, "specbase-pr-feedback-author-red", "src/repair.ts", "before", "bad"),
		).rejects.toThrow(/undeclared feedback evidence/iu);
		await editWithFeedbackPhase(
			cwd,
			ownerId,
			"specbase-pr-feedback-implement-green",
			"src/repair.ts",
			"before",
			"after",
		);
		await expect(
			editWithFeedbackPhase(
				cwd,
				ownerId,
				"specbase-pr-feedback-implement-green",
				"test/feedback.test.ts",
				"RED",
				"weakened",
			),
		).rejects.toThrow(/frozen feedback evidence/iu);
		await expect(
			editWithFeedbackPhase(
				cwd,
				ownerId,
				"specbase-pr-feedback-implement-green",
				"specbase/changes/change/tasks.md",
				"- [ ] task",
				"- [x] task",
			),
		).rejects.toThrow(/frozen planning artifact/iu);
		await expect(
			editWithFeedbackPhase(
				cwd,
				"not-a-uuid",
				"specbase-pr-feedback-implement-green",
				"src/repair.ts",
				"after",
				"bad",
			),
		).rejects.toThrow(/path outside frozen feedback production scope/iu);
	});
});
