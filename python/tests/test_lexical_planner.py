"""Lexical publication identity, portability and exact expression preservation."""
import ast
import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lexical_publication import _evidence, contains_lexical_candidates, lexical_slug

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
SOURCE = 'araujo_catecismo_1686'
RUNTIME = Path(__file__).resolve().parents[1] / 'authoring_runtime.py'


class LexicalNamingTests(unittest.TestCase):
    def test_readable_valid_slugs_preserve_word_boundaries_and_avoid_python_keywords(self):
        for word, expected in [('pysyrõ', 'pysyro'), ('Santa Cruz', 'santa_cruz'),
                               ("a'ang", 'aang'), ('1ps', 'lex_1ps'), ('class', 'lex_class'), ('', 'copula')]:
            with self.subTest(word=word):
                self.assertEqual(lexical_slug(word, 'Copula'), expected)
                self.assertTrue(lexical_slug(word, 'Copula').isidentifier())
        self.assertTrue(contains_lexical_candidates("(Noun('abá').voc() + tym)"))
        self.assertTrue(contains_lexical_candidates("studio_define(ProperNoun('Pedro'), 'pessoa')"))
        self.assertFalse(contains_lexical_candidates('((emi * tym) / ypy).var(1)'))

    def test_nonrealizing_primitive_keeps_exact_state_and_failure_identity(self):
        class RequiresAttachment:
            def __init__(self, definition): self.definition = definition
            def eval(self, annotated=False): raise ValueError('Conecte uma base.')
        first = _evidence(RequiresAttachment('aumentativo'))
        self.assertEqual(first['evaluationStatus'], 'partial')
        self.assertEqual(first['error'], {'type': 'builtins.ValueError', 'stage': 'surface', 'message': 'Conecte uma base.'})
        self.assertEqual(first, _evidence(RequiresAttachment('aumentativo')))
        self.assertNotEqual(first, _evidence(RequiresAttachment('diminutivo')))


