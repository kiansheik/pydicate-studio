"""Reviewed passage publication owns its shared declarations as one transaction.

Every write below targets a disposable corpus. The selected engine is read-only;
ground-truth records and unrelated corpus files must remain byte-identical.
"""
import ast
import difflib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from studio_authoring import source_entries


REAL = Path(os.environ.get(
    'PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3])
)).expanduser().resolve()
SOURCE = 'araujo_catecismo_1686'


def declarations(content):
    return {
        statement.targets[0].id: statement.value
        for statement in ast.parse(content.decode('utf-8')).body
        if isinstance(statement, ast.Assign)
        and len(statement.targets) == 1
        and isinstance(statement.targets[0], ast.Name)
    }


@unittest.skipUnless(
    (REAL / 'oldtupicorpus/historic' / f'{SOURCE}.tu.py').exists(),
    'selected corpus not installed',
)
class LexicalPublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.parent = Path(cls.temp.name).resolve()
        cls.corpus = cls.parent / 'oldtupicorpus'
        cls.corpus.mkdir()
        for folder in ('historic', 'authoring', 'ground_truth'):
            shutil.copytree(
                REAL / 'oldtupicorpus' / folder, cls.corpus / folder,
                ignore=shutil.ignore_patterns('__pycache__'),
            )
        (cls.parent / 'nhe-enga').symlink_to(REAL / 'nhe-enga', target_is_directory=True)
        # ProjectAdapter verifies real Git roots; this commit exists only inside
        # TemporaryDirectory and never touches the user's repositories.
        subprocess.run(['git', 'init', '--quiet', str(cls.corpus)], check=True)
        subprocess.run(['git', '-C', str(cls.corpus), 'add', '.'], check=True)
        subprocess.run([
            'git', '-C', str(cls.corpus), '-c', 'user.name=Studio Test',
            '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'disposable fixture',
        ], check=True)
        cls.source = cls.corpus / 'historic' / f'{SOURCE}.tu.py'
        cls.lexicon = cls.corpus / 'historic/lexicon.tu.py'
        cls.original_source = cls.source.read_bytes()
        cls.original_lexicon = cls.lexicon.read_bytes()
        cls.protected = {
            path: path.read_bytes()
            for folder in ('historic', 'authoring', 'ground_truth')
            for path in (cls.corpus / folder).rglob('*')
            if path.is_file() and path not in (cls.source, cls.lexicon)
        }

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.source.write_bytes(self.original_source)
        self.lexicon.write_bytes(self.original_lexicon)
        self.state = self.parent / ('state-' + self.id().rsplit('.', 1)[-1])
        self.adapter = ProjectAdapter(self.state)
        self.project = self.adapter.open_project(str(self.parent))

    def tearDown(self):
        for path, original in self.protected.items():
            self.assertEqual(path.read_bytes(), original, str(path.relative_to(self.corpus)))

    def preview(self, raw, **extra):
        return self.adapter.invoke('source_new_preview', {'sourceId': SOURCE, 'raw': raw, **extra})

    def apply(self, preview):
        self.project = self.adapter.invoke('source_apply', {
            'previewId': preview['previewId'],
            'sourceFingerprint': preview['sourceFingerprint'],
        })
        return next((passage for passage in self.project['passages']
                     if passage['id'] == preview.get('targetPassageId')), None)

    def new_declarations(self, before=None):
        old = declarations(self.original_lexicon if before is None else before)
        return {name: value for name, value in declarations(self.lexicon.read_bytes()).items()
                if name not in old}

    def assert_unchanged(self):
        self.assertEqual(self.source.read_bytes(), self.original_source)
        self.assertEqual(self.lexicon.read_bytes(), self.original_lexicon)

    def assert_only_insertions(self, before, after):
        # Declarations must precede __all__; they need not be an EOF append.
        changes = difflib.SequenceMatcher(
            None, before.splitlines(keepends=True), after.splitlines(keepends=True), autojunk=False,
        ).get_opcodes()
        self.assertTrue(all(kind in ('equal', 'insert') for kind, *_ in changes), changes)

    def assert_human_summary(self, summary):
        self.assertLessEqual(set(summary), {'kind', 'passageOrdinal', 'analysisChanged', 'fields'})
        for field in summary.get('fields', []):
            self.assertLessEqual(set(field), {'label', 'before', 'after'})
            self.assertTrue(field['label'])
        serialized = json.dumps(summary, ensure_ascii=False)
        for technical in (str(self.source), str(self.lexicon), 'Noun(', 'Verb(', 'studio:v1'):
            self.assertNotIn(technical, serialized)

    def test_new_preview_is_read_only_and_publishes_exact_dictionary_sense_to_shared_lexicon(self):
        context = {'passageId': self.project['passages'][0]['id']}
        found = self.adapter.invoke('dictionary_lookup', {**context, 'query': 'pysyrõ'})
        existing = self.adapter.invoke('lexicon_inspect', {**context, 'name': 'pysyro'})
        entry = next(item for item in found['results']
                     if item['match'] == 'exact' and item['definition'] != existing['definition'])
        converted = self.adapter.invoke('dictionary_predicate', {
            **context, 'entryIndex': entry['entryIndex'],
            'datasetFingerprint': entry['datasetFingerprint'],
        })
        self.assertEqual(converted['status'], 'ready')
        verb = ast.parse(converted['expression'], mode='eval').body
        self.assertIn('vid', {item.arg for item in verb.keywords})
        definition = "Sentido exato: uma ave 'citada' — com acento.\nNota preservada."
        noun_raw = f'Noun("publicaçãoprova", definition={definition!r})'
        raw = f'({noun_raw}) + ({converted["expression"]})'
        expected = self.adapter.invoke('evaluate_expression', {**context, 'raw': raw})
        before_entries = [item['expression'] for item in source_entries(self.source)]
        preview = self.preview(raw, metadata={
            'normalized': 'Uma leitura em tupi', 'translation': 'Uma tradução humana.',
            'printedPage': '43', 'notes': '',
        })
        self.assert_unchanged()
        summary = preview['reviewSummary']
        self.assert_human_summary(summary)
        self.assertEqual(summary['kind'], 'passage-new')
        self.assertTrue(summary['analysisChanged'])
        self.assertEqual(summary['passageOrdinal'], len(before_entries) + 1)
        fields = {item['label']: item for item in summary['fields']}
        self.assertEqual(fields['Leitura em tupi']['after'], 'Uma leitura em tupi')
        self.assertEqual(fields['Tradução']['after'], 'Uma tradução humana.')
        self.assertEqual(fields['Página impressa']['after'], '43')
        self.assertNotIn('Notas', fields)
        senses = {item['headword']: item['definition'] for item in preview['lexicalAdditions']}
        self.assertEqual(senses['publicaçãoprova'], definition)
        self.assertEqual(senses[entry['headword']], entry['definition'])
        self.assertEqual({item['path'] for item in preview['files']}, {str(self.source), str(self.lexicon)})
        self.assertIn(str(self.source), preview['diff'])
        self.assertIn(str(self.lexicon), preview['diff'])
        self.assertTrue(all(item['diff'] and item['sourceFingerprint'] for item in preview['files']))
        passage = self.apply(preview)
        expression = ast.parse(passage['sourceExpression'], mode='eval').body
        self.assertIsInstance(expression, ast.BinOp)
        self.assertIsInstance(expression.left, ast.Name)
        self.assertIsInstance(expression.right, ast.Name)
        added = self.new_declarations()
        self.assertEqual(set(added), {expression.left.id, expression.right.id})
        self.assertEqual(ast.dump(added[expression.left.id]), ast.dump(ast.parse(noun_raw, mode='eval').body))
        self.assertEqual(ast.dump(added[expression.right.id]), ast.dump(verb))
        actual = self.adapter.invoke('evaluate_expression', {
            'passageId': passage['id'], 'raw': passage['sourceExpression'],
        })
        self.assertEqual(actual['evaluationStatus'], expected['evaluationStatus'])
        self.assertEqual(actual['surface'], expected['surface'])
        self.assertEqual(actual['annotated'], expected['annotated'])
        self.assertEqual(
            [item['expression'] for item in source_entries(self.source)][:-1], before_entries,
        )
        self.assert_only_insertions(self.original_lexicon, self.lexicon.read_bytes())

    def test_edited_existing_passage_uses_shared_name_and_preserves_other_expressions(self):
        passage = self.project['passages'][0]
        before_entries = source_entries(self.source)
        preview = self.adapter.invoke('source_preview', {
            'passageId': passage['id'],
            'raw': 'Noun("publicaçãoprova", definition="sentido da passagem") + amen',
            'metadata': {'notes': 'Uma revisão humana.'},
        })
        self.assert_unchanged()
        current = self.apply(preview)
        expression = ast.parse(current['sourceExpression'], mode='eval').body
        self.assertIsInstance(expression.left, ast.Name)
        self.assertEqual(expression.right.id, 'amen')
        self.assertIn(expression.left.id, self.new_declarations())
        self.assertIn('Uma revisão humana.', current['notes'])
        self.assertEqual(
            [item['expression'] for item in source_entries(self.source)][1:],
            [item['expression'] for item in before_entries][1:],
        )

    def test_passage_summary_reports_real_metadata_changes_and_omits_unchanged_fields(self):
        passage = self.project['passages'][0]
        previous = {
            'normalized': 'Leitura preservada', 'translation': 'Tradução anterior',
            'notes': 'Nota a remover', 'printedPage': '40', 'line': '2',
        }
        seeded = self.adapter.invoke('source_preview', {'passageId': passage['id'], 'metadata': previous})
        current = self.apply(seeded)
        before = {path: path.read_bytes() for path in (self.source, self.lexicon)}
        preview = self.adapter.invoke('source_preview', {
            'passageId': current['id'],
            'metadata': {**previous, 'translation': 'Tradução revisada', 'notes': ''},
        })
        summary = preview['reviewSummary']
        self.assert_human_summary(summary)
        self.assertEqual(summary['kind'], 'passage-update')
        self.assertEqual(summary['passageOrdinal'], current['ordinal'])
        self.assertFalse(summary['analysisChanged'])
        self.assertEqual(summary['fields'], [
            {'label': 'Tradução', 'before': 'Tradução anterior', 'after': 'Tradução revisada'},
            {'label': 'Notas', 'before': 'Nota a remover', 'after': ''},
        ])
        unchanged = self.adapter.invoke('source_preview', {
            'passageId': current['id'], 'raw': current['sourceExpression'], 'metadata': previous,
        })
        self.assertEqual(unchanged['diff'], '')
        self.assertEqual(unchanged['reviewSummary'], {
            'kind': 'passage-update', 'passageOrdinal': current['ordinal'],
            'analysisChanged': False, 'fields': [],
        })
        self.assertEqual({path: path.read_bytes() for path in before}, before)

    def test_lexicon_summary_preserves_meanings_and_omits_empty_or_noop_fields(self):
        context = {'passageId': self.project['passages'][0]['id'], 'scope': 'shared'}
        definition = 'Significado integral, com acentos e uma explicação própria.'
        params = {**context, 'headword': 'significadoprova', 'definition': definition}
        preview = self.adapter.invoke('lexicon_create', params)
        summary = preview['reviewSummary']
        self.assert_human_summary(summary)
        self.assertEqual(summary['kind'], 'lexicon')
        self.assertEqual({item['label']: item['after'] for item in summary['fields']}, {
            'Palavra': 'significadoprova', 'Significado': definition,
            'Disponível em': 'Léxico compartilhado',
        })
        self.apply(preview)
        before = {path: path.read_bytes() for path in (self.source, self.lexicon)}
        revised = self.adapter.invoke('lexicon_update', {
            **context, 'name': preview['name'], 'definition': 'Outro significado explícito.',
        })
        self.assert_human_summary(revised['reviewSummary'])
        self.assertIn({'label': 'Significado', 'before': definition, 'after': 'Outro significado explícito.'}, revised['reviewSummary']['fields'])
        unchanged = self.adapter.invoke('lexicon_update', {
            **context, 'name': preview['name'], 'definition': definition,
        })
        self.assertEqual(unchanged['diff'], '')
        self.assertEqual(unchanged['reviewSummary']['fields'], [])
        reused = self.adapter.invoke('lexicon_create', params)
        self.assertEqual(reused['diff'], '')
        self.assertEqual(reused['reviewSummary']['fields'], [])
        empty = self.adapter.invoke('lexicon_create', {
            **context, 'headword': 'semsignificadoprova', 'definition': '',
        })
        self.assertNotIn('Significado', {item['label'] for item in empty['reviewSummary']['fields']})
        self.assertEqual({path: path.read_bytes() for path in before}, before)

    def test_identical_predicates_reuse_one_declaration_within_and_across_publications(self):
        raw = 'Noun("reutilizaçãoprova", definition="mesmo sentido")'
        first = self.apply(self.preview(f'({raw}) + ({raw})'))
        expression = ast.parse(first['sourceExpression'], mode='eval').body
        self.assertEqual(expression.left.id, expression.right.id)
        self.assertEqual(set(self.new_declarations()), {expression.left.id})
        lexicon_before = self.lexicon.read_bytes()
        second_preview = self.preview(raw)
        self.assertEqual(self.lexicon.read_bytes(), lexicon_before)
        second = self.apply(second_preview)
        self.assertEqual(ast.parse(second['sourceExpression'], mode='eval').body.id, expression.left.id)
        self.assertEqual(self.lexicon.read_bytes(), lexicon_before)

    def test_same_headword_with_different_definition_gets_distinct_stable_variables(self):
        first = self.apply(self.preview('Noun("colisãoprova", definition="primeiro sentido")'))
        first_name = ast.parse(first['sourceExpression'], mode='eval').body.id
        lexicon_before = self.lexicon.read_bytes()
        second_raw = 'Noun("colisãoprova", definition="segundo sentido")'
        second = self.apply(self.preview(second_raw))
        second_name = ast.parse(second['sourceExpression'], mode='eval').body.id
        self.assertNotEqual(first_name, second_name)
        self.assert_only_insertions(lexicon_before, self.lexicon.read_bytes())
        added = self.new_declarations()
        self.assertEqual(set(added), {first_name, second_name})
        meanings = {name: next(item.value.value for item in call.keywords if item.arg == 'definition')
                    for name, call in added.items()}
        self.assertEqual(meanings, {first_name: 'primeiro sentido', second_name: 'segundo sentido'})
        third = self.apply(self.preview(second_raw))
        self.assertEqual(ast.parse(third['sourceExpression'], mode='eval').body.id, second_name)

    def test_either_changed_reviewed_file_rejects_entire_apply_before_any_write(self):
        for changed in (self.source, self.lexicon):
            with self.subTest(path=changed.name):
                self.source.write_bytes(self.original_source)
                self.lexicon.write_bytes(self.original_lexicon)
                self.project = self.adapter.refresh_project()
                preview = self.preview('Noun("guardaprova", definition="sentido protegido")')
                changed.write_bytes(changed.read_bytes() + b'\n# external exact-byte edit\n')
                expected = {path: path.read_bytes() for path in (self.source, self.lexicon)}
                with self.assertRaises(AdapterError) as caught:
                    self.apply(preview)
                self.assertEqual(caught.exception.code, 'STALE_SOURCE')
                self.assertEqual({path: path.read_bytes() for path in expected}, expected)

    def test_second_replace_failure_rolls_back_the_lexicon_and_cleans_staged_files(self):
        preview = self.preview('Noun("falhaprova", definition="não publicar pela metade")')
        original_replace = os.replace
        writes = []

        def fail_source(temporary, target):
            target = Path(target)
            if target in (self.lexicon, self.source):
                writes.append(target)
                if target == self.source:
                    raise OSError('simulated second publication replace failure')
            return original_replace(temporary, target)

        with patch('authoring_service.os.replace', side_effect=fail_source):
            with self.assertRaises(OSError):
                self.apply(preview)
        self.assertEqual(writes[:2], [self.lexicon, self.source])
        self.assert_unchanged()
        self.assertEqual(list(self.source.parent.glob('.*.studio-*')), [])
        self.assertTrue((self.state / 'recovery' / (preview['previewId'] + '.json')).exists())

    def test_reviewed_recovery_reverts_both_files_and_itself_does_not_write_on_preview(self):
        preview = self.preview('Noun("recuperaçãoprova", definition="voltar aos bytes originais")')
        self.apply(preview)
        after = {path: path.read_bytes() for path in (self.source, self.lexicon)}
        listed = self.adapter.invoke('source_recovery_list', {})
        record = next(item for item in listed['items'] if item['id'] == preview['previewId'])
        self.assertTrue(record['recoverable'])
        recovery = self.adapter.invoke('source_recover', {'recoveryId': preview['previewId']})
        self.assert_human_summary(recovery['reviewSummary'])
        self.assertEqual(recovery['reviewSummary']['kind'], 'recovery')
        self.assertEqual({item['label'] for item in recovery['reviewSummary']['fields']}, {'Passagem', 'Léxico'})
        self.assertEqual({item['after'] for item in recovery['reviewSummary']['fields']}, {'Restaurar a versão anterior'})
        self.assertEqual({path: path.read_bytes() for path in after}, after)
        self.assertEqual({item['path'] for item in recovery['files']}, {str(self.source), str(self.lexicon)})
        self.apply(recovery)
        self.assert_unchanged()

    def test_partial_crash_state_can_recover_only_exact_reviewed_changes(self):
        preview = self.preview('Noun("interrupçãoprova", definition="recuperação de duas partes")')
        original_replace = os.replace
        applied_lexicon = False

        def fail_after_lexicon(temporary, target):
            nonlocal applied_lexicon
            target = Path(target)
            if target == self.source or (target == self.lexicon and applied_lexicon):
                raise OSError('simulated interruption including rollback')
            result = original_replace(temporary, target)
            if target == self.lexicon:
                applied_lexicon = True
            return result

        with patch('authoring_service.os.replace', side_effect=fail_after_lexicon):
            with self.assertRaises((OSError, AdapterError)):
                self.apply(preview)
        self.assertEqual(self.source.read_bytes(), self.original_source)
        self.assertNotEqual(self.lexicon.read_bytes(), self.original_lexicon)
        self.adapter = ProjectAdapter(self.state)
        self.project = self.adapter.open_project(str(self.parent))
        record = next(item for item in self.adapter.invoke('source_recovery_list', {})['items']
                      if item['id'] == preview['previewId'])
        self.assertTrue(record['recoverable'])
        recovery = self.adapter.invoke('source_recover', {'recoveryId': preview['previewId']})
        self.assertIn(str(self.lexicon), recovery['diff'])
        self.apply(recovery)
        self.assert_unchanged()

    def test_external_lexicon_edit_blocks_recovery_of_the_entire_reviewed_transaction(self):
        preview = self.preview('Noun("conflitorecuperaçãoprova", definition="manter edição externa")')
        self.apply(preview)
        self.lexicon.write_bytes(self.lexicon.read_bytes() + b'\n# later external definition work\n')
        after = {path: path.read_bytes() for path in (self.source, self.lexicon)}
        listed = self.adapter.invoke('source_recovery_list', {})
        self.assertFalse(next(item for item in listed['items'] if item['id'] == preview['previewId'])['recoverable'])
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('source_recover', {'recoveryId': preview['previewId']})
        self.assertEqual(caught.exception.code, 'STALE_SOURCE')
        self.assertEqual({path: path.read_bytes() for path in after}, after)

    def test_corrupt_recovery_member_does_not_hide_a_valid_record_or_modify_source(self):
        preview = self.preview('Noun("registroprova", definition="recuperação válida")')
        self.apply(preview)
        after = {path: path.read_bytes() for path in (self.source, self.lexicon)}
        directory = self.state / 'recovery'
        corrupt = json.loads((directory / (preview['previewId'] + '.json')).read_text())
        corrupt['files'][0]['before'] = None
        identifier = str(uuid.uuid4())
        (directory / (identifier + '.json')).write_text(json.dumps(corrupt), encoding='utf-8')

        listed = self.adapter.invoke('source_recovery_list', {})
        self.assertEqual([item['id'] for item in listed['items']], [preview['previewId']])
        self.assertTrue(listed['items'][0]['recoverable'])
        self.assertEqual(len(listed['diagnostics']), 1)
        self.assertIn(identifier + '.json', listed['diagnostics'][0])
        with self.assertRaises(AdapterError) as caught:
            self.adapter.invoke('source_recover', {'recoveryId': identifier})
        self.assertEqual(caught.exception.code, 'INVALID_RECOVERY')
        self.assertEqual({path: path.read_bytes() for path in after}, after)


if __name__ == '__main__':
    unittest.main()
