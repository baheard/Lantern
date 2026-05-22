---
title: Drive Sync Design
tags: [gdrive, sync, design, saves]
created: 2026-05-14
updated: 2026-05-14
aliases: [sync, google drive, conflict, timestamp]
---

# Drive Sync Design

## Timestamp ≠ progress — the core constraint

**Never treat a newer timestamp as the "better" save.** A user can start a fresh game on their phone (creating a newer autosave at Move 12) while their desktop has a late-game save at Move 487 that's three days older. Timestamp-based auto-sync would silently destroy late-game progress.

The right signals for "which save matters more":
- **Move count** — parse from `saveData.displayHTML.statusBar` via regex `Moves:\s*(\d+)`
- **Room/location name** — first text content of the status bar element
- Store both as `saveData.moveCount` and `saveData.locationName` at save time (TODO: not yet implemented in save-manager.js, tracked in ember 20260514-041559-152b)

## Sync UI — two-column modal

Built a two-column "Sync Drive" modal (replacing the old checkbox-based sync-preview-modal for the primary sync flow):

- Left column: local saves | Center: directional arrow button | Right: Drive saves
- Arrow cycles: `arrow_forward` (upload, gold) → `arrow_back` (download, blue) → `do_not_disturb_on` (skip, gold)
- Clicking either cell directs sync toward that side; click again = skip
- **Default behavior**: local-only → upload, Drive-only → download, **conflict → skip** (conservative)
- Conflicts show DANGER badge; user must explicitly choose a side
- All cells show move count + room + relative timestamp
- 44px arrow button (transparent, no border — just the icon)
- `compareSaves()` + `syncSaveFile()` from `gdrive-sync-preview.js` are the underlying primitives

Implementation: `docs/js/ui/sync-modal.js` (ember 20260514-041559-152b), called from `openSyncModal()` in `manage-saves-modal.js`.

## What stays in the old sync-preview-modal

The old `sync-preview-modal.js` (checkbox-based, Drive-branded) is still used by some internal Drive flows. Don't delete it yet. The new two-column modal is triggered only via Manage Saves → Sync Drive.
