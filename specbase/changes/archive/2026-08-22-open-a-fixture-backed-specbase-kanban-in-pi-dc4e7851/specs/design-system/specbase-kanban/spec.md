---
id: design-system.specbase-kanban
---

## Purpose
Define how the Specbase kanban remains legible, keyboard-discoverable, and visually native inside Pi.

## ADDED Requirements

### Requirement: Chat-preserving board presentation
**ID:** `chat-preserving-board-presentation`
The Specbase kanban SHALL present as a Pi-native board above the surrounding conversation wherever the terminal can preserve useful board and chat regions.

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

### Requirement: Pi-native visual language
**ID:** `pi-native-visual-language`
The Specbase kanban SHALL use the active Pi theme and concise keyboard cues so it reads as part of the host interface rather than a separate terminal application.

#### Scenario: Theme changes are reflected
**ID:** `theme-changes-are-reflected`
- **WHEN** Pi invalidates the board after an active theme change
- **THEN** the board redraws its text, borders, focus, and status treatment from the current Pi theme

#### Scenario: Keyboard controls are discoverable
**ID:** `keyboard-controls-are-discoverable`
- **WHEN** the board is open
- **THEN** the visible surface identifies the navigation, confirmation, and cancellation controls available in the current context
