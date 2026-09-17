#!/usr/bin/env python3
"""Read-only verification of the recorded corpus/engine dependency baseline."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

STUDIO = Path(__file__).resolve().parents[1]
ROOTS = {
    'oldtupicorpus': ('historic', 'authoring', 'ground_truth/records/historic'),
    'nhe-enga': ('pydicate', 'tupi'),
}


def sha256_file(path):
    value = hashlib.sha256()
    with path.open('rb') as handle:
        while block := handle.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def git(repo, *arguments):
    result = subprocess.run(['git', '-C', str(repo), *arguments], capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace').strip() or 'Git indisponível.')
    return result.stdout


def check_repository(parent, recorded):
    name = recorded['name']
    if name not in ROOTS:
        raise ValueError('Repositório desconhecido na linha de base: ' + name)
    repo = parent / name
    result = {'name': name, 'path': str(repo), 'expectedRevision': recorded['revision'], 'checkedFiles': 0, 'errors': []}
    errors = result['errors']
    try:
        result['revision'] = git(repo, 'rev-parse', 'HEAD').decode().strip()
        if result['revision'] != recorded['revision']:
            errors.append('HEAD diferente: esperado ' + recorded['revision'] + ', encontrado ' + result['revision'])
        expected_names = set()
        for entry in recorded['files']:
            relative = Path(entry['path'])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Caminho inválido na linha de base.')
            expected_names.add(relative.as_posix())
            path = repo / relative
            if entry.get('deleted'):
                if path.exists():
                    errors.append('O arquivo deveria estar ausente: ' + entry['path'])
                continue
            if not path.is_file():
                errors.append('Arquivo ausente: ' + entry['path'])
                continue
            actual = sha256_file(path)
            result['checkedFiles'] += 1
            if actual != entry['sha256']:
                errors.append('Conteúdo diferente: ' + entry['path'] + ' (SHA-256 ' + actual + ')')
        actual_names = {
            name for name in git(repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', *ROOTS[name]).decode().split('\0')
            if name and '__pycache__' not in Path(name).parts and Path(name).suffix not in {'.pyc', '.pyo'}
        }
        for extra in sorted(actual_names - expected_names):
            errors.append('Arquivo adicional fora da linha de base: ' + extra)
        # The authoritative review service imports this case registry from the
        # tests package. It is clean at the recorded HEAD and must exist even
        # though the original relevant-files manifest predates this check.
        result['runtimeSupportFiles'] = []
        if name == 'oldtupicorpus':
            for relative in ('tests/__init__.py', 'tests/ground_truth_cases.py'):
                expected = hashlib.sha256(git(repo, 'show', recorded['revision'] + ':' + relative)).hexdigest()
                path = repo / relative
                actual = sha256_file(path) if path.is_file() else None
                result['runtimeSupportFiles'].append({'path': relative, 'expectedSha256': expected, 'actualSha256': actual})
                if actual != expected:
                    errors.append('Suporte do fluxo de referência ausente ou diferente do HEAD registrado: ' + relative)
        patch = recorded['dirtyPatch']
        patch_path = STUDIO / patch['path']
        if not patch_path.is_file() or sha256_file(patch_path) != patch['sha256']:
            errors.append('O patch distribuído difere do manifesto: ' + patch['path'])
        else:
            actual_patch = git(repo, '-c', 'diff.external=', 'diff', '--no-ext-diff', '--binary', 'HEAD', '--', *ROOTS[name])
            result['dirtyPatchSha256'] = hashlib.sha256(actual_patch).hexdigest()
            if actual_patch != patch_path.read_bytes():
                errors.append('O diff local de HEAD difere do patch capturado: ' + patch['path'])
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        errors.append(str(error))
    result['matches'] = not errors
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent', type=Path, default=Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(STUDIO.parent))))
    parser.add_argument('--json', action='store_true', help='Emit machine-readable verification details.')
    args = parser.parse_args()
    baseline_path = STUDIO / 'docs/design/next-baseline.json'
    try:
        baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
        if baseline.get('schemaVersion') != 1:
            raise ValueError('Versão de manifesto desconhecida.')
        repositories = [check_repository(args.parent.expanduser().resolve(), repo) for repo in baseline['repositories']]
        expected_python = baseline['python'].split()[0]
        python_matches = sys.version.split()[0] == expected_python
        matches = python_matches and all(repo['matches'] for repo in repositories)
        report = {'matches': matches, 'baseline': str(baseline_path), 'parent': str(args.parent.expanduser().resolve()), 'python': {'expected': expected_python, 'actual': sys.version.split()[0], 'versionMatches': python_matches, 'build': sys.version}, 'repositories': repositories}
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(('OK' if python_matches else 'DIFERENÇA') + ': Python ' + sys.version.split()[0] + ' (registrado: ' + expected_python + ')')
            for repo in repositories:
                print(('OK' if repo['matches'] else 'DIFERENÇA') + ': ' + repo['name'] + ' — ' + str(repo['checkedFiles']) + ' arquivos verificados')
                for error in repo['errors']:
                    print('  ' + error)
            print('A linha de base registrada corresponde ao ambiente.' if matches else 'O ambiente difere da linha de base testada. Revise as diferenças; nenhum arquivo foi alterado.')
        return 0 if matches else 1
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('Não foi possível verificar a linha de base: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
