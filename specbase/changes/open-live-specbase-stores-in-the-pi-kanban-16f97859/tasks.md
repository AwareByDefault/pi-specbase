## 1. Live source adaptation
- [x] 1.1 Add the public `@awarebydefault/specbase` dependency and isolate all documented store-resolution and headless-board imports behind one live-source adapter.
- [x] 1.2 Parse nearest-store, `--store <registered-id>`, and `--demo` requests before UI creation; report conflicting, unknown, and unresolved requests without fixture fallback.
- [x] 1.3 Map the complete currently published canonical snapshot into the renderer without recomputing identities, lifecycle placement, progress, specifications, or diagnostics; retain opaque source values and explicitly defer stack/action composition until those companion contracts publish.
- [x] 1.4 Add explicit refresh, generation-safe replacement, identity-based selection reconciliation, and distinct initial-load, empty, stale, retry, and failure states.
- [x] 1.5 Preserve the predecessor's explicit demo contract by applying the full `explicit-demo-board` modification and leaving demo independently deterministic.

## 2. Evidence and native verification
- [x] 2.1 Implement `packages/rpiv-specbase/kanban/live-board.test.ts` with canonical API fakes for source parsing, projection parity, valid empty stores, refresh selection fallback, concurrent refresh ordering, and stale retry behavior.
- [x] 2.2 Run `npm test -- packages/rpiv-specbase/kanban/live-board.test.ts`; record the command and result, link it to each behavioral requirement, and document that fakes prove adapter fidelity rather than companion-library correctness.
- [x] 2.3 Run `npm run check:files -- packages/rpiv-specbase` and the affected package tests; record native-harness execution separately from structural linkage and semantic correspondence.

## 3. Human-operator UX spike journal
- [x] 3.1 After functional verification, conduct and record a keyboard-only human-operator UX spike journal covering simplicity, user-centered design, visibility, consistency, feedback, clarity, accessibility/keyboard behavior, usability, efficiency, delight, defects, and optional unfixed improvements; distinguish observed evidence from follow-up ideas.