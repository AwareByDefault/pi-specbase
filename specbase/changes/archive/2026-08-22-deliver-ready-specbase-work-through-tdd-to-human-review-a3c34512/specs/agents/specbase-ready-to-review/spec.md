---
id: agents.specbase-ready-to-review
---

## Purpose

Describe the repository-owned composed workflow and child instruments that turn one freshly authorized Ready change into exact canonical Reviewing state while preserving explicit test-driven commit history and remote safety.

## ADDED Requirements

### Requirement: Ready-to-review workflow instrument
**ID:** `ready-to-review-workflow-instrument`
The repository-owned `specbase-ready-to-review` workflow SHALL validate a bounded resumable route through spec review, RED evidence, GREEN implementation, optional refactor, deterministic gate, generated panel and fixes, fresh authority, safe publication, ready pull request, canonical result recording, and board refresh.

#### Scenario: Workflow graph validates
**ID:** `ready-to-review-graph-validates`
- **WHEN** the built-in workflow is registered
- **THEN** its typed stages, routes, loops, resume paths, and terminal outcomes pass `validateWorkflow()`

#### Scenario: Missing checkpoint data stops
**ID:** `missing-checkpoint-data-stops`
- **WHEN** required intent, commit, verification, gate, panel, remote, or canonical-result data is missing or invalid
- **THEN** the workflow records a typed stopped outcome
- **AND** it does not fall through to a later mutation

### Requirement: Phase-confined child instruments
**ID:** `phase-confined-child-instruments`
The workflow's child sessions SHALL receive host-owned immutable identity and baseline context plus only the tools and paths required by their phase: evidence children MAY author declared evidence sources, implementation children MAY author declared production scope but MUST NOT weaken evidence, and refactor children MAY change only owned implementation paths while preserving exact green checks.

#### Scenario: Evidence child leaves declared scope
**ID:** `evidence-child-scope-rejected`
- **WHEN** an evidence child attempts to edit an undeclared source, production path, planning artifact, Git metadata, or helper outside its contract
- **THEN** the host rejects the operation before mutation
- **AND** records the denied capability in the audit

#### Scenario: Implementation weakens evidence
**ID:** `implementation-cannot-weaken-evidence`
- **WHEN** an implementation or refactor child attempts to alter a declared evidence source or its required verification
- **THEN** the host rejects the operation before mutation

### Requirement: TDD checkpoint journal instrument
**ID:** `tdd-checkpoint-journal-instrument`
The workflow SHALL durably record exact RED, GREEN, and optional refactor commit SHAs, owned paths, verification commands and results, parent relationships, and current-head attestations, and SHALL verify that ordering and content again on resume.

#### Scenario: Expected RED is committed
**ID:** `expected-red-is-committed`
- **WHEN** declared evidence fails for the planned missing behavior and no unrelated gate failure is present
- **THEN** the workflow records and creates one evidence-only RED commit
- **AND** remote publication remains unreachable

#### Scenario: GREEN follows RED
**ID:** `green-follows-red`
- **WHEN** implementation makes the declared evidence and required local gate pass
- **THEN** one GREEN commit descends from the recorded RED commit
- **AND** a refactor commit, if present, descends from GREEN after the exact checks pass again

#### Scenario: Resume observes drift
**ID:** `checkpoint-drift-stops-resume`
- **WHEN** resumed HEAD, parents, paths, tree state, or verification fingerprints disagree with the journal
- **THEN** the workflow stops before further mutation or publication

### Requirement: Generated panel and bounded fix instrument
**ID:** `ready-review-panel-instrument`
After current HEAD passes the deterministic gate, the workflow SHALL invoke the installed generated Specbase panel, preserve typed dispositions, apply only bounded in-scope fixes in separate commits, and rerun the exact gate and panel on every changed head before publication.

#### Scenario: Panel requests replan
**ID:** `panel-replan-stops-publication`
- **WHEN** a verified finding requires proposal, spec, enforcement intent, tasks, or delivery scope to change
- **THEN** the workflow stops before push with a replan outcome

#### Scenario: Bounded fix changes head
**ID:** `panel-fix-rechecks-head`
- **WHEN** an allowed panel fix creates a new commit
- **THEN** deterministic checks and the generated panel run again on that exact commit before remote preflight

### Requirement: Green-only remote and canonical bridge instrument
**ID:** `green-only-remote-bridge-instrument`
The workflow SHALL freshly revalidate canonical authority, compare current local and remote state, publish only the exact verified green head by non-force update, create or reuse one pull request, mark it ready for human review, record the exact canonical result, and trust refreshed Specbase lifecycle as the only Reviewing authority.

#### Scenario: Current head is red or unattested
**ID:** `red-head-cannot-publish`
- **WHEN** current HEAD is RED or lacks current gate and panel attestations
- **THEN** push and every pull-request mutation are unreachable

#### Scenario: Ready result is recorded
**ID:** `ready-result-is-recorded`
- **WHEN** the exact verified remote head has one open pull request confirmed ready for human review
- **THEN** the workflow submits that descriptor through the canonical action-result contract
- **AND** succeeds only after refreshed board state reports Reviewing

#### Scenario: Remote state diverges
**ID:** `remote-divergence-stops`
- **WHEN** remote head or matching pull-request identity changes between observation and mutation
- **THEN** the workflow stops or re-observes without force, duplicate PR, merge, archive, branch deletion, or successor launch
