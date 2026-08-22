---
name: specbase-pr-feedback-author-red
description: Author only frozen feedback evidence and leave its declared command red.
license: MIT
---

Read the frozen feedback capture and classification scope.

- Edit only `evidencePaths` from the typed classification scope.
- Do not modify production, planning, workflow artifacts, Git metadata, or remote state.
- Run only frozen local verification commands and leave at least one targeted command failing for the reported behavior.
- Do not commit. The host verifies paths and creates the RED checkpoint.
