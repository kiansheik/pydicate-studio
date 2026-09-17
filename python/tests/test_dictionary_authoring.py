"""The embedded dictionary and insertion resolve the same exact sense bytes."""
import ast
import gzip
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_runtime import configure, dictionary_predicate, namespace_for
from navarro_search import dictionary_constructor_hints, dictionary_entry, dictionary_lookup


class SiteDictionaryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.engine=Path(self.temp.name)
        self.path=self.engine/'docs/dict-conjugated.json.gz';self.path.parent.mkdir()
        self.rows=[
            {'f':'salvar','d':'- pysyrõ','o':'','i':100},
            {'f':'pysyrõ','d':'(v.tr.) - salvar; na definição aparece (s.) como citação','o':'1','i':501,'t':1,'v':'(v.tr.)'},
            {'f':'pysyrõ','d':'(s.) - outra acepção','o':'2','i':999,'t':1},
            {'f':"a'e",'d':'(adv.) - ali','t':1},
            {'f':'y','d':'(s) (v.tr.) - verbo pluriforme','t':1,'v':'(s) (v.tr.)'},
            {'f':'x','d':'- forma sem classificação; exemplo (v.tr.) citado depois','t':1},
            {'f':'abá','d':'(s.) - pessoa','t':1},
            {'f':'abá','d':'(pron.) - alguém','t':1},
        ]
        self.original=gzip.compress(json.dumps(self.rows,ensure_ascii=False).encode(),mtime=0)
        self.path.write_bytes(self.original)
        self.fingerprint='sha256:'+hashlib.sha256(self.original).hexdigest()

    def tearDown(self):self.temp.cleanup()

    def test_lookup_preserves_row_identity_senses_and_spaces_without_sqlite_ids(self):
        result=dictionary_lookup(self.engine,{'query':'py sy rõ'})
        exact=[entry for entry in result['results'] if entry['match']=='exact']
        self.assertEqual([entry['entryIndex'] for entry in exact],[1,2])
        self.assertEqual([entry['dictionaryVid'] for entry in exact],[501,999])
        self.assertEqual([entry['suggestedConstructor'] for entry in exact],['Verb','Noun'])
        self.assertEqual(result['datasetFingerprint'],self.fingerprint)
        self.assertEqual(dictionary_lookup(self.engine,{'query':'A ’ E'})['results'][0]['match'],'exact')
        relaxed=dictionary_lookup(self.engine,{'query':'aba'})['results']
        self.assertEqual(len(relaxed),2)
        self.assertTrue(all(entry['match']=='relaxed' for entry in relaxed))
        portuguese=dictionary_lookup(self.engine,{'query':'pessoa'})['results'][0]
        self.assertEqual(portuguese['headword'],'abá');self.assertEqual(portuguese['match'],'definition')
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_grammar_hints_only_use_leading_labels_and_distinguish_pluriform(self):
        self.assertEqual(dictionary_constructor_hints(self.rows[1]['d'])[0],['Verb'])
        self.assertEqual(dictionary_constructor_hints(self.rows[4]['d'])[0],['Verb'])
        self.assertEqual(dictionary_constructor_hints(self.rows[5]['d'])[0],[])
        self.assertEqual(dictionary_constructor_hints('(s. e adj.) - algo')[0],['Noun','Verb'])
        self.assertEqual(dictionary_constructor_hints('(dem. pron. e adj.) - este')[0],['Demonstrative'])

    def test_selection_validates_compressed_bytes_index_and_missing_vid(self):
        entry,row=dictionary_entry(self.engine,{'entryIndex':6,'datasetFingerprint':self.fingerprint})
        self.assertEqual(entry['headword'],'abá');self.assertNotIn('dictionaryVid',entry)
        self.assertEqual(row,self.rows[6])
        for index in [-1,True,'1',999]:
            with self.subTest(index=index),self.assertRaises(ValueError):
                dictionary_entry(self.engine,{'entryIndex':index,'datasetFingerprint':self.fingerprint})
        with self.assertRaises(ValueError):dictionary_entry(self.engine,{'entryIndex':1})
        self.rows[1]['d']='(v.tr.) - novo sentido'
        self.path.write_bytes(gzip.compress(json.dumps(self.rows).encode(),mtime=0))
        with self.assertRaisesRegex(ValueError,'mudou'):
            dictionary_entry(self.engine,{'entryIndex':1,'datasetFingerprint':self.fingerprint})


