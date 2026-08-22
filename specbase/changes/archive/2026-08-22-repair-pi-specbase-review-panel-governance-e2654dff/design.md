## Context

The current `agents/review-panel` pair claims that the generated review-panel skill is the runtime instrument, but its sole `review` binding declares `specbase/config.yaml` as a lens. `specbase coverage --json` reports that binding as an `undefined-lens`, leaves both review-panel requirements and all four scenarios hanging, and marks the pair broken. The configuration file is input to the resolved review model; it is not a review lens or proof that a generated instrument conforms.

The generated review-panel skill and the configuration/projection it consumes remain runtime truth. This change only repairs governance around them: it describes the current contract more precisely and adds an automated package-level conformance test. It does not replace generation, copy a static lens list into `rpiv-specbase`, or change the panel's review policy.

## Goals / Non-Goals

**Goals:**
- Replace the invalid review-lens binding with an honest automated test binding.
- Preserve the existing `agents.review-panel` requirement and scenario identities while restating their complete modified content.
- Define a conformance source that proves model-derived lens projection and generated-instrument availability.
- Record coverage health distinctly from change validation and native-test execution.

**Non-Goals:**
- Changing the generated review-panel skill, panel workflow, configuration schema, review policy, or application code in this change.
- Treating panel findings as deterministic gates.
- Claiming that a projection test validates reviewer judgment quality or an interactive Pi session.

## Decisions

### Keep the generated projection as the single runtime authority

The governed pair describes the generated `specbase-review-panel` instrument and the lens projection produced from the resolved model. `rpiv-specbase` will consume that runtime output through its supported generation/integration seam; it will not maintain an independent array of lenses. This avoids a passing test that merely agrees with a second hard-coded roster while the generated skill has drifted.

### Replace the review binding with one package conformance test

The enforcement delta retires `panel-review` and adds `review-panel-projection-test`, a `test` binding covering both existing requirements. A file-backed test is appropriate because the claims are deterministic: expected lens membership and generated-instrument availability can be observed without subjective review. The binding source is `packages/rpiv-specbase/review-panel-governance.test.ts`.

## Enforcement design

`packages/rpiv-specbase/review-panel-governance.test.ts` reads the resolved runtime model at `specbase/config.yaml` and the generated Pi skill at `.pi/skills/specbase-review-panel/SKILL.md`. It also uses the installed Specbase projection seam with deterministic focused and no-`reviewLens` model fixtures. It:

1. derives the expected current-project lens projection from the resolved model rather than a duplicated literal roster;
2. asserts that the generated review-panel instrument declares exactly the derived lens identifiers, including no `agents` lens for the configured plane without `reviewLens`;
3. asserts the generated instrument is present in Pi's project skill-discovery location with generated-skill frontmatter; and
4. verifies focused and no-plane-lens projections, including the non-empty general spec-conformance reviewer.

Run the source with its native harness:

```text
npm test -- packages/rpiv-specbase/review-panel-governance.test.ts
```

A failed assertion, unavailable instrument, or projection mismatch fails Vitest and therefore fails the evidence source. The test proves deterministic projection and availability only; it does not prove the quality of lens reasoning, an external Pi installation, or that a human accepts a panel report.

## Risks / Trade-offs

- [The test mirrors a fixed roster instead of the model] -> Derive expected lenses from resolved fixtures and exercise a no-`reviewLens` plane.
- [The test confirms generation but not usable installation] -> Assert the generated instrument through the package's actual Pi integration/discovery contract.
- [Global coverage remains unhealthy for unrelated pairs] -> Record the per-pair repair and the full coverage report separately; do not present aggregate health as this change's test result.
- [A future generator API moves] -> Update only the test's supported integration seam, retaining the governed behavior and requirement IDs.

## Migration Plan

1. Add `packages/rpiv-specbase/review-panel-governance.test.ts` using the package's existing Vitest conventions and runtime generated artifacts.
2. Replace the obsolete `panel-review` binding with `review-panel-projection-test` after the source exists.
3. Run the named native test, then `specbase coverage --json`; record the source result and coverage health separately.
4. Run `node ../openspec-extended-change-stacks/bin/specbase.js validate repair-pi-specbase-review-panel-governance-e2654dff --strict` before archive. Roll back by restoring the prior governed pair only if the source cannot be implemented; do not retain a file path as a lens.

## Coverage health evidence

Before implementation, `specbase coverage --json` reports the target `agents/review-panel` pair as `broken`: `0/2` covered requirements and `0/4` covered scenarios, with `panel-review` listed as `undefined-lens` for `specbase/config.yaml`. The same report has unrelated broken pairs (`agents/ste-writing`, `ops/ste`) and one degraded pair (`design-system/specbase-kanban`). After the source is implemented and archived, the intended evidence is that `agents/review-panel` is complete with automated coverage; aggregate store health must still report any unrelated residual failures honestly.
