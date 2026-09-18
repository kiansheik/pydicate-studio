"""Source-backed learning material. No corpus or reference writes.

@studio-lessons
[
  {
    "id": "ligar", "title": "Ligar duas peças", "minutes": 1,
    "sourceId": "araujo_catecismo_1686", "ordinal": 38,
    "intro": "Comece por uma construção que já existe no léxico. Vamos completar arobiar com aquilo em que se crê.",
    "guides": ["vincular", "lexico"],
    "steps": [
      {"raw": "arobiar", "title": "Conheça a primeira peça", "prompt": "A peça arobiar já está na árvore. Ela guarda um pronome não expresso e o verbo. Observe o resultado e clique em Próxima etapa para completar a construção.", "hint": "Isolada, arobiar realiza xererobîar: o motor ainda trata o pronome como objeto. Ao acrescentar Espírito Santo, o conjunto realiza arobîar Espírito Santo, com sujeito de primeira pessoa e objeto expresso. Confira o conjunto completo, não apenas o nome da peça."},
      {"raw": "arobiar * espirito_santo", "title": "Complete o argumento", "prompt": "Na busca acima da árvore, digite Espírito Santo e adicione a peça já definida. Clique no círculo de ligação dessa nova peça e depois no círculo de arobiar. Escolha Vincular elementos (*) e confirme a combinação, com arobiar primeiro.", "hint": "A peça nova fica solta até ser conectada. Confira a ordem: arobiar à esquerda no código, espirito_santo à direita. OBJECT:DIRECT identifica o objeto; o prefixo a- marca o sujeito de primeira pessoa. Desfazer permite tentar outra ligação."}
    ],
    "question": "Uma peça do léxico precisa ser uma palavra isolada?",
    "choices": ["Não: pode guardar uma construção reutilizável.", "Sim: cada peça sempre representa uma palavra."],
    "answer": 0, "explanation": "arobiar é uma construção nomeada: +ixé * erobîar. Reutilizar não exige reconstruir tudo."
  },
  {
    "id": "posse-modo", "title": "Construir de dentro para fora", "minutes": 2,
    "sourceId": "araujo_catecismo_1686", "ordinal": 5,
    "intro": "Primeiro forme nde Reino; depois ligue esse conjunto ao verbo; por último marque o permissivo.",
    "guides": ["vincular", "escopo", "perm"],
    "steps": [
      {"raw": "nde", "title": "Comece pelo possuidor", "prompt": "Selecione nde. Vamos construir a relação nominal nde * reino.", "hint": "O mesmo símbolo * tem efeitos diferentes conforme o tipo das peças. Aqui ele forma posse nominal."},
      {"raw": "nde * reino", "title": "Forme o conjunto nominal", "prompt": "Vincule reino à direita de nde.", "hint": "Os parênteses no código delimitam esse conjunto. Na árvore, selecione sua ligação para trabalhar sobre as duas peças juntas."},
      {"raw": "ur * (nde * reino)", "title": "Ligue o conjunto ao verbo", "prompt": "Adicione ur à esquerda do conjunto inteiro nde * reino.", "hint": "A anotação SUBJECT:3p:DIRECT pertence ao conjunto nominal. Não deduza o papel só pela posição na frase."},
      {"raw": "(ur * (nde * reino)).perm()", "title": "Marque o permissivo", "prompt": "No conjunto verbal, abra Adicionar operação e escolha Permissivo.", "hint": "Aplique .perm() à construção inteira. A forma conferida no corpus é tour nde Reino."}
    ],
    "question": "Onde aplicar o modo permissivo desta lição?",
    "choices": ["Somente em reino.", "No conjunto verbal ur * (nde * reino)."],
    "answer": 1, "explanation": "A operação envolve a construção verbal; não modifica apenas o nome."
  },
  {
    "id": "omitir-negar", "title": "Omitir não é apagar", "minutes": 2,
    "sourceId": "araujo_catecismo_1686", "ordinal": 69,
    "intro": "Vamos reconstruir uma proibição. O pronome continua na análise mesmo quando não aparece como palavra separada.",
    "guides": ["omissao", "negacao", "imp", "escopo"],
    "steps": [
      {"raw": "nde", "title": "Mantenha a pessoa", "prompt": "A peça nde já está na árvore. Vamos manter a pessoa gramatical e mudar sua expressão nas próximas etapas.", "hint": "O + antes de uma peça é unário: +nde. Não é o mesmo + que liga duas construções."},
      {"raw": "+nde", "title": "Marque a omissão", "prompt": "Selecione nde, abra seu menu e aplique Omissão na fala (+).", "hint": "Sozinho, +nde ainda aparece como endé. A marca de omissão fica na análise; seu efeito aparece ao ligar o pronome ao verbo: +nde * mondarõ realiza eremondarõ, sem endé separado."},
      {"raw": "+nde * mondarõ", "title": "Ligue o verbo", "prompt": "Busque mondarõ e vincule-o à direita do pronome marcado com omissão.", "hint": "Confira o conjunto +nde * mondarõ. A pessoa do pronome continua disponível para a flexão do verbo."},
      {"raw": "(+nde * mondarõ).imp()", "title": "Marque o imperativo", "prompt": "Selecione a ligação principal, abra Adicionar operação e escolha Imperativo.", "hint": "A operação envolve o conjunto verbal inteiro, preservando o pronome e sua marca de omissão."},
      {"raw": "-(+nde * mondarõ).imp()", "title": "Negue a ordem", "prompt": "Aplique Negação (-) ao imperativo inteiro. Compare emondarõ umẽ com a referência salva.", "hint": "Não acrescente umẽ como palavra avulsa: o motor realiza a negação. IMPERATIVE_PREFIX:2ps e NEGATION_PARTICLE:UME mostram essa realização."}
    ],
    "question": "O que +nde faz aqui?",
    "choices": ["Apaga o pronome e sua pessoa gramatical.", "Mantém o pronome na análise, sem expressão independente."],
    "answer": 1, "explanation": "Omissão na fala preserva a estrutura. Remover uma peça é outra ação."
  },
  {
    "id": "variante-nominal", "title": "Da construção à base nominal", "minutes": 2,
    "sourceId": "araujo_catecismo_1686", "ordinal": 85,
    "intro": "Vamos reconstruir nhemombe'u. Observe a ordem das operações, sem tratar o número da variante como uma regra universal.",
    "guides": ["var", "base_nominal", "escopo"],
    "steps": [
      {"raw": "mombeu", "title": "Conheça a base", "prompt": "A peça mombeu já está na árvore. Nas próximas etapas construiremos uma forma nominal a partir dela.", "hint": "Use as peças já registradas. Não substitua a análise por uma palavra pronta construída para coincidir com a saída."},
      {"raw": "mombeu * nhe", "partialExpected": true, "title": "Vincule a peça reflexiva", "prompt": "Busque nhe e vincule-o à direita de mombeu. Esta etapa não tem forma independente no motor atual; a construção será completada nas próximas operações.", "hint": "Um aviso nesta etapa intermediária não exige apagar a construção. A sequência será vincular, selecionar a variante e obter a base nominal."},
      {"raw": "(mombeu * nhe).var(1)", "partialExpected": true, "title": "Escolha a variante", "prompt": "No conjunto mombeu * nhe, adicione Variante com argumento 1. A forma intermediária continua indisponível.", "hint": "O número aparece na própria operação. Clique nele para editar; não é uma peça lexical separada. A variante depende da construção e não é uma correção automática."},
      {"raw": "(mombeu * nhe).var(1).base_nominal()", "title": "Obtenha a base nominal", "prompt": "Sobre o resultado de Variante, aplique Base nominal sem argumentos. Compare a forma e a estrutura com o exemplo concluído.", "hint": "A avaliação desta expressão é nominal. .base_nominal() não equivale a apagar um prefixo no texto; a operação atua sobre a construção."}
    ],
    "question": "O número 1 em .var(1) sempre significa a mesma mudança?",
    "choices": ["Não. É preciso consultar o tipo e o contexto.", "Sim. Sempre remove o sujeito."],
    "answer": 0, "explanation": ".var seleciona uma alternativa implementada para aquela construção. Não é pessoa, tempo nem uma correção automática."
  },
  {
    "id": "reunir", "title": "Reunir construções maiores", "minutes": 3,
    "sourceId": "araujo_catecismo_1686", "ordinal": 86,
    "intro": "Monte separadamente a expressão com îanondé e a construção nominal. Depois reúna os conjuntos, preservando seus escopos.",
    "guides": ["composicao", "adjuntar", "posposicao", "referencia"],
    "steps": [
      {"raw": "asé * eo", "title": "Conheça a relação nominal", "prompt": "A primeira construção, asé * eo, já está na árvore. Vamos tratá-la como um conjunto nas próximas ligações.", "hint": "O complemento da posposição será um conjunto inteiro, não apenas a última palavra."},
      {"raw": "ianonde * (asé * eo)", "title": "Ligue a posposição", "prompt": "Adicione ianonde à esquerda do conjunto inteiro asé * eo usando Vincular elementos (*).", "hint": "Confira o código: ianonde * (asé * eo). Os parênteses preservam a relação interna."},
      {"raw": "nhandy / karaiba", "title": "Prepare a segunda construção", "prompt": "Em peças soltas, adicione nhandy e karaiba e combine com Composição lexical (/). Use essa composição como principal para examiná-la; mantenha o conjunto com ianonde como peça solta.", "hint": "Composição lexical (/) não é vincular um argumento (*). Se abrir o modelo desta etapa, ele substitui a tentativa: você poderá desfazer ou reconstruir a peça com ianonde na etapa final."},
      {"raw": "((nhandy / karaiba) * îar).var(1).base_nominal()", "title": "Ligue e nominalize", "prompt": "Vincule îar à direita de nhandy / karaiba. Aplique Variante 1 e, depois, Base nominal ao conjunto.", "hint": "Reutilize a sequência da lição anterior. O conjunto com ianonde pode continuar solto até a próxima etapa."},
      {"raw": "(ianonde * (asé * eo)) + ((nhandy / karaiba) * îar).var(1).base_nominal()", "title": "Reúna os dois conjuntos", "prompt": "Combine ianonde * (asé * eo) à esquerda e a construção nominal à direita de Adjuntar ou coordenar (+). Confira a saída, a anotação e o código.", "hint": "Uma coincidência com a referência é uma conferência técnica. Publicar uma nova análise e aprovar uma referência continuam sendo decisões humanas separadas."}
    ],
    "question": "Uma forma coincidente basta para aprovar qualquer análise?",
    "choices": ["Sim, basta a mesma sequência de letras.", "Não: confira estrutura, papéis e evidência histórica."],
    "answer": 1, "explanation": "O tutorial verifica esta reconstrução. A validade de uma análise histórica exige revisão humana."
  }
]
"""
from __future__ import annotations

