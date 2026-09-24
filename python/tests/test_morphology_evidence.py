"""Optional morpheme evidence never changes canonical per-step rendering."""
import os
from pathlib import Path
import re
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import ProjectAdapter
from authoring_runtime import capture_evaluation, configure, finish_evaluation, morphology_evidence, namespace_for, realize
from studio_authoring import source_entries


def nodes(root):
    yield root
    for child in root['children']:
        yield from nodes(child['node'])


class MutablePreview:
    def __init__(self):
        self.calls = 0

    def eval(self, annotated=False):
        # Each output is correct only when it begins from the captured state.
        previous = self.calls
        self.calls += 1
        return ('safe[ROOT]' if annotated else 'safe') if previous == 0 else 'mutated'


class FailingAnnotation:
    def eval(self, annotated=False):
        if annotated:
            raise ValueError('annotation unavailable')
        return 'safe'


class MismatchedAnnotation:
    def eval(self, annotated=False):
        return 'different[ROOT]' if annotated else 'safe'


class MorphologySnapshotTests(unittest.TestCase):
    def test_default_does_not_request_or_add_step_annotations(self):
        self.assertEqual(finish_evaluation(capture_evaluation(FailingAnnotation())),
                         {'status': 'ok', 'surface': 'safe'})

    def test_plain_and_annotated_previews_start_from_separate_isolated_snapshots(self):
        original = MutablePreview()
        result = finish_evaluation(capture_evaluation(original), include_morphology=True)
        self.assertEqual(result, {'status': 'ok', 'surface': 'safe', 'annotated': 'safe[ROOT]',
                                 'morphologySegments': [{'text': 'safe', 'start': 0, 'end': 4, 'tags': ['ROOT']}]})
        self.assertEqual(original.calls, 0)

    def test_failed_annotation_does_not_destroy_a_successful_surface(self):
        result = finish_evaluation(capture_evaluation(FailingAnnotation()), include_morphology=True)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['surface'], 'safe')
        self.assertNotIn('annotated', result)
        self.assertIn('annotation unavailable', result['morphologyDiagnostic'])

    def test_annotations_with_different_surface_do_not_supply_misleading_offsets(self):
        result = finish_evaluation(capture_evaluation(MismatchedAnnotation()), include_morphology=True)
        self.assertEqual(result['surface'], 'safe')
        self.assertNotIn('annotated', result)
        self.assertIn('difere', result['morphologyDiagnostic'])

    def test_annotation_only_word_boundaries_map_to_exact_plain_offsets(self):
        annotation = ' i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]upir[ROOT]  '
        result = morphology_evidence('i îeupir', annotated=annotation)
        self.assertEqual(result['annotated'], annotation)
        self.assertEqual(result['morphologySegments'], [
            {'text': 'i', 'start': 0, 'end': 1, 'tags': ['POSSESSIVE_PRONOUN:3p']},
            {'text': 'îe', 'start': 2, 'end': 4, 'tags': ['SUBJECT:refl']},
            {'text': 'upir', 'start': 4, 'end': 8, 'tags': ['ROOT']},
        ])

    def test_display_word_boundaries_and_utf16_offsets_are_preserved(self):
        result = morphology_evidence('𐐀 a\u0301 b', annotated='𐐀[PROPER_NOUN]a\u0301b[ROOT][NOUN]')
        self.assertEqual(result['morphologySegments'], [
            {'text': '𐐀', 'start': 0, 'end': 2, 'tags': ['PROPER_NOUN']},
            {'text': 'a\u0301', 'start': 3, 'end': 5, 'tags': ['ROOT', 'NOUN']},
            {'text': 'b', 'start': 6, 'end': 7, 'tags': ['ROOT', 'NOUN']},
        ])

    def test_spacing_tolerance_does_not_hide_changed_letters_or_broken_annotations(self):
        for annotation in ['i[PRONOUN]îe[ROOT]', 'o[PRONOUN]îe[ROOT', 'o[]îe[ROOT]']:
            with self.subTest(annotation=annotation):
                result = morphology_evidence('o îe', annotated=annotation)
                self.assertNotIn('annotated', result)
                self.assertNotIn('morphologySegments', result)
                self.assertIn('morphologyDiagnostic', result)


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(), 'selected corpus not installed')
class RealMorphologyEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = configure(REAL)
        cls.path = cls.corpus / 'historic/araujo_catecismo_1686.tu.py'
        cls.original = cls.path.read_bytes()
        cls.entry = source_entries(cls.path)[80]

    @classmethod
    def tearDownClass(cls):
        assert cls.path.read_bytes() == cls.original, 'Morpheme inspection must not edit the corpus'

    def evaluate(self, raw, include_morphology=False):
        return realize(raw, namespace_for(self.corpus, self.path, self.entry['statementLine']),
                       include_morphology=include_morphology)

    def test_opt_in_preserves_canonical_result_and_carries_every_successful_step(self):
        raw = '(pûera * (og * (emi * tym))) / ypy'
        baseline = self.evaluate(raw)
        result = self.evaluate(raw, True)
        for field in ('surface', 'annotated', 'structureFingerprint', 'evaluationStatus'):
            self.assertEqual(result[field], baseline[field])
        self.assertEqual(result['surface'], 'oemitymbûerypy')
        for node in nodes(baseline['tree']):
            self.assertNotIn('annotated', node['evaluation'])
        for node in nodes(result['tree']):
            evaluation = node['evaluation']
            if evaluation['status'] == 'ok':
                self.assertEqual(re.sub(r'\[[^\[\]]*\]', '', evaluation['annotated']), evaluation['surface'])
                self.assertEqual(''.join(part['text'] for part in evaluation['morphologySegments']),
                                 re.sub(r'\s+', '', evaluation['surface']))
        by_code = {node['code']: node for node in nodes(result['tree'])}
        self.assertIn('tym[ROOT]', by_code['emi * tym']['evaluation']['annotated'])
        self.assertEqual(by_code['tym']['evaluation']['annotated'], 'tym')

    def test_araujo_passage60_keeps_all_step_evidence_across_annotation_spacing(self):
        entry = source_entries(self.path)[59]
        result = realize(entry['expression'], namespace_for(self.corpus, self.path, entry['statementLine']),
                         include_morphology=True)
        self.assertIn('i îeupiragûera', result['surface'])
        self.assertIn('i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]', result['annotated'])
        for node in nodes(result['tree']):
            evaluation = node['evaluation']
            if evaluation['status'] != 'ok':
                continue
            with self.subTest(code=node['code']):
                self.assertNotIn('morphologyDiagnostic', evaluation)
                segments = evaluation['morphologySegments']
                self.assertEqual(''.join(part['text'] for part in segments),
                                 re.sub(r'\s+', '', evaluation['surface']))
                encoded = evaluation['surface'].encode('utf-16-le')
                for part in segments:
                    self.assertEqual(encoded[part['start'] * 2:part['end'] * 2].decode('utf-16-le'), part['text'])
        selected = next(node for node in nodes(result['tree']) if node['code'] == 'risetoheaven')
        self.assertEqual(next(part for part in selected['evaluation']['morphologySegments']
                              if part['tags'] == ['SUBJECT:refl']),
                         {'text': 'îe', 'start': 10, 'end': 12, 'tags': ['SUBJECT:refl']})

    def test_negation_and_nominal_variant_evidence_preserve_added_and_changed_morphemes(self):
        result = self.evaluate('-Noun("ekat", definition="(t)")', True)
        self.assertIn("e'ym[NEGATION_SUFFIX]", result['tree']['evaluation']['annotated'])
        operand = result['tree']['children'][0]['node']['evaluation']
        self.assertEqual(operand['surface'], 'tekata')
        self.assertNotIn('NEGATION', operand['annotated'])
        nominal = self.evaluate('(potar * moro).base_nominal()', True)['tree']
        self.assertIn('moro[OBJECT:gen]', nominal['evaluation']['annotated'])
        self.assertIn('poro[OBJECT:gen]', nominal['children'][0]['node']['evaluation']['annotated'])

    def test_partial_tree_keeps_successful_branch_annotation_without_inventing_root(self):
        result = self.evaluate('tym.ord() + (emi * tym)', True)
        tree = {node['id']: node for node in nodes(result['tree'])}
        self.assertEqual(result['evaluationStatus'], 'partial')
        self.assertNotIn('annotated', tree['root']['evaluation'])
        self.assertIn('tym[ROOT]', tree['root/right']['evaluation']['annotated'])
        self.assertEqual(tree['root/left/receiver']['evaluation']['annotated'], 'tym')

    def test_service_forwards_opt_in_to_fresh_selected_engine(self):
        adapter = ProjectAdapter()
        project = adapter.open_project(str(REAL))
        passage = next(row for row in project['passages'] if row['sourceId'] == 'araujo_catecismo_1686')
        result = adapter.invoke('evaluate_expression', {
            'passageId': passage['id'], 'raw': 'emi * tym', 'revisionId': 'morpheme-opt-in',
            'engineFingerprint': project['engineFingerprint'], 'includeMorphology': True,
        })
        self.assertEqual(result['revisionId'], 'morpheme-opt-in')
        self.assertEqual(result['engineFingerprint'], project['engineFingerprint'])
        self.assertIn('tym[ROOT]', result['tree']['evaluation']['annotated'])
        self.assertEqual(result['tree']['children'][1]['node']['evaluation']['annotated'], 'tym')


if __name__ == '__main__':
    unittest.main()
