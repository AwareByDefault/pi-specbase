export type DirectActionDispatchKind = "skill" | "capability";
export type DirectActionCapabilityId = "specbase.local-delivery" | "specbase.draft-pr-delivery";

export interface DirectActionBlocker {
	readonly code: string;
	readonly message: string;
	readonly remediation: string;
}

export interface DirectActionDiagnostic {
	readonly code: string;
	readonly target: { readonly storeId: string | null; readonly workItemId: string | null };
	readonly actionId?: string;
	readonly message: string;
	readonly remediation: string;
}

export interface SkillDispatchDescriptor {
	readonly kind: "skill";
	readonly skillId: string;
	readonly arguments: Readonly<Record<string, unknown>>;
}

export interface CapabilityDispatchDescriptor {
	readonly kind: "capability";
	readonly capabilityId: DirectActionCapabilityId;
	readonly arguments: Readonly<Record<string, unknown>>;
}

export interface DirectActionDescriptor {
	readonly actionId: string;
	readonly label: string;
	readonly availability: "available" | "blocked";
	readonly blocker: DirectActionBlocker | null;
	readonly dispatch: SkillDispatchDescriptor | CapabilityDispatchDescriptor;
}

export interface DirectActionTarget {
	readonly storeId: string | null;
	readonly workItemId: string;
	readonly position: "idea" | "active" | "archived";
}

export interface DirectActionCatalog {
	readonly version: number;
	readonly target: DirectActionTarget | null;
	readonly actions: readonly DirectActionDescriptor[];
	readonly diagnostics: readonly DirectActionDiagnostic[];
}

/** The complete and deliberately minimal client-held selection authority. */
export interface DirectActionSelection {
	readonly version: number;
	readonly storeId: string | null;
	readonly workItemId: string;
	readonly actionId: string;
	readonly dispatchKind: DirectActionDispatchKind;
}

export type DirectActionValidation =
	| { readonly accepted: true; readonly descriptor: DirectActionDescriptor; readonly diagnostics: readonly [] }
	| {
			readonly accepted: false;
			readonly descriptor: null;
			readonly diagnostics: readonly DirectActionDiagnostic[];
	  };

export type DirectActionValidator = (selection: unknown) => Promise<DirectActionValidation>;

export interface PiConversationSender {
	/** Queue the validated skill invocation through Pi's follow-up delivery path. */
	sendUserMessage(invocation: string, options: { readonly deliverAs: "followUp" }): void | Promise<void>;
}

export interface CapabilityTrigger {
	readonly kind: "programmatic";
	readonly source: "rpiv-specbase";
	readonly meta: {
		readonly catalogVersion: number;
		readonly storeId: string | null;
		readonly workItemId: string;
		readonly actionId: string;
		readonly dispatchKind: "capability";
	};
}

export interface CapabilityDispatchRequest {
	/** Exact canonical descriptor returned by fresh validation. */
	readonly descriptor: DirectActionDescriptor & { readonly dispatch: CapabilityDispatchDescriptor };
	/** Exact immutable selection which produced the validated descriptor. */
	readonly intent: DirectActionSelection;
	readonly trigger: CapabilityTrigger;
}

export type CapabilityDispatchResult =
	| { readonly accepted: true; readonly runId: string }
	| { readonly accepted: false; readonly reason: string };

export interface CapabilityDispatcher {
	dispatch(request: CapabilityDispatchRequest): Promise<CapabilityDispatchResult>;
}

export type CapabilityHandler = (request: CapabilityDispatchRequest) => Promise<CapabilityDispatchResult>;

/**
 * Capability names are the public seam. Workflow names and runner internals
 * stay behind handlers registered by whichever package owns delivery.
 */
export class CapabilityDispatcherRegistry implements CapabilityDispatcher {
	private readonly handlers = new Map<DirectActionCapabilityId, CapabilityHandler>();

	register(capabilityId: DirectActionCapabilityId, handler: CapabilityHandler): { dispose(): void } {
		this.handlers.set(capabilityId, handler);
		return {
			dispose: () => {
				if (this.handlers.get(capabilityId) === handler) this.handlers.delete(capabilityId);
			},
		};
	}

	async dispatch(request: CapabilityDispatchRequest): Promise<CapabilityDispatchResult> {
		const capabilityId = request.descriptor.dispatch.capabilityId;
		const handler = this.handlers.get(capabilityId);
		if (!handler) return { accepted: false, reason: `No dispatcher is registered for capability '${capabilityId}'.` };
		return handler(request);
	}
}

export type ActionDispatchPhase = "validating" | "dispatching" | "accepted" | "rejected" | "duplicate";

export interface ActionDispatchFeedback {
	readonly phase: ActionDispatchPhase;
	readonly actionId?: string;
	readonly message: string;
}

export interface DispatchRefreshResult {
	readonly ok: boolean;
	readonly error?: string;
}

