"""Capture saved Git bytes without pausing the app or reading them again at commit."""
import hashlib
import os
from pathlib import Path
import stat
import shutil


def collect(host, name, dest, review_sha='', publish_current=False):
    from host import git, run, sha, write_json
    dest = Path(dest)
    dest.mkdir(parents=True, mode=0o700)
    repo = host.workspace / name
    manifest = host.changes(name)
    if review_sha and manifest['reviewSha'] != review_sha:
        raise ValueError('Server changes differ from the reviewed snapshot. Collect and review again.')
    publishing = bool(review_sha or (publish_current and manifest['files']))
    if publishing:
        if git(repo, 'branch', '--show-current') != 'server/work':
            raise ValueError('Publication requires the dedicated server/work branch.')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise ValueError('An existing staged change must be handled before publication.')
        if not manifest['files']:
            raise ValueError('No publishable files')

    # Copy once and verify against the manifest, then commit only these bytes.
    # This is a saved-work snapshot, not a claim that an active repair is finished.
    captured = {}
    for row in manifest['files']:
        path = repo / row['path']
        if row['sha256'] is None:
            captured[row['path']] = None
            continue
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
            mode = os.fstat(source.fileno()).st_mode
            if not stat.S_ISREG(mode):
                raise ValueError('Publication requires regular source files: ' + row['path'])
            data = source.read()
        git_mode = '100755' if mode & stat.S_IXUSR else '100644'
        if hashlib.sha256(data).hexdigest() != row['sha256'] or git_mode != row['mode']:
            raise ValueError('A source file changed during capture. Run publication again: ' + row['path'])
        captured[row['path']] = (data, git_mode)
    if host.changes(name)['reviewSha'] != manifest['reviewSha']:
        raise ValueError('Server changes moved during capture. Run publication again; the app was not paused.')

    index = dest / 'capture.index'
    environment = {**os.environ, 'GIT_INDEX_FILE': str(index)}
    safe = ['git', '-c', 'safe.directory=' + str(repo), '-C', repo]
    def staged(*args, data=None):
        return run([*safe, *args], data=data, capture=True, env=environment).decode().strip()
    index_lock = repo / '.git/index.lock'
    owns_lock = False
    try:
        if publishing:
            # Fail immediately on competing Git writes; browser edits never use this lock.
            fd = os.open(index_lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
            owns_lock = True
            if git(repo, 'rev-parse', 'HEAD') != manifest['head'] or git(repo, 'branch', '--show-current') != 'server/work' or git(repo, 'diff', '--cached', '--name-only'):
                raise ValueError('Git state changed during capture. Run publication again.')
        if publishing:
            # Retain sparse-checkout skip-worktree bits and other index metadata.
            shutil.copyfile(repo / '.git/index', index)
        else:
            staged('read-tree', manifest['head'])
        new = set(run([*safe, 'ls-files', '--others', '--exclude-standard', '-z'], capture=True).decode().split('\0'))
        for path, saved in captured.items():
            if saved is None:
                staged('update-index', '--force-remove', '--', path)
                continue
            data, mode = saved
            blob = staged('hash-object', '-w', '--stdin', data=data)
            staged('update-index', '--add', '--cacheinfo', mode, blob, path)
            if path in new:
                target = dest / 'new-files' / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        with (dest / 'review.diff').open('wb') as output:
            if captured:
                run([*safe, 'diff', '--binary', '--cached', manifest['base'], '--', *captured], stdout=output, env=environment)
        if publishing:
            tree = staged('write-tree')
            head = manifest['head']
            if tree != git(repo, 'rev-parse', head + '^{tree}'):
                message = 'Reviewed server contribution\n\nStudio-Review-SHA: ' + manifest['reviewSha'] + '\n'
                head = run([*safe, '-c', 'user.name=Pydicate Studio', '-c', 'user.email=studio@academiatupi.com',
                            'commit-tree', tree, '-p', head], data=message.encode(), capture=True).decode().strip()
            # No checkout/reset: changes saved after capture remain working edits.
            index.replace(index_lock)
            recovery = dest / 'git-recovery.json'
            write_json(recovery, {'oldHead': manifest['head'], 'newHead': head, 'indexLock': str(index_lock),
                                  'note': 'If interrupted, inspect ref and index before resuming Git operations.'})
            git(repo, 'update-ref', '-m', 'Studio saved-work snapshot', 'refs/heads/server/work', head, manifest['head'])
            try:
                index_lock.replace(repo / '.git/index')
            except OSError:
                try:
                    git(repo, 'update-ref', 'refs/heads/server/work', manifest['head'], head)
                except Exception:
                    owns_lock = False  # Retain the captured index and recovery receipt.
                    raise RuntimeError('Git index installation and ref rollback failed; recovery is preserved at ' + str(recovery))
                raise
            recovery.unlink()
            owns_lock = False
            manifest['publishedHead'] = head
    finally:
        if owns_lock:
            index_lock.unlink(missing_ok=True)
        index.unlink(missing_ok=True)
        host.application_ownership(repo / '.git')
    if publishing:
        run([*safe, 'bundle', 'create', dest / 'repository.bundle', 'server/work', '^' + manifest['base']])
        manifest['bundleBase'] = manifest['base']
        manifest['bundleSha256'] = sha(dest / 'repository.bundle')
    manifest['captureMode'] = 'saved-files-without-pausing'
    write_json(dest / 'manifest.json', manifest)
    return dest
