---
id: architecture.rpiv-specbase
---

## Purpose
Define the ownership boundary of the `rpiv-specbase` Pi extension and its source-neutral presentation seam.

## ADDED Requirements

### Requirement: Pi integration ownership
**ID:** `pi-integration-ownership`
The `rpiv-specbase` package SHALL own Specbase-specific Pi commands, presentation, interaction adaptation, workflows, and workflow-only skills.

#### Scenario: Pi command is provided by rpiv-specbase
**ID:** `pi-command-provided-by-package`
- **WHEN** the package is installed into Pi
- **THEN** its extension provides the Specbase kanban command and presentation surface
- **AND** no general RPIV package is required to own that Specbase-specific surface

### Requirement: Canonical Specbase semantics remain external
**ID:** `canonical-specbase-semantics-remain-external`
The `rpiv-specbase` package MUST consume lifecycle, board, and valid-action semantics from the canonical Specbase contract rather than define an independent production model.

#### Scenario: Fixture source is presentation-only
**ID:** `fixture-source-is-presentation-only`
- **WHEN** the package opens its deterministic demo source
- **THEN** fixture data supplies renderer inputs for demonstration
- **AND** fixture data is not treated as the production lifecycle or action authority

#### Scenario: Live source replaces fixture authority
**ID:** `live-source-replaces-fixture-authority`
- **WHEN** a live Specbase source is introduced
- **THEN** production board and action meaning comes from the canonical Specbase contract
- **AND** the Pi package remains responsible only for adaptation and presentation

### Requirement: Source-neutral renderer boundary
**ID:** `source-neutral-renderer-boundary`
The kanban renderer SHALL accept stable board data through a source-neutral input boundary and return selection intent without reading stores or dispatching actions itself.

#### Scenario: Renderer uses a fixture snapshot
**ID:** `renderer-uses-fixture-snapshot`
- **WHEN** explicit demo mode supplies a fixture snapshot
- **THEN** the renderer presents and navigates that snapshot without knowing its storage source

#### Scenario: Renderer returns a selection
**ID:** `renderer-returns-selection`
- **WHEN** the user confirms a card action
- **THEN** the renderer returns the selected stable identities to its caller
- **AND** action dispatch remains outside the renderer boundary
