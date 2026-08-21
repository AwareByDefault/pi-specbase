import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DirectActionSelection } from "../kanban/action-dispatch.js";
import type {
	DeterministicGate,
	DraftPrContext,
	DraftPrDescriptor,
	DraftPrLaunch,
	PanelDisposition,
	RemoteHeadResult,
} from "./draft-pr-contracts.js";
import { gitDirtyPaths } from "./local-delivery.js";

const draftRunIds = new Map<string, string>();

export function registerDraftRunId(ownerId: string, runId: string): void {
	draftRunIds.set(ownerId, runId);
}

const git = (cwd: string, args: readonly string[], allowFailure = false): string => {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8", timeout: 120_000 });
	if (!allowFailure && (result.error || result.status !== 0)) {
		throw result.error ?? new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
	}
	return result.status === 0 ? result.stdout.trim() : "";
};

function githubRepository(remoteUrl: string): string {
	const match = remoteUrl.match(/github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/iu);
	if (!match) throw new Error("The selected remote is not an unambiguous GitHub repository.");
	return match[1]!.replace(/\.git$/u, "");
}

function latestGreenLocalDelivery(root: string, head: string): { runId: string; commits: string[] } {
	const home = join(root, ".rpiv", "artifacts", "specbase-local-delivery");
	const candidates = existsSync(home)
		? readdirSync(home, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.flatMap((entry) => {
					const path = join(home, entry.name, "final-local-gate.json");
					return existsSync(path) ? [{ runId: entry.name, path, mtime: statSync(path).mtimeMs }] : [];
				})
				.sort((a, b) => b.mtime - a.mtime)
		: [];
	for (const candidate of candidates) {
		const value = JSON.parse(readFileSync(candidate.path, "utf8")) as {
			verdict?: unknown;
			commitIds?: unknown;
			forbiddenRequests?: unknown;
		};
		const commits = Array.isArray(value.commitIds)
			? value.commitIds.filter((id): id is string => typeof id === "string")
			: [];
		if (
			value.verdict === "pass" &&
			commits.at(-1) === head &&
			Array.isArray(value.forbiddenRequests) &&
			value.forbiddenRequests.length === 0
		) {
			return { runId: candidate.runId, commits };
		}
	}
	throw new Error("No green local-delivery terminal result owns the current HEAD.");
}

export interface DraftCaptureDependencies {
	readonly resolveChangeMetadata?: (root: string, changeId: string, storeId: string | null) => string;
}

export function captureDraftPrContext(
	launch: DraftPrLaunch,
	dependencies: DraftCaptureDependencies = {},
): DraftPrContext {
	const root = resolve(launch.authorization.root);
	const runId = draftRunIds.get(launch.ownerId);
	if (!runId) throw new Error("Draft-PR capture requires the lifecycle-assigned RPIV run ID.");
	draftRunIds.delete(launch.ownerId);
	const branch = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
	if (!branch) throw new Error("Draft-PR delivery requires an attached local branch.");
	const startHead = git(root, ["rev-parse", "HEAD"]);
	const baselineDirtyPaths = gitDirtyPaths(root);
	if (baselineDirtyPaths.length > 0)
		throw new Error(`Draft-PR delivery requires a clean tree: ${baselineDirtyPaths.join(", ")}`);
	const remotes = git(root, ["remote"]).split(/\s+/u).filter(Boolean);
	if (remotes.length !== 1) throw new Error("Draft-PR delivery requires exactly one configured remote.");
	const remote = remotes[0]!;
	const repository = githubRepository(git(root, ["remote", "get-url", remote]));
	const baseRef = git(root, ["symbolic-ref", `refs/remotes/${remote}/HEAD`], true);
	if (!baseRef) throw new Error("Draft-PR delivery requires an unambiguous remote default branch.");
	const base = baseRef.replace(`refs/remotes/${remote}/`, "");
	const local = latestGreenLocalDelivery(root, startHead);
	const changeMetadataPath = dependencies.resolveChangeMetadata
		? dependencies.resolveChangeMetadata(root, launch.authorization.changeId, launch.authorization.storeId)
		: (() => {
				const statusResult = spawnSync(
					"specbase",
					[
						"status",
						"--change",
						launch.authorization.changeId,
						"--json",
						...(launch.authorization.storeId ? ["--store", launch.authorization.storeId] : []),
					],
					{ cwd: root, encoding: "utf8", timeout: 30_000 },
				);
				if (statusResult.error || statusResult.status !== 0)
					throw statusResult.error ?? new Error("Specbase status failed during draft capture.");
				const status = JSON.parse(statusResult.stdout) as { changeRoot?: unknown };
				if (typeof status.changeRoot !== "string")
					throw new Error("Specbase status did not return an active change root.");
				return join(status.changeRoot, ".openspec.yaml");
			})();
	const changeMetadataBeforePanel = readFileSync(changeMetadataPath, "utf8");
	return {
		version: 1,
		ownerId: launch.ownerId,
		runId,
		authorization: launch.authorization,
		branch,
		startHead,
		remote,
		repository,
		base,
		head: branch,
		baselineDirtyPaths,
		changeMetadataPath,
		changeMetadataBeforePanel,
		localDeliveryRunId: local.runId,
		localDeliveryCommits: local.commits,
	};
}

export function restoreDraftPanelFootprint(root: string, ownerId: string): void {
	const contextPath = join(root, ".rpiv", "artifacts", "specbase-draft-pr-delivery", ownerId, "review-context.json");
	if (!existsSync(contextPath)) return;
	const context = JSON.parse(readFileSync(contextPath, "utf8")) as Partial<DraftPrContext>;
	if (typeof context.changeMetadataPath !== "string" || typeof context.changeMetadataBeforePanel !== "string") return;
	const current = readFileSync(context.changeMetadataPath, "utf8");
	if (/^draftPullRequest:/mu.test(current)) return;
	writeFileSync(context.changeMetadataPath, context.changeMetadataBeforePanel, "utf8");
}

export type DraftGateRunner = (id: string) => { passed: boolean; summary: string };

export function runDraftDeterministicGate(
	context: DraftPrContext,
	runner: DraftGateRunner,
	options: { allowDirtyFix?: boolean; allowedDirtyPaths?: readonly string[] } = {},
): DeterministicGate {
	const checks = ["strict-change", "repository-tests"].map((id) => ({ id, ...runner(id) }));
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	const dirty = gitDirtyPaths(context.authorization.root);
	const reasons: string[] = [];
	if (dirty.length && !options.allowDirtyFix) reasons.push(`working tree is dirty: ${dirty.join(", ")}`);
	if (dirty.length && options.allowDirtyFix) {
		const allowed = new Set(options.allowedDirtyPaths ?? []);
		const planningPrefix = `specbase/changes/${context.authorization.changeId}/`;
		const outside = dirty.filter((path) => !allowed.has(path) || path.startsWith(planningPrefix));
		if (outside.length) reasons.push(`panel fix escaped frozen finding paths: ${outside.join(", ")}`);
	}
	if (checks.some((check) => !check.passed)) reasons.push("one or more deterministic checks failed");
	if (git(context.authorization.root, ["merge-base", "--is-ancestor", context.startHead, head], true) === "") {
		const status = spawnSync("git", ["merge-base", "--is-ancestor", context.startHead, head], {
			cwd: context.authorization.root,
		});
		if (status.status !== 0) reasons.push("HEAD no longer descends from captured local delivery");
	}
	return {
		verdict: reasons.length === 0 ? "pass" : "fail",
		finalVerifiedHead: reasons.length === 0 ? head : null,
		checks: checks.map((check) => ({ id: check.id, passed: check.passed, summary: check.summary })),
		reasons,
	};
}

export function verifyPanelFixCommit(
	context: DraftPrContext,
	panel: PanelDisposition,
	proof: { sha: string; prevSha: string },
): DeterministicGate {
	const paths = git(context.authorization.root, ["diff", "--name-only", "-z", proof.prevSha, proof.sha])
		.split("\0")
		.filter(Boolean)
		.sort();
	const allowed = new Set(panel.findings.map((finding) => finding.path).filter(Boolean));
	const planningPrefix = `specbase/changes/${context.authorization.changeId}/`;
	const outside = paths.filter((path) => !allowed.has(path) || path.startsWith(planningPrefix));
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	const reasons: string[] = [];
	if (head !== proof.sha) reasons.push("HEAD differs from panel-fix commit outcome");
	if (paths.length === 0) reasons.push("panel-fix commit changed no paths");
	if (outside.length) reasons.push(`panel-fix commit escaped frozen finding paths: ${outside.join(", ")}`);
	return {
		verdict: reasons.length === 0 ? "pass" : "fail",
		finalVerifiedHead: reasons.length === 0 ? proof.sha : null,
		checks: [{ id: "panel-fix-commit-scope", passed: reasons.length === 0, summary: paths.join(", ") }],
		reasons,
	};
}

export function validatePanelDisposition(panel: PanelDisposition): PanelDisposition {
	if (panel.disposition === "clean" && panel.findings.length > 0) {
		throw new Error("A clean panel disposition cannot contain findings.");
	}
	if (
		panel.disposition === "advisory" &&
		panel.findings.some((finding) => /^(?:critical|high)$/iu.test(finding.severity))
	) {
		throw new Error("Critical/high findings cannot be routed as advisory.");
	}
	if (panel.disposition === "local-fix" && panel.findings.length === 0) {
		throw new Error("A local-fix disposition requires at least one finding.");
	}
	return panel;
}

export interface RemoteGitAdapter {
	readHead(remote: string, branch: string): Promise<string | null>;
	isAncestor(ancestor: string, descendant: string): Promise<boolean>;
	pushExact(remote: string, branch: string, sha: string, setUpstream: boolean): Promise<void>;
}

export async function publishVerifiedHead(
	context: DraftPrContext,
	finalVerifiedHead: string,
	adapter: RemoteGitAdapter,
): Promise<RemoteHeadResult> {
	if (git(context.authorization.root, ["rev-parse", "HEAD"]) !== finalVerifiedHead) {
		return {
			status: "blocked",
			remote: context.remote,
			branch: context.head,
			headSha: null,
			reason: "local HEAD changed after final gate",
		};
	}
	const current = await adapter.readHead(context.remote, context.head);
	if (current === finalVerifiedHead) {
		return { status: "unchanged", remote: context.remote, branch: context.head, headSha: current, reason: null };
	}
	if (current && !(await adapter.isAncestor(current, finalVerifiedHead))) {
		return {
			status: "blocked",
			remote: context.remote,
			branch: context.head,
			headSha: current,
			reason: "remote branch diverged; force is prohibited",
		};
	}
	await adapter.pushExact(context.remote, context.head, finalVerifiedHead, current === null);
	const confirmed = await adapter.readHead(context.remote, context.head);
	if (confirmed !== finalVerifiedHead) {
		return {
			status: "blocked",
			remote: context.remote,
			branch: context.head,
			headSha: confirmed,
			reason: "remote did not confirm finalVerifiedHead",
		};
	}
	return { status: "pushed", remote: context.remote, branch: context.head, headSha: confirmed, reason: null };
}

export function localRemoteGitAdapter(root: string): RemoteGitAdapter {
	return {
		readHead: async (remote, branch) => {
			const output = git(root, ["ls-remote", "--heads", remote, `refs/heads/${branch}`]);
			const sha = output.split(/\s+/u)[0];
			return /^[0-9a-f]{40}$/u.test(sha ?? "") ? sha! : null;
		},
		isAncestor: async (ancestor, descendant) =>
			spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root }).status === 0,
		pushExact: async (remote, branch, sha, setUpstream) => {
			const args = ["push", ...(setUpstream ? ["--set-upstream"] : []), remote, `${sha}:refs/heads/${branch}`];
			git(root, args);
		},
	};
}

