import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from host import Host
from light import compatible, deploy_light, server_only

class LightTests(unittest.TestCase):
    def test_frontend_changes_cannot_reuse_old_frontend(self):
        self.assertTrue(server_only(['server/store.cjs', 'scripts/collab/light.py', 'docs/agent/log.md']))
        self.assertFalse(server_only(['src/App.tsx', 'server/store.cjs']))
        self.assertFalse(server_only(['electron/python-worker.cjs']))

    def test_installation_changes_require_full_deploy(self):
        with self.assertRaisesRegex(ValueError, 'full collab-deploy'):
            compatible('old', 'new', lambda repo, *args: repo)

    def scenario(self, fail=False):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'server'; host=Host(root)
            old=root/'old'; new=root/'new';old.mkdir();new.mkdir()
            (root/'current').symlink_to(old)
            (root/'release.json').write_text(json.dumps({'studio':'old','nhe-enga':'grammar'}))
            calls=[];rollback=[]
            def git(repo,*args):
                if args[0]=='ls-tree':return 'same dependencies and schema'
                if args[0]=='status':return ''
                if args[0]=='diff':return 'server/store.cjs'
                return 'new'
            def compose(*args,stdout=None):
                calls.append(args)
                if stdout:stdout.write(b'private dump')
                if fail and args[:2]==('up','-d'):raise RuntimeError('unhealthy')
            with patch('host.HERE',new),patch('host.git',side_effect=git),patch.object(host,'compose',side_effect=compose),patch('host.run',side_effect=lambda args, **kwargs:rollback.append(args)):
                if fail:
                    with self.assertRaisesRegex(RuntimeError,'unhealthy'):deploy_light(host)
                else:deploy_light(host)
            self.assertEqual((root/'current').resolve(),(old if fail else new).resolve())
            self.assertEqual(json.loads((root/'release.json').read_text())['studio'],'old' if fail else 'new')
            self.assertEqual(sum(args[0]=='python3' for args in rollback),int(fail))
            self.assertEqual(sum(args[:2]==['docker','build'] for args in rollback),1)
            self.assertIn(('up','-d','--no-deps','--wait','studio'),calls)
            self.assertFalse(any('migrate.cjs' in str(call) or 'stop' in call for call in calls))
            self.assertEqual(len(list((root/'light-backups').glob('*/database.dump'))),1)
    def test_app_only_rollout(self):self.scenario()
    def test_unhealthy_app_restores_previous_image(self):self.scenario(True)
