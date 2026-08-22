## Why

A green local commit is not yet reviewable by collaborators, and manually coordinating the Specbase panel, any bounded local repairs, a final gate, push, and draft pull request loses the board's resumable audit trail. This final slice delivers the selected change to a linked draft PR while preserving human control over merge and archive.

## What Changes

- Add a canonical board action for a green, locally committed change that starts a repo-owned review-and-draft-PR workflow.
- Run the Specbase review panel and materialize a machine-readable `clean | advisory | local-fix | replan` disposition while preserving every finding as review-strength.
- Apply only bounded local fixes, commit them atomically, rerun the panel as needed, and require a final deterministic green gate before remote mutation.
- Push the selected branch idempotently without force and create or find exactly one draft pull request.
- Resume safely when push or PR creation already completed before an interruption.
- Record the draft PR through the canonical Specbase action result, refresh the board, and show the card in canonical Reviewing state with its PR link.
- Keep automatic merge and archive out of scope; panel findings do not redefine Specbase gates.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: review disposition, bounded fixes, final gate, idempotent push/draft PR, and Reviewing card outcome (modified projected pair)

### Agents truth
- `agents.specbase-draft-pr-delivery`: repo-owned review-and-draft-PR workflow and workflow-only remote skills (new)

## Enforcement intent

<!-- For every durable truth, name the planned project-defined type and source,
     the requirement-level truth it covers, and the outcome the source must
     establish. This is the planning commitment; enforcement.yaml later keeps
     only the durable link. -->

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `authorized-review-delivery-launch`, `machine-readable-panel-disposition`, `bounded-panel-fixes-with-final-gate`, `idempotent-safe-push`, `resume-safe-draft-pull-request`, `canonical-reviewing-card-outcome`, `human-controlled-post-pr-boundary` | review | `behavioural` | Until implementation creates `packages/rpiv-specbase/workflows/draft-pr-delivery.test.ts`, behavioural review judges disposition routing, bounded fixes, no-force idempotence, PR reuse, canonical Reviewing, and post-PR boundaries. |
| `review-delivery-workflow-instrument`, `generated-panel-invocation-instrument`, `typed-panel-materialization-instrument`, `idempotent-remote-instrument`, `canonical-remote-result-bridge-instrument` | review | `enforcement` | Until implementation creates `packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts`, enforcement review judges graph validation, delegation, typed handoffs, safe remote observation, and canonical result recording. |

## Impact

- Adds a second built-in Specbase workflow and remote workflow-only skills under the projected `packages/rpiv-specbase/` package.
- Invokes the generated Specbase review-panel instrument governed by `agents.review-panel` and consumes public RPIV continuation, typed routing, resume, trigger, and audit contracts.
- Uses a GitHub remote adapter and disposable remote fixtures; no generic GitHub behavior moves into `packages/rpiv-workflow/`.
- Records PR state through canonical `@awarebydefault/specbase` lifecycle/action contracts rather than assigning a Pi-local column.
