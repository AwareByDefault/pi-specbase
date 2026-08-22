---
name: specbase-commit-panel-fix
description: Workflow-only atomic local commit of a green bounded panel fix. Never invoke directly.
argument-hint: "--capture <review-context.json> --fix-gate <gate.json> --panel-disposition <panel.json>"
allowed-tools: Read, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git reset *), Bash(git commit *), Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
      fix-gate: {}
      panel-disposition: {}
  produces:
    kind: side-effect
    meta:
      effect: panel-fix-commit
---

# Commit one verified panel fix

Require a passing fix gate and `local-fix` panel disposition. Derive exact changed implementation paths, exclude planning artifacts and baseline dirt, verify HEAD descends from the frozen start, and stage only explicit paths. Create one coherent local commit. On failure restore the prior index. Never push, force, use GitHub, invoke the panel, archive, merge, delete a branch, or dispatch a successor. The workflow reruns the generated panel after this commit.
