#!/usr/bin/env python3
"""Portable managed PDF evidence, with additive imports and conservative passage matching.

Only source inspection runs here; contributor .tu.py files are never executed.
The desktop profile is read through a disposable identity-registry copy.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import sys
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
MAX_PDF = 100 * 1024 * 1024
MAX_JSON = 8 * 1024 * 1024
SHA = re.compile(r"^[a-f0-9]{64}$")


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_key(project_id, source_id):
    return digest(encode([project_id, source_id]))


def project_id(parent):
    return 'local-' + digest(str((pathlib.Path(parent) / 'oldtupicorpus').resolve()).encode())[:24]


def regular(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f'Expected a regular managed file: {path.name}')
    return path


def read_json(path):
    regular(path)
    if path.stat().st_size > MAX_JSON:
        raise ValueError(f'Oversize evidence metadata: {path.name}')
    return json.loads(path.read_text(encoding='utf-8'))


def default_state():
    if sys.platform == 'darwin':
        base = pathlib.Path.home() / 'Library/Application Support'
    elif sys.platform == 'win32':
        base = pathlib.Path(os.environ.get('APPDATA', pathlib.Path.home() / 'AppData/Roaming'))
    else:
        base = pathlib.Path(os.environ.get('XDG_CONFIG_HOME', pathlib.Path.home() / '.config'))
    # Electron uses the package name for both development and installed builds.
    return base / 'pydicate-studio'


def inspect_project(parent, state, *, readonly=False):
    sys.path.insert(0, str(ROOT / 'python'))
    from adapter import ProjectAdapter
    if not readonly:
        return ProjectAdapter(state_dir=pathlib.Path(state) / 'projects').open_project(str(parent))
    with tempfile.TemporaryDirectory(prefix='studio-evidence-identities-') as temporary:
        registry = pathlib.Path(state) / 'projects' / (project_id(parent) + '.ids.json')
        if registry.exists():
            shutil.copyfile(regular(registry), pathlib.Path(temporary) / registry.name)
        return ProjectAdapter(state_dir=pathlib.Path(temporary)).open_project(str(parent))


def portable_passages(project):
    keys = ('id', 'sourceId', 'ordinal', 'sourceFingerprint', 'sourceFileFingerprint')
    return [{key: passage[key] for key in keys} for passage in project['passages']]


def validate_manifest(document):
    def identity(value):
        return isinstance(value, str) and 0 < len(value) <= 300 and not any(ord(c) < 32 for c in value)

    def view(value):
        return (isinstance(value, dict) and type(value.get('pageIndex')) is int and
                0 <= value['pageIndex'] <= 100000 and type(value.get('rotation')) in (int, float) and
                value['rotation'] in (0, 90, 180, 270) and
                type(value.get('zoom')) in (int, float) and .25 <= value['zoom'] <= 4)

    def region(value, assets):
        rect = value.get('rect') if isinstance(value, dict) else None
        return (isinstance(value, dict) and identity(value.get('id')) and value.get('assetId') in assets and
                type(value.get('pageIndex')) is int and 0 <= value['pageIndex'] <= 100000 and
                isinstance(rect, list) and len(rect) == 4 and
                all(type(v) in (int, float) and abs(v) <= 10000000 for v in rect) and
                rect[0] < rect[2] and rect[1] < rect[3])

    if (not isinstance(document, dict) or type(document.get('version')) is not int or document['version'] != 1 or
            type(document.get('revision')) is not int or document['revision'] < 0 or
            not identity(document.get('projectId')) or not identity(document.get('sourceId')) or
            not isinstance(document.get('assets'), list) or not isinstance(document.get('passages'), dict)):
        raise ValueError('Invalid evidence manifest')
    assets = set()
    for asset in document['assets']:
        if (not isinstance(asset, dict) or not isinstance(asset.get('id'), str) or not SHA.fullmatch(asset['id']) or
                asset['id'] in assets or not identity(asset.get('name')) or
                type(asset.get('bytes')) is not int or not 0 < asset['bytes'] <= MAX_PDF or
                not isinstance(asset.get('originalPath'), str) or not
                (pathlib.PurePosixPath(asset['originalPath']).is_absolute() or
                 pathlib.PureWindowsPath(asset['originalPath']).is_absolute())):
            raise ValueError('Invalid evidence asset')
        assets.add(asset['id'])
    if 'selectedAssetId' not in document or (document['selectedAssetId'] is not None and document['selectedAssetId'] not in assets):
        raise ValueError('Selected PDF is missing from manifest')
    for identifier, entry in document['passages'].items():
        if (not identity(identifier) or not isinstance(entry, dict) or not view(entry.get('view')) or
                not isinstance(entry.get('regions'), list) or len(entry['regions']) > 500 * max(1, len(assets)) or
                not all(region(item, assets) for item in entry['regions']) or
                ('viewAssetId' in entry and entry['viewAssetId'] not in assets)):
            raise ValueError('Invalid passage evidence')
        for asset_id in assets:
            ids = [item['id'] for item in entry['regions'] if item['assetId'] == asset_id]
            if len(ids) > 500 or len(ids) != len(set(ids)):
                raise ValueError('Invalid passage regions')
        guide = entry.get('guide')
        if 'guide' in entry and (not isinstance(guide, dict) or guide.get('assetId') not in assets or
                not identity(guide.get('fromPassageId')) or
                ('fromOrdinal' in guide and (type(guide['fromOrdinal']) is not int or guide['fromOrdinal'] < 1)) or
                ('region' in guide and not region(guide['region'], {guide['assetId']}))):
            raise ValueError('Invalid passage guide')
    if len(encode(document)) > MAX_JSON:
        raise ValueError('Oversize evidence manifest')


def create_bundle(state, parent, destination, *, project=None):
    """Return counts; no profile, source, draft or original PDF is modified."""
    state = pathlib.Path(state)
    evidence = state / 'evidence'
    if evidence.is_symlink() or (evidence / 'sources').is_symlink() or (evidence / 'assets').is_symlink():
        raise ValueError('Managed evidence directories must not be symlinks')
    identity = project['id'] if project is not None else project_id(parent)
    documents = []
    for file in sorted((evidence / 'sources').glob('*.json')):
        document = read_json(file)
        if document.get('projectId') != identity:
            continue
        validate_manifest(document)
        if file.name != source_key(identity, document['sourceId']) + '.json':
            raise ValueError('Evidence source manifest identity mismatch')
        if document['assets']:
            documents.append(document)
    if not documents:
        return {'sources': 0, 'assets': 0, 'bytes': 0}
    project = project or inspect_project(parent, state, readonly=True)
    assets = {}
    for document in documents:
        for asset in document['assets']:
            previous = assets.get(asset['id'])
            if previous and previous['bytes'] != asset['bytes']:
                raise ValueError('Conflicting managed PDF sizes')
            assets[asset['id']] = asset
            # Original desktop paths are private and meaningless on another machine.
            asset['originalPath'] = '/data/evidence/assets/' + asset['id'] + '.pdf'
    source_ids = {document['sourceId'] for document in documents}
    payload = {'version': 1, 'projectId': identity, 'sources': documents,
               'passages': [passage for passage in portable_passages(project) if passage['sourceId'] in source_ids]}
    metadata = encode(payload)
    if len(metadata) > MAX_JSON:
        raise ValueError('Evidence bundle metadata exceeds 8 MiB')
    with tarfile.open(destination, 'x') as tar:
        info = tarfile.TarInfo('manifest.json');info.size = len(metadata);info.mode = 0o600
        tar.addfile(info, io.BytesIO(metadata))
        for asset_id, asset in sorted(assets.items()):
            path = regular(evidence / 'assets' / (asset_id + '.pdf'))
            if path.stat().st_size != asset['bytes']:
                raise ValueError('Managed PDF size mismatch: ' + asset['name'])
            # Snapshot once so a concurrent replacement cannot swap checked bytes.
            data = path.read_bytes()
            if digest(data) != asset_id or b'%PDF-' not in data[:1024]:
                raise ValueError('Managed PDF checksum/header mismatch: ' + asset['name'])
            info = tarfile.TarInfo('assets/' + asset_id + '.pdf');info.size = len(data);info.mode = 0o600
            tar.addfile(info, io.BytesIO(data))
    return {'sources': len(documents), 'assets': len(assets), 'bytes': sum(a['bytes'] for a in assets.values())}


def prepare_local_bundle(destination):
    override = os.environ.get('LOCAL_STUDIO_STATE')
    state = pathlib.Path(override).expanduser() if override else default_state()
    if not state.is_dir():
        if override:
            raise ValueError('LOCAL_STUDIO_STATE does not name a desktop profile')
        print('No local Studio profile found; no desktop PDFs to transfer.')
        return None
    parent = os.environ.get('LOCAL_PROJECT_PARENT')
    if not parent:
        session = state / 'session.json'
        parent = read_json(session).get('parentPath') if session.exists() else None
    if not parent:
        if list((state / 'evidence/sources').glob('*.json')):
            raise ValueError('Set LOCAL_PROJECT_PARENT for the desktop PDFs to transfer')
        return None
    result = create_bundle(state, pathlib.Path(parent).expanduser(), destination)
    print(f"Desktop PDFs: {result['assets']} files, {result['sources']} sources, {result['bytes']} bytes.")
    return destination if result['assets'] else None


def passage_mapping(incoming, current):
    """Never attach a crop by ordinal alone or carry pending desktop identities over."""
    result = {}
    for item in incoming:
        candidates = [p for p in current if p['sourceId'] == item['sourceId'] and
                      p['sourceFingerprint'] == item['sourceFingerprint']]
        exact = [p for p in candidates if p['id'] == item['id']]
        same_file = [p for p in candidates if p['sourceFileFingerprint'] == item['sourceFileFingerprint'] and
                     p['ordinal'] == item['ordinal']]
        selected = exact if len(exact) == 1 else same_file if len(same_file) == 1 else candidates
        if len(selected) == 1:
            result[item['id']] = selected[0]
    # Two old identities must not collapse onto one new entry.
    targets = [p['id'] for p in result.values()]
    return {key: value for key, value in result.items() if targets.count(value['id']) == 1}


def atomic_json(path, value):
    data = encode(value)
    if len(data) > MAX_JSON:
        raise ValueError('Merged evidence manifest exceeds 8 MiB')
    atomic_bytes(path, data)


def atomic_bytes(path, data):
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data);output.flush();os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        pathlib.Path(temporary).unlink(missing_ok=True)


def import_bundle(archive, state, parent, *, project=None):
    """Called only with the server stopped and its operations lock held.

    Keep the original bundle plus a conflict report in evidence-imports. Existing
    selected PDFs and passage evidence win; only missing entries/assets are added.
    """
    state = pathlib.Path(state)
    evidence = state / 'evidence'
    for directory in (evidence, evidence / 'assets', evidence / 'sources'):
        if directory.is_symlink():
            raise ValueError('Managed evidence directories must not be symlinks')
    with tarfile.open(regular(pathlib.Path(archive)), 'r:') as tar:
        members = tar.getmembers()
        names = [member.name for member in members]
        if len(names) > 10001 or len(names) != len(set(names)) or 'manifest.json' not in names:
            raise ValueError('Invalid evidence archive member list')
        for member in members:
            if (not member.isfile() or not (member.name == 'manifest.json' or
                    re.fullmatch(r'assets/[a-f0-9]{64}\.pdf', member.name)) or
                    member.size > (MAX_JSON if member.name == 'manifest.json' else MAX_PDF)):
                raise ValueError('Unsafe evidence archive member')
        payload = json.load(tar.extractfile('manifest.json'))
        if payload.get('version') != 1 or not isinstance(payload.get('sources'), list) or not isinstance(payload.get('passages'), list):
            raise ValueError('Unsupported evidence bundle')
        expected = {'manifest.json'}
        source_ids = set()
        assets = {}
        for document in payload['sources']:
            validate_manifest(document)
            if document['projectId'] != payload.get('projectId') or document['sourceId'] in source_ids:
                raise ValueError('Conflicting evidence source identities')
            source_ids.add(document['sourceId'])
            for asset in document['assets']:
                name = 'assets/' + asset['id'] + '.pdf'
                if asset['id'] in assets and assets[asset['id']]['bytes'] != asset['bytes']:
                    raise ValueError('Conflicting evidence PDF sizes')
                assets[asset['id']] = asset
                expected.add(name)
        if expected != set(names):
            raise ValueError('Evidence archive files do not match manifest')
        # Validate every byte and every destination before any evidence mutation.
        for asset_id, asset in assets.items():
            data = tar.extractfile('assets/' + asset_id + '.pdf').read()
            if len(data) != asset['bytes'] or digest(data) != asset_id or b'%PDF-' not in data[:1024]:
                raise ValueError('Evidence PDF checksum/header mismatch')
            destination = evidence / 'assets' / (asset_id + '.pdf')
            if destination.exists() or destination.is_symlink():
                if digest(regular(destination).read_bytes()) != asset_id:
                    raise ValueError('Existing server PDF checksum mismatch; preserved')
        project = project or inspect_project(parent, state)
        mapping = passage_mapping(payload['passages'], project['passages'])
        known_sources = {p['sourceId'] for p in project['passages']} | {s['id'] for s in project.get('sources', [])}
        report = {'version': 1, 'assets': len(assets), 'sources': 0, 'passagesAdded': 0,
                  'preservedServerPassages': [], 'unmatchedPassages': [], 'unavailableSources': [], 'unmatchedGuides': []}
        writes = []
        for incoming in payload['sources']:
            source_id = incoming['sourceId']
            if source_id not in known_sources:
                report['unavailableSources'].append(source_id)
                continue
            target = evidence / 'sources' / (source_key(project['id'], source_id) + '.json')
            current = read_json(target) if target.exists() or target.is_symlink() else None
            if current:
                validate_manifest(current)
                if current['projectId'] != project['id'] or current['sourceId'] != source_id:
                    raise ValueError('Existing server evidence identity mismatch; preserved')
            merged = copy.deepcopy(current) if current else {
                'version': 1, 'revision': 0, 'projectId': project['id'], 'sourceId': source_id,
                'selectedAssetId': incoming['selectedAssetId'], 'assets': [], 'passages': {}}
            existing_assets = {asset['id'] for asset in merged['assets']}
            if merged['selectedAssetId'] is None:
                merged['selectedAssetId'] = incoming['selectedAssetId']
            for asset in incoming['assets']:
                if asset['id'] not in existing_assets:
                    merged['assets'].append({**asset, 'originalPath': str(evidence / 'assets' / (asset['id'] + '.pdf'))})
            for old_id, value in incoming['passages'].items():
                passage = mapping.get(old_id)
                if not passage or passage['sourceId'] != source_id:
                    report['unmatchedPassages'].append({'sourceId': source_id, 'passageId': old_id})
                    continue
                value = copy.deepcopy(value)
                if value.get('guide'):
                    previous = mapping.get(value['guide']['fromPassageId'])
                    if previous and previous['sourceId'] == source_id:
                        value['guide']['fromPassageId'] = previous['id']
                        if 'fromOrdinal' in value['guide']:
                            value['guide']['fromOrdinal'] = previous['ordinal']
                    else:
                        report['unmatchedGuides'].append(old_id)
                        del value['guide']
                if passage['id'] in merged['passages']:
                    if merged['passages'][passage['id']] != value:
                        report['preservedServerPassages'].append({'sourceId': source_id, 'passageId': passage['id']})
                else:
                    merged['passages'][passage['id']] = value
                    report['passagesAdded'] += 1
            if merged != current:
                merged['revision'] += 1
                validate_manifest(merged)
                writes.append((target, merged))
            report['sources'] += 1
        for directory in (evidence / 'assets', evidence / 'sources'):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        for asset_id in assets:
            target = evidence / 'assets' / (asset_id + '.pdf')
            if not target.exists():
                atomic_bytes(target, tar.extractfile('assets/' + asset_id + '.pdf').read())
        for target, document in writes:
            atomic_json(target, document)
        atomic_json(pathlib.Path(str(archive) + '.report.json'), report)
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--state', required=True)
    parser.add_argument('--parent', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    report = import_bundle(args.archive, args.state, args.parent)
    summary = {key: len(value) if isinstance(value, list) else value for key, value in report.items()}
    summary['report'] = args.archive + '.report.json'
    print(json.dumps(summary, ensure_ascii=False))
