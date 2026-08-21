---
name: specbase-delivery-readiness
description: Workflow-only readiness judgment for one frozen Specbase local-delivery context. Never invoke directly.
argument-hint: "--capture <delivery-context.json>"
allowed-tools: Read, Write, Bash(git status *), Bash(git rev-parse *), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture:
        meta:
          artifactKind: specbase-delivery-context
  produces:
    kind: produces
    data:
      type: object
      required: [disposition, reasons, contextOwnerId]
      properties:
        disposition:
          enum: [ready, blocked, replan]
        reasons:
          type: array
          items: { type: string }
        contextOwnerId: { type: string }
    meta:
      artifactKind: specbase-delivery-readiness
---

# Specbase delivery readiness

Read the `--capture` JSON fully. This is a fresh, workflow-only preflight; do not edit the repository.

The capability host is intentionally narrow: inspect files with Read/Ls, not shell loops or `find`; run only one allowed command per Bash call (`git rev-parse HEAD`, `git status --porcelain`, `npm --version`, `specbase --version`). Write the declared artifact with the Write tool, not redirection.

Return:
- `ready` only when the lease is owned by `ownerId`, authorization is for `specbase.local-delivery`, the stack projection is valid, required artifacts exist, every frozen file-backed evidence unit has a native command, every task has verification, HEAD still equals `startHead`, and no frozen unit path overlaps `baselineDirtyPaths`.
- `blocked` for recoverable environment/state trouble such as a missing executable, moved root, lost lease, or changed HEAD.
- `replan` for missing planning artifacts, missing source/task verification, invalid predecessor projection, or scope that cannot honestly be derived from the frozen plan.

Never widen allowed roots, invent a command, invoke a review panel, archive, or start a successor. Write exactly this JSON to the context's run directory as `readiness.json`:

```json
{"disposition":"ready|blocked|replan","reasons":["..."],"contextOwnerId":"..."}
```

End with exactly:

`SPECBASE_DELIVERY_ARTIFACT: <path-to-readiness.json>`
