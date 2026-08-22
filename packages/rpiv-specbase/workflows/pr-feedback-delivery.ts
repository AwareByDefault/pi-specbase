import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { RemoteDeliveryContext, RemoteGitAdapter } from "./draft-pr-delivery.js";
import { publishVerifiedHead } from "./draft-pr-delivery.js";
import type {
	FeedbackClassification,
	FeedbackNamespace,
	FeedbackReply,
	FeedbackResolution,
	FeedbackRevision,
	FeedbackSnapshot,
	FrozenFeedback,
	PullRequestContext,
	ReobserveOutcome,
} from "./pr-feedback-contracts.js";

export interface FeedbackPage {
	readonly items: readonly RemoteFeedbackItem[];
	readonly next: string | null;
}

/** Remote facts only: content is data and never defines workflow authority. */
export interface RemoteFeedbackItem {
	readonly namespace: FeedbackNamespace;
	readonly commentId: string | null;
	readonly threadId: string | null;
	readonly updatedAt: string;
	readonly body: string;
	readonly resolvable: boolean;
}

export interface GitHubFeedbackAdapter {
	listPage(repository: string, pullRequest: number, cursor: string | null): Promise<FeedbackPage>;
	read(repository: string, pullRequest: number, revision: FeedbackRevision): Promise<RemoteFeedbackItem | null>;
	readPullRequestHead(repository: string, pullRequest: number): Promise<string | null>;
	findReply(
		repository: string,
		pullRequest: number,
		revision: FeedbackRevision,
		marker: string,
	): Promise<{ id: string } | null>;
	postReply(input: {
		repository: string;
		pullRequest: number;
		revision: FeedbackRevision;
		body: string;
		marker: string;
	}): Promise<{ id: string }>;
	resolveThread(repository: string, pullRequest: number, threadId: string): Promise<void>;
}

export function feedbackBodyDigest(body: string): string {
	return createHash("sha256").update(body, "utf8").digest("hex");
}

export function feedbackRevisionKey(revision: FeedbackRevision): string {
	return [
		revision.repository,
		revision.pullRequest,
		revision.namespace,
		revision.threadId ?? "-",
		revision.commentId ?? "-",
		revision.updatedAt,
		revision.bodyDigest,
		revision.headSha,
	].join(":");
}

export function feedbackReplyMarker(revision: FeedbackRevision, fixingSha: string): string {
	return `<!-- rpiv-specbase-pr-feedback:${createHash("sha256")
		.update(`${feedbackRevisionKey(revision)}:${fixingSha}`)
		.digest("hex")} -->`;
}

function freezeItem(context: PullRequestContext, item: RemoteFeedbackItem): FrozenFeedback {
	if (item.namespace === "review-thread" ? !item.threadId : !item.commentId)
		throw new Error("GitHub feedback item omitted its namespace identity.");
	return Object.freeze({
		version: 1,
		repository: context.repository,
		pullRequest: context.number,
		namespace: item.namespace,
		commentId: item.commentId,
		threadId: item.threadId,
		updatedAt: item.updatedAt,
		bodyDigest: feedbackBodyDigest(item.body),
		headSha: context.headSha,
		resolvable: item.resolvable,
		body: item.body,
		untrusted: true,
	});
}

/** Exhausts every page before any classifier or implementation stage sees feedback. */
export async function captureFeedbackSnapshot(
	context: PullRequestContext,
	adapter: Pick<GitHubFeedbackAdapter, "listPage" | "readPullRequestHead">,
): Promise<FeedbackSnapshot> {
	const observedHead = await adapter.readPullRequestHead(context.repository, context.number);
	if (observedHead !== context.headSha) throw new Error("Pull-request head changed before feedback capture.");
	const items: FrozenFeedback[] = [];
	const identities = new Set<string>();
	let cursor: string | null = null;
	const seenCursors = new Set<string>();
	let pages = 0;
	do {
		if (cursor && seenCursors.has(cursor)) throw new Error("GitHub feedback pagination repeated a cursor.");
		if (cursor) seenCursors.add(cursor);
		pages += 1;
		if (pages > 1_000) throw new Error("GitHub feedback pagination exceeded its bounded page limit.");
		const page = await adapter.listPage(context.repository, context.number, cursor);
		for (const item of page.items) {
			const frozen = freezeItem(context, item);
			const key = feedbackRevisionKey(frozen);
			if (identities.has(key)) throw new Error("GitHub feedback pagination returned a duplicate revision.");
			identities.add(key);
			items.push(frozen);
		}
		cursor = page.next;
	} while (cursor !== null);
	return Object.freeze({
		version: 1,
		repository: context.repository,
		pullRequest: context.number,
		headSha: context.headSha,
		items,
	});
}

