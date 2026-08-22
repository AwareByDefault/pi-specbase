## Why

The current board makes operators chain local delivery and draft-PR delivery, while the implementation workflow can satisfy tests and commit only after the full change is green. That loses the intended RED evidence checkpoint and makes Reviewing mean "a draft exists" rather than "a human can review this now." Ready work needs one resumable delivery journey with explicit, safe test-driven history.

## What Changes

- Replace the Ready-card choreography with one canonical Deliver to human review capability.
- Review the governed change, author only declared evidence sources, prove expected RED, and commit that RED checkpoint before implementation.
- Produce separate GREEN and optional green-preserving refactor commits, then run deterministic gates and the generated Specbase panel with bounded fixes.
- Revalidate canonical authority, safely publish only a verified green head, create or reuse the pull request, mark it ready for review, and record the canonical result.
- Preserve exact red/green/refactor checkpoint journals for safe resume and prohibit every push while HEAD is red.

## Planes

### Behavior truth
- `behavior.specbase-kanban`: one authorized delivery outcome from Ready through canonical Reviewing, with explicit TDD history and safe publication.

### Agents truth
- `agents.specbase-ready-to-review`: repository-owned composed workflow and child instruments.
- `agents.specbase-draft-pr-delivery`: legacy draft workflow remains externally bounded and no longer claims that a draft causes Reviewing.

## Enforcement intent

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| Composed Ready action, RED/GREEN/refactor order, safe push, ready PR, canonical refresh | test | `packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts` | Disposable Git plus fake GitHub journey proves exact checkpoints and remote ordering |
| Workflow routes, resume journals, and terminal boundaries | test | `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts` | Public RPIV validation and resume cases prove typed bounded graph |
| Child mutation and forbidden remote capabilities | test | `packages/rpiv-specbase/workflows/capability-handler.test.ts` | Host-policy tests prove phase-specific path and tool confinement |
| Board dispatch remains canonical | test | `packages/rpiv-specbase/kanban/action-dispatch.test.ts` | Fresh v2 action validation launches exactly one closed capability |

## Impact

- Affected package: `packages/rpiv-specbase`
- Affected integration: RPIV workflow host/tool policy and Specbase Kanban action dispatch
- Affected generated instruments: delivery readiness, evidence, implementation, refactor, gate, panel fix, Git/GitHub publication, and canonical-result skills
- **BREAKING:** the current board action is composed delivery-to-review; separate local-delivery and draft-PR actions become legacy-only compatibility surfaces.
