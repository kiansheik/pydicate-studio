"""Exact source insertion and stable identities, with reviewed reference relocation."""
import ast
import json
import re
from studio_authoring import source_entries, authoritative_metadata
from passage_references import read, changes


def insert(corpus, source, text, raw, directives, studio, passages, before_id):
    path=corpus/'historic'/f'{source}.tu.py'
    entries=source_entries(path)
    target=next((p for p in passages if p['id']==before_id and p['sourceId']==source),None)
    if before_id is not None and target is None: raise ValueError('O ponto de inserção mudou. Selecione novamente a passagem.')
    index=target['ordinal']-1 if target else len(entries)
    lines=text.splitlines(keepends=True)
    edits=[]
    for passage,entry in zip(sorted((p for p in passages if p['sourceId']==source),key=lambda p:p['ordinal']),entries):
        if not target:continue
        if (entry.get('studio') or {}).get('passageId')==passage['id']:continue
        line=min(entry['statementLine'],entry.get('openingLine',entry['statementLine']))
        offset=sum(map(len,lines[:line-1])); prefix=text[offset:entry['start']]
        if prefix.strip() and not prefix.lstrip().startswith(entry['collection']+' +='):
            raise ValueError('Separe os itens da lista em linhas distintas antes de inserir uma passagem.')
        indent=re.match(r'[ \t]*',lines[line-1]).group()
        metadata={**(entry.get('studio') or {}),'passageId':passage['id']}
        edits.append((offset,indent+'# @note studio:v1 '+json.dumps(metadata)+'\n'))
    if target:
        entry=entries[index]
        line=min(entry['statementLine'],entry.get('openingLine',entry['statementLine']))
        offset=sum(map(len,lines[:line-1]))
        while line>1 and (not lines[line-2].strip() or lines[line-2].lstrip().startswith('#')):
            line-=1;offset-=len(lines[line-1])
        statement=lines[entry['statementLine']-1]
        indent=re.match(r'[ \t]*',statement).group()
        collection_item=not statement.lstrip().startswith(entry['collection']+' +=')
        expression=('('+raw+'\n'+indent+')') if '\n' in raw else raw
        code=expression+',\n' if collection_item else entry['collection']+' += '+expression+'\n'
        # Reassert effective cumulative locations so a new locator never leaks
        # into the following passage. Empty hierarchy resets are unsupported.
        restore=[]
        witness=target.get('witness',{})
        for field,directive in [('printedPage','page'),('folio','folio'),('section','section'),('subsection','subsection')]:
            value=witness.get(field)
            if value:restore.append(indent+'# @'+directive+' '+str(value)+'\n')
        addition=''.join(indent+line for line in directives)+indent+'# @note studio:v1 '+json.dumps(studio)+'\n'+indent+code+'\n'+''.join(restore)
    else:
        tree=ast.parse(text)
        anchor=next((s for s in tree.body if isinstance(s,ast.Assign) and any(isinstance(t,ast.Name) and t.id==source for t in s.targets)),None)
        offset=sum(map(len,lines[:anchor.lineno-1])) if anchor else len(text)
        expression='('+raw+'\n)' if '\n' in raw else raw
        addition='\n'+''.join(directives)+'# @note studio:v1 '+json.dumps(studio)+'\nl += '+expression+'\n\n'
    # At a shared offset, existing identity comes after the new passage.
    edits.append((offset,addition))
    for offset,addition in sorted(edits,key=lambda pair:pair[0],reverse=True):text=text[:offset]+addition+text[offset:]
    ast.parse(text)
    if target is None:return text,[],index+1
    records=read(corpus,source); relocated={}
    by_ordinal={p['ordinal']:p for p in passages if p['sourceId']==source}
    for ordinal,record in records.items():
        passage=by_ordinal.get(ordinal)
        if not passage or record.get('studio_passage_id',passage['id'])!=passage['id']:
            raise ValueError('Referência sem passagem correspondente; concilie antes de inserir.')
        updated=ordinal+1 if ordinal>index else ordinal
        # Unshifted records remain byte-identical. Shifted reviews gain their
        # stable identity; only address fields change, never approved content.
        relocated[updated]=record if updated==ordinal else {**record,'ordinal':updated,
            'id':f'{source}:{updated:04d}','studio_passage_id':passage['id']}
    return text,changes(corpus,source,relocated),index+1
