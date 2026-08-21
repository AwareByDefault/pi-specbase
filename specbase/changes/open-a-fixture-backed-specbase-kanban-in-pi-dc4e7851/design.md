## Context

The repository already ships Pi packages that register commands, custom TUI components, skills, and lazy integrations with `@juicesharp/rpiv-workflow`. The first kanban slice must be installable and demonstrable before the companion `@awarebydefault/specbase` lifecycle and headless-board APIs publish. It therefore needs a deterministic demo source while preserving a clean seam for the live source introduced by the next stack member.

Pi custom UI can render a focused, top-anchored overlay while leaving a useful chat region visible below it. Components must remain width-safe, use the injected theme and keybindings, request rerenders after state changes, and clean up session-scoped resources on shutdown. This slice is keyboard-only and performs no business action.

## Goals / Non-Goals

**Goals:**
- Establish `packages/rpiv-specbase/` as the installable owner of the Pi command and kanban renderer.
- Open deterministic fixture cards only when `/spcb:kanban --demo` is explicitly requested.
- Provide column, card, detail, and action-intent navigation with stable focus behavior.
- Keep source data separate from rendering so the next stack member can substitute a live Specbase snapshot.
- Make the fixture interaction testable without a live store or remote service.

**Non-Goals:**
- Reading a live Specbase store or choosing among registered stores.
- Deciding lifecycle columns, progress semantics, diagnostics, or valid actions.
- Dispatching conversational or autonomous actions.
- Projecting RPIV runs, accepting mouse gestures, or automating delivery.
- Defining package code, tasks, enforcement manifests, or implementation in this phase.

## Decisions

### 1. Add a dedicated Pi package

Create a new `packages/rpiv-specbase/` workspace package rather than adding the board to `rpiv-pi`. The package will own its extension entry, renderer, demo fixtures, and eventual Specbase-specific workflows and skills. This keeps general RPIV orchestration independent of Specbase product behavior and lets users install the kanban without adopting the full RPIV skill bundle.

The package will follow `rpiv-pi` precedents: TypeScript loaded directly by Pi, a `pi.extensions` manifest entry, runtime dependencies in `dependencies`, Pi SDK/TUI packages in `peerDependencies`, and package-local Vitest coverage.

### 2. Register one explicit command entry point

The extension registers `spcb:kanban`. The first slice accepts only the explicit `--demo` mode; an absent or unsupported source mode reports actionable usage instead of silently inventing a store. The handler requires TUI mode before opening the custom component and reports an unsupported-mode result in headless/RPC contexts where custom components cannot run.

### 3. Render a source-neutral board model

The renderer receives an immutable board snapshot with stable column, card, and action identifiers plus display fields. Demo fixtures implement that input contract directly. Renderer state contains only focus coordinates, selected detail state, and the current snapshot; it does not derive lifecycle rules or action validity.

The live slice can replace the fixture provider with an adapter over `@awarebydefault/specbase` while retaining the renderer contract. The adapter boundary is deliberately one-way: canonical board data flows into Pi presentation, while Pi selection returns an opaque intent to the command handler.

### 4. Use a focused, top-anchored Pi overlay

When the terminal can preserve useful board and chat regions, the board opens as a full-width, top-anchored overlay capped at 45% of terminal rows and at most 18 rows, while reserving at least eight visible transcript rows below the board in addition to the editor/footer chrome. The component lays out lifecycle columns side by side within its allocation and uses a compact detail region without turning lifecycle columns into separate full-screen panes. If the row budget cannot preserve those regions, it enters an explicit compact mode with fewer card rows rather than silently covering the conversation. On constrained widths it reduces visible columns and compacts detail without producing over-width lines; it does not replace or mutate the chat transcript.

The component uses the theme and keybindings injected by `ctx.ui.custom`, `matchesKey` for input, ANSI-aware width helpers for clipping, and `tui.requestRender()` after every state transition. Escape closes without an intent. Enter drills into the focused card or confirms the focused fixture action. Arrow keys move only among valid coordinates and preserve a visible focus target.

### 5. Return selection; do not dispatch

The custom component resolves with either cancellation or an immutable selection containing the fixture card identity and action identity. The command handler surfaces the selection to its test seam and closes the board. No shell command, skill invocation, workflow, user message, or store mutation occurs in this slice.

### 6. Keep fixtures deterministic and contract-shaped

Package-owned fixtures cover multiple lifecycle columns, empty and populated columns, long labels, blocked and enabled-looking action rows, and stable identifiers. They exist to prove rendering and navigation, not to establish canonical lifecycle or action semantics. The next member may add live adapters without deleting demo mode because demo mode remains useful for packaging checks and reproducible support.

## Enforcement design

- `packages/rpiv-specbase/kanban/fixture-board.test.ts` will drive deterministic fixture snapshots through the Pi component test seam. It asserts explicit demo parsing, width-safe focus movement through empty and populated columns, selected/cancelled intent results, and no dispatch port call. Run it with `npm test -- packages/rpiv-specbase/kanban/fixture-board.test.ts`; an assertion failure is the failure signal. It does not prove live store semantics.
- `packages/rpiv-specbase/extension.test.ts` will inspect the registered command and injected source/dispatch ports. It asserts the package owns the command, the renderer receives only a snapshot, and no renderer path reads a store or dispatches. Run it with `npm test -- packages/rpiv-specbase/extension.test.ts`; it does not judge terminal presentation.
- The `design` lens will inspect wide and narrow render captures using the active Pi theme and keyboard cue states. A documented review finding is the failure signal. It judges presentation quality, not canonical lifecycle truth.

## Risks / Trade-offs

- [A fixture model drifts from the canonical Specbase board contract] -> Keep the fixture contract minimal and presentation-oriented; the live member adds parity tests against the canonical snapshot rather than treating fixtures as business truth.
- [A wide board overwhelms smaller terminals] -> Define width-aware layout modes and require every rendered line to remain within the provided width.
- [Overlay focus conflicts with Pi editor shortcuts] -> Handle only documented board keys while focused, close cleanly on Escape, and use Pi's injected key and focus contracts.
- [The package accidentally grows a second lifecycle model] -> Keep column/order/action semantics in source snapshots and prohibit renderer derivation of business state.
- [A new package duplicates general RPIV UI infrastructure] -> Reuse host patterns, not rpiv-pi internals; share only public package contracts where a durable dependency is justified.

## Migration Plan

1. Add the new package and fixture-only command without changing existing packages.
2. Verify local package discovery and the explicit demo flow through package tests.
3. Retain demo mode as the stable fallback when the next member adds a live Specbase adapter.
4. Roll back by removing the new workspace package and its package metadata; no store or user data requires migration.
