# Implemented scope and remaining boundaries

The initial 0067-only implementation at `0af3937` has been extended in place. Araújo is the active source; Bettendorff is excluded. [Current state](../agent/current-state.md) and [coverage](../coverage/araujo.md) describe the verified version; the supplied product design remains the wider roadmap.

## Authoring and identity

Original bytes, editable raw text, recursive construction cards, lexical references and runtime projections are separate. Raw text is authoritative while incomplete; valid parses and runtime-enriched trees are accepted only for the requesting revision. UTF-16 span edits preserve grouping; whole-file AST formatting is never used. Runtime roles come from the selected engine, not operator characters. Unknown constructs remain intact with diagnostics and a clear Python adapter extension point.

Source-side IDs use a supported `# @note studio:v1` extension. Existing unmarked entries use a persistent sequence registry; unrelated edits and unambiguous insertions preserve IDs. Ambiguous identical insertions retain the old draft as an orphan rather than silently assigning it. New reading drafts reserve their eventual source identity before an analysis exists. Reference records remain the upstream sequential editorial workflow, with legacy provenance distinguished from explicit new approval.

## Source, drafts and evidence

Atomic local draft saves accept invalid/empty analysis and editorial fields. Applying source is separate: a concrete diff, source/dependency freshness checks, atomic replacement and recovery bytes. Metadata changes replace only edited adjacent directives. Unsupported multiline scalar source metadata is kept as a draft rather than silently truncated. PDF region storage uses unrotated PDF points and a managed fingerprinted asset; source comments contain the stable pointer. Scholarly locators stay human-editable beside the expression.

Verification does not approve. Explicit reference approval delegates upstream sequencing/target rules and uses an atomic persistence sink. Git sharing exports a reviewable binary patch, including local source/reference differences; it does not commit or push on the contributor's behalf. Managed PDF assets, local drafts and private AI history are not silently included in the patch.

## Providers and distribution

Codex App Server and Claude Messages streaming adapters are implemented. Codex generation was authenticated and exercised; Claude authentication works but generation is blocked by account credit. Results bind project, passage, revision and model/context; accepting one is a human action. The current provider context includes textual evidence and PDF coordinates, not page pixels. Grammar repair assistance creates a separate proposed response, without automatic engine mutation.

The developer desktop uses installed Node/Python and sibling repositories. Exact dirty dependency contents are recorded in a manifest and patches. An installer, bundled interpreter, portable PDF contribution bundle and automated remote pull-request publishing remain outside this version. Native validation used a vector PDF fixture; rare PDF codec/resource combinations and the user's actual historical scan are not certified by that fixture.

## Evidence standard

[Coverage](../coverage/araujo.json) keeps parse/tree/span/evaluation/structural/UI checks distinct. [Critic reviews](../reviews/) contain findings, corrections and limits from three different rounds. Equality to a historical surface never implies editorial approval or structural equivalence.
