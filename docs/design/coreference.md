# Referential pronouns and antecedents

`+ae` realizes a generic third-person pronoun. Often it actually retakes an
earlier structure, as in `… i mba'eramo`, where `i` refers back to
`tekokatuetérerekoara oemimotarybo é imba'ee'ymba'e`. Studio records that link
in source without changing the engine or the realized form.

## Source form

```python
studio_anchor(<antecedent>, "teko")   # marks any node as an antecedent
studio_ref(+ae, "teko")               # a form that refers back to it
```

- Both helpers evaluate to a copy of their value. Surface and annotations stay
  identical to the unwrapped expression; tests compare them in the real engine.
- Labels are 1–40 characters of letters, digits, `_`, `-` or apostrophe
  (`COREFERENCE_LABEL` in Python and TypeScript must agree). An invalid label
  fails evaluation with an explicit message.
- Labels are internal source identifiers generated automatically by Studio and
  hidden from the ordinary UI. Existing labels stay compatible. An anchor label
  is unique within its work (source file). A reference may
  point at an anchor in the same passage, in a loose piece or in any other
  passage of the same work. Scope across works is not supported.
- Only the literal two-argument form is a link. Other calls stay ordinary
  helper calls.
- Publication inserts only the helpers a file uses (`STUDIO_HELPER_SOURCE`), as
  for `studio_define`, so exported source still runs outside Studio.

## Projection

Like `studio_define`, the wrappers share their value's visible node instead of
adding a tree level. The node's graph attributes carry `coreferenceAnchor`
and/or `coreferenceReference`. Léxico occurrences carry `coreference`, and the
semantic `definitionContext` carries `coreference: {role, label}`. The AI
analysis prompt explains that a reference stands for its antecedent.

## Canvas

- **Criar pronome de 3ª pessoa referencial desta estrutura** (any non-empty
  node): immediately anchors the node with an automatic identifier unless it is
  already anchored, and creates a loose referring pronoun beside the forest.
  Both happen in one undoable transaction. All identifiers in the work, including
  unresolved references, are reserved when choosing a new one. There is no label
  field or confirmation dialog.
- **Ligar a um antecedente… / Trocar o antecedente…**: wraps the selected form
  (typically an existing `+ae`) or relabels its reference. It lists anchors on
  the canvas and anchors saved in the work's other passages (drafts win over
  published source). Choices show the structure's text and its location, never
  the internal identifier.
- **Ir ao antecedente**, **Desfazer ligação ao antecedente** and **Remover marca
  de antecedente** act on the exact wrapper and preserve meaning wrappers.
  Removing an anchor that is still referenced leaves those pronouns without an
  antecedent and says so.
- Small **⚑** and **↩** badges beside the card mark antecedents and references;
  tooltips name their roles. Their placement avoids the incoming tree edge label. The inspector,
  notices, tooltips and navigation use the structure's text or role, not its ID.
- Dashed links use obstacle-aware orthogonal routing with a hollow source dot
  and an arrow at the antecedent. Endpoints attach to the visible card/pill;
  paths clear all visible nodes, labels, result envelopes and side controls.
  Saved positions, orientation, expansion and live drag previews supply the
  actual geometry. The router prefers short routes with fewer bends.
- Cross-passage chips occupy a separate left lane included in the canvas bounds.
  Their links use the same router; only the chip is the clickable hit area.
  Unresolved references show **Pronome sem antecedente**. If overlapping cards
  prevent a clear exit, the route is omitted with an explanatory tooltip rather
  than falling back to a line through nodes.

## Limits

- Other passages are scanned from their draft or published source text, not
  evaluated. Their antecedent's text is the passage's normalized text, not the
  anchored node's surface.
- Identifiers remain visible in explicit source-code editing and portable Python
  files; Studio does not rewrite existing source identifiers. A source-level
  rename across passages is not implemented.
- Routing clears nodes; secondary links may cross ordinary tree edges or share
  a corridor. It does not move saved cards automatically.
- References are not resolved across works or to lexicon declarations that
  never appear as a node in some passage.
