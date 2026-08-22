# Technical evidence

## Binding linkage

| Requirements | Binding | Source |
| --- | --- | --- |
| `explicit-demo-board`, `keyboard-board-navigation`, `selected-fixture-action-intent` | `fixture-kanban-interaction-test` (`test`) | `packages/rpiv-specbase/kanban/fixture-board.test.ts` |
| `pi-integration-ownership`, `canonical-specbase-semantics-remain-external`, `source-neutral-renderer-boundary` | `rpiv-specbase-boundary-test` (`test`) | `packages/rpiv-specbase/extension.test.ts` |
| `chat-preserving-board-presentation`, `pi-native-visual-language` | `kanban-presentation-review` (`review`) | `design` |

## Native-harness execution

- `npm test -- packages/rpiv-specbase/kanban/fixture-board.test.ts` — passed: 10 tests.
- `npm test -- packages/rpiv-specbase/extension.test.ts` — passed: 5 tests.
- `npm test -- packages/rpiv-specbase/ship-manifest.test.ts` — passed: 1 test.
- `npm test -- packages/rpiv-specbase` — passed: 16 tests.
- `npm run check:files -- packages/rpiv-specbase` — passed with no fixes or warnings.
- `npx tsc --noEmit -p tsconfig.base.json` — passed.
- `npm pack --dry-run --workspace @juicesharp/rpiv-specbase` — passed; the package tarball contains its manifest, extension entry, and all five production board modules.
- `specbase validate open-a-fixture-backed-specbase-kanban-in-pi-dc4e7851 --strict` — passed.

The executable sources prove fixture command parsing, source-neutral input, navigation, intent/cancellation, no dispatch, rerender/disposal, row budgets, width safety, active-theme redraw, package ownership, and manifest coverage. They do not prove a live Specbase source contract.

## Frame evidence and design review

The following ANSI-stripped frames were rendered from the fixture board using a 40-row / 120-column wide viewport and a 22-row / 40-column constrained viewport. The actual component calls Pi theme functions at render time; the fixture test switches the active injected theme after `invalidate()`.

### Wide — 40 rows × 120 columns

```text
 Specbase kanban · Specbase fixture board
▶ Ideas with a deliberately long life… │   Planned (0) │   Applying (1)
› Open a fixture-backed Specbase kanb… │  │   Keep the renderer source-neutral
 │  │
 │  │
 │  │
 │  │
 │  │
 │  │
 │  │
 │  │
 │  │
 │  │
 ←/→ columns · ↑/↓ cards · Enter detail · Esc cancel
```

### Narrow — 22 rows × 40 columns

```text
 Specbase kanban · Specbase fixture boa…
▶ Ideas with a deliberately long lifecy…
› Open a fixture-backed Specbase kanban…



 ←/→ columns · ↑/↓ cards · Enter detail…
```

Design review outcome: pass after remediation. Independent review found an out-of-lockstep package version, ignored Pi keybindings/Ctrl+C, compact views that could truncate controls or focused rows, underestimated host chrome, off-screen card/action focus, silent blocked actions, and unstable unpadded columns. The package now matches workspace version `2.6.4`, uses injected select bindings plus Vim keys, reserves four host rows, provides an explicit too-short recovery, windows card/action lists around focus, keeps cancellation first in compact hints, displays blocked reasons, pads columns, themes separators, and exercises the production overlay factory. `node scripts/sync-versions.js`, typecheck, package tests, and Biome all pass.

## Human-operator UX spike — 2026-08-21

**Journey:** Launched a real nested Pi session at 160×40 with `pi -e ./packages/rpiv-specbase`, invoked `/spcb:kanban --demo`, navigated columns with `h/l`, opened card details/actions, focused an unavailable fixture action, pressed Enter, cancelled with Ctrl+C, and observed return to the normal chat/editor surface. Repeated at 120×30 to inspect blocked-action feedback.

- **Simplicity:** One explicit command opens the board immediately without a model call. The three-stage card → detail → action flow is learnable and prevents accidental dispatch.
- **User-centered design:** The board occupies the top region while the existing conversation, editor, footer, and extension notices remain visible below it. Empty columns are still navigable.
- **Visibility:** Side-by-side headers, counts, `▶`/`›` focus markers, contextual detail, and the always-first cancellation hint made current context obvious without color alone.
- **Consistency:** Pi theme colors, injected cancel/up/down/confirm bindings, arrow keys, and Vim `h/j/k/l` work within the host instead of behaving like a separate terminal application.
- **Feedback:** Selecting a blocked action shows `(blocked)`, its reason, and a blocked-specific help line; Enter leaves the board in place. Ctrl+C returns to chat with an explicit “cancelled; no action dispatched” notification.
- **Clarity:** Long labels truncate cleanly and details explain the selected card. The fixture's very long Ideas label demonstrates the boundary but is visually heavier than realistic lifecycle labels.
- **Accessibility/keyboard:** The complete journey is keyboard-only, supports Ctrl+C/Escape and non-color focus, and produces plain terminal text. Mouse interaction is intentionally deferred because fullscreen Pi consumes pointer events before custom components.
- **Usability:** At 160 columns the board is comfortably scannable. At 120 columns three columns remain useful. Compact and too-short modes preserve cancellation and focused content instead of silently clipping it.
- **Efficiency:** Opening, navigating, and closing are synchronous and instant; no child process, Specbase read, or workflow starts in this slice.
- **Delight:** Seeing the kanban coexist with the live Pi transcript validates the core product idea; returning to the untouched editor after Ctrl+C feels native.
- **Observed defects fixed:** Release lockstep, hidden controls/focus, ignored host keybindings, silent blocked actions, chrome budgeting, and column alignment were corrected before this journal.
- **Optional unfixed improvements:** Render key hints from the user's actual remapped bindings, add a compact mode indicator explaining why columns collapsed, and reduce unrelated startup skill-conflict noise visible beneath the overlay. The conflicts come from generated project skills, not this package.

`specbase coverage --json` still reports broken current-store bindings outside this change (`agents/review-panel`, `agents/ste-writing`, and `ops/ste`); the current-store aggregate does not assess active change deltas. No action was taken on those unrelated sources.
