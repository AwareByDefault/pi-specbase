## Why

The kanban can launch and observe generic autonomous actions, but delivering a ready Specbase change still requires a user to coordinate readiness, evidence sources, tasks, validation, cleanup, and commits by hand. A bounded local-delivery workflow makes that path resumable and observable while stopping before any remote or archive action.

## What Changes

- Add a canonical board action that starts a repo-owned RPIV workflow for a selected ready Specbase change.
- Snapshot the selected change, projected stack position, declared enforcement sources, task identities, and pre-existing working-tree baseline before mutation.
- Review local delivery readiness without invoking the Specbase review panel.
- Implement declared evidence sources and change tasks serially from the frozen snapshot.
- Run bounded fail-fix loops until every declared native evidence command and the local deterministic gate are green or the run stops with recovery state.
- Review the run-owned diff for local refactor opportunities, apply bounded local fixes, and rerun the gate.
- Create scoped atomic local commits while leaving pre-existing dirt untouched.
- Never push, open a pull request, merge, archive, invoke the Specbase review panel, or advance a successor stack member.

## Planes

### Behavioral truth
- `behavior.specbase-kanban`: one-action delivery of a ready change to a green scoped local commit with resumable failure state (modified projected pair)

### Agents truth
- `agents.specbase-local-delivery`: repo-owned local-delivery RPIV workflow and workflow-only skill suite (new)

## Enforcement intent

<!-- For every durable truth, name the planned project-defined type and source,
     the requirement-level truth it covers, and the outcome the source must
     establish. This is the planning commitment; enforcement.yaml later keeps
     only the durable link. -->

| Covered truth | Planned type | Planned source | Intended proof |
|---|---|---|---|
| `authorized-local-delivery-launch`, `evidence-first-serial-implementation`, `green-bounded-local-gate`, `reviewed-atomic-local-commits`, `local-only-recoverable-boundary` | review | `behavioural` | Until implementation creates `packages/rpiv-specbase/workflows/local-delivery.test.ts`, behavioural review judges authorization, serial units, bounded gates, scoped commits, recovery, and local-only boundaries. |
| `local-delivery-workflow-instrument`, `deterministic-serial-mutation-instrument`, `bounded-repair-instrument`, `workflow-only-skill-contracts`, `local-only-workflow-capability` | review | `enforcement` | Until implementation creates `packages/rpiv-specbase/workflows/specbase-local-delivery.test.ts`, enforcement review judges validator acceptance, bounded serial routing, handoffs, and unreachable remote capability. |

## Impact

- Adds a built-in Specbase workflow and workflow-only skills under the projected `packages/rpiv-specbase/` package.
- Uses public `packages/rpiv-workflow/` graph, typed routing, serial fan-out, audit, resume, trigger, and git-commit outcome precedents.
- Reuses `packages/rpiv-pi/` skill-contract conventions while keeping Specbase-specific mutation policy in `rpiv-specbase`.
- Consumes canonical change, task, enforcement, stack, and direct-action contracts from `@awarebydefault/specbase`.
