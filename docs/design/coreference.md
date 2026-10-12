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
- An anchor label is unique within its work (source file). A reference may
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

- **Criar pronome de 3ª pessoa referencial desta estrutura…** (any non-empty
  node): anchors the node with an editable, suggested label unless it is
  already anchored, and creates a loose `studio_ref(+ae, label)` beside the
  forest. Both happen in one undoable transaction.
- **Ligar a um antecedente… / Trocar o antecedente…**: wraps the selected form
  (typically an existing `+ae`) or relabels its reference. It lists anchors on
  the canvas and anchors saved in the work's other passages (drafts win over
  published source).
- **Ir ao antecedente**, **Desfazer ligação ao antecedente** and **Remover marca
  de antecedente** act on the exact wrapper and preserve meaning wrappers.
  Removing an anchor that is still referenced leaves those pronouns without an
  antecedent and says so.
- Badges `⚑ label` (antecedent) and `↩ label` (reference) mark nodes. A dashed
  arc joins a reference to its antecedent on the same canvas. A reference whose
  antecedent is in another passage shows a `↗ label · passagem N` chip that
  opens that passage. A label with no anchor in the work is shown as a warning.

## Limits

- Other passages are scanned from their draft or published source text, not
  evaluated. Their antecedent's text is the passage's normalized text, not the
  anchored node's surface.
- Renaming an existing anchor and every reference to it is not implemented.
  Remove the anchor and create a new one instead.
- References are not resolved across works or to lexicon declarations that
  never appear as a node in some passage.
