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

    def test_routine_checkpoint_keeps_live_state_and_leaves_retained_imports_alone(self):
        with tempfile.TemporaryDirectory() as temporary:
            host=Host(Path(temporary)/'server')
            for directory in (host.data,host.workspace,host.config):directory.mkdir(parents=True)
            # Live state: must always be captured.
            (host.data/'evidence').mkdir();(host.data/'evidence/asset.pdf').write_text('live pdf')
            # Retained provenance: one full copy per deploy, already reconstructible.
            for name in ('desktop-imports/bundle','evidence-imports'):
                (host.data/name).mkdir(parents=True)
            (host.data/'desktop-imports/bundle/manifest.json').write_text('{}')
            (host.data/'evidence-imports/archive.tar').write_text('retained upload')
            def compose(*args,stdout=None):
                if stdout:stdout.write(b'database fixture')
            with patch.object(host,'stopped',return_value=contextlib.nullcontext()),\
                    patch.object(host,'compose',side_effect=compose),patch('host.git',return_value='a'*40):
                routine=host.checkpoint(host.root/'backups/routine',provenance=False)
                full=host.checkpoint(host.root/'backups/full')
            with tarfile.open(routine/'workspace-state.tar.gz') as archive:
                names={member.name for member in archive}
                self.assertIn('data/evidence/asset.pdf',names)
                self.assertFalse(any(name.startswith(('data/desktop-imports','data/evidence-imports')) for name in names))
            self.assertFalse(json.loads((routine/'manifest.json').read_text())['includesImportProvenance'])
            # The explicit full backup still captures everything.
            with tarfile.open(full/'workspace-state.tar.gz') as archive:
                names={member.name for member in archive}
                self.assertIn('data/evidence-imports/archive.tar',names)
                self.assertIn('data/desktop-imports/bundle/manifest.json',names)
            self.assertTrue(json.loads((full/'manifest.json').read_text())['includesImportProvenance'])
            # Nothing on the server is removed either way.
            self.assertTrue((host.data/'evidence-imports/archive.tar').exists())

if __name__=='__main__':unittest.main()
