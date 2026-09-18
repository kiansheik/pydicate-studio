"""A one-node noun tree can enter reviewed publication without source writes."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter


REAL = Path(os.environ.get(
    'PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3])
)).expanduser().resolve()
SOURCE = 'araujo_catecismo_1686'


def corpus_hashes(corpus):
    return {
        str(path.relative_to(corpus)): hashlib.sha256(path.read_bytes()).hexdigest()
        for folder in ('historic', 'authoring', 'ground_truth')
        for path in (corpus / folder).rglob('*')
        if path.is_file() and '__pycache__' not in path.parts
    }


@unittest.skipUnless(
    (REAL / 'oldtupicorpus/historic' / f'{SOURCE}.tu.py').exists(),
    'selected corpus not installed',
)
class NounPublicationTests(unittest.TestCase):
    def test_single_noun_reviews_with_shared_name_and_regression_without_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            corpus = parent / 'oldtupicorpus'
            corpus.mkdir()
            for folder in ('historic', 'authoring', 'ground_truth'):
                shutil.copytree(
                    REAL / 'oldtupicorpus' / folder, corpus / folder,
                    ignore=shutil.ignore_patterns('__pycache__'),
                )
            (parent / 'nhe-enga').symlink_to(REAL / 'nhe-enga', target_is_directory=True)
            subprocess.run(['git', 'init', '--quiet', str(corpus)], check=True)
            subprocess.run(['git', '-C', str(corpus), 'add', '.'], check=True)
            subprocess.run([
                'git', '-C', str(corpus), '-c', 'user.name=Studio Test',
                '-c', 'user.email=test@example.invalid', 'commit', '--quiet',
                '-m', 'disposable noun fixture',
            ], check=True)
            before = corpus_hashes(corpus)
            adapter = ProjectAdapter(parent / 'state')
            adapter.open_project(str(parent))
            with self.assertRaises(AdapterError) as empty:
                adapter.invoke('source_new_preview', {'sourceId': SOURCE, 'raw': ''})
            self.assertEqual(empty.exception.code, 'EMPTY_EXPRESSION')

            preview = adapter.invoke('source_new_preview', {
                'sourceId': SOURCE,
                'raw': "Noun(value='mendara', definition='casamento; matrimônio')",
                'metadata': {'diplomatic': 'Mendâra', 'translation': 'Matrimônio.'},
            })
            entry = next(item for item in preview['lexicalAdditions']
                         if item['headword'] == 'mendara')
            self.assertEqual(preview['raw'], entry['name'])
            self.assertEqual(entry['definition'], 'casamento; matrimônio')
            self.assertIn('l += ' + entry['name'], preview['diff'])
            self.assertIn('# @translation Matrimônio.', preview['diff'])
            self.assertTrue(preview['regression']['ok'])
            self.assertGreater(preview['regression']['checked'], 0)
            self.assertEqual(corpus_hashes(corpus), before)


if __name__ == '__main__':
    unittest.main()
