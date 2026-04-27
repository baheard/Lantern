---
title: Save System
tags: [save, restore, design]
created: 2026-04-26
updated: 2026-04-26
aliases: [autosave, quicksave, restore]
---

# Save System

Two independent save mechanisms; users frequently confuse them.

## Autosave
- Captures state continuously, after every move (including immediately after a restart — so it can hold a "move 0" state if you restart and leave).
- Restored by the home-screen **Resume Game** dialog, which appears for a game with an autosave when you re-enter the app.
- Status bar after resume: "Restored from last session".

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
- `iftalk_backup_<type>_<gameName>_<timestamp>[_exempt]` — backup chain; `_exempt` means it skips the count limit

## Game-dialog bridge: `window._customSaveFilename`

When the Z-machine engine triggers a native save dialog (game's own SAVE command, not the IFTalk meta-command), `dialog-stub.js` fires an `iftalk-dialog-open` event handled by `meta-command-handlers.js:initDialogInterceptor()`. The user enters a name via the IFTalk UI. To pass that name through the Dialog callback (which has no parameter for it), the handler sets `window._customSaveFilename = targetSaveName` immediately before calling `gameDialogCallback(gameDialogRef)`. `Dialog.file_write()` reads this global to know which custom save slot to write. The global is intentional — the Dialog API doesn't support extra parameters.

## Restore always reloads the page

All restore paths (`handleRestoreResponse`, `handleGameRestoreResponse`, Quick Load) use `window.location.reload()` instead of in-place restore. Reason: `glkapi.js` state (window layout, input callbacks) cannot be cleanly reset without a full page reload. The pending restore target is written to `sessionStorage` before reload and picked up by the auto-restore sequence on startup (`voxglk-bootstrap.js`).

## Security note (v1.5.222)
Save files contain HTML for status/upper/lower windows. On restore, that HTML is sanitized via `sanitizeRestoredHTML()` in `utils/text-processing.js` — strips `<script>`, `<iframe>`, `on*` handlers, `javascript:` URLs. The realistic XSS vector is a malicious save file imported from disk or shared via someone's Drive folder.