export type ActionDispatchOutcome =
	| {
			readonly status: "accepted";
			readonly route: DirectActionDispatchKind;
			readonly actionId: string;
			readonly runId?: string;
			readonly refresh: DispatchRefreshResult;
	  }
	| { readonly status: "rejected"; readonly actionId?: string; readonly reason: string; readonly recoverable: true }
	| { readonly status: "duplicate"; readonly actionId: string };

export interface ActionDispatchCoordinatorOptions {
	readonly validate: DirectActionValidator;
	readonly conversation: PiConversationSender;
	readonly capabilities: CapabilityDispatcher;
	readonly assertSource?: () => void | Promise<void>;
	readonly refresh?: () => void | Promise<void>;
	readonly feedback?: (feedback: ActionDispatchFeedback) => void;
	readonly inFlight?: ActionInFlightRegistry;
}

/** Create a frozen exact selection from one canonical catalog descriptor. */
export function createDirectActionSelection(
	catalog: Pick<DirectActionCatalog, "version" | "target">,
	descriptor: DirectActionDescriptor,
): DirectActionSelection | undefined {
	if (!catalog.target) return undefined;
	return Object.freeze({
		version: catalog.version,
		storeId: catalog.target.storeId,
		workItemId: catalog.target.workItemId,
		actionId: descriptor.actionId,
		dispatchKind: descriptor.dispatch.kind,
	});
}

/** Serialize only the canonical structured skill descriptor; no UI text enters this path. */
export function canonicalSkillInvocation(dispatch: SkillDispatchDescriptor): string | undefined {
	if (!/^[a-z0-9][a-z0-9-]*$/u.test(dispatch.skillId)) return undefined;
	const args = dispatch.arguments;
	const keys = Object.keys(args).sort();
	const primaryKey = "workItemId" in args ? "workItemId" : "changeId" in args ? "changeId" : undefined;
	if (!primaryKey || typeof args[primaryKey] !== "string") return undefined;
	const allowed = new Set([primaryKey, "storeId", ...(primaryKey === "workItemId" ? ["fromIdea"] : [])]);
	if (keys.some((key) => !allowed.has(key))) return undefined;
	if ("storeId" in args && typeof args.storeId !== "string") return undefined;
	if ("fromIdea" in args && args.fromIdea !== true) return undefined;

	const tokens = [`/skill:${dispatch.skillId}`, shellArgument(args[primaryKey])];
	if (args.fromIdea === true) tokens.push("--from-idea");
	if (typeof args.storeId === "string") tokens.push("--store", shellArgument(args.storeId));
	return tokens.join(" ");
}

export class ActionInFlightRegistry {
	private readonly keys = new Set<string>();

	acquire(key: string): boolean {
		if (this.keys.has(key)) return false;
		this.keys.add(key);
		return true;
	}

	release(key: string): void {
		this.keys.delete(key);
	}
}

export class ActionDispatchCoordinator {
	private readonly inFlight: ActionInFlightRegistry;

	constructor(private readonly options: ActionDispatchCoordinatorOptions) {
		this.inFlight = options.inFlight ?? new ActionInFlightRegistry();
	}

	async dispatch(selection: unknown): Promise<ActionDispatchOutcome> {
		const key = selectionKey(selection);
		const actionId = actionIdOf(selection);
		if (key && !this.inFlight.acquire(key)) {
			this.emit({ phase: "duplicate", actionId, message: "That action is already being validated or dispatched." });
			return { status: "duplicate", actionId: actionId ?? "unknown" };
		}
		try {
			this.emit({
				phase: "validating",
				actionId,
				message: "Validating the selected action against fresh canonical state…",
			});
			const validation = await this.options.validate(selection);
			if (!validation.accepted) return this.reject(actionId, diagnosticMessage(validation.diagnostics));
			if (!isExactSelection(selection))
				return this.reject(actionId, "Canonical validation accepted a malformed selection.");

			const descriptor = validation.descriptor;
			if (
				descriptor.actionId !== selection.actionId ||
				descriptor.dispatch.kind !== selection.dispatchKind ||
				descriptor.availability !== "available" ||
				descriptor.blocker !== null
			) {
				return this.reject(actionId, "Fresh canonical validation returned a mismatched action descriptor.");
			}

			try {
				await this.options.assertSource?.();
			} catch (error) {
				return this.reject(actionId, `The presented Specbase source changed: ${errorMessage(error)}`);
			}

			this.emit({ phase: "dispatching", actionId, message: `Queueing canonical action '${descriptor.label}'…` });
			if (descriptor.dispatch.kind === "skill") {
				const invocation = canonicalSkillInvocation(descriptor.dispatch);
				if (!invocation) return this.reject(actionId, "The validated skill descriptor is not transportable.");
				try {
					await this.options.conversation.sendUserMessage(invocation, { deliverAs: "followUp" });
				} catch (error) {
					return this.reject(actionId, `Pi rejected the conversational action: ${errorMessage(error)}`);
				}
				const refresh = await this.refresh();
				this.emit({ phase: "accepted", actionId, message: acceptedMessage(descriptor.label, refresh) });
				return { status: "accepted", route: "skill", actionId: descriptor.actionId, refresh };
			}

			if (!isSupportedCapabilityDescriptor(descriptor, selection)) {
				return this.reject(
					actionId,
					"The validated capability descriptor does not match the selected card and store.",
				);
			}
			const intent = Object.freeze({ ...selection });
			const trigger = correlationTrigger(intent);
			let result: CapabilityDispatchResult;
			try {
				result = await this.options.capabilities.dispatch({ descriptor, intent, trigger });
			} catch (error) {
				return this.reject(actionId, `The capability dispatcher failed: ${errorMessage(error)}`);
			}
			if (!result.accepted) return this.reject(actionId, result.reason);
			if (!result.runId.trim())
				return this.reject(actionId, "The capability dispatcher accepted without a stable run identity.");
			const refresh = await this.refresh();
			this.emit({
				phase: "accepted",
				actionId,
				message: `${acceptedMessage(descriptor.label, refresh)} Run: ${result.runId}.`,
			});
			return {
				status: "accepted",
				route: "capability",
				actionId: descriptor.actionId,
				runId: result.runId,
				refresh,
			};
		} finally {
			if (key) this.inFlight.release(key);
		}
	}

