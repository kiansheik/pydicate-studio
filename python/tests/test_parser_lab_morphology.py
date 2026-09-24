"""Real-engine regression coverage for dictionary roots and explicit hypotheses.

Only disposable laboratory artifacts are written. Corpus/engine sources and
editorial records remain untouched, and no provider is involved.
"""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from copy import copy
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser_lab import jobs
from parser_lab.artifacts import ArtifactStore
from parser_lab.datasets import load_profile
from parser_lab.engine import LabEngine
from parser_lab.morphology import expand, lexical_hints
from parser_lab.normalization import InputError, normalize
from parser_lab.search import Budget, analyze


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT',
                           str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
HAS_PROJECT = all(path.is_file() for path in (
    REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py',
    REAL / 'nhe-enga/docs/dict-conjugated.json.gz',
))


@unittest.skipUnless(HAS_PROJECT, 'selected corpus and Navarro dictionary not installed')
class DictionaryMorphologyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.engine = LabEngine(REAL)
        cls.store = ArtifactStore(cls.temporary.name)
        cls.profile = load_profile('smoke')
        cls.manifest = jobs.prepare(cls.engine, cls.store, cls.profile)
        cls.index = jobs.load_index(cls.store, cls.manifest['artifactId'])

    def search(self, text, *, hints=None, limits=None, **keywords):
        return analyze(
            self.engine, self.index, normalize(text),
            budget=Budget({'maxSeconds': 20.0, **(limits or {})}),
            lexical_hints=lexical_hints(self.engine, hints),
            include_retrieval=False, **keywords)

    def assert_whole_form(self, candidates, text):
        self.assertTrue(candidates, text)
        for candidate in candidates:
            self.assertEqual(normalize(candidate['surface']), normalize(text))
            realized = self.engine.realize(candidate['source'])
            self.assertEqual(realized['evaluationStatus'], 'complete')
            self.assertEqual(realized['annotated'], candidate['annotated'])
            self.assertTrue(candidate['editable'])

    @staticmethod
    def lexical_evidence(candidate, **expected):
        return [row for row in candidate['provenance'].get('lexicalEvidence', [])
                if all(row.get(key) == value for key, value in expected.items())]

    def test_preparing_smoke_indexes_dictionary_beyond_profile_and_reports_skips(self):
        counts = self.manifest['counts']
        self.assertGreater(counts['dictionaryEntries'], 1000)
        self.assertEqual(counts['dictionaryEntries'],
                         counts['dictionaryIndexedSenses'] + counts['dictionarySkippedSenses'])
        self.assertGreater(counts['lexicalEntries'], self.engine.context()['lexemeCount'])
        directory = self.store.directory(self.manifest['artifactId'])
        report = json.loads((directory / 'lexicon-report.json').read_text())
        self.assertIn('lexicon.jsonl', self.manifest['checksums'])
        self.assertIn('lexicon-report.json', self.manifest['checksums'])
        self.assertEqual(report['indexedSenses'], counts['dictionaryIndexedSenses'])
        self.assertTrue(report['datasetFingerprint'].startswith('sha256:'))
        declared = {name for members in self.profile['inventory'].values() for name in members}
        self.assertNotIn("ekate'yma", declared)
        self.assertFalse(any(getattr(value, 'verbete', None) == "ekate'yma"
                             for value in self.engine.namespace.values()))
        entry = next(row for row in self.index.lexical_rows
                     if row['origin'] == 'navarro' and row['headword'] == "ekate'yma"
                     and row['category'] == 'noun')
        self.assertIn("tekate'yma", entry['keys'])
        self.assertIn("ekate'ym", entry['keys'])
        self.assertIn('avareza', entry['definition'])

    def test_dictionary_only_tekateyma_is_complete_with_pluriform_engine_annotation(self):
        candidates, _rejections, _timings, diagnostics = self.search("tekate'yma")
        self.assert_whole_form(candidates, "tekate'yma")
        matching = [row for row in candidates
                    if self.lexical_evidence(row, origin='navarro', headword="ekate'yma")]
        self.assertTrue(matching)
        self.assertFalse(diagnostics['knownExpression'])
        for candidate in matching:
            self.assertEqual(candidate['completeness'], 'complete')
            self.assertEqual(candidate['provenance']['route'], 'morphology')
            self.assertEqual(candidate['annotated'],
                             "t[PLURIFORM_PREFIX:T:ABSOLUTE]ekate'ym[ROOT]"
                             'a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN]')
            self.assertTrue(candidate['morphemes'])
            self.assertIn('Noun(', candidate['source'])

    def test_generic_object_nominal_is_found_beyond_the_dictionary_noun(self):
        candidates, _rejections, _timings, diagnostics = analyze(
            self.engine, self.index, 'moropotara', budget=Budget(), include_retrieval=False)
        self.assert_whole_form(candidates, 'moropotara')
        direct = [row for row in candidates if row['source'].startswith('Noun(')
                  and self.lexical_evidence(row, origin='navarro', headword='poropotara')]
        decomposed = [row for row in candidates if '* moro' in row['source']
                      and '.base_nominal()' in row['source']]
        self.assertTrue(direct)
        self.assertTrue(decomposed)
        self.assertTrue(any(self.lexical_evidence(row, origin='shared', headword='potar')
                            for row in decomposed))
        self.assertTrue(any(self.lexical_evidence(row, origin='navarro', headword='potar')
                            for row in decomposed))
        self.assertTrue(all(self.lexical_evidence(row, headword='moro') for row in decomposed))
        self.assertFalse(diagnostics['truncated'])
        # var(1) alone does not nominalize this engine's object-bound verb.
        self.assertEqual(self.engine.surface('(potar * moro).var(1)'), 'poropotar')
        self.assertEqual(self.engine.surface('(potar * moro).var(1).base_nominal()'), 'moropotara')
        # Sharing this form does not license copying the dictionary noun's
        # pluriform paradigm into an independently constructed nominal base.
        shared = next(row for row in decomposed
                      if self.lexical_evidence(row, origin='shared', headword='potar'))
        self.assertEqual(self.engine.surface(f'ixé * ({shared["source"]})'), 'xe moropotara')
        self.assertEqual(self.engine.surface(f'ixé * ({direct[0]["source"]})'), 'xe poropotara')

    def test_reflexive_and_reciprocal_variants_are_checked_before_nominal_conversion(self):
        for observed, operator in (('nhepotara', 'nhe'), ('nhopotara', 'nho')):
            candidates, *_ = self.search(observed)
            self.assert_whole_form(candidates, observed)
            matching = [row for row in candidates if f'* {operator}' in row['source']
                        and '.var(1).base_nominal()' in row['source']]
            self.assertTrue(matching, observed)
            self.assertNotEqual(self.engine.surface(f'(potar * {operator}).base_nominal()'), observed)

    def test_noun_causative_can_be_reflexivized_then_nominalized(self):
        fragments, _diagnostics = expand(self.engine, self.index, normalize('nhemoabaré'),
                                         Budget({'maxSeconds': 20.0}))
        matching = [row for row in fragments
                    if row.get('decomposition', {}).get('source', row['source'])
                    == '((mo * (abare)) * nhe).var(1).base_nominal()']
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]['surface'], 'nhemoabaré')
        meanings = {item['headword']: item['definition'] for item in matching[0]['lexicalEvidence']}
        self.assertIn('abaré', meanings)
        self.assertIn('mo', meanings)
        self.assertIn('îe', meanings)
        self.assertTrue(all(meanings.values()))

    def test_composite_meanings_keep_homonyms_separate_and_do_not_cross_accent_collisions(self):
        root = next(row for row in self.index.lexical_rows if row['source'] == 'potar')
        noun = next(row for row in self.index.lexical_rows
                    if row['origin'] == 'navarro' and row['headword'] == 'poropotara')
        second = {**noun, 'id': 'test:second', 'senseId': 'test:second',
                  'definition': 'another meaning of this same surface'}
        accented = {**noun, 'id': 'test:accented', 'senseId': 'test:accented',
                    'surface': 'moropotára', 'definition': 'a meaning distinguished by its accent'}
        index = copy(self.index)
        index.lexical_rows = [root, noun, second, accented]
        fragments, _ = expand(self.engine, index, 'moropotara', Budget({'maxSeconds': 20}))
        linked = [row for row in fragments if row.get('decomposition')
                  and '* moro' in row['decomposition']['source']]
        self.assertTrue(linked)
        self.assertEqual({row['decomposition']['senseId'] for row in linked},
                         {noun['senseId'], second['senseId']})
        for row in linked:
            self.assertEqual(row['decomposition']['relation'], 'surface-linked')
            self.assertTrue(row['source'].startswith('studio_define('))
            self.assertEqual(self.engine.surface(row['source']), 'moropotara')
            whole = [item for item in row['lexicalEvidence'] if item.get('scope') == 'whole']
            self.assertEqual(len(whole), 1)
            self.assertEqual(whole[0]['senseId'], row['decomposition']['senseId'])
            components = [item for item in row['lexicalEvidence'] if item.get('scope') == 'component']
            self.assertEqual({item['headword'] for item in components}, {'potar', 'moro'})
            self.assertEqual(next(item['definition'] for item in components if item['headword'] == 'potar'),
                             root['definition'])
        direct = [row for row in fragments if row['source'] == noun['source']]
        self.assertEqual(len(direct), 1)
        self.assertNotIn('decomposition', direct[0])

    def test_composite_wrapper_validation_spends_the_morphology_budget(self):
        root = next(row for row in self.index.lexical_rows if row['source'] == 'potar')
        noun = next(row for row in self.index.lexical_rows
                    if row['origin'] == 'navarro' and row['headword'] == 'poropotara')
        # Only potar is selected as a root, while both dictionary senses remain
        # available for the exact whole-surface meaning lookup.
        noun = {**noun, 'keys': ['not-a-root-in-this-query']}
        second = {**noun, 'id': 'test:second', 'senseId': 'test:second',
                  'definition': 'another meaning'}
        index = copy(self.index)
        index.lexical_rows = [root, noun, second]
        budget = Budget({'maxSeconds': 20, 'maxMorphologyAssemblies': 3})
        fragments, _ = expand(self.engine, index, 'moropotara', budget)
        self.assertEqual(budget.assemblies, 3)
        self.assertEqual(len([row for row in fragments if row.get('decomposition')]), 1)
        self.assertIn('MORPHOLOGY_ASSEMBLIES', budget.truncated)

    def test_registered_hypothetical_root_remains_partial_in_other_forms(self):
        from authoring_runtime import studio_define
        from lexical_metadata import HYPOTHETICAL_TAG
        from parser_lab.lexicon import _shared_rows
        noun = studio_define(self.engine.namespace['Noun'](
            'ekat', definition='(t)', tag='[NOUN]' + HYPOTHETICAL_TAG), '')
        with patch.dict(self.engine.namespace, {'ekat_hipotese': noun}):
            lexical = next(row for row in _shared_rows(self.engine)
                           if row['source'] == 'ekat_hipotese')
            self.assertEqual(lexical['lexicalStatus'], 'hypothetical')
            self.assertEqual(lexical['definition'], '')
            index = copy(self.index)
            index.lexical_rows = [*self.index.lexical_rows, lexical]
            for observed in ("tekate'yma", 'xe rekata'):
                candidates, *_ = analyze(self.engine, index, normalize(observed),
                                         budget=Budget({'maxSeconds': 20}), include_retrieval=False)
                self.assert_whole_form(candidates, observed)
                matching = [candidate for candidate in candidates
                            if self.lexical_evidence(candidate, headword='ekat',
                                                     lexicalStatus='hypothetical')]
                self.assertTrue(matching, observed)
                self.assertTrue(all(row['completeness'] == 'partial' for row in matching))
                self.assertTrue(all(row['provenance']['lexicalStatus'] == 'provisional'
                                    for row in matching))

    def test_retrieval_does_not_turn_an_unattested_stative_into_a_complete_analysis(self):
        from lexical_metadata import HYPOTHETICAL_TAG
        verb = self.engine.namespace['Verb'](
            'ekat', verb_class='(t) adj.', definition='', tag='[VERB]' + HYPOTHETICAL_TAG)
        with patch.dict(self.engine.namespace, {'ekat_estativo_hipotese': verb}):
            source = '+ixé * ekat_estativo_hipotese'
            observed = normalize(self.engine.surface(source))
            self.assertNotIn('LEXICAL_STATUS', self.engine.realize(source)['annotated'])
            index = copy(self.index)
            index.retrieval = {observed: [{'source': source, 'role': 'expression'}]}
            candidates, *_ = analyze(self.engine, index, observed, include_composition=False)
            self.assertEqual(len(candidates), 1)
            self.assertEqual(candidates[0]['route'], 'retrieval')
            self.assertEqual(candidates[0]['completeness'], 'partial')
            self.assertEqual(candidates[0]['provenance']['lexicalStatus'], 'provisional')

    def test_dictionary_noun_supports_derived_possessed_and_locative_forms(self):
        examples = {
            "tekate'yme'yma": 'NEGATION_SUFFIX',
            "xe rekate'yma": 'POSSESSIVE_PRONOUN:1ps',
            "sekate'yma": 'PLURIFORM_PREFIX:S',
            "tekate'ỹme": 'POSTPOSITION:LOCATIVE',
        }
        for observed, tag in examples.items():
            with self.subTest(observed=observed):
                candidates, _rejections, _timings, _diagnostics = self.search(observed)
                self.assert_whole_form(candidates, observed)
                matching = [row for row in candidates
                            if self.lexical_evidence(row, origin='navarro', headword="ekate'yma")]
                self.assertTrue(matching, observed)
                self.assertTrue(any(tag in row['annotated'] for row in matching))

    def test_opaque_imperative_roots_are_found_without_headword_substring(self):
        for observed, symbol, root in [('ekûãî', 'só', 'kûãî'), ('eîori', 'ur', 'îori')]:
            with self.subTest(observed=observed):
                headword = self.engine.namespace[symbol].verbete
                self.assertNotIn(normalize(headword), normalize(observed))
                candidates, _rejections, _timings, _diagnostics = self.search(observed)
                self.assert_whole_form(candidates, observed)
                matching = [row for row in candidates
                            if self.lexical_evidence(row, headword=headword)
                            and 'IMPERATIVE_PREFIX:2ps' in row['annotated']]
                self.assertTrue(matching, observed)
                self.assertTrue(any(root + '[ROOT]' in row['annotated'] for row in matching))

    def test_homonymous_dictionary_senses_survive_identical_morphology(self):
        candidates, _rejections, _timings, _diagnostics = self.search("'ekatuaba")
        matching = [row for row in candidates
                    if self.lexical_evidence(row, origin='navarro', headword="'ekatuaba")]
        self.assertGreaterEqual(len(matching), 2)
        by_annotation = {}
        for candidate in matching:
            for sense in self.lexical_evidence(candidate, origin='navarro', headword="'ekatuaba"):
                by_annotation.setdefault(candidate['annotated'], {})[sense['senseId']] = sense['definition']
        ambiguous = [senses for senses in by_annotation.values() if len(senses) >= 2]
        self.assertTrue(ambiguous, 'equal morpheme tags must not merge distinct dictionary meanings')
        self.assertTrue(any(len(set(senses.values())) >= 2 for senses in ambiguous))

    def test_explicit_proper_name_combines_with_a_known_verb_and_locative(self):
        hints = [{'root': 'Araci', 'category': 'proper_noun'}]
        for observed in ('Araci osó', 'osó Araci', 'Aracipe'):
            with self.subTest(observed=observed):
                candidates, _rejections, _timings, _diagnostics = self.search(observed, hints=hints)
                self.assert_whole_form(candidates, observed)
                matching = [row for row in candidates
                            if self.lexical_evidence(row, origin='user-hypothesis', headword='Araci')]
                self.assertTrue(matching)
                for candidate in matching:
                    self.assertEqual(candidate['completeness'], 'partial')
                    self.assertEqual(candidate['provenance']['lexicalStatus'], 'provisional')
                    self.assertIn('[PROPER_NOUN]', candidate['annotated'])
                    self.assertEqual(self.lexical_evidence(candidate, origin='user-hypothesis')[0]['definition'], '')

    def test_unknown_verb_hint_recovers_syntax_without_inventing_a_definition(self):
        hints = [{'root': 'piripok', 'category': 'intransitive_verb'}]
        rows = lexical_hints(self.engine, hints)
        self.assertEqual(rows[0]['definition'], '')
        self.assertNotIn('senseId', rows[0])
        from authoring_runtime import interpret
        from studio_authoring import parse_ast
        value = interpret(parse_ast(rows[0]['source']), self.engine.namespace, {})
        self.assertEqual(value.definition, '')
        self.assertEqual(value.raw_definition, '')
        candidates, _rejections, _timings, diagnostics = analyze(
            self.engine, self.index, 'apiripok',
            budget=Budget({'maxSeconds': 20.0}), lexical_hints=rows, include_retrieval=False)
        self.assert_whole_form(candidates, 'apiripok')
        matching = [row for row in candidates
                    if self.lexical_evidence(row, origin='user-hypothesis', headword='piripok')]
        self.assertTrue(matching)
        for candidate in matching:
            self.assertEqual(candidate['completeness'], 'partial')
            self.assertEqual(candidate['annotated'], 'a[SUBJECT_PREFIX:1ps]piripok[ROOT]')
            self.assertEqual(candidate['provenance']['lexicalStatus'], 'provisional')
        self.assertEqual(diagnostics['provisionalRoots'][0]['definition'], '')

    def test_arbitrary_unknown_text_has_no_automatic_literal_parse(self):
        candidates, _rejections, _timings, diagnostics = self.search('zzzz')
        self.assertEqual(candidates, [])
        self.assertEqual(diagnostics['provisionalRoots'], [])
        self.assertEqual(diagnostics['lexicalRootsMatched'], 0)

    def test_hint_validation_does_not_reclassify_known_verbs_or_accept_code(self):
        invalid = [
            [{'root': 'só', 'category': 'transitive_verb'}],
            [{'root': "ekate'yma", 'category': 'noun'}],
            [{'root': "__import__('os')", 'category': 'proper_noun'}],
            [{'root': 'Araci', 'category': 'unrecognized'}],
            [{'root': '', 'category': 'noun'}],
            [{'root': 'Araci', 'category': 'proper_noun'}] * 9,
        ]
        for hints in invalid:
            with self.subTest(hints=hints):
                with self.assertRaises(InputError):
                    lexical_hints(self.engine, hints)

    def test_root_limit_reports_that_not_every_lexical_reading_was_searched(self):
        _candidates, _rejections, _timings, diagnostics = self.search(
            "'ekatuaba", limits={'maxLexicalRoots': 1})
        self.assertGreater(diagnostics['lexicalRootsMatched'], 1)
        self.assertEqual(diagnostics['lexicalRootsSearched'], 1)
        self.assertTrue(diagnostics['truncated'])
        self.assertIn('LEXICAL_ROOTS', diagnostics['truncationReasons'])

    def test_candidate_limit_preserves_the_total_and_reports_truncation(self):
        candidates, _rejections, _timings, diagnostics = self.search(
            "'ekatuaba", limits={'maxCandidates': 1})
        self.assertEqual(len(candidates), 1)
        self.assertGreater(diagnostics['candidateTotal'], 1)
        self.assertTrue(diagnostics['truncated'])

    def test_span_limit_reports_hidden_dictionary_senses(self):
        _candidates, _rejections, _timings, diagnostics = self.search(
            "'ekatuaba", limits={'maxSpanCandidates': 1})
        self.assertTrue(diagnostics['truncated'],
                        'pruned same-form senses must not be reported as an exhaustive search')

    def test_morphology_limit_also_bounds_initial_bare_root_realizations(self):
        budget = Budget({'maxSeconds': 20.0, 'maxMorphologyAssemblies': 1})
        _fragments, _diagnostics = expand(self.engine, self.index, normalize("'ekatuaba"), budget)
        self.assertLessEqual(budget.assemblies, 1)
        self.assertIn('MORPHOLOGY_ASSEMBLIES', budget.truncated)

    def test_total_search_limit_stops_and_reports_exhaustion(self):
        candidates, _rejections, _timings, diagnostics = self.search(
            "tekate'yma", limits={'maxAssemblies': 1})
        self.assertEqual(candidates, [])
        self.assertEqual(diagnostics['budgetExhausted'], 'ASSEMBLIES')
        self.assertTrue(diagnostics['truncated'])


if __name__ == '__main__':
    unittest.main()
