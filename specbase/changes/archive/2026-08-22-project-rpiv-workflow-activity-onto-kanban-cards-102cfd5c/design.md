## Context

The prior member launches autonomous actions through an injected workflow dispatcher and stamps canonical store, work-item, action, and intent identities into RPIV trigger metadata. `@juicesharp/rpiv-workflow` exposes a public lifecycle registry whose callbacks fire after corresponding JSONL rows are durable, plus public readers for listing runs and summarizing a run. `rpiv-pi` proves the root-only, idempotent bridge pattern and live stage/unit projection, but its lane registry is private and models generic `/wf` lanes rather than Specbase cards.

This member adds a Specbase-owned observer. It must never gate or mutate a workflow, infer correlation from free-form input, or duplicate RPIV persistence. Live state is an in-memory projection that can be reconstructed from public run metadata and recaps.

## Goals / Non-Goals

**Goals:**
- Correlate only explicitly tagged RPIV runs to canonical Specbase cards.
- Repaint open cards from lifecycle events with stage/unit progress and exact terminal status.
- Preserve stable run identity across failures, stops, and resume.
- Reconstruct the latest correlated recap when a board opens or refreshes.
- Keep the bridge root-only, idempotent across reloads, and inert without RPIV.

**Non-Goals:**
- Defining or changing any workflow graph, skill, route, gate, or stop condition.
- Reading RPIV internal state paths or importing private lane modules.
- Treating review/gate outcomes as Specbase lifecycle transitions.
- Showing generic `/wf` runs that lack unambiguous Specbase trigger metadata.
- Implementing the delivery workflow or GitHub state.
- Authoring package code, tasks, or non-structural evidence sources in this phase.

## Decisions

### 1. Register a root-only public lifecycle observer

The `rpiv-specbase` extension registers a `registerLifecycle` listener from the public RPIV startup surface during the root interactive session lifecycle. Registration uses a process-global guard and disposer so reloads or detached children cannot stack duplicate observers. A missing workflow package degrades to no live activity projection while the board and conversational actions remain available.

Callbacks are observation-only and fail soft. They update the package's projection after RPIV has written the corresponding audit row; they never throw into, pause, cancel, or route the workflow.

### 2. Correlate exclusively through structured trigger metadata

A run belongs to a card only when its trigger source is `rpiv-specbase` and its metadata contains valid canonical store, work-item, action, and intent identities. The bridge keys projected activity by store identity plus work-item identity and retains the RPIV run identity separately.

Workflow name, input text, card title, branch name, and timestamps are never used as substitute correlation. Missing or malformed metadata leaves the run unprojected and may produce a non-blocking diagnostic.

### 3. Project a normalized card activity state

The observer maintains an immutable activity record with run identity, workflow name, status, current stage, optional unit counts/label, retry attempt, stop/failure reason, last event ordering token, and update time. Lifecycle callbacks map as follows:
- workflow/stage/unit start updates active progress;
- stage retry records retry attempt without losing stage identity;
- route to `stop`, loop cap, unit halt, stage error, and workflow end preserve their distinct semantics;
- workflow end stores the public terminal status and recap fields without reinterpreting them.

A route-stopped run may have a completed RPIV termination but remains visually `stopped` when its public recap says it stopped at a gate. The card never paints that as a green completed delivery.

### 4. Use monotone event application

Each run record accepts events in lifecycle order and ignores updates for an older run instance or an already-superseded event token. Resume reuses the same run identity; `onWorkflowStart` reactivates the existing record and clears stale terminal presentation only for the new run instance. A late terminal event from a predecessor instance cannot overwrite the resumed state.

The activity store publishes change notifications to open board components. A board subscribes while open and disposes its subscription on close or session shutdown.

### 5. Extend and consume public run-status readers

Before hydrating cards, extend `@juicesharp/rpiv-workflow` with a public run-status projection that folds the durable trail and explicitly distinguishes non-terminal pending/interrupted runs from completed, failed, aborted, and cancelled terminal runs. The projection must reuse the runtime's fold authority rather than treating the last completed stage as proof that the whole workflow completed.

When a live board opens or refreshes, the adapter calls public RPIV readers to list run headers, filters them by validated Specbase trigger metadata and current store identity, orders them by header timestamp, then asks the public status/recap readers for the latest run per card. It does not synthesize workflow storage paths or parse JSONL rows directly.

Hydration yields truthful terminality and resumable identity. An actively running in-process record takes precedence over an older disk projection. If the process restarted mid-run and the public status is non-terminal, the card shows a resumable/interrupted state rather than claiming completion or current live execution.

### 6. Keep workflow activity orthogonal to canonical board state

RPIV activity is an overlay keyed to canonical card identity. It does not alter the Specbase snapshot, lifecycle column, progress, valid actions, or stack state. A canonical refresh and an RPIV event may repaint independently; the composed card view reads the latest of each source.

When a card disappears from the canonical board, its activity record may remain in the bounded run cache for recap but is not rendered as a phantom card.

### 7. Exercise the bridge with lifecycle and recap fixtures

Implementation fixtures emit the full public lifecycle bracket, fan-out units finishing out of order, retries, soft unit halts, route stops, failures, cancellation, resume reuse, stale predecessor end, unrelated triggers, malformed metadata, and process-reopen recap hydration. Tests prove card updates and observer non-interference without running real models or delivery workflows.

## Enforcement design

- `packages/rpiv-specbase/kanban/workflow-activity.test.ts` will feed lifecycle and public-recap fixtures into card composition. It will assert metadata-only correlation, exact terminal labels/reasons, resume and late-event ordering, and restart hydration. Run it with `npm test -- packages/rpiv-specbase/kanban/workflow-activity.test.ts`; assertion failure is the failure signal. It does not prove RPIV persistence itself.
- `packages/rpiv-specbase/workflow-bridge.test.ts` will exercise root/reload registration, observer failure isolation, malformed metadata rejection, and public-reader hydration with spies that fail on private-path access. Run it with `npm test -- packages/rpiv-specbase/workflow-bridge.test.ts`; assertion failure is the failure signal. It proves the bridge contract, not workflow routing semantics.

## Risks / Trade-offs

- [Lifecycle listener bugs affect workflow execution] -> Keep callbacks minimal, catch observer failures, and prohibit routing or mutation from the bridge.
- [A run paints the wrong card] -> Require complete validated trigger metadata; never guess from text or time proximity.
- [Out-of-order or stale terminal events regress resumed state] -> Track run-instance identity and monotone event ordering before replacing a projection.
- [Process restart loses live memory] -> Rehydrate from public headers and recaps and label non-terminal disk state as resumable/interrupted, not live.
- [Activity conflicts with canonical Specbase progress] -> Render RPIV activity as a separate overlay and never write it into the canonical snapshot.
- [Private RPIV storage changes] -> Use only public lifecycle and run-reader APIs; do not synthesize paths or parse internal rows.

## Migration Plan

1. Add the repo-owned lifecycle bridge and in-memory activity projection behind an optional RPIV adapter.
2. Subscribe the open kanban to correlated activity records.
3. Add public run-header and recap hydration during live board load/refresh.
4. Verify event, resume, stale-event, and reopen fixtures.
5. Roll back by unregistering/removing the observer and card overlay; canonical board state and action dispatch remain unchanged.
