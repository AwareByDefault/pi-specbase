## Why

A Reviewing card can link a draft pull request but cannot safely turn its GitHub feedback into a bounded, auditable delivery loop. Contributors need to explore a specific comment conversationally, address actionable feedback without acting on stale remote content, and retain human control of archive.

## What Changes

- Add canonical Reviewing-card actions for **Address PR feedback**, comment-aware **Explore**, and human **Archive**.
- Add a resumable PR-feedback workflow that snapshots paginated GitHub review feedback, treats it as untrusted input, classifies it, implements bounded fixes with red/green evidence, and re-observes before remote mutations.
- Reply idempotently with the fixing commit and resolve only unchanged resolvable review threads; general comments remain reply-only.
- Preserve a human-only archive boundary and a conversational, non-mutating Explore route.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: Reviewing-card actions, conversational exploration, revision-safe feedback outcome, and human archive control (modified)

### Architectural truth
- `architecture.rpiv-specbase`: GitHub feedback adapter and canonical-authority boundary (modified)

### Agents truth
- `agents.specbase-pr-feedback`: repository-owned feedback workflow, snapshot/classification, host-policy, and remote publication instruments (new)

## Enforcement intent

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `reviewing-feedback-actions`, `comment-aware-feedback-explore`, `revision-safe-feedback-resolution`, `human-controlled-feedback-archive` | review | `behavioural` | Behavioural review assesses the Reviewing-card outcomes until `pr-feedback-actions.test.ts` and `pr-feedback-delivery.test.ts` exist. |
| `github-feedback-adapter-boundary` | review | `architectural` | Architectural review assesses the real GitHub adapter and authority boundary until disposable-repository adapter tests exist. |
| `feedback-workflow-instrument`, `frozen-untrusted-feedback-instrument`, `feedback-classification-and-evidence-instrument`, `idempotent-feedback-publication-instrument`, `strict-feedback-host-policy-instrument` | review | `enforcement` | Enforcement review assesses the repo-owned instrument until the planned delivery, workflow-validator, and strict host-policy test files exist. |

## Impact

- Adds a projected `rpiv-specbase` workflow, workflow-only skills, canonical action descriptors, and GitHub feedback adapter port.
- Uses GitHub review comments and threads through fake adapter/disposable-repository tests; no credential or production-provider availability is asserted.
- Does not change application code in this governed-authoring step.
