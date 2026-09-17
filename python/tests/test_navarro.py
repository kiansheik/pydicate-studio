import sys
from pathlib import Path
import tempfile
import sqlite3
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from navarro_search import search_dictionary,fold

class NavarroTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        folder=self.root/'pydicate/pydicate';folder.mkdir(parents=True)
        self.db=folder/'tupi_only.db'
        with sqlite3.connect(self.db) as c:
            c.execute('CREATE TABLE tupi_only (id INTEGER, vid INTEGER, first_word TEXT, definition TEXT, gloss_language TEXT, gloss TEXT)')
            c.executemany('INSERT INTO tupi_only VALUES(?,?,?,?,?,?)',[(1,10,'îuká','(v.tr.) matar','pt','matar'),(2,11,'îuká','(s.) outra acepção','pt','sentido distinto'),(3,12,'oka','(s.) casa','pt','casa')])
        c.close()
    def tearDown(self):self.tmp.cleanup()
    def test_accents_do_not_merge_senses(self):
        data=search_dictionary(self.root,{'query':'iuka'})
        self.assertEqual(len(data['results']),2)
        self.assertNotEqual(data['results'][0]['id'],data['results'][1]['id'])
        self.assertEqual(data['results'][0]['headword'],'îuká')
    def test_portuguese_definition_and_read_only(self):
        before=self.db.read_bytes()
        data=search_dictionary(self.root,{'query':'casa'})
        self.assertEqual(data['results'][0]['headword'],'oka')
        self.assertEqual(data['results'][0]['suggestedCategory'],'Noun')
        self.assertEqual(before,self.db.read_bytes())
    def test_invalid_query_and_unicode_normalization(self):
        self.assertEqual(fold('îuká'),fold('i\u0302uka\u0301'))
        with self.assertRaises(ValueError):search_dictionary(self.root,{'query':''})
