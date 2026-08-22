---
id: behavior.specbase-kanban
---

### Requirement: Explicit demo board
**ID:** `explicit-demo-board`
The Pi user SHALL be able to explicitly open a deterministic fixture-backed Specbase kanban with `/spcb:kanban --demo`, and Pi SHALL never substitute fixture data for a live or invalid source request.

#### Scenario: Demo mode opens fixture work
**ID:** `demo-mode-opens-fixtures`
- **WHEN** the user invokes `/spcb:kanban --demo` in an interactive Pi session
- **THEN** the kanban opens with deterministic lifecycle columns and fixture cards
- **AND** no live Specbase store is read

#### Scenario: Demo mode is explicit
**ID:** `demo-mode-is-explicit`
- **WHEN** the user invokes a live or unsupported source request instead of `/spcb:kanban --demo`
- **THEN** Pi reports the canonical resolution failure or actionable usage
- **AND** no fixture board is opened implicitly

### Requirement: Keyboard board navigation
**ID:** `keyboard-board-navigation`
The Pi user SHALL be able to move focus among available lifecycle columns, logical cards, card details, and fixture actions using keyboard controls while the board remains open, even when cards occupy different numbers of rendered rows.

#### Scenario: Focus moves to an available card
**ID:** `focus-moves-to-available-card`
- **WHEN** the user moves from one lifecycle column to another with cards
- **THEN** the board places focus on a valid card in the destination column
- **AND** the focused card is visibly distinguishable

#### Scenario: Empty column preserves valid focus
**ID:** `empty-column-preserves-valid-focus`
- **WHEN** the user navigates through a lifecycle column with no cards
- **THEN** the board keeps a visible valid focus target
- **AND** further navigation remains available

#### Scenario: Wrapped cards retain logical navigation
**ID:** `wrapped-cards-retain-logical-navigation`
- **WHEN** the focused lane contains titles that render on one or two physical rows
- **THEN** each `j` or `k` navigation action moves focus by exactly one logical card
- **AND** the visible card window adjusts by rendered rows so the full focused card remains visible

### Requirement: Selected fixture action intent
**ID:** `selected-fixture-action-intent`
The fixture-backed board SHALL return the stable card identity and action identity chosen by the user without dispatching the action.

#### Scenario: User confirms a fixture action
**ID:** `user-confirms-fixture-action`
- **WHEN** the user confirms an action for the focused fixture card
- **THEN** the board closes with an intent containing that card identity and action identity
- **AND** no command, skill, workflow, message, or store mutation is dispatched

#### Scenario: User cancels the board
**ID:** `user-cancels-board`
- **WHEN** the user cancels the board
- **THEN** the board closes without an action intent
- **AND** no action is dispatched

### Requirement: Live store selection
**ID:** `live-store-selection`
The Pi user SHALL be able to open the nearest Specbase store from the current working directory or explicitly select a registered store by its stable store identity.

#### Scenario: Nearest store opens
**ID:** `nearest-store-opens`
- **WHEN** the user invokes `/spcb:kanban` from within a resolvable Specbase store
- **THEN** the board opens that nearest store
- **AND** the board identifies which store is being shown

#### Scenario: Registered store opens
**ID:** `registered-store-opens`
- **WHEN** the user invokes `/spcb:kanban --store <store-id>` with a registered stable store identity
- **THEN** the board opens that registered store regardless of the current directory

#### Scenario: Store cannot be resolved
**ID:** `store-cannot-be-resolved`
- **WHEN** neither the nearest nor requested store can be resolved
- **THEN** Pi reports the canonical resolution failure and a concrete next step
- **AND** no fixture data is substituted

### Requirement: Authoritative live board projection
**ID:** `authoritative-live-board-projection`
The live Pi kanban SHALL project validated canonical Kanban v4 actionable work lanes with their stable identities, lifecycle columns, progress, stack context, and diagnostics, and SHALL not render accepted specifications as kanban cards.

