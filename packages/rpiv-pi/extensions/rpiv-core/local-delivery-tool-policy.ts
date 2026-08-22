import { appendFileSync, mkdirSync, realpathSync } from "node:fs";
import { access, lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type CreateAgentSessionOptions,
	createBashToolDefinition,
	createEditToolDefinition,
	createGrepToolDefinition,
	createLocalBashOperations,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";

export const SPECBASE_LOCAL_DELIVERY_WORKFLOW = "specbase-local-delivery";
export const SPECBASE_DRAFT_PR_WORKFLOW = "specbase-draft-pr-delivery";
export const SPECBASE_READY_TO_REVIEW_WORKFLOW = "specbase-ready-to-review";
export const SPECBASE_PR_FEEDBACK_WORKFLOW = "specbase-pr-feedback";
const BUNDLED_SPECBASE_SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../rpiv-specbase/skills");

export const LOCAL_DELIVERY_ALLOWED_TOOL_NAMES: readonly string[] = Object.freeze([
	"read",
	"grep",
	"ls",
	"bash",
	"edit",
	"write",
]);

export const LOCAL_DELIVERY_EXCLUDED_TOOL_NAMES: readonly string[] = Object.freeze([
	"find",
	"todo",
	"ask_user_question",
	"browser",
	"browser_download",
	"mcp",
	"mcpScript",
	"web_search",
	"web_fetch",
	"fetch_content",
	"github",
	"gh",
	"specbase_review_panel",
	"specbase_archive",
	"specbase_successor",
]);

const SAFE_COMMANDS: readonly RegExp[] = [
	/^git\s+(?:status|diff|log|show|rev-parse|merge-base)(?:\s|$)/u,
	/^npm\s+(?:--version|test)(?:\s|$)/u,
	/^npm\s+run\s+(?:test|check|check:files)(?:\s|$)/u,
	/^specbase\s+(?:--version|status|validate|coverage)(?:\s|$)/u,
	/^pwd$/u,
];
const SAFE_DRAFT_COMMANDS: readonly RegExp[] = [...SAFE_COMMANDS, /^git\s+(?:add|reset|commit)(?:\s|$)/u];

const FORBIDDEN_CAPABILITY =
	/\b(?:curl|wget|ssh|scp|sftp|gh|hub|python|ruby|perl|npx)\b|\bnode\s+(?:-[ep]|--eval|--print)\b|\bnpm\s+exec\b|\bgit\b[^\n;&|]*\b(?:push|fetch|pull|remote|ls-remote|request-pull|send-email|submodule|config)\b|\b(?:specbase|openspec)\s+(?:archive|stack\s+(?:create|advance|apply|archive|pop|push))\b|(?:\/skill:|\/)(?:spcb:)?(?:specbase-)?(?:review-panel|archive|successor)\b/iu;
const SHELL_INDIRECTION = /[;&|<>`\n\r]|\$\(|\$\{|\b(?:bash|sh|zsh|fish|env|command|eval|exec)\b/iu;
const GIT_INJECTION_FLAG = /(?:^|\s)(?:-c|--config(?:-env)?|--output(?:=|\s))/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class LocalDeliveryToolPolicyError extends Error {
	constructor(
		readonly capability: string,
		readonly command: string,
	) {
		super(`specbase-local-delivery denied ${capability} at the child tool boundary`);
		this.name = "LocalDeliveryToolPolicyError";
	}
}

export function assertLocalDeliveryCommand(
	command: string,
	onDenied?: (reason: string, forbidden: boolean) => void,
	allowedCommands: readonly RegExp[] = SAFE_COMMANDS,
): void {
	const trimmed = command.trim();
	const forbidden =
		FORBIDDEN_CAPABILITY.test(trimmed) || (trimmed.startsWith("git ") && GIT_INJECTION_FLAG.test(trimmed));
	const helper = trimmed.match(/^node\s+(\S+)(?:\s|$)/u)?.[1];
	const exactHelper = (() => {
		if (!helper) return false;
		try {
			const actual = realpathSync(helper);
			return ["record-delivery-event.mjs", "commit-local-delivery.mjs"].some(
				(name) => actual === realpathSync(resolve(BUNDLED_SPECBASE_SKILLS, "_shared", name)),
			);
		} catch {
			return false;
		}
	})();
	const reason = forbidden
		? "forbidden remote, network, or lifecycle capability"
		: SHELL_INDIRECTION.test(trimmed)
			? "unsupported shell composition"
			: exactHelper || allowedCommands.some((pattern) => pattern.test(trimmed))
				? undefined
				: "command outside the local-delivery allowlist";
	if (!reason) return;
	onDenied?.(reason, forbidden);
	throw new LocalDeliveryToolPolicyError(reason, command);
}

export function assertDraftPrCommand(command: string, onDenied?: (reason: string, forbidden: boolean) => void): void {
	assertLocalDeliveryCommand(command, onDenied, SAFE_DRAFT_COMMANDS);
}

type SdkCustomTools = NonNullable<CreateAgentSessionOptions["customTools"]>;

export interface WorkflowChildToolPolicy {
	readonly allowedToolNames: readonly string[];
	readonly allowedToolNamesForPrompt?: (prompt: string) => readonly string[];
	readonly excludedToolNames: readonly string[];
	readonly additionalSkillPaths: readonly string[];
	/** SDK custom definitions override same-named built-ins in AgentSession. */
	readonly createToolDefinitions: (cwd: string, prompt?: string) => SdkCustomTools;
}

type ReadyPhase = "evidence" | "implementation" | "refactor" | "artifact" | "panel" | "read-only";
type FeedbackPhase =
	| "evidence"
	| "implementation"
	| "refactor"
	| "classification-artifact"
	| "panel-artifact"
	| "read-only";
type DeliveryPhase = ReadyPhase | FeedbackPhase;

function feedbackPhase(prompt: string): FeedbackPhase {
	if (/specbase-pr-feedback-classify/iu.test(prompt)) return "classification-artifact";
	if (/specbase-pr-feedback-panel/iu.test(prompt)) return "panel-artifact";
	if (/specbase-pr-feedback-author-red|author-red-evidence/iu.test(prompt)) return "evidence";
	if (/specbase-pr-feedback-implement-green|implement-green/iu.test(prompt)) return "implementation";
	if (/green-refactor|\brefactor\b/iu.test(prompt)) return "refactor";
	return "read-only";
}

function readyPhase(prompt: string): ReadyPhase {
	if (/specbase-author-red-evidence|author-evidence/iu.test(prompt)) return "evidence";
	if (/specbase-implement-green|\bimplementation\b/iu.test(prompt)) return "implementation";
	if (/specbase-review-panel/iu.test(prompt)) return "panel";
	if (/specbase-refactor-decision|refactor-decision/iu.test(prompt)) return "artifact";
	if (/specbase-(?:panel-local-fix|green-refactor)|panel-fix|\brefactor\b/iu.test(prompt)) return "refactor";
	if (/specbase-(?:delivery-readiness|ready-review-readiness)|panel-disposition|spec-review/iu.test(prompt))
		return "artifact";
	return "read-only";
}

async function readyMutableScope(
	root: string,
	ownerId?: string,
): Promise<{ evidence: Set<string>; production: string[]; panelMetadata?: string }> {
	if (!ownerId) return { evidence: new Set(), production: [] };
	try {
		const ready = JSON.parse(
			await readFile(
				resolve(root, ".rpiv", "artifacts", "specbase-ready-to-review", ownerId, "ready-context.json"),
				"utf8",
			),
		) as { deliveryContextPath?: unknown; productionRoots?: unknown };
		if (typeof ready.deliveryContextPath !== "string") return { evidence: new Set(), production: [] };
		const delivery = JSON.parse(await readFile(ready.deliveryContextPath, "utf8")) as {
			evidenceUnits?: readonly { paths?: readonly string[] }[];
		};
		let panelMetadata: string | undefined;
		try {
			const remote = JSON.parse(
				await readFile(
					resolve(root, ".rpiv", "artifacts", "specbase-ready-to-review", ownerId, "remote-context.json"),
					"utf8",
				),
			) as { changeMetadataPath?: unknown };
			if (typeof remote.changeMetadataPath === "string")
				panelMetadata = relative(resolve(root), resolve(remote.changeMetadataPath)).split(sep).join("/");
		} catch {
			// Remote context is created immediately before panel; absence stays fail-closed.
		}
		return {
			evidence: new Set(
				(delivery.evidenceUnits ?? [])
					.flatMap((unit) => unit.paths ?? [])
					.map((path) => relative(resolve(root), resolve(root, path)).split(sep).join("/")),
			),
			production: Array.isArray(ready.productionRoots)
				? ready.productionRoots.filter((path): path is string => typeof path === "string")
				: [],
			...(panelMetadata ? { panelMetadata } : {}),
		};
	} catch {
		return { evidence: new Set(), production: [] };
	}
}

async function feedbackMutableScope(
	root: string,
	ownerId?: string,
): Promise<{ evidence: Set<string>; production: string[] }> {
	if (!ownerId || !UUID.test(ownerId)) return { evidence: new Set(), production: [] };
	try {
		const path = resolve(root, ".rpiv", "artifacts", "specbase-pr-feedback", ownerId, "classification.json");
		const scope = JSON.parse(await readFile(path, "utf8")) as {
			ownerId?: unknown;
			evidencePaths?: unknown;
			productionPaths?: unknown;
		};
		if (scope.ownerId !== ownerId || !Array.isArray(scope.evidencePaths) || !Array.isArray(scope.productionPaths))
			return { evidence: new Set(), production: [] };
		const normalize = (value: unknown): string | null => {
			if (typeof value !== "string" || !value) return null;
			const path = relative(resolve(root), resolve(root, value));
			if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return null;
			return path.split(sep).join("/");
		};
		const evidence = scope.evidencePaths.map(normalize);
		const production = scope.productionPaths.map(normalize);
		if (evidence.some((path) => !path) || production.some((path) => !path))
			return { evidence: new Set(), production: [] };
		return { evidence: new Set(evidence as string[]), production: production as string[] };
	} catch {
		return { evidence: new Set(), production: [] };
	}
}

async function guardedPath(
	rootInput: string,
	path: string,
	mutable: boolean,
	ownerId?: string,
	artifactKind = "specbase-local-delivery",
	phase: DeliveryPhase = "implementation",
	evidencePaths: ReadonlySet<string> = new Set(),
	productionRoots: readonly string[] = [],
	panelMetadata?: string,
): Promise<string> {
	const root = resolve(rootInput);
	const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
	const rel = relative(root, absolute);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new LocalDeliveryToolPolicyError("path outside the repository root", path);
	}
	if (mutable && (rel === ".git" || rel.startsWith(`.git${sep}`))) {
		throw new LocalDeliveryToolPolicyError("Git control mutation", path);
	}
	if (mutable && artifactKind === "specbase-pr-feedback") {
		const normalized = rel.split(sep).join("/");
		const ownerArtifact =
			ownerId !== undefined &&
			UUID.test(ownerId) &&
			normalized.startsWith(`.rpiv/artifacts/${artifactKind}/${ownerId}/`);
		if (phase === "read-only") throw new LocalDeliveryToolPolicyError("read-only PR-feedback phase", path);
		const classificationArtifact = normalized.endsWith("/classification.json");
		const panelArtifact = normalized.endsWith("/panel.json");
		if (
			(phase === "classification-artifact" && (!ownerArtifact || !classificationArtifact)) ||
			(phase === "panel-artifact" && (!ownerArtifact || !panelArtifact))
		)
			throw new LocalDeliveryToolPolicyError("artifact-only PR-feedback phase", path);
		if (ownerArtifact && phase !== "classification-artifact" && phase !== "panel-artifact")
			throw new LocalDeliveryToolPolicyError("frozen PR-feedback run artifact mutation", path);
		if ((rel === "specbase" || rel.startsWith(`specbase${sep}`)) && !ownerArtifact)
			throw new LocalDeliveryToolPolicyError("frozen planning artifact mutation", path);
		if (phase === "evidence" && !ownerArtifact && !evidencePaths.has(normalized))
			throw new LocalDeliveryToolPolicyError("undeclared feedback evidence mutation", path);
		if ((phase === "implementation" || phase === "refactor") && evidencePaths.has(normalized))
			throw new LocalDeliveryToolPolicyError("frozen feedback evidence mutation", path);
		if (
			(phase === "implementation" || phase === "refactor") &&
			!ownerArtifact &&
			!productionRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))
		)
			throw new LocalDeliveryToolPolicyError("path outside frozen feedback production scope", path);
	}
	if (mutable && artifactKind === "specbase-ready-to-review") {
		const normalized = rel.split(sep).join("/");
		const ownerArtifact = normalized.startsWith(`.rpiv/artifacts/${artifactKind}/${ownerId ?? "<none>"}/`);
		if (phase === "read-only") throw new LocalDeliveryToolPolicyError("read-only ready-to-review phase", path);
		if (phase === "artifact" && !ownerArtifact)
			throw new LocalDeliveryToolPolicyError("artifact-only ready-to-review phase", path);
		if (phase === "panel" && normalized !== panelMetadata && !ownerArtifact)
			throw new LocalDeliveryToolPolicyError("panel metadata-only mutation", path);
		if (phase === "evidence" && !evidencePaths.has(normalized) && !ownerArtifact)
			throw new LocalDeliveryToolPolicyError("undeclared evidence mutation", path);
		if ((phase === "implementation" || phase === "refactor") && evidencePaths.has(normalized))
			throw new LocalDeliveryToolPolicyError("frozen evidence mutation", path);
		if (
			(rel === "specbase" || rel.startsWith(`specbase${sep}`)) &&
			!(phase === "panel" && normalized === panelMetadata)
		)
			throw new LocalDeliveryToolPolicyError("frozen planning artifact mutation", path);
		if (
			(phase === "implementation" || phase === "refactor") &&
			!ownerArtifact &&
			!productionRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))
		)
			throw new LocalDeliveryToolPolicyError("path outside frozen production scope", path);
	}
	if (mutable && (rel === ".rpiv" || rel.startsWith(`.rpiv${sep}`))) {
		const normalized = rel.split(sep).join("/");
		const owner = ownerId?.replaceAll(/[^A-Za-z0-9-]/gu, "");
		const outputNames =
			artifactKind === "specbase-draft-pr-delivery"
				? "panel-disposition"
				: artifactKind === "specbase-ready-to-review"
					? "readiness|panel-disposition|refactor-decision"
					: artifactKind === "specbase-pr-feedback"
						? "classification|panel|terminal"
						: "readiness|local-review";
		const permittedArtifact =
			owner !== undefined &&
			new RegExp(`^\\.rpiv/artifacts/${artifactKind}/${owner}(?:/(?:${outputNames})\\.json)?$`, "u").test(
				normalized,
			);
		if (!permittedArtifact) throw new LocalDeliveryToolPolicyError("workflow-owned run-control mutation", path);
	}
	let cursor = root;
	for (const part of rel.split(sep).filter(Boolean)) {
		cursor = resolve(cursor, part);
		try {
			if ((await lstat(cursor)).isSymbolicLink()) {
				throw new LocalDeliveryToolPolicyError("symlink path escape", path);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
			throw error;
		}
	}
	return absolute;
}

function denialRecorder(
	root: string,
	ownerId: string | undefined,
	artifactKind: string,
): (reason: string, command: string, forbidden: boolean) => void {
	return (reason, command, forbidden) => {
		if (!ownerId) return;
		const path = resolve(root, ".rpiv", "artifacts", artifactKind, ownerId, "denied.jsonl");
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), reason, command, forbidden })}\n`, "utf8");
	};
}

