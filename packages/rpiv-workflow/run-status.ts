import type { Workflow } from "./api.js";
import { reconstructState } from "./runner/resume.js";
import { readHeader, readLastStage, readWorkflowTerminal, summarizeRun } from "./state/index.js";

export type RunStatusName = "pending" | "interrupted" | "completed" | "stopped" | "failed" | "aborted" | "cancelled";

/** Durable, fail-soft terminality projection for a persisted workflow run. */
export interface RunStatus {
	readonly status: RunStatusName;
	readonly terminal: boolean;
	readonly resumable: boolean;
	readonly lastStage?: string;
	readonly stageNumber?: number;
	readonly reason?: string;
}

/**
 * Reconstruct one run through the same strict fold used by resume, then decide
 * terminality from the reconstructed trailer and the resolved workflow graph.
 * A completed stage row is not itself proof that the workflow completed.
 */
export async function readRunStatus(cwd: string, runId: string, workflow: Workflow): Promise<RunStatus | undefined> {
	const header = readHeader(cwd, runId);
	if (!header) return undefined;
	if (header.workflow !== workflow.name) {
		return interrupted(`run header names workflow '${header.workflow}', not '${workflow.name}'`);
	}

	const terminal = readWorkflowTerminal(cwd, runId);
	if (terminal) {
		const last = terminalIdentity(cwd, runId);
		return {
			status: terminal.outcome,
			terminal: true,
			resumable: terminal.resumeSafe,
			...last,
			...(terminal.error ? { reason: terminal.error } : {}),
		};
	}

	const reconstructed = await reconstructState(cwd, workflow, header);
	if (!reconstructed.ok) {
		if (reconstructed.reason === "no-rows") return { status: "pending", terminal: false, resumable: false };
		return interrupted(reconstructed.detail);
	}

	const last = reconstructed.rows.at(-1);
	if (!last) return { status: "pending", terminal: false, resumable: false };
	const identity = { lastStage: last.parent ?? last.stage, stageNumber: last.stageNumber };

	// A collected fan-out halt is explicitly non-terminal: the run survives and
	// resume reconstructs its failed-output sentinel before continuing.
	if (last.collected === true) return { status: "interrupted", terminal: false, resumable: true, ...identity };

	switch (last.status) {
		case "failed":
			return {
				status: "failed",
				terminal: true,
				resumable: true,
				...identity,
				...(last.errMsg ? { reason: last.errMsg } : {}),
			};
		case "aborted":
			return {
				status: "aborted",
				terminal: true,
				resumable: true,
				...identity,
				...(last.errMsg ? { reason: last.errMsg } : {}),
			};
		case "skipped":
			return {
				status: "cancelled",
				terminal: true,
				resumable: true,
				...identity,
				...(last.errMsg ? { reason: last.errMsg } : {}),
			};
		case "completed":
			break;
	}

	// A route-stop is a durable terminal row and the recap owns its exact reason.
	const recap = summarizeRun(cwd, runId);
	if (recap?.outcome === "stopped") {
		return {
			status: "stopped",
			terminal: true,
			resumable: false,
			...identity,
			...(recap.failureReason ? { reason: recap.failureReason } : {}),
		};
	}

	// Unit trailers and open generations are resumable seams, never completed runs.
	if (last.parent !== undefined || reconstructed.trailing !== undefined) {
		return { status: "interrupted", terminal: false, resumable: true, ...identity };
	}

	// Static stop (or the validated graph's omitted terminal edge) is the only
	// completed-stage trailer that proves natural workflow completion. Dynamic or
	// forward static edges still have work to do and are therefore interrupted.
	// Without a run-level terminal marker, even a completed final-stage row is
	// indistinguishable from a crash between stage persistence and settlement.
	// Stay conservative and offer resume; newly written runs carry the marker.
	return { status: "interrupted", terminal: false, resumable: true, ...identity };
}

function terminalIdentity(cwd: string, runId: string): Pick<RunStatus, "lastStage" | "stageNumber"> {
	const last = readLastStage(cwd, runId);
	return last ? { lastStage: last.parent ?? last.stage, stageNumber: last.stageNumber } : {};
}

function interrupted(reason: string): RunStatus {
	return { status: "interrupted", terminal: false, resumable: false, reason };
}
