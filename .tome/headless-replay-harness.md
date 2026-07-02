---
title: Headless Replay Harness (tools/play.cjs)
tags: [tooling, zvm, testing, hints, walkthrough, headless, snapshot, seed]
created: 2026-06-13
updated: 2026-06-14
aliases: [play.cjs, headless harness, headless vm, walkthrough verifier, hint-runner cli, snapshot, --snapshot-in, --snapshot-out, "@char", --seed]
---

# Headless Replay Harness (`tools/play.cjs`)

A Node CLI that drives our **exact** interpreter stack headlessly so we can verify
walkthroughs and probe game mechanics without the browser/web-agent. Built so hint
authoring (Step 3 location verification, Step 3.5 mechanic probing in the
`generate-hints` skill) is a few cheap Bash calls instead of dozens of web-agent
snapshot/screenshot cycles.

```
node tools/play.cjs anchorhead --status -- "look" "e" "se"
node tools/play.cjs <game> --file cmds.txt --quiet   # last turn only
node tools/play.cjs theatre --strict --file theatre.cmds.txt   # halt on first desync
```

## Why it faithfully matches the app

- **Same VM, same Glk.** It loads `docs/lib/zvm.js` + `docs/lib/glkapi.js` + `dialog-stub.js`
  the way the browser does, and only swaps the display layer. ZVM+GlkApi are pure JS; the
  only browser-coupled piece was VoxGlk (the GlkOte display end). The harness provides a
  ~60-line headless GlkOte implementing the same contract VoxGlk does: `init(options)` →
  `options.accept({type:'init',...})`, `update(arg)`, and feeding input back via the stored
  `accept` callback as `{type:'line', gen, window, value, terminator:'enter'}` /
  `{type:'char', ...}`. (This is the "wrapper/contract" to emulate — same protocol the UI uses.)
- **Same location names.** Location is derived with the app's OWN
  `getCurrentLocation()` (dynamic-imported from `auto-mapper.js`), the same function
  VoxGlk feeds `checkLocationChange`. So the names it prints are byte-identical to what the
  auto-mapper records — which is the vocabulary hint `locations` arrays must use
  (see [[hints-system-design]]). It also mirrors the char-mode skip (no location recorded
  during PAK/menu/intro screens).

## Two non-obvious load gotchas

1. **`require()` of zvm.js returns `{}`.** The UMD bundle's CJS branch doesn't expose the
   constructor. Solution: eval the libs in a Node `vm` context that has a `window`, exactly
   like a `<script>` tag, then read `ctx.ZVM` / `ctx.Glk` / `ctx.Dialog`. (`makeInterpreterContext()`)
2. **Cross-realm typed arrays.** ZVM does `new DataView`/`instanceof` against the sandbox
   realm's globals, so the story `ArrayBuffer` must be built INSIDE the sandbox. We pass the
   bytes in as a plain `Array.from(buffer)` (crosses realms cleanly) and do
   `new Uint8Array(__storyArr).buffer` in-context. The GlkOte shim object itself can stay in
   the main realm — cross-realm property reads on the `arg` update object and calling the
   sandbox `accept` with a main-realm event object both work fine.
   - Also shim `global.window`/`CustomEvent` before importing auto-mapper.js: it registers a
     top-level `window.addEventListener('gameLoaded', …)`.

## Why replay-from-start (not save/restore)

