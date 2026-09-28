import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from codex_auth import install

class CredentialInstallTests(unittest.TestCase):
    def test_private_initial_transfer_preserves_refreshed_server_login(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            source=root/'local.json';source.write_text(json.dumps({'tokens':{'access_token':'fixture-only'}}))
            class Remote:
                def __init__(self):self.root=str(root/'server')
                def ssh(self,args,*,data):
                    self.result=subprocess.run(args,input=data,capture_output=True,check=True)
            remote=Remote()
            install(remote,source=source)
            target=root/'server/config/codex/auth.json'
            self.assertEqual(target.read_bytes(),source.read_bytes())
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
            self.assertNotIn(b'fixture-only',remote.result.stdout+remote.result.stderr)
            target.write_text(json.dumps({'tokens':{'access_token':'refreshed-fixture'}}))
            install(remote,source=source)
            self.assertIn('refreshed-fixture',target.read_text())
            install(remote,source=source,replace=True)
            self.assertEqual(target.read_bytes(),source.read_bytes())
            target.unlink();target.symlink_to(source)
            with self.assertRaises(subprocess.CalledProcessError):install(remote,source=source,replace=True)