#### Scenario: Pi and headless snapshots agree
**ID:** `pi-and-headless-snapshots-agree`
- **WHEN** the Pi board and the canonical headless board read the same store state
- **THEN** equivalent work items have the same stable identities and lifecycle placement
- **AND** their progress, stack context, and diagnostics agree

#### Scenario: Accepted specifications are not work cards
**ID:** `accepted-specifications-are-not-work-cards`
- **WHEN** the selected store contains accepted specifications as well as actionable work
- **THEN** the validated canonical v4 snapshot and Pi board project the actionable work lanes without an accepted-specification card lane
- **AND** the accepted specifications remain available only through their canonical reference surfaces

#### Scenario: Valid empty store is distinct from failure
**ID:** `empty-store-is-distinct-from-failure`
- **WHEN** the canonical snapshot represents a valid store with no work items
- **THEN** the board presents an empty live store state
- **AND** it does not present a load failure or demo fixtures

### Requirement: Identity-preserving refresh
**ID:** `identity-preserving-refresh`
The Pi user SHALL be able to refresh an open live board to the latest canonical snapshot while retaining the selected card when its stable identity remains present.

#### Scenario: Selected card survives refresh
**ID:** `selected-card-survives-refresh`
- **WHEN** a refresh returns a changed snapshot that still contains the selected card identity
- **THEN** the board replaces its displayed state with the refreshed snapshot
- **AND** that card remains selected in its canonical lifecycle location

#### Scenario: Selected card disappears
**ID:** `selected-card-disappears`
- **WHEN** a refresh returns a snapshot without the selected card identity
- **THEN** the board moves focus to a deterministic valid fallback
- **AND** navigation remains available

#### Scenario: Refresh fails
**ID:** `refresh-fails`
- **WHEN** a live refresh fails after a successful snapshot was displayed
- **THEN** the board retains the last successful snapshot and marks it stale
- **AND** the user sees the failure and can retry

### Requirement: Authoritative card actions
**ID:** `authoritative-card-actions`
The Pi kanban SHALL present the canonical valid and blocked actions supplied for the selected work item without inventing additional executable actions.

#### Scenario: Enabled action is available
**ID:** `enabled-action-is-available`
- **WHEN** the canonical action catalog marks an action valid for the selected card
- **THEN** the card presents that action as selectable with its canonical identity

#### Scenario: Blocked action explains why
**ID:** `blocked-action-explains-why`
- **WHEN** the canonical action catalog marks an action blocked
- **THEN** the card prevents its selection and presents the canonical blocked reason

#### Scenario: Arbitrary command is absent
**ID:** `arbitrary-command-is-absent`
- **WHEN** the card action pane is open
- **THEN** the user cannot enter or execute arbitrary shell, skill, or workflow command text through the board

### Requirement: Exact validated intent transport
**ID:** `exact-validated-intent-transport`
The kanban SHALL preserve the complete canonical action intent from user selection through fresh validation and terminal dispatch.

#### Scenario: Selected intent reaches dispatch unchanged
**ID:** `selected-intent-reaches-dispatch-unchanged`
- **WHEN** the user confirms a currently valid action
- **THEN** the dispatch boundary receives the same store, work-item, action, dispatch-kind, and validation identities selected by the board

#### Scenario: Stale intent is rejected
**ID:** `stale-intent-is-rejected`
- **WHEN** fresh canonical validation no longer accepts the selected intent
- **THEN** the board reports the structured rejection
- **AND** no conversational message, workflow, command, or store mutation is dispatched

#### Scenario: Tampered intent is rejected
**ID:** `tampered-intent-is-rejected`
- **WHEN** an intent is malformed or mismatches its canonical dispatch descriptor
- **THEN** the dispatch boundary rejects it before any side effect

### Requirement: Conversational action dispatch
**ID:** `conversational-action-dispatch`
A valid conversational action SHALL return control to Pi and submit the exact canonical skill invocation through the Pi conversation.

