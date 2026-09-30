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
    @contextlib.contextmanager
    def offline_publication(self,host):
        """Publish without contacting the real origin, which the fixtures cannot reach."""
        with patch('light.drained',side_effect=AssertionError('Publication must not acquire maintenance')),patch.object(host,'stopped',side_effect=AssertionError('Publication must not stop Studio')),patch.object(host,'merge_upstream',side_effect=AssertionError('No upstream merge in live workspace')):yield
    def test_collect_then_publish_preserves_source_and_produces_verifiable_git_bundle(self):
        host,repo,g=self.fixture();(repo/'historic/test.tu.py').write_text('changed\n')
        with self.offline_publication(host):
            first=host.changes('oldtupicorpus')
            with self.assertRaises(ValueError):host.collect('oldtupicorpus',host.root/'bad','0'*64)
            dest=host.collect('oldtupicorpus',host.root/'good',first['reviewSha'])
        self.assertEqual((repo/'historic/test.tu.py').read_text(),'changed\n');self.assertEqual(g('status','--porcelain'),'')
        g('bundle','verify',str(dest/'repository.bundle'))
        self.assertIn('publishedHead',json.loads((dest/'manifest.json').read_text()))
    def test_unpublishable_files_are_skipped_and_left_untouched_on_the_server(self):
        host,repo,g=self.fixture();(repo/'historic/test.tu.py').write_text('changed\n')
        # Agent scratch notes at the repository root can never be published, but they
        # must not block the grammar/corpus work sitting beside them.
        (repo/'AGENT_NOTES.md').write_text('agent scratch\n')
        manifest=host.changes('oldtupicorpus')
        self.assertEqual([row['path'] for row in manifest['files']],['historic/test.tu.py'])
        self.assertEqual([row['path'] for row in manifest['skipped']],['AGENT_NOTES.md'])
        with self.offline_publication(host):
            dest=host.collect('oldtupicorpus',host.root/'good',manifest['reviewSha'])
        # The notes survive untouched and uncommitted; only the allowlisted file ships.
        self.assertEqual((repo/'AGENT_NOTES.md').read_text(),'agent scratch\n')
        self.assertEqual(g('status','--porcelain'),'?? AGENT_NOTES.md')
        self.assertEqual(g('show','--name-only','--format=','HEAD'),'historic/test.tu.py')
        self.assertNotIn('AGENT_NOTES.md',(dest/'review.diff').read_text())
    def test_incremental_bundle_reconstructs_the_snapshot_with_new_and_deleted_files(self):
        from ops import publication_checkout
        host,repo,g=self.fixture()
        (repo/'historic/test.tu.py').unlink()
        (repo/'historic/new.tu.py').write_text('new line\n')
        with self.offline_publication(host):
            dest=host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        manifest=json.loads((dest/'manifest.json').read_text())
        self.assertEqual(manifest['bundleBase'],g('rev-parse','origin/main'))
        # A tiny export has a prerequisite, rather than containing base history.
        header=(dest/'repository.bundle').read_bytes().split(b'\n\n',1)[0]
        self.assertIn(('-'+manifest['base']).encode(),header)
        studio=host.workspace/'studio';studio.mkdir()
        g('config','uploadpack.allowFilter','true')
        manifest['origin']=repo.as_uri()
        with patch('ops.HERE',studio):
            clone=publication_checkout('oldtupicorpus',dest,manifest)
        self.assertEqual((clone/'historic/new.tu.py').read_text(),'new line\n')
        self.assertFalse((clone/'historic/test.tu.py').exists())
        self.assertEqual(g('status','--porcelain'),'')

    def test_upstream_reconciliation_changes_only_the_exported_checkout(self):
        from ops import publication_checkout
        host,repo,g=self.fixture();g('branch','main');g('config','uploadpack.allowFilter','true')
        (repo/'historic/test.tu.py').write_text('server contribution\n')
        with self.offline_publication(host):dest=host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        server_head=g('rev-parse','HEAD')
        g('checkout','main');(repo/'historic/upstream.py').write_text('new upstream line\n')
        g('add','.');g('commit','-m','upstream');g('checkout','server/work')
        manifest=json.loads((dest/'manifest.json').read_text());manifest['origin']=repo.as_uri()
        studio=host.workspace/'studio';studio.mkdir()
        with patch('ops.HERE',studio):clone=publication_checkout('oldtupicorpus',dest,manifest)
        result=Host.merge_upstream(clone)
        self.assertTrue(result['mergedUpstream'])
        self.assertEqual((clone/'historic/upstream.py').read_text(),'new upstream line\n')
        self.assertEqual((clone/'historic/test.tu.py').read_text(),'server contribution\n')
        self.assertFalse((repo/'historic/upstream.py').exists())
        self.assertEqual(g('rev-parse','HEAD'),server_head)
        self.assertEqual(g('status','--porcelain'),'')

    def test_sparse_partial_checkout_fetches_needed_blobs_without_historical_assets(self):
        from ops import publication_checkout
        host,repo,g=self.fixture()
        (repo/'tupi').mkdir();(repo/'tupi/kept.py').write_text('unchanged grammar\n')
        (repo/'media').mkdir();asset=os.urandom(1024*1024)
        (repo/'media/large.bin').write_bytes(asset)
        g('add','.');g('commit','-m','baseline with large asset')
        g('update-ref','refs/remotes/origin/main','HEAD')
        g('config','uploadpack.allowFilter','true')
        (repo/'historic/test.tu.py').write_text('contribution\n')
        with self.offline_publication(host):dest=host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        manifest=json.loads((dest/'manifest.json').read_text());manifest['origin']=repo.as_uri()
        studio=host.workspace/'studio';studio.mkdir()
        with patch('ops.HERE',studio):clone=publication_checkout('nhe-enga',dest,manifest)
        self.assertEqual((clone/'tupi/kept.py').read_text(),'unchanged grammar\n')
        self.assertFalse((clone/'media/large.bin').exists())
        objects=list((studio/'backups/publication-cache/nhe-enga/objects').rglob('*.pack'))+list((clone/'.git/objects').rglob('*.pack'))
        self.assertLess(sum(file.stat().st_size for file in objects),len(asset)//2)
        self.assertEqual((repo/'media/large.bin').read_bytes(),asset)

    def test_edits_saved_after_capture_stay_local_and_do_not_enter_commit(self):
        from host import run
        host,repo,g=self.fixture();source=repo/'historic/test.tu.py'
        source.write_text('snapshot\n')
        def write_later(args,**kwargs):
            if 'hash-object' in args:source.write_text('later edit\n')
            return run(args,**kwargs)
        with self.offline_publication(host),patch('host.run',side_effect=write_later):
            dest=host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        self.assertEqual(source.read_text(),'later edit\n')
        self.assertEqual(g('show','HEAD:historic/test.tu.py'),'snapshot')
        self.assertIn('M historic/test.tu.py',g('status','--porcelain'))
        self.assertEqual(json.loads((dest/'manifest.json').read_text())['publishedHead'],g('rev-parse','HEAD'))

    def test_busy_application_does_not_delay_saved_work_capture(self):
        host,repo,g=self.fixture()
        (repo/'historic/test.tu.py').write_text('active repair saved bytes\n')
        with self.offline_publication(host),patch.object(host,'compose',side_effect=AssertionError('No Docker command')):
            host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        self.assertEqual(g('show','HEAD:historic/test.tu.py'),'active repair saved bytes')
        self.assertFalse((host.data/'operations/maintenance.json').exists())

    def test_change_during_capture_fails_promptly_without_staging_or_committing(self):
        host,repo,g=self.fixture();before=g('rev-parse','HEAD');changes=host.changes
        source=repo/'historic/test.tu.py';source.write_text('first\n')
        calls=0
        def moving(name):
            nonlocal calls
            result=changes(name);calls+=1
            if calls==1:source.write_text('newer save\n')
            return result
        with self.offline_publication(host),patch.object(host,'changes',side_effect=moving):
            with self.assertRaisesRegex(ValueError,'changed during capture'):
                host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        self.assertEqual(g('rev-parse','HEAD'),before)
        self.assertEqual(g('diff','--cached','--name-only'),'')
        self.assertEqual(source.read_text(),'newer save\n')

    def test_sparse_index_flags_survive_publication(self):
        host,repo,g=self.fixture()
        (repo/'ground_truth').mkdir();(repo/'ground_truth/omitted.txt').write_text('keep sparse file\n')
        g('add','.');g('commit','-m','sparse baseline');g('update-ref','refs/remotes/origin/main','HEAD')
        g('sparse-checkout','set','--no-cone','/historic/')
        self.assertFalse((repo/'ground_truth/omitted.txt').exists())
        (repo/'historic/test.tu.py').write_text('snapshot\n')
        with self.offline_publication(host):host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        self.assertEqual(g('status','--porcelain'),'')
        self.assertEqual(g('ls-files','-t','ground_truth/omitted.txt'),'S ground_truth/omitted.txt')
        self.assertEqual(g('show','HEAD:ground_truth/omitted.txt'),'keep sparse file')

    def test_existing_git_lock_is_not_removed_and_failed_ref_update_keeps_index(self):
        from host import git
        for locked in (True,False):
            with self.subTest(locked=locked):
                host,repo,g=self.fixture();before=g('rev-parse','HEAD')
                index=(repo/'.git/index').read_bytes()
                (repo/'historic/test.tu.py').write_text('snapshot\n')
                lock=repo/'.git/index.lock'
                if locked:lock.write_text('other git operation')
                def fail_ref(repo,*args):
                    if args[0]=='update-ref':raise RuntimeError('simulated ref conflict')
                    return git(repo,*args)
                with self.offline_publication(host),patch('host.git',side_effect=fail_ref):
                    with self.assertRaises((FileExistsError,RuntimeError)):
                        host.collect('oldtupicorpus',host.root/'export',publish_current=True)
                self.assertEqual((repo/'.git/index').read_bytes(),index)
                self.assertEqual(g('rev-parse','HEAD'),before)
                if locked:self.assertEqual(lock.read_text(),'other git operation')
                else:self.assertFalse(lock.exists())

    def test_index_install_failure_rolls_back_head_and_preserves_working_edits(self):
        host,repo,g=self.fixture();before=g('rev-parse','HEAD')
        index=(repo/'.git/index').read_bytes();replace=pathlib.Path.replace
        (repo/'historic/test.tu.py').write_text('snapshot\n')
        def fail_install(path,target):
            if path==repo/'.git/index.lock':raise OSError('simulated index install failure')
            return replace(path,target)
        with self.offline_publication(host),patch.object(pathlib.Path,'replace',fail_install):
            with self.assertRaisesRegex(OSError,'index install failure'):
                host.collect('oldtupicorpus',host.root/'export',publish_current=True)
        self.assertEqual(g('rev-parse','HEAD'),before)
        self.assertEqual((repo/'.git/index').read_bytes(),index)
        self.assertEqual((repo/'historic/test.tu.py').read_text(),'snapshot\n')
        self.assertFalse((repo/'.git/index.lock').exists())

    def test_review_hash_covers_executable_mode(self):
        host,repo,g=self.fixture();source=repo/'historic/test.tu.py'
        source.write_text('reviewed\n');first=host.changes('oldtupicorpus')
        source.chmod(0o755)
        self.assertNotEqual(first['reviewSha'],host.changes('oldtupicorpus')['reviewSha'])
        with self.offline_publication(host):
            with self.assertRaisesRegex(ValueError,'differ from the reviewed'):
                host.collect('oldtupicorpus',host.root/'export',first['reviewSha'])

    def test_automatic_publication_collects_only_once(self):
        from ops import publish_repository
        manifest={'files':[{'path':'historic/test.tu.py'}],'reviewSha':'a'*64}
        with patch('ops.unpack_export',return_value=(pathlib.Path('/fixture'),manifest)) as export,patch('ops.open_pull_request',return_value='fixture-pr'):
            result=publish_repository(object(),'oldtupicorpus')
        self.assertEqual(export.call_count,1)
        self.assertTrue(export.call_args.kwargs['publish_current'])
        self.assertEqual(result['detail'],'fixture-pr')

    def test_upstream_conflicts_resolve_in_favour_of_the_server_copy(self):
        host,repo,g=self.local_fetch_fixture()
        # origin/main and server/work edit the same line; the server copy must win.
        g('checkout','main');(repo/'historic/test.tu.py').write_text('upstream\n')
        g('commit','-am','upstream edit');g('checkout','server/work')
        (repo/'historic/test.tu.py').write_text('server\n');g('commit','-am','server edit')
        result=host.merge_upstream(repo)
        self.assertEqual(result['conflictsResolvedFromServer'],['historic/test.tu.py'])
        self.assertTrue(result['mergedUpstream']);self.assertFalse(result['upstreamMergeBlocked'])
        self.assertEqual((repo/'historic/test.tu.py').read_text(),'server\n')
        self.assertEqual(g('status','--porcelain'),'')
    def test_unmergeable_upstream_still_publishes_the_reviewed_snapshot(self):
        host,repo,g=self.fixture()
        # An unreachable remote and a history git refuses to merge must leave the
        # working tree clean and let the reviewed snapshot publish anyway.
        g('remote','set-url','origin',str(host.root/'absent'))
        g('checkout','--orphan','unrelated');(repo/'historic/test.tu.py').write_text('unrelated\n')
        g('add','.');g('commit','-m','unrelated history');g('update-ref','refs/remotes/origin/main','HEAD')
        g('checkout','server/work')
        result=host.merge_upstream(repo)
        self.assertTrue(result['upstreamMergeBlocked'])
        self.assertEqual(result['conflictsResolvedFromServer'],[])
        self.assertEqual(g('status','--porcelain'),'')
    def test_inventory_reports_only_content_the_server_actually_holds(self):
        host,repo,g=self.fixture();host.data.mkdir(exist_ok=True)
        self.assertEqual(host.inventory(),{'version':1,'evidence':[],'research':[]})
        assets=host.data/'evidence/assets';assets.mkdir(parents=True)
        (assets/('a'*64+'.pdf')).write_bytes(b'%PDF-1.7\n');(assets/'notes.pdf').write_bytes(b'ignored')
        retained=host.data/'desktop-imports/bundle';retained.mkdir(parents=True)
        (retained/'files').mkdir();(retained/'files/kept.json').write_bytes(b'{}')
        (retained/'manifest.json').write_text(json.dumps({'files':[
            {'path':'files/kept.json','sha256':'b'*64},{'path':'files/gone.json','sha256':'c'*64}]}))
        result=host.inventory()
        self.assertEqual(result['evidence'],['a'*64])
        # A digest whose retained bytes are missing must never be claimed as held.
        self.assertEqual(result['research'],['b'*64])
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
                with self.root_workspace_operation(host) as (owned,commands),self.offline_publication(host):
                    if accepted:host.collect('oldtupicorpus',host.root/'review',review)
                    else:
                        with self.assertRaises(ValueError):host.collect('oldtupicorpus',host.root/'review',review)
                if accepted:self.assertIn(repo/'.git/index',owned)
                self.assertEqual(commands,[])
                self.assertNotIn(repo/'historic/test.tu.py',owned)
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
