"""Install only the explicitly selected Codex login cache; never log credential bytes."""
from pathlib import Path
import json

REMOTE_INSTALL = r'''
import hashlib,json,os,pathlib,sys,tempfile
root=pathlib.Path(sys.argv[1]);replace=sys.argv[2]=='1'
directory=root/'config/codex';target=directory/'auth.json'
if any(p.is_symlink() for p in (root,root/'config',directory,target)):
    raise SystemExit('Refusing a linked credential destination')
payload=sys.stdin.buffer.read(1000001)
if len(payload)>1000000:raise SystemExit('Credential cache exceeds limit')
try:
    value=json.loads(payload)
    valid=isinstance(value,dict) and (bool(value.get('OPENAI_API_KEY')) or isinstance(value.get('tokens'),dict))
except (ValueError,TypeError):valid=False
if not valid:raise SystemExit('Invalid Codex login cache; authenticate locally first')
directory.mkdir(parents=True,exist_ok=True,mode=0o700)
os.chmod(directory,0o700)
if os.geteuid()==0:os.chown(directory,1000,1000)
if target.exists() and not replace:
    print('Codex server login preserved (including refreshed tokens).')
else:
    fd,name=tempfile.mkstemp(prefix='.auth-',dir=directory)
    try:
        with os.fdopen(fd,'wb') as handle:handle.write(payload)
        os.chmod(name,0o600)
        if os.geteuid()==0:os.chown(name,1000,1000)
        os.replace(name,target)
        if hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256(payload).digest():
            raise SystemExit('Credential transfer verification failed')
    finally:
        if os.path.exists(name):os.unlink(name)
    print('Codex login installed privately and verified.')
config=directory/'config.toml'
if not config.exists():
    config.write_text('cli_auth_credentials_store = "file"\n')
    os.chmod(config,0o600)
    if os.geteuid()==0:os.chown(config,1000,1000)
'''


def install(remote, *, replace=False, source=None):
    source = Path(source) if source else Path.home()/'.codex/auth.json'
    if not source.is_file():
        if replace: raise ValueError('Run codex login locally before installing the server login.')
        print('[deploy] No local Codex login cache; existing server AI configuration preserved.',flush=True)
        return
    payload=source.read_bytes()
    try:
        value=json.loads(payload)
        valid=isinstance(value,dict) and (bool(value.get('OPENAI_API_KEY')) or isinstance(value.get('tokens'),dict))
    except (ValueError,TypeError):valid=False
    if not valid or len(payload)>1000000:raise ValueError('Invalid local Codex login cache.')
    # Credentials travel only over the established SSH stdin, never arguments/files in the release.
    remote.ssh(['python3','-c',REMOTE_INSTALL,remote.root,'1' if replace else '0'],data=payload)
