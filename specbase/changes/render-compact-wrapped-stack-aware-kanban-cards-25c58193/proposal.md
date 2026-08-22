## Why

The live Pi kanban still spends scarce terminal rows on accepted specifications and fixed blank card rows. Long titles and verbose RPIV activity make active work difficult to scan, while stack membership is not continuously visible. The canonical Kanban v4 contract supplies the stack context needed to make active delivery work compact, navigable, and legible.

## What Changes

- Consume validated canonical Kanban v4 work-item snapshots without rendering accepted specifications as board cards.
- Preserve logical card navigation while wrapping ANSI-styled titles to at most two physical rows and windowing each lane by rendered rows.
- Shrink sparse board overlays to their populated content, summarize RPIV activity on cards, and retain full activity in card detail.
- Present canonical stack rails, position/total, and shared labels continuously; retain full canonical stack context in card detail.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: canonical live work projection, logical card navigation through wrapped rows, and access to canonical stack context (modified; one requirement added).

### Design-system truth
- `design-system.specbase-kanban`: chat-preserving compact overlay, two-line card scanability, and canonical stack-rail presentation (modified; two requirements added).

### Architectural truth
- No architectural delta. Existing `architecture.rpiv-specbase` requirements already require external canonical semantics and a source-neutral renderer. This change adapts new canonical presentation fields without adding a source, package, dependency edge, or boundary invariant.

## Enforcement intent

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `authoritative-live-board-projection` | `test` | `packages/rpiv-specbase/kanban/live-board.test.ts` | A validated v4 snapshot projects actionable canonical lanes and omits accepted-spec cards. |
| `keyboard-board-navigation` | `test` | `packages/rpiv-specbase/kanban/fixture-board.test.ts` | Wrapped cards window by physical rows while each `j`/`k` press selects one logical card. |
| `stack-context-remains-available` | `test` | `packages/rpiv-specbase/kanban/live-board.test.ts` | Canonical stack position, total, shared label, and full detail survive projection. |
| `chat-preserving-board-presentation` | `review` | `design` | Review confirms sparse overlays consume only useful rows while preserving useful chat. |
| `compact-card-presentation` | `review` | `design` | Review confirms title wrapping and condensed activity remain scannable without hiding detail. |
| `stack-rail-context-presentation` | `review` | `design` | Review confirms persistent rails communicate canonical stack membership without overpowering cards. |

## Impact

- Affected code: `packages/rpiv-specbase/kanban/{types,live-source,fixture-board,layout,workflow-activity}.ts` and their fixture/live/activity tests.
- External compatibility: the optional canonical Specbase peer must expose Kanban Board v4.
- No workflow, dependency, store-mutation, or application-code change is made by this planning change.
