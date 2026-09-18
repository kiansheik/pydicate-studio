"""Versioned lab input profile. Python is authoritative; the renderer mirrors it.

The profile is the *only* observation the inference pipeline receives. Spacing,
case and diacritics are removed on purpose, so they cannot secretly steer a
model, a ranker or an agent. Historical orthography (ç→c, î→i style readings)
and OCR repair are deliberately NOT applied here: they are separate, separately
versioned proposal stages that must be able to keep several readings alive.
"""
from __future__ import annotations

import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rendered_structures import normalize as studio_normalize

PROFILE = 'lab-v1'
MAX_INPUT = 400
# Apostrophes are meaningful in Tupi orthography (pu'ir, mombe'u) and are kept.
# Everything else in this set is scribal or editorial punctuation.
PUNCTUATION = '.,;:!?"“”«»()[]{}…—–-/\\|*_'


class InputError(ValueError):
    """Rejected lab input; the message is shown to the contributor."""

    def __init__(self, message, code='LAB_INPUT'):
        super().__init__(message)
        self.code = code


def strip_punctuation(value):
    """Remove editorial punctuation but never an apostrophe or a letter."""
    return ''.join(' ' if char in PUNCTUATION else char for char in value)


def normalize(value):
    """Fold to the lab observation key. Reuses Studio's relaxed comparator."""
    return studio_normalize(strip_punctuation(value), relaxed=True)


def prepare(value):
    """Validate and normalize contributor input.

    Returns the raw text (kept for audit and undo only), the normalized key and
    the profile that produced it. Raw text never reaches the search or a model.
    """
    if not isinstance(value, str):
        raise InputError('Escreva uma frase em tupi para analisar.')
    raw = unicodedata.normalize('NFC', value)
    if len(raw) > MAX_INPUT:
        raise InputError(f'Texto muito longo para o laboratório (máximo {MAX_INPUT} caracteres).')
    key = normalize(raw)
    if not key:
        raise InputError('Escreva uma frase em tupi para analisar.')
    if len(key) > MAX_INPUT:
        raise InputError(f'Texto muito longo para o laboratório (máximo {MAX_INPUT} caracteres).')
    removed = sorted({char for char in raw if char in PUNCTUATION})
    return {'profile': PROFILE, 'raw': raw, 'normalized': key,
            'removedPunctuation': removed,
            'note': 'Espaços, maiúsculas e acentos são descartados. Ortografia histórica '
                    'e correção de OCR não são aplicadas nesta versão.'}
