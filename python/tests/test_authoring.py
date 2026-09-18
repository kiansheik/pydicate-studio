from __future__ import annotations
import ast
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError,ProjectAdapter
from studio_authoring import source_entries,expression_tree,parse_ast,replace_node,authoritative_metadata

REAL=Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()

class ConcreteTests(unittest.TestCase):
    def test_collection_implicit_continuation_preserves_utf16_and_scope(self):
        raw='(oré * tuba).voc() @ (pe * ybaka)\n    + (amo * (pyra * moeté))'
        parsed=expression_tree(raw,'r1');self.assertTrue(parsed['capabilities']['visual']);self.assertEqual(parsed['raw'],raw)
        def verify(node):
            self.assertEqual(raw.encode('utf-16-le')[node['start']*2:node['end']*2].decode('utf-16-le'),node['code'])
            for child in node['children']:verify(child['node'])
        verify(parsed['root'])
        emoji=expression_tree('Noun("🦜î")');verify_emoji=emoji['root']['children'][0]['node'];self.assertEqual(verify_emoji['end']-verify_emoji['start'],5)

    def test_incomplete_source_does_not_fallback_to_previous_tree(self):
        for raw in ['(nde *','-((', 'v(', '', '# anotação ainda sem análise']:
            value=expression_tree(raw,'broken');self.assertEqual(value['raw'],raw);self.assertIsNone(value['root']);self.assertTrue(value['diagnostics'])

    def test_unsupported_raw_stays_intact(self):
        for raw in ['[x for x in foo]','entry.unknown(7)','lambda x: x']:
            value=expression_tree(raw);self.assertEqual(value['raw'],raw);self.assertFalse(value['capabilities']['edit'])

    def test_span_edit_preserves_associativity(self):
        raw='a * b * c';tree=expression_tree(raw)['root'];edited=replace_node(raw,tree['children'][0]['node'],'a * (b + c)')
        self.assertEqual(edited,'(a * (b + c)) * c');self.assertIsInstance(parse_ast(edited).left,ast.BinOp)