Replaying every command from a fresh VM **sidesteps the entire bootstrap-restore bug class**
([[bootstrap-restore-flow]], [[text-decode-corruption]]) — we never call `restore_file()`, so
there is no char-bootstrap, no bufaddr mismatch. To branch-probe ("does X work without doing Y
first?"), change the command tail and re-run. The fresh char-mode intro (Anchorhead's "Press R
to restore; any other key to begin") is dismissed by `advanceCharPrompts()` sending a key until
the prompt returns to line mode. In-game `SAVE`/`RESTORE` are intentionally cancelled (the
fileref prompt is answered `null`) — not needed for replay, and they'd reintroduce the bug class.

### Persistent VM snapshot — SHIPPED (`--snapshot-out`/`--snapshot-in`, 2026-06-14)

Replay-from-start is O(n²) when iteratively extending a long walkthrough: each probe re-runs the
whole verified prefix. The snapshot/restore feature fixes this — snapshot a verified prefix once,
then probe short tails against it.

- **`--snapshot-out <file>`** — after replaying all commands, serialize full VM state to `<file>`
  (JSON). Built directly (not via `do_autosave`) so we skip Dialog.autosave_write's
  localStorage/HTML plumbing: `{ glk: Glk.save_allstate(), io: clone(io), ram: Array(...),
  read_data: clone(read_data), xorshift_seed }`, where `clone` is zvm's own strip-`buffer`/`str`
  recursion replicated in-sandbox. The VM must be paused at a line prompt (the normal
  end-of-replay state) so the saved `pc` resumes cleanly.
- **`--snapshot-in <file>`** — restore instead of fresh-replay, then run the (short) tail.
  Output/location/`--strict`/`--stop-on-death`/`--summary` all behave identically to a full
  replay (validated bit-exact, below).

**How the restore avoids the bootstrap-restore bug class.** We do NOT touch the app's
char-bootstrap save-file path (`restore_file` on a Quetzal blob + dummy `'l'` wake — see
[[bootstrap-restore-flow]]). Instead we drive zvm's **own** `start()` → `do_autorestore` branch,
the Glulx-style full-state path: set `do_vm_autosave: true`, override `Dialog.autosave_read` to
return our on-disk snapshot for the story signature, then call `Glk.init` normally. `VM.start()`
sees the snapshot and calls `do_autorestore` (→ `Glk.restore_allstate` + `restart(1)` +
`restore_file(...,1)`) **instead of** a fresh `restart()`+`run()`. Crucially `restore_allstate`'s
"already launched" guard is satisfied: at `VM.start()` time no fresh window has been opened yet
(the init accept event fires synchronously *into* `VM.start`, which branches to autorestore before
any `open_windows`). And `restart(1)` with the autorestoring flag skips `init_io()`, so no
windows are re-created — `restore_allstate` rebuilt them all. No `Glk.init`-must-not-run problem.

**Three pieces the harness had to add (the reasons it was deferred):**
1. **Headless `GiDispa`** — `Glk.save_allstate`/`restore_allstate` call `get_retained_array`,
   `class_register`, `class_obj_from_id`, `retain_array` *unconditionally* (the browser app runs
   without a GiDispa because `do_vm_autosave:false`, so this whole path was unexercised in our
   build). The harness injects a ~20-line GiDispa into the sandbox: a class→id→obj map +
   retained-array Map. For the Z-machine the retained-array `addr`/`arg` are never read back
   (`do_autorestore` relinks `read_data.buffer` from the restored mainwin's linebuf, and streams 2
   & 4 by rock 210/211), so synthesizing `{addr:0, len, arr, arg:{serialize:()=>null}}` is safe.
2. **Headless `GlkOte.restore_allstate`** — the shim's `save_allstate` returns `{}`; the matching
   `restore_allstate({})` just re-affirms the `accept` callback (no DOM to rehydrate). glkapi
   stashes the (`{}`) glkote sub-state into `gli_autorestore_glkstate` and hands it back as the
   first update's `.autorestore` field — which the shim ignores.
3. **Forced window-geometry refresh** — `restore_allstate` does **not** set `geometry_changed`,
   so the first post-restore `update()` re-emits content+input but **not** the `windows` array,
   and the shim never learns which window is the grid (status) vs buffer → location/status would
   break. Fix: right after the restore boot, the harness sends one synthetic `arrange` event;
   `gli_window_rearrange` sets `geometry_changed`, so the next update carries the full `windows`
   array and the shim classifies windows correctly.

**JSON round-trip is sound** because `Dialog.streaming` is false in our stub: `ram` is already a
plain `Array`, and `clone()` strips the non-serialisable `buffer`/`str` refs. `Glk.save_allstate`
uses `.slice(0)` + `arg.serialize()` throughout — JSON-safe. (The app itself relies on
JSON.stringify of this same snapshot shape in `dialog-stub.js` autosave_write/read.)

**Validation — bit-exact, hard gate (`tools/_snapshot_validate.cjs`).** Against the verified
107-cmd `wishbringer.cmds.txt` (seed 1): Run A = full replay of PREFIX+TAIL; Run B = snapshot the
PREFIX, then `--snapshot-in` + TAIL only. Asserted EQUAL: every tail turn's transcript text, the
per-turn `--status` location line, and the `[SUMMARY]` location/score/status/last (the `turns=`
count differs by design — B counts only the tail). Tail crosses a score gain (`get bone` +1) and
multiple location changes. Also confirmed `--strict` still fires (`STRICT FAIL` on a blocked move)
and `--stop-on-death` doesn't false-trigger, through a restored VM. **Result: PASS.** A separate
107-prefix→5-tail spot check matched location=Park/score=50/last-line exactly, and the snapshot
correctly preserved the `@random` power word (FRATTO) via `xorshift_seed` — RNG state round-trips.

**Caveats.** A snapshot is **seed- and build-specific**: restore with the same `--seed` and the
same game file. (The pc/RAM/stack are tied to the exact story bytes; the RNG continuation to the
seed.)

**Math.random state is snapshot-carried (added 2026-07-02).** Snapshots include `math_rng_state`
(the mulberry32 generator's single uint32 of state) and `--snapshot-in` resumes the stream, so
interpreter-level RNG (zvm's `random()` fallback — NPC wander schedules, word-spins) is bit-exact
between a snapshot-restored tail and a full replay. This closes the divergence class documented
at curses `[austin-alexandria]`/`[sceptre-socket-turn]` ("not snapshot-probeable" — the root cause
of the 4-hour Curses trace runaway: every trial forced a full replay). Validated by snapshotting
at the austin marker and strict-replaying the remaining 819 commands (incl. the empirically-timed
364-z wait) to the win; stripping the field reproduces the old desync at exactly the Austin turn.
Old snapshots without the field restore as before (stream restarts from the seed) — re-cut them
if a probe touches an RNG-dependent scene.

**`@until` directive (added 2026-07-02).** `@until <command> :: <pattern> [:: <max>]` in a cmds
file repeats `<command>` (usually `z`) until the turn's output or status line matches the
case-insensitive regex, up to `<max>` (default 200; exhaustion = strict failure). Recorded as one
turn; count used goes to stderr as `[UNTIL]`. Use for schedule-dependent waits instead of
hardcoded z-counts — self-healing when upstream edits shift the timing, and kills the
derive-wait-counts-by-binary-search workflow. The first "intro" turn of a restored run re-emits the restored scrollback (`win.reserve`,
last ~100 blocks) — harmless, and the validation compares only tail turns. Keep snapshot JSON out
of git (the validator writes to the OS temp dir via `mkdtempSync`).

## `--stop-on-death` and `--summary` (added 2026-06-14)

Two flags that cut the cost of *reading* probe output (the other half of the O(n²) pain):
- `--stop-on-death` halts on the death/win screen (`DEATH_PATTERNS`: the "RESTART, RESTORE or
  QUIT" prompt etc.) and prints `[DEATH] Turn N` to stderr — instead of echoing
  `[game has ended]` for every remaining scripted command. The Z-machine doesn't *exit* on
  death (it prints a restart prompt and keeps requesting line input), so without this a long
  tail produces a wall of dead turns.
- `--summary` appends one line: `[SUMMARY] turns=N location=… status=alive|dead score=S last="…"`.
  Score extraction prefers absolute phrasings ("total score is N" / "N out of M") over the
  incremental "went up by N points" (which would otherwise win as the last regex match —
  the bug that first produced `score=5` instead of `50`).

## `--snapshot-at` and `--cmds` (added 2026-06-14)

Two ergonomics flags born from heavy snapshot-probing of Wishbringer's endgame:
- `--snapshot-at <N | substring | "## marker">` (needs `--snapshot-out`): writes the snapshot
  *mid-replay* — after the Nth command, the first command containing `substring`, or at a `##`
  section marker in the `--file` — then keeps replaying. Collapses the old two-step dance
  (hand-build a prefix file → `--snapshot-out` → `--snapshot-in` the tail) into one pass.
  `## marker` resolution scans the **raw file** (markers are stripped from the command list by
  `loadCommandsFromText`) and snapshots at the last command *before* the marker line — i.e. the
  state as that section begins. Validated **bit-exact** against the manual prefix-file path.
- `--cmds "a ; b ; c"`: one quoted arg split on `;` into commands. Kills the PowerShell
  `@("a","b") | --stdin` array/quoting friction (the source of the `NativeCommandError` /
  "missing terminator" noise) for ad-hoc tails. Appended after `--file`/`--stdin`.

## `--strict` mode — replay desync detection

`--strict` scans each turn's response for "command had no effect" patterns and halts on
the first match, reporting the turn number, the offending command, and the triggering line
to stderr, then exits with code 1:

```
[STRICT FAIL] Turn 171: "s"
  → You can't go that way.
```

Detected patterns (only **parser-level** failures — command didn't parse/apply): "You can't
go that way", "You can't see any such thing", "I don't understand", "I only understood you as
far as", "That's not a verb I recognize", "You don't need to refer to that in this game".

**"Nothing happens" was REMOVED (2026-06-14, Bronze test).** It's authored flavor for
deliberately-inert objects, not a parser failure: Bronze's walkthrough does `TURN IT ON` to a
broken clockwork chessplayer → "you throw the switch hopefully, but nothing happens -- the
switch flops loosely back... connected to nothing." That's an intended story beat. **Rule:
strict mode flags only parser-level failures (the command couldn't parse/apply), never
game-level "no effect" responses, which are routinely intended.**

**False-positive note:** Avoid patterns that appear in room *descriptions* — e.g. "but you
can go back to the X" is used by Theatre's Narrow Hallway as part of its room text, not as
a failed-movement response. The canonical failure phrase for blocked directions is
"You can't go that way." which never appears in descriptions.

**A strict hit is a flag to *judge*, not auto-fail — three causes (all seen in practice):**
- **Build drift** — the walkthrough's command genuinely doesn't work on our build (the real win).
- **Walkthrough artifact** — the author left a dead command that fails gracefully then self-corrects.
  Bronze: `LOOK UP IVORY IN NOTES` fails ("can't see any such thing") because the notes aren't
  there yet — the next lines are `GO TO THE NOTES` / `GET NOTES`. Not our-build-specific; prune the line.
- **Missing prerequisite** — e.g. `examine plans` needed before `kick south wall` in Theatre; or an
  extra direction command after already arriving.

**Verified clean (full walkthrough trunk, exit 0):** Anchorhead Day 1, Bronze (R11/060503, 408-cmd
trunk to the gong choice point, ~49 locations).

## Game-file extension auto-resolution

`resolveStory()` tries extensions `.z5`, `.z8`, `.z3`, `.z4`, `.z6`, `.z7`, `.zblorb`, `.blorb`
in that order, so bare names work for any format:
```
node tools/play.cjs theatre   # finds docs/games/theatre.z5
node tools/play.cjs anchorhead   # finds docs/games/anchorhead.z8
```
Pass a full path or a name with extension to bypass the search.

## Seeded RNG — reproducible randomized puzzles (`--seed`, default 1)

ZVM's `random()` falls back to `Math.random()` when the game hasn't seeded it (most games,
incl. Anchorhead). The harness injects a deterministic `Math.random` (mulberry32) into the
sandbox, so randomized puzzles become **stable across runs** — which is what lets a walkthrough
that passes such a gate be replayed and `--strict`-verified at all.

- **Default is `--seed 1`** (deterministic). Verified Anchorhead: seed 1 → safe combination is
  always `1-32-59` (read from the torn journal). Bake the resulting `turn the dial to 1/32/59`
  into the cmds file; it replays forever *with the same seed*. Note the seed at the top of the
  `.cmds.txt`.
- `--seed <n>` picks another seed; `--random` restores true per-run `Math.random` (what a real
  player gets).
- **Crucial for hint content:** the seed only makes *our verification* reproducible. A real
  player in the app gets a real-random value, so hint *content* must still teach the **method**
  ("dial the number from the journal"), never the seeded value (`1-32-59`).

## Interactive readers wedge replay (and `--strict` now catches it)

Some commands open a char-input pager/reader that consumes subsequent line commands and never
returns to a line prompt — Anchorhead `read clippings`, Theatre `read pages` (the latter wants
`Q` to resume). Symptom: every command after it prints `[no line-input prompt available]` and
the location freezes. **`--strict` now treats `[no line-input prompt]` as a failure** (it used
to silently pass — a false green caught on Anchorhead Day 2, 2026-06-14).

**Drive them with `@char` directives in the cmds file** (added 2026-06-14). A line
`@char <key> [count]` sends raw CHARACTER input instead of a line — `<key>` is a single char
or a Glk special name (`return`, `space`, `escape`, `up`, …). When the line *before* an `@char`
opens a reader, the harness suppresses its usual single-key auto-dismiss and lets the `@char`
lines drive. Anchorhead clippings example (in `anchorhead.cmds.txt`):
```
read clippings
@char return 40     # page through all clippings (cyclic reader; return = next page)
@char q             # quit the reader back to the line prompt
```
Theatre `read pages` → `@char q`.

**Don't assume a reader is droppable lore — it may set game state.** Anchorhead's clippings
teach the Verlac family names (Mordecai/Elijah/…) that the parser later gates `look up X in
record` on; `@char q` *immediately* (quitting after page 1) only learns the first name. You must
page (`@char return N`) far enough to display each clipping, then `q`. So readers can be genuine
progress gates — drive them, don't drop them, unless you've confirmed they're pure flavor.
(Reaching a reader's content via a *cyclic* pager: overshoot the page count; re-displaying is
harmless.)

## Limits / caveats

- The buffer includes glkapi's line-echo of the typed command (standard Glk behavior); the CLI
  also prints a `> cmd` header, so the command appears twice. Harmless for verification.
- It's a dev tool: not wired into the app, not in the service worker, not version-bumped.
