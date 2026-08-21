import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Value } from "typebox/value";
import {
	type DeliveryAuditEvent,
	type DeliveryCommand,
	type DeliveryCommandOutcome,
	type DeliveryContext,
	type DeliveryLaunch,
	type DeliveryReadiness,
	type DeliveryUnit,
	deliveryContextSchema,
	type FinalGateResult,
	LOCAL_DELIVERY_ARTIFACT_ROOT,
	LOCAL_DELIVERY_MAX_LOCAL_FIXES,
	LOCAL_DELIVERY_MAX_REMEDIATIONS,
	type LocalGateResult,
	type LocalReviewResult,
} from "./contracts.js";
import { deliveryLeasePath, readDeliveryLease, releaseDeliveryLease } from "./lease.js";

export type CommandRunner = (command: DeliveryCommand) => DeliveryCommandOutcome;

export interface CaptureDependencies {
	readonly runJson?: (file: string, args: readonly string[], cwd: string) => unknown;
	readonly now?: () => string;
}

type StatusArtifact = { resolvedOutputPath?: string; existingOutputPaths?: string[] };
type SpecbaseStatus = {
	changeRoot?: string;
	artifactPaths?: Record<string, StatusArtifact>;
	stack?: {
		id?: string;
		position?: number;
		total?: number;
		requiredPredecessor?: string;
		projection?: string;
	};
};

const normalizePath = (root: string, path: string): string => {
	const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
	const rel = relative(resolve(root), absolute);
	return rel === "" ? "." : rel.split(sep).join("/");
};