#### Scenario: Conversational action enters Pi
**ID:** `conversational-action-enters-pi`
- **WHEN** fresh validation returns a conversational dispatch descriptor
- **THEN** the board closes and Pi receives the exact canonical skill invocation as the next user message
- **AND** no autonomous workflow is launched

### Requirement: Autonomous action dispatch
**ID:** `autonomous-action-dispatch`
A valid autonomous action SHALL enter the injected workflow dispatcher with stable run-correlation metadata derived from the canonical intent.

#### Scenario: Autonomous action launches once
**ID:** `autonomous-action-launches-once`
- **WHEN** fresh validation returns an autonomous dispatch descriptor and the user confirms it once
- **THEN** the injected dispatcher receives one launch request with the canonical intent
- **AND** the result carries a stable run identity correlated to the store, card, and action

#### Scenario: Duplicate confirmation is suppressed
**ID:** `duplicate-confirmation-is-suppressed`
- **WHEN** the same action is already validating or dispatching
- **THEN** an additional confirmation does not create another launch request

### Requirement: Dispatch feedback and refresh
**ID:** `dispatch-feedback-and-refresh`
The board SHALL distinguish action validation, dispatch, acceptance, and rejection and SHALL request a live board refresh after an accepted action.

#### Scenario: Accepted action refreshes state
**ID:** `accepted-action-refreshes-state`
- **WHEN** a conversational or autonomous action is accepted for dispatch
- **THEN** the user sees an acceptance acknowledgement
- **AND** the board requests the latest canonical snapshot

#### Scenario: Rejected action remains recoverable
**ID:** `rejected-action-remains-recoverable`
- **WHEN** validation or dispatch rejects an action
- **THEN** the board presents the reason without claiming acceptance
- **AND** the user can refresh or choose another canonical action

### Requirement: Correlated live workflow activity
**ID:** `correlated-live-workflow-activity`
A card SHALL show live RPIV workflow activity only for a run whose structured trigger metadata identifies that card's canonical store and work-item identities.

#### Scenario: Launched run repaints its card
**ID:** `launched-run-repaints-its-card`
- **WHEN** an autonomous action launches a workflow with valid Specbase trigger metadata
- **THEN** the originating card shows the workflow name and stable run identity
- **AND** lifecycle events update that card's active stage or unit progress

#### Scenario: Unrelated run is ignored
**ID:** `unrelated-run-is-ignored`
- **WHEN** an RPIV run has no valid Specbase trigger metadata for a card in the open store
- **THEN** that run does not appear as activity on any Specbase card

### Requirement: Exact workflow outcome presentation
**ID:** `exact-workflow-outcome-presentation`
The card SHALL preserve completed, stopped, failed, aborted, and cancelled RPIV outcomes and SHALL show an available stop or failure reason without reclassifying it.

#### Scenario: Gate stop is not shown as success
**ID:** `gate-stop-is-not-shown-as-success`
- **WHEN** a workflow terminates with a public recap that says it stopped at a gate
- **THEN** the card presents a stopped outcome and its reason
- **AND** the card does not present the run as completed delivery

#### Scenario: Failed run names the failure
**ID:** `failed-run-names-the-failure`
- **WHEN** RPIV reports a failed terminal outcome with an error
- **THEN** the card presents the failed state, stable run identity, and readable failure reason

#### Scenario: Cancellation remains distinct
**ID:** `cancellation-remains-distinct`
- **WHEN** RPIV reports an aborted or cancelled terminal outcome
- **THEN** the card presents that exact outcome rather than failure or completion

### Requirement: Resumable run identity
**ID:** `resumable-run-identity`
A card SHALL retain the stable RPIV run identity needed to resume an incomplete correlated run and SHALL update the same activity record when that run is resumed.

#### Scenario: Resumed run reactivates the card
**ID:** `resumed-run-reactivates-the-card`
- **WHEN** RPIV resumes a correlated run using its existing run identity
- **THEN** the card reactivates that run's workflow activity
- **AND** stale terminal presentation from the earlier attempt is cleared

