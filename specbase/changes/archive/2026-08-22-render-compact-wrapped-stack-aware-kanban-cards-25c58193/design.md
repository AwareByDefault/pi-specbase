## Context

`rpiv-specbase` currently renders every canonical lane plus a separate accepted-specification column. Card bodies take one truncated row, lanes window by card count, and the renderer fills its allocated card area with blank rows. The activity bridge appends the complete RPIV activity string to a card summary. The current live adapter validates the canonical board contract, but the next canonical contract is Kanban v4 and exposes stack context for delivery work.

The overlay must preserve Pi conversation space. Styling can contain ANSI sequences, so layout decisions must use display width rather than string length. The change must consume canonical v4 stack identity, position, and total as supplied; it must not calculate lifecycle or membership locally. Presentation may derive a compact shared label from the stable stack identity and may request richer detail through the canonical stack-context API.

## Goals / Non-Goals

**Goals:**
- Render only active work from validated canonical Kanban v4 snapshots.
- Keep `j`/`k` logical-card navigation predictable while title wrapping changes physical height.
- Use at most two ANSI-safe title lines, compact current activity, and collapse unused overlay rows.
- Show persistent canonical stack rails with position/total and a stable identity label, with canonical context available in detail.

**Non-Goals:**
- Change canonical Specbase lifecycle, stack, action, or accepted-spec semantics.
- Create a new store, renderer source, package, or source-neutral boundary.
- Change action dispatch, workflow execution, or the content of full RPIV recaps.
- Add or modify application code as part of this planning change.

## Decisions

### Validated v4 data remains authoritative

Update the optional-peer adapter and live fixtures to use the canonical Kanban v4 validation contract. Project its actionable work-item lanes in canonical order and do not create an `Accepted specs` board column. Map stack identity, position, and total directly from the validated v4 work item. Use the identity as the shared compact label and resolve richer selected-card detail through the public canonical stack-context API when available. A work item without stack context remains a normal card; the adapter does not synthesize an empty rail or stack data.

This is a presentation adaptation, not an architectural change: the existing source-neutral renderer boundary still accepts a `BoardSnapshot`, and canonical semantics continue to be external.

### Logical cards own focus; rendered rows own the viewport

Represent a rendered card as one logical identity with a measured physical height. Title wrapping uses ANSI-aware visible-width primitives and preserves or resets style boundaries so each produced line is valid styled terminal text. The title may consume one or two lines; truncation marks text that cannot fit within that limit. `j` and `k` continue to update the logical card index exactly once. The lane viewport derives its start and end from cumulative physical card rows, includes the whole focused card, and never splits it across the visible window.

### Content determines overlay height

Keep the existing safe maximum that protects host chrome and conversation. After rendering headers, visible cards, detail/actions, and help, return only populated rows up to that cap. Do not pad a sparse lane to the maximum card budget. This preserves chat space without making the board exceed its safe share.

### Card surface is a summary; detail is disclosure

The card row shows a short RPIV state indicator suitable for scanning; verbose workflow name, stage, unit progress, retries, run identity, and reason remain in the selected-card detail. For stacked cards, the card summary always includes a compact canonical rail with position/total and a stable label derived from stack identity. The detail view can resolve the public canonical stack context without inferring it from manifests. This keeps active lanes dense without discarding diagnosable state.

## Enforcement design

| Source | Assertions / observation | Harness and failure signal | Boundary |
|---|---|---|---|
| `packages/rpiv-specbase/kanban/fixture-board.test.ts` | Styled long titles occupy at most two display-width-safe rows; a physical-row viewport keeps the focused card whole; repeated `j`/`k` moves one card; sparse frames have no filler rows. | Run the focused Vitest file through the workspace test harness. Width, frame contents, focus identity, or row-count mismatch fails an assertion. | Does not prove real terminal aesthetics or canonical v4 projection. |
| `packages/rpiv-specbase/kanban/live-board.test.ts` | A validated v4 fixture projects actionable lanes, excludes accepted-spec cards, and retains canonical stack data for rail and detail presentation. | Run the focused Vitest file through the workspace test harness. Version, lane, identity, or stack-data mismatch fails an assertion. | Does not judge density, visual hierarchy, or color treatment in a live terminal. |
| `design` lens | Review a constrained and a wide rendered frame for chat preservation, scanability, compact activity, and readable persistent rails. | Run the configured Specbase review panel after implementation; a design finding records the concern. | Review is judgment evidence and does not replace deterministic source tests. |

## Risks / Trade-offs

- [ANSI wrapping can leak style state or mismeasure widths] -> Use Pi TUI visible-width and truncation primitives, and add styled-title frame assertions.
- [A row-aware viewport can produce off-by-one omissions] -> Test mixed one- and two-row card sequences at the top, middle, and end of a constrained lane.
- [Compact activity can hide actionable diagnostics] -> Keep the complete activity value in the detail view and test its disclosure.
- [Canonical v4 field drift] -> Validate through the public API before projection and keep v4 fixtures aligned with the upstream contract.
- [Persistent rails reduce horizontal card space] -> Make the rail compact and assess narrow and wide frames through the design lens.

## Migration Plan

1. Update the live adapter and canonical test fixtures together for Kanban v4.
2. Introduce the renderer's ANSI-safe title measurement, logical-card/physical-row window, sparse-height calculation, compact activity, and stack rail/detail projection.
3. Update fixture and live tests before claiming their bindings pass.
4. Run the focused native tests, `specbase validate render-compact-wrapped-stack-aware-kanban-cards-25c58193 --strict`, and the design review panel.

Rollback is a single implementation revert: no store data, canonical data, or workflow state migrates.

## Open Questions

- Confirm the final canonical Kanban v4 field names from the released public API before coding; this change commits to preserving those fields, not to a locally invented shape.
