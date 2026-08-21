import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertDraftPrCommand,
	LocalDeliveryToolPolicyError,
} from "../../rpiv-pi/extensions/rpiv-core/local-delivery-tool-policy.js";
import type { DraftPrContext, PanelDisposition } from "./draft-pr-contracts.js";
import {
	captureDraftPrContext,
	ensureDraftPullRequest,
	type GitHubAdapter,
	type PullRequestRecord,
	publishVerifiedHead,
	type RemoteGitAdapter,
	registerDraftRunId,
	restoreDraftPanelFootprint,
	runDraftDeterministicGate,
	validatePanelDisposition,
} from "./draft-pr-delivery.js";

const roots: string[] = [];
const run = (cwd: string, file: string, args: string[]) => {
	const result = spawnSync(file, args, { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(`${file} ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
};

function repo(): { root: string; head: string } {
	const root = mkdtempSync(join(tmpdir(), "rpiv-draft-pr-"));
	roots.push(root);
	run(root, "git", ["init", "-q", "-b", "feature/change"]);
	run(root, "git", ["config", "user.name", "Fixture"]);
	run(root, "git", ["config", "user.email", "fixture@example.test"]);
	writeFileSync(join(root, "file.txt"), "green\n");
	run(root, "git", ["add", "file.txt"]);
	run(root, "git", ["commit", "-qm", "Green local delivery"]);
	run(root, "git", ["remote", "add", "origin", "git@github.com:acme/widget.git"]);
	const head = run(root, "git", ["rev-parse", "HEAD"]);
	run(root, "git", ["update-ref", "refs/remotes/origin/main", head]);
	run(root, "git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
	const artifact = join(root, ".rpiv", "artifacts", "specbase-local-delivery", "local-run");
	mkdirSync(artifact, { recursive: true });
	writeFileSync(
		join(artifact, "final-local-gate.json"),
		JSON.stringify({ verdict: "pass", commitIds: [head], forbiddenRequests: [] }),
	);
	return { root, head };
}

function context(root: string, head: string): DraftPrContext {
	return {
		version: 1,
		ownerId: "review-run",
		runId: "2026-08-21_17-00-00-abcd",
		authorization: {
			catalogVersion: 1,
			actionId: "open-draft-pr",
			capabilityId: "specbase.draft-pr-delivery",
			changeId: "change-1",
			storeId: null,
			root,
		},
		branch: "feature/change",
		startHead: head,
		remote: "origin",
		repository: "acme/widget",
		base: "main",
		head: "feature/change",
		baselineDirtyPaths: [],
		changeMetadataPath: join(root, "specbase", "changes", "change-1", ".openspec.yaml"),
		changeMetadataBeforePanel: "schema: spec-driven-governed\n",
		localDeliveryRunId: "local-run",
		localDeliveryCommits: [head],
	};
}

class FakeRemote implements RemoteGitAdapter {
	head: string | null;
	ancestor = true;
	pushes: Array<{ remote: string; branch: string; sha: string; setUpstream: boolean }> = [];
	constructor(head: string | null) {
		this.head = head;
	}
	async readHead() {
		return this.head;
	}
	async isAncestor() {
		return this.ancestor;
	}
	async pushExact(remote: string, branch: string, sha: string, setUpstream: boolean) {
		this.pushes.push({ remote, branch, sha, setUpstream });
		this.head = sha;
	}
}

class FakeGitHub implements GitHubAdapter {
	prs: PullRequestRecord[] = [];
	creates = 0;
	async list() {
		return this.prs;
	}
	async createDraft(input: { repository: string; base: string; head: string }) {
		this.creates++;
		this.prs = [
			{
				number: 7,
				url: "https://github.com/acme/widget/pull/7",
				state: "open",
				draft: true,
				base: input.base,
				head: input.head,
				headSha: "a".repeat(40),
			},
		];
	}
}

const cleanPanel: PanelDisposition = { disposition: "clean", report: "clean", findings: [] };

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("draft PR delivery functional boundary", () => {
	it("captures an attached clean GitHub branch only from the green local-delivery head", () => {
		const { root, head } = repo();
		const metadataDir = join(root, ".rpiv", "artifacts", "specbase-draft-pr-delivery", "fixture");
		const metadata = join(metadataDir, ".openspec.yaml");
		mkdirSync(metadataDir, { recursive: true });
		writeFileSync(metadata, "schema: spec-driven-governed\n");
		registerDraftRunId("review-run", "draft-run-1");
		expect(
			captureDraftPrContext(
				{
					version: 1,
					ownerId: "review-run",
					authorization: {
						catalogVersion: 1,
						actionId: "open-draft-pr",
						capabilityId: "specbase.draft-pr-delivery",
						changeId: "change-1",
						storeId: null,
						root,
					},
				},
				{ resolveChangeMetadata: () => metadata },
			),
		).toMatchObject({
			branch: "feature/change",
			startHead: head,
			repository: "acme/widget",
			localDeliveryRunId: "local-run",
			runId: "draft-run-1",
		});
	});

	it("stops capture for dirty, detached, and missing-green local state", () => {
		const first = repo();
		writeFileSync(join(first.root, "dirty.txt"), "dirty");
		registerDraftRunId("dirty", "draft-dirty");
		expect(() =>
			captureDraftPrContext({
				version: 1,
				ownerId: "dirty",
				authorization: {
					catalogVersion: 1,
					actionId: "open-draft-pr",
					capabilityId: "specbase.draft-pr-delivery",
					changeId: "c",
					storeId: null,
					root: first.root,
				},
			}),
		).toThrow(/clean tree/iu);
		const second = repo();
		rmSync(join(second.root, ".rpiv"), { recursive: true, force: true });
		registerDraftRunId("missing", "draft-missing");
		expect(() =>
			captureDraftPrContext({
				version: 1,
				ownerId: "missing",
				authorization: {
					catalogVersion: 1,
					actionId: "open-draft-pr",
					capabilityId: "specbase.draft-pr-delivery",
					changeId: "c",
					storeId: null,
					root: second.root,
				},
			}),
		).toThrow(/No green local-delivery/iu);
	});

	it("restores the panel footprint on failure but preserves canonical PR metadata", () => {
		const { root, head } = repo();
		const ctx = context(root, head);
		const runDir = join(root, ".rpiv", "artifacts", "specbase-draft-pr-delivery", ctx.ownerId);
		mkdirSync(runDir, { recursive: true });
		mkdirSync(join(root, "specbase", "changes", "change-1"), { recursive: true });
		writeFileSync(ctx.changeMetadataPath, "schema: spec-driven-governed\nlastReviewedAt: 2026-08-21T00:00:00.000Z\n");
		writeFileSync(join(runDir, "review-context.json"), JSON.stringify(ctx));
		restoreDraftPanelFootprint(root, ctx.ownerId);
		expect(readFileSync(ctx.changeMetadataPath, "utf8")).toBe(ctx.changeMetadataBeforePanel);
		writeFileSync(ctx.changeMetadataPath, `${ctx.changeMetadataBeforePanel}draftPullRequest:\n  number: 1\n`);
		restoreDraftPanelFootprint(root, ctx.ownerId);
		expect(readFileSync(ctx.changeMetadataPath, "utf8")).toContain("draftPullRequest:");
	});

	it("keeps panel/fix children local while allowing explicit local fix commits", () => {
		expect(() => assertDraftPrCommand("git commit -m 'fix panel finding' -- src/fix.ts")).not.toThrow();
		for (const command of [
			"git push origin HEAD",
			"git commit -m x && git push",
			"gh pr create --draft",
			"specbase archive change-1",
		]) {
			expect(() => assertDraftPrCommand(command)).toThrow(LocalDeliveryToolPolicyError);
		}
	});

	it("publishes an absent remote with an exact non-force upstream update", async () => {
		const { root, head } = repo();
		const adapter = new FakeRemote(null);
		await expect(publishVerifiedHead(context(root, head), head, adapter)).resolves.toMatchObject({
			status: "pushed",
			headSha: head,
		});
		expect(adapter.pushes).toEqual([{ remote: "origin", branch: "feature/change", sha: head, setUpstream: true }]);
	});

	it("treats an equal remote head as an idempotent no-op", async () => {
		const { root, head } = repo();
		const adapter = new FakeRemote(head);
		await expect(publishVerifiedHead(context(root, head), head, adapter)).resolves.toMatchObject({
			status: "unchanged",
		});
		expect(adapter.pushes).toEqual([]);
	});

	it("permits normal fast-forward but refuses divergence without push", async () => {
		const { root, head } = repo();
		const ff = new FakeRemote("b".repeat(40));
		await expect(publishVerifiedHead(context(root, head), head, ff)).resolves.toMatchObject({ status: "pushed" });
		const diverged = new FakeRemote("c".repeat(40));
		diverged.ancestor = false;
		await expect(publishVerifiedHead(context(root, head), head, diverged)).resolves.toMatchObject({
			status: "blocked",
			reason: expect.stringContaining("force"),
		});
		expect(diverged.pushes).toEqual([]);
	});

	it("refuses push when HEAD moved after final verification", async () => {
		const { root, head } = repo();
		const adapter = new FakeRemote(null);
		await expect(publishVerifiedHead(context(root, head), "d".repeat(40), adapter)).resolves.toMatchObject({
			status: "blocked",
		});
		expect(adapter.pushes).toEqual([]);
	});

	it("creates then re-queries exactly one matching draft", async () => {
		const { root, head } = repo();
		const github = new FakeGitHub();
		const expected = "a".repeat(40);
		await expect(
			ensureDraftPullRequest(context(root, head), expected, "run-1", cleanPanel, github, async () => expected),
		).resolves.toMatchObject({ number: 7, headSha: expected });
		expect(github.creates).toBe(1);
	});

	it("rechecks the exact remote head immediately before creating a draft", async () => {
		const { root, head } = repo();
		const github = new FakeGitHub();
		await expect(
			ensureDraftPullRequest(context(root, head), head, "run", cleanPanel, github, async () => "f".repeat(40)),
		).rejects.toThrow(/Remote head changed/iu);
		expect(github.creates).toBe(0);
	});

	it("reuses one exact draft without creating", async () => {
		const { root, head } = repo();
		const github = new FakeGitHub();
		github.prs = [
			{
				number: 3,
				url: "https://github.com/acme/widget/pull/3",
				state: "open",
				draft: true,
				base: "main",
				head: "feature/change",
				headSha: head,
			},
		];
		await expect(
			ensureDraftPullRequest(context(root, head), head, "run-1", cleanPanel, github, async () => head),
		).resolves.toMatchObject({ number: 3 });
		expect(github.creates).toBe(0);
	});

	it("stops on duplicate, non-draft, closed, or mismatched-head PR state", async () => {
		const { root, head } = repo();
		const base: PullRequestRecord = {
			number: 1,
			url: "u",
			state: "open",
			draft: true,
			base: "main",
			head: "feature/change",
			headSha: head,
		};
		for (const prs of [
			[base, { ...base, number: 2 }],
			[{ ...base, draft: false }],
			[{ ...base, state: "closed" as const }],
			[{ ...base, headSha: "e".repeat(40) }],
		]) {
			const github = new FakeGitHub();
			github.prs = prs;
			await expect(
				ensureDraftPullRequest(context(root, head), head, "run", cleanPanel, github, async () => head),
			).rejects.toThrow();
		}
	});

	it("rejects contradictory machine-readable panel dispositions", () => {
		expect(() =>
			validatePanelDisposition({
				disposition: "clean",
				report: "not clean",
				findings: [
					{
						id: "f",
						lens: "code",
						severity: "High",
						verification: "verified",
						strength: "review",
						path: "x",
						summary: "bug",
					},
				],
			}),
		).toThrow(/clean.*findings/iu);
		expect(() =>
			validatePanelDisposition({
				disposition: "advisory",
				report: "high",
				findings: [
					{
						id: "f",
						lens: "code",
						severity: "High",
						verification: "verified",
						strength: "review",
						path: "x",
						summary: "bug",
					},
				],
			}),
		).toThrow(/cannot be routed as advisory/iu);
	});

	it("allows a dirty bounded fix gate but publishes finalVerifiedHead only from a clean final gate", () => {
		const { root, head } = repo();
		writeFileSync(join(root, "fix.txt"), "fix\n");
		const fix = runDraftDeterministicGate(context(root, head), () => ({ passed: true, summary: "ok" }), {
			allowDirtyFix: true,
			allowedDirtyPaths: ["fix.txt"],
		});
		expect(fix).toMatchObject({ verdict: "pass", finalVerifiedHead: head });
		const escaped = runDraftDeterministicGate(context(root, head), () => ({ passed: true, summary: "ok" }), {
			allowDirtyFix: true,
			allowedDirtyPaths: ["other.txt"],
		});
		expect(escaped).toMatchObject({ verdict: "fail", reasons: [expect.stringContaining("escaped")] });
		const final = runDraftDeterministicGate(context(root, head), () => ({ passed: true, summary: "ok" }));
		expect(final).toMatchObject({ verdict: "fail", finalVerifiedHead: null });
	});

	it("publishes finalVerifiedHead only when all deterministic checks pass and tree stays clean", () => {
		const { root, head } = repo();
		const pass = runDraftDeterministicGate(context(root, head), () => ({ passed: true, summary: "ok" }));
		expect(pass).toMatchObject({ verdict: "pass", finalVerifiedHead: head });
		const fail = runDraftDeterministicGate(context(root, head), (id) => ({
			passed: id !== "repository-tests",
			summary: "result",
		}));
		expect(fail).toMatchObject({ verdict: "fail", finalVerifiedHead: null });
	});
});
