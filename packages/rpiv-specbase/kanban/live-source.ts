import type { WorkflowActivityBoardAdapter } from "../workflow-bridge.js";
import {
	createDirectActionSelection,
	type DirectActionCatalog,
	type DirectActionDescriptor,
	type DirectActionValidation,
} from "./action-dispatch.js";
import type { BoardAction, BoardCard, BoardColumn, BoardSnapshot } from "./types.js";

export const SPECBASE_MODULE_ID = "@awarebydefault/specbase";

export type LiveSourceRequest = { readonly kind: "nearest" } | { readonly kind: "store"; readonly storeId: string };

export interface CanonicalDiagnostic {
	readonly source: string;
	readonly code?: string;
	readonly message: string;
	readonly remediation?: string;
}

export interface CanonicalProgress {
	readonly completed: number;
	readonly total: number;
}

export interface CanonicalIdeaCard {
	readonly kind: "idea";
	readonly id: string;
	readonly title: string;
	readonly created: string | null;
	readonly members: readonly string[];
	readonly [key: string]: unknown;
}

export interface CanonicalChangeCard {
	readonly kind: "change";
	readonly id: string;
	readonly title: string;
	readonly created: string | null;
	readonly artifacts: CanonicalProgress;
	readonly tasks: CanonicalProgress;
	readonly lifecycle: "proposed" | "enforcement" | "ready-to-apply" | "implementing" | "reviewing";
	readonly diagnostics?: readonly CanonicalDiagnostic[];
	readonly [key: string]: unknown;
}

export interface CanonicalArchiveCard {
	readonly kind: "archive";
	readonly id: string;
	readonly title: string;
	readonly archived: string | null;
	readonly tasks: CanonicalProgress;
	readonly artifacts?: CanonicalProgress;
	readonly diagnostics?: readonly CanonicalDiagnostic[];
	readonly [key: string]: unknown;
}

export interface CanonicalSpecCard {
	readonly kind: "spec";
	readonly id: string;
	readonly locator: string;
	readonly title: string;
	readonly requirementCount: number;
	readonly requirements: readonly string[];
	readonly diagnostic: string | null;
	readonly [key: string]: unknown;
}

export type CanonicalWorkCard = CanonicalIdeaCard | CanonicalChangeCard | CanonicalArchiveCard;

export interface CanonicalKanbanSnapshot {
	readonly version: number;
	readonly project: { readonly name: string };
	readonly summary: Readonly<Record<string, unknown>>;
	readonly lanes: {
		readonly ideas: readonly CanonicalIdeaCard[];
		readonly proposed: readonly CanonicalChangeCard[];
		readonly enforcement: readonly CanonicalChangeCard[];
		readonly "ready-to-apply": readonly CanonicalChangeCard[];
		readonly implementing: readonly CanonicalChangeCard[];
		readonly reviewing: readonly CanonicalChangeCard[];
		readonly archived: readonly CanonicalArchiveCard[];
	};
	readonly specs: readonly CanonicalSpecCard[];
	readonly diagnostics: readonly CanonicalDiagnostic[];
}

export type CanonicalValidationResult =
	| { readonly valid: true; readonly snapshot: CanonicalKanbanSnapshot; readonly diagnostics: readonly [] }
	| {
			readonly valid: false;
			readonly snapshot: null;
			readonly diagnostics: readonly { readonly message: string; readonly remediation?: string }[];
	  };

export interface SpecbasePublicApi {
	readonly KANBAN_BOARD_VERSION: number;
	readonly DIRECT_ACTION_CATALOG_VERSION: number;
	readonly deriveKanbanBoard: (root: string) => Promise<unknown>;
	readonly validateKanbanBoardSnapshot: (value: unknown, requestedVersion: number) => CanonicalValidationResult;
	readonly getDirectActions: (options: {
		readonly root?: string;
		readonly workItemId: string;
		readonly storeId?: string;
	}) => Promise<DirectActionCatalog>;
	readonly validateDirectActionIntent: (
		value: unknown,
		options?: { readonly root?: string },
	) => Promise<DirectActionValidation>;
	readonly resolveRegisteredStore: (input: { readonly id: string }) => Promise<{
		readonly id: string;
		readonly storeRoot: string;
	}>;
	readonly resolveCurrentPlanningHomeSync: (options: {
		readonly startPath: string;
		readonly allowImplicitRepoRoot: false;
	}) => { readonly root: string };
}

export interface LiveBoardSource {
	readonly id: string;
	readonly label: string;
	readonly root: string;
	readonly storeId: string | null;
	readonly activity?: WorkflowActivityBoardAdapter;
	/** Re-prove that the selected nearest/registered identity still names this root. */
	assertCurrent(): Promise<void>;
	load(): Promise<BoardSnapshot>;
}

