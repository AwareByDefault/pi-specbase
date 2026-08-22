---
name: specbase-implement-task
description: Workflow-only serial mutation unit that implements one frozen Specbase task, verifies it, and checks only that task. Never invoke directly.
argument-hint: "--context <delivery-context.json> --unit <id> | --noop"
allowed-tools: Read, Edit, Write, Bash(*), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
  produces:
    kind: side-effect
    meta:
      effect: task-mutation
---

# Implement one frozen task

Read `--context` fully and select exactly the task unit named by `--unit`. Verify the lease owner first. If `--noop` is present, record `unit-complete` for `no-task` and stop without editing.

For one real unit:
1. Refuse unknown identity, changed task text/identity, missing verification, baseline overlap, or work outside `allowedRoots`. Planning drift is a stop, never permission to improvise.
2. Record `unit-start` under stable identity `task:<unit-id>` using `../_shared/record-delivery-event.mjs` relative to this SKILL.md directory (the helper is not inside this skill folder).
3. Implement only this task. Evidence units are already complete; do not rewrite them merely to make the task pass.
4. Execute every frozen verification command. A failing command means the unit is not complete.
5. Only after all commands pass, change this task's checkbox from `[ ]` to `[x]`. Never check a sibling task.
6. Recompute changed paths, reject baseline/scope violations, and record `unit-complete` under `task:<unit-id>` with `changedPaths` and command results. On failure record `unit-failed` under the same identity and stop.

Never push/fetch/pull, use `gh`, invoke the Specbase review panel, archive, or start a successor.
