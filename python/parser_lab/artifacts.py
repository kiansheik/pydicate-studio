"""Versioned lab artifacts with reproducible manifests and atomic activation.

Generated shards, indexes and model weights live under a project-scoped artifact
directory outside Git. Only code, schemas, recipes, small fixtures and reports
are committed. Nothing here writes into the analysis job store.

An artifact is usable only when its manifest is complete *and* its recorded
context fingerprint still matches the live engine/lexicon/lab code. Otherwise
the caller shows a rebuild action instead of silently reusing stale data.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

MANIFEST_SCHEMA = 1
KINDS = ('index', 'dataset', 'ranker', 'evaluation')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def sha256_file(path):
    hasher = hashlib.sha256()
    with Path(path).open('rb') as handle:
        while block := handle.read(1024 * 1024):
            hasher.update(block)
    return 'sha256:' + hasher.hexdigest()


def fingerprint(value):
    return 'sha256:' + hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def runtime_record():
    return {'python': sys.version.split()[0], 'platform': platform.platform(),
            'implementation': platform.python_implementation()}


class ArtifactError(RuntimeError):
    pass


class Writer:
    """One writer per artifact. The manifest is written last, by rename."""

    def __init__(self, store, artifact_id, kind, fields):
        self.store = store
        self.id = artifact_id
        self.kind = kind
        self.fields = fields
        self.directory = store.staging / f'{artifact_id}.{uuid.uuid4().hex[:8]}'
        self.directory.mkdir(parents=True, exist_ok=False)
        self.started = time.time()

    def path(self, name):
        if '/' in name or '\\' in name or name in {'.', '..'}:
            raise ArtifactError('Nome de arquivo de artefato inválido.')
        return self.directory / name

    def checkpoint(self, state):
        """Record the last completed stage inside the staging directory.

        This makes an interrupted run inspectable and lets a contributor see how
        far it got. Resuming from it is *not* implemented: a rerun starts over.
        """
        temp = self.directory / 'checkpoint.json.tmp'
        temp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        os.replace(temp, self.directory / 'checkpoint.json')

    def commit(self, *, counts=None, metrics=None, status='complete', parents=(), extra=None):
        checksums = {item.name: sha256_file(item) for item in sorted(self.directory.iterdir())
                     if item.is_file() and item.name not in {'manifest.json', 'checkpoint.json'}}
        manifest = {
            'manifestSchema': MANIFEST_SCHEMA, 'artifactId': self.id, 'kind': self.kind,
            'createdAt': now(), 'elapsedSeconds': round(time.time() - self.started, 3),
            'status': status, 'completed': status == 'complete',
            'counts': dict(counts or {}), 'metrics': dict(metrics or {}),
            'parents': list(parents), 'checksums': checksums, 'runtime': runtime_record(),
            **self.fields, **(extra or {}),
        }
        temp = self.directory / 'manifest.json.tmp'
        temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temp, self.directory / 'manifest.json')
        target = self.store.root / self.id
        if target.exists():
            shutil.rmtree(self.store.staging / f'discard.{uuid.uuid4().hex[:8]}', ignore_errors=True)
            discarded = self.store.staging / f'discard.{uuid.uuid4().hex[:8]}'
            os.replace(target, discarded)
            shutil.rmtree(discarded, ignore_errors=True)
        os.replace(self.directory, target)
        return manifest

    def abandon(self):
        shutil.rmtree(self.directory, ignore_errors=True)


class ArtifactStore:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.staging = self.root / '.staging'
        self.root.mkdir(parents=True, exist_ok=True)
        self.staging.mkdir(parents=True, exist_ok=True)

    # -- identity ----------------------------------------------------------
    @staticmethod
    def identifier(kind, recipe, context):
        if kind not in KINDS:
            raise ArtifactError('Tipo de artefato desconhecido: ' + str(kind))
        material = fingerprint({'kind': kind, 'recipe': recipe, 'context': context})
        return f'{kind}-{material.split(":")[1][:16]}'

    def begin(self, kind, *, recipe, context, normalizer_profile, grammar_version,
              ast_schema, split_policy=None, lexical_snapshot=None, parents=()):
        artifact_id = self.identifier(kind, recipe, context)
        fields = {'recipe': recipe, 'context': context, 'normalizerProfile': normalizer_profile,
                  'grammarVersion': grammar_version, 'astSchemaVersion': ast_schema,
                  'splitPolicy': split_policy or {}, 'lexicalSnapshot': lexical_snapshot or {},
                  'parents': list(parents)}
        return Writer(self, artifact_id, kind, fields)

    # -- reading -----------------------------------------------------------
    def manifest(self, artifact_id):
        path = self.root / artifact_id / 'manifest.json'
        try:
            value = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None
        return value if isinstance(value, dict) and value.get('manifestSchema') == MANIFEST_SCHEMA else None

    def directory(self, artifact_id):
        return self.root / artifact_id

    def entries(self):
        rows = []
        for item in sorted(self.root.iterdir()) if self.root.is_dir() else []:
            if not item.is_dir() or item.name.startswith('.'):
                continue
            manifest = self.manifest(item.name)
            rows.append(manifest or {'artifactId': item.name, 'kind': 'unknown',
                                     'status': 'interrupted', 'completed': False,
                                     'manifestSchema': MANIFEST_SCHEMA})
        return rows

    def interrupted(self):
        """Staging leftovers from an interrupted or killed job, with progress."""
        if not self.staging.is_dir():
            return []
        rows = []
        for item in sorted(self.staging.iterdir()):
            if not item.is_dir() or item.name.startswith('discard.'):
                continue
            try:
                progress = json.loads((item / 'checkpoint.json').read_text(encoding='utf-8'))
            except (OSError, ValueError):
                progress = None
            rows.append({'name': item.name, 'lastStage': (progress or {}).get('stage'),
                         'counts': (progress or {}).get('counts', {})})
        return rows

    def clear_staging(self):
        """Discard interrupted leftovers. A rerun starts from the beginning."""
        removed = [row['name'] for row in self.interrupted()]
        for name in removed:
            shutil.rmtree(self.staging / name, ignore_errors=True)
        return removed

    def verify(self, artifact_id):
        """Confirm every recorded file is present with its recorded checksum."""
        manifest = self.manifest(artifact_id)
        if not manifest:
            return {'artifactId': artifact_id, 'valid': False, 'reason': 'MANIFEST_MISSING'}
        for name, checksum in manifest.get('checksums', {}).items():
            path = self.root / artifact_id / name
            if not path.is_file():
                return {'artifactId': artifact_id, 'valid': False, 'reason': 'FILE_MISSING', 'file': name}
            if sha256_file(path) != checksum:
                return {'artifactId': artifact_id, 'valid': False, 'reason': 'CHECKSUM_MISMATCH', 'file': name}
        return {'artifactId': artifact_id, 'valid': manifest.get('completed') is True,
                'reason': None if manifest.get('completed') else 'INCOMPLETE'}

    def compatible(self, artifact_id, context_fingerprint):
        manifest = self.manifest(artifact_id)
        if not manifest or not manifest.get('completed'):
            return False
        return manifest.get('context', {}).get('fingerprint') == context_fingerprint

    # -- activation --------------------------------------------------------
    @property
    def _active_path(self):
        return self.root / 'active.json'

    def active(self):
        try:
            value = json.loads(self._active_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}

    def activate(self, kind, artifact_id):
        """Explicit, atomic activation. Never happens as a side effect of a build."""
        if kind not in KINDS:
            raise ArtifactError('Tipo de artefato desconhecido: ' + str(kind))
        manifest = self.manifest(artifact_id)
        if not manifest or not manifest.get('completed'):
            raise ArtifactError('Só um artefato concluído pode ser ativado.')
        current = {**self.active(), kind: artifact_id}
        temp = self.root / ('active.json.tmp.' + uuid.uuid4().hex[:8])
        temp.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temp, self._active_path)
        return current

    def deactivate(self, kind):
        current = {key: value for key, value in self.active().items() if key != kind}
        temp = self.root / ('active.json.tmp.' + uuid.uuid4().hex[:8])
        temp.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temp, self._active_path)
        return current

    def active_for(self, kind, context_fingerprint=None):
        artifact_id = self.active().get(kind)
        if not artifact_id:
            return None
        if context_fingerprint and not self.compatible(artifact_id, context_fingerprint):
            return None
        return artifact_id if self.manifest(artifact_id) else None

    def status(self, context_fingerprint=None):
        rows = []
        for manifest in self.entries():
            artifact_id = manifest['artifactId']
            rows.append({
                'artifactId': artifact_id, 'kind': manifest.get('kind'),
                'status': manifest.get('status'), 'completed': manifest.get('completed', False),
                'createdAt': manifest.get('createdAt'), 'counts': manifest.get('counts', {}),
                'metrics': manifest.get('metrics', {}),
                'recipe': manifest.get('recipe', {}),
                'parents': manifest.get('parents', []),
                'compatible': (self.compatible(artifact_id, context_fingerprint)
                               if context_fingerprint else None),
                'bytes': sum(item.stat().st_size for item in (self.root / artifact_id).rglob('*')
                             if item.is_file()),
            })
        return {'root': str(self.root), 'artifacts': rows, 'active': self.active(),
                'interrupted': self.interrupted()}


def write_jsonl(path, rows):
    count = 0
    with Path(path).open('w', encoding='utf-8') as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')
            count += 1
    return count


def read_jsonl(path):
    with Path(path).open('r', encoding='utf-8') as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)
