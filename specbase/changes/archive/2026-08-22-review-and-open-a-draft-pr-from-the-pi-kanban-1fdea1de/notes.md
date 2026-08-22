## Outcome

A green locally committed change can run the generated Specbase review panel, preserve a typed review-strength disposition, apply bounded local fixes, reprove exact current HEAD, compare-before-mutate push without force, create or reuse exactly one draft pull request, and record the confirmed result through canonical Specbase Reviewing state.

## Demonstration

Disposable Git and fake-GitHub tests prove safe absent/equal/fast-forward/diverged remote handling, idempotent draft lookup/create/reuse, conflict stops, bounded panel routing, finalVerifiedHead propagation, canonical compare-and-set recording, and forbidden post-PR boundaries. A real keyboard Pi journey launched the draft capability from the board and safely failed at capture when the disposable repository had no remote; no panel or remote mutation occurred.

## Explicit deferrals

Automatic merge and post-merge archive remain human-controlled. Real GitHub credential/provider availability and a live created PR are not claimed by this spike.

## Human-operator UX spike — 2026-08-21

**Journey:** Prepared a disposable governed repository at green local commits with a passing local-delivery terminal artifact but intentionally no remote. Opened `/spcb:kanban`, selected the Implementing card, chose **Review and open draft PR**, observed launch/run feedback, watched capture stop, reopened the card, and inspected the run lane.

- **Simplicity:** The action name states both review and remote outcome. Seven `j` presses were needed because blocked and conversational actions remain in the same menu.
- **User-centered design:** Missing remote state stopped before panel, push, or GitHub access. The error named the exact prerequisite rather than asking the agent to improvise.
- **Visibility:** Launch immediately showed the stable run ID. The card row switched to `RPIV failed`, and the lane dock showed `capture` plus the full reason.
- **Consistency:** The card remained canonically Implementing; failed workflow activity did not invent Reviewing. Reviewing is recorded only after a confirmed draft through Specbase's package API.
- **Feedback:** Both toast and lane status reported the capture failure. The card detail itself truncates the workflow/reason, requiring `/lanes` for the complete message.
- **Clarity:** `Draft-PR delivery requires exactly one configured remote` was concrete. It does not yet name the remediation command or detected remote count.
- **Accessibility/keyboard:** The journey used Enter and `j`; status is textual and not color-dependent.
- **Usability:** Safe refusal is strong. Remote setup recovery requires leaving the board, configuring Git, and relaunching rather than an in-context remediation action.
- **Efficiency:** Failure occurred in the deterministic capture stage before spending a model call. This is substantially better than discovering remote trouble after panel execution.
- **Delight:** Seeing the same failed run on the card and in the lane dock made the board trustworthy even though no PR was created.
- **Observed defects fixed:** Draft-owned artifacts are excluded from dirt; panel stamps are restored on failure; launches/resumes are leased; exact RPIV run identity reaches the descriptor; panel dispositions reject contradictions; agent children cannot push/use GitHub/merge/archive/start successors; canonical result recording is idempotent and conflicting descriptors stop.
- **Optional improvements:** Filter action menus to available actions first, show complete stop reason in card detail, add a “configure remote and retry” hint, expose credential readiness before launch, and run a live GitHub sandbox journey before production release.
