import contextlib, importlib.util, io, json, os, pathlib, subprocess, sys, tarfile, tempfile, unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from host import Host, REPOS
from ops import Remote, safe_extract

class OperationsTests(unittest.TestCase):
    def fixture(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=pathlib.Path(temp.name)/'server'
        host=Host(root);repo=host.workspace/'oldtupicorpus';repo.mkdir(parents=True)
        def g(*args):return subprocess.run(['git','-C',str(repo),*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout.decode().strip()
        g('init','-b','server/work');g('config','user.email','fixture@example.org');g('config','user.name','Fixture')
        (repo/'historic').mkdir();(repo/'historic/test.tu.py').write_text('initial\n');g('add','.');g('commit','-m','fixture');g('update-ref','refs/remotes/origin/main','HEAD');g('remote','add','origin',REPOS['oldtupicorpus'])
        return host,repo,g
    def test_clean_report_and_changed_manifest(self):
        host,repo,g=self.fixture();self.assertEqual(host.changes('oldtupicorpus')['files'],[])
        (repo/'historic/test.tu.py').write_text('changed\n');first=host.changes('oldtupicorpus')
        self.assertEqual(first['files'][0]['path'],'historic/test.tu.py')
        (repo/'historic/test.tu.py').write_text('changed again\n');self.assertNotEqual(first['reviewSha'],host.changes('oldtupicorpus')['reviewSha'])
    def test_publish_rejects_credential_files_and_symlinks(self):
        host,repo,g=self.fixture();(repo/'historic/secret.key').write_text('not-a-real-secret')
        with self.assertRaises(ValueError):host.changes('oldtupicorpus')
        (repo/'historic/secret.key').unlink();(repo/'historic/alias.py').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError):host.changes('oldtupicorpus')
    def test_collect_then_publish_preserves_source_and_produces_verifiable_git_bundle(self):
        host,repo,g=self.fixture();(repo/'historic/test.tu.py').write_text('changed\n')
        @contextlib.contextmanager
        def stopped(*args,**kwargs):yield
        with patch.object(host,'stopped',stopped):
            first=host.changes('oldtupicorpus')
            with self.assertRaises(ValueError):host.collect('oldtupicorpus',host.root/'bad','0'*64)
            dest=host.collect('oldtupicorpus',host.root/'good',first['reviewSha'])
        self.assertEqual((repo/'historic/test.tu.py').read_text(),'changed\n');self.assertEqual(g('status','--porcelain'),'')
        g('bundle','verify',str(dest/'repository.bundle'))
        self.assertIn('publishedHead',json.loads((dest/'manifest.json').read_text()))
    def test_clone_does_not_reset_existing_workspace(self):
        host,repo,g=self.fixture();(repo/'historic/test.tu.py').write_text('keep this draft\n')
        engine=host.workspace/'nhe-enga';subprocess.run(['git','clone',str(repo),str(engine)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        subprocess.run(['git','-C',str(engine),'remote','set-url','origin',REPOS['nhe-enga']],check=True)
        host.clone_dependencies();self.assertEqual((repo/'historic/test.tu.py').read_text(),'keep this draft\n')
    def test_archive_traversal_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive=pathlib.Path(directory)/'evil.tar';dest=pathlib.Path(directory)/'restore';dest.mkdir()
            for member in ['../escape','/etc/passwd']:
                with tarfile.open(archive,'w') as tar:
                    info=tarfile.TarInfo(member);info.size=1;tar.addfile(info,io.BytesIO(b'x'))
                with self.assertRaises(ValueError):safe_extract(archive,dest)
    def test_same_ssh_identity_conventions_and_no_password_arguments(self):
        with patch.dict(os.environ,{'DEPLOY_HOST':'academiatupi.com','DEPLOY_USER':'root','SSH_IDENTITY':'/tmp/fixture-key'}):
            remote=Remote()
            with patch('ops.command') as command:
                remote.ssh(['python3','/srv/studio path/host.py','logs'])
                args=list(map(str,command.call_args.args[0]))
                self.assertIn('StrictHostKeyChecking=yes',args);self.assertIn('/tmp/fixture-key',args)
                self.assertIn("'/srv/studio path/host.py'",args[-1])
    def test_restore_requires_explicit_confirmation_before_any_operation(self):
        host,repo,g=self.fixture()
        with patch.object(host,'compose') as compose:
            with self.assertRaises(ValueError):host.restore_database('missing.dump','')
            compose.assert_not_called()

if __name__=='__main__':unittest.main()