function localDeliveryPolicy(
	root: string,
	ownerId?: string,
	mode: "local" | "draft" | "ready" | "feedback" = "local",
): WorkflowChildToolPolicy {
	const artifactKind =
		mode === "draft"
			? "specbase-draft-pr-delivery"
			: mode === "ready"
				? "specbase-ready-to-review"
				: mode === "feedback"
					? "specbase-pr-feedback"
					: "specbase-local-delivery";
	const recordDenied = denialRecorder(root, ownerId, artifactKind);
	const allowedToolNames =
		mode === "draft"
			? Object.freeze([...LOCAL_DELIVERY_ALLOWED_TOOL_NAMES, "Agent", "todo"])
			: mode === "feedback"
				? Object.freeze([...LOCAL_DELIVERY_ALLOWED_TOOL_NAMES])
				: LOCAL_DELIVERY_ALLOWED_TOOL_NAMES;
	return Object.freeze({
		allowedToolNames,
		...(mode === "ready"
			? {
					allowedToolNamesForPrompt: (prompt: string) =>
						/specbase-review-panel/iu.test(prompt)
							? Object.freeze([...LOCAL_DELIVERY_ALLOWED_TOOL_NAMES, "Agent", "todo"])
							: LOCAL_DELIVERY_ALLOWED_TOOL_NAMES,
				}
			: {}),
		excludedToolNames: LOCAL_DELIVERY_EXCLUDED_TOOL_NAMES,
		additionalSkillPaths: [BUNDLED_SPECBASE_SKILLS],
		createToolDefinitions: (cwd: string, prompt = "") => {
			const local = createLocalBashOperations();
			const phase: DeliveryPhase =
				mode === "ready" ? readyPhase(prompt) : mode === "feedback" ? feedbackPhase(prompt) : "implementation";
			const scope =
				mode === "ready"
					? readyMutableScope(root, ownerId)
					: mode === "feedback"
						? feedbackMutableScope(root, ownerId).then((value) => ({ ...value, panelMetadata: undefined }))
						: Promise.resolve({ evidence: new Set<string>(), production: ["."], panelMetadata: undefined });
			const guard = async (path: string, mutable: boolean) => {
				const allowed = await scope;
				return guardedPath(
					root,
					path,
					mutable,
					ownerId,
					artifactKind,
					phase,
					allowed.evidence,
					allowed.production,
					allowed.panelMetadata,
				);
			};
			const bash = createBashToolDefinition(cwd, {
				operations: {
					exec: (command, commandCwd, options) => {
						const onDenied = (reason: string, forbidden: boolean) => recordDenied(reason, command, forbidden);
						if (mode === "draft") assertDraftPrCommand(command, onDenied);
						else assertLocalDeliveryCommand(command, onDenied);
						return local.exec(command, commandCwd, options);
					},
				},
			});
			return [
				bash,
				createReadToolDefinition(cwd, {
					operations: {
						readFile: async (path) => readFile(await guard(path, false)),
						access: async (path) => access(await guard(path, false)),
					},
				}),
				createGrepToolDefinition(cwd, {
					operations: {
						isDirectory: async (path) => (await stat(await guard(path, false))).isDirectory(),
						readFile: async (path) => readFile(await guard(path, false), "utf8"),
					},
				}),
				createLsToolDefinition(cwd, {
					operations: {
						exists: async (path) => {
							try {
								await access(await guard(path, false));
								return true;
							} catch {
								return false;
							}
						},
						stat: async (path) => stat(await guard(path, false)),
						readdir: async (path) => readdir(await guard(path, false)),
					},
				}),
				createEditToolDefinition(cwd, {
					operations: {
						readFile: async (path) => readFile(await guard(path, true)),
						writeFile: async (path, content) => writeFile(await guard(path, true), content),
						access: async (path) => access(await guard(path, true)),
					},
				}),
				createWriteToolDefinition(cwd, {
					operations: {
						writeFile: async (path, content) => writeFile(await guard(path, true), content),
						mkdir: async (path) => {
							await mkdir(await guard(path, true), { recursive: true });
						},
					},
				}),
			] as SdkCustomTools;
		},
	});
}

