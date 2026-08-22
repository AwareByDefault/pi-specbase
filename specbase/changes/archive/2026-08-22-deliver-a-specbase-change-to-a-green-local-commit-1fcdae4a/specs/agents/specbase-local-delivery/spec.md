---
id: agents.specbase-local-delivery
---

## Purpose
Describe the repository-owned workflow and skill contracts that deliver one ready change to verified local commits.

## ADDED Requirements

### Requirement: Local delivery workflow instrument
**ID:** `local-delivery-workflow-instrument`
The repository-owned `specbase-local-delivery` workflow SHALL encode a resumable forward path from validated change intent through readiness, evidence implementation, task implementation, deterministic gates, local review, scoped commits, and terminal local verification.

#### Scenario: Workflow graph validates
**ID:** `workflow-graph-validates`
- **WHEN** the built-in workflow is registered
- **THEN** its declared stages, typed outcomes, reads, routes, loops, and terminal paths pass the public RPIV workflow validator

#### Scenario: Unexpected route data stops
**ID:** `unexpected-route-data-stops`
- **WHEN** a routed stage produces missing or unexpected readiness, gate, or review data
- **THEN** the workflow stops with a recorded reason
- **AND** it does not fall through to mutation or commit

### Requirement: Deterministic serial mutation instrument
**ID:** `deterministic-serial-mutation-instrument`
The local-delivery workflow SHALL derive stable evidence and task units from an immutable run-start delivery context and SHALL execute working-tree mutation units serially.

#### Scenario: Resume reconstructs the same units
**ID:** `resume-reconstructs-the-same-units`
- **WHEN** RPIV resumes a partially completed delivery run
- **THEN** the workflow reconstructs the same stable source and task unit identities from the frozen context
- **AND** completed units replay without duplicate mutation

#### Scenario: Shared tree is not mutated concurrently
**ID:** `shared-tree-is-not-mutated-concurrently`
- **WHEN** multiple evidence or task units remain
- **THEN** at most one local-delivery mutation unit edits the shared working tree at a time

### Requirement: Bounded repair instrument
**ID:** `bounded-repair-instrument`
The local-delivery workflow SHALL route failed gates and local-fix reviews through bounded repair paths that return to the deterministic gate before commit.

#### Scenario: Gate repair is rechecked
**ID:** `gate-repair-is-rechecked`
- **WHEN** a remediation or local refactor fix changes the working tree
- **THEN** the workflow reruns the deterministic local gate before any commit stage

#### Scenario: Repair cannot loop forever
**ID:** `repair-cannot-loop-forever`
- **WHEN** a repair path repeatedly returns to a failing gate or review
- **THEN** the configured run budget stops the workflow with a durable terminal reason

### Requirement: Workflow-only skill contracts
**ID:** `workflow-only-skill-contracts`
The local-delivery workflow's repository-owned skills SHALL declare the input artifacts, output artifacts or side effects, allowed mutation scope, and structured route data their stages rely on.

#### Scenario: Routed skill exposes a schema
**ID:** `routed-skill-exposes-a-schema`
- **WHEN** a readiness, gate, or local-review skill supplies data used by a route
- **THEN** its contract declares and validates every routed field and allowed value

#### Scenario: Mutation skill owns no hidden artifact handoff
**ID:** `mutation-skill-owns-no-hidden-artifact-handoff`
- **WHEN** an evidence, task, remediation, fix, or commit skill completes
- **THEN** downstream stages rely on declared files, typed outcomes, or working-tree state
- **AND** no required handoff exists only in an earlier session's narrative memory

### Requirement: Local-only workflow capability
**ID:** `local-only-workflow-capability`
The local-delivery workflow MUST expose no stage or skill capability that pushes, opens a pull request, merges, archives, invokes the Specbase review panel, or dispatches a successor stack member.

#### Scenario: Workflow preview is locally bounded
**ID:** `workflow-preview-is-locally-bounded`
- **WHEN** the built-in workflow graph and skill roster are inspected
- **THEN** every terminal path ends at stopped recovery or verified local commits
- **AND** no remote, archive, panel, or successor action is reachable