function equivalent(
	revision: FeedbackRevision,
	current: RemoteFeedbackItem,
	headSha: string,
	expectedHeadSha: string,
): boolean {
	return (
		headSha === expectedHeadSha &&
		current.namespace === revision.namespace &&
		current.commentId === revision.commentId &&
		current.threadId === revision.threadId &&
		current.updatedAt === revision.updatedAt &&
		feedbackBodyDigest(current.body) === revision.bodyDigest &&
		current.resolvable === revision.resolvable
	);
}

export async function reobserveFeedbackRevision(
	revision: FeedbackRevision,
	adapter: Pick<GitHubFeedbackAdapter, "read" | "readPullRequestHead">,
	expectedHeadSha = revision.headSha,
): Promise<ReobserveOutcome> {
	const [current, head] = await Promise.all([
		adapter.read(revision.repository, revision.pullRequest, revision),
		adapter.readPullRequestHead(revision.repository, revision.pullRequest),
	]);
	if (!current) return { revision, status: "re-observe", reason: "feedback no longer exists", current: null };
	const currentRevision = Object.freeze({
		...revision,
		namespace: current.namespace,
		commentId: current.commentId,
		threadId: current.threadId,
		updatedAt: current.updatedAt,
		bodyDigest: feedbackBodyDigest(current.body),
		headSha: head ?? "0".repeat(40),
		resolvable: current.resolvable,
	});
	if (current.namespace === "review-thread" && !current.resolvable)
		return { revision, status: "re-observe", reason: "review thread is already resolved", current: currentRevision };
	if (!equivalent(revision, current, head ?? "", expectedHeadSha))
		return {
			revision,
			status: "re-observe",
			reason: "feedback revision or pull-request head changed",
			current: currentRevision,
		};
	return { revision, status: "unchanged", reason: null, current: currentRevision };
}

export function classifyFeedback(
	feedback: FrozenFeedback,
	result: Omit<FeedbackClassification, "revision">,
): FeedbackClassification {
	if (!feedback.untrusted) throw new Error("Feedback classification requires an explicitly untrusted snapshot.");
	if (result.classification !== "fix" && result.behaviorDefect)
		throw new Error("Only a fix classification may claim a behavior defect.");
	return Object.freeze({ ...result, revision: withoutBody(feedback) });
}

export function withoutBody(feedback: FrozenFeedback): FeedbackRevision {
	const { body: _body, untrusted: _untrusted, ...revision } = feedback;
	return Object.freeze(revision);
}

export function assertFeedbackCommitOrder(checkpoints: {
	readonly behaviorDefect: boolean;
	readonly red?: { readonly sha: string; readonly parent: string; readonly passed: boolean };
	readonly green?: { readonly sha: string; readonly parent: string; readonly passed: boolean };
	readonly refactor?: { readonly sha: string; readonly parent: string; readonly passed: boolean };
}): void {
	if (!checkpoints.behaviorDefect) return;
	if (!checkpoints.red || checkpoints.red.passed)
		throw new Error("Behavior feedback requires a failing RED checkpoint.");
	if (!checkpoints.green?.passed || checkpoints.green.parent !== checkpoints.red.sha)
		throw new Error("GREEN checkpoint must immediately follow the RED checkpoint and pass verification.");
	if (checkpoints.refactor && (!checkpoints.refactor.passed || checkpoints.refactor.parent !== checkpoints.green.sha))
		throw new Error("Localized refactor must directly follow GREEN and preserve verification.");
}

export async function publishFeedbackHead(
	context: RemoteDeliveryContext,
	finalVerifiedHead: string,
	git: RemoteGitAdapter,
) {
	return publishVerifiedHead(context, finalVerifiedHead, git);
}

export async function replyToFeedback(
	revision: FeedbackRevision,
	fixingSha: string,
	adapter: Pick<GitHubFeedbackAdapter, "findReply" | "postReply" | "read" | "readPullRequestHead">,
): Promise<FeedbackReply> {
	const marker = feedbackReplyMarker(revision, fixingSha);
	// Observe before and after the idempotency lookup: a concurrent actor may add
	// the marker or change the thread between either operation and the mutation.
	const first = await reobserveFeedbackRevision(revision, adapter, fixingSha);
	if (first.status !== "unchanged") return { revision, status: "re-observe", replyId: null, marker, fixingSha };
	const existing = await adapter.findReply(revision.repository, revision.pullRequest, revision, marker);
	if (existing) return { revision, status: "existing", replyId: existing.id, marker, fixingSha };
	const second = await reobserveFeedbackRevision(revision, adapter, fixingSha);
	if (second.status !== "unchanged") return { revision, status: "re-observe", replyId: null, marker, fixingSha };
	try {
		const created = await adapter.postReply({
			repository: revision.repository,
			pullRequest: revision.pullRequest,
			revision,
			body: `Addressed by ${fixingSha}.\n\n${marker}`,
			marker,
		});
		return { revision, status: "posted", replyId: created.id, marker, fixingSha };
	} catch (error) {
		const raced = await adapter.findReply(revision.repository, revision.pullRequest, revision, marker);
		if (raced) return { revision, status: "existing", replyId: raced.id, marker, fixingSha };
		throw error;
	}
}

