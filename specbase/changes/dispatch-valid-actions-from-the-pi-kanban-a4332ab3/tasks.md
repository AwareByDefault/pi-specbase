## 1. Canonical action presentation and dispatch
- [ ] 1.1 Extend the live adapter and detail pane to render only canonical enabled/blocked descriptors and canonical blocked reasons, with no free-form execution entry point.
- [ ] 1.2 Define an immutable selection envelope and a coordinator that freshly validates it against current canonical state before every route.
- [ ] 1.3 Add narrow injected conversational and autonomous adapters; send the exact validated skill invocation only through Pi, and pass the exact validated autonomous intent plus correlation metadata only through the workflow port.
- [ ] 1.4 Add action state feedback, in-flight duplicate suppression, rejection recovery, acceptance acknowledgement, and a call to the existing refresh path without treating refresh failure as dispatch failure.

## 2. Evidence and native verification
- [ ] 2.1 Implement `packages/rpiv-specbase/kanban/action-dispatch.test.ts` with injected catalog, validator, Pi sender, workflow dispatcher, and refresh adapters; cover blocked, stale, malformed, mismatched, duplicate, conversational, autonomous, acceptance, rejection, and refresh cases.
- [ ] 2.2 Run `npm test -- packages/rpiv-specbase/kanban/action-dispatch.test.ts`; record the command and result and link it to all five behavioral requirements. Confirm fixtures invoked no real skill, workflow, shell, or store mutation.
- [ ] 2.3 Run `npm run check:files -- packages/rpiv-specbase` and affected package tests; record linkage, native execution, and semantic correspondence as separate facts.

## 3. Human-operator UX spike journal
- [ ] 3.1 After functional verification, conduct and record a keyboard-only human-operator UX spike journal covering simplicity, user-centered design, visibility, consistency, feedback, clarity, accessibility/keyboard behavior, usability, efficiency, delight, defects, and optional unfixed improvements; distinguish observed evidence from follow-up ideas.