import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SkillContract, WorkflowHostContext } from "@juicesharp/rpiv-workflow/registration";
import {
	CapabilityDispatcherRegistry,
	type CapabilityDispatchRequest,
	type CapabilityHandler,
} from "../kanban/action-dispatch.js";
import {
	type DeliveryLaunch,
	LOCAL_DELIVERY_CAPABILITY_ID,
	LOCAL_DELIVERY_MAX_LOCAL_FIXES,
	LOCAL_DELIVERY_MAX_REMEDIATIONS,
	LOCAL_DELIVERY_SKILLS,
	LOCAL_DELIVERY_WORKFLOW_NAME,
	localReviewSchema,
	readinessSchema,
} from "./contracts.js";
import { acquireDeliveryLease, attachRunToDeliveryLease, releaseDeliveryLease } from "./lease.js";

let runtimeRegistration: Promise<void> | undefined;
const activeRuns = new Set<Promise<unknown>>();

function isModuleNotFound(error: unknown): boolean {
	return (
		error instanceof Error &&
		((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
			/Cannot find (?:package|module)/iu.test(error.message))
	);
}

const declared = (contract: Omit<SkillContract, "source">): SkillContract => ({ ...contract, source: "declared" });

export const LOCAL_DELIVERY_SKILL_CONTRACTS: ReadonlyArray<readonly [string, SkillContract]> = [
	[
		LOCAL_DELIVERY_SKILLS.readiness,
		declared({
			consumes: { reads: { capture: { meta: { artifactKind: "specbase-delivery-context" } } } },
			produces: {
				kind: "produces",
				data: readinessSchema as unknown as SkillContract["produces"] extends { data?: infer T } ? T : never,
				meta: { artifactKind: "specbase-delivery-readiness" },
			},
		}),
	],
	[
		LOCAL_DELIVERY_SKILLS.evidence,
		declared({
			consumes: { reads: { capture: {} } },
			produces: { kind: "side-effect", meta: { effect: "evidence-mutation" } },
		}),
	],
	[
		LOCAL_DELIVERY_SKILLS.task,
		declared({
			consumes: { reads: { capture: {} } },
			produces: { kind: "side-effect", meta: { effect: "task-mutation" } },
		}),
	],
	[
		LOCAL_DELIVERY_SKILLS.remediate,
		declared({
			consumes: { reads: { capture: {}, "local-gate": {} } },
			produces: { kind: "side-effect", meta: { effect: "bounded-remediation" } },
		}),
	],
	[
		LOCAL_DELIVERY_SKILLS.review,
		declared({
			consumes: { reads: { capture: {}, "local-gate": {} } },
			produces: {
				kind: "produces",
				data: localReviewSchema as unknown as SkillContract["produces"] extends { data?: infer T } ? T : never,
				meta: { artifactKind: "specbase-local-review" },
			},
		}),
	],
	[
		LOCAL_DELIVERY_SKILLS.fix,
		declared({
			consumes: { reads: { capture: {}, "local-review": {} } },
			produces: { kind: "side-effect", meta: { effect: "bounded-local-fix" } },
		}),
	],
	[
		LOCAL_DELIVERY_SKILLS.commit,
		declared({
			consumes: {
				reads: { capture: {}, "local-gate": {}, "local-review": {} },
				meta: { world: "green-run-owned-tree" },
			},
			produces: { kind: "side-effect", meta: { effect: "git-commit" } },
		}),
	],
] as const;

export function ensureSpecbaseLocalDeliveryRuntime(): Promise<void> {
	if (!runtimeRegistration) {
		const pending = (async () => {
			try {
				const startup = await import("@juicesharp/rpiv-workflow/startup");
				startup.registerBuiltInsProvider(async () => {
					const { specbaseLocalDeliveryWorkflow } = await import("./specbase-local-delivery.js");
					// The module constructs through validatedSpecbaseLocalDeliveryWorkflow(), so
					// registration never sees an unvalidated graph.
					startup.registerBuiltIns([specbaseLocalDeliveryWorkflow]);
				});
				startup.registerSkillContractsProvider(() => {
					startup.registerSkillContracts(LOCAL_DELIVERY_SKILL_CONTRACTS, "rpiv-specbase");
				});
			} catch (error) {
				if (isModuleNotFound(error)) return;
				throw error;
			}
		})();
		runtimeRegistration = pending.catch((error) => {
			runtimeRegistration = undefined;
			throw error;
		});
	}
	return runtimeRegistration;
}

export function __resetSpecbaseLocalDeliveryRegistration(): void {
	runtimeRegistration = undefined;
	activeRuns.clear();
}

export function createLocalDeliveryCapabilityHandler(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	root: string,
): CapabilityHandler {
	return async (request: CapabilityDispatchRequest) => {
		if (request.descriptor.dispatch.capabilityId !== LOCAL_DELIVERY_CAPABILITY_ID) {
			return { accepted: false, reason: `Unsupported capability '${request.descriptor.dispatch.capabilityId}'.` };
		}
		await ensureSpecbaseLocalDeliveryRuntime();
		const args = request.descriptor.dispatch.arguments;
		const changeId = typeof args.changeId === "string" ? args.changeId : undefined;
		const storeId = typeof args.storeId === "string" ? args.storeId : null;
		if (!changeId) return { accepted: false, reason: "Local delivery requires a canonical changeId." };
		const workflowApi = await import("@juicesharp/rpiv-workflow");
		const ownerId = randomUUID();
		const lease = acquireDeliveryLease({ root, storeId, changeId }, ownerId);
		if (!lease.acquired) return { accepted: false, reason: lease.reason };

		const launch: DeliveryLaunch = {
			version: 1,
			ownerId,
			authorization: {
				catalogVersion: request.trigger.meta.catalogVersion,
				actionId: request.trigger.meta.actionId,
				capabilityId: LOCAL_DELIVERY_CAPABILITY_ID,
				changeId,
				storeId,
				root,
			},
		};
		let resolveStarted!: (runId: string) => void;
		const started = new Promise<string>((resolve) => {
			resolveStarted = resolve;
		});
		const observer = { ...ctx, cwd: root } as unknown as WorkflowHostContext;
		const running = workflowApi.runWorkflowByName(observer, LOCAL_DELIVERY_WORKFLOW_NAME, JSON.stringify(launch), {
			host: pi,
			trigger: request.trigger,
			maxIterations: 256,
			maxBackwardJumps: LOCAL_DELIVERY_MAX_REMEDIATIONS + LOCAL_DELIVERY_MAX_LOCAL_FIXES,
			lifecycle: {
				onWorkflowStart: (lifecycle) => {
					attachRunToDeliveryLease(lease.path, ownerId, lifecycle.runId);
					resolveStarted(lifecycle.runId);
				},
			},
		});
		activeRuns.add(running);
		const cleanup = () => {
			activeRuns.delete(running);
			releaseDeliveryLease(lease.path, ownerId);
		};
		void running.then(cleanup, cleanup);
		const result = await Promise.race([
			started.then((runId) => ({ accepted: true as const, runId })),
			running.then(
				(settled) =>
					settled.runId
						? ({ accepted: true as const, runId: settled.runId } as const)
						: ({
								accepted: false as const,
								reason: settled.error ?? "Local-delivery workflow preflight failed.",
							} as const),
				(error) => ({ accepted: false as const, reason: error instanceof Error ? error.message : String(error) }),
			),
		]);
		if (!result.accepted) releaseDeliveryLease(lease.path, ownerId);
		return result;
	};
}

export function createSpecbaseCapabilityDispatcher(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	root: string,
): CapabilityDispatcherRegistry {
	const registry = new CapabilityDispatcherRegistry();
	registry.register(LOCAL_DELIVERY_CAPABILITY_ID, createLocalDeliveryCapabilityHandler(pi, ctx, root));
	return registry;
}
