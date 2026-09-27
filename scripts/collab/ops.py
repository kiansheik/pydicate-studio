#!/usr/bin/env python3
"""Laptop entrypoint. Uses the existing Neologismo SSH identity; never forwards keys to the app."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, shlex, shutil, subprocess, sys, tarfile, tempfile

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
    def ssh(self,args,*,data=None,stdout=None,interactive=False):
        flags=['ssh','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-p',str(self.port),'-i',self.identity]
        if interactive:flags+=['-t']
        else:flags+=['-o','BatchMode=yes']
        return command([*flags,f'{self.user}@{self.host}',shlex.join([str(x) for x in args])],input=data,stdout=stdout)
    def action(self,action,*args,interactive=False):
        return self.ssh(['python3',self.root+'/current/scripts/collab/host.py',action,'--root',self.root,*args],interactive=interactive)
    def deploy(self):
        ref=os.getenv('STUDIO_REF','main')
        if not re.fullmatch(r'[A-Za-z0-9_./-]+',ref) or ref.startswith('-') or '..' in ref:raise ValueError('Invalid STUDIO_REF')
        # Only server configuration and a fixed trusted public repository cross this boundary.
        script=r'''set -euo pipefail
root=$1; ref=$2; url=$3; public=$4; smtp=$5; neo=$6
for tool in python3 git docker flock; do command -v "$tool" >/dev/null || { echo "Install required server tool: $tool" >&2; exit 1; }; done
docker compose version >/dev/null
mkdir -p "$root/releases"
exec 9>"$root/deploy.lock"; flock -n 9
stage=$(mktemp -d "$root/releases/.incoming.XXXXXX")
git clone --filter=blob:none --no-checkout "$url" "$stage/app"
git -C "$stage/app" fetch origin "$ref"
git -C "$stage/app" checkout --detach FETCH_HEAD
sha=$(git -C "$stage/app" rev-parse HEAD)
destination="$root/releases/$sha"
if test -e "$destination"; then
  test "$(git -C "$destination" rev-parse HEAD)" = "$sha"
  test -z "$(git -C "$destination" status --porcelain)"
else
  mv "$stage/app" "$destination"
fi
python3 "$destination/scripts/collab/host.py" install --root "$root" --public-url "$public" --smtp "$smtp" --neo-path "$neo"
'''
        self.ssh(['bash','-s','--',self.root,ref,URL,os.getenv('COLLAB_PUBLIC_URL','https://studio.academiatupi.com'),os.getenv('SMTP_MODE','relay'),os.getenv('NEOLOGISMO_PATH','/srv/nheenga-neologismos')],data=script.encode())
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
        self.ssh(['mkdir','-p',str(pathlib.PurePosixPath(remote).parent)])
        with source.open('rb') as f:
            flags=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-p',str(self.port),'-i',self.identity,f'{self.user}@{self.host}']
            command([*flags,shlex.join(['sh','-c','umask 077; set -C; cat > "$1"','sh',remote])],stdin=f)
        result=self.ssh(['sha256sum',remote],stdout=subprocess.PIPE).stdout.decode().split()[0]
        if checksum(source)!=result:raise ValueError('Upload checksum mismatch')

def main():
    p=argparse.ArgumentParser();p.add_argument('action');args=p.parse_args();os.umask(0o077)
    action=args.action;remote=Remote()
    from datetime import datetime, timezone
    label=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+os.urandom(3).hex()
    target=remote.root+'/exports/'+label
    output=os.getenv('FILE') or str(HERE/'backups'/f'{action}-{label}.tar.gz')
    repo=os.getenv('REPO') or 'oldtupicorpus'
    if action in ('install','redeploy'):remote.deploy()
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
    elif action in ('changes','publish'):
        review=os.getenv('REVIEW_SHA','')
        if action=='publish' and not re.fullmatch(r'[a-f0-9]{64}',review):raise ValueError('First collect/review changes, then set REVIEW_SHA to the manifest hash.')
        remote.action(action,'--repo',repo,'--file',target,'--review-sha',review)
        bundle=remote.download(target,output,True)
        if action=='publish':
            local=pathlib.Path(output).with_suffix('').with_suffix('')
            if local.exists():raise ValueError('Local publication directory already exists')
            local.mkdir(mode=0o700);safe_extract(bundle,local)
            manifest=json.loads((local/'manifest.json').read_text())
            if checksum(local/'repository.bundle')!=manifest['bundleSha256']:raise ValueError('Bundle checksum mismatch')
            if manifest['repo']!=repo or manifest['origin']!=f'https://github.com/kiansheik/{repo}.git':raise ValueError('Unexpected publication repository')
            clone=local/'checkout';command(['git','clone','--branch','server/work',local/'repository.bundle',clone])
            branch='contrib/studio-'+label;command(['git','switch','-c',branch],cwd=clone)
            command(['git','remote','set-url','origin',manifest['origin']],cwd=clone)
            command(['git','push','origin','HEAD:refs/heads/'+branch],cwd=clone)
            description=local/'pull-request.md';description.write_text(f'Reviewed Studio server changes.\n\nReview snapshot: `{review}`\n\nSource commit: `{manifest["publishedHead"]}`\n\nEditorial attribution/history remains in the private research database. No credentials or usage data are included. Merge with a merge commit (not squash) so the server can fast-forward after review.\n')
            command(['gh','pr','create','--repo','kiansheik/'+repo,'--base','main','--head',branch,'--title','Reviewed Studio corpus contribution','--body-file',description],cwd=clone)
    elif action=='record-import':
        file=os.getenv('FILE')
        if not file or not pathlib.Path(file).is_file():raise ValueError('Set FILE to the import-receipt.json from a pushed branch')
        remote.upload(file,target+'.receipt.json');remote.action('record-import','--file',target+'.receipt.json')
    elif action=='sso-config':remote.action('sso-config','--neo-env',(os.getenv('NEO_API_ENV_FILE') or (os.getenv('NEOLOGISMO_PATH') or '/srv/nheenga-neologismos')+'/deploy/env/api.env'))
    elif action=='notify':remote.action('notify','--mode',(os.getenv('MODE') or 'off'))
    elif action=='sync':remote.action('sync','--repo',repo)
    else:raise ValueError('Unknown operation')

if __name__=='__main__':
    try:main()
    except Exception as error:print(f'Operation stopped: {error}',file=sys.stderr);sys.exit(1)