export function resolveWorkflowChildToolPolicy(
	workflow?: string,
	input?: string,
	root = process.cwd(),
): WorkflowChildToolPolicy | undefined {
	if (
		workflow !== SPECBASE_LOCAL_DELIVERY_WORKFLOW &&
		workflow !== SPECBASE_DRAFT_PR_WORKFLOW &&
		workflow !== SPECBASE_READY_TO_REVIEW_WORKFLOW &&
		workflow !== SPECBASE_PR_FEEDBACK_WORKFLOW
	)
		return undefined;
	let ownerId: string | undefined;
	try {
		const parsed = JSON.parse(input ?? "") as { ownerId?: unknown };
		if (
			typeof parsed.ownerId === "string" &&
			(workflow !== SPECBASE_PR_FEEDBACK_WORKFLOW || UUID.test(parsed.ownerId))
		)
			ownerId = parsed.ownerId;
	} catch {
		// Capture performs schema validation and will reject malformed input. The
		// policy still installs fail-closed tools without a denial artifact path.
	}
	return localDeliveryPolicy(
		root,
		ownerId,
		workflow === SPECBASE_DRAFT_PR_WORKFLOW
			? "draft"
			: workflow === SPECBASE_READY_TO_REVIEW_WORKFLOW
				? "ready"
				: workflow === SPECBASE_PR_FEEDBACK_WORKFLOW
					? "feedback"
					: "local",
	);
}
