# Contributor feedback and observed usage — 29 September 2026

Read-only production review of Kian, Emerson and Lauro, plus the local desktop
profile. No deployment, account change, AI generation, corpus edit or grammar edit.
The pasted prior-agent report concerns unfinished Claude runtime/deployment work;
that is separate from this interface review and remains untouched.

## What the records actually show

Hosted PostgreSQL `audit` joined to `users`, last seven days, sampled around
2026-09-30 02:42 UTC (29 September in Brazil). Browser events were analyzed
separately from server requests. Names below are the requested account labels;
Kian's recovery account was excluded from behavioral comparisons because it also
contains deployment QA. No emails, credentials, queries or passage text were read.
The accounts were still active, so successive queries are nearby snapshots.

| Recorded browser action | Kian | Emerson | Lauro |
| --- | ---: | ---: | ---: |
| Search events | 107 | 44 | 100 |
| Select search result | 31 | 10 | 18 |
| Add canvas piece | 33 | 10 | 19 |
| Combine pieces | 22 | 5 | 12 |
| Connect pieces | 4 | 7 | 5 |
| Move canvas piece | 140 | 15 | 13 |
| Remove piece | 12 | 4 | 4 |
| Navigate passage | 133 | 11 | 5 |
| Resize pane | 6 | 11 | 3 |
| Change operator | 0 | 1 | 0 |

A subsequent snapshot counted 774/195/289 browser events across 54/7/9 distinct
passage IDs respectively. These are events, not individual clicks, sessions,
active hours, editorial contributions, or successful tasks. Search emits after a
debounce and may query both reuse and dictionary services. Edit batches include
programmatic consequences of direct edits. Desktop data is separate: 7,112 events
in 11 recorded sessions, including background polling and request start/end pairs;
234 passage navigations, 192 editor operations, 80 searches and 20 selections.
It is not attributable to a hosted account and was not added to these totals.

Frequent adjacent browser events for the same user within two minutes:

- Lauro: search → search 78; search → select 14; select → add 14.
- Emerson: search → search 30; search → select 9; select → add 9.
- Kian: passage → passage 104; search → search 73; search → select 22;
  move piece → edit batch 120.

These are chronological neighbors, not proven task funnels: simultaneous tabs
are not separated. Repeated searches can mean exploration, typing, or unsuccessful
lookup. Search-to-select ratios are not conversion rates. No recorded workspace
reset was found for these three accounts; that does not justify removing it.
Lauro used maximize and docking six times each, contrary to an older source
comment suggesting no docking use. Preserve those controls in advanced mode.

## Decisions and implementation

1. Basic mode must keep panes reachable. Hide close/docking controls, ignore saved
   hidden flags while basic mode is active, and use the standard arrangement
   without overwriting saved advanced positions. Keep resizing/maximizing. At
   widths up to 1100 px show one pane with explicit Passagens / Editor / Fonte
   navigation; these switches also remain available for a maximized basic pane.
2. Let the passage list use available pane height, with a vertical scrollbar and
   a 100 px minimum; very short panes can scroll their containing navigator too.
   Remove decorative navigator headings/footer, compact controls, wrap reading
   text, and override the old mobile horizontal strip. Source/search/filter/add
   controls remain available. Browser checks cover 1280×720, 1024×768, 800×600,
   and 640×480; this is not contributor-device acceptance.
3. Operator changes deserve a named entry. A selected binary connection now has
   **Editar operador…**, and its context menu names **Trocar operador / editar
   esta parte**. Opening that editor reveals the existing connection controls
   first, scrolls them into view and focuses the selector. Existing exact-span
   replacement/preview behavior remains in use; deletion/recreation is unnecessary.
4. Explain grammar versus tree repair beside the choice, and give guidance in the
   explanation field. Explain that `.var(n)` selects grammar behavior rather than
   creating a literal output. This helps discoverability but does not implement a
   new variant authoring system.
5. Clarify Neo login: the 15-character minimum applies to a local Studio password.
   Existing Neo sign-in does not require a password change or a second password.
   Neo's profile/password UI was not modified or tested.
6. Fix the narrow telemetry gap for future evidence: hosted sanitization was
   discarding `from`/`to`, search `source`/`category`, `reused`, and `resultCount`.
   Only known destination/source/category vocabularies, booleans and bounded
   counts are now retained. Search text remains excluded. This cannot recover
   historical missing fields and takes effect only after deployment.

## Feedback still needing evidence or design

- Apostrophe lookup: with the current local corpus/engine, real `structure_search`
  for both `'u` and `’u` returns reference `u`, surface `'u`, as the first exact
  match (74 total results in this snapshot). The underlying lexicon search also
  finds it. Emerson's hosted failure is not reproduced; its exact source/context,
  live index and UI result selection need checking. Do not remove glottal stops
  from linguistic matching as a workaround.
- Different terminal appearance: shared lexical references and inline constructor
  pieces are different representations. Reuse should stay prominent. The exact
  two pieces from the conversation were not captured, so their appearance or
  output difference is not diagnosed here.
- `o'useî`, `o'useîbora`, `atara`, and the proposed nasalizing `mo.var(2)` concern
  exact trees and engine behavior. No linguistic rule, literal substitution or
  historical claim was introduced. A future variant workflow should capture
  selected scope, variant number, intended form, explanation, source/hypothesis,
  and unchanged comparison cases together, while retaining explicit submission.
- The AI's statement about missing approved evidence is not itself proof that it
  failed to inspect the source. Investigate the actual job/tool receipts and
  attached evidence before changing provenance safeguards.
- There are no viewport/aspect-ratio measurements or reliable task/session IDs in
  these records. No claim about most users' screens or time spent follows from
  this sample. No feature is classified as globally unused.

## Reproducing the aggregates

Run against the existing Studio database through read-only SSH/psql. Use
`BEGIN READ ONLY;` and `COMMIT;`, never a research export (which records an export).
The account filter below excludes recovery and unrelated accounts.

```sql
SELECT u.name, a.event, a.metadata->'ui'->>'action' AS action, count(*) AS n
FROM audit a JOIN users u ON u.id=a.user_id
WHERE a.origin='browser' AND u.name IN ('Kian','Emerson','Lauro')
  AND a.at > extract(epoch FROM now()-interval '7 days')*1000
GROUP BY u.name,a.event,action ORDER BY u.name,n DESC;
```

For chronological pairs, compute `lag(event || coalesce(':' ||
(metadata->'ui'->>'action'),''))` and `lag(at)` partitioned by `user_id`, ordered
by `at,id`, over the same browser/time/account filter; then count pairs with
`at - previous_at < 120000`. Local desktop: `node scripts/usage-report.cjs --days 7`.
