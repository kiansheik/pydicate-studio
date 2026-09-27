#!/usr/bin/env python3
"""Restore a trusted production DB dump into a private laptop-only review cluster."""
import hashlib,json,os,pathlib,secrets,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parents[2]
def main():
    os.umask(0o077);action=sys.argv[1];directory=pathlib.Path((os.getenv('LOCAL_REVIEW_DIR') or str(HERE/'.local/review-db'))).expanduser().resolve();directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    file=directory/'password'
    if not file.exists():file.write_text(secrets.token_hex(32)+'\n');file.chmod(0o444)
    project='studio-review-'+hashlib.sha256(str(directory).encode()).hexdigest()[:10]
    env={**os.environ,'LOCAL_REVIEW_DIR':str(directory),'LOCAL_UID':str(os.getuid()),'LOCAL_GID':str(os.getgid())}
    compose=['docker','compose','--project-name',project,'-f',str(HERE/'deploy/collab/review.compose.yml')]
    def run(*args,**kw):return subprocess.run([*compose,*args],check=True,env=env,**kw)
    if action=='restore':
        source=pathlib.Path(os.environ.get('FILE','')).expanduser().resolve()
        if not source.is_file():raise ValueError('Set FILE to a trusted PostgreSQL custom-format dump.')
        if (directory/'restored.json').exists():raise ValueError('This review directory was already restored. Choose a fresh LOCAL_REVIEW_DIR; no database was overwritten.')
        run('up','-d','--wait','postgres')
        with source.open('rb') as incoming:run('exec','-T','postgres','pg_restore','-U','studio_review','-d','studio_review','--no-owner','--no-acl','--single-transaction',stdin=incoming)
        (directory/'restored.json').write_text(json.dumps({'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})+'\n')
        print('Restored private review database; no web/SMTP/AI process is running.')
    elif action=='export':
        if not (directory/'restored.json').exists():raise ValueError('Run collab-db-restore-local first.')
        ids=os.environ.get('IDS','');out=pathlib.Path((os.environ.get('FILE') or str(directory/'submissions.json'))).expanduser().resolve()
        if not ids:raise ValueError('Set IDS to the comma-separated submission IDs shown in the collaboration panel.')
        if out.exists():raise ValueError('Export destination already exists.')
        internal='submissions-'+secrets.token_hex(8)+'.json';run('build','tools')
        run('run','--rm','--no-deps','-T','tools','server/submission-export.cjs',ids,'/review/'+internal)
        out.parent.mkdir(parents=True,exist_ok=True);(directory/internal).replace(out);print(out)
    elif action=='psql':run('exec','postgres','psql','-U','studio_review','-d','studio_review')
    else:raise ValueError('Unknown local review action')
if __name__=='__main__':
    try:main()
    except Exception as error:print('Local review stopped: '+str(error),file=sys.stderr);sys.exit(1)
