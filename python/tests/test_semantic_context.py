"""Scoped lexical meanings survive eager morphology and source alias reloads.

The selected engine/corpus are read-only. Source fixtures live in temporary
files; no provider, publication, or editorial approval is performed here.
"""
import ast
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from adapter import ProjectAdapter
from authoring_runtime import configure, namespace_for, realize, shape
from semantic_context import REGISTRY, attach_definition_context, declaration_current, register_declarations


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT',
                           str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


def nodes(root):
    yield root
    for child in root.get('children', []):
        yield from nodes(child['node'])


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/lexicon.tu.py').is_file(),
                     'selected corpus not installed')
class ScopedSemanticContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = configure(REAL)
        cls.source = cls.corpus / 'historic/araujo_catecismo_1686.tu.py'

    def setUp(self):
        self.namespace = namespace_for(self.corpus, self.source, 1)

    def meanings(self, result):
        context = result['definitionContext']
        self.assertFalse(context['truncated'], context['diagnostics'])
        self.assertEqual(context['diagnostics'], [])
        return list(nodes(context['root']))

    def test_nested_meanings_preserve_base_leaves_and_nominal_operation(self):
        baseline = realize('(potar * moro).var(1).base_nominal()', self.namespace)
        before = {name: shape(self.namespace[name]) for name in ('potar', 'moro')}
        raw = 'studio_define(studio_define((potar * moro).var(1), "INNER").base_nominal(), "OUTER")'
        result = realize(raw, self.namespace)
        self.assertEqual(result['surface'], 'moropotara')
        self.assertEqual((result['surface'], result['annotated']),
                         (baseline['surface'], baseline['annotated']))
        meanings = self.meanings(result)
        self.assertEqual([node['compositeDefinition'] for node in meanings
                          if 'compositeDefinition' in node], ['OUTER', 'INNER'])
        bases = {node['label']: node['baseDefinition'] for node in meanings
                 if 'baseDefinition' in node}
        self.assertEqual(bases['potar'], 'to want, to desire, to wish for')
        self.assertEqual(bases['moro'], 'generic, people')
        source = {node['id']: node for node in nodes(result['tree'])}
        self.assertEqual(source['root']['compositeDefinition'], 'OUTER')
        self.assertNotIn('baseDefinition', source['root'])
        self.assertNotIn('compositeDefinition', source['root/arg0'])
        for node in meanings:
            if 'sourceNodeId' in node:
                scope = source[node['sourceNodeId']]
                self.assertEqual((node['start'], node['end']), (scope['start'], scope['end']))
        self.assertEqual(result['runtimeTree']['nodes'][0]['compositeDefinition'], 'OUTER')
        self.assertEqual(before, {name: shape(self.namespace[name]) for name in before})

    def test_ordinary_inherited_definitions_are_not_composite_scopes(self):
        result = realize('(potar * moro).var(1).base_nominal()', self.namespace)
        meanings = self.meanings(result)
        self.assertFalse(any('compositeDefinition' in node for node in meanings))
        self.assertEqual(sum('baseDefinition' in node for node in meanings), 2)

    def test_unknown_noun_header_clearing_remains_empty_base_meaning(self):
        raw = 'studio_define(Noun(value="ekat", definition="(t)", tag="[NOUN][LEXICAL_STATUS:HYPOTHETICAL]"), "")'
        result = realize(raw, self.namespace)
        meanings = self.meanings(result)
        self.assertEqual(result['surface'], 'tekata')
        self.assertEqual(result['tree']['baseDefinition'], '')
        self.assertEqual(result['definitionContext']['root']['lexicalStatus'], 'hypothetical')
        self.assertFalse(any('compositeDefinition' in node for node in meanings))
        self.assertEqual([node['baseDefinition'] for node in meanings if 'baseDefinition' in node], [''])

    def test_leaf_sense_override_is_explicit_and_database_glosses_cannot_replace_it(self):
        result = realize('studio_define(potar, definition="sentido escolhido")', self.namespace)
        meanings = self.meanings(result)
        self.assertEqual(meanings[0]['baseDefinition'], 'sentido escolhido')
        self.assertFalse(any('compositeDefinition' in node for node in meanings))
        self.assertEqual([node['baseDefinition'] for node in meanings if 'baseDefinition' in node], ['sentido escolhido'])

    def test_saved_nested_compositions_and_aliases_reload_with_scopes(self):
        text = '''inner = (potar * moro).var(1).copy()
inner.definition = "INNER"
outer = inner.base_nominal().copy()
outer.definition = "OUTER"
alias = outer
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'meanings.tu.py'
            source.write_text(text, encoding='utf-8')
            for _ in range(2):
                namespace = namespace_for(self.corpus, source, 1000)
                result = realize('alias', namespace)
                meanings = self.meanings(result)
                self.assertEqual(result['surface'], 'moropotara')
                self.assertEqual(result['tree']['compositeDefinition'], 'OUTER')
                self.assertIn('INNER', [node.get('compositeDefinition') for node in meanings])
                self.assertEqual({node['label'] for node in meanings if 'baseDefinition' in node}, {'potar', 'moro'})
                self.assertEqual(meanings[0]['provenance']['sourcePath'], str(source))
                self.assertEqual(source.read_text(encoding='utf-8'), text)

    def test_wrapper_declaration_and_literal_alias_keep_distinct_types_of_meaning(self):
        text = '''compound = studio_define((potar * moro).var(1).base_nominal(), "COMPOUND")
