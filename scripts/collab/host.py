#!/usr/bin/env python3
"""Server-side operations. Only dedicated Studio paths; no implicit Git reset or volume deletion."""
from __future__ import annotations
import argparse, contextlib, datetime as dt, fcntl, hashlib, json, os, pathlib, re, secrets, shutil, subprocess, sys, tarfile, tempfile

REPOS = {name: f'https://github.com/kiansheik/{name}.git' for name in ('pydicate-studio', 'oldtupicorpus', 'nhe-enga')}
GRAMMAR_SUPPORT = ['/tests/', '/docs/agent/grammar-navigation.md']
SPARSE = ['/*', '!/*/', '/pydicate/', '/tupi/', '/js/', '/docs/dict-conjugated.json.gz', '/docs/primary_sources/index.html', '/docs/primary_sources/image-formats.json', *GRAMMAR_SUPPORT]
ALLOW = {'oldtupicorpus': ('historic/', 'ground_truth/', 'authoring/', 'tests/'), 'nhe-enga': ('pydicate/', 'tupi/')}
HERE = pathlib.Path(__file__).resolve().parents[2]
def run(args, *, cwd=None, capture=False, data=None, stdout=None, env=None):
    return subprocess.run([str(x) for x in args], cwd=cwd, input=data, stdout=subprocess.PIPE if capture else stdout,
                          check=True, env=env).stdout

def git(repo, *args):
    return run(['git', '-c', 'safe.directory='+str(repo), '-C', repo, *args], capture=True).decode().strip()

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def stamp(): return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+secrets.token_hex(3)

