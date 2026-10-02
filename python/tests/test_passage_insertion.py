"""Reference identity boundaries for insertion, without executing research code."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from passage_insertion import insert
from passage_references import paths, read
from studio_authoring import source_entries


class PassageInsertionIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.corpus = Path(self.temp.name)
        self.source = 'fixture'
        self.path = self.corpus / 'historic/fixture.tu.py'
        self.path.parent.mkdir(parents=True)
        self.text = 'l = [\n' + ''.join(f'    piece_{ordinal},\n' for ordinal in range(1, 71)) + ']\nfixture = l\n'
        self.path.write_text(self.text, encoding='utf-8')
        self.passages = [
            {'id': f'passage:current-{ordinal}', 'sourceId': self.source,
             'ordinal': ordinal, 'sourceExpression': f'piece_{ordinal}'}
            for ordinal in range(1, 71)
        ]
        self.records = {
            ordinal: {'id': f'fixture:{ordinal:04d}', 'source': self.source,
                      'ordinal': ordinal, 'studio_passage_id': passage['id'],
                      'surface': f'forma {ordinal} — ã', 'status': 'approved',
                      'notes': f'Nota humana {ordinal}', 'annotations': ['original']}
            for ordinal, passage in enumerate(self.passages, 1)
        }
        self.legacy, self.companion = paths(self.corpus, self.source)
        self.legacy.parent.mkdir(parents=True)

    def save_legacy(self):
        self.lines = [
            ('  ' + json.dumps(row, ensure_ascii=False) + '\n\n').encode('utf-8')
            for row in self.records.values()
        ]
        self.legacy.write_bytes(b''.join(self.lines))

    def preview(self, ordinal=67):
        return insert(self.corpus, self.source, self.text, 'new_piece', [],
                      {'passageId': 'passage:new'}, self.passages,
                      self.passages[ordinal - 1]['id'])

    def apply_reference_fixture(self, changes):
        for change in changes:
            change['path'].write_bytes(change['after'])
        return read(self.corpus, self.source)

    def test_prior_unresolved_references_survive_insertion_byte_for_byte(self):
        # Production has unpinned source rows 55 and 60 whose old review IDs
        # differ from the current local registry; insertion is later than both.
        self.records[55]['studio_passage_id'] = 'passage:aff969f1-a8f7-4646-abdb-084e88e50ff0'
        self.records[60]['studio_passage_id'] = 'passage:438841ce-2b74-49a1-9ca9-3deb844a4958'
        self.save_legacy()
        original = self.legacy.read_bytes()
        text, changes, ordinal = self.preview()
        self.assertEqual(ordinal, 67)
        self.assertEqual(self.path.read_text(encoding='utf-8'), self.text)
        self.assertEqual(self.legacy.read_bytes(), original)
        legacy_change = next(change for change in changes if change['path'] == self.legacy)
        self.assertEqual(legacy_change['after'], b''.join(self.lines[:66]))
        after = self.apply_reference_fixture(changes)
        self.assertEqual(len(after), len(self.records))
        self.assertNotIn(67, after, 'Insertion must not approve the new row')
        for old_ordinal, record in self.records.items():
            new_ordinal = old_ordinal + (old_ordinal >= 67)
            expected = record if old_ordinal < 67 else {
                **record, 'ordinal': new_ordinal, 'id': f'fixture:{new_ordinal:04d}'}
            self.assertEqual(after[new_ordinal], expected)
        # Pinning source identity must not silently adopt or rewrite the old
        # unmatched review. The disagreement remains explicit after publication.
        self.path.write_text(text, encoding='utf-8')
        entries = source_entries(self.path)
        for old_ordinal in (55, 60):
            self.assertEqual(entries[old_ordinal - 1]['studio']['passageId'], self.passages[old_ordinal - 1]['id'])
            self.assertNotEqual(after[old_ordinal]['studio_passage_id'], entries[old_ordinal - 1]['studio']['passageId'])

    def test_shifted_identity_mismatch_remains_blocked_without_changing_files(self):
        self.records[67]['studio_passage_id'] = 'passage:another-identity'
        self.save_legacy()
        before = self.legacy.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Referência sem passagem correspondente'):
            self.preview()
        self.assertEqual(self.legacy.read_bytes(), before)
        self.assertEqual(self.path.read_text(encoding='utf-8'), self.text)
        self.assertFalse(self.companion.exists())

    def test_shifted_orphan_reference_remains_blocked(self):
        self.records[71] = {**self.records[70], 'ordinal': 71, 'id': 'fixture:0071'}
        self.save_legacy()
        with self.assertRaisesRegex(ValueError, 'Referência sem passagem correspondente'):
            self.preview()

    def test_unshifted_sparse_mismatch_is_retained_without_filling_gaps(self):
        prior = {**self.records[55], 'studio_passage_id': 'passage:older-identity'}
        later = self.records[70]
        self.legacy.write_bytes(b'')
        self.companion.write_text(json.dumps({'version': 1, 'records': [prior, later]}), encoding='utf-8')
        _, changes, _ = self.preview()
        after = self.apply_reference_fixture(changes)
        self.assertEqual(set(after), {55, 71})
        self.assertEqual(after[55], prior)
        self.assertEqual(after[71], {**later, 'ordinal': 71, 'id': 'fixture:0071'})
        self.assertEqual(self.legacy.read_bytes(), b'')

    def test_legacy_reference_without_stable_id_gains_only_the_shifted_source_identity(self):
        del self.records[66]['studio_passage_id']
        del self.records[67]['studio_passage_id']
        self.save_legacy()
        _, changes, _ = self.preview()
        after = self.apply_reference_fixture(changes)
        self.assertEqual(after[66], self.records[66])
        self.assertEqual(after[68], {**self.records[67], 'ordinal': 68, 'id': 'fixture:0068',
                                   'studio_passage_id': self.passages[66]['id']})


if __name__ == '__main__':
    unittest.main()
