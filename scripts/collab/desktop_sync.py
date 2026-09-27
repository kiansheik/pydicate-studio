#!/usr/bin/env python3
"""Read-only desktop research snapshots; verified immutable server archives.

Never starts desktop services, runs contributor code, or copies provider secrets.
Active reconciliation is performed separately by server/desktop-import.cjs.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import tarfile
import tempfile
from collections import Counter

from evidence_sync import ROOT, default_state, inspect_project, regular

MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 2 * 1024 * 1024 * 1024
MAX_FILES = 100000
SHA = re.compile(r'^[a-f0-9]{64}$')
# Directory allowlist, not a profile copy: ai/config and analysis/mcp may contain
# credentials. Browser stores are read through Electron with a key allowlist.
ROOTS = {'drafts': 'drafts', 'analysis/records': 'analysis',
         'analysis/images': 'analysis-image', 'analysis/grammar-edits': 'grammar',
         'ai/ai': 'legacy-ai', 'lexical-notes': 'lexical-notes',
         'projects': 'recovery', 'parser-lab': 'parser-lab',
         'usage': 'usage', 'evidence/sources': 'evidence'}


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checksum(file):
    with regular(pathlib.Path(file)).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def safe_name(name):
    return (isinstance(name, str) and name.startswith('files/') and len(name) <= 1000
            and not re.search(r'[\\\x00-\x1f]', name)
            and all(part not in ('', '.', '..') for part in name.split('/')))


def research_files(state):
    result = []
    for relative, kind in ROOTS.items():
        directory = state / relative
        if any((state / pathlib.Path(*pathlib.Path(relative).parts[:index])).is_symlink()
               for index in range(1, len(pathlib.Path(relative).parts) + 1)):
            raise ValueError('Research directory must not be a symlink: ' + relative)
        if not directory.exists():
            continue
        for base, dirs, files in os.walk(directory):
            for name in dirs:
                if (pathlib.Path(base) / name).is_symlink():
                    raise ValueError('Research directory contains a symlink')
            for name in files:
                file = regular(pathlib.Path(base) / name)
                if relative == 'ai/ai' and not re.fullmatch(
                        r'[a-f0-9]{64}/[a-f0-9]{64}/[a-f0-9]{64}\.json', file.relative_to(directory).as_posix()):
                    continue  # Legacy service keeps provider config at ai/ai/config.json.
                result.append((file, 'files/' + file.relative_to(state).as_posix(), kind))
    if (state / 'session.json').exists():
        result.append((regular(state / 'session.json'), 'files/session.json', 'session'))
    return sorted(result, key=lambda row: row[1])


def create_bundle(state, parent, destination, *, project=None, preferences=None):
    state, parent, destination = map(pathlib.Path, (state, parent, destination))
    project = project or inspect_project(parent, state, readonly=True)
    original_research = research_files(state)
    inputs = list(original_research)
    if preferences:
        inputs.append((regular(pathlib.Path(preferences)), 'files/browser-storage.json', 'preferences'))
    # Preserve the exact source and saved ground-truth bytes alongside the draft
    # ancestry. They are history, never executed or written into the server repo.
    corpus = parent / 'oldtupicorpus'
    for source in project.get('sources', []):
        name = source.get('fileName', '')
        if name != pathlib.Path(name).name or not name.endswith('.tu.py'):
            raise ValueError('Invalid source filename in inspected project')
        for file in (corpus / 'historic' / name,
                     corpus / 'ground_truth/records/historic' / name.replace('.tu.py', '.jsonl'),
                     corpus / 'ground_truth/records/historic' / name.replace('.tu.py', '.studio.json')):
            if file.exists():
                inputs.append((regular(file), 'files/corpus/' + file.relative_to(corpus).as_posix(), 'source'))
    manifest = {'version': 1, 'projectId': project['id'], 'project': project, 'files': [],
                'excluded': ['provider credentials and configuration', 'cookies and authentication',
                             'browser caches', 'process-local undo stacks', 'tab-local Session Storage'],
                'pdfsTransferredSeparately': True}
    total = 0
    if len(inputs) > MAX_FILES:
        raise ValueError('Too many research files')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='studio-research-snapshot-') as temporary:
        temporary = pathlib.Path(temporary)
        for index, (file, name, kind) in enumerate(sorted(inputs, key=lambda row: row[1])):
            if not safe_name(name) or file.stat().st_size > MAX_FILE:
                raise ValueError('Invalid or oversized research file: ' + name)
            data = regular(file).read_bytes()
            total += len(data)
            if total > MAX_TOTAL:
                raise ValueError('Research snapshot exceeds 2 GiB')
            saved = temporary / str(index)
            saved.write_bytes(data)
            row = {'path': name, 'kind': kind, 'sha256': digest(data), 'bytes': len(data)}
            if name.startswith('files/corpus/historic/'):
                source_id = next(source['id'] for source in project['sources'] if source['fileName'] == file.name)
                fingerprints = {passage.get('sourceFileFingerprint') for passage in project['passages'] if passage['sourceId'] == source_id}
                if fingerprints and fingerprints != {'sha256:' + row['sha256']}:
                    raise ValueError('Source changed after inspection; close Studio and retry: ' + name)
            if file.suffix == '.json':
                try:
                    document = json.loads(data)
                    if isinstance(document, dict):
                        if kind == 'session':
                            manifest['selectedPassageId'] = document.get('passageId') or document.get('selectedPassageId')
                        for key in ('projectId', 'passageId'):
                            if isinstance(document.get(key), str):
                                row[key] = document[key]
                except (ValueError, UnicodeError):
                    pass  # Preserve malformed historical files; never repair in place.
            manifest['files'].append(row)
        # Reject inconsistent snapshots instead of silently losing concurrent work.
        if research_files(state) != original_research:
            raise ValueError('Desktop research file list changed during capture; close Studio and retry')
        for (file, name, _), row in zip(sorted(inputs, key=lambda item: item[1]), manifest['files']):
            if checksum(file) != row['sha256']:
                raise ValueError('Desktop data changed during capture; close Studio and retry: ' + name)
        with tarfile.open(destination, 'x:') as archive:
            destination.chmod(0o600)
            def add(name, data):
                item = tarfile.TarInfo(name); item.size = len(data); item.mode = 0o600
                archive.addfile(item, io.BytesIO(data))
            add('manifest.json', encode(manifest))
            for index, row in enumerate(manifest['files']):
                add(row['path'], (temporary / str(index)).read_bytes())
    return {'files': len(inputs), 'bytes': total, 'kinds': dict(Counter(row['kind'] for row in manifest['files']))}


def prepare_local_bundle(destination):
    override = os.environ.get('LOCAL_STUDIO_STATE')
    state = pathlib.Path(override).expanduser() if override else default_state()
    if not state.is_dir():
        if override:
            raise ValueError('LOCAL_STUDIO_STATE does not name a desktop profile')
        return None
    session = json.loads((state / 'session.json').read_text()) if (state / 'session.json').exists() else {}
    parent = os.environ.get('LOCAL_PROJECT_PARENT') or session.get('parentPath')
    if not parent:
        if research_files(state):
            raise ValueError('Set LOCAL_PROJECT_PARENT for desktop research migration')
        return None
    with tempfile.TemporaryDirectory(prefix='studio-browser-export-') as temporary:
        preferences = None
        if (state / 'Local Storage').is_dir():
            preferences = pathlib.Path(temporary) / 'browser-storage.json'
            subprocess.run(['node', str(ROOT / 'scripts/collab/read_local_storage.cjs'),
                            '--state', str(state), '--output', str(preferences)], check=True)
        result = create_bundle(state, pathlib.Path(parent).expanduser(), destination, preferences=preferences)
    print(f"Desktop research: {result['files']} files, {result['bytes']} bytes; {json.dumps(result['kinds'])}", flush=True)
    return pathlib.Path(destination)


def extract_bundle(archive, directory):
    """Validate the whole archive before publishing an immutable directory."""
    archive, directory = pathlib.Path(archive), pathlib.Path(directory)
    archive_sha = checksum(archive)
    if directory.name != archive_sha:
        raise ValueError('Research directory must be named after its archive SHA-256')
    if directory.is_symlink() or directory.parent.is_symlink():
        raise ValueError('Research archive directory must not be a symlink')
    directory.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tarfile.open(archive, 'r:') as source:
        members = source.getmembers()
        names = [member.name for member in members]
        if len(names) > MAX_FILES + 1 or len(names) != len(set(names)) or 'manifest.json' not in names:
            raise ValueError('Invalid research archive member list')
        if any(not member.isfile() or member.size > MAX_FILE or
               not (member.name == 'manifest.json' or safe_name(member.name)) for member in members):
            raise ValueError('Unsafe research archive member')
        if sum(member.size for member in members) > MAX_TOTAL:
            raise ValueError('Research archive exceeds 2 GiB')
        raw_manifest = source.extractfile('manifest.json').read()
        manifest = json.loads(raw_manifest)
        rows = manifest.get('files')
        if manifest.get('version') != 1 or not isinstance(rows, list) or not isinstance(manifest.get('project'), dict):
            raise ValueError('Invalid research manifest')
        if any(not isinstance(row, dict) or not safe_name(row.get('path')) or
               not SHA.fullmatch(row.get('sha256', '')) or type(row.get('bytes')) is not int for row in rows):
            raise ValueError('Invalid research file metadata')
        if len({row['path'] for row in rows}) != len(rows) or {'manifest.json', *(row['path'] for row in rows)} != set(names):
            raise ValueError('Research files do not match manifest')
        with tempfile.TemporaryDirectory(prefix='.incoming-', dir=directory.parent) as temporary:
            stage = pathlib.Path(temporary) / 'snapshot'; stage.mkdir(mode=0o700)
            (stage / 'manifest.json').write_bytes(raw_manifest)
            for row in rows:
                data = source.extractfile(row['path']).read()
                if len(data) != row['bytes'] or digest(data) != row['sha256']:
                    raise ValueError('Research file checksum mismatch: ' + row['path'])
                target = stage / row['path']; target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                target.write_bytes(data); target.chmod(0o600)
                if directory.exists() and checksum(directory / row['path']) != row['sha256']:
                    raise ValueError('Retained research file changed')
            if checksum(archive) != archive_sha:
                raise ValueError('Research archive changed during extraction')
            if directory.exists():
                if regular(directory / 'manifest.json').read_bytes() != raw_manifest:
                    raise ValueError('Retained research manifest changed')
            else:
                stage.rename(directory)
    return {'snapshotSha256': archive_sha, 'files': len(rows), 'bytes': sum(row['bytes'] for row in rows)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--directory', required=True)
    args = parser.parse_args(); os.umask(0o077)
    print(json.dumps(extract_bundle(args.archive, args.directory)))
