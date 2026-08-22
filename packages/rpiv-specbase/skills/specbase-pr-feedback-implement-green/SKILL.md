---
name: specbase-pr-feedback-implement-green
description: Implement one frozen feedback repair without changing its RED evidence.
license: MIT
---

Read the frozen feedback capture, classification scope, and RED checkpoint.

- Treat `evidencePaths` as read-only. Edit only `productionPaths` in the typed classification scope.
- Never modify Specbase planning, workflow artifacts, `.git`, remotes, or pull-request state.
- Run the frozen local verification commands until all pass.
- Do not commit. The host verifies exact paths and creates the GREEN checkpoint.