function runJson(file: string, args: readonly string[], cwd: string): unknown {
	const result = spawnSync(file, [...args], { cwd, encoding: "utf8", timeout: 30_000 });
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`${file} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
	return JSON.parse(result.stdout);
}

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8", timeout: 30_000 });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
	return result.stdout.trim();
}

export function gitDirtyPaths(cwd: string): string[] {
	const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
		cwd,
		encoding: "utf8",
		timeout: 30_000,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`git status failed: ${result.stderr.trim()}`);
	const records = result.stdout.split("\0");
	const paths: string[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const row = records[index];
		if (!row) continue;
		const status = row.slice(0, 2);
		paths.push(row.slice(3).split("\\").join("/"));
		if (/[RC]/u.test(status)) index += 1;
	}
	return [...new Set(paths)]
		.filter(
			(path) =>
				!path.startsWith(".rpiv/artifacts/specbase-local-delivery/") &&
				!path.startsWith(".rpiv/specbase-local-delivery/") &&
				!path.startsWith(".rpiv/workflows/"),
		)
		.sort();
}

export interface BaselineFingerprint {
	readonly path: string;
	readonly workingHash: string | null;
	readonly indexEntry: string;
}

function workingHash(root: string, path: string): string | null {
	const absolute = resolve(root, path);
	try {
		const stat = lstatSync(absolute);
		const bytes = stat.isSymbolicLink() ? Buffer.from(`symlink:${readlinkSync(absolute)}`) : readFileSync(absolute);
		return createHash("sha256").update(bytes).digest("hex");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export function captureBaselineFingerprints(root: string, paths: readonly string[]): BaselineFingerprint[] {
	return [...new Set(paths)].sort().map((path) => ({
		path,
		workingHash: workingHash(root, path),
		indexEntry: git(root, ["ls-files", "-s", "--", path]),
	}));
}

export function changedBaselinePaths(context: DeliveryContext): string[] {
	return context.baselineFingerprints
		.filter(
			(fingerprint) =>
				workingHash(context.authorization.root, fingerprint.path) !== fingerprint.workingHash ||
				git(context.authorization.root, ["ls-files", "-s", "--", fingerprint.path]) !== fingerprint.indexEntry,
		)
		.map((fingerprint) => fingerprint.path);
}

function packageCommands(root: string): DeliveryCommand[] {
	const path = join(root, "package.json");
	if (!existsSync(path)) return [];
	const pkg = JSON.parse(readFileSync(path, "utf8")) as { scripts?: Record<string, string> };
	const scripts = pkg.scripts ?? {};
	const commands: DeliveryCommand[] = [];
	if (scripts.test) commands.push({ id: "repository-tests", file: "npm", args: ["test"], cwd: root });
	if (scripts.check) commands.push({ id: "repository-check", file: "npm", args: ["run", "check"], cwd: root });
	return commands;
}

function sourceCommands(root: string, source: string, type: string, id: string): DeliveryCommand[] {
	const path = source.split("#", 1)[0]!;
	const extension = extname(path);
	if (type === "test" || /\.test\.[cm]?[jt]sx?$/u.test(path)) {
		return [{ id: `source-${id}`, file: "npm", args: ["test", "--", path], cwd: root }];
	}
	if (type === "lint" || type === "static-analysis") {
		return [{ id: `source-${id}`, file: "npm", args: ["run", "check:files", "--", path], cwd: root }];
	}
	if (type === "command" && [".js", ".mjs", ".cjs"].includes(extension)) {
		return [{ id: `source-${id}`, file: "node", args: [path], cwd: root }];
	}
	return [];
}

function parseEnforcement(path: string, root: string): DeliveryUnit[] {
	if (!existsSync(path)) return [];
	const manifestId = normalizePath(root, path);
	const lines = readFileSync(path, "utf8").split(/\r?\n/u);
	const units: DeliveryUnit[] = [];
	let binding: { id: string; type?: string; source?: string; covers: string[] } | undefined;
	let inCovers = false;
	const flush = () => {
		if (!binding?.type || !binding.source) return;
		const source = binding.source;
		const isFileSource = !["review", "manual"].includes(binding.type);
		units.push({
			id: `${manifestId}#${binding.id}`,
			label: `${binding.type} ${source}`,
			kind: "evidence",
			paths: isFileSource ? [source.split("#", 1)[0]!] : [],
			commands: sourceCommands(root, source, binding.type, binding.id),
			covers: binding.covers,
		});
	};
	for (const line of lines) {
		const bindingMatch = line.match(/^ {2}([A-Za-z0-9._-]+):\s*$/u);
		if (bindingMatch) {
			flush();
			binding = { id: bindingMatch[1]!, covers: [] };
			inCovers = false;
			continue;
		}
		if (!binding) continue;
		const field = line.match(/^ {4}(type|source|covers):\s*(.*)$/u);
		if (field) {
			const [, key, raw] = field;
			const value = raw!.trim().replace(/^['"]|['"]$/gu, "");
			if (key === "type") binding.type = value;
			if (key === "source") binding.source = value;
			if (key === "covers" && value) binding.covers.push(value);
			inCovers = key === "covers" && !value;
			continue;
		}
		const list = inCovers ? line.match(/^ {6}-\s+(.+)$/u) : undefined;
		if (list) binding.covers.push(list[1]!.trim().replace(/^['"]|['"]$/gu, ""));
	}
	flush();
	return units;
}

function canonicalArtifactPath(root: string, path: string): string {
	const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
	const rel = relative(resolve(root), absolute);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new Error(`Canonical Specbase artifact escaped the selected repository: ${path}`);
	}
	let cursor = resolve(root);
	for (const part of rel.split(sep).filter(Boolean)) {
		cursor = join(cursor, part);
		if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Refusing symlinked Specbase artifact path: ${path}`);
	}
	return cursor;
}

function parseTasks(path: string, root: string, defaults: readonly DeliveryCommand[]): DeliveryUnit[] {
	if (!existsSync(path)) return [];
	const units: DeliveryUnit[] = [];
	for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
		const match = line.match(/^- \[([ xX])\]\s+([0-9]+(?:\.[0-9]+)*)\s+(.+)$/u);
		if (!match || match[1]!.toLowerCase() === "x") continue;
		const id = match[2]!;
		units.push({
			id,
			label: match[3]!,
			kind: "task",
			paths: [normalizePath(root, path)],
			commands: defaults.map((command) => ({ ...command, id: `task-${id}-${command.id}` })),
			covers: [],
		});
	}
	return units;
}

export function deliveryRunDir(root: string, ownerId: string): string {
	return join(resolve(root), LOCAL_DELIVERY_ARTIFACT_ROOT, ownerId);
}

export function appendDeliveryAudit(path: string, event: DeliveryAuditEvent): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
}

export function readDeliveryAudit(path: string): DeliveryAuditEvent[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split(/\r?\n/u)
		.filter(Boolean)
		.map((line) => {
			const event: unknown = JSON.parse(line);
			if (
				!event ||
				typeof event !== "object" ||
				typeof (event as DeliveryAuditEvent).ts !== "string" ||
				typeof (event as DeliveryAuditEvent).kind !== "string" ||
				!(event as DeliveryAuditEvent).detail ||
				typeof (event as DeliveryAuditEvent).detail !== "object"
			)
				throw new Error(`Malformed local-delivery audit event in ${path}.`);
			return event as DeliveryAuditEvent;
		});
}

export async function validateCanonicalDeliveryAuthorization(
	authorization: DeliveryLaunch["authorization"],
	phase: "capture" | "final" = "capture",
): Promise<void> {
	const packageName = "@awarebydefault/specbase";
	const api = (await import(packageName)) as {
		validateDirectActionIntent?: (
			selection: unknown,
			options: { root: string },
		) => Promise<{
			accepted: boolean;
			descriptor: null | {
				dispatch?: { kind?: string; capabilityId?: string; arguments?: Record<string, unknown> };
			};
		}>;
		getDirectActions?: (options: { root: string; workItemId: string; storeId?: string }) => Promise<{
			target: null | { workItemId: string; storeId: string | null };
			actions: readonly {
				actionId: string;
				dispatch: { kind: string; capabilityId?: string; arguments?: Record<string, unknown> };
			}[];
		}>;
	};
	if (typeof api.validateDirectActionIntent !== "function") {
		throw new Error("The installed Specbase API cannot revalidate local-delivery authority.");
	}
	const validation = await api.validateDirectActionIntent(
		{
			version: authorization.catalogVersion,
			storeId: authorization.storeId,
			workItemId: authorization.changeId,
			actionId: authorization.actionId,
			dispatchKind: "capability",
		},
		{ root: authorization.root },
	);
	const dispatch = validation.descriptor?.dispatch;
	const args = dispatch?.arguments;
	const exact =
		validation.accepted &&
		dispatch?.kind === "capability" &&
		dispatch.capabilityId === authorization.capabilityId &&
		args?.changeId === authorization.changeId &&
		(authorization.storeId === null ? !("storeId" in (args ?? {})) : args?.storeId === authorization.storeId);
	if (exact) return;
	if (phase === "final" && typeof api.getDirectActions === "function") {
		const catalog = await api.getDirectActions({
			root: authorization.root,
			workItemId: authorization.changeId,
			...(authorization.storeId ? { storeId: authorization.storeId } : {}),
		});
		const original = catalog.actions.find((action) => action.actionId === authorization.actionId);
		const originalArgs = original?.dispatch.arguments;
		if (
			catalog.target?.workItemId === authorization.changeId &&
			catalog.target.storeId === authorization.storeId &&
			original?.dispatch.kind === "capability" &&
			original.dispatch.capabilityId === authorization.capabilityId &&
			originalArgs?.changeId === authorization.changeId &&
			(authorization.storeId === null
				? !("storeId" in (originalArgs ?? {}))
				: originalArgs?.storeId === authorization.storeId)
		)
			return;
	}
	throw new Error("Canonical Specbase state no longer authorizes this exact local-delivery lifecycle transition.");
}

export function captureDeliveryContext(
	launch: DeliveryLaunch,
	deps: CaptureDependencies = {},
): { context: DeliveryContext; path: string } {
	const root = resolve(launch.authorization.root);
	const leasePath = deliveryLeasePath({
		root,
		storeId: launch.authorization.storeId,
		changeId: launch.authorization.changeId,
	});
	const lease = readDeliveryLease(leasePath);
	if (!lease || lease.ownerId !== launch.ownerId)
		throw new Error("The local-delivery lease is absent or owned by another run.");
	const status = (deps.runJson ?? runJson)(
		"specbase",
		[
			"status",
			"--change",
			launch.authorization.changeId,
			"--json",
			...(launch.authorization.storeId ? ["--store", launch.authorization.storeId] : []),
		],
		root,
	) as SpecbaseStatus;
	const artifactPaths = Object.values(status.artifactPaths ?? {})
		.flatMap((artifact) => artifact.existingOutputPaths ?? [])
		.map((path) => canonicalArtifactPath(root, path));
	const tasksPathRaw = (status.artifactPaths?.tasks?.existingOutputPaths ?? [])[0];
	const tasksPath = tasksPathRaw ? canonicalArtifactPath(root, tasksPathRaw) : undefined;
	const enforcementPaths = (status.artifactPaths?.enforcement?.existingOutputPaths ?? []).map((path) =>
		canonicalArtifactPath(root, path),
	);
	const defaults = packageCommands(root);
	const evidenceUnits = enforcementPaths.flatMap((path) => parseEnforcement(path, root));
	const taskUnits = tasksPath
		? parseTasks(
				tasksPath,
				root,
				defaults.filter((command) => command.id === "repository-tests"),
			)
		: [];
	const baselineDirtyPaths = gitDirtyPaths(root);
	const runDir = deliveryRunDir(root, launch.ownerId);
	mkdirSync(runDir, { recursive: true });
	const implementationRecordPath = join(runDir, "implementation.jsonl");
	const context: DeliveryContext = {
		version: 1,
		ownerId: launch.ownerId,
		capturedAt: (deps.now ?? (() => new Date().toISOString()))(),
		authorization: launch.authorization,
		leasePath,
		changeRoot: resolve(status.changeRoot ?? join(root, "specbase", "changes", launch.authorization.changeId)),
		artifactPaths,
		stack: {
			id: status.stack?.id ?? null,
			position: status.stack?.position ?? null,
			total: status.stack?.total ?? null,
			requiredPredecessor: status.stack?.requiredPredecessor ?? null,
			projection: status.stack?.projection ?? null,
			successorLaunchAllowed: false,
		},
		startHead: (() => {
			try {
				return git(root, ["rev-parse", "HEAD"]);
			} catch {
				return null;
			}
		})(),
		baselineDirtyPaths,
		baselineFingerprints: captureBaselineFingerprints(root, baselineDirtyPaths),
		allowedRoots: [root],
		evidenceUnits,
		taskUnits,
		gateCommands: [
			{
				id: "specbase-strict-change",
				file: "specbase",
				args: [
					"validate",
					launch.authorization.changeId,
					"--type",
					"change",
					"--strict",
					"--no-interactive",
					...(launch.authorization.storeId ? ["--store", launch.authorization.storeId] : []),
				],
				cwd: root,
			},
			...defaults,
		],
		implementationRecordPath,
	};
	const path = join(runDir, "delivery-context.json");
	writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`, { encoding: "utf8", mode: 0o400 });
	appendDeliveryAudit(implementationRecordPath, {
		ts: context.capturedAt,
		kind: "capture",
		detail: {
			contextPath: path,
			evidenceUnits: evidenceUnits.map((unit) => unit.id),
			taskUnits: taskUnits.map((unit) => unit.id),
		},
	});
	return { context, path };
}

export function readDeliveryContext(path: string): DeliveryContext {
	const candidate: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!Value.Check(deliveryContextSchema, candidate)) throw new Error(`Malformed local-delivery context: ${path}`);
	return candidate as DeliveryContext;
}

export const defaultCommandRunner: CommandRunner = (command) => {
	const result = spawnSync(command.file, [...command.args], { cwd: command.cwd, encoding: "utf8", timeout: 120_000 });
	const summary = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-4_000);
	return {
		commandId: command.id,
		passed: !result.error && result.status === 0,
		exitCode: result.status,
		summary: result.error ? result.error.message : summary,
	};
};

function qualifiedUnitId(unit: Pick<DeliveryUnit, "kind" | "id">): string {
	return `${unit.kind}:${unit.id}`;
}

function completedUnitEvents(context: DeliveryContext): Map<string, DeliveryAuditEvent> {
	return new Map(
		readDeliveryAudit(context.implementationRecordPath)
			.filter((event) => event.kind === "unit-complete" && event.unitId)
			.map((event) => [event.unitId!, event]),
	);
}

function within(path: string, roots: readonly string[], root: string): boolean {
	const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
	return roots.some((allowed) => {
		const rel = relative(resolve(allowed), absolute);
		return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
	});
}

export function runLocalGate(
	context: DeliveryContext,
	attempt: number,
	runner: CommandRunner = defaultCommandRunner,
): LocalGateResult {
	const completed = completedUnitEvents(context);
	const currentDirty = gitDirtyPaths(context.authorization.root);
	const baseline = new Set(context.baselineDirtyPaths);
	const runOwned = currentDirty.filter((path) => !baseline.has(path));
	const baselineChanges = changedBaselinePaths(context);
	const outsideScopePaths = runOwned.filter((path) => !within(path, context.allowedRoots, context.authorization.root));
	const incompleteEvidence = context.evidenceUnits
		.filter((unit) => !completed.has(qualifiedUnitId(unit)))
		.map((unit) => unit.id);
	const incompleteTasks = context.taskUnits
		.filter((unit) => !completed.has(qualifiedUnitId(unit)))
		.map((unit) => unit.id);
	const commandOutcomes = context.gateCommands.map((command) => runner(command));
	const failedChecks = commandOutcomes.filter((outcome) => !outcome.passed).map((outcome) => outcome.commandId);
	if (outsideScopePaths.length) failedChecks.push("scope");
	if (baselineChanges.length) failedChecks.push("baseline-integrity");
	if (incompleteEvidence.length) failedChecks.push("evidence-completeness");
	if (incompleteTasks.length) failedChecks.push("task-completeness");
	const result: LocalGateResult = {
		verdict: failedChecks.length === 0 ? "pass" : "fail",
		attempt,
		failedChecks,
		outsideScopePaths: [...outsideScopePaths, ...baselineChanges.map((path) => `baseline:${path}`)],
		incompleteEvidence,
		incompleteTasks,
		commandOutcomes,
	};
	const path = join(deliveryRunDir(context.authorization.root, context.ownerId), `local-gate-${attempt}.json`);
	writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
	appendDeliveryAudit(context.implementationRecordPath, {
		ts: new Date().toISOString(),
		kind: "gate",
		detail: result,
	});
	return result;
}

export function commitExplicitPaths(options: {
	readonly cwd: string;
	readonly paths: readonly string[];
	readonly baselineDirtyPaths: readonly string[];
	readonly allowedRoots: readonly string[];
	readonly startHead: string | null;
	readonly message: string;
}): string {
	const paths = [...new Set(options.paths.map((path) => normalizePath(options.cwd, path)))].sort();
	if (paths.length === 0) throw new Error("Refusing an empty local-delivery commit.");
	const broadPathspec = paths.find((path) => path === "." || /[*?[\]]/u.test(path));
	if (broadPathspec) throw new Error(`Refusing broad local-delivery pathspec '${broadPathspec}'.`);
	const baseline = new Set(options.baselineDirtyPaths);
	const conflict = paths.find((path) => baseline.has(path));
	if (conflict) throw new Error(`Refusing to commit baseline-dirty path '${conflict}'.`);
	const escaped = paths.find((path) => !within(path, options.allowedRoots, options.cwd));
	if (escaped) throw new Error(`Refusing to commit path outside frozen scope: '${escaped}'.`);
	if (options.startHead) {
		const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", options.startHead, "HEAD"], {
			cwd: options.cwd,
		});
		if (ancestry.status !== 0) throw new Error("HEAD no longer descends from the captured local-delivery start.");
	}
	const preStaged = git(options.cwd, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean).sort();
	try {
		git(options.cwd, ["add", "--", ...paths]);
		const staged = git(options.cwd, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean).sort();
		const expected = [...new Set([...preStaged, ...paths])].sort();
		if (JSON.stringify(staged) !== JSON.stringify(expected)) {
			throw new Error(
				`The staged set did not preserve the baseline index plus explicit paths: ${staged.join(", ")}`,
			);
		}
		git(options.cwd, ["commit", "-m", options.message, "--", ...paths]);
		return git(options.cwd, ["rev-parse", "HEAD"]);
	} catch (error) {
		git(options.cwd, ["reset", "--", ...paths]);
		throw error;
	}
}

