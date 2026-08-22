---
name: specbase-refactor-decision
description: Decide whether one bounded green-preserving refactor is warranted after the GREEN checkpoint.
disable-model-invocation: true
license: MIT
---

Read the frozen ready context and GREEN checkpoint. Do not edit files. Return `apply` only for a small in-scope cleanup with clear value and no evidence/planning changes; return `skip` when no such cleanup is warranted; return `replan` for scope or design drift.

Write `refactor-decision.json` under the ready owner directory:

```json
{"decision":"skip|apply|replan","reasons":["..."]}
```

End exactly:

`SPECBASE_READY_ARTIFACT: <path-to-refactor-decision.json>`
