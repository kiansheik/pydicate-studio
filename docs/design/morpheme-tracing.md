# Morpheme highlighting in existing results

Selecting a canvas constituent automatically styles its attributable surface in
that node and its ancestors' existing output labels. There is no tracing toggle,
summary panel, duplicate sentence or diagnostic banner. Node outputs wrap without truncation and their boxes grow vertically; the layout
reserves space for the resulting dimensions. Text and editorial state are unchanged. Unary/method operations and lowercase
helpers with one structural argument highlight only their surface delta. Loose
pieces trace within their own tree.

## Evidence and freshness

`useMorphemeTrace` requests all step evidence together through `evaluate_expression`
with `includeMorphology:true`. Selecting another node reuses those captures. The
request is bound to source, piece, expression, revision and engine; stale responses
are discarded. Existing result labels are styled only when their exact text agrees
with the captured evaluation. Failed evidence leaves the ordinary text intact.

Plain and annotated evaluations use independent snapshots. `annotated` retains
the engine's verbatim text. `morphologySegments` contains morpheme text, tags and
UTF-16 start/end offsets into the exact plain result. The backend aligns ordered
non-whitespace characters, tolerating annotation-only word-boundary differences
such as `i[POSSESSIVE_PRONOUN:3p]îe` versus displayed `i îe`. Spaces are not assigned
to morphemes. Different letters or malformed tags still fail evidence generation.

## Tracing

The domain builds adjacent child-to-parent correspondences using morpheme text,
tags and sibling evidence. Selections propagate through these correspondences
rather than highlighting every matching substring in the sentence. Constituents
start with their cumulative surface contribution; unary operations compare their
base/result and start with only inserted or changed portions. Unchanged parts of
variants are excluded with grapheme-aware boundaries. Zero/deletion-only changes
have no visible added span. Ambiguous portions remain unstyled.

`morpheme-display.ts` maps exact offsets into complete wrapped labels; later
repeated words never acquire an earlier occurrence's style, and source punctuation
(including a literal ellipsis) retains its exact offsets.
HTML uses marks and SVG uses contrasting underlined text. The same main-root
ranges are published from the canvas to the existing **Resultado atual** panel;
no second evaluation is requested. The panel requires matching passage, raw text,
revision, engine and exact surface. Loose-piece selection, pending evaluation or
leaving the tree clears the panel's highlighting. The saved reference stays plain.

## Limits

This remains correspondence from engine evidence, not engine-native causal
ownership. Unresolved annotations, ambiguous repetitions and incomplete branches
can leave portions unstyled. Long words wrap at grapheme boundaries; complete
outputs remain inside their existing boxes rather than creating a separate panel.
Shared-reference internals become editable source nodes only through the existing
copy workflow. No neighboring engine or corpus
files are changed.
