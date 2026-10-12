"""Coreference wrappers annotate source without changing realized morphology."""
from pathlib import Path
import ast
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import ProjectAdapter
from studio_authoring import STUDIO_HELPER_SOURCE, coreference_call, parse_ast

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


class CoreferenceSyntaxTests(unittest.TestCase):
    def test_only_literal_two_argument_wrappers_are_links(self):
        self.assertEqual(coreference_call(parse_ast('studio_ref(+ae, "teko")'))[::2], ('studio_ref', 'teko'))
        self.assertEqual(coreference_call(parse_ast("studio_anchor(ikó * ae, 'A')"))[::2], ('studio_anchor', 'A'))
        for raw in ('studio_ref(+ae, label)', 'studio_ref(+ae)', 'studio_ref(+ae, "A", x=1)', 'studio_define(+ae, "A")'):
            self.assertIsNone(coreference_call(parse_ast(raw)), raw)

    def test_portable_helpers_execute_outside_studio(self):
        namespace = {}
        exec(''.join(STUDIO_HELPER_SOURCE.values()), namespace)
        class Value:
            def copy(self): return 'copied'
        self.assertEqual(namespace['studio_ref'](Value(), 'A'), 'copied')
        self.assertEqual(namespace['studio_anchor'](Value(), 'A'), 'copied')


@unittest.skipUnless((REAL/'oldtupicorpus/historic/lexicon.tu.py').is_file(), 'selected corpus not installed')
class RealCoreferenceTests(unittest.TestCase):
    def worker(self, raw, action=None):
        payload = {'parent': str(REAL), 'sourceId': 'araujo_catecismo_1686', 'line': 1, 'raw': raw,
                   **({'action': action} if action else {})}
        script = Path(__file__).resolve().parents[1] / 'authoring_runtime.py'
        response = subprocess.run([sys.executable, '-I', '-B', str(script)], input=json.dumps(payload),
                                  capture_output=True, text=True, check=True)
        message = json.loads(response.stdout)
        self.assertNotIn('error', message)
        return message['result']

    def test_reference_and_anchor_keep_surface_and_annotation(self):
        plain = self.worker('+ae * ikó')
        linked = self.worker('studio_ref(+ae, "teko") * ikó')
        self.assertEqual((plain['surface'], plain['annotated']), (linked['surface'], linked['annotated']))
        anchored = self.worker('studio_anchor(ikó * ae, "teko")')
        self.assertEqual(anchored['surface'], self.worker('ikó * ae')['surface'])

    def test_semantic_context_names_link_without_a_label_constituent(self):
        result = self.worker('studio_ref(+ae, "teko") * ikó')
        reference = next(child['node'] for child in result['definitionContext']['root']['children']
                         if child['node'].get('coreference'))
        self.assertEqual(reference['coreference'], {'role': 'reference', 'label': 'teko'})
        self.assertEqual([child['role'] for child in reference['children']], ['arg0'])

    def test_invalid_label_fails_explicitly(self):
        result = self.worker('studio_ref(+ae, "two words") * ikó')
        self.assertIn('Referência a antecedente inválida.', json.dumps(result, ensure_ascii=False))

    def test_lexicon_keeps_one_visible_level_with_link(self):
        result = self.worker('studio_anchor(studio_ref(+ae, "teko") * ikó, "oiko")', 'active_lexicon')
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual([item['nodeKind'] for item in direct], ['binary', 'unary', 'reference', 'reference'])
        self.assertEqual(direct[0]['coreference'], [{'role': 'anchor', 'label': 'oiko'}])
        self.assertEqual(direct[1]['coreference'], [{'role': 'reference', 'label': 'teko'}])
        self.assertFalse({'studio_ref', 'studio_anchor'} & {item.get('name') for item in result['entries']})


@unittest.skipUnless((REAL/'oldtupicorpus/historic/lexicon.tu.py').is_file(), 'selected corpus not installed')
class CoreferencePublicationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        parent = Path(temp.name); corpus = parent/'oldtupicorpus'; corpus.mkdir()
        for folder in ('historic', 'authoring', 'tests', 'ground_truth'):
            shutil.copytree(REAL/'oldtupicorpus'/folder, corpus/folder, ignore=shutil.ignore_patterns('__pycache__'))
        (parent/'nhe-enga').symlink_to(REAL/'nhe-enga', target_is_directory=True)
        subprocess.run(['git', 'init', '--quiet', str(corpus)], check=True)
        subprocess.run(['git', '-C', str(corpus), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(corpus), '-c', 'user.name=Studio Test', '-c', 'user.email=test@example.invalid',
                        'commit', '--quiet', '-m', 'disposable fixture'], check=True)
        self.path = corpus/'historic/araujo_catecismo_1686.tu.py'
        self.adapter = ProjectAdapter(parent/'state')
        self.project = self.adapter.open_project(str(parent))

    def test_source_preview_adds_only_the_used_portable_helpers(self):
        passage = self.project['passages'][66]
        raw = f'studio_anchor(({passage["sourceExpression"]}), "teko")'
        preview = self.adapter.invoke('source_preview', {'passageId': passage['id'], 'raw': raw})
        self.assertIn('def studio_anchor', preview['diff'])
        self.assertNotIn('def studio_ref', preview['diff'])
        self.project = self.adapter.invoke('source_apply', preview)
        text = self.path.read_text()
        self.assertEqual(sum(isinstance(node, ast.FunctionDef) and node.name == 'studio_anchor'
                             for node in ast.parse(text).body), 1)
        current = self.project['passages'][66]
        rendered = self.adapter.invoke('evaluate_expression', {
            'passageId': current['id'], 'raw': current['sourceExpression'], 'revisionId': 'r2',
            'engineFingerprint': self.project['engineFingerprint']})
        before = self.adapter.invoke('evaluate_expression', {
            'passageId': current['id'], 'raw': passage['sourceExpression'], 'revisionId': 'r3',
            'engineFingerprint': self.project['engineFingerprint']})
        self.assertEqual(rendered['surface'], before['surface'])


if __name__ == '__main__':
    unittest.main()
