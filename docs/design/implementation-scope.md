# Initial implementation boundaries

The supplied [design brief](pydicate-studio-design.md) is the product direction. The repository currently provides a developer-run reading desk and one typed authoring construction. It is a partial implementation of stages 0, 1, and 2; the design's release acceptance gates remain open.

| Area | Available now | Remaining gate |
|---|---|---|
| Stage 0: project setup | Node dependency lock, read-only clone discovery, repository content fingerprints, observed compatibility record, focused tests | Clean reproducible engine/corpus pair, managed Python runtime, fresh contributor setup |
| Stage 1: reading desk | Passage navigation/search, source metadata, session image/PDF consultation, independent readings/translations/notes, saved/current comparison | Durable witness files and page/region bindings, source-aware editorial metadata integration, colleague task acceptance |
| Stage 2: authoring slice | Fixed `apiti / nde / moro` construction, subject visibility, imperative/indicative mood, outer negation, engine projections, autosave/reopen, undo, contribution export | Shared authoring representation, lexical lookup, lossless source edit/export/reimport, authoritative review integration |
| Stages 3–5 | Unknown expressions remain inspectable and independently annotatable | Full grammar coverage, embedded providers, isolated grammar repair, contributor installation, assignments and collaboration |

## Source, reference, draft, and evaluation

The desktop discovers `oldtupicorpus` and `nhe-enga` below the chosen parent directory. The Python adapter reads top-level historic source lists and additions using the AST and original text, without importing corpus modules. A broken source produces a diagnostic while other documents remain available; a project with no readable passages is rejected without replacing active project state.

Saved JSONL surfaces are paired with source expressions through the corpus's existing ordinal convention. Their provenance remains legacy/unknown. This positional association does not establish that an externally reordered or changed source still corresponds to its saved reference. Regeneration, baseline repair, and editorial acceptance are not exposed.

Drafts contain independent diplomatic and normalized readings, translations, notes, and the supported typed analysis. They are stored separately from the canonical corpus. Contribution export records the selected source expression/fingerprint, reference provenance, draft, evaluation, and repository versions with `editorialApproval: null`. Export does not publish, approve, or write back into the corpus.

Local passage UUIDs are maintained in a Studio-owned sidecar. A unique unchanged expression retains its ID after moving. An expression changed externally receives a new ID; previous draft data is retained and requires reassociation review. Repeated identical expressions receive conservative identities scoped to the source content version. This protects against silently attaching a draft to a different expression, but it does not satisfy the future durable corpus identity migration. IDs are not promised to survive canonical source correction.

Each draft has a revision ID. The renderer displays evaluations only when draft revision and engine fingerprint match. Live rendering validates the structured request, imports the known engine API in a fresh Python child, and checks relevant content fingerprints before and after evaluation. Refreshing a project reads current source and engine contents again. File watching, automatic merging, and a complete source conflict-resolution interface are not implemented.

## Compatibility and fidelity

[compatibility.local.json](compatibility.local.json) records an observed dirty local engine/corpus pair and Python runtime. It verifies the eight combinations of subject visibility, imperative/indicative mood, and negation for the `apiti / nde / moro` slice. Browser mode selects checked-in outputs from that evaluation; it does not implement Tupi realization rules in TypeScript.

The corpus and engine revisions are accompanied by hashes of relevant tracked and nonignored untracked file contents. The combined realization fingerprint also includes interpreter identity and Studio adapter implementation. These hashes detect changes; they do not distribute the uncommitted dependency contents or turn HEAD-only checkouts into a reproducible setup. The entire corpus was not imported, rendered, regenerated, or approved as part of the compatibility claim.

Original expressions, unknown syntax, and inner comments are retained for inspection, and corpus source bytes are never rewritten. Structural round-trip checks cover only the eight typed construction combinations. This is not a concrete-syntax source editing adapter with full import/export coverage.

Morpheme text/tags come from actual engine annotations. Tree nodes and Portuguese explanations represent the explicitly supported construction. They are not a general trace of arbitrary engine internals or complete lexical semantics.

## Desktop and persistence

Electron's main process owns file access, the directory picker, Python lifecycle, and draft files. The renderer is sandboxed with context isolation and has a narrow validated preload bridge. Desktop drafts use serialized atomic file replacement; malformed saved data is retained and reported instead of overwritten. Browser mode stores separate example drafts in `localStorage`.

Consultation images and PDFs are session attachments. Persistent witness selection, automatic scan downloads, printed/PDF page mapping, and region selection are pending. The initial app has no embedded Codex/Claude provider, credential flow, review service, Git synchronization, background dependency installation, or packaged installer.

See [operation inventory](operation-inventory.md), [desktop details](../../electron/README.md), and [Python details](../../python/README.md) for narrower contracts and commands. Test and session results are recorded in [the agent log](../agent/log.md).
