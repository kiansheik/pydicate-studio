"""Complete publication checks reuse only isolated declaration contexts."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_publication_portability as fixtures


class PublicationSnapshotTests(unittest.TestCase):
    setUp = fixtures.PortablePublicationReviewTests.setUp
    tearDown = fixtures.PortablePublicationReviewTests.tearDown

    def replace_source(self, text):
        self.source.write_text(text, encoding='utf-8')
        self.originals[self.source] = self.source.read_bytes()

    def test_mutating_helpers_and_rebinding_do_not_leak_between_passages(self):
        self.replace_source(
            'def mutate():\n'
            '    word.surface += "!"\n'
            '    return word\n'
            'l = [word, mutate(), word]\n'
            'word = other\n'
            'l += [word, mutate(), word]\n'
        )
        result = self.service.child({'action': 'publication_snapshot'})
        rows = result['sample']['rows']
        self.assertEqual([row['surface'] for row in rows],
                         ['abá', 'abá!', 'abá', 'îeupiragûera', 'îeupiragûera!', 'îeupiragûera'])
        self.assertEqual([row['annotated'] for row in rows],
                         [row['surface'] + '[ROOT]' for row in rows])

    def test_declarations_from_one_source_do_not_leak_into_another(self):
        second = self.source.with_name('second.tu.py')
        second.write_text('word = other\nl = [word]\n', encoding='utf-8')
        self.originals[second] = second.read_bytes()
        result = self.service.child({'action': 'publication_snapshot'})
        self.assertEqual(result['sample']['rows'][0]['surface'], 'abá')
        self.assertEqual(result['second']['rows'][0]['surface'], 'îeupiragûera')

    def test_mutable_helper_defaults_are_isolated_for_every_passage(self):
        self.replace_source(
            'def positional(value=word):\n'
            '    value.surface += "!"\n'
            '    return value\n'
            'def keyword(*, value=word):\n'
            '    value.surface += "?"\n'
            '    return value\n'
            'l = [positional(), positional(), keyword(), keyword(), word]\n'
        )
        result = self.service.child({'action': 'publication_snapshot'})
        self.assertEqual([row['surface'] for row in result['sample']['rows']],
                         ['abá!', 'abá!', 'abá?', 'abá?', 'abá'])

    def test_baseline_reused_only_for_exact_fingerprint_and_candidates_always_checked(self):
        calls = []
        child = self.service.child

        def inspect(payload, timeout):
            calls.append('candidate' if 'enginePath' in payload else 'baseline')
            return child(payload, timeout)

        before = self.source.read_bytes()
        with patch.object(self.service, 'fresh', return_value='exact-engine-and-corpus-v1'), \
                patch.object(self.service, 'child', side_effect=inspect):
            first = self.service._preview(self.source, before, b'l = [other]\n')
            second = self.service._preview(self.source, before, b'l = [word, other]\n')
        self.assertTrue(first['regression']['ok'])
        self.assertTrue(second['regression']['ok'])
        self.assertEqual(calls, ['baseline', 'candidate', 'candidate'])
        with patch.object(self.service, 'fresh', return_value='changed-engine-or-corpus-v2'), \
                patch.object(self.service, 'child', side_effect=inspect):
            self.service._preview(self.source, before, b'l = [other]\n')
        self.assertEqual(calls[-2:], ['baseline', 'candidate'])

    def test_cached_baseline_still_rejects_failed_candidate(self):
        from adapter import AdapterError
        before = self.source.read_bytes()
        with patch.object(self.service, 'fresh', return_value='exact-engine-and-corpus'):
            self.service._preview(self.source, before, b'l = [other]\n')
            with self.assertRaises(AdapterError) as caught:
                self.service._preview(self.source, before, b'l = [missing_name]\n')
        self.assertEqual(caught.exception.code, 'REGRESSION_FAILED')


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(),
                     'selected local corpus not installed')
class RealPublicationParityTests(unittest.TestCase):
    def test_all_real_passages_match_independent_fresh_namespaces(self):
        # Run the original per-passage namespace strategy as an independent
        # oracle, then compare every surface, annotation and failure. Neither
        # path writes research or retains namespaces between child processes.
        code = '''
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from authoring_runtime import configure, namespace_for, interpret, evaluation_snapshot
from publication_regression import snapshot
from rendered_structures import isolated_namespace
from studio_authoring import source_entries, parse_ast
corpus = configure(Path(sys.argv[2]))
actual = snapshot(corpus)
checked = 0
for path in sorted((corpus / 'historic').glob('*.tu.py')):
    if path.name == 'lexicon.tu.py': continue
    source = path.name.removesuffix('.tu.py')
    for entry, row in zip(source_entries(path), actual[source]['rows'], strict=True):
        expected = {}
        try:
            namespace = namespace_for(corpus, path, entry['line'])
            syntax = parse_ast(entry['expression'])
            value = evaluation_snapshot(interpret(syntax, isolated_namespace(namespace, syntax)))
            expected.update(surface=str(value.eval()), annotated=str(value.eval(annotated=True)))
        except Exception as error:
            expected['error'] = type(error).__name__ + ': ' + str(error)
        assert {key: row[key] for key in ('surface', 'annotated', 'error') if key in row} == expected, (source, row['ordinal'])
        checked += 1
print(json.dumps({'checked': checked}))
'''
        result = subprocess.run([sys.executable, '-I', '-B', '-c', code,
                                 str(Path(__file__).resolve().parents[1]), str(REAL)],
                                capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreater(json.loads(result.stdout)['checked'], 0)


if __name__ == '__main__':
    unittest.main()
