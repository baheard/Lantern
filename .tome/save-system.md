---
title: Save System
tags: [save, restore, design]
created: 2026-04-26
updated: 2026-06-12
aliases: [autosave, quicksave, restore]
---

# Save System

Two independent save mechanisms; users frequently confuse them.

## Autosave
- Captures state continuously, after every move (including immediately after a restart — so it can hold a "move 0" state if you restart and leave).
- Restored by the home-screen **Resume Game** dialog, which appears for a game with an autosave when you re-enter the app.
- Status bar after resume: "Restored from last session".

### Autosave timing: the first ~3 moves do NOT autosave (two independent skips)

A fresh game (or a freshly reloaded one) will show **no autosave key for the first 3
line-input turns** — this surprises debugging ("I made a move, why is there no
autosave?"). There are TWO separate 3-move skip mechanisms, easily conflated:

1. **`voxglk.js` `autosaveCounter < 3`** (lines ~630-635): skips the first 3 line-input
   turns on **every page load** — fresh start *and* restore. Rationale: avoid persisting
   title-screen / intro interactions. The counter resets on every load. This is the one
   that bites a fresh game: autosave first lands on roughly the 3rd–4th real command.
   Only **line** input counts (`shouldAutosaveThisTurn = s.inputType === 'line'`); char-mode
   turns don't increment it.
2. **`save-manager.js` `state.autosaveGraceMoves = 3`** (set in `performRestore`, line ~696;
   decremented in `autoSave()` lines ~826-830): a *separate* grace applied **only after a
   restore**, so the VM state settles before the first post-restore autosave overwrites the
   save. Also gives the player a few moves to react to a bad restore before it's persisted.

So after a restore both can stack. Net: don't expect an autosave to exist until several
moves in. When scripting a restore-bug repro, **make ~3-4 line moves before reloading** or
there's nothing to restore. Verified live on Wishbringer 2026-06-15.

### Key-prefix migration in flight: `iftalk_` → `lantern_`

Current source writes saves under the **`lantern_`** prefix (`save-manager.js:~839`
`lantern_autosave_<gameName>`). Older builds used **`iftalk_`**. A browser running a stale
SW-cached bundle (observed: v1.5.562 still live while source was v1.5.569) writes/reads the
**`iftalk_`** keys — so a debug check against `lantern_autosave_<game>` reads `false` while
the real autosave sits under `iftalk_autosave_<game>`. **When a save key looks missing,
check BOTH prefixes** and confirm the served version (status bar / `APP_CONFIG.version`)
before concluding anything. The storage-layout list below still shows the legacy `iftalk_`
names; the migration scaffolding (see CLAUDE.md "Pending Cleanup") renames them. See
[[dev-gotchas]] for the SW-cache trap that produces this stale-prefix confusion.

## Quick Save / Quick Restore
- Single manual slot, one per game. Triggered by `#quickSaveBtn` / `#quickRestoreBtn` (or `#mobileSaveIcon` / `#mobileLoadIcon`).
- Confirmation toast: "Game saved - quicksave" / "Game restored - quicksave".
- Status bar shows "Saved: quicksave" / "Quick loaded".

## Key distinction
**Resume Game on the home screen restores the autosave, not the quicksave.** To get back to a quicksave point, you must let the game load (whichever state) and then click `#quickRestoreBtn`. This catches users out — autosave can quietly clobber an older quicksave's mental anchor.

## Backups, export/import, sync
- View Backup Saves (`#viewBackupSavesBtn`) — shows the per-game backup chain (capped via `MAX_BACKUPS_PER_GAME`).
- Export / Import save file as JSON.
- Google Drive sync (`#gdriveSyncBtn`) — opt-in, uses the user's own Drive.

## Storage layout (localStorage keys)
- `iftalk_autosave_<gameName>` — current autosave
- `iftalk_quicksave_<gameName>` — current quicksave
- `iftalk_customsave_<gameName>_<saveName>` — named/custom save slot
- `iftalk_backup_<type>_<gameName>_<timestamp>[_exempt]` — capped backup chain (autosave/quicksave); `_exempt` skips the count limit
- `iftalk_backup_customsave_<gameName>_<saveName>` — single overwrite-backup per named save (see below)

## Single-backup-per-named-save on overwrite (v1.5.450)

When a named/custom save is overwritten, its prior contents are first copied to a
backup so the previous state can be recovered. Each named save keeps exactly **ONE**
backup — the most recent overwritten state replaces any earlier one. Autosave and
quicksave are deliberately **excluded** (autosave continuously overwrites itself;
quicksave is a single manual slot); they keep using the capped `createBackup` chain.

- Created in `save-manager.js:backupNamedSaveBeforeOverwrite(saveName)`, called from
  `customSave()` *before* `performSave()` overwrites the slot. No-ops if the named save
  doesn't exist yet (first save of a name has no prior state).
- **Fixed key, no timestamp suffix:** `iftalk_backup_customsave_<gameName>_<saveName>`.
  Writing simply replaces the prior backup → guaranteed single backup. This also dodges
  the underscore-delimiter ambiguity of the timestamped chain: save names can contain
  underscores, so a prefix scan for `name_<ts>` could match a *different* save
  (e.g. "foo" vs "foo_bar"). Exact-key access avoids that.
- **Surfaced in the modal:** `getBackupsForSave()` (manage-saves-modal.js) special-cases
  `customsave` and looks up the fixed key directly, deriving the display `ts` from the
  backup's `saveData.timestamp`. The existing Show/Hide backups UI then works unchanged.
- **Cleanup:** `deleteSave()` removes the fixed backup key too when a named save is
  deleted, so it doesn't linger orphaned.

## Custom save limit (regression resolved)

`MAX_SAVES = 5` was enforced in the original `commands.js`, silently dropped when `commands.js` was modularized into `game/commands/` (commit `107a47b`), and later restored: `meta-command-handlers.js` now defines `MAX_SAVES = 5` and enforces it inside `validateSaveName()`, which BOTH `handleSaveResponse` (typed SAVE) and `handleGameSaveResponse` (in-game dialog) route through. Verified 2026-06-12. If save-name validation is ever refactored, keep both handlers on the shared `validateSaveName` path — that's what closed the regression.

## Bootstrap restore (see separate entry)

The autorestore sequence (on page reload, if an autosave exists) runs a bootstrap dummy input to wake the VM. All known bugs in this area were fixed in v1.5.264–268:
- **v1.5.264**: Bootstrap echo leak for Anchorhead's intermediate status-bar update
- **v1.5.265–266**: Stale screen_width globals and status bar HTML after restore
- **v1.5.268**: First player command after restore always failing (char-bootstrap disambiguation mode)

Full details: [`bootstrap-restore-flow`](bootstrap-restore-flow.md), [`quetzal-restore-globals`](quetzal-restore-globals.md).

## Game-dialog bridge: `window._customSaveFilename`

When the Z-machine engine triggers a native save dialog (game's own SAVE command, not the IFTalk meta-command), `dialog-stub.js` fires an `iftalk-dialog-open` event handled by `meta-command-handlers.js:initDialogInterceptor()`. The user enters a name via the IFTalk UI. To pass that name through the Dialog callback (which has no parameter for it), the handler sets `window._customSaveFilename = targetSaveName` immediately before calling `gameDialogCallback(gameDialogRef)`. `Dialog.file_write()` reads this global to know which custom save slot to write. The global is intentional — the Dialog API doesn't support extra parameters.

## Restore injects HTML directly — must invalidate narration chunks (v1.5.407)

`performRestore` (save-manager.js) rebuilds the screen by writing the saved
display HTML straight into the DOM: `statusBarEl.innerHTML`, `upperWindowEl.innerHTML`,
and `lowerWindowEl.innerHTML = sanitizeRestoredHTML(...)`. This **bypasses
`addGameText`**, which is the only place that normally invalidates narration chunks
(`state.chunksValid = false`) and sets `state.currentGameTextElement`.

**The bug this caused:** On the auto-restore-on-reload path the game's title screen
renders first. For char-mode-intro games (Theatre, Anchorhead) `handleGameOutput`
sees `inputType === 'char'` and builds title PAK chunks, setting `chunksValid = true`
(see [[pak-char-mode-narration]]). `performRestore` then injects the restored *room*
HTML directly — but the stale **title** chunks remained valid. So clicking Play ran
`ensureChunksReady`, which short-circuits when `chunksValid && narrationChunks.length`,
and narrated the title screen ("Theatre / An Interactive Night of Horror / Copyright…")
while highlighting nothing.

Confirmed ordering via console: `[PAK chunks] [Theatre…]` fires *during* restore;
`performRestore`'s injection runs *after* it. So the title chunks are always the last
thing built before Play.

**Fix:** Immediately after the `lowerWindowEl.innerHTML` injection, invalidate the
narration state and repoint the current element:
```js
state.chunksValid = false;
state.narrationChunks = [];
state.currentChunkIndex = 0;
state.currentGameTextElement = <last non-system .game-text in restored lowerWindow>;
```
With chunks invalidated, `ensureChunksReady`'s existing fallback (grab the last
`.game-text` when `currentGameTextElement` is null) rebuilds the room chunks correctly.
The chunk-invalidation is the essential part; the `currentGameTextElement` repoint is
belt-and-suspenders. Covers all restore entry points (F5 autoload, Quick Load, in-game
RESTORE) since they all funnel through `performRestore`.

**General principle:** anything that mutates `lowerWindow` outside `addGameText` must
also invalidate narration chunks, or the next Play/highlight reads stale content.

## Debugging restore narration: verify the SERVED code first

Restore bugs are browser-only, so they need live testing — and that collides hard with
the service-worker cache (see [[dev-gotchas]]). Editing `save-manager.js` and reloading
runs the OLD cached module; a "fix" can look like it does nothing (or a real fix looks
unverified). Before trusting any live restore test:
- Bump `APP_CONFIG.version` (config.js), `CACHE_VERSION` (service-worker.js), CLAUDE.md.
- In console, confirm the new code is actually loaded:
  `navigator.serviceWorker.controller.scriptURL` ends in the new `?v=`, AND
  `(await (await fetch('/js/game/save-manager.js')).text()).includes('<unique string from your edit>')`.
- Do NOT unregister the SW / clear caches as a shortcut: when the node server isn't
  running the app is served entirely from the SW cache, so clearing it makes the page
  unreachable (ERR_CONNECTION_REFUSED) until `npm start`. Check the server is up first
  (`Get-NetTCPConnection -LocalPort 3002`).
- Console probes can't use top-level await/return: wrap in
  `(async()=>{ window.__x = {...} })();` then read `window.__x` in a second call.

## Journey restore + scene-break interaction (v1.5.456)

Three bugs that compounded to lose pre-restore map journey entries:

1. **`clearJourney()` in `restoreMapData`** — when a save contained both canvas + delta journey (moves since last map open), `restoreMapData` called `clearJourney()` after importing the canvas, discarding the delta before `syncFromAutoMapper` could replay it. **Fix:** removed the call; `syncFromAutoMapper` clears the journey itself after successful replay.

2. **Restore screen-clear leaking into first post-restore command** — the restore fires a screen clear → `setSceneBreak()` → `pendingSceneBreak = true`. The status bar then updates to the same room (no location change), so `checkLocationChange` returned early WITHOUT consuming `pendingSceneBreak`. The user's first real command then got `effectiveCommand = null`, losing its direction and producing wrong map positioning. **Fix:** the `!locationChanged` early-return path now consumes `pendingSceneBreak`.

3. **Restored journey wiped by restore's screen-clear** — same screen-clear sets `pendingSceneBreak = true`, and if a location change DID fire (different room), the journey clear logic would run and wipe the just-restored journey. **Fix:** `suppressNextJourneyClear` one-shot flag set after restore suppresses exactly one such clear.

**Gotcha:** `positionCommand` (actual direction typed) is now stored separately from `command` (null if scene break) in journey entries. `syncFromAutoMapper` uses `positionCommand` for spatial placement even when `command` is null. Old saves without `positionCommand` use look-ahead inference: if entry N has null command and entry N+1 returns to the same previous node, the approach direction is inferred as the reverse of entry N+1's direction (via `DIRECTION_OPPOSITES` in map-config.js).

**Seed entry:** when saving canvas + delta journey, `getOptimizedMapData` prepends a seed entry `{locationName: currentNodeId, command: null}` so `syncFromAutoMapper` can anchor delta replay to the existing canvas node rather than placing new nodes from (0,0).

## Map data restore semantics (v1.5.440)

Map data is saved alongside the game save as `mapData` (compressed). On restore, `restoreMapData()` writes it back to localStorage and re-initializes the auto-mapper. **Important:** if the save has no `mapData` (saved before the map was ever opened, or before the map feature existed), the restore must explicitly clear `iftalk_map_<gameName>` and `iftalk_automapper_restore_<gameName>` from localStorage — otherwise the player sees whatever map edits they made after the save point, not the map state at save time.

The rule: restore always wins. If the save had no map, the map resets to empty.

## Restore always reloads the page

All restore paths (`handleRestoreResponse`, `handleGameRestoreResponse`, Quick Load) use `window.location.reload()` instead of in-place restore. Reason: `glkapi.js` state (window layout, input callbacks) cannot be cleanly reset without a full page reload. The pending restore target is written to `sessionStorage` before reload and picked up by the auto-restore sequence on startup (`voxglk-bootstrap.js`).

## Security note (v1.5.222)
Save files contain HTML for status/upper/lower windows. On restore, that HTML is sanitized via `sanitizeRestoredHTML()` in `utils/text-processing.js` — strips `<script>`, `<iframe>`, `on*` handlers, `javascript:` URLs. The realistic XSS vector is a malicious save file imported from disk or shared via someone's Drive folder.