export interface PullRequestRecord {
	readonly number: number;
	readonly url: string;
	readonly state: "open" | "closed" | "merged";
	readonly draft: boolean;
	readonly base: string;
	readonly head: string;
	readonly headSha: string;
}

export interface GitHubAdapter {
	list(repository: string, head: string): Promise<readonly PullRequestRecord[]>;
	createDraft(input: { repository: string; base: string; head: string; title: string; body: string }): Promise<void>;
}

export async function ensureDraftPullRequest(
	context: DraftPrContext,
	finalVerifiedHead: string,
	runId: string,
	panel: PanelDisposition,
	adapter: GitHubAdapter,
	readRemoteHead: () => Promise<string | null>,
): Promise<DraftPrDescriptor> {
	const inspect = async (): Promise<readonly PullRequestRecord[]> => adapter.list(context.repository, context.head);
	let matches = await inspect();
	if (matches.some((pr) => pr.base !== context.base)) {
		throw new Error("An existing pull request for this head uses a conflicting base branch.");
	}
	if (matches.length === 0) {
		if ((await readRemoteHead()) !== finalVerifiedHead) {
			throw new Error("Remote head changed before draft creation.");
		}
		await adapter.createDraft({
			repository: context.repository,
			base: context.base,
			head: context.head,
			title: context.authorization.changeId,
			body: `Automated draft for ${context.authorization.changeId}.\n\nPanel disposition: ${panel.disposition}.\nVerified head: ${finalVerifiedHead}.`,
		});
		matches = await inspect();
	}
	if (matches.length !== 1) throw new Error(`Expected exactly one matching pull request; found ${matches.length}.`);
	const pr = matches[0]!;
	if (
		pr.state !== "open" ||
		!pr.draft ||
		pr.base !== context.base ||
		pr.head !== context.head ||
		pr.headSha !== finalVerifiedHead
	) {
		throw new Error("Matching pull request conflicts with the exact draft/base/head/finalVerifiedHead contract.");
	}
	return {
		number: pr.number,
		url: pr.url,
		repository: context.repository,
		base: context.base,
		head: context.head,
		headSha: finalVerifiedHead,
		runId,
	};
}

