---
title: Bootstrap Restore Flow
tags: [zvm, save-restore, voxglk]
created: 2026-04-26
updated: 2026-04-26
aliases: [auto-restore, bootstrap input, just-restored]
---

# Bootstrap Restore Flow

When a game's autosave is restored on load, the Z-machine doesn't simply pick up where it left off — the VM's input loop has to be "kicked" with a dummy input so it processes the restore and re-emits its current view. This is non-obvious and easy to break during refactors of `voxglk.js`.

## The mechanism

1. **Set the flags** — `game-loader.js` reads the autosave (if any) and sets three window-level flags before starting ZVM: `window.shouldAutoRestore`, `window.pendingRestoreType`, `window.pendingRestoreKey` (~lines 158-180).
2. **First update arrives** — When ZVM emits its first `update` event, `voxglk.update()` (~line 467) checks those flags and routes the restore through `save-manager.js`.
3. **Capture the intro input type** — Before sending dummy input, voxglk records what input the game's intro is asking for (line vs char) into `introInputType` (line 844 sets it; ~line 522 reads it).
4. **Send dummy bootstrap input** — voxglk schedules an `acceptCallback` with a synthetic empty/space input matching `introInputType` (~lines 507-539). This wakes the VM's pending input request.
5. **Suppress the echo** — The VM's response to that dummy input would echo "I beg your pardon" or the typed text. To hide it, voxglk sets `skipNextUpdateAfterBootstrap = true` (line 510). The next `update()` call sees this flag and short-circuits before rendering (~line 445).
6. **`justRestored` flag** — Set true on restore (line 496); prevents grid-state reconstruction from overwriting the restored HTML on the first update (line 560).

## Why it's fragile

The flow spans three modules (`game-loader.js`, `voxglk.js`, `save-manager.js`) and five flag variables (`shouldAutoRestore`, `pendingRestoreType`, `pendingRestoreKey`, `skipNextUpdateAfterBootstrap`, `justRestored`). There's no single function that orchestrates it; the sequencing is implicit. If any step happens out of order — e.g., `update()` fires before `window.shouldAutoRestore` is set — the restore silently fails and the game starts fresh.

## What can break it

- Re-ordering init in `game-loader.js` so ZVM starts before the window flags are set.
- Refactoring voxglk state to reset `skipNextUpdateAfterBootstrap` or `justRestored` somewhere new.
- Changing how `introInputType` is captured if char vs line input semantics shift.
- Suppressing or modifying the first `update()` event for any other reason — the bootstrap relies on it being the trigger.

## If you refactor

The agent in the Tier 2 Batch 2 review proposed a `voxglk-bootstrap.js` module with a `BootstrapManager` class encapsulating the flow. That'd make the flag lifecycle explicit. Until then: any code touching this path needs to preserve the order: flag → first update → restore-via-save-manager → capture intro type → send bootstrap → suppress next update.
