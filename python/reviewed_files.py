"""Apply one reviewed set of local files with a durable recovery journal.

Each rename is atomic. A set of renames cannot be filesystem-atomic, so a
failure rolls completed members back and a process interruption remains
recoverable from the journal's exact before/after identities.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile


def _staged(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name + '.studio-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            os.fchmod(handle.fileno(), path.stat().st_mode & 0o777)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        os.unlink(temporary)
        raise
    return temporary


def _sync_parent(path):
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def apply_reviewed_files(changes, journal_path, journal, error):
    changed = [item for item in changes if item['before'] != item['after']]
    for item in changes:
        if item['path'].read_bytes() != item['before']:
            error('Um dos arquivos mudou externamente. Nada foi aplicado; revise a diferença novamente.', 'STALE_SOURCE')
    journal_path.parent.mkdir(parents=True, exist_ok=True)
    with journal_path.open('w', encoding='utf-8') as handle:
        json.dump(journal, handle, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    _sync_parent(journal_path)
    staged = []
    completed = []
    try:
        for item in changed:
            replacement = _staged(item['path'], item['after'])
            try:
                backup = _staged(item['path'], item['before'])
            except BaseException:
                os.unlink(replacement)
                raise
            staged.append((item, replacement, backup))
        # Recheck the whole set after staging, before the first replacement.
        for item in changes:
            if item['path'].read_bytes() != item['before']:
                error('Um dos arquivos mudou durante a preparação. Nada foi aplicado.', 'STALE_SOURCE')
        for item, replacement, backup in staged:
            if item['path'].read_bytes() != item['before']:
                error('Um dos arquivos mudou durante a gravação. A aplicação será desfeita.', 'STALE_SOURCE')
            os.replace(replacement, item['path'])
            completed.append((item, backup))
            _sync_parent(item['path'])
    except BaseException:
        failed = []
        for item, backup in reversed(completed):
            try:
                if item['path'].read_bytes() != item['after']:
                    raise OSError('O arquivo recebeu outra edição.')
                os.replace(backup, item['path'])
                _sync_parent(item['path'])
            except OSError:
                failed.append(str(item['path']))
        if failed:
            error('A aplicação foi interrompida. Os bytes anteriores estão preservados; abra Recuperar uma aplicação anterior para revisar a restauração do conjunto.', 'RECOVERY_REQUIRED')
        raise
    finally:
        for _, replacement, backup in staged:
            for temporary in (replacement, backup):
                if os.path.exists(temporary):
                    os.unlink(temporary)