REAL=Path(os.environ.get('PYDICATE_PROJECT_PARENT',str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL/'nhe-enga/docs/dict-conjugated.json.gz').exists(),'selected dictionary not installed')
class RealDictionaryConversionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.adapter=ProjectAdapter();cls.project=cls.adapter.open_project(str(REAL))
        cls.source=REAL/'oldtupicorpus/historic/araujo_catecismo_1686.tu.py'
        cls.original=cls.source.read_bytes()
        cls.params={'passageId':'pending:'+str(uuid.uuid4()),'sourceId':'araujo_catecismo_1686',
                    'projectId':cls.project['id'],'engineFingerprint':cls.project['engineFingerprint'],'revisionId':'dictionary-fixture'}
        cls.dataset=REAL/'nhe-enga/docs/dict-conjugated.json.gz'
        cls.dataset_bytes=cls.dataset.read_bytes()
        cls.fingerprint='sha256:'+hashlib.sha256(cls.dataset_bytes).hexdigest()
        cls.rows=json.loads(gzip.decompress(cls.dataset_bytes))

    @classmethod
    def tearDownClass(cls):
        assert cls.source.read_bytes()==cls.original
        assert cls.dataset.read_bytes()==cls.dataset_bytes

    def index(self,word,number=''):
        return next(index for index,row in enumerate(self.rows) if row.get('f')==word and str(row.get('o') or '')==number and row.get('t')==1)

    def convert(self,index,**extra):
        return self.adapter.invoke('dictionary_predicate',{**self.params,'entryIndex':index,'datasetFingerprint':self.fingerprint,**extra})

    def test_real_homographs_pin_all_four_actual_verb_senses(self):
        lookup=self.adapter.invoke('dictionary_lookup',{**self.params,'query':'py sy rõ'})
        entries=[entry for entry in lookup['results'] if entry['match']=='exact']
        self.assertEqual(len(entries),4)
        ids=[]
        for entry in entries:
            with self.subTest(sense=entry['optionalNumber']):
                result=self.convert(entry['entryIndex'])
                self.assertEqual(result['status'],'ready');self.assertEqual(result['constructor'],'Verb')
                self.assertEqual(result['evaluationStatus'],'complete')
                self.assertEqual(result['tree']['definition'],entry['definition'])
                keywords={keyword.arg:keyword.value.value for keyword in ast.parse(result['expression'],mode='eval').body.keywords}
                self.assertEqual(keywords['definition'],entry['definition'])
                self.assertEqual(keywords['vid'],result['engineDictionaryVid'])
                self.assertEqual(keywords['verb_class'],self.rows[entry['entryIndex']]['v'])
                ids.append(keywords['vid'])
        self.assertEqual(len(set(ids)),4)

    def test_noun_postposition_and_number_use_exact_dictionary_sense(self):
        for word,number,constructor in [('abá','2','Noun'),('suí','1','Postposition'),('suí','2','Noun'),('mokõî','1','Number')]:
            with self.subTest(word=word,number=number):
                index=self.index(word,number);result=self.convert(index)
                self.assertEqual(result['status'],'ready');self.assertEqual(result['constructor'],constructor)
                self.assertEqual(result['evaluationStatus'],'complete')
                self.assertEqual(result['tree']['definition'],self.rows[index]['d'])

    def test_size_suffix_senses_are_pieces_and_other_senses_stay_distinct(self):
        for index in (4466,4609,4612,10704,10922):
            with self.subTest(index=index):
                result=self.convert(index)
                self.assertEqual(result['status'],'ready')
                self.assertEqual(result['constructor'],'SizeSuffix')
                self.assertIn('SizeSuffix(',result['expression'])
        for index in (4608,10924):
            with self.subTest(index=index):
                self.assertEqual(self.convert(index)['status'],'needs-choice')
                with self.assertRaises(AdapterError):
                    self.convert(index,constructor='SizeSuffix')
        mirim=self.convert(self.index('mirĩ'))
        self.assertEqual(mirim['status'],'needs-choice')
        self.assertEqual(self.convert(self.index('mirĩ'),constructor='SizeSuffix')['constructor'],'SizeSuffix')
        self.assertEqual(self.convert(self.index('mirĩ'),constructor='Noun')['constructor'],'Noun')

    def test_unclassified_entry_requires_choice_and_portuguese_entry_is_unavailable(self):
        index=self.index('abá','1')
        pending=self.convert(index)
        self.assertEqual(pending['status'],'needs-choice');self.assertNotIn('expression',pending)
        chosen=self.convert(index,constructor='Pronoun')
        self.assertEqual(chosen['status'],'ready');self.assertEqual(chosen['tree']['runtimeType'],'Pronoun')
        self.assertEqual(chosen['tree']['definition'],self.rows[index]['d'])
        proper=self.convert(index,constructor='ProperNoun')
        self.assertTrue(proper['expression'].startswith('studio_define('))
        self.assertEqual(proper['tree']['definition'],self.rows[index]['d'])
        unavailable=self.convert(0)
        self.assertEqual(unavailable['status'],'unavailable');self.assertNotIn('expression',unavailable)

    def test_mismatched_engine_verb_identity_never_silently_selects_homograph(self):
        index=self.index('tym');entry,row=dictionary_entry(REAL/'nhe-enga',{'entryIndex':index,'datasetFingerprint':self.fingerprint})
        corpus=configure(REAL);namespace=namespace_for(corpus,self.source,10**9)
        module=sys.modules[namespace['Verb'].__module__]
        with patch.dict(module._DICT_BY_ID,{row['i']:{**row,'d':'outra acepção'}}):
            result=dictionary_predicate({'entry':entry,'entryRecord':row},namespace)
        self.assertEqual(result['status'],'unavailable');self.assertNotIn('expression',result)
        self.assertIn('outra acepção',result['diagnostics'][0])
        # A dictionary noun selected as Verb also cannot accidentally pick a
        # different verbal row that merely shares its spelling.
        self.assertEqual(self.convert(self.index('abá','2'),constructor='Verb')['status'],'unavailable')

    def test_stale_dataset_and_invalid_constructor_reject_and_caller_cannot_replace_entry(self):
        index=self.index('tym')
        with self.assertRaises(AdapterError):self.convert(index,datasetFingerprint='sha256:'+'0'*64)
        with self.assertRaises(AdapterError):self.convert(index,constructor='__import__')
        result=self.convert(index,headword='forged',definition='forged',entryRecord={'f':'forged'})
        self.assertEqual(result['entry']['headword'],'tym')
        self.assertEqual(result['entry']['definition'],self.rows[index]['d'])


if __name__=='__main__':unittest.main()
