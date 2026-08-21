---
name: specbase-local-remediate
description: Workflow-only bounded repair of implementation defects named by a failed deterministic local gate. Never invoke directly.
argument-hint: "--capture <delivery-context.json> --local-gate <gate.json>"
allowed-tools: Read, Edit, Write, Bash(*), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
      local-gate: {}
  produces:
    kind: side-effect
    meta:
      effect: bounded-remediation
---

# Local remediation

Read the frozen context and latest failed gate. Make one narrow repair pass over the listed failed checks only.

- Refuse a passing/missing verdict, planning mismatch, baseline-dirty path, or path outside `allowedRoots`.
- Fix implementation defects only. Never change proposal/design/spec intent, add a task/source, waive a command, or widen scope.
- Re-run only the directly failed command(s) needed to confirm the repair; the deterministic workflow gate reruns the complete inventory next.
- Record a `remediate` event with changed paths and command results through `../_shared/record-delivery-event.mjs` relative to this SKILL.md directory.
- If the failure cannot be repaired without planning changes, stop explicitly as `replan` rather than editing.

No remote Git/GitHub, review-panel, archive, or successor operation is permitted. The workflow's backward-jump budget, not this skill, controls retries.
