# Operation wording

`src/domain/operation-terms.ts` supplies the Portuguese labels/descriptions used in the tree and editing menus. Symbols remain exact source syntax; labels do not change expressions or infer subject/object roles.

The mapping was checked against the selected sibling engine on 2026-09-17 (read only): `pydicate/pydicate/predicate.py` and `lang/tupilang/pos/{noun,verb,copula,number,postposition,deverbal,composition,adverb}.py` in `nhe-enga`.

- `*` binds an argument or formation, with overloaded nominal possession and other rules. Only exact implementation/type evidence enables narrower labels; noun output alone does not imply possession.
- `/` and `.compose()` perform lexical composition. `@` performs copular predication for the ordinary nominal/verbal/number implementations, including verbal nominalization. It is not interchangeable with `/`.
- `+` can attach an adjunct or coordinate nominal elements. `<<`/`>>` can establish subordination or attach nonverbal adjuncts; descriptions preserve principal and dependent order.
- `==` is copular for Noun/Copula. `!=` negates the applicable identity relation. Studio requires predicate operands and does not expose Python scalar comparison here.
- Unary `-` toggles negation; unary `+` marks omission (on Verb, its first argument). They are distinct from binary operations; Studio requires a predicate operand.
- Method descriptions reflect the selected implementation. `.inflection()` can return a person/number value rather than a predicate. The adapter exposes `.ord()`, but the inspected local engine has no implementation; its wording explicitly requires method availability.
- Reused calls retain their actual project name and a neutral construction description. No helper template is presented as an executed internal step.
- `v(...)` is explicitly offered as **Verbo de 2ª classe (estativo)**. Local and live engine inspection on 2026-09-30 confirmed that this helper consumes a nominal object. The selected runtime reports `stativeConversion`: nominal objects use `v((tree))`; other compatible constructions use `v((tree).base_nominal())`. Studio preserves the authored tree and delegates class/pluriform realization to the engine. The operation remains visible for incomplete or unsupported roots, whose normal preview reports engine limitations; adverbs and interjections currently expose neither conversion input. This does not change the engine or saved trees until the user applies the operation.

Changes to engine overloads or the adapter capability inventory require reviewing this mapping. Unknown methods/operations retain neutral wording.
