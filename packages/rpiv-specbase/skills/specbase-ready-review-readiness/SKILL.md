---
name: specbase-ready-review-readiness
description: Workflow-only readiness judgment for one frozen Specbase ready-to-review context. Never invoke directly.
argument-hint: "--capture <ready-context.json>"
allowed-tools: Read, Write, Bash(git status *), Bash(git rev-parse *), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture:
        meta:
          artifactKind: specbase-ready-to-review-context
  produces:
    kind: produces
    data:
      type: object
      required: [disposition, reasons, contextOwnerId]
      properties:
        disposition: { enum: [ready, blocked, replan] }
        reasons: { type: array, items: { type: string } }
        contextOwnerId: { type: string }
    meta:
      artifactKind: specbase-ready-to-review-readiness
---

# Specbase ready-to-review readiness

Read the ready context and its referenced frozen delivery context fully. This is read-only preflight.

Return `ready` only when the lease belongs to `ownerId`, authorization is exactly `ready-to-review` / `specbase.ready-to-review`, stack projection and required planning artifacts are valid, every declared evidence unit has a native command, task units are frozen, HEAD equals `startHead`, and frozen unit paths do not overlap baseline dirt. Use `blocked` for recoverable environment or changed-state trouble and `replan` for planning/evidence/scope defects.

Never mutate, widen scope, invoke the panel, publish, archive, or start a successor. Write exactly:

```json
{"disposition":"ready|blocked|replan","reasons":["..."],"contextOwnerId":"..."}
```

to the ready owner directory as `readiness.json`, then end exactly:

`SPECBASE_READY_ARTIFACT: <path-to-readiness.json>`
