---
id: behavior.specbase-kanban
---

## Purpose
Extend canonical cards with a clearly separate, accurately correlated RPIV activity overlay.

## ADDED Requirements

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
