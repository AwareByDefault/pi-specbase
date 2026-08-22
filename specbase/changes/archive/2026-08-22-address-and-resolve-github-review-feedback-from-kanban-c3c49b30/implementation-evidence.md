## Verification record

### Commit checkpoints

- RED: `1a0e0342` — current dispatcher rejected `specbase.pr-feedback` and PR-aware Explore transport.
- GREEN: `f30d5c88` — added the frozen feedback model, host-backed workflow, narrow adapter, capability handler, phase policy, and test sources.
- Review remediation: `10052c76` — fixed combined actionable feedback, fresh canonical revalidation, canonical push target binding, owner/head-bound panel receipts, selected-only replies, immediate resolve re-observation, exact/bounded idempotency lookup, classification scope immutability, and resume lease release.

### Structural linkage

- Reviewing action, Explore, and human Archive → `kanban/pr-feedback-actions.test.ts`.
- Frozen capture, pagination, revision re-observation, reply/idempotency, and conditional resolution → `workflows/pr-feedback-delivery.test.ts`.
- RED/GREEN checkpoints, current-head gate/panel, safe push, resume journal, and host command restrictions → `workflows/pr-feedback-execution.test.ts`.
- Typed bounded workflow and forbidden lifecycle reachability → `workflows/specbase-pr-feedback.test.ts`.
- Child allow/deny boundary → `workflows/pr-feedback-host-policy.test.ts`.

The behavior, agents, and architecture manifests now bind these automated sources directly while retaining review lenses for judgment residue.

### Native-harness execution

- RED focused action test: 2 expected failures, 1 pass.
- Focused final feedback suite: 5 files, 12 tests passed, including changed/deleted/resolved/head-mismatched feedback and general-comment reply-only behavior.
- Full repository before final review remediation: 277 files, 5,135 tests passed; the touched focused suite and TypeScript reran green after remediation.
- `npx tsc --noEmit -p tsconfig.base.json`: passed.
- Biome: passed.
- Package dry-run: passed with 49 production files after the feedback implementation.
- Strict change validation and four-member stack validation passed before final review; rerun is recorded in final validation.

### Semantic correspondence

- The current Reviewing catalog transports exact change/store/ready-PR identity into `specbase.pr-feedback`; Explore receives a shell-safe JSON PR descriptor and Archive remains a separate conversational action.
- Capture confirms local/canonical PR head, exhausts bounded pages, freezes repository/PR/namespace/thread/comment/updatedAt/body digest/head SHA, and marks body text untrusted.
- The classifier must account for every frozen revision. One or several actionable fixes share one explicitly frozen evidence/production/command scope; reconsider stops for contextual Explore, and all-non-actionable input completes without code or remote mutation.
- Classifier commands execute only through a host read/verify allowlist; push/publish/archive/config/output flags are rejected.
- Behavior fixes require evidence-only failing RED, passing GREEN, optional green-preserving refactor, current-head deterministic gate, owner/head/path-bound panel receipt, exact canonical action revalidation, and non-force canonical branch/repository push.
- Post-push re-observation compares unchanged feedback content against the exact published head. Only selected fixes receive idempotent fixing-SHA replies. Review-thread replies use the thread GraphQL mutation; general comments use issue comments and are never resolved.
- A second immediate re-observation occurs before resolution; edited/deleted/already-resolved/head-changed or racing threads return `re-observe` rather than stale resolution.
- Current workflow registration exposes `specbase.pr-feedback`; merge, approval, ready-for-review, Archive, branch deletion, and successor stages are absent.

### Review record

The final blind panel ran behavioral, architectural, agents/workflow, design, and enforcement lenses. API and design lenses were clean. Plugin/workflow and enforcement findings drove the review-remediation commit and enforcement-manifest corrections.

Known review-strength boundaries:
- Comment-aware Explore transports exact ready-PR context; an exact thread/comment is selected conversationally after the Explore skill observes feedback, not by a pre-Explore Kanban picker.
- The generated ready-to-review panel may fan out through Pi subagents whose nested tool configuration is owned by the generated panel/subagent system; mutation children remain host-confined and post-panel restoration plus current-head/clean-tree checks protect repository publication.
- Unexpected script/adapter exceptions are durably captured by RPIV failed recaps; explicit graph stop/re-observe artifacts cover validated route outcomes, but not every thrown provider/runtime exception.

### Fake/live boundary

Fake GitHub and disposable Git prove protocol behavior without claiming live credentials, provider availability, rate-limit behavior, or actual thread permissions.
