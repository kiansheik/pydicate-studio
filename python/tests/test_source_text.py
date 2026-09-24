"""Lossless source-comment text without executing a contributor document."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_authoring import decode_source_text, encode_source_text, source_entries


class SourceTextTests(unittest.TestCase):
    def test_explicit_codec_preserves_line_endings_blanks_whitespace_and_literal_escapes(self):
        values = ["Nã e'i\nsegunda linha", "Nã e'i\r\n\r\n segunda linha \r\n",
                  'primeira\n# @target uma injeção\n\\n continua literal',
                  '  linha com margens  ', 'linha\u2028seguinte\u0085mais uma']
        for field in ('diplomatic', 'target', 'translation', 'analysis', 'note'):
            name = 'normalized_target' if field == 'target' else 'notes' if field == 'note' else field
            for value in values:
                with self.subTest(field=field, value=value):
                    studio = {'passageId': 'passage:example'}
                    encoded = encode_source_text(field, value, studio)
                    self.assertEqual(len(encoded.splitlines()), 1)
                    notes = ('studio:v1 ' + json.dumps(studio),)
                    annotation = {'notes': (encoded,) + notes if field == 'note' else notes}
                    if field != 'note': annotation[name] = encoded
                    decoded = decode_source_text(annotation)
                    self.assertEqual(decoded[name][0] if field == 'note' else decoded[name], value)

    def test_unmarked_literal_and_changed_or_invalid_marker_are_never_unescaped(self):
        literal = '"Nã e\'i\\ncontinua literal"'
        self.assertEqual(decode_source_text({'diplomatic': literal})['diplomatic'], literal)
        studio = {}
        encoded = encode_source_text('diplomatic', "Nã e'i\nlinha", studio)
        notes = ('studio:v1 ' + json.dumps(studio),)
        self.assertEqual(decode_source_text({'diplomatic': literal, 'notes': notes})['diplomatic'], literal)
        studio['textEncoding']['diplomatic']['format'] = 'unknown'
        self.assertEqual(decode_source_text({'diplomatic': encoded, 'notes': ('studio:v1 ' + json.dumps(studio),)})['diplomatic'], encoded)

    def test_reverting_to_plain_text_removes_only_its_marker(self):
        studio = {}
        encode_source_text('diplomatic', 'a\nb', studio)
        encode_source_text('translation', 'c\nd', studio)
        self.assertEqual(encode_source_text('diplomatic', r'literal\n', studio), r'literal\n')
        self.assertNotIn('diplomatic', studio['textEncoding'])
        self.assertIn('translation', studio['textEncoding'])
        encode_source_text('translation', '', studio)
        self.assertNotIn('textEncoding', studio)

    def test_source_read_is_static_and_encoded_directives_cannot_become_statements(self):
        studio = {}
        value = "Nã e'i\n# @target injected\nl += dangerous()\n\n"
        encoded = encode_source_text('diplomatic', value, studio)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'example.tu.py'
            path.write_text('raise AssertionError("must not execute")\nl = []\n# @diplomatic ' + encoded
                            + '\n# @note studio:v1 ' + json.dumps(studio) + '\nl += amen\n')
            entries = source_entries(path)
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]['expression'], 'amen')
            self.assertEqual(entries[0]['studio'], studio)


if __name__ == '__main__': unittest.main()
