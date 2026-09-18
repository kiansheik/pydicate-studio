"""Laboratory contract: normalization, projection, bounded search and artifacts.

Engine-backed cases run against the selected local project and are skipped when
it is not installed. No test writes into the corpus, publishes source, approves
a reference or calls a provider.
"""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
STUDIO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(STUDIO))

from parser_lab import grammar
from parser_lab.artifacts import ArtifactStore, write_jsonl
from parser_lab.datasets import assign_splits, load_profile, split_of
from parser_lab.equivalence import (AcceptanceSet, acceptance_from_judgments,
                                    annotation_difference, annotation_identical, classify, group)
from parser_lab.feedback import (AttemptLog, confirmed_examples, coverage_gaps,
                                 preference_pairs, summary)
from parser_lab.index import LabIndex
from parser_lab.judgments import JudgmentLog
from parser_lab.normalization import InputError, PROFILE, normalize, prepare
from parser_lab.projection import lexemes, project, round_trips, serialize, size
from parser_lab.ranker import Ranker, fit, symbols_of

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT',
                           str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
HAS_PROJECT = (REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists()
FIXTURES = json.loads((STUDIO / 'src/domain/parser-lab-fixtures.json').read_text(encoding='utf-8'))


class NormalizationTests(unittest.TestCase):
    def test_committed_fixtures_are_the_shared_contract_with_the_renderer(self):
        for row in FIXTURES:
            self.assertEqual(normalize(row['input']), row['normalized'], row['input'])

    def test_spacing_case_and_accents_collapse_but_historical_spelling_does_not(self):
        for value in ('Asó xe rokype', 'ASOXEROKYPE', 'a so xé ró kŷ pe', 'Asó, xe rokype.'):
            self.assertEqual(normalize(value), 'asoxerokype')
        # ç → c and î → i still leave a different key: no silent conversion.
        self.assertEqual(normalize('Açó xe rokîpe'), 'acoxerokipe')
        self.assertNotEqual(normalize('Açó xe rokîpe'), normalize('Asó xe rokype'))

    def test_apostrophes_are_preserved_and_editorial_punctuation_is_not(self):
        self.assertEqual(normalize('mombe’u'), "mombe'u")
        self.assertEqual(normalize('ybaka pupé!'), 'ybakapupe')
        self.assertEqual(normalize('Tupã — oré îar'), 'tupaoreiar')

    def test_real_dictionary_accent_collisions_share_one_key(self):
        self.assertEqual(normalize('agûaí'), normalize('agûãî'))
        self.assertEqual(normalize('ãgûa'), normalize('agûá'))
        self.assertEqual({normalize('agûaí'), normalize('ãgûa')}, {'aguai', 'agua'})

    def test_blank_and_oversized_input_is_rejected_with_a_contributor_message(self):
        for value in ('', '   ', '...', None):
            with self.assertRaises((InputError, TypeError)):
                prepare(value)
        with self.assertRaises(InputError):
            prepare('a' * 500)

    def test_prepared_input_reports_the_profile_and_removed_punctuation(self):
        prepared = prepare('Asó, xe rokype.')
        self.assertEqual(prepared['profile'], PROFILE)
        self.assertEqual(prepared['normalized'], 'asoxerokype')
        self.assertEqual(prepared['removedPunctuation'], [',', '.'])
        self.assertEqual(prepared['raw'], 'Asó, xe rokype.')


class ProjectionTests(unittest.TestCase):
    CASES = ('(+ixé * só) + (pe * (ixé * oka))', '-(+ixé * só)', '(+nde * só).imp()',
             '(mombeu * nhe).var(1).base_nominal()', '(pe * oka)')

    def test_projection_round_trips_through_the_existing_parser(self):
        for raw in self.CASES:
            self.assertTrue(round_trips(raw), raw)

    def test_projection_drops_positions_but_keeps_grouping_and_omission(self):
        grouped = project('(+ixé * só) + (pe * (ixé * oka))')
        flat = project('((+ixé * só) + pe) * (ixé * oka)')
        self.assertNotEqual(grouped, flat)
        self.assertNotEqual(project('(+ixé * só)'), project('(ixé * só)'))
        self.assertNotEqual(project('(+ixé * só)'), project('-(+ixé * só)'))
        self.assertNotIn('start', json.dumps(grouped))

    def test_spelling_differences_alone_do_not_create_a_second_analysis(self):
        self.assertEqual(project('+ae * ikó'), project('(+ae * ikó)'))
        self.assertEqual(project('nde * era'), project('( nde  *  era )'))

    def test_lexemes_and_size_describe_the_projected_tree(self):
        tree = project('(+ixé * só) + (pe * (ixé * oka))')
        self.assertEqual(lexemes(tree), ['ixé', 'só', 'pe', 'ixé', 'oka'])
        self.assertEqual(size(tree), 10)
        self.assertEqual(serialize(tree), '(((+ixé) * só) + (pe * (ixé * oka)))')


class GrammarTests(unittest.TestCase):
    def test_families_declare_a_type_a_template_and_a_verified_example(self):
        for name, family in grammar.FAMILIES.items():
            self.assertEqual(family['id'], name)
            self.assertIn(family['type'], {'clause', 'np', 'pp'})
            source = grammar.instantiate(name, family['example'])
            self.assertTrue(source.strip())
            self.assertEqual(project(source), project(source))

    def test_root_rules_only_combine_declared_phrase_types(self):
        types = set(grammar.family_types().values())
        for rule in grammar.ROOT_RULES.values():
            for part in rule['parts']:
                self.assertIn(part, types)
        self.assertEqual(grammar.assemble('clause_pp', ['A', 'B']), 'A + B')

    def test_missing_lexical_binding_is_an_error_not_a_guess(self):
        with self.assertRaises(KeyError):
            grammar.instantiate('verb_clause', {'subject': 'ixé'})


class ProfileTests(unittest.TestCase):
    def test_every_committed_profile_declares_known_families_and_rules(self):
        for name in ('smoke', 'baseline', 'large'):
            profile = load_profile(name)
            self.assertEqual(profile['profile'], name)
            for family in profile['families']:
                self.assertIn(family, grammar.FAMILIES)
            for rule in profile['rootRules']:
                self.assertIn(rule, grammar.ROOT_RULES)
            self.assertTrue(profile['inventory']['pronoun'])

    def test_unknown_profile_names_the_available_recipes(self):
        with self.assertRaises(Exception) as caught:
            load_profile('nao-existe')
        self.assertIn('baseline', str(caught.exception))


class SplitTests(unittest.TestCase):
    def rows(self):
        return [
            {'normalized': 'aaa', 'lexemes': ['ixé'], 'families': ['verb_clause']},
            {'normalized': 'aaa', 'lexemes': ['nde'], 'families': ['possessive_np']},
            {'normalized': 'bbb', 'lexemes': ['taba'], 'families': ['verb_clause']},
            {'normalized': 'ccc', 'lexemes': ['oka'], 'families': ['negated_clause']},
            {'normalized': 'ddd', 'lexemes': ['oka'], 'families': ['verb_clause']},
        ]

    def test_normalization_collisions_never_straddle_two_splits(self):
        splits = assign_splits(self.rows(), {'seed': 7, 'holdout': {}, 'split': {'train': 0.5, 'dev': 0.25}})
        first, second = self.rows()[0], self.rows()[1]
        self.assertEqual(split_of(splits, first), split_of(splits, second))

    def test_held_out_lexemes_and_families_get_their_own_suites(self):
        splits = assign_splits(self.rows(), {'seed': 7, 'holdout': {'lexemes': ['taba'],
                                                                   'families': ['negated_clause']}})
        self.assertEqual(split_of(splits, self.rows()[2]), 'held_out_lexemes')
        self.assertEqual(split_of(splits, self.rows()[3]), 'held_out_families')
        self.assertNotIn('held_out_lexemes', {split_of(splits, row) for row in self.rows()[:2]})

    def test_the_policy_is_recorded_with_the_assignment(self):
        splits = assign_splits(self.rows(), {'seed': 7, 'holdout': {'lexemes': ['taba']}})
        self.assertEqual(splits['policy']['seed'], 7)
        self.assertEqual(splits['policy']['holdout']['lexemes'], ['taba'])


class EquivalenceTests(unittest.TestCase):
    ABSOLUTE = 's[PLURIFORM_PREFIX:S:ABSOLUTE]apé[ROOT]pe[POSTPOSITION:LOCATIVE]'
    POSSESSED = 's[PLURIFORM_PREFIX:S]apé[ROOT]pe[POSTPOSITION:LOCATIVE]'

    def test_identical_annotation_is_one_answer_written_twice(self):
        self.assertTrue(annotation_identical(self.ABSOLUTE, self.ABSOLUTE))
        self.assertEqual(classify(self.ABSOLUTE, self.ABSOLUTE), 'annotation-identical')

    def test_a_differing_qualifier_keeps_two_readings_apart(self):
        self.assertFalse(annotation_identical(self.ABSOLUTE, self.POSSESSED))
        self.assertEqual(classify(self.ABSOLUTE, self.POSSESSED), 'co-generating')

    def test_the_difference_names_the_exact_tag_that_disagrees(self):
        rows = annotation_difference(self.ABSOLUTE, self.POSSESSED)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['surface'], 's')
        self.assertEqual(rows[0]['left'], ['PLURIFORM_PREFIX:S:ABSOLUTE'])
        self.assertEqual(rows[0]['right'], ['PLURIFORM_PREFIX:S'])
        self.assertTrue(rows[0]['onlyTags'])

    def test_grouping_collapses_identical_annotations_and_keeps_the_spelling(self):
        rows = group([
            {'source': 'a * b', 'annotated': self.ABSOLUTE, 'provenance': {}},
            {'source': '(a * b)', 'annotated': self.ABSOLUTE, 'provenance': {}},
            {'source': 'c * d', 'annotated': self.POSSESSED, 'provenance': {}},
        ])
        self.assertEqual([row['source'] for row in rows], ['a * b', 'c * d'])
        self.assertEqual(rows[0]['provenance']['annotationIdenticalSources'], ['(a * b)'])

    def test_co_generating_readings_are_acceptable_until_someone_decides(self):
        acceptance = AcceptanceSet('aso')
        self.assertFalse(acceptance.decided())
        self.assertTrue(acceptance.acceptable('(pe * apé)'))
        self.assertEqual(acceptance.verdict('(pe * apé)'), 'presumed')
        # Ambiguity is not error: an undecided pair may not become a contrast.
        self.assertFalse(acceptance.contrastable('(pe * apé)', '(pe * (ae * apé))'))

    def test_choosing_one_of_the_shown_readings_prefers_it_over_the_rest(self):
        """Picking the best among those on screen is itself a preference."""
        acceptance = acceptance_from_judgments('sapepe', [
            {'normalized': 'sapepe', 'verdict': 'accepted', 'candidateSource': 'B',
             'shownSources': ['A', 'B']}])
        self.assertEqual(acceptance.verdict('B'), 'confirmed')
        self.assertEqual(acceptance.verdict('A'), 'not-preferred')
        # Not chosen is not ungrammatical: it stays an acceptable reading.
        self.assertTrue(acceptance.acceptable('A'))
        self.assertTrue(acceptance.contrastable('B', 'A'))
        self.assertFalse(acceptance.contrastable('A', 'B'))

    def test_a_judgment_decides_the_pair_in_both_directions(self):
        judgments = [{'normalized': 'sapepe', 'verdict': 'accepted', 'candidateSource': 'A'},
                     {'normalized': 'sapepe', 'verdict': 'rejected', 'candidateSource': 'B'}]
        acceptance = acceptance_from_judgments('sapepe', judgments)
        self.assertTrue(acceptance.decided())
        self.assertEqual(acceptance.verdict('A'), 'confirmed')
        self.assertEqual(acceptance.verdict('B'), 'rejected')
        self.assertTrue(acceptance.contrastable('A', 'B'))
        self.assertFalse(acceptance.contrastable('B', 'A'))

    def test_a_correction_confirms_the_fix_and_rejects_what_it_replaced(self):
        acceptance = acceptance_from_judgments('sapepe', [
            {'normalized': 'sapepe', 'verdict': 'corrected',
             'candidateSource': 'A', 'correctedSource': 'B'}])
        self.assertEqual(acceptance.verdict('B'), 'confirmed')
        self.assertEqual(acceptance.verdict('A'), 'rejected')

    def test_judgments_for_another_observation_are_ignored(self):
        acceptance = acceptance_from_judgments('aso', [
            {'normalized': 'sapepe', 'verdict': 'rejected', 'candidateSource': 'A'}])
        self.assertFalse(acceptance.decided())
        self.assertEqual(acceptance.verdict('A'), 'presumed')


class FeedbackTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.attempts = AttemptLog(Path(self.directory.name) / 'attempts.jsonl')

    def attempt(self, **overrides):
        return {'normalized': 'zzzz', 'status': 'unknown', 'candidateCount': 0,
                'candidateSources': [], 'artifacts': {}, **overrides}

    def test_an_identical_repeated_attempt_is_not_recorded_twice(self):
        self.assertTrue(self.attempts.record(self.attempt())['appended'])
        self.assertFalse(self.attempts.record(self.attempt())['appended'])
        self.assertTrue(self.attempts.record(self.attempt(normalized='yyyy'))['appended'])
        self.assertEqual(len(self.attempts.read()), 2)

    def test_coverage_gaps_rank_unanalysable_inputs_and_ignore_successes(self):
        self.attempts.record(self.attempt(normalized='aaa'))
        self.attempts.record(self.attempt(normalized='bbb'))
        self.attempts.record(self.attempt(normalized='aaa', rawInput='again'))
        self.attempts.record(self.attempt(normalized='ccc', status='complete',
                                          candidateCount=1, candidateSources=['x']))
        gaps = coverage_gaps(self.attempts.read())
        self.assertEqual([row['normalized'] for row in gaps], ['aaa', 'bbb'])
        self.assertEqual(gaps[0]['attempts'], 2)

    def test_a_confirmed_reading_becomes_a_reviewed_example_without_approval(self):
        rows = confirmed_examples([
            {'normalized': 'xeroka', 'verdict': 'accepted', 'candidateSource': '(ixé * oka)',
             'recordedAt': '2026-09-18T12:00:00Z'}])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['sourceExpression'], '(ixé * oka)')
        self.assertEqual(rows[0]['provenance'], 'contributor-confirmed')
        self.assertEqual(rows[0]['reviewStatus'], 'lab-reviewed')
        self.assertFalse(rows[0]['grantsApproval'])
        self.assertEqual(rows[0]['sourceAst'], project('(ixé * oka)'))

    def test_the_latest_verdict_for_an_observation_wins(self):
        rows = confirmed_examples([
            {'normalized': 'xeroka', 'verdict': 'accepted', 'candidateSource': '(ixé * oka)',
             'recordedAt': '2026-09-18T12:00:00Z'},
            {'normalized': 'xeroka', 'verdict': 'corrected', 'candidateSource': '(ixé * oka)',
             'correctedSource': '(pe * oka)', 'recordedAt': '2026-09-18T12:05:00Z'}])
        self.assertEqual([row['sourceExpression'] for row in rows], ['(pe * oka)'])
        self.assertEqual(rows[0]['provenance'], 'contributor-corrected')

    def test_preferences_come_only_from_decided_pairs(self):
        # An acceptance with nothing else on screen compares nothing.
        self.assertEqual(preference_pairs([
            {'normalized': 'sapepe', 'verdict': 'accepted', 'candidateSource': 'A'}]), [])
        chosen = preference_pairs([
            {'normalized': 'sapepe', 'verdict': 'accepted', 'candidateSource': 'A',
             'shownSources': ['A', 'B']}])
        self.assertEqual([(row['preferred'], row['other'], row['strength']) for row in chosen],
                         [('A', 'B', 'passed-over')])
        pairs = preference_pairs([
            {'normalized': 'sapepe', 'verdict': 'accepted', 'candidateSource': 'A'},
            {'normalized': 'sapepe', 'verdict': 'rejected', 'candidateSource': 'B'}])
        self.assertEqual([(row['preferred'], row['other'], row['strength']) for row in pairs],
                         [('A', 'B', 'rejected')])

    def test_the_summary_separates_coverage_failures_from_ranking(self):
        self.attempts.record(self.attempt(normalized='aaa'))
        rows = summary(self.attempts.read(), [
            {'normalized': 'sapepe', 'verdict': 'corrected', 'candidateSource': 'A',
             'correctedSource': 'B', 'correctionWasProposed': False}])
        self.assertEqual(rows['attemptsUnknown'], 1)
        self.assertEqual(rows['coverageGaps'], 1)
        self.assertEqual(rows['correctionsTheSearchNeverProposed'], 1)
        self.assertEqual(rows['confirmedExamples'], 1)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = ArtifactStore(self.directory.name)
        self.addCleanup(self.directory.cleanup)

    def begin(self, fingerprint='sha256:aaa', kind='index', recipe=None):
        return self.store.begin(kind, recipe=recipe or {'profile': 'smoke'},
                                context={'fingerprint': fingerprint}, normalizer_profile=PROFILE,
                                grammar_version=1, ast_schema=1)

    def test_an_incomplete_artifact_is_never_activated_or_reported_complete(self):
        writer = self.begin()
        write_jsonl(writer.path('fragments.jsonl'), [{'a': 1}])
        self.assertEqual(self.store.entries(), [])
        self.assertEqual([row['name'] for row in self.store.interrupted()],
                         [Path(writer.directory).name])
        with self.assertRaises(Exception):
            self.store.activate('index', writer.id)

    def test_commit_is_atomic_and_records_checksums_and_runtime(self):
        writer = self.begin()
        write_jsonl(writer.path('fragments.jsonl'), [{'a': 1}, {'a': 2}])
        writer.checkpoint({'stage': 'fragments', 'counts': {'fragments': 2}})
        manifest = writer.commit(counts={'fragments': 2})
        self.assertNotIn('checkpoint.json', manifest['checksums'])
        self.assertTrue(manifest['completed'])
        self.assertIn('fragments.jsonl', manifest['checksums'])
        self.assertEqual(self.store.verify(manifest['artifactId'])['valid'], True)
        self.assertEqual(self.store.interrupted(), [])

    def test_interrupted_leftovers_report_their_last_stage_and_can_be_discarded(self):
        writer = self.begin()
        writer.checkpoint({'stage': 'retrieval', 'counts': {'fragments': 5}})
        rows = self.store.interrupted()
        self.assertEqual(rows[0]['lastStage'], 'retrieval')
        self.assertEqual(rows[0]['counts'], {'fragments': 5})
        self.assertEqual(self.store.clear_staging(), [rows[0]['name']])
        self.assertEqual(self.store.interrupted(), [])

    def test_a_changed_engine_fingerprint_invalidates_the_artifact(self):
        writer = self.begin('sha256:aaa')
        manifest = writer.commit(counts={})
        self.store.activate('index', manifest['artifactId'])
        self.assertEqual(self.store.active_for('index', 'sha256:aaa'), manifest['artifactId'])
        self.assertIsNone(self.store.active_for('index', 'sha256:bbb'))
        self.assertFalse(self.store.compatible(manifest['artifactId'], 'sha256:bbb'))

    def test_a_damaged_file_fails_verification_instead_of_being_reused(self):
        writer = self.begin()
        write_jsonl(writer.path('fragments.jsonl'), [{'a': 1}])
        manifest = writer.commit(counts={})
        (self.store.directory(manifest['artifactId']) / 'fragments.jsonl').write_text('{}\n')
        self.assertEqual(self.store.verify(manifest['artifactId'])['reason'], 'CHECKSUM_MISMATCH')

    def test_identifiers_are_derived_from_the_recipe_and_the_context(self):
        first = ArtifactStore.identifier('index', {'profile': 'smoke'}, {'fingerprint': 'a'})
        same = ArtifactStore.identifier('index', {'profile': 'smoke'}, {'fingerprint': 'a'})
        other = ArtifactStore.identifier('index', {'profile': 'baseline'}, {'fingerprint': 'a'})
        self.assertEqual(first, same)
        self.assertNotEqual(first, other)


