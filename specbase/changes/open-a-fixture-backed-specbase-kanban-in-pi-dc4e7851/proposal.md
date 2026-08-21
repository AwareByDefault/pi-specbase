## Why

Specbase work is currently visible through files and commands, but Pi users have no interactive view that keeps lifecycle context beside the conversation where they direct agents. A fixture-first slice establishes the Pi-native interaction and packaging boundary before live Specbase APIs are required.

## What Changes

- Add an installable `rpiv-specbase` Pi package that registers `/spcb:kanban`.
- Add an explicit demo mode that opens a deterministic fixture-backed kanban without requiring a Specbase store.
- Let users navigate lifecycle columns and cards by keyboard, inspect a selected card, and choose a fixture action intent without dispatching it.
- Keep the board above a visible Pi chat region and present side-by-side lifecycle columns with Pi-native theme and keyboard conventions.
- Defer live Specbase reads, production action dispatch, RPIV activity, mouse gestures, and delivery workflows.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: opening, navigating, and selecting fixture-backed Specbase work from `/spcb:kanban --demo` (new)

### Architectural truth
- `architecture.rpiv-specbase`: ownership and dependency boundaries for the installable Pi integration package (new)

### Design-system truth
- `design-system.specbase-kanban`: Pi-native side-by-side board presentation and interaction cues (new)

## Enforcement intent

<!-- For every durable truth, name the planned project-defined type and source,
     the requirement-level truth it covers, and the outcome the source must
     establish. This is the planning commitment; enforcement.yaml later keeps
     only the durable link. -->

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `explicit-demo-board`, `keyboard-board-navigation`, `selected-fixture-action-intent` | review | `behavioural` | Until implementation creates `packages/rpiv-specbase/kanban/fixture-board.test.ts`, behavioural review judges explicit demo entry, focus transitions, selection/cancellation, and no dispatch. |
| `pi-integration-ownership`, `canonical-specbase-semantics-remain-external`, `source-neutral-renderer-boundary` | review | `architectural` | Until implementation creates `packages/rpiv-specbase/extension.test.ts`, architectural review judges package ownership and source-neutral isolation. |
| `chat-preserving-board-presentation`, `pi-native-visual-language` | review | `design` | Design review judges Pi-native layout, theme treatment, width behavior, and discoverable keyboard cues. |

## Impact

- New package surface under `packages/rpiv-specbase/`, following the extension and package precedents in `packages/rpiv-pi/`.
- Pi package metadata, extension command registration, custom TUI surface, deterministic fixtures, and package-level tests.
- Future source adapters will consume `@awarebydefault/specbase`; this slice does not require or redefine its lifecycle, board, or action contracts.
- No existing package API is changed.
