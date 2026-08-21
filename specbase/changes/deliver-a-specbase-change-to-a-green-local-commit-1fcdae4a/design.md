## Context

The projected stack provides live canonical cards, validated autonomous dispatch, stable RPIV correlation, and card-level lifecycle/recap projection. This member contributes the first Specbase-specific workflow. It operates only on a selected change whose canonical direct action authorizes local delivery and stops at local commits.

The repository already contains strong RPIV precedents: typed skill contracts, immutable run inputs, serial mutation lanes, bounded backward jumps, workspace baselines, native validation, resumable JSONL trails, and commit outcomes. Specbase adds a governed constraint: declared enforcement sources must be implemented and executed honestly before tasks can be called complete, stack successors must not advance through partial work, and pre-existing dirt must not be committed.

## Goals / Non-Goals

**Goals:**
- Deliver one canonically authorized ready change from board action to scoped local commits.
- Freeze all mutation units and the dirty-tree baseline before work begins.
- Implement evidence sources before task units and execute each source through its native harness.
- Bound every repair loop and preserve a stable resumable audit trail on failure.
- Review and fix only local, plan-conformant refactor opportunities.
- Leave the run-owned delta green and committed without touching remote state or a successor.

**Non-Goals:**
- Running the Specbase review panel or treating review-strength findings as gates.
- Pushing, creating a pull request, merging, archiving, or automatically starting another stack member.
- Repairing a malformed proposal/design/spec/task plan by improvisation.
- Committing files that were dirty before the run.
- Replacing canonical Specbase readiness, stack, task, or enforcement contracts.
- Writing workflow code, package code, task plans, or non-structural evidence sources in this phase.

## Decisions

### 1. Contribute one built-in workflow from `rpiv-specbase`

Register a lazy built-in workflow named `specbase-local-delivery` through the public RPIV startup registry, following `rpiv-pi` registration precedents. The validated board intent remains the workflow input and trigger metadata remains the correlation authority. User/project workflow overlays may override the built-in by name under RPIV's normal layer rules.

The workflow definition and every workflow-only skill ship from `packages/rpiv-specbase/`. General RPIV packages remain skill-agnostic; `@awarebydefault/specbase` remains lifecycle and planning truth.

### 2. Freeze a delivery context before mutation

A deterministic capture stage resolves the validated intent through the canonical Specbase API and writes a run-scoped delivery-context artifact containing:
- repository/store/change stable identities and projected stack position;
- current change status and artifact paths;
- ordered declared enforcement source identities and source contracts;
- ordered task stable identities and dependency/sequence information;
- the run-start HEAD and pre-existing dirty-path baseline;
- allowed change/package roots and the native command inventory resolved from project guidance/config;
- the required predecessor and an explicit prohibition on successor launch.

Every loop unit derives from this immutable artifact, not from task or enforcement files after mutation. This satisfies RPIV resume determinism even as tasks are checked off and source files are added.

### 3. Acquire one atomic delivery lease and refuse unsafe starts

Before capture can authorize mutation, acquire an atomic filesystem lease keyed by canonical store and change identity using exclusive creation under a package-owned run-control directory. The lease records run identity and owner metadata, is released only after terminal workflow cleanup, and is reconciled explicitly when its recorded run is provably terminal or abandoned. A second Pi process that races the same change must fail lease acquisition before either process captures mutable context.

A workflow-only readiness skill then reads the context and produces a structured `ready | blocked | replan` disposition. `ready` requires the lease to belong to this run, the canonical action to remain valid, the selected change to be in the required feature/apply state, required planning artifacts to resolve, every declared source contract to identify a native harness, the predecessor projection to be satisfied, and no conflict between the run's allowed write scope and baseline.

`blocked` is recoverable environment/state trouble; `replan` means the planning artifacts cannot honestly drive implementation. Either routes to stop with a durable reason and terminal cleanup releases the lease. This review is a local delivery preflight, not the Specbase review panel.

### 4. Run evidence and task units serially

The workflow uses two deterministic side-effect fan-outs with `concurrency: 1`:
1. `implement-evidence` dispatches one frozen enforcement-source unit at a time.
2. `implement-task` dispatches one frozen task unit at a time in declared order/dependency waves.

Each unit has a stable ID from the delivery context. Evidence units may create or update only their declared source and directly required production files, execute the source through its native harness, and record the command/result in the change's implementation record. Task units implement only their selected task, update only that task's checkbox after its own verification passes, and stop on a plan mismatch rather than broadening scope.

An empty frozen unit list is an intentional no-op. A newly discovered task/source after capture requires a new or resumed/replanned run; it is never silently appended to the current unit generator.

### 5. Use typed gates and bounded repair loops

After mutation units, a workflow-only local gate produces structured data: `verdict: pass | fail`, failed check identities, paths outside run scope, incomplete task/source identities, and the latest native execution outcomes. It runs strict Specbase change validation, coverage/linkage checks, every declared source's native harness, and the repository-native checks required by the frozen context.

A pass routes to local review. A fail routes to a narrowly scoped remediation skill and then back to the same gate. The RPIV backward-jump budget bounds re-entry; the workflow additionally caps remediation attempts in its own public description. Missing/unexpected verdict data stops rather than falling through. Remediation may fix implementation defects inside frozen scope but cannot rewrite planning intent or waive a failing source.

### 6. Separate local refactor review from the Specbase panel

A workflow-only local-review skill examines only the tree-minus-baseline delta and produces `clean | local-fix | replan` plus a review artifact. It looks for localized refactors, regressions, scope escape, and convention drift against package peers. It does not invoke `/spcb:review-panel`, does not assign panel severity, and does not redefine archive gates.

`local-fix` enters a bounded fix skill, then reruns the deterministic local gate before reviewing again. `replan` stops with the review artifact and resumable run identity. `clean` advances to commit.