@unittest.skipUnless((REAL / 'oldtupicorpus/historic' / f'{SOURCE}.tu.py').exists(), 'selected corpus not installed')
class LexicalPlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='studio-lexical-planner-')
        cls.parent = Path(cls.temp.name)
        cls.corpus = cls.parent / 'oldtupicorpus'
        shutil.copytree(REAL / 'oldtupicorpus/historic', cls.corpus / 'historic',
                        ignore=shutil.ignore_patterns('__pycache__'))
        (cls.parent / 'nhe-enga').symlink_to(REAL / 'nhe-enga', target_is_directory=True)
        cls.lexicon = cls.corpus / 'historic/lexicon.tu.py'
        cls.lexicon_original = cls.lexicon.read_bytes()
        cls.source = cls.corpus / 'historic' / f'{SOURCE}.tu.py'

    @classmethod
    def tearDownClass(cls):
        assert (REAL / 'oldtupicorpus/historic/lexicon.tu.py').read_bytes() == cls.lexicon_original
        cls.temp.cleanup()

    def setUp(self):
        self.lexicon.write_bytes(self.lexicon_original)
        self.source.write_text('from historic.lexicon import *\nl = [amen]\n' + SOURCE + ' = l\n', encoding='utf-8')
        (self.corpus / 'historic/future_fixture.tu.py').write_text('l = []\n', encoding='utf-8')

    def shared(self, code):
        self.lexicon.write_text(self.lexicon.read_text(encoding='utf-8').replace('__all__ = [', code + '\n\n__all__ = [', 1), encoding='utf-8')

    def plan(self, raw, **extra):
        before = {path: path.read_bytes() for path in (self.source, self.lexicon)}
        run = subprocess.run([sys.executable, '-I', '-B', str(RUNTIME)],
                             input=json.dumps({'action': 'prepare_lexical_publication', 'parent': str(self.parent),
                                               'sourceId': SOURCE, 'raw': raw, **extra}),
                             capture_output=True, text=True, check=True, timeout=20)
        response = json.loads(run.stdout)
        self.assertNotIn('error', response, response)
        self.assertEqual({path: path.read_bytes() for path in before}, before)
        return response['result']

    def test_operations_comments_unicode_and_duplicate_leaves_survive(self):
        leaf = "Noun('abá🌿', definition='pessoa; sentido exclusivo desta análise')"
        raw = '(' + leaf + '.voc()  # preservar comentário\n + ' + leaf + ')'
        result = self.plan(raw)
        self.assertEqual(len(result['declarations']), 1)
        name = result['declarations'][0]['name']
        self.assertEqual(result['raw'], '(' + name + '.voc()  # preservar comentário\n + ' + name + ')')
        self.assertEqual(result['declarations'][0]['expression'], leaf)
        self.assertEqual(len(result['replacements']), 2)
        self.assertEqual(result['diagnostics'], [])
        self.assertEqual(self.plan(raw), result)

    def test_exact_shared_predicate_reuses_name_and_preserves_original_format_elsewhere(self):
        expression = 'Noun("lexicalprobe", definition="sentido específico")'
        self.shared('publication_known = ' + expression)
        result = self.plan(expression + ' + amen')
        self.assertEqual(result['raw'], 'publication_known + amen')
        self.assertEqual(result['declarations'], [])
        self.assertEqual(result['reused'][0]['name'], 'publication_known')
        self.assertEqual(result['reused'][0]['definition'], 'sentido específico')
        self.assertEqual(self.plan('  amen  # intacto')['raw'], '  amen  # intacto')

    def test_same_spelling_different_definitions_or_classes_are_distinct(self):
        raw = "Noun('lexicalprobe', definition='sentido um') + Noun('lexicalprobe', definition='sentido dois') + ProperNoun('lexicalprobe')"
        result = self.plan(raw)
        names = [entry['name'] for entry in result['declarations']]
        self.assertEqual(len(names), 3)
        self.assertEqual(len(set(names)), 3)
        self.assertEqual(names[0], 'lexicalprobe')
        self.assertRegex(names[1], r'^lexicalprobe_[a-f0-9]{8}$')
        self.assertEqual(len({entry['lexicalFingerprint'] for entry in result['declarations']}), 3)

    def test_same_outer_meaning_preserves_distinct_inner_scopes_after_reload(self):
        first = "studio_define(studio_define((potar * moro).var(1).base_nominal(), 'INNER_A'), 'OUTER')"
        second = "studio_define(studio_define((potar * moro).var(1).base_nominal(), 'INNER_B'), 'OUTER')"
        result = self.plan(first + ' + ' + second)
        outer = [entry for entry in result['declarations'] if entry['definition'] == 'OUTER']
        self.assertEqual(len(outer), 2, result)
        self.assertEqual(len({entry['lexicalFingerprint'] for entry in outer}), 2)
        syntax = ast.parse(result['raw'], mode='eval').body
        self.assertNotEqual(syntax.left.id, syntax.right.id)

        # Emulate the portable reviewed declaration format, solely in this
        # disposable corpus, then load it in a fresh Python process.
        declarations = []
        for entry in result['declarations']:
            declarations.append(entry['name'] + ' = ' + entry['expression'])
            if entry.get('definitionOverride') is not None:
                declarations.append(entry['name'] + '.definition = ' + repr(entry['definitionOverride']))
        self.shared('\n'.join(declarations))
        run = subprocess.run([sys.executable, '-I', '-B', str(RUNTIME)],
                             input=json.dumps({'action': 'evaluate', 'parent': str(self.parent),
                                               'sourceId': SOURCE, 'raw': result['raw']}),
                             capture_output=True, text=True, check=True, timeout=20)
        response = json.loads(run.stdout)
        self.assertNotIn('error', response, response)
        context = response['result']['definitionContext']
        self.assertFalse(context['truncated'])
        self.assertEqual(context['diagnostics'], [])
        scopes = {child['role']: child['node'] for child in context['root']['children']}
        def meanings(node):
            found = {node['compositeDefinition']} if 'compositeDefinition' in node else set()
            for child in node['children']:
                found.update(meanings(child['node']))
            return found
        self.assertEqual(meanings(scopes['left']), {'OUTER', 'INNER_A'})
        self.assertEqual(meanings(scopes['right']), {'OUTER', 'INNER_B'})
        replanned = self.plan(first + ' + ' + second)
        self.assertEqual(replanned['declarations'], [], replanned)
        self.assertEqual(replanned['raw'], result['raw'])
        repeated = self.plan(first + ' + ' + first)
        self.assertEqual(repeated['declarations'], [])
        duplicate = ast.parse(repeated['raw'], mode='eval').body
        self.assertEqual(duplicate.left.id, duplicate.right.id)
        self.assertEqual(duplicate.left.id, syntax.left.id)

    def test_shadowed_shared_name_and_future_other_source_names_are_not_reused(self):
        expression = 'Noun("lexicalprobe", definition="sentido certo")'
        self.shared('publication_known = ' + expression)
        self.source.write_text('from historic.lexicon import *\npublication_known = Noun("outro")\nl = [amen]\n' + SOURCE + ' = l\n', encoding='utf-8')
        (self.corpus / 'historic/future_fixture.tu.py').write_text('l = [lexicalprobe]\nlexicalprobe = Noun("futuro")\n', encoding='utf-8')
        result = self.plan(expression)
        self.assertEqual(result['reused'], [])
        self.assertRegex(result['raw'], r'^lexicalprobe_[a-f0-9]{8}$')
        self.assertEqual(result['declarations'][0]['expression'], expression)

    def test_definition_wrapper_promotes_as_exact_post_constructor_override(self):
        definition = 'Nome próprio; sentido integral com "aspas" e\nsegunda linha.'
        expression = "ProperNoun('Publication Nome', definition='ignorado pelo construtor')"
        result = self.plan(f'studio_define({expression}, {definition!r}).voc()')
        entry = result['declarations'][0]
        self.assertEqual(entry['expression'], f'({expression}).copy()')
        self.assertEqual(entry['definitionOverride'], definition)
        self.assertEqual(entry['definition'], definition)
        self.assertEqual(result['raw'], entry['name'] + '.voc()')
        self.assertEqual(result['diagnostics'], [])

    def test_dictionary_verb_ids_classes_and_complete_definitions_remain_exact(self):
        rows = json.loads(gzip.decompress((REAL / 'nhe-enga/docs/dict-conjugated.json.gz').read_bytes()))
        senses = [row for row in rows if row.get('f') == 'pysyrõ' and row.get('t') == 1][:2]
        self.assertEqual(len(senses), 2)
        expressions = [f"Verb(value={row['f']!r}, verb_class={row['v']!r}, definition={row['d']!r}, vid={row['i']!r})" for row in senses]
        result = self.plan(expressions[0] + '.imp() + ' + expressions[1])
        self.assertEqual(len(result['declarations']), 2)
        for entry, row in zip(result['declarations'], senses):
            call = ast.parse(entry['expression'], mode='eval').body
            properties = {item.arg: ast.literal_eval(item.value) for item in call.keywords}
            self.assertEqual(properties, {'value': row['f'], 'verb_class': row['v'], 'definition': row['d'], 'vid': row['i']})
            self.assertEqual(entry['definition'], row['d'])
        self.assertNotEqual(result['declarations'][0]['lexicalFingerprint'], result['declarations'][1]['lexicalFingerprint'])

    def test_failed_outer_analysis_does_not_discard_verified_lexical_leaf(self):
        result = self.plan("Noun('publicationprobe', definition='teste') + unknown_reference")
        self.assertEqual(result['raw'], 'publicationprobe + unknown_reference')
        self.assertEqual(len(result['declarations']), 1)
        self.assertTrue(any('completa ainda não realiza' in message for message in result['diagnostics']))

    def test_source_constructor_shadow_and_dynamic_arguments_stay_inline(self):
        self.source.write_text('from historic.lexicon import *\nNoun = ProperNoun\nl = [amen]\n' + SOURCE + ' = l\n', encoding='utf-8')
        raw = "Noun('publicationprobe', definition='sentido')"
        result = self.plan(raw)
        self.assertEqual(result['raw'], raw)
        self.assertEqual(result['declarations'], [])
        self.assertTrue(result['diagnostics'])
        self.assertEqual(result['unpromoted'][0]['expression'], raw)
        result = self.plan('Noun(existing_word)')
        self.assertEqual(result['raw'], 'Noun(existing_word)')
        self.assertEqual(result['declarations'], [])

    def test_every_current_catalog_constructor_has_a_publishable_primitive(self):
        expressions = ["Adverb('ko')", "Conjunction(\"a'e\")", 'Copula()',
                       "Demonstrative('kó')", "Interjection('pa')", "Noun('abá')",
                       "Number('mokõî')", "Particle('pe')", "Postposition('suí')",
                       "Pronoun('1ps')", "ProperNoun('Santa Cruz')",
                       "SizeSuffix('-gûasu')", "Verb('tym')"]
        for expression in expressions:
            with self.subTest(expression=expression):
                result = self.plan(expression)
                self.assertEqual(result['unpromoted'], [])
                self.assertIsInstance(ast.parse(result['raw'], mode='eval').body, ast.Name)
                self.assertEqual(len(result['declarations']) + len(result['reused']), 1)


if __name__ == '__main__':
    unittest.main()
