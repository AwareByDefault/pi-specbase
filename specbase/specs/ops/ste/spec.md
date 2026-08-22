---
id: ops.ste
---

<!--
  Ops adoption pair, planted opt-in at init. Adopting Simplified Technical
  English (STE) as a project's writing standard is an ops choice: this pair
  declares the standard the repo adopts and the tool it adopts to enforce it.
  It names the linter by its role ("the adopted STE tool") and references the
  command contract by locator (behavior.cli.ste-lint); it does not restate that
  contract. Edit through a change, not init.
-->

## ADDED Requirements

### Requirement: Project prose follows Simplified Technical English
**ID:** ste-is-the-writing-standard
The project SHALL write its user-facing and internal prose — READMEs, skill
docs, and internal docs — in Simplified Technical English: short active
sentences, no marketing adjectives, and no banned complex words. Adopting a
different writing standard is a change to this requirement.

#### Scenario: A governed doc set is written in STE
**ID:** governed-docs-in-ste
- **WHEN** a README, skill doc, or internal doc is authored or revised
- **THEN** it uses short active sentences and avoids marketing adjectives and
  banned complex words

### Requirement: ste-lint is the adopted enforcement tool at a stated threshold
**ID:** ste-lint-is-the-adopted-tool
The adopted STE enforcement tool SHALL be `specbase ste-lint` (whose contract
`behavior.cli.ste-lint` owns), run over a declared documentation glob at a
declared `--max` threshold. The glob and threshold are the current, revisable
truth of what the repo gates today; widening the glob or lowering the threshold
is a change to this requirement. Swapping the tool changes this requirement only,
and no behavior requirement.

#### Scenario: The adopted tool gates the declared doc set
**ID:** adopted-tool-gates-docs
- **WHEN** the STE gate runs over the declared documentation glob
- **THEN** it runs `specbase ste-lint` with the declared `--max` threshold
- **AND** a result above the threshold fails the gate

#### Scenario: The gated scope is scoped, not the whole repo at zero
**ID:** scoped-not-boil-the-ocean
- **WHEN** the declared glob and threshold are read
- **THEN** they name the specific doc set and non-zero threshold the repo gates
  today, not every file at a zero-violation bar