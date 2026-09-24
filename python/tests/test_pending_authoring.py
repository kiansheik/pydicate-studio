"""Pending canvas evaluation and reviewed cumulative source metadata."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_runtime import CONSTRUCTORS

REAL=Path(os.environ.get('PYDICATE_PROJECT_PARENT',str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
SOURCE='araujo_catecismo_1686'


@unittest.skipUnless((REAL/'oldtupicorpus/historic'/f'{SOURCE}.tu.py').exists(),'selected corpus not installed')
class PendingAuthoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.parent=Path(cls.temp.name)
        cls.corpus=cls.parent/'oldtupicorpus';cls.corpus.mkdir()
        for folder in ('historic','authoring','ground_truth'):
            shutil.copytree(REAL/'oldtupicorpus'/folder,cls.corpus/folder,ignore=shutil.ignore_patterns('__pycache__'))
        (cls.parent/'nhe-enga').symlink_to(REAL/'nhe-enga',target_is_directory=True)
        subprocess.run(['git','init','--quiet',str(cls.corpus)],check=True)
        subprocess.run(['git','-C',str(cls.corpus),'add','.'],check=True)
        subprocess.run(['git','-C',str(cls.corpus),'-c','user.name=Studio Test','-c','user.email=test@example.invalid','commit','--quiet','-m','disposable fixture'],check=True)
        cls.path=cls.corpus/'historic'/f'{SOURCE}.tu.py';cls.original=cls.path.read_bytes()

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def setUp(self):
        self.path.write_bytes(self.original)
        self.adapter=ProjectAdapter(self.parent/('state-'+self.id().rsplit('.',1)[-1]))
        self.project=self.adapter.open_project(str(self.parent))
        self.pending={'passageId':'pending:'+str(uuid.uuid4()),'sourceId':SOURCE,'revisionId':'pending-fixture'}

    def context_fixture(self):
        text=self.path.read_text(encoding='utf-8')
        marker=SOURCE+' = l'
        text=text.replace(marker,"pending_probe = Noun('beforeanchor')\n"+marker+"\npending_probe = Noun('afteranchor')")
        self.path.write_text(text,encoding='utf-8')
        self.project=self.adapter.refresh_project()

    def metadata_fixture(self):
        self.path.write_text('''from historic.lexicon import *
l = [
    # @section 1
    # @subsection 1.1
    amen,
    amen,
    # @section 2
    amen,
    # @subsection 2.1
    amen,
    amen,
]
araujo_catecismo_1686 = l
''',encoding='utf-8')
        self.project=self.adapter.refresh_project()

    def test_pending_evaluates_at_publication_anchor_without_writing_source(self):
        self.context_fixture();before=self.path.read_bytes()
        result=self.adapter.invoke('evaluate_expression',{**self.pending,'raw':'pending_probe','engineFingerprint':self.project['engineFingerprint']})
        expected=self.adapter.invoke('evaluate_expression',{**self.pending,'raw':"Noun('beforeanchor')"})
        self.assertEqual(result['evaluationStatus'],'complete')
        self.assertEqual(result['surface'],expected['surface'])
        self.assertNotIn('afteranchor',result['surface'])
        actual=self.adapter.invoke('evaluate_expression',{'passageId':self.project['passages'][0]['id'],'raw':'pending_probe'})
        self.assertEqual(actual['evaluationStatus'],'partial')
        self.assertEqual(self.path.read_bytes(),before)

    def test_pending_context_rejects_stale_identity_path_and_private_capabilities(self):
        for params in [
            {**self.pending,'sourceId':'../escape'},
            {**self.pending,'passageId':'pending:not-a-uuid'},
            {**self.pending,'passageId':'passage:'+str(uuid.uuid4())},
            {**self.pending,'projectId':'another-project'},
        ]:
            with self.subTest(params=params),self.assertRaises(AdapterError):
                self.adapter.invoke('evaluate_expression',{**params,'raw':'amen'})
        for raw in ['__import__("os")','amen.__class__','amen.__dict__','open("/tmp/studio-forbidden")']:
            with self.subTest(raw=raw),self.assertRaises(AdapterError):
                self.adapter.invoke('evaluate_expression',{**self.pending,'raw':raw})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_pending_drafts_are_reusable_in_the_same_append_context(self):
        self.context_fixture();before=self.path.read_bytes()
        raw="pending_probe + Noun('pendingpiece')"
        rendered=self.adapter.invoke('evaluate_expression',{**self.pending,'raw':raw})
        params={**self.pending,'drafts':[{**self.pending,'raw':raw}]}
        found=self.adapter.invoke('structure_search',{**params,'query':rendered['surface']})
        candidate=next(row for row in found['results'] if row['expression']==raw)
        self.assertTrue(any(source.get('draft') for source in candidate['sources']))
        resolved=self.adapter.invoke('structure_resolve',{**params,'candidateId':candidate['id'],'indexFingerprint':found['indexFingerprint']})
        self.assertEqual(resolved['surface'],rendered['surface'])
        self.assertEqual(self.path.read_bytes(),before)

    def test_pending_lexical_reads_use_preceding_declaration_and_preserve_source(self):
        self.context_fixture();before=self.path.read_bytes()
        found=self.adapter.invoke('lexicon_search',{**self.pending,'query':'pending_probe'})
        self.assertEqual(found['results'][0]['expression'],"Noun('beforeanchor')")
        inspected=self.adapter.invoke('lexicon_inspect',{**self.pending,'name':'pending_probe'})
        self.assertEqual(inspected['expression'],"Noun('beforeanchor')")
        self.assertEqual(inspected['safeOccurrenceExpansion'],"Noun('beforeanchor')")
        inventory=self.adapter.invoke('passage_lexicon',{**self.pending,'raw':'pending_probe + amen'})
        entry=next(entry for entry in inventory['entries'] if entry['name']=='pending_probe')
        self.assertEqual(entry['expression'],"Noun('beforeanchor')")
        self.assertEqual(inventory['revisionId'],self.pending['revisionId'])
        self.assertEqual(self.path.read_bytes(),before)

    def test_pending_assistant_context_is_explicit_full_draft_and_partial_only_for_investigation(self):
        self.context_fixture();before=self.path.read_bytes()
        raw='pending_probe + amen'
        context=self.adapter.invoke('assistant_context',{**self.pending,'raw':raw,'action':'translate'})
        self.assertTrue(context['pending']);self.assertTrue(context['passage']['pending'])
        self.assertIsNone(context['passage']['acceptedReference'])
        self.assertEqual(context['ordinal'],len(self.project['passages'])+1)
        self.assertEqual(context['evaluation']['expression'],raw)
        self.assertEqual(context['evaluation']['revisionId'],self.pending['revisionId'])
        self.assertEqual(context['surroundingPassages'],self.project['passages'][-2:])
        self.assertEqual(next(entry for entry in context['lexicalDefinitions'] if entry['name']=='pending_probe')['expression'],"Noun('beforeanchor')")
        incomplete='pending_probe + __studio_slot_ab'
        context=self.adapter.invoke('assistant_context',{**self.pending,'raw':incomplete,'action':'investigate'})
        self.assertEqual(context['evaluation']['evaluationStatus'],'partial')
        with self.assertRaises(AdapterError) as error:
            self.adapter.invoke('assistant_context',{**self.pending,'raw':incomplete,'action':'translate'})
        self.assertEqual(error.exception.code,'INCOMPLETE_EVALUATION')
        context=self.adapter.invoke('assistant_context',{**self.pending,'raw':'pending_probe + (','action':'investigate'})
        self.assertIsNone(context['evaluation']);self.assertEqual(context['lexicalDefinitions'],[])
        self.assertTrue(context['diagnostics'])
        self.assertEqual(self.path.read_bytes(),before)

    def test_pending_identity_never_masquerades_as_published_source_for_writes_or_approval(self):
        for method,extra in [('source_preview',{'raw':'amen'}),('reference_status',{}),('reference_verify',{}),('reference_approve',{}),('lexicon_create',{'headword':'abá','definition':'pessoa'})]:
            with self.subTest(method=method),self.assertRaises(AdapterError) as error:
                self.adapter.invoke(method,{**self.pending,**extra})
            self.assertEqual(error.exception.code,'PASSAGE_NOT_FOUND')
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_pending_lexical_update_is_a_reviewable_preview_not_source_publication(self):
        before=self.path.read_bytes()
        preview=self.adapter.invoke('lexicon_update',{**self.pending,'name':'amen','definition':'sentido novo','scope':'source'})
        self.assertTrue(preview['diff'])
        self.assertEqual(self.path.read_bytes(),before)

    def test_catalog_and_creation_follow_actual_constructor_signatures(self):
        catalog=self.adapter.invoke('predicate_catalog',self.pending)
        names={entry['name'] for entry in catalog['constructors']}
        self.assertEqual(names,CONSTRUCTORS)
        pronoun=next(entry for entry in catalog['constructors'] if entry['name']=='Pronoun')
        self.assertEqual(pronoun['parameters'][0]['name'],'inflection_or_verbete')
        self.assertTrue(pronoun['parameters'][0]['required'])
        values={'Adverb':{'value':'ko'},'Conjunction':{'value':"a'e"},'Copula':{},'Demonstrative':{'value':'kó'},'Interjection':{'value':'pa'},'Noun':{'value':'abá'},'Number':{'value':'mokõî'},'Particle':{'value':'pe'},'Postposition':{'value':'suí'},'Pronoun':{'inflection_or_verbete':'1ps'},'ProperNoun':{'value':'Santa Cruz'},'SizeSuffix':{'value':'-gûasu'},'Verb':{'value':'tym'}}
        for name,properties in values.items():
            with self.subTest(constructor=name):
                result=self.adapter.invoke('predicate_create',{**self.pending,'constructor':name,'values':properties})
                syntax=ast.parse(result['expression'],mode='eval').body
                self.assertEqual(syntax.func.id,name)
                self.assertEqual(result['evaluationStatus'],'complete')
                self.assertTrue(result['surface'])
                self.assertEqual(result['tree']['runtimeType'],name)
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_constructor_fields_cannot_become_executable_source(self):
        definition="apostrophe ' and newline\n__import__('os').system('not executed')"
        created=self.adapter.invoke('predicate_create',{**self.pending,'constructor':'Noun','values':{'value':'abá','definition':definition}})
        syntax=ast.parse(created['expression'],mode='eval').body
        self.assertEqual(next(keyword.value.value for keyword in syntax.keywords if keyword.arg=='definition'),definition)
        for name,values in [('__import__',{'name':'os'}),('Noun',{}),('Noun',{'value':'abá','pro_drop':'false'}),('Noun',{'value':['abá']}),('Noun',{'value':'abá','__class__':'anything'}),('Pronoun',{'value':'1ps'})]:
            with self.subTest(constructor=name,values=values),self.assertRaises(AdapterError):
                self.adapter.invoke('predicate_create',{**self.pending,'constructor':name,'values':values})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_imported_hierarchy_is_cumulative_and_new_sections_clear_subsections(self):
        self.metadata_fixture()
        self.assertEqual([(p['witness']['section'],p['witness']['subsection']) for p in self.project['passages']],
                         [('1','1.1'),('1','1.1'),('2',None),('2','2.1'),('2','2.1')])

    def test_reviewed_subsection_reset_survives_apply_and_refresh(self):
        self.metadata_fixture();before=self.path.read_bytes()
        passage=self.project['passages'][1]
        preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'metadata':{'subsection':''}})
        self.assertIn('+# @section 1',preview['diff'].replace('    ',''))
        self.assertEqual(self.path.read_bytes(),before)
        project=self.adapter.invoke('source_apply',preview)
        self.assertIsNone(project['passages'][1]['witness']['subsection'])
        self.assertEqual(project['passages'][1]['witness']['section'],'1')
        self.assertEqual(project['passages'][3]['witness']['subsection'],'2.1')

    def test_new_passage_can_reset_subsection_and_retain_explicit_subsection_on_new_section(self):
        self.metadata_fixture()
        preview=self.adapter.invoke('source_new_preview',{'sourceId':SOURCE,'raw':'amen','metadata':{'section':'2','subsection':''}})
        project=self.adapter.invoke('source_apply',preview)
        self.assertEqual(project['passages'][-1]['witness']['section'],'2')
        self.assertIsNone(project['passages'][-1]['witness']['subsection'])
        passage=project['passages'][0]
        preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'metadata':{'section':'3','subsection':'1.1'}})
        project=self.adapter.invoke('source_apply',preview)
        self.assertEqual(project['passages'][0]['witness']['section'],'3')
        self.assertEqual(project['passages'][0]['witness']['subsection'],'1.1')

    def test_unrepresentable_section_clear_is_explicit_before_any_preview_write(self):
        self.metadata_fixture();before=self.path.read_bytes()
        for method,params in [('source_preview',{'passageId':self.project['passages'][1]['id']}),('source_new_preview',{'sourceId':SOURCE,'raw':'amen'})]:
            with self.subTest(method=method),self.assertRaises(AdapterError) as error:
                self.adapter.invoke(method,{**params,'metadata':{'section':'','subsection':''}})
            self.assertEqual(error.exception.code,'LOCATOR_RESET_UNSUPPORTED')
        self.assertEqual(self.path.read_bytes(),before)


if __name__=='__main__':unittest.main()
