import { join } from "node:path";
import {
	acts,
	defineRoute,
	defineWorkflow,
	fanout,
	fs,
	gitCommitOutcome,
	handleToString,
	jsonBodyParser,
	match,
	type Output,
	produces,
	type RunView,
	terminal,
	transcriptPathCollector,
	typeboxSchema,
	type Unit,
	validateWorkflow,
	type Workflow,
} from "@juicesharp/rpiv-workflow/registration";
import { Value } from "typebox/value";
import {
	type DeliveryContext,
	type DeliveryLaunch,
	deliveryContextSchema,
	deliveryLaunchSchema,
	finalGateSchema,
	LOCAL_DELIVERY_MAX_LOCAL_FIXES,
	LOCAL_DELIVERY_MAX_REMEDIATIONS,
	LOCAL_DELIVERY_SKILLS,
	LOCAL_DELIVERY_WORKFLOW_NAME,
	localGateSchema,
	localReviewSchema,
	readinessSchema,
} from "./contracts.js";
import { acquireDeliveryLease, attachRunToDeliveryLease, releaseDeliveryLease } from "./lease.js";
import {
	appendDeliveryAudit,
	captureDeliveryContext,
	deliveryRunDir,
	readDeniedRequests,
	releaseContextLease,
	runFinalLocalGate,
	runLocalGate,
	validateCanonicalDeliveryAuthorization,
} from "./local-delivery.js";

const resumedLeases = new Map<string, { path: string; ownerId: string }>();

function parseLaunch(input: string): DeliveryLaunch {
	const candidate: unknown = JSON.parse(input);
	if (!Value.Check(deliveryLaunchSchema, candidate)) throw new Error("Invalid local-delivery launch envelope.");
	return candidate as DeliveryLaunch;
}

const artifactOutcome = (name: string, file: string) => ({
	name,
	collector: transcriptPathCollector({
		pattern: new RegExp(`SPECBASE_DELIVERY_ARTIFACT:\\s+(\\S*${file.replace(".", "\\.")})`, "u"),
	}),
	parser: jsonBodyParser,
});

const readinessOutcome = artifactOutcome("readiness", "readiness.json");
const reviewOutcome = artifactOutcome("local-review", "local-review.json");

function capturedContext(state: RunView): DeliveryContext {
	const output = state.named.capture?.at(-1);
	if (!output) throw new Error("Local delivery cannot continue without its frozen capture output.");
	return output.data as DeliveryContext;
}

function commitProof(state: RunView): {
	sha: string;
	prevSha: string;
	noOp?: boolean;
	commits?: readonly { sha: string; subject: string }[];
} {
	// final-local-gate follows local-commit directly, so the rolling output is
	// the collector-validated gitCommitOutcome. This workflow is non-resumable.
	const data = state.output?.data as Record<string, unknown> | undefined;
	if (!data || typeof data.sha !== "string" || typeof data.prevSha !== "string") {
		throw new Error("Final local gate requires the exact local-commit outcome.");
	}
	return data as {
		sha: string;
		prevSha: string;
		noOp?: boolean;
		commits?: readonly { sha: string; subject: string }[];
	};
}

function capturePath(state: RunView): string {
	const artifact = state.named.capture?.at(-1)?.artifacts[0];
	if (!artifact) throw new Error("Local delivery cannot continue without its delivery-context artifact.");
	return handleToString(artifact.handle);
}

function units(kind: "evidence" | "task") {
	return ({ state }: { state: RunView }): Unit[] => {
		const context = capturedContext(state);
		const frozen = kind === "evidence" ? context.evidenceUnits : context.taskUnits;
		if (frozen.length === 0) {
			return [{ id: `no-${kind}`, label: `no ${kind} units`, prompt: `--context ${capturePath(state)} --noop` }];
		}
		return frozen.map((unit, index) => ({
			id: `${kind}:${unit.id}`,
			label: `${kind} ${index + 1}/${frozen.length}: ${unit.id}`,
			prompt: `--context ${capturePath(state)} --unit ${unit.id}`,
		}));
	};
}

