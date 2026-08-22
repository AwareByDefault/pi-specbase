## Outcome

Selecting a card exposes only authoritative valid actions; choosing a conversational action returns to Pi with the canonical skill invocation, while autonomous actions enter the injected workflow dispatcher.

## Demonstration

Fixtures prove enabled and blocked actions, exact immutable intent transport, feedback, refresh, and rejection of arbitrary commands.

## Explicit deferrals

Live workflow progress and the full delivery workflow remain deferred.

## Dependency

Consumes the Specbase direct-action catalog and intent validator.

## Verification evidence

### Linkage

`packages/rpiv-specbase/kanban/action-dispatch.test.ts` is linked by `kanban-action-dispatch-test` to `authoritative-card-actions`, `exact-validated-intent-transport`, `conversational-action-dispatch`, `autonomous-action-dispatch`, and `dispatch-feedback-and-refresh`.

### Native execution

- `npm test -- packages/rpiv-specbase/kanban/action-dispatch.test.ts` — passed: 1 file, 12 tests.
- `npm test -- packages/rpiv-specbase` — passed: 5 files, 40 tests.
- `npm run check:files -- packages/rpiv-specbase` — passed: 14 files checked, no fixes required on the recorded run.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.base.json` — passed with no diagnostics.

### Semantic correspondence

The isolated suite injects the action catalog, fresh validator, Pi sender, capability registry/dispatcher, and refresh port. It proves canonical enabled/blocked rendering and exact descriptor identity, frozen minimal selections, stale/malformed/mismatched rejection, duplicate suppression, exact conversational invocation transport, both named capability routes with trigger correlation, acceptance/refusal feedback, reopen/reload recovery, and refresh failure remaining distinct from accepted dispatch.

All fixtures are in-memory fakes/spies. They invoke no real skill, workflow, shell command, registered store mutation, or delivery side effect.

### Functionality review and remediation

Independent review found dispatch was not bound to the presented card/store, Pi's void `sendUserMessage` could be falsely described as executed, duplicate suppression was coordinator-local, accepted routes performed redundant pre-effect refreshes, and per-card catalog loading amplified full-store work. The command now requires card/action/store identity equality, the coordinator reasserts the selected source after fresh validation, registered/nearest sources re-prove root identity, skill messages use Pi's `followUp` queue and are described as queued, coordinators share one extension-level in-flight registry, and production refresh occurs once when a capability result reopens the board. Archived cards skip catalog calls. The later local-delivery lease remains the cross-process mutation guard.

## Human-operator UX spike — 2026-08-21

**Journey:** Linked the companion API, launched a real Pi session, opened the nearest live board, entered the first Ready card's canonical action list, focused a blocked Propose action and pressed Enter, then selected the available `specbase.local-delivery` capability before its handler existed. Observed the canonical queueing notice, explicit missing-dispatcher warning, fresh board reopen/loading state, and safe Ctrl+C return.

- **Simplicity:** Card → details → actions makes authority discoverable without adding a separate command palette. Canonical ordering gives conversational Apply and autonomous Deliver distinct labels.
- **User-centered design:** Blocked actions remain visible with the exact reason and next step; users learn the lifecycle rather than seeing controls disappear mysteriously.
- **Visibility:** Available and blocked states, focus, full card progress, all nine canonical actions, and the selected blocked explanation were simultaneously visible in a 160-column Pi surface.
- **Consistency:** Skill routes and capability routes share selection, validation, feedback, and stale-recovery semantics while keeping their execution adapters separate.
- **Feedback:** Enter on a blocked action leaves the board stable with remediation. Selecting an unregistered capability closes the overlay, reports “Queueing…”, warns that no dispatcher is registered, and reopens a fresh board instead of pretending work started.
- **Clarity:** “Apply conversationally” versus “Deliver to green local commits” clearly distinguishes interactive and autonomous paths. Nine actions create a dense list, but lifecycle-inapplicable choices explain themselves.
- **Accessibility/keyboard:** Vim/arrow navigation, Enter, blocked feedback, and Ctrl+C cover the full action journey with non-color markers and textual reasons.
- **Usability:** Revalidation and presented-card/store binding make stale or substituted actions recoverable. Reopening at loading state after capability refusal is safe but visually abrupt.
- **Efficiency:** Catalogs are skipped for archives, but every open work card still performs a separate catalog/revision scan before first paint; this is the largest observed latency risk.
- **Delight:** The board can now expose a real autonomous capability without embedding or trusting a workflow name, validating the intended package boundary.
- **Observed defects fixed:** Cross-card/store substitution, void-send acknowledgement language, command-local duplicate suppression, and redundant production refreshes were corrected.
- **Optional unfixed improvements:** Add a Specbase batch action-catalog API, preserve the selected card while the board reopens after refusal, collapse low-value blocked actions by default, and surface a short-lived feedback banner inside the overlay rather than only in the transcript.
