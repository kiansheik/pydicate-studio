"""Navarro-style discovery ranking, never lexical identity or engine equality.

Exact saved names win. Whole headwords (including accent-free spellings) precede
whole-word meanings, prefixes, substrings and recognized parts of longer input.
Omitted glottal stops are a search fallback; distinct entries remain distinct.
"""
from dataclasses import dataclass
import re
import unicodedata

APOSTROPHES = str.maketrans({'’': "'", 'ʼ': "'", '‘': "'", 'ʔ': "'"})
PUNCTUATION = str.maketrans('', '', '.,/#!$%?^&*;:{}=-_`~()')


def text(value):
    return ' '.join(unicodedata.normalize('NFC', str(value or '')).casefold().translate(APOSTROPHES).split())


def spellings(value):
    exact = text(value)
    folded = ''.join(char for char in unicodedata.normalize('NFD', exact) if not unicodedata.combining(char))
    return exact, folded, folded.replace("'", '')


def word(value):
    return ''.join(value.translate(PUNCTUATION).split())


@dataclass(frozen=True)
class Match:
    rank: tuple
    label: str
    field: str
    spelling: int = 0


class Document:
    def __init__(self, *, name='', forms=(), definition=''):
        self.name = text(name)
        self.forms = [(field, tuple(word(form) for form in spellings(value)))
                      for field, value in forms if value]
        self.definition = spellings(definition)


class Query:
    def __init__(self, value):
        self.spellings = spellings(value)
        self.words = tuple(word(value) for value in self.spellings)
        self.tokens = [re.compile(r'(?<!\w)' + re.escape(value) + r'(?!\w)') if value else None
                       for value in self.spellings]
        self.empty = not self.words[0]

    def match(self, document, *, segments=False, field=None):
        if self.empty:
            return None
        if document.name and document.name == self.spellings[0]:
            return Match((-1, 0, 0), 'name', 'name')
        matches = []
        for form_field, forms in document.forms:
            if field and form_field != field:
                continue
            for spelling, (needle, candidate) in enumerate(zip(self.words, forms)):
                if not needle or not candidate:
                    continue
                kind = ('exact' if candidate == needle else 'prefix' if candidate.startswith(needle)
                        else 'contains' if needle in candidate else
                        'segment' if segments and len(candidate) >= 3 and candidate in needle else None)
                if kind is None:
                    continue
                tier = {'exact': 0, 'prefix': 2, 'contains': 3, 'segment': 4}[kind]
                label = 'segment' if kind == 'segment' else 'relaxed' if spelling else 'name' if form_field == 'name' else kind
                matches.append(Match((tier, spelling, -len(candidate) if kind == 'segment' else 0), label, form_field, spelling))
        for spelling, (needle, definition) in enumerate(zip(self.spellings, document.definition)):
            if not needle or field and field != 'definition':
                continue
            whole = self.tokens[spelling].search(definition)
            position = whole.start() if whole else definition.find(needle)
            if position >= 0:
                matches.append(Match((1 if whole else 5, spelling, position),
                                     'relaxed' if spelling else 'definition', 'definition', spelling))
        return min(matches, key=lambda match: match.rank) if matches else None
