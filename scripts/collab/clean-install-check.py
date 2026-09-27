#!/usr/bin/env python3
"""Disposable CI only: exercise the same laptop Make/SSH path, never production."""
import hashlib,json,os,pathlib,ssl,subprocess,sys,tempfile,time,urllib.request,uuid
from ops import safe_extract,Remote
HERE=pathlib.Path(__file__).resolve().parents[2]
if os.environ.get('COLLAB_CI_DISPOSABLE')!='1' or os.environ.get('DEPLOY_HOST')!='127.0.0.1':raise SystemExit('Only an explicitly disposable loopback CI host is accepted')
url=os.environ['COLLAB_PUBLIC_URL'];password='throwaway clean install validation password'
root=os.environ['DEPLOY_PATH'];remote=Remote();cookie='';csrf='';client='clean-install-ci'
def make(target,**settings):
    return subprocess.run(['make',target,*[key+'='+str(value) for key,value in settings.items()]],cwd=HERE,check=True)
def api(route,body=None,raw=None,headers=None):
    data=raw if raw is not None else None if body is None else json.dumps(body).encode()
    h={'Origin':url,'Cookie':cookie,'X-CSRF-Token':csrf,'X-Studio-Client':client}
    if data is not None:h['Content-Type']='application/json'
    h.update(headers or {})
    request=urllib.request.Request(url+route,data=data,headers=h)
    with urllib.request.urlopen(request,context=ssl._create_unverified_context(),timeout=90) as response:
        bytes=response.read();return (json.loads(bytes) if response.headers.get_content_type()=='application/json' else bytes,response.headers)
def login():
    global cookie,csrf
    value,headers=api('/api/login',{'email':'fixture@example.invalid','password':password});cookie=headers['Set-Cookie'].split(';')[0];csrf=value['csrf']
def document():
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',b'<< /Length 0 >>\nstream\n\nendstream']
    data=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(data));data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(f'{p:010d} 00000 n \n'.encode() for p in offsets)
    return data+f'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