class IndexTests(unittest.TestCase):
    def test_colliding_keys_preserve_every_candidate(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        write_jsonl(root / 'fragments.jsonl', [
            {'type': 'pp', 'family': 'bare_pp', 'source': '(pe * apé)', 'surface': 'sapepe',
             'normalized': 'sapepe', 'bindings': {}, 'lexemes': ['apé']},
            {'type': 'pp', 'family': 'possessive_pp', 'source': '(pe * (ae * apé))',
             'surface': 'sapepe', 'normalized': 'sapepe', 'bindings': {}, 'lexemes': ['ae', 'apé']},
        ])
        write_jsonl(root / 'retrieval.jsonl', [
            {'source': 'amen', 'surface': 'amém', 'normalized': 'amem', 'role': 'expression',
             'context': {'sourceId': 's', 'line': 1, 'ordinal': 1}},
        ])
        index = LabIndex(root)
        self.assertEqual(len(index.phrases('pp', 'sapepe')), 2)
        self.assertTrue(index.known_expression('amem'))
        self.assertFalse(index.known_expression('asoxerokype'))
        collisions = index.collisions()
        self.assertEqual(len(collisions), 1)
        self.assertEqual(len(collisions[0]['candidates']), 2)


class RankerTests(unittest.TestCase):
    def record(self, value, symbol):
        return ({'score': float(value)}, symbols_of(rule=symbol, families=[symbol],
                                                    bindings={}, source='x'))

    def test_fit_save_and_load_preserve_the_learned_ordering(self):
        pairs = [(self.record(1, 'good'), self.record(0, 'bad')) for _ in range(40)]
        model = fit(pairs, numeric=['score'], vocabulary=['rule=good', 'rule=bad'], epochs=20)
        self.assertGreater(model.raw(*self.record(1, 'good')), model.raw(*self.record(0, 'bad')))
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'ranker.json'
        model.save(path)
        reloaded = Ranker.load(path)
        self.assertEqual(reloaded.weights, model.weights)
        self.assertEqual(reloaded.score(*self.record(1, 'good')),
                         model.score(*self.record(1, 'good')))
        self.assertTrue(0.0 <= reloaded.score(*self.record(1, 'good')) <= 1.0)

    def test_an_incompatible_saved_model_is_refused(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'ranker.json'
        path.write_text(json.dumps({'version': 'other', 'bias': 0, 'weights': {},
                                    'vocabulary': [], 'numeric': []}), encoding='utf-8')
        with self.assertRaises(ValueError):
            Ranker.load(path)

    def test_symbols_describe_construction_lexeme_and_source_ngrams(self):
        symbols = symbols_of(rule='clause_pp', families=['verb_clause'],
                             bindings={'0:subject': 'ixé'}, source='(+ixé * só)')
        self.assertIn('rule=clause_pp', symbols)
        self.assertIn('family=verb_clause', symbols)
        self.assertIn('lexeme=ixé', symbols)
        self.assertTrue(any(symbol.startswith('ngram=') for symbol in symbols))


class JudgmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.log = JudgmentLog(Path(self.directory.name) / 'judgments.jsonl')

    def payload(self, **overrides):
        return {'verdict': 'accepted', 'normalized': 'asoxerokype',
                'candidateSource': '(+ixé * só)', **overrides}

    def test_a_judgment_is_appended_with_its_context_and_never_grants_approval(self):
        result = self.log.append(self.payload())
        self.assertTrue(result['appended'])
        row = self.log.read(1)[0]
        self.assertEqual(row['reviewStatus'], 'lab-only')
        self.assertFalse(row['grantsApproval'])

    def test_repeating_an_unchanged_verdict_does_not_append_a_second_row(self):
        self.log.append(self.payload())
        repeated = self.log.append(self.payload())
        self.assertFalse(repeated['appended'])
        self.assertEqual(self.log.count(), 1)
        self.assertTrue(self.log.append(self.payload(verdict='rejected'))['appended'])
        self.assertEqual(self.log.count(), 2)

    def test_an_unknown_verdict_is_refused(self):
        with self.assertRaises(ValueError):
            self.log.append(self.payload(verdict='approved'))


@unittest.skipUnless(HAS_PROJECT, 'selected corpus not installed')
class EngineTests(unittest.TestCase):
    engine = None

    @classmethod
    def setUpClass(cls):
        from parser_lab.engine import LabEngine
        cls.engine = LabEngine(REAL)

    def test_the_lab_context_is_answer_free_and_lexicon_only(self):
        context = self.engine.context()
        self.assertTrue(context['answerFree'])
        self.assertEqual(context['line'], 1)
        self.assertGreater(context['lexemeCount'], 100)
        self.assertTrue(context['fingerprint'].startswith('sha256:'))

    def test_the_documented_example_realizes_its_recorded_form_and_morphology(self):
        realized = self.engine.realize('(+ixé * só) + (pe * (ixé * oka))')
        self.assertEqual(realized['evaluationStatus'], 'complete')
        self.assertEqual(realized['surface'], 'asó xe rokype')
        self.assertEqual(normalize(realized['surface']), 'asoxerokype')
        units = self.engine.morphemes(realized['annotated'])
        self.assertEqual([unit['surface'] for unit in units],
                         ['a', 'só', 'xe', 'r', 'ok', 'y', 'pe'])
        self.assertEqual(units[0]['tags'], ['SUBJECT_PREFIX:1ps'])
        self.assertEqual(units[4]['tags'], ['ROOT', 'ROOT', 'SUBSTANTIVE_SUFFIX:CONSONANT_ENDING'])

    def test_every_committed_profile_only_declares_lexemes_in_this_context(self):
        for name in ('smoke', 'baseline', 'large'):
            declared = {value for members in load_profile(name)['inventory'].values()
                        for value in members}
            self.assertEqual(sorted(declared - set(self.engine.lexemes())), [], name)

    def test_every_declared_family_example_realizes_a_non_empty_form(self):
        for name, family in grammar.FAMILIES.items():
            surface = self.engine.surface(grammar.instantiate(name, family['example']))
            self.assertTrue(surface and surface.strip(), name)

    def test_an_unrealizable_expression_returns_no_surface_instead_of_raising(self):
        self.assertIsNone(self.engine.surface('nao_existe_no_lexico * oka'))


@unittest.skipUnless(HAS_PROJECT, 'selected corpus not installed')
class SearchTests(unittest.TestCase):
    store = None

    @classmethod
    def setUpClass(cls):
        from parser_lab import jobs
        from parser_lab.engine import LabEngine
        cls.temporary = tempfile.TemporaryDirectory()
        cls.engine = LabEngine(REAL)
        cls.store = ArtifactStore(cls.temporary.name)
        profile = load_profile('smoke')
        cls.manifest = jobs.prepare(cls.engine, cls.store, profile)
        cls.index = jobs.load_index(cls.store, cls.manifest['artifactId'])

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def analyze(self, text, **keywords):
        from parser_lab.search import Budget, analyze
        observed = prepare(text)['normalized']
        return analyze(self.engine, self.index, observed, budget=Budget({'maxSeconds': 20.0}),
                       **keywords)

    def test_the_documented_sentence_is_composed_not_retrieved(self):
        candidates, _rejections, _timings, diagnostics = self.analyze('Asó xe rokype')
        self.assertFalse(diagnostics['knownExpression'])
        self.assertTrue(candidates)
        best = candidates[0]
        self.assertEqual(project(best['source']),
                         project('(+ixé * só) + (pe * (ixé * oka))'))
        self.assertEqual(best['surface'], 'asó xe rokype')
        self.assertEqual(best['provenance']['route'], 'composition')
        self.assertEqual(best['completeness'], 'complete')

    def test_equivalent_inputs_produce_identical_candidates(self):
        signature = None
        for value in ('Asó xe rokype', 'ASOXEROKYPE', 'a so xé ró kŷ pe', 'Asó, xe rokype.'):
            candidates, _rejections, _timings, _diagnostics = self.analyze(value)
            current = [row['source'] for row in candidates]
            if signature is None:
                signature = current
            self.assertEqual(current, signature, value)

    def test_a_sentence_absent_from_the_full_expression_index_still_composes(self):
        observed = prepare('ereso nde rokype')['normalized']
        self.assertFalse(self.index.known_expression(observed))
        candidates, _rejections, _timings, _diagnostics = self.analyze('ereso nde rokype')
        self.assertTrue(candidates)
        self.assertEqual(project(candidates[0]['source']),
                         project('(+nde * só) + (pe * (nde * oka))'))
        self.assertEqual(candidates[0]['surface'], 'eresó nde rokype')

    def test_unknown_input_is_unknown_rather_than_a_fabricated_parse(self):
        for value in ('zzzz', 'Açó xe rokîpe'):
            candidates, _rejections, _timings, _diagnostics = self.analyze(value)
            self.assertEqual(candidates, [], value)

    def test_a_recorded_corpus_expression_is_labelled_as_retrieval(self):
        candidates, _rejections, _timings, diagnostics = self.analyze('amém')
        self.assertTrue(diagnostics['knownExpression'])
        self.assertEqual(candidates[0]['provenance']['route'], 'retrieval')
        self.assertFalse(candidates[0]['provenance']['measuresGeneralization'])
        self.assertGreaterEqual(len(candidates[0]['provenance']['occurrences']), 1)

    def test_every_returned_candidate_is_validated_against_the_whole_input(self):
        candidates, _rejections, _timings, _diagnostics = self.analyze('Asó xe rokype')
        for candidate in candidates:
            self.assertEqual(normalize(candidate['surface']), 'asoxerokype')
            self.assertEqual(candidate['completeness'], 'complete')
            self.assertTrue(candidate['editable'])
            self.assertTrue(candidate['morphemes'])

    def test_search_is_bounded_and_reports_exhaustion(self):
        from parser_lab.search import Budget, analyze
        budget = Budget({'maxAssemblies': 1, 'maxSeconds': 20.0})
        _candidates, rejections, _timings, diagnostics = analyze(
            self.engine, self.index, 'asoxerokype', budget=budget)
        self.assertIn(diagnostics['budgetExhausted'], {'ASSEMBLIES', None})
        codes = {row['code'] for row in rejections}
        self.assertTrue(codes <= {'BUDGET_EXHAUSTED', 'SURFACE_MISMATCH', 'ENGINE_ERROR',
                                  'EVALUATION_INCOMPLETE', 'UNSUPPORTED_SYNTAX'})

    def test_an_oversized_observation_is_refused_by_the_budget(self):
        from parser_lab.search import Budget, analyze
        candidates, rejections, _timings, _diagnostics = analyze(
            self.engine, self.index, 'a' * 500, budget=Budget())
        self.assertEqual(candidates, [])
        self.assertEqual(rejections[0]['code'], 'BUDGET_EXHAUSTED')

    def test_the_generated_examples_keep_their_original_expression_and_tree(self):
        from parser_lab.artifacts import read_jsonl
        rows = list(read_jsonl(self.store.directory(self.manifest['artifactId']) / 'examples.jsonl'))
        self.assertTrue(rows)
        for row in rows[:20]:
            self.assertEqual(project(row['sourceExpression']), row['sourceAst'])
            self.assertEqual(normalize(row['canonicalSurface']), row['normalized'])
            self.assertEqual(row['provenance'], 'engine-generated')
            self.assertEqual(row['reviewStatus'], 'unreviewed')

    def test_readings_the_grammar_annotates_identically_become_one_answer(self):
        """`ikó * +endé` and `(+nde * ikó)` make the same morphological claim."""
        self.assertEqual(self.engine._evaluate('(+nde * ikó)', annotated=True),
                         self.engine._evaluate('ikó * +endé', annotated=True))
        candidates, _rejections, _timings, _diagnostics = self.analyze('ereîkó')
        self.assertEqual(len(candidates), 1)
        spellings = candidates[0]['provenance'].get('annotationIdenticalSources', [])
        self.assertIn(candidates[0]['source'], {'ikó * +endé', '(+nde * ikó)'})
        self.assertTrue(spellings, 'the other spelling is recorded, not discarded')

    def test_co_generating_readings_stay_separate_with_their_exact_difference(self):
        """`sapépe` is genuinely ambiguous: absolute versus third-person possessed."""
        candidates, _rejections, _timings, _diagnostics = self.analyze('sapépe')
        self.assertEqual(len(candidates), 2)
        sources = {row['source'] for row in candidates}
        self.assertEqual(sources, {'(pe * apé)', '(pe * (ae * apé))'})
        for row in candidates:
            self.assertTrue(row['provenance']['coGenerating'])
            self.assertEqual(row['provenance']['acceptance'], 'presumed')
        difference = candidates[1]['provenance']['annotationDifferenceFromBest']
        self.assertEqual([row['surface'] for row in difference], ['s'])
        self.assertTrue(row['provenance'] for row in difference)
        self.assertNotEqual(difference[0]['left'], difference[0]['right'])

    def test_an_undecided_ambiguity_produces_no_training_contrast(self):
        from parser_lab.ranker import build_training_pairs
        examples = [{'normalized': prepare('sapépe')['normalized'],
                     'sourceAst': project('(pe * apé)')}]
        pairs, statistics = build_training_pairs(self.engine, self.index, examples, judgments=[])
        self.assertEqual(pairs, [])
        self.assertEqual(statistics['coGeneratingSkipped'], 1)
        self.assertEqual(statistics['undecidedObservations'], 1)

    def test_a_contributor_decision_creates_the_contrast_and_reorders_at_once(self):
        from parser_lab.ranker import build_training_pairs, human_pairs
        from parser_lab.search import Budget, analyze
        observed = prepare('sapépe')['normalized']
        judgments = [
            {'normalized': observed, 'verdict': 'accepted', 'candidateSource': '(pe * (ae * apé))'},
            {'normalized': observed, 'verdict': 'rejected', 'candidateSource': '(pe * apé)'}]
        examples = [{'normalized': observed, 'sourceAst': project('(pe * (ae * apé))')}]
        pairs, statistics = build_training_pairs(self.engine, self.index, examples,
                                                 judgments=judgments)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]['goldSource'], '(pe * (ae * apé))')
        self.assertEqual(statistics['coGeneratingSkipped'], 0)
        judged, judged_statistics = human_pairs(self.engine, self.index, judgments)
        self.assertEqual(len(judged), 1)
        self.assertEqual(judged_statistics['usable'], 1)
        # The decision applies to the very next analysis, before any training.
        acceptance = acceptance_from_judgments(observed, judgments)
        candidates, _rejections, _timings, _diagnostics = analyze(
            self.engine, self.index, observed, budget=Budget({'maxSeconds': 20.0}),
            acceptance=acceptance)
        self.assertEqual(candidates[0]['source'], '(pe * (ae * apé))')
        self.assertEqual(candidates[0]['provenance']['acceptance'], 'confirmed')
        self.assertEqual(candidates[-1]['provenance']['acceptance'], 'rejected')

    def test_an_unanalysable_input_reports_which_pieces_were_recognized(self):
        _candidates, _rejections, _timings, diagnostics = self.analyze('asó xe zzzz')
        self.assertEqual(_candidates, [])
        recognized = diagnostics['recognizedSpans']
        self.assertTrue(recognized, 'a gap report needs the pieces that did match')
        self.assertTrue(any(row['text'] == 'aso' for row in recognized))

    def test_reconstruction_excludes_the_answer_from_retrieval(self):
        from parser_lab.evaluation import RestrictedIndex
        from parser_lab.search import Budget, analyze
        view = RestrictedIndex(self.index, 'amen', 'amem')
        candidates, _rejections, _timings, _diagnostics = analyze(
            self.engine, view, 'amem', budget=Budget({'maxSeconds': 10.0}))
        self.assertEqual([row for row in candidates if row['route'] == 'retrieval'], [])


if __name__ == '__main__':
    unittest.main()
