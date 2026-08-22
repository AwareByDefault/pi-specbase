---
id: behavior.specbase-kanban
---

## Purpose
Define the observable fixture-only kanban experience in Pi without claiming live Specbase lifecycle or action authority.

## ADDED Requirements

### Requirement: Explicit demo board
**ID:** `explicit-demo-board`
The Pi user SHALL be able to open a deterministic fixture-backed Specbase kanban by invoking `/spcb:kanban --demo` without a live Specbase store.

#### Scenario: Demo mode opens fixture work
**ID:** `demo-mode-opens-fixtures`
- **WHEN** the user invokes `/spcb:kanban --demo` in an interactive Pi session
- **THEN** the kanban opens with deterministic lifecycle columns and fixture cards
- **AND** no live Specbase store is read

#### Scenario: Demo mode is explicit
**ID:** `demo-mode-is-explicit`
- **WHEN** the user invokes `/spcb:kanban` without a supported source mode
- **THEN** Pi reports how to request demo mode
- **AND** no fixture board is opened implicitly

### Requirement: Keyboard board navigation
**ID:** `keyboard-board-navigation`
The Pi user SHALL be able to move focus among available lifecycle columns, cards, card details, and fixture actions using keyboard controls while the board remains open.

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

### Requirement: Selected fixture action intent
**ID:** `selected-fixture-action-intent`
The fixture-backed board SHALL return the stable card identity and action identity chosen by the user without dispatching the action.

#### Scenario: User confirms a fixture action
**ID:** `user-confirms-fixture-action`
- **WHEN** the user confirms an action for the focused fixture card
- **THEN** the board closes with an intent containing that card identity and action identity
- **AND** no command, skill, workflow, message, or store mutation is dispatched

#### Scenario: User cancels the board
**ID:** `user-cancels-board`
- **WHEN** the user cancels the board
- **THEN** the board closes without an action intent
- **AND** no action is dispatched
