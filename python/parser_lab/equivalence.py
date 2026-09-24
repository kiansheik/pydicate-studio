"""When are two validated analyses the same answer, and when are they a choice?

Every candidate the search returns already realizes the whole observation, so
"same surface" separates nothing. Two finer notions are used instead, and both
come from the selected engine rather than from a judgement of our own:

* **Annotation-identical** — the engine emits byte-identical annotated output.
  The grammar makes the same morphological claim about every surface unit, so
  the two sources are one answer written two ways.
  `(+nde * ikó)` and `ikó * +endé` are annotation-identical.

* **Co-generating** — both realize the observation but annotate differently.
  The surface genuinely does not decide between them. `(pe * apé)` and
  `(pe * (ae * apé))` differ only by `PLURIFORM_PREFIX:S:ABSOLUTE` versus
  `PLURIFORM_PREFIX:S`: unpossessed versus third-person possessed.

Co-generating candidates are treated as *presumed mutually acceptable*: never
scored as an error against each other, and never used as a training contrast.
Only a reader can decide which reading a passage intends, so only a contributor
judgment separates them — by rejecting one, or by choosing another while this one
was on screen. A passed-over reading is still a possible reading; it just was not
the one preferred. `annotation_difference` reports exactly where two readings
disagree so that decision is an informed one.
"""
from __future__ import annotations

import re
import ast

EQUIVALENCE_VERSION = 3
UNIT = re.compile(r'([^\[\]]*)((?:\[[^\[\]]*\])+)|([^\[\]]+)')


def units(annotated):
    """Engine surface units with their tag bundles, in emission order."""
    rows = []
    # A finite scanner also retains zero-surface tags and unannotated text.
    # Some selected engines loop forever on a leading/orphan tag. No grammar
    # is inferred here: the exact emitted text remains the evidence.
    for surface, tags, bare in UNIT.findall(annotated or ''):
        surface = (surface or bare).strip()
        parsed = tuple(re.findall(r'\[([^\[\]]*)\]', tags))
        if surface or parsed:
            rows.append((surface, parsed or ('BARE',)))
    return rows


def annotation_signature(annotated):
    """Identity of the morphological claim, independent of source spelling."""
    return tuple(units(annotated))


def annotation_identical(left, right):
    return annotation_signature(left) == annotation_signature(right)


def annotation_difference(left, right):
    """Where two annotations disagree, unit by unit.

    Returns rows a contributor can read: the surface unit, and the tags each
    analysis assigns to it. Positions present in only one analysis are reported
    with `None` on the missing side.
    """
    first, second = units(left), units(right)
    rows = []
    for index in range(max(len(first), len(second))):
        a = first[index] if index < len(first) else None
        b = second[index] if index < len(second) else None
        if a == b:
            continue
        rows.append({
            'position': index,
            'surface': (a or b)[0],
            'left': list(a[1]) if a else None,
            'right': list(b[1]) if b else None,
            'onlyTags': bool(a and b and a[0] == b[0]),
        })
    return rows


def classify(left, right):
    """`identical` when the grammar says the same thing, else `co-generating`."""
    return 'annotation-identical' if annotation_identical(left, right) else 'co-generating'


def definition_structure(source):
    """Keep semantic scope and derivations that nominal annotations flatten.

    Variants producing identical annotations may share one displayed reading,
    but a nominalized tree or a scoped meaning cannot collapse into an opaque
    lexical atom. Ordinary finite-clause spelling equivalence stays unchanged.
    """
    try:
        tree = ast.parse(source, mode='eval')
    except (SyntaxError, TypeError):
        return None
    if not any(isinstance(node, ast.Call) and (
            isinstance(node.func, ast.Name) and node.func.id == 'studio_define'
            or isinstance(node.func, ast.Attribute) and node.func.attr == 'base_nominal')
            for node in ast.walk(tree)):
        return None

    class NeutralVariants(ast.NodeTransformer):
        def visit_Call(self, node):
            node = self.generic_visit(node)
            if (isinstance(node.func, ast.Attribute) and node.func.attr == 'var'
                    and len(node.args) == 1 and not node.keywords
                    and isinstance(node.args[0], ast.Constant) and type(node.args[0].value) is int):
                return node.func.value
            return node

    return ast.dump(NeutralVariants().visit(tree), include_attributes=False)


