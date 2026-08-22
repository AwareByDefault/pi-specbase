## Verification record

### Commit checkpoints

- RED evidence: `71a591a6` (`test(delivery): specify RED-to-review workflow`). The current dispatcher still accepted a legacy local-delivery capability; the focused test failed before the implementation change.
- GREEN implementation: `e010a10a` (`feat(delivery): compose RED-to-review workflow`). The current dispatcher exposes only `specbase.ready-to-review`; focused and full repository checks pass.
- Implementation review selected the workflow's typed `refactor: skipped` path: no additional code-only refactor had a better risk/reward after the safety remediation.

### Structural linkage

- Current action/correlation → `packages/rpiv-specbase/kanban/action-dispatch.test.ts`.
- Handler, lease, phase policy, and current-only registry → `packages/rpiv-specbase/workflows/capability-handler.test.ts`.
- Graph, checkpoint order, command-result fingerprint, and no-red-push attestation → `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts`.
- Ready remote flow and legacy draft boundary → `packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts` and `draft-pr-delivery.test.ts`.

### Native-harness execution

- Focused workflow/action/host suites: 6 files, 89 tests passed during remediation.
- All `rpiv-specbase` plus SDK workflow-host tests: 14 files, 168 tests passed.
- Full repository `npm test`: 272 files, 5,125 tests passed.
- `npx tsc --noEmit -p tsconfig.base.json`: passed.
- Biome checks: passed.
- `npm pack --dry-run --workspace @juicesharp/rpiv-specbase`: passed; 41 production files, including ready workflow/contracts and five workflow-only skills.
- Strict change validation and four-member stack validation passed.
- `git diff --check`: passed.

### Semantic correspondence

- Current catalog v2 dispatches exactly `ready-to-review` / `specbase.ready-to-review`; legacy local/draft handlers remain exported for explicit recovery but are not registered in the current board dispatcher.
- One owner/run/lease freezes canonical authorization, immutable baseline, declared evidence, production roots, task units, stack context, and remote identity.
- Dedicated readiness and RED-evidence skills use ready-specific artifact markers. Evidence mutation is limited to declared sources; implementation/refactor mutation is limited to frozen production roots and cannot edit evidence, planning, `.git`, or remote state.
- Child Bash cannot add/reset/commit/push. Host scripts run declared evidence commands, reject infrastructure RED, create evidence-only RED, GREEN, and optional refactor/fix commits, and store SHA/parent/tree/path/command-result fingerprints.
- Host-owned task completion occurs only after GREEN evidence/gates pass; a failed GREEN attempt does not tick planning tasks.
- Resume verifies checkpoint schema, parents, trees, paths, command-result fingerprints, and current HEAD before continuing.
- Candidate gate reruns evidence and repository commands on exact current HEAD after every commit. Remote preflight freshly revalidates the canonical action and hashes the real gate receipt and materialized generated-panel report.
- Push uses compare-before-mutate, exact SHA, non-force update, and remote-head re-observation. GitHub create/reuse rejects ambiguity, marks one draft ready, and re-observes open/non-draft/exact-head state.
- Canonical result recording requires lifecycle `reviewing`, `pullRequest.state: ready`, matching URL, and a refreshed canonical board card in Reviewing.
- The generated panel's metadata stamp is temporarily confined to the exact `.openspec.yaml`, then restored before current-head publication so it cannot dirty or alter the candidate.

### Adversarial review

Three independent review rounds found and drove remediation for dead readiness markers, an incompatible remote schema, child Git authority, broad mutation scope, stale gate booleans, weak receipt fingerprints, resume drift, blocked-action fallback, optional-refactor absence, panel timestamp dirt, and unignored run artifacts. All deterministic execution blockers were fixed.

One review-strength boundary remains for the later integrated panel review: the generated panel may fan out through Pi's `Agent` tool. The outer panel session is metadata-only and all mutation children are host-confined, but nested reviewer tool scoping is owned by the generated panel/subagent configuration rather than this workflow policy. The generated panel instructions require read-only reviewers, and post-panel restoration plus current-head gate/clean-tree checks catch repository mutation; remote-capability denial inside nested reviewer sessions is not independently proven here.

### Fake/live boundaries

- Disposable Git and fake GitHub prove non-force push, divergence stops, create/reuse, mark-ready, exact-head re-observation, and idempotency. Live credentials/provider behavior is not claimed.
- Actual model quality for RED classification, implementation, refactor judgment, and panel findings remains agentic; host checks own scope, command outcomes, commits, and publication authority.
