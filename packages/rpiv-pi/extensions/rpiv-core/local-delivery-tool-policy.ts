import { appendFileSync, mkdirSync } from "node:fs";
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
	/^node\s+[^\s]*rpiv-specbase[\\/]skills[\\/](?:[^\\/\s]+[\\/]\.\.[\\/])?_shared[\\/](?:record-delivery-event|commit-local-delivery)\.mjs(?:\s|$)/u,
];
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
): void {
	const trimmed = command.trim();
	const forbidden = FORBIDDEN_CAPABILITY.test(trimmed);
	const reason = forbidden
		? "forbidden remote, network, or lifecycle capability"
		: SHELL_INDIRECTION.test(trimmed)
			? "unsupported shell composition"
			: SAFE_COMMANDS.some((pattern) => pattern.test(trimmed))
				? undefined
				: "command outside the local-delivery allowlist";
	if (!reason) return;
	onDenied?.(reason, forbidden);
	throw new LocalDeliveryToolPolicyError(reason, command);
}

type SdkCustomTools = NonNullable<CreateAgentSessionOptions["customTools"]>;
const BUNDLED_SPECBASE_SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../rpiv-specbase/skills");

export interface WorkflowChildToolPolicy {
	readonly allowedToolNames: readonly string[];
	readonly excludedToolNames: readonly string[];
	readonly additionalSkillPaths: readonly string[];
	/** SDK custom definitions override same-named built-ins in AgentSession. */
	readonly createToolDefinitions: (cwd: string) => SdkCustomTools;
}

async function guardedPath(rootInput: string, path: string, mutable: boolean, ownerId?: string): Promise<string> {
	const root = resolve(rootInput);
	const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
	const rel = relative(root, absolute);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new LocalDeliveryToolPolicyError("path outside the repository root", path);
	}
	if (mutable && (rel === ".rpiv" || rel.startsWith(`.rpiv${sep}`))) {
		const normalized = rel.split(sep).join("/");
		const owner = ownerId?.replaceAll(/[^A-Za-z0-9-]/gu, "");
		const permittedArtifact =
			owner !== undefined &&
			new RegExp(
				`^\\.rpiv/artifacts/specbase-local-delivery/${owner}(?:/(?:readiness|local-review)\\.json)?$`,
				"u",
			).test(normalized);
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

function denialRecorder(root: string, ownerId?: string): (reason: string, command: string, forbidden: boolean) => void {
	return (reason, command, forbidden) => {
		if (!ownerId) return;
		const path = resolve(root, ".rpiv", "artifacts", "specbase-local-delivery", ownerId, "denied.jsonl");
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), reason, command, forbidden })}\n`, "utf8");
	};
}

function localDeliveryPolicy(root: string, ownerId?: string): WorkflowChildToolPolicy {
	const recordDenied = denialRecorder(root, ownerId);
	return Object.freeze({
		allowedToolNames: LOCAL_DELIVERY_ALLOWED_TOOL_NAMES,
		excludedToolNames: LOCAL_DELIVERY_EXCLUDED_TOOL_NAMES,
		additionalSkillPaths: [BUNDLED_SPECBASE_SKILLS],
		createToolDefinitions: (cwd: string) => {
			const local = createLocalBashOperations();
			const bash = createBashToolDefinition(cwd, {
				operations: {
					exec: (command, commandCwd, options) => {
						assertLocalDeliveryCommand(command, (reason, forbidden) => recordDenied(reason, command, forbidden));
						return local.exec(command, commandCwd, options);
					},
				},
			});
			return [
				bash,
				createReadToolDefinition(cwd, {
					operations: {
						readFile: async (path) => readFile(await guardedPath(root, path, false, ownerId)),
						access: async (path) => access(await guardedPath(root, path, false, ownerId)),
					},
				}),
				createGrepToolDefinition(cwd, {
					operations: {
						isDirectory: async (path) =>
							(await stat(await guardedPath(root, path, false, ownerId))).isDirectory(),
						readFile: async (path) => readFile(await guardedPath(root, path, false, ownerId), "utf8"),
					},
				}),
				createLsToolDefinition(cwd, {
					operations: {
						exists: async (path) => {
							try {
								await access(await guardedPath(root, path, false, ownerId));
								return true;
							} catch {
								return false;
							}
						},
						stat: async (path) => stat(await guardedPath(root, path, false, ownerId)),
						readdir: async (path) => readdir(await guardedPath(root, path, false, ownerId)),
					},
				}),
				createEditToolDefinition(cwd, {
					operations: {
						readFile: async (path) => readFile(await guardedPath(root, path, true, ownerId)),
						writeFile: async (path, content) => writeFile(await guardedPath(root, path, true, ownerId), content),
						access: async (path) => access(await guardedPath(root, path, true, ownerId)),
					},
				}),
				createWriteToolDefinition(cwd, {
					operations: {
						writeFile: async (path, content) => writeFile(await guardedPath(root, path, true, ownerId), content),
						mkdir: async (path) => {
							await mkdir(await guardedPath(root, path, true, ownerId), { recursive: true });
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
	if (workflow !== SPECBASE_LOCAL_DELIVERY_WORKFLOW) return undefined;
	let ownerId: string | undefined;
	try {
		const parsed = JSON.parse(input ?? "") as { ownerId?: unknown };
		if (typeof parsed.ownerId === "string") ownerId = parsed.ownerId;
	} catch {
		// Capture performs schema validation and will reject malformed input. The
		// policy still installs fail-closed tools without a denial artifact path.
	}
	return localDeliveryPolicy(root, ownerId);
}
