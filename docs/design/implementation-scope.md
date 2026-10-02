# Supported scope

Pydicate Studio is a collaborative server and browser editor. The Node service
serves the compiled React application, owns the selected Python engine and corpus,
and stores shared user drafts/history in PostgreSQL. [Current state](../agent/current-state.md)
records verified checkpoints; [local setup](../local-setup.md) and
[deployment](../../deploy/collab/README.md) describe supported commands.

Source, draft, proposal, generated output and approved reference remain separate.
Incomplete source is recoverable draft text; only explicit reviewed publication
changes canonical source/reference files. Identity, version, engine and evidence
guards preserve concurrent work and unknown source bytes. PDF region edits
autosave; new evidence and contributor submissions remain attributed.

The native Electron shell, native file pickers, installer, updater and bundled
Python/Git distributions are retired. Shared authoring, AI/MCP, validation, PDF,
dictionary and Python bridge services live under `runtime/`. Existing state paths,
research schemas and archive formats are retained; historical import readers stay
available to preserve previously migrated material.

Hosted AI requires capability/configuration and authenticated provider accounts.
Grammar repair uses checked scoped engine edits and regression gates; it does not
approve research. Routine validation never makes paid provider requests.
Optional actual-corpus fixtures and historical comparison reports can differ from
current selected engine data; generated equality is not linguistic correctness.
