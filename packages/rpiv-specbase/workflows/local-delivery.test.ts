import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertLocalDeliveryCommand,
	LocalDeliveryToolPolicyError,
} from "../../rpiv-pi/extensions/rpiv-core/local-delivery-tool-policy.js";
import type {
	DeliveryContext,
	DeliveryReadiness,
	DeliveryUnit,
	FinalGateResult,
	LocalGateResult,
	LocalReviewResult,
} from "./contracts.js";
import { acquireDeliveryLease, deliveryLeasePath, readDeliveryLease, releaseDeliveryLease } from "./lease.js";
import {
	appendDeliveryAudit,
	captureBaselineFingerprints,
	captureDeliveryContext,
	changedBaselinePaths,
	commitExplicitPaths,
	defaultCommandRunner,
	executeFrozenDelivery,
	type FrozenDeliveryHooks,
	gitDirtyPaths,
	readDeliveryAudit,
	runFinalLocalGate,
} from "./local-delivery.js";

const roots: string[] = [];
const run = (cwd: string, file: string, args: string[]) => {
	const result = spawnSync(file, args, { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(`${file} ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
};

function repo(): string {
	const root = mkdtempSync(join(tmpdir(), "rpiv-specbase-delivery-"));
	roots.push(root);
	run(root, "git", ["init", "-q"]);
	run(root, "git", ["config", "user.name", "Fixture"]);
	run(root, "git", ["config", "user.email", "fixture@example.test"]);
	writeFileSync(join(root, "tracked.txt"), "start\n");
	run(root, "git", ["add", "tracked.txt"]);
	run(root, "git", ["commit", "-qm", "Initial"]);
	return root;
}

function unit(kind: "evidence" | "task", id: string): DeliveryUnit {
	return { id, label: `${kind} ${id}`, kind, paths: [], commands: [], covers: [] };
}

function context(root: string, ownerId = "owner-1"): DeliveryContext {
	const lease = acquireDeliveryLease({ root, storeId: null, changeId: "change-1" }, ownerId);
	if (!lease.acquired) throw new Error(lease.reason);
	const record = join(root, ".rpiv", "artifacts", "specbase-local-delivery", ownerId, "implementation.jsonl");
	return {
		version: 1,
		ownerId,
		capturedAt: new Date().toISOString(),
		authorization: {
			catalogVersion: 1,
			actionId: "deliver-local",
			capabilityId: "specbase.local-delivery",
			changeId: "change-1",
			storeId: null,
			root,
		},
		leasePath: lease.path,
		changeRoot: join(root, "specbase", "changes", "change-1"),
		artifactPaths: [],
		stack: {
			id: "stack",
			position: 1,
			total: 2,
			requiredPredecessor: null,
			projection: "valid",
			successorLaunchAllowed: false,
		},
		startHead: run(root, "git", ["rev-parse", "HEAD"]),
		baselineDirtyPaths: gitDirtyPaths(root),
		baselineFingerprints: [],
		allowedRoots: [root],
		evidenceUnits: [unit("evidence", "source-1")],
		taskUnits: [unit("task", "task-1")],
		gateCommands: [],
		implementationRecordPath: record,
	};
}

const ready = (ctx: DeliveryContext): DeliveryReadiness => ({
	disposition: "ready",
	reasons: [],
	contextOwnerId: ctx.ownerId,
});
const passGate = (attempt: number): LocalGateResult => ({
	verdict: "pass",
	attempt,
	failedChecks: [],
	outsideScopePaths: [],
	incompleteEvidence: [],
	incompleteTasks: [],
	commandOutcomes: [],
});
const cleanReview: LocalReviewResult = { disposition: "clean", findings: [] };
const finalPass: FinalGateResult = {
	verdict: "pass",
	commitIds: ["abc"],
	committedPaths: [],
	runOwnedDirtyPaths: [],
	baselineDirtyPaths: [],
	changedBaselinePaths: [],
	forbiddenRequests: [],
	commandOutcomes: [],
	reasons: [],
};

function hooks(overrides: Partial<FrozenDeliveryHooks> = {}): FrozenDeliveryHooks {
	return {
		readiness: ready,
		runUnit: async () => ({ passed: true, changedPaths: [] }),
		gate: async (_context, attempt) => passGate(attempt),
		remediate: async () => {},
		review: async () => cleanReview,
		fix: async () => {},
		commit: async () => ["abc"],
		final: async () => finalPass,
		...overrides,
	};
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local delivery lease and capture", () => {
	it("acquires by exclusive creation, rejects a race, reconciles stale ownership, and releases only for its owner", () => {
		const root = repo();
		const key = { root, storeId: "acme", changeId: "change-1" };
		const first = acquireDeliveryLease(key, "owner-a");
		expect(first.acquired).toBe(true);
		const racing = acquireDeliveryLease(key, "owner-b");
		expect(racing).toMatchObject({ acquired: false, holder: { ownerId: "owner-a" } });
		expect(releaseDeliveryLease(deliveryLeasePath(key), "owner-b")).toBe(false);
		expect(releaseDeliveryLease(deliveryLeasePath(key), "owner-a")).toBe(true);

		const path = deliveryLeasePath(key);
		writeFileSync(
			path,
			`${JSON.stringify({ version: 1, ownerId: "dead", pid: 999999, acquiredAt: "old", root, storeId: "acme", changeId: "change-1" })}\n`,
		);
		mkdirSync(`${path}.lock`);
		const old = new Date(Date.now() - 60_000);
		utimesSync(`${path}.lock`, old, old);
		const recovered = acquireDeliveryLease(key, "owner-b", { staleMs: 2_000, updateMs: 1_000 });
		expect(recovered).toMatchObject({ acquired: true, reconciled: true, record: { ownerId: "owner-b" } });
		expect(releaseDeliveryLease(path, "owner-b")).toBe(true);
		expect(readDeliveryLease(deliveryLeasePath(key))).toBeUndefined();
	});

	it("uses collision-resistant identities and refuses a symlinked run-control root", () => {
		const root = repo();
		expect(deliveryLeasePath({ root, storeId: "a/b", changeId: "same" })).not.toBe(
			deliveryLeasePath({ root, storeId: "a_b", changeId: "same" }),
		);
		rmSync(join(root, ".rpiv"), { recursive: true, force: true });
		const outside = mkdtempSync(join(tmpdir(), "rpiv-specbase-outside-"));
		roots.push(outside);
		symlinkSync(outside, join(root, ".rpiv"), "dir");
		expect(() => acquireDeliveryLease({ root, storeId: null, changeId: "change-1" }, "owner")).toThrow(
			/symlinked run-control path/iu,
		);
	});

	it("freezes canonical authorization, stack state, artifacts, units, HEAD, and baseline before mutation", () => {
		const root = repo();
		mkdirSync(join(root, "specbase", "changes", "change-1", "specs", "behavior", "x"), { recursive: true });
		const tasks = join(root, "specbase", "changes", "change-1", "tasks.md");
		const enforcement = join(root, "specbase", "changes", "change-1", "specs", "behavior", "x", "enforcement.yaml");
		writeFileSync(tasks, "## 1. Work\n- [ ] 1.1 Implement it\n");
		writeFileSync(
			enforcement,
			"bindings:\n  source-test:\n    type: test\n    covers: requirement\n    source: test/source.test.ts\n",
		);
		writeFileSync(join(root, "baseline.txt"), "pre-existing\n");
		const lease = acquireDeliveryLease({ root, storeId: null, changeId: "change-1" }, "capture-owner");
		expect(lease.acquired).toBe(true);
		const captured = captureDeliveryContext(
			{
				version: 1,
				ownerId: "capture-owner",
				authorization: {
					catalogVersion: 7,
					actionId: "deliver-local",
					capabilityId: "specbase.local-delivery",
					changeId: "change-1",
					storeId: null,
					root,
				},
			},
			{
				runJson: () => ({
					changeRoot: join(root, "specbase", "changes", "change-1"),
					artifactPaths: {
						tasks: { existingOutputPaths: [tasks] },
						enforcement: { existingOutputPaths: [enforcement] },
					},
					stack: { id: "stack-1", position: 2, total: 3, requiredPredecessor: "change-0", projection: "valid" },
				}),
				now: () => "2026-08-21T00:00:00.000Z",
			},
		);
		expect(captured.context.authorization.catalogVersion).toBe(7);
		expect(captured.context.stack).toMatchObject({ id: "stack-1", position: 2, successorLaunchAllowed: false });
		expect(captured.context.evidenceUnits[0]).toMatchObject({
			id: expect.stringMatching(/enforcement\.yaml#source-test$/u),
			kind: "evidence",
		});
		expect(captured.context.taskUnits[0]).toMatchObject({ id: "1.1", kind: "task" });
		expect(captured.context.gateCommands.find((command) => command.id === "specbase-strict-change")?.args).toEqual([
			"validate",
			"change-1",
			"--type",
			"change",
			"--strict",
			"--no-interactive",
		]);
		expect(captured.context.baselineDirtyPaths).toContain("baseline.txt");
		expect(JSON.parse(readFileSync(captured.path, "utf8"))).toEqual(captured.context);
	});
});

describe("frozen delivery execution", () => {
	it("runs evidence serially before tasks and releases the terminal lease", async () => {
		const root = repo();
		const ctx = context(root);
		const order: string[] = [];
		const result = await executeFrozenDelivery(
			ctx,
			hooks({
				runUnit: async (selected) => {
					order.push(`${selected.kind}:${selected.id}`);
					return { passed: true, changedPaths: [] };
				},
			}),
		);
		expect(result.status).toBe("completed");
		expect(order).toEqual(["evidence:source-1", "task:task-1"]);
		expect(readDeliveryLease(ctx.leasePath)).toBeUndefined();
	});

	it("does not advance after a native unit failure", async () => {
		const root = repo();
		const ctx = context(root);
		const order: string[] = [];
		const result = await executeFrozenDelivery(
			ctx,
			hooks({
				runUnit: async (selected) => {
					order.push(selected.id);
					return { passed: false, changedPaths: [], detail: { command: "native-test" } };
				},
			}),
		);
		expect(result).toMatchObject({ status: "failed", reason: expect.stringContaining("source-1") });
		expect(order).toEqual(["source-1"]);
		expect(readDeliveryAudit(ctx.implementationRecordPath).at(-1)).toMatchObject({
			kind: "unit-failed",
			unitId: "evidence:source-1",
		});
	});

	it("bounds remediation and always regates after a local fix", async () => {
		const root = repo();
		const ctx = context(root);
		let gates = 0;
		let fixes = 0;
		const result = await executeFrozenDelivery(
			ctx,
			hooks({
				gate: async (_context, attempt) => {
					gates += 1;
					return gates < 2 ? { ...passGate(attempt), verdict: "fail", failedChecks: ["test"] } : passGate(attempt);
				},
				review: async () =>
					fixes === 0
						? { disposition: "local-fix", findings: [{ id: "f1", path: "tracked.txt", summary: "fix" }] }
						: cleanReview,
				fix: async () => {
					fixes += 1;
				},
			}),
			{ remediation: 1, localFix: 1 },
		);
		expect(result).toMatchObject({ status: "completed", remediationAttempts: 1, localFixAttempts: 1 });
		expect(gates).toBe(3); // initial fail, post-remediation pass, post-local-fix pass
	});

	it("halts when the repair budget is exhausted", async () => {
		const root = repo();
		const ctx = context(root);
		const result = await executeFrozenDelivery(
			ctx,
			hooks({
				gate: async (_context, attempt) => ({ ...passGate(attempt), verdict: "fail", failedChecks: ["test"] }),
			}),
			{ remediation: 1 },
		);
		expect(result).toMatchObject({
			status: "failed",
			reason: "remediation budget exhausted",
			remediationAttempts: 1,
		});
	});

	it("resumes from audit without repeating completed units", async () => {
		const root = repo();
		const ctx = context(root);
		appendDeliveryAudit(ctx.implementationRecordPath, {
			ts: new Date().toISOString(),
			kind: "unit-complete",
			unitId: "evidence:source-1",
			detail: { changedPaths: [] },
		});
		const seen: string[] = [];
		await executeFrozenDelivery(
			ctx,
			hooks({
				runUnit: async (selected) => {
					seen.push(selected.id);
					return { passed: true, changedPaths: [] };
				},
			}),
		);
		expect(seen).toEqual(["task-1"]);
	});

	it("routes predecessor/readiness trouble to durable blocked state without mutation", async () => {
		const root = repo();
		const base = context(root);
		const ctx = { ...base, stack: { ...base.stack, projection: "blocked" } };
		const runUnit: FrozenDeliveryHooks["runUnit"] = async () => {
			throw new Error("must not mutate");
		};
		const result = await executeFrozenDelivery(
			ctx,
			hooks({
				readiness: async (): Promise<DeliveryReadiness> => ({
					disposition: "blocked",
					reasons: ["predecessor incomplete"],
					contextOwnerId: ctx.ownerId,
				}),
				runUnit,
			}),
		);
		expect(result).toMatchObject({ status: "blocked", reason: "predecessor incomplete" });
	});
});

describe("native commands, baseline dirt, commits, and local-only boundary", () => {
	it("executes native commands without a shell and preserves their failure result", () => {
		const root = repo();
		expect(
			defaultCommandRunner({ id: "pass", file: process.execPath, args: ["-e", "process.exit(0)"], cwd: root }),
		).toMatchObject({ passed: true, exitCode: 0 });
		expect(
			defaultCommandRunner({ id: "fail", file: process.execPath, args: ["-e", "process.exit(7)"], cwd: root }),
		).toMatchObject({ passed: false, exitCode: 7 });
	});

	it("detects later mutation of a baseline-dirty path by content and index fingerprint", () => {
		const root = repo();
		writeFileSync(join(root, "tracked.txt"), "baseline dirt\n");
		const base = context(root);
		const ctx = { ...base, baselineFingerprints: captureBaselineFingerprints(root, base.baselineDirtyPaths) };
		writeFileSync(join(root, "tracked.txt"), "mutated again\n");
		expect(changedBaselinePaths(ctx)).toEqual(["tracked.txt"]);
	});

	it("commits explicit run-owned paths and leaves baseline dirt untouched", () => {
		const root = repo();
		writeFileSync(join(root, "tracked.txt"), "baseline dirt\n");
		writeFileSync(join(root, "pre-staged.txt"), "preserve me\n");
		run(root, "git", ["add", "pre-staged.txt"]);
		const baseline = gitDirtyPaths(root);
		writeFileSync(join(root, "run-owned.txt"), "delivery\n");
		expect(() =>
			commitExplicitPaths({
				cwd: root,
				paths: ["."],
				baselineDirtyPaths: baseline,
				allowedRoots: [root],
				startHead: run(root, "git", ["rev-parse", "HEAD"]),
				message: "Must refuse broad staging",
			}),
		).toThrow(/broad local-delivery pathspec/iu);
		const sha = commitExplicitPaths({
			cwd: root,
			paths: ["run-owned.txt"],
			baselineDirtyPaths: baseline,
			allowedRoots: [root],
			startHead: run(root, "git", ["rev-parse", "HEAD"]),
			message: "Add delivered fixture",
		});
		expect(sha).toMatch(/^[0-9a-f]{40}$/u);
		expect(run(root, "git", ["show", "--pretty=", "--name-only", "HEAD"])).toBe("run-owned.txt");
		expect(run(root, "git", ["diff", "--cached", "--name-only"])).toBe("pre-staged.txt");
		expect(gitDirtyPaths(root)).toEqual(expect.arrayContaining(["pre-staged.txt", "tracked.txt"]));
	});

	it("finalizes only the exact commit outcome, reruns checks, and fails on denied requests", () => {
		const root = repo();
		const ctx = context(root);
		writeFileSync(join(root, "run-owned.txt"), "delivery\n");
		appendDeliveryAudit(ctx.implementationRecordPath, {
			ts: new Date().toISOString(),
			kind: "unit-complete",
			unitId: "task:task-1",
			detail: { changedPaths: ["run-owned.txt"] },
		});
		const sha = commitExplicitPaths({
			cwd: root,
			paths: ["run-owned.txt"],
			baselineDirtyPaths: [],
			allowedRoots: [root],
			startHead: ctx.startHead,
			message: "Add run output",
		});
		const proof = {
			sha,
			prevSha: ctx.startHead!,
			commits: [{ sha, subject: "Add run output" }],
		};
		const final = runFinalLocalGate(ctx, proof);
		expect(final.reasons).toEqual([]);
		expect(final).toMatchObject({ verdict: "pass", commitIds: [sha], committedPaths: ["run-owned.txt"] });
		expect(runFinalLocalGate(ctx, proof, ["blocked push"]).verdict).toBe("fail");
		expect(runFinalLocalGate(ctx, { ...proof, sha: ctx.startHead! }).verdict).toBe("fail");
	});

	it("denies remote Git/GitHub, panel, archive, and successor commands before execution", () => {
		for (const command of [
			"git push origin HEAD",
			"git -C . push origin HEAD",
			"git config alias.p push",
			"gh pr create --fill",
			"node -e 'fetch(\"https://example.test\")'",
			"specbase archive change-1",
			"/skill:specbase-review-panel change-1",
			"specbase stack advance stack-1",
		]) {
			expect(() => assertLocalDeliveryCommand(command)).toThrow(LocalDeliveryToolPolicyError);
		}
		expect(() => assertLocalDeliveryCommand("git status --short")).not.toThrow();
		expect(() => assertLocalDeliveryCommand("npm test -- packages/example.test.ts")).not.toThrow();
	});
});
