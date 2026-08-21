## Why

The fixture-backed board proves Pi interaction but cannot help users understand or act on real work. The companion Specbase API now provides the authoritative store resolution and headless board contracts needed to make the same surface useful without duplicating lifecycle logic.

## What Changes

- Let `/spcb:kanban` open the nearest Specbase store or an explicitly selected registered store.
- Render canonical stable identities, lifecycle columns, progress, stack context, and diagnostics from the Specbase headless board snapshot.
- Add explicit refresh behavior that replaces stale board state while preserving a meaningful selection when stable identities remain.
- Surface store-resolution, load, and refresh failures without substituting fixture data for live state.
- Keep `/spcb:kanban --demo` available as an explicit deterministic mode.
- Defer action dispatch, workflow activity, and delivery automation.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: live store selection, authoritative board projection, diagnostics, and refresh behavior (modified projected pair)

## Enforcement intent

<!-- For every durable truth, name the planned project-defined type and source,
     the requirement-level truth it covers, and the outcome the source must
     establish. This is the planning commitment; enforcement.yaml later keeps
     only the durable link. -->

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `live-store-selection`, `authoritative-live-board-projection`, `identity-preserving-refresh` | review | `behavioural` | Until implementation creates `packages/rpiv-specbase/kanban/live-board.test.ts`, behavioural review judges canonical source selection, field-preserving projection, refresh reconciliation, and visible failure states. |

## Impact

- Extends the projected `packages/rpiv-specbase/` command and board-source boundary from the predecessor change.
- Adds a runtime dependency on the public `@awarebydefault/specbase` lifecycle and headless-board APIs.
- Adds live-store adapter and parity fixtures/tests during implementation; no canonical lifecycle, board, or action semantics move into this repository.
- Does not change `packages/rpiv-pi/` or `packages/rpiv-workflow/` ownership.
