---
title: Bootstrap Restore Flow
tags: [zvm, save-restore, voxglk]
created: 2026-04-26
updated: 2026-05-09
aliases: [auto-restore, bootstrap input, just-restored, char-bootstrap, disambiguation-mode]
---

# Bootstrap Restore Flow

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

**Skepticism / open questions:**

- We confirmed the 'l' fix works for Anchorhead on the Kitchen save. Has not been tested on other char-mode intro games (Theatre, etc.) since fixing.
- "look" might have side effects in time-sensitive games (advancing a counter). No evidence of this in testing so far.
- The `'l'` seed only sets `linebuf[0]`; we also set `bufaddr+1=1`. The VM reads exactly 1 char from linebuf[0]. But linebuf IS the Z-machine text buffer starting at byte 2, which may wrap around for very short `maxlen` buffers (unlikely — Anchorhead uses maxlen=120).

## checkSuppressUpdate logic (v1.5.264+)

```javascript
export function checkSuppressUpdate(currentInputType, hasInput) {
  if (!skipNextUpdateAfterBootstrap) return false;
  if (hasInput) skipNextUpdateAfterBootstrap = false;  // only clear on final response
  return currentInputType !== 'char';  // don't suppress char-mode UI
}
```

The flag is cleared only when suppressing an update that includes a new input request. This handles Anchorhead's intermediate status-bar-only update (no input) that fires before the text response — both need to be suppressed.

## Current implementation

As of v1.5.231+ (bootstrap) / v1.5.268 (char-bootstrap fix), the flow lives in:
- `docs/js/game/voxglk-bootstrap.js` — flag lifecycle, `handleAutoRestore`, `checkSuppressUpdate`
- `docs/js/game/save-manager.js` — `performRestore` → seeds linebuf with 'l', zeros parse buffer

Any code touching this path must preserve the order: **flag → first update → restore-via-save-manager → capture intro type → seed linebuf → send bootstrap → suppress next update**.
