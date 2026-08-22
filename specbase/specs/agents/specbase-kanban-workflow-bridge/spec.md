---
id: agents.specbase-kanban-workflow-bridge
---

### Requirement: Workflow lifecycle observer instrument
**ID:** `workflow-lifecycle-observer-instrument`
The repository-owned Specbase kanban workflow bridge SHALL register an idempotent, observation-only listener over the public RPIV lifecycle surface.

#### Scenario: Root session registers once
**ID:** `root-session-registers-once`
- **WHEN** the Pi root session starts or reloads with RPIV available
- **THEN** one active bridge listener observes workflow lifecycle events for the session
- **AND** detached child sessions do not add duplicate listeners

#### Scenario: Observer failure does not gate a run
**ID:** `observer-failure-does-not-gate-a-run`
- **WHEN** the bridge cannot project a lifecycle event
- **THEN** the bridge surfaces a non-blocking diagnostic
- **AND** it does not alter the workflow's route, status, or continuation

### Requirement: Structured trigger correlation instrument
**ID:** `structured-trigger-correlation-instrument`
The workflow bridge MUST correlate runs to cards only from validated `rpiv-specbase` trigger metadata carrying canonical store, work-item, action, and intent identities.

#### Scenario: Complete metadata is correlated
**ID:** `complete-metadata-is-correlated`
- **WHEN** a lifecycle event carries complete valid Specbase trigger metadata
- **THEN** the bridge publishes activity under the identified store and work item

#### Scenario: Ambiguous metadata is not guessed
**ID:** `ambiguous-metadata-is-not-guessed`
- **WHEN** trigger metadata is absent, malformed, or incomplete
- **THEN** the bridge leaves the run uncorrelated
- **AND** it does not infer a card from workflow input, titles, timestamps, or branch names

### Requirement: Public recap hydration instrument
**ID:** `public-recap-hydration-instrument`
The repository SHALL expose and the workflow bridge SHALL consume public RPIV run-header, terminality, and recap readers that reconstruct persisted card activity without parsing private workflow storage.

#### Scenario: Reopen reads public recaps
**ID:** `reopen-reads-public-recaps`
- **WHEN** a live board requests persisted activity for its store
- **THEN** the bridge selects the latest correlated run per card from public run metadata
- **AND** it obtains outcome details from the public recap reader

#### Scenario: Interrupted run remains non-terminal
**ID:** `interrupted-run-remains-non-terminal`
- **WHEN** a persisted run has completed one or more stages but has no terminal workflow outcome
- **THEN** the public terminality reader reports the run as pending or interrupted
- **AND** the bridge does not present the last completed stage as completed delivery

#### Scenario: Storage layout remains opaque
**ID:** `storage-layout-remains-opaque`
- **WHEN** the bridge hydrates or updates card activity
- **THEN** it does not synthesize RPIV state paths or parse internal JSONL rows directly
