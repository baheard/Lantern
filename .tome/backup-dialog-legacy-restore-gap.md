---
title: Backup Dialog Legacy-Restore Gap (#174)
tags: [save-restore, backup, engine-autorestore, fixed]
created: 2026-06-24
updated: 2026-06-24
---

# Backup Dialog Legacy-Restore Gap (#174)

Fixed v1.5.639. When Phase 6b ([[save-restore-paradigm]], v1.5.582) retired the legacy
Quetzal restore path, `performRestore` started hard-rejecting any save whose
`saveFormat !== 'engine'` ("This save is in an older format and can no longer be
restored."). The migration left **old saves stranded by design** — but the **Backup
Saves dialog** (`docs/js/ui/backup-saves-dialog.js`) never got the memo.

## The bug chain (reproduced live on Anchorhead's legacy quicksave backup)

`restoreBackup(backupKey)` blindly:
1. Wrote the (legacy) backup blob into the **live autosave slot** (and the quicksave slot),
   clobbering whatever was there.
2. Called `window.location.reload()`.
3. On reload, engine `do_autorestore` found no engine snapshot in the legacy blob →
   `autosave_read` returned null → the game booted to its **fresh intro** — the
   "press any key" the user saw (Curses "Press Space"; Anchorhead "Press 'R' to restore").
4. `autoLoad → performRestore` then hit the format gate → silent fail.

Net effect: player stuck at a fresh game, **live autosave destroyed**, exactly matching
the #174 report ("press any key … went back to backup").

Engine-format backups restore fine — the one blemish there is a one-turn **stale
status-bar header** (shows the previous room until the next turn repaints; self-heals).

## The fix (v1.5.639)

`backup-saves-dialog.js`:
- `restoreBackup` parses the blob and **bails before touching any slot or reloading** if
  `saveFormat !== 'engine'`.
- `showBackupSavesDialog` renders legacy backups with a **disabled "Older format"** button
  instead of an active Restore.

`manage-saves-modal.js` had the **same gap** at a second entry point — `loadSave` wrote a
custom/quicksave blob into the autosave slot and reloaded with no format check. Same guard
added (legacy custom/quicksave saves now show the "older format" message instead of
clobbering). The `save.type === 'autosave'` branch only reloads (no write), so
`autoLoad → performRestore` fails it gracefully — no guard needed there.

**Not data-loss but still imperfect:** typed `RESTORE`/quick-load of a *legacy* save read
the slot directly (no autosave clobber) but still reload into the game's intro before
`performRestore` posts the "older format" error. Lower priority — no save is destroyed —
but a pre-reload format check there would be a nicer UX.

## Third bug, same file — autosave-backup Load reloaded the *current* autosave (v1.5.639)

Separate from the legacy-format issue, found by recreating a vanilla curses backup live.
`manage-saves-modal.js` builds backup rows by **spreading the parent save row**:
`loadSave({ ...save, key: b.key, saveData: b.saveData })`. For an *autosave* backup the
parent is the autosave row, so the merged object carried `type: 'autosave'`. `loadSave`
then keyed its "just reload, don't write" shortcut on `save.type === 'autosave'` — so
loading an autosave backup **silently reloaded the live autosave** instead of writing the
chosen backup into the slot. The backup was effectively unreachable through this menu.

Confirmed live: loading a backup (engine snapshot length 33300) left the autosave slot at
the current length (34768) — the backup was never applied.

**Fix:** decide the shortcut on **slot identity**, not type —
`isLiveAutosaveSlot = (save.key === \`lantern_autosave_${gameName}\`)`. Only the live slot
reloads-without-writing; named saves, the quicksave, and all backups get copied into the
slot first. The legacy guard now also keys off `!isLiveAutosaveSlot` (every written path).
Verified: the autosave snapshot length flips to the backup's after Load.

Aside: backups created on the **first** post-grace autosave legitimately show "0 moves" —
`performSave` writes `appMoveCount` *before* `autoSave` increments it, so the first save
(and its immediate backup) record 0. Cosmetic, accurate-ish (it really is the earliest
state), left as-is.

## Gotcha for future migrations

`performRestore`'s format gate is the single source of truth for "can this be restored",
but **every restore entry point must check it up front** — the backup dialog, quick-load,
and any future restore UI. A restore path that writes-then-reloads-then-discovers-it-can't
is data loss, because the write already clobbered the live slot. Validate format *before*
the destructive write.
