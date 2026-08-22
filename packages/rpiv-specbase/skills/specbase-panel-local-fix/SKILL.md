---
name: specbase-panel-local-fix
description: Workflow-only bounded implementation fix for typed Specbase panel findings. Never invoke directly.
argument-hint: "--capture <review-context.json> --panel-disposition <panel-disposition.json>"
allowed-tools: Read, Edit, Write, Bash(git status *), Bash(git diff *), Bash(npm test *), Glob, Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
      panel-disposition: {}
  produces:
    kind: side-effect
    meta:
      effect: panel-local-fix
---

# Apply bounded panel findings

Require `disposition: local-fix`. Preserve every finding's review strength. Edit only implementation/test/docs paths named by the findings and already inside the frozen local-delivery scope. Never edit proposal, spec, design, enforcement intent, or tasks to make a finding disappear. Never push, use GitHub, invoke another panel, archive, merge, delete a branch, or start a successor. Run the smallest relevant native check; the workflow reruns the complete deterministic gate next. Stop as replan when a finding cannot be fixed within scope.
