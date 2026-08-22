## 1. Canonical v4 presentation

- [x] 1.1 Update the live Specbase adapter and its canonical fixtures to validate and project Kanban v4 actionable work lanes, omit accepted-specification cards, and preserve canonical stack context without local derivation.
- [x] 1.2 Extend board presentation input and selected-card detail rendering to retain canonical stack position, total, shared label, and full available stack context.

## 2. Compact row-aware renderer

- [x] 2.1 Add ANSI-safe visible-width title wrapping that renders at most two physical lines and preserves valid styled output.
- [x] 2.2 Replace card-count windowing with logical-card focus plus physical-row viewport calculation so `j`/`k` move exactly one card and keep the full focused card visible.
- [x] 2.3 Shrink sparse board frames to populated rows within the existing safe overlay cap, render concise RPIV activity on cards, and disclose complete activity in detail.
- [x] 2.4 Render canonical stack rails with position/total and shared labels on stacked cards while retaining full stack detail in the selected-card view.

## 3. Deterministic evidence

- [x] 3.1 Extend `packages/rpiv-specbase/kanban/fixture-board.test.ts` for ANSI-safe two-line titles, mixed-height physical-row windows, one-card `j`/`k` movement, sparse overlay height, and compact/detail activity disclosure.
- [x] 3.2 Extend `packages/rpiv-specbase/kanban/live-board.test.ts` for validated canonical Kanban v4 projection, accepted-spec omission, and exact preserved stack context.
- [x] 3.3 Maintain `fixture-kanban-interaction-test` and `live-kanban-board-test` in the behavior enforcement manifest with their requirement-level coverage.
- [x] 3.4 Execute `npm test -- packages/rpiv-specbase/kanban/fixture-board.test.ts packages/rpiv-specbase/kanban/live-board.test.ts` and record the result in the implementation progress.

## 4. Presentation review and governed validation

- [x] 4.1 Run the configured `design` lens against narrow, wide, sparse, active-work, and stacked-card frames; resolve or record review-strength findings.
- [x] 4.2 Maintain `kanban-presentation-review` in the design-system enforcement manifest with its requirement-level coverage.
- [x] 4.3 Run `specbase validate render-compact-wrapped-stack-aware-kanban-cards-25c58193 --strict` and record the result before requesting review.
