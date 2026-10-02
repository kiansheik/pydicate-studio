#!/usr/bin/env python3
"""Keep the portable Portuguese guide aligned with the in-app recipe data."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def render():
    guide = json.loads((ROOT / 'src/domain/builder-guide.json').read_text())
    lines = [f'# {guide["title"]}', '', guide['intro'], '',
        'No Studio, abra **Guia rápido** no cabeçalho da árvore. O menu de contexto oferece '
        '**Obter base nominal**, **Negar esta construção** e **Omitir na fala**; cada ação '
        'abre a prévia antes de aplicar. **Ver receita e exemplos** explica a operação escolhida.', '',
        'Por padrão, a peça arrastada fica à direita (Segunda peça) e o destino à esquerda '
        '(Primeira peça). **Inverter ordem das peças** troca os lados antes de combinar. '
        'Selecione uma ligação para transformar o conjunto ou uma palavra para transformar '
        'só aquela peça.', '',
        'As saídas abaixo são exemplos de referência conferidos em 2026-10-02 no motor local '
        'e no servidor. **Conferir este exemplo no motor atual** usa a avaliação normal do '
        'Studio no contexto atual, sem mudar o rascunho ou chamar um provedor de IA. '
        'Uma forma gerada não constitui aprovação editorial nem uma tradução automática.', '']
    for topic in guide['topics']:
        lines += [f'## {topic["title"]}', '', topic['description'], '']
        lines += [f'{index}. {step}' for index, step in enumerate(topic['steps'], 1)]
        lines += ['']
        for example in topic['examples']:
            lines += ['```python', example['expression'], '```', '', f'→ **{example["surface"]}**', '']
            if example['note']: lines += [example['note'], '']
        lines += [topic['tip'], '']
    lines += ['## Documento e análise', '',
        'Preserve a grafia e as quebras de linha do documento. A análise com peças pode '
        'atravessar uma linha sem autorizar sua junção na transcrição.', '',
        '```text', 'Oito tecó catú eté rerecoáramo', 'Oporomöĩgobêbäe.', '```', '',
        'Este guia não estabelece a análise dessas linhas nem de '
        '“Abá marã sekoagûerĩ resé nherane’yma.”. Registre as dúvidas junto da leitura.', '',
        'Fonte das receitas: `src/domain/builder-guide.json`. Para atualizar esta cópia: '
        '`python3 -B scripts/build-builder-guide.py`. Para conferir alinhamento: '
        '`python3 -B scripts/build-builder-guide.py --check`. As verificações executáveis '
        'estão em `python/tests/test_builder_guide.py`; veja o registro da sessão para '
        'revisões, hashes, contexto e limites.', '']
    return '\n'.join(lines)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    destination = ROOT / 'docs/construction-cheatsheet.md'
    text = render()
    if args.check:
        if not destination.is_file() or destination.read_text() != text:
            raise SystemExit('Guia portátil desatualizado; execute scripts/build-builder-guide.py.')
    else:
        destination.write_text(text)

if __name__ == '__main__':
    main()
