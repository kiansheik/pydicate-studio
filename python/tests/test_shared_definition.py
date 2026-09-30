"""Shared-tree edits use declaration scope and regress the complete saved corpus."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3])))


@unittest.skipUnless((REAL/'oldtupicorpus/historic/lexicon.tu.py').exists(), 'selected local corpus unavailable')
class SharedDefinitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.parent = Path(cls.temporary.name)
        cls.corpus = cls.parent/'oldtupicorpus'
        for directory in ('historic', 'authoring', 'ground_truth'):
            shutil.copytree(REAL/'oldtupicorpus'/directory, cls.corpus/directory,
                            ignore=shutil.ignore_patterns('__pycache__'))
        (cls.parent/'nhe-enga').symlink_to(REAL/'nhe-enga', target_is_directory=True)
        cls.lexicon = cls.corpus/'historic/lexicon.tu.py'
        text = cls.lexicon.read_text(encoding='utf-8')
        anchor = next(node for node in ast.parse(text).body if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == '__all__' for target in node.targets))
        offset = sum(map(len, text.splitlines(keepends=True)[:anchor.lineno-1]))
        declarations = """
# retained lexical identity note
studio_tree_word = Noun(
    'aba', # retain this historical comment
    definition='original meaning')
studio_tree_word.definition = 'meaning override'
studio_tree_alias = studio_tree_word.copy()
studio_tree_later = Noun('late')
studio_tree_chain = studio_tree_other = Noun('chain')
studio_tree_helper = lambda value: value.copy()

"""
        cls.lexicon.write_text(text[:offset]+declarations+text[offset:], encoding='utf-8')
        cls.source = cls.corpus/'historic/studio_definition_fixture.tu.py'
        cls.source.write_text('from historic.lexicon import *\nl = [studio_tree_word, studio_tree_alias]\nstudio_definition_fixture = l\n', encoding='utf-8')
        cls.second = cls.corpus/'historic/studio_definition_second.tu.py'
        cls.second.write_text("from historic.lexicon import *\nl = [studio_tree_alias]\nstudio_tree_word = Noun('local')\nl += studio_tree_word\nstudio_definition_second = l\n", encoding='utf-8')
        subprocess.run(['git','init','--quiet',str(cls.corpus)],check=True)
        subprocess.run(['git','-C',str(cls.corpus),'add','.'],check=True)
        subprocess.run(['git','-C',str(cls.corpus),'-c','user.name=Studio Test','-c','user.email=test@example.invalid','commit','--quiet','-m','isolated definition fixture'],check=True)
        cls.originals = {path:path.read_bytes() for directory in ('historic','authoring','ground_truth')
                         for path in (cls.corpus/directory).rglob('*') if path.is_file()}

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def setUp(self):
        for path,data in self.originals.items():
            path.write_bytes(data)
        self.adapter = ProjectAdapter(self.parent/'state')
        self.project = self.adapter.open_project(str(self.parent))
        self.passage = next(item for item in self.project['passages'] if item['sourceId']=='studio_definition_fixture')

    def inspect(self, name='studio_tree_word', passage=None):
        return self.adapter.invoke('lexicon_inspect',{'passageId':(passage or self.passage)['id'],'name':name})

    def request(self, raw=None, *, name='studio_tree_word', passage=None):
        entry=self.inspect(name,passage)
        target=entry['treeEdit']
        return {'passageId':(passage or self.passage)['id'],'name':name,
                'raw':target['expression'] if raw is None else raw,
                'expectedExpression':target['expression'],'sourceFingerprint':target['sourceFingerprint'],
                'engineFingerprint':self.project['engineFingerprint'],'revisionId':'saved-passage-revision'}

    def test_inspection_and_partial_evaluation_use_original_declaration_scope(self):
        entry=self.inspect()
        self.assertTrue(entry['treeEdit']['editable'])
        self.assertEqual(entry['treeEdit']['scope'],'shared')
        self.assertEqual(entry['treeEdit']['sourceId'],'lexicon')
        result=self.adapter.invoke('lexicon_tree_evaluate',self.request())
        self.assertEqual(result['surface'],'aba')
        self.assertEqual(result['tree']['kind'],'call')
        self.assertEqual(result['authoring']['root']['code'],entry['treeEdit']['expression'])
        partial=self.adapter.invoke('lexicon_tree_evaluate',self.request('studio_tree_later'))
        self.assertEqual(partial['evaluationStatus'],'partial')
        self.assertIn('studio_tree_later',str(partial['failures']))
        self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])

    def test_preview_is_read_only_and_apply_preserves_all_examples_comments_and_meaning_overrides(self):
        request=self.request("Noun('aba', definition='original meaning').copy()")
        preview=self.adapter.invoke('lexicon_tree_preview',request)
        self.assertTrue(preview['regression']['ok'])
        self.assertGreater(preview['regression']['checked'],100)
        self.assertEqual(preview['regression']['changed'],0)
        self.assertEqual(len(preview['affectedUses']),3)
        self.assertEqual({path:path.read_bytes() for path in self.originals},self.originals)
        self.project=self.adapter.invoke('source_apply',preview)
        inspected=self.inspect()
        self.assertIn('.copy()',inspected['expression'])
        self.assertEqual(inspected['definition'],'meaning override')
        self.assertEqual(self.lexicon.read_text().count('# retain this historical comment'),1)
        self.assertIn('# retained lexical identity note',self.lexicon.read_text())
        for path,before in self.originals.items():
            if path!=self.lexicon:
                self.assertEqual(path.read_bytes(),before)
        for raw in ('studio_tree_word','studio_tree_alias'):
            actual=self.adapter.invoke('evaluate_expression',{'passageId':self.passage['id'],'raw':raw})
            self.assertEqual(actual['surface'],'aba')

    def test_cross_source_transitive_result_changes_block_before_writing(self):
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('lexicon_tree_preview',self.request("Noun('changed')"))
        self.assertEqual(caught.exception.code,'REGRESSION_FAILED')
        self.assertIn('studio_definition_second',str(caught.exception))
        self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])

    def test_partial_slots_and_arbitrary_python_cannot_be_published(self):
        for raw in ('studio_tree_later','__studio_slot_abcd',"__import__('os').system('false')",'Noun.__class__',"Noun('aba').eval()"):
            with self.subTest(raw=raw),self.assertRaises(AdapterError):
                self.adapter.invoke('lexicon_tree_preview',self.request(raw))
        self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])

    def test_source_shadow_targets_its_own_assignment_without_changing_shared_definition(self):
        passage=next(item for item in self.project['passages'] if item['sourceId']=='studio_definition_second' and item['ordinal']==2)
        entry=self.inspect(passage=passage)
        self.assertEqual(entry['treeEdit']['scope'],'source')
        request=self.request("Noun('local').copy()",passage=passage)
        preview=self.adapter.invoke('lexicon_tree_preview',request)
        self.assertEqual(preview['scope'],'source')
        self.assertEqual(len(preview['affectedUses']),1)
        self.project=self.adapter.invoke('source_apply',preview)
        self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])
        self.assertIn("Noun('local').copy()",self.second.read_text())

    def test_stale_declaration_and_post_regression_file_change_are_rejected(self):
        request=self.request("Noun('aba').copy()")
        wrong={**request,'expectedExpression':'stale expression'}
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('lexicon_tree_evaluate',wrong)
        self.assertEqual(caught.exception.code,'STALE_SOURCE')
        preview=self.adapter.invoke('lexicon_tree_preview',request)
        self.second.write_text(self.second.read_text()+'\n# concurrent edit\n')
        with self.assertRaises(AdapterError):
            self.adapter.invoke('source_apply',preview)
        self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])

    def test_helpers_and_chained_assignments_explain_unsupported_targets(self):
        for name in ('studio_tree_helper','studio_tree_chain'):
            with self.subTest(name=name):
                target=self.inspect(name)['treeEdit']
                self.assertFalse(target['editable'])
                self.assertTrue(target['reason'])

    def test_nested_piece_uses_owner_scope_even_when_passage_shadows_its_name(self):
        passage=next(item for item in self.project['passages'] if item['sourceId']=='studio_definition_second' and item['ordinal']==2)
        owner=self.inspect('studio_tree_alias',passage)['treeEdit']
        def descriptor(target):
            return {'name':target['name'],'expectedExpression':target['expression'],
                    'sourceFingerprint':target['sourceFingerprint'],'declarationId':target['declarationId'],
                    'declarationSourceId':target['sourceId'],'declarationLine':target['line']}
        nested=self.adapter.invoke('lexicon_inspect',{'passageId':passage['id'],'name':'studio_tree_word',
            'definitionContext':descriptor(owner)})
        self.assertEqual(self.inspect(passage=passage)['treeEdit']['scope'],'source')
        self.assertEqual(nested['treeEdit']['scope'],'shared')
        request={'passageId':passage['id'],**descriptor(nested['treeEdit']),
                 'raw':nested['treeEdit']['expression'],'engineFingerprint':self.project['engineFingerprint']}
        self.assertEqual(self.adapter.invoke('lexicon_tree_evaluate',request)['surface'],'aba')
        preview=self.adapter.invoke('lexicon_tree_preview',{**request,'raw':"Noun('aba').copy()"})
        self.assertEqual(preview['scope'],'shared')
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('lexicon_tree_evaluate',{**request,'declarationId':'wrong identity'})
        self.assertEqual(caught.exception.code,'STALE_SOURCE')


if __name__=='__main__':
    unittest.main()
