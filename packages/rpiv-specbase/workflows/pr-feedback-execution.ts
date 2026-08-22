import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { Value } from "typebox/value";
import type { RemoteGitAdapter } from "./draft-pr-delivery.js";
import { commitExplicitPaths, gitDirtyPaths } from "./local-delivery.js";
import type {
	FeedbackAuthorization,
	FeedbackCheckpointJournal,
	FeedbackClassificationScope,
	FeedbackContext,
	FeedbackPanel,
	FeedbackReply,
	FeedbackResolution,
	FeedbackVerification,
	ReobserveOutcome,
} from "./pr-feedback-contracts.js";
import {
	feedbackCheckpointJournalSchema,
	feedbackClassificationScopeSchema,
	feedbackContextSchema,
	feedbackPanelSchema,
	feedbackVerificationSchema,
} from "./pr-feedback-contracts.js";
import {
	acknowledgeFeedback,
	feedbackRevisionKey,
	type GitHubFeedbackAdapter,
	publishFeedbackHead,
	reobserveFeedbackRevision,
	replyToFeedback,
	resolveFeedbackThread,
} from "./pr-feedback-delivery.js";

const git = (root: string, args: readonly string[]): string => {
	const result = spawnSync("git", [...args], { cwd: root, encoding: "utf8", timeout: 120_000 });
	if (result.error || result.status !== 0) throw result.error ?? new Error(`git ${args.join(" ")} failed`);
	return result.stdout.trim();
};

const artifactDir = (context: FeedbackContext) =>
	join(resolve(context.authorization.root), ".rpiv/artifacts/specbase-pr-feedback", context.ownerId);
