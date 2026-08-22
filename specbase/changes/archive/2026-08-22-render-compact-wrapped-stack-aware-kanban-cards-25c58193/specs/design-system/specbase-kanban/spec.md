---
id: design-system.specbase-kanban
---

## MODIFIED Requirements

### Requirement: Chat-preserving board presentation
**ID:** `chat-preserving-board-presentation`
The Specbase kanban SHALL present as a Pi-native board above the surrounding conversation wherever the terminal can preserve useful board and chat regions, and SHALL use no blank card rows when its populated content needs fewer rows than its safe allocation.

#### Scenario: Wide terminal preserves chat beneath the board
**ID:** `wide-terminal-shows-board-beside-chat`
- **WHEN** the available terminal dimensions support both useful regions
- **THEN** lifecycle columns appear side by side above the visible Pi conversation
- **AND** opening or closing the board does not replace the conversation transcript

#### Scenario: Narrow terminal remains usable
**ID:** `narrow-terminal-remains-usable`
- **WHEN** the terminal is too narrow for the wide board arrangement
- **THEN** the board presents a compact arrangement with the same focused content and controls
- **AND** no rendered line exceeds the width Pi provides

#### Scenario: Sparse content shrinks the overlay
**ID:** `sparse-content-shrinks-overlay`
- **WHEN** the visible lanes and controls require fewer rows than the safe board allocation
- **THEN** the board uses only the rows required by its populated content
- **AND** the remaining safe terminal space stays available to the surrounding conversation

## ADDED Requirements

### Requirement: Compact card presentation
**ID:** `compact-card-presentation`
The Specbase kanban SHALL keep each card scannable by wrapping its ANSI-styled title to no more than two display lines, using a concise RPIV activity summary on the card, and reserving full activity detail for the selected-card view.

#### Scenario: Styled long title is bounded
**ID:** `styled-long-title-is-bounded`
- **WHEN** a card title contains styled text and exceeds the available card width
- **THEN** the card renders an ANSI-safe title on at most two display lines
- **AND** styling does not corrupt visible-width alignment or neighboring columns

#### Scenario: Verbose activity remains inspectable
**ID:** `verbose-activity-remains-inspectable`
- **WHEN** a card has detailed RPIV activity such as workflow, stage, unit, retry, run, or reason data
- **THEN** the card surface shows a concise current-state summary
- **AND** the selected-card view retains the complete available activity detail

### Requirement: Stack-rail context presentation
**ID:** `stack-rail-context-presentation`
The Specbase kanban SHALL show a persistent, compact stack rail for every visible card with canonical stack context, including its canonical position/total and shared label, while keeping full stack detail in the selected-card view.

#### Scenario: Stacked card carries a rail
**ID:** `stacked-card-carries-rail`
- **WHEN** a visible card has canonical stack context
- **THEN** its card surface shows the canonical stack rail, position/total, and shared label
- **AND** the rail remains visible while the user moves focus within the lane

#### Scenario: Detail preserves density
**ID:** `stack-detail-preserves-density`
- **WHEN** the user opens a stacked card's detail
- **THEN** the detail presents the full available stack context
- **AND** the card surface remains a compact scan-oriented summary
