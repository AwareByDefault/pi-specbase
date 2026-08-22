## Context

The predecessor establishes an installable `rpiv-specbase` package, `/spcb:kanban --demo`, a source-neutral renderer boundary, and deterministic interaction fixtures. This member builds on that projected base rather than redefining it. Production lifecycle, board, store, and action truth remains in `@awarebydefault/specbase`; this repository owns only the Pi adapter and presentation.

The canonical library exposes public store resolution and headless board snapshot contracts. The Pi extension must consume those APIs directly instead of scraping CLI output or reconstructing lifecycle columns from filesystem layout. Stable work-item identities are required to reconcile focus across refreshes and later correlate actions and RPIV runs.

## Goals / Non-Goals

**Goals:**
- Resolve the nearest store from Pi's current working directory or an explicitly selected registered store.
- Adapt the canonical headless board snapshot to the projected renderer input without semantic recomputation.
- Preserve canonical identities, lifecycle ordering, progress, accepted specifications, and diagnostics.
- Refresh live state predictably while retaining a meaningful focus by stable identity.
- Keep live errors visible and keep explicit demo mode independent.

**Non-Goals:**
- Deciding which actions are valid or dispatching any action.
- Watching arbitrary filesystem paths or introducing a second store registry.
- Polling continuously while the board is closed.
- Projecting RPIV workflow state or implementing delivery automation.
- Authoring implementation, task detail, or non-structural enforcement sources in this phase.

## Decisions

### 1. Consume the canonical library API in process through an optional peer

Declare `@awarebydefault/specbase` as an optional runtime peer of `packages/rpiv-specbase/` and dynamically load only its documented public entry points when live mode is requested. This keeps the Pi package and explicit demo mode installable while the companion API branch is unpublished. Missing or incompatible peers produce actionable live-mode errors. Do not execute the `specbase` CLI, parse command text, inspect private store files, or copy lifecycle constants. In-process contracts preserve typed stable identities and let parity tests compare the canonical snapshot with the Pi adapter output; tests inject canonical API fakes instead of importing an unpublished checkout.

### 2. Make source choice explicit in command parsing

The command supports three source forms:
- `/spcb:kanban --demo` uses the predecessor's deterministic fixtures.
- `/spcb:kanban` resolves the nearest live store from `ctx.cwd`.
- `/spcb:kanban --store <registered-id>` resolves the named registered store through the canonical registry contract.

Conflicting modes or an unknown store produce actionable feedback and do not open a fallback board. Command parsing returns a discriminated source request before any board UI is created.

### 3. Use one live adapter over a complete canonical snapshot

A live source adapter asks the canonical library for one headless board snapshot and maps only presentation fields into the renderer model. The adapter preserves column order, card identity, lifecycle state, progress, accepted specifications, and diagnostics without deciding their meaning. Fields unsupported by the current renderer remain attached as opaque source metadata rather than being discarded or rederived. The current companion snapshot does not publish stack relationships or action descriptors; those are explicit later-contract dependencies rather than values this adapter may infer.

The renderer continues to know nothing about store discovery or Specbase storage. This protects the source-neutral boundary established by the predecessor and keeps demo/live parity testable at the snapshot seam.

### 4. Refresh by replacement and identity reconciliation

The open board exposes an explicit refresh key. Refresh requests a new complete snapshot, then atomically replaces the previous snapshot. Selection reconciliation follows stable identities: retain the selected card when it still exists; otherwise select the nearest valid card in the same column, then the first valid card in board order. Never reconcile by array index alone.

Only one refresh runs at a time. A newer refresh supersedes an older pending result so stale data cannot repaint over a later snapshot. Later action members can invoke the same refresh operation after dispatch without creating a second update path.

### 5. Preserve the last good view on refresh failure

Initial live-load failure closes the loader and reports the canonical diagnostic without opening a fixture substitute. A refresh failure keeps the last good snapshot visible, marks the board stale, and presents the error with a retry affordance. This distinguishes unavailable fresh data from an empty valid store.

### 6. Prove snapshot equivalence at the adapter boundary

Implementation tests will construct canonical headless snapshots containing representative lifecycle states, partial progress, accepted specifications, warnings/errors, and identity-preserving refresh changes. The Pi adapter output is compared field-for-field for canonical data and then rendered through the same board interaction fixture used by demo mode. The canonical library remains the oracle; copied expected lifecycle rules are not.

## Enforcement design

`packages/rpiv-specbase/kanban/live-board.test.ts` will provide canonical-store and headless-snapshot fakes to the command and adapter seams. It will assert source selection, field-for-field snapshot preservation, identity-based refresh fallback, and distinct empty/load/stale states. Run it with `npm test -- packages/rpiv-specbase/kanban/live-board.test.ts`; assertion failure is the failure signal. The fixture oracle proves adapter fidelity, not the companion package's lifecycle implementation.

## Risks / Trade-offs

- [The companion API changes before publication] -> Keep the peer optional, validate the dynamically loaded public surface at runtime, and isolate adaptation behind one module with contract-level fake tests.
- [The Pi adapter silently drops canonical fields] -> Compare canonical and adapted snapshots at the boundary and retain opaque metadata needed by later slices.
- [Refresh moves focus unpredictably] -> Reconcile by stable identity with a deterministic fallback order.
- [Concurrent refreshes repaint stale data] -> Serialize requests or gate commits by request generation so only the latest result can replace state.
- [Live failures look like an empty board] -> Represent load, empty, stale, and error states distinctly; never substitute demo fixtures.

## Migration Plan

1. Add the canonical Specbase package as an optional peer and dynamically load it only for live requests.
2. Add command source parsing and the live adapter while leaving `--demo` unchanged.
3. Add initial-load and refresh states to the existing board component.
4. Verify canonical snapshot parity and focus reconciliation with package tests.
5. Roll back by removing the live adapter and dependency; explicit demo mode remains functional and no store data is modified.
