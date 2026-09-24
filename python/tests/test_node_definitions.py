"""Definition edits preserve occurrence scope, grammar and published provenance."""
from pathlib import Path
import ast
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import ProjectAdapter, AdapterError

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3])))
OLD = '(t) (s.) - mão de pilão'
NEW = '(t) (etim. - o que está em face) (s.) - oposto, contrário'


@unittest.skipUnless((REAL/'oldtupicorpus/historic/lexicon.tu.py').exists(), 'local engine fixture unavailable')
class NodeDefinitionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name)
        self.corpus = self.parent/'oldtupicorpus'; self.corpus.mkdir()
        for folder in ('historic', 'authoring', 'tests', 'ground_truth'):
            shutil.copytree(REAL/'oldtupicorpus'/folder, self.corpus/folder,
                            ignore=shutil.ignore_patterns('__pycache__'))
        (self.parent/'nhe-enga').symlink_to(REAL/'nhe-enga', target_is_directory=True)
        self.lexicon = self.corpus/'historic/lexicon.tu.py'
        text = self.lexicon.read_text()
        anchor = next(node for node in ast.parse(text).body if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == '__all__' for target in node.targets))
        offset = sum(map(len, text.splitlines(keepends=True)[:anchor.lineno-1]))
        text = text[:offset] + f"studio_test_oba = Noun('obaîxûara', definition={OLD!r})\n" + text[offset:]
        self.lexicon.write_text(text)
        subprocess.run(['git', 'init', '--quiet', str(self.corpus)], check=True)
        subprocess.run(['git', '-C', str(self.corpus), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.corpus), '-c', 'user.name=Studio Test',
                        '-c', 'user.email=test@example.invalid', 'commit', '--quiet',
                        '-m', 'disposable definition fixture'], check=True)
        self.adapter = ProjectAdapter(self.parent/'state')
        self.project = self.adapter.open_project(str(self.parent))
        self.passage = self.project['passages'][0]

    def request(self, raw, node='root', **extra):
        return {'passageId': self.passage['id'], 'raw': raw, 'sourceNodeId': node,
                'revisionId': 'reviewed-node', 'engineFingerprint': self.project['engineFingerprint'],
                'definition': NEW, **extra}

    def evaluate(self, raw):
        return self.adapter.invoke('evaluate_expression', self.request(raw))

    def test_repeated_leaf_override_changes_only_one_occurrence_and_can_be_replaced_or_removed(self):
        raw = 'studio_test_oba @ studio_test_oba'
        before = self.evaluate(raw)
        changed = self.adapter.invoke('node_definition', self.request(raw, 'root/left'))
        after = self.evaluate(changed['raw'])
        self.assertEqual((before['surface'], before['annotated']), (after['surface'], after['annotated']))
        self.assertIn('studio_define', changed['raw'])
        self.assertEqual(changed['raw'].count('studio_define'), 1)
        meanings = after['definitionContext']['root']['children']
        self.assertEqual(meanings[0]['node']['baseDefinition'], NEW)
        self.assertEqual(meanings[1]['node']['baseDefinition'], OLD)
        original = self.adapter.invoke('lexicon_inspect', {'passageId':self.passage['id'], 'name':'studio_test_oba'})
        self.assertEqual(original['definition'], OLD)
        second = self.adapter.invoke('node_definition', self.request(changed['raw'], 'root/left', definition='contrário'))
        self.assertEqual(second['raw'].count('studio_define'), 1)
        removed = self.adapter.invoke('node_definition', self.request(second['raw'], 'root/left', action='inherit'))
        self.assertNotIn('studio_define', removed['raw'])
        self.assertEqual(self.evaluate(removed['raw'])['annotated'], before['annotated'])

    def test_composite_and_empty_local_definition_keep_constituents_and_source_bytes(self):
        source = self.corpus/'historic'/f"{self.passage['sourceId']}.tu.py"
        originals = (source.read_bytes(), self.lexicon.read_bytes())
        raw = '(studio_test_oba @ studio_test_oba)'
        changed = self.adapter.invoke('node_definition', self.request(raw, definition='oposição no conjunto'))
        outer = self.evaluate(changed['raw'])['definitionContext']['root']
        self.assertEqual(outer['compositeDefinition'], 'oposição no conjunto')
        self.assertIn(OLD, str(outer['children']))
        empty = self.adapter.invoke('node_definition', self.request(changed['raw'], definition=''))
        self.assertEqual(self.evaluate(empty['raw'])['definitionContext']['root']['compositeDefinition'], '')
        self.assertEqual(originals, (source.read_bytes(), self.lexicon.read_bytes()))

    def test_redefining_an_existing_nominal_changes_only_its_meaning_literal(self):
        raw = '''studio_define(
    (studio_define(potar, 'sentido próprio da raiz') * moro).var(1).base_nominal(),
    'sentido anterior do conjunto', # keep the contributor comment
)'''
        before = self.evaluate(raw)
        changed = self.adapter.invoke('node_definition', self.request(raw, definition='sentido revisto do conjunto'))
        self.assertEqual(changed['raw'], raw.replace("'sentido anterior do conjunto'", "'sentido revisto do conjunto'"))
        self.assertEqual(changed['raw'].count('studio_define'), 2)
        after = self.evaluate(changed['raw'])
        self.assertEqual((before['surface'], before['annotated']), (after['surface'], after['annotated']))
        self.assertEqual(after['definitionContext']['root']['compositeDefinition'], 'sentido revisto do conjunto')
        self.assertIn('sentido próprio da raiz', str(after['definitionContext']['root']))
        again = self.adapter.invoke('node_definition', self.request(changed['raw'], definition='segunda revisão'))
        self.assertEqual(again['raw'], raw.replace("'sentido anterior do conjunto'", "'segunda revisão'"))

    def test_invalid_scope_and_stale_engine_cannot_edit(self):
        for params in (self.request('studio_test_oba', 'missing'),
                       self.request('42'),
                       self.request('studio_test_oba'+' '*100000),
                       self.request('studio_test_oba', action='inherit'),
                       self.request('studio_test_oba', engineFingerprint='old-engine')):
            with self.assertRaises(AdapterError):
                self.adapter.invoke('node_definition', params)

    def test_keyword_override_can_be_replaced_and_removed_without_nesting(self):
        for raw in ("studio_define(studio_test_oba, definition='old')",
                    "studio_define(value=studio_test_oba, definition='old')",
                    "studio_define(definition='old', value=studio_test_oba)"):
            with self.subTest(raw=raw):
                changed = self.adapter.invoke('node_definition', self.request(raw, definition='new'))
                self.assertEqual(changed['raw'].count('studio_define'),1)
                self.assertEqual(self.evaluate(changed['raw'])['definitionContext']['root']['baseDefinition'],'new')
                removed = self.adapter.invoke('node_definition', self.request(changed['raw'], action='inherit'))
                self.assertNotIn('studio_define',removed['raw'])
                self.assertEqual(self.evaluate(removed['raw'])['definitionContext']['root']['baseDefinition'],OLD)

    def test_override_set_and_inherit_preserve_all_source_comments(self):
        raw = '''studio_define( # wrapper comment
    definition=(
        'old' # meaning comment
        ' joined'
    ),
    value # binding comment
    = (
        # before operand
        studio_test_oba # after operand
    ) # after value
)'''
        comments = ['# wrapper comment','# meaning comment','# binding comment',
                    '# before operand','# after operand','# after value']
        changed = self.adapter.invoke('node_definition', self.request(raw, definition='new'))
        self.assertEqual(changed['raw'].count('studio_define'),1)
        for comment in comments:self.assertEqual(changed['raw'].count(comment),1)
        self.assertEqual(self.evaluate(changed['raw'])['definitionContext']['root']['baseDefinition'],'new')
        removed = self.adapter.invoke('node_definition', self.request(changed['raw'], action='inherit'))
        for comment in comments:self.assertEqual(removed['raw'].count(comment),1)
        self.assertNotIn('studio_define',removed['raw'])
        self.assertEqual(self.evaluate(removed['raw'])['definitionContext']['root']['baseDefinition'],OLD)
        self.assertEqual(self.evaluate(removed['raw'])['annotated'],self.evaluate(raw)['annotated'])
        preview = self.adapter.invoke('source_preview',{'passageId':self.passage['id'],'raw':removed['raw']})
        self.project = self.adapter.invoke('source_apply',preview)
        self.passage = next(item for item in self.project['passages'] if item['id']==self.passage['id'])
        for comment in comments:self.assertEqual(self.passage['sourceExpression'].count(comment),1)
        self.assertEqual(self.evaluate(self.passage['sourceExpression'])['definitionContext']['root']['baseDefinition'],OLD)

    def test_pending_definition_edit_uses_the_append_namespace(self):
        source = self.corpus/'historic'/f"{self.passage['sourceId']}.tu.py"
        text = source.read_text()
        marker = self.passage['sourceId'] + ' = l'
        source.write_text(text.replace(marker,"pending_definition_probe = Noun('aba', definition='before')\n" + marker + "\npending_definition_probe = Noun('different', definition='after')"))
        self.project = self.adapter.refresh_project()
        request = {**self.request('pending_definition_probe'),
                   'passageId':'pending:'+str(uuid.uuid4()), 'sourceId':self.passage['sourceId']}
        changed = self.adapter.invoke('node_definition',request)
        self.assertIn('pending_definition_probe',changed['raw'])
        evaluated = self.adapter.invoke('evaluate_expression',{**request,'raw':changed['raw']})
        self.assertEqual(evaluated['surface'],'aba')
        self.assertEqual(evaluated['definitionContext']['root']['baseDefinition'],NEW)

    def test_local_override_survives_reviewed_publication_without_changing_shared_base(self):
        changed = self.adapter.invoke('node_definition', self.request('studio_test_oba', definition=NEW))
        preview = self.adapter.invoke('source_preview', {'passageId': self.passage['id'], 'raw': changed['raw']})
        project = self.adapter.invoke('source_apply', {'previewId':preview['previewId'], 'sourceFingerprint':preview['sourceFingerprint']})
        self.project = project
        self.passage = next(item for item in project['passages'] if item['id'] == self.passage['id'])
        result = self.evaluate(self.passage['sourceExpression'])
        self.assertIn(NEW, str(result['definitionContext']))
        original = self.adapter.invoke('lexicon_inspect', {'passageId':self.passage['id'], 'name':'studio_test_oba'})
        self.assertEqual(original['definition'], OLD)

    def test_commented_positional_override_keeps_occurrence_comments_through_promotion(self):
        raw = '''studio_define(
    Noun(
        'aba', # constructor occurrence
        definition='old' # base meaning occurrence
    ), # value occurrence
    'selected' # override occurrence
)'''
        comments = ['# constructor occurrence','# base meaning occurrence',
                    '# value occurrence','# override occurrence']
        changed = self.adapter.invoke('node_definition',self.request(raw,definition='new occurrence meaning'))
        preview = self.adapter.invoke('source_preview',{'passageId':self.passage['id'],'raw':changed['raw']})
        self.assertTrue(preview['lexicalAdditions'])
        self.project = self.adapter.invoke('source_apply',preview)
        self.adapter = ProjectAdapter(self.parent/'state')
        self.project = self.adapter.open_project(str(self.parent))
        self.passage = next(item for item in self.project['passages'] if item['id']==self.passage['id'])
        for comment in comments:
            self.assertEqual(self.passage['sourceExpression'].count(comment),1)
            self.assertNotIn(comment,self.lexicon.read_text())
        evaluated = self.evaluate(self.passage['sourceExpression'])
        self.assertEqual(evaluated['definitionContext']['root']['baseDefinition'],'new occurrence meaning')

    def test_general_definition_preview_preserves_constructor_grammar(self):
        preview = self.adapter.invoke('lexicon_update', {
            'passageId':'pending:'+str(uuid.uuid4()), 'sourceId':self.passage['sourceId'],
            'name':'studio_test_oba', 'scope':'shared',
            'definition':'oposto, contrário', 'preserveGrammar':True,
            'engineFingerprint':self.project['engineFingerprint'],
        })
        self.assertIn("+studio_test_oba.definition = 'oposto, contrário'", preview['diff'])
        self.assertIn(f"definition={OLD!r}", self.lexicon.read_text())

    def test_general_edit_targets_effective_redeclaration_and_only_its_override(self):
        text = self.lexicon.read_text()
        old_assignment = f"studio_test_oba = Noun('obaîxûara', definition={OLD!r})"
        repeated = (old_assignment + "\nstudio_test_oba.definition = 'superseded override'\n"
                    + old_assignment + "\nstudio_test_oba.definition = 'current override'")
        self.lexicon.write_text(text.replace(old_assignment,repeated))
        self.project = self.adapter.refresh_project()
        preview = self.adapter.invoke('lexicon_update',{
            'passageId':self.passage['id'],'name':'studio_test_oba','scope':'shared',
            'definition':'requested meaning','preserveGrammar':True,
            'engineFingerprint':self.project['engineFingerprint'],
        })
        self.assertIn("-studio_test_oba.definition = 'current override'",preview['diff'])
        self.assertNotIn("-studio_test_oba.definition = 'superseded override'",preview['diff'])
        self.project = self.adapter.invoke('source_apply',preview)
        actual = self.adapter.invoke('lexicon_inspect',{'passageId':self.passage['id'],'name':'studio_test_oba'})
        self.assertEqual(actual['definition'],'requested meaning')
        self.assertIn("studio_test_oba.definition = 'superseded override'",self.lexicon.read_text())

    def test_general_edit_inserts_after_last_assignment_when_earlier_override_is_stale(self):
        text = self.lexicon.read_text()
        assignment = f"studio_test_oba = Noun('obaîxûara', definition={OLD!r})"
        self.lexicon.write_text(text.replace(assignment,assignment + "\nstudio_test_oba.definition = 'superseded'\n" + assignment))
        self.project = self.adapter.refresh_project()
        preview = self.adapter.invoke('lexicon_update',{
            'passageId':self.passage['id'],'name':'studio_test_oba','scope':'shared',
            'definition':'effective new meaning','preserveGrammar':True,
            'engineFingerprint':self.project['engineFingerprint'],
        })
        self.project = self.adapter.invoke('source_apply',preview)
        actual = self.adapter.invoke('lexicon_inspect',{'passageId':self.passage['id'],'name':'studio_test_oba'})
        self.assertEqual(actual['definition'],'effective new meaning')
        self.assertIn("studio_test_oba.definition = 'superseded'",self.lexicon.read_text())

    def test_general_override_preserves_comments_inside_adjacent_meaning_literals(self):
        text = self.lexicon.read_text()
        assignment = f"studio_test_oba = Noun('obaîxûara', definition={OLD!r})"
        self.lexicon.write_text(text.replace(assignment,assignment + "\nstudio_test_oba.definition = (\n 'old' # preserve shared note\n ' joined'\n)"))
        self.project = self.adapter.refresh_project()
        preview = self.adapter.invoke('lexicon_update',{
            'passageId':self.passage['id'],'name':'studio_test_oba','scope':'shared',
            'definition':'meaning after review','preserveGrammar':True,
            'engineFingerprint':self.project['engineFingerprint'],
        })
        self.project = self.adapter.invoke('source_apply',preview)
        self.assertEqual(self.lexicon.read_text().count('# preserve shared note'),1)
        actual = self.adapter.invoke('lexicon_inspect',{'passageId':self.passage['id'],'name':'studio_test_oba'})
        self.assertEqual(actual['definition'],'meaning after review')


if __name__ == '__main__':
    unittest.main()
