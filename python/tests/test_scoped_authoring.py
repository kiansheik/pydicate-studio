"""Scoped read helpers: exact website identity, pagination and answer exclusions."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from authoring_service import AuthoringService
from navarro_search import dictionary_lookup, dictionary_entry

class ScopedAuthoringTests(unittest.TestCase):
    def test_dictionary_pages_and_full_nonverbal_sense_preserve_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'docs').mkdir()
            rows=[{'f':'abá','d':f'(s.) pessoa, acepção {i}; exemplo inteiro.','t':1} for i in range(5)]
            data=gzip.compress(json.dumps(rows).encode());(root/'docs/dict-conjugated.json.gz').write_bytes(data)
            first=dictionary_lookup(root,{'query':'abá','limit':2})
            second=dictionary_lookup(root,{'query':'abá','limit':2,'offset':first['nextOffset']})
            self.assertEqual([entry['entryIndex'] for entry in first['results']],[0,1])
            self.assertEqual([entry['entryIndex'] for entry in second['results']],[2,3])
            entry,_=dictionary_entry(root,{'entryIndex':3,'datasetFingerprint':first['datasetFingerprint']})
            self.assertEqual(entry['definition'],rows[3]['d'])
            self.assertEqual(entry['datasetFingerprint'],'sha256:'+hashlib.sha256(data).hexdigest())
            with self.assertRaises(ValueError):dictionary_entry(root,{'entryIndex':3,'datasetFingerprint':'sha256:'+'0'*64})
            with self.assertRaises(ValueError):dictionary_lookup(root,{'query':'abá','offset':-1})

    def test_reconstruction_withholds_merged_answer_derivatives_on_search_and_resolve(self):
        service=AuthoringService(SimpleNamespace())
        entry={'id':'structure','expression':'a * b','source':{'sourceId':'araujo','passageId':'reviewed'},'sources':[{'sourceId':'araujo','passageId':'reviewed'},{'sourceId':'araujo','passageId':'answer'}]}
        self.assertTrue(service.structure_permitted(entry,{}))
        self.assertFalse(service.structure_permitted(entry,{'excludePassageIds':['answer']}))
        self.assertFalse(service.structure_permitted(entry,{'excludeConstructionIds':['structure']}))
        self.assertFalse(service.structure_permitted(entry,{'excludeLexicalNames':['b']}))
        self.assertFalse(service.structure_permitted(entry,{'allowedSourceIds':['another']}))
        self.assertTrue(service.structure_permitted(entry,{'excludePassageIds':['unrelated']}))
        with self.assertRaises(Exception):service.structure_permitted(entry,{'excludePassageIds':'answer'})

    def test_allowed_origin_survives_disallowed_duplicate_without_disclosing_its_source(self):
        service=AuthoringService(SimpleNamespace())
        good={'sourceId':'araujo','passageId':'allowed'};bad={'sourceId':'bettendorf','passageId':'outside'}
        entry={'id':'same','expression':'tupan','source':bad,'sources':[bad,good],
               '_context':{'sourceId':'bettendorf','line':10},
               '_origins':[{'source':bad,'context':{'sourceId':'bettendorf','line':10}},
                           {'source':good,'context':{'sourceId':'araujo','line':20}}]}
        scoped=service.structure_scoped(entry,{'allowedSourceIds':['araujo','lexicon']})
        self.assertEqual(scoped['source'],good)
        self.assertEqual(scoped['_context'],{'sourceId':'araujo','line':20})
        self.assertNotIn('bettendorf',json.dumps(scoped))
        self.assertIsNone(service.structure_scoped(entry,{'allowedSourceIds':['araujo'],'excludePassageIds':['outside']}))

if __name__=='__main__':unittest.main()
