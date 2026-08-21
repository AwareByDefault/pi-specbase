# Technical evidence

## Binding linkage

| Requirements | Binding | Source |
| --- | --- | --- |
| `explicit-demo-board`, `live-store-selection`, `authoritative-live-board-projection`, `identity-preserving-refresh` | `live-kanban-board-test` (`test`) | `packages/rpiv-specbase/kanban/live-board.test.ts` |

The change delta now links the executable source directly. The predecessor's fixture tests continue to cover deterministic demo navigation and no-dispatch behavior.

## Native-harness execution

- `npm test -- packages/rpiv-specbase/kanban/live-board.test.ts` — passed: 1 file, 12 tests.
- `npm test -- packages/rpiv-specbase` — passed: 4 files, 28 tests.
- `npm run check:files -- packages/rpiv-specbase` — passed with no fixes or warnings.
- `npx tsc --noEmit -p tsconfig.base.json` — passed.
- `npm pack --dry-run --workspace @juicesharp/rpiv-specbase` — passed; the tarball includes both live production modules and excludes tests.
- `specbase stack validate deliver-specbase-work-from-an-interactive-pi-kanban-df587c88 --json` — passed; every projected prefix is valid, including this second member.

Standalone `specbase validate open-live-specbase-stores-in-the-pi-kanban-16f97859 --strict` does not project active predecessors and therefore reports that this member's `MODIFIED explicit-demo-board` has no current accepted base. The CLI-resolved stack validator does project the required predecessor and reports this member valid. `specbase coverage --json` reports three broken accepted-store bindings in `agents/review-panel`, `agents/ste-writing`, and `ops/ste`; those baseline targets are outside this package and change.

## Semantic correspondence and limits

The live-board source injects canonical public API fakes and proves:

- empty args select the canonical nearest-root resolver, `--store <id>` selects the registered-store resolver, and `--demo` remains independent;
- conflicts, malformed requests, and canonical resolution failures do not open demo or live fallback fixtures;
- the adapter calls `deriveKanbanBoard`, validates with the companion's declared board version, preserves the complete canonical snapshot and each lane/card object at the renderer seam, and retains exact stable work-item IDs and canonical lane ordering;
- valid cardless snapshots are empty, not failures;
- initial load, failure/retry, refresh, stale/retry, and recovery are distinct;
- only the newest refresh generation commits; successful refreshes reconcile focus by identity, then the nearest card in the same column, then first board-order card;
- live and demo boards use the same top-anchored 45% overlay contract, while demo never loads the optional peer.

These fakes prove adapter fidelity and Pi state behavior, not correctness of the companion library's lifecycle derivation, registry persistence, validation implementation, or filesystem reads. No test executes the Specbase CLI or infers lifecycle from paths.

## Functionality review and remediation

Independent review found live navigation still bounded itself to the one-column loading placeholder, the optional peer range falsely accepted 1.6 and unbounded future majors, spec-only stores were not empty work boards, pending refreshes could publish after disposal, diagnostic details were hidden, no-action details advertised Enter, and tests used an unrealistic version/empty shape. It also identified that stack context was promised although the companion snapshot does not publish it.

The renderer now navigates the replaced snapshot; the optional peer is `>=2.0.0 <3`; empty classification excludes the accepted-spec reference column; disposal invalidates pending generations and listeners; top-level and card diagnostics include canonical code/message/remediation; no-action detail says so; fakes use board version 3 and spec-only empty state; and the proposal/design/tasks explicitly defer stack/action composition instead of inventing it. Focused tests cover placeholder replacement and pending-dispose behavior.

## Companion contract gaps

Checked against `/Users/nlaundry/Projects/openspec-extended-change-stacks` on `spike/pi-specbase-api`:

- The public `KanbanBoardSnapshot` currently supplies lifecycle lanes, progress, specs, and diagnostics, but no stack membership or stack relationship field. This slice does not invent stack projection; the complete source snapshot remains attached for a future additive contract.
- Current canonical board cards do not carry action descriptors. Normal production cards therefore expose no invented action, and details explicitly say no actions are present. Validated direct-action composition belongs to the next dispatch slice.
- The companion branch is unpublished. `@awarebydefault/specbase` is an optional `>=2 <3` peer loaded dynamically only for live requests; missing/incompatible peers produce direct installation feedback.

## Human-operator UX spike — 2026-08-21

**Journey:** Built the companion Specbase branch, linked it as the optional peer, launched a real 160×40 Pi session with the local package, invoked `/spcb:kanban` from the `pi-specbase` repository, inspected four live Ready cards and accepted specs, navigated through lifecycle/reference columns with Vim keys, opened a canonical detail with no actions, refreshed with `r`, cancelled with Ctrl+C, and observed return to chat.

- **Simplicity:** Empty arguments correctly mean the nearest store; `--store <id>` and `--demo` are explicit alternatives. No CLI subprocess or duplicated lifecycle setup is visible to the operator.
- **User-centered design:** The first selected card is the first nonempty canonical lane rather than an empty Ideas column, putting current work immediately in view.
- **Visibility:** Live-source identity and refresh hint remain at the top; canonical progress appears in card detail; accepted specs remain a secondary column. Loading/refresh/stale/error status uses the same surface.
- **Consistency:** Live and demo modes share the top overlay, keyboard model, theme, cancellation, and chat-preserving layout. Canonical IDs and lane order survive refresh.
- **Feedback:** `r` retains the last good view while refreshing. Missing/incompatible peers and store failures provide direct next steps. Cards with no composed catalog explicitly say “no actions in this snapshot.”
- **Clarity:** The nearest-store label includes its path and the project title. Long change IDs still dominate card labels until richer summary metadata is available.
- **Accessibility/keyboard:** Vim and arrow navigation, Enter, `r`, Escape, and Ctrl+C complete the journey without mouse input; focus remains non-color text.
- **Usability:** Real store data made the board immediately useful. Moving through several empty columns to reach Accepted specs is predictable but slower than a dedicated reference shortcut.
- **Efficiency:** Dynamic API loading and board derivation felt immediate on this store; refresh requires a full canonical board derivation.
- **Delight:** The live board appears above the actual Pi transcript and updates without replacing the conversation—the core product hypothesis works.
- **Observed defects fixed:** Placeholder-bounded navigation, false peer compatibility, spec-only emptiness, late refresh publication, hidden diagnostics, and false action affordance were corrected.
- **Optional unfixed improvements:** Add direct jumps between nonempty lanes/reference view, expose stack relationships in the companion snapshot, provide richer card titles, and reduce unrelated generated-skill YAML conflict noise beneath the board.
