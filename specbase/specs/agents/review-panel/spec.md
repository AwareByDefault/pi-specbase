---
id: agents.review-panel
---

<!--
  Planted by `specbase init` (any project, flat or governed) when the user opts
  into agentic review, as bootstrap scaffolding rather than through the change
  flow. It gives the review panel - the projected lens set that judges the
  resolved review model - a governing spec. The operational artifact is the
  GENERATED review-panel skill (projected from the resolved model); this spec
  describes it and its enforcement binds a conformance/review check against it.
  Edit through a change, not init.
-->

## ADDED Requirements

### Requirement: The review panel judges every reviewed plane through a projected lens set
**ID:** panel-covers-planes
The review panel's lens set SHALL be a projection of the resolved review model:
one non-cross-cutting lens for each resolved plane that declares a `reviewLens`,
plus the cross-cutting `enforcement` lens, plus any lenses the project declares
as augmentation (scoped sub-lenses or additional cross-cutting lenses). A plane
that declares no `reviewLens` SHALL contribute no lens. The generated review-panel
skill is the operational artifact this spec describes; its lens set MUST equal
this projection and holds no lens the projection does not name.

#### Scenario: A lens exists for each reviewed plane
**ID:** lens-per-plane
- **WHEN** the projected lens set is compared to the resolved plane roster
- **THEN** every plane that declares a `reviewLens` has exactly one lens carrying
  that `reviewLens` id, and every plane without a `reviewLens` has none

#### Scenario: The generated skill conforms to the projection
**ID:** lenses-conform
- **WHEN** the generated skill's declared lens set is compared to the projection
  of the resolved review model
- **THEN** enforcement reports any lens present in one and absent in the other

### Requirement: The panel's job is spec-conformance review, refined per plane
**ID:** panel-reviews-implemented-specs
The review panel SHALL judge whether the implementation produces the specs that
were implemented, and this claim SHALL hold whatever the resolved review model
is. Each reviewed plane's lens SHALL be a blind, focused refinement of that one
job over the specs its scope covers; the panel SHALL NOT depend on a fixed lens
count and SHALL remain non-empty for any project that has specs to review.

#### Scenario: A minimal project still reviews its implemented specs
**ID:** minimal-model-still-reviews
- **WHEN** the review panel runs in a project whose resolved model yields only
  the general spec-conformance reviewer (no plane declares a `reviewLens`)
- **THEN** the panel reviews the implementation against the specs that exist and
  reports findings, rather than producing no lens

#### Scenario: An added plane refines the same job
**ID:** added-plane-refines
- **WHEN** a project adds a plane that declares a `reviewLens`
- **THEN** the projected lens set gains exactly that plane's blind lens over its
  scope, and the panel's overall job statement is unchanged