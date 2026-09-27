# Deployment upload progress

## Goal

Show tqdm-style feedback during `make collab-deploy`; explain the apparent hang
after `Desktop PDFs: ...`; handle the user's Ctrl-C traceback cleanly.

## Files inspected

Required agent docs; `scripts/collab/{ops,host,evidence_sync}.py`, Makefile,
deployment README, operation/evidence tests and the user's interruption traceback.

## Files changed

- New `scripts/collab/progress.py` and `tests/test_progress.py`.
- `scripts/collab/ops.py`: streaming upload, shared guarded SSH options, transfer
  stage labels, unbuffered server entrypoint and clean KeyboardInterrupt exit.
- `scripts/collab/host.py`: flushed setup/deployment/backup phase messages.
- Deployment README and agent current state/log/repo map/this handoff.

Earlier source/PDF feature changes and unrelated user work remain untouched.

## Behavior

The completed local PDF-count message preceded an SSH `cat` upload whose stdin
was a file and whose output was silent. The user's traceback confirms this was
the active step when interrupted; deployment had not started.

Upload now feeds SSH in bounded chunks on a background thread while the main
thread updates bytes, percent, rolling speed and ETA about five times per second.
TTY output overwrites one line; redirected logs get a line every five seconds.
No progress for 180 seconds fails the transfer, with receiver termination/reaping.
Ctrl-C finishes the progress line and exits 130 without a Python traceback.
SSH setup has ConnectTimeout=15 and keepalives every 15 seconds, maximum three
unanswered. Identity, strict host-key and noninteractive authentication policy
are preserved. The remote staging file is still exclusively created (no overwrite).

Counts measure bytes handed to SSH, not acknowledged disk writes. Reaching the
byte total reports waiting/verification; SSH must exit successfully and the
remote SHA-256 must match before deploying. Build/backup/migration/import/health
steps print their phase, with existing tool output; no whole-deploy ETA is claimed.

## Commands and validation

- `python3 -B -m unittest discover -s scripts/collab/tests -p test_progress.py -v`:
  seven initial focused cases passed, covering ETA/log behavior, terminal layout, actual throttled
  binary transfer, receiver failure, stalled receiver termination, cancellation
  and SSH/checksum sequencing.
- `python3 -B -m unittest discover -s scripts/collab/tests -q`: combined operation,
  evidence, importer and progress suite: **34 passed**, including an eighth
  progress case for interruption during sender startup.
- `git diff --check`: passed whitespace review.
- No real SSH upload, server operation or deployment was performed.

## What worked / failed

Local throttled transfer preserves every byte and shows intermediate progress.
Failed/stalled receivers do not report success or reach checksum/deployment;
cancellation exits promptly. Initial test assertion compared macOS `/var` and
resolved `/private/var` paths; corrected the fixture assertion to resolve both.
Independent review reproduced an interruption during thread startup that left
the receiver running. Startup now runs inside cleanup protection; its regression
checks that the receiver is reaped and its input pipe closed.
Sandbox process-list inspection was unavailable, so no claim is made about the
network speed or process state before the user's own interruption.

## Remaining questions

The actual cause of the slow link is unmeasured. This change exposes throughput
and stalls, without promising faster networking or resumable uploads. An
interrupted upload may leave its uniquely named private staging file. Local
progress takes effect on the next command; remote phase labels require a
published `STUDIO_REF` containing the updated host script. All earlier feature
work is still local/uncommitted. This task did not publish or deploy it.

## Suggested next prompt

Run the intended published Studio ref with `make collab-deploy` and inspect the
upload speed/ETA; if it stalls, diagnose the displayed phase and exact error.
