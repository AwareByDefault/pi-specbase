---
id: agents.ste-writing
---

<!--
  Agents-plane instrument, planted opt-in at init. Adopting Simplified Technical
  English (STE) adds a writing SKILL.md that instructs agents to produce
  STE-compliant prose. This spec DESCRIBES that instrument; its enforcement
  binds a conformance check of the skill to what the spec declares. The skill
  helps satisfy ops.ste but is NOT ops.ste's enforcement. Edit through a change,
  not init.
-->

## ADDED Requirements

### Requirement: A registered STE writing skill instructs agents to produce STE prose
**ID:** ste-writing-skill-exists
A project that adopts STE SHALL provide an STE writing SKILL.md instrument that
instructs an agent to produce Simplified Technical English prose. The skill SHALL
be registered so an agent can invoke it, and its frontmatter SHALL declare the
STE writing mandate and a trigger describing when to apply it.

#### Scenario: The skill is present and registered
**ID:** skill-present-and-registered
- **WHEN** the installed skill set is inspected
- **THEN** the STE writing skill is present and registered as invocable

#### Scenario: The skill frontmatter declares the STE mandate
**ID:** frontmatter-declares-mandate
- **WHEN** the STE writing skill's frontmatter is read
- **THEN** it names the STE writing mandate and the trigger for applying it

#### Scenario: The skill body directs agents to STE prose
**ID:** body-directs-ste
- **WHEN** an agent invokes the STE writing skill
- **THEN** the skill instructs it to write short active sentences and to avoid
  marketing adjectives and banned complex words