"""Optional byte-level neural proposer. Documented recipe, honest availability.

The recipe is ByT5-small via maintained Transformers/PyTorch APIs: token-free
byte input suits an unsegmented, diacritic-stripped channel, but that is a
reason to try it, not evidence of Tupi accuracy. Two tasks are compared:
normalized input → engine morph analysis, and normalized input → the stable
serialization of the existing source AST (`parser_lab.projection`).

Output is a *candidate*: it enters the same contract and the same validator as
composition, and it never replaces the grammar check. Nothing here downloads a
model implicitly; a missing model or accelerator must not block the offline
baseline, so this module only reports what is actually available.
"""
from __future__ import annotations

import importlib.util
import os
import shutil

RECIPE = {
    'id': 'byt5-small-v1',
    'model': 'google/byt5-small',
    'tasks': ['normalized_to_morph_analysis', 'normalized_to_source_ast'],
    'serializer': 'parser_lab.projection.serialize',
    'decoding': 'constrained beam: parse and validate every completed hypothesis',
    'dependencies': ['torch', 'transformers'],
    'dependencyGroup': 'parser-lab-neural',
    'install': 'python3 -m pip install "torch" "transformers"',
    'seedRequired': True,
    'downloadIsExplicit': True,
    'note': 'PICARD é um precedente de projeto para restringir a decodificação de forma '
            'incremental; não é um analisador Pydicate pronto. Restrições incrementais de '
            'AST/gramática podem reduzir saída inválida em uma etapa posterior.',
}


def _module(name):
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def accelerators():
    rows = {'cpu': True, 'cuda': False, 'mps': False}
    if not _module('torch'):
        return rows
    try:
        import torch
        rows['cuda'] = bool(torch.cuda.is_available())
        rows['mps'] = bool(getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available())
    except Exception:
        pass
    return rows


def neural_status():
    """Actual availability. Never reports success for something that did not run."""
    torch_present = _module('torch')
    transformers_present = _module('transformers')
    cached = os.environ.get('HF_HOME') or os.path.expanduser('~/.cache/huggingface')
    missing = [name for name, present in (('torch', torch_present),
                                          ('transformers', transformers_present)) if not present]
    return {
        'recipe': RECIPE,
        'available': not missing,
        'missingDependencies': missing,
        'accelerators': accelerators(),
        'modelCacheDirectory': cached if os.path.isdir(cached) else None,
        'modelPresent': bool(os.path.isdir(cached) and
                             any('byt5' in name.lower() for name in os.listdir(cached))
                             ) if os.path.isdir(cached) else False,
        'diskFreeBytes': shutil.disk_usage(os.path.expanduser('~')).free,
        'state': 'blocked' if missing else 'ready',
        'trained': False,
        'reason': ('Instale as dependências opcionais para experimentar o proponente neural: '
                   + RECIPE['install']) if missing else
                  'Dependências presentes. O download do modelo continua sendo uma ação explícita; '
                  'nenhum treinamento foi executado neste marco.',
    }


def propose(*_arguments, **_keywords):
    """Not implemented in this milestone. It must never fake a candidate."""
    status = neural_status()
    raise NotImplementedError(
        'O proponente neural não foi executado neste marco. ' + status['reason'])
