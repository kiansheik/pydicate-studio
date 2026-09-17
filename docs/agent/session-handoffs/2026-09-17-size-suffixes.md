# Size suffix pieces

- Goal: make Navarro augmentatives and diminutives selectable pieces that compose with a noun or verb via `/`.
- Inspected: `python/navarro_search.py`, `python/authoring_runtime.py`, `src/components/DictionaryEntryCreation.tsx`, `src/components/PredicatePalette.tsx`, and `nhe-enga`'s `Predicate.compose`, `tupi.Noun.compose`, Navarro gzip rows, and grammar navigation.
- Changed: those Studio search/runtime/UI files and focused tests; `nhe-enga`'s new `SizeSuffix`, composition dispatch, tests, navigation, and `AGENT_NOTES.md`.
- Commands: focused `unittest`, real dictionary conversion for seven senses, direct pending-expression evaluation, `npm run build`, and `git diff --check`.
- Worked: `pira / -gûasu → piragûasu`, `pytun / -usu → pytunusu`, `membyra / -'ĩ → membyrĩ`, `mba'e / -'ĩ → mba'e'ĩ`, `îaboti / mirĩ → îabotimirĩ`. Generic noun composition remains unchanged. Distinct lusivo `-'ĩ` and quantifying `-usu` are not classified as size suffixes; `mirĩ` keeps an ordinary noun choice.
- Failed: `pytest` is absent in the selected Python, so focused engine checks use `unittest`. Browser tests could not start because the sandbox denied Vite's temporary config write. `make verify-ground-truth` reports a preexisting Araújo record 74 source-annotation/JSONL mismatch; no ground-truth files were changed for this work.
- Remaining questions: allomorph selection between `-ûasu` and `-gûasu` remains an explicit contributor choice; more historical stems need editorial assessment. Existing corpus expressions were not changed.
- Suggested next prompt: choose a corpus passage with a size suffix and review its full expression and annotated output before adding it to the source.
