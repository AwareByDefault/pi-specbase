import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { Value } from "typebox/value";
import type { DirectActionSelection } from "../kanban/action-dispatch.js";
import {
	type CaptureDependencies,
	captureDeliveryContext,
	commitExplicitPaths,
	defaultCommandRunner,
	gitDirtyPaths,
	readDeliveryContext,
} from "./local-delivery.js";
import {
	type CheckpointJournal,
	checkpointJournalSchema,
	READY_TO_REVIEW_ARTIFACT_ROOT,
	type ReadyAuthorization,
	type ReadyContext,
	readyContextSchema,
} from "./ready-to-review-contracts.js";

const readyRunIds = new Map<string, string>();

export function registerReadyRunId(ownerId: string, runId: string): void {
	readyRunIds.set(ownerId, runId);
}

const git = (root: string, args: readonly string[]): string => {
	const result = spawnSync("git", [...args], { cwd: root, encoding: "utf8", timeout: 120_000 });
	if (result.error || result.status !== 0) throw result.error ?? new Error(`git ${args.join(" ")} failed`);
	return result.stdout.trim();
};

export function readyRunDir(root: string, ownerId: string): string {
	return join(resolve(root), READY_TO_REVIEW_ARTIFACT_ROOT, ownerId);
}

export function writeReadyArtifact(root: string, ownerId: string, name: string, value: unknown): string {
	const path = join(readyRunDir(root, ownerId), name);
	mkdirSync(readyRunDir(root, ownerId), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	return path;
}

function declaredProductionRoots(delivery: ReturnType<typeof captureDeliveryContext>["context"]): string[] {
	const candidates = delivery.artifactPaths.filter((path) => /(?:proposal|tasks)\.md$/u.test(path));
	const roots = new Set<string>();
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		const content = readFileSync(path, "utf8");
		for (const match of content.matchAll(/`((?:packages|src|test|tests)\/[^`#]+)`/gu)) {
			const value = match[1]!.replace(/[.,:;]+$/u, "");
			roots.add(projectRelative(delivery.authorization.root, value));
		}
	}
	return [...roots].sort();
}

export function captureReadyContext(
	ownerId: string,
	authorization: ReadyAuthorization,
	deps: CaptureDependencies = {},
): ReadyContext {
	const runId = readyRunIds.get(ownerId);
	if (!runId) throw new Error("Ready-to-review capture requires the lifecycle-assigned run ID.");
	readyRunIds.delete(ownerId);
	const delivery = captureDeliveryContext({ version: 1, ownerId, authorization: authorization as never }, deps);
	if (!delivery.context.startHead) throw new Error("Ready-to-review requires an initial Git HEAD.");
	const journal: CheckpointJournal = { version: 1, ownerId, startHead: delivery.context.startHead };
	const journalPath = writeReadyArtifact(authorization.root, ownerId, "checkpoint-journal.json", journal);
	const context: ReadyContext = {
		version: 1,
		ownerId,
		runId,
		authorization,
		startHead: delivery.context.startHead,
		deliveryContextPath: delivery.path,
		productionRoots: declaredProductionRoots(delivery.context),
		journalPath,
	};
	writeReadyArtifact(authorization.root, ownerId, "ready-context.json", context);
	return context;
}

export function validateReadyResume(root: string, ownerId: string): ReadyContext | null {
	const path = join(readyRunDir(root, ownerId), "ready-context.json");
	if (!existsSync(path)) return null;
	const value: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!Value.Check(readyContextSchema, value)) throw new Error("Ready-to-review resume context is malformed.");
	const context = value as ReadyContext;
	const journal = verifyCheckpointJournal(context);
	const checkpoint =
		journal.refactor && journal.refactor !== "skipped"
			? journal.refactor.sha
			: (journal.green?.sha ?? journal.red?.sha ?? journal.startHead);
	if (git(context.authorization.root, ["rev-parse", "HEAD"]) !== checkpoint)
		throw new Error("Ready-to-review resume HEAD differs from its latest checkpoint.");
	return context;
}

export function readCheckpointJournal(path: string): CheckpointJournal {
	if (!existsSync(path)) throw new Error("Ready-to-review checkpoint journal is missing.");
	const value: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!Value.Check(checkpointJournalSchema, value))
		throw new Error("Ready-to-review checkpoint journal is malformed.");
	return value as CheckpointJournal;
}

