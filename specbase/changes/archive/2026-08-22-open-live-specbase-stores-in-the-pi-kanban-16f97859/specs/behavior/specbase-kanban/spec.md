---
id: behavior.specbase-kanban
---

## Purpose
Extend the kanban with truthful live-store selection, canonical snapshot presentation, and refresh behavior.

## MODIFIED Requirements

### Requirement: Explicit demo board
**ID:** `explicit-demo-board`
The Pi user SHALL be able to explicitly open a deterministic fixture-backed Specbase kanban with `/spcb:kanban --demo`, and Pi SHALL never substitute fixture data for a live or invalid source request.

#### Scenario: Demo mode opens fixture work
**ID:** `demo-mode-opens-fixtures`
- **WHEN** the user invokes `/spcb:kanban --demo` in an interactive Pi session
- **THEN** the kanban opens with deterministic lifecycle columns and fixture cards
- **AND** no live Specbase store is read

#### Scenario: Demo mode is explicit
**ID:** `demo-mode-is-explicit`
- **WHEN** the user invokes a live or unsupported source request instead of `/spcb:kanban --demo`
- **THEN** Pi reports the canonical resolution failure or actionable usage
- **AND** no fixture board is opened implicitly

## ADDED Requirements

### Requirement: Live store selection
**ID:** `live-store-selection`
The Pi user SHALL be able to open the nearest Specbase store from the current working directory or explicitly select a registered store by its stable store identity.

#### Scenario: Nearest store opens
**ID:** `nearest-store-opens`
- **WHEN** the user invokes `/spcb:kanban` from within a resolvable Specbase store
- **THEN** the board opens that nearest store
- **AND** the board identifies which store is being shown

#### Scenario: Registered store opens
**ID:** `registered-store-opens`
- **WHEN** the user invokes `/spcb:kanban --store <store-id>` with a registered stable store identity
- **THEN** the board opens that registered store regardless of the current directory

#### Scenario: Store cannot be resolved
**ID:** `store-cannot-be-resolved`
- **WHEN** neither the nearest nor requested store can be resolved
- **THEN** Pi reports the canonical resolution failure and a concrete next step
- **AND** no fixture data is substituted

### Requirement: Authoritative live board projection
**ID:** `authoritative-live-board-projection`
The live Pi kanban SHALL preserve the stable identities, lifecycle columns, progress, stack context, and diagnostics supplied by the canonical Specbase board snapshot.

#### Scenario: Pi and headless snapshots agree
**ID:** `pi-and-headless-snapshots-agree`
- **WHEN** the Pi board and the canonical headless board read the same store state
- **THEN** equivalent work items have the same stable identities and lifecycle placement
- **AND** their progress, stack context, and diagnostics agree

#### Scenario: Valid empty store is distinct from failure
**ID:** `empty-store-is-distinct-from-failure`
- **WHEN** the canonical snapshot represents a valid store with no work items
- **THEN** the board presents an empty live store state
- **AND** it does not present a load failure or demo fixtures

### Requirement: Identity-preserving refresh
**ID:** `identity-preserving-refresh`
The Pi user SHALL be able to refresh an open live board to the latest canonical snapshot while retaining the selected card when its stable identity remains present.

#### Scenario: Selected card survives refresh
**ID:** `selected-card-survives-refresh`
- **WHEN** a refresh returns a changed snapshot that still contains the selected card identity
- **THEN** the board replaces its displayed state with the refreshed snapshot
- **AND** that card remains selected in its canonical lifecycle location

#### Scenario: Selected card disappears
**ID:** `selected-card-disappears`
- **WHEN** a refresh returns a snapshot without the selected card identity
- **THEN** the board moves focus to a deterministic valid fallback
- **AND** navigation remains available

#### Scenario: Refresh fails
**ID:** `refresh-fails`
- **WHEN** a live refresh fails after a successful snapshot was displayed
- **THEN** the board retains the last successful snapshot and marks it stale
- **AND** the user sees the failure and can retry
