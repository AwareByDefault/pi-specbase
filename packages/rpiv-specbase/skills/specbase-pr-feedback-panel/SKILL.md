---
name: specbase-pr-feedback-panel
description: Review the current-head frozen feedback repair and emit a typed publication receipt.
license: MIT
---

Read the frozen capture, classification scope, and current-head gate receipt.

- Review only the selected repair and its declared scope. Do not edit files, commit, or invoke remote services.
- Write `panel.json` under `.rpiv/artifacts/specbase-pr-feedback/<owner UUID>/` with the exact `ownerId`, current gated `headSha`, `disposition` (`clean`, `advisory`, or `stop`), a report, and findings.
- Use `stop` when the repair is not safe to publish. End with `SPECBASE_PR_FEEDBACK_ARTIFACT: <path>`.
