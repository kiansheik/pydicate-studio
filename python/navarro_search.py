"""Read-only sense-preserving search of the engine's actual Navarro resource.

NavarroDB.search_word supplies exact-headword semantics. Its flattened public
objects omit vid, so the same authoritative SQLite rows supply durable sense
identities and Portuguese/full-definition search. Search folding is never identity.
"""
from __future__ import annotations
import hashlib
import gzip
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
from contextlib import closing

_CACHE = {}
_SITE_CACHE = {}


def dictionary_constructor_hints(definition):
    """Only leading grammatical labels are evidence, never examples in the body.

    In particular `(s)` is a pluriform marker, while `(s.)` is a noun label.
    Ambiguous/missing labels remain a contributor choice.
    """
    match=re.match(r'^\s*((?:\([^)]*\)\s*)+)',definition)
    header=match.group(0) if match else ''
    patterns=[(r'\bv\s*\.', 'Verb'),(r'\bs\s*\.', 'Noun'),
              (r'\bposp\s*\.', 'Postposition'),(r'\badv\s*\.', 'Adverb'),
              (r'\bconj\s*\.', 'Conjunction'),(r'\binterj\s*\.', 'Interjection'),
              (r'\bnum\s*\.', 'Number'),(r'\bpart\s*\.', 'Particle'),
              (r'\bdem\s*\.', 'Demonstrative'),(r'\bpron\s*\.', 'Pronoun')]
    choices=[name for pattern,name in patterns if re.search(pattern,header,re.I)]
    if 'Demonstrative' in choices and 'Pronoun' in choices:
        choices.remove('Pronoun')
    if re.search(r'\badj\s*\.',header,re.I) and 'Demonstrative' not in choices:
        choices=list(dict.fromkeys([*choices,'Noun','Verb']))
    return choices,re.findall(r'\([^)]*\)',header)


def size_suffix_hint(headword, definition):
    """Recognize only Navarro's size senses, never another homographic suffix."""
    if headword in {'-ûasu', '-gûasu'} and ('aumentativo' in definition or 'v. -ûasu' in definition):
        return 'SizeSuffix'
    if headword == '-usu' and 'aumentativo' in definition:
        return 'SizeSuffix'
    if headword in {"-'ĩ", '-ĩ'} and ('diminutivo' in definition or "-\'ĩ2" in definition):
        return 'SizeSuffix'
    if headword == 'mirĩ' and '(adj.)' in definition[:500]:
        return 'SizeSuffix'
    return None


def _site_data(engine_path):
    """Read the very gzip served by the embedded site; SQLite IDs differ."""
    dataset=Path(engine_path).resolve()/'docs/dict-conjugated.json.gz'
    if not dataset.is_file():
        raise ValueError('O dicionário local docs/dict-conjugated.json.gz não está disponível.')
    data=dataset.read_bytes()
    fingerprint='sha256:'+hashlib.sha256(data).hexdigest()
    key=(str(dataset),fingerprint)
    if key not in _SITE_CACHE:
        from rendered_structures import normalize
        rows=json.loads(gzip.decompress(data))
        if not isinstance(rows,list):raise ValueError('O dicionário local não contém uma lista de verbetes.')
        index=[]
        for offset,row in enumerate(rows):
            if not isinstance(row,dict) or not isinstance(row.get('f'),str) or not isinstance(row.get('d'),str):
                continue
            if row.get('t') not in (1,True):continue
            descriptor=_site_descriptor(row,offset,fingerprint)
            index.append((normalize(row['f']),normalize(row['f'],True),normalize(row['d']),normalize(row['d'],True),descriptor))
        _SITE_CACHE.clear();_SITE_CACHE[key]=(rows,index)
    return fingerprint,_SITE_CACHE[key]


def _site_descriptor(row,offset,fingerprint):
    choices,information=dictionary_constructor_hints(row['d'])
    size_hint=size_suffix_hint(row['f'],row['d'])
    if size_hint: choices=[*dict.fromkeys([*choices, size_hint])] if row['f']=='mirĩ' else [size_hint]
    return {'entryIndex':offset,'datasetFingerprint':fingerprint,'headword':row['f'],
            'optionalNumber':str(row.get('o') or ''),'definition':row['d'],
            'grammaticalInformation':information,
            **({'dictionaryVid':row['i']} if type(row.get('i')) is int else {}),
            **({'suggestedConstructor':choices[0]} if len(choices)==1 else {})}


def dictionary_lookup(engine_path,params):
    from rendered_structures import normalize
    query=params.get('query','');limit=params.get('limit',20)
    if not isinstance(query,str) or not 1<=len(query.strip())<=200:
        raise ValueError('Digite uma palavra tupi ou uma definição em português (até 200 caracteres).')
    if type(limit) is not int or not 1<=limit<=40:raise ValueError('Limite inválido (1 a 40).')
    fingerprint,(_,index)=_site_data(engine_path)
    key=normalize(query);relaxed=normalize(query,True);ranked=[]
    labels=['exact','prefix','contains','definition','relaxed']
    for word,word_relaxed,definition,definition_relaxed,entry in index:
        score=(0 if word==key else 1 if word.startswith(key) else 2 if key in word else
               3 if key in definition else 4 if relaxed in word_relaxed or relaxed in definition_relaxed else None)
        if score is not None:ranked.append((score,word,entry['entryIndex'],entry))
    ranked.sort(key=lambda row:row[:3])
    return {'query':query,'results':[{**entry,'match':labels[score]} for score,_,_,entry in ranked[:limit]],
            'total':len(ranked),'datasetFingerprint':fingerprint}


