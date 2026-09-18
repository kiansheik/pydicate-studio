"""Read-only curriculum/source contracts; no paid provider requests."""
import ast
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
from learning_library import blocks, features, reference_matches, shape, source_docs


class SourceDocumentationContracts(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.studio = self.root / 'studio'
        self.engine = self.root / 'nhe-enga'
        self.corpus = self.root / 'oldtupicorpus'
        self.python_path = self.engine / 'pydicate/pydicate/core.py'
        self.corpus_path = self.corpus / 'historic/lexicon.tu.py'
        for directory in (self.studio / 'src', self.python_path.parent, self.corpus_path.parent):
            directory.mkdir(parents=True)
        patcher = patch('learning_library.ROOT', self.studio)
        patcher.start()
        self.addCleanup(patcher.stop)

    def guide(self, identifier, **changes):
        return {'id': identifier, 'title': 'Título', 'body': 'Descrição.',
                'ui': 'Selecione a peça.', 'code': 'peca.var(1)', 'terms': ['peça'], **changes}

    def comment(self, guide):
        return '# @studio-guide\n' + '\n'.join('# ' + line for line in json.dumps(guide, ensure_ascii=False, indent=2).splitlines()) + '\n'

    def docstring(self, guide):
        return '"""Descrição técnica.\n@studio-guide\n' + json.dumps(guide, ensure_ascii=False) + '\n"""\n'

    def test_standalone_comments_cover_engine_and_corpus_including_lexicon(self):
        self.python_path.write_text('\n' + self.comment(self.guide('engine', related=['lexicon'])) + '\nvalue = 1\n')
        self.corpus_path.write_text(self.comment(self.guide('lexicon', related=['source'])) + '\nn = lambda value: value.base_nominal(True)\n')
        source_path = self.corpus_path.with_name('example.tu.py')
        source_path.write_text('\n\n' + self.comment(self.guide('source', related=['engine'])) + '\nl += x\n')
        guides, implementations = source_docs(self.engine)
        by_id = {guide['id']: guide for guide in guides}
        self.assertEqual(set(by_id), {'engine', 'lexicon', 'source'})
        self.assertEqual(by_id['engine']['source'], 'nhe-enga/pydicate/pydicate/core.py:2')
        self.assertEqual(by_id['lexicon']['source'], 'oldtupicorpus/historic/lexicon.tu.py:1')
        self.assertEqual(by_id['source']['source'], 'oldtupicorpus/historic/example.tu.py:3')
        self.assertEqual(implementations[0]['signature'], 'n(value)')
        self.assertEqual(implementations[0]['definition'], 'n = lambda value: value.base_nominal(True)')
        self.assertNotIn(str(self.root), json.dumps([guides, implementations]))

    def test_real_module_class_and_function_docstrings_are_read_once(self):
        def indented(text, spaces):
            return ''.join(' ' * spaces + line + '\n' for line in text.splitlines())
        content = self.docstring(self.guide('module'))
        content += '\nclass Predicate:\n' + indented(self.docstring(self.guide('class')), 4)
        content += '\n    def var(self, value=0):\n' + indented(self.docstring(self.guide('var', api=['var'])), 8)
        content += '        return self\n'
        content += '\nasync def _private_helper():\n' + indented(self.docstring(self.guide('async')), 4)
        content += '    return None\n\nraise RuntimeError("Documentation must never execute this module")\n'
        self.python_path.write_text(content)
        self.corpus_path.write_text(self.docstring(self.guide('corpus-module')) + '\ndef helper(value):\n' + indented(self.docstring(self.guide('helper')), 4) + '    return value\n')
        guides, implementations = source_docs(self.engine)
        self.assertEqual({guide['id'] for guide in guides}, {'module', 'class', 'var', 'async', 'corpus-module', 'helper'})
        self.assertEqual(len(guides), 6)
        for guide in guides:
            source_text = self.corpus_path.read_text() if guide['id'].startswith('corpus') or guide['id'] == 'helper' else content
            marker_line = int(guide['source'].rsplit(':', 1)[1])
            self.assertEqual(source_text.splitlines()[marker_line - 1].strip(), '@studio-guide')
        self.assertEqual(len(implementations), 1)
        self.assertEqual(implementations[0]['signature'], 'var(self, value=0)')
        self.assertEqual(implementations[0]['docstring'], 'Descrição técnica.')

    def test_strings_non_docstring_expressions_and_inline_comments_are_ignored(self):
        self.python_path.write_text('''value = 1
text = """
# @studio-guide
{not json}
@studio-guide
{not json either}
"""
"""@studio-guide
{this expression is not a module docstring}
"""
value = 2  # @studio-guide {bad inline comment}
def helper():
    value = "@studio-guide {not documentation}"
    """@studio-guide
    {not a function docstring}
    """
    return value
''')
        guides, implementations = source_docs(self.engine)
        self.assertEqual(guides, [])
        self.assertEqual([item['name'] for item in implementations], ['helper'])

    def test_required_and_optional_fields_are_validated_with_location(self):
        invalid = [([], 'objeto JSON')]
        for key in ('id', 'title', 'body', 'ui', 'code', 'terms'):
            invalid.append(({name: value for name, value in self.guide('a').items() if name != key}, key))
        for key in ('id', 'title', 'body', 'ui', 'code'):
            invalid.extend((self.guide('a', **{key: value}), key) for value in (False, [], '', '   '))
        for key in ('terms', 'related', 'api'):
            invalid.extend((self.guide('a', **{key: value}), key) for value in ('word', None, [1], ['']))
        for guide, message in invalid:
            with self.subTest(guide=guide):
                self.python_path.write_text('\n\n' + self.comment(guide))
                with self.assertRaises(ValueError) as caught:
                    source_docs(self.engine)
                self.assertIn('nhe-enga/pydicate/pydicate/core.py:3', str(caught.exception))
                self.assertIn(message, str(caught.exception))

    def test_invalid_json_duplicate_ids_and_dangling_links_are_actionable(self):
        self.corpus_path.write_text('\n# @studio-guide\n# {broken}\n')
        with self.assertRaisesRegex(ValueError, 'oldtupicorpus/historic/lexicon.tu.py:2: JSON inválido'):
            source_docs(self.engine)
        self.corpus_path.write_text(self.comment(self.guide('same')))
        self.python_path.write_text('\n' + self.comment(self.guide('same')))
        with self.assertRaises(ValueError) as caught:
            source_docs(self.engine)
        self.assertIn('duplicado', str(caught.exception))
        self.assertIn('oldtupicorpus/historic/lexicon.tu.py:1', str(caught.exception))
        self.assertIn('nhe-enga/pydicate/pydicate/core.py:2', str(caught.exception))
        self.python_path.write_text('')
        self.corpus_path.write_text(self.comment(self.guide('same', related=['missing'])))
        with self.assertRaisesRegex(ValueError, "lexicon.tu.py:1:.*'missing'.*related"):
            source_docs(self.engine)

    def test_jsdoc_keeps_multiline_directives_and_gains_line_attribution(self):
        source = self.studio / 'src/guide.ts'
        source.write_text('/**\n * A descrição.\n * @studio-guide\n * ' + json.dumps(self.guide('js', related=['python'])) + '\n */\n')
        self.python_path.write_text(self.comment(self.guide('python', related=['js'])))
        guides, _ = source_docs(self.engine)
        self.assertEqual(guides[0]['source'], 'src/guide.ts:3')
        self.assertEqual({guide['id'] for guide in guides}, {'js', 'python'})


class LearningContracts(unittest.TestCase):
    def test_comment_metadata_uses_json_and_rejects_malformed_data(self):
        self.assertEqual(list(blocks('text @guide {"id":"a", "body":"} inside text"}', '@guide'))[0]['id'], 'a')
        with self.assertRaises(json.JSONDecodeError):
            list(blocks('@guide {broken}', '@guide'))

    def test_parentheses_do_not_hide_structural_changes(self):
        self.assertEqual(shape('(((mombeu)) * ((nhe))).var((1)).base_nominal()'), shape('(mombeu * nhe).var(1).base_nominal()'))
        self.assertNotEqual(shape('-(+nde * mondarõ).imp()'), shape('(+nde * -mondarõ).imp()'))

    def test_approval_and_current_source_directives_are_required(self):
        record = {'status': 'approved', 'surface': 'abc'}
        row = {'surface': 'abc'}
        self.assertTrue(reference_matches(record, {}, row))
        for value in ({}, {'status': 'unresolved', 'surface': 'abc'}):
            self.assertFalse(reference_matches(value, {}, row))
        self.assertFalse(reference_matches(record, {'status': 'human_review'}, row))
        self.assertFalse(reference_matches(record, {'normalized_target': 'def'}, row))
        self.assertFalse(reference_matches(record, {}, {'surface': 'different'}))
        self.assertFalse(reference_matches(record, {}, {**row, 'error': 'failed'}))

    def test_features_separate_unary_and_binary_plus(self):
        self.assertEqual(features('(+nde * mondarõ).imp() + kori'), ['*', '+', '.imp', 'unário +'])

    def test_real_curriculum_and_sources_are_unchanged(self):
        parent = Path(os.environ.get('PYDICATE_PROJECT_PARENT', ROOT.parent))
        if not (parent / 'oldtupicorpus').is_dir(): self.skipTest('Set PYDICATE_PROJECT_PARENT to the local repositories')
        protected = [* (parent / 'oldtupicorpus/historic').glob('*.tu.py'), * (parent / 'oldtupicorpus/ground_truth/records').rglob('*.jsonl')]
        before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
        from authoring_runtime import configure
        from learning_library import build
        library = build(configure(parent))
        self.assertEqual(len(library['lessons']), 5)
        self.assertEqual(sum(lesson['minutes'] for lesson in library['lessons']), 10)
        self.assertGreaterEqual(len(library['guides']), 21)
        self.assertIn('bettendorff_compendio', library['sources'])
        self.assertIn('araujo_catecismo_1686', library['sources'])
        self.assertNotIn(str(parent), json.dumps(library))
        for lesson in library['lessons']:
            self.assertTrue(lesson['available'], lesson['reason'])
            self.assertEqual(shape(lesson['sourceRaw']), shape(lesson['steps'][-1]['raw']))
            self.assertEqual(lesson['steps'][-1]['evaluation']['surface'], lesson['reference'])
            self.assertFalse(lesson['steps'][-1]['evaluation']['failures'])
        for path, digest in before.items():
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest, str(path))


if __name__ == '__main__': unittest.main()
