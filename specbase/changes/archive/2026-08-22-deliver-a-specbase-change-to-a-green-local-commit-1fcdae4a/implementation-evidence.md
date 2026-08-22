## Local-delivery spike evidence

### Durable linkage

| Requirement set | Native source | Proof boundary |
|---|---|---|
| `agents.specbase-local-delivery` | `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts` | Workflow validation, typed routes, serial fan-outs, bounded back edges, declared contracts, and unreachable graph paths. |
| `behavior.specbase-kanban` | `packages/rpiv-specbase/workflows/local-delivery.test.ts` | Disposable-repository outcomes for authorization capture, lease race/recovery/release, evidence-before-task order, native failure, bounded repair, baseline dirt, explicit commits, resume audit, stack blocking, and command denial. |

Execution results are recorded below separately from this linkage.

### Native executions

| Command | Result | What it establishes |
|---|---|---|
| `npm test -- packages/rpiv-specbase/workflows/local-delivery.test.ts` | PASS — 1 file, 14 tests | Disposable-repository outcome proof, including exact final attestation, baseline fingerprints, collision-resistant/symlink-safe leases, and command denial. |
| `npm test -- packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts` | PASS — 1 file, 5 tests | Graph/contract-shape proof; `validateWorkflow()` returned no errors before export/registration. |
| `npx tsc --noEmit -p tsconfig.base.json` | PASS | Monorepo type compatibility after the implementation and test additions. |
| `specbase validate deliver-a-specbase-change-to-a-green-local-commit-1fcdae4a --type change --strict --no-interactive` | PASS | Strict validity of this change and its governed pairs. |
| `specbase stack validate deliver-specbase-work-from-an-interactive-pi-kanban-df587c88` | PASS | Stack graph/projection validity. |
| `npm run check:files -- packages/rpiv-specbase` | PASS | Biome formatting/lint for the affected package. |
| `npm run check:files -- <four affected rpiv-core files>` | PASS | Biome formatting/lint for the execution-host policy integration. |
| `npm test -- packages/rpiv-specbase` | PASS — 10 files, 88 tests | Affected-package regression suite, including package-root exports, exact card/descriptor identity, capability launch, and both enforcement sources. |
| `npm test -- packages/rpiv-pi/extensions/rpiv-core/sdk-workflow-host.test.ts packages/rpiv-pi/extensions/rpiv-core/workflow-execution-host.test.ts packages/rpiv-pi/extensions/rpiv-core/built-in-workflows.test.ts packages/rpiv-workflow/runner/resume.test.ts` | PASS — 4 files, 424 tests | Existing-workflow preservation, SDK custom-tool filtering, package skill injection, generic terminal sidecar compatibility, and resume ownership hooks. |
| `specbase coverage --json` | Aggregate store remains `valid: false` | Existing accepted-store targets are broken/hanging (`agents/review-panel`, `agents/ste-writing`, `ops/ste`). No stale binding, enforcement-only pair, or unbound-evidence orphan was reported. This is project baseline health, not proof failure for the strict-valid change above. |

These are execution results, not merely resolvable links. The two named enforcement files distinguish disposable-repository outcomes from graph/contract shape.

### Adversarial review remediation

The working-tree review at `.rpiv/artifacts/reviews/2026-08-21_15-51-29_modified.md` verified 19 findings. Remediation binds capability descriptor identity to the selected card/store; replaces remove/recreate lease files with heartbeat-backed `proper-lockfile` ownership and collision-resistant keys; rejects symlinked run-control paths; reacquires ownership around resume; uses SDK `customTools` so confined definitions actually override built-ins; injects bundled workflow skills into detached children; protects context/audit authority; fingerprints baseline content and index state; namespaces replay units; restores prior changed paths; preserves pre-staged baseline work; independently routes repair budgets; revalidates canonical identity; and finalizes only exact collected commits after rerunning frozen commands and checking forbidden telemetry. Focused and package suites above cover these corrected boundaries.

### Explicit spike seams

- **Canonical capture adapter:** the optional public Specbase API currently exposed to `rpiv-specbase` covers board/action contracts but not status/apply instructions. Capture therefore invokes the public `specbase status --json` CLI deterministically. Replacing this with a typed API is a follow-up seam.
- **Affected-root precision:** current planning data does not expose a canonical per-task production write set. The capture freezes the repository root as the allowed root and relies on baseline exclusion, stable unit identity, recorded changed paths, and explicit-path commit checks. Narrower canonical affected roots remain a follow-up.
- **Per-task verification:** when a task has no typed native command contract, capture freezes the repository test command as its conservative verification. First-class task-to-command mapping remains a Specbase contract seam.
- **RPIV resume ownership:** the generic workflow contract now supports before/after resume ownership hooks. Local delivery revalidates canonical identity, reacquires the proper-lockfile lease before replay, attaches the original run ID, and releases after settlement. The operator journey observed this across a real Pi restart. A provider that remains unresponsive after reattach still requires human cancellation or a future fresh-session retry affordance.
- **Denied-attempt terminal telemetry:** same-name SDK custom tools enforce root-confined file operations and a narrow command allowlist. Unsupported local syntax is audited but does not falsify the final gate; actual remote/network/panel/archive/successor requests are marked forbidden and fail terminal verification.
- **Command transitivity:** direct model-controlled interpreters, remote Git, GitHub, panel, archive, successor, and out-of-root paths are denied. Repository-owned `npm test`/configured native scripts remain a trusted transitive boundary and can themselves contain network behavior.
- **Install topology:** enforcement depends on the matching `@juicesharp/rpiv-pi` execution host. `rpiv-specbase` now declares that peer; loading the plugin with an older host cannot supply the policy. Release/version coordination remains required.
- **Live agent exercise:** a real keyboard-driven Pi run completed canonical launch, readiness, evidence, task, and green local gate. The provider emitted an empty local-review response; resume reacquired the lease and reattached, but the provider remained unresponsive. Therefore no live terminal commit is claimed; exact commit/final-gate behavior is established by disposable-repository tests.
