import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflow } from "@juicesharp/rpiv-workflow/registration";
import { afterEach, describe, expect, it } from "vitest";
import {
	LOCAL_DELIVERY_MAX_LOCAL_FIXES,
	LOCAL_DELIVERY_MAX_REMEDIATIONS,
	LOCAL_DELIVERY_SKILLS,
	LOCAL_DELIVERY_WORKFLOW_NAME,
} from "./contracts.js";
import { READY_TO_REVIEW_WORKFLOW_NAME, type ReadyContext } from "./ready-to-review-contracts.js";
import {
	assertPublishableHead,
	attestPublicationCandidate,
	markRefactorSkipped,
	recordCheckpoint,
	verifyCheckpointJournal,
} from "./ready-to-review-delivery.js";
import { LOCAL_DELIVERY_SKILL_CONTRACTS } from "./register.js";
import { specbaseLocalDeliveryWorkflow } from "./specbase-local-delivery.js";
import { specbaseReadyToReviewWorkflow } from "./specbase-ready-to-review.js";

const targets = (edge: unknown): readonly string[] =>
	typeof edge === "function" ? ((edge as { targets?: readonly string[] }).targets ?? []) : [String(edge)];

const roots: string[] = [];
const git = (root: string, ...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function repository(): string {
	const root = mkdtempSync(join(tmpdir(), "ready-checkpoints-"));
	roots.push(root);
	git(root, "init", "-q");
	git(root, "config", "user.name", "Test");
	git(root, "config", "user.email", "test@example.com");
	writeFileSync(join(root, "base.txt"), "base\n");
	writeFileSync(join(root, ".gitignore"), ".rpiv/\n");
	git(root, "add", "base.txt", ".gitignore");
	git(root, "commit", "-qm", "base");
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

describe("specbase-ready-to-review workflow contract", () => {
	it("validates the bounded review, RED, GREEN, panel, and ready-result route", () => {
		expect(specbaseReadyToReviewWorkflow.name).toBe(READY_TO_REVIEW_WORKFLOW_NAME);
		expect(validateWorkflow(specbaseReadyToReviewWorkflow).filter((issue) => issue.severity === "error")).toEqual([]);
		for (const stage of [
			"capture",
			"spec-review",
			"author-evidence",
			"verify-red",
			"commit-red",
			"implementation",
			"verify-green",
			"commit-green",
			"refactor-decision",
			"gate",
			"panel",
			"remote-preflight",
			"push",
			"ensure-ready-pr",
			"record-ready-result",
		])
			expect(specbaseReadyToReviewWorkflow.stages[stage]).toBeDefined();
		expect(targets(specbaseReadyToReviewWorkflow.edges["verify-red"])).toEqual(
			expect.arrayContaining(["commit-red", "stop-red"]),
		);
		expect(targets(specbaseReadyToReviewWorkflow.edges["remote-preflight"])).toEqual(
			expect.arrayContaining(["push", "stop-remote"]),
		);
	});

	it("requires an evidence-only RED parent before GREEN and current-head gate/panel attestations before push", () => {
		const root = repository();
		const startHead = git(root, "rev-parse", "HEAD");
		const ownerId = "owner-checkpoints";
		const journalPath = join(root, ".rpiv", "artifacts", "checkpoint-journal.json");
		mkdirSync(join(root, ".rpiv", "artifacts"), { recursive: true });
		writeFileSync(journalPath, `${JSON.stringify({ version: 1, ownerId, startHead }, null, 2)}\n`);
		const context: ReadyContext = {
			version: 1,
			ownerId,
			runId: "run-checkpoints",
			authorization: {
				catalogVersion: 2,
				actionId: "ready-to-review",
				capabilityId: "specbase.ready-to-review",
				changeId: "change-1",
				storeId: null,
				root,
			},
			startHead,
			deliveryContextPath: join(root, "delivery-context.json"),
			productionRoots: ["implementation.ts"],
			journalPath,
		};

		writeFileSync(join(root, "evidence.test.ts"), "expect(missing()).toBe(true);\n");
		git(root, "add", "evidence.test.ts");
		git(root, "commit", "-qm", "RED");
		const red = git(root, "rev-parse", "HEAD");
		recordCheckpoint(context, "red", {
			sha: red,
			parent: startHead,
			paths: ["evidence.test.ts"],
			commands: [{ id: "evidence", passed: false, exitCode: 1, summary: "missing behavior" }],
		});
		expect(() => assertPublishableHead(context)).toThrow(/green gate and panel/iu);

		writeFileSync(join(root, "implementation.ts"), "export const missing = () => true;\n");
		git(root, "add", "implementation.ts");
		git(root, "commit", "-qm", "GREEN");
		const green = git(root, "rev-parse", "HEAD");
		recordCheckpoint(context, "green", {
			sha: green,
			parent: red,
			paths: ["implementation.ts"],
			commands: [{ id: "evidence", passed: true, exitCode: 0, summary: "pass" }],
		});
		markRefactorSkipped(context);
		attestPublicationCandidate(
			context,
			{
				verdict: "pass",
				journal: verifyCheckpointJournal(context),
				paths: ["implementation.ts"],
				commands: [{ id: "evidence", passed: true, exitCode: 0, summary: "pass" }],
				reason: null,
			},
			{ disposition: "clean", report: "clean", findings: [] },
		);
		expect(assertPublishableHead(context)).toBe(green);
		expect(verifyCheckpointJournal(context).green?.parent).toBe(red);
		const tampered = JSON.parse(readFileSync(journalPath, "utf8")) as {
			green: { commands: Array<{ summary: string }> };
		};
		tampered.green.commands[0]!.summary = "tampered";
		writeFileSync(journalPath, `${JSON.stringify(tampered, null, 2)}\n`);
		expect(() => verifyCheckpointJournal(context)).toThrow(/fingerprint drift/iu);
	});

	describe("legacy local delivery recovery workflow", () => {
		it("is validated before export and declares typed stop-safe routes", () => {
			expect(specbaseLocalDeliveryWorkflow.name).toBe(LOCAL_DELIVERY_WORKFLOW_NAME);
			expect(specbaseLocalDeliveryWorkflow.resume?.before).toBeTypeOf("function");
			expect(specbaseLocalDeliveryWorkflow.resume?.after).toBeTypeOf("function");
			expect(validateWorkflow(specbaseLocalDeliveryWorkflow).filter((issue) => issue.severity === "error")).toEqual(
				[],
			);
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

		it("serializes both legacy mutation fan-outs and orders evidence before tasks", () => {
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
});
