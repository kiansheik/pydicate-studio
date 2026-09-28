"""Full backup retains Codex login, not container-local executable links."""
import contextlib
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from host import Host, sha

class CheckpointTests(unittest.TestCase):
    def test_codex_temporary_links_are_excluded_but_login_and_research_are_kept(self):
        with tempfile.TemporaryDirectory() as temporary:
            host=Host(Path(temporary)/'server')
            for directory in (host.data,host.workspace,host.config/'codex/tmp/arg0'):
                directory.mkdir(parents=True)
            (host.config/'codex/auth.json').write_text('private fixture')
            (host.data/'research.json').write_text('research fixture')
            (host.config/'codex/tmp/arg0/apply_patch').symlink_to('/container-only/codex')
            def compose(*args,stdout=None):
                if stdout:stdout.write(b'database fixture')
            destination=host.root/'backups/test'
            with patch.object(host,'stopped',return_value=contextlib.nullcontext()),patch.object(host,'compose',side_effect=compose),patch('host.git',return_value='a'*40):
                host.checkpoint(destination)
            with tarfile.open(destination/'workspace-state.tar.gz') as archive:
                self.assertEqual(archive.extractfile('config/codex/auth.json').read(),b'private fixture')
                self.assertEqual(archive.extractfile('data/research.json').read(),b'research fixture')
                self.assertFalse(any('/tmp' in member.name or member.issym() for member in archive))
            manifest=json.loads((destination/'manifest.json').read_text())
            for name,digest in manifest['files'].items():self.assertEqual(sha(destination/name),digest)
            (host.data/'unexpected-link').symlink_to('/outside')
            with self.assertRaisesRegex(ValueError,'Symlink in backup state'):
                host.checkpoint(host.root/'backups/rejected')

if __name__=='__main__':unittest.main()