export const feedbackArtifact = (context: FeedbackContext, name: string, value: unknown): string => {
	const path = join(artifactDir(context), name);
	mkdirSync(artifactDir(context), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	return path;
};

export function createFeedbackContext(
	ownerId: string,
	runId: string,
	authorization: FeedbackAuthorization,
	snapshot: FeedbackContext["snapshot"],
): FeedbackContext {
	const root = authorization.root;
	const startHead = git(root, ["rev-parse", "HEAD"]);
	if (startHead !== snapshot.headSha)
		throw new Error("PR-feedback delivery requires local HEAD to equal the captured pull-request head.");
	const journalPath = join(resolve(root), ".rpiv/artifacts/specbase-pr-feedback", ownerId, "checkpoint-journal.json");
	const context: FeedbackContext = {
		version: 1,
		ownerId,
		runId,
		authorization,
		snapshot,
		startHead,
		baselineDirtyPaths: gitDirtyPaths(root),
		journalPath,
	};
	feedbackArtifact(context, "checkpoint-journal.json", { version: 1, ownerId, startHead });
	feedbackArtifact(context, "capture.json", context);
	return context;
}

function projectPath(root: string, path: string): string {
	const result = relative(resolve(root), resolve(root, path));
	if (!result || result === ".." || result.startsWith(`..${sep}`))
		throw new Error(`Feedback scope escaped repository: ${path}`);
	return result.split(sep).join("/");
}

function journal(context: FeedbackContext): FeedbackCheckpointJournal {
	if (!existsSync(context.journalPath)) throw new Error("PR-feedback checkpoint journal is missing.");
	const value: unknown = JSON.parse(readFileSync(context.journalPath, "utf8"));
	if (!Value.Check(feedbackCheckpointJournalSchema, value))
		throw new Error("PR-feedback checkpoint journal is malformed.");
	return value as FeedbackCheckpointJournal;
}

function writeJournal(context: FeedbackContext, value: FeedbackCheckpointJournal): void {
	writeFileSync(context.journalPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function commandOutcomes(root: string, scope: FeedbackClassificationScope) {
	return scope.commands.map((command) => {
		if (/[;&|<>`\n\r]|\$\(|\$\{/u.test(command))
			throw new Error("Feedback verification command uses shell composition.");
		const [file, ...args] = command.trim().split(/\s+/u);
		const operation = args[0] ?? "";
		const mutatingFlag = args.some((arg) => /^(?:-c|--config(?:-env)?|--output(?:=.*)?)$/u.test(arg));
		const allowed =
			(!mutatingFlag &&
				file === "npm" &&
				(operation === "test" || (operation === "run" && /^(?:test|check|check:files)$/u.test(args[1] ?? "")))) ||
			(file === "git" && /^(?:status|diff|log|show|rev-parse|merge-base)$/u.test(operation)) ||
			((file === "specbase" || file === "openspec") && /^(?:status|validate|coverage)$/u.test(operation));
		if (!file || !allowed)
			throw new Error("Feedback verification command is outside the frozen read/verify allowlist.");
		const result = spawnSync(file, args, { cwd: root, encoding: "utf8", timeout: 120_000 });
		return {
			id: command,
			passed: !result.error && result.status === 0,
			exitCode: result.status,
			summary: (result.error ? result.error.message : `${result.stdout ?? ""}\n${result.stderr ?? ""}`)
				.trim()
				.slice(-4_000),
		};
	});
}

function checkpoint(
	root: string,
	parent: string,
	sha: string,
	paths: readonly string[],
	commands: FeedbackVerification["commands"],
) {
	return {
		sha,
		parent,
		paths: [...paths].sort(),
		commands,
		verificationFingerprint: createHash("sha256").update(JSON.stringify(commands)).digest("hex"),
		tree: git(root, ["rev-parse", `${sha}^{tree}`]),
	};
}

export function validateFeedbackResume(root: string, ownerId: string): FeedbackContext | null {
	const path = join(resolve(root), ".rpiv/artifacts/specbase-pr-feedback", ownerId, "capture.json");
	if (!existsSync(path)) return null;
	const value: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!Value.Check(feedbackContextSchema, value)) throw new Error("PR-feedback resume context is malformed.");
	const context = value as FeedbackContext;
	if (context.ownerId !== ownerId || resolve(context.authorization.root) !== resolve(root))
		throw new Error("PR-feedback resume context escaped its owner or repository.");
	const current = verifyFeedbackJournal(context);
	const checkpoint =
		current.refactor && current.refactor !== "skipped"
			? current.refactor.sha
			: (current.green?.sha ?? current.red?.sha ?? current.startHead);
	if (git(root, ["rev-parse", "HEAD"]) !== checkpoint)
		throw new Error("PR-feedback resume HEAD differs from its latest checkpoint.");
	return context;
}

export function validateFeedbackClassificationScope(
	context: FeedbackContext,
	value: unknown,
): FeedbackClassificationScope {
	if (!Value.Check(feedbackClassificationScopeSchema, value))
		throw new Error("PR-feedback classification artifact is malformed.");
	const scope = value as FeedbackClassificationScope;
	if (scope.ownerId !== context.ownerId || scope.snapshotHeadSha !== context.snapshot.headSha)
		throw new Error("PR-feedback classification escaped its frozen owner or snapshot.");
	const frozen = new Set(context.snapshot.items.map((item) => feedbackRevisionKey(item)));
	const classified = scope.classifications.map((item) => feedbackRevisionKey(item.revision));
	if (
		classified.length !== frozen.size ||
		new Set(classified).size !== frozen.size ||
		classified.some((key) => !frozen.has(key))
	)
		throw new Error("PR-feedback classifier must classify every frozen revision exactly once.");
	for (const item of scope.classifications) {
		if (item.classification !== "fix" && item.behaviorDefect)
			throw new Error("Only a fix classification may claim a behavior defect.");
	}
	const fixKeys = scope.classifications
		.filter((item) => item.classification === "fix")
		.map((item) => feedbackRevisionKey(item.revision));
	if (fixKeys.length > 1 && scope.selectedRevisionKey !== null)
		throw new Error("Multiple actionable feedback items require a separate explicit selection run.");
	if (fixKeys.length === 1 && scope.selectedRevisionKey !== fixKeys[0])
		throw new Error("The only actionable feedback revision must be selected explicitly.");
	if (fixKeys.length === 0 && scope.selectedRevisionKey !== null)
		throw new Error("A non-actionable feedback set cannot select a revision for mutation.");
	const paths = [...scope.evidencePaths, ...scope.productionPaths];
	if (
		paths.some(
			(path) =>
				projectPath(context.authorization.root, path).startsWith(".rpiv/") ||
				projectPath(context.authorization.root, path).startsWith(".git/"),
		)
	)
		throw new Error("PR-feedback scope cannot declare workflow or Git control paths.");
	if (fixKeys.length === 1 && (!scope.evidencePaths.length || !scope.productionPaths.length || !scope.commands.length))
		throw new Error(
			"Actionable feedback requires frozen evidence paths, production paths, and verification commands.",
		);
	return scope;
}

export function selectedFeedback(scope: FeedbackClassificationScope) {
	return scope.selectedRevisionKey
		? (scope.classifications.find((item) => feedbackRevisionKey(item.revision) === scope.selectedRevisionKey) ?? null)
		: null;
}

export function verifyFeedbackRed(context: FeedbackContext, scope: FeedbackClassificationScope): FeedbackVerification {
	const baseline = new Set(context.baselineDirtyPaths);
	const evidence = new Set(scope.evidencePaths.map((path) => projectPath(context.authorization.root, path)));
	const paths = gitDirtyPaths(context.authorization.root)
		.filter((path) => !baseline.has(path))
		.sort();
	const commands = commandOutcomes(context.authorization.root, scope);
	const reason = paths.some((path) => !evidence.has(path))
		? `RED changed undeclared evidence paths: ${paths.filter((path) => !evidence.has(path)).join(", ")}`
		: !paths.length
			? "RED produced no evidence-source change"
			: !commands.length || commands.every((command) => command.passed)
				? "RED did not produce an expected failing evidence command"
				: null;
	return { verdict: reason ? "fail" : "pass", journal: journal(context), paths, commands, reason };
}

export function verifyFeedbackGreen(
	context: FeedbackContext,
	scope: FeedbackClassificationScope,
): FeedbackVerification {
	const baseline = new Set(context.baselineDirtyPaths);
	const evidence = new Set(scope.evidencePaths.map((path) => projectPath(context.authorization.root, path)));
	const production = scope.productionPaths.map((path) => projectPath(context.authorization.root, path));
	const paths = gitDirtyPaths(context.authorization.root)
		.filter((path) => !baseline.has(path))
		.sort();
	const commands = commandOutcomes(context.authorization.root, scope);
	const reason = paths.some((path) => evidence.has(path))
		? `GREEN modified frozen evidence: ${paths.filter((path) => evidence.has(path)).join(", ")}`
		: paths.some((path) => !production.some((root) => path === root || path.startsWith(`${root}/`)))
			? `GREEN escaped frozen production scope: ${paths.filter((path) => !production.some((root) => path === root || path.startsWith(`${root}/`))).join(", ")}`
			: !paths.length
				? "GREEN produced no production change"
				: !commands.length || commands.some((command) => !command.passed)
					? "GREEN evidence or deterministic commands are not all passing"
					: null;
	return { verdict: reason ? "fail" : "pass", journal: journal(context), paths, commands, reason };
}

export function commitFeedbackCheckpoint(
	context: FeedbackContext,
	scope: FeedbackClassificationScope,
	phase: "red" | "green" | "refactor",
	verification: FeedbackVerification,
): FeedbackCheckpointJournal {
	if (!Value.Check(feedbackVerificationSchema, verification) || verification.verdict !== "pass")
		throw new Error(`${phase.toUpperCase()} verification did not pass.`);
	const current = journal(context);
	const root = context.authorization.root;
	const parent = git(root, ["rev-parse", "HEAD"]);
	const allowedRoots = (phase === "red" ? scope.evidencePaths : scope.productionPaths).map((path) =>
		resolve(context.authorization.root, path),
	);
	const sha = commitExplicitPaths({
		cwd: root,
		paths: verification.paths,
		baselineDirtyPaths: context.baselineDirtyPaths,
		allowedRoots,
		startHead: context.startHead,
		message:
			phase === "red"
				? `test(${context.authorization.changeId}): establish feedback RED evidence`
				: phase === "green"
					? `fix(${context.authorization.changeId}): address pull-request feedback`
					: `refactor(${context.authorization.changeId}): preserve feedback GREEN behavior`,
	});
	if (phase === "red") {
		if (verification.commands.every((command) => command.passed))
			throw new Error("RED checkpoint requires a failing command.");
		current.red = checkpoint(root, parent, sha, verification.paths, verification.commands);
	} else if (phase === "green") {
		if (!current.red || parent !== current.red.sha) throw new Error("GREEN checkpoint must directly follow RED.");
		if (verification.commands.some((command) => !command.passed))
			throw new Error("GREEN checkpoint requires passing commands.");
		current.green = checkpoint(root, parent, sha, verification.paths, verification.commands);
	} else {
		if (!current.green || parent !== current.green.sha)
			throw new Error("Refactor checkpoint must directly follow GREEN.");
		if (verification.commands.some((command) => !command.passed))
			throw new Error("Refactor checkpoint requires passing commands.");
		current.refactor = checkpoint(root, parent, sha, verification.paths, verification.commands);
	}
	writeJournal(context, current);
	return current;
}

export function skipFeedbackRefactor(context: FeedbackContext): FeedbackCheckpointJournal {
	const current = journal(context);
	if (!current.green) throw new Error("Refactor skip requires a GREEN checkpoint.");
	current.refactor = "skipped";
	writeJournal(context, current);
	return current;
}

export function verifyFeedbackJournal(context: FeedbackContext): FeedbackCheckpointJournal {
	const current = journal(context);
	const verify = (entry: FeedbackCheckpointJournal["red"], parent: string) => {
		if (!entry) return;
		if (git(context.authorization.root, ["rev-parse", `${entry.sha}^`]) !== parent)
			throw new Error("Feedback checkpoint parent drift detected.");
		if (git(context.authorization.root, ["rev-parse", `${entry.sha}^{tree}`]) !== entry.tree)
			throw new Error("Feedback checkpoint tree drift detected.");
		const paths = git(context.authorization.root, ["diff", "--name-only", parent, entry.sha])
			.split("\n")
			.filter(Boolean)
			.sort();
		if (JSON.stringify(paths) !== JSON.stringify(entry.paths))
			throw new Error("Feedback checkpoint path drift detected.");
		if (createHash("sha256").update(JSON.stringify(entry.commands)).digest("hex") !== entry.verificationFingerprint)
			throw new Error("Feedback checkpoint verification drift detected.");
	};
	if (current.red) verify(current.red, current.startHead);
	if (current.green) {
		if (!current.red) throw new Error("GREEN checkpoint has no RED predecessor.");
		verify(current.green, current.red.sha);
	}
	if (current.refactor && current.refactor !== "skipped") {
		if (!current.green) throw new Error("Refactor checkpoint has no GREEN predecessor.");
		verify(current.refactor, current.green.sha);
	}
	return current;
}

export function verifyFeedbackGate(context: FeedbackContext, scope: FeedbackClassificationScope): FeedbackVerification {
	const current = verifyFeedbackJournal(context);
	const candidate = current.refactor && current.refactor !== "skipped" ? current.refactor : current.green;
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	const commands = commandOutcomes(context.authorization.root, scope);
	const reason =
		!candidate || candidate.sha !== head
			? "Current HEAD is not the recorded GREEN/refactor candidate"
			: commands.some((command) => !command.passed)
				? "Current-head deterministic gate is not green"
				: gitDirtyPaths(context.authorization.root).filter((path) => !context.baselineDirtyPaths.includes(path))
							.length
					? "Current-head gate requires no run-owned dirty paths"
					: null;
	return { verdict: reason ? "fail" : "pass", journal: current, paths: candidate?.paths ?? [], commands, reason };
}

export function attestFeedbackPublication(
	context: FeedbackContext,
	gate: FeedbackVerification,
	panel: FeedbackPanel,
): FeedbackCheckpointJournal {
	if (!Value.Check(feedbackPanelSchema, panel) || !["clean", "advisory"].includes(panel.disposition))
		throw new Error("Feedback publication requires a clean or advisory panel receipt.");
	const current = verifyFeedbackJournal(context);
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	if (
		gate.verdict !== "pass" ||
		!current.green ||
		(current.refactor !== "skipped" && current.refactor?.sha !== head) ||
		(current.refactor === "skipped" && current.green.sha !== head)
	)
		throw new Error("Feedback publication requires a current-head gate receipt.");
	current.gate = {
		sha: head,
		passed: true,
		fingerprint: createHash("sha256").update(JSON.stringify(gate)).digest("hex"),
	};
	const disposition: "clean" | "advisory" = panel.disposition === "clean" ? "clean" : "advisory";
	current.panel = {
		sha: head,
		disposition,
		fingerprint: createHash("sha256").update(JSON.stringify(panel)).digest("hex"),
	};
	writeJournal(context, current);
	return current;
}

export function assertFeedbackPublishable(context: FeedbackContext): string {
	const current = verifyFeedbackJournal(context);
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	if (!current.gate?.passed || current.gate.sha !== head || !current.panel || current.panel.sha !== head)
		throw new Error("Feedback push requires current-head gate and panel receipts.");
	if (gitDirtyPaths(context.authorization.root).some((path) => !context.baselineDirtyPaths.includes(path)))
		throw new Error("Feedback push requires no run-owned dirty paths.");
	return head;
}

export async function publishFeedbackCandidate(context: FeedbackContext, head: string, gitAdapter: RemoteGitAdapter) {
	const branch = git(context.authorization.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
	if (!branch || branch !== context.authorization.pullRequest.head)
		throw new Error("Feedback push branch does not match the canonical pull-request head.");
	const remotes = git(context.authorization.root, ["remote"]).split(/\s+/u).filter(Boolean);
	if (remotes.length !== 1) throw new Error("Feedback push requires exactly one remote.");
	const remote = remotes[0]!;
	const remoteUrl = git(context.authorization.root, ["remote", "get-url", remote]);
	const match = remoteUrl.match(/github(?:\.com|\.test)[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/iu);
	const repository = match?.[1]?.replace(/\.git$/u, "");
	if (repository !== context.authorization.pullRequest.repository)
		throw new Error("Feedback push remote does not match the canonical pull-request repository.");
	return publishFeedbackHead(
		{
			authorization: context.authorization,
			remote,
			repository,
			base: context.authorization.pullRequest.base,
			head: branch,
		},
		head,
		gitAdapter,
	);
}

export async function reobserveFeedbackScope(
	scope: FeedbackClassificationScope,
	head: string,
	adapter: Pick<GitHubFeedbackAdapter, "read" | "readPullRequestHead">,
): Promise<readonly ReobserveOutcome[]> {
	const selected = selectedFeedback(scope);
	return selected ? [await reobserveFeedbackRevision(selected.revision, adapter, head)] : [];
}

export async function replyFeedbackScope(
	scope: FeedbackClassificationScope,
	head: string,
	adapter: Pick<GitHubFeedbackAdapter, "findReply" | "postReply" | "read" | "readPullRequestHead">,
): Promise<readonly FeedbackReply[]> {
	const selected = selectedFeedback(scope);
	return selected ? [await replyToFeedback(selected.revision, head, adapter)] : [];
}

export async function resolveFeedbackScope(
	scope: FeedbackClassificationScope,
	replies: readonly FeedbackReply[],
	head: string,
	adapter: Pick<GitHubFeedbackAdapter, "resolveThread" | "read" | "readPullRequestHead">,
): Promise<readonly FeedbackResolution[]> {
	const selected = selectedFeedback(scope);
	if (!selected || !replies[0]) return [];
	return [await resolveFeedbackThread(selected.revision, replies[0], head, adapter)];
}

void acknowledgeFeedback;