report={'format':'pydicate-clean-install-check','version':1,'steps':[]}
def passed(step):report['steps'].append(step);print('PASS:',step,flush=True)
make('collab-install');passed('one local Studio clone installs all three repositories remotely and starts PostgreSQL/application')
subprocess.run(['make','collab-admin','EMAIL=fixture@example.invalid','NAME=CI Reviewer'],cwd=HERE,input=(password+'\n').encode(),check=True)
login();passed('bootstrap account and HTTPS login through existing-edge pattern')
project=api('/api/invoke',{'method':'session_restore','params':{}})[0]['project'];pid=project['id'];passage=project['passages'][0]['id'];source=project['passages'][0]['sourceId']
snapshot=api('/api/drafts/load',{'projectId':pid})[0];draft=snapshot['envelope']['drafts'][passage];draft['notes']='preserve this doctoral research draft';draft['revisionId']=str(uuid.uuid4())
api('/api/drafts',{'projectId':pid,'changes':[{'id':passage,'version':snapshot['versions'][passage],'draft':draft}]})
submission=api('/api/submit',{'passageId':passage,'revisionId':draft['revisionId']})[0]
api('/api/comment',{'passageId':passage,'body':'Keep this comment indefinitely.'})
api('/api/usage',{'event':'editor.batch','passageId':passage,'outcome':'changed','details':{'editCount':1}})
api('/api/admin/invite',{'email':'student@example.invalid','name':'Student','role':'contributor'})
passed('real server edits/comments/usage and invitation through isolated reused SMTP relay')
pdf=document();metadata=json.dumps({'sourceId':source,'passageId':passage})
evidence=api('/api/pdf',raw=pdf,headers={'Content-Type':'application/pdf','X-Studio-Evidence':metadata})[0]
asset=hashlib.sha256(pdf).hexdigest()
assert api('/api/invoke',{'method':'evidence_bytes','params':{'projectId':pid,'sourceId':source,'passageId':passage,'assetId':asset}})[0]==pdf
passed('authenticated PDF upload and exact stored bytes')
with tempfile.TemporaryDirectory() as directory:
    directory=pathlib.Path(directory)
    full=directory/'full.tar.gz';dump=directory/'database.dump';research=directory/'research.tar.gz'
    make('collab-backup',FILE=full);make('collab-db-backup',FILE=dump);make('collab-research',FILE=research)
    assert dump.stat().st_size>0
    unpack=directory/'research';safe_extract(research,unpack);manifest=json.loads((unpack/'manifest.json').read_text())
    assert next(f['records'] for f in manifest['files'] if f['name']=='audit.jsonl')>=1
    passed('laptop downloads checksummed full backup, PostgreSQL dump and permanent research export')
    review_db=directory/'review-db';package=directory/'submissions.json';branches=directory/'imported'
    make('collab-db-restore-local',FILE=dump,LOCAL_REVIEW_DIR=review_db)
    make('collab-submissions-local',IDS=submission['id'],FILE=package,LOCAL_REVIEW_DIR=review_db)
    make('collab-import',FILE=package,LOCAL_REPOS_PARENT=directory/'local-repos',IMPORT_DIR=branches)
    receipt=json.loads((branches/'import-receipt.json').read_text())
    assert receipt['receipts'][0]['submissionId']==submission['id']
    assert set(receipt['branches'])=={'nhe-enga','oldtupicorpus'}
    passed('private restored laptop database exports exact author snapshot into two new local main-based worktrees')
    # Dirty server source must survive application redeployment untouched.
    remote.ssh(['python3','-c',"from pathlib import Path;p=Path("+repr(root+'/workspace/oldtupicorpus/historic/araujo_catecismo_1686.tu.py')+");p.write_text(p.read_text()+'\\n# disposable redeployment preservation fixture\\n')"])
    before=remote.ssh(['sha256sum',root+'/workspace/oldtupicorpus/historic/araujo_catecismo_1686.tu.py'],stdout=subprocess.PIPE).stdout
    make('collab-redeploy')
    after=remote.ssh(['sha256sum',root+'/workspace/oldtupicorpus/historic/araujo_catecismo_1686.tu.py'],stdout=subprocess.PIPE).stdout
    assert before==after;login()
    assert api('/api/drafts/load',{'projectId':pid})[0]['envelope']['drafts'][passage]['notes']=='preserve this doctoral research draft'
    passed('redeploy preserves dirty server corpus and transactional data')
    make('collab-changes',REPO='oldtupicorpus',FILE=directory/'changes.tar.gz')
    review=directory/'changes';safe_extract(directory/'changes.tar.gz',review);assert json.loads((review/'manifest.json').read_text())['files']
    passed('reviewable server change package downloaded without GitHub writes')
    # Exercise explicit database and full-file restores against this disposable target only.
    make('collab-db-restore',FILE=dump,CONFIRM='RESTORE-STUDIO-PRODUCTION@127.0.0.1')
    make('collab-start');login()
    make('collab-restore',FILE=full,CONFIRM='RESTORE-STUDIO-PRODUCTION@127.0.0.1')
    make('collab-start');login()
    assert api('/api/drafts/load',{'projectId':pid})[0]['envelope']['drafts'][passage]['notes']=='preserve this doctoral research draft'
    assert api('/api/invoke',{'method':'evidence_bytes','params':{'projectId':pid,'sourceId':source,'passageId':passage,'assetId':asset}})[0]==pdf
    passed('database and full backup restores retain accounts/drafts/comments and exact PDF bytes')
    assert api('/api/providers')[0]['enabled'] is False
    passed('hosted AI remains off throughout install and restore')
report['repositories']=json.loads(remote.ssh(['cat',root+'/release.json'],stdout=subprocess.PIPE).stdout)
(HERE/'test-results').mkdir(exist_ok=True)
(HERE/'test-results/clean-install-report.json').write_text(json.dumps(report,indent=2)+'\n')
