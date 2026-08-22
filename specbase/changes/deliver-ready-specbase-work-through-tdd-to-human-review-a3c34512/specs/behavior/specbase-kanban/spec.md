---
id: behavior.specbase-kanban
---

## Purpose

The board offers one canonical, resumable path from governed Ready work to a pull request that is ready for human review, with explicit test-driven checkpoints and no unsafe remote publication.

## MODIFIED Requirements

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
