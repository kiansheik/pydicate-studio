"""App-only rollout: no migrations, dependency sync, research imports or full archive."""
import json
import time

# These change installation/schema assumptions and require the full deploy path.
INSTALL_INPUTS = ('deploy/collab', 'server/migrations', 'package.json',
                  'package-lock.json', 'server/package.json', 'server/package-lock.json')


def compatible(previous, candidate, git):
    if git(previous, 'ls-tree', 'HEAD', '--', *INSTALL_INPUTS) != git(candidate, 'ls-tree', 'HEAD', '--', *INSTALL_INPUTS):
        raise ValueError('Installation or database schema changed; use the full collab-deploy.')


def server_only(changed):
    return bool(changed) and all(name == 'Makefile' or name.startswith(('server/', 'docs/', 'scripts/collab/')) for name in changed)


def deploy_light(host):
    from host import HERE, git, run, sha, stamp, write_json
    started = time.monotonic()
    previous = (host.root / 'current').resolve(strict=True)
    compatible(previous, HERE, git)
    old_release = json.loads((host.root / 'release.json').read_text())
    revision = git(HERE, 'rev-parse', 'HEAD')
    if git(HERE, 'status', '--porcelain'):
        raise ValueError('Release checkout must be clean.')
    print('[light] Building app; existing service remains available...', flush=True)
    changed = git(HERE, 'diff', '--name-only', old_release['studio'], 'HEAD').splitlines()
    if server_only(changed):
        # Reuse the already-built frontend and pinned dependencies for server fixes.
        dockerfile = ("ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\n"
                      "COPY --chown=node:node server /app/server\n"
                      "COPY --chown=node:node scripts/collab /app/scripts/collab\n"
                      "COPY --chown=node:node docs /app/docs\n")
        run(['docker', 'build', '--build-arg', 'BASE_IMAGE=pydicate-studio:'+old_release['studio'],
             '-t', 'pydicate-studio:'+revision, '-f', '-', str(HERE)], data=dockerfile.encode())
    else:
        host.compose('build', 'studio')
    backup = host.root / 'light-backups' / stamp()
    backup.mkdir(mode=0o700, parents=True)
    print('[light] Saving a small database checkpoint...', flush=True)
    with (backup / 'database.dump').open('wb') as output:
        host.compose('exec', '-T', 'postgres', 'pg_dump', '-U', 'studio_app', '-d', 'studio_prod',
                     '-Fc', '--no-owner', '--no-acl', stdout=output)
    write_json(backup / 'manifest.json', {'format': 'pydicate-light-backup', 'version': 1,
               'release': old_release, 'files': {'database.dump': sha(backup / 'database.dump')},
               'scope': 'database only; existing workspace, PDFs and credentials stay in place'})
    try:
        print('[light] Switching only Studio; PostgreSQL stays running...', flush=True)
        host.compose('up', '-d', '--no-deps', '--wait', 'studio')
        host.compose('exec', '-T', 'studio', 'node', '-e',
                     "fetch('http://127.0.0.1:8787/healthz').then(r=>r.json()).then(v=>{if(!v.ok||v.release!==process.env.APP_RELEASE)process.exit(1)})")
    except Exception:
        print('[light] New app failed; restoring the previous app image...', flush=True)
        # The old installer supplies its own release tag and compose definitions.
        script = "import sys;sys.path.insert(0,sys.argv[1]+'/scripts/collab');from host import Host;Host(sys.argv[2]).compose('up','-d','--no-deps','--wait','studio')"
        run(['python3', '-B', '-c', script, str(previous), str(host.root)])
        raise
    temporary = host.root / '.current-next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(HERE)
    temporary.replace(host.root / 'current')
    write_json(host.root / 'release.json', {**old_release, 'studio': revision})
    print(f'[light] Healthy release {revision}; {time.monotonic()-started:.1f}s. Backup: {backup.name}', flush=True)
