## 1. Live source adaptation
- [ ] 1.1 Add the public `@awarebydefault/specbase` dependency and isolate all documented store-resolution and headless-board imports behind one live-source adapter.
- [ ] 1.2 Parse nearest-store, `--store <registered-id>`, and `--demo` requests before UI creation; report conflicting, unknown, and unresolved requests without fixture fallback.
- [ ] 1.3 Map a complete canonical snapshot into the existing renderer input without recomputing identities, lifecycle placement, progress, stacks, diagnostics, or action descriptors.
- [ ] 1.4 Add explicit refresh, generation-safe replacement, identity-based selection reconciliation, and distinct initial-load, empty, stale, retry, and failure states.
- [ ] 1.5 Preserve the predecessor's explicit demo contract by applying the full `explicit-demo-board` modification and leaving demo independently deterministic.

## 2. Evidence and native verification
- [ ] 2.1 Implement `packages/rpiv-specbase/kanban/live-board.test.ts` with canonical API fakes for source parsing, projection parity, valid empty stores, refresh selection fallback, concurrent refresh ordering, and stale retry behavior.
- [ ] 2.2 Run `npm test -- packages/rpiv-specbase/kanban/live-board.test.ts`; record the command and result, link it to each behavioral requirement, and document that fakes prove adapter fidelity rather than companion-library correctness.
- [ ] 2.3 Run `npm run check:files -- packages/rpiv-specbase` and the affected package tests; record native-harness execution separately from structural linkage and semantic correspondence.

## 3. Human-operator UX spike journal
- [ ] 3.1 After functional verification, conduct and record a keyboard-only human-operator UX spike journal covering simplicity, user-centered design, visibility, consistency, feedback, clarity, accessibility/keyboard behavior, usability, efficiency, delight, defects, and optional unfixed improvements; distinguish observed evidence from follow-up ideas.