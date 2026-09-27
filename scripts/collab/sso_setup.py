#!/usr/bin/env python3
"""Prepare first-party identity settings on the shared host. No password database is read."""
import datetime, os, pathlib, re, shutil, tempfile

def update_env(filename, values):
    filename=pathlib.Path(filename)
    if filename.is_symlink() or not filename.is_file():raise ValueError('Expected a regular existing private environment file: '+str(filename))
    text=filename.read_text();lines=text.splitlines()
    for key in values:
        if sum(line.startswith(key+'=') for line in lines)>1:raise ValueError('Duplicate environment key: '+key)
    backup=filename.with_name(filename.name+'.before-studio-sso-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
    shutil.copyfile(filename,backup);backup.chmod(0o600)
    for key,value in values.items():
        if '\n' in value or '\r' in value:raise ValueError('Invalid environment value')
        line=key+'='+value;found=next((i for i,item in enumerate(lines) if item.startswith(key+'=')),None)
        if found is None:lines.append(line)
        else:lines[found]=line
    fd,temporary=tempfile.mkstemp(prefix='.identity-',dir=filename.parent)
    try:
        with os.fdopen(fd,'w') as handle:
            handle.write('\n'.join(lines)+'\n');handle.flush();os.fsync(handle.fileno())
        os.chmod(temporary,0o600);os.replace(temporary,filename)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)

def configure(root,neo_env):
    root=pathlib.Path(root);secret=(root/'config/neo-identity-secret').read_text().strip()
    if not re.fullmatch('[a-f0-9]{64}',secret):raise ValueError('Invalid identity secret; rerun the reviewed installation preparation.')
    # Both files must exist before altering either; failures retain full private before-images.
    studio=root/'config/runtime.env';neo=pathlib.Path(neo_env)
    if not studio.is_file() or not neo.is_file():raise ValueError('Set NEO_API_ENV_FILE to the existing effective Docker API env file; no new Neo environment is invented.')
    update_env(neo,{'STUDIO_SSO_ENABLED':'true','STUDIO_SSO_CLIENT_ID':'pydicate-studio','STUDIO_SSO_CLIENT_SECRET':secret,
        'STUDIO_SSO_REDIRECT_URI':'https://studio.academiatupi.com/sso/callback'})
    update_env(studio,{'COLLAB_NEO_SSO_ENABLED':'1','COLLAB_NEO_ISSUER':'https://api.academiatupi.com','COLLAB_NEO_SECRET_FILE':'/run/secrets/neo_identity_secret'})
    print('Private identity configuration prepared with before-images. No secret was printed. Deploy the reviewed Neo identity PR using its usual Makefile, then make collab-deploy. Cookies/CORS/DNS were not changed.')
