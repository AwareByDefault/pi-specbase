# rpiv-specbase

Installable Pi package for live or deterministic Specbase presentation.

```text
/spcb:kanban                         # nearest live Specbase store
/spcb:kanban --store <registered-id> # selected registered store
/spcb:kanban --demo                  # deterministic fixtures
```

Live mode dynamically loads the optional `@awarebydefault/specbase` peer and uses only its public nearest-root, registered-store, validated headless-board APIs. Install a compatible companion build to use live mode. The package remains installable without that peer; `--demo` stays independent and reads no live store.

The board returns an intent without dispatching an action. Press `r` to refresh a live board and Escape or Ctrl+C to close it.
