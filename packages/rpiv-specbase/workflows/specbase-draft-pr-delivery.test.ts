import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateWorkflow } from "@juicesharp/rpiv-workflow/registration";
import { describe, expect, it } from "vitest";
import { DRAFT_PR_MAX_FIXES, DRAFT_PR_WORKFLOW_NAME } from "./draft-pr-contracts.js";
import { specbaseDraftPrWorkflow } from "./specbase-draft-pr-delivery.js";

const targets = (edge: unknown): readonly string[] =>
	typeof edge === "function" ? ((edge as { targets?: readonly string[] }).targets ?? []) : [String(edge)];

describe("specbase-draft-pr-delivery workflow contract", () => {
	it("validates typed preflight, panel, remote, PR, and canonical observation stages", () => {
		expect(specbaseDraftPrWorkflow.name).toBe(DRAFT_PR_WORKFLOW_NAME);
		expect(validateWorkflow(specbaseDraftPrWorkflow).filter((issue) => issue.severity === "error")).toEqual([]);
		for (const stage of [
			"capture",
			"preflight-gate",
			"panel-disposition",
			"restore-panel-footprint",
			"fix-gate",
			"final-gate",
			"push",
			"ensure-draft-pr",
			"record-pr",
		]) {
			expect(specbaseDraftPrWorkflow.stages[stage]?.outputSchema).toBeDefined();
		}
	});

	it("delegates to the generated panel and has exactly one continuation materializer", () => {
		expect(specbaseDraftPrWorkflow.stages["review-panel"]).toMatchObject({
			skill: "specbase-review-panel",
			sessionPolicy: "fresh",
		});
		expect(specbaseDraftPrWorkflow.stages["panel-disposition"]).toMatchObject({
			sessionPolicy: "continue",
		});
		expect(
			Object.values(specbaseDraftPrWorkflow.stages).filter((stage) => stage.sessionPolicy === "continue"),
		).toHaveLength(1);
	});

	it("bounds local fixes and forces fix commits back through the panel", () => {
		expect(DRAFT_PR_MAX_FIXES).toBe(2);
		expect(specbaseDraftPrWorkflow.edges["panel-disposition"]).toBe("restore-panel-footprint");
		expect(targets(specbaseDraftPrWorkflow.edges["restore-panel-footprint"])).toEqual(
			expect.arrayContaining(["final-gate", "panel-local-fix", "stop-replan", "stop-fix-budget"]),
		);
		expect(specbaseDraftPrWorkflow.edges["panel-local-fix"]).toBe("fix-gate");
		expect(specbaseDraftPrWorkflow.edges["commit-fix"]).toBe("verify-fix-commit");
		expect(targets(specbaseDraftPrWorkflow.edges["verify-fix-commit"])).toEqual(
			expect.arrayContaining(["review-panel", "stop-fix-commit"]),
		);
	});

	it("requires final gate before exact push, draft PR, canonical record, and Reviewing observation", () => {
		expect(targets(specbaseDraftPrWorkflow.edges["final-gate"])).toEqual(
			expect.arrayContaining(["push", "stop-final-gate"]),
		);
		expect(targets(specbaseDraftPrWorkflow.edges.push)).toEqual(
			expect.arrayContaining(["ensure-draft-pr", "stop-push"]),
		);
		expect(specbaseDraftPrWorkflow.edges["ensure-draft-pr"]).toBe("record-pr");
		expect(targets(specbaseDraftPrWorkflow.edges["record-pr"])).toEqual(
			expect.arrayContaining(["complete", "stop-record"]),
		);
	});

	it("contains no force, merge, ready, archive, deletion, or successor operation", () => {
		const source = readFileSync(fileURLToPath(new URL("./specbase-draft-pr-delivery.ts", import.meta.url)), "utf8");
		expect(source).not.toMatch(
			/force-with-lease|--force|\bmerge\b|ready-for-review|branch deletion|specbase-archive|successor/iu,
		);
	});
});
