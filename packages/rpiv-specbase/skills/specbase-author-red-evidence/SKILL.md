---
name: specbase-author-red-evidence
description: Author only the frozen executable evidence source for one ready-to-review unit and leave its targeted verification failing for the planned missing behavior.
license: MIT
---

Read the frozen delivery context and selected evidence unit supplied by the workflow.

- Edit only the evidence source paths declared by that unit. Never edit `enforcement.yaml`, proposal/design/tasks, production code, Git metadata, or workflow artifacts.
- Implement evidence that directly exercises the covered requirement.
- Run only the declared native command to confirm it fails for the intended missing behavior; an infrastructure or unrelated failure is not RED.
- Do not make the evidence pass and do not commit.
- Record changed paths and the bounded expected-failure explanation through the workflow-owned artifact handoff.
