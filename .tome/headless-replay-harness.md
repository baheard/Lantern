---
title: Headless Replay Harness (tools/play.cjs)
tags: [tooling, zvm, testing, hints, walkthrough, headless]
created: 2026-06-13
updated: 2026-06-13
aliases: [play.cjs, headless harness, headless vm, walkthrough verifier, hint-runner cli]
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

## `--strict` mode — replay desync detection

`--strict` scans each turn's response for "command had no effect" patterns and halts on
the first match, reporting the turn number, the offending command, and the triggering line
to stderr, then exits with code 1:

```
[STRICT FAIL] Turn 171: "s"
  → You can't go that way.
```

Detected patterns: "You can't go that way", "You can't see any such thing", "I don't
understand", "I only understood you as far as", "That's not a verb I recognize",
"You don't need to refer to that in this game", "Nothing happens".

**False-positive note:** Avoid patterns that appear in room *descriptions* — e.g. "but you
can go back to the X" is used by Theatre's Narrow Hallway as part of its room text, not as
a failed-movement response. The canonical failure phrase for blocked directions is
"You can't go that way." which never appears in descriptions.

**Typical desync root causes found in practice:**
- Extra direction command (e.g. an extra `s` after entering a room that's already the destination)
- Missing prerequisite action (e.g. `examine plans` needed before `kick south wall` in Theatre)

## Game-file extension auto-resolution

`resolveStory()` tries extensions `.z5`, `.z8`, `.z3`, `.z4`, `.z6`, `.z7`, `.zblorb`, `.blorb`
in that order, so bare names work for any format:
```
node tools/play.cjs theatre   # finds docs/games/theatre.z5
node tools/play.cjs anchorhead   # finds docs/games/anchorhead.z8
```
Pass a full path or a name with extension to bypass the search.

## Limits / caveats

- **Randomness isn't reproducible.** `@random` is clock-seeded, so Anchorhead's randomized
  puzzles (safe combination, flute-hole attunement, mirror measurement) differ each run — read
  the game's own in-run clue, never hardcode a value into a hint.
- The buffer includes glkapi's line-echo of the typed command (standard Glk behavior); the CLI
  also prints a `> cmd` header, so the command appears twice. Harmless for verification.
- It's a dev tool: not wired into the app, not in the service worker, not version-bumped.
