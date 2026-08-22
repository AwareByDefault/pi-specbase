import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FeedbackContext, FeedbackRevision } from "./pr-feedback-contracts.js";
import { feedbackBodyDigest, feedbackRevisionKey } from "./pr-feedback-delivery.js";
import {
	assertFeedbackPublishable,
	attestFeedbackPublication,
	commitFeedbackCheckpoint,
	createFeedbackContext,
	publishFeedbackCandidate,
	reobserveFeedbackScope,
	replyFeedbackScope,
	resolveFeedbackScope,
	skipFeedbackRefactor,
	validateFeedbackClassificationScope,
	verifyFeedbackGate,
	verifyFeedbackGreen,
	verifyFeedbackRed,
} from "./pr-feedback-execution.js";

const roots: string[] = [];
const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const initialSha = "a".repeat(40);
const revision = (): FeedbackRevision => ({
	version: 1,
	repository: "acme/widget",
	pullRequest: 7,
	namespace: "review-thread",
	commentId: "comment-1",
	threadId: "thread-1",
	updatedAt: "2026-01-01T00:00:00Z",
	bodyDigest: "b".repeat(64),
	headSha: initialSha,
	resolvable: true,
});

function git(root: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fixture(): { root: string; context: FeedbackContext } {
	const root = mkdtempSync(join(tmpdir(), "pr-feedback-e2e-"));
	roots.push(root);
	git(root, "init", "-q");
	git(root, "config", "user.email", "test@example.test");
	git(root, "config", "user.name", "Test");
	git(root, "remote", "add", "origin", "https://github.test/acme/widget.git");
	writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node check.cjs" } }));
	writeFileSync(
		join(root, "check.cjs"),
		"process.exit(require('fs').readFileSync('production.txt','utf8').includes('green') ? 0 : 1)\n",
	);
	writeFileSync(join(root, "evidence.txt"), "baseline\n");
	writeFileSync(join(root, "production.txt"), "red\n");
	writeFileSync(join(root, ".gitignore"), ".rpiv/\n");
	git(root, "add", ".");
	git(root, "commit", "-qm", "initial");
	git(root, "checkout", "-qb", "topic");
	const head = git(root, "rev-parse", "HEAD");
	const snapshot = {
		version: 1 as const,
		repository: "acme/widget",
		pullRequest: 7,
		headSha: head,
		items: [
			{
				...revision(),
				headSha: head,
				bodyDigest: feedbackBodyDigest("please fix"),
				body: "please fix",
				untrusted: true as const,
			},
		],
	};
	const context = createFeedbackContext(
		ownerId,
		"run",
		{
			catalogVersion: 1,
			actionId: "pr-feedback",
			capabilityId: "specbase.pr-feedback",
			changeId: "change",
			storeId: null,
			root,
			pullRequest: {
				number: 7,
				url: "https://github.test/acme/widget/pull/7",
				repository: "acme/widget",
				base: "main",
				head: "topic",
				headSha: head,
			},
		},
		snapshot,
	);
	return { root, context };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("PR-feedback host delivery", () => {
	it("runs every non-agent stage against a disposable repository rather than accepting no-op receipts", async () => {
		const { root, context } = fixture();
		const feedback = context.snapshot.items[0]!;
		const scope = validateFeedbackClassificationScope(context, {
			version: 1,
			ownerId,
			snapshotHeadSha: context.snapshot.headSha,
			classifications: [
				{
					revision: { ...feedback, body: undefined, untrusted: undefined },
					classification: "fix",
					rationale: "behavior is missing",
					behaviorDefect: true,
				},
			],
			selectedRevisionKey: feedbackRevisionKey(feedback),
			evidencePaths: ["evidence.txt"],
			productionPaths: ["production.txt"],
			commands: ["npm test"],
		});

		writeFileSync(join(root, "evidence.txt"), "regression\n");
		const red = verifyFeedbackRed(context, scope);
		expect(red.verdict).toBe("pass");
		const redJournal = commitFeedbackCheckpoint(context, scope, "red", red);
		expect(redJournal.red?.paths).toEqual(["evidence.txt"]);

		writeFileSync(join(root, "production.txt"), "green\n");
		const green = verifyFeedbackGreen(context, scope);
		expect(green.verdict).toBe("pass");
		const greenJournal = commitFeedbackCheckpoint(context, scope, "green", green);
		expect(greenJournal.green?.parent).toBe(redJournal.red?.sha);
		skipFeedbackRefactor(context);
		const gate = verifyFeedbackGate(context, scope);
		expect(gate.verdict).toBe("pass");
		attestFeedbackPublication(context, gate, {
			ownerId: context.ownerId,
			headSha: greenJournal.green!.sha,
			disposition: "clean",
			report: "clean",
			findings: [],
		});
		const published = assertFeedbackPublishable(context);

		const pushed: string[] = [];
		let remoteHead: string | null = null;
		const remote = await publishFeedbackCandidate(context, published, {
			readHead: async () => remoteHead,
			isAncestor: async () => true,
			pushExact: async (_remote, _branch, sha) => {
				pushed.push(sha);
				remoteHead = sha;
			},
		});
		expect(remote.status).toBe("pushed");
		expect(pushed).toEqual([published]);

		const replies: string[] = [];
		let resolved = 0;
		const adapter = {
			read: async () => ({
				namespace: "review-thread" as const,
				commentId: "comment-1",
				threadId: "thread-1",
				updatedAt: feedback.updatedAt,
				body: feedback.body,
				resolvable: true,
			}),
			readPullRequestHead: async () => published,
			findReply: async (_repository: string, _number: number, _revision: FeedbackRevision, marker: string) =>
				replies.includes(marker) ? { id: "reply" } : null,
			postReply: async (input: { marker: string }) => {
				replies.push(input.marker);
				return { id: "reply" };
			},
			resolveThread: async () => {
				resolved += 1;
			},
		};
		const observed = await reobserveFeedbackScope(scope, published, adapter);
		expect(observed.every((item) => item.status === "unchanged")).toBe(true);
		const replied = await replyFeedbackScope(scope, published, adapter);
		expect(replied[0]?.status).toBe("posted");
		const resolutions = await resolveFeedbackScope(scope, replied, published, adapter);
		expect(resolutions[0]?.status).toBe("resolved");
		expect(resolved).toBe(1);
	});

	it("rejects classifier-supplied mutating host commands", () => {
		const { root, context } = fixture();
		const feedback = context.snapshot.items[0]!;
		const scope = validateFeedbackClassificationScope(context, {
			version: 1,
			ownerId,
			snapshotHeadSha: context.snapshot.headSha,
			classifications: [
				{
					revision: { ...feedback, body: undefined, untrusted: undefined },
					classification: "fix",
					rationale: "behavior is missing",
					behaviorDefect: true,
				},
			],
			selectedRevisionKey: feedbackRevisionKey(feedback),
			evidencePaths: ["evidence.txt"],
			productionPaths: ["production.txt"],
			commands: ["git push origin HEAD"],
		});
		writeFileSync(join(root, "evidence.txt"), "regression\n");
		expect(() => verifyFeedbackRed(context, scope)).toThrow(/read\/verify allowlist/iu);
	});

	it("stops a multiple-fix capture without silently selecting one revision", () => {
		const { context } = fixture();
		const first = context.snapshot.items[0]!;
		const second = { ...first, commentId: "comment-2", threadId: "thread-2" };
		context.snapshot.items.push(second);
		expect(() =>
			validateFeedbackClassificationScope(context, {
				version: 1,
				ownerId,
				snapshotHeadSha: context.snapshot.headSha,
				classifications: [
					{
						revision: { ...first, body: undefined, untrusted: undefined },
						classification: "fix",
						rationale: "first",
						behaviorDefect: true,
					},
					{
						revision: { ...second, body: undefined, untrusted: undefined },
						classification: "fix",
						rationale: "second",
						behaviorDefect: true,
					},
				],
				selectedRevisionKey: feedbackRevisionKey(first),
				evidencePaths: ["evidence.txt"],
				productionPaths: ["production.txt"],
				commands: ["npm test"],
			}),
		).toThrow(/multiple actionable/iu);
	});
});
