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
	const forbidden = FORBIDDEN_CAPABILITY.test(trimmed);
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
	readonly excludedToolNames: readonly string[];
	readonly additionalSkillPaths: readonly string[];
	/** SDK custom definitions override same-named built-ins in AgentSession. */
	readonly createToolDefinitions: (cwd: string) => SdkCustomTools;
}

async function guardedPath(
	rootInput: string,
	path: string,
	mutable: boolean,
	ownerId?: string,
	artifactKind = "specbase-local-delivery",
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
	if (mutable && (rel === ".rpiv" || rel.startsWith(`.rpiv${sep}`))) {
		const normalized = rel.split(sep).join("/");
		const owner = ownerId?.replaceAll(/[^A-Za-z0-9-]/gu, "");
		const outputNames =
			artifactKind === "specbase-draft-pr-delivery" ? "panel-disposition" : "readiness|local-review";
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
	mode: "local" | "draft" = "local",
): WorkflowChildToolPolicy {
	const artifactKind = mode === "draft" ? "specbase-draft-pr-delivery" : "specbase-local-delivery";
	const recordDenied = denialRecorder(root, ownerId, artifactKind);
	const allowedToolNames =
		mode === "draft"
			? Object.freeze([...LOCAL_DELIVERY_ALLOWED_TOOL_NAMES, "Agent", "todo"])
			: LOCAL_DELIVERY_ALLOWED_TOOL_NAMES;
	return Object.freeze({
		allowedToolNames,
		excludedToolNames: LOCAL_DELIVERY_EXCLUDED_TOOL_NAMES,
		additionalSkillPaths: [BUNDLED_SPECBASE_SKILLS],
		createToolDefinitions: (cwd: string) => {
			const local = createLocalBashOperations();
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
						readFile: async (path) => readFile(await guardedPath(root, path, false, ownerId, artifactKind)),
						access: async (path) => access(await guardedPath(root, path, false, ownerId, artifactKind)),
					},
				}),
				createGrepToolDefinition(cwd, {
					operations: {
						isDirectory: async (path) =>
							(await stat(await guardedPath(root, path, false, ownerId, artifactKind))).isDirectory(),
						readFile: async (path) =>
							readFile(await guardedPath(root, path, false, ownerId, artifactKind), "utf8"),
					},
				}),
				createLsToolDefinition(cwd, {
					operations: {
						exists: async (path) => {
							try {
								await access(await guardedPath(root, path, false, ownerId, artifactKind));
								return true;
							} catch {
								return false;
							}
						},
						stat: async (path) => stat(await guardedPath(root, path, false, ownerId, artifactKind)),
						readdir: async (path) => readdir(await guardedPath(root, path, false, ownerId, artifactKind)),
					},
				}),
				createEditToolDefinition(cwd, {
					operations: {
						readFile: async (path) => readFile(await guardedPath(root, path, true, ownerId, artifactKind)),
						writeFile: async (path, content) =>
							writeFile(await guardedPath(root, path, true, ownerId, artifactKind), content),
						access: async (path) => access(await guardedPath(root, path, true, ownerId, artifactKind)),
					},
				}),
				createWriteToolDefinition(cwd, {
					operations: {
						writeFile: async (path, content) =>
							writeFile(await guardedPath(root, path, true, ownerId, artifactKind), content),
						mkdir: async (path) => {
							await mkdir(await guardedPath(root, path, true, ownerId, artifactKind), { recursive: true });
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
	if (workflow !== SPECBASE_LOCAL_DELIVERY_WORKFLOW && workflow !== SPECBASE_DRAFT_PR_WORKFLOW) return undefined;
	let ownerId: string | undefined;
	try {
		const parsed = JSON.parse(input ?? "") as { ownerId?: unknown };
		if (typeof parsed.ownerId === "string") ownerId = parsed.ownerId;
	} catch {
		// Capture performs schema validation and will reject malformed input. The
		// policy still installs fail-closed tools without a denial artifact path.
	}
	return localDeliveryPolicy(root, ownerId, workflow === SPECBASE_DRAFT_PR_WORKFLOW ? "draft" : "local");
}
