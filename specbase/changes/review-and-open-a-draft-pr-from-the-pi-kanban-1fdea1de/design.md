## Context

The predecessor workflow leaves one selected change at green, scoped local commits with a stable RPIV audit trail and no remote mutation. The projected board can launch a second autonomous action and show its live/recovered workflow state. This slice must run the existing generated Specbase review panel, classify its review-strength report for workflow routing, repair only local defects, prove the final deterministic gate remains green, then push and establish a draft GitHub pull request idempotently.

The Specbase panel is explicitly read-only and non-gating. It may report High/Medium/Low findings above deterministic evidence but cannot change code or redefine archive readiness. The delivery workflow may choose to stop, replan, or make bounded fixes in response; that workflow policy does not upgrade panel findings into deterministic proof or Specbase gates.

## Goals / Non-Goals

**Goals:**
- Start only from a canonically authorized green local-delivery result.
- Run the generated panel and preserve a machine-readable disposition plus the full review report.
- Bound local fix/review iterations and reprove deterministic green state after fixes.
- Push only by safe fast-forward/idempotent behavior and never force.
- Create or find one draft PR and resume correctly across push/PR interruption boundaries.
- Record the remote result through canonical Specbase state and show its link on a Reviewing card.

**Non-Goals:**
- Treating panel findings as archive, coverage, or verification gates.
- Automatically merging, marking ready for review, archiving, deleting branches, or starting a successor.
- Repairing plan/spec changes under a `replan` disposition.
- Supporting arbitrary remote providers in this slice; the demonstrated remote is GitHub.
- Writing workflow/package code, tasks, or non-structural evidence sources in this phase.

## Decisions

### 1. Contribute a separate review-and-draft-PR workflow

Register a lazy built-in workflow named `specbase-draft-pr-delivery`. Keeping it separate from `specbase-local-delivery` makes the remote boundary explicit: the first workflow can finish safely offline, and the second action can be retried after credentials or remote state change. The new workflow consumes the selected change identity and verifies the predecessor's terminal local-delivery result rather than trusting the card label.

### 2. Freeze remote and local identity before review

A capture stage writes a review-delivery context containing store/change identity, repository root, current branch and HEAD, local-delivery run/commit identities, run-start dirty baseline, remote name and normalized repository identity, base branch, intended head branch, and canonical action validation token. It refuses detached HEAD, ambiguous remotes, a dirty run-owned delta, missing local commits, non-green local gate, or an already-incompatible open PR.

The context never stores credentials. Remote authentication remains inside the configured Git/GitHub tools and process environment.

### 3. Invoke the generated panel without cloning its policy

A `review-panel` stage dispatches the installed generated `specbase-review-panel` skill against the selected change. The workflow does not copy lens rosters, deterministic-gate procedures, severity rules, or completeness logic; the generated instrument resolves them from the current Specbase model.

The current panel's durable knowledge is its report in the stage transcript. A short continuation producer in the same session materializes that report as a structured artifact. This is the one justified `sessionPolicy: continue` seam: Q3 requires panel reasoning that the current skill does not publish as a file. If the panel later declares a report outcome, the workflow switches to that artifact and removes continuation without changing routing semantics.

### 4. Classify disposition without changing finding strength

The materializer writes the full panel report plus a typed disposition:
- `clean`: no findings remain;
- `advisory`: only findings the delivery policy accepts for human PR review;
- `local-fix`: findings are localized, implementation-only, inside frozen scope, and do not require spec/design/task revision;
- `replan`: a finding challenges planning truth, enforcement intent, migration/scope, or cannot be fixed safely inside the frozen local-delivery boundary.

Every finding retains its original lens, severity, verification/downgrade note, and `review` strength. `clean` and `advisory` may proceed; `local-fix` enters the bounded fix path; `replan` stops with the report. This disposition is workflow routing data only and is never written into Specbase enforcement or archive readiness.

### 5. Bound fixes and return through both gates

A workflow-only local-fix skill receives the frozen context and panel artifact. It may edit only run-owned implementation/test/docs paths already authorized by the change; it cannot modify proposal/spec/design/enforcement intent/tasks to make a finding disappear. After each fix:
1. run the deterministic local gate;
2. commit the green fix atomically against the baseline;
3. rerun the generated panel on the new HEAD;
4. rematerialize disposition.

A backward-jump budget bounds this cycle. Gate failure stops immediately with recovery state rather than invoking the panel over known-red evidence. Before any push, a separate final deterministic gate reruns strict Specbase validation, declared source native harnesses, repository checks, scope/baseline checks, and commit cleanliness against current HEAD. On pass it publishes that exact current commit as `finalVerifiedHead`; every subsequent remote and canonical-result step uses this value rather than the HEAD captured before panel fixes.

### 6. Push with compare-before-mutate semantics

The push stage reads the remote head before mutation and compares it with `finalVerifiedHead`:
- absent remote head: push `finalVerifiedHead` and establish tracking;
- remote head equals `finalVerifiedHead`: record an idempotent no-op success;
- remote head is an ancestor and the update is a normal fast-forward from the captured branch through `finalVerifiedHead`: push `finalVerifiedHead`;
- remote divergence, rewritten local history outside the bounded fix commits, protected/ambiguous target, or required force: stop without push.

The workflow never uses force, force-with-lease, branch deletion, or a user-provided shell command. The stage publishes the confirmed remote head identity so resume can distinguish completed push from an attempted one.

### 7. Ensure exactly one draft PR

The PR stage queries GitHub by normalized repository, base branch, and exact head branch before creating anything. If one matching open draft PR exists, return its number and URL only when its remote head equals `finalVerifiedHead`. If none exists and remote head equals `finalVerifiedHead`, create a draft PR with title/body derived from canonical change summary, spec locators, native evidence outcomes, all local and panel-fix commits through `finalVerifiedHead`, panel disposition, and advisory findings. Then query again and publish the canonical PR descriptor.

