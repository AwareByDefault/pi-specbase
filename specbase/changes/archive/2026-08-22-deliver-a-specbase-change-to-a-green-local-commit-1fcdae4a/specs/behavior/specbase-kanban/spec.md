---
id: behavior.specbase-kanban
---

## Purpose
Extend the kanban with a bounded, recoverable local-delivery outcome for a canonically ready change.

## ADDED Requirements

### Requirement: Authorized local delivery launch
**ID:** `authorized-local-delivery-launch`
The kanban SHALL start local delivery only from a fresh canonical action authorization for the selected ready change and SHALL identify the repository, store, change, stack position, and pre-existing working-tree baseline before mutation.

#### Scenario: Ready change starts delivery
**ID:** `ready-change-starts-delivery`
- **WHEN** the user confirms a currently valid local-delivery action for a ready change
- **THEN** one correlated RPIV run starts for that change
- **AND** its audit state identifies the selected change and run-start baseline

#### Scenario: Authorization becomes stale
**ID:** `delivery-authorization-becomes-stale`
- **WHEN** fresh validation no longer authorizes local delivery for the selected change
- **THEN** no delivery run mutates the repository
- **AND** the board reports the canonical rejection

### Requirement: Evidence-first serial implementation
**ID:** `evidence-first-serial-implementation`
The local-delivery run SHALL implement the selected change's declared enforcement sources before its ordered task units and SHALL execute each completed unit's declared native verification before advancing.

#### Scenario: Declared source precedes tasks
**ID:** `declared-source-precedes-tasks`
- **WHEN** a ready change declares enforcement sources and implementation tasks
- **THEN** the run completes the frozen source units before starting the frozen task units
- **AND** the audit trail preserves each stable source and task identity in execution order

#### Scenario: Unit verification fails
**ID:** `unit-verification-fails`
- **WHEN** an evidence or task unit cannot pass its declared native verification
- **THEN** the run does not advance beyond that unit as though it succeeded
- **AND** the failure is recorded with its stable unit identity and recovery reason

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

### Requirement: Reviewed atomic local commits
**ID:** `reviewed-atomic-local-commits`
The local-delivery run SHALL review the run-owned green delta for local refactor opportunities, revalidate any applied local fix, and commit only scoped run-owned changes in coherent atomic commits.

#### Scenario: Local fix remains green
**ID:** `local-fix-remains-green`
- **WHEN** local review identifies a bounded plan-conformant fix
- **THEN** the run applies the fix and reruns the local gate before commit

#### Scenario: Commits exclude baseline dirt
**ID:** `commits-exclude-baseline-dirt`
- **WHEN** the run creates local commits
- **THEN** the commits contain only run-owned paths that passed the final gate
- **AND** paths dirty before the run remain uncommitted

#### Scenario: Final local state is green
**ID:** `final-local-state-is-green`
- **WHEN** local delivery completes
- **THEN** the card recap identifies the created local commits and a passing final gate
- **AND** the run-owned working-tree delta is clean

### Requirement: Local-only recoverable boundary
**ID:** `local-only-recoverable-boundary`
The local-delivery run SHALL preserve resumable failure state and MUST NOT push, open a pull request, merge, archive, invoke the Specbase review panel, or start a successor stack member.

#### Scenario: Run stops recoverably
**ID:** `run-stops-recoverably`
- **WHEN** readiness, implementation, validation, review, or commit cannot continue safely
- **THEN** the card presents the stable run identity, stopped stage, and recovery reason
- **AND** completed audit units remain available to resume

#### Scenario: Local completion stops before remote work
**ID:** `local-completion-stops-before-remote-work`
- **WHEN** the run reaches green local commits
- **THEN** it terminates without a push, pull request, merge, archive, review-panel run, or successor launch
