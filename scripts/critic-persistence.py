"""Independent local failure probes; all writes target disposable copies."""
from pathlib import Path
import json,shutil,subprocess,sys,tempfile
from unittest.mock import patch
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'python'))
from adapter import ProjectAdapter,AdapterError
from studio_authoring import source_entries
REAL=Path('/Users/kian/code');report={'stages':[]}
def check(name,fn):
 try:result=fn();report['stages'].append({'name':name,'status':'passed','evidence':result})
 except Exception as error:report['stages'].append({'name':name,'status':'failed','error':str(error)})
 print(report['stages'][-1]['status']+': '+name)
with tempfile.TemporaryDirectory(prefix='critic-risk-') as directory:
 parent=Path(directory);corpus=parent/'oldtupicorpus';engine=parent/'nhe-enga'
 for project,target,folders in [('oldtupicorpus',corpus,['historic','authoring','tests','ground_truth','synthetic','dictionary']),('nhe-enga',engine,['pydicate','tupi'])]:
  subprocess.run(['git','clone','--shared','--no-checkout',str(REAL/project),str(target)],check=True,capture_output=True)
  subprocess.run(['git','-C',str(target),'read-tree','HEAD'],check=True)
  for folder in folders:shutil.copytree(REAL/project/folder,target/folder,ignore=shutil.ignore_patterns('__pycache__'))
  for file in (REAL/project).glob('*.py'):shutil.copy2(file,target/file.name)
 source=corpus/'historic/araujo_catecismo_1686.tu.py';initial=source.read_bytes();adapter=ProjectAdapter(parent/'state');project=adapter.open_project(str(parent));passage=project['passages'][66]
 def interrupted():
  preview=adapter.invoke('source_preview',{'passageId':passage['id'],'raw':'amen'})
  with patch('authoring_service.os.replace',side_effect=OSError('Injected interrupted atomic replacement')):
   try:adapter.invoke('source_apply',preview);raise AssertionError('Interruption unexpectedly succeeded')
   except OSError:pass
  assert source.read_bytes()==initial
  journal=parent/'state/recovery'/(preview['previewId']+'.json');assert journal.exists()
  leftovers=list(source.parent.glob('*.studio-*'));assert not leftovers
  return {'originalBytesIntact':True,'recoveryJournalExists':True,'temporaryFilesLeft':len(leftovers)}
 check('interrupted-source-replacement',interrupted)
 def recovery():
  preview=adapter.invoke('source_preview',{'passageId':passage['id'],'raw':'amen','metadata':{'notes':'critic source apply'}})
  current=adapter.invoke('source_apply',preview);assert source.read_bytes()!=initial
  restore=adapter.invoke('source_recover',{'recoveryId':preview['previewId']});adapter.invoke('source_apply',restore);assert source.read_bytes()==initial
  return {'byteExactRecovery':True}
 check('recovery-restores-source-bytes',recovery)
 def duplicates():
  current=adapter.refresh_project()
  identifiers=[current['passages'][i-1]['id'] for i in [3,11]]
  for ordinal,note in [(3,'FIRST DUPLICATE R3'),(11,'SECOND DUPLICATE R3')]:
   current=adapter.refresh_project();preview=adapter.invoke('source_preview',{'passageId':current['passages'][ordinal-1]['id'],'metadata':{'notes':note}});adapter.invoke('source_apply',preview)
  text=source.read_text();text=text.replace(identifiers[0],'RESERVED_SWAP_R3').replace(identifiers[1],identifiers[0]).replace('RESERVED_SWAP_R3',identifiers[1]);text=text.replace('FIRST DUPLICATE R3','RESERVED_NOTE_R3').replace('SECOND DUPLICATE R3','FIRST DUPLICATE R3').replace('RESERVED_NOTE_R3','SECOND DUPLICATE R3');source.write_text(text)
  current=adapter.refresh_project();assert current['passages'][2]['id']==identifiers[1];assert current['passages'][10]['id']==identifiers[0]
  assert current['passages'][2]['notes']=='SECOND DUPLICATE R3';assert current['passages'][10]['notes']=='FIRST DUPLICATE R3'
  reopened=ProjectAdapter(parent/'state').open_project(str(parent));assert reopened['passages'][2]['id']==identifiers[1]
  return {'sameExpressionsMoveWithExplicitIdentity':True,'notesFollowIdentity':True,'restartRetainsIdentity':True}
 check('explicit-duplicate-reordering',duplicates)
 def ambiguous():
  source.write_bytes(initial);a=ProjectAdapter(parent/'ambiguous');before=a.open_project(str(parent));old=before['passages'][2]['id'];entry=source_entries(source)[2];text=source.read_text();text=text[:entry['start']]+'(amen),\n    '+text[entry['start']:];source.write_text(text);after=a.refresh_project();new=[p['id'] for p in after['passages'] if p['sourceExpression']=='(amen)'];assert old not in new
  return {'ambiguousOriginalRetainedForReassociation':old,'newIdsDoNotClaimAmbiguousOriginal':True,'diagnostics':after['diagnostics']}
 check('ambiguous-unmarked-duplicate-insertion',ambiguous)
 def mismatch():
  source.write_bytes(initial);current=adapter.refresh_project();selected=current['passages'][66];engine_file=engine/'pydicate/pydicate/lang/tupilang/pos/verb.py';before=engine_file.read_bytes();engine_file.write_bytes(before+b'\n# critic dependency change\n')
  try:
   try:adapter.invoke('evaluate_expression',{'passageId':selected['id'],'revisionId':'before-engine-change','raw':selected['sourceExpression'],'engineFingerprint':current['engineFingerprint']});raise AssertionError('Old engine fingerprint accepted')
   except AdapterError as error:assert error.code=='STALE_ENGINE',error.code
  finally:engine_file.write_bytes(before)
  adapter.refresh_project()
  return {'changedSelectedEngineRejected':'STALE_ENGINE','originalEngineUntouched':True}
 check('selected-engine-content-mismatch',mismatch)
report['boundary']='No provider egress or historical source writes; engine and corpus copies include current dirty files.'
(ROOT/'docs/reviews/round-3-source-failure-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