import ast
import hashlib
import io
import json
import re
import tokenize
from pathlib import Path

from studio_authoring import METHODS, OPERATORS, authoritative_metadata, parse_ast, source_entries

ROOT = Path(__file__).resolve().parents[1]


def documentation_fingerprint():
    digest = hashlib.sha256(Path(__file__).read_bytes())
    for path in sorted((ROOT / 'src').rglob('*')):
        if path.suffix in {'.ts', '.tsx'}:
            digest.update(str(path.relative_to(ROOT)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def blocks(text, marker):
    """A marker must precede one JSON value; malformed metadata fails the build."""
    decoder = json.JSONDecoder()
    for part in text.split(marker)[1:]:
        yield decoder.raw_decode(part.lstrip())[0]


def shape(raw):
    return ast.dump(parse_ast(raw), include_attributes=False)


def features(raw):
    result = set()
    for node in ast.walk(parse_ast(raw)):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute): result.add('.' + node.func.attr)
            elif isinstance(node.func, ast.Name): result.add(node.func.id + '()')
        elif isinstance(node, (ast.BinOp, ast.UnaryOp)):
            result.add(('unário ' if isinstance(node, ast.UnaryOp) else '') + OPERATORS.get(type(node.op), type(node.op).__name__))
        elif isinstance(node, ast.Compare):
            result.update(OPERATORS.get(type(op), type(op).__name__) for op in node.ops)
    return sorted(result)


def reference_matches(record, metadata, row):
    expected = record.get('target') or record.get('surface')
    declared = metadata.get('normalized_target')
    return bool(record.get('status') == 'approved' and metadata.get('status', 'approved') == 'approved'
        and expected and (not declared or declared == expected)
        and row.get('surface') == expected and not row.get('error'))


def guide_blocks(text, source, first_line=1):
    """Read explicit documentation directives, with source-owned attribution."""
    for marker in re.finditer(r'^[ \t]*@studio-guide\b', text, flags=re.MULTILINE):
        location = f'{source}:{first_line + text.count(chr(10), 0, marker.start())}'
        content = text[marker.end():].lstrip()
        try:
            guide = json.JSONDecoder().raw_decode(content)[0]
        except json.JSONDecodeError as error:
            raise ValueError(f'{location}: JSON inválido em @studio-guide: {error.msg}.') from error
        if not isinstance(guide, dict):
            raise ValueError(f'{location}: @studio-guide precisa ser um objeto JSON.')
        for key in ('id', 'title', 'body', 'ui', 'code'):
            if not isinstance(guide.get(key), str) or not guide[key].strip():
                raise ValueError(f'{location}: campo {key} precisa ser texto não vazio.')
        for key in ('terms', 'related', 'api'):
            if key != 'terms' and key not in guide: continue
            value = guide.get(key)
            if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
                raise ValueError(f'{location}: campo {key} precisa ser uma lista de textos não vazios.')
        yield {**guide, 'source': location}


def python_docs(text, tree, source):
    """Only standalone # blocks and real AST docstrings can author guides."""
    comment_lines = []
    first_line = previous_line = 0
    for token in tokenize.generate_tokens(io.StringIO(text).readline):
        if token.type != tokenize.COMMENT or token.line[:token.start[1]].strip(): continue
        line = token.start[0]
        if comment_lines and line != previous_line + 1:
            yield from guide_blocks('\n'.join(comment_lines), source, first_line)
            comment_lines = []
        if not comment_lines: first_line = line
        comment_lines.append(token.string[1:].removeprefix(' '))
        previous_line = line
    if comment_lines:
        yield from guide_blocks('\n'.join(comment_lines), source, first_line)
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)): continue
        doc = ast.get_docstring(node, clean=False)
        if doc is not None:
            yield from guide_blocks(doc, source, node.body[0].lineno)


