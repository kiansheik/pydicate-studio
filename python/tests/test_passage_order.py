"""Reviewed insertion and independent approval, using disposable source/records."""
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from adapter import ProjectAdapter
from passage_references import read, paths
from python.tests import test_pending_authoring as fixture
SOURCE=fixture.SOURCE

class PassageOrderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): fixture.PendingAuthoringTests.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()
    def setUp(self):
        self.path.write_text('from historic.lexicon import *\nl = [\n    amen,\n    amen,\n    amen,\n]\n'+SOURCE+' = l\n')
        records,companion=paths(self.corpus,SOURCE)
        records.write_bytes(b'');companion.unlink(missing_ok=True)
        self.adapter=ProjectAdapter(self.parent/('state-'+str(uuid.uuid4())))
        self.project=self.adapter.open_project(str(self.parent))
    def passages(self):return [p for p in self.project['passages'] if p['sourceId']==SOURCE]
    def approve(self,p):
        result=self.adapter.invoke('evaluate_expression',{'passageId':p['id'],'raw':p['sourceExpression']})
        response=self.adapter.invoke('reference_approve',{'passageId':p['id'],'sourceFingerprint':p['sourceFingerprint'],'reviewedSurface':result['surface']})
        self.project=response['project'];return result['surface']
    def test_approve_later_then_fill_gap_without_approving_neighbors(self):
        selected=self.passages()[2];surface=self.approve(selected)
        records,companion=paths(self.corpus,SOURCE)
        self.assertEqual(records.read_bytes(),b'')
        self.assertEqual(set(read(self.corpus,SOURCE)),{3})
        self.assertEqual([p['acceptedReference'] for p in self.passages()],[None,None,surface])
        self.assertEqual(self.adapter.invoke('reference_status',{'passageId':selected['id']})['record']['surface'],surface)
        self.approve(self.passages()[0]);self.assertEqual(set(read(self.corpus,SOURCE)),{1,3})
        self.approve(self.passages()[1]);self.assertEqual(len(records.read_bytes().splitlines()),3)
        self.assertEqual(json.loads(companion.read_bytes())['records'],[])
    def test_insert_before_reviewed_duplicate_preserves_identity_and_reference(self):
        self.approve(self.passages()[0]);self.approve(self.passages()[1]);self.approve(self.passages()[2])
        original=self.passages();identities=[p['id'] for p in original]
        new_id='passage:'+str(uuid.uuid4())
        preview=self.adapter.invoke('source_new_preview',{'sourceId':SOURCE,'newPassageId':new_id,'beforePassageId':original[1]['id'],'raw':'amen','metadata':{'diplomatic':'missed line'}})
        self.assertEqual(len(read(self.corpus,SOURCE)),3)
        self.project=self.adapter.invoke('source_apply',{'previewId':preview['previewId'],'sourceFingerprint':preview['sourceFingerprint']})
        rows=self.passages()
        self.assertEqual([p['id'] for p in rows],[identities[0],new_id,*identities[1:]])
        self.assertIsNone(rows[1]['acceptedReference'])
        self.assertEqual([p['acceptedReference'] for p in [rows[0],*rows[2:]]],[p['acceptedReference'] for p in original])
        self.assertEqual(set(read(self.corpus,SOURCE)),{1,3,4})
        self.approve(rows[1]);self.assertEqual(set(read(self.corpus,SOURCE)),{1,2,3,4})
    def test_insertion_uses_local_namespace_and_preserves_following_locations(self):
        self.path.write_text('from historic.lexicon import *\nl = [\n    # @section Original\n    # @page 7\n    amen,\n]\nlater = amen\nl += amen\n'+SOURCE+' = l\n')
        self.project=self.adapter.refresh_project();rows=self.passages()
        pending='pending:'+str(uuid.uuid4())
        early=self.adapter.invoke('evaluate_expression',{'passageId':pending,'sourceId':SOURCE,'beforePassageId':rows[0]['id'],'raw':'later'})
        late=self.adapter.invoke('evaluate_expression',{'passageId':pending,'sourceId':SOURCE,'beforePassageId':rows[1]['id'],'raw':'later'})
        self.assertEqual(early['evaluationStatus'],'partial');self.assertEqual(late['evaluationStatus'],'complete')
        preview=self.adapter.invoke('source_new_preview',{'sourceId':SOURCE,'beforePassageId':rows[1]['id'],'raw':'later','metadata':{'printedPage':'8','section':'Inserted'}})
        self.project=self.adapter.invoke('source_apply',preview)
        self.assertEqual(self.passages()[-1]['witness']['printedPage'],'7')
        self.assertEqual(self.passages()[-1]['witness']['section'],'Original')
    def test_sparse_verification_detects_mismatch_after_gap(self):
        self.approve(self.passages()[2])
        _,companion=paths(self.corpus,SOURCE)
        payload=json.loads(companion.read_bytes());payload['records'][0]['surface']='not the reviewed form'
        companion.write_text(json.dumps(payload))
        self.project=self.adapter.refresh_project()
        result=self.adapter.invoke('reference_verify',{'passageId':self.passages()[2]['id']})
        self.assertFalse(result['ok'])
    def test_insertion_pins_wrapped_source_items_without_changing_their_expression(self):
        self.path.write_text('from historic.lexicon import *\nl = [\n    (\n        amen\n    ),\n    amen,\n]\n'+SOURCE+' = l\n')
        self.project=self.adapter.refresh_project();original=self.passages()
        preview=self.adapter.invoke('source_new_preview',{'sourceId':SOURCE,'beforePassageId':original[1]['id'],'raw':'amen'})
        self.project=self.adapter.invoke('source_apply',preview)
        self.assertEqual(self.passages()[0]['id'],original[0]['id'])
        self.assertEqual(self.passages()[0]['sourceExpression'],original[0]['sourceExpression'])
        self.assertEqual(self.passages()[0]['sourceFingerprint'],original[0]['sourceFingerprint'])