type DynamicImport = (specifier: string) => Promise<unknown>;

const dynamicImport: DynamicImport = (specifier) => import(specifier);

function hasFunction(record: Record<string, unknown>, key: string): boolean {
	return typeof record[key] === "function";
}

export async function loadSpecbasePublicApi(importer: DynamicImport = dynamicImport): Promise<SpecbasePublicApi> {
	let loaded: unknown;
	try {
		loaded = await importer(SPECBASE_MODULE_ID);
	} catch (error) {
		throw new Error(
			`Live Specbase support requires the optional peer ${SPECBASE_MODULE_ID}. ${errorMessage(error)} Next step: install @awarebydefault/specbase@^2 and retry.`,
		);
	}
	if (!loaded || typeof loaded !== "object")
		throw new Error(`${SPECBASE_MODULE_ID} did not expose a module namespace.`);
	const module = loaded as Record<string, unknown>;
	const complete =
		typeof module.KANBAN_BOARD_VERSION === "number" &&
		typeof module.DIRECT_ACTION_CATALOG_VERSION === "number" &&
		hasFunction(module, "deriveKanbanBoard") &&
		hasFunction(module, "validateKanbanBoardSnapshot") &&
		hasFunction(module, "getDirectActions") &&
		hasFunction(module, "validateDirectActionIntent") &&
		hasFunction(module, "resolveRegisteredStore") &&
		hasFunction(module, "resolveCurrentPlanningHomeSync");
	if (!complete) {
		throw new Error(
			`${SPECBASE_MODULE_ID} is incompatible: expected the public kanban, direct-action, validation, nearest-root, and registered-store APIs. Next step: install a compatible @awarebydefault/specbase@^2 release and retry.`,
		);
	}
	return module as unknown as SpecbasePublicApi;
}

export async function createLiveBoardSource(
	request: LiveSourceRequest,
	cwd: string,
	api: SpecbasePublicApi,
	activityFor?: (root: string, storeId: string | null) => WorkflowActivityBoardAdapter,
): Promise<LiveBoardSource> {
	const resolved =
		request.kind === "store"
			? await api.resolveRegisteredStore({ id: request.storeId })
			: {
					id: "nearest",
					storeRoot: api.resolveCurrentPlanningHomeSync({ startPath: cwd, allowImplicitRepoRoot: false }).root,
				};
	const label = request.kind === "store" ? `store ${resolved.id}` : `nearest store at ${resolved.storeRoot}`;
	const activity = activityFor?.(resolved.storeRoot, request.kind === "store" ? resolved.id : null);
	const assertCurrent = async (): Promise<void> => {
		const current =
			request.kind === "store"
				? (await api.resolveRegisteredStore({ id: request.storeId })).storeRoot
				: api.resolveCurrentPlanningHomeSync({ startPath: cwd, allowImplicitRepoRoot: false }).root;
		if (current !== resolved.storeRoot) {
			throw new Error(
				`The selected Specbase source moved from '${resolved.storeRoot}' to '${current}'. Next step: reopen the board from the current source.`,
			);
		}
	};
	return {
		id: request.kind === "store" ? resolved.id : `nearest:${resolved.storeRoot}`,
		label,
		root: resolved.storeRoot,
		storeId: request.kind === "store" ? resolved.id : null,
		...(activity ? { activity } : {}),
		assertCurrent,
		async load() {
			await assertCurrent();
			const value = await api.deriveKanbanBoard(resolved.storeRoot);
			const validation = api.validateKanbanBoardSnapshot(value, api.KANBAN_BOARD_VERSION);
			if (!validation.valid) {
				throw new Error(
					validation.diagnostics
						.map((diagnostic) =>
							diagnostic.remediation
								? `${diagnostic.message} Next step: ${diagnostic.remediation}`
								: diagnostic.message,
						)
						.join(" "),
				);
			}
			// Archived cards are terminal and add no usable dispatch affordance.
			const workCards = Object.values(validation.snapshot.lanes)
				.flat()
				.filter((card) => card.kind !== "archive");
			const catalogs = new Map(
				await Promise.all(
					workCards.map(
						async (card) =>
							[
								card.id,
								await api.getDirectActions({
									workItemId: card.id,
									...(request.kind === "store" ? { storeId: resolved.id } : { root: resolved.storeRoot }),
								}),
							] as const,
					),
				),
			);
			await assertCurrent();
			await activity?.hydrate();
			return projectCanonicalSnapshot(validation.snapshot, resolved.id, label, catalogs);
		},
	};
}

