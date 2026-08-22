## 1. Freeze contracts and implement RED evidence

- [x] 1.1 Add current canonical action/result typings and fixture contracts for `specbase.ready-to-review`, draft versus ready PR observations, and Reviewing refresh.
- [x] 1.2 Add failing composed-journey tests to `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts` and `specbase-draft-pr-delivery.test.ts`; run focused Vitest, verify failures represent missing behavior, and commit the RED checkpoint separately.
- [x] 1.3 Add failing phase-policy cases to `packages/rpiv-specbase/workflows/capability-handler.test.ts` and exact-dispatch cases to `packages/rpiv-specbase/kanban/action-dispatch.test.ts`; record their expected RED results.

## 2. Implement composed local delivery

- [x] 2.1 Define versioned spec-review, checkpoint-journal, verification, panel, publication, and canonical-result artifacts with host-owned immutable authority fields.
- [x] 2.2 Implement phase-specific evidence, implementation, and refactor policies: declared evidence paths only; production scope with evidence read-only; green-preserving refactor scope; no planning or Git metadata edits.
- [x] 2.3 Implement the `specbase-ready-to-review` graph through read-only review, expected RED commit, GREEN commit, optional refactor commit, deterministic gate, generated panel, and bounded fixes.
- [x] 2.4 Verify resumed RED/GREEN/refactor journals against exact SHAs, parents, paths, commands, results, and current tree before continuing.
- [x] 2.5 Run focused local workflow/policy tests to GREEN and commit the implementation separately from RED.

## 3. Implement safe review publication

- [x] 3.1 Revalidate canonical action, lease, baseline, clean owned delta, exact current HEAD, gate, and panel immediately before remote mutation.
- [x] 3.2 Extend narrow Git/GitHub adapters for non-force exact-head push, matching PR create/reuse, idempotent mark-ready, and immediate state re-observation.
- [x] 3.3 Record the exact ready pull-request result through Specbase and refresh until canonical board state reports Reviewing.
- [x] 3.4 Prove no route from RED/stale/failed state reaches push, PR mutation, archive, merge, approval, branch deletion, or successor launch.
- [x] 3.5 Run the complete disposable-Git/fake-GitHub journey to GREEN and commit the remote implementation atomically.

## 4. Refactor and verify

- [x] 4.1 Perform only bounded refactors after GREEN; rerun the exact focused checks and commit refactors separately.
- [x] 4.2 Run all affected rpiv-specbase/RPIV tests, TypeScript, Biome, builds, package dry-run, strict change validation, and stack validation.
- [x] 4.3 Record linkage, native-harness execution, semantic correspondence, fake-remote boundary, commit ordering, and final exact HEAD in implementation evidence.
- [x] 4.4 Run the generated review panel on the final green head and remediate bounded implementation findings in separate green commits.
