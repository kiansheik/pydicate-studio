"""Shared candidate/result contract for every proposal route.

Retrieval, composition, a trained ranker, an optional neural proposer and the
optional MCP agent all produce the same record and all pass the same validator.
A score orders candidates; it is not a calibrated probability.
"""
from __future__ import annotations

CANDIDATE_SCHEMA = 1
RESULT_SCHEMA = 1
AST_SCHEMA = 1

ROUTES = ('retrieval', 'composition', 'morphology', 'ranker', 'neural', 'agent')
COMPLETENESS = ('complete', 'partial', 'unknown')

REJECTIONS = {
    'SURFACE_MISMATCH': 'A forma realizada não coincide com a entrada normalizada.',
    'EVALUATION_INCOMPLETE': 'A expressão não foi avaliada por completo pelo motor.',
    'UNSUPPORTED_SYNTAX': 'A sintaxe não é editável pelo adaptador atual.',
    'UNRESOLVED_LEXEME': 'Uma referência lexical não existe neste contexto.',
    'ENGINE_ERROR': 'O motor recusou a expressão.',
    'BUDGET_EXHAUSTED': 'O limite de busca foi atingido antes de esgotar as combinações.',
}


def candidate(*, source, surface, normalized, route, family, bindings, spans=None,
              score=0.0, features=None, completeness='complete', annotated='',
              morphemes=None, provenance=None, editable=True, seconds=0.0):
    """One proposed analysis. `source` is Pydicate code, not a rendered string."""
    return {
        'schemaVersion': CANDIDATE_SCHEMA,
        'source': source,
        'surface': surface,
        'normalized': normalized,
        'route': route,
        'family': family,
        'bindings': dict(bindings or {}),
        'spans': list(spans or []),
        'score': round(float(score), 6),
        'scoreMeaning': 'Ordenação determinística ou aprendida; não é uma probabilidade calibrada.',
        'features': dict(features or {}),
        'completeness': completeness,
        'annotated': annotated,
        'morphemes': list(morphemes or []),
        'provenance': dict(provenance or {}),
        'editable': bool(editable),
        'seconds': round(float(seconds), 6),
    }


def result(*, input_profile, context, artifacts, candidates, rejections, timings,
           status, message='', configuration=None):
    """The full analysis answer, including why nothing qualified."""
    return {
        'schemaVersion': RESULT_SCHEMA,
        'astSchemaVersion': AST_SCHEMA,
        'input': input_profile,
        'context': context,
        'artifacts': artifacts,
        'candidates': candidates,
        'best': candidates[0] if candidates else None,
        'rejections': rejections,
        'timings': timings,
        'status': status,
        'message': message,
        'configuration': configuration or {},
        'coordinateSystem': 'normalized-input-codepoints',
        'alignmentNote': 'Os deslocamentos de morfema referem-se à anotação do motor. '
                         'Não há alinhamento medido entre morfemas e nós da árvore.',
    }
