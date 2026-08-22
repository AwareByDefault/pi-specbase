---
id: architecture.rpiv-specbase
---

## ADDED Requirements

### Requirement: GitHub feedback adapter authority boundary
**ID:** `github-feedback-adapter-boundary`
The `rpiv-specbase` GitHub feedback adapter SHALL own paginated feedback observation, exact revision re-observation, idempotent reply lookup and publication, and review-thread resolution through typed identities; it MUST NOT treat feedback content as authority or assign canonical Specbase action availability, lifecycle, or archive state.

#### Scenario: Adapter returns remote facts through typed identity
**ID:** `adapter-returns-typed-feedback-facts`
- **WHEN** the feedback workflow observes or re-observes a pull request revision
- **THEN** the adapter returns the repository, pull request, namespace, comment or thread identity, revision fields, and remote status as typed facts
- **AND** canonical Specbase contracts remain the authority for card actions and lifecycle

#### Scenario: Adapter observes changed feedback
**ID:** `adapter-observes-changed-feedback`
- **WHEN** a frozen feedback revision no longer matches the remote comment, thread, or pull-request head
- **THEN** the adapter reports the changed remote fact to the workflow
- **AND** it does not publish a reply, resolve a thread, or assign a lifecycle state on its own
