---
id: behavior.specbase-kanban
---

## ADDED Requirements

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
