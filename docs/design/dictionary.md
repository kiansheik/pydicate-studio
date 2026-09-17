# Dictionary inside the authoring workspace

The **Dicionário** mode serves the selected sibling `nhe-enga` checkout's actual root HTML, styles, search script, compressed dictionary, neologism CSV and linked primary-source scans. It keeps the website's search/definition/related-entry/conjugation behavior. A local adaptation adds an **+ Árvore** button and makes a primary headword click select that exact entry. Citations open the original local scan viewer in an overlay; closing it preserves search. The iframe stays mounted across mode/passage changes; **Atualizar dicionário** explicitly reloads changed resources.

The site is served read-only on `studio://dictionary`, separate from the application origin. Only known assets are served, including the five books used by the actual citation links. In-memory transformations remove analytics/remote font loading, attach row identities and add the small integration script/style. Neighboring and generated files are never edited. The iframe has no application API and can send only a bounded selection message to its actual parent. Studio checks the exact frame, origin, dataset version and current editing context before preparation/insertion.

The source site is the local checkout, which can differ from the live deployment. Unrelated site tools, remote transcriptions and assets absent from that checkout are not bundled. Missing required resources or changed instrumentation anchors produce an explicit unavailable state. Neologism rows remain readable but lack a verified Navarro insertion identity.

## One search for pieces

The tree exposes **Adicionar peça** as an always-visible natural search field. Choosing a verified reusable structure inserts it immediately without opening a dialog. Suggestions and dictionary choices overlay the canvas; the optional palette reuses this same field alongside manual constructors/code. Existing rendered project structures appear first and keep their established verified-reuse flow. Navarro entries appear next, preserving homographic senses and full definitions. Search accepts Tupi spelling or Portuguese meanings; spaces are ignored and approximate accent matches are labelled. Query text is retained across palette reopenings and automatic context refreshes. Clicking outside or pressing Escape dismisses suggestions and invalidates pending insertion; clicking outside floating palettes also closes them without consuming canvas pan/select gestures. Manual predicate cards and code remain available as secondary tabs.

Selecting a Navarro entry in either surface uses the same `dictionary_predicate` conversion and shared UI. Unambiguous supported classes create the piece directly. Missing/ambiguous class labels ask the contributor to choose; partial evaluations show diagnostics and require an explicit insertion click. A revision/context change invalidates pending insertion. An empty draft receives its main expression; existing work receives a separate loose piece, with one undo transaction. No source/reference write or AI generation happens automatically.

## Automatic refresh

A `STALE_ENGINE` browse failure refreshes the local project and retries once with current fingerprints/drafts. Concurrent requests share the same reload. The desktop bridge transports bounded service codes through the message-only contextBridge error boundary; ordinary success values stay unchanged. External source notifications also refresh automatically. Query text and local draft/history stay intact, including edits made during the reload.

Old structure-index selections refresh the candidate list and require a fresh choice. Engine-stale conversions/resolutions refresh context but are not replayed. Source conflicts, deleted passages and different projects are not silently reassociated. Source writes, reference approval and provider generation are never automatic retries. Continuing file changes or an unreadable project can still produce an actionable error after the bounded attempt.

## Identity and lexical fidelity

The website reads `docs/dict-conjugated.json.gz`. Selection is its exact zero-based row index plus SHA-256 of the compressed bytes. SQLite `vid` and the obsolete similarly named uncompressed-path file are not interchangeable identities. `dictionary_lookup` uses this same dataset for the unified picker.

A verb must match the selected engine's exact form, sense number, full definition and class before its engine ID is used. No spelling-only fallback can silently substitute a homograph. Other lexical constructors preserve headword and full definition; proper nouns use an explicit definition wrapper where the upstream constructor otherwise ignores it. Constructor arguments are validated as literals, using the existing source interpreter.

These new pieces are inline lexical expressions. Shared named lexical declarations still use the reviewed project-lexicon editing workflow. Full selected definitions and verbal IDs persist in source; the nonverbal row/checksum currently remain conversion-time evidence rather than a separate persistent draft property.

## Validation

Isolated service/transform tests cover assets, dataset changes and actual source compatibility. Real-engine checks cover four distinct `pysyrõ` senses and other predicate types. Browser checks cover shared search, keyboard/reuse behavior, message identity, late responses, ambiguity/partial results and the actual site's local bridge. Native production checks exercise search, source scans, main/loose insertion, undo/restart and zero HTTP/S requests with disposable repositories/profile. Original source/site/data hashes stay unchanged. No provider tests consume usage.
