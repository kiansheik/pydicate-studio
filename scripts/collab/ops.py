#!/usr/bin/env python3
"""Laptop entrypoint. Uses the existing Neologismo SSH identity; never forwards keys to the app."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, shlex, shutil, subprocess, sys, tarfile, tempfile
from progress import upload_file

HERE=pathlib.Path(__file__).resolve().parents[2]
URL='https://github.com/kiansheik/pydicate-studio.git'

def command(args, **kwargs):return subprocess.run([str(a) for a in args],check=True,**kwargs)
def checksum(file):
    h=hashlib.sha256()
    with open(file,'rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def safe_extract(archive,dest):
    with tarfile.open(archive,'r:*') as tar:
        for member in tar.getmembers():
            path=pathlib.PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):raise ValueError('Unsafe archive member')
        tar.extractall(dest,filter='data')

class Remote:
    def __init__(self):
        self.host=os.getenv('DEPLOY_HOST','academiatupi.com');self.user=os.getenv('DEPLOY_USER','root')
        if not re.fullmatch(r'[A-Za-z0-9_.-]+',self.host) or not re.fullmatch(r'[A-Za-z0-9_-]+',self.user):raise ValueError('Invalid SSH host/user')
        self.root=os.getenv('DEPLOY_PATH','/srv/pydicate-studio')
        self.identity=pathlib.Path(os.getenv('SSH_IDENTITY',str(pathlib.Path.home()/'.ssh/neologismotupi_ed25519'))).expanduser()
        self.port=int(os.getenv('SSH_PORT','22'))
        if not 1<=self.port<=65535:raise ValueError('Invalid SSH port')
    def ssh_flags(self):
        return ['ssh','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
                '-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
                '-p',str(self.port),'-i',str(self.identity)]
    def ssh(self,args,*,data=None,stdout=None,interactive=False):
        flags=self.ssh_flags()
        if interactive:flags+=['-t']
        else:flags+=['-o','BatchMode=yes']
        return command([*flags,f'{self.user}@{self.host}',shlex.join([str(x) for x in args])],input=data,stdout=stdout)
    def action(self,action,*args,interactive=False):
        return self.ssh(['python3',self.root+'/current/scripts/collab/host.py',action,'--root',self.root,*args],interactive=interactive)
    def inventory(self):
        """Content digests the server already holds, so a deploy sends only new bytes.

        A release without this action, or an unreachable server, simply means every
        byte is uploaded as before; deduplication is an optimisation, never a
        precondition.
        """
        print('[deploy] Asking the server which PDFs and research files it already has…',flush=True)
        try:
            result=self.ssh(['python3',self.root+'/current/scripts/collab/host.py','inventory','--root',self.root],
                            stdout=subprocess.PIPE)
            value=json.loads(result.stdout.decode())
            if value.get('version')!=1:raise ValueError('Unsupported inventory')
            known={'evidence':{v for v in value.get('evidence') or [] if re.fullmatch(r'[a-f0-9]{64}',str(v))},
                   'research':{v for v in value.get('research') or [] if re.fullmatch(r'[a-f0-9]{64}',str(v))}}
            print(f"[deploy] Server already holds {len(known['evidence'])} PDF(s) and {len(known['research'])} research file(s).",flush=True)
            return known
        except Exception:
            print('[deploy] Server inventory unavailable; uploading everything.',flush=True)
            return {}
    def deploy(self):
        ref=os.getenv('STUDIO_REF','main')
        if not re.fullmatch(r'[A-Za-z0-9_./-]+',ref) or ref.startswith('-') or '..' in ref:raise ValueError('Invalid STUDIO_REF')
        # Capture research state before any remote mutation. Credentials and
        # arbitrary local source changes never enter the application workspace.
        from evidence_sync import prepare_local_bundle
        from desktop_sync import prepare_local_bundle as prepare_research_bundle
        legacy=os.getenv('COLLAB_IMPORT_LEGACY_DESKTOP') == '1'
        known=self.inventory() if legacy else {}
        print('[deploy] Preparing server release…',flush=True)
        with tempfile.TemporaryDirectory(prefix='studio-deploy-evidence-') as temporary:
            bundle=prepare_local_bundle(pathlib.Path(temporary)/'evidence.tar',known=known.get('evidence',())) if legacy else None
            if legacy: print('[deploy] Preparing explicitly requested legacy research migration…',flush=True)
            desktop=prepare_research_bundle(pathlib.Path(temporary)/'desktop.tar',known=known.get('research',())) if legacy else None
            sha=self.prepare_release(ref,bool(bundle),bool(desktop))
            from codex_auth import install
            install(self)
            incoming=''
            incoming_desktop=''
            if bundle:
                incoming=self.root+'/incoming/evidence-'+os.urandom(12).hex()+'.tar'
                self.upload(bundle,incoming)
            if desktop:
                incoming_desktop=self.root+'/incoming/desktop-'+os.urandom(12).hex()+'.tar'
                self.upload(desktop,incoming_desktop)
            self.deploy_release(sha,incoming,incoming_desktop)
    def prepare_release(self,ref,evidence=False,desktop=False):
        print(f'[deploy] Checking published Studio release {ref} before upload…',flush=True)
        script=r'''set -euo pipefail
root=$1; ref=$2; url=$3; evidence=$4; desktop=$5
for tool in python3 git docker flock; do command -v "$tool" >/dev/null || { echo "Install required server tool: $tool" >&2; exit 1; }; done
docker compose version >/dev/null
mkdir -p "$root/releases"
exec 9>"$root/deploy.lock"; flock -n 9
stage=$(mktemp -d "$root/releases/.incoming.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT
echo '[deploy] Fetching Studio release…' >&2
git clone --filter=blob:none --no-checkout "$url" "$stage/app" >&2
git -C "$stage/app" fetch origin "$ref" >&2
git -C "$stage/app" checkout --detach FETCH_HEAD >&2
sha=$(git -C "$stage/app" rev-parse HEAD)
for file in scripts/collab/host.py deploy/collab/compose.yml deploy/collab/Dockerfile deploy/collab/dependencies.json; do
  test -f "$stage/app/$file" || { echo "Selected release $ref ($sha) lacks $file. Publish the collaboration changes or choose a compatible STUDIO_REF." >&2; exit 1; }
done
if test "$evidence" = 1; then
  test -f "$stage/app/scripts/collab/evidence_sync.py" || { echo 'Selected release does not support desktop PDF import; publish the PDF changes first.' >&2; exit 1; }
  python3 -B "$stage/app/scripts/collab/host.py" --help | grep -q -- --evidence || { echo 'Selected release does not accept desktop PDF evidence.' >&2; exit 1; }
fi
if test "$desktop" = 1; then
  for file in scripts/collab/desktop_sync.py server/desktop-import.cjs; do
    test -f "$stage/app/$file" || { echo "Selected release does not support desktop research migration; publish it first ($file missing)." >&2; exit 1; }
  done
  python3 -B "$stage/app/scripts/collab/host.py" --help | grep -q -- --desktop || { echo 'Selected release does not accept desktop research state.' >&2; exit 1; }
fi
destination="$root/releases/$sha"
if test -e "$destination"; then
  test "$(git -C "$destination" rev-parse HEAD)" = "$sha"
  test -z "$(git -C "$destination" status --porcelain)"
else
  mv "$stage/app" "$destination"
fi
printf '%s\n' "$sha"
'''
        result=self.ssh(['bash','-s','--',self.root,ref,URL,'1' if evidence else '0','1' if desktop else '0'],data=script.encode(),stdout=subprocess.PIPE)
        sha=result.stdout.decode().strip()
        if not re.fullmatch(r'[a-f0-9]{40}',sha):raise ValueError('Server did not return one validated release SHA')
        print(f'[deploy] Published release verified: {sha}',flush=True)
        return sha
    def deploy_release(self,sha,evidence='',desktop=''):
        if not re.fullmatch(r'[a-f0-9]{40}',sha):raise ValueError('Deploy requires a preflighted full release SHA')
        print(f'[deploy] Opening server deployment for {sha}…',flush=True)
        script=r'''set -euo pipefail
root=$1; sha=$2; public=$3; smtp=$4; neo=$5; evidence=$6; desktop=$7
exec 9>"$root/deploy.lock"; flock -n 9
destination="$root/releases/$sha"
test "$(git -C "$destination" rev-parse HEAD)" = "$sha"
test -z "$(git -C "$destination" status --porcelain)"
test -f "$destination/scripts/collab/host.py"
args=(install --root "$root" --public-url "$public" --smtp "$smtp" --neo-path "$neo")
if test -n "$evidence"; then args+=(--evidence "$evidence"); fi
if test -n "$desktop"; then args+=(--desktop "$desktop"); fi
echo '[deploy] Preparing server workspace and application…'
python3 -u "$destination/scripts/collab/host.py" "${args[@]}"
if test -n "$evidence"; then rm -- "$evidence"; fi
if test -n "$desktop"; then rm -- "$desktop"; fi
'''
        self.ssh(['bash','-s','--',self.root,sha,os.getenv('COLLAB_PUBLIC_URL','https://studio.academiatupi.com'),os.getenv('SMTP_MODE','relay'),os.getenv('NEOLOGISMO_PATH','/srv/nheenga-neologismos'),evidence,desktop],data=script.encode())
    def download(self,remote,local,directory=False):
        local=pathlib.Path(local).expanduser().resolve();local.parent.mkdir(parents=True,exist_ok=True)
        if local.exists():raise ValueError('Destination already exists; use a new backup filename.')
        partial=local.with_name(local.name+'.partial')
        if partial.exists():raise ValueError('Previous partial download exists; inspect it before retrying.')
        with open(partial,'xb') as out:
            partial.chmod(0o600)
            self.ssh(['tar','-czf','-','-C',remote,'.'] if directory else ['cat',remote],stdout=out)
        if directory:
            with tempfile.TemporaryDirectory() as temp:
                safe_extract(partial,temp)
                manifest_path=pathlib.Path(temp)/'manifest.json'
                if manifest_path.exists():
                    manifest=json.loads(manifest_path.read_text())
                    entries=manifest.get('files',{})
                    if isinstance(entries,dict):
                        for name,digest in entries.items():
                            if checksum(pathlib.Path(temp)/name)!=digest:raise ValueError('Backup checksum mismatch')
        else:
            result=self.ssh(['sha256sum',remote],stdout=subprocess.PIPE).stdout.decode().split()[0]
            if checksum(partial)!=result:raise ValueError('Download checksum mismatch')
        partial.rename(local);print(local)
        local.with_name(local.name+'.sha256').write_text(checksum(local)+'  '+local.name+'\n')
        return local
    def upload(self,local,remote):
        source=pathlib.Path(local).expanduser().resolve()
        # Upload only into dedicated staging; passwords are not command-line arguments.
        print(f'[deploy] Connecting to {self.host} for upload…',flush=True)
        self.ssh(['mkdir','-p',str(pathlib.PurePosixPath(remote).parent)])
        flags=[*self.ssh_flags(),'-o','BatchMode=yes',f'{self.user}@{self.host}']
        upload_file([*flags,shlex.join(['sh','-c','umask 077; set -C; cat > "$1"','sh',remote])],source)
        print('[deploy] Verifying uploaded SHA-256 checksum…',flush=True)
        result=self.ssh(['sha256sum',remote],stdout=subprocess.PIPE).stdout.decode().split()[0]
        if checksum(source)!=result:raise ValueError('Upload checksum mismatch')
        print('[deploy] Upload verified.',flush=True)

def stamp():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+os.urandom(3).hex()

def unpack_export(remote,repo,label,review,output,*,publish_current=False):
    """Run changes/publish on the server and expand the verified download."""
    remote.action('publish-current' if publish_current else ('publish' if review else 'changes'),'--repo',repo,'--file',remote.root+'/exports/'+label,'--review-sha',review)
    bundle=remote.download(remote.root+'/exports/'+label,output,True)
    local=pathlib.Path(output).with_suffix('').with_suffix('')
    if local.exists():raise ValueError('Local publication directory already exists')
    local.mkdir(mode=0o700);safe_extract(bundle,local)
    return local,json.loads((local/'manifest.json').read_text())

def publication_checkout(repo,local,manifest):
    """Reuse Git objects privately; never change a neighboring working checkout."""
    clone=local/'checkout'
    if not manifest.get('bundleBase'):
        command(['git','clone','--branch','server/work',local/'repository.bundle',clone])
        return clone
    base=manifest['bundleBase']
    if not re.fullmatch(r'[a-f0-9]{40}',base):raise ValueError('Invalid bundle prerequisite')
    cache=HERE/'backups'/'publication-cache'/repo
    if not cache.exists():
        cache.parent.mkdir(parents=True,exist_ok=True)
        command(['git','init','--bare',cache])
        command(['git','-C',cache,'remote','add','origin',manifest['origin']])
        command(['git','-C',cache,'config','remote.origin.promisor','true'])
        command(['git','-C',cache,'config','remote.origin.partialclonefilter','blob:none'])
        command(['git','-C',cache,'config','gc.auto','0'])
    cached=subprocess.run(['git','-C',str(cache),'rev-parse','--verify','refs/heads/base'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    available=cached.returncode==0 and cached.stdout.strip()==base
    if not available:
        print(f'[{repo}] Caching upstream commit metadata (without historical file contents)…',flush=True)
        command(['git','-C',cache,'fetch','--filter=blob:none','--no-tags','origin','+'+base+':refs/heads/base'])
    command(['git','clone','--shared','--no-checkout',cache,clone])
    command(['git','remote','set-url','origin',manifest['origin']],cwd=clone)
    command(['git','update-ref','refs/remotes/origin/main',base],cwd=clone)
    command(['git','config','remote.origin.promisor','true'],cwd=clone)
    command(['git','config','remote.origin.partialclonefilter','blob:none'],cwd=clone)
    command(['git','fetch','--no-tags',local/'repository.bundle','server/work:refs/heads/server/work'],cwd=clone)
    if repo=='nhe-enga':
        from host import SPARSE
        command(['git','sparse-checkout','set','--no-cone',*SPARSE],cwd=clone)
    command(['git','checkout','server/work'],cwd=clone)
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=clone,text=True).strip()!=manifest['publishedHead']:
        raise ValueError('Exported commit does not match the publication manifest')
    return clone


def open_pull_request(repo,label,local,manifest,review):
    """Push the reviewed server snapshot and return the pull request URL."""
    if checksum(local/'repository.bundle')!=manifest['bundleSha256']:raise ValueError('Bundle checksum mismatch')
    if manifest['repo']!=repo or manifest['origin']!=f'https://github.com/kiansheik/{repo}.git':raise ValueError('Unexpected publication repository')
    clone=publication_checkout(repo,local,manifest)
    branch='contrib/studio-'+label;command(['git','switch','-c',branch],cwd=clone)
    command(['git','remote','set-url','origin',manifest['origin']],cwd=clone)
    if manifest.get('bundleBase'):
        from host import Host
        print(f'[{repo}] Reconciling upstream in the local review checkout…',flush=True)
        manifest.update(Host.merge_upstream(clone))
        (local/'publication-result.json').write_text(json.dumps(manifest,indent=2)+'\n')
    command(['git','push','origin','HEAD:refs/heads/'+branch],cwd=clone)
    notes=''
    if manifest.get('skipped'):
        notes+='\nLeft on the server, outside the publish allowlist:\n\n'+''.join(f'- `{row["path"]}` — {row["reason"]}\n' for row in manifest['skipped'])
    if manifest.get('conflictsResolvedFromServer'):
        notes+='\nUpstream conflicts resolved in favour of the server copy:\n\n'+''.join(f'- `{path}`\n' for path in manifest['conflictsResolvedFromServer'])
    description=local/'pull-request.md'
    description.write_text(f'Reviewed Studio server changes.\n\nReview snapshot: `{review}`\n\nSource commit: `{manifest["publishedHead"]}`\n{notes}\nEditorial attribution/history remains in the private research database. No credentials or usage data are included. Merge with a merge commit (not squash) so the server can fast-forward after review.\n')
    created=subprocess.run(['gh','pr','create','--repo','kiansheik/'+repo,'--base','main','--head',branch,
                            '--title','Reviewed Studio contribution: '+repo,'--body-file',str(description)],
                           cwd=clone,check=True,stdout=subprocess.PIPE,text=True).stdout
    return next((line.strip() for line in reversed(created.splitlines()) if line.strip().startswith('https://')),'(pull request created)')

def publish_repository(remote,repo):
    """Collect, review and publish one repository. Returns a result row for the summary."""
    print(f'\n[{repo}] Capturing server contribution without restarting Studio…',flush=True)
    label=stamp()
    local,published=unpack_export(remote,repo,label,'',str(HERE/'backups'/f'publish-{label}.tar.gz'),publish_current=True)
    for row in published.get('skipped',[]):print(f'[{repo}] Leaving on the server ({row["reason"]}): {row["path"]}',flush=True)
    if not published['files']:
        return {'repo':repo,'status':'no changes','detail':'nothing to publish','skipped':published.get('skipped',[])}
    print(f'[{repo}] Publishing {len(published["files"])} file(s)…',flush=True)
    url=open_pull_request(repo,label,local,published,published['reviewSha'])
    return {'repo':repo,'status':'pull request','detail':url,'skipped':published.get('skipped',[]),
            'resolved':published.get('conflictsResolvedFromServer',[])}

def publish_all(remote):
    results=[]
    for repo in ('oldtupicorpus','nhe-enga'):
        try:results.append(publish_repository(remote,repo))
        except Exception as error:results.append({'repo':repo,'status':'failed','detail':error})
    print('\n'+'='*60+'\nPublication summary\n'+'='*60)
    for row in results:
        print(f'  {row["repo"]:<16} {row["status"]:<14} {row["detail"]}')
        for skip in row.get('skipped',[]):print(f'  {"":<16} {"left on server":<14} {skip["path"]} ({skip["reason"]})')
        for path in row.get('resolved',[]):print(f'  {"":<16} {"server copy won":<14} {path}')
    opened=[row for row in results if row['status']=='pull request']
    if opened:
        print('\nOpen these to review and merge (use a merge commit, never squash):')
        for row in opened:print('  '+str(row['detail']))
    failed=[row for row in results if row['status']=='failed']
    if failed:
        print('\nFailed:',file=sys.stderr)
        for row in failed:print(f'  {row["repo"]}: {row["detail"]}',file=sys.stderr)
        raise SystemExit(1)

def main():
    p=argparse.ArgumentParser();p.add_argument('action');args=p.parse_args();os.umask(0o077)
    action=args.action;remote=Remote()
    from datetime import datetime, timezone
    label=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+os.urandom(3).hex()
    target=remote.root+'/exports/'+label
    output=os.getenv('FILE') or str(HERE/'backups'/f'{action}-{label}.tar.gz')
    repo=os.getenv('REPO') or 'oldtupicorpus'
    if action in ('install','redeploy'):remote.deploy()
    elif action=='deploy-light':
        sha=remote.prepare_release(os.getenv('STUDIO_REF','main'))
        remote.ssh(['python3','-B',remote.root+'/releases/'+sha+'/scripts/collab/host.py','light-deploy','--root',remote.root])
    elif action=='codex-auth':
        from codex_auth import install
        install(remote,replace=True)
        print('Run make collab-deploy to enable/reload the installed login.')
    elif action=='ssh':remote.ssh(['bash'],interactive=True)
    elif action in ('logs','psql','start','stop'):remote.action(action,interactive=action=='psql')
    elif action=='admin':
        email=os.getenv('EMAIL');name=os.getenv('NAME') or 'Administrator'
        if not email:raise ValueError('Set EMAIL=...')
        remote.action('admin','--email',email,'--name',name,interactive=True)
    elif action in ('backup','db-backup'):
        file=target if action=='backup' else target+'.dump';remote.action(action,'--file',file)
        remote.download(file,output,directory=action=='backup')
    elif action in ('db-restore','restore'):
        if os.getenv('CONFIRM')!='RESTORE-STUDIO-PRODUCTION@'+remote.host:raise ValueError('Set CONFIRM=RESTORE-STUDIO-PRODUCTION@'+remote.host+' after checking the destination. A safety backup is mandatory.')
        file=os.getenv('FILE')
        if not file or not pathlib.Path(file).is_file():raise ValueError('Set FILE to a trusted backup file')
        remote.upload(file,target+'.restore')
        remote.action(action,'--file',target+'.restore','--confirm','RESTORE-STUDIO-PRODUCTION')
    elif action=='research':
        remote.action('research','--file',label);remote.download(remote.root+'/data/research/'+label,output,True)
    elif action=='publish-all':publish_all(remote)
    elif action in ('changes','publish'):
        review=os.getenv('REVIEW_SHA','')
        if action=='publish' and not re.fullmatch(r'[a-f0-9]{64}',review):raise ValueError('First collect/review changes, then set REVIEW_SHA to the manifest hash.')
        if action=='changes':
            remote.action(action,'--repo',repo,'--file',target,'--review-sha','');remote.download(target,output,True)
        else:
            local,manifest=unpack_export(remote,repo,label,review,output)
            print(open_pull_request(repo,label,local,manifest,review))
    elif action=='record-import':
        file=os.getenv('FILE')
        if not file or not pathlib.Path(file).is_file():raise ValueError('Set FILE to the import-receipt.json from a pushed branch')
        remote.upload(file,target+'.receipt.json');remote.action('record-import','--file',target+'.receipt.json')
    elif action=='sso-config':remote.action('sso-config','--neo-env',(os.getenv('NEO_API_ENV_FILE') or (os.getenv('NEOLOGISMO_PATH') or '/srv/nheenga-neologismos')+'/deploy/env/api.env'))
    elif action=='notify':remote.action('notify','--mode',(os.getenv('MODE') or 'off'))
    elif action=='prune':remote.action('prune')
    elif action=='sync':remote.action('sync','--repo',repo)
    else:raise ValueError('Unknown operation')

if __name__=='__main__':
    try:main()
    except KeyboardInterrupt:print('\nOperation cancelled.',file=sys.stderr);sys.exit(130)
    except Exception as error:print(f'Operation stopped: {error}',file=sys.stderr);sys.exit(1)
