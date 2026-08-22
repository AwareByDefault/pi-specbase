---
name: specbase-implement-green
description: Implement frozen production work until declared evidence and repository checks are green without weakening evidence or editing planning truth.
license: MIT
---

Read the frozen delivery context supplied by the workflow.

- Treat every declared evidence source as read-only.
- Edit only production/test-support paths necessary to implement the frozen requirements; never edit Specbase planning artifacts, `.git`, workflow run state, or remote configuration.
- Do not weaken, skip, delete, or rewrite the declared verification.
- Run the declared evidence commands and repository-native checks until they pass.
- Do not commit, push, open or modify a pull request, archive, merge, or launch a successor.
- Return changed paths and check outcomes through the workflow-owned artifact handoff. Task checkbox completion is host-owned after GREEN verification.
