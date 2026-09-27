import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from desktop_sync import create_bundle, extract_bundle, checksum, digest
from host import Host


class DesktopSyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.state = self.root/'state'; self.state.mkdir()
        self.project = {'id': 'local-test', 'passages': [], 'sources': []}

    def write(self, relative, data):
        file = self.state/relative; file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data); return file

    def test_byte_identical_deterministic_archive_preserves_all_allowed_history(self):
        self.write('drafts/a.json', b'{"projectId":"local-test","drafts":{"a":{"workflow":{"stage":"complete"}}}}')
        self.write('analysis/records/a.json', b'{"jobs":{"unfinished":{"state":"running"}}}')
        self.write('lexical-notes/a.json', b'{"records":[]}')
        self.write('usage/events.jsonl', b'{"event":"save"}\n')
        self.write('ai/config.json', b'PRIVATE CREDENTIALS')
        self.write('ai/ai/config.json', b'PRIVATE NESTED CREDENTIALS')
        self.write('analysis/mcp/token', b'PRIVATE TOKEN')
        self.write('Cookies', b'PRIVATE COOKIE')
        source = self.state/'analysis/records/a.json'; before = source.read_bytes()
        archive = self.root/'one.tar'; other = self.root/'two.tar'
        result = create_bundle(self.state, self.root, archive, project=self.project)
        create_bundle(self.state, self.root, other, project=self.project)
        self.assertEqual(result['files'], 4)
        self.assertEqual(checksum(archive), checksum(other))
        directory = self.root/'imports'/checksum(archive)
        self.assertEqual(extract_bundle(archive, directory)['files'], 4)
        self.assertEqual(source.read_bytes(), before)
        self.assertEqual((directory/'files/analysis/records/a.json').read_bytes(), before)
        self.assertFalse((directory/'files/ai/config.json').exists())
        (directory/'receipt.json').write_text('{}')
        extract_bundle(archive, directory)  # Repeated capture preserves reconciliation receipt.
        self.assertTrue((directory/'receipt.json').exists())
        (directory/'files/analysis/records/a.json').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'Retained research file changed'):
            extract_bundle(archive, directory)

    def test_symlinks_and_traversal_rejected_before_publication(self):
        self.write('drafts/source.json', b'{}')
        (self.state/'drafts/link.json').symlink_to(self.state/'drafts/source.json')
        with self.assertRaises(ValueError):
            create_bundle(self.state, self.root, self.root/'bad.tar', project=self.project)
        archive = self.root/'evil.tar'
        with tarfile.open(archive, 'w') as tar:
            for name in ['manifest.json', 'files/../../escape']:
                item = tarfile.TarInfo(name); item.size = 2
                tar.addfile(item, io.BytesIO(b'{}'))
        target = self.root/'imports'/checksum(archive)
        with self.assertRaises(ValueError): extract_bundle(archive, target)
        self.assertFalse(target.exists())

    def test_intermediate_research_directory_symlink_is_rejected(self):
        external = self.root/'outside'; (external/'records').mkdir(parents=True)
        (external/'records/secret.json').write_bytes(b'{}')
        (self.state/'analysis').symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'Research directory must not be a symlink'):
            create_bundle(self.state,self.root,self.root/'linked.tar',project=self.project)

    def test_host_gives_application_access_to_parent_archive_directory(self):
        self.write('drafts/a.json', b'{"projectId":"local-test","drafts":{}}')
        archive = self.root/'research.tar'
        create_bundle(self.state, self.root, archive, project=self.project)
        host = Host(self.root/'host'); host.data.mkdir(parents=True)
        with patch.object(host, 'application_ownership') as ownership, patch.object(host, 'compose') as compose:
            host.import_desktop(archive)
        ownership.assert_called_once_with(host.data/'desktop-imports')
        compose.assert_called_once_with('run','--rm','--no-deps','studio','node','server/desktop-import.cjs',
                                       '--directory','/data/desktop-imports/'+checksum(archive))

    def test_sparse_references_are_preserved_and_stale_inspection_rejected(self):
        corpus = self.root/'oldtupicorpus'; (corpus/'historic').mkdir(parents=True)
        raw = b'N("source")\n'; (corpus/'historic/book.tu.py').write_bytes(raw)
        sparse = corpus/'ground_truth/records/historic/book.studio.json'
        sparse.parent.mkdir(parents=True); sparse.write_bytes(b'{"saved":"reference"}')
        project = {**self.project, 'sources':[{'id':'book','fileName':'book.tu.py'}],
                   'passages':[{'sourceId':'book','sourceFileFingerprint':'sha256:'+digest(raw)}]}
        archive = self.root/'source.tar'
        self.assertEqual(create_bundle(self.state,self.root,archive,project=project)['files'],2)
        with tarfile.open(archive) as tar:
            self.assertEqual(tar.extractfile('files/corpus/ground_truth/records/historic/book.studio.json').read(), sparse.read_bytes())
        (corpus/'historic/book.tu.py').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'Source changed after inspection'):
            create_bundle(self.state,self.root,self.root/'changed.tar',project=project)

    def test_new_research_file_during_capture_is_not_silently_omitted(self):
        from desktop_sync import research_files
        self.write('drafts/a.json', b'{}')
        initial = research_files(self.state)
        with patch('desktop_sync.research_files', side_effect=[initial, initial + [(self.state/'drafts/new.json','files/drafts/new.json','drafts')]]):
            with self.assertRaisesRegex(ValueError,'file list changed'):
                create_bundle(self.state,self.root,self.root/'racing.tar',project=self.project)

    def test_checksum_mismatch_does_not_publish_partial_archive(self):
        archive = self.root/'bad.tar'
        manifest = {'version':1,'project':self.project,'files':[
            {'path':'files/drafts/a.json','sha256':digest(b'original'),'bytes':7}]}
        with tarfile.open(archive,'w') as tar:
            for name, data in [('manifest.json', json.dumps(manifest).encode()), ('files/drafts/a.json', b'changed')]:
                item = tarfile.TarInfo(name); item.size = len(data); tar.addfile(item, io.BytesIO(data))
        target = self.root/'imports'/checksum(archive)
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'): extract_bundle(archive,target)
        self.assertFalse(target.exists())


if __name__ == '__main__': unittest.main()
