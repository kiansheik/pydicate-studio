"""New-source contribution materialization retains submitted witness identity."""
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from import_submissions import materialize


class NewSourceImportTests(unittest.TestCase):
    def test_new_source_is_created_before_evaluation_and_evidence_enters_source_review(self):
        identifier='a2a53148-422a-4573-a831-cb0432dcd50f'
        pending='pending:'+identifier
        published='passage:'+identifier
        calls=[]

        class Worker:
            project={'passages':[], 'sources':[], 'engineFingerprint':'engine:before'}

            def call(self,method,params):
                calls.append((method,params))
                if method=='source_create':
                    return {'passages':[], 'sources':[{'id':'new_witness','title':params['title']}], 'engineFingerprint':'engine:created'}
                if method=='evaluate_expression':return {'evaluationStatus':'complete'}
                if method=='source_new_preview':return {'previewId':'preview','sourceFingerprint':'source:before','diff':'new passage'}
                if method=='source_apply':return self.project
                raise AssertionError(method)

        snapshot={'sourceId':'new_witness','passageId':pending,'source':{'id':'new_witness','title':'Novo testemunho','year':'1720'},
                  'original':None,'draft':{'raw':'amen','revisionId':'r1','diplomatic':'Amen','pending':{'sourceId':'new_witness','ordinal':1}},
                  'evidence':{'version':1,'assetId':'a'*64,'passageId':published,'manifestRevision':7,'regions':[{'rect':[1,2,3,4]}]}}
        package={'submissions':[{'id':identifier,'snapshotSha256':'b'*64,'authorId':'author','decoded':snapshot}]}

        def git(repo,*args):
            if args[:2]==('status','--porcelain'):return '?? historic/new_witness.tu.py'
            if args[:2]==('ls-files','--others'):return 'historic/new_witness.tu.py'
            if args[:2]==('rev-parse','HEAD'):return 'c'*40
            return ''

        with patch('import_submissions.git',side_effect=git):
            result=materialize(package,pathlib.Path('/disposable'),Worker())
        self.assertEqual([method for method,_ in calls],['source_create','evaluate_expression','source_new_preview','source_apply'])
        self.assertEqual(calls[1][1]['passageId'],pending)
        self.assertEqual(calls[1][1]['engineFingerprint'],'engine:created')
        preview=calls[2][1]
        self.assertEqual(preview['newPassageId'],published)
        self.assertEqual(preview['metadata']['evidence'],{'version':1,'assetId':'a'*64,'passageId':published})
        self.assertEqual(result[0]['commitSha'],'c'*40)

    def test_missing_new_source_description_is_not_invented(self):
        class Worker:
            project={'passages':[],'sources':[]}
        package={'submissions':[{'decoded':{'sourceId':'unknown','passageId':'pending:abc','draft':{},'original':None}}]}
        with self.assertRaisesRegex(ValueError,'metadata is missing'):
            materialize(package,pathlib.Path('/disposable'),Worker())


if __name__=='__main__':unittest.main()