def write_json(path, value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');path.chmod(0o600)

class Host:
    def __init__(self, root):
        self.root=pathlib.Path(root).resolve()
        if self.root==pathlib.Path('/') or len(self.root.parts)<3: raise ValueError('Use a dedicated absolute root, not / or a home directory.')
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.workspace=self.root/'workspace';self.config=self.root/'config';self.data=self.root/'data'
        if any(p.is_symlink() for p in (self.workspace,self.config,self.data)):raise ValueError('Persistent state paths must not be symlinks')
    def compose(self,*args,stdout=None,data=None,capture=False):
        files=['-f',str(HERE/'deploy/collab/compose.yml')]
        if (self.config/'relay-network').exists(): files+=['-f',str(HERE/'deploy/collab/relay.compose.yml')]
        return run(['docker','compose','--project-name','pydicate-studio','--env-file',self.config/'runtime.env',*files,*args],stdout=stdout,data=data,capture=capture,env={**os.environ,'APP_RELEASE':git(HERE,'rev-parse','HEAD')})
    @contextlib.contextmanager
    def lock(self):
        with open(self.root/'operations.lock','a') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
    @contextlib.contextmanager
    def stopped(self, restart=True):
        was_running=bool(self.compose('ps','--status','running','-q','studio',capture=True).strip())
        self.compose('stop','studio')
        try: yield
        finally:
            if restart and was_running:self.compose('up','-d','--no-deps','studio')
    def application_ownership(self, *roots):
        if os.geteuid()!=0:return
        for root in roots:
            for base,dirs,files in os.walk(root):
                os.chown(base,1000,1000,follow_symlinks=False)
                for file in files:
                    p=pathlib.Path(base)/file
                    if not p.is_symlink():os.chown(p,1000,1000,follow_symlinks=False)
    @contextlib.contextmanager
    def workspace_writes(self):
        try:yield
        finally:
            # Root Git commands replace index/refs and may create source files with
            # umask 077. Restore the container user's access before any restart,
            # including when fetch, merge or publication fails halfway through.
            self.application_ownership(self.workspace)
    def clone_dependencies(self):
        self.workspace.mkdir(exist_ok=True)
        pins=json.loads((HERE/'deploy/collab/dependencies.json').read_text())
        for name in ('oldtupicorpus','nhe-enga'):
            dest=self.workspace/name
            if dest.exists():
                if git(dest,'remote','get-url','origin')!=REPOS[name]: raise ValueError('Unexpected origin: '+name)
                continue # Existing work is never updated or reset during an application redeploy.
            temp=self.workspace/('.clone-'+name+'-'+secrets.token_hex(4))
            run(['git','clone','--filter=blob:none','--no-checkout',REPOS[name],temp])
            run(['git','-C',temp,'fetch','origin',pins[name]])
            if name=='nhe-enga': run(['git','-C',temp,'sparse-checkout','set','--no-cone',*SPARSE])
            run(['git','-C',temp,'checkout','-b','server/work',pins[name]])
            temp.rename(dest)
    def expand_grammar_checkout(self):
        """Add repair documentation/tests without replacing existing sparse patterns or edits."""
        repo=self.workspace/'nhe-enga'
        try: sparse=git(repo,'config','--bool','core.sparseCheckout')
        except subprocess.CalledProcessError as error:
            if error.returncode==1:return # Full checkouts already include tracked support files.
            raise
        if sparse!='true':return
        patterns=git(repo,'sparse-checkout','list').splitlines()
        missing=[pattern for pattern in GRAMMAR_SUPPORT if pattern not in patterns]
        if missing:
            print('[server] Making grammar documentation and tests available...',flush=True)
            run(['git','-c','safe.directory='+str(repo),'-C',repo,'sparse-checkout','add',*missing])
    def prepare(self, public_url, smtp, neo_path):
        print('[server] Preparing workspace repositories and configuration...',flush=True)
        self.clone_dependencies()
        self.config.mkdir(exist_ok=True,mode=0o700);self.data.mkdir(exist_ok=True,mode=0o700)
        for name in ('postgres-password','postgres-admin-password','provider-vault-key','neo-identity-secret'):
            file=self.config/name
            if not file.exists():file.write_text(secrets.token_hex(32)+'\n')
            file.chmod(0o400 if name in ('provider-vault-key','neo-identity-secret') else 0o444)
            if os.geteuid()==0:os.chown(file,1000,1000)
        codex=self.config/'codex';codex.mkdir(exist_ok=True,mode=0o700)
        if os.geteuid()==0:os.chown(codex,1000,1000)
        # Private per-contributor Claude Code homes, outside every directory the
        # backup, restore and research exports walk. Studio never reads them.
        claude=self.root/'credentials/claude';claude.mkdir(parents=True,exist_ok=True,mode=0o700)
        if os.geteuid()==0:
            os.chown(claude.parent,1000,1000);os.chown(claude,1000,1000)
        env=self.config/'runtime.env'
        if not env.exists():
            settings={'COLLAB_ROOT':str(self.root),'COLLAB_WORKSPACE':str(self.workspace),'COLLAB_DATA_DIR':str(self.data),
              'COLLAB_PUBLIC_URL':public_url,'COLLAB_ENV_FILE':str(env),'COLLAB_AI_ENABLED':'0','APP_RELEASE':git(HERE,'rev-parse','HEAD'),
              'SMTP_FROM_EMAIL':'no-reply@academiatupi.com','SMTP_FROM_NAME':'Pydicate Studio — Academia Tupi',
              'COLLAB_EDGE_NETWORK':'caddy_edge','COLLAB_NEO_SSO_ENABLED':'0','COLLAB_DIGEST_MODE':'off'}
            if smtp=='relay':
                # Resolve only the known deployment's smtp-relay service. Never print container env/credentials.
                ids=run(['docker','ps','-q','--filter','label=com.docker.compose.service=smtp-relay'],capture=True).decode().split()
                selected=[]
                for id in ids:
                    meta=json.loads(run(['docker','inspect',id],capture=True))[0]
                    working=meta['Config']['Labels'].get('com.docker.compose.project.working_dir','')
                    if pathlib.Path(neo_path).resolve() in [pathlib.Path(working).resolve(),*pathlib.Path(working).resolve().parents]:selected.append(meta)
                if len(selected)!=1:raise ValueError('Expected one Neologismo smtp-relay; choose SMTP_MODE=direct/none or correct NEOLOGISMO_PATH.')
                networks=[n for n in selected[0]['NetworkSettings']['Networks'] if n!='caddy_edge']
                if len(networks)!=1:raise ValueError('Ambiguous SMTP network; configure the relay overlay explicitly.')
                settings['COLLAB_SMTP_NETWORK']=networks[0];(self.config/'relay-network').write_text(networks[0])
            elif smtp=='direct':
                settings.update(SMTP_HOST='mail.privateemail.com',SMTP_PORT='587',SMTP_USE_TLS='true',SMTP_USERNAME='',SMTP_PASSWORD='')
            elif smtp!='none':raise ValueError('Unknown SMTP mode')
            env.write_text(''.join(f'{key}={value}\n' for key,value in settings.items()));env.chmod(0o600)
        if (codex/'auth.json').is_file():
            settings=env.read_text().splitlines()
            settings=[line for line in settings if not line.startswith('COLLAB_AI_ENABLED=')]
            env.write_text('\n'.join([*settings,'COLLAB_AI_ENABLED=1'])+'\n');env.chmod(0o600)
        # No secrets are regenerated or copied from other applications on redeployment.
        self.application_ownership(self.data,self.workspace)
        run(['docker','network','inspect','caddy_edge'],capture=True)
        from upstream import install_timer
        install_timer(self)
    def deploy(self, initial=False, evidence=None, desktop=None):
        print('[server] Building Studio image (existing service stays available)...',flush=True)
        self.compose('build','studio') # Existing service stays up during build.
        print('[server] Starting PostgreSQL and waiting for health...',flush=True)
        self.compose('up','-d','--wait','postgres')
        # Take a full pre-update checkpoint if this deployment already has an account DB.
        if not initial:
            print('[server] Creating pre-deploy checkpoint; Studio stays available...',flush=True)
            self.checkpoint(self.root/'backups'/('predeploy-'+stamp()),restart=False,provenance=False,online=True)
        print('[server] Stopping Studio for source updates and database migrations...',flush=True)
        self.compose('stop','studio')
        try:
            with self.workspace_writes():
                # Expansion is additive, after the checkpoint and with Studio stopped.
                # In particular, it must also run when dirty grammar work defers sync.
                self.expand_grammar_checkout()
                for name in (() if initial else ('nhe-enga','oldtupicorpus')):
                    print('[server] Synchronizing '+name+'...',flush=True)
                    repo=self.workspace/name
                    if git(repo,'status','--porcelain'):
                        print(name+': uncommitted server work preserved; upstream sync deferred.',flush=True)
                        continue
                    run(['git','-c','safe.directory='+str(repo),'-C',repo,'fetch','origin','main'])
                    ancestor=subprocess.run(['git','-c','safe.directory='+str(repo),'-C',repo,'merge-base','--is-ancestor','HEAD','origin/main']).returncode==0
                    if ancestor:run(['git','-c','safe.directory='+str(repo),'-C',repo,'merge','--ff-only','origin/main'])
                    else:print(name+': unmerged server commits preserved; upstream sync deferred.',flush=True)
            print('[server] Applying database migrations...',flush=True)
            self.compose('run','--rm','--no-deps','studio','node','server/migrate.cjs')
            if evidence:
                print('[server] Importing desktop PDFs and saved evidence...',flush=True)
                self.import_evidence(evidence)
            if desktop:
                print('[server] Restoring desktop drafts, progress and research history...',flush=True)
                self.import_desktop(desktop)
            print('[server] Starting Studio and waiting for health...',flush=True)
            self.compose('up','-d','--wait','studio')
        except Exception:
            print('Deployment failed. Data and old release directories are preserved. Inspect before restarting.',file=sys.stderr,flush=True);raise
        link=self.root/'current';temporary=self.root/'.current-next'
        temporary.unlink(missing_ok=True);temporary.symlink_to(HERE);temporary.replace(link)
        release={'studio':git(HERE,'rev-parse','HEAD'), **{name:git(self.workspace/name,'rev-parse','HEAD') for name in ('oldtupicorpus','nhe-enga')}}
        write_json(self.root/'release.json',release)
        print('[server] Verifying publication receipts...',flush=True)
        self.compose('exec','-T','studio','node','server/publication.cjs','verify')
        print('[server] Deployment complete; Studio is healthy.',flush=True)
    def inventory(self):
        """Report the content digests already held, so a deploy uploads only new bytes.

        Read-only and lock-free. Both stores are content-addressed, so a digest match
        is a byte match; the importers still verify every digest before use.
        """
        evidence=[];assets=self.data/'evidence/assets'
        if assets.is_dir() and not assets.is_symlink():
            evidence=sorted(p.stem for p in assets.glob('*.pdf')
                            if p.is_file() and not p.is_symlink() and re.fullmatch(r'[a-f0-9]{64}',p.stem))
        research=set();imports=self.data/'desktop-imports'
        if imports.is_dir() and not imports.is_symlink():
            for manifest in sorted(imports.glob('*/manifest.json')):
                try:rows=json.loads(manifest.read_text()).get('files') or []
                except ValueError:continue
                for row in rows:
                    if not isinstance(row,dict) or not isinstance(row.get('sha256'),str) or not isinstance(row.get('path'),str):continue
                    target=manifest.parent/row['path']
                    if target.is_file() and not target.is_symlink():research.add(row['sha256'])
        return {'version':1,'evidence':evidence,'research':sorted(research)}
    def import_evidence(self, archive):
        # deploy() holds the operation lock and has stopped the application.
        # Retain the exact portable input alongside its reconciliation report.
        archive=pathlib.Path(archive)
        if archive.is_symlink() or not archive.is_file():raise ValueError('Expected a regular evidence archive')
        directory=self.data/'evidence-imports'
        if directory.is_symlink():raise ValueError('Evidence import directory must not be a symlink')
        directory.mkdir(exist_ok=True,mode=0o700)
        destination=directory/(sha(archive)+'.tar')
        if destination.is_symlink():raise ValueError('Evidence import archive must not be a symlink')
        if destination.exists():
            if sha(destination)!=destination.stem:raise ValueError('Retained evidence archive checksum mismatch')
        else:
            with tempfile.NamedTemporaryFile(prefix='.incoming-',dir=directory) as target:
                with archive.open('rb') as source:shutil.copyfileobj(source,target)
                target.flush();os.fsync(target.fileno())
                if sha(pathlib.Path(target.name))!=destination.stem:raise ValueError('Evidence archive changed during staging')
                os.link(target.name,destination)
        self.application_ownership(directory)
        self.compose('run','--rm','--no-deps','studio','python3','scripts/collab/evidence_sync.py',
                     '--archive','/data/evidence-imports/'+destination.name,'--state','/data','--parent','/workspace')
    def import_desktop(self, archive):
        # The deployment lock and full checkpoint precede every active write.
        from desktop_sync import extract_bundle
        archive=pathlib.Path(archive)
        if archive.is_symlink() or not archive.is_file():raise ValueError('Expected a regular desktop research archive')
        directory=self.data/'desktop-imports'/sha(archive)
        report=extract_bundle(archive,directory,cache=directory.parent)
        print('[server] Desktop archive verified: '+str(report['files'])+' files.',flush=True)
        self.application_ownership(directory.parent)
        self.compose('run','--rm','--no-deps','studio','node','server/desktop-import.cjs',
                     '--directory','/data/desktop-imports/'+directory.name)
    # Retained import archives: immutable provenance of what was uploaded, already
    # reconstructible from the live state beside them. They grow by one full copy per
    # deploy, so routine checkpoints leave them in place instead of recompressing them.
    PROVENANCE=('data/desktop-imports','data/evidence-imports')
    def checkpoint(self,dest,restart=True,provenance=True,online=False):
        """Capture a restorable checkpoint.

        `online` keeps Studio serving throughout. pg_dump is transactionally
        consistent on a live database, and the archived trees are safe to read
        under the operation lock this runs inside: evidence assets and retained
        bundles are content-addressed and never rewritten, config is static, and
        no Git operation can be in flight. Everything a contributor is actively
        editing lives in PostgreSQL, which the dump captures coherently.
        """
        dest=pathlib.Path(dest);dest.mkdir(parents=True,mode=0o700)
        print('[server] Backup: checking persistent state...',flush=True)
        for root in (self.data,self.workspace,self.config):
            for base,dirs,files in os.walk(root):
                if any((pathlib.Path(base)/name).is_symlink() for name in dirs+files):raise ValueError('Symlink in backup state: inspect and replace it with an ordinary contained file before backup.')
                # Codex recreates temporary executable links inside its container.
                # Keep credentials/history, but never archive this runtime cache.
                dirs[:]=[name for name in dirs if pathlib.Path(base)/name != self.config/'codex/tmp']
        with (contextlib.nullcontext() if online else self.stopped(restart=restart)):
            print('[server] Backup: exporting PostgreSQL...',flush=True)
            with open(dest/'database.dump','wb') as out:self.compose('exec','-T','postgres','pg_dump','-U','studio_app','-d','studio_prod','-Fc','--no-owner','--no-acl',stdout=out)
            skip=('config/codex/tmp',)+((() if provenance else self.PROVENANCE))
            def selected(member):
                return None if any(member.name==prefix or member.name.startswith(prefix+'/') for prefix in skip) else member
            print(f"[server] Backup: compressing workspace, PDFs and configuration{'' if provenance else ' (live state only)'}...",flush=True)
            # PDFs and retained bundles are already compressed; heavy gzip only burns
            # CPU while the application is stopped.
            with tarfile.open(dest/'workspace-state.tar.gz','w:gz',compresslevel=1) as archive:
                for name in ('data','workspace','config'):
                    archive.add(self.root/name,arcname=name,recursive=True,filter=selected)
            print('[server] Backup: calculating checksums...',flush=True)
            manifest={'format':'pydicate-full-backup','version':1,'at':stamp(),'release':json.loads((self.root/'release.json').read_text()).get('studio') if (self.root/'release.json').exists() else git(HERE,'rev-parse','HEAD'),
              'repositories':{name:git(self.workspace/name,'rev-parse','HEAD') for name in ('oldtupicorpus','nhe-enga')},
              'private':True,'includesCredentials':True,'includesImportProvenance':provenance,'online':online,
              'files':{name:sha(dest/name) for name in ('database.dump','workspace-state.tar.gz')}}
            write_json(dest/'manifest.json',manifest)
        print('[server] Backup complete.',flush=True)
        return dest
    def backup(self, destination, full):
        dest=pathlib.Path(destination)
        if full:return self.checkpoint(dest)
        dest.parent.mkdir(parents=True,exist_ok=True)
        with open(dest,'xb') as out:self.compose('exec','-T','postgres','pg_dump','-U','studio_app','-d','studio_prod','-Fc','--no-owner','--no-acl',stdout=out)
        dest.chmod(0o600);return dest
    def restore_database(self,dump,confirmation):
        if confirmation!='RESTORE-STUDIO-PRODUCTION':raise ValueError('Explicit CONFIRM=RESTORE-STUDIO-PRODUCTION is required.')
        self.checkpoint(self.root/'backups'/('prerestore-'+stamp()))
        self.compose('stop','studio')
        # Transactional restore; failure deliberately leaves the app stopped. Restore only trusted dumps.
        with open(dump,'rb') as source:
            proc=subprocess.Popen(['docker','compose','--project-name','pydicate-studio','--env-file',str(self.config/'runtime.env'),'-f',str(HERE/'deploy/collab/compose.yml'),
                'exec','-T','postgres','pg_restore','-U','studio_app','-d','studio_prod','--clean','--if-exists','--no-owner','--no-acl','--single-transaction'],stdin=source)
            if proc.wait()!=0:raise RuntimeError('Restore failed; app remains stopped.')
        self.compose('run','--rm','--no-deps','studio','node','server/migrate.cjs')
        self.compose('run','--rm','--no-deps','studio','node','server/revoke-sessions.cjs')
        print('Database restored; app remains stopped. Confirm matching workspace/PDF state before make collab-start.')
    def restore(self,archive,confirmation):
        if confirmation!='RESTORE-STUDIO-PRODUCTION':raise ValueError('Explicit restore confirmation required')
        from ops import safe_extract
        staging=self.root/('restore-'+stamp());staging.mkdir(mode=0o700)
        safe_extract(archive,staging)
        manifest=json.loads((staging/'manifest.json').read_text())
        if manifest.get('format')!='pydicate-full-backup' or manifest.get('version')!=1:raise ValueError('Not a full Studio backup')
        for name in ('database.dump','workspace-state.tar.gz'):
            if sha(staging/name)!=manifest['files'][name]:raise ValueError('Backup checksum mismatch')
        state=staging/'state';state.mkdir(mode=0o700);safe_extract(staging/'workspace-state.tar.gz',state)
        if not all((state/name).is_dir() for name in ('data','workspace','config')):raise ValueError('Incomplete backup state')
        # A routine checkpoint captures live state only. Carry the retained import
        # archives across so a rollback never destroys provenance it simply omitted.
        if not manifest.get('includesImportProvenance',True):
            for relative in self.PROVENANCE:
                current=self.root/relative
                if current.is_dir() and not current.is_symlink():
                    kept=state/relative;kept.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                    if kept.exists():raise ValueError('Unexpected retained import state in a live-state-only backup')
                    shutil.copytree(current,kept,symlinks=False)
        self.restore_database(staging/'database.dump',confirmation)
        for name in ('data','workspace'):
            current=self.root/name
            current.rename(self.root/(name+'-before-restore-'+stamp()))
            (state/name).rename(current)
        # Database credentials belong to the destination cluster. Restore only the vault key,
        # without silently replacing the destination domain, SSH or SMTP configuration.
        shutil.copyfile(state/'config/provider-vault-key',self.config/'provider-vault-key')
        self.prepare('https://studio.academiatupi.com','none','/srv/nheenga-neologismos')
        print('Full backup restored. Check the recorded application/engine SHAs and target config before make collab-start.')
    def changes(self,name):
        if name not in ALLOW:raise ValueError('Only corpus/grammar repository publication is supported.')
        repo=self.workspace/name
        if git(repo,'remote','get-url','origin')!=REPOS[name]:raise ValueError('Unexpected origin')
        base=git(repo,'rev-parse','origin/main')
        changed=run(['git','-c','safe.directory='+str(repo),'-C',repo,'diff','--name-only','-z','origin/main'],capture=True).decode().split('\0')
        changed+=run(['git','-c','safe.directory='+str(repo),'-C',repo,'ls-files','--others','--exclude-standard','-z'],capture=True).decode().split('\0')
        files=sorted(set(filter(None,changed)))
        rows=[];skipped=[]
        for file in files:
            target=repo/file
            # Symlinks and credential/database bytes are never publishable and never
            # silently skipped: they stop the run so a person looks at them.
            if target.is_symlink():raise ValueError('Symlink publication is not allowed: '+file)
            if pathlib.Path(file).suffix in ('.pem','.key','.sqlite','.db'):raise ValueError('Credential or database files require separate manual review: '+file)
            # Everything else that cannot be published is reported and left untouched
            # in the server working tree, so agent scratch files never block a release.
            if not file.startswith(ALLOW[name]):skipped.append({'path':file,'reason':'outside the publish allowlist'});continue
            if any(part.startswith('.') for part in pathlib.PurePosixPath(file).parts):skipped.append({'path':file,'reason':'hidden path'});continue
            if target.exists() and target.stat().st_size>2*1024*1024:skipped.append({'path':file,'reason':'larger than 2 MiB'});continue
            rows.append({'path':file,'sha256':sha(target) if target.exists() else None})
        manifest={'repo':name,'origin':REPOS[name],'base':base,'head':git(repo,'rev-parse','HEAD'),'files':rows,'skipped':skipped}
        digest=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest();manifest['reviewSha']=digest
        return manifest
    def merge_upstream(self,repo):
        """Bring server/work up to date with origin/main so the pull request merges cleanly.

        A plain merge is attempted first. Only when it conflicts is the merge redone
        with the server copy winning each conflicting hunk, and every such file is
        reported so the resolution is never silent.
        """
        identity=['-c','user.name=Pydicate Studio','-c','user.email=studio@academiatupi.com']
        safe=['git','-c','safe.directory='+str(repo),*identity,'-C',str(repo)]
        # Never prompt and never block: this runs with the application stopped, so a
        # hung fetch is an outage. Git is told there is no terminal, and every step
        # is bounded.
        environment={**os.environ,'GIT_TERMINAL_PROMPT':'0','GIT_ASKPASS':'','SSH_ASKPASS':'',
                     'GIT_SSH_COMMAND':'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes'}
        def attempt(*args,timeout=120):
            try:
                return subprocess.run([*safe,*args],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                                      env=environment,timeout=timeout).returncode==0
            except subprocess.TimeoutExpired:
                print('[server] Git step timed out and was abandoned: '+' '.join(str(a) for a in args),flush=True)
                return False
        clean={'mergedUpstream':False,'conflictsResolvedFromServer':[],'upstreamMergeBlocked':False}
        # A briefly unreachable remote must never fail a publication: the reviewed
        # snapshot is still publishable against the origin/main already on disk.
        attempt('fetch','--no-tags','origin','main',timeout=300)
        if attempt('merge-base','--is-ancestor','origin/main','HEAD'):return clean
        if attempt('merge','--no-edit','origin/main'):return {**clean,'mergedUpstream':True}
        conflicts=sorted(set(git(repo,'diff','--name-only','--diff-filter=U').splitlines()))
        attempt('merge','--abort')
        if not conflicts or not attempt('merge','--no-edit','-X','ours','origin/main'):
            # Histories that cannot be merged at all (unrelated, or a merge that never
            # began) are left to a person. Publication continues from the reviewed
            # snapshot; the pull request simply has to be reconciled on GitHub.
            attempt('merge','--abort')
            print('[server] Could not merge origin/main automatically; publishing the reviewed snapshot unchanged.',flush=True)
            return {**clean,'upstreamMergeBlocked':True}
        print('[server] Upstream conflicts resolved in favour of the server copy: '+', '.join(conflicts),flush=True)
        return {'mergedUpstream':True,'conflictsResolvedFromServer':conflicts,'upstreamMergeBlocked':False}
    def collect(self,name,dest,review_sha=''):
        dest=pathlib.Path(dest);dest.mkdir(parents=True,mode=0o700)
        with self.stopped(), self.workspace_writes():
            manifest=self.changes(name);repo=self.workspace/name
            publishable=[row['path'] for row in manifest['files']]
            # The review artefacts describe exactly what publication would commit, so
            # skipped paths stay out of both the diff and the copied source bytes.
            with open(dest/'review.diff','wb') as out:
                if publishable:run(['git','-c','safe.directory='+str(repo),'-C',repo,'diff','--binary','origin/main','--',*publishable],stdout=out)
            # Include untracked source bytes in the review directory; do not silently omit them.
            new=[f for f in git(repo,'ls-files','--others','--exclude-standard').splitlines() if f in set(publishable)]
            for file in new:
                target=dest/'new-files'/file;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(repo/file,target)
            if review_sha:
                if manifest['reviewSha']!=review_sha:raise ValueError('Server changes differ from the reviewed snapshot. Collect and review again.')
                if git(repo,'branch','--show-current')!='server/work':raise ValueError('Publication requires the dedicated server/work branch.')
                if git(repo,'diff','--cached','--name-only'):raise ValueError('An existing staged change must be handled before publication.')
                if not publishable:raise ValueError('No publishable files')
                run(['git','-c','safe.directory='+str(repo),'-C',repo,'add','--',*publishable])
                if git(repo,'diff','--cached','--name-only'):
                    run(['git','-c','safe.directory='+str(repo),'-c','user.name=Pydicate Studio','-c','user.email=studio@academiatupi.com','-C',repo,'commit','-m','Reviewed server contribution\n\nStudio-Review-SHA: '+review_sha])
                manifest.update(self.merge_upstream(repo))
                run(['git','-c','safe.directory='+str(repo),'-C',repo,'bundle','create',dest/'repository.bundle','server/work'])
                manifest['publishedHead']=git(repo,'rev-parse','HEAD');manifest['bundleSha256']=sha(dest/'repository.bundle')
            write_json(dest/'manifest.json',manifest)
        return dest
    def sync(self,name):
        if name not in ALLOW:raise ValueError('Unknown repository')
        self.checkpoint(self.root/'backups'/('presync-'+stamp()),provenance=False)
        with self.stopped(restart=False), self.workspace_writes():
            repo=self.workspace/name
            if git(repo,'status','--porcelain'):raise ValueError('Unpublished working edits exist. Publish before synchronization; nothing was reset.')
            run(['git','-c','safe.directory='+str(repo),'-C',repo,'fetch','origin','main'])
            run(['git','-c','safe.directory='+str(repo),'-C',repo,'merge','--ff-only','origin/main'])
        self.compose('up','-d','--wait','studio')
        self.compose('exec','-T','studio','node','server/publication.cjs','verify')
    def record_import(self,file):
        with self.stopped(), self.workspace_writes():
            for name in ('oldtupicorpus','nhe-enga'):run(['git','-c','safe.directory='+str(self.workspace/name),'-C',self.workspace/name,'fetch','origin'])
        incoming=self.data/'receipts';incoming.mkdir(exist_ok=True,mode=0o700)
        copy=incoming/(stamp()+'.json');shutil.copyfile(file,copy);copy.chmod(0o600)
        if os.geteuid()==0:os.chown(incoming,1000,1000);os.chown(copy,1000,1000)
        self.compose('exec','-T','studio','node','server/publication.cjs','record','/data/receipts/'+copy.name)
        self.compose('exec','-T','studio','node','server/publication.cjs','verify')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action');parser.add_argument('--root',required=True)
    parser.add_argument('--public-url',default='https://studio.academiatupi.com');parser.add_argument('--smtp',default='relay')
    parser.add_argument('--neo-path',default='/srv/nheenga-neologismos');parser.add_argument('--file');parser.add_argument('--repo',default='oldtupicorpus')
    parser.add_argument('--evidence',help='Private managed-PDF bundle prepared on the deploying laptop')
    parser.add_argument('--desktop',help='Private saved-research bundle prepared on the deploying laptop')
    parser.add_argument('--neo-env',default='/srv/nheenga-neologismos/deploy/env/api.env');parser.add_argument('--mode',default='off');parser.add_argument('--review-sha',default='');parser.add_argument('--confirm',default='');parser.add_argument('--email');parser.add_argument('--name',default='Administrator')
    args=parser.parse_args();os.umask(0o077);host=Host(args.root)
    if args.action=='auto-update':
        from upstream import run_locked
        return run_locked(host)
    # Read-only and deliberately outside the operation lock: a deploy asks for this
    # while deciding what to upload, and must never queue behind a running job.
    if args.action=='inventory':return print(json.dumps(host.inventory()))
    with host.lock():
        if args.action=='install':host.prepare(args.public_url,args.smtp,args.neo_path);host.deploy(initial=not (host.root/'release.json').exists(),evidence=args.evidence,desktop=args.desktop)
        elif args.action=='redeploy':host.deploy(evidence=args.evidence,desktop=args.desktop)
        elif args.action=='backup':host.backup(args.file,True)
        elif args.action=='db-backup':host.backup(args.file,False)
        elif args.action=='db-restore':host.restore_database(args.file,args.confirm)
        elif args.action=='restore':host.restore(args.file,args.confirm)
        elif args.action in ('changes','publish'):host.collect(args.repo,args.file,args.review_sha if args.action=='publish' else '')
        elif args.action=='sync':host.sync(args.repo)
        elif args.action=='admin':host.compose('exec',*(() if sys.stdin.isatty() else ('-T',)),'studio','node','server/admin.cjs','bootstrap','--email',args.email,'--name',args.name)
        elif args.action=='start':host.compose('up','-d','--wait','studio')
        elif args.action=='stop':host.compose('stop','studio')
        elif args.action=='logs':host.compose('logs','--tail','150','studio')
        elif args.action=='psql':host.compose('exec','postgres','psql','-U','studio_app','-d','studio_prod')
        elif args.action=='record-import':host.record_import(args.file)
        elif args.action=='notify':
            if args.mode not in ('off','hourly','daily'):raise ValueError('Invalid digest mode')
            host.compose('exec','-T','-e','COLLAB_DIGEST_MODE='+args.mode,'studio','node','server/digests.cjs')
        elif args.action=='sso-config':
            from sso_setup import configure
            configure(host.root,args.neo_env)
        elif args.action=='research':host.compose('exec','-T','studio','node','server/research-export.cjs','/data/research/'+pathlib.Path(args.file).name)
        else:raise ValueError('Unknown action')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(f'Operation stopped: {error}',file=sys.stderr);sys.exit(1)
