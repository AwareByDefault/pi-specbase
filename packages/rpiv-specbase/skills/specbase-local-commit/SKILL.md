---
name: specbase-local-commit
description: Workflow-only explicit-path local commit of a green reviewed run-owned delta while preserving baseline dirt. Never invoke directly.
argument-hint: "--capture <delivery-context.json> --local-gate <gate.json> --local-review <review.json>"
allowed-tools: Read, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(node *), Grep
disable-model-invocation: true
contract:
  consumes:
    reads:
      capture: {}
      local-gate: {}
      local-review: {}
    meta:
      world: green-run-owned-tree
  produces:
    kind: side-effect
    meta:
      effect: git-commit
---

# Commit the verified local delta

Require the latest gate to pass and local review to be clean. Read the implementation record and derive the union of `changedPaths` from completed evidence/task/remediation/fix events.

1. Recompute status. Subtract every `baselineDirtyPaths` entry. Refuse unrecorded dirt, baseline overlap, scope escape, a moved/non-descendant HEAD, or an empty path set.
2. Inspect only the run-owned diff and choose one or more coherent atomic commit groups. Match recent local subject style. Do not ask for confirmation: the canonical board action already authorized local commits.
3. For each group invoke `../_shared/commit-local-delivery.mjs` relative to this SKILL.md directory (the helper is not inside this skill folder), with `--context`, one quoted `--message`, and explicit `--paths`. Never use `git add .`, `-A`, a directory wildcard, or a broad pathspec.
4. Record a `commit` event with commit IDs and exact paths.

Stop after local commits. Never push/fetch/pull, open a PR, merge, archive, invoke the Specbase review panel, or start a successor.