#### Scenario: Late predecessor event is ignored
**ID:** `late-predecessor-event-is-ignored`
- **WHEN** a terminal event from a superseded run instance arrives after resume
- **THEN** it does not overwrite the resumed card activity

### Requirement: Reopened board activity recap
**ID:** `reopened-board-activity-recap`
Opening or refreshing a live board SHALL hydrate the latest correlated RPIV recap for each card from public run metadata and recap readers.

#### Scenario: Latest terminal recap is restored
**ID:** `latest-terminal-recap-is-restored`
- **WHEN** the user reopens a store whose card has prior correlated RPIV runs
- **THEN** the card shows the latest run identity and terminal recap for that card

#### Scenario: Non-terminal recap is recoverable
**ID:** `non-terminal-recap-is-recoverable`
- **WHEN** the latest correlated persisted run has no terminal recap after a process restart
- **THEN** the card presents an interrupted or resumable state
- **AND** it does not claim that the workflow is currently live or completed

### Requirement: Authorized delivery-to-review launch
**ID:** `authorized-local-delivery-launch`
The kanban SHALL start composed delivery only from a fresh canonical `specbase.ready-to-review` authorization for the selected change and SHALL identify repository, store, change, stack position, canonical intent, and pre-existing working-tree baseline before mutation.

#### Scenario: Ready change starts delivery
**ID:** `ready-change-starts-delivery`
- **WHEN** the user confirms the currently valid Deliver to human review action for a Ready change
- **THEN** one correlated RPIV run starts for that change
- **AND** its audit state identifies the selected change, canonical intent, stack position, and run-start baseline

#### Scenario: Authorization becomes stale
**ID:** `delivery-authorization-becomes-stale`
- **WHEN** fresh validation no longer authorizes delivery for the selected change
- **THEN** no delivery run mutates the repository
- **AND** the board reports the canonical rejection

### Requirement: Evidence-first RED then GREEN implementation
**ID:** `evidence-first-serial-implementation`
The composed delivery run SHALL review the governed change, implement only its declared executable evidence sources, prove the expected targeted RED state, commit that evidence checkpoint, then implement production tasks until the same declared evidence and repository gate are GREEN.

#### Scenario: Declared evidence produces RED first
**ID:** `declared-source-precedes-tasks`
- **WHEN** a Ready change declares executable evidence sources and implementation tasks
- **THEN** a source-scoped child authors those sources before production implementation
- **AND** the audit records an expected failing verification and atomic RED commit before any GREEN implementation commit

#### Scenario: Unit verification fails unexpectedly
**ID:** `unit-verification-fails`
- **WHEN** evidence cannot establish the planned failure or implementation cannot make declared verification green
- **THEN** the run stops without advancing as though the checkpoint succeeded
- **AND** it records the stable unit, command, exit result, and recovery reason

### Requirement: Green bounded local gate
**ID:** `green-bounded-local-gate`
The local-delivery run SHALL advance toward review or commit only when strict Specbase validation, declared source execution, task completion, scope checks, and repository-native checks are green.

#### Scenario: Gate passes
**ID:** `local-delivery-gate-passes`
- **WHEN** every frozen gate condition passes against the run-owned delta
- **THEN** the run records a green local-gate result and advances to local review

#### Scenario: Repair budget is exhausted
**ID:** `local-repair-budget-is-exhausted`
- **WHEN** a gate continues to fail after the bounded repair budget
- **THEN** the run stops with the failed checks and stable run identity
- **AND** it does not commit or report green delivery

### Requirement: Explicit checkpoint commits
**ID:** `reviewed-atomic-local-commits`
The composed delivery run SHALL preserve separate atomic RED and GREEN commits and MAY add a separate refactor commit only after proving the exact green checks remain green; every commit SHALL contain only run-owned paths allowed for that phase.

