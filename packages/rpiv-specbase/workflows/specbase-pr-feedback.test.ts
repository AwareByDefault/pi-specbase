import { validateWorkflow } from "@juicesharp/rpiv-workflow/registration";
import { describe, expect, it } from "vitest";
import { PR_FEEDBACK_WORKFLOW_NAME } from "./pr-feedback-contracts.js";
import { validatedSpecbasePrFeedbackWorkflow } from "./specbase-pr-feedback.js";

describe("specbase PR feedback workflow", () => {
	it("validates a bounded graph with no lifecycle-escalating path", () => {
		const workflow = validatedSpecbasePrFeedbackWorkflow();
		expect(workflow.name).toBe(PR_FEEDBACK_WORKFLOW_NAME);
		expect(validateWorkflow(workflow).filter((issue) => issue.severity === "error")).toEqual([]);
		const names = [...Object.keys(workflow.stages), ...Object.keys(workflow.edges)].join(" ");
		expect(names).not.toMatch(/merge|archive|approval|ready|successor/iu);
		expect(Object.keys(workflow.stages)).toEqual(
			expect.arrayContaining(["capture", "classify", "re-observe", "complete"]),
		);
	});
});
