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
from shared_definition import edit_target, module_bindings
from shared_definition_imports import plan,DefinitionImportError

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3])))


class SharedDefinitionIdentityTests(unittest.TestCase):
    def test_annotation_review_does_not_relax_other_publication_checks(self):
        import copy
        from publication_regression import compare
        before={'source':{'rows':[{'ordinal':1,'code':'word','surface':'aba',
                'annotated':'aba[ROOT]','reference':'aba'}]}}
        after=copy.deepcopy(before)
        after['source']['rows'][0]['annotated']='a[ROOT]ba[ROOT]'
        self.assertFalse(compare(before,after)['ok'])
        reviewed=compare(before,after,allow_annotation_changes=True)
        self.assertTrue(reviewed['ok'])
        self.assertEqual(reviewed['annotationChanges'],[{'sourceId':'source','ordinal':1,
                         'before':'aba[ROOT]','after':'a[ROOT]ba[ROOT]'}])
        for key,value in (('surface','other'),('reference','other'),('error','failure'),('code','other'),('id','another')):
            changed=copy.deepcopy(after);changed['source']['rows'][0][key]=value
            with self.subTest(key=key):
                self.assertFalse(compare(before,changed,allow_annotation_changes=True)['ok'])
        for rows in ([],[after['source']['rows'][0],after['source']['rows'][0]]):
            self.assertFalse(compare(before,{'source':{'rows':rows}},allow_annotation_changes=True)['ok'])

    def test_definition_dependency_graph_resolves_forward_edges_and_preserves_source_blocks(self):
        text="""from engine import *
# old identity
old = Noun('aba')
# canonical identity
canonical = base.copy()
canonical.definition = 'new meaning'
# base identity
base = Noun('aba')
"""
        result=plan(text,'lexicon',3,'canonical.copy()')
        self.assertEqual([entry['name'] for entry in result['imports']],['base','canonical'])
        self.assertLess(result['text'].index('base ='),result['text'].index('canonical ='))
        self.assertLess(result['text'].index('canonical ='),result['text'].index('old ='))
        for comment in ('# old identity','# canonical identity','# base identity'):
            self.assertEqual(result['text'].count(comment),1)
        self.assertEqual(ast.parse(result['text']).body[-1].lineno,result['line'])

    def test_dependency_graph_rejects_cycles_rebinding_and_contextual_mutation(self):
        cases=(
            "old = Noun('aba')\ncanonical = old.copy()\n",
            "old = Noun('aba')\ncanonical = base.copy()\nbase = canonical.copy()\n",
            "old = Noun('aba')\ncanonical = Noun('first')\ncanonical = Noun('second')\n",
            "old = Noun('aba')\nbase = Noun('aba')\nother = Noun('aba')\nbase.definition = 'changed'\ncanonical = base.copy()\n",
        )
        for text in cases:
            with self.subTest(text=text),self.assertRaises(DefinitionImportError):
                plan(text,'lexicon',1,'canonical.copy()')

    def test_storage_identity_is_stable_only_for_a_unique_module_binding(self):
        with tempfile.TemporaryDirectory() as temporary:
            corpus=Path(temporary)
            source=corpus/'historic/lexicon.tu.py';source.parent.mkdir()
            source.write_text("word = Noun('first')\nword = Noun('second')\n")
            first=edit_target(corpus,{'name':'word','sourcePath':str(source),'line':1})
            second=edit_target(corpus,{'name':'word','sourcePath':str(source),'line':2})
            self.assertEqual(first['storageId'],first['declarationId'])
            self.assertEqual(second['storageId'],second['declarationId'])
            self.assertNotEqual(first['storageId'],second['storageId'])
            source.write_text("word = Noun('first')\n")
            unique=edit_target(corpus,{'name':'word','sourcePath':str(source),'line':1})
            source.write_text("# inserted elsewhere\nword = Noun('first')\n")
            shifted=edit_target(corpus,{'name':'word','sourcePath':str(source),'line':2})
            self.assertNotEqual(unique['declarationId'],shifted['declarationId'])
            self.assertEqual(unique['storageId'],shifted['storageId'])

    def test_binding_inventory_counts_imports_and_module_rebindings_not_function_locals(self):
        tree=ast.parse('''from values import root as piece
import source as piece
piece: object
piece, other = pair
piece += other
if enabled:
    piece = other
def helper(piece):
    piece = other
    return piece
class Group:
    piece = other
mapper = lambda piece: piece
''')
        counts=module_bindings(tree)
        self.assertEqual(counts['piece'],6)
        self.assertEqual(counts['helper'],1)
        self.assertEqual(counts['Group'],1)


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
# canonical dependency identity
studio_tree_base = Noun('aba', definition='canonical base')
# canonical shared identity
studio_tree_canonical = studio_tree_base.copy()
studio_tree_canonical.definition = 'canonical meaning'

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
        for directory in ('historic','authoring','ground_truth'):
            for path in (self.corpus/directory).rglob('*'):
                if path.is_file() and path not in self.originals:
                    path.unlink()
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
        later=self.adapter.invoke('lexicon_tree_evaluate',self.request('studio_tree_later'))
        self.assertNotEqual(later.get('evaluationStatus'),'partial')
        self.assertEqual(later['surface'],'late')
        self.assertEqual([item['name'] for item in later['definitionImports']],['studio_tree_later'])
        self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])

    def test_full_lexicon_search_inspection_and_alias_preview_share_dependency_resolution(self):
        target=self.inspect()['treeEdit']
        owner={'name':target['name'],'expectedExpression':target['expression'],
               'sourceFingerprint':target['sourceFingerprint'],'declarationId':target['declarationId'],
               'declarationSourceId':target['sourceId'],'declarationLine':target['line']}
        search=self.adapter.invoke('lexicon_search',{'passageId':self.passage['id'],
            'query':'studio_tree_canonical','definitionContext':owner,'includeLaterDefinitions':True})
        canonical=next(item for item in search['results'] if item['name']=='studio_tree_canonical')
        self.assertTrue(canonical['treeEdit']['editable'])
        self.assertNotIn('reuseBlockedReason',canonical)
        self.assertEqual([item['name'] for item in canonical['definitionImports']],
                         ['studio_tree_base','studio_tree_canonical'])
        nested=self.adapter.invoke('lexicon_inspect',{'passageId':self.passage['id'],
            'name':'studio_tree_canonical','definitionContext':owner})
        self.assertEqual(nested['treeEdit']['declarationId'],canonical['treeEdit']['declarationId'])
        self.assertEqual(nested['definition'],'canonical meaning')
        request=self.request('studio_tree_canonical.copy()')
        rendered=self.adapter.invoke('lexicon_tree_evaluate',{**request,'includeMorphology':True})
        self.assertEqual(rendered['surface'],'aba')
        self.assertEqual([item['name'] for item in rendered['definitionImports']],
                         ['studio_tree_base','studio_tree_canonical'])
        def provenance(node):
            yield node.get('provenance',{})
            for child in node.get('children',[]):
                yield from provenance(child['node'])
        declaration=next(item for item in provenance(rendered['definitionContext']['root'])
                         if item.get('name')=='studio_tree_canonical')
        self.assertEqual(declaration['line'],canonical['treeEdit']['line'])
        self.assertEqual(declaration['sourcePath'],canonical['sourcePath'])
        before={path:path.read_bytes() for path in self.originals}
        preview=self.adapter.invoke('lexicon_tree_preview',request)
        self.assertTrue(preview['regression']['ok'])
        self.assertGreater(preview['regression']['checked'],100)
        self.assertEqual(preview['regression']['changed'],0)
        self.assertEqual(preview['definitionImports'],rendered['definitionImports'])
        self.assertEqual({path:path.read_bytes() for path in before},before)
        self.project=self.adapter.invoke('source_apply',preview)
        text=self.lexicon.read_text()
        self.assertLess(text.index('studio_tree_base ='),text.index('studio_tree_canonical ='))
        self.assertLess(text.index('studio_tree_canonical ='),text.index('studio_tree_word ='))
        self.assertEqual(text.count('# canonical dependency identity'),1)
        self.assertEqual(text.count('# canonical shared identity'),1)
        self.assertEqual(text.count('# retain this historical comment'),1)
        self.assertEqual(self.inspect()['definition'],'meaning override')
        self.assertEqual(self.inspect('studio_tree_canonical')['definition'],'canonical meaning')
        self.assertEqual(self.inspect()['treeEdit']['expression'],'studio_tree_canonical.copy()')
        # Both aliases remain named references and follow future canonical edits.
        alias=self.adapter.invoke('evaluate_expression',{'passageId':self.passage['id'],'raw':'studio_tree_alias'})
        self.assertEqual(alias['surface'],'aba')

    def test_cycle_ambiguous_dependencies_and_changed_forward_candidates_never_publish(self):
        for raw in ('studio_tree_word.copy()','studio_tree_alias.copy()'):
            with self.subTest(raw=raw),self.assertRaises(AdapterError) as caught:
                self.adapter.invoke('lexicon_tree_evaluate',self.request(raw))
            self.assertEqual(caught.exception.code,'LEXICAL_DEPENDENCY')
        request=self.request('studio_tree_canonical.copy()')
        self.lexicon.write_text(self.lexicon.read_text().replace("'canonical meaning'","'changed canonical meaning'"))
        self.project=self.adapter.refresh_project()
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('lexicon_tree_evaluate',request)
        self.assertEqual(caught.exception.code,'STALE_ENGINE')

    def test_indirect_meaning_mutation_cannot_change_imported_definition_state(self):
        text=self.lexicon.read_text()
        text=text.replace('studio_tree_word = Noun(',
            "studio_tree_prior_base = Noun('aba', definition='original meaning')\n"
            'studio_tree_indirect = studio_tree_prior_base\n'
            'studio_tree_word = Noun(',1)
        text=text.replace('__all__ = [',
            "studio_tree_indirect.definition = 'canonical meaning'\n"
            'studio_tree_unsafe_canonical = studio_tree_prior_base.copy()\n'
            '__all__ = [',1)
        self.lexicon.write_text(text)
        self.project=self.adapter.refresh_project()
        before=self.lexicon.read_bytes()
        request=self.request('studio_tree_unsafe_canonical.copy()')
        # The static graph alone cannot recognize that `indirect` shares the
        # dependency object. The complete runtime-state guard must reject it.
        target=self.inspect()['treeEdit']
        self.assertEqual([entry['name'] for entry in plan(text,'lexicon',target['line'],request['raw'])['imports']],
                         ['studio_tree_unsafe_canonical'])
        for method in ('lexicon_tree_evaluate','lexicon_tree_preview'):
            with self.subTest(method=method),self.assertRaises(AdapterError) as caught:
                self.adapter.invoke(method,request)
            self.assertEqual(caught.exception.code,'LEXICAL_DEPENDENCY')
            self.assertIn('significado',str(caught.exception))
        self.assertEqual(self.lexicon.read_bytes(),before)
        self.assertEqual(self.inspect('studio_tree_unsafe_canonical')['definition'],'canonical meaning')

    def test_annotation_only_shared_edit_requires_exact_review_without_approving_references(self):
        request=self.request("(Noun('a') / Noun('ba')).copy()")
        preview=self.adapter.invoke('lexicon_tree_preview',request)
        self.assertTrue(preview['regression']['ok'])
        changes=preview['annotationChanges']
        self.assertEqual(len(changes),3)
        self.assertTrue(all(item['before']!=item['after'] for item in changes))
        self.assertEqual({item['sourceId'] for item in changes},
                         {'studio_definition_fixture','studio_definition_second'})
        for receipt in (None,False,1,'true'):
            params={**preview,'annotationChanges':[]}
            if receipt is not None: params['reviewedAnnotationChanges']=receipt
            with self.subTest(receipt=receipt),self.assertRaises(AdapterError) as caught:
                self.adapter.invoke('source_apply',params)
            self.assertEqual(caught.exception.code,'REVIEW_REQUIRED')
            self.assertEqual(self.lexicon.read_bytes(),self.originals[self.lexicon])
        self.project=self.adapter.invoke('source_apply',{**preview,'reviewedAnnotationChanges':True})
        self.assertEqual(self.adapter.invoke('evaluate_expression',
                         {'passageId':self.passage['id'],'raw':'studio_tree_word'})['surface'],'aba')
        for path,data in self.originals.items():
            if 'ground_truth' in path.parts:self.assertEqual(path.read_bytes(),data)
        import json
        journal=json.loads((self.adapter.state_dir/'recovery'/(preview['previewId']+'.json')).read_text())
        self.assertEqual(journal['reviewedAnnotationChanges'],changes)

    def test_annotation_review_still_blocks_surface_changes_and_stale_source(self):
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('lexicon_tree_preview',self.request("Noun('a') / Noun('ra')"))
        self.assertEqual(caught.exception.code,'REGRESSION_FAILED')
        preview=self.adapter.invoke('lexicon_tree_preview',self.request("Noun('a') / Noun('ba')"))
        self.lexicon.write_text(self.lexicon.read_text()+'\n# concurrent definition edit\n')
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('source_apply',{**preview,'reviewedAnnotationChanges':True})
        self.assertEqual(caught.exception.code,'STALE_SOURCE')

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

    def test_read_refresh_keeps_explicit_declaration_after_save_and_line_shift(self):
        passage=next(item for item in self.project['passages'] if item['sourceId']=='studio_definition_second' and item['ordinal']==2)
        original=self.inspect()['treeEdit']
        locator={'name':original['name'],'declarationSourceId':original['sourceId'],
                 'declarationLine':original['line'],'declarationId':original['declarationId']}
        preview=self.adapter.invoke('lexicon_tree_preview',self.request("Noun('aba').copy()"))
        self.project=self.adapter.invoke('source_apply',preview)
        # The passage's same-named local object must not replace the shared tab.
        fresh=self.adapter.invoke('lexicon_inspect',{'passageId':passage['id'],'name':original['name'],'declarationTarget':locator})
        self.assertEqual(fresh['treeEdit']['scope'],'shared')
        self.assertIn('.copy()',fresh['expression'])
        self.assertEqual(fresh['definition'],'meaning override')
        self.assertNotEqual(fresh['treeEdit']['sourceFingerprint'],original['sourceFingerprint'])
        self.lexicon.write_text('# harmless earlier line\n'+self.lexicon.read_text())
        self.project=self.adapter.refresh_project()
        shifted=self.adapter.invoke('lexicon_inspect',{'passageId':passage['id'],'name':original['name'],'declarationTarget':locator})
        self.assertEqual(shifted['line'],original['line']+1)
        self.assertNotEqual(shifted['treeEdit']['declarationId'],original['declarationId'])
        self.assertEqual(shifted['treeEdit']['storageId'],original['storageId'])
        self.assertEqual(shifted['definition'],'meaning override')
        self.lexicon.write_text(self.lexicon.read_text().replace('__all__ = [',"studio_tree_word = Noun('another')\n__all__ = [",1))
        self.project=self.adapter.refresh_project()
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('lexicon_inspect',{'passageId':passage['id'],'name':original['name'],'declarationTarget':locator})
        self.assertEqual(caught.exception.code,'STALE_SOURCE')

    def test_promoted_enosem_variant_survives_reference_approval_and_reopens_as_authoring_steps(self):
        # The actual production declaration is (((ero) * (sem)).var(1)).copy().
        # Supply its lexical base in this disposable corpus; the older laptop
        # corpus does not necessarily contain the newer production sem entry.
        self.lexicon.write_text(self.lexicon.read_text().replace('__all__ = [',"sem = Verb('sem')\n__all__ = [",1))
        self.project=self.adapter.refresh_project()
        raw="studio_define((((ero) * (sem)).var(1)), 'retirar; resgatar — variante preservada')"
        expected=self.adapter.invoke('evaluate_expression',{'passageId':self.passage['id'],'raw':raw})
        before={path:path.read_bytes() for path in self.originals}
        preview=self.adapter.invoke('source_new_preview',{'sourceId':self.passage['sourceId'],'raw':raw})
        self.assertEqual({path:path.read_bytes() for path in before},before)
        self.project=self.adapter.invoke('source_apply',preview)
        passage=next(item for item in self.project['passages'] if item['id']==preview['targetPassageId'])
        name=passage['sourceExpression']
        self.assertTrue(name.isidentifier(),name)
        self.assertNotEqual(name,'enosem')
        approved=self.adapter.invoke('reference_approve',{'passageId':passage['id'],
            'sourceFingerprint':passage['sourceFingerprint'],'reviewedSurface':expected['surface']})
        self.project=approved['project']
        self.adapter=ProjectAdapter(self.parent/'state')
        self.project=self.adapter.open_project(str(self.parent))
        passage=next(item for item in self.project['passages'] if item['id']==passage['id'])
        self.assertEqual(passage['sourceExpression'],name)
        self.assertEqual(passage['acceptedReference'],expected['surface'])
        inspected=self.inspect(name,passage)
        self.assertEqual(inspected['expression'],'(((ero) * (sem)).var(1)).copy()')
        def nodes(node):
            return [node]+[item for child in node['children'] for item in nodes(child['node'])]
        variants=[node for node in nodes(inspected['authoring']['root']) if node.get('method')=='var']
        self.assertEqual(len(variants),1)
        variant=variants[0]
        encoded=inspected['expression'].encode('utf-16-le')
        self.assertEqual(encoded[variant['start']*2:variant['end']*2].decode('utf-16-le'),variant['code'])
        self.assertEqual(variant['children'][1]['node']['value'],1)
        self.assertEqual(inspected['runtimeTree']['nodes'][0]['attributes']['variation_id'],1)
        target=inspected['treeEdit']
        request={'passageId':passage['id'],'name':name,'raw':target['expression'],
                 'expectedExpression':target['expression'],'sourceFingerprint':target['sourceFingerprint'],
                 'declarationId':target['declarationId'],'declarationSourceId':target['sourceId'],
                 'declarationLine':target['line'],'engineFingerprint':self.project['engineFingerprint']}
        result=self.adapter.invoke('lexicon_tree_evaluate',request)
        self.assertEqual(result['surface'],expected['surface'])
        self.assertEqual(result['annotated'],expected['annotated'])
        saved={path:path.read_bytes() for path in self.corpus.rglob('*') if path.is_file() and '.git' not in path.parts}
        unchanged=self.adapter.invoke('lexicon_tree_preview',request)
        self.assertEqual(unchanged['diff'],'')
        self.assertEqual({path:path.read_bytes() for path in saved},saved)


if __name__=='__main__':
    unittest.main()
