## Context

The projected base provides an interactive renderer, live canonical board snapshots, stable work-item identities, and refresh. The board currently returns a fixture selection but deliberately performs no action. This member consumes the canonical direct-action catalog and intent validator from `@awarebydefault/specbase`; it does not infer actions from lifecycle columns or accept free-form commands.

Two execution modes must share one safety boundary. Conversational actions re-enter the Pi chat loop through an exact canonical skill invocation. Autonomous actions start a named workflow through an injected dispatcher. Both must carry the same immutable canonical intent and both must be rejected when the selected action is no longer valid for the current store state.

## Goals / Non-Goals

**Goals:**
- Present the canonical enabled and blocked action catalog for the selected card.
- Preserve the exact canonical intent from selection through validation and dispatch.
- Route conversational actions to Pi and autonomous actions to an injected workflow dispatcher.
- Reject arbitrary, stale, malformed, or mismatched action requests before any side effect.
- Show immediate feedback and refresh the canonical board after accepted actions.
- Attach stable trigger metadata so later lifecycle projection can correlate a workflow run to its card and action.

**Non-Goals:**
- Defining action validity, lifecycle transitions, skill command strings, or workflow names locally.
- Showing live stage/unit workflow progress.
- Implementing a Specbase delivery workflow.
- Allowing shell commands, custom user-entered commands, or plugin-defined arbitrary executors.
- Implementing package code, tasks, or non-structural evidence sources in this phase.

## Decisions

### 1. Treat canonical action descriptors as opaque authority

The live adapter carries canonical action descriptors and blocked reasons from the Specbase snapshot/catalog into the card detail pane. The UI renders labels and state but does not derive enablement from column names, progress, tasks, diagnostics, or stack position. Demo fixtures may model enabled and blocked rows for interaction tests, but production meaning always comes from the canonical catalog.

### 2. Carry one immutable intent envelope

Selection produces a frozen envelope containing store identity, work-item kind and stable identity, canonical action identity, canonical dispatch kind, and the snapshot revision or equivalent validation token. Display labels, command text, and workflow names are not accepted from arbitrary UI state as dispatch authority.

The envelope is passed unchanged to the dispatch coordinator. Tests compare the selected and dispatched value deeply so no adapter silently drops or rewrites identity fields.

### 3. Revalidate immediately before routing

Before either route performs a side effect, the coordinator calls the canonical intent validator against fresh store state. Validation returns either a canonical dispatch descriptor or a structured rejection. A changed action catalog, moved/removed item, store mismatch, malformed intent, or dispatch-kind mismatch stops at this boundary.

The UI disables known-blocked actions but the coordinator still validates every request. This closes stale-snapshot and forged-call paths rather than treating disabled presentation as a security boundary.

### 4. Keep conversational and autonomous adapters narrow

For a conversational descriptor, the adapter sends the exact canonical skill invocation into Pi as a user message after the board closes. It never rebuilds the invocation from labels or IDs and never invokes a shell.

For an autonomous descriptor, the adapter passes the validated canonical intent to an injected workflow dispatcher port. The port returns a stable launch result containing a run identity or a structured refusal. The board package does not depend on RPIV's internal registry; an implementation may adapt the public programmatic runner behind the port.

### 5. Stamp correlation at the autonomous launch boundary

Autonomous dispatch supplies RPIV trigger metadata whose source identifies `rpiv-specbase` and whose metadata carries the canonical store, work-item, action, and intent identities. The later workflow-activity member consumes this public trigger metadata and run identity. Correlation is launch metadata, not a heuristic over workflow input text.

### 6. Model action UI as a small state machine

The selected action moves through `idle -> validating -> dispatching -> accepted | rejected`. While validating or dispatching, duplicate confirmation is disabled. Rejection retains the board and presents the canonical reason. Conversational acceptance closes the board before Pi receives the invocation. Autonomous acceptance keeps or reopens the board with a launch acknowledgement and then requests the existing live refresh path.

A refresh failure follows the predecessor's stale-view behavior; it does not change a successful dispatch into a failure. Dispatch refusal causes no refresh-dependent side effect.

### 7. Inject every side-effecting boundary in tests

Package tests use fixture catalog/validator, conversational sender, autonomous dispatcher, and refresh adapters. They cover exact intent transport, blocked rows, stale revalidation, malformed intent, duplicate confirmation, each routing arm, feedback, and refresh ordering. No test invokes a real skill, workflow, shell command, or store mutation.

## Enforcement design

`packages/rpiv-specbase/kanban/action-dispatch.test.ts` will inject a canonical catalog/validator, Pi-message sender, workflow dispatcher, and refresh adapter. It will assert blocked presentation, exact frozen intent transport, stale/tampered rejection before either port, duplicate suppression, route-specific acknowledgements, and refresh sequencing. Run it with `npm test -- packages/rpiv-specbase/kanban/action-dispatch.test.ts`; assertion failure is the failure signal. The suite uses no real store, skill, workflow, or shell, so it does not prove external service behavior.

## Risks / Trade-offs

- [Action state changes between render and selection] -> Revalidate against fresh store state immediately before dispatch.
- [A label or command string becomes an execution injection vector] -> Dispatch only canonical typed descriptors returned by the validator; never evaluate board text.
- [Conversational and autonomous routes drift] -> Share one immutable intent and validation coordinator, with only narrow terminal adapters differing.
- [Double confirmation launches duplicate work] -> Disable confirmation while in flight and require the dispatcher to return idempotent launch identity where the canonical contract supports it.
- [Workflow correlation is lost] -> Require trigger metadata and stable run identity at launch rather than reconstructing from audit text later.
- [Post-dispatch refresh fails] -> Report action acceptance separately and keep the last good board marked stale with retry.

## Migration Plan

1. Extend the projected card detail pane to render canonical action descriptors and blocked reasons.
2. Add the immutable intent envelope and canonical revalidation coordinator.
3. Add narrow Pi-message and autonomous-workflow adapters behind injected ports.
4. Wire accepted dispatch to acknowledgement and the existing refresh path.
5. Verify all routes with injected fixtures before enabling production adapters.
6. Roll back by removing the dispatch coordinator and adapters; live read-only kanban behavior remains intact.