const LANE_ORDER = [
	["ideas", "Ideas"],
	["proposed", "Proposed"],
	["enforcement", "Enforcement"],
	["ready-to-apply", "Ready to apply"],
	["implementing", "Implementing"],
	["reviewing", "Reviewing"],
	["archived", "Archived"],
] as const;

/**
 * Presentation-only projection. Canonical identities and lane arrays are copied
 * verbatim into source fields; no lifecycle or progress state is derived here.
 */
export function projectCanonicalSnapshot(
	snapshot: CanonicalKanbanSnapshot,
	sourceId: string,
	sourceLabel: string,
	catalogs: ReadonlyMap<string, DirectActionCatalog> = new Map(),
): BoardSnapshot {
	const columns: BoardColumn[] = LANE_ORDER.map(([id, label]) => {
		const cards = snapshot.lanes[id];
		return {
			id,
			label,
			cards: cards.map((card) => projectCanonicalCard(card, catalogs.get(card.id))),
			source: cards,
		};
	});
	columns.push({
		id: "specs",
		label: "Accepted specs",
		cards: snapshot.specs.map((card) => projectCanonicalCard(card)),
		source: snapshot.specs,
	});
	const diagnosticSuffix = snapshot.diagnostics.length > 0 ? ` · ${snapshot.diagnostics.length} diagnostics` : "";
	return {
		id: `specbase:${sourceId}`,
		title: `${snapshot.project.name} · ${sourceLabel}${diagnosticSuffix}`,
		columns,
		notices: [
			...snapshot.diagnostics.map(formatDiagnostic),
			...Array.from(catalogs.values()).flatMap((catalog) =>
				catalog.diagnostics.map(
					(diagnostic) => `${diagnostic.code}: ${diagnostic.message} Next step: ${diagnostic.remediation}`,
				),
			),
		],
		source: snapshot,
	};
}

function projectCanonicalCard(card: CanonicalWorkCard | CanonicalSpecCard, catalog?: DirectActionCatalog): BoardCard {
	return {
		id: card.id,
		title: card.title,
		summary: canonicalCardSummary(card),
		actions: catalog ? canonicalActions(catalog) : [],
		source: card,
	};
}

function canonicalCardSummary(card: CanonicalWorkCard | CanonicalSpecCard): string {
	switch (card.kind) {
		case "idea":
			return `${card.created ?? "Created date unavailable"} · ${card.members.length} members`;
		case "change": {
			const diagnostics = card.diagnostics?.length
				? ` · ${card.diagnostics.length} diagnostics · ${formatDiagnostic(card.diagnostics[0]!)}`
				: "";
			return `${card.lifecycle} · tasks ${progress(card.tasks)} · artifacts ${progress(card.artifacts)}${diagnostics}`;
		}
		case "archive": {
			const artifacts = card.artifacts ? ` · artifacts ${progress(card.artifacts)}` : "";
			const diagnostics = card.diagnostics?.length
				? ` · ${card.diagnostics.length} diagnostics · ${formatDiagnostic(card.diagnostics[0]!)}`
				: "";
			return `archived ${card.archived ?? "date unavailable"} · tasks ${progress(card.tasks)}${artifacts}${diagnostics}`;
		}
		case "spec":
			return `${card.locator} · ${card.requirementCount} requirements${card.diagnostic ? ` · ${card.diagnostic}` : ""}`;
	}
}

function formatDiagnostic(diagnostic: CanonicalDiagnostic): string {
	const identity = diagnostic.code ? `${diagnostic.code}: ` : "";
	const remediation = diagnostic.remediation ? ` Next step: ${diagnostic.remediation}` : "";
	return `${identity}${diagnostic.message}${remediation}`;
}

function progress(value: CanonicalProgress): string {
	return `${value.completed}/${value.total}`;
}

function canonicalActions(catalog: DirectActionCatalog): BoardAction[] {
	if (!catalog.target) return [];
	return catalog.actions.map((descriptor: DirectActionDescriptor): BoardAction => {
		const selection = createDirectActionSelection(catalog, descriptor);
		return {
			id: descriptor.actionId,
			label: descriptor.label,
			enabled: descriptor.availability === "available",
			...(descriptor.blocker
				? { detail: `${descriptor.blocker.message} Next step: ${descriptor.blocker.remediation}` }
				: {}),
			...(selection ? { selection } : {}),
			// Preserve exact object identity; presentation fields never become authority.
			source: descriptor,
		};
	});
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		const diagnostic = (
			error as Error & {
				readonly diagnostic?: { readonly fix?: string; readonly remediation?: string };
			}
		).diagnostic;
		const nextStep = diagnostic?.fix ?? diagnostic?.remediation;
		return nextStep ? `${error.message} Next step: ${nextStep}` : error.message;
	}
	return String(error);
}
