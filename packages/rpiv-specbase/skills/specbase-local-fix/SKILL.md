---
name: specbase-local-fix
description: Workflow-only bounded implementation fix for findings from local review. Never invoke directly.
argument-hint: "--capture <delivery-context.json> --local-review <review.json>"
allowed-tools: Read, Edit, Write, Bash(*), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
      local-review: {}
  produces:
    kind: side-effect
    meta:
      effect: bounded-local-fix
---

# Apply local review fixes

Require `disposition: local-fix`. Apply one pass over only the listed findings.

- Every edit must remain within frozen `allowedRoots`, avoid baseline-dirty paths, and preserve planning intent.
- Do not add findings, broaden a refactor, edit planning to excuse code, or touch a path absent from the findings unless a directly coupled local edit is unavoidable and still frozen-scope safe.
- Run the smallest directly relevant native command after each fix.
- Record a `local-fix` event with finding IDs, changed paths, and command outcomes through `../_shared/record-delivery-event.mjs` relative to this SKILL.md directory.
- Stop as replan when a finding cannot be fixed honestly within scope.

The deterministic local gate always runs after this stage. Never push, use GitHub, run the review panel, archive, or start a successor.
