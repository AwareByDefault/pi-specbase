## 1. Package and fixture board
- [ ] 1.1 Create the `packages/rpiv-specbase/` Pi extension package using the monorepo sibling-package conventions, register `/spcb:kanban`, and retain the existing package ownership boundary.
- [ ] 1.2 Define source-neutral board snapshot and selection-intent types; add deterministic fixture snapshots with populated and empty columns, long labels, enabled and blocked-looking actions, and stable identifiers.
- [ ] 1.3 Implement explicit `--demo` parsing, actionable unsupported-mode feedback, and the interactive-session guard without reading a live store or dispatching an action.
- [ ] 1.4 Implement the keyboard-only Pi board surface: valid focus movement, card/detail/action drill-in, cancellation, active-theme rendering, and visible contextual key cues; enforce the 45%/18-row board cap, eight-row minimum visible-chat budget, explicit compact fallback, and width-safe lines.

## 2. Evidence and native verification
- [ ] 2.1 Implement `packages/rpiv-specbase/kanban/fixture-board.test.ts` for explicit demo entry, focus safety, selected/cancelled intent, no-dispatch behavior, wide/constrained row budgets, minimum visible-chat reservation, and over-width rejection; assert every state transition requests a rerender and board close disposes session-scoped subscriptions; run `npm test -- packages/rpiv-specbase/kanban/fixture-board.test.ts`, record the command and result, and link it to the three behavioral requirements.
- [ ] 2.2 Implement `packages/rpiv-specbase/extension.test.ts` for extension ownership, source-neutral renderer isolation, and session-shutdown disposal with no surviving listeners or timers; run `npm test -- packages/rpiv-specbase/extension.test.ts`, record the result, and link it to the architecture requirements.
- [ ] 2.3 Capture wide and narrow active-theme board states for `design`-lens review; record the review outcome, including any review-strength residue, for the design-system requirements.
- [ ] 2.4 Run `npm run check:files -- packages/rpiv-specbase` and the package tests after the final change; record both native-harness results separately from binding linkage.

## 3. Human-operator UX spike journal
- [ ] 3.1 After functional verification, conduct and record a keyboard-only human-operator UX spike journal covering simplicity, user-centered design, visibility, consistency, feedback, clarity, accessibility/keyboard behavior, usability, efficiency, delight, defects, and optional unfixed improvements; distinguish observed evidence from follow-up ideas.