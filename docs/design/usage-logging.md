# Local usage history

Studio keeps a local, bounded history of actions and failures so contributors can understand use across sessions and compare application revisions. Logging does not call an AI provider or send telemetry. Recording starts when the desktop application opens. The interface exposes whether recording is enabled, its storage location, an optional contributor label, summaries and a JSONL export. Disabling recording persists across restart. Labels are explicitly supplied by the user; the application never derives a name from an account or operating-system username.

The main-process service is `electron/usage-service.cjs`. The desktop supplies `directory = path.join(app.getPath('userData'), 'usage')`, `appVersion`, and a hash identifying the current application build. Each record carries schema version 1, ISO timestamp, a fresh session UUID, a persistent random installation UUID, application version/build identity, and optional project/passage/revision/request correlation. The installation ID is local and is not an account or device identifier obtained from outside Studio. Explicitly exported records contain it so sessions from one installation can be compared.

## Recorded data and boundaries

Events describe navigation, projection/mode changes, explicit editing operations, compact edit batches, save/review/source operations, worker and provider lifecycle phases, and errors. Durations are elapsed operation measurements; session first/last timestamps do not measure active attention. The renderer submits only known UI event names through `recordUi`; main-process code uses constrained dotted event names through `record`. The event schema accepts correlation identifiers, categorical outcome, elapsed milliseconds, and a short allowlist of categorical/count/boolean details. Unknown fields and nested payloads are discarded.

Source text, transcription, translation, prompts, provider responses, dictionaries, PDF contents, credentials and per-keystroke text are not event fields. Call sites must pass categories/counts, never authoring or provider payloads. `errorMessage` is a bounded diagnostic field for generic failures, not a place for full stack traces or source excerpts. Common credential formats, bearer tokens, key/token/password assignments, URLs, personal paths and email addresses are scrubbed as a second boundary. No automatic redactor can identify every possible secret embedded in arbitrary prose; do not submit arbitrary prose. Provider output and scholarly text remain in their existing explicit draft/provenance stores rather than this log.

Allowed detail keys are defined in `DETAIL_KEYS`: operation/provider/model/mode/view/phase/method/source/status/reason/category/scope/field, error code and bounded scrubbed diagnostic, build/engine identity, counts and simple booleans. Correlation values containing path separators or unusual characters become stable hashes. Edit batches report edit counts and character-count changes, never the changed text. The user can inspect exported records before sharing them with another person or agent.

## Durability and retention

The service serializes writes, appends one JSON record per line, and syncs the file before acknowledging the append. `events.jsonl` rotates at 1 MiB; at most 24 matching log files are retained (about 24 MiB, with a possible final record crossing a custom test limit). Files are mode `0600`; the directory is created as `0700`. Rotation affects only this service's exact log filename pattern. Settings use an atomic temporary-file rename. A graceful close appends `session.end`; an interrupted session may legitimately have no end event.

An incomplete final line is preserved and separated from later records at startup. Readers skip malformed records and show the number of unreadable lines. They do not silently report them as successful actions. Malformed settings remain intact and disable new recording until explicit reactivation; that action preserves the malformed settings as a separate recovery file. Storage errors surface through service status and must not interrupt authoring. Retention is size based: the default report window can contain gaps if logging was disabled or older files were rotated out.

## Read-only analysis

From the repository:

```sh
node scripts/usage-report.cjs
node scripts/usage-report.cjs --days 30 --json
node scripts/usage-report.cjs --directory /path/to/profile/usage --days 7 --export
```

The default is the last seven days under the usual Electron `pydicate-studio/usage` application-data directory. A custom Electron profile requires `--directory`, using the path displayed by Studio. `--json` emits a machine-readable summary; `--export` prints sanitized versioned JSONL to standard output. These commands read existing logs only, do not start Studio, and never use provider quota.

The report includes action counts, session/app/build grouping, error groups with affected passage/request IDs, operation median/p95/maximum durations, frequent consecutive UI transitions, consecutive repeated actions within 30 seconds, and passage returns A → B → A within two minutes. Request summaries group events by both session and request ID, retaining first/last timestamps, phase sequence, last recorded outcome, and the latest supplied elapsed measurement (`lastMeasuredDurationMs`). Two requests for the same passage remain distinct. A last observed `started` outcome means no terminal outcome was retained in the selected window; it does not prove the request is still running. These are observations to investigate alongside a contributor's intent. Repetition does not prove a wasted action; a return does not prove confusion; a long observed session span does not prove active working time. The JSONL export retains chronological evidence for more detailed manual analysis and cross-session comparison.

## Service contract

`createUsageService({directory, appVersion, buildId?})` returns:

- `record(event)`, `recordUi(event)`: queued append with `{recorded, sessionId?, at?, reason?}` acknowledgement.
- `status()`: enabled/label/session/installation/storage limits/location/retained size, malformed-line count and latest storage error.
- `configure({enabled?, profileLabel?})`: persistent explicit preferences.
- `report({days = 7})`: the aggregation above, without raw authoring content.
- `export({days = 7})`: `{filename, content}` for a user-initiated JSONL download.
- `close()`: flush outstanding writes and record graceful session end.

Every operation is asynchronous. Main-process integration catches logger failures independently from the operation being observed and exposes `status().lastError`; successful save or evaluation must not become a failure because diagnostic storage is unavailable. `close()` belongs in the desktop's graceful-quit path.

`electron/tests/usage.test.cjs` covers restart/build identity, concurrent append ordering, file permissions, bounded rotation, unrelated-file preservation, malformed tail/settings recovery, preferences, payload omission, common-secret redaction, request correlation across lifecycle phases and sessions, sequence/latency/error aggregation and read-only CLI operation. The tests use temporary directories and no AI generation.
