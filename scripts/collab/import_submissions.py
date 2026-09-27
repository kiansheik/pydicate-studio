#!/usr/bin/env python3
"""Materialize chosen immutable submissions as unapproved Git changes in new local worktrees."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, selectors, subprocess, sys, tempfile, uuid
from host import REPOS, SPARSE, git

HERE=pathlib.Path(__file__).resolve().parents[2]
class Worker:
    def __init__(self,parent,state):
        self.proc=subprocess.Popen([sys.executable,'-B',str(HERE/'python/worker.py'),'--state-dir',str(state)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=state.joinpath('worker.log').open('wb'),text=True)
        self.sequence=0;self.project=self.call('open_project',{'parentPath':str(parent)})
    def call(self,method,params):
        self.sequence+=1;self.proc.stdin.write(json.dumps({'id':self.sequence,'method':method,'params':params},ensure_ascii=False)+'\n');self.proc.stdin.flush()
        with selectors.DefaultSelector() as selector:
            selector.register(self.proc.stdout,selectors.EVENT_READ)
            if not selector.select(timeout=120):
                self.proc.kill()
                raise TimeoutError('Local authoring timed out. Partial worktrees and diagnostics are preserved.')
            line=self.proc.stdout.readline()
        if not line:raise RuntimeError('The local authoring worker stopped. Inspect its preserved state/worker.log.')
        response=json.loads(line)
        if 'error' in response:raise ValueError(f'{method}: {response["error"].get("message","Authoring failure")}')
        return response['result']
    def close(self):
        self.proc.stdin.close()
        try:self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait()

def read_package(filename):
    if pathlib.Path(filename).stat().st_size>64*1024*1024:raise ValueError('Package exceeds 64 MiB')
    data=json.loads(pathlib.Path(filename).read_text())
    if data.get('format')!='pydicate-submission-package' or data.get('version')!=1 or not 1<=len(data.get('submissions',[]))<=200:raise ValueError('Unsupported submission package')
    ids=set()
    for item in data['submissions']:
        uuid.UUID(item['id'])
        if item['id'] in ids:raise ValueError('Duplicate submission')
        ids.add(item['id'])
        raw=item['snapshotJson']
        if hashlib.sha256(raw.encode()).hexdigest()!=item['snapshotSha256']:raise ValueError('Submission checksum mismatch')
        snapshot=json.loads(raw)
        if snapshot.get('format')!='pydicate-submission' or snapshot.get('version')!=1:raise ValueError('Unsupported snapshot')
        item['decoded']=snapshot
    return data

def prepare_worktrees(parent,destination,label):
    if destination.exists():raise ValueError('Import destination already exists; choose a fresh directory.')
    destination.mkdir(parents=True,mode=0o700)
    results={}
    for name in ('nhe-enga','oldtupicorpus'):
        source=parent/name
        if not source.exists():
            source.parent.mkdir(parents=True,exist_ok=True)
            subprocess.run(['git','clone','--filter=blob:none',*(['--sparse'] if name=='nhe-enga' else []),REPOS[name],str(source)],check=True)
            if name=='nhe-enga':subprocess.run(['git','-C',str(source),'sparse-checkout','set','--no-cone',*SPARSE],check=True)
        if git(source,'remote','get-url','origin') not in (REPOS[name],f'git@github.com:kiansheik/{name}.git'):raise ValueError('Unexpected repository origin: '+name)
        # Fetching and linked worktrees never check out or overwrite the caller's working files.
        git(source,'fetch','origin','main');base=git(source,'rev-parse','origin/main')
        branch='contrib/studio-'+label
        git(source,'worktree','add','-b',branch,str(destination/name),base)
        results[name]={'base':base,'branch':branch,'path':str(destination/name)}
    return results

def materialize(data,parent,worker):
    applied=[]
    for item in data['submissions']:
        snapshot=item['decoded'];draft=snapshot['draft'];original=snapshot.get('original');project=worker.project
        passages=project['passages'];source_id=snapshot['sourceId']
        is_new=original is None
        if is_new:
            reserved=snapshot['passageId'].replace('pending:','passage:',1)
            if any(p['id']==reserved for p in passages):raise ValueError('This new passage is already present. Do not import/pay it twice.')
            if not any(source['id']==source_id for source in project.get('sources',[])) and not any(p['sourceId']==source_id for p in passages):
                source=snapshot.get('source')
                if not isinstance(source,dict) or source.get('id')!=source_id:raise ValueError('New source metadata is missing; reconcile the submission manually.')
                project=worker.project=worker.call('source_create',{'sourceId':source_id,'title':source.get('title'),'year':source.get('year','')})
                passages=project['passages']
            selected=next((p for p in reversed(passages) if p['sourceId']==source_id),None)
        else:
            selected=next((p for p in passages if p['id']==original['id']),None)
            if selected is None:
                candidates=[p for p in passages if p['sourceId']==source_id and p['sourceExpression']==original['sourceExpression']]
                if len(candidates)!=1:raise ValueError('Ambiguous or changed original passage; manual reconciliation required.')
                selected=candidates[0]
            if selected['sourceFingerprint']!=original['sourceFingerprint']:raise ValueError('Upstream passage changed; review/rebase the submission instead of overwriting it.')
        if selected is None and not is_new:raise ValueError('Source is not available in the selected main branches.')
        raw=draft['raw'];revision=draft['revisionId']
        metadata={**draft.get('locators',{}),**{k:draft[k] for k in ('diplomatic','normalized','translation','translations','notes') if k in draft}}
        if snapshot.get('evidence'):
            evidence=snapshot['evidence'];expected_id=reserved if is_new else selected['id']
            if evidence.get('version')!=1 or evidence.get('passageId')!=expected_id or not re.fullmatch(r'[a-f0-9]{64}',evidence.get('assetId','')):
                raise ValueError('Invalid evidence identity in the submitted snapshot.')
            metadata['evidence']={key:evidence[key] for key in ('version','assetId','passageId')}
        params={'passageId':snapshot['passageId'] if is_new else selected['id'],'sourceId':source_id,'raw':raw,'metadata':metadata}
        if is_new:
            params['newPassageId']=reserved
            before=draft.get('pending',{}).get('beforePassageId')
            if before:
                # Publication IDs are stable; unknown insertion anchors are not guessed.
                before=before.replace('pending:','passage:',1)
                if not any(p['id']==before for p in passages):raise ValueError('Insertion anchor is not in this batch/main. Import its prerequisite or reconcile manually.')
                params['beforePassageId']=before
        evaluated=worker.call('evaluate_expression',{**params,'revisionId':revision,'engineFingerprint':project['engineFingerprint']})
        if evaluated.get('evaluationStatus')=='partial' or evaluated.get('failures'):raise ValueError('Evaluation is partial or failed. Fix the proposal before publishing source.')
        preview=worker.call('source_new_preview' if is_new else 'source_preview',params)
        if not preview.get('diff','').strip() and not any(f.get('diff','').strip() for f in preview.get('files',[])):raise ValueError('Proposal has no source changes; check for duplicate import.')
        worker.project=worker.call('source_apply',{'previewId':preview['previewId'],'sourceFingerprint':preview['sourceFingerprint']})
        repo=parent/'oldtupicorpus'
        changed=git(repo,'status','--porcelain')
        if not changed:raise ValueError('Authoring service did not produce a source change.')
        # Only scholarly source paths, never worker state, credentials or research logs.
        files=git(repo,'diff','--name-only').splitlines()+git(repo,'ls-files','--others','--exclude-standard').splitlines()
        if any(not name.startswith(('historic/','ground_truth/','authoring/')) or any(part.startswith('.') for part in pathlib.PurePosixPath(name).parts) for name in files):raise ValueError('Unexpected source paths; import stopped for manual review.')
        git(repo,'add','--',*sorted(set(files)))
        message=f'Propose Studio passage {snapshot["passageId"]}\n\nStudio-Submission: {item["id"]}\nStudio-Snapshot: {item["snapshotSha256"]}\nStudio-Author-ID: {item["authorId"]}\n\nSource-only proposal; ground truth is not automatically approved.'
        # Local Git config controls the committer. No contributor e-mail is exposed.
        git(repo,'-c','user.name=Pydicate Studio','-c','user.email=studio@academiatupi.com','commit','-m',message)
        applied.append({'submissionId':item['id'],'snapshotSha256':item['snapshotSha256'],'repository':'oldtupicorpus','commitSha':git(repo,'rev-parse','HEAD')})
    return applied

def main():
    p=argparse.ArgumentParser();p.add_argument('--file',required=True);p.add_argument('--repos-parent',required=True);p.add_argument('--destination',required=True);p.add_argument('--label',default=uuid.uuid4().hex[:12]);args=p.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,60}',args.label):raise ValueError('Invalid branch label')
    os.umask(0o077);data=read_package(args.file);parent=pathlib.Path(args.repos_parent).expanduser().resolve();dest=pathlib.Path(args.destination).expanduser().resolve()
    branches=prepare_worktrees(parent,dest,args.label);state=dest/'state';state.mkdir(mode=0o700);worker=Worker(dest,state)
    try:receipts=materialize(data,dest,worker)
    finally:worker.close()
    result={'format':'pydicate-import-receipt','version':1,'branches':branches,'receipts':receipts}
    (dest/'import-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2));print('Review/test these worktrees, then push/open PRs. Nothing was merged, deployed or automatically approved.')
if __name__=='__main__':
    try:main()
    except Exception as error:print('Import stopped; partial worktrees are preserved for inspection: '+str(error),file=sys.stderr);sys.exit(1)