def group(candidates):
    """Collapse annotation-identical candidates; keep co-generating ones apart.

    The first candidate of a group is kept and the others are recorded as
    equivalent spellings of the same answer.
    """
    groups = []
    seen = {}
    for candidate in candidates:
        # Morpheme tags cannot distinguish homonymous dictionary meanings.
        # Preserve exact sense identities even when their morphology is equal.
        lexical = candidate.get('provenance', {}).get('lexicalEvidence', [])
        senses = tuple(sorted((row.get('origin', ''), row.get('senseId', ''),
                               row.get('headword', ''), row.get('definition', ''),
                               row.get('category', ''), row.get('scope', '')) for row in lexical
                              if row.get('origin') != 'shared'))
        headwords = [row[2] for row in senses]
        # A bag of senses loses their locations when one homograph occurs
        # twice. Conservatively retain each structure in that case: A then B
        # must not collapse into B then A just because their tags agree.
        occurrence_guard = candidate['source'] if len(set(headwords)) < len(headwords) else None
        status = candidate.get('provenance', {}).get('lexicalStatus', 'resolved')
        key = (annotation_signature(candidate.get('annotated', '')), senses, occurrence_guard,
               status, definition_structure(candidate['source']))
        if key in seen:
            head = seen[key]
            spellings = head['provenance'].setdefault('annotationIdenticalSources', [])
            if candidate['source'] not in spellings and candidate['source'] != head['source']:
                spellings.append(candidate['source'])
            continue
        seen[key] = candidate
        groups.append(candidate)
    return groups


class AcceptanceSet:
    """What counts as a correct answer for one observation.

    Without a judgment, every co-generating analysis is presumed acceptable: the
    search found several readings the surface cannot separate, and preferring one
    is a reading decision, not a correctness fact. A contributor judgment
    overrides that presumption — a rejection removes an analysis, an acceptance
    or a correction confirms one, and the readings that were on screen when the
    choice was made become preferred-against without being called wrong.
    """

    def __init__(self, observed, *, accepted=(), rejected=(), passed_over=()):
        self.observed = observed
        self.accepted = {item for item in accepted if item}
        self.rejected = {item for item in rejected if item}
        # Readings that were on screen when another was chosen. Not wrong — the
        # reader simply preferred a different one, which is a weaker signal than
        # a rejection but a real preference all the same.
        self.passed_over = {item for item in passed_over if item} - self.accepted - self.rejected

    def verdict(self, source):
        if source in self.rejected:
            return 'rejected'
        if source in self.accepted:
            return 'confirmed'
        if source in self.passed_over:
            return 'not-preferred'
        return 'presumed'

    def acceptable(self, source):
        """A reading that was merely passed over is still a possible reading."""
        return self.verdict(source) != 'rejected'

    def decided(self):
        """True once a human has separated the readings for this observation."""
        return bool(self.accepted or self.rejected or self.passed_over)

    def contrastable(self, preferred, other):
        """May this pair be used as a training contrast?

        Only when a reader separated them: by rejecting one, or by choosing
        another while this one was on screen. Two readings nobody has compared
        are ambiguity, and training on them teaches an arbitrary preference
        while reporting it as accuracy.
        """
        if preferred == other or preferred in self.rejected:
            return False
        if other in self.rejected:
            return preferred in self.accepted or preferred in self.passed_over
        return bool(preferred in self.accepted and other in self.passed_over)

    def describe(self):
        return {'observed': self.observed, 'accepted': sorted(self.accepted),
                'rejected': sorted(self.rejected), 'passedOver': sorted(self.passed_over),
                'decided': self.decided(),
                'note': 'Sem julgamento humano, leituras co-geradoras são todas aceitáveis. '
                        'Escolher uma entre as exibidas é uma preferência real sobre as '
                        'outras; não escolhida não quer dizer agramatical.'}


def acceptance_from_judgments(observed, judgments):
    """Build the acceptance set for one observation from recorded judgments."""
    accepted, rejected, passed_over = set(), set(), set()
    for row in judgments:
        if row.get('normalized') != observed:
            continue
        verdict = row.get('verdict')
        candidate = row.get('candidateSource') or ''
        corrected = row.get('correctedSource') or ''
        shown = [item for item in (row.get('shownSources') or ()) if item]
        chosen = corrected if verdict == 'corrected' and corrected else candidate
        if verdict == 'accepted' and candidate:
            accepted.add(candidate)
            rejected.discard(candidate)
        elif verdict == 'rejected' and candidate:
            rejected.add(candidate)
            accepted.discard(candidate)
        elif verdict == 'corrected' and corrected:
            accepted.add(corrected)
            rejected.discard(corrected)
            if candidate and candidate != corrected:
                rejected.add(candidate)
                accepted.discard(candidate)
        # Choosing one of several readings on screen prefers it over the rest.
        if verdict in ('accepted', 'corrected') and chosen:
            passed_over.update(item for item in shown if item != chosen)
    return AcceptanceSet(observed, accepted=accepted, rejected=rejected,
                         passed_over=passed_over)
