## Context

The existing review-delivery path safely publishes one verified head and records a draft PR, then stops at Reviewing. GitHub review threads and comments can change after that point, so a later feedback run must not treat an earlier list result as authority to edit code, reply, or resolve a thread. GitHub text is untrusted data: it may describe a defect, request reconsideration, or attempt to redirect the workflow.

## Goals / Non-Goals

**Goals:**
- Surface only canonical Reviewing-card actions: Address PR feedback, comment-aware Explore, and human Archive.
- Freeze every paginated review-comment/thread revision against repository, PR, namespace, comment or thread ID, `updatedAt`, body digest, and PR head SHA; re-observe before acting remotely.
- Classify feedback as `fix`, `reconsider`, or `non-actionable`; prove behavior defects with a RED commit followed by GREEN/refactor commits, while keeping localized refactors green.
- Run the final deterministic gate and panel, safe-push the exact verified head, then idempotently reply and conditionally resolve review threads.
- Keep Explore conversational and non-mutating, and keep archive explicitly human controlled.

**Non-Goals:**
- Acting on comment text as instructions, executing arbitrary commands, or treating it as canonical workflow policy.
- Blindly replying to, resolving, or modifying an edited, deleted, already-resolved, or otherwise changed revision.
- Resolving general PR comments, merging, approving, marking ready, or automatically archiving.
- Proving live GitHub credentials, notification delivery, or provider uptime.

## Decisions

### 1. Canonical card actions select the route

The canonical Specbase action catalog remains the authority for whether a Reviewing card can expose Address PR feedback, Explore, or Archive. Pi projects exact descriptors only. Explore is dispatched as the canonical conversational skill invocation with the selected PR/comment context; it may read and discuss feedback but has no capability route, repository mutation, GitHub write, or lifecycle mutation. Archive is a separate user-confirmed action and never an edge from feedback delivery.

### 2. Freeze a complete remote revision, then re-observe

Capture first enumerates all GitHub review-thread and comment pages. Each immutable work item records normalized repository identity, PR number, namespace (`review-thread` or `general-comment`), thread or comment ID, `updatedAt`, a cryptographic digest of the body, and the PR head SHA. Thread work items also retain their original resolvable status. No comment body becomes a prompt instruction, command, selector, path authority, or policy source.

Before code attribution, reply, or resolution, the adapter fetches the matching object and PR head again. A missing, edited, deleted, already-resolved, mismatched-head, or otherwise non-equivalent revision is recorded as `re-observe`; it is neither acted on nor reported resolved. Pagination is part of capture, not a best-effort first-page sample.

### 3. Classify, then use evidence-first commits

A typed classifier receives the frozen metadata and sanitized content as untrusted evidence and returns `fix`, `reconsider`, or `non-actionable` with a rationale. `reconsider` and `non-actionable` produce a bounded explanatory reply after re-observation; they make no code or thread-resolution mutation. For a behavior defect classified `fix`, delivery first creates a failing RED test commit, then a GREEN implementation commit; any subsequent localized refactor has to preserve green verification and is committed separately. Non-behavior fixes still require an appropriate focused regression test and green local verification. The workflow stops rather than widening scope, changing planning artifacts to silence feedback, or guessing intent.

### 4. Publish only the final verified head and conditionally resolve

After bounded implementation, the workflow runs the existing deterministic final gate and generated Specbase panel on current HEAD. It uses compare-before-mutate, non-force push semantics and records `finalVerifiedHead`; every reply says which exact fixing commit addressed the frozen revision. On resume it re-observes remote state and searches for the idempotency marker before creating a duplicate reply.

Only a review thread that still exactly matches its frozen revision, remains resolvable, and has a successfully recorded reply may be resolved. General comments are always reply-only. Remote state changed after push does not authorize a stale reply or resolution; it returns the item to re-observation.

### 5. Keep the GitHub adapter and host authority narrow

A dedicated GitHub feedback adapter owns GitHub pagination, exact-object re-observation, reply idempotency lookup/posting, and review-thread resolution. The workflow owns routing and passes typed identities, not shell text. The adapter reports remote facts but does not assign canonical Specbase lifecycle, action availability, or archive state.

The feedback child-session host policy grants only repository-local evidence operations and typed adapter calls needed by the workflow. It rejects arbitrary shell composition, browser/MCP/web tools, credential exposure, generic GitHub CLI access, force/history rewrite, merge, approval, ready-for-review, archive, and successor capabilities. Dedicated trusted stages perform the final push and adapter calls outside child-agent command text.

## Enforcement design

- `packages/rpiv-specbase/kanban/pr-feedback-actions.test.ts` will mock the canonical catalog and Pi bridge. It asserts exact Reviewing descriptors, conversational Explore, and that neither selection can autonomously mutate a repository, GitHub, or archive state. Run `npm test -- packages/rpiv-specbase/kanban/pr-feedback-actions.test.ts`; a missing/mismatched descriptor or dispatched side effect fails. It does not prove the external catalog service.
- `packages/rpiv-specbase/workflows/pr-feedback-delivery.test.ts` will use a fake GitHub adapter and disposable Git repositories. It asserts pagination; frozen identities; untrusted-content containment; changed/deleted/resolved re-observation; all classifications; RED then GREEN/refactor commit ordering; final gate/panel before exact-head safe push; idempotent replies; thread-only conditional resolution; and general-comment reply-only behavior. Run `npm test -- packages/rpiv-specbase/workflows/pr-feedback-delivery.test.ts`; fixture mutation mismatch fails. It does not prove real GitHub credentials or availability.
- `packages/rpiv-specbase/workflows/specbase-pr-feedback.test.ts` will call `validateWorkflow()` and inspect the graph for typed outcomes, bounded retries, final-gate/panel-before-push, and absence of merge/archive/ready/approval/successor paths. Run `npm test -- packages/rpiv-specbase/workflows/specbase-pr-feedback.test.ts`; validator or reachability assertion failure fails.
- `packages/rpiv-specbase/workflows/pr-feedback-host-policy.test.ts` will exercise strict child-tool policy allow/deny cases, including shell indirection, generic network/GitHub access, credential access, force push, archive, and valid typed adapter handoffs. Run `npm test -- packages/rpiv-specbase/workflows/pr-feedback-host-policy.test.ts`; any allowed forbidden capability or rejected declared operation fails.

## Risks / Trade-offs

- [A thread changes while work is in progress] -> Re-observe exact identity and head before every remote side effect; return changed work to observation.
- [Feedback prompts induce unsafe behavior] -> Treat bodies as data, never as executable authority; enforce a narrow host policy.
- [TDD commits add review noise] -> Keep RED/GREEN/refactor commits atomic and scope them to the classified defect.
- [Retry duplicates acknowledgement] -> Persist a revision-bound idempotency marker and query it before posting.
- [A broad refactor hides a regression] -> Require green verification after each localized refactor and stop on scope expansion.

## Migration Plan

1. Add canonical Reviewing action descriptors and the conversational Explore skill contract.
2. Add typed feedback snapshot, classifier, adapter, publication, and strict host-policy contracts.
3. Implement and validate the `specbase-pr-feedback` workflow with typed stop and re-observe outcomes.
4. Add fake-GitHub/disposable-repository, workflow-contract, canonical-action, and host-policy tests.
5. Roll back by removing the new canonical action; existing Reviewing cards and draft PRs remain human-managed, and prior replies/threads are untouched.
