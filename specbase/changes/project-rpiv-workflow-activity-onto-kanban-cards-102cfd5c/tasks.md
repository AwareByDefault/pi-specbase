## 1. Lifecycle bridge and card overlay
- [ ] 1.1 Register an optional root-session RPIV lifecycle bridge with idempotent reload disposal and observation-only, fail-soft callbacks.
- [ ] 1.2 Validate `rpiv-specbase` trigger metadata before correlating any run; key activity by canonical store/work-item identity and retain the RPIV run identity and ordering token separately.
- [ ] 1.3 Project active stages, fan-out unit progress, retries, stops, failures, aborted/cancelled outcomes, resumes, and stale-event suppression into an immutable card overlay without changing canonical board data.
- [ ] 1.4 Add a public `@juicesharp/rpiv-workflow` run-status reader backed by the durable fold authority that distinguishes pending/interrupted runs from completed, failed, aborted, and cancelled terminal runs; cover it in the workflow package's state-reader tests.
- [ ] 1.5 Hydrate the latest valid correlated state through public run-header, run-status, and recap APIs on board open/refresh; label non-terminal restarted records as resumable or interrupted and never infer completion from the last completed stage.
- [ ] 1.6 Subscribe and dispose open board updates correctly, and retain bounded unrendered activity only as recap cache when a canonical card disappears.

## 2. Evidence and native verification
- [ ] 2.1 Implement `packages/rpiv-specbase/kanban/workflow-activity.test.ts` for valid/unrelated/malformed correlation, lifecycle progress, retries, terminal distinctions, resume reuse, late events, and reopen hydration.
- [ ] 2.2 Implement `packages/rpiv-specbase/workflow-bridge.test.ts` for root-only registration, reload idempotence, failure isolation, public-reader hydration, truthful non-terminal restart classification, and prohibition of private RPIV-path access.
- [ ] 2.3 Run both named test files with `npm test -- <path>`, record each command/result, link each source to its requirement set, and document the external RPIV behavior those fakes cannot prove.
- [ ] 2.4 Run `npm run check:files -- packages/rpiv-specbase` and affected package tests; record structural linkage, native execution, and semantic correspondence separately.

## 3. Human-operator UX spike journal
- [ ] 3.1 After functional verification, conduct and record a keyboard-only human-operator UX spike journal covering simplicity, user-centered design, visibility, consistency, feedback, clarity, accessibility/keyboard behavior, usability, efficiency, delight, defects, and optional unfixed improvements; distinguish observed evidence from follow-up ideas.