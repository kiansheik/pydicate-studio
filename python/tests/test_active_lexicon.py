"""Lexical source provenance without generating text or invoking a provider."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from active_lexicon import inventory
from studio_authoring import expression_tree


class Predicate:
    category = 'noun'
    def __init__(self, name, definition=''):
        self.verbete = name
        self.definition = definition
    def eval(self):
        raise AssertionError('Inventory must not evaluate a predicate')
    def __mul__(self, other):
        return Predicate(self.verbete + other.verbete)


class ActiveLexiconTests(unittest.TestCase):
    def fixture(self, shared, local=''):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        corpus = Path(temp.name); (corpus / 'historic').mkdir()
        (corpus / 'historic/lexicon.tu.py').write_text(shared)
        source = corpus / 'historic/example.tu.py'; source.write_text(local)
        namespace = {'Predicate': Predicate}
        exec(shared, namespace); exec(local, namespace)
        return corpus, source, namespace

    def test_composite_aliases_repeated_occurrences_and_elements(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba', definition='aldeia')\nother = Predicate('xe')\nalias = base\ncompound = alias * other\n")
        result = inventory('compound * base * base', corpus, source, namespace)
        entries = {item['name']: item for item in result['entries'] if item.get('lexicalName')}
        self.assertEqual(set(entries), {'compound', 'alias', 'base', 'other'})
        self.assertNotEqual(entries['alias']['id'], entries['base']['id'])
        self.assertEqual(len(entries['base']['occurrenceIds']), 3)
        self.assertEqual(entries['base']['elements'][1], {'name': 'definition', 'code': "'aldeia'"})
        self.assertEqual(len({item['id'] for item in result['occurrences']}), len(result['occurrences']))
        expanded = next(item for item in result['occurrences'] if item['name'] == 'base' and item['via'])
        self.assertEqual(expanded['via'], ['compound', 'alias'])
        self.assertFalse(expanded['direct'])
        self.assertEqual(result['diagnostics'], [])
        changed = inventory('base * compound * base', corpus, source, namespace)
        self.assertTrue(set(entries['base']['occurrenceIds']).isdisjoint({item['id'] for item in changed['occurrences']}))

    def test_nested_helper_parameter_bindings_do_not_become_lexical_entries(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\ntwice = lambda x: x * x\nouter = lambda y: twice(y) * other\n")
        result = inventory('outer(base)', corpus, source, namespace)
        self.assertEqual({item['name'] for item in result['entries'] if item.get('lexicalName')}, {'outer', 'twice', 'base', 'other'})
        uses = [item for item in result['occurrences'] if item['name'] == 'base' and not item['direct']]
        self.assertEqual(len(uses), 2)
        self.assertEqual([item['sourceNodeId'] for item in uses], ['root/arg0', 'root/arg0'])
        self.assertEqual([item['binding']['parameter'] for item in uses], ['y', 'y'])
        self.assertEqual(result['diagnostics'], [])

    def test_conditional_helper_marks_candidates_and_local_shadowing(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\ndef choose(x, flag=True):\n    other = x\n    if flag:\n        return other\n    return base\n")
        result = inventory('choose(base)', corpus, source, namespace)
        self.assertNotIn('other', {item['name'] for item in result['entries']})
        self.assertTrue(any('candidatas' in value for value in result['diagnostics']))
        self.assertTrue(all(item['certainty'] == 'candidate' for item in result['occurrences'] if item['name'] == 'base' and not item['direct']))

    def test_source_shadow_identity_exact_line_context_and_invalid_raw(self):
        corpus, source, namespace = self.fixture("base = Predicate('original')\n", "base = Predicate('local')\n")
        local = inventory('base', corpus, source, namespace, source_line=2)
        before = inventory('base', corpus, source, namespace, source_line=1)
        self.assertNotEqual(local['entries'][0]['id'], before['entries'][0]['id'])
        self.assertEqual(local['entries'][0]['provenance']['sourcePath'], str(source))
        invalid = inventory('base * (', corpus, source, namespace)
        self.assertEqual(invalid['entries'], [])
        self.assertTrue(invalid['diagnostics'])
        json.dumps(local)

    def test_every_visible_source_step_has_an_occurrence_without_evaluating(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\n")
        raw = "(base * other).var(1) + Predicate('🦜', definition='ave')"
        result = inventory(raw, corpus, source, namespace)
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual([item['sourceNodeId'] for item in direct],
                         ['root', 'root/left', 'root/left/receiver', 'root/left/receiver/left', 'root/left/receiver/right', 'root/right'])
        self.assertTrue(direct[0]['isRoot'])
        self.assertEqual([item['depth'] for item in direct], [0, 1, 2, 3, 3, 1])
        for occurrence in direct:
            self.assertEqual(raw.encode('utf-16-le')[occurrence['start']*2:occurrence['end']*2].decode('utf-16-le'), occurrence['expression'])
            self.assertTrue(occurrence['editable'])
            self.assertEqual(occurrence['evaluation']['status'], 'unavailable')
        by_id = {item['id']: item for item in result['entries']}
        self.assertEqual(by_id[direct[0]['lexicalId']]['kind'], 'construction')
        self.assertEqual(by_id[direct[-1]['lexicalId']]['elements'],
                         [{'name': 'arg0', 'code': "'🦜'"}, {'name': 'kw:definition', 'code': "'ave'"}])

    def test_structural_notes_survive_format_sibling_edits_and_definition_wrappers(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\n")
        def direct(raw):return {item['sourceNodeId']: item for item in inventory(raw, corpus, source, namespace)['occurrences'] if item['direct']}
        initial = direct('(base * other) + base')
        formatted = direct(' ( base * other ) + base ')
        changed = direct('(base * other) + other')
        wrapped = direct('studio_define(base * other, "sentido local") + base')
        for after in (formatted, changed):
            for identifier in ('root/left', 'root/left/left', 'root/left/right'):
                self.assertEqual(initial[identifier]['noteOccurrenceId'], after[identifier]['noteOccurrenceId'])
                self.assertEqual(initial[identifier]['nodeFingerprint'], after[identifier]['nodeFingerprint'])
        self.assertEqual(initial['root/left']['noteOccurrenceId'], wrapped['root/left']['noteOccurrenceId'])
        self.assertEqual(initial['root/left/left']['noteOccurrenceId'], wrapped['root/left/arg0/left']['noteOccurrenceId'])
        self.assertNotIn('root/left/arg0', wrapped)
        self.assertEqual(wrapped['root/left']['nodeKind'], 'binary')
        self.assertEqual(wrapped['root/left/arg0/left']['parentSourceNodeId'], 'root/left')
        self.assertTrue(wrapped['root/left']['hasDefinitionOverride'])
        repeated = direct('(base * other) + (base * other)')
        self.assertEqual(repeated['root/left']['nodeFingerprint'], repeated['root/right']['nodeFingerprint'])
        self.assertNotEqual(repeated['root/left']['noteOccurrenceId'], repeated['root/right']['noteOccurrenceId'])
        self.assertNotEqual(initial['root']['noteOccurrenceId'], changed['root']['noteOccurrenceId'])

    def test_only_matching_realization_supplies_surfaces_and_scoped_meanings(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\n")
        raw = 'base * other'
        tree = expression_tree(raw)['root']
        tree.update(evaluation={'status':'ok', 'surface':'FORM'}, definition='inherited, not composite')
        tree['children'][0]['node'].update(baseDefinition='aldeia', evaluation={'status':'ok', 'surface':'taba'})
        evaluated = inventory(raw, corpus, source, namespace, evaluation={'tree':tree})
        root = evaluated['occurrences'][0]
        self.assertEqual(root['surface'],'FORM')
        self.assertNotIn('compositeDefinition',root)
        self.assertEqual(evaluated['occurrences'][1]['baseDefinition'],'aldeia')
        stale = inventory('other * base', corpus, source, namespace, evaluation={'tree':tree, 'runtimeTree':{'nodes':[{'id':'old-root','sourceNodeId':'root'}]}})
        self.assertTrue(any('outra árvore' in message for message in stale['diagnostics']))
        self.assertFalse(any('surface' in item for item in stale['occurrences']))
        self.assertFalse(any(item['runtimeNodeIds'] for item in stale['occurrences']))

    def test_expanded_dependencies_are_not_editable_source_nodes(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\ncompound = base * other\n")
        result = inventory('compound', corpus, source, namespace)
        expanded = [item for item in result['occurrences'] if not item['direct']]
        self.assertEqual({item['name'] for item in expanded}, {'base','other'})
        self.assertTrue(all(not item['editable'] and 'start' not in item for item in expanded))
        self.assertEqual(result['occurrences'][0]['sourceNodeId'],'root')
        base = next(item for item in result['entries'] if item['name']=='base')
        self.assertEqual(base['sharedDefinitionTarget'],{'name':'base','scope':'shared'})

    def test_wrapped_reference_keeps_one_visible_occurrence_and_reanchors_expanded_dependencies(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\ncompound = base * other\n")
        result = inventory('studio_define(value=compound, definition="local")', corpus, source, namespace)
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual([item['sourceNodeId'] for item in direct], ['root'])
        self.assertEqual(direct[0]['nodeKind'], 'reference')
        self.assertTrue(direct[0]['hasDefinitionOverride'])
        expanded = [item for item in result['occurrences'] if not item['direct']]
        self.assertEqual({item['name'] for item in expanded}, {'base','other'})
        self.assertTrue(all(item['sourceNodeId']=='root' and not item['editable'] for item in expanded))
        ids = {item['id'] for item in result['occurrences']}
        self.assertTrue(all(set(item['occurrenceIds']) <= ids for item in result['entries']))

    def test_unsupported_dependency_candidates_do_not_claim_visible_spans(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\n")
        result = inventory('[base for item in unknown]', corpus, source, namespace)
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual(len(direct),1)
        self.assertEqual(direct[0]['sourceNodeId'],'root')
        self.assertFalse(direct[0]['editable'])
        self.assertTrue(all(not item['editable'] for item in result['occurrences'] if not item['direct']))


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL/'oldtupicorpus/historic/lexicon.tu.py').is_file(),'selected corpus not installed')
class RealInventoryTests(unittest.TestCase):
    def runtime_inventory(self, raw):
        payload = {'parent': str(REAL), 'action':'active_lexicon', 'sourceId':'araujo_catecismo_1686', 'line':1, 'raw':raw}
        worker = Path(__file__).resolve().parents[1] / 'authoring_runtime.py'
        response = subprocess.run([sys.executable,'-I','-B',str(worker)],input=json.dumps(payload),capture_output=True,text=True,check=True)
        message = json.loads(response.stdout)
        self.assertNotIn('error',message)
        return message['result']

    def test_real_moropotara_tree_contains_every_step_and_nested_meaning(self):
        raw = 'studio_define(studio_define((potar * moro).var(1), "INNER").base_nominal(), "OUTER")'
        result = self.runtime_inventory(raw)
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual(direct[0]['surface'],'moropotara')
        self.assertEqual([item['compositeDefinition'] for item in direct if 'compositeDefinition' in item],['OUTER','INNER'])
        leaves = {item['expression']: item for item in direct if item['nodeKind']=='reference'}
        self.assertEqual(leaves['potar']['baseDefinition'],'to want, to desire, to wish for')
        self.assertEqual(leaves['moro']['baseDefinition'],'generic, people')
        self.assertEqual(direct[0]['nodeKind'], 'method')
        self.assertEqual(direct[0]['label'], 'Base nominal')
        self.assertNotIn('studio_define',{item.get('lexicalName') for item in result['entries']})
        self.assertEqual(len(direct),5)
        self.assertEqual(result['diagnostics'],[])

    def test_real_partial_tree_preserves_missing_piece_and_known_leaf(self):
        result = self.runtime_inventory('potar * __studio_slot_ab')
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual([item['nodeKind'] for item in direct],['binary','reference','hole'])
        self.assertEqual(direct[0]['evaluation']['status'],'blocked')
        self.assertEqual(direct[2]['evaluation']['status'],'missing')
        self.assertIn('surface',direct[1])
        self.assertEqual(direct[1]['baseDefinition'],'to want, to desire, to wish for')
        self.assertTrue(result['diagnostics'])

    def test_real_unknown_leaf_has_empty_meaning_and_hypothetical_status(self):
        raw = 'studio_define(Noun(value="ekat", definition="(t)", tag="[NOUN][LEXICAL_STATUS:HYPOTHETICAL]"), "")'
        result = self.runtime_inventory(raw)
        direct = [item for item in result['occurrences'] if item['direct']]
        self.assertEqual(direct[0]['surface'],'tekata')
        self.assertEqual(direct[0]['baseDefinition'],'')
        self.assertEqual(direct[0]['lexicalStatus'],'hypothetical')
        self.assertEqual([item['baseDefinition'] for item in direct if 'baseDefinition' in item],[''])

    def test_real_inline_override_preserves_original_meaning_beside_repeated_sibling(self):
        raw = 'studio_define(Noun("aba", definition="old"), "new") + Noun("aba", definition="old")'
        result = self.runtime_inventory(raw)
        direct = {item['sourceNodeId']: item for item in result['occurrences'] if item['direct']}
        overridden, unchanged = direct['root/left'], direct['root/right']
        self.assertEqual(overridden['lexicalId'], unchanged['lexicalId'])
        self.assertEqual(overridden['baseDefinition'],'new')
        self.assertEqual(overridden['inheritedDefinition'],'old')
        self.assertEqual(unchanged['baseDefinition'],'old')
        self.assertNotIn('inheritedDefinition',unchanged)
        general = next(item for item in result['entries'] if item['id']==overridden['lexicalId'])
        self.assertEqual(general['definition'],'')
        self.assertEqual(result['diagnostics'],[])

    def test_real_composite_override_inherits_only_explicit_whole_meaning(self):
        result = self.runtime_inventory('studio_define(studio_define(potar * moro, "old whole"), "new whole")')
        direct = {item['sourceNodeId']: item for item in result['occurrences'] if item['direct']}
        self.assertEqual(direct['root']['inheritedDefinition'],'old whole')
        self.assertEqual(direct['root']['compositeDefinition'],'new whole')
        self.assertNotIn('root/arg0',direct)
        self.assertNotIn('root/arg0/arg0',direct)
        self.assertEqual(len(direct),3)


if __name__ == '__main__': unittest.main()
