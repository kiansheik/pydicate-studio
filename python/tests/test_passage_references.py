import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from passage_references import changes, read, paths
from reviewed_files import apply_reviewed_files

class PassageReferenceFilesTests(unittest.TestCase):
    def test_whitespace_and_neighbors_survive_one_record_update(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); legacy,_=paths(root,'source');legacy.parent.mkdir(parents=True)
            original=b'\n  {"ordinal": 1, "surface": "one"}\n\n{"ordinal":2,"surface":"two"}\n\n'
            legacy.write_bytes(original)
            records=read(root,'source');records[2]['surface']='changed'
            result=changes(root,'source',records)[0]['after']
            self.assertTrue(result.startswith(original[:original.index(b'{"ordinal":2')]))
            self.assertTrue(result.endswith(b'\n\n'))
    def test_failed_transaction_removes_new_companion_and_preserves_original(self):
        import os
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); existing=root/'source.py';existing.write_bytes(b'original')
            new=root/'new.studio.json'
            members=[{'path':new,'before':b'','beforeExists':False,'after':b'new'},
                     {'path':existing,'before':b'original','after':b'changed'}]
            replace=os.replace
            def fail(source,target):
                if Path(target)==existing:raise OSError('simulated interruption')
                return replace(source,target)
            with patch('reviewed_files.os.replace',side_effect=fail),self.assertRaises(OSError):
                apply_reviewed_files(members,root/'recovery/event.json',{},lambda message,code: self.fail(message))
            self.assertFalse(new.exists());self.assertEqual(existing.read_bytes(),b'original')
