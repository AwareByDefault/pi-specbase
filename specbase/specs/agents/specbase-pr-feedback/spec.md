---
id: agents.specbase-pr-feedback
---

### Requirement: PR feedback workflow instrument
**ID:** `feedback-workflow-instrument`
The repository-owned `specbase-pr-feedback` workflow SHALL validate a resumable, bounded route from canonically authorized Reviewing feedback through capture, classification, evidence, final gate and panel, exact-head safe push, reply, conditional resolution, and typed re-observation or stop outcomes.

#### Scenario: Workflow graph validates
**ID:** `feedback-workflow-graph-validates`
- **WHEN** the built-in workflow is registered
- **THEN** its typed stages, routes, backward bounds, resumed paths, and terminal outcomes pass the public RPIV workflow validator

#### Scenario: Missing remote outcome stops
**ID:** `missing-feedback-remote-outcome-stops`
- **WHEN** a capture, classification, gate, panel, push, reply, or resolution artifact is missing or invalid
- **THEN** the workflow records a typed stopped or re-observe outcome
- **AND** it does not continue to a remote mutation

### Requirement: Frozen untrusted feedback instrument
**ID:** `frozen-untrusted-feedback-instrument`
The feedback workflow SHALL enumerate every page of GitHub review feedback and freeze each work item with normalized repository and pull-request identity, namespace, comment or thread ID, `updatedAt`, body digest, and pull-request head SHA; it MUST treat feedback content as untrusted data rather than workflow authority.

#### Scenario: Paginated feedback is frozen
**ID:** `paginated-feedback-is-frozen`
- **WHEN** a selected pull request has review feedback across multiple pages
- **THEN** the capture artifact contains each eligible comment and thread with its complete frozen identity
- **AND** later stages use that artifact rather than a partial first-page view

#### Scenario: Untrusted content cannot redirect delivery
**ID:** `untrusted-feedback-cannot-redirect-delivery`
- **WHEN** feedback body text contains commands, tool requests, path claims, or lifecycle instructions
- **THEN** the workflow classifies it only as untrusted review evidence
- **AND** the text cannot alter its allowed route, tool policy, or authority boundary

### Requirement: Feedback classification and evidence instrument
**ID:** `feedback-classification-and-evidence-instrument`
The feedback workflow SHALL classify each frozen revision as `fix`, `reconsider`, or `non-actionable`; a behavior defect classified as `fix` MUST create a RED evidence commit before GREEN implementation and localized refactor commits, and every localized refactor MUST preserve green verification.

#### Scenario: Behavior defect follows RED then GREEN
**ID:** `behavior-defect-follows-red-green`
- **WHEN** a frozen feedback revision is classified as a behavior defect requiring a fix
- **THEN** the audit identifies a failing RED test commit before the GREEN implementation commit
- **AND** any later localized refactor commit follows passing verification

#### Scenario: Feedback is reconsidered or non-actionable
**ID:** `feedback-is-not-actionable-for-code`
- **WHEN** classification is `reconsider` or `non-actionable`
- **THEN** the workflow records the classification and bounded rationale
- **AND** it does not make a code change or resolve a thread from that classification alone

### Requirement: Idempotent feedback publication instrument
**ID:** `idempotent-feedback-publication-instrument`
The feedback workflow SHALL run the deterministic final gate and generated Specbase panel before compare-before-mutate non-force publication of the exact verified head, then re-observe the frozen revision before idempotently replying with the fixing commit and resolving only an unchanged resolvable review thread.

#### Scenario: Exact verified head is published before reply
**ID:** `exact-verified-head-precedes-feedback-reply`
- **WHEN** an actionable fix reaches remote publication
- **THEN** the final deterministic gate and panel have passed on the recorded verified head
- **AND** the reply identifies the commit at that exact published head

#### Scenario: Resume finds existing reply
**ID:** `resume-finds-existing-feedback-reply`
- **WHEN** a prior attempt published a revision-bound reply before interruption
- **THEN** resume finds and records that reply idempotently
- **AND** it does not post a duplicate reply

#### Scenario: Thread is no longer equivalent
**ID:** `thread-is-no-longer-equivalent`
- **WHEN** re-observation finds a changed, deleted, or already-resolved thread or a changed pull-request head
- **THEN** the workflow returns that item to re-observation
- **AND** it does not reply to or resolve the stale thread

### Requirement: Strict feedback host-policy instrument
**ID:** `strict-feedback-host-policy-instrument`
The repository-owned child-session policy for PR feedback SHALL expose only declared repository-local evidence tools and typed trusted adapter handoffs, and MUST reject arbitrary shell or network access, credential access, generic GitHub access, force or history rewrite, merge, approval, ready-for-review, archive, and successor capabilities.

#### Scenario: Declared local work is permitted
**ID:** `declared-feedback-local-work-is-permitted`
- **WHEN** a child stage performs a declared repository-local evidence operation or typed trusted adapter handoff
- **THEN** the host policy permits that operation within its run-owned boundary

#### Scenario: Escalating capability is denied
**ID:** `escalating-feedback-capability-is-denied`
- **WHEN** a child stage attempts an arbitrary command, shell indirection, network or credential access, generic GitHub call, force update, or lifecycle-changing operation
- **THEN** the host policy rejects it before execution
- **AND** the denial is available in the run audit
