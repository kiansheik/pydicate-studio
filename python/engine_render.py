"""One fresh Python engine instance per render; no corpus execution or eval()."""
from __future__ import annotations

from contextlib import redirect_stdout
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
# -I excludes the script directory; add only this Studio module directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from adapter import validate_analysis


def morphemes_for(annotated: str) -> list[dict]:
    morphemes = []
    for text, tag in re.findall(r"([^\[\]]+)\[([^\[\]]+)\]", annotated):
        text = text.strip()
        if tag.startswith("NEGATION"):
            node, explanation = "negation", "Marca a negação da oração."
        elif tag.startswith("OBJECT"):
            node, explanation = "object", "Objeto humano genérico: gente, pessoas."
        elif tag.startswith("IMPERATIVE"):
            node, explanation = "mood", "Marca o imperativo dirigido à segunda pessoa."
        elif tag.startswith("SUBJECT"):
            node, explanation = "subject", "Marca o participante de segunda pessoa."
        elif tag == "ROOT":
            node, explanation = "predicate", "Raiz do predicado apiti."
        else:
            node, explanation = "predicate", "Anotação retornada pela gramática Python."
        morphemes.append({"text": text, "tag": tag, "nodeId": node, "explanation": explanation})
    return morphemes


def main():
    payload = json.load(sys.stdin)
    analysis = validate_analysis(payload["analysis"])
    engine = Path(payload["enginePath"]).resolve()
    sys.path[:0] = [str(engine / "pydicate"), str(engine / "tupi")]
    # Any engine diagnostic stays off the machine-readable stdout channel.
    with redirect_stdout(sys.stderr):
        from pydicate.lang.tupilang.pos.verb import Verb
        from pydicate.lang.tupilang.pos.noun import nde, moro
        expression = (+nde if analysis["hiddenSubject"] else nde) * Verb("apiti", definition=payload["definition"]) * moro
        if analysis["mood"] == "imperative":
            expression = expression.imp()
        if analysis["negated"]:
            expression = -expression
        surface = str(expression.eval())
        annotated = str(expression.eval(annotated=True))
    print(json.dumps({"surface": surface, "annotated": annotated, "morphemes": morphemes_for(annotated)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
