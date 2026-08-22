## Draft-PR delivery spike evidence

### Durable linkage

| Requirement set | Native source | Proof boundary |
|---|---|---|
| `agents.specbase-draft-pr-delivery` | `packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts` | Public workflow validation, generated-panel delegation, sole continuation seam, bounded fix routing, final-gate ordering, typed remote/PR/canonical stages, and forbidden post-PR graph operations. |
| `behavior.specbase-kanban` | `packages/rpiv-specbase/workflows/draft-pr-delivery.test.ts` | Disposable Git/fake-GitHub outcomes for green-local capture, dirty/missing preflight, absent/equal/fast-forward/diverged remote heads, exact draft creation/reuse/conflicts, disposition contradictions, local-fix/final gates, footprint restoration, and local child command denial. |
| Canonical Specbase result | `/Users/nlaundry/Projects/openspec-extended-change-stacks/test/commands/work-item-lifecycle.test.ts` | Exact/idempotent/conflicting/malformed draft-result recording and Reviewing/link projection through the supported package API. |

### Native executions

- Named draft workflow, functional, capability, board-link, package-root, and host-policy suite — passed within the focused draft/host suites; the final four-file contract/functional/capability/host subset passed 62 tests; `validateWorkflow()` returned no errors.
- `npm test -- packages/rpiv-workflow packages/rpiv-specbase packages/rpiv-pi/extensions/rpiv-core` — passed 129 files / 2818 tests.
- `npx tsc --noEmit -p tsconfig.base.json` and `npm run check:files -- packages/rpiv-pi/extensions/rpiv-core packages/rpiv-specbase` — passed.
- Companion Specbase: `pnpm run build` and `pnpm exec vitest run test/commands/work-item-lifecycle.test.ts test/commands/view.test.ts test/cli-e2e/store-lifecycle.test.ts` — passed 3 files / 40 tests; strict action-catalog change validation passed.
- Strict `review-and-open-a-draft-pr-from-the-pi-kanban-1fdea1de` validation and full stack validation passed; apply instructions report 10/10 tasks complete.

### Functionality and safety review

Adversarial review found draft run artifacts counted as dirt, the panel stamp could prematurely derive Reviewing, dirty local fixes could not reach commit, child capabilities were unconfined, launches lacked a lease, contradictory panel dispositions were accepted, native checks were mislabeled, local green authority was too weak, and owner UUID was recorded as run identity. Remediation excludes owned audit paths, snapshots/restores the panel-only metadata footprint until canonical PR recording, permits a scoped dirty fix gate followed by commit and clean final gate, applies a draft-specific root-confined child policy that denies remote/push/merge/archive/successor commands, leases the change across launch/resume, validates disposition invariants and owner-scoped artifact paths, records the lifecycle-assigned RPIV run ID, and makes canonical result recording compare-and-set.

### Explicit spike seams

- A real GitHub credential/push/PR creation was not performed. Safe remote behavior is proved with disposable Git state and a fake GitHub adapter; live operator testing intentionally used no remote and stopped during capture.
- Remote fast-forward proceeds only when the remote commit object is already available locally; an unknown ancestry stops rather than fetching or forcing.
- The generated panel remains transcript-backed. The one continued-session materializer is necessary until the panel publishes a typed report artifact.
- Repository-native verification is currently strict Specbase validation plus repository tests. First-class frozen source/build/lint command inventory should be carried from local delivery instead of inferred again.
- Green local-delivery authority uses the latest final artifact whose exact last commit is HEAD. A signed/canonical terminal-result index would be stronger than filesystem artifact discovery.
- Panel-fix commits are model-driven local Git operations under a command allowlist. Push/GitHub remain deterministic script stages, but a dedicated host commit operation would narrow authority further.