export function writeCheckpointJournal(context: ReadyContext, journal: CheckpointJournal): void {
	writeFileSync(context.journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

export interface PhaseVerification {
	readonly verdict: "pass" | "fail";
	readonly journal: CheckpointJournal;
	readonly paths: string[];
	readonly commands: { id: string; passed: boolean; exitCode: number | null; summary: string }[];
	readonly reason: string | null;
}

function projectRelative(root: string, path: string): string {
	const rel = relative(resolve(root), resolve(root, path));
	if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Path escaped repository: ${path}`);
	return rel.split(sep).join("/");
}

function runCommands(deliveryPath: string, phase: "red" | "green") {
	const delivery = readDeliveryContext(deliveryPath);
	const commands = [
		...delivery.evidenceUnits.flatMap((unit) => unit.commands),
		...(phase === "green" ? delivery.gateCommands : []),
	];
	return commands.map((command) => {
		const result = defaultCommandRunner(command);
		return { id: result.commandId, passed: result.passed, exitCode: result.exitCode, summary: result.summary };
	});
}

export function verifyRedPhase(context: ReadyContext): PhaseVerification {
	const delivery = readDeliveryContext(context.deliveryContextPath);
	const baseline = new Set(delivery.baselineDirtyPaths);
	const paths = gitDirtyPaths(context.authorization.root)
		.filter((path) => !baseline.has(path))
		.sort();
	const evidencePaths = new Set(
		delivery.evidenceUnits
			.flatMap((unit) => unit.paths)
			.map((path) => projectRelative(context.authorization.root, path)),
	);
	const escaped = paths.filter((path) => !evidencePaths.has(path));
	const commands = runCommands(context.deliveryContextPath, "red");
	const infrastructureFailure = commands.some(
		(command) => command.exitCode === null || /\b(?:ENOENT|EACCES|ETIMEDOUT|spawn failed)\b/iu.test(command.summary),
	);
	const targetedFailure = commands.length > 0 && commands.some((command) => !command.passed);
	const reason = escaped.length
		? `RED changed undeclared evidence paths: ${escaped.join(", ")}`
		: !paths.length
			? "RED produced no evidence-source change"
			: infrastructureFailure
				? "RED failed because the verification harness was unavailable"
				: !targetedFailure
					? "RED did not produce an expected failing evidence command"
					: null;
	return {
		verdict: reason ? "fail" : "pass",
		journal: readCheckpointJournal(context.journalPath),
		paths,
		commands,
		reason,
	};
}

function markTasksComplete(context: ReadyContext): string[] {
	const delivery = readDeliveryContext(context.deliveryContextPath);
	const changed: string[] = [];
	for (const path of new Set(delivery.taskUnits.flatMap((unit) => unit.paths))) {
		const absolute = resolve(context.authorization.root, path);
		if (!existsSync(absolute)) continue;
		const before = readFileSync(absolute, "utf8");
		const after = before.replace(/(^\s*[-*]\s*)\[\s*\]/gmu, "$1[x]");
		if (after !== before) {
			writeFileSync(absolute, after, "utf8");
			changed.push(projectRelative(context.authorization.root, path));
		}
	}
	return changed;
}

export function verifyGreenPhase(context: ReadyContext): PhaseVerification {
	const delivery = readDeliveryContext(context.deliveryContextPath);
	const evidencePaths = new Set(
		delivery.evidenceUnits
			.flatMap((unit) => unit.paths)
			.map((path) => projectRelative(context.authorization.root, path)),
	);
	const baseline = new Set(delivery.baselineDirtyPaths);
	const implementationPaths = gitDirtyPaths(context.authorization.root).filter((path) => !baseline.has(path));
	const weakenedEvidence = implementationPaths.filter((path) => evidencePaths.has(path));
	const outsideProduction = implementationPaths.filter(
		(path) => !context.productionRoots.some((root) => path === root || path.startsWith(`${root}/`)),
	);
	const commands = runCommands(context.deliveryContextPath, "green");
	let reason = weakenedEvidence.length
		? `GREEN modified frozen evidence: ${weakenedEvidence.join(", ")}`
		: outsideProduction.length
			? `GREEN escaped frozen production scope: ${outsideProduction.join(", ")}`
			: commands.length === 0 || commands.some((command) => !command.passed)
				? "GREEN evidence or gate commands are not all passing"
				: !implementationPaths.length
					? "GREEN produced no implementation change"
					: null;
	const taskPaths = reason ? [] : markTasksComplete(context);
	const paths = [...new Set([...implementationPaths, ...taskPaths])].sort();
	if (!reason && !paths.length) reason = "GREEN produced no commit paths";
	return {
		verdict: reason ? "fail" : "pass",
		journal: readCheckpointJournal(context.journalPath),
		paths,
		commands,
		reason,
	};
}

export function commitVerifiedPhase(
	context: ReadyContext,
	phase: "red" | "green" | "refactor",
	verification: PhaseVerification,
): CheckpointJournal {
	if (verification.verdict !== "pass") throw new Error(`${phase.toUpperCase()} verification did not pass.`);
	const delivery = readDeliveryContext(context.deliveryContextPath);
	const parent = git(context.authorization.root, ["rev-parse", "HEAD"]);
	const sha = commitExplicitPaths({
		cwd: context.authorization.root,
		paths: verification.paths,
		baselineDirtyPaths: delivery.baselineDirtyPaths,
		allowedRoots: delivery.allowedRoots,
		startHead: context.startHead,
		message:
			phase === "red"
				? `test(${context.authorization.changeId}): establish RED evidence`
				: phase === "green"
					? `feat(${context.authorization.changeId}): implement GREEN behavior`
					: `refactor(${context.authorization.changeId}): preserve GREEN behavior`,
	});
	return recordCheckpoint(context, phase, {
		sha,
		parent,
		paths: verification.paths,
		commands: verification.commands,
	});
}

function checkpoint(
	root: string,
	parent: string,
	sha: string,
	paths: readonly string[],
	commands: CheckpointJournal["red"] extends infer T ? (T extends { commands: infer C } ? C : never) : never,
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

export function recordCheckpoint(
	context: ReadyContext,
	phase: "red" | "green" | "refactor",
	input: {
		sha: string;
		parent: string;
		paths: readonly string[];
		commands: { id: string; passed: boolean; exitCode: number | null; summary: string }[];
	},
): CheckpointJournal {
	const journal = readCheckpointJournal(context.journalPath);
	const root = context.authorization.root;
	if (git(root, ["rev-parse", "HEAD"]) !== input.sha) throw new Error("Checkpoint commit is not current HEAD.");
	if (git(root, ["rev-parse", `${input.sha}^`]) !== input.parent)
		throw new Error("Checkpoint parent differs from journal input.");
	if (phase === "red" && input.commands.every((command) => command.passed))
		throw new Error("RED checkpoint requires a targeted failing command.");
	if (phase !== "red" && input.commands.some((command) => !command.passed))
		throw new Error("GREEN/refactor checkpoint requires passing commands.");
	const value = checkpoint(root, input.parent, input.sha, input.paths, input.commands);
	if (phase === "red") journal.red = value;
	else if (phase === "green") {
		if (!journal.red || input.parent !== journal.red.sha)
			throw new Error("GREEN checkpoint must descend directly from RED.");
		journal.green = value;
	} else {
		if (!journal.green || input.parent !== journal.green.sha)
			throw new Error("Refactor checkpoint must descend directly from GREEN.");
		journal.refactor = value;
	}
	writeCheckpointJournal(context, journal);
	return journal;
}

export function verifyCheckpointJournal(context: ReadyContext): CheckpointJournal {
	const journal = readCheckpointJournal(context.journalPath);
	const root = context.authorization.root;
	const verify = (entry: CheckpointJournal["red"], parent: string) => {
		if (!entry) return;
		if (git(root, ["rev-parse", `${entry.sha}^`]) !== parent) throw new Error("Checkpoint parent drift detected.");
		if (git(root, ["rev-parse", `${entry.sha}^{tree}`]) !== entry.tree)
			throw new Error("Checkpoint tree drift detected.");
		const actualPaths = git(root, ["diff", "--name-only", parent, entry.sha]).split("\n").filter(Boolean).sort();
		if (JSON.stringify(actualPaths) !== JSON.stringify(entry.paths))
			throw new Error("Checkpoint path drift detected.");
		const fingerprint = createHash("sha256").update(JSON.stringify(entry.commands)).digest("hex");
		if (fingerprint !== entry.verificationFingerprint)
			throw new Error("Checkpoint verification fingerprint drift detected.");
	};
	if (journal.red) verify(journal.red, journal.startHead);
	if (journal.green) {
		if (!journal.red) throw new Error("GREEN checkpoint has no RED predecessor.");
		verify(journal.green, journal.red.sha);
	}
	if (journal.refactor && journal.refactor !== "skipped") {
		if (!journal.green) throw new Error("Refactor checkpoint has no GREEN predecessor.");
		verify(journal.refactor, journal.green.sha);
	}
	return journal;
}

export function verifyCandidateGate(context: ReadyContext): PhaseVerification {
	const journal = verifyCheckpointJournal(context);
	const candidate = journal.refactor && journal.refactor !== "skipped" ? journal.refactor : journal.green;
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	const commands = runCommands(context.deliveryContextPath, "green");
	const reason =
		!candidate || candidate.sha !== head
			? "Current HEAD is not the recorded GREEN/refactor candidate"
			: commands.length === 0 || commands.some((command) => !command.passed)
				? "Candidate evidence or deterministic gate is not green"
				: gitDirtyPaths(context.authorization.root).length
					? "Candidate gate requires a clean working tree"
					: null;
	return {
		verdict: reason ? "fail" : "pass",
		journal,
		paths: candidate?.paths ?? [],
		commands,
		reason,
	};
}

export function markRefactorSkipped(context: ReadyContext): CheckpointJournal {
	const journal = verifyCheckpointJournal(context);
	if (!journal.green) throw new Error("Refactor decision requires GREEN checkpoint.");
	journal.refactor = "skipped";
	writeCheckpointJournal(context, journal);
	return journal;
}

export function attestPublicationCandidate(
	context: ReadyContext,
	gate: PhaseVerification,
	panel: { disposition: "clean" | "advisory"; report: string; findings: readonly unknown[] },
): CheckpointJournal {
	const journal = verifyCheckpointJournal(context);
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	const candidate = journal.refactor && journal.refactor !== "skipped" ? journal.refactor.sha : journal.green?.sha;
	if (!candidate || head !== candidate || gate.verdict !== "pass")
		throw new Error("Push is unreachable without the current GREEN gate attestation.");
	journal.gate = {
		sha: head,
		passed: true,
		fingerprint: createHash("sha256")
			.update(JSON.stringify({ head, paths: gate.paths, commands: gate.commands, reason: gate.reason }))
			.digest("hex"),
	};
	journal.panel = {
		sha: head,
		disposition: panel.disposition,
		fingerprint: createHash("sha256").update(JSON.stringify(panel)).digest("hex"),
	};
	writeCheckpointJournal(context, journal);
	return journal;
}

export function assertPublishableHead(context: ReadyContext): string {
	const journal = verifyCheckpointJournal(context);
	const head = git(context.authorization.root, ["rev-parse", "HEAD"]);
	if (!journal.gate?.passed || journal.gate.sha !== head || !journal.panel || journal.panel.sha !== head) {
		throw new Error("Push is unreachable without current-head green gate and panel attestations.");
	}
	if (gitDirtyPaths(context.authorization.root).length)
		throw new Error("Push is unreachable with a dirty working tree.");
	return head;
}

export async function recordCanonicalReadyResult(
	context: ReadyContext,
	descriptor: Record<string, unknown>,
): Promise<{ status: "reviewing" | "failed"; changeId: string; url: string | null; reason: string | null }> {
	const api = (await import("@awarebydefault/specbase")) as {
		deriveKanbanBoard?: (root: string) => Promise<{
			lanes?: { reviewing?: readonly { id?: string; pullRequest?: { url?: string; state?: string } }[] };
		}>;
		recordDirectActionResult?: (
			intent: DirectActionSelection,
			result: Record<string, unknown>,
			options: { root: string },
		) => Promise<{
			accepted: boolean;
			snapshot?: { lifecycle?: string; pullRequest?: { url?: string; state?: string } };
			diagnostics?: readonly { message?: string }[];
		}>;
	};
	if (!api.recordDirectActionResult || !api.deriveKanbanBoard)
		throw new Error("The installed Specbase API cannot record and refresh ready-for-review results.");
	const auth = context.authorization;
	const result = await api.recordDirectActionResult(
		{
			version: auth.catalogVersion,
			storeId: auth.storeId,
			workItemId: auth.changeId,
			actionId: auth.actionId,
			dispatchKind: "capability",
		},
		descriptor,
		{ root: auth.root },
	);
	const url = typeof descriptor.url === "string" ? descriptor.url : null;
	const board = result.accepted ? await api.deriveKanbanBoard(auth.root) : null;
	const card = board?.lanes?.reviewing?.find((candidate) => candidate.id === auth.changeId);
	if (
		!result.accepted ||
		result.snapshot?.lifecycle !== "reviewing" ||
		result.snapshot.pullRequest?.url !== url ||
		result.snapshot.pullRequest?.state !== "ready" ||
		card?.pullRequest?.url !== url ||
		card.pullRequest.state !== "ready"
	) {
		return {
			status: "failed",
			changeId: auth.changeId,
			url,
			reason:
				result.diagnostics
					?.map((item) => item.message)
					.filter(Boolean)
					.join("; ") || "canonical ready Reviewing observation failed",
		};
	}
	return { status: "reviewing", changeId: auth.changeId, url, reason: null };
}
