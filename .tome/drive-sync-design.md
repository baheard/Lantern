---
title: Drive Sync Design
tags: [gdrive, sync, design, saves, move-count]
created: 2026-05-14
updated: 2026-05-30
aliases: [sync, google drive, conflict, timestamp, move count]
---

# Drive Sync Design

## Timestamp ≠ progress — the core constraint

**Never treat a newer timestamp as the "better" save.** A user can start a fresh game on their phone (creating a newer autosave at Move 12) while their desktop has a late-game save at Move 487 that's three days older. Timestamp-based auto-sync would silently destroy late-game progress.

The right signal: **`appMoveCount`** — app-tracked move counter, game-agnostic (see below).

## App-tracked move count (v1.5.411)

`state.appMoveCount` is incremented on each successful `autoSave()` call. It is:
- Saved in every save data object as `saveData.appMoveCount`
- Restored in `performRestore()` → `state.appMoveCount = saveData.appMoveCount ?? 0`
- Used for display in Manage Saves modal and Sync modal (`getMoveCount()` reads `saveData.appMoveCount` directly)
- Stored as Drive `appProperties.moveCount` for conflict detection across devices

**Why not parse the status bar?** Games like Anchorhead don't expose a "Moves: N" field — their status bar is "Kitchen, day two". The status-bar regex approach silently returned null for these games. App-tracked count works for every game.

Old saves without `appMoveCount` show no move count in the UI (null displayed as nothing).

## False-conflict bug on refresh (fixed v1.5.411)

**Root cause:** `syncAllNow` (manual sync) was uploading files without `appProperties`. On next page load, `checkDriveForNewerAutosave` fell back to Drive's `modifiedTime` (Google server time of upload, always a few seconds after local save timestamp). This made `driveTimestampNewer = true` but `driveMoveCountHigher = false` (no moveCount stored) → signals disagreed → false conflict dialog for every save touched by a manual sync.

**Fix:** `syncAllNow` now passes the same `appProperties` (`saveTimestamp` + `moveCount`) that `flushSyncQueue` has always used.

## Drive appProperties schema

Every upload (both `flushSyncQueue` and `syncAllNow`) writes:
- `saveTimestamp` — ISO timestamp from `saveData.timestamp` (local save time, not upload time)
- `moveCount` — `String(saveData.appMoveCount)` if non-null

`checkDriveForNewerAutosave` uses `saveTimestamp` preferentially, falling back to `modifiedTime` only for old files that predate this schema.

## Sync UI — two-column modal

Built a two-column "Sync Drive" modal (`docs/js/ui/sync-modal.js`):

- Left column: local saves | Center: directional arrow button | Right: Drive saves
- Arrow cycles: `arrow_forward` (upload, gold) → `arrow_back` (download, blue) → `do_not_disturb_on` (skip, gold)
- Clicking either cell directs sync toward that side; click again = skip
- **Default behavior**: local-only → upload, Drive-only → download, **conflict → skip** (conservative)
- Conflicts show DANGER badge; user must explicitly choose a side
- `compareSaves()` + `syncSaveFile()` from `gdrive-sync-preview.js` are the underlying primitives

## What stays in the old sync-preview-modal

`sync-preview-modal.js` (checkbox-based) is still used by some internal Drive flows. Don't delete it. The two-column modal is triggered via Manage Saves → Sync Drive.
