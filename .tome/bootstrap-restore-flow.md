---
title: Bootstrap Restore Flow
tags: [zvm, save-restore, voxglk]
created: 2026-04-26
updated: 2026-06-15
aliases: [auto-restore, bootstrap input, just-restored, char-bootstrap, disambiguation-mode, bufaddr mismatch, seededBufaddr]
---

# Bootstrap Restore Flow

> **⚠️ HISTORICAL — this mechanism was DELETED in Phase 6b (v1.5.582, `4da25f5`, 2026-06-15).**
> Restore now runs entirely on ZVM's built-in `do_autosave`/`do_autorestore` (see
> [[save-restore-paradigm]] "Implementation status — COMPLETE"). The bootstrap kick, the `'l'` seed,
> `skipNextUpdateAfterBootstrap`/`checkSuppressUpdate`, and `seededBufaddr`/bufaddr-mismatch dual-write
> described below NO LONGER EXIST in the code. The "two systems, one restore" seam these all fought is
> gone because `do_autorestore` never resumes mid-`aread`. Kept as the definitive record of *why* the
> seam existed and the entire bug class it spawned (v1.5.215 → v1.5.409) — invaluable if the engine
> path is ever reconsidered, but do NOT treat any file/flag reference here as live.

When a game's autosave is restored on load, the Z-machine doesn't simply pick up where it left off — the VM's input loop has to be "kicked" with a dummy input so it processes the restore and re-emits its current view. This is non-obvious and easy to break during refactors of `voxglk.js`.

## The mechanism

1. **Set the flags** — `game-loader.js` reads the autosave (if any) and sets three window-level flags before starting ZVM: `window.shouldAutoRestore`, `window.pendingRestoreType`, `window.pendingRestoreKey` (~lines 158-180).
2. **First update arrives** — When ZVM emits its first `update` event, `voxglk.update()` checks those flags and routes the restore through `save-manager.js`.
3. **Capture the intro input type** — Before sending dummy input, voxglk records what input the game's intro is asking for (line vs char) into `introInputType`.
4. **Send dummy bootstrap input** — voxglk schedules an `acceptCallback` with a synthetic input matching `introInputType`. This wakes the VM's pending input request.
5. **Suppress the echo** — The VM's response to that dummy input would re-print the room or print a parser response. To hide it, voxglk sets `skipNextUpdateAfterBootstrap = true`. The next `update()` call sees this flag and short-circuits before rendering.
6. **`justRestored` flag** — Set true on restore; prevents grid-state reconstruction from overwriting the restored HTML on the first update.

## Why it's fragile

The flow spans three modules (`game-loader.js`, `voxglk.js`, `save-manager.js`) and five flag variables (`shouldAutoRestore`, `pendingRestoreType`, `pendingRestoreKey`, `skipNextUpdateAfterBootstrap`, `justRestored`). There's no single function that orchestrates it; the sequencing is implicit.

## See also

- [`quetzal-restore-globals`](quetzal-restore-globals.md) — `restore_file()` fixes ZVM state but not game globals; screen_width perpetuation cycle; Quetzal CMem decoding
- [`save-system`](save-system.md) — autosave vs quicksave semantics; restore-always-reloads-page; storage layout

## The deep invariant: two systems, one restore

`restore_file()` updates **ZVM state only** — registers, stack, dynamic RAM, `io.width`. It does NOT touch glkapi state. After the call:

- ZVM's PC → save point (mid-aread, waiting for line input)
- glkapi's `win.char_request` → still `true` (from the title screen, untouched)
- glkapi's `win.line_request` → still `false`
- `gli_selectref` → still points to the pre-restore select context

This mismatch is the root cause of the entire class of char-bootstrap bugs. You can't simply send a line bootstrap — `handle_line_input` checks `win.line_request` and returns immediately if false. So the only lever is the outstanding char request, which fires `handle_char_input` and sets `gli_selectref.field[2] = charval`. The ZVM's restored aread continuation then reads that field as a **line length**, not a char code.

**Key insight:** the same struct field (`gli_selectref.field[2]`) means two different things depending on which system you ask. To glkapi, it just stored a char code. To the ZVM post-restore, it's the number of characters entered in the line input. The char code IS the line length.

## The char-bootstrap mismatch (Anchorhead Z8, Theatre Z5)