#### Scenario: Refactor preserves green
**ID:** `local-fix-remains-green`
- **WHEN** a bounded refactor follows the GREEN implementation commit
- **THEN** the run reruns the exact green checks before committing the refactor
- **AND** the refactor commit remains distinct from RED and GREEN commits

#### Scenario: Commits exclude baseline dirt
**ID:** `commits-exclude-baseline-dirt`
- **WHEN** the run creates RED, GREEN, refactor, or later fix commits
- **THEN** each commit contains only run-owned allowed paths for its recorded phase
- **AND** paths dirty before the run remain excluded

#### Scenario: Final local state is green
**ID:** `final-local-state-is-green`
- **WHEN** local implementation reaches the panel boundary
- **THEN** the recap identifies RED, GREEN, and any refactor commits plus passing exact checks
- **AND** the run-owned working-tree delta is clean

### Requirement: Recoverable checkpoint boundary
**ID:** `local-only-recoverable-boundary`
The composed delivery run SHALL preserve resumable checkpoint state, MAY leave an owned RED commit locally for recovery, and MUST NOT push, create or ready a pull request, archive, or launch a successor while current HEAD lacks a verified green attestation.

#### Scenario: Run stops recoverably
**ID:** `run-stops-recoverably`
- **WHEN** review, RED, implementation, GREEN, refactor, gate, panel, or publication preparation cannot continue safely
- **THEN** the card presents the stable run identity, stopped stage, checkpoint journal, and recovery reason
- **AND** completed audit units remain available to resume

#### Scenario: Red checkpoint stays local
**ID:** `local-completion-stops-before-remote-work`
- **WHEN** current HEAD is the RED checkpoint or its green attestation is missing or stale
- **THEN** no push, pull-request mutation, archive, or successor launch occurs

### Requirement: Fresh authority before remote delivery
**ID:** `authorized-review-delivery-launch`
Before any push or pull-request mutation, the composed run SHALL freshly revalidate the original canonical action and confirm that current HEAD is the exact green, gated, panel-reviewed head owned by the run.

#### Scenario: Green current head reaches remote preflight
**ID:** `green-local-change-starts-review-delivery`
- **WHEN** the run reaches remote preflight with a fresh authorization and exact verified green head
- **THEN** remote delivery continues under the same correlated run and immutable change identities

#### Scenario: Local or canonical state changed
**ID:** `local-state-is-no-longer-green`
- **WHEN** preflight cannot confirm authorization, commit ownership, clean run-owned delta, current-head gate, or panel footprint
- **THEN** the workflow stops before remote mutation
- **AND** the card presents the exact preflight failure

### Requirement: Machine-readable panel disposition
**ID:** `machine-readable-panel-disposition`
The review-delivery run SHALL preserve the Specbase panel report and classify it as `clean`, `advisory`, `local-fix`, or `replan` without changing any finding's review strength.

#### Scenario: Advisory findings proceed visibly
**ID:** `advisory-findings-proceed-visibly`
- **WHEN** the panel report is classified as advisory
- **THEN** the findings remain attached to the run and draft-PR context as review-strength
- **AND** the workflow may advance to the final deterministic gate

#### Scenario: Replan finding stops delivery
**ID:** `replan-finding-stops-delivery`
- **WHEN** a panel finding requires proposal, spec, design, enforcement-intent, task, or scope revision
- **THEN** the disposition is `replan` and the workflow stops before push
- **AND** the panel finding does not alter Specbase archive or coverage gates

### Requirement: Bounded panel fixes with final gate
**ID:** `bounded-panel-fixes-with-final-gate`
The review-delivery run SHALL apply only bounded in-scope local fixes, rerun the deterministic gate after each fix, and require a final green gate on current HEAD before push.

#### Scenario: Local fix is re-reviewed
**ID:** `local-fix-is-re-reviewed`
- **WHEN** a `local-fix` disposition produces an implementation change
- **THEN** the run proves the deterministic gate green, commits the fix atomically, and reruns the Specbase panel on the new HEAD