def python_document(path, source):
    with tokenize.open(path) as stream:
        text = stream.read()
    try:
        return text, ast.parse(text)
    except SyntaxError as error:
        raise ValueError(f'{source}:{error.lineno}: sintaxe Python inválida: {error.msg}.') from error


def source_docs(engine):
    guides = []
    implementations = []
    # Only documentation comments/docstrings are parsed, never evaluated as code.
    for path in sorted((ROOT / 'src').rglob('*')):
        if path.suffix not in {'.ts', '.tsx'}: continue
        text = path.read_text()
        for match in re.finditer(r'/\*\*([\s\S]*?)\*/', text):
            comment = re.sub(r'^[ \t]*\* ?', '', match.group(1), flags=re.MULTILINE)
            guides.extend(guide_blocks(comment, str(path.relative_to(ROOT)), text.count('\n', 0, match.start()) + 1))
    for path in sorted((engine / 'pydicate/pydicate').rglob('*.py')):
        portable_path = 'nhe-enga/' + str(path.relative_to(engine))
        text, tree = python_document(path, portable_path)
        guides.extend(python_docs(text, tree, portable_path))
        for owner in ast.walk(tree):
            if not isinstance(owner, (ast.Module, ast.ClassDef)): continue
            for node in owner.body:
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): continue
                if node.name.startswith('_') and node.name not in {'__init__', '__mul__', '__add__', '__truediv__', '__matmul__', '__lshift__', '__rshift__', '__eq__', '__ne__', '__pos__', '__neg__'}: continue
                doc = ast.get_docstring(node) or ''
                source = str(path.relative_to(engine)) + ':' + str(node.lineno)
                implementations.append({'id': source, 'name': node.name,
                    'owner': getattr(owner, 'name', path.stem),
                    'signature': node.name + '(' + ast.unparse(node.args) + ')',
                    'source': 'nhe-enga/' + source,
                    'docstring': doc.split('@studio-guide')[0].strip(),
                    'editorSupported': node.name in METHODS or node.name in {'__mul__', '__add__', '__truediv__', '__matmul__', '__lshift__', '__rshift__', '__eq__', '__ne__', '__pos__', '__neg__'}})
    corpus = engine.parent / 'oldtupicorpus'
    for path in sorted((corpus / 'historic').glob('*.tu.py')):
        portable_path = 'oldtupicorpus/' + str(path.relative_to(corpus))
        text, tree = python_document(path, portable_path)
        guides.extend(python_docs(text, tree, portable_path))
        for node in tree.body:
            if not (isinstance(node, ast.Assign) and isinstance(node.value, ast.Lambda)): continue
            for target in node.targets:
                if not isinstance(target, ast.Name) or target.id.startswith('_'): continue
                source = str(path.relative_to(corpus)) + ':' + str(node.lineno)
                implementations.append({'id': source + ':' + target.id, 'name': target.id,
                    'owner': path.name.removesuffix('.tu.py'), 'kind': 'helper',
                    'signature': target.id + '(' + ast.unparse(node.value.args) + ')',
                    'source': 'oldtupicorpus/' + source, 'docstring': '',
                    'definition': ast.unparse(node), 'editorSupported': True})
    ids = {}
    for guide in guides:
        identifier = guide['id']
        if identifier in ids:
            raise ValueError(f"{guide['source']}: identificador de documentação duplicado {identifier!r}; primeira definição em {ids[identifier]}.")
        ids[identifier] = guide['source']
    for guide in guides:
        for related in guide.get('related', []):
            if related not in ids:
                raise ValueError(f"{guide['source']}: documentação {guide['id']!r} aponta para verbete ausente {related!r} em related.")
    return guides, implementations


