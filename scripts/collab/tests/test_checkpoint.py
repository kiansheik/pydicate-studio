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

    def test_online_checkpoint_never_pauses_studio_and_records_that_it_was_live(self):
        with tempfile.TemporaryDirectory() as temporary:
            host=Host(Path(temporary)/'server')
            for directory in (host.data,host.workspace,host.config):directory.mkdir(parents=True)
            (host.data/'live.json').write_text('live fixture')
            stops=[]
            def compose(*args,stdout=None,capture=False,data=None):
                if args[:1]==('stop',) or args[:2]==('up','-d'):stops.append(args)
                if stdout:stdout.write(b'database fixture')
                return b'running-container' if capture else None
            with patch.object(host,'compose',side_effect=compose),patch('host.git',return_value='a'*40):
                online=host.checkpoint(host.root/'backups/online',online=True)
                # The contrast matters: an explicit backup still pauses for consistency.
                host.checkpoint(host.root/'backups/paused')
            manifest=json.loads((online/'manifest.json').read_text())
            self.assertTrue(manifest['online'])
            with tarfile.open(online/'workspace-state.tar.gz') as archive:
                self.assertIn('data/live.json',{member.name for member in archive})
            # Exactly one stop/start pair, from the paused checkpoint alone.
            self.assertEqual([args[:1] for args in stops],[('stop',),('up',)])

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


class PruneTests(unittest.TestCase):
    def test_pruning_keeps_live_state_the_running_release_and_the_newest_points(self):
        import os, time
        with tempfile.TemporaryDirectory() as temporary:
            host=Host(Path(temporary)/'server')
            for directory in (host.data,host.workspace,host.config):directory.mkdir(parents=True)
            def aged(path,age):
                path.mkdir(parents=True,exist_ok=True)
                (path/'payload').write_text('x')
                stamp=time.time()-age
                os.utime(path,(stamp,stamp))
            # Five automatic checkpoints, oldest first, plus a named backup.
            for index in range(5):aged(host.root/'backups'/f'predeploy-{index}',100-index)
            aged(host.root/'backups'/'a-named-backup',500)
            for index in range(5):aged(host.data/'desktop-imports'/f'bundle-{index}',100-index)
            for index in range(4):aged(host.root/'releases'/f'release-{index}',100-index)
            live=host.root/'releases/release-0'
            (host.root/'current').symlink_to(live)
            (host.data/'evidence').mkdir();(host.data/'evidence/keep.pdf').write_text('live')
            with patch('subprocess.run'):host.prune(keep=2)
            kept=sorted(p.name for p in (host.root/'backups').iterdir())
            # Newest two automatic checkpoints, and the named backup untouched.
            self.assertEqual(kept,['a-named-backup','predeploy-3','predeploy-4'])
            self.assertEqual(sorted(p.name for p in (host.data/'desktop-imports').iterdir()),
                             ['bundle-3','bundle-4'])
            # The running release always survives, whatever its age.
            self.assertTrue(live.is_dir())
            self.assertTrue((host.data/'evidence/keep.pdf').exists())
            self.assertTrue(host.workspace.is_dir())

if __name__=='__main__':unittest.main()