def dictionary_entry(engine_path,params):
    offset=params.get('entryIndex');expected=params.get('datasetFingerprint')
    if type(offset) is not int or offset<0:raise ValueError('Identidade de verbete inválida.')
    if not isinstance(expected,str) or not re.fullmatch(r'sha256:[a-f0-9]{64}',expected):
        raise ValueError('A seleção precisa identificar a versão exata do dicionário.')
    fingerprint,(rows,_)=_site_data(engine_path)
    if expected!=fingerprint:raise ValueError('O dicionário mudou. Atualize a busca e escolha o verbete novamente.')
    if offset>=len(rows):raise ValueError('Verbete não encontrado no dicionário selecionado.')
    row=rows[offset]
    if not isinstance(row,dict) or not isinstance(row.get('f'),str) or not isinstance(row.get('d'),str):
        raise ValueError('O verbete selecionado não contém forma e definição válidas.')
    return _site_descriptor(row,offset,fingerprint),row

def fold(value):
    value = unicodedata.normalize('NFD', value.casefold()).replace('’', "'").replace('ʼ', "'")
    return ''.join(c for c in value if unicodedata.category(c) != 'Mn')

def _category(definition):
    for pattern, category in [(r'\(v[ .]', 'Verb'), (r'\(s[ .)]', 'Noun'), (r'\(posp[ .]', 'Postposition'), (r'\(adv[ .]', 'Adverb'), (r'\(conj[ .]', 'Conjunction'), (r'\(interj[ .]', 'Interjection')]:
        if re.search(pattern, definition, re.I): return category
    return None

def search_dictionary(engine_path, params):
    query = params.get('query', '')
    limit = params.get('limit', 30)
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200:
        raise ValueError('Digite uma palavra tupi ou uma definição em português (até 200 caracteres).')
    if type(limit) is not int or not 1 <= limit <= 100: raise ValueError('Limite inválido.')
    engine = Path(engine_path).resolve()
    module_path = engine/'pydicate/pydicate/dbexplorer.py'
    database = module_path.with_name('tupi_only.db')
    if not database.is_file(): raise ValueError('O banco Navarro tupi_only.db não está disponível no motor selecionado.')
    signature = (str(database), database.stat().st_mtime_ns, database.stat().st_size)
    if signature not in _CACHE:
        with closing(sqlite3.connect(database.as_uri()+'?mode=ro', uri=True)) as connection:
            rows = connection.execute('SELECT vid, first_word, definition, gloss_language, gloss FROM tupi_only ORDER BY vid,id').fetchall()
        senses = {}
        for vid, word, definition, language, gloss in rows:
            if not isinstance(word,str) or not isinstance(definition,str): continue
            key = (vid, word, definition)
            if key not in senses:
                identity = hashlib.sha256((word+'\0'+definition).encode()).hexdigest()[:16]
                senses[key] = {'id':f'navarro:{vid}:{identity}','vid':vid,'headword':word,'definition':definition,'suggestedCategory':_category(definition), 'grammaticalInformation': re.findall(r'\([^)]{1,45}\)', definition)[:5], 'glosses':{},'source':'navarro','citation':f'Navarro · verbete {vid} · nhe-enga/pydicate/pydicate/tupi_only.db'}
            target = senses[key]['glosses'].setdefault(str(language).strip(), [])
            if gloss and gloss not in target: target.append(gloss)
        index = []
        for sense in senses.values():
            index.append((fold(sense['headword']), fold(sense['definition']+' '+ ' '.join(sense['glosses'].get('pt',[]))),sense))
        _CACHE.clear(); _CACHE[signature] = index
    needle = fold(query.strip())
    # y/i and historical apostrophe spelling are offered as lower-ranked candidates,
    # never collapsed lexical identities or silently substituted authored text.
    variants = {needle, needle.replace('y','i'),needle.replace('i','y'),needle.replace("'",'')}
    ranked=[]
    for word, definition, sense in _CACHE[signature]:
        score = 0 if word==needle else 1 if word.startswith(needle) else 2 if needle in word else 3 if needle in definition else 4 if any(v==word or v==word.replace("'",'') for v in variants) else None
        if score is not None: ranked.append((score,sense['headword'],sense))
    ranked.sort(key=lambda row:(row[0],row[1],row[2]['id']))
    # Exercise the exact published API while retaining vid/citation from the rows.
    exact_count = None
    if module_path.is_file():
        spec=importlib.util.spec_from_file_location('studio_navarro_api',module_path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        exact_count=len(module.NavarroDB(str(database)).search_word(query.strip()))
    return {'query':query,'results':[dict(sense,match=['headword-exact','headword-prefix','headword-partial','definition','orthographic-candidate'][score]) for score,_,sense in ranked[:limit]], 'total':len(ranked),'exactApiMatches':exact_count,'source':'NavarroDB/tupi_only.db','databaseFingerprint':f'{signature[1]}:{signature[2]}'}
