"""Runtime structure, identity and relation labels; no provider requests."""
import json
import os
import tempfile
import types
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from authoring_runtime import runtime_graph, configure, namespace_for, realize, interpret, shape, lexicon_result, approve_authoritatively
from studio_authoring import source_entries, parse_ast


class PredicateFixture:
    def __init__(self, word, category='noun'):
        self.verbete = word; self.category = category; self.definition = 'definição ' + word
        self.arguments = []; self.pre_adjuncts = []; self.principal = None; self._inflection = '3p'
        self.pro_drop = False
    def eval(self): raise AssertionError('Graph extraction must not re-evaluate constituents')
    def inflection(self): return self._inflection


class VerbFixture(PredicateFixture):
    def __init__(self, word):
        super().__init__(word, 'verb'); self.mood = 'indicativo'
    def subject(self): return self.arguments[0] if self.arguments else None
    def object(self): return self.arguments[1] if len(self.arguments) > 1 else None


class RuntimeGraphTests(unittest.TestCase):
    def test_annotated_internal_stem_is_plain_in_labels_and_preserved_in_evidence(self):
        stem = 'o[PRONOUN:MAIN_CLAUSE_SUBJECT:3p]emi[PATIENT_PREFIX]tym[ROOT]bûer[PRETERITE_SUFFIX]ypy'
        root = PredicateFixture(stem, 'classifier_noun')
        root.tag = '[CLASSIFIER:PAST]'
        before = vars(root).copy()
        node = runtime_graph(root)['nodes'][0]
        self.assertEqual(node['label'], 'oemitymbûerypy')
        self.assertEqual(node['attributes']['verbete'], stem)
        self.assertEqual(node['tag'], '[CLASSIFIER:PAST]')
        self.assertEqual(node['definition'], root.definition)
        self.assertEqual(vars(root), before)

    def test_actual_identity_roles_cycles_and_shared_objects(self):
        root = VerbFixture('raiz'); subject = PredicateFixture('xe', 'pronoun')
        obj = PredicateFixture('taba'); subordinate = VerbFixture('subordinada')
        root.arguments = [subject, obj]; root.pre_adjuncts = [subordinate]
        subordinate.principal = root; subordinate.arguments = [subject]
        graph = runtime_graph(root)
        self.assertEqual(len(graph['nodes']), 4)
        self.assertEqual(len(graph['edges']), 5)
        roles = [(edge['label'], edge['evidence']) for edge in graph['edges'] if edge['field'] == 'arguments']
        self.assertEqual(roles, [('sujeito', 'VerbFixture.subject()'), ('objeto', 'VerbFixture.object()'), ('sujeito', 'VerbFixture.subject()')])
        principal = next(edge for edge in graph['edges'] if edge['field'] == 'principal')
        self.assertEqual(principal['target'], graph['rootId']); self.assertEqual(principal['kind'], 'reference')
        self.assertEqual([node['sourceNodeId'] for node in graph['nodes'] if 'sourceNodeId' in node], ['root'])
        json.dumps(graph)

    def test_noun_argument_is_not_guessed_to_be_a_subject(self):
        root = PredicateFixture('tuba'); root.arguments = [PredicateFixture('xe')]
        graph = runtime_graph(root)
        self.assertEqual(graph['edges'][0]['label'], 'argumento 1')
        self.assertNotIn('engineRoles', graph['nodes'][0])

    def test_embedded_morphology_and_explicit_truncation(self):
        root = PredicateFixture('taba')
        root.noun = type('Morphology', (), {})(); root.noun.pluriforme = True
        root.noun.marcador = 'r'; root.noun.internal_cache = object()
        root.arguments = [PredicateFixture(str(i)) for i in range(8)]
        graph = runtime_graph(root, limit=3)
        self.assertEqual(graph['nodes'][0]['morphology'], {'noun.pluriforme': True, 'noun.marcador': 'r'})
        self.assertEqual(len(graph['nodes']), 3)
        self.assertEqual(len(graph['diagnostics']), 1)

    def test_morphology_property_is_not_executed_by_inspection(self):
        class StoredOnly(PredicateFixture):
            @property
            def noun(self): raise AssertionError('noun property executes a new realization')
        graph = runtime_graph(StoredOnly('taba'))
        self.assertEqual(graph['nodes'][0]['morphology'], {})