#### Scenario: Final gate fails
**ID:** `review-final-gate-fails`
- **WHEN** the final deterministic gate is not green
- **THEN** the workflow stops before push or PR creation
- **AND** the failed checks and stable run identity remain available for recovery

### Requirement: Idempotent safe push
**ID:** `idempotent-safe-push`
The review-delivery run SHALL make the selected branch's verified HEAD available on the configured remote by an idempotent non-force update and SHALL stop on divergent or ambiguous remote state.

#### Scenario: Remote already has verified head
**ID:** `remote-already-has-verified-head`
- **WHEN** the exact verified local HEAD already exists at the intended remote branch
- **THEN** the push stage succeeds as an idempotent no-op

#### Scenario: Remote branch can fast-forward
**ID:** `remote-branch-can-fast-forward`
- **WHEN** the intended remote branch can be updated normally to the verified local HEAD
- **THEN** the run pushes that HEAD and records the confirmed remote identity

#### Scenario: Remote branch diverged
**ID:** `remote-branch-diverged`
- **WHEN** publishing the verified HEAD would require force or the remote target is ambiguous
- **THEN** the workflow stops without rewriting remote history

### Requirement: Resume-safe pull request readying
**ID:** `resume-safe-draft-pull-request`
The composed delivery run SHALL create or find exactly one pull request for the verified head and base branches, safely reuse it on resume, and confirm that it is open and ready for human review before canonical recording.

#### Scenario: Pull request is created and readied
**ID:** `draft-pr-is-created`
- **WHEN** the verified remote head has no matching open pull request
- **THEN** the workflow creates one pull request, marks it ready for review, and records number, URL, base, head, and verified commit identities

#### Scenario: Existing pull request is reused
**ID:** `existing-draft-is-reused`
- **WHEN** a matching open draft or ready pull request already exists
- **THEN** the workflow reuses it, marks it ready if necessary, and does not create a duplicate

#### Scenario: Conflicting PR state stops
**ID:** `conflicting-pr-state-stops`
- **WHEN** matching pull-request state is duplicate, closed, merged, head-mismatched, or otherwise ambiguous
- **THEN** the workflow stops for human resolution without creating or mutating a replacement

### Requirement: Canonical Reviewing card outcome
**ID:** `canonical-reviewing-card-outcome`
After confirming the pull request is ready for human review, the workflow SHALL record the exact result through the canonical Specbase action contract and refresh until the card presents canonical Reviewing state with that link.

#### Scenario: Ready PR is linked from Reviewing
**ID:** `draft-pr-is-linked-from-reviewing`
- **WHEN** canonical action completion accepts the verified commit and ready pull-request descriptor
- **THEN** the refreshed card appears in canonical Reviewing
- **AND** the card links to the confirmed pull request

#### Scenario: Recording resumes without duplicate PR
**ID:** `recording-resumes-without-duplicate-pr`
- **WHEN** the ready pull request exists but canonical recording or board refresh was interrupted
- **THEN** resume reuses the same pull request and retries idempotent recording or refresh
- **AND** no duplicate pull request or readiness mutation is created

### Requirement: Human-controlled post-review boundary
**ID:** `human-controlled-post-pr-boundary`
The composed delivery run MUST NOT approve, merge, archive the change, delete the branch, or launch a successor stack member after reaching Reviewing.

#### Scenario: Workflow stops at Reviewing
**ID:** `workflow-stops-at-reviewing`
- **WHEN** the card shows the linked canonical Reviewing state
- **THEN** the workflow terminates successfully
- **AND** feedback handling, merge, archive, branch deletion, and successor delivery remain separately authorized actions

### Requirement: Stack context remains available
**ID:** `stack-context-remains-available`
The Pi kanban SHALL retain canonical stack identity, position, and total for every annotated work item, SHALL use that stable identity as the shared stack label, and MAY resolve full detail through the canonical stack-context API without recomputing membership.

