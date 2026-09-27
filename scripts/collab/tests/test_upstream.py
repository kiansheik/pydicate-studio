import json, pathlib, signal, subprocess, sys, tempfile, time, unittest
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from host import Host
import upstream

class UpstreamTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        root = pathlib.Path(temporary.name); host = Host(root/'server')
        host.workspace.mkdir(); host.data.mkdir(); host.config.mkdir()
        (host.root/'release.json').write_text(json.dumps({'studio':'a'*40}))
        origins = {}; old = {}; new = {}
        def command(repo,*args):
            return subprocess.run(['git','-C',str(repo),*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout.decode().strip()
        for name in upstream.NAMES:
            origin = root/name; origin.mkdir(); command(origin,'init','-b','main')
            command(origin,'config','user.name','Fixture'); command(origin,'config','user.email','fixture@example.org')
            (origin/'source.py').write_text('initial\n'); command(origin,'add','.'); command(origin,'commit','-m','initial')
            old[name] = command(origin,'rev-parse','HEAD')
            subprocess.run(['git','clone',str(origin),str(host.workspace/name)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            command(host.workspace/name,'checkout','-b','server/work')
            command(host.workspace/name,'config','user.name','Fixture'); command(host.workspace/name,'config','user.email','fixture@example.org')
            (origin/'source.py').write_text('new upstream\n'); command(origin,'add','.'); command(origin,'commit','-m','upstream')
            new[name] = command(origin,'rev-parse','HEAD'); origins[name] = str(origin)
        self.mark_idle(host)
        return host, origins, old, new, command
    def mark_idle(self, host, **extra):
        now = int(time.time()*1000)
        upstream.atomic_json(host.data/'operations/idle.json',{'version':1,'heartbeatAt':now,'lastActivityAt':now-upstream.IDLE_MS-10000,'busyRequests':0,**extra})
    def run_update(self, host, origins, checkpoint=None, grant=True):
        calls=[]; backups=[]
        def compose(*args,**kwargs): calls.append(args); return b'running' if args[0]=='ps' else b''
        def backup(destination,restart=True):
            self.assertFalse(restart); backups.append(destination)
            self.assertIn(('stop','studio'),calls)
            if checkpoint: checkpoint(destination)
        def sleep(seconds):
            if grant:
                request=json.loads((host.data/'operations/maintenance.json').read_text())
                self.mark_idle(host,maintenanceRequestId=request['id'])
        with patch('host.REPOS',origins),patch.object(host,'compose',side_effect=compose),patch.object(host,'checkpoint',side_effect=backup),patch('upstream.sleep',side_effect=sleep):
            return upstream.update(host), calls, backups
    def test_idle_update_has_one_full_backup_then_fast_forwards_both_and_refreshes_release(self):
        host,origins,old,new,g=self.fixture()
        def checkpoint(destination):
            for name in upstream.NAMES:self.assertEqual(g(host.workspace/name,'rev-parse','HEAD'),old[name])
        status,calls,backups=self.run_update(host,origins,checkpoint)
        self.assertEqual(status['state'],'updated');self.assertEqual(len(backups),1)
        self.assertIn(('up','-d','--wait','studio'),calls)
        release=json.loads((host.root/'release.json').read_text());self.assertEqual(release['studio'],'a'*40)
        for name in upstream.NAMES:
            self.assertEqual(g(host.workspace/name,'rev-parse','HEAD'),new[name]);self.assertEqual(release[name],new[name])
        self.assertFalse((host.data/'operations/maintenance.json').exists())
    def test_active_busy_missing_stale_or_future_heartbeat_never_stops_app(self):
        for condition in ('active','busy','missing','stale','future'):
            with self.subTest(condition=condition):
                host,origins,old,new,g=self.fixture();now=int(time.time()*1000)
                if condition=='missing':(host.data/'operations/idle.json').unlink()
                else:self.mark_idle(host,**{'active':{'lastActivityAt':now},'busy':{'busyRequests':1},'stale':{'heartbeatAt':now-16000},'future':{'heartbeatAt':now+10000}}[condition])
                status,calls,backups=self.run_update(host,origins)
                self.assertEqual(status['state'],'waiting');self.assertEqual(calls,[]);self.assertEqual(backups,[])
                for name in upstream.NAMES:self.assertEqual(g(host.workspace/name,'rev-parse','HEAD'),old[name])
    def test_dirty_or_unmerged_work_defers_all_dependencies(self):
        for condition in ('dirty','diverged'):
            with self.subTest(condition=condition):
                host,origins,old,new,g=self.fixture();repo=host.workspace/'oldtupicorpus'
                (repo/'source.py').write_text('local research\n')
                if condition=='diverged':g(repo,'add','.');g(repo,'commit','-m','local unpublished')
                head=g(repo,'rev-parse','HEAD')
                status,calls,backups=self.run_update(host,origins)
                self.assertEqual(status['reason'],'unpublished-work');self.assertEqual(calls,[]);self.assertEqual(backups,[])
                self.assertEqual((repo/'source.py').read_text(),'local research\n');self.assertEqual(g(repo,'rev-parse','HEAD'),head)
                self.assertEqual(g(host.workspace/'nhe-enga','rev-parse','HEAD'),old['nhe-enga'])
    def test_no_lease_or_workspace_change_never_merges_and_restarts_if_stopped(self):
        host,origins,old,new,g=self.fixture()
        status,calls,backups=self.run_update(host,origins,grant=False)
        self.assertEqual(status['reason'],'idle-lease-not-granted');self.assertEqual(calls,[])
        def during_backup(destination):(host.workspace/'nhe-enga/source.py').write_text('late edit\n')
        status,calls,backups=self.run_update(host,origins,during_backup)
        self.assertEqual(status['reason'],'workspace-changed');self.assertIn(('up','-d','--wait','studio'),calls)
        for name in upstream.NAMES:self.assertEqual(g(host.workspace/name,'rev-parse','HEAD'),old[name])
    def test_backup_failure_releases_lease_and_restarts_without_merging(self):
        host,origins,old,new,g=self.fixture();calls=[]
        def compose(*args,**kwargs):calls.append(args);return b'running' if args[0]=='ps' else b''
        def grant(seconds):self.mark_idle(host,maintenanceRequestId=json.loads((host.data/'operations/maintenance.json').read_text())['id'])
        with patch('host.REPOS',origins),patch.object(host,'compose',side_effect=compose),patch.object(host,'checkpoint',side_effect=RuntimeError('backup failed')),patch('upstream.sleep',side_effect=grant):
            with self.assertRaisesRegex(RuntimeError,'backup failed'):upstream.update(host)
        self.assertIn(('up','-d','--wait','studio'),calls);self.assertFalse((host.data/'operations/maintenance.json').exists())
        for name in upstream.NAMES:self.assertEqual(g(host.workspace/name,'rev-parse','HEAD'),old[name])
        self.assertEqual(json.loads((host.data/'operations/upstream.json').read_text())['state'],'failed')
    def test_current_dependencies_need_no_idle_or_backup(self):
        host,origins,old,new,g=self.fixture()
        self.run_update(host,origins)
        (host.data/'operations/idle.json').unlink()
        status,calls,backups=self.run_update(host,origins)
        self.assertEqual(status['state'],'current');self.assertEqual(calls,[]);self.assertEqual(backups,[])
    def test_timer_installs_only_dependency_action_and_prepare_calls_installer(self):
        host,origins,old,new,g=self.fixture();units=host.root/'units'
        with patch('host.run') as run:upstream.install_timer(host,units)
        service=(units/'pydicate-studio-upstream.service').read_text();timer=(units/'pydicate-studio-upstream.timer').read_text()
        self.assertIn(' auto-update --root ',service);self.assertNotIn('redeploy',service)
        self.assertIn('OnCalendar=*:0/15',timer);self.assertIn('Persistent=true',timer)
        self.assertEqual(run.call_count,2)
        with patch.object(host,'clone_dependencies'),patch.object(host,'application_ownership'),patch('host.git',return_value='a'*40),patch('host.run'),patch('upstream.install_timer') as install:
            host.prepare('https://studio.example.org','none','/srv/neo')
        install.assert_called_once_with(host)
    def test_disabled_marker_survives_timer_reinstall_and_prevents_network_or_stop(self):
        host,origins,old,new,g=self.fixture()
        (host.config/'upstream-disabled').touch()
        with patch('upstream.inspect') as inspect,patch.object(host,'compose') as compose:
            status=upstream.update(host)
        self.assertFalse(status['enabled']);self.assertEqual(status['reason'],'disabled')
        inspect.assert_not_called();compose.assert_not_called()
        with patch('host.run') as run:upstream.install_timer(host,host.root/'units')
        self.assertIn('disable',run.call_args.args[0])
    def test_signal_cleanup_handler_is_installed_and_restored_and_lock_contention_is_safe(self):
        host,origins,old,new,g=self.fixture()
        previous=signal.getsignal(signal.SIGTERM)
        def terminated(current):signal.getsignal(signal.SIGTERM)(signal.SIGTERM,None)
        with patch('upstream.update',side_effect=terminated):
            with self.assertRaises(InterruptedError):upstream.run_locked(host)
        self.assertEqual(signal.getsignal(signal.SIGTERM),previous)
        with host.lock(),patch('upstream.update') as update:
            upstream.run_locked(host)
        update.assert_not_called()
    def test_operations_directory_is_app_readable_when_host_creates_it(self):
        with tempfile.TemporaryDirectory() as directory:
            target=pathlib.Path(directory)/'operations/upstream.json'
            with patch('upstream.os.geteuid',return_value=0),patch('upstream.os.chown') as chown:
                upstream.atomic_json(target,{'state':'current'},app_readable=True)
            self.assertIn(((target.parent,1000,1000),{}),[(call.args,call.kwargs) for call in chown.call_args_list])
            self.assertEqual(target.stat().st_mode&0o777,0o600)

if __name__=='__main__':unittest.main()
