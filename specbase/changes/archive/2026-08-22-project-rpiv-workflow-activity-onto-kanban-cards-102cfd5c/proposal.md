## Why

Autonomous actions become opaque once launched unless users leave the kanban and inspect RPIV separately. Projecting the public RPIV lifecycle onto the originating card keeps the board truthful during execution and makes terminal or resumable state visible after the board is reopened.

## What Changes

- Correlate RPIV runs to the originating Specbase store, card, action, and validated intent through launch trigger metadata.
- Show active workflow identity, run identity, stage or unit progress, retries, questions/stops, and failures on the originating card.
- Preserve distinct completed, stopped, failed, aborted, and cancelled outcomes instead of collapsing them into success/failure.
- Repaint an open board from public RPIV lifecycle events after their audit rows are durable.
- Hydrate the latest correlated run recap from public RPIV run readers when a board is opened or refreshed.
- Keep unrelated or ambiguously correlated runs off Specbase cards.
- Defer workflow-specific delivery behavior and remote GitHub state.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: visible live and recovered RPIV activity on correlated cards (modified projected pair)

### Agents truth
- `agents.specbase-kanban-workflow-bridge`: repo-owned lifecycle observation and recap-hydration hook for the kanban (new)

## Enforcement intent

<!-- For every durable truth, name the planned project-defined type and source,
     the requirement-level truth it covers, and the outcome the source must
     establish. This is the planning commitment; enforcement.yaml later keeps
     only the durable link. -->

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `correlated-live-workflow-activity`, `exact-workflow-outcome-presentation`, `resumable-run-identity`, `reopened-board-activity-recap` | test | `packages/rpiv-specbase/kanban/workflow-activity.test.ts` | Fixtures establish correlation, terminal display, resume protection, bounded overlays, and reopen hydration. |
| `workflow-lifecycle-observer-instrument`, `structured-trigger-correlation-instrument`, `public-recap-hydration-instrument` | test | `packages/rpiv-specbase/workflow-bridge.test.ts` | Fixtures establish one fail-soft observation listener, structured correlation, public-reader-only hydration, and truthful interruption. |

## Impact

- Extends the projected `packages/rpiv-specbase/` card view and adds a repo-owned RPIV lifecycle bridge.
- Consumes public `registerLifecycle`, trigger metadata, run identity, and run recap/read APIs from `packages/rpiv-workflow/`.
- Follows root-only, idempotent lifecycle bridge precedents in `packages/rpiv-pi/` without importing its private lane registry.
- Does not change RPIV workflow execution semantics or Specbase lifecycle/action truth.