@unittest.skipUnless((REAL/'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(),'selected local corpus not installed')
class CorpusCopyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.parent=Path(cls.temp.name);cls.corpus=cls.parent/'oldtupicorpus';cls.corpus.mkdir()
        for folder in ('historic','authoring','tests','ground_truth'):
            shutil.copytree(REAL/'oldtupicorpus'/folder,cls.corpus/folder,ignore=shutil.ignore_patterns('__pycache__'))
        (cls.parent/'nhe-enga').symlink_to(REAL/'nhe-enga',target_is_directory=True)
        subprocess.run(['git','init','--quiet',str(cls.corpus)],check=True)
        subprocess.run(['git','-C',str(cls.corpus),'add','.'],check=True)
        subprocess.run(['git','-C',str(cls.corpus),'-c','user.name=Studio Test','-c','user.email=test@example.invalid','commit','--quiet','-m','disposable fixture'],check=True)
        cls.path=cls.corpus/'historic/araujo_catecismo_1686.tu.py';cls.original=cls.path.read_bytes();cls.lexicon=(cls.corpus/'historic/lexicon.tu.py').read_bytes()

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def setUp(self):
        self.path.write_bytes(self.original);(self.corpus/'historic/lexicon.tu.py').write_bytes(self.lexicon)
        self.state=self.parent/('state-'+self.id().rsplit('.',1)[-1]);self.adapter=ProjectAdapter(self.state);self.project=self.adapter.open_project(str(self.parent))

    def passage(self,ordinal=67):return self.project['passages'][ordinal-1]

    def test_full_count_actual_inherited_metadata_and_noop_bytes(self):
        entries=source_entries(self.path);self.assertEqual(len(entries),len(self.project['passages']));self.assertEqual(self.passage(82)['witness']['printedPage'],'6')
        for passage in self.project['passages']:
            preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'raw':passage['sourceExpression']});self.assertEqual(preview['diff'],'')
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_visual_raw_live_engine_nested_context(self):
        for ordinal in (1,16,56,67,78,82):
            passage=self.passage(ordinal);r=self.adapter.invoke('evaluate_expression',{'passageId':passage['id'],'raw':passage['sourceExpression'],'revisionId':'r'+str(ordinal),'engineFingerprint':self.project['engineFingerprint']})
            self.assertTrue(r['surface']);self.assertTrue(r['tree']['runtimeType']);self.assertEqual(r['expression'],passage['sourceExpression'])
        roles=r['tree'].get('engineRoles',[])
        self.assertEqual(self.adapter.invoke('lexicon_search',{'query':'îekuakub','passageId':self.passage(82)['id']})['results'][0]['definition'],'jejuar')

    def test_translation_context_evaluates_the_full_current_draft_at_the_requested_revision(self):
        passage=self.passage(1)
        params={'passageId':passage['id'],'raw':passage['sourceExpression'],'revisionId':'full-line-review','engineFingerprint':self.project['engineFingerprint'],'action':'translate'}
        context=self.adapter.invoke('assistant_context',params)
        self.assertEqual(context['raw'],passage['sourceExpression'])
        self.assertEqual(context['evaluation']['expression'],passage['sourceExpression'])
        self.assertEqual(context['evaluation']['revisionId'],'full-line-review')
        self.assertEqual(context['evaluation']['engineFingerprint'],self.project['engineFingerprint'])
        self.assertIn('Tupã',context['evaluation']['surface'])
        self.assertTrue(context['evaluation']['surface'].endswith('suí'))
        self.assertIn('[SUBJECT:PRONOUN:2ps:OBJECT_1P]',context['evaluation']['annotated'])
        self.assertIn('amotar',{entry['name'] for entry in context['lexicalDefinitions']})
        with self.assertRaises(AdapterError):
            self.adapter.invoke('assistant_context',{**params,'raw':'(pysyro *'})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_targeted_edit_identity_reopen_and_recovery(self):
        passage=self.passage();entry=source_entries(self.path)[66]
        preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'raw':'(+nde * apiti * moro).imp()','metadata':{'notes':'revisão humana','evidence':{'version':1,'assetId':'abc','passageId':passage['id']}}})
        self.assertEqual(self.path.read_bytes(),self.original)
        project=self.adapter.invoke('source_apply',{'previewId':preview['previewId'],'sourceFingerprint':preview['sourceFingerprint']})
        current=next(p for p in project['passages'] if p['id']==passage['id']);self.assertEqual(current['ordinal'],67);self.assertEqual(current['sourceExpression'],'(+nde * apiti * moro).imp()')
        self.assertIn('revisão humana',self.path.read_text());self.assertEqual(current['studioMetadata']['evidence']['assetId'],'abc');self.assertIn('revisão humana',current['notes']);self.assertNotIn('studio:v1',current['notes'])
        reopened=ProjectAdapter(self.state).open_project(str(self.parent));self.assertEqual(reopened['passages'][66]['id'],passage['id'])
        recovery=self.adapter.invoke('source_recover',{'recoveryId':preview['previewId']});self.adapter.invoke('source_apply',{'previewId':recovery['previewId'],'sourceFingerprint':recovery['sourceFingerprint']});self.assertEqual(self.path.read_bytes(),self.original)

    def test_stale_file_rejected_before_any_write(self):
        passage=self.passage();preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'raw':'amen'})
        self.path.write_bytes(self.original+b'\n# external\n');expected=self.path.read_bytes()
        with self.assertRaises(AdapterError) as error:self.adapter.invoke('source_apply',{'previewId':preview['previewId'],'sourceFingerprint':preview['sourceFingerprint']})
        self.assertEqual(error.exception.code,'STALE_SOURCE');self.assertEqual(self.path.read_bytes(),expected)

    def test_interrupted_replace_preserves_original_and_recovery(self):
        preview=self.adapter.invoke('source_preview',{'passageId':self.passage()['id'],'raw':'amen'})
        with patch('authoring_service.os.replace',side_effect=OSError('interrupted')):
            with self.assertRaises(OSError):self.adapter.invoke('source_apply',{'previewId':preview['previewId'],'sourceFingerprint':preview['sourceFingerprint']})
        self.assertEqual(self.path.read_bytes(),self.original);self.assertTrue((self.state/'recovery'/(preview['previewId']+'.json')).exists());self.assertEqual(list(self.path.parent.glob('*.studio-*')),[])

    def test_duplicate_identical_expressions_have_persistent_explicit_ids(self):
        original=self.passage(3);preview=self.adapter.invoke('source_preview',{'passageId':original['id'],'metadata':{'notes':'primeiro amém'}});self.project=self.adapter.invoke('source_apply',preview)
        second=self.project['passages'][10];preview=self.adapter.invoke('source_preview',{'passageId':second['id'],'metadata':{'notes':'segundo amém'}});self.project=self.adapter.invoke('source_apply',preview)
        entries=source_entries(self.path);self.assertEqual(entries[2]['expression'],'(amen)');self.assertEqual(entries[10]['expression'],'(amen)')
        # Insert a duplicate before final alias; both marked original IDs survive.
        text=self.path.read_text().replace('araujo_catecismo_1686 = l','l += amen\naraujo_catecismo_1686 = l');self.path.write_text(text)
        refreshed=self.adapter.refresh_project();self.assertEqual(refreshed['passages'][2]['id'],original['id']);self.assertEqual(refreshed['passages'][10]['id'],second['id'])

    def test_new_line_and_new_lexical_provenance_review_loop(self):
        original_count=len(self.project['passages'])
        lexical=self.adapter.invoke('lexicon_create',{'passageId':self.passage()['id'],'headword':'tábá','definition':'uma aldeia, sentido revisado','category':'Noun','scope':'source','provenance':{'dictionary':'Navarro','vid':123}})
        self.assertIn('Navarro',lexical['diff']);self.project=self.adapter.invoke('source_apply',lexical)
        inspected=self.adapter.invoke('lexicon_inspect',{'name':lexical['name'],'passageId':self.project['passages'][66]['id']});self.assertEqual(inspected['runtimeType'],'Noun')
        new=self.adapter.invoke('source_new_preview',{'raw':lexical['name'],'sourceId':'araujo_catecismo_1686'});self.project=self.adapter.invoke('source_apply',new)
        self.assertEqual(len(self.project['passages']),original_count+1);self.assertEqual(self.project['passages'][-1]['id'],new['passageId'])

    def test_gloss_edit_preserves_lexical_identity_and_class(self):
        passage=self.passage()
        before=self.adapter.invoke('lexicon_inspect',{'passageId':passage['id'],'name':'apiti'})
        preview=self.adapter.invoke('lexicon_update',{'passageId':passage['id'],'name':'apiti','definition':'sentido humano revisado','scope':'shared'})
        self.assertIn(67,preview['affectedUses']);self.project=self.adapter.invoke('source_apply',preview)
        after=self.adapter.invoke('lexicon_inspect',{'passageId':self.project['passages'][66]['id'],'name':'apiti'})
        self.assertEqual(before['id'],after['id']);self.assertEqual(after['runtimeType'],'Verb');self.assertEqual(after['definition'],'sentido humano revisado')

    def test_occurrence_gloss_copies_structure_and_source_helper_is_portable(self):
        passage=self.passage()
        candidate=self.adapter.invoke('lexicon_update',{'passageId':passage['id'],'name':'apiti','definition':'glossa local','scope':'occurrence'})
        raw='-(+nde * '+candidate['raw']+' * moro).imp()'
        preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'raw':raw})
        self.assertIn('def studio_define',preview['diff']);self.project=self.adapter.invoke('source_apply',preview)
        current=next(p for p in self.project['passages'] if p['id']==passage['id'])
        rendered=self.adapter.invoke('evaluate_expression',{'passageId':current['id'],'raw':current['sourceExpression'],'revisionId':'r2','engineFingerprint':self.project['engineFingerprint']})
        self.assertEqual(rendered['surface'],'eporoapiti umẽ')
        script='import runpy,sys;sys.path.insert(0,'+repr(str(self.corpus))+');x=runpy.run_path('+repr(str(self.path))+');print(x["l"][66].eval())'
        process=subprocess.run([sys.executable,'-B','-c',script],capture_output=True,text=True,check=True)
        self.assertEqual(process.stdout.strip(),'eporoapiti umẽ')

    def test_explicit_authoritative_approval_writes_only_next_reference(self):
        records=self.corpus/'ground_truth/records/historic/araujo_catecismo_1686.jsonl';before=records.read_bytes()
        count=len(before.splitlines());passage=self.passage(count+1)
        rendered=self.adapter.invoke('evaluate_expression',{'passageId':passage['id'],'raw':passage['sourceExpression'],'revisionId':'review','engineFingerprint':self.project['engineFingerprint']})
        try:
            approved=self.adapter.invoke('reference_approve',{'passageId':passage['id'],'sourceFingerprint':passage['sourceFingerprint'],'reviewedSurface':rendered['surface']})
            self.assertEqual(approved['approval']['ordinal'],count+1);self.assertEqual(records.read_bytes().splitlines()[:count],before.splitlines());self.assertEqual(len(records.read_bytes().splitlines()),count+1)
            event=json.loads(next((self.state/'recovery').glob('*.json')).read_text());self.assertEqual(event['kind'],'reference-approval');self.assertEqual(event['before'].encode('utf-8'),before)
        finally:records.write_bytes(before)

    def test_reference_approval_requires_explicit_surface_and_sequential_authority(self):
        records=self.corpus/'ground_truth/records/historic/araujo_catecismo_1686.jsonl';original=records.read_bytes()
        # Construct an actual gap in this disposable copy; the user's saved
        # reference count can grow between runs.
        ordinal=len(self.project['passages']);before=b''.join(original.splitlines(keepends=True)[:ordinal-2])
        try:
            records.write_bytes(before);self.project=self.adapter.refresh_project();passage=self.passage(ordinal)
            self.assertLess(len(before.splitlines())+1,ordinal)
            with self.assertRaises(AdapterError) as error:self.adapter.invoke('reference_approve',{'passageId':passage['id'],'sourceFingerprint':passage['sourceFingerprint']})
            self.assertEqual(error.exception.code,'REVIEW_REQUIRED')
            rendered=self.adapter.invoke('evaluate_expression',{'passageId':passage['id'],'raw':passage['sourceExpression'],'revisionId':'approval','engineFingerprint':self.project['engineFingerprint']})
            with self.assertRaises(AdapterError) as error:self.adapter.invoke('reference_approve',{'passageId':passage['id'],'sourceFingerprint':passage['sourceFingerprint'],'reviewedSurface':rendered['surface']})
            self.assertIn('approved in order',str(error.exception));self.assertEqual(records.read_bytes(),before)
        finally:records.write_bytes(original)

    def test_helpers_expose_parameters_and_actual_body_structure(self):
        for name in ('n','v','cop','credo','saguera','pyreramo'):
            inspected=self.adapter.invoke('lexicon_inspect',{'passageId':self.passage()['id'],'name':name})
            self.assertTrue(inspected['parameters']);self.assertNotEqual(inspected['authoring']['root']['kind'],'unsupported');self.assertIsNone(inspected['expandedStructure'])
        self.assertIn('pluriforme',self.adapter.invoke('lexicon_inspect',{'passageId':self.passage()['id'],'name':'v'})['templateContext'][0])

    def test_assistant_can_inspect_incomplete_raw_and_late_lexical_names(self):
        context=self.adapter.invoke('assistant_context',{'passageId':self.passage(82)['id'],'raw':'((moîasuk *'})
        self.assertEqual(context['raw'],'((moîasuk *');self.assertTrue(context['diagnostics']);self.assertIn('moîasuk',[entry['name'] for entry in context['lexicalDefinitions']])

    def test_metadata_apply_is_idempotent_and_notes_are_replaced(self):
        passage=self.passage();metadata={'notes':'primeira nota','translation':'tradução humana'}
        preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'metadata':metadata});self.project=self.adapter.invoke('source_apply',preview)
        after=self.path.read_bytes();current=next(p for p in self.project['passages'] if p['id']==passage['id'])
        repeated=self.adapter.invoke('source_preview',{'passageId':current['id'],'raw':current['sourceExpression'],'metadata':metadata})
        self.assertEqual(repeated['diff'],'');self.assertEqual(self.path.read_bytes(),after)
        update=self.adapter.invoke('source_preview',{'passageId':current['id'],'metadata':{'notes':'segunda nota'}});self.project=self.adapter.invoke('source_apply',update)
        self.assertNotIn('primeira nota',self.path.read_text());self.assertEqual(self.path.read_text().count('# @note segunda nota'),1)
        current=next(p for p in self.project['passages'] if p['id']==passage['id']);self.assertEqual(current['notes'],'segunda nota');self.assertEqual(current['translation'],'tradução humana')

    def test_metadata_fingerprint_detects_external_human_edits_but_ignores_machine_pointer(self):
        passage=self.passage();preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'metadata':{'evidence':{'version':1,'assetId':'abc','passageId':passage['id']}}});self.project=self.adapter.invoke('source_apply',preview)
        current=next(p for p in self.project['passages'] if p['id']==passage['id']);self.assertEqual(current['sourceFingerprint'],passage['sourceFingerprint'])
        self.path.write_text(self.path.read_text().replace('l += -(+nde * apiti * moro).imp()','# @note externa\nl += -(+nde * apiti * moro).imp()'))
        updated=self.adapter.refresh_project();external=next(p for p in updated['passages'] if p['id']==passage['id'])
        self.assertNotEqual(current['sourceFingerprint'],external['sourceFingerprint']);self.assertEqual(external['notes'],'externa')

    def test_recovery_list_is_scoped_and_omits_source_bytes(self):
        preview=self.adapter.invoke('source_preview',{'passageId':self.passage()['id'],'metadata':{'notes':'recovery'}});self.project=self.adapter.invoke('source_apply',preview)
        listed=self.adapter.invoke('source_recovery_list',{})
        self.assertEqual(len(listed['items']),1);self.assertEqual(listed['items'][0]['id'],preview['previewId']);self.assertTrue(listed['items'][0]['recoverable']);self.assertNotIn('before',listed['items'][0])
        recovery=self.adapter.invoke('source_recover',{'recoveryId':listed['items'][0]['id']});self.adapter.invoke('source_apply',recovery);self.assertEqual(self.path.read_bytes(),self.original)

    def test_reserved_new_passage_id_preserves_pdf_pointer_and_explicit_locators(self):
        identifier='passage:12345678-1234-1234-1234-123456789abc';evidence={'version':1,'assetId':'a'*64,'passageId':identifier}
        preview=self.adapter.invoke('source_new_preview',{'newPassageId':identifier,'raw':'amen','metadata':{'evidence':evidence,'printedPage':'9','folio':'5r','line':'3-4'}})
        self.assertEqual(preview['targetPassageId'],identifier);self.assertEqual(self.path.read_bytes(),self.original)
        self.project=self.adapter.invoke('source_apply',preview)
        new=next(p for p in self.project['passages'] if p['id']==identifier)
        self.assertEqual(new['studioMetadata']['evidence'],evidence);self.assertEqual(new['witness']['printedPage'],'9');self.assertEqual(new['witness']['folio'],'5r');self.assertEqual(new['witness']['textualLine'],'3');self.assertIsNone(new['witness']['pdfPage'])
        reopened=ProjectAdapter(self.state).open_project(str(self.parent));self.assertEqual(reopened['passages'][-1]['id'],identifier)

    def test_reserved_new_passage_id_and_evidence_reject_invalid_or_existing_identity(self):
        identifier='passage:12345678-1234-1234-1234-123456789abc'
        for invalid in ['pending:12345678-1234-1234-1234-123456789abc','passage:no-uuid',self.passage()['id']]:
            with self.assertRaises(AdapterError):self.adapter.invoke('source_new_preview',{'newPassageId':invalid,'raw':'amen'})
        for evidence in [{'version':1,'assetId':'a'*64,'passageId':self.passage()['id']},{'version':1,'assetId':'abc','passageId':identifier},{'version':True,'assetId':'a'*64,'passageId':identifier}]:
            with self.assertRaises(AdapterError):self.adapter.invoke('source_new_preview',{'newPassageId':identifier,'raw':'amen','metadata':{'evidence':evidence}})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_explicit_empty_scholarly_fields_do_not_resurrect_legacy_records(self):
        records=self.corpus/'ground_truth/records/historic/araujo_catecismo_1686.jsonl';original=records.read_bytes();rows=[json.loads(line) for line in original.splitlines()]
        rows[66].update(translation='LEGACY translation',diplomatic='LEGACY transcription',normalized_target='LEGACY target')
        try:
            records.write_text('\n'.join(json.dumps(row,ensure_ascii=False,sort_keys=True) for row in rows)+'\n');self.project=self.adapter.refresh_project();passage=self.passage()
            self.assertEqual(passage['translation'],'LEGACY translation')
            preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'metadata':{'translation':'','diplomatic':'','normalized':''}});self.project=self.adapter.invoke('source_apply',preview)
            current=next(p for p in self.project['passages'] if p['id']==passage['id'])
            self.assertEqual(current['translation'],'');self.assertEqual(current['diplomatic'],'');self.assertEqual(current['normalized'],'');self.assertEqual(current['acceptedReference'],'LEGACY target');self.assertNotEqual(current['sourceFingerprint'],passage['sourceFingerprint'])
            repeated=self.adapter.invoke('source_preview',{'passageId':current['id'],'metadata':{'translation':'','diplomatic':'','normalized':''}});self.assertEqual(repeated['diff'],'')
        finally:records.write_bytes(original)

    def test_new_passage_multiline_scalar_metadata_preserves_draft_and_source(self):
        for field in ('diplomatic','normalized','translation','printedPage','folio','line'):
            with self.assertRaises(AdapterError) as error:self.adapter.invoke('source_new_preview',{'raw':'amen','metadata':{field:'primeira linha\nsegunda linha'}})
            self.assertIn('rascunho',str(error.exception));self.assertEqual(self.path.read_bytes(),self.original)
        preview=self.adapter.invoke('source_new_preview',{'raw':'amen','metadata':{'notes':'nota um\nnota dois'}})
        self.assertIn('+# @note nota um\n+# @note nota dois',preview['diff'])

    def test_all_araujo_scope_edit_previews_preserve_unrelated_source_bytes(self):
        scratch=self.parent/'preview-araujo.tu.py';original_entries=source_entries(self.path)
        def unchanged_prefix(text,entry):
            lines=text.splitlines(keepends=True)[:min(entry['statementLine'],entry['openingLine'])-1]
            # Editing notes may replace the old identity note and human notes
            # in the immediately adjacent directive block. Every other byte,
            # including other directives and earlier notes, must survive.
            index=len(lines)-1;found=False
            while index>=0:
                line=lines[index]
                if not line.strip():
                    if not found:break
                elif not re.match(r'^\s*#\s*@[a-z][a-z0-9_-]*\b',line,re.IGNORECASE):break
                else:
                    found=True
                    if re.match(r'^\s*#\s*@note\s+(?!studio-lexical:v1\b)',line,re.IGNORECASE):lines[index]=''
                index-=1
            return ''.join(lines)
        for passage,entry in zip(self.project['passages'],original_entries):
            with self.subTest(ordinal=passage['ordinal']):
                tree=expression_tree(passage['sourceExpression'])['root']
                candidate=replace_node(passage['sourceExpression'],tree,'-('+tree['code']+')')
                preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'raw':candidate,'metadata':{'notes':'revisão da passagem '+str(passage['ordinal'])}})
                after=self.adapter.previews[preview['previewId']]['after'];after_text=after.decode('utf-8');before_text=self.original.decode('utf-8')
                self.assertTrue(after_text.endswith(before_text[entry['end']:]))
                scratch.write_bytes(after);reimported=source_entries(scratch)
                self.assertEqual(len(reimported),len(original_entries))
                self.assertEqual(unchanged_prefix(after_text,reimported[passage['ordinal']-1]),unchanged_prefix(before_text,entry))
                self.assertEqual(ast.dump(parse_ast(reimported[passage['ordinal']-1]['expression'])),ast.dump(parse_ast(candidate)))
                annotations=authoritative_metadata(self.corpus,scratch)
                self.assertIn('revisão da passagem '+str(passage['ordinal']),annotations[passage['ordinal']]['notes'])
                self.assertEqual(reimported[passage['ordinal']-1]['studio']['passageId'],passage['id'])
                for index,(before_entry,after_entry) in enumerate(zip(original_entries,reimported)):
                    if index!=passage['ordinal']-1:self.assertEqual(before_entry['expression'],after_entry['expression'])
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_multiline_opening_parentheses_apply_metadata_with_same_identity(self):
        for ordinal in (28,29):
            passage=self.passage(ordinal);tree=expression_tree(passage['sourceExpression'])['root'];candidate=replace_node(passage['sourceExpression'],tree,'-('+tree['code']+')')
            metadata={'notes':'nota da linha '+str(ordinal),'translation':'tradução '+str(ordinal)}
            preview=self.adapter.invoke('source_preview',{'passageId':passage['id'],'raw':candidate,'metadata':metadata})
            self.project=self.adapter.invoke('source_apply',preview);current=next(p for p in self.project['passages'] if p['id']==passage['id'])
            self.assertEqual(ast.dump(parse_ast(current['sourceExpression'])),ast.dump(parse_ast(candidate)))
            self.assertEqual(current['notes'],metadata['notes']);self.assertEqual(current['translation'],metadata['translation']);self.assertEqual(current['witness']['printedPage'],passage['witness']['printedPage']);self.assertEqual(current['witness']['subsection'],passage['witness']['subsection'])
            self.assertIn('nota da linha '+str(ordinal),current['sourceMetadata']['notes']);self.assertEqual(current['sourceMetadata']['translation'],metadata['translation'])
            self.assertIn('# fix abé rendering on correct element',self.path.read_text())
            repeated=self.adapter.invoke('source_preview',{'passageId':current['id'],'raw':current['sourceExpression'],'metadata':metadata});self.assertEqual(repeated['diff'],'')
            reopened=ProjectAdapter(self.state).open_project(str(self.parent));self.assertEqual(reopened['passages'][ordinal-1]['id'],passage['id']);self.assertEqual(reopened['passages'][ordinal-1]['notes'],metadata['notes'])

    def test_candidates_cannot_run_arbitrary_python(self):
        for raw in ['__import__("os").system("echo no")','open("/tmp/no")','[x for x in amen]','amen.__class__()']:
            with self.assertRaises(AdapterError):self.adapter.invoke('evaluate_expression',{'passageId':self.passage()['id'],'raw':raw,'revisionId':'bad','engineFingerprint':self.project['engineFingerprint']})

if __name__=='__main__':unittest.main()
