"""Dictionary lookup scope and exact-sense, tree-preserving meaning edits."""
import ast
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_service import AuthoringService
from navarro_search import dictionary_lookup


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3])))
SOURCE = 'araujo_catecismo_1686'


def meanings(node):
    yield node
    for child in node.get('children', []):
        yield from meanings(child['node'])


class DictionaryLookupScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.engine = Path(self.temp.name)/'nhe-enga'
        self.dataset = self.engine/'docs/dict-conjugated.json.gz'
        self.dataset.parent.mkdir(parents=True)
        self.rows = [
            {'f': 'abá', 'd': '(s.) - pessoa', 't': 1},
            {'f': 'citação', 'd': '(s.) - ' + 'contexto distante; '*30 + 'aba\u0301  em exemplo; outro texto', 't': 1},
            {'f': 'pessoa', 'd': '(s.) - outro sentido', 't': 1},
            {'f': 'português', 'd': '- abá', 't': 0},
        ]
        self.original = gzip.compress(json.dumps(self.rows, ensure_ascii=False).encode(), mtime=0)
        self.dataset.write_bytes(self.original)
        self.selection = {'entryIndex': 0, 'datasetFingerprint': 'sha256:'+hashlib.sha256(self.original).hexdigest()}

    def test_filters_stay_in_selected_field_including_relaxed_and_excerpt(self):
        for query, match in [('abá', 'exact'), ('aba', 'relaxed')]:
            headwords = dictionary_lookup(self.engine, {'query': query, 'matchField': 'headword'})
            self.assertEqual([row['entryIndex'] for row in headwords['results']], [0])
            self.assertEqual(headwords['results'][0]['match'], match)
            self.assertEqual(headwords['results'][0]['matchedField'], 'headword')
            body = dictionary_lookup(self.engine, {'query': query, 'matchField': 'definition'})['results']
            self.assertEqual([row['entryIndex'] for row in body], [1])
            self.assertEqual(body[0]['matchedField'], 'definition')
            self.assertIn('aba\u0301  em exemplo', body[0]['matchedExcerpt'])
            self.assertLessEqual(len(body[0]['matchedExcerpt']), 280)
            self.assertEqual(body[0]['definition'], self.rows[1]['d'])
        spaced = dictionary_lookup(self.engine, {'query': 'abá em', 'matchField': 'definition'})['results'][0]
        self.assertIn('aba\u0301  em exemplo', spaced['matchedExcerpt'])

    def test_default_order_and_pagination_survive_and_invalid_fields_fail(self):
        found = dictionary_lookup(self.engine, {'query': 'pessoa'})
        self.assertEqual([(row['entryIndex'], row['matchedField']) for row in found['results']],
                         [(2, 'headword'), (0, 'definition')])
        page = dictionary_lookup(self.engine, {'query': 'aba', 'limit': 1})
        self.assertEqual(page['nextOffset'], 1)
        second = dictionary_lookup(self.engine, {'query': 'aba', 'limit': 1, 'offset': 1})
        self.assertNotEqual(page['results'][0]['entryIndex'], second['results'][0]['entryIndex'])
        for value in ('all', [], True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                dictionary_lookup(self.engine, {'query': 'aba', 'matchField': value})
        self.assertEqual(self.dataset.read_bytes(), self.original)

    def service(self):
        corpus = self.engine.parent/'oldtupicorpus'
        (corpus/'historic').mkdir(parents=True, exist_ok=True)
        (corpus/'historic/lexicon.tu.py').write_text("sample = Noun('aba', definition='base')\n")
        service = AuthoringService(SimpleNamespace(parent=self.engine.parent, project={'passages': []}))
        service.fresh = lambda _params=None: 'current-engine'
        service.structure_context = lambda _params: {'sourceId': SOURCE}
        service.lexicon_inspect = lambda _params: {'id': 'sample-id', 'definition': 'base', 'affectedUses': []}
        return service

    def test_invalid_or_stale_selection_rejects_before_edit(self):
        service = self.service()
        for method in ('node_definition', 'composition_define', 'lexicon_update'):
            for selection in (None, {}, {**self.selection, 'entryIndex': 3},
                              {**self.selection, 'datasetFingerprint': 'sha256:'+'0'*64}):
                with self.subTest(method=method, selection=selection), patch.object(service, 'child') as child:
                    with self.assertRaises(AdapterError) as caught:
                        getattr(service, method)({'raw': 'sample', 'sourceNodeId': 'root', 'name': 'sample',
                                                 'dictionarySelection': selection})
                    self.assertEqual(caught.exception.code, 'DICTIONARY_SELECTION')
                    child.assert_not_called()

    def test_changed_dataset_after_work_rejects_all_three_definition_routes(self):
        service = self.service()
        def changed(*_args, **_kwargs):
            rows = [*self.rows]; rows[0] = {**rows[0], 'd': 'changed sense'}
            self.dataset.write_bytes(gzip.compress(json.dumps(rows).encode(), mtime=0))
            return {'raw': 'sample'}
        for method in ('node_definition', 'composition_define', 'lexicon_update'):
            self.dataset.write_bytes(self.original)
            with self.subTest(method=method), patch.object(service, 'child', side_effect=changed), \
                    patch.object(service, '_preview', side_effect=changed):
                with self.assertRaises(AdapterError) as caught:
                    getattr(service, method)({'raw': 'sample', 'sourceNodeId': 'root', 'name': 'sample',
                        'scope': 'shared', 'dictionarySelection': self.selection, 'definition': 'forged'})
                self.assertEqual(caught.exception.code, 'DICTIONARY_SELECTION')
                self.assertIn('mudou', str(caught.exception))


@unittest.skipUnless((REAL/'nhe-enga/docs/dict-conjugated.json.gz').exists(), 'local dictionary unavailable')
class ActualDictionaryLookupTests(unittest.TestCase):
    def test_tekateymeyma_is_an_example_inside_ekateyma_not_a_headword(self):
        for query in ("tekate'yme'yma", "ekate'yme'yma"):
            own = dictionary_lookup(REAL/'nhe-enga', {'query': query, 'matchField': 'headword'})
            self.assertEqual(own['total'], 0)
            body = dictionary_lookup(REAL/'nhe-enga', {'query': query, 'matchField': 'definition'})
            self.assertEqual(body['total'], 1)
            entry = body['results'][0]
            self.assertEqual(entry['headword'], "ekate'yma")
            self.assertEqual(entry['matchedField'], 'definition')
            self.assertIn("tekate'yme'yma", entry['matchedExcerpt'])
            self.assertIn('liberalidade', entry['matchedExcerpt'])
            self.assertIn('(s.) - avareza:', entry['definition'])


@unittest.skipUnless((REAL/'oldtupicorpus/historic/lexicon.tu.py').exists(), 'local engine unavailable')
class DictionaryDefinitionIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(); cls.addClassCleanup(cls.temp.cleanup)
        cls.parent = Path(cls.temp.name); cls.corpus = cls.parent/'oldtupicorpus'; cls.corpus.mkdir()
        for folder in ('historic', 'authoring', 'ground_truth'):
            shutil.copytree(REAL/'oldtupicorpus'/folder, cls.corpus/folder,
                            ignore=shutil.ignore_patterns('__pycache__'))
        (cls.parent/'nhe-enga').symlink_to(REAL/'nhe-enga', target_is_directory=True)
        cls.source = cls.corpus/'historic'/f'{SOURCE}.tu.py'
        cls.lexicon = cls.corpus/'historic/lexicon.tu.py'
        text = cls.lexicon.read_text()
        exports = next(node for node in ast.parse(text).body if isinstance(node, ast.Assign)
                       and any(isinstance(target, ast.Name) and target.id=='__all__' for target in node.targets))
        offset = sum(map(len, text.splitlines(keepends=True)[:exports.lineno-1]))
        text = text[:offset]+"studio_dict_subject = Noun('poropotara', definition='(m) (s.) - fixture base')\n"+text[offset:]
        cls.lexicon.write_text(text)
        cls.original_source = cls.source.read_bytes(); cls.original_lexicon = cls.lexicon.read_bytes()
        subprocess.run(['git', 'init', '--quiet', str(cls.corpus)], check=True)
        subprocess.run(['git', '-C', str(cls.corpus), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(cls.corpus), '-c', 'user.name=Studio Test',
                        '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'disposable dictionary fixture'], check=True)
        cls.entry = next(row for row in dictionary_lookup(REAL/'nhe-enga', {'query': 'poropotara', 'matchField': 'headword'})['results']
                         if row['headword']=='poropotara' and row['match']=='exact')
        cls.selection = {key: cls.entry[key] for key in ('entryIndex', 'datasetFingerprint')}

    def setUp(self):
        self.source.write_bytes(self.original_source); self.lexicon.write_bytes(self.original_lexicon)
        self.adapter = ProjectAdapter(self.parent/'state')
        self.project = self.adapter.open_project(str(self.parent))
        self.passage = next(row for row in self.project['passages'] if row['sourceId']==SOURCE)

    def params(self, **extra):
        return {'passageId': self.passage['id'], 'engineFingerprint': self.project['engineFingerprint'],
                'revisionId': 'dictionary-meaning', **extra}

    def evaluate(self, raw):
        return self.adapter.invoke('evaluate_expression', self.params(raw=raw))

    def test_exact_node_selection_ignores_forged_text_and_preserves_sibling(self):
        part = '(potar * moro).var(1).base_nominal()'
        raw = f'({part}) @ ({part})'; before = self.evaluate(raw)
        changed = self.adapter.invoke('node_definition', self.params(raw=raw, sourceNodeId='root/left',
            dictionarySelection=self.selection, definition='forged', entryRecord={'d': 'forged'}))
        self.assertEqual(changed['dictionaryEntry'], self.entry_without_match())
        after = self.evaluate(changed['raw'])
        self.assertEqual((before['surface'], before['annotated']), (after['surface'], after['annotated']))
        left, right = [child['node'] for child in after['definitionContext']['root']['children']]
        self.assertEqual(left['compositeDefinition'], self.entry['definition'])
        self.assertNotIn('compositeDefinition', right)
        def without_positions(value):
            if isinstance(value, dict):
                return {key: without_positions(item) for key, item in value.items() if key not in ('start', 'end')}
            if isinstance(value, list):return [without_positions(item) for item in value]
            return value
        # The longer left definition necessarily shifts the sibling's source
        # offsets; its actual expression, meanings and source identities stay.
        self.assertEqual(without_positions(right), without_positions(before['definitionContext']['root']['children'][1]['node']))
        self.assertNotIn('forged', changed['raw'])
        self.assertEqual(self.source.read_bytes(), self.original_source)
        self.assertEqual(self.lexicon.read_bytes(), self.original_lexicon)

    def entry_without_match(self):
        return {key: value for key, value in self.entry.items() if key not in ('match', 'matchedField', 'matchedExcerpt')}

    def test_dictionary_composition_keeps_comments_and_inner_custom_meaning(self):
        raw = """studio_define( # selected wrapper
    (studio_define(potar, 'retain component meaning') * moro).var(1).base_nominal(), # constituent
    'old whole meaning' # former whole meaning
)"""
        before = self.evaluate(raw)
        changed = self.adapter.invoke('composition_define', self.params(raw=raw,
            dictionarySelection=self.selection, definition='forged', reuseBaseDefinitions=True))
        self.assertEqual(changed['restored'], [])
        self.assertEqual(changed['raw'].count('studio_define'), 2)
        for comment in ('# selected wrapper', '# constituent', '# former whole meaning'):
            self.assertEqual(changed['raw'].count(comment), 1)
        after = self.evaluate(changed['raw'])
        self.assertEqual((before['surface'], before['annotated']), (after['surface'], after['annotated']))
        nodes = list(meanings(after['definitionContext']['root']))
        self.assertEqual(nodes[0]['compositeDefinition'], self.entry['definition'])
        self.assertIn('retain component meaning', [node.get('baseDefinition') for node in nodes])

    def test_dictionary_composition_publishes_and_reopens_with_constituent_definitions(self):
        raw = '(potar * moro).var(1).base_nominal()'; before = self.evaluate(raw)
        changed = self.adapter.invoke('composition_define', self.params(raw=raw, dictionarySelection=self.selection))
        preview = self.adapter.invoke('source_preview', self.params(raw=changed['raw']))
        self.assertTrue(preview['regression']['ok'])
        self.project = self.adapter.invoke('source_apply', preview)
        self.adapter = ProjectAdapter(self.parent/'state'); self.project = self.adapter.open_project(str(self.parent))
        self.passage = next(row for row in self.project['passages'] if row['id']==self.passage['id'])
        reopened = self.evaluate(self.passage['sourceExpression'])
        self.assertEqual((before['surface'], before['annotated']), (reopened['surface'], reopened['annotated']))
        nodes = list(meanings(reopened['definitionContext']['root']))
        self.assertEqual(nodes[0]['compositeDefinition'], self.entry['definition'])
        expected = {node['baseDefinition'] for node in meanings(before['definitionContext']['root']) if 'baseDefinition' in node}
        self.assertTrue(expected)
        self.assertTrue(expected <= {node['baseDefinition'] for node in nodes if 'baseDefinition' in node})

    def test_shared_selected_definition_preserves_constructor_and_full_sense(self):
        preview = self.adapter.invoke('lexicon_update', self.params(name='studio_dict_subject', scope='shared',
            preserveGrammar=True, dictionarySelection=self.selection, definition='forged'))
        self.assertEqual(preview['dictionaryEntry']['definition'], self.entry['definition'])
        self.project = self.adapter.invoke('source_apply', preview)
        entry = self.adapter.invoke('lexicon_inspect', self.params(name='studio_dict_subject'))
        self.assertEqual(entry['definition'], self.entry['definition'])
        self.assertIn("studio_dict_subject = Noun('poropotara', definition='(m) (s.) - fixture base')", self.lexicon.read_text())

    def test_example_interpretation_remains_manual_and_keeps_base_dictionary_sense(self):
        entry = dictionary_lookup(REAL/'nhe-enga', {'query': "tekate'yme'yma", 'matchField': 'definition'})['results'][0]
        raw = f"-Noun(value={entry['headword']!r}, definition={entry['definition']!r})"
        before = self.evaluate(raw)
        changed = self.adapter.invoke('node_definition', self.params(raw=raw, sourceNodeId='root', definition='liberalidade'))
        self.assertNotIn('dictionaryEntry', changed)
        after = self.evaluate(changed['raw'])
        self.assertEqual(after['surface'], "tekate'yme'yma")
        self.assertEqual(after['annotated'], before['annotated'])
        nodes = list(meanings(after['definitionContext']['root']))
        self.assertEqual(nodes[0]['compositeDefinition'], 'liberalidade')
        self.assertIn(entry['definition'], [node.get('baseDefinition') for node in nodes])


if __name__=='__main__':
    unittest.main()
