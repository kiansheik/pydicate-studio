# What the desk is actually used for — 30 days of recorded use

Source: the local usage log written by `electron/usage-service.cjs`, read with
`npm run usage -- --days 30`. Period 2026-08-25 → 2026-09-24, though every record falls in
2026-09-19 → 2026-09-24. **64 897 events, 9 sessions, 24 rotated files, 0 unreadable lines.**

A caveat that governs everything below: this is one person's working log, and absence of an
event proves only that the instrumented control was not clicked in this window. It does not
prove the control is useless. Every control named here stays reachable; nothing was deleted.

Of the 64 897 events, 63 162 come from the main process (engine calls, polling). The 1 735
renderer events are the ones that describe a person operating the desk, and this report is
built on those.

## The controls that carry the work

| Recorded UI action | Count | Where it lives |
| --- | ---: | --- |
| `editor.operation` (all canvas + tree edits) | 551 | Expression canvas, runtime tree |
| `editor.batch` — debounced save of an edit | 406 | 379 of 406 (93%) carry `field=canvas,raw` |
| `lexicon.search` | 291 | `LexicalInput` (164 rendered-form, 127 dictionary) |
| `navigation.passage` | 261 | Passage list + header arrows |
| `review.status` | 81 | "Concluir passagem" / workflow select |
| `lexicon.select` | 74 | `LexicalInput` |

Broken out by action, the canvas is the whole job:

| Action | Count |
| --- | ---: |
| `canvas.position` (drag a piece) | 166 |
| `canvas.add` | 73 |
| `canvas.combine` | 56 |
| `canvas.replace` | 29 |
| `canvas.remove` | 22 |
| `canvas.connect` | 21 |
| `canvas.detach` | 19 |
| `tree.pan` / `tree.zoom` / `tree.select` | 22 / 16 / 16 |
| `canvas.duplicate` / `canvas.make-main` / `canvas.unwrap` | 4 / 3 / 1 |

`project.refresh` (93) is an external-change reload, not a click.

### The loop, from the sequence data

The three most frequent action triples within 90 s are, in order:

1. `lexicon.search → lexicon.search → lexicon.search` (131)
2. `editor.batch → canvas.position → editor.batch` (122)
3. `navigation.passage → navigation.passage → navigation.passage` (117)

and the editing spine is `lexicon.search → lexicon.select → canvas.add → editor.batch`
(72, 70). Two things follow. First, **search-then-place is the core gesture**, and it is
already one step: 73 of 74 `lexicon.select` events are followed immediately by
`canvas.add`, so picking a lexeme already places it — there is no redundant confirm to
remove. Second, **passage review runs in streaks**: `review.status → navigation.passage →
review.status` occurs 50 times, and the combined "Concluir passagem" button that marks a
passage and advances is doing its job (81 uses).

## The controls that recorded no use at all

Every one of these is instrumented, so a zero is a measured zero, not a gap in the log.

| Control | Count | Where |
| --- | ---: | --- |
| "Contribuir uma leitura" mode | 0 | Mode bar |
| "Revisar" mode | 0 | Mode bar |
| Projections *Construção*, *Morfemas*, *Histórico*, *Código* | 0 | Tab bar (7 tabs, 3 ever visited) |
| Theme toggle (`ui.theme`) | 0 | Header |
| Usage export (`usage.export`) | 0 | Activity panel |
| Window docking: toggle / move / maximize / reset | 0 | "Janelas" toolbar |
| Canvas reading direction (`canvas.layout`) | 0 | Canvas options row |
| Runtime tree search | 0 | Tree toolbar |
| Runtime tree SVG export (`tree.export`) | 0 | Tree heading |
| Tree "Ajustar" (`tree.fit`), "Visão geral" (`tree.overview`) | 0 | Tree options row |
| `editor.redo` | 0 | (undo: 10) |

Mode switching happened 24 times in a month, all of it `analysis ↔ lexicon` (18) and
`analysis ↔ dictionary` (6). Projection switching happened 6 times, among *Árvore*,
*Sugerir* and *Tradução* only. Two of six mode buttons and four of seven tabs were never
opened.

### The search fields

There are four search inputs. They are not used alike:

| Field | Uses | Verdict |
| --- | ---: | --- |
| `LexicalInput` (lexeme/dictionary) | 291 | The one that matters |
| Canvas "Encontrar nesta composição…" | 10 | Marginal, kept |
| Passage-list filter | 2 | Barely used, though passages are navigated 261 times — the list is scrolled and arrowed, not searched |
| Runtime tree "Buscar na árvore" | 0 | Never used |

Lexical search converts well from the rendered-form side (62 selects from 164 searches,
38%) and poorly from the dictionary side (12 from 127, 9%). 25 of 291 searches returned
nothing.

## What was changed

The principle: the default desk carries what the log shows in constant use; everything else
moves behind one switch, **Ferramentas avançadas**, off by default, in a new "Mais
ferramentas" header menu. Nothing is removed and nothing becomes unreachable — the menu
also carries the entry points that left the header, so a first-run reader can still find
them.

1. **Mode bar**: 6 buttons → 4. "Contribuir uma leitura" and "Revisar" are secondary.
2. **Tab bar**: 7 projections → 3 (*Árvore*, *Sugerir*, *Tradução*). The other four are
   secondary. Turning the switch off while on a hidden tab returns to *Árvore*.
3. **Header**: *Aprender*, *Referência*, *Atividade* and the theme toggle move into the
   overflow menu, leaving the project switcher, help and "Abrir projeto".
4. **"Janelas" toolbar** (0 uses): secondary. Panes stay draggable and resizable regardless.
5. **Runtime tree**: its never-used search field and SVG export are secondary, as are
   "Expandir tudo", "Visão geral" and the reference/realisation toggles (5 uses between
   them).
6. **Canvas reading direction** (0 uses): secondary. The canvas search stays.
7. **Context menu reordered by measured frequency.** It led with "Perguntar à IA" and
   "Adicionar operação"; the three most-used structural edits sat at positions 8, 10 and
   11 of 14. New order: Conectar ou trocar (50 recorded connect+replace) → Remover (22) →
   Soltar (19) → the operation builders → AI and meaning → the rare tail.
8. **Keyboard shortcuts for the frequent tree edits**, alongside the existing ⌘Z / ⌘D / ⌫:
   `C` connect or swap, `E` detach, `A` add a piece. They run the same code path as the
   menu items, which now show the hints.
9. **Alt+←/→ moves between passages**, since passage navigation is the second most
   frequent recorded action and runs in streaks of three or more.

## Deliberately not changed

- **`canvas.position` (166) is not waste.** Each drag emits a position event and then the
  debounced `editor.batch` that saves it, which is why `canvas.position → editor.batch`
  appears 148 times. Dragging is how a tree gets laid out; there is no redundant click here.
- **Lexeme select → place** is already a single step, as measured above.
- **The passage-list search** stays in place despite 2 uses: passage navigation is heavy and
  the field costs one row.

## Worth watching next

- `bridge.failure / BRIDGE_FAILED` fired 20 times, all on `studio:save-drafts` — the most
  frequent error in the period, and it sits on the save path.
- `operation.analysis_list` has a p95 of 819 ms and a recorded maximum of 901 s across
  24 550 calls; it is also 76% of all events, which is worth revisiting as polling cost.
- `operation.evaluate_expression` failed 9 times with `STALE_ENGINE`.
- `ui.tools` was added to the allowed UI events so the new switch is itself measurable. Re-run
  `npm run usage -- --days 30` after a few weeks to see whether the secondary set is ever
  turned on, and which of the hidden controls get pulled back.
