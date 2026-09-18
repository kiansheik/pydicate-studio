"""Read-only corpus regression snapshots and checks against staged publication.

Each snapshot runs in a fresh engine process. Source changes are evaluated only
in a disposable copy; neither saved reference records nor originals are written.
"""
from __future__ import annotations
import ast
import json
from pathlib import Path
import shutil
import tempfile
from authoring_runtime import namespace_for, interpret, evaluation_snapshot
from rendered_structures import isolated_namespace
from studio_authoring import source_entries, parse_ast


def snapshot(corpus):
    sources = {}
    for path in sorted((corpus/'historic').glob('*.tu.py')):
        if path.name == 'lexicon.tu.py': continue
        source = path.name.removesuffix('.tu.py')
        try: entries = source_entries(path)
        except Exception as error:
            sources[source] = {'error':type(error).__name__ + ': ' + str(error)}; continue
        rows = []
        records = corpus/'ground_truth/records/historic'/f'{source}.jsonl'
        references = {row['ordinal']:row['surface'] for line in records.read_text().splitlines()
                      if line.strip() for row in [json.loads(line)]} if records.exists() else {}
        for ordinal, entry in enumerate(entries,1):
            raw = entry['expression']
            row = {'ordinal':ordinal,'code':ast.dump(parse_ast(raw)), 'reference':references.get(ordinal)}
            try:
                namespace = namespace_for(corpus,path,entry['line']); syntax=parse_ast(raw)
                value = evaluation_snapshot(interpret(syntax,isolated_namespace(namespace,syntax)))
                row.update(surface=str(value.eval()),annotated=str(value.eval(annotated=True)))
            except Exception as error: row['error'] = type(error).__name__ + ': ' + str(error)
            rows.append(row)
        sources[source] = {'rows':rows}
    return sources


def compare(before, after, *, allow_removed=False):
    failures=[]; checked=0; changed=0; baseline=0; references=0; pending=0
    for source, old in before.items():
        new=after.get(source,{})
        if old.get('error') or new.get('error'):
            if old.get('error') != new.get('error'): failures.append(f'{source}: {new.get("error", "fonte indisponível")}')
            else: baseline+=1
            continue
        rows=new.get('rows',[])
        if not allow_removed and len(rows)<len(old['rows']): failures.append(f'{source}: passagens removidas.')
        for index,row in enumerate(rows):
            checked+=1; prior=old['rows'][index] if index<len(old['rows']) else None
            same=prior is not None and prior['code']==row['code']
            if row.get('error'):
                if not prior or prior.get('error')!=row['error']: failures.append(f'{source}:{index+1}: {row["error"]}')
                else: baseline+=1
            elif same and not prior.get('error') and any(prior.get(key)!=row.get(key) for key in ('surface','annotated')):
                failures.append(f'{source}:{index+1}: resultado de uma passagem não editada mudou.')
            if not same: changed+=1
            expected=row.get('reference')
            if expected is not None:
                if row.get('surface')==expected: references+=1
                elif same and prior and prior.get('surface')==expected: failures.append(f'{source}:{index+1}: referência salva deixou de coincidir.')
                elif same: baseline+=1
                else: pending+=1
    for source in after.keys()-before.keys(): failures.append(f'{source}: fonte nova sem linha de base.')
    return {'ok':not failures,'checked':checked,'changed':changed,'references':references,
            'baselineIssues':baseline,'pendingReferences':pending,'failures':failures}


def check_publication(service, changes, *, recovery=False):
    before = service.child({'action':'publication_snapshot'},timeout=180)
    with tempfile.TemporaryDirectory(prefix='studio-publication-') as temporary:
        parent=Path(temporary); corpus=parent/'oldtupicorpus'; corpus.mkdir()
        for name in ('historic','authoring','ground_truth'):
            shutil.copytree(service.corpus/name,corpus/name,ignore=shutil.ignore_patterns('__pycache__'))
        (parent/'nhe-enga').symlink_to(service.adapter.parent/'nhe-enga',target_is_directory=True)
        for change in changes:
            relative=change['path'].resolve().relative_to(service.corpus.resolve())
            target=corpus/relative
            if not target.is_file(): raise ValueError('Arquivo fora do conjunto de publicação.')
            target.write_bytes(change['after'])
        after=service.child({'action':'publication_snapshot','parent':str(parent)},timeout=180)
    result=compare(before,after,allow_removed=recovery)
    if not result['ok']:
        service.error('A regressão bloqueou a publicação. Nenhum arquivo foi alterado: '+'; '.join(result['failures'][:5]),'REGRESSION_FAILED')
    return result
