---
title: XSS Vectors
tags: [security, xss, map]
created: 2026-04-27
updated: 2026-06-12
aliases: [xss, injection, escaping, sanitization]
---

# XSS Vectors

## Known vectors (fixed or open)

### Sync modal (two-column) — **Fixed v1.5.537**
`sync-modal.js` (the newer two-column modal) built progress rows AND save-name cells via `innerHTML` with unescaped values: `cellHtml()`'s `${name}`, the progress rows' `${label}` (contains `item.name`, user-controlled), and raw `err.message` in two error paths. This was the **same pattern fixed twice before** in the older sync-preview modal (v1.5.222 preview list, v1.5.239 progress log) — the two-column modal was written later and reintroduced it. Fixed with `escapeHtml()` on all six sinks. Lesson: any new modal that renders save/file names must import `escapeHtml` from `utils/text-processing.js` from day one.

### Save HTML in `performRestore()` — **Fixed v1.5.222 (4b73a06)**
`displayHTML.statusBar/upperWindow/lowerWindow` from an imported save file was written to `innerHTML` without sanitization. Fixed by wrapping with `sanitizeRestoredHTML()`.

### Save display name — **Fixed v1.5.222 (4b73a06)**
`displayName` (user-controlled save name) was interpolated raw into an HTML string that fed `div.innerHTML`. Fixed with `escapeHtml(displayName)` at both save and restore message sites.

### Sync preview modal — **Fixed v1.5.222 (4b73a06)**
`item.name` (save filename from local or remote) was interpolated raw into `innerHTML`. Fixed with `escapeHtml()` on `item.id`, `item.name`, `statusClass`, `statusLabel`.

### Map connections list — **Fixed v1.5.234**
`populateConnectionsList()` was building the connections list via `innerHTML` with `${c.node.name}` unescaped. Node names come from Z-machine status bar text — game-controlled. Fixed with `escapeHtml(c.node.name)` (`utils/text-processing.js`).

### Sync preview progress log — **Fixed v1.5.239**
`updateProgress()` in `sync-preview-modal.js` injected `currentItem.name` (Drive filename) and `currentItem.statusText` (which includes `error.message` from caught exceptions) directly into `insertAdjacentHTML('beforeend', itemHtml)`. Missed when the preview list XSS was fixed in v1.5.222. Fixed with `escapeHtml()` on both values.

## Attack surface context
- Save files cross user boundaries (Google Drive sync, file import) → High severity
- Custom game files are user-loaded but device-local → Medium severity
- Location names are parsed from the game's Z-machine status bar by `auto-mapper.js:getCurrentLocation()`, which strips score/move suffixes but does NOT strip HTML characters
