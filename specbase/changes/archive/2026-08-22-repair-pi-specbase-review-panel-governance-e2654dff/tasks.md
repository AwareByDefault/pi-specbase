## 1. Generated review-panel conformance evidence

- [x] 1.1 Add `packages/rpiv-specbase/review-panel-governance.test.ts` using the resolved runtime model and generated skill artifacts.
- [x] 1.2 Assert that the source derives the expected projection from the resolved review model, includes `enforcement`, excludes planes without `reviewLens`, and rejects added or missing generated lenses.
- [x] 1.3 Assert that the generated `specbase-review-panel` instrument is discoverable through the repository's Pi integration without duplicating its lens roster in `rpiv-specbase`.

## 2. Governed binding and native evidence

- [x] 2.1 Replace retired binding `panel-review` with `review-panel-projection-test` in the `agents/review-panel` enforcement pair after confirming no surviving requirement shares the retired review binding.
- [x] 2.2 Ran `npm test -- packages/rpiv-specbase/review-panel-governance.test.ts`: passed (2 tests). This proves deterministic projection and Pi-discoverable instrument availability, not reviewer-judgment quality.
- [x] 2.3 Ran `node ../openspec-extended-change-stacks/bin/specbase.js coverage --json`: the unarchived current pair remains broken under retired `panel-review`; unrelated `agents/ste-writing` and `ops/ste` are also broken, and `design-system/specbase-kanban` is degraded.

## 3. Governed validation

- [x] 3.1 Ran `node ../openspec-extended-change-stacks/bin/specbase.js validate repair-pi-specbase-review-panel-governance-e2654dff --strict`: passed.
