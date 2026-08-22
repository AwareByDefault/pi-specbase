---
id: agents.specbase-draft-pr-delivery
---

## Purpose

Describe the retained legacy draft-publication instrument without assigning it the composed Ready-to-review workflow's canonical lifecycle authority.

## MODIFIED Requirements

### Requirement: Legacy draft delivery workflow instrument
**ID:** `review-delivery-workflow-instrument`
The repository-owned `specbase-draft-pr-delivery` workflow SHALL encode a resumable legacy path from validated green local commits through generated panel, typed disposition, bounded local fixes, final deterministic gate, safe push, draft pull request, canonical draft observation, and terminal non-Reviewing state.

#### Scenario: Workflow graph validates
**ID:** `review-delivery-graph-validates`
- **WHEN** the built-in workflow is registered
- **THEN** its stages, continued-session seam, typed outcomes, routes, backward bounds, and terminal paths pass the public RPIV workflow validator

#### Scenario: Unknown disposition stops
**ID:** `unknown-disposition-stops`
- **WHEN** the panel materializer produces missing or unknown disposition data
- **THEN** the workflow records a terminal failure instead of routing to fix or remote mutation

### Requirement: Canonical draft-result bridge instrument
**ID:** `canonical-remote-result-bridge-instrument`
The legacy draft-delivery workflow SHALL submit confirmed commit and draft pull-request identities through the canonical Specbase action-result contract and SHALL treat refreshed canonical lifecycle as authority without assigning Reviewing to a draft.

#### Scenario: Pi does not assign Reviewing locally
**ID:** `pi-does-not-assign-reviewing-locally`
- **WHEN** a draft pull request is confirmed
- **THEN** the workflow records the draft descriptor through the canonical result contract
- **AND** the Pi activity overlay does not assign or persist a lifecycle column itself

#### Scenario: Terminal path preserves draft state
**ID:** `terminal-path-requires-canonical-observation`
- **WHEN** the legacy workflow reports successful draft delivery
- **THEN** its terminal report includes the canonical card identity and confirmed draft pull-request URL
- **AND** it does not claim that the card is Reviewing