class ApprovalSinkTests(unittest.TestCase):
    def test_final_sink_rejects_a_different_upstream_render_before_any_reference_or_recovery_write(self):
        import hashlib
        with tempfile.TemporaryDirectory(prefix='studio-approval-invariant-') as temp:
            corpus=Path(temp)/'corpus';source=corpus/'historic/fixture.tu.py'
            source.parent.mkdir(parents=True);source.write_text('fixture\n')
            target=corpus/'ground_truth/records/historic/fixture.jsonl'
            state=Path(temp)/'state'
            service=types.SimpleNamespace(normalize_surface=lambda value:value.strip().removesuffix('.'))
            module=types.ModuleType('authoring');module.service=service
            class Record:
                surface='different'
                def to_dict(self):return {'surface':self.surface,'ordinal':1,'status':'approved'}
            def commit(source_id,ordinal):
                service.write_records(target,[Record()])
                return {'committed_surface':Record.surface}
            service.commit_ground_truth=commit
            payload={'sourceId':'fixture','ordinal':1,'sourceFileFingerprint':'sha256:'+hashlib.sha256(source.read_bytes()).hexdigest(),'reviewedSurface':'reviewed.','engineFingerprint':'fixture','stateDir':str(state)}
            with patch.dict(sys.modules,{'authoring':module}):
                with self.assertRaisesRegex(ValueError,'superfície mudou'):
                    approve_authoritatively(payload,corpus)
                self.assertFalse(target.exists())
                self.assertFalse((state/'recovery').exists())
                Record.surface='reviewed'
                approve_authoritatively(payload,corpus)
            self.assertEqual(json.loads(target.read_text())['surface'],'reviewed')
            self.assertEqual(len(list((state/'recovery').glob('*.json'))),1)


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
@unittest.skipUnless((REAL/'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(), 'selected local corpus not installed')
class RuntimeProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = configure(REAL)
        cls.path = cls.corpus/'historic/araujo_catecismo_1686.tu.py'
        cls.entries = source_entries(cls.path)
        cls.original = cls.path.read_bytes()

    @classmethod
    def tearDownClass(cls):
        assert cls.path.read_bytes() == cls.original, 'Read-only source check'

    def test_every_araujo_expression_preserves_realization_annotations_and_grammar_shape(self):
        for entry in self.entries:
            with self.subTest(ordinal=entry['ordinal']):
                namespace = namespace_for(self.corpus, self.path, entry['statementLine'])
                original = interpret(parse_ast(entry['expression']), namespace)
                original_structure = shape(original)
                result = realize(entry['expression'], namespace)
                self.assertEqual(result['structure'], original_structure)
                self.assertEqual(result['surface'], str(original.eval()))
                self.assertEqual(result['annotated'], str(original.eval(annotated=True)))
                self.assertNotIn('_studio_', json.dumps(result['structure']))
                graph = result['runtimeTree']
                self.assertEqual(len({node['id'] for node in graph['nodes']}), len(graph['nodes']))
                raw16 = entry['expression'].encode('utf-16-le')
                for node in graph['nodes']:
                    for occurrence in node.get('sourceOccurrences', []):
                        self.assertEqual(raw16[occurrence['start']*2:occurrence['end']*2].decode('utf-16-le'), occurrence['code'])

    def test_first_line_distinguishes_realization_copies_and_three_source_occurrences_of_ore(self):
        entry = self.entries[0]
        result = realize(entry['expression'], namespace_for(self.corpus, self.path, entry['statementLine']))
        graph = result['runtimeTree']
        internal = [edge for edge in graph['edges'] if edge['kind'] == 'internal']
        self.assertEqual(len(internal), 2)
        self.assertTrue(all(edge['field'] == 'arg0' for edge in internal))
        occurrences = {scope['sourceNodeId'] for node in graph['nodes'] for scope in node.get('sourceOccurrences', []) if scope['code'] == 'oré'}
        self.assertEqual(len(occurrences), 3)
        self.assertEqual(sum(node['label'] == 'saba' for node in graph['nodes']), 2)

    def test_composite_internal_nodes_do_not_invent_editable_source_occurrences(self):
        entry = self.entries[59]
        graph = realize(entry['expression'], namespace_for(self.corpus, self.path, entry['statementLine']))['runtimeTree']
        self.assertTrue(any(not node.get('sourceOccurrences') for node in graph['nodes']))
        self.assertTrue(any(node.get('lexicalOrigins') for node in graph['nodes']))

    def test_occurrence_expansion_requires_actual_namespace_shape_equivalence(self):
        entry = self.entries[59]
        namespace = namespace_for(self.corpus, self.path, entry['statementLine'])
        info = lexicon_result({'action':'lexicon_inspect','name':'risetoheaven'}, self.corpus, self.path, namespace)
        self.assertTrue(info['safeOccurrenceExpansion'])
        self.assertGreater(len(info['runtimeTree']['nodes']), 1)
        self.assertTrue(any(use['sourceId'] == 'araujo_catecismo_1686' for use in info['projectUses']['uses']))
        original = realize(entry['expression'], namespace)
        expanded = realize(entry['expression'].replace('risetoheaven', '(' + info['safeOccurrenceExpansion'] + ')'), namespace)
        self.assertEqual(original['surface'], expanded['surface'])
        self.assertEqual(original['annotated'], expanded['annotated'])
        self.assertEqual(original['structure'], expanded['structure'])
        namespace['risetoheaven'] = namespace['risetoheaven'].copy()
        namespace['risetoheaven'].definition = 'context changed after declaration'
        changed = lexicon_result({'action':'lexicon_inspect','name':'risetoheaven'}, self.corpus, self.path, namespace)
        self.assertIn('context changed after declaration', changed['safeOccurrenceExpansion'])
        self.assertEqual(shape(interpret(parse_ast(changed['safeOccurrenceExpansion']), namespace)), shape(namespace['risetoheaven']))
        namespace['risetoheaven'].negated = not namespace['risetoheaven'].negated
        self.assertIsNone(lexicon_result({'action':'lexicon_inspect','name':'risetoheaven'}, self.corpus, self.path, namespace)['safeOccurrenceExpansion'])


if __name__ == '__main__': unittest.main()
