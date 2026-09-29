import copy
import hashlib
import io
import json
import os
import pathlib
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from evidence_sync import create_bundle, import_bundle, source_key, passage_mapping, prepare_local_bundle
from ops import Remote
from host import Host


class EvidenceSyncTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        root = pathlib.Path(temporary.name)
        local, remote = root / 'desktop', root / 'server'
        for state in (local, remote):
            (state / 'evidence/sources').mkdir(parents=True)
            (state / 'evidence/assets').mkdir()
        pdf = b'%PDF-1.7\nfixture bytes\n%%EOF\n'
        asset_id = hashlib.sha256(pdf).hexdigest()
        (local / 'evidence/assets' / (asset_id + '.pdf')).write_bytes(pdf)
        passage = {'id': 'passage:local', 'sourceId': 'book', 'ordinal': 1,
                   'sourceFingerprint': 'sha256:editorial', 'sourceFileFingerprint': 'sha256:source'}
        project = {'id': 'local-laptop', 'passages': [passage]}
        hosted = {'id': 'local-server', 'passages': [{**passage, 'id': 'passage:server'}]}
        entry = {'view': {'pageIndex': 2, 'zoom': 1.2, 'rotation': 90}, 'viewAssetId': asset_id,
                 'regions': [{'id': 'crop', 'assetId': asset_id, 'pageIndex': 2, 'rect': [1, 2, 20, 30]}]}
        document = {'version': 1, 'revision': 4, 'projectId': project['id'], 'sourceId': 'book',
                    'selectedAssetId': asset_id, 'assets': [{'id': asset_id, 'bytes': len(pdf),
                    'name': 'a book.pdf', 'originalPath': '/private/laptop/a book.pdf'}],
                    'passages': {passage['id']: entry}}
        manifest = local / 'evidence/sources' / (source_key(project['id'], 'book') + '.json')
        manifest.write_text(json.dumps(document))
        return root, local, remote, project, hosted, document, manifest

    def pack(self, fixture):
        root, local, _, project, *_ = fixture
        archive = root / 'portable.tar'
        counts = create_bundle(local, root, archive, project=project)
        self.assertEqual(counts['assets'], 1)
        return archive

    def test_known_assets_are_omitted_from_the_upload_and_reconciled_from_disk(self):
        fixture = self.fixture(); root, local, remote, project, hosted, document, _ = fixture
        asset_id = document['assets'][0]['id']
        # The server already holds this PDF, so the deploy must not send its bytes again.
        pdf = (local / 'evidence/assets' / (asset_id + '.pdf')).read_bytes()
        (remote / 'evidence/assets' / (asset_id + '.pdf')).write_bytes(pdf)
        archive = root / 'deduplicated.tar'
        counts = create_bundle(local, root, archive, project=project, known={asset_id})
        self.assertEqual((counts['assets'], counts['uploaded'], counts['bytes']), (1, 0, 0))
        self.assertEqual(counts['reused'], len(pdf))
        with tarfile.open(archive) as tar:
            self.assertEqual([member.name for member in tar.getmembers()], ['manifest.json'])
        # The import still links the passage evidence, reusing the bytes already there.
        report = import_bundle(archive, remote, root, project=hosted)
        self.assertEqual(report['assets'], 1)
        self.assertEqual((remote / 'evidence/assets' / (asset_id + '.pdf')).read_bytes(), pdf)
        merged = json.loads(self.hosted_manifest(remote, hosted).read_text())
        self.assertEqual([asset['id'] for asset in merged['assets']], [asset_id])

    def test_deduplicated_upload_is_refused_when_the_server_lacks_the_asset(self):
        fixture = self.fixture(); root, local, remote, project, hosted, document, _ = fixture
        asset_id = document['assets'][0]['id']
        archive = root / 'deduplicated.tar'
        # Claimed as already held, but absent on the server: never silently dropped.
        create_bundle(local, root, archive, project=project, known={asset_id})
        with self.assertRaises(ValueError):import_bundle(archive, remote, root, project=hosted)
        # A corrupted server copy is caught too, rather than trusted on its name.
        (remote / 'evidence/assets' / (asset_id + '.pdf')).write_bytes(b'%PDF-1.7\ntampered\n%%EOF\n')
        with self.assertRaises(ValueError):import_bundle(archive, remote, root, project=hosted)

    def hosted_manifest(self, remote, project):
        return remote / 'evidence/sources' / (source_key(project['id'], 'book') + '.json')

    def rewrite_archive(self, archive, transform):
        with tarfile.open(archive) as tar:
            files = [(member.name, tar.extractfile(member).read()) for member in tar.getmembers()]
        files = transform(files)
        with tarfile.open(archive, 'w') as tar:
            for name, data in files:
                member = tarfile.TarInfo(name); member.size = len(data)
                tar.addfile(member, io.BytesIO(data))

    def test_portable_identity_regions_bytes_and_idempotence(self):
        fixture = self.fixture(); root, local, remote, project, hosted, original, manifest = fixture
        before = manifest.read_bytes()
        archive = self.pack(fixture)
        with tarfile.open(archive) as tar:
            payload = json.load(tar.extractfile('manifest.json'))
            self.assertNotIn('/private/laptop', json.dumps(payload))
            self.assertEqual(set(tar.getnames()), {'manifest.json', 'assets/' + original['selectedAssetId'] + '.pdf'})
        report = import_bundle(archive, remote, root, project=hosted)
        self.assertEqual(report['passagesAdded'], 1)
        saved = self.hosted_manifest(remote, hosted)
        result = json.loads(saved.read_text())
        self.assertEqual(result['projectId'], hosted['id'])
        self.assertEqual(result['passages']['passage:server'], original['passages']['passage:local'])
        self.assertEqual(result['assets'][0]['originalPath'], str(remote / 'evidence/assets' / (original['selectedAssetId'] + '.pdf')))
        first_bytes = saved.read_bytes()
        self.assertEqual(import_bundle(archive, remote, root, project=hosted)['passagesAdded'], 0)
        self.assertEqual(saved.read_bytes(), first_bytes)
        self.assertEqual(manifest.read_bytes(), before)

    def test_remote_upload_selection_and_regions_survive_later_deploy(self):
        fixture = self.fixture(); root, _, remote, _, hosted, document, _ = fixture
        archive = self.pack(fixture)
        other_pdf = b'%PDF-1.7\nhosted upload\n%%EOF\n'
        other_id = hashlib.sha256(other_pdf).hexdigest()
        (remote / 'evidence/assets' / (other_id + '.pdf')).write_bytes(other_pdf)
        document = copy.deepcopy(document); document['projectId'] = hosted['id']
        document['selectedAssetId'] = other_id
        document['assets'] = [{'id': other_id, 'name': 'Uploaded.pdf', 'bytes': len(other_pdf), 'originalPath': '/data/imports/upload.pdf'}]
        document['passages'] = {'passage:server': {'view': {'pageIndex': 0, 'zoom': 1, 'rotation': 0},
                                                'regions': [], 'viewAssetId': other_id}}
        target = self.hosted_manifest(remote, hosted); target.write_text(json.dumps(document))
        report = import_bundle(archive, remote, root, project=hosted)
        result = json.loads(target.read_text())
        self.assertEqual(result['selectedAssetId'], other_id)
        self.assertEqual(result['passages'], document['passages'])
        self.assertEqual(result['assets'][0], document['assets'][0])
        self.assertEqual(len(result['assets']), 2)
        self.assertEqual(report['preservedServerPassages'], [{'sourceId': 'book', 'passageId': 'passage:server'}])
        self.assertEqual((remote / 'evidence/assets' / (other_id + '.pdf')).read_bytes(), other_pdf)

    def test_pending_unmatched_sources_and_guides_are_retained_in_archive(self):
        fixture = self.fixture(); root, _, remote, _, hosted, document, manifest = fixture
        document['passages']['pending:desktop-only'] = copy.deepcopy(document['passages']['passage:local'])
        document['passages']['passage:local']['guide'] = {'assetId': document['selectedAssetId'], 'fromPassageId': 'pending:desktop-only'}
        manifest.write_text(json.dumps(document))
        archive = self.pack(fixture)
        report = import_bundle(archive, remote, root, project=hosted)
        self.assertEqual(report['unmatchedPassages'], [{'sourceId': 'book', 'passageId': 'pending:desktop-only'}])
        self.assertEqual(report['unmatchedGuides'], ['passage:local'])
        saved = json.loads(self.hosted_manifest(remote, hosted).read_text())
        self.assertNotIn('guide', saved['passages']['passage:server'])
        # Missing sources keep their bytes and complete metadata without inventing a source.
        target = root / 'empty-server'; target.mkdir()
        report = import_bundle(archive, target, root, project={'id': 'empty', 'passages': []})
        self.assertEqual(report['unavailableSources'], ['book'])
        self.assertTrue((target / 'evidence/assets' / (document['selectedAssetId'] + '.pdf')).exists())
        with tarfile.open(archive) as tar:
            self.assertIn('pending:desktop-only', json.load(tar.extractfile('manifest.json'))['sources'][0]['passages'])

    def test_guide_identity_and_ordinal_are_remapped(self):
        fixture = self.fixture(); root, _, remote, project, hosted, document, manifest = fixture
        project['passages'].append({**project['passages'][0], 'id': 'passage:earlier-local', 'sourceFingerprint': 'sha256:earlier', 'ordinal': 2})
        hosted['passages'].append({**project['passages'][1], 'id': 'passage:earlier-server', 'ordinal': 5})
        document['passages']['passage:local']['guide'] = {'assetId': document['selectedAssetId'], 'fromPassageId': 'passage:earlier-local', 'fromOrdinal': 2}
        manifest.write_text(json.dumps(document)); archive = self.pack(fixture)
        import_bundle(archive, remote, root, project=hosted)
        saved = json.loads(self.hosted_manifest(remote, hosted).read_text())
        self.assertEqual(saved['passages']['passage:server']['guide']['fromPassageId'], 'passage:earlier-server')
        self.assertEqual(saved['passages']['passage:server']['guide']['fromOrdinal'], 5)

    def test_empty_source_catalog_still_receives_its_pdf(self):
        fixture = self.fixture(); root, _, remote, _, hosted, document, _ = fixture
        archive = self.pack(fixture)
        hosted['passages'] = []
        hosted['sources'] = [{'id': 'book', 'title': 'New source', 'fileName': 'book.tu.py', 'year': '', 'passageCount': 0}]
        report = import_bundle(archive, remote, root, project=hosted)
        self.assertEqual(report['sources'], 1)
        self.assertEqual(report['unavailableSources'], [])
        result = json.loads(self.hosted_manifest(remote, hosted).read_text())
        self.assertEqual(result['selectedAssetId'], document['selectedAssetId'])
        self.assertEqual(result['passages'], {})

    def test_ambiguous_or_changed_passages_are_not_matched_by_ordinal(self):
        item = {'id': 'old', 'sourceId': 'book', 'sourceFingerprint': 'same', 'sourceFileFingerprint': 'old-file', 'ordinal': 1}
        current = [{**item, 'id': 'new-a', 'sourceFileFingerprint': 'changed'}, {**item, 'id': 'new-b', 'ordinal': 2, 'sourceFileFingerprint': 'changed'}]
        self.assertEqual(passage_mapping([item], current), {})
        self.assertEqual(passage_mapping([item], [{**current[0], 'sourceFingerprint': 'changed'}]), {})
        self.assertEqual(passage_mapping([item], [{**current[0], 'sourceFileFingerprint': 'old-file'}])['old']['id'], 'new-a')
        self.assertEqual(passage_mapping([item, {**item, 'id': 'another-old'}], [current[0]]), {})

    def test_identical_source_bytes_match_across_python_ast_fingerprint_versions(self):
        fixture = self.fixture(); root, _, remote, project, hosted, original, _ = fixture
        source_hash = 'sha256:' + hashlib.sha256(b'f(a)\n').hexdigest()
        project['passages'][0].update(sourceFileFingerprint=source_hash, sourceFingerprint='sha256:python314')
        hosted['passages'][0].update(sourceFileFingerprint=source_hash, sourceFingerprint='sha256:python311')
        archive = self.pack(fixture)
        report = import_bundle(archive, remote, root, project=hosted)
        self.assertEqual(report['passagesAdded'], 1)
        self.assertEqual(report['unmatchedPassages'], [])
        saved = json.loads(self.hosted_manifest(remote, hosted).read_text())
        self.assertEqual(saved['passages']['passage:server'], original['passages']['passage:local'])

    def test_exact_file_identity_never_allows_changed_files_or_colliding_passages(self):
        source_hash = 'sha256:' + hashlib.sha256(b'f(a)\nf(a)\n').hexdigest()
        incoming = {'id': 'passage:same-id', 'sourceId': 'book', 'ordinal': 1,
                    'sourceFileFingerprint': source_hash, 'sourceFingerprint': 'sha256:python314'}
        current = {**incoming, 'sourceFingerprint': 'sha256:python311'}
        self.assertEqual(passage_mapping([incoming], [current]), {incoming['id']: current})
        changed = {**current, 'sourceFileFingerprint': 'sha256:' + '0' * 64}
        self.assertEqual(passage_mapping([incoming], [changed]), {}, 'same UUID/ordinal cannot attach evidence after source content changes')
        self.assertEqual(passage_mapping([incoming], [{**current, 'sourceId': 'another-book'}]), {})
        self.assertEqual(passage_mapping([incoming, {**incoming, 'id': 'passage:duplicate'}], [current]), {})
        self.assertEqual(passage_mapping([incoming], [current, {**current, 'id': 'passage:duplicate'}]), {})
        self.assertEqual(passage_mapping([{**incoming, 'sourceFileFingerprint': ''}], [{**current, 'sourceFileFingerprint': ''}]), {})

    def test_checksum_missing_files_extra_members_and_traversal_fail_before_writes(self):
        for kind in ('corrupt', 'missing', 'extra', 'traversal', 'duplicate', 'symlink'):
            with self.subTest(kind=kind):
                fixture = self.fixture(); root, _, remote, _, hosted, _, _ = fixture
                archive = self.pack(fixture)
                if kind == 'symlink':
                    with tarfile.open(archive, 'a') as tar:
                        member = tarfile.TarInfo('assets/' + 'a' * 64 + '.pdf'); member.type = tarfile.SYMTYPE; member.linkname = '/etc/passwd'; tar.addfile(member)
                else:
                    def alter(files):
                        if kind == 'corrupt':return [files[0], (files[1][0], b'%PDF-corrupt')]
                        if kind == 'missing':return files[:1]
                        if kind == 'extra':return files + [('unrelated.json', b'{}')]
                        if kind == 'traversal':return files + [('../escape', b'bad')]
                        return files + files[:1]
                    self.rewrite_archive(archive, alter)
                with self.assertRaises(ValueError):import_bundle(archive, remote, root, project=hosted)
                self.assertEqual(list((remote / 'evidence/assets').iterdir()), [])
                self.assertEqual(list((remote / 'evidence/sources').iterdir()), [])

    def test_corrupt_local_and_existing_remote_bytes_and_symlinks_are_preserved(self):
        fixture = self.fixture(); root, local, remote, project, hosted, document, _ = fixture
        archive = self.pack(fixture)
        pdf_name = document['selectedAssetId'] + '.pdf'
        remote_pdf = remote / 'evidence/assets' / pdf_name; remote_pdf.write_bytes(b'changed')
        with self.assertRaises(ValueError):import_bundle(archive, remote, root, project=hosted)
        self.assertEqual(remote_pdf.read_bytes(), b'changed')
        remote_pdf.unlink(); remote_pdf.symlink_to(local / 'evidence/assets' / pdf_name)
        with self.assertRaises(ValueError):import_bundle(archive, remote, root, project=hosted)
        local_pdf = local / 'evidence/assets' / pdf_name; local_pdf.write_bytes(b'changed')
        with self.assertRaises(ValueError):create_bundle(local, root, root / 'bad.tar', project=project)

    def test_only_selected_project_is_exported_and_empty_profiles_are_optional(self):
        fixture = self.fixture(); root, local, _, project, _, document, _ = fixture
        other = copy.deepcopy(document); other['projectId'] = 'unrelated'
        (local / 'evidence/sources' / (source_key('unrelated', 'book') + '.json')).write_text(json.dumps(other))
        archive = self.pack(fixture)
        with tarfile.open(archive) as tar:self.assertEqual(len(json.load(tar.extractfile('manifest.json'))['sources']), 1)
        with patch.dict(os.environ, {'LOCAL_STUDIO_STATE': str(root / 'missing')}):
            with self.assertRaises(ValueError):prepare_local_bundle(root / 'none.tar')
        with patch.dict(os.environ, {'LOCAL_STUDIO_STATE': '', 'LOCAL_PROJECT_PARENT': ''}), patch('evidence_sync.default_state', return_value=root / 'missing'):
            self.assertIsNone(prepare_local_bundle(root / 'none.tar'))

    def test_deploy_prepares_bundle_before_upload_and_passes_staged_path(self):
        fixture = self.fixture(); archive = self.pack(fixture)
        remote = Remote(); calls = []
        with patch('evidence_sync.prepare_local_bundle', side_effect=lambda path, known=(): (calls.append('prepare') or archive)), \
                patch('desktop_sync.prepare_local_bundle', return_value=None), \
                patch.object(remote, 'inventory', return_value={}), \
                patch.object(remote, 'prepare_release', side_effect=lambda ref, evidence, desktop: (calls.append(('preflight', evidence)) or 'a' * 40)), \
                patch.object(remote, 'upload', side_effect=lambda file, target: calls.append(('upload', target))), \
                patch.object(remote, 'deploy_release', side_effect=lambda ref, target, desktop: calls.append(('release', target))):
            remote.deploy()
        self.assertEqual(calls[0], 'prepare')
        self.assertEqual(calls[1], ('preflight', True))
        self.assertEqual(calls[2][0], 'upload')
        self.assertEqual(calls[2][1], calls[3][1])
        # The read-only inventory aside, a corrupt local bundle must reach the server
        # with nothing at all: no preflight, no upload, no release.
        with patch('evidence_sync.prepare_local_bundle', side_effect=ValueError('corrupt')), \
                patch.object(remote, 'inventory', return_value={}), patch.object(remote, 'ssh') as ssh:
            with self.assertRaises(ValueError):remote.deploy()
            ssh.assert_not_called()

    def test_host_retains_hashed_archive_and_runs_import_in_stopped_deploy(self):
        fixture = self.fixture(); root, _, _, _, _, _, _ = fixture
        archive = self.pack(fixture)
        host = Host(root / 'host'); host.data.mkdir()
        with patch.object(host, 'compose') as compose:
            host.import_evidence(archive)
            host.import_evidence(archive)
        retained = list((host.data / 'evidence-imports').glob('*.tar'))
        self.assertEqual(len(retained), 1)
        self.assertEqual(retained[0].stem, hashlib.sha256(archive.read_bytes()).hexdigest())
        args = compose.call_args.args
        self.assertEqual(args[:6], ('run', '--rm', '--no-deps', 'studio', 'python3', 'scripts/collab/evidence_sync.py'))
        self.assertIn('/workspace', args)


if __name__ == '__main__':
    unittest.main()