export async function resolveFeedbackThread(
	revision: FeedbackRevision,
	reply: FeedbackReply,
	expectedHeadSha: string,
	adapter: Pick<GitHubFeedbackAdapter, "resolveThread" | "read" | "readPullRequestHead">,
): Promise<FeedbackResolution> {
	if (revision.namespace !== "review-thread")
		return { revision, status: "reply-only", reason: "general pull-request comments are never resolved" };
	if (!revision.resolvable || !revision.threadId)
		return { revision, status: "reply-only", reason: "review thread is not resolvable" };
	if (reply.status === "re-observe" || !reply.replyId)
		return { revision, status: "re-observe", reason: "an idempotent reply was not recorded" };
	const current = await reobserveFeedbackRevision(revision, adapter, expectedHeadSha);
	if (current.status !== "unchanged")
		return { revision, status: "re-observe", reason: current.reason ?? "review thread changed before resolve" };
	try {
		await adapter.resolveThread(revision.repository, revision.pullRequest, revision.threadId);
		return { revision, status: "resolved", reason: null };
	} catch {
		return { revision, status: "re-observe", reason: "review thread changed while resolving" };
	}
}

/** Re-observes before every write; a changed item receives neither reply nor resolution. */
export async function acknowledgeFeedback(
	revision: FeedbackRevision,
	fixingSha: string,
	adapter: GitHubFeedbackAdapter,
): Promise<{ observation: ReobserveOutcome; reply: FeedbackReply | null; resolution: FeedbackResolution | null }> {
	const first = await reobserveFeedbackRevision(revision, adapter, fixingSha);
	if (first.status !== "unchanged") return { observation: first, reply: null, resolution: null };
	const reply = await replyToFeedback(revision, fixingSha, adapter);
	if (reply.status === "re-observe") return { observation: first, reply, resolution: null };
	const second = await reobserveFeedbackRevision(revision, adapter, fixingSha);
	if (second.status !== "unchanged") return { observation: second, reply, resolution: null };
	const resolution = await resolveFeedbackThread(revision, reply, fixingSha, adapter);
	return { observation: second, reply, resolution };
}

function gh(root: string, args: readonly string[]): unknown {
	const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", timeout: 120_000 });
	if (result.error || result.status !== 0) throw result.error ?? new Error((result.stderr || result.stdout).trim());
	return JSON.parse(result.stdout || "null");
}

function hasExactReplyMarker(body: unknown, marker: string): boolean {
	return String(body ?? "")
		.split(/\r?\n/u)
		.some((line) => line.trim() === marker);
}

