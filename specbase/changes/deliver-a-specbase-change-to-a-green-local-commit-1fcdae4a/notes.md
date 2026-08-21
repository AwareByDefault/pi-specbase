## Outcome

One board action serially reviews a selected ready change, implements its declared enforcement sources, implements tasks until native evidence is green, reviews and fixes local refactor opportunities, and leaves scoped atomic commits with a resumable audit trail.

## Demonstration

Disposable-repository tests prove exact local commit/final-gate behavior. A real keyboard-driven Pi run against a disposable governed change launched from `/spcb:kanban`, acquired a cross-process lease, loaded the package's workflow-only skills into confined child sessions, completed readiness, implemented and verified the declared evidence source, completed and verified the task, and reached a passing strict/native local gate. The model provider then returned an empty local-review response; the run stopped with its stable identity. A new Pi process resumed that run, reacquired the same change lease before replay, and reattached the interrupted review session, whose provider remained unresponsive. No remote existed and no remote, panel, archive, or successor mutation occurred.

## Explicit deferrals

The Specbase review panel, remote push, draft PR creation, merge, and archive remain deferred. A fully model-driven terminal commit was not claimed because the live provider stalled at local review; the deterministic commit/final-gate path remains covered by disposable-repository tests.

## Human-operator UX spike — 2026-08-21

**Journey:** Opened a real Pi TUI in a disposable governed Specbase repository, selected `deliver-hello-locally`, opened card actions, chose **Deliver to green local commits**, watched RPIV stages, inspected the worktree/audit, observed a provider interruption at local review, restarted Pi, and resumed the same run.

- **Simplicity:** The board action is understandable and starts with one Enter after selection. The nine-action menu is long; blocked actions make the autonomous choice harder to scan than necessary.
- **User-centered design:** Launch feedback immediately named the durable run ID. The work stayed local and recoverable when the model stopped responding.
- **Visibility:** The RPIV dock showed `capture`, `readiness`, `implement-evidence` with `0/1`, `implement-task` with `0/1`, `local-review`, token usage, and failure state. During active runs the dock often displaced the board, so card context and agent activity were not simultaneously visible.
- **Consistency:** Canonical cards did not move optimistically. Task and evidence audit identities remained separate, and the board's lifecycle stayed derived from Specbase.
- **Feedback:** Unsupported shell attempts failed visibly inside the child and were audited; the model adapted to Read/Ls, single-command Bash, and bundled helpers. Fresh validation produced a stable launch acknowledgement.
- **Clarity:** `Deliver to green local commits` is precise. Package-update banners, skill-collision diagnostics, and workflow-only skills in the root Skills list add substantial unrelated noise.
- **Accessibility/keyboard:** The full journey used Enter, `j`, and normal Pi commands without mouse or color-only state. Focus and action position remained predictable.
- **Usability:** The happy path through a green gate worked, but the provider's empty review response made the overall result feel failed despite completed implementation. Resume preserved the run and reacquired its lease, which prevented lost work.
- **Efficiency:** Readiness, one evidence unit, and one task consumed several minutes and multiple model calls. Early versions triggered repeated denied command retries; skill guidance now names the narrow tools and bundled helper location. A deterministic readiness stage would be faster than model judgment for most checks.
- **Delight:** Seeing a failing native test become a verified implementation while the matching RPIV stage advanced was compelling. Durable resume after restarting Pi was the strongest moment.
- **Observed defects fixed during the journey:** SDK `baseToolsOverride` was ignored by `createAgentSession`; confined tools now use same-name SDK `customTools`. Child loaders now receive package workflow-skill paths. Run-owned artifacts can be written only at declared output names. Internal RPIV audit files are excluded from baseline dirt. Helper paths are explicit. Unsupported local syntax is audited separately from genuinely forbidden capability requests.
- **Observed unresolved defects:** Workflow-only skills remain user-visible; the board and lane dock compete for vertical space; an empty provider response can stall again after reattach; trusted repository `npm` scripts remain a transitive local capability; affected roots remain repository-wide when Specbase exposes no narrower task write set.
- **Optional improvements:** Hide workflow-only skills from slash discovery, show the active card and lane progress together, add a retry-fresh-session option after empty model output, batch deterministic readiness checks, and expose canonical task-to-command/write-root contracts.
