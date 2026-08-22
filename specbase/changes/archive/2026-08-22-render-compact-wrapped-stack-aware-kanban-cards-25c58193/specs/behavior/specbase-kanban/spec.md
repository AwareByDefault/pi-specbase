---
id: behavior.specbase-kanban
---

## MODIFIED Requirements

### Requirement: Keyboard board navigation
**ID:** `keyboard-board-navigation`
The Pi user SHALL be able to move focus among available lifecycle columns, logical cards, card details, and fixture actions using keyboard controls while the board remains open, even when cards occupy different numbers of rendered rows.

#### Scenario: Focus moves to an available card
**ID:** `focus-moves-to-available-card`
- **WHEN** the user moves from one lifecycle column to another with cards
- **THEN** the board places focus on a valid card in the destination column
- **AND** the focused card is visibly distinguishable

#### Scenario: Empty column preserves valid focus
**ID:** `empty-column-preserves-valid-focus`
- **WHEN** the user navigates through a lifecycle column with no cards
- **THEN** the board keeps a visible valid focus target
- **AND** further navigation remains available

#### Scenario: Wrapped cards retain logical navigation
**ID:** `wrapped-cards-retain-logical-navigation`
- **WHEN** the focused lane contains titles that render on one or two physical rows
- **THEN** each `j` or `k` navigation action moves focus by exactly one logical card
- **AND** the visible card window adjusts by rendered rows so the full focused card remains visible

### Requirement: Authoritative live board projection
**ID:** `authoritative-live-board-projection`
The live Pi kanban SHALL project validated canonical Kanban v4 actionable work lanes with their stable identities, lifecycle columns, progress, stack context, and diagnostics, and SHALL not render accepted specifications as kanban cards.

#### Scenario: Pi and headless snapshots agree
**ID:** `pi-and-headless-snapshots-agree`
- **WHEN** the Pi board and the canonical headless board read the same store state
- **THEN** equivalent work items have the same stable identities and lifecycle placement
- **AND** their progress, stack context, and diagnostics agree

#### Scenario: Accepted specifications are not work cards
**ID:** `accepted-specifications-are-not-work-cards`
- **WHEN** the selected store contains accepted specifications as well as actionable work
- **THEN** the validated canonical v4 snapshot and Pi board project the actionable work lanes without an accepted-specification card lane
- **AND** the accepted specifications remain available only through their canonical reference surfaces

#### Scenario: Valid empty store is distinct from failure
**ID:** `empty-store-is-distinct-from-failure`
- **WHEN** the canonical snapshot represents a valid store with no work items
- **THEN** the board presents an empty live store state
- **AND** it does not present a load failure or demo fixtures

## ADDED Requirements

### Requirement: Stack context remains available
**ID:** `stack-context-remains-available`
The Pi kanban SHALL retain canonical stack identity, position, and total for every annotated work item, SHALL use that stable identity as the shared stack label, and MAY resolve full detail through the canonical stack-context API without recomputing membership.

#### Scenario: Stack context survives projection
**ID:** `stack-context-survives-projection`
- **WHEN** a canonical Kanban v4 work item supplies stack identity, position, and total
- **THEN** the projected card retains those exact values and presents one shared label for that identity
- **AND** selected-card detail can present canonical stack context without inferring membership from files

#### Scenario: Unstacked work remains usable
**ID:** `unstacked-work-remains-usable`
- **WHEN** a canonical work item supplies no stack context
- **THEN** the board continues to present and navigate that work item
- **AND** it does not invent stack position or shared-label data
