## Why

`agents/review-panel` currently binds its review evidence to `specbase/config.yaml` as though that file were a configured review lens. Coverage consequently reports the pair as broken and leaves both requirements hanging, even though the generated panel is a repository-owned instrument that needs automated conformance evidence.

## What Changes

- Replace the invalid lens binding with one automated `rpiv-specbase` conformance-test binding.
- Preserve the generated review-panel skill and its model-derived configuration/projection as runtime truth; the test derives expectations from that projection rather than duplicating a fixed lens roster.
- Specify test coverage for projected lens membership and installed generated-instrument availability.

## Planes

### Agents truth
- `agents.review-panel`: generated review-panel instrument and its model-derived lens projection (modified existing governed pair)

## Enforcement intent

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `panel-covers-planes`, `panel-reviews-implemented-specs` | `test` | `packages/rpiv-specbase/review-panel-governance.test.ts` | A native Vitest conformance test derives the resolved lens projection, verifies the generated review-panel instrument declares exactly that set, and confirms the generated instrument is available to the Pi integration. |

## Impact

- Affected governance artifacts: `specbase/specs/agents/review-panel/`.
- Planned evidence source: `packages/rpiv-specbase/review-panel-governance.test.ts`.
- No application behavior, API, dependency, generated-skill implementation, or current spec is changed by this planning change.
