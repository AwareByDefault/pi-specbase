## Outcome

A card launched from the board shows its active RPIV workflow, stage or unit progress, completion, stop reason, failure, and resumable run identity; reopening hydrates the latest recap.

## Demonstration

Workflow lifecycle fixtures correlated by trigger metadata repaint the open board and reconstruct the latest terminal state.

## Explicit deferrals

Workflow-specific delivery behavior and remote GitHub state remain deferred.

## Implementation evidence

### Linkage

- `packages/rpiv-specbase/kanban/workflow-activity.test.ts` is linked by `card-workflow-activity-test` to `correlated-live-workflow-activity`, `exact-workflow-outcome-presentation`, `resumable-run-identity`, and `reopened-board-activity-recap`.
- `packages/rpiv-specbase/workflow-bridge.test.ts` is linked by `workflow-bridge-conformance-test` to `workflow-lifecycle-observer-instrument`, `structured-trigger-correlation-instrument`, and `public-recap-hydration-instrument`.
- `packages/rpiv-workflow/state.test.ts` exercises the public `readRunStatus` durable-fold projection, including the interrupted-after-completed-stage boundary.

### Native execution

- `npm test -- packages/rpiv-specbase/kanban/workflow-activity.test.ts` and bridge/package suites — passed within `npm test -- packages/rpiv-specbase`: 7 files, 63 tests.
- `npm test -- packages/rpiv-workflow/state.test.ts packages/rpiv-workflow/runner/resume.test.ts` — passed: 2 files, 111 tests.
- `npm test -- packages/rpiv-workflow packages/rpiv-specbase` — passed after remediation: 71 files, 1361 tests.
- `npm run check:files -- packages/rpiv-specbase` — passed after formatting 18 files.
- `npm run check:files -- packages/rpiv-workflow/run-status.ts packages/rpiv-workflow/state.test.ts packages/rpiv-workflow/index.ts packages/rpiv-workflow/package.json` — passed after formatting the checked TypeScript files.
- `npx tsc --noEmit -p tsconfig.base.json` — passed.
- `npx specbase validate project-rpiv-workflow-activity-onto-kanban-cards-102cfd5c --strict` — passed.
- `npx specbase coverage --json` — aggregate remains invalid because accepted baseline pairs reference missing `specbase/config.yaml`, `.pi/skills/ste-writing/SKILL.md`, and `README.md`; this change's strict validation and linked sources pass.

### Semantic correspondence

- Workflow state-reader cases prove that a durable trail ending after a completed nonterminal stage remains `interrupted`, while natural graph completion, routed stop, failure, abort, and cancellation remain distinct.
- Activity fixtures prove validated trigger-only correlation, immutable live progress, out-of-order fan-out completion counts, retries, route stops, exact terminal outcomes, resume instance ordering, stale predecessor suppression, bounded recap caching, and non-mutating card composition.
- Bridge fixtures prove root-only idempotent registration, fail-soft callback and optional-package behavior, public-header/status/recap hydration, latest-run selection, truthful restart classification, repaint subscription disposal, and absence of private RPIV storage access.

### Functionality review and remediation

Independent audit found detached child shutdown could unregister the global observer, natural completion could not be distinguished durably from the crash seam, restart resume discarded correlation, dropped failure rows were advertised resumable, different run IDs were not monotone, auxiliary run maps could outgrow the cache, activity was hidden from card rows, and stage abort briefly appeared failed.

The package now declares `pi.ambientObserver`, rejects branded relay-child lifecycle, generation-guards pending registration against shutdown, and tests child shutdown/import races. RPIV writes a run-level terminal sidecar only after settlement; `readRunStatus` uses it and conservatively calls unmarked completion interrupted. Resume preserves original trigger metadata plus `resumedFrom`. Dropped failure rows disable resume, later run IDs suppress delayed older starts, terminal auxiliary maps are cleaned, live records are not evicted, abort settles through an interrupted state, and `RPIV <status>` renders before the card title. Real runner/state/resume tests cover the new contracts.

### Boundaries

- Legacy runs without a terminal sidecar remain conservatively interrupted even when their last stage sits at a terminal edge; they can be resumed or inspected rather than falsely called complete.
- Terminal sidecars add one internal file per settled run; public readers remain the only supported consumer.
- The fixture harness does not run a model-backed multi-stage delivery workflow yet; that happens in the next slices.

## Human-operator UX spike — 2026-08-21

**Journey:** Registered a real script-only RPIV workflow in the local project, launched it with `rpiv-specbase` trigger metadata for this change, confirmed its durable terminal status through the public reader, then opened a real Pi live kanban. Observed `RPIV completed` directly on the Implementing card, navigated to it, opened details, inspected workflow/stage/run identity, and cancelled back to chat.

- **Simplicity:** Workflow status appears on the work card without a separate lane browser or command. Opening details reveals the audit identity only when needed.
- **User-centered design:** The most important word—`completed`, `running`, `failed`, or `interrupted`—comes before workflow and run metadata, so narrow cards remain meaningful.
- **Visibility:** `RPIV completed` was visible in the column row before focus. Detail showed workflow name, terminal stage, stage number, and persisted run ID alongside canonical task/artifact progress.
- **Consistency:** Activity is an additive projection; the card stayed in canonical Implementing and retained its normal title/progress. Refresh and reopen reconstructed the same status from public readers.
- **Feedback:** A settled run changed the card text without mutating Specbase state. Interrupted/resumable and dropped-failure safety use explicit text rather than green/red inference.
- **Clarity:** Status-first formatting works well. The one-line detail truncates long run IDs, so copying the full identity still needs an inspect action.
- **Accessibility/keyboard:** Activity is plain text with no color dependency and uses the existing keyboard navigation/detail path.
- **Usability:** Operators can distinguish “Specbase lifecycle” from “agent currently doing work,” resolving a major ambiguity in the original board.
- **Efficiency:** Hydration lists runs and loads workflow definitions once, then reads the latest correlated run per card. Large run histories may eventually need an index.
- **Delight:** Seeing a real persisted RPIV result appear on the matching card makes the board feel alive rather than decorative.
- **Observed defects fixed:** Child observer teardown, false completion, lost resume correlation, unsafe resume affordance, stale run overwrite, hidden card activity, and abort mislabeling were corrected.
- **Optional unfixed improvements:** Add a full run-inspector action with copyable run ID, index correlations for large histories, animate live stages sparingly, and visually separate workflow status from lifecycle without adding clutter.
