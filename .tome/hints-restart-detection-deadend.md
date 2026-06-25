# Detecting in-game RESTART to reset hints — counters fail, VM hook wins

**Goal:** "Reset game data" and "Restart" should wipe a game's hint state (4 keys:
`lantern_hints_<g>`, `lantern_hints_seen_<g>`, `lantern_hints_qseen_<g>`,
`lantern_hints_milestone_<g>`). The panel's "Reset revealed hints" deliberately leaves
`seen`/`qseen` alone (so visited sections stay un-blurred), which is why visited categories
still showed as available after a reset — working as designed, just confusingly named.

## No COUNTER can detect a typed in-game RESTART

A typed `restart` resets the Z-machine world in place — no page reload, no localStorage write.
Both counters we have fail:

- **`generation`** (passed to `auto-mapper.checkLocationChange`) is GlkOte's display-update
  generation — monotonic, never resets on RESTART. Not the move count.
- **`state.appMoveCount`** (`state.js`) is incremented per autosave (`save-manager.js`),
  restored from saves. After a RESTART it keeps climbing; the ONLY thing that moves it
  backward is `performRestore` (= RESTORE), which is exactly the case we must NOT treat as a
  restart. It points the wrong way. (It exists because games like Anchorhead print no
  "Moves: N" field — see `drive-sync-design.md`.)

Also rejected: intercepting the typed `restart` STRING at the input layer (command-router) —
too blunt. "restart" can be a death-screen prompt answer, a char-mode key, etc.; we'd hijack
the game's own restart UX.

## The clean signal: hook `vm.restart(autorestoring)`

`zvm.js`: the `@restart` opcode (#183) emits `e.restart()` with **no argument**; the RESTORE
path calls `this.restart(1)`. So `!autorestoring` is an EXACT in-game-restart signal —
distinct from RESTORE, and it fires only AFTER the game's own "are you sure?" resolves to yes
(the opcode executes only on confirmed restart). We wrap the instance method right after
`window.zvmInstance = vm` (`game-loader.js`), no edit to the vendored lib:

```js
const _origRestart = vm.restart.bind(vm);
vm.restart = function (autorestoring) {
  const result = _origRestart(autorestoring);
  if (!autorestoring) {
    state.appMoveCount = 0;
    if (state.currentGameName) resetAllHintState(state.currentGameName);
    window.dispatchEvent(new CustomEvent('gameRestarted', { detail: { gameName: state.currentGameName } }));
  }
  return result;
};
```

In-place restart → no reload, so we just clear localStorage; the start-room `locationChanged`
that follows re-renders the hints panel against the wiped state. `gameRestarted` is dispatched
for any other listener that wants it.

## Implemented (v1.5.671)

- `hints-state.js` → new `resetAllHintState(gameName)` wipes all 4 keys (one place owns the
  key list). Distinct from panel `resetAll`+`resetSeenQuestions`.
- `game-loader.js` → (a) `vm.restart` hook above; (b) new exported `restartGame()` helper
  (skip-autoload + clear map + `resetAllHintState` + reload) used by the Settings "Restart
  Game" button; dialog text now says "autosave, map, and hint progress will be cleared".
- `recently-played.js` → the resume dialog's "Start Over" branch (already cleared
  autosave + map + set skip_autoload) now also calls `resetAllHintState(gameName)`; the
  reload zeroes appMoveCount. Fourth and final restart/reset surface made consistent.
- `game-settings.js` → `clearAllGameData` now prefix-sweeps every `lantern_*_<name>` key
  (plus explicit non-`lantern_` `gameSettings_`/`glkote_quetzal_`/`zvm_autosave_`), instead of
  a hardcoded list that had silently omitted the hint keys (the original "Reset game data
  doesn't clear hints" bug). The global `lantern_hints_reveal_all` pref has no game suffix, so
  it's intentionally not swept.

## Note on the reset end-state

When `seen`/`qseen` are cleared, everything re-blurs EXCEPT the current room — `isMatched` is
recomputed live each render via `findCurrentTopics`, so the room you're standing in instantly
re-unblurs itself. Correct "fresh start" look.
