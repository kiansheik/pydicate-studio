import io
import hashlib
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from ops import Remote
from progress import TransferProgress, upload_file


class Terminal(io.StringIO):
    def isatty(self):
        return True


class UploadProgressTests(unittest.TestCase):
    def test_percentage_speed_eta_and_nonterminal_heartbeats(self):
        clock = [0.0]
        output = io.StringIO()
        progress = TransferProgress(1024, stream=output, clock=lambda: clock[0])
        progress.render(0)
        self.assertIn('ETA --:--', output.getvalue())
        clock[0] = 5
        progress.render(256)
        self.assertIn('25%', output.getvalue())
        self.assertIn('51.2 B/s', output.getvalue())
        self.assertIn('ETA 00:15', output.getvalue())
        for second in (10, 15):
            clock[0] = second
            progress.render(256)
        self.assertIn('no progress for 00:10', output.getvalue())
        self.assertIn('0.0 B/s', output.getvalue())
        self.assertNotIn('\r', output.getvalue())

    def test_terminal_progress_stays_on_one_line_with_a_final_newline(self):
        output = Terminal()
        progress = TransferProgress(1024, stream=output)
        with patch('progress.shutil.get_terminal_size', return_value=os.terminal_size((80, 24))):
            progress.render(0)
            self.assertLess(len(output.getvalue().removeprefix('\r\x1b[2K')), 80)
            progress.render(1024, final=True, state='sent; checksum verification next')
        self.assertTrue(output.getvalue().endswith('\n'))
        self.assertIn('100%', output.getvalue())

    def fixture(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = pathlib.Path(directory.name)
        source = root / 'source.bin'
        source.write_bytes(bytes(range(256)) * 8192)
        return root, source

    def test_real_throttled_transfer_preserves_bytes_and_shows_intermediate_progress(self):
        root, source = self.fixture()
        output = Terminal()
        destination = root / 'received.bin'
        code = ('import sys,time\n'
                'with open(sys.argv[1], "wb") as out:\n'
                ' while block := sys.stdin.buffer.read(8192):\n'
                '  out.write(block); time.sleep(.003)\n')
        upload_file([sys.executable, '-c', code, str(destination)], source, stream=output)
        self.assertEqual(destination.read_bytes(), source.read_bytes())
        self.assertGreater(output.getvalue().count('\r'), 3)
        self.assertIn('checksum verification next', output.getvalue())

    def test_failed_receiver_never_reports_success(self):
        _, source = self.fixture()
        output = io.StringIO()
        with self.assertRaises((OSError, subprocess.CalledProcessError)):
            upload_file([sys.executable, '-c', 'import sys;sys.exit(7)'], source, stream=output)
        self.assertIn('failed', output.getvalue())
        self.assertNotIn('checksum verification next', output.getvalue())

    def test_stalled_receiver_times_out_and_is_reaped(self):
        _, source = self.fixture()
        output = io.StringIO()
        processes = []
        spawn = subprocess.Popen
        def record(*args, **kwargs):
            process = spawn(*args, **kwargs)
            processes.append(process)
            return process
        started = time.monotonic()
        with patch('progress.subprocess.Popen', side_effect=record):
            with self.assertRaisesRegex(TimeoutError, 'no progress'):
                upload_file([sys.executable, '-c', 'import time;time.sleep(20)'], source,
                            stream=output, stall_timeout=.3, poll_interval=.02)
        self.assertLess(time.monotonic() - started, 4)
        self.assertIsNotNone(processes[0].poll())
        self.assertIn('failed', output.getvalue())

    def test_cancellation_reaps_receiver_and_finishes_progress_line(self):
        _, source = self.fixture()
        output = Terminal()
        original = TransferProgress.render
        calls = []
        def interrupt(progress, count, **kwargs):
            calls.append(count)
            if len(calls) == 2:
                raise KeyboardInterrupt()
            original(progress, count, **kwargs)
        with patch.object(TransferProgress, 'render', new=interrupt):
            with self.assertRaises(KeyboardInterrupt):
                upload_file([sys.executable, '-c', 'import time;time.sleep(20)'], source, stream=output)
        self.assertIn('cancelled', output.getvalue())
        self.assertTrue(output.getvalue().endswith('\n'))

    def test_remote_verifies_checksum_after_stream_and_retains_ssh_guards(self):
        _, source = self.fixture()
        remote = Remote()
        calls = []
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        def ssh(args, **kwargs):
            calls.append(args[0])
            return subprocess.CompletedProcess(args, 0, (digest + '  upload\n').encode())
        def transfer(args, file):
            calls.append('transfer')
            self.assertEqual(file, source.resolve())
            for guard in ('BatchMode=yes', 'StrictHostKeyChecking=yes', 'IdentitiesOnly=yes',
                          'ConnectTimeout=15', 'ServerAliveInterval=15', 'ServerAliveCountMax=3'):
                self.assertIn(guard, args)
            self.assertIn('set -C', args[-1])
        with patch.object(remote, 'ssh', side_effect=ssh), patch('ops.upload_file', side_effect=transfer):
            remote.upload(source, '/srv/studio/incoming/unique-file')
        self.assertEqual(calls, ['mkdir', 'transfer', 'sha256sum'])
        with patch.object(remote, 'ssh', side_effect=ssh), patch('ops.upload_file', side_effect=TimeoutError):
            calls.clear()
            with self.assertRaises(TimeoutError):
                remote.upload(source, '/srv/studio/incoming/unique-file')
        self.assertEqual(calls, ['mkdir'])

    def test_startup_interruption_reaps_receiver_and_closes_pipe(self):
        _, source = self.fixture()
        output = Terminal()
        processes = []
        spawn = subprocess.Popen
        def record(*args, **kwargs):
            process = spawn(*args, **kwargs)
            processes.append(process)
            return process
        with patch('progress.subprocess.Popen', side_effect=record), \
                patch('progress.threading.Thread.start', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                upload_file([sys.executable, '-c', 'import time;time.sleep(20)'], source, stream=output)
        self.assertIsNotNone(processes[0].poll())
        self.assertTrue(processes[0].stdin.closed)
        self.assertIn('cancelled', output.getvalue())


if __name__ == '__main__':
    unittest.main()
