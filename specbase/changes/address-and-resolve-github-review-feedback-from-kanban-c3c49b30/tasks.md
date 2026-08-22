## 1. Canonical Reviewing-card outcomes

- [ ] 1.1 Add canonical Reviewing action descriptors for Address PR feedback, comment-aware Explore, and human Archive; preserve exact card/store/PR identity through fresh validation.
- [ ] 1.2 Implement the conversational Explore skill contract so it can discuss selected frozen feedback without autonomous repository, GitHub, or lifecycle mutation.
- [ ] 1.3 Keep Archive separately human confirmed and prove no feedback-workflow path reaches archive, merge, approval, or ready-for-review.

## 2. Feedback workflow and external boundary

- [ ] 2.1 Define typed snapshot, classification, re-observation, reply, resolution, and audit artifacts for repository/PR/namespace/comment-or-thread/updatedAt/body-digest/head-SHA identity.
- [ ] 2.2 Implement the narrow GitHub feedback adapter for complete pagination, exact-object re-observation, idempotent reply lookup/posting, and review-thread-only resolution; keep canonical Specbase action and lifecycle authority outside the adapter.
- [ ] 2.3 Implement and `validateWorkflow()` the resumable `specbase-pr-feedback` graph: capture, classify, bounded evidence-first fix/reconsider/non-actionable routes, final gate/panel, safe push of exact head, reply, conditional resolve, and re-observe stops.
- [ ] 2.4 Enforce behavior-defect RED commit before GREEN/refactor commits and require each localized refactor to preserve green verification; stop scope expansion and planning-artifact edits as feedback remediation.
- [ ] 2.5 Add the strict child-session host policy and typed trusted handoffs; reject arbitrary shell/network/GitHub access, credential exposure, force/history rewrite, merge, approval, ready, archive, and successor capability.

## 3. Evidence delivery

- [ ] 3.1 Implement `packages/rpiv-specbase/kanban/pr-feedback-actions.test.ts` for exact Reviewing actions, conversational Explore, and human-only Archive; run `npm test -- packages/rpiv-specbase/kanban/pr-feedback-actions.test.ts` and record the result.
- [ ] 3.2 Implement `packages/rpiv-specbase/workflows/pr-feedback-delivery.test.ts` with fake GitHub and disposable repositories covering pagination, frozen/re-observed revisions, untrusted input, classifications, commit ordering, final gate/panel, exact-head safe push, idempotent reply, conditional thread resolution, and general-comment reply-only; run its named test command and record the result.
- [ ] 3.3 Implement `packages/rpiv-specbase/workflows/specbase-pr-feedback.test.ts` to call `validateWorkflow()` and prove bounded typed routes plus no merge/archive/ready/approval/successor reachability; run its named test command and record the result.
- [ ] 3.4 Implement `packages/rpiv-specbase/workflows/pr-feedback-host-policy.test.ts` for allow/deny policy boundaries and trusted adapter handoffs; run its named test command and record the result.
- [ ] 3.5 Link every completed source in the paired `enforcement.yaml` files and distinguish fake-remote proof from real GitHub credential/provider availability.

## 4. Final verification

- [ ] 4.1 Run `openspec validate address-and-resolve-github-review-feedback-from-kanban-c3c49b30 --strict`, the affected native test files, and the repository checks; record each command and result in change progress.
- [ ] 4.2 Run the generated Specbase review panel after the deterministic gate is green; record review-strength findings separately from enforcement and archive gates.
