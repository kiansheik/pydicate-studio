"""Idle-only fast-forward updates of the two public dependency repositories."""
from __future__ import annotations
import datetime as dt, json, os, pathlib, signal, subprocess, time, uuid
from time import sleep

NAMES = ('nhe-enga', 'oldtupicorpus')
IDLE_MS = 10 * 60_000
FRESH_MS = 15_000

def atomic_json(path, value, app_readable=False):
    path = pathlib.Path(path)
    if path.parent.is_symlink() or path.is_symlink(): raise ValueError('Operations files must not be symlinks')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if app_readable and os.geteuid() == 0: os.chown(path.parent, 1000, 1000)
    temporary = path.with_name('.' + path.name + '-' + uuid.uuid4().hex)
    try:
        with temporary.open('x') as out:
            json.dump(value, out); out.write('\n'); out.flush(); os.fsync(out.fileno())
        temporary.chmod(0o600)
        if app_readable and os.geteuid() == 0: os.chown(temporary, 1000, 1000)
        temporary.replace(path)
    finally: temporary.unlink(missing_ok=True)

def git(repo, *args, ancestry=False):
    result = subprocess.run(['git', '-c', 'safe.directory='+str(repo), '-c', 'core.hooksPath=/dev/null', '-C', str(repo), *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90,
        env={**os.environ, 'GIT_TERMINAL_PROMPT':'0'})
    if ancestry and result.returncode in (0, 1): return result.returncode == 0
    result.check_returncode()
    return result.stdout.decode().strip()

def idle_state(host, request_id=None, now=None):
    now = int(time.time()*1000) if now is None else now
    try:
        file = host.data/'operations/idle.json'
        if file.is_symlink(): return False
        value = json.loads(file.read_text())
        valid = value.get('version') == 1 and 0 <= now-value['heartbeatAt'] <= FRESH_MS and \
            IDLE_MS <= now-value['lastActivityAt'] and value.get('busyRequests') == 0
        return bool(valid and (request_id is None or value.get('maintenanceRequestId') == request_id))
    except (OSError, ValueError, KeyError, TypeError): return False

def inspect(host, fetch=False):
    from host import REPOS
    rows = []
    for name in NAMES:
        repo = host.workspace/name
        if repo.is_symlink() or git(repo, 'remote', 'get-url', 'origin') != REPOS[name]:
            raise ValueError('Unexpected dependency repository: '+name)
        if fetch:
            git(repo, 'fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main')
        head, upstream = git(repo, 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'refs/remotes/origin/main')
        if git(repo, 'status', '--porcelain') or git(repo, 'branch', '--show-current') != 'server/work': state = 'dirty'
        elif head == upstream: state = 'current'
        elif git(repo, 'merge-base', '--is-ancestor', head, upstream, ancestry=True): state = 'available'
        else: state = 'diverged'
        rows.append({'name':name, 'head':head, 'upstream':upstream, 'state':state})
    return rows

def update(host):
    """Caller holds Host.lock. Missing telemetry is never interpreted as idle."""
    from host import stamp
    status_path = host.data/'operations/upstream.json'
    request_path = host.data/'operations/maintenance.json'
    status = {'version':1, 'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(), 'state':'checking', 'repositories':[]}
    try:
        previous = json.loads(status_path.read_text())
        if previous.get('updatedAt'): status['updatedAt'] = previous['updatedAt']
    except (OSError, ValueError): pass
    def record(state, reason=None):
        status['state'] = state
        if reason: status['reason'] = reason
        else: status.pop('reason', None)
        atomic_json(status_path, status, app_readable=True)
        return status
    if (host.config/'upstream-disabled').exists():
        status['enabled'] = False
        return record('waiting','disabled')
    status['enabled'] = True
    record('checking')
    request_id = None
    stopped = False
    try:
        # Fetch only remote refs; active authoring files remain untouched.
        with host.workspace_writes(): status['repositories'] = inspect(host, fetch=True)
        rows = status['repositories']
        if any(row['state'] in ('dirty','diverged') for row in rows): return record('waiting','unpublished-work')
        if not any(row['state'] == 'available' for row in rows): return record('current')
        if not idle_state(host): return record('waiting','active-or-unknown')
        request_id = str(uuid.uuid4())
        now = int(time.time()*1000)
        atomic_json(request_path, {'version':1,'id':request_id,'issuedAt':now,'expiresAt':now+120_000}, app_readable=True)
        # The app grants this lease only with zero work, then refuses new work.
        for attempt in range(20):
            if idle_state(host, request_id): break
            sleep(.5)
        else: return record('waiting','idle-lease-not-granted')
        if not host.compose('ps','--status','running','-q','studio',capture=True).strip():
            return record('waiting','application-not-running')
        # A final fresh lease check immediately precedes the stop.
        if not idle_state(host, request_id): return record('waiting','activity-resumed')
        stopped = True
        host.compose('stop','studio')
        fresh = inspect(host)
        if fresh != rows: return record('waiting','workspace-changed')
        # One checkpoint includes both repositories, the database, PDFs/config.
        backup = host.root/'backups'/('upstream-'+stamp())
        host.checkpoint(backup, restart=False)
        status['backup'] = backup.name
        with host.workspace_writes():
            # Detect changes even during the checkpoint; never reset or stash.
            if inspect(host) != rows: return record('waiting','workspace-changed')
            for row in rows:
                if row['state'] == 'available': git(host.workspace/row['name'], 'merge', '--ff-only', '--no-overwrite-ignore', row['upstream'])
        host.compose('up','-d','--wait','studio'); stopped = False
        release_path = host.root/'release.json'
        release = json.loads(release_path.read_text()) if release_path.exists() else {}
        status['repositories'] = inspect(host)
        for row in status['repositories']: release[row['name']] = row['head']
        atomic_json(release_path, release)
        status['updatedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        host.compose('exec','-T','studio','node','server/publication.cjs','verify')
        return record('updated')
    except Exception:
        record('failed','check-or-update-failed')
        raise
    finally:
        if request_id: request_path.unlink(missing_ok=True)
        if stopped:
            # Failed backup/recheck/merge still brings preserved workspace back.
            try:
                host.compose('up','-d','--wait','studio')
                release_path = host.root/'release.json'
                release = json.loads(release_path.read_text()) if release_path.exists() else {}
                status['repositories'] = inspect(host)
                for row in status['repositories']: release[row['name']] = row['head']
                atomic_json(release_path, release)
                record(status['state'], status.get('reason'))
            except Exception:
                record('failed','restart-failed')
                raise

def install_timer(host, directory=pathlib.Path('/etc/systemd/system')):
    """Only called by explicit install/redeploy setup; no app release updates."""
    directory = pathlib.Path(directory)
    # Systemd ExecStart has its own escaping; no shell or untrusted arguments.
    def quoted(value): return json.dumps(str(value).replace('%','%%'))
    service = '\n'.join([
        '[Unit]', 'Description=Pydicate Studio idle dependency update',
        'After=docker.service network-online.target', 'Wants=network-online.target',
        'ConditionPathExists='+str(host.root/'current/scripts/collab/host.py'),
        '[Service]', 'Type=oneshot', 'User=root', 'UMask=0077', 'TimeoutStartSec=15min', 'TimeoutStopSec=3min',
        'ExecStart=/usr/bin/python3 '+quoted(host.root/'current/scripts/collab/host.py')+' auto-update --root '+quoted(host.root),
        '',
    ])
    timer = '\n'.join(['[Unit]','Description=Check Studio corpus and grammar every 15 minutes','[Timer]',
        'OnCalendar=*:0/15', 'RandomizedDelaySec=30', 'Persistent=true', '[Install]', 'WantedBy=timers.target', ''])
    directory.mkdir(parents=True, exist_ok=True)
    for name, content in [('service',service),('timer',timer)]:
        target = directory/('pydicate-studio-upstream.'+name)
        if target.is_symlink(): raise ValueError('Unexpected systemd unit symlink')
        target.write_text(content); target.chmod(0o644)
    from host import run
    run(['systemctl','daemon-reload'])
    run(['systemctl','disable' if (host.config/'upstream-disabled').exists() else 'enable','--now','pydicate-studio-upstream.timer'])


def run_locked(host):
    # systemd's timeout sends SIGTERM: turn it into ordinary cleanup so a
    # interrupted checkpoint cannot silently leave the application stopped.
    def terminated(signum, frame): raise InterruptedError('Automatic update interrupted')
    previous = signal.signal(signal.SIGTERM, terminated)
    try:
        try:
            with host.lock(): return update(host)
        except BlockingIOError:
            print('[server] Another operation is running; automatic check deferred.', flush=True)
    finally: signal.signal(signal.SIGTERM, previous)
