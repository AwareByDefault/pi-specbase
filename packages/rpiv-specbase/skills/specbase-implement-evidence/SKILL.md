---
name: specbase-implement-evidence
description: Workflow-only serial mutation unit that implements one frozen enforcement source and runs its native harness. Never invoke directly.
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
      effect: evidence-mutation
---

# Implement one enforcement source

Read `--context` fully and select exactly the evidence unit named by `--unit`. Verify the lease owner first. If `--noop` is present, record `unit-complete` for `no-evidence` and stop without editing.

For one real unit:
1. Refuse an unknown unit, a path outside `allowedRoots`, a baseline-dirty target, a missing native command, or planning mismatch.
2. Record `unit-start` with stable identity `evidence:<unit-id>` using `../_shared/record-delivery-event.mjs` relative to this SKILL.md directory (the helper is not inside this skill folder).
3. Implement only the declared source plus directly necessary production files. Do not edit proposal/design/spec intent, unrelated tasks, another source, or another unit's checkbox.
4. Run every command in the frozen unit exactly by executable/argument array. Do not replace it with a broader or easier check.
5. On failure, record `unit-failed` under `evidence:<unit-id>` with command identity and exit summary through the same `../_shared/record-delivery-event.mjs`, then stop with an error.
6. On success, compute changed paths relative to the run-start baseline, reject scope escape or baseline overlap, and record `unit-complete` under `evidence:<unit-id>` with `changedPaths` and command results.

Never push/fetch/pull, use `gh`, invoke the Specbase review panel, archive, or dispatch a successor. Do not claim semantic proof beyond what the source itself asserts.