For games with a char-mode intro (e.g. Anchorhead "Press R to restore / any other key"), `introInputType` captures `'char'`. After `restore_file()`, **glkapi still has the gen:1 char request outstanding** (from the title screen), but the ZVM's PC has jumped to the save point (mid-aread = read_line).

When the bootstrap char is sent to gen:1:
- `handle_char_input` fires (char_request is still true from the title screen)
- `gli_selectref.field[2]` is set to the char's code
- `VM.resume()` is called

The restored ZVM reads `field[2]` as the **line input length** (it was mid-aread, not mid-read_char). So the char code becomes the length of the "typed" line:
- `'\x01'` (char code 1) → VM reads 1 char from linebuf → executes whatever linebuf[0] is
- `'\0'` (char code 0) → VM reads 0 chars → empty input → "I beg your pardon?"
- `' '` (char code 32) → VM reads 32 chars from linebuf → stale data

**The 'l' seed + `'\x01'` bootstrap fix (v1.5.268):**

`performRestore` now writes `'l'` (look) into `linebuf[0]` (= `bufaddr + 2`) and sets `bufaddr + 1 = 1` (length 1) before the bootstrap fires. The bootstrap char is `'\x01'` (code 1). This causes the VM to tokenize `"l"` → execute `look` (re-describe room, output suppressed). No disambiguation mode is triggered, so the player's first real command works normally.

**Why "I beg your pardon?" was the wrong approach (`'\0'`):**

Empty input (0 chars) causes some parsers (confirmed: Anchorhead Z8) to enter a secondary-input / disambiguation mode. In this mode, ALL subsequent commands are rejected with "I didn't understand that sentence." until the mode exits. This meant the player's first post-restore command always failed, but the second worked. Confirmed via debug logging tracing gen=2 content.

**Why `look` is safe:**

`look` just re-describes the current room. No game state change. The output is suppressed (`skipNextUpdateAfterBootstrap`). Virtually all Z-machine games recognize `"l"` as look.

**Theatre concern:**

Theatre (Z5, char-mode intro) was previously re-executing stale commands from the parse buffer. The Theatre fix (v1.5.215) zeroed parse buffer word count. This still holds — we zero `parseaddr + 1` = 0 after writing the 'l' seed. The tokenizer will run on "l" → puts 1 word in parse buffer. Theatre should NOT re-execute its old command since we replaced the buffer content with 'l' (look) instead of stale tokens.

**Test results (v1.5.268):**

- Anchorhead (Z8, char-mode intro, "Press R to restore"): first command works ✓
- Theatre (Z5, char-mode intro, "Press any key"): first command works, no re-execution of previous command ✓
- 9:05 (Z5, line-mode intro): unaffected ✓

**Remaining caution:**

- "look" might have side effects in time-sensitive games (advancing a counter). No evidence of this in testing so far.
- Safe regardless of whether the intro is "press any key" or interactive — autosave only fires on line-mode inputs, so the save point is always a line prompt mid-game, never at an intro char prompt.
- The `'l'` seed only sets `linebuf[0]`; `bufaddr+1=1`. Unlikely to matter but noted for correctness.

## Debugging heuristic

Two distinct failure modes after autorestore. Identify which before fixing.

**Mode A — first command shows room description (LOOK output) instead of executing:**
The bootstrap 'l' seed is being re-read on the player's first command. This is the bufaddr mismatch bug (v1.5.367 fixed). The suppress IS working; the seed is the problem.

Procedure: inject a runtime wrapper via `execute_console` (monkey-patch `window._voxglkInstance.update`) to log gen, inputType, hasInput, and `arg.content` (sliced to 600 chars). Then check `window.zvmInstance.read_data.bufaddr` at gen:2 PRE-SUPPRESS vs the saved `voxglkState.bufaddr`. If they differ, you have the mismatch. Also read address `savedBufaddr+2` — if it's `'l'`, the seed is still there.

**Mode B — first command returns "I didn't understand" / disambiguation mode, second works:**
The bootstrap sent empty input (char code 0 → length 0) and the parser entered a secondary mode. Check that `seededBufaddr` is being set and that `bufaddr+2 = 'l'` before the bootstrap fires.

**General procedure:**
Add `console.log` in `voxglk.update()` before `checkSuppressUpdate` logging gen, inputType, hasInput, `window.zvmInstance.read_data?.bufaddr`, and `arg.content` sliced to 500 chars. Also log in `sendInput()` before acceptCallback. Three or four reloads with a simple first command will reveal the pattern.

