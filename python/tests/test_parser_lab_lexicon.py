"""Full dictionary snapshot, exact senses, portability and cancellation."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser_lab.artifacts import write_jsonl
from parser_lab.engine import LabEngine
from parser_lab.index import LabIndex
from parser_lab.jobs import Cancelled
from parser_lab.lexicon import (DICTIONARY_FILES, _anchor_forms, build_lexicon, constructor_choices,
                                dictionary_fingerprints)

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT',
                           str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
HAS_PROJECT = (REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').is_file()


class LexicalMetadataTests(unittest.TestCase):
    def test_orphan_engine_tag_does_not_stall_anchor_extraction(self):
        class Predicate:
            def copy(self):
                return self
            def eval(self, annotated=False):
                return '[NOUN]a[SUBJECT_PREFIX:1ps]só[ROOT]'
        self.assertEqual(_anchor_forms(Predicate()), ['só', 'asó'])

    def test_grammatical_labels_are_only_read_in_the_header(self):
        self.assertEqual(constructor_choices('(s.) - uma coisa; exemplo (v.tr.)'), ['Noun'])
        self.assertEqual(constructor_choices('(v. intr. compl. posp.) - sair'), ['Verb'])
        self.assertEqual(constructor_choices('(t) - v. outra'), [])
        self.assertEqual(constructor_choices('(adj.) - bom'), ['Noun', 'Verb'])

    def test_data_content_changes_invalidate_fingerprints_even_with_same_size(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in DICTIONARY_FILES:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'aaa')
            before = dictionary_fingerprints(root)
            target = root / DICTIONARY_FILES[0]
            stat = target.stat()
            target.write_bytes(b'bbb')
            os.utime(target, ns=(stat.st_atime_ns, stat.st_mtime_ns))
            after = dictionary_fingerprints(root)
            self.assertNotEqual(before[DICTIONARY_FILES[0]], after[DICTIONARY_FILES[0]])
            self.assertEqual(before[DICTIONARY_FILES[1]], after[DICTIONARY_FILES[1]])


@unittest.skipUnless(HAS_PROJECT, 'Selected local project unavailable')
class FullLexiconTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = LabEngine(REAL)
        cls.rows, cls.report = build_lexicon(cls.engine)

    def test_full_navarro_is_accounted_for_without_training_inventory_limits(self):
        from navarro_search import _site_data
        _, (_, entries) = _site_data(REAL / 'nhe-enga')
        self.assertEqual(self.report['dictionaryEntries'], len(entries))
        self.assertEqual(self.report['indexedSenses'] + self.report['skippedSenses'], len(entries))
        self.assertGreater(self.report['indexedSenses'], 6000)
        self.assertEqual(len(self.rows), self.report['sharedEntries'] + self.report['dictionaryRows'])
        self.assertTrue(self.report['skippedByReason'])

    def test_reported_tekateyma_has_a_portable_engine_realization(self):
        from authoring_runtime import interpret
        from studio_authoring import parse_ast
        row = next(row for row in self.rows if row['headword'] == "ekate'yma")
        self.assertEqual(row['origin'], 'navarro')
        self.assertEqual(row['category'], 'noun')
        self.assertIn("ekate'ym", row['keys'])
        self.assertIn("tekate'yma", row['keys'])
        self.assertIn('avareza', row['definition'])
        # No lab alias or lab-only interpreter is needed to adopt the source.
        value = interpret(parse_ast(row['source']), self.engine.namespace)
        self.assertEqual(value.definition, row['definition'])
        self.assertEqual(str(value.eval()), "tekate'yma")
        self.assertIn('[PLURIFORM_PREFIX:T', str(value.eval(annotated=True)))

    def test_distinct_homograph_senses_and_verbal_classes_are_preserved(self):
        from authoring_runtime import interpret
        from studio_authoring import parse_ast
        rows = [row for row in self.rows if row['origin'] == 'navarro' and row['headword'] == 'îuká']
        self.assertGreaterEqual(len(rows), 2)
        self.assertEqual(len({row['senseId'] for row in rows}), len(rows))
        self.assertEqual(len({row['source'] for row in rows}), len(rows))
        for row in rows:
            value = interpret(parse_ast(row['source']), self.engine.namespace)
            self.assertEqual(value.raw_definition, row['definition'])
            self.assertEqual(value.verb.vid, row['engineDictionaryVid'])
            self.assertEqual(value.verb.transitivo, row['transitive'])

    def test_engine_stems_retrieve_obscured_roots_and_index_keeps_collisions(self):
        oka = next(row for row in self.rows if row['id'] == 'shared:oka')
        self.assertIn('ok', oka['keys'])
        self.assertIn('ok', 'asoxerokype')
        with tempfile.TemporaryDirectory() as temporary:
            write_jsonl(Path(temporary) / 'lexicon.jsonl', self.rows)
            index = LabIndex(temporary)
            self.assertEqual(len(index.lexical_rows), len(self.rows))
            self.assertGreaterEqual(len(index.lexical_by_key['iuka']), 2)
            self.assertTrue(index.lexical_by_category['verb'])
            self.assertEqual(index.counts()['lexicalEntries'], len(self.rows))

    def test_opaque_imperative_roots_come_from_selected_engine_annotations(self):
        so = next(row for row in self.rows if row['id'] == 'shared:só')
        ur = next(row for row in self.rows if row['id'] == 'shared:ur')
        self.assertIn('kuai', so['keys'])
        self.assertIn('iori', ur['keys'])
        self.assertEqual(so['source'], 'só')
        self.assertEqual(ur['source'], 'ur')

    def test_dictionary_only_postposition_composes_and_keeps_its_sense(self):
        from parser_lab.normalization import normalize
        from parser_lab.search import analyze
        post = next(row for row in self.rows if row['origin'] == 'navarro'
                    and row['headword'] == 'agûerabé' and row['category'] == 'postposition')
        noun = next(row for row in self.rows if row['source'] == 'abá')
        expected = self.engine.surface(f'({post["source"]}) * abá')
        self.assertEqual(expected, 'abá agûerabé')
        with tempfile.TemporaryDirectory() as temporary:
            write_jsonl(Path(temporary) / 'lexicon.jsonl', [noun, post])
            candidates, _, _, _ = analyze(self.engine, LabIndex(temporary), normalize(expected),
                                           include_retrieval=False)
        self.assertTrue(candidates)
        matching = [candidate for candidate in candidates if post['source'] in candidate['source']]
        self.assertTrue(matching)
        for candidate in matching:
            evidence = candidate['provenance']['lexicalEvidence']
            self.assertTrue(any(item.get('senseId') == post['senseId'] for item in evidence))
            self.assertTrue(any(item['headword'] == 'abá' for item in evidence))

    def test_shared_proper_nouns_keep_their_actual_category(self):
        names = [row for row in self.rows if row['category'] == 'proper_noun']
        self.assertTrue(names)
        self.assertTrue(all(row['origin'] == 'shared' for row in names))

    def test_opaque_nominal_stems_and_fused_locative_are_engine_anchors(self):
        from parser_lab.normalization import normalize
        from parser_lab.search import analyze
        cases = [('angaîpaba', 'angaîpápe', 'pe'), ('aíba', 'aígûera', 'pûera'),
                 ("ekate'yma", "tekate'ỹme", 'pe')]
        for headword, expected, operator in cases:
            row = next(row for row in self.rows if row['headword'] == headword and row['category'] == 'noun')
            self.assertEqual(self.engine.surface(f'{operator} * ({row["source"]})'), expected)
            self.assertIn(normalize(expected), row['keys'])
            with tempfile.TemporaryDirectory() as temporary:
                write_jsonl(Path(temporary) / 'lexicon.jsonl', [row])
                candidates, _, _, _ = analyze(self.engine, LabIndex(temporary), normalize(expected),
                                               include_retrieval=False)
            self.assertTrue(candidates, expected)
            self.assertTrue(all(candidate['surface'] == expected for candidate in candidates))

    def test_cancel_during_lexicon_stops_before_completion(self):
        state = {'cancelled': False}
        def progress(event):
            if event['stage'] == 'lexicon':
                state['cancelled'] = True
        with self.assertRaises(Cancelled):
            build_lexicon(self.engine, progress, lambda: state['cancelled'])


if __name__ == '__main__':
    unittest.main()
