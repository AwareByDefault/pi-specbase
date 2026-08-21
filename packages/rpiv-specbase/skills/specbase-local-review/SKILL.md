---
name: specbase-local-review
description: Workflow-only local review of the green run-owned delta, excluding baseline dirt and the Specbase review panel. Never invoke directly.
argument-hint: "--capture <delivery-context.json> --local-gate <gate.json>"
allowed-tools: Read, Bash(git diff *), Bash(git status *), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
      local-gate: {}
  produces:
    kind: produces
    data:
      type: object
      required: [disposition, findings]
      properties:
        disposition:
          enum: [clean, local-fix, replan]
        findings:
          type: array
          items:
            type: object
            required: [id, path, summary]
            properties:
              id: { type: string }
              path: { type: string }
              summary: { type: string }
    meta:
      artifactKind: specbase-local-review
---

# Review the local delivery delta

Read the context and require a passing latest gate. Review only current changes not listed in `baselineDirtyPaths`.

Choose:
- `clean`: no actionable local defect remains.
- `local-fix`: one or more bounded, plan-conformant regression/refactor/convention fixes are needed.
- `replan`: a scope escape or planning contradiction cannot be fixed locally without changing intent.

This is not `/spcb:review-panel`: do not invoke it, assign panel severity, or make archive judgments. Do not edit files. Write `local-review.json` in the context run directory with exactly `disposition` and `findings` (`id`, project-relative `path`, `summary`). Record a `review` event through `../_shared/record-delivery-event.mjs` relative to this SKILL.md directory, then end with:

`SPECBASE_DELIVERY_ARTIFACT: <path-to-local-review.json>`