### 7. Commit only the run-owned, green delta through a capability-filtered host

Extend the Pi workflow execution host with a per-run capability policy for this built-in. Local-delivery children receive only the local filesystem, repository-local command, and non-remote Git surfaces required by their stage contracts; remote Git/GitHub, Specbase review-panel, archive, and successor-dispatch capabilities are absent at the host/tool boundary rather than merely omitted from graph edges.

A workflow-only commit skill receives the delivery context and latest pass/review artifacts. It recomputes status, subtracts the run-start baseline, refuses paths outside frozen scope, verifies HEAD ancestry against the captured start, and creates one or more atomic commits grouped by coherent task/evidence purpose. It never stages by directory-wide wildcard and never commits pre-existing dirty paths.

The commit outcome records created commit identities. After commit, a terminal verification confirms the run-owned paths are clean, HEAD contains the new commits, all frozen gates still pass, no forbidden capability was requested, and no push/PR/archive occurred. Pre-existing baseline dirt may remain visible and is not a failure.

### 8. Never advance a stack successor automatically

The workflow operates only on the selected change. It neither calls the successor action nor changes successor state. The canonical direct-action catalog decides whether the next stack member is available after later human-controlled remote/archive steps. A failure or stop refreshes the board but cannot launch another member.

### 9. Stage and skill contract analysis

Planned execution order:
`capture -> readiness -> implement-evidence -> implement-task -> local-gate -> (remediate loop) -> local-review -> (local-fix -> local-gate loop) -> local-commit -> final-local-gate -> stop`.

| Stage / skill | Input contract | Output locus | Downstream need | Session policy |
|---|---|---|---|---|
| `capture` script | validated canonical intent and trigger | delivery-context JSON artifact | frozen IDs, baseline, paths, commands | fresh script |
| `specbase-delivery-readiness` | delivery context | typed readiness JSON/report | enum route and reasons | fresh |
| `specbase-implement-evidence` | one frozen source unit | working-tree side effect plus audit row | mutated tree; unit completion | fresh serial fan-out |
| `specbase-implement-task` | one frozen task unit | working-tree side effect plus audit row | mutated tree; unit completion | fresh serial fan-out |
| `specbase-local-gate` | context plus current tree | typed validation JSON/report | pass/fail route and failed checks | fresh |
| `specbase-local-remediate` | context plus latest failed gate | scoped working-tree side effect | corrected tree | fresh |
| `specbase-local-review` | context plus green tree | typed review JSON/report | clean/local-fix/replan route | fresh |
| `specbase-local-fix` | context plus latest local review | scoped working-tree side effect | corrected tree | fresh |
| `specbase-local-commit` | context plus green gate/review | git commits and commit outcome | commit identities | fresh |
| `final-local-gate` script/skill | context plus commit outcome | typed terminal report | final card recap | fresh |

All producer stages require named outcomes and schemas for routed fields. Multi-input consumers use named reads rather than relying on a rolling artifact. No stage uses `sessionPolicy: continue`; all durable knowledge is in typed artifacts. The implemented definition must pass `validateWorkflow()` before it is registered or written.

## Enforcement design

- `packages/rpiv-specbase/workflows/local-delivery.test.ts` will use disposable repositories and fake canonical readiness/evidence contracts. It will assert frozen evidence-before-task ordering, each declared native command execution, bounded repair stops, baseline exclusion, atomic commits, and no remote or successor side effect. Run it with `npm test -- packages/rpiv-specbase/workflows/local-delivery.test.ts`; fixture assertion or command-result mismatch is the failure signal. It does not prove a real remote workflow.
- `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts` will validate the built-in graph and workflow-only skill contract fixtures. It will assert typed stop paths, serial mutation, bounded back edges, declared handoffs, and no reachable remote/panel/successor capability. Run it with `npm test -- packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts`; validator or assertion failure is the failure signal. It proves the declared workflow shape, not arbitrary user-project task correctness.

## Risks / Trade-offs

- [Mutable tasks make resume unit generation drift] -> Freeze stable task/source units in the capture artifact and replay completed units from RPIV audit state.
- [Automated repair rewrites planning intent] -> Limit remediation to frozen implementation scope; route plan mismatch to `replan` and stop.
- [Pre-existing dirt is accidentally committed] -> Capture a path baseline before mutation, subtract it at every scope/commit gate, and stage explicit run-owned paths only.
- [A failing source is hidden by broad repository tests] -> Execute every declared source through its native harness and report linkage, execution, and semantic result separately.
- [Local refactor fixes regress green evidence] -> Route every local fix back through the deterministic gate before another review or commit.
- [A bounded loop still creates partial code] -> Preserve the JSONL trail, latest gate/review artifact, stable run identity, and uncommitted run-owned delta for resume or manual recovery.
- [Two Pi processes mutate one change] -> Acquire one exclusive store/change lease before capture and reject racing runs before mutation.
- [Commit stage mutates remote state] -> Enforce a capability-filtered execution host with no push/PR/archive/panel tools and verify remote refs are untouched in the terminal report.
- [Stack successor starts on partial success] -> Omit every successor-dispatch edge and rely on canonical post-state action availability.

## Migration Plan

1. Add the workflow-only skills and their typed contracts to the projected package.
2. Implement the lazy built-in workflow definition and validate it with `validateWorkflow()`.
3. Add disposable-repository fixtures for green delivery, bounded failures, resume, baseline dirt, stack blocking, and atomic commits.
4. Add the canonical board action descriptor and autonomous dispatcher mapping for ready changes.
5. Keep the feature disabled when required public Specbase or RPIV contracts are unavailable.
6. Roll back by unregistering the built-in and action mapping; existing board read/action/activity capabilities remain available and no remote migration is required.
