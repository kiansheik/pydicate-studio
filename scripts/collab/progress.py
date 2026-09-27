"""Dependency-free upload progress; byte ETA never claims a deployment ETA."""
from __future__ import annotations

from collections import deque
import contextlib
import pathlib
import shutil
import subprocess
import sys
import threading
import time


def size(value):
    for unit in ('B', 'KiB', 'MiB', 'GiB', 'TiB'):
        if value < 1024 or unit == 'TiB':
            return f'{value:.1f} {unit}'
        value /= 1024


def duration(seconds):
    if seconds is None:
        return '--:--'
    seconds = max(0, int(seconds))
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f'{hours:d}:{minutes:02d}:{seconds:02d}' if hours else f'{minutes:02d}:{seconds:02d}'


class TransferProgress:
    def __init__(self, total, *, stream=None, clock=time.monotonic):
        self.total = total
        self.stream = stream if stream is not None else sys.stderr
        self.clock = clock
        self.started = clock()
        self.last_render = None
        self.last_change = self.started
        self.transferred = 0
        self.samples = deque([(self.started, 0)])
        self.tty = self.stream.isatty()

    def render(self, transferred, *, state=None, final=False):
        now = self.clock()
        if transferred != self.transferred:
            self.last_change = now
        self.transferred = transferred
        if not final and self.last_render is not None and now - self.last_render < (.2 if self.tty else 5):
            return
        self.samples.append((now, transferred))
        while len(self.samples) > 2 and self.samples[1][0] < now - 5:
            self.samples.popleft()
        start, count = self.samples[0]
        rate = (transferred - count) / max(.001, now - start)
        remaining = max(0, self.total - transferred)
        eta = remaining / rate if rate > 0 else (0 if remaining == 0 else None)
        percent = min(1, transferred / self.total) if self.total else 1
        timing = f'[{duration(now - self.started)}<ETA {duration(eta)}]'
        details = f'{size(transferred)}/{size(self.total)} {size(rate)}/s {timing}'
        columns = shutil.get_terminal_size((120, 20)).columns
        width = max(2, min(20, columns - len(details) - 17)) if self.tty else 20
        completed = int(width * percent)
        bar = '#' * completed + '-' * (width - completed)
        idle = now - self.last_change
        status = state or ('awaiting remote completion' if remaining == 0 else
                           f'no progress for {duration(idle)}' if idle >= 5 else 'uploading')
        line = f'Upload {percent:3.0%} |{bar}| {details}'
        if status != 'uploading':
            # Separate status lines keep stalled/confirmation messages visible
            # even in narrow terminals without wrapping the updating bar.
            line = f'Upload {percent:3.0%} |{bar}| {details} — {status}' if not self.tty or final else f'Upload {percent:3.0%} {status} {timing}'
        if self.tty and not final:
            line = line[:max(1, columns - 1)]
        self.stream.write(('\r\x1b[2K' if self.tty else '') + line + ('\n' if final or not self.tty else ''))
        self.stream.flush()
        self.last_render = now


def upload_file(args, source, *, stream=None, stall_timeout=180, poll_interval=.1):
    """Feed SSH while the main thread keeps progress and cancellation responsive.

    Counts bytes accepted by the SSH pipe; success additionally requires SSH's
    exit status. The caller verifies the remote SHA-256 before starting deploy.
    A stalled transfer is confined to a new staging file, never a live release.
    """
    source = pathlib.Path(source)
    total = source.stat().st_size
    progress = TransferProgress(total, stream=stream)
    progress.render(0)
    process = None
    transferred = 0
    last_change = time.monotonic()
    failures = []

    def send():
        nonlocal transferred, last_change
        try:
            with source.open('rb') as incoming:
                while block := incoming.read(64 * 1024):
                    remaining = memoryview(block)
                    while remaining:
                        written = process.stdin.write(remaining)
                        if not written:
                            raise BrokenPipeError('SSH stopped accepting upload data.')
                        transferred += written
                        last_change = time.monotonic()
                        remaining = remaining[written:]
        except Exception as error:
            failures.append(error)
        finally:
            with contextlib.suppress(OSError):
                process.stdin.close()

    sender = threading.Thread(target=send, name='studio-upload', daemon=True)
    try:
        process = subprocess.Popen([str(arg) for arg in args], stdin=subprocess.PIPE, bufsize=0)
        sender.start()
        while process.poll() is None:
            progress.render(transferred)
            if time.monotonic() - last_change >= stall_timeout:
                raise TimeoutError(f'Upload made no progress for {stall_timeout:g}s; stopped before checksum verification.')
            if failures:
                raise failures[0]
            try:
                process.wait(timeout=poll_interval)
            except subprocess.TimeoutExpired:
                pass
        sender.join(timeout=2)
        if process.returncode:
            raise subprocess.CalledProcessError(process.returncode, args)
        if failures:
            raise failures[0]
        if sender.is_alive() or transferred != total:
            raise OSError('Upload ended before the complete file was sent.')
        progress.render(transferred, state='sent; checksum verification next', final=True)
    except BaseException as error:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if sender.ident is not None:
            sender.join(timeout=2)
        if process is not None and not sender.is_alive():
            with contextlib.suppress(OSError):
                process.stdin.close()
        progress.render(transferred, state='cancelled' if isinstance(error, KeyboardInterrupt) else 'failed', final=True)
        raise
