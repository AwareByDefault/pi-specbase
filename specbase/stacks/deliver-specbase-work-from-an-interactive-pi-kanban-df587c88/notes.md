## Intent

Ship an installable `pi-specbase` package that renders Specbase work as an interactive Pi-native kanban, dispatches valid conversational and autonomous actions, projects RPIV progress, and can deliver a selected change through a draft pull request.

## Ownership boundary

This repository owns the Pi renderer, action dispatcher, Specbase-specific RPIV workflows, workflow-only skills, and packaging. `@awarebydefault/specbase` remains the source of lifecycle, board, and action truth.

## Cross-repository handoff

Live slices consume the public contracts proposed by the companion Specbase stack. Fixture-first work remains demonstrable before those APIs publish.