export interface GitCommitProof {
	readonly sha: string;
	readonly prevSha: string;
	readonly noOp?: boolean;
	readonly commits?: readonly { readonly sha: string; readonly subject: string }[];
}

function auditChangedPaths(context: DeliveryContext): string[] {
	const paths = new Set<string>();
	for (const event of readDeliveryAudit(context.implementationRecordPath)) {
		const changed = event.detail.changedPaths;
		if (!Array.isArray(changed)) continue;
		for (const path of changed)
			if (typeof path === "string") paths.add(normalizePath(context.authorization.root, path));
	}
	return [...paths].sort();
}

export function runFinalLocalGate(
	context: DeliveryContext,
	commit: GitCommitProof,
	forbiddenRequests: readonly string[] = [],
	runner: CommandRunner = defaultCommandRunner,
): FinalGateResult {
	const root = context.authorization.root;
	const dirty = gitDirtyPaths(root);
	const baseline = new Set(context.baselineDirtyPaths);
	const runOwnedDirtyPaths = dirty.filter((path) => !baseline.has(path));
	const changedBaseline = changedBaselinePaths(context);
	const head = git(root, ["rev-parse", "HEAD"]);
	const commitIds = commit.commits?.map((entry) => entry.sha) ?? (commit.noOp ? [] : [commit.sha]);
	const actualCommitIds = commit.prevSha
		? git(root, ["rev-list", "--reverse", `${commit.prevSha}..${commit.sha}`])
				.split(/\s+/u)
				.filter(Boolean)
		: [];
	const committedPaths = commit.prevSha
		? git(root, ["diff", "--name-only", "-z", commit.prevSha, commit.sha]).split("\0").filter(Boolean).sort()
		: [];
	const expectedPaths = auditChangedPaths(context);
	const commandOutcomes = context.gateCommands.map((command) => runner(command));
	const reasons: string[] = [];
	if (!context.startHead || commit.prevSha !== context.startHead)
		reasons.push("commit baseline differs from captured HEAD");
	if (commit.noOp || commitIds.length === 0) reasons.push("no local commit was created");
	if (head !== commit.sha) reasons.push("HEAD differs from the exact local-commit outcome");
	if (JSON.stringify(actualCommitIds) !== JSON.stringify(commitIds))
		reasons.push("commit journal differs from repository history");
	if (JSON.stringify(committedPaths) !== JSON.stringify(expectedPaths))
		reasons.push("committed paths differ from audited run-owned paths");
	if (runOwnedDirtyPaths.length) reasons.push("run-owned paths remain dirty");
	if (changedBaseline.length) reasons.push("baseline-dirty paths changed during delivery");
	if (forbiddenRequests.length) reasons.push("a forbidden capability was requested");
	if (commandOutcomes.some((outcome) => !outcome.passed)) reasons.push("a final deterministic command failed");
	const result: FinalGateResult = {
		verdict: reasons.length === 0 ? "pass" : "fail",
		commitIds,
		committedPaths,
		runOwnedDirtyPaths,
		baselineDirtyPaths: context.baselineDirtyPaths,
		changedBaselinePaths: changedBaseline,
		forbiddenRequests: [...forbiddenRequests],
		commandOutcomes,
		reasons,
	};
	writeFileSync(
		join(deliveryRunDir(context.authorization.root, context.ownerId), "final-local-gate.json"),
		`${JSON.stringify(result, null, 2)}\n`,
		"utf8",
	);
	appendDeliveryAudit(context.implementationRecordPath, {
		ts: new Date().toISOString(),
		kind: "final",
		detail: result,
	});
	return result;
}

