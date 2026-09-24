# Scholarly text in source comments

Diplomatic transcription, `@target`, translation, analysis and notes are text;
line breaks and whitespace can be scholarly evidence. Studio retains them
exactly when moving from a draft into `.tu.py` comments and back. Locator fields
such as page/folio remain single locators.

Ordinary one-line values keep the existing directive format. Multiline text or
text with significant outer whitespace becomes a JSON string on one physical
comment line. The adjacent `# @note studio:v1 ...` contains
`textEncoding[directive] = {format: "json-string-v1", sha256: ...}`. The hash
binds the marker to the exact serialized directive value. Studio decodes only
known formats whose contents match; unmarked legacy text, literal backslashes,
changed values and unknown markers remain literal. Returning a field to plain
text removes only its own encoding marker.

Newlines, CRLF, blank lines, Unicode line separators, quotes and literal escape
sequences survive. Text resembling `# @target` or Python code remains inside
the encoded string and cannot become another directive or statement. Reading
uses the source AST/comment parser without executing the contributor document.

Explicit reference approval copies the reviewed source's explicit scholarly
fields into its target record. Absent fields keep prior metadata, `@target`
must agree with the reviewed surface, and all other JSONL record bytes and blank
lines remain untouched. Native sequential approval rules still apply. JSONL
serialization escapes line separators that the native reader treats as physical
lines, preserving both the file framing and the original text.

The selected upstream corpus parser does not yet implement this source codec.
Independent native source consumers currently see the serialized literal;
Studio's source import, publication, exported-source reopen and approval paths
decode it. A future upstream migration must use the explicit marker, never
interpret every legacy `\\n` as a newline.


## Separate Portuguese and English translations

`Passage.translations` and `Draft.translations` are optional maps with `pt` and
`en` string values. The existing `translation` string keeps its original text
without an inferred language. Each language has its own editor and can be
cleared independently. Creating the next passage inherits location only, never
translation text. Draft storage, undo, source review, reconciliation, and the
preserved-draft archive retain the map.

Reviewed publication writes the exact map into the existing ordinary source
comment: `# @note studio:v1 {"passageId":"passage:…","translations":{"pt":"…","en":"…"}}`.
JSON escaping preserves line breaks, outer spaces and Unicode line separators.
Reopening reads this map statically and includes it in the scholarly source
fingerprint, so a source-side translation change conflicts with an old draft.
The corpus JSONL schema is unchanged; labelled translations belong to this
portable source extension. Legacy `@translation` remains unlabelled and intact.

An explicitly accepted translator result with a recorded Portuguese or English
language updates that language alone. Older results without a recorded language
and other languages retain the existing unlabelled field. No existing text is
classified by guessing its language. Analysis-candidate translations already
record `language: "pt"` and enter the Portuguese field only after acceptance.