alias = compound
leaf = Noun("ara", definition="old")
leaf.definition = "effective leaf"
leaf_alias = leaf
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'meanings.tu.py'
            source.write_text(text, encoding='utf-8')
            namespace = namespace_for(self.corpus, source, 1000)
            compound = realize('alias', namespace)
            self.assertEqual(compound['tree']['compositeDefinition'], 'COMPOUND')
            self.assertTrue(self.meanings(compound))
            leaf = realize('leaf_alias', namespace)
            self.assertEqual(leaf['tree']['baseDefinition'], 'effective leaf')
            self.assertNotIn('compositeDefinition', leaf['tree'])

    def test_helpers_are_not_reexecuted_to_expand_source_provenance(self):
        text = '''def fixture_helper(value):
    return value.copy()
compound = fixture_helper(potar)
compound.definition = "helper whole"
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'meanings.tu.py'
            source.write_text(text, encoding='utf-8')
            namespace = namespace_for(self.corpus, source, 1000)
            def forbidden(value):
                raise AssertionError('Semantic expansion executed a helper')
            namespace['fixture_helper'] = forbidden
            result = realize('compound', namespace)
            context = result['definitionContext']
            self.assertEqual(result['evaluationStatus'], 'complete')
            self.assertEqual(context['root']['compositeDefinition'], 'helper whole')
            self.assertEqual(context['root']['children'], [])
            self.assertTrue(any('helper não expandida' in item for item in context['diagnostics']))

    def test_rebound_dependencies_are_not_presented_as_the_original_composition(self):
        text = '''stem = potar.copy()
compound = (stem * moro).var(1).base_nominal()
compound.definition = "original composition"
stem = só.copy()
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'meanings.tu.py'
            source.write_text(text, encoding='utf-8')
            namespace = namespace_for(self.corpus, source, 1000)
            result = realize('compound', namespace)
            context = result['definitionContext']
            self.assertEqual(result['surface'], 'moropotara')
            self.assertEqual(context['root']['children'], [])
            self.assertTrue(context['diagnostics'])

    def test_later_inner_meaning_change_does_not_rewrite_a_previous_copied_scope(self):
        text = '''inner = (potar * moro).var(1).base_nominal().copy()
inner.definition = "INNER_A"
outer = inner.copy()
outer.definition = "OUTER"
inner.definition = "INNER_B"
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'meanings.tu.py'
            source.write_text(text, encoding='utf-8')
            namespace = namespace_for(self.corpus, source, 1000)
            self.assertFalse(declaration_current('outer', namespace[REGISTRY]))
            result = realize('outer', namespace)
            context = result['definitionContext']
            self.assertEqual(result['surface'], 'moropotara')
            self.assertEqual(context['root']['compositeDefinition'], 'OUTER')
            self.assertEqual(context['root']['children'], [])
            self.assertTrue(any('dependências redefinidas' in message for message in context['diagnostics']))
            self.assertNotIn('INNER_B', json.dumps(context))

    def test_indirect_alias_mutation_does_not_assert_an_outdated_declared_meaning(self):
        text = '''inner = (potar * moro).var(1).base_nominal().copy()
inner.definition = "INNER_A"
alias = inner
alias.definition = "INNER_B"
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'meanings.tu.py'
            source.write_text(text, encoding='utf-8')
            namespace = namespace_for(self.corpus, source, 1000)
            result = realize('inner', namespace)
            context = result['definitionContext']
            self.assertEqual(result['tree']['definition'], 'INNER_B')
            self.assertNotIn('compositeDefinition', context['root'])
            self.assertEqual(context['root']['children'], [])
            self.assertTrue(any('diverge' in message for message in context['diagnostics']))

    def test_partial_results_and_expansion_limits_are_explicit(self):
        partial = realize('potar * __studio_slot_a10f', self.namespace)
        self.assertEqual(partial['evaluationStatus'], 'partial')
        self.assertEqual(next(node for node in nodes(partial['definitionContext']['root'])
                              if node['label'] == 'potar')['baseDefinition'], self.namespace['potar'].definition)
        tree = realize('(potar * moro).var(1).base_nominal()', self.namespace)['tree']
        limited = attach_definition_context(tree, self.namespace, max_nodes=3)
        self.assertTrue(limited['truncated'])
        self.assertTrue(limited['diagnostics'])
        self.assertLessEqual(len(list(nodes(limited['root']))), 3)
        register_declarations(self.namespace, ast.parse('cycle_a = cycle_b\ncycle_b = cycle_a').body, 'fixture.py')
        self.namespace.update(cycle_a=self.namespace['potar'].copy(), cycle_b=self.namespace['potar'].copy())
        cyclic = realize('cycle_a', self.namespace)['definitionContext']
        self.assertTrue(cyclic['truncated'])
        self.assertTrue(any('cíclica' in message for message in cyclic['diagnostics']))

    def test_translation_context_includes_the_same_scoped_hierarchy(self):
        adapter = ProjectAdapter()
        project = adapter.open_project(str(REAL))
        passage = next(row for row in project['passages'] if row['sourceId'] == 'araujo_catecismo_1686')
        raw = 'studio_define((potar * moro).var(1).base_nominal(), "significado do conjunto")'
        result = adapter.invoke('assistant_context', {
            'passageId': passage['id'], 'raw': raw, 'action': 'translate',
            'revisionId': 'semantic-context', 'engineFingerprint': project['engineFingerprint'],
        })
        context = result['evaluation']['definitionContext']
        self.assertEqual(context['root']['compositeDefinition'], 'significado do conjunto')
        self.assertIn('generic, people', json.dumps(context, ensure_ascii=False))
        self.assertEqual(result['evaluation']['expression'], raw)


if __name__ == '__main__':
    unittest.main()