export function readDeniedRequests(context: DeliveryContext): string[] {
	const path = join(deliveryRunDir(context.authorization.root, context.ownerId), "denied.jsonl");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split(/\r?\n/u)
		.filter(Boolean)
		.flatMap((line) => {
			try {
				const event = JSON.parse(line) as { reason?: unknown; command?: unknown; forbidden?: unknown };
				return event.forbidden === true
					? [`${String(event.reason ?? "denied")}: ${String(event.command ?? "")}`]
					: [];
			} catch {
				return ["malformed denied-attempt telemetry"];
			}
		});
}

export function releaseContextLease(context: DeliveryContext): boolean {
	return releaseDeliveryLease(context.leasePath, context.ownerId);
}

export interface FrozenDeliveryHooks {
	readiness(context: DeliveryContext): Promise<DeliveryReadiness> | DeliveryReadiness;
	runUnit(
		unit: DeliveryUnit,
		context: DeliveryContext,
	): Promise<{ passed: boolean; changedPaths: string[]; detail?: Record<string, unknown> }>;
	gate(context: DeliveryContext, attempt: number): Promise<LocalGateResult> | LocalGateResult;
	remediate(context: DeliveryContext, gate: LocalGateResult): Promise<void> | void;
	review(context: DeliveryContext): Promise<LocalReviewResult> | LocalReviewResult;
	fix(context: DeliveryContext, review: LocalReviewResult): Promise<void> | void;
	commit(context: DeliveryContext, paths: readonly string[]): Promise<string[]> | string[];
	final(context: DeliveryContext, commits: readonly string[]): Promise<FinalGateResult> | FinalGateResult;
}