function stopAndRelease(reason: string) {
	return terminal.script({
		run: ({ state }) => {
			const context = capturedContext(state);
			appendDeliveryAudit(context.implementationRecordPath, {
				ts: new Date().toISOString(),
				kind: "stop",
				detail: { reason },
			});
			releaseContextLease(context);
		},
	});
}

function latestGateArtifact(state: RunView): Output | undefined {
	return state.named["local-gate"]?.at(-1);
}

const gateRoute = defineRoute(["local-review", "remediate", "stop-remediation-budget"], ({ output, state }) => {
	const verdict = (output?.data as { verdict?: unknown } | undefined)?.verdict;
	if (verdict === "pass") return "local-review";
	if (verdict !== "fail") return "stop-remediation-budget";
	return (state.named.remediate?.length ?? 0) >= LOCAL_DELIVERY_MAX_REMEDIATIONS
		? "stop-remediation-budget"
		: "remediate";
});

const reviewRoute = defineRoute(
	["local-commit", "local-fix", "stop-review-replan", "stop-local-fix-budget"],
	({ output, state }) => {
		const disposition = (output?.data as { disposition?: unknown } | undefined)?.disposition;
		if (disposition === "clean") return "local-commit";
		if (disposition === "replan") return "stop-review-replan";
		if (disposition !== "local-fix") return "stop-review-replan";
		return (state.named["local-fix"]?.length ?? 0) >= LOCAL_DELIVERY_MAX_LOCAL_FIXES
			? "stop-local-fix-budget"
			: "local-fix";
	},
);

