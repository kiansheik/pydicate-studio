import contextlib, importlib.util, io, json, os, pathlib, subprocess, sys, tarfile, tempfile, unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from host import Host, REPOS, GRAMMAR_SUPPORT, SPARSE
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
    def sparse_grammar_fixture(self,patterns):
        host,repo,g=self.local_fetch_fixture();engine=host.workspace/'nhe-enga'
        def eg(*args):return subprocess.run(['git','-C',str(engine),*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout.decode().strip()
        eg('config','user.email','fixture@example.org');eg('config','user.name','Fixture')
        files={'tupi/tupi/verb.py':'grammar\n','tests/test_grammar.py':'regression\n',
               'docs/agent/grammar-navigation.md':'navigation\n','docs/unrelated.txt':'excluded\n',
               'AGENTS.md':'instructions\n','AGENT_NOTES.md':'notes\n','custom/keep.txt':'custom\n'}
        for name,content in files.items():
            target=engine/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content)
        eg('add','.');eg('commit','-m','grammar fixture');eg('sparse-checkout','set','--no-cone',*patterns)
        return host,engine,eg
    def test_fresh_sparse_checkout_includes_grammar_guides_and_tests(self):
        host,engine,g=self.sparse_grammar_fixture(SPARSE)
        for name in ('docs/agent/grammar-navigation.md','tests/test_grammar.py','AGENTS.md','AGENT_NOTES.md'):
            self.assertTrue((engine/name).is_file(),name)
        self.assertFalse((engine/'docs/unrelated.txt').exists())
        self.assertEqual(g('status','--porcelain'),'')
    def test_deploy_expands_sparse_grammar_after_backup_preserving_dirty_work_and_custom_patterns(self):
        old_patterns=[pattern for pattern in SPARSE if pattern not in GRAMMAR_SUPPORT]
        host,engine,g=self.sparse_grammar_fixture([*old_patterns,'/custom/'])
        self.assertFalse((engine/'docs/agent/grammar-navigation.md').exists())
        (engine/'tupi/tupi/verb.py').write_text('saved grammar correction\n')
        (engine/'AGENT_NOTES.md').write_text('saved handwritten notes\n')
        (engine/'custom/keep.txt').write_text('saved custom file\n')
        # An untracked local file that occupies an omitted tracked path must win too.
        (engine/'tests').mkdir();(engine/'tests/test_grammar.py').write_text('local test work\n')
        def checkpoint(*args,**kwargs):
            self.assertFalse((engine/'docs/agent/grammar-navigation.md').exists())
        with self.root_workspace_operation(host) as (owned,commands):
            with patch.object(host,'checkpoint',side_effect=checkpoint):host.deploy()
        self.assertEqual((engine/'docs/agent/grammar-navigation.md').read_text(),'navigation\n')
        self.assertEqual((engine/'tests/test_grammar.py').read_text(),'local test work\n')
        self.assertEqual((engine/'tupi/tupi/verb.py').read_text(),'saved grammar correction\n')
        self.assertEqual((engine/'AGENT_NOTES.md').read_text(),'saved handwritten notes\n')
        self.assertEqual((engine/'custom/keep.txt').read_text(),'saved custom file\n')
        self.assertFalse((engine/'docs/unrelated.txt').exists())
        self.assertIn('/custom/',g('sparse-checkout','list').splitlines())
        self.assertIn(engine/'docs/agent/grammar-navigation.md',owned)
        self.assertIn(('up','-d','--wait','studio'),commands)
        (engine/'docs/agent/grammar-navigation.md').write_text('new grammar note\n')
        host.expand_grammar_checkout()
        self.assertEqual((engine/'docs/agent/grammar-navigation.md').read_text(),'new grammar note\n')
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
    @contextlib.contextmanager
    def root_workspace_operation(self,host):
        """Run real Git with production's umask; observe chown without requiring root."""
        owned={};commands=[]
        host.config.mkdir(exist_ok=True);secret=host.config/'runtime.env';secret.write_text('private fixture');secret.chmod(0o600)
        def chown(path,uid,gid,**kwargs):
            path=pathlib.Path(path);self.assertEqual((uid,gid),(1000,1000))
            self.assertFalse(path.is_relative_to(host.config))
            owned[path]=path.stat().st_ino
        def compose(*args,**kwargs):
            commands.append(args)
            if args[0]=='run' or (args[0]=='up' and args[-1]=='studio') or args[0]=='exec':
                for repo in host.workspace.iterdir():
                    if not repo.is_dir():continue
                    for name in ('index','ORIG_HEAD','FETCH_HEAD'):
                        path=repo/'.git'/name
                        if path.exists():self.assertEqual(owned.get(path),path.stat().st_ino,f'{path} must be owned by the app before migration/restart/verification')
            return b'running-container' if args[0]=='ps' else b''
        previous=os.umask(0o077)
        try:
            with patch('host.os.geteuid',return_value=0),patch('host.os.chown',side_effect=chown),patch.object(host,'compose',side_effect=compose),patch.object(host,'checkpoint'):
                yield owned,commands
        finally:
            os.umask(previous)
            self.assertEqual(secret.read_text(),'private fixture');self.assertEqual(secret.stat().st_mode&0o777,0o600)
    def local_fetch_fixture(self):
        host,repo,g=self.fixture();g('branch','main');g('remote','set-url','origin',str(repo))
        engine=host.workspace/'nhe-enga'
        subprocess.run(['git','clone',str(repo),str(engine)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        return host,repo,g
    def test_deploy_and_sync_restore_git_ownership_before_app_start(self):
        for action in ('deploy','sync'):
            with self.subTest(action=action):
                host,repo,g=self.local_fetch_fixture()
                with self.root_workspace_operation(host) as (owned,commands):
                    if action=='deploy':host.deploy()
                    else:host.sync('oldtupicorpus')
                self.assertIn(repo/'.git/ORIG_HEAD',owned)
                self.assertEqual((repo/'.git/ORIG_HEAD').stat().st_mode&0o777,0o600)
                self.assertIn(('up','-d','--wait','studio'),commands)
                self.assertEqual(g('status','--porcelain'),'')
    def test_failed_fetch_restores_workspace_ownership_and_leaves_deploy_stopped(self):
        host,repo,g=self.local_fetch_fixture()
        subprocess.run(['git','-C',str(host.workspace/'nhe-enga'),'remote','set-url','origin',str(host.root/'absent-origin')],check=True)
        with self.root_workspace_operation(host) as (owned,commands):
            with self.assertRaises(subprocess.CalledProcessError):host.deploy()
        self.assertIn(host.workspace/'nhe-enga/.git/FETCH_HEAD',owned)
        self.assertIn(repo/'.git/index',owned)
        self.assertFalse(any(args[0]=='up' and args[-1]=='studio' for args in commands))
    def test_deploy_imports_pdf_evidence_after_migration_before_restart(self):
        host,repo,g=self.local_fetch_fixture()
        with self.root_workspace_operation(host) as (owned,commands):
            with patch.object(host,'import_evidence',side_effect=lambda file:commands.append(('evidence-import',file))), \
                    patch.object(host,'import_desktop',side_effect=lambda file:commands.append(('desktop-import',file))):
                host.deploy(evidence='managed-pdfs.tar',desktop='research.tar')
        imported=commands.index(('evidence-import','managed-pdfs.tar'))
        migrated=commands.index(('run','--rm','--no-deps','studio','node','server/migrate.cjs'))
        self.assertLess(commands.index(('stop','studio')),migrated)
        self.assertLess(migrated,imported)
        self.assertLess(imported,commands.index(('desktop-import','research.tar')))
        self.assertLess(commands.index(('desktop-import','research.tar')),commands.index(('up','-d','--wait','studio')))
    def test_collect_restores_git_ownership_even_when_review_is_rejected(self):
        for accepted in (False,True):
            with self.subTest(accepted=accepted):
                host,repo,g=self.fixture();(repo/'historic/test.tu.py').write_text('reviewed edit\n')
                review=host.changes('oldtupicorpus')['reviewSha'] if accepted else '0'*64
                with self.root_workspace_operation(host) as (owned,commands):
                    if accepted:host.collect('oldtupicorpus',host.root/'review',review)
                    else:
                        with self.assertRaises(ValueError):host.collect('oldtupicorpus',host.root/'review',review)
                self.assertIn(repo/'.git/index',owned)
                self.assertIn(('up','-d','--no-deps','studio'),commands)
                self.assertEqual((repo/'historic/test.tu.py').read_text(),'reviewed edit\n')
    def test_record_import_restores_git_access_before_restart_and_receipt_verification(self):
        host,repo,g=self.local_fetch_fixture();host.data.mkdir();receipt=host.root/'import.json';receipt.write_text('{}')
        with self.root_workspace_operation(host) as (owned,commands):host.record_import(receipt)
        self.assertIn(repo/'.git/FETCH_HEAD',owned)
        self.assertLess(commands.index(('stop','studio')),commands.index(('up','-d','--no-deps','studio')))
        self.assertTrue(any('record' in args for args in commands))
        self.assertEqual(len(list((host.data/'receipts').glob('*.json'))),1)
    def test_workspace_ownership_does_not_follow_links_or_touch_private_config(self):
        host,repo,g=self.fixture()
        with self.root_workspace_operation(host) as (owned,commands):
            (host.workspace/'config-link').symlink_to(host.config,target_is_directory=True)
            (repo/'secret-link').symlink_to(host.config/'runtime.env')
            with host.workspace_writes():pass
        self.assertNotIn(repo/'secret-link',owned)
        self.assertFalse(any(path.is_relative_to(host.config) for path in owned))

if __name__=='__main__':unittest.main()