def build(corpus):
    from authoring_runtime import namespace_for, realize
    from publication_regression import snapshot
    sources = snapshot(corpus)
    guides, implementations = source_docs(corpus.parent / 'nhe-enga')
    inventory = []
    references = {}
    for source, snapshot_source in sources.items():
        path = corpus / 'historic' / f'{source}.tu.py'
        entries = source_entries(path)
        metadata = authoritative_metadata(corpus, path)
        record_path = corpus / 'ground_truth/records/historic' / f'{source}.jsonl'
        saved = {row['ordinal']: row for line in record_path.read_text().splitlines() if line.strip() for row in [json.loads(line)]} if record_path.exists() else {}
        references[source] = saved
        for entry, row in zip(entries, snapshot_source.get('rows', [])):
            record = saved.get(entry['ordinal'], {})
            expected = record.get('target') or record.get('surface')
            matches = reference_matches(record, metadata.get(entry['ordinal'], {}), row)
            inventory.append({'sourceId': source, 'ordinal': entry['ordinal'], 'line': entry['line'],
                'raw': entry['expression'], 'surface': row.get('surface', ''), 'reference': expected,
                'status': 'verified' if matches else 'unavailable', 'error': row.get('error'),
                'features': features(entry['expression'])})
    lessons = []
    # Curriculum lives in this module's docstring, not a second hand-maintained JSON file.
    for specification in next(blocks(__doc__, '@studio-lessons')):
        lesson = {**specification, 'steps': [dict(step) for step in specification['steps']]}
        source, ordinal = lesson['sourceId'], lesson['ordinal']
        row = next((row for row in inventory if row['sourceId'] == source and row['ordinal'] == ordinal), None)
        lesson.update(available=False, reason='Exemplo sem referência aprovada correspondente.')
        if row:
            lesson.update(reference=row['reference'], sourceRaw=row['raw'], sourceLine=row['line'],
                recordId=references[source].get(ordinal, {}).get('id', ''),
                sourceHash=hashlib.sha256((corpus / 'historic' / f'{source}.tu.py').read_bytes()).hexdigest())
        if row and row['status'] == 'verified' and shape(row['raw']) == shape(lesson['steps'][-1]['raw']):
            lesson.update(available=True, reason='')
            for step in lesson['steps']:
                try:
                    namespace = namespace_for(corpus, corpus / 'historic' / f'{source}.tu.py', row['line'])
                    result = realize(step['raw'], namespace)
                    result.pop('structure', None)
                    step['evaluation'] = result
                    if result.get('evaluationStatus') == 'partial' and not step.get('partialExpected'):
                        raise ValueError('Etapa com avaliação parcial.')
                except Exception as error:
                    lesson.update(available=False, reason='Etapa não avaliável: ' + str(error))
        else:
            lesson['reason'] = 'A fonte, a análise ou a referência mudou. Esta lição precisa de revisão.'
        lessons.append(lesson)
    known = {guide['id'] for guide in guides}
    for lesson in lessons:
        if any(identifier not in known for identifier in lesson['guides']):
            raise ValueError('Lição aponta para documentação ausente: ' + lesson['id'])
    library = {'version': 1, 'lessons': lessons, 'guides': guides, 'implementations': implementations,
            'inventory': inventory, 'sources': sorted(sources),
            'verifiedCount': sum(row['status'] == 'verified' for row in inventory)}
    # Generated documentation must not embed the developer's absolute home path.
    def portable(value):
        if isinstance(value, str): return value.replace(str(corpus.parent) + '/', '')
        if isinstance(value, list): return [portable(item) for item in value]
        if isinstance(value, dict): return {key: portable(item) for key, item in value.items()}
        return value
    return portable(library)
