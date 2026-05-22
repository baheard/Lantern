---
title: Manage Saves Modal
tags: [ui, saves, modal, gdrive, design]
created: 2026-05-14
updated: 2026-05-14
aliases: [saves modal, manage saves, save list]
---

# Manage Saves Modal

New modal (v1.5.290+) at `docs/js/ui/manage-saves-modal.js` + `docs/styles/manage-saves.css`.

## Design decisions

**Flat rows, not cards.** Each save is a row with a colored left bar (green=autosave, blue=quicksave, nothing=named saves). No badges or type labels on the row — the bar communicates type.

**Save is the primary action, Load is secondary.** User saves more than they load. Gold `Save` button, ghost `Load` button.

**Cloud status is passive.** A small icon next to the timestamp (not in the actions area) shows sync state: `cloud_done` (green=synced), `cloud_upload` (amber=local newer), `cloud_download` (blue=Drive newer). Detail and sync actions live in the ⋮ menu — keeps rows clean.

**⋮ menu per row** contains: cloud status header + sync action (if applicable) + Export to file + Show/Hide backups + Delete save.

**Backups hidden by default.** `Show backups` / `Hide backups` in the ⋮ menu toggles an inline expand below the row. Backup rows show relative timestamp + Load only (no Save/Delete on backups). `expandedBackups` Set tracks state across menu opens.

**Portal dropdown.** The `.ms-dropdown` element is appended to `document.body` and positioned with `position:fixed` from `getBoundingClientRect()`. This avoids clipping by the modal's `overflow:auto` body. Toggle behavior: tap ⋮ again to close.

**Bottom row.** `[+ Save Game]` (named save prompt) + `[⋮]` (utility actions: Import save file, Sync Drive / Connect Drive, Change Drive folder, Disconnect Drive). The Drive section uses a section header `DRIVE OPTIONS` with Google G SVG.

## Entry point

`openManageSavesModal()` — called from mobile menu (`data-action="managesaves"`). Initialized in `app.js` via `initManageSavesModal()`.

## Drive menu states

- **Not signed in**: bottom ⋮ shows "Connect Drive" (triggers `signIn()`)
- **Signed in**: bottom ⋮ shows "Sync Drive" (opens two-column sync modal, see [[drive-sync-design]]), "Change Drive folder", "Disconnect Drive"

## See also

- [[drive-sync-design]] — sync UI design and the timestamp-vs-progress constraint
- [[save-system]] — underlying save slot semantics
- [[ui-conventions]] — 44px touch targets, sentence case
