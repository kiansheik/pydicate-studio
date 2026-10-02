# Agent instructions

Before editing, read `docs/agent/index.md`, `current-state.md`, `repo-map.md`, and `open-questions.md`.

Code, tests, schemas, and checked-in configurations are the source of truth. Keep changes small; preserve unknown source text and never manufacture editorial approval. Do not edit generated corpus files or neighboring repositories. Run the narrowest useful checks. After significant work update current state, the log, and a session handoff recording the goal, inspected/changed files, commands, results, remaining questions, and suggested next prompt.

The supported product is the collaborative server and browser editor. Shared Node
services live in `runtime/`; do not reintroduce Electron launch or packaging paths.
Preserve legacy research/import archives, persisted paths and historical evidence.
Use `docs/local-setup.md` for commands; ordinary tests never invoke paid providers.