#### Scenario: Stack context survives projection
**ID:** `stack-context-survives-projection`
- **WHEN** a canonical Kanban v4 work item supplies stack identity, position, and total
- **THEN** the projected card retains those exact values and presents one shared label for that identity
- **AND** selected-card detail can present canonical stack context without inferring membership from files

#### Scenario: Unstacked work remains usable
**ID:** `unstacked-work-remains-usable`
- **WHEN** a canonical work item supplies no stack context
- **THEN** the board continues to present and navigate that work item
- **AND** it does not invent stack position or shared-label data

### Requirement: Reviewing feedback actions
**ID:** `reviewing-feedback-actions`
A Reviewing card with a canonical pull-request descriptor SHALL present only its currently valid canonical actions for Address PR feedback, comment-aware Explore, and human Archive, including any canonical blocker and remediation.

#### Scenario: Reviewing card presents canonical actions
**ID:** `reviewing-card-presents-feedback-actions`
- **WHEN** the canonical action catalog makes feedback actions available for a Reviewing card
- **THEN** the card presents their exact canonical identities and availability
- **AND** it does not invent a command or additional remote action

#### Scenario: Feedback action is blocked
**ID:** `feedback-action-is-blocked`
- **WHEN** the canonical catalog blocks one of the Reviewing feedback actions
- **THEN** the card prevents its selection
- **AND** it shows the canonical blocker and remediation

### Requirement: Comment-aware feedback exploration
**ID:** `comment-aware-feedback-explore`
The selected comment-aware Explore action SHALL return control to Pi with the exact canonical feedback context for conversation and MUST NOT autonomously mutate the repository, GitHub, or Specbase lifecycle.

#### Scenario: User explores selected feedback
**ID:** `user-explores-selected-feedback`
- **WHEN** the user confirms a currently valid Explore action for a selected PR comment or review thread
- **THEN** Pi receives the exact canonical conversational invocation and feedback identity
- **AND** no autonomous workflow or remote mutation is launched

### Requirement: Revision-safe feedback resolution
**ID:** `revision-safe-feedback-resolution`
Address PR feedback SHALL report a frozen feedback revision as addressed only after its repository, pull request, namespace, comment or thread identity, revision, and pull-request head have been re-observed unchanged; a changed, deleted, or already-resolved revision SHALL be reported for re-observation rather than blindly acted on.

#### Scenario: Unchanged resolvable review feedback is addressed
**ID:** `unchanged-review-feedback-is-addressed`
- **WHEN** an actionable frozen review-thread revision remains unchanged through final verification and publication
- **THEN** the outcome identifies the fixing commit and reply
- **AND** the unchanged resolvable thread is resolved

#### Scenario: Feedback revision changed
**ID:** `feedback-revision-changed`
- **WHEN** re-observation finds an edited, deleted, already-resolved, or head-mismatched revision
- **THEN** the outcome identifies that revision as requiring re-observation
- **AND** no stale reply or resolution is claimed

#### Scenario: General comment is addressed
**ID:** `general-comment-is-replied-only`
- **WHEN** an unchanged actionable feedback item is a general PR comment
- **THEN** the outcome records an idempotent reply with the fixing commit
- **AND** it does not resolve a review thread

### Requirement: Human-controlled feedback archive
**ID:** `human-controlled-feedback-archive`
Addressing or exploring PR feedback MUST NOT archive a change; Archive SHALL remain a separately selected and confirmed human action.

#### Scenario: Feedback delivery completes
**ID:** `feedback-delivery-does-not-archive`
- **WHEN** an Address PR feedback run completes, stops, or is resumed
- **THEN** the Reviewing card remains governed by canonical lifecycle state
- **AND** the run does not archive the change or select an Archive action

#### Scenario: User archives explicitly
**ID:** `user-archives-explicitly-after-feedback`
- **WHEN** the user separately selects a currently valid Archive action
- **THEN** canonical action validation governs that archive request
- **AND** no feedback-workflow completion is treated as archive confirmation
