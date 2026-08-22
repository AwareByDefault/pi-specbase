---
id: agents.specbase-draft-pr-delivery
---

## Purpose
Describe the repository-owned workflow and skills that safely review, push, and record one draft pull request.

## ADDED Requirements

### Requirement: Review delivery workflow instrument
**ID:** `review-delivery-workflow-instrument`
The repository-owned `specbase-draft-pr-delivery` workflow SHALL encode a resumable path from validated green local commits through the generated Specbase panel, typed disposition, bounded local fixes, final deterministic gate, safe push, draft pull request, canonical recording, and terminal Reviewing observation.

#### Scenario: Workflow graph validates
**ID:** `review-delivery-graph-validates`
- **WHEN** the built-in workflow is registered
- **THEN** its stages, continued-session seam, typed outcomes, routes, backward bounds, and terminal paths pass the public RPIV workflow validator

#### Scenario: Unknown disposition stops
**ID:** `unknown-disposition-stops`
- **WHEN** the panel materializer produces missing or unknown disposition data
- **THEN** the workflow records a terminal failure instead of routing to fix or remote mutation

### Requirement: Generated panel invocation instrument
**ID:** `generated-panel-invocation-instrument`
The review-delivery workflow SHALL invoke the installed generated Specbase review-panel skill and MUST NOT embed a second lens roster, gate procedure, or panel policy in the workflow or its helper skills.

#### Scenario: Resolved model selects lenses
**ID:** `resolved-model-selects-lenses`
- **WHEN** the review-delivery workflow runs the panel for a change
- **THEN** the generated panel instrument resolves its lenses and deterministic residue from the current Specbase model
- **AND** the delivery workflow receives the resulting report without redefining those choices

#### Scenario: Panel remains read-only
**ID:** `panel-remains-read-only`
- **WHEN** the generated panel runs inside review delivery
- **THEN** the panel stage itself changes no code and changes no Specbase gate

### Requirement: Typed panel materialization instrument
**ID:** `typed-panel-materialization-instrument`
The review-delivery workflow SHALL materialize the panel report into schema-validated `clean`, `advisory`, `local-fix`, or `replan` routing data while retaining each finding's lens, severity, verification note, and review strength.

#### Scenario: Transcript handoff is explicit
**ID:** `transcript-handoff-is-explicit`
- **WHEN** the installed panel publishes its report only in session output
- **THEN** one continued-session materializer writes the typed report artifact
- **AND** no later stage depends on unmaterialized panel narrative

#### Scenario: Finding strength is retained
**ID:** `finding-strength-is-retained`
- **WHEN** findings are classified for workflow routing
- **THEN** the artifact still identifies them as review-strength
- **AND** no classification writes them into deterministic enforcement or archive status

### Requirement: Idempotent remote instrument
**ID:** `idempotent-remote-instrument`
The review-delivery workflow's remote skills SHALL compare current Git and GitHub state before mutation, use exact repository/base/head identities, prohibit force updates, and publish typed remote-head and draft-PR descriptors.

#### Scenario: Resume observes before creating
**ID:** `resume-observes-before-creating`
- **WHEN** RPIV resumes at push or pull-request stages
- **THEN** the remote skills query the current remote head and matching pull request before attempting mutation

#### Scenario: Force capability is absent
**ID:** `force-capability-is-absent`
- **WHEN** the remote skill command surface and workflow graph are inspected
- **THEN** no force push, history rewrite, branch deletion, merge, or ready-for-review operation is reachable

### Requirement: Canonical remote-result bridge instrument
**ID:** `canonical-remote-result-bridge-instrument`
The review-delivery workflow SHALL submit confirmed commit and draft-PR identities through the canonical Specbase action-result contract and SHALL treat the refreshed canonical board as the authority for Reviewing state.

#### Scenario: Pi does not assign Reviewing locally
**ID:** `pi-does-not-assign-reviewing-locally`
- **WHEN** a draft PR is confirmed
- **THEN** the workflow records the descriptor through the canonical result contract
- **AND** the Pi activity overlay does not assign or persist a lifecycle column itself

#### Scenario: Terminal path requires canonical observation
**ID:** `terminal-path-requires-canonical-observation`
- **WHEN** the workflow reports successful review delivery
- **THEN** its terminal report includes the canonical Reviewing card identity and confirmed draft PR URL