Multiple matching PRs, a non-draft open PR, a closed/merged conflict, an unexpected base/head, or an ambiguous repository stops for human resolution. Resume always performs the same lookup first, so a crash after creation cannot duplicate the PR.

### 8. Commit remote outcome through canonical Specbase state

After the draft descriptor is confirmed, the workflow submits the canonical action completion/result containing change identity, commit head, PR number/URL, and correlated run identity. `@awarebydefault/specbase` decides the resulting lifecycle state. The board then performs its normal live refresh and must receive a canonical Reviewing card linked to that PR.

If recording or refresh fails after a verified PR exists, the run stops with the PR descriptor in its audit artifact. Resume reuses the existing draft and retries canonical recording; it never creates a replacement PR just to recover board state.

### 9. Keep post-PR control human

The workflow ends after canonical Reviewing state is observed. It has no stage for ready-for-review conversion, approval, merge, archive, branch deletion, or successor launch. Those remain separate canonical actions under human control.

### 10. Stage and skill contract analysis

Planned execution order:
`capture -> preflight-gate -> review-panel -> materialize-disposition -> (local-fix -> fix-gate -> commit-fix -> review-panel loop | final-gate) -> push -> ensure-draft-pr -> record-pr -> refresh/observe-reviewing -> stop`.

| Stage / skill | Input contract | Output locus | Downstream need | Session policy |
|---|---|---|---|---|
| `capture` script | validated draft-PR intent | review-delivery context JSON | frozen local/remote IDs and baseline | fresh script |
| `preflight-gate` | context and current HEAD | typed gate report | explicit pass before panel | fresh |
| generated `specbase-review-panel` | selected change and green evidence | report in transcript | complete panel report | fresh |
| `materialize-disposition` prompt | continued panel session | typed panel report/disposition artifact | enum route and findings | continue, justified above |
| `specbase-panel-local-fix` | context plus panel artifact | scoped tree mutation | corrected implementation | fresh |
| `fix-gate` / `final-gate` | context plus current tree/HEAD | typed deterministic report | pass/fail route | fresh |
| `specbase-commit-panel-fix` | context plus green fix | git commit outcome | updated HEAD/commit IDs | fresh |
| `specbase-safe-push` | context plus final gate | typed remote-head result | confirmed remote identity | fresh |
| `specbase-ensure-draft-pr` | context plus remote-head result and panel artifact | typed PR descriptor | number, URL, draft/base/head facts | fresh |
| `record-pr` script/skill | canonical intent plus PR descriptor | canonical action result | authoritative lifecycle update | fresh |
| `observe-reviewing` | action result plus refreshed board | typed terminal report | final card recap | fresh |

All routed producer data has an output schema. Missing/unknown disposition or gate data stops. The implemented workflow must pass `validateWorkflow()` before registration; fixture definitions must remain deterministic across resume.

## Enforcement design

- `packages/rpiv-specbase/workflows/draft-pr-delivery.test.ts` will use disposable Git repositories and a fake GitHub adapter. It will assert disposition preservation, bounded in-scope fixes, final-gate-before-push, absent/equal/fast-forward/diverged remote handling, exact PR lookup/reuse, canonical result retry, and no merge/archive/successor path. Run it with `npm test -- packages/rpiv-specbase/workflows/draft-pr-delivery.test.ts`; fixture assertion or unexpected mutation is the failure signal. It does not prove GitHub credentials or provider availability.
- `packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts` will validate the built-in graph and skill contracts, including generated-panel delegation, the one materialization handoff, typed remote descriptors, and canonical Reviewing observation. Run it with `npm test -- packages/rpiv-specbase/workflows/specbase-draft-pr-delivery.test.ts`; validator or assertion failure is the failure signal. It proves the package-owned workflow contract, not panel finding correctness.

## Risks / Trade-offs

- [Panel transcript cannot be reliably routed] -> Continue only long enough to materialize a schema-validated report; migrate to a declared panel artifact when available.
- [Workflow policy accidentally turns review into a Specbase gate] -> Keep finding strength in the artifact, allow advisory progression, and never write disposition into enforcement/archive status.
- [A fix invalidates deterministic evidence] -> Rerun the full local gate after every fix and once more immediately before push.
- [Resume duplicates a push or PR] -> Compare remote heads and query exact head/base PR identity before every mutation.
- [Remote divergence tempts a force push] -> Stop on any update requiring force; expose no force capability.
- [PR exists but board recording failed] -> Persist the PR descriptor in RPIV audit state and retry canonical recording on resume.
- [A local lifecycle overlay invents Reviewing] -> Accept Reviewing only from the refreshed canonical Specbase snapshot.
- [Automatic merge/archive escapes scope] -> Omit those capabilities and edges from the workflow and conformance-test graph reachability.

## Migration Plan

1. Add panel disposition, local-fix, safe-push, draft-PR, and canonical-record workflow-only skills with typed contracts.
2. Implement and `validateWorkflow()` the lazy `specbase-draft-pr-delivery` graph.
3. Add disposable Git/GitHub remote fixtures covering absent/equal/fast-forward/diverged heads, interruption after push, interruption after PR creation, duplicate/conflicting PRs, and canonical record retry.
4. Add panel fixtures for clean, advisory, local-fix, replan, bounded fixes, and final-gate failure.
5. Add the canonical board action mapping for green local commits and terminal Reviewing refresh assertion.
6. Roll back by unregistering the remote workflow/action; green local commits and their audit trails remain intact, and any already-created draft PR remains a normal human-managed remote artifact.