/** Trusted boundary adapter. It contains the provider transport; child sessions never receive gh access. */
export function githubCliFeedbackAdapter(root: string): GitHubFeedbackAdapter {
	return {
		async listPage(repository, pullRequest, cursor) {
			if (cursor?.startsWith("comments:")) {
				const page = Number(cursor.slice("comments:".length));
				if (!Number.isInteger(page) || page < 1) throw new Error("Invalid general-comment page cursor.");
				const value = gh(root, [
					"api",
					`repos/${repository}/issues/${pullRequest}/comments?per_page=100&page=${page}`,
				]) as any;
				const comments = Array.isArray(value) ? value : [];
				return {
					items: comments.map((comment: any) => ({
						namespace: "general-comment" as const,
						threadId: null,
						commentId: String(comment.node_id ?? comment.id),
						updatedAt: String(comment.updated_at),
						body: String(comment.body),
						resolvable: false,
					})),
					next: comments.length === 100 ? `comments:${page + 1}` : null,
				};
			}
			const query = `query($owner:String!, $name:String!, $number:Int!, $cursor:String) { repository(owner:$owner,name:$name) { pullRequest(number:$number) { reviewThreads(first:100, after:$cursor) { nodes { id isResolved comments(first:100) { nodes { id body updatedAt } pageInfo { hasNextPage } } } pageInfo { hasNextPage endCursor } } } } }`;
			const [owner, name] = repository.split("/");
			const value = gh(root, [
				"api",
				"graphql",
				"-f",
				`query=${query}`,
				"-F",
				`owner=${owner}`,
				"-F",
				`name=${name}`,
				"-F",
				`number=${pullRequest}`,
				...(cursor ? ["-F", `cursor=${cursor}`] : []),
			]) as any;
			const threads = value?.data?.repository?.pullRequest?.reviewThreads;
			if ((threads?.nodes ?? []).some((thread: any) => thread.comments?.pageInfo?.hasNextPage))
				throw new Error("A review thread exceeds the bounded comment page; capture stopped without omission.");
			return {
				items: (threads?.nodes ?? []).flatMap((thread: any) =>
					(thread.comments?.nodes ?? []).map((comment: any) => ({
						namespace: "review-thread" as const,
						threadId: String(thread.id),
						commentId: String(comment.id),
						updatedAt: String(comment.updatedAt),
						body: String(comment.body),
						resolvable: !thread.isResolved,
					})),
				),
				next: threads?.pageInfo?.hasNextPage ? String(threads.pageInfo.endCursor) : "comments:1",
			};
		},
		async read(repository, pullRequest, revision) {
			let cursor: string | null = null;
			const seen = new Set<string>();
			for (let pages = 0; ; pages += 1) {
				if (pages >= 1_000) throw new Error("GitHub feedback re-observation exceeded its bounded page limit.");
				if (cursor) {
					if (seen.has(cursor)) throw new Error("GitHub feedback re-observation repeated a cursor.");
					seen.add(cursor);
				}
				const page = await this.listPage(repository, pullRequest, cursor);
				const item = page.items.find(
					(candidate) =>
						candidate.namespace === revision.namespace &&
						candidate.threadId === revision.threadId &&
						candidate.commentId === revision.commentId,
				);
				if (item) return item;
				cursor = page.next;
				if (cursor === null) return null;
			}
		},
		async readPullRequestHead(repository, pullRequest) {
			const value = gh(root, ["api", `repos/${repository}/pulls/${pullRequest}`]) as { head?: { sha?: unknown } };
			return typeof value.head?.sha === "string" ? value.head.sha : null;
		},
		async findReply(repository, pullRequest, revision, marker) {
			if (revision.namespace === "review-thread" && revision.threadId) {
				const query = `query($thread:ID!) { node(id:$thread) { ... on PullRequestReviewThread { comments(last:100) { nodes { id body } pageInfo { hasPreviousPage } } } } }`;
				const value = gh(root, [
					"api",
					"graphql",
					"-f",
					`query=${query}`,
					"-F",
					`thread=${revision.threadId}`,
				]) as any;
				if (value?.data?.node?.comments?.pageInfo?.hasPreviousPage)
					throw new Error("Review-thread reply history exceeds the bounded idempotency page.");
				for (const comment of value?.data?.node?.comments?.nodes ?? []) {
					if (hasExactReplyMarker(comment.body, marker)) return { id: String(comment.id) };
				}
				return null;
			}
			for (let page = 1; page <= 100; page += 1) {
				const value = gh(root, [
					"api",
					`repos/${repository}/issues/${pullRequest}/comments?per_page=100&page=${page}`,
				]) as unknown;
				const comments = Array.isArray(value) ? value : [];
				for (const comment of comments) {
					if (comment && typeof comment === "object" && hasExactReplyMarker((comment as any).body, marker)) {
						const id = (comment as any).node_id ?? (comment as any).id;
						if (typeof id === "string" || typeof id === "number") return { id: String(id) };
					}
				}
				if (comments.length < 100) return null;
			}
			throw new Error("General-comment reply history exceeded the bounded idempotency page limit.");
		},
		async postReply(input) {
			if (input.revision.namespace === "review-thread" && input.revision.threadId) {
				const query = `mutation($thread:ID!, $body:String!) { addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$thread,body:$body}) { comment { id } } }`;
				const value = gh(root, [
					"api",
					"graphql",
					"-f",
					`query=${query}`,
					"-F",
					`thread=${input.revision.threadId}`,
					"-F",
					`body=${input.body}`,
				]) as any;
				const id = value?.data?.addPullRequestReviewThreadReply?.comment?.id;
				if (typeof id !== "string") throw new Error("GitHub did not return a review-thread reply identity.");
				return { id };
			}
			const value = gh(root, [
				"api",
				`repos/${input.repository}/issues/${input.pullRequest}/comments`,
				"-f",
				`body=${input.body}`,
			]) as { id?: unknown };
			if (typeof value.id !== "number" && typeof value.id !== "string")
				throw new Error("GitHub did not return a reply identity.");
			return { id: String(value.id) };
		},
		async resolveThread(_repository, _pullRequest, threadId) {
			const query = `mutation($thread:ID!) { resolveReviewThread(input:{threadId:$thread}) { thread { id } } }`;
			gh(root, ["api", "graphql", "-f", `query=${query}`, "-F", `thread=${threadId}`]);
		},
	};
}
