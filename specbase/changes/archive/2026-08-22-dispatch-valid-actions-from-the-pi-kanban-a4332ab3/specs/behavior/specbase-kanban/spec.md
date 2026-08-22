---
id: behavior.specbase-kanban
---

## Purpose
Extend the kanban with safe, authoritative action presentation, validation, dispatch, and feedback.

## ADDED Requirements

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