**Testing a hypothesis via execute_console (no source edit needed):**
If you suspect a specific address isn't getting the right value, write it directly via console and test: `window.zvmInstance.m.setUint8(addr+1, text.length); /* write text chars */` then submit the command normally. If that fixes it, you've confirmed the hypothesis and can then code it into sendInput/performRestore.

## checkSuppressUpdate logic (v1.5.264+)

```javascript
export function checkSuppressUpdate(currentInputType, hasInput) {
  if (!skipNextUpdateAfterBootstrap) return false;
  if (hasInput) skipNextUpdateAfterBootstrap = false;  // only clear on final response
  return currentInputType !== 'char';  // don't suppress char-mode UI
}
```

The flag is cleared only when suppressing an update that includes a new input request. This handles Anchorhead's intermediate status-bar-only update (no input) that fires before the text response — both need to be suppressed.

## The glkapi/ZVM buffer address mismatch (v1.5.367 fix)

After the char-bootstrap fires and LOOK executes (gen:2 suppressed), the gen:2 aread as seen by **glkapi** uses a *different* buffer address than the one **the ZVM actually reads from**.

Confirmed via debug logging (2026-05-28):
- `saveData.voxglkState.bufaddr` = 39469 (Anchorhead's standard game-loop text buffer)
- At gen:2: `window.zvmInstance.read_data.bufaddr` = **63** (glkapi's tracked buffer for that aread)
- Glkapi writes the player's "take flashlight" to address 63
- ZVM reads from address 39469 (the restored aread's buffer), finds our stale 'l' seed → executes LOOK again

The 'l' seed persists untouched at 39469 because glkapi never writes there for gen:2.

**Fix (v1.5.367):** In `sendInput()`, when submitting the first line command after a bootstrap restore, *also* write the player's text to the seeded address (39469). This is a one-shot write tracked via `seededBufaddr` in `voxglk-bootstrap.js`:
- `performRestore` calls `setSeededBufaddr(bufaddr)` after seeding
- `sendInput()` calls `consumeSeededBufaddr()` (returns address, clears it) and writes the command there before calling acceptCallback
- Subsequent commands: seededBufaddr is null → no extra writes → normal path

The root cause of the bufaddr mismatch (why glkapi uses 63 vs the ZVM's 39469) is not fully understood — it may relate to Anchorhead having an intermediate aread between the bootstrap LOOK and the main game loop, or glkapi retaining stale state after restore. The fix is correct regardless: writing to both buffers ensures the ZVM sees the right command.

**Root cause found (v1.5.409, 2026-05-30):** the "63" is the **pre-restore intro
request's `bufaddr`**, still sitting in the ZVM's in-progress `read_data` after
`restore_file()`. The restored aread continuation copies the typed line into
`read_data.bufaddr` = 63. For Anchorhead, addr 63 was harmless; for **Theatre,
addr ~0x40 holds the Z-string abbreviation table strings**, so the stray write
garbled them → "the"→"tv2" (see [[text-decode-corruption]]). v1.5.409 fixes it by
setting `read_data.bufaddr = seededAddr` inside the `sendInput()` seeded one-shot
(right before acceptCallback), so the first post-restore command lands in the real
game-loop buffer. NOTE: must be done at submit time — patching read_data in
`performRestore` fails because the resuming aread resets bufaddr back to 63 during
the char bootstrap (tried in v1.5.408). The dual-write is now redundant for Theatre
but retained as belt-and-suspenders.

## Current implementation

As of v1.5.231+ (bootstrap) / v1.5.268 (char-bootstrap fix) / v1.5.367 (bufaddr mismatch fix):
- `docs/js/game/voxglk-bootstrap.js` — flag lifecycle, `handleAutoRestore`, `checkSuppressUpdate`, `seededBufaddr` tracking
- `docs/js/game/save-manager.js` — `performRestore` → seeds linebuf with 'l', zeros parse buffer, calls `setSeededBufaddr`
- `docs/js/game/voxglk.js` — `sendInput()` calls `consumeSeededBufaddr()` and writes to it before acceptCallback

Any code touching this path must preserve the order: **flag → first update → restore-via-save-manager → capture intro type → seed linebuf → set seededBufaddr → send bootstrap → suppress gen:2 → on first real line input: write to seededBufaddr → acceptCallback**.