	private reject(actionId: string | undefined, reason: string): ActionDispatchOutcome {
		this.emit({ phase: "rejected", actionId, message: reason });
		return { status: "rejected", ...(actionId ? { actionId } : {}), reason, recoverable: true };
	}

	private async refresh(): Promise<DispatchRefreshResult> {
		if (!this.options.refresh) return { ok: true };
		try {
			await this.options.refresh();
			return { ok: true };
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		}
	}

	private emit(feedback: ActionDispatchFeedback): void {
		this.options.feedback?.(feedback);
	}
}

function isSupportedCapabilityDescriptor(
	descriptor: DirectActionDescriptor,
	selection: DirectActionSelection,
): descriptor is DirectActionDescriptor & { readonly dispatch: CapabilityDispatchDescriptor } {
	if (descriptor.dispatch.kind !== "capability") return false;
	if (
		descriptor.dispatch.capabilityId !== "specbase.local-delivery" &&
		descriptor.dispatch.capabilityId !== "specbase.draft-pr-delivery"
	)
		return false;
	const args = descriptor.dispatch.arguments;
	const keys = Object.keys(args).sort();
	if (keys.some((key) => key !== "changeId" && key !== "storeId")) return false;
	if (args.changeId !== selection.workItemId) return false;
	if (selection.storeId === null) return !("storeId" in args);
	return args.storeId === selection.storeId;
}

function correlationTrigger(intent: DirectActionSelection): CapabilityTrigger {
	return Object.freeze({
		kind: "programmatic",
		source: "rpiv-specbase",
		meta: Object.freeze({
			catalogVersion: intent.version,
			storeId: intent.storeId,
			workItemId: intent.workItemId,
			actionId: intent.actionId,
			dispatchKind: "capability" as const,
		}),
	});
}

function isExactSelection(value: unknown): value is DirectActionSelection {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	const expected = ["actionId", "dispatchKind", "storeId", "version", "workItemId"];
	return (
		keys.length === expected.length &&
		keys.every((key, index) => key === expected[index]) &&
		typeof record.version === "number" &&
		Number.isInteger(record.version) &&
		(typeof record.storeId === "string" || record.storeId === null) &&
		typeof record.workItemId === "string" &&
		typeof record.actionId === "string" &&
		(record.dispatchKind === "skill" || record.dispatchKind === "capability")
	);
}

function selectionKey(value: unknown): string | undefined {
	if (!isExactSelection(value)) return undefined;
	return JSON.stringify([value.version, value.storeId, value.workItemId, value.actionId, value.dispatchKind]);
}

function actionIdOf(value: unknown): string | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const actionId = (value as Record<string, unknown>).actionId;
	return typeof actionId === "string" ? actionId : undefined;
}

function shellArgument(value: string): string {
	return /^[A-Za-z0-9._:@/+-]+$/u.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

function diagnosticMessage(diagnostics: readonly DirectActionDiagnostic[]): string {
	if (diagnostics.length === 0) return "The selected action is no longer valid. Refresh and choose a current action.";
	return diagnostics.map((diagnostic) => `${diagnostic.message} Next step: ${diagnostic.remediation}`).join(" ");
}

function acceptedMessage(label: string, refresh: DispatchRefreshResult): string {
	return refresh.ok
		? `${label} was queued through its canonical adapter.`
		: `${label} was queued, but refresh failed and the last board may be stale: ${refresh.error}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
