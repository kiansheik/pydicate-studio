"""Independent review probes: current real corpus; never writes upstream projects."""
from __future__ import annotations
import ast
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from contextlib import redirect_stdout
sys.dont_write_bytecode = True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'python'))
from studio_authoring import source_entries, expression_tree, parse_ast
from authoring_runtime import configure, namespace_for, realize, shape, lexicon_result
PARENT=Path('/Users/kian/code');corpus=configure(PARENT)
source=corpus/'historic/araujo_catecismo_1686.tu.py';before=source.read_bytes();entries=source_entries(source)
with redirect_stdout(sys.stderr): direct=runpy.run_path(str(source))['l']
original_shapes=[shape(value) for value in direct]
rows=[];probes=[]
def walk(node):
    yield node
    for child in node['children']:yield from walk(child['node'])
for entry,value,expected_shape in zip(entries,direct,original_shapes):
    raw=entry['expression'];tree=expression_tree(raw)['root'];ns=namespace_for(corpus,source,entry['statementLine'])
    with redirect_stdout(sys.stderr):actual=realize(raw,ns)
    nodes=list(walk(tree));span_ok=all(raw.encode('utf-16-le')[n['start']*2:n['end']*2].decode('utf-16-le')==n['code'] for n in nodes)
    refs=[n for n in nodes if n['kind']=='reference']
    for n in refs:probes.append({'ordinal':entry['ordinal'],'raw':raw,'node':n,'replacement':n['code']+' + amen'})
    rows.append({'ordinal':entry['ordinal'],'line':entry['statementLine'],'sourceExpression':raw,'nodeCount':len(nodes),'allConcreteSpansExact':span_ok,'sourceByteRoundtrip':before==(before.decode()[:entry['start']]+raw+before.decode()[entry['end']:]).encode(),'directRuntimeSurface':str(value.eval()),'surfaceMatches':actual['surface']==str(value.eval()),'annotationMatches':actual['annotated']==str(value.eval(annotated=True)),'structureMatches':actual['structure']==expected_shape,'renderedRoleNodeCount':sum(bool(n.get('engineRoles')) for n in walk(actual['tree'])),'sourceReferenceCount':len(refs),'serializerScopeFailures':[]})
# Import the actual current renderer TypeScript serializer, not its Python analogue.
js="""import fs from 'node:fs'; import {transform} from 'esbuild';
const source=fs.readFileSync('src/domain/authoring.ts','utf8');
const result=await transform(source,{loader:'ts',format:'esm'});
const mod=await import('data:text/javascript;base64,'+Buffer.from(result.code).toString('base64'));
let data=''; for await(const chunk of process.stdin)data+=chunk;
process.stdout.write(JSON.stringify(JSON.parse(data).map(p=>mod.replaceNode(p.raw,p.node,p.replacement))));"""
result=subprocess.run(['node','--input-type=module','-e',js],input=json.dumps(probes),text=True,capture_output=True,check=True,cwd=ROOT)
for probe,emitted in zip(probes,json.loads(result.stdout)):
    raw=probe['raw'].encode('utf-16-le');n=probe['node'];expected=(raw[:n['start']*2]+('('+probe['replacement']+')').encode('utf-16-le')+raw[n['end']*2:]).decode('utf-16-le')
    try:same=ast.dump(parse_ast(emitted))==ast.dump(parse_ast(expected))
    except SyntaxError:same=False
    if not same:rows[probe['ordinal']-1]['serializerScopeFailures'].append({'nodeId':n['id'],'replacement':probe['replacement'],'emitted':emitted,'expected':expected})
ns=namespace_for(corpus,source,239)
lexicons={name:lexicon_result({'action':'lexicon_inspect','name':name},corpus,source,ns) for name in ('arobiar','credo','saguera','pyreramo','n','third_day','îekuakub','tupapotaba','marãtekó')}
contracts={name:{'keys':list(value),'templateSource':value.get('template'),'parameters':value.get('parameters'),'authoringRootKind':(value.get('authoring',{}).get('root') or {}).get('kind'),'expandedHasChildren':isinstance((value.get('expandedStructure') or {}).get('children'),list),'affectedUses':value['affectedUses'],'definition':value['definition'],'expression':value['expression']} for name,value in lexicons.items()}
assert source.read_bytes()==before
report={'sourceSha256':hashlib.sha256(before).hexdigest(),'discoveredCount':len(entries),'directModuleCount':len(direct),'totals':{key:sum(bool(r[key]) for r in rows) for key in ('allConcreteSpansExact','sourceByteRoundtrip','surfaceMatches','annotationMatches','structureMatches')},'referenceReplacementProbes':len(probes),'serializerScopeFailureCount':sum(len(r['serializerScopeFailures']) for r in rows),'serializerAffectedOrdinals':[r['ordinal'] for r in rows if r['serializerScopeFailures']],'lexicalInspection':contracts,'rows':rows}
(ROOT/'docs/reviews/round-1-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('rows','lexicalInspection')},ensure_ascii=False))
