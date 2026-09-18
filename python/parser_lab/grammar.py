"""Declared construction families for bounded inverse search.

Each family is a *typed* template over lexical slots. The engine realizes every
instance; nothing here predicts a form. Composition of two phrases is a
candidate generator only — the assembled expression is always re-rendered and
compared to the whole normalized input before it can be called complete.

Adding a family means adding it here with its verified example and a test.
Concatenating fragment surfaces does not model all morphology: allomorphy and
sandhi can depend on the parent expression, which is exactly why acceptance is
decided by rendering the assembled expression, not by the fragment keys.
"""
from __future__ import annotations

GRAMMAR_VERSION = 1

# Lexical categories a slot can draw from. The actual members come from the
# selected profile, so a held-out lexeme experiment only changes configuration.
CATEGORIES = ('pronoun', 'verb', 'noun', 'postposition')

FAMILIES = {
    'verb_clause': {
        'id': 'verb_clause', 'type': 'clause', 'label': 'Oração finita',
        'template': '(+{subject} * {verb})',
        'slots': (('subject', 'pronoun'), ('verb', 'verb')),
        'example': {'subject': 'ixé', 'verb': 'só'},
    },
    'negated_clause': {
        'id': 'negated_clause', 'type': 'clause', 'label': 'Oração finita negada',
        'template': '-(+{subject} * {verb})',
        'slots': (('subject', 'pronoun'), ('verb', 'verb')),
        'example': {'subject': 'ixé', 'verb': 'só'},
    },
    'possessive_np': {
        'id': 'possessive_np', 'type': 'np', 'label': 'Sintagma possessivo',
        'template': '({possessor} * {noun})',
        'slots': (('possessor', 'pronoun'), ('noun', 'noun')),
        'example': {'possessor': 'ixé', 'noun': 'oka'},
    },
    'bare_pp': {
        'id': 'bare_pp', 'type': 'pp', 'label': 'Sintagma posposicional simples',
        'template': '({postposition} * {noun})',
        'slots': (('postposition', 'postposition'), ('noun', 'noun')),
        'example': {'postposition': 'pe', 'noun': 'oka'},
    },
    'possessive_pp': {
        'id': 'possessive_pp', 'type': 'pp', 'label': 'Sintagma posposicional possessivo',
        'template': '({postposition} * ({possessor} * {noun}))',
        'slots': (('postposition', 'postposition'), ('possessor', 'pronoun'), ('noun', 'noun')),
        'example': {'postposition': 'pe', 'possessor': 'ixé', 'noun': 'oka'},
    },
}

# A root rule assembles phrase types into a whole utterance. `orders` records
# that the engine may realize the parts in either surface order; the renderer
# decides, the search only proposes.
ROOT_RULES = {
    'clause': {'id': 'clause', 'parts': ('clause',), 'template': '{0}',
               'label': 'Oração isolada'},
    'np': {'id': 'np', 'parts': ('np',), 'template': '{0}', 'label': 'Sintagma nominal isolado'},
    'pp': {'id': 'pp', 'parts': ('pp',), 'template': '{0}', 'label': 'Sintagma posposicional isolado'},
    'clause_pp': {'id': 'clause_pp', 'parts': ('clause', 'pp'), 'template': '{0} + {1}',
                  'label': 'Oração com sintagma posposicional'},
}


def family_ids():
    return tuple(FAMILIES)


def root_rule_ids():
    return tuple(ROOT_RULES)


def instantiate(family, bindings):
    """Render the Pydicate source for one lexical instance of a family."""
    definition = FAMILIES[family] if isinstance(family, str) else family
    missing = [name for name, _ in definition['slots'] if name not in bindings]
    if missing:
        raise KeyError('Ligação lexical ausente: ' + ', '.join(missing))
    return definition['template'].format(**bindings)


def assemble(rule, parts):
    """Combine already-valid phrase sources under a root rule."""
    definition = ROOT_RULES[rule] if isinstance(rule, str) else rule
    if len(parts) != len(definition['parts']):
        raise ValueError('Número de constituintes diferente da regra.')
    return definition['template'].format(*parts)


def slot_combinations(family, inventory, limit=None):
    """Ordered lexical combinations for a family, bounded and deterministic.

    A bound samples with an even stride rather than keeping a prefix, so a small
    limit still covers the declared inventory instead of repeating whichever
    lexemes happen to come first.
    """
    definition = FAMILIES[family]
    rows = [{}]
    for name, category in definition['slots']:
        members = inventory.get(category, ())
        rows = [{**row, name: member} for row in rows for member in members]
        if limit is not None and len(rows) > limit:
            stride = len(rows) / limit
            rows = [rows[int(index * stride)] for index in range(limit)]
    return rows


def family_types():
    return {key: value['type'] for key, value in FAMILIES.items()}
