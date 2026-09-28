"""Exercise the remote release shell against disposable local Git repositories."""
import os, pathlib, subprocess, sys, tempfile, unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from ops import Remote


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        credentials = patch('codex_auth.install')
        credentials.start(); self.addCleanup(credentials.stop)
        mocked = patch('desktop_sync.prepare_local_bundle', return_value=None)
        mocked.start(); self.addCleanup(mocked.stop)

    def fixture(self, missing=None):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        root = pathlib.Path(temporary.name); repo = root / 'origin'; repo.mkdir()
        def git(*args):
            return subprocess.run(['git', '-C', str(repo), *args], check=True,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()
        git('init', '-b', 'main'); git('config', 'user.email', 'fixture@example.org'); git('config', 'user.name', 'Fixture')
        files = {
            'scripts/collab/host.py': """import argparse, pathlib
p=argparse.ArgumentParser(); p.add_argument('action')
for name in ('root','public-url','smtp','neo-path','evidence','desktop'): p.add_argument('--'+name)
a=p.parse_args()
pathlib.Path(a.root, 'deployed').write_text('first')
""",
            'scripts/collab/evidence_sync.py': '# fixture importer\n',
            'scripts/collab/desktop_sync.py': '# fixture research archive\n',
            'server/desktop-import.cjs': '// fixture research importer\n',
            'deploy/collab/compose.yml': 'services: {}\n',
            'deploy/collab/Dockerfile': 'FROM scratch\n',
            'deploy/collab/dependencies.json': '{}\n',
        }
        for name, content in files.items():
            if name == missing: continue
            path = repo / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content)
        git('add', '.'); git('commit', '-m', 'fixture')
        binary = root / 'bin'; binary.mkdir()
        # Docker availability and flock are platform-specific; Git, Python and
        # both deployment shell scripts execute for real in the fixture.
        for name in ('docker', 'flock'):
            path = binary / name; path.write_text('#!/bin/sh\nexit 0\n'); path.chmod(0o755)
        remote = Remote(); remote.root = str(root / 'server')
        def ssh(args, *, data=None, stdout=None, **kwargs):
            return subprocess.run(args, input=data, stdout=stdout, stderr=subprocess.PIPE,
                                  check=True, env={**os.environ, 'PATH': str(binary)+os.pathsep+os.environ['PATH']})
        return root, repo, remote, git, ssh

    def test_incompatible_release_fails_before_pdf_upload(self):
        for missing in ('scripts/collab/host.py', 'scripts/collab/evidence_sync.py', 'deploy/collab/Dockerfile'):
            with self.subTest(missing=missing):
                root, repo, remote, git, ssh = self.fixture(missing)
                with patch('ops.URL', str(repo)), patch.object(remote, 'ssh', side_effect=ssh), \
                        patch('evidence_sync.prepare_local_bundle', return_value=root/'evidence.tar'), \
                        patch.object(remote, 'upload') as upload, patch.object(remote, 'deploy_release') as deploy, \
                        patch.dict(os.environ, {'STUDIO_REF': 'main'}):
                    with self.assertRaises(subprocess.CalledProcessError) as caught: remote.deploy()
                    self.assertIn(b'Selected release', caught.exception.stderr)
                    upload.assert_not_called(); deploy.assert_not_called()
                self.assertFalse(list((root/'server/releases').glob('.incoming.*')))

    def test_pdf_cli_capability_is_checked_before_upload(self):
        root, repo, remote, git, ssh = self.fixture()
        host = repo/'scripts/collab/host.py'; host.write_text(host.read_text().replace(",'evidence'", ''))
        git('add', '.'); git('commit', '-m', 'old host without evidence option')
        with patch('ops.URL', str(repo)), patch.object(remote, 'ssh', side_effect=ssh):
            with self.assertRaises(subprocess.CalledProcessError) as caught: remote.prepare_release('main', True)
        self.assertIn(b'does not accept desktop PDF evidence', caught.exception.stderr)

    def test_branch_movement_during_upload_does_not_change_deployed_commit(self):
        root, repo, remote, git, ssh = self.fixture(); first = git('rev-parse', 'HEAD')
        def upload(file, target):
            host = repo/'scripts/collab/host.py'; host.write_text(host.read_text().replace("'first'", "'second'"))
            git('add', '.'); git('commit', '-m', 'branch moves during upload')
            path = pathlib.Path(target); path.parent.mkdir(exist_ok=True); path.write_bytes(b'fixture')
        with patch('ops.URL', str(repo)), patch.object(remote, 'ssh', side_effect=ssh), \
                patch('evidence_sync.prepare_local_bundle', return_value=root/'evidence.tar'), \
                patch.object(remote, 'upload', side_effect=upload), patch.dict(os.environ, {'STUDIO_REF': 'main'}):
            remote.deploy()
        self.assertNotEqual(first, git('rev-parse', 'HEAD'))
        self.assertEqual((root/'server/deployed').read_text(), 'first')
        self.assertTrue((root/'server/releases'/first/'.git').is_dir())
        self.assertFalse(list((root/'server/incoming').iterdir()))

    def test_release_modified_after_preflight_is_not_executed(self):
        root, repo, remote, git, ssh = self.fixture()
        with patch('ops.URL', str(repo)), patch.object(remote, 'ssh', side_effect=ssh):
            sha = remote.prepare_release('main')
            (root/'server/releases'/sha/'unexpected').write_text('changed')
            with self.assertRaises(subprocess.CalledProcessError): remote.deploy_release(sha)
        self.assertFalse((root/'server/deployed').exists())

    def test_research_capability_is_checked_before_upload(self):
        root, repo, remote, git, ssh = self.fixture('server/desktop-import.cjs')
        with patch('ops.URL', str(repo)), patch.object(remote, 'ssh', side_effect=ssh):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                remote.prepare_release('main', desktop=True)
        self.assertIn(b'does not support desktop research migration', caught.exception.stderr)

    def test_research_bundle_reaches_pinned_release_and_is_removed_after_success(self):
        root, repo, remote, git, ssh = self.fixture()
        def upload(file, target):
            path = pathlib.Path(target); path.parent.mkdir(exist_ok=True); path.write_bytes(b'research fixture')
        with patch('ops.URL', str(repo)), patch.object(remote, 'ssh', side_effect=ssh), \
                patch('evidence_sync.prepare_local_bundle', return_value=None), \
                patch('desktop_sync.prepare_local_bundle', return_value=root/'desktop.tar'), \
                patch.object(remote, 'upload', side_effect=upload):
            remote.deploy()
        self.assertEqual((root/'server/deployed').read_text(), 'first')
        self.assertFalse(list((root/'server/incoming').iterdir()))

    def test_only_validated_full_sha_can_reach_deployment(self):
        remote = Remote()
        with patch.object(remote, 'ssh') as ssh:
            with self.assertRaises(ValueError): remote.deploy_release('main')
            ssh.assert_not_called()
        with patch.object(remote, 'ssh', return_value=subprocess.CompletedProcess([], 0, b'noise\n'+b'a'*40)):
            with self.assertRaises(ValueError): remote.prepare_release('main')


if __name__ == '__main__': unittest.main()
