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
from studio_authoring import source_entries, parse_ast, authoritative_metadata


def snapshot(corpus):
    sources = {}
    for path in sorted((corpus/'historic').glob('*.tu.py')):
        if path.name == 'lexicon.tu.py': continue
        source = path.name.removesuffix('.tu.py')
        try: entries = source_entries(path)
        except Exception as error:
            sources[source] = {'error':type(error).__name__ + ': ' + str(error)}; continue
        rows = []
        from passage_references import read
        saved=read(corpus,source)
        references = {key: row['surface'] for key,row in saved.items()}
        metadata=authoritative_metadata(corpus,path)
        for ordinal, entry in enumerate(entries,1):
            raw = entry['expression']
            row = {'ordinal':ordinal,'code':ast.dump(parse_ast(raw)), 'id':(entry.get('studio') or {}).get('passageId'), 'reference':references.get(ordinal), 'locations':[{key:value for key,value in location.items() if value not in (None,'')} for location in (metadata.get(ordinal,{}).get('locations') or saved.get(ordinal,{}).get('locations') or [])]}
            try:
                namespace = namespace_for(corpus,path,entry['line']); syntax=parse_ast(raw)
                value = evaluation_snapshot(interpret(syntax,isolated_namespace(namespace,syntax)))
                row.update(surface=str(value.eval()),annotated=str(value.eval(annotated=True)))
            except Exception as error: row['error'] = type(error).__name__ + ': ' + str(error)
            rows.append(row)
        sources[source] = {'rows':rows}
    return sources


def compare(before, after, *, allow_removed=False, insertion=None):
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
            checked+=1
            prior=next((item for item in old['rows'] if item.get('id')==row.get('id')),None) if row.get('id') else None
            prior_index=index
            if insertion and insertion[0]==source:
                prior_index=None if index==insertion[1]-1 else index-1 if index>=insertion[1] else index
            if prior is None and prior_index is not None and prior_index<len(old['rows']):prior=old['rows'][prior_index]
            same=prior is not None and prior['code']==row['code']
            if row.get('error'):
                if not prior or prior.get('error')!=row['error']: failures.append(f'{source}:{index+1}: {row["error"]}')
                else: baseline+=1
            elif same and not prior.get('error') and any(prior.get(key)!=row.get(key) for key in ('surface','annotated')):
                failures.append(f'{source}:{index+1}: resultado de uma passagem não editada mudou.')
            if insertion and insertion[0]==source and same and prior.get('locations')!=row.get('locations'):
                failures.append(f'{source}:{index+1}: a inserção alteraria os localizadores de uma passagem existente.')
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


def check_publication(service, changes, *, recovery=False, insertion=None):
    before = service.child({'action':'publication_snapshot'},timeout=180)
    with tempfile.TemporaryDirectory(prefix='studio-publication-') as temporary:
        parent=Path(temporary); corpus=parent/'oldtupicorpus'; corpus.mkdir()
        for name in ('historic','authoring','ground_truth'):
            shutil.copytree(service.corpus/name,corpus/name,ignore=shutil.ignore_patterns('__pycache__'))
        (parent/'nhe-enga').symlink_to(service.adapter.parent/'nhe-enga',target_is_directory=True)
        for change in changes:
            relative=change['path'].resolve().relative_to(service.corpus.resolve())
            target=corpus/relative
            if not target.is_file() and not (relative.parts[:3]==('ground_truth','records','historic') and target.suffix in {'.json','.jsonl'}): raise ValueError('Arquivo fora do conjunto de publicação.')
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(change['after'])
        after=service.child({'action':'publication_snapshot','parent':str(parent)},timeout=180)
    result=compare(before,after,allow_removed=recovery,insertion=insertion)
    if not result['ok']:
        service.error('A regressão bloqueou a publicação. Nenhum arquivo foi alterado: '+'; '.join(result['failures'][:5]),'REGRESSION_FAILED')
    return result
