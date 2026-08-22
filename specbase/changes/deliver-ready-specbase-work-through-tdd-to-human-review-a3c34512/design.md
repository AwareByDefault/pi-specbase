## Context

The spike has two autonomous entry points: local delivery creates green local commits, then draft-PR delivery runs the panel and opens a draft that currently moves the card to Reviewing. Evidence and implementation units are serial, but their history does not preserve an expected failing checkpoint. Canonical Specbase v2 actions instead offer one `specbase.ready-to-review` capability and make Reviewing contingent on a confirmed ready pull request.

## Goals / Non-Goals

**Goals:**
- Compose one resumable journey from Ready to canonical Reviewing.
- Preserve separate RED, GREEN, and optional refactor commits with exact verification journals.
- Give each child the minimum path and tool authority for its phase.
- Re-run deterministic gates and the generated panel on every publication candidate.
- Push only an exact green attested head and make one PR ready for human review.

**Non-Goals:**
- Implicitly invoke RPIV stage skills from chat.
- Merge, approve, archive, delete branches, or deliver a successor.
- Treat panel findings as deterministic gates.
- Let children select repository root, baseline, target, commit identity, or remote.
- Rewrite existing remote history.

## Decisions

### One public capability, composed from owned stages

Register `specbase-ready-to-review` as the handler for canonical `specbase.ready-to-review`. The workflow may reuse hardened helpers from local and draft delivery, but it owns one run, lease, trigger identity, baseline, checkpoint journal, terminal recap, and canonical action identity. Legacy workflows are not offered by the current board catalog.

### Dedicated spec review precedes mutation

A read-only stage checks proposal/spec/design/tasks/enforcement coherence and freezes target requirements, declared evidence sources, native commands, production scope, and stack context. Replan findings stop before a child session. The host, not child output, owns this delivery context.

### Evidence phase must prove expected RED

One evidence child can edit only file-backed sources already declared by enforcement manifests. It cannot edit `enforcement.yaml`, implementation paths, planning artifacts, Git metadata, or execute arbitrary helpers. The host runs the declared native evidence command and accepts RED only when failure corresponds to the planned missing behavior without unrelated infrastructure failure. It then creates an evidence-only commit and records SHA, parent, tree, paths, command, exit, and bounded failure fingerprint.

### Implementation and refactor have distinct contracts

Implementation children receive production scope and read-only evidence. Host policy denies evidence edits and any weakening of verification. GREEN requires declared evidence plus repository-native gate on current HEAD, followed by one implementation commit. Optional refactor receives only run-owned implementation paths, must leave exact checks green, and creates a separate commit. If no refactor is warranted, the journal records a typed skip.

### Publication candidate is exact

After GREEN/refactor, run full deterministic checks and generated panel. Each bounded implementation fix creates its own commit, invalidates prior attestations, and returns through gate and panel. A replan disposition stops. Remote preflight verifies fresh canonical action, lease, repository/branch/base, clean owned delta, commit ancestry, exact current HEAD, gate/panel fingerprints, and compare-before-mutate remote state.

### Ready PR is idempotent

Push is a normal non-force update of the exact candidate. Query matching PRs immediately before create or mutation. Reuse one matching open draft or ready PR; reject duplicates, closed/merged state, and identity drift. Mark a reused/created draft ready through the narrow adapter, re-observe ready state and remote head, then record the canonical result. Resume receipts key every remote step by repository, base, head, PR identity, and verified SHA.

### RED can be local but never remote

Resume may begin with HEAD at a run-owned RED commit. It must revalidate the journal and continue implementation or stop for the operator. No route from RED, stale GREEN, dirty candidate, failed gate, or stale panel reaches push or PR mutation.

## Enforcement design

| Source | Proof | Harness / failure | Boundary |
|---|---|---|---|
| `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts` | Valid workflow graph, stable spec/evidence/task units, RED/GREEN/refactor journals, resume and bounds | Focused Vitest; route or artifact mismatch fails | Fake child outputs do not prove model quality |
| `packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts` | Disposable Git commit order, gate/panel invalidation, no red push, compare-before-mutate push, create/reuse/ready PR, canonical refresh | Focused Vitest with fake GitHub and disposable repositories | Does not exercise live credentials or GitHub service |
| `packages/rpiv-specbase/workflows/capability-handler.test.ts` | Evidence/implementation/refactor path confinement and forbidden shell/network/Git/remote capabilities | Focused Vitest; denied/allowed call mismatch fails | Host policy only; source quality remains separate |
| `packages/rpiv-specbase/kanban/action-dispatch.test.ts` | Exact v2 action validation and one dispatch to the closed capability | Focused Vitest; descriptor or launch count mismatch fails | Canonical policy remains companion-owned |

## Risks / Trade-offs

- RED commits make intermediate local history intentionally failing; explicit journals and the absolute no-push invariant make this auditable rather than accidental.
- A broad "run all" gate can be expensive; use exact evidence checks per phase and full gates only at candidate boundaries.
- Legacy workflow names remain installed during migration; remove them from current catalog binding and label their outcomes accurately.
- GitHub readiness can race with human changes; re-observe immediately before and after mutation and stop on identity drift.

## Migration Plan

1. Add typed checkpoint/result contracts and phase-specific host policy tests.
2. Add the composed workflow and capability handler while retaining legacy registrations for recovery.
3. Switch current Kanban dispatch to the new canonical capability.
4. Update remote adapter to create/reuse and mark ready idempotently.
5. Record canonical ready result and refresh to Reviewing.
6. Remove legacy catalog reachability only after companion v2 APIs are linked.

Rollback removes the current capability binding and composed workflow while preserving run journals and legacy recovery paths; it never rewrites commits or remote branches.
