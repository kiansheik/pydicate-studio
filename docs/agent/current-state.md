# Current state

The initial developer-run Studio is implemented. See [README](../../README.md) for startup and [implementation boundaries](../design/implementation-scope.md) for the design's open release gates.

- Electron + React/TypeScript reading desk in Portuguese, visually informed by the supplied HTML: passage search/navigation, separate source/reference pane, responsive source toggle, comparison, construction/morpheme/tree/translation/history/code projections, contextual selection and undo.
- Independent diplomatic/normalized readings, notes and translation drafts; browser storage or serialized atomic desktop storage. Save errors/corrupt data are surfaced without replacing existing data. No draft creates editorial approval or changes a reference.
- Araújo 0067 supports fixed `apiti / nde / moro`, subject visibility, imperative/indicative, and outer negation. Eight real engine outputs are included as explicitly labeled browser examples. Electron uses fresh Python engine children with revision/content-fingerprint guards.
- Read-only local adapter opens a chosen parent containing `oldtupicorpus` and `nhe-enga`. Current inspection found 122 historic expressions and two unsaved Araújo expressions. Source files are parsed rather than executed; unsupported expressions stay inspectable.
- Contribution export includes source, draft, original reference and evaluated versions; approval is null. Orphaned drafts survive external expression changes and can be exported as a complete backup.
- User-selected PDF/image consultation and zoom are session-only. Printed/PDF page identities remain distinct.

## Verified locally

Production build, formatter, 15 domain tests, 10 desktop service tests, 16 Python adapter tests, and 13 browser tests pass. Native Electron smoke verifies renderer isolation, restrictive production CSP, image consultation, draft save/reopen, local opening of 122 passages and live `eporoapiti umẽ` evaluation. See the [handoff](session-handoffs/2026-09-16-initial-studio.md) for commands and limits. GitHub CI is configured but has not run remotely.

## Boundaries

No commits, pushes, neighboring-repository edits, corpus regeneration, or baseline approvals were made. The observed compatible pair includes uncommitted upstream content; the recorded hashes are evidence, not a distributable clean dependency lock. Full corpus execution, full grammar visual coverage, source write-back, canonical durable passage IDs, immutable review events, AI providers, Git synchronization, installers and a bundled Python runtime remain open.
