## Why

A live board that cannot safely start work is still only an observer. The canonical Specbase action catalog and intent validator now provide the authority needed to expose actions without turning the Pi board into an arbitrary command launcher.

## What Changes

- Show only canonical valid actions for the selected card, including blocked actions and their canonical reasons.
- Dispatch conversational actions back into Pi as the exact canonical skill invocation.
- Dispatch autonomous actions through an injected workflow dispatcher using the exact validated intent.
- Revalidate intent at the dispatch boundary, reject stale or tampered selections, and never execute arbitrary command text from board data.
- Present launch, rejection, completion acknowledgement, and refresh feedback in the board.
- Correlate autonomous launches with immutable trigger metadata needed by the next workflow-activity member.
- Defer live workflow progress and the full delivery workflow.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: authoritative action affordances, immutable dispatch, safe rejection, feedback, and refresh (modified projected pair)

## Enforcement intent

<!-- For every durable truth, name the planned project-defined type and source,
     the requirement-level truth it covers, and the outcome the source must
     establish. This is the planning commitment; enforcement.yaml later keeps
     only the durable link. -->

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `authoritative-card-actions`, `exact-validated-intent-transport`, `conversational-action-dispatch`, `autonomous-action-dispatch`, `dispatch-feedback-and-refresh` | review | `behavioural` | Until implementation creates `packages/rpiv-specbase/kanban/action-dispatch.test.ts`, behavioural review judges catalog fidelity, revalidation, exact intent transport, both routes, feedback, and refresh. |

## Impact

- Extends the projected `packages/rpiv-specbase/` action pane and source adapter.
- Consumes the canonical direct-action catalog and intent validator from `@awarebydefault/specbase`.
- Adds a Pi conversational-dispatch adapter and an injected autonomous workflow-dispatch port.
- Uses public `packages/rpiv-workflow/` runner/trigger precedents without moving Specbase action truth into RPIV.