const localDeliveryWorkflow = defineWorkflow({
	name: LOCAL_DELIVERY_WORKFLOW_NAME,
	description: `Deliver one canonically authorized Specbase change to verified local commits. Evidence and tasks mutate serially; remediation is capped at ${LOCAL_DELIVERY_MAX_REMEDIATIONS} rounds and local fixes at ${LOCAL_DELIVERY_MAX_LOCAL_FIXES}. Remote Git/GitHub, review-panel, archive, and successor capabilities are denied by the execution host.`,
	resume: {
		before: async ({ input, runId }) => {
			const launch = parseLaunch(input);
			await validateCanonicalDeliveryAuthorization(launch.authorization, "final");
			const lease = acquireDeliveryLease(
				{
					root: launch.authorization.root,
					storeId: launch.authorization.storeId,
					changeId: launch.authorization.changeId,
				},
				launch.ownerId,
			);
			if (!lease.acquired) throw new Error(lease.reason);
			attachRunToDeliveryLease(lease.path, launch.ownerId, runId);
			resumedLeases.set(runId, { path: lease.path, ownerId: launch.ownerId });
		},
		after: ({ runId }) => {
			const lease = resumedLeases.get(runId);
			if (!lease) return;
			resumedLeases.delete(runId);
			releaseDeliveryLease(lease.path, lease.ownerId);
		},
	},
	start: "capture",
	stages: {
		capture: produces.script({
			outputSchema: typeboxSchema(deliveryContextSchema),
			onInvalid: "halt",
			run: async ({ state }) => {
				const launch = parseLaunch(state.originalInput);
				await validateCanonicalDeliveryAuthorization(launch.authorization);
				const captured = captureDeliveryContext(launch);
				return {
					kind: "json",
					artifacts: [{ handle: fs(captured.path), role: "primary" }],
					data: captured.context,
				};
			},
		}),
		readiness: produces({
			skill: LOCAL_DELIVERY_SKILLS.readiness,
			outcome: readinessOutcome,
			outputSchema: typeboxSchema(readinessSchema),
			onInvalid: "halt",
			reads: ["capture"],
		}),
		"implement-evidence": acts({
			skill: LOCAL_DELIVERY_SKILLS.evidence,
			reads: ["capture"],
			loop: fanout({
				source: "capture",
				unit: { by: "frozen-delivery-context", pattern: "evidenceUnits" },
				units: units("evidence"),
				concurrency: 1,
				failFast: true,
				max: 128,
				onCap: "halt",
			}),
		}),
		"implement-task": acts({
			skill: LOCAL_DELIVERY_SKILLS.task,
			reads: ["capture"],
			loop: fanout({
				source: "capture",
				unit: { by: "frozen-delivery-context", pattern: "taskUnits" },
				units: units("task"),
				concurrency: 1,
				failFast: true,
				max: 128,
				onCap: "halt",
			}),
		}),
		"local-gate": produces.script({
			outputSchema: typeboxSchema(localGateSchema),
			onInvalid: "halt",
			run: ({ state }) => {
				const context = capturedContext(state);
				const attempt = state.named["local-gate"]?.length ?? 0;
				const result = runLocalGate(context, attempt);
				const path = join(
					deliveryRunDir(context.authorization.root, context.ownerId),
					`local-gate-${attempt}.json`,
				);
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		remediate: acts({
			skill: LOCAL_DELIVERY_SKILLS.remediate,
			reads: ["capture", "local-gate"],
		}),
		"local-review": produces({
			skill: LOCAL_DELIVERY_SKILLS.review,
			outcome: reviewOutcome,
			outputSchema: typeboxSchema(localReviewSchema),
			onInvalid: "halt",
			reads: ["capture", "local-gate"],
		}),
		"local-fix": acts({
			skill: LOCAL_DELIVERY_SKILLS.fix,
			reads: ["capture", "local-review"],
		}),
		"local-commit": acts({
			skill: LOCAL_DELIVERY_SKILLS.commit,
			outcome: gitCommitOutcome,
			reads: ["capture", "local-gate", "local-review"],
		}),
		"final-local-gate": produces.script({
			outputSchema: typeboxSchema(finalGateSchema),
			onInvalid: "halt",
			reads: ["capture"],
			run: async ({ state }) => {
				const context = capturedContext(state);
				await validateCanonicalDeliveryAuthorization(context.authorization, "final");
				const result = runFinalLocalGate(context, commitProof(state), readDeniedRequests(context));
				const path = join(deliveryRunDir(context.authorization.root, context.ownerId), "final-local-gate.json");
				return { kind: "json", artifacts: [{ handle: fs(path), role: "primary" }], data: result };
			},
		}),
		"stop-blocked": stopAndRelease("readiness blocked"),
		"stop-replan": stopAndRelease("planning mismatch requires replan"),
		"stop-review-replan": stopAndRelease("local review found planning drift"),
		"stop-remediation-budget": stopAndRelease("remediation budget exhausted"),
		"stop-local-fix-budget": stopAndRelease("local-fix budget exhausted"),
		"stop-final-failed": stopAndRelease("final local gate failed"),
		complete: stopAndRelease("verified local commits"),
	},
	edges: {
		capture: "readiness",
		readiness: match("disposition", {
			"implement-evidence": "ready",
			"stop-blocked": "blocked",
			"stop-replan": "replan",
		}),
		"implement-evidence": "implement-task",
		"implement-task": "local-gate",
		"local-gate": gateRoute,
		remediate: "local-gate",
		"local-review": reviewRoute,
		"local-fix": "local-gate",
		"local-commit": "final-local-gate",
		"final-local-gate": match("verdict", { complete: "pass", "stop-final-failed": "fail" }),
		"stop-blocked": "stop",
		"stop-replan": "stop",
		"stop-review-replan": "stop",
		"stop-remediation-budget": "stop",
		"stop-local-fix-budget": "stop",
		"stop-final-failed": "stop",
		complete: "stop",
	},
});

void latestGateArtifact;

export function validatedSpecbaseLocalDeliveryWorkflow(): Workflow {
	const issues = validateWorkflow(localDeliveryWorkflow).filter((issue) => issue.severity === "error");
	if (issues.length > 0) {
		throw new Error(
			`Invalid ${LOCAL_DELIVERY_WORKFLOW_NAME} workflow: ${issues.map((issue) => issue.message).join("; ")}`,
		);
	}
	return localDeliveryWorkflow;
}

export const specbaseLocalDeliveryWorkflow = validatedSpecbaseLocalDeliveryWorkflow();
