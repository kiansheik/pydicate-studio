"""Read-only complete Araújo source / visual span / actual engine comparison audit."""
from __future__ import annotations
import argparse
import ast
from contextlib import redirect_stdout
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import time
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from adapter import CORPUS_ROOTS, ENGINE_ROOTS, repository_snapshot
from studio_authoring import source_entries, expression_tree, parse_ast, replace_node, authoritative_metadata, OPERATORS
from authoring_runtime import configure, namespace_for, realize, shape, lexical_entries


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--parent',type=Path,default=Path(os.environ.get('PYDICATE_PROJECT_PARENT',Path(__file__).resolve().parents[2])));parser.add_argument('--output',type=Path,default=Path('docs/coverage'));args=parser.parse_args()
    corpus=configure(args.parent);path=corpus/'historic/araujo_catecismo_1686.tu.py';before=path.read_bytes();entries=source_entries(path)
    ui_path=Path(__file__).resolve().parents[1]/'docs/reviews/round-3-all-expression-ui.json'
    try: ui_report=json.loads(ui_path.read_text())
    except (OSError,ValueError): ui_report={}
    ui_rows={row['ordinal']:row for row in ui_report.get('rows',[])} if ui_report.get('sourceSha256')==hashlib.sha256(before).hexdigest() else {}
    snapshots=[repository_snapshot(corpus,CORPUS_ROOTS),repository_snapshot(args.parent/'nhe-enga',ENGINE_ROOTS)]
    repo_signatures=lambda values:{v['name']:(v['revision'],v['fingerprint']) for v in values}
    proof_files=['src/components/AuthoringEditor.tsx', 'src/domain/authoring.ts', 'src/useStudio.ts', 'src/styles.css', 'python/adapter.py', 'python/authoring_runtime.py', 'python/authoring_service.py', 'python/studio_authoring.py', 'python/worker.py', 'python/navarro_search.py', 'electron/main.cjs', 'electron/next-service.cjs', 'electron/python-worker.cjs', 'electron/preload.cjs', 'electron/validation.cjs', 'src/App.tsx']
    proof_hashes={**ui_report.get('authoringUiSha256',{}),**ui_report.get('integrationSha256',{})}
    studio_root=Path(__file__).resolve().parents[1]
    proof_current=all(proof_hashes.get(name)==hashlib.sha256((studio_root/name).read_bytes()).hexdigest() for name in proof_files)
    if repo_signatures(ui_report.get('repositories',[]))!=repo_signatures(snapshots) or not proof_current:ui_rows={}
    metadata=authoritative_metadata(corpus,path)
    with redirect_stdout(sys.stderr): original=runpy.run_path(str(path))['l']
    if len(original)!=len(entries):raise RuntimeError('Source/runtime cardinality mismatch')
    original_shapes=[shape(value) for value in original]
    lexicon_text=(corpus/'historic/lexicon.tu.py').read_text();decls={}
    for statement in ast.parse(lexicon_text).body:
        if isinstance(statement,ast.Assign):
            for target in statement.targets:
                if isinstance(target,ast.Name):decls[target.id]=(statement.value,statement.lineno,'historic/lexicon.tu.py',lexicon_text)
    for engine_path in sorted((args.parent/'nhe-enga/pydicate/pydicate/lang/tupilang').rglob('*.py')):
        engine_text=engine_path.read_text(encoding='utf-8')
        for statement in ast.parse(engine_text).body:
            if isinstance(statement,ast.Assign):
                for target in statement.targets:
                    if isinstance(target,ast.Name):decls.setdefault(target.id,(statement.value,statement.lineno,str(engine_path.relative_to(args.parent/'nhe-enga')),engine_text))
            elif isinstance(statement,ast.FunctionDef):decls.setdefault(statement.name,(statement,statement.lineno,str(engine_path.relative_to(args.parent/'nhe-enga')),engine_text))
    source_tree=ast.parse(before.decode());rows=[]
    def dependencies(names):
        result={};pending=list(names)
        while pending:
            name=pending.pop()
            if name in result or name not in decls:continue
            node,line,source_path,source_text=decls[name];text=ast.get_source_segment(source_text,node)
            result[name]={'line':line,'expression':text,'source':source_path}
            bound={n.arg for n in ast.walk(node) if isinstance(n,ast.arg)}|{n.id for n in ast.walk(node) if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store)}
            pending.extend(n.id for n in ast.walk(node) if isinstance(n,ast.Name) and n.id!=name and n.id not in bound)
        return result
    for entry,original_value,original_structure in zip(entries,original,original_shapes):
        ordinal=entry['ordinal'];raw=entry['expression'];parsed=expression_tree(raw);tree=parse_ast(raw)
        names=sorted({n.id for n in ast.walk(tree) if isinstance(n,ast.Name)})
        methods=sorted({n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)})
        helpers=sorted({n.func.id for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)})
        operators=sorted({OPERATORS[type(n.op)] for n in ast.walk(tree) if isinstance(n,(ast.BinOp,ast.UnaryOp)) and type(n.op) in OPERATORS}|{OPERATORS[type(op)] for n in ast.walk(tree) if isinstance(n,ast.Compare) for op in n.ops if type(op) in OPERATORS})
        contexts=[{'line':s.lineno,'source':ast.get_source_segment(before.decode(),s)} for s in source_tree.body if s.lineno<entry['statementLine'] and isinstance(s,ast.Assign) and any(isinstance(t,ast.Attribute) for t in s.targets)]
        row={'id':f'araujo_catecismo_1686:{ordinal:04d}','ordinal':ordinal,'source':'historic/araujo_catecismo_1686.tu.py','line':entry['statementLine'],'endLine':entry['endLine'],'startByte':len(before.decode()[:entry['start']].encode()),'endByte':len(before.decode()[:entry['end']].encode()),'expression':raw,'expressionSha256':hashlib.sha256(raw.encode()).hexdigest(),'metadata':metadata.get(ordinal),'contextualMutations':contexts,'dependencyContext':dependencies(names),'imports':['from historic.lexicon import load_lexicon','globals().update(load_lexicon())'],'constructs':sorted({type(n).__name__ for n in ast.walk(tree)}),'operators':operators,'methods':methods,'lexicalReferences':names,'helperCalls':helpers,'import':True,'visualRepresentation':parsed['capabilities']['visual'],'visualEditing':False,'serialize':raw==parsed['raw'],'reimport':False,'sourceByteRoundtrip':before==(before.decode()[:entry['start']]+raw+before.decode()[entry['end']:]).encode(),'evaluation':False,'surfaceComparison':None,'annotationComparison':None,'structureComparison':None,'diagnostics':parsed['diagnostics']}
        dependency_methods=set()
        dependency_helpers=set()
        for dependency in row['dependencyContext'].values():
            dependency_tree=ast.parse(dependency['expression'])
            dependency_methods.update(n.func.attr for n in ast.walk(dependency_tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute))
            dependency_helpers.update(n.func.id for n in ast.walk(dependency_tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name))
        row['directMethods']=methods
        row['dependencyMethods']=sorted(dependency_methods)
        row['methods']=sorted(set(methods)|dependency_methods)
        row['dependencyHelperCalls']=sorted(dependency_helpers)
        row['constructionTree']=row['visualRepresentation']
        row['visualEditingImplemented']=parsed['capabilities']['edit']
        row['uiWorkflowVerified']=None
        try:
            namespace=namespace_for(corpus,path,entry['statementLine'])
            with redirect_stdout(sys.stderr): realized=realize(raw,namespace)
            # Exercise the same source-span replacement used by visual controls:
            # replace a reference with itself under explicit parentheses, then
            # reparse and realize. Arbitrary new linguistic choices are not proven.
            node=parsed['root']
            while node['children']:node=node['children'][0]['node']
            edited=replace_node(raw,node,'(' + node['code'] + ')')
            imported=parse_ast(edited)
            row['reimport']=ast.dump(imported)==ast.dump(tree)
            with redirect_stdout(sys.stderr): rerender=realize(edited,namespace)
            row['visualEditing']=parsed['capabilities']['edit'] and row['reimport'] and realized['surface']==rerender['surface'] and realized['annotated']==rerender['annotated'] and realized['structure']==rerender['structure']
            row.update(evaluation=True,surface=realized['surface'],annotated=realized['annotated'],surfaceComparison=realized['surface']==str(original_value.eval()),annotationComparison=realized['annotated']==str(original_value.eval(annotated=True)),structureComparison=realized['structure']==original_structure,structureFingerprint=realized['structureFingerprint'])
            # Dispatch traces prove types, not subject/object claims by operator.
            dispatches=[]
            def collect(node):
                if node.get('dispatch'):dispatches.append({'nodeId':node['id'],'code':node['code'],'dispatch':node['dispatch'],'operandTypes':node.get('operandTypes'),'runtimeType':node.get('runtimeType'),'category':node.get('category')})
                for child in node['children']:collect(child['node'])
            collect(realized['tree']);row['typedDispatch']=dispatches
        except Exception as error:row['diagnostics'].append({'severity':'error','message':f'{type(error).__name__}: {error}'})
        row['spanEditRoundtrip']=row['visualEditing']
        row['visualEditing']=None  # UI controls require separate actual interaction evidence.
        ui=ui_rows.get(ordinal)
        if ui and ui.get('sourceExpression')==raw:
            row['uiWorkflowVerified']=ui.get('uiWorkflowVerified') is True
            row['visualEditing']=row['uiWorkflowVerified']
            row['uiEvidence']={'path':'docs/reviews/round-3-all-expression-ui.json','ordinal':ordinal,'scopeRoundtrip':ui.get('scopeRoundtrip'),'lexicalRoundtrip':ui.get('lexicalRoundtrip'),'lexicalEvaluation':ui.get('lexicalEvaluation')}
        rows.append(row)
    if before!=path.read_bytes():raise RuntimeError('Source changed during audit')
    flags=['import','constructionTree','spanEditRoundtrip','serialize','reimport','sourceByteRoundtrip','evaluation','surfaceComparison','annotationComparison','structureComparison']
    totals={flag:sum(row[flag] is True for row in rows) for flag in flags+['uiWorkflowVerified']}
    report={'schemaVersion':1,'source':'Araújo 1686','count':len(rows),'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceSha256':hashlib.sha256(before).hexdigest(),'repositories':snapshots,'python':sys.version,'totals':totals,'methodInventory':sorted(set(x for row in rows for x in row['methods'])),'helperInventory':sorted(set(x for row in rows for x in row['helperCalls'])),'operators':sorted(set(x for row in rows for x in row['operators'])),'limits':['constructionTree verifies recursive card encoding; spanEditRoundtrip verifies concrete replacement/reimport. visualEditingImplemented denotes available controls, while visualEditing/uiWorkflowVerified require source/dependency/UI/integration-matched per-expression native UI evidence. Unknown/mismatched evidence stays null. Tested interactions establish specific scope and lexical replacement workflows, not every possible linguistic edit.','Actual-engine direct module import is compared to the bounded AST interpreter with source context in execution order.','Morpheme tags are authoritative engine output; internal token-to-constituent alignment is not inferred.','Span-edit probe changes a leaf via the actual span serializer with redundant parentheses; syntax and all runtime structure, annotations and surfaces must remain equal.','Source byte comparison and targeted source-write tests are separate from editorial approval.','Structural comparison excludes volatile node IDs and includes grammatical flags, argument/adjunct order, lexical class and engine internal values.'],'rows':rows}
    args.output.mkdir(parents=True,exist_ok=True);(args.output/'araujo.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    lines=['# Araújo coverage audit','',f"Discovered **{len(rows)} expressions**. Read-only actual-engine audit with the dirty corpus/engine contents recorded below.",'', '| Measure | Passing |','|---|---:|']+[f'| {flag} | {totals[flag]}/{len(rows)} |' for flag in flags+['uiWorkflowVerified']]
    lines+=['','Methods including transitive lexical/helper dependencies: '+', '.join(report['methodInventory'])+'.','Helpers/constructors: '+', '.join(report['helperInventory'])+'.','','## Interpretation','']+['- '+limit for limit in report['limits']]+['','## Every expression','','| Expression | Physical lines | Constructs | Tree / span edit / reimport | Engine / surface / annotations / structure | Native UI | Diagnostics |','|---|---|---|---|---|---|---|']
    for row in rows:
        check=lambda value:'yes' if value is True else 'NO' if value is False else '—'
        lines.append(f"| {row['id'].split(':')[-1]} | {row['line']}–{row['endLine']} | {', '.join(row['operators']+row['methods']+row['helperCalls'])} | {' / '.join(check(row[key]) for key in ['constructionTree','spanEditRoundtrip','reimport'])} | {' / '.join(check(row[key]) for key in ['evaluation','surfaceComparison','annotationComparison','structureComparison'])} | {check(row['uiWorkflowVerified'])} | {'; '.join(d['message'].replace('|','/') for d in row['diagnostics']) or '—'} |")
    lines+=['','Exact expressions, byte spans, inherited source metadata, transitive lexical definitions, contextual mutations, typed dispatches, annotations and fingerprints are in [araujo.json](araujo.json).']
    (args.output/'araujo.md').write_text('\n'.join(lines)+'\n');print(json.dumps({'count':len(rows),'totals':totals,'exceptions':[{'id':r['id'],'diagnostics':r['diagnostics']} for r in rows if any(r[f] is not True for f in flags)]},ensure_ascii=False))
if __name__=='__main__':main()