export interface FrozenDeliveryResult {
	readonly status: "completed" | "blocked" | "replan" | "failed";
	readonly reason: string;
	readonly commits: readonly string[];
	readonly remediationAttempts: number;
	readonly localFixAttempts: number;
}

/**
 * Deterministic functional core used by disposable-repository tests and
 * embedders that already own mutation hooks. The RPIV graph uses the same
 * frozen context/audit contracts; agent stages supply these hooks in live use.
 */
export async function executeFrozenDelivery(
	context: DeliveryContext,
	hooks: FrozenDeliveryHooks,
	limits: { readonly remediation?: number; readonly localFix?: number } = {},
): Promise<FrozenDeliveryResult> {
	const maxRemediation = limits.remediation ?? LOCAL_DELIVERY_MAX_REMEDIATIONS;
	const maxLocalFix = limits.localFix ?? LOCAL_DELIVERY_MAX_LOCAL_FIXES;
	let remediationAttempts = 0;
	let localFixAttempts = 0;
	let commits: string[] = [];
	const changedPaths = new Set<string>();
	const stop = (status: FrozenDeliveryResult["status"], reason: string): FrozenDeliveryResult => ({
		status,
		reason,
		commits,
		remediationAttempts,
		localFixAttempts,
	});
	try {
		const readiness = await hooks.readiness(context);
		appendDeliveryAudit(context.implementationRecordPath, {
			ts: new Date().toISOString(),
			kind: "readiness",
			detail: readiness,
		});
		if (readiness.disposition !== "ready") return stop(readiness.disposition, readiness.reasons.join("; "));

		const completed = completedUnitEvents(context);
		for (const event of completed.values()) {
			const priorPaths = event.detail.changedPaths;
			if (Array.isArray(priorPaths)) {
				for (const path of priorPaths) if (typeof path === "string") changedPaths.add(path);
			}
		}
		for (const unit of [...context.evidenceUnits, ...context.taskUnits]) {
			const auditId = qualifiedUnitId(unit);
			if (completed.has(auditId)) continue;
			appendDeliveryAudit(context.implementationRecordPath, {
				ts: new Date().toISOString(),
				kind: "unit-start",
				unitId: auditId,
				detail: { unitKind: unit.kind },
			});
			const outcome = await hooks.runUnit(unit, context);
			if (!outcome.passed) {
				appendDeliveryAudit(context.implementationRecordPath, {
					ts: new Date().toISOString(),
					kind: "unit-failed",
					unitId: auditId,
					detail: outcome.detail ?? {},
				});
				return stop("failed", `${unit.kind} unit '${unit.id}' failed`);
			}
			for (const path of outcome.changedPaths) changedPaths.add(path);
			appendDeliveryAudit(context.implementationRecordPath, {
				ts: new Date().toISOString(),
				kind: "unit-complete",
				unitId: auditId,
				detail: { ...(outcome.detail ?? {}), changedPaths: outcome.changedPaths },
			});
		}

		let gate = await hooks.gate(context, remediationAttempts);
		while (gate.verdict === "fail") {
			if (remediationAttempts >= maxRemediation) return stop("failed", "remediation budget exhausted");
			remediationAttempts += 1;
			await hooks.remediate(context, gate);
			appendDeliveryAudit(context.implementationRecordPath, {
				ts: new Date().toISOString(),
				kind: "remediate",
				detail: { attempt: remediationAttempts, failedChecks: gate.failedChecks },
			});
			gate = await hooks.gate(context, remediationAttempts);
		}

		let review = await hooks.review(context);
		while (review.disposition === "local-fix") {
			if (localFixAttempts >= maxLocalFix) return stop("failed", "local-fix budget exhausted");
			localFixAttempts += 1;
			await hooks.fix(context, review);
			appendDeliveryAudit(context.implementationRecordPath, {
				ts: new Date().toISOString(),
				kind: "local-fix",
				detail: { attempt: localFixAttempts, findings: review.findings.map((finding) => finding.id) },
			});
			gate = await hooks.gate(context, remediationAttempts);
			if (gate.verdict !== "pass") return stop("failed", "local fix regressed the deterministic gate");
			review = await hooks.review(context);
		}
		if (review.disposition === "replan") return stop("replan", "local review found planning drift");
		commits = await hooks.commit(context, [...changedPaths]);
		appendDeliveryAudit(context.implementationRecordPath, {
			ts: new Date().toISOString(),
			kind: "commit",
			detail: { commits, paths: [...changedPaths] },
		});
		const final = await hooks.final(context, commits);
		return final.verdict === "pass"
			? stop("completed", "verified local commits")
			: stop("failed", final.reasons.join("; "));
	} finally {
		releaseContextLease(context);
	}
}
