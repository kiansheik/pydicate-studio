"""Real isolated-child protocol checks, independent of the host locale."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import ProjectAdapter
from authoring_service import AuthoringService


PROBE = """
import json, sys
payload = json.load(sys.stdin)
result = {
    'surface': 'Tupã îemonhangagûera 🌿',
    'input': payload,
    'utf8Mode': sys.flags.utf8_mode,
    'stdinEncoding': sys.stdin.encoding,
    'stdoutEncoding': sys.stdout.encoding,
}
"""


class RuntimeEncodingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        # Isolated Python deliberately ignores these environment variables.
        # The invocation must select UTF-8 itself, including on Windows pipes.
        self.environment = patch.dict(os.environ, {
            'PYTHONUTF8': '0', 'PYTHONIOENCODING': 'cp1252',
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.adapter = ProjectAdapter()
        self.adapter.parent = self.root
        self.adapter.project = {'engineFingerprint': 'fixture'}

    def assert_protocol(self, result):
        self.assertEqual(result['surface'], 'Tupã îemonhangagûera 🌿')
        self.assertEqual(result['utf8Mode'], 1)
        self.assertEqual(result['stdinEncoding'], 'utf-8')
        self.assertEqual(result['stdoutEncoding'], 'utf-8')

    def test_authoring_child_uses_unicode_protocol_in_isolated_mode(self):
        (self.root / 'authoring_runtime.py').write_text(
            PROBE + "print(json.dumps({'result': result}, ensure_ascii=False))\n",
            encoding='utf-8',
        )
        with patch('authoring_service.__file__', str(self.root / 'authoring_service.py')):
            result = AuthoringService(self.adapter).child({'raw': "Noun('î', definition='🌿')"})
        self.assert_protocol(result)
        self.assertEqual(result['input']['raw'], "Noun('î', definition='🌿')")

    def test_legacy_renderer_uses_the_same_unicode_protocol(self):
        historic = self.root / 'oldtupicorpus' / 'historic'
        historic.mkdir(parents=True)
        (historic / 'lexicon.tu.py').write_text(
            "apiti = Verb('apiti', definition='î 🌿')\n", encoding='utf-8',
        )
        (self.root / 'engine_render.py').write_text(
            PROBE + "print(json.dumps(result, ensure_ascii=False))\n", encoding='utf-8',
        )
        with patch('adapter.__file__', str(self.root / 'adapter.py')), \
                patch.object(self.adapter, '_snapshots', return_value={}), \
                patch.object(self.adapter, '_engine_fingerprint', return_value='fixture'):
            result = self.adapter.render({
                'revisionId': 'encoding-check', 'engineFingerprint': 'fixture',
                'analysis': {
                    'kind': 'imperative', 'predicate': 'apiti', 'subject': 'nde',
                    'object': 'moro', 'hiddenSubject': True, 'mood': 'imperative',
                    'negated': True,
                },
            })
        self.assert_protocol(result)
        self.assertEqual(result['input']['definition'], 'î 🌿')


if __name__ == '__main__':
    unittest.main()
