## Verification record

### Structural linkage

- Canonical v4 projection and stack preservation → `packages/rpiv-specbase/kanban/live-board.test.ts` through `live-kanban-board-test`.
- Keyboard navigation, ANSI wrapping, physical-row viewport, sparse height, compact activity, rail, and detail disclosure → `packages/rpiv-specbase/kanban/fixture-board.test.ts` through `fixture-kanban-interaction-test`.
- Presentation judgment → configured `design` lens through `kanban-presentation-review`.

### Native-harness execution

- RED checkpoint `7c0c5af4`: 6 expected failures and 36 passes. Missing behavior was accepted-spec removal, stack detail projection, two-line ANSI wrapping, row-aware focus, sparse height, and compact activity.
- `npm test -- packages/rpiv-specbase/kanban/fixture-board.test.ts packages/rpiv-specbase/kanban/live-board.test.ts packages/rpiv-specbase/kanban/workflow-activity.test.ts packages/rpiv-specbase/kanban/action-dispatch.test.ts`: 4 files, 61 tests passed after review remediation.
- `npm test -- packages/rpiv-specbase`: 13 files, 121 tests passed before the final review-only renderer adjustment; the affected focused set reran green afterward.
- `npx tsc --noEmit -p tsconfig.base.json`: passed.
- `npx biome check packages/rpiv-specbase`: passed.
- `npm pack --dry-run --workspace @juicesharp/rpiv-specbase`: passed; 33 production files, no test/planning artifacts packed.
- Strict change validation and four-member stack validation passed.
- `git diff --check`: passed.

### Semantic correspondence

- Live loading requires canonical Kanban v4, retains Ideas through Archived, and creates no accepted-specification column.
- Exact stack identity/position/total is copied from v4; richer context is requested once only for annotated cards. Per-card context failure preserves the rail and board and adds a visible notice.
- Archived cards retain stack and ready-PR detail but never trigger action-catalog lookups.
- ANSI-styled titles render on at most two display-width-safe rows. Logical focus remains one card per `j`/`k`, while the viewport budgets complete physical cards.
- Sparse boards return populated rows only under the unchanged safe overlay cap.
- Compact RPIV state and ordinal-first stack rails remain separate visible metadata rows; full activity and canonical stack context remain keyboard-scrollable in detail.

## Keyboard-only UX journal

| Frame | Keys | Observable result |
|---|---|---|
| Narrow styled title, 30 columns | Open board | `wrap-start` and `wrap-tail` occupy exactly two ANSI-safe title rows; every row remains ≤30 display cells. |
| Mixed-height lane, 42 columns | `j` ×6 | Focus moves from logical card 0 to card 6 one card at a time; both `focus-start` and `focus-tail` remain visible together. `k`, then `j`, returns to the same immutable card. |
| Sparse wide board, 120×40 | Open board | Frame contains header, lane header, one card, and help only: 4 rows rather than the 18-row safe cap, leaving chat space below. |
| Long stack identity, 24 columns | Open board | `RPIV running` remains visible on its own row; the separate rail begins `┊ 2/3` before the truncated shared label. |
| Stacked active detail, 52×24 | `Enter`, then `j` ×12 | Detail first exposes complete workflow/stage/unit/retry/run data and early stack members; keyboard scrolling reveals `member-19` without changing card focus. |
| Stacked live card, 120 columns | `l` ×4, `Enter` | Persistent `delivery-rail 2/3` is visible on the card; detail exposes canonical predecessor/context members. |

### Design review

The configured `design` lens assessed narrow/wide, sparse, active-work, stack-rail, and selected-detail deterministic frames. It found one medium review-strength issue: a long stack label could truncate the compact RPIV state. Remediation placed activity and the ordinal-first rail on separate metadata rows; the narrow regression test and an independent verifier confirmed the fix. No live Pi terminal was available, so visual judgment is bounded to deterministic renderer frames.

### Boundaries

- Stack detail failures are presentation notices, not canonical lifecycle or membership changes.
- Pi still dispatches only canonical action descriptors; this member changes no action policy or workflow binding.
- No production renderer reads Specbase files or infers stack membership.
