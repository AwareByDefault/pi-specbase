---
id: behavior.specbase-kanban
---

## Purpose
Extend the kanban with a review-strength, resume-safe route from green local commits to a canonical Reviewing card.

## ADDED Requirements

### Requirement: Authorized review delivery launch
**ID:** `authorized-review-delivery-launch`
The kanban SHALL start review-and-draft-PR delivery only for a selected change whose canonical action remains valid and whose scoped local-delivery commits still pass the deterministic local gate.

#### Scenario: Green local change starts review delivery
**ID:** `green-local-change-starts-review-delivery`
- **WHEN** the user confirms a currently valid review-and-draft-PR action for a green locally committed change
- **THEN** one correlated RPIV run starts with the selected change and commit identities

#### Scenario: Local state is no longer green
**ID:** `local-state-is-no-longer-green`
- **WHEN** fresh preflight cannot confirm the selected commits, clean run-owned delta, or deterministic green gate
- **THEN** the workflow stops before panel or remote mutation
- **AND** the card presents the preflight failure

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

### Requirement: Resume-safe draft pull request
**ID:** `resume-safe-draft-pull-request`
The review-delivery run SHALL create or find exactly one GitHub draft pull request for the verified head and base branches and SHALL reuse that draft on resume.

#### Scenario: Draft PR is created
**ID:** `draft-pr-is-created`
- **WHEN** the verified remote head has no matching open pull request
- **THEN** the workflow creates one draft pull request and records its number, URL, base, and head identities

#### Scenario: Existing draft is reused
**ID:** `existing-draft-is-reused`
- **WHEN** a matching open draft pull request already exists
- **THEN** the workflow returns that draft's canonical descriptor without creating another pull request

#### Scenario: Conflicting PR state stops
**ID:** `conflicting-pr-state-stops`
- **WHEN** matching pull request state is duplicate, non-draft, closed, merged, or otherwise ambiguous
- **THEN** the workflow stops for human resolution without creating a replacement draft

### Requirement: Canonical Reviewing card outcome
**ID:** `canonical-reviewing-card-outcome`
After confirming the draft pull request, the workflow SHALL record the result through the canonical Specbase action contract and SHALL refresh until the card presents canonical Reviewing state with that PR link.

#### Scenario: Draft PR is linked from Reviewing
**ID:** `draft-pr-is-linked-from-reviewing`
- **WHEN** canonical action completion accepts the verified commit and draft PR descriptor
- **THEN** the refreshed card appears in the canonical Reviewing lifecycle state
- **AND** the card links to the confirmed draft pull request

#### Scenario: Recording resumes without duplicate PR
**ID:** `recording-resumes-without-duplicate-pr`
- **WHEN** the draft PR exists but canonical recording or board refresh was interrupted
- **THEN** resume reuses the existing draft and retries recording or refresh
- **AND** no duplicate pull request is created

### Requirement: Human-controlled post-PR boundary
**ID:** `human-controlled-post-pr-boundary`
The review-delivery run MUST NOT automatically mark the pull request ready, approve, merge, archive the change, delete the branch, or launch a successor stack member.

#### Scenario: Workflow stops at Reviewing
**ID:** `workflow-stops-at-reviewing`
- **WHEN** the card shows the linked canonical Reviewing state
- **THEN** the workflow terminates successfully
- **AND** merge, archive, branch deletion, and successor delivery remain separate human-controlled actions
