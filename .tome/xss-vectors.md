---
title: XSS Vectors
tags: [security, xss, map]
created: 2026-04-27
updated: 2026-04-27
aliases: [xss, injection, escaping, sanitization]
---

# XSS Vectors

## Known vectors (fixed or open)

### Save HTML in `performRestore()` — **Fixed v1.5.222 (4b73a06)**
`displayHTML.statusBar/upperWindow/lowerWindow` from an imported save file was written to `innerHTML` without sanitization. Fixed by wrapping with `sanitizeRestoredHTML()`.

### Save display name — **Fixed v1.5.222 (4b73a06)**
`displayName` (user-controlled save name) was interpolated raw into an HTML string that fed `div.innerHTML`. Fixed with `escapeHtml(displayName)` at both save and restore message sites.

### Sync preview modal — **Fixed v1.5.222 (4b73a06)**
`item.name` (save filename from local or remote) was interpolated raw into `innerHTML`. Fixed with `escapeHtml()` on `item.id`, `item.name`, `statusClass`, `statusLabel`.

### Map connections list — **Open (`map-sheet.js:344`)**
`populateConnectionsList()` builds the connections list via `innerHTML` with `${c.node.name}` unescaped. Node names come from Z-machine status bar text — game-controlled. A crafted `.z5`/`.z8` game file (user-loadable via custom-game feature) can produce a room name like `<img src=x onerror=…>` that executes when the connections panel opens.

**Fix:** `escapeHtml(c.node.name)` — function already available in `utils/text-processing.js`.

## Attack surface context
- Save files cross user boundaries (Google Drive sync, file import) → High severity
- Custom game files are user-loaded but device-local → Medium severity
- Location names are parsed from the game's Z-machine status bar by `auto-mapper.js:getCurrentLocation()`, which strips score/move suffixes but does NOT strip HTML characters
