import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateWorkflow } from "@juicesharp/rpiv-workflow/registration";
import { describe, expect, it } from "vitest";
import {
	LOCAL_DELIVERY_MAX_LOCAL_FIXES,
	LOCAL_DELIVERY_MAX_REMEDIATIONS,
	LOCAL_DELIVERY_SKILLS,
	LOCAL_DELIVERY_WORKFLOW_NAME,
} from "./contracts.js";
import { LOCAL_DELIVERY_SKILL_CONTRACTS } from "./register.js";
import { specbaseLocalDeliveryWorkflow } from "./specbase-local-delivery.js";

const targets = (edge: unknown): readonly string[] =>
	typeof edge === "function" ? ((edge as { targets?: readonly string[] }).targets ?? []) : [String(edge)];

function reachableStages(): Set<string> {
	const seen = new Set<string>();
	const queue = [specbaseLocalDeliveryWorkflow.start];
	while (queue.length) {
		const stage = queue.shift()!;
		if (stage === "stop" || seen.has(stage)) continue;
		seen.add(stage);
		for (const target of targets(specbaseLocalDeliveryWorkflow.edges[stage])) {
			if (target !== "stop") queue.push(target);
		}
	}
	return seen;
}

describe("specbase-local-delivery workflow contract", () => {
	it("is validated before export and declares typed stop-safe routes", () => {
		expect(specbaseLocalDeliveryWorkflow.name).toBe(LOCAL_DELIVERY_WORKFLOW_NAME);
		expect(specbaseLocalDeliveryWorkflow.resume?.before).toBeTypeOf("function");
		expect(specbaseLocalDeliveryWorkflow.resume?.after).toBeTypeOf("function");
		expect(validateWorkflow(specbaseLocalDeliveryWorkflow).filter((issue) => issue.severity === "error")).toEqual([]);
		for (const stage of ["capture", "readiness", "local-gate", "local-review", "final-local-gate"]) {
			expect(specbaseLocalDeliveryWorkflow.stages[stage]?.outputSchema).toBeDefined();
		}
		expect(targets(specbaseLocalDeliveryWorkflow.edges.readiness)).toEqual(
			expect.arrayContaining(["implement-evidence", "stop-blocked", "stop-replan"]),
		);
		expect(targets(specbaseLocalDeliveryWorkflow.edges["final-local-gate"])).toEqual(
			expect.arrayContaining(["complete", "stop-final-failed"]),
		);
	});

	it("serializes both mutation fan-outs and orders evidence before tasks", () => {
		const evidence = specbaseLocalDeliveryWorkflow.stages["implement-evidence"]!;
		const task = specbaseLocalDeliveryWorkflow.stages["implement-task"]!;
		expect(evidence.loop).toMatchObject({ kind: "fanout", concurrency: 1, failFast: true });
		expect(task.loop).toMatchObject({ kind: "fanout", concurrency: 1, failFast: true });
		expect(specbaseLocalDeliveryWorkflow.edges["implement-evidence"]).toBe("implement-task");
		expect(specbaseLocalDeliveryWorkflow.edges["implement-task"]).toBe("local-gate");
	});

	it("has bounded repair back edges and forces every fix through the gate", () => {
		expect(LOCAL_DELIVERY_MAX_REMEDIATIONS).toBeGreaterThan(0);
		expect(LOCAL_DELIVERY_MAX_LOCAL_FIXES).toBeGreaterThan(0);
		expect(specbaseLocalDeliveryWorkflow.edges.remediate).toBe("local-gate");
		expect(specbaseLocalDeliveryWorkflow.edges["local-fix"]).toBe("local-gate");
		expect(targets(specbaseLocalDeliveryWorkflow.edges["local-gate"])).toEqual(
			expect.arrayContaining(["local-review", "remediate", "stop-remediation-budget"]),
		);
		expect(targets(specbaseLocalDeliveryWorkflow.edges["local-review"])).toEqual(
			expect.arrayContaining(["local-commit", "local-fix", "stop-local-fix-budget"]),
		);
	});

	it("declares every workflow-only skill handoff in both graph and contract registry", () => {
		const registered = new Map(LOCAL_DELIVERY_SKILL_CONTRACTS);
		for (const skill of Object.values(LOCAL_DELIVERY_SKILLS)) {
			expect(registered.has(skill)).toBe(true);
		}
		expect(registered.get(LOCAL_DELIVERY_SKILLS.readiness)?.produces?.data).toBeDefined();
		expect(registered.get(LOCAL_DELIVERY_SKILLS.review)?.produces?.data).toBeDefined();
		expect(registered.get(LOCAL_DELIVERY_SKILLS.commit)?.produces?.meta).toMatchObject({ effect: "git-commit" });
	});

	it("has no reachable remote, panel, archive, or successor graph path", () => {
		const reachable = [...reachableStages()];
		expect(reachable).toContain("complete");
		expect(reachable.join(" ")).not.toMatch(/push|pull-request|github|review-panel|archive|successor/iu);
		const source = readFileSync(fileURLToPath(new URL("./specbase-local-delivery.ts", import.meta.url)), "utf8");
		expect(source).not.toMatch(/skill:\s*["']?(?:specbase-review-panel|specbase-archive|successor)/iu);
	});
});