function ghJson(root: string, args: readonly string[]): unknown {
	const result = spawnSync("gh", [...args], { cwd: root, encoding: "utf8", timeout: 120_000 });
	if (result.error || result.status !== 0)
		throw result.error ?? new Error(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
	return JSON.parse(result.stdout || "null");
}

export function githubCliAdapter(root: string): GitHubAdapter {
	return {
		list: async (repository, head) => {
			const value = ghJson(root, [
				"pr",
				"list",
				"--repo",
				repository,
				"--state",
				"all",
				"--head",
				head,
				"--json",
				"number,url,state,isDraft,baseRefName,headRefName,headRefOid",
			]) as Array<Record<string, unknown>>;
			return value.map((record) => ({
				number: Number(record.number),
				url: String(record.url),
				state: String(record.state).toLowerCase() as PullRequestRecord["state"],
				draft: record.isDraft === true,
				base: String(record.baseRefName),
				head: String(record.headRefName),
				headSha: String(record.headRefOid),
			}));
		},
		createDraft: async ({ repository, base, head, title, body }) => {
			const result = spawnSync(
				"gh",
				[
					"pr",
					"create",
					"--draft",
					"--repo",
					repository,
					"--base",
					base,
					"--head",
					head,
					"--title",
					title,
					"--body",
					body,
				],
				{ cwd: root, encoding: "utf8", timeout: 120_000 },
			);
			if (result.error || result.status !== 0)
				throw result.error ?? new Error((result.stderr || result.stdout).trim());
		},
	};
}

export async function recordCanonicalDraftResult(
	context: DraftPrContext,
	descriptor: DraftPrDescriptor,
): Promise<{ status: "reviewing" | "failed"; changeId: string; url: string | null; reason: string | null }> {
	const packageName = "@awarebydefault/specbase";
	const api = (await import(packageName)) as {
		recordDirectActionResult?: (
			intent: DirectActionSelection,
			result: DraftPrDescriptor,
			options: { root: string },
		) => Promise<{
			accepted: boolean;
			snapshot?: { lifecycle?: string; draftPullRequest?: { url?: string } };
			diagnostics?: readonly { message?: string }[];
		}>;
	};
	if (!api.recordDirectActionResult) throw new Error("The installed Specbase API cannot record draft-PR results.");
	const intent: DirectActionSelection = {
		version: context.authorization.catalogVersion,
		storeId: context.authorization.storeId,
		workItemId: context.authorization.changeId,
		actionId: context.authorization.actionId,
		dispatchKind: "capability",
	};
	const result = await api.recordDirectActionResult(intent, descriptor, { root: context.authorization.root });
	if (
		!result.accepted ||
		result.snapshot?.lifecycle !== "reviewing" ||
		result.snapshot.draftPullRequest?.url !== descriptor.url
	) {
		return {
			status: "failed",
			changeId: context.authorization.changeId,
			url: descriptor.url,
			reason:
				result.diagnostics
					?.map((item) => item.message)
					.filter(Boolean)
					.join("; ") || "canonical Reviewing observation failed",
		};
	}
	return { status: "reviewing", changeId: context.authorization.changeId, url: descriptor.url, reason: null };
}

export function writeDraftArtifact(root: string, ownerId: string, name: string, value: unknown): string {
	const path = join(root, ".rpiv", "artifacts", "specbase-draft-pr-delivery", ownerId, name);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	return path;
}
