# IFTalk Code Review

Started: 2026-04-25
Scope: `docs/js/**/*.js`, `docs/styles/**/*.css`, `docs/index.html`
Out of scope: `docs/lib/` (3rd-party), `server/`, `node_modules/`

## Severity scale
- **Critical** — security hole, data loss, app-breaking bug
- **High** — incorrect behavior, leaks, plausible user-visible regression
- **Medium** — maintainability/perf concern; refactor candidate
- **Low** — minor smell, easy cleanup
- **Nit** — stylistic, optional

## Status legend
- `[ ]` open
- `[~]` deferred / discussed, not fixed
- `[x]` fixed (with commit SHA)
- `[-]` won't fix (with reason)

---

## Tier 1 — Cross-cutting sweeps

### Pass 1: Security & secrets
_Status: complete (2026-04-25)_

**Threat model context:** Single-user PWA, all data in localStorage, optional Google Drive sync of save files, save files can be exported/imported as JSON. Realistic attacker: someone shares a malicious save file (file import or via shared Drive folder).

#### Findings

- `[x]` **High** — `docs/js/game/save-manager.js:570,580,595` — Restored save's `displayHTML.statusBar/upperWindow/lowerWindow` is written to `innerHTML` without sanitization. A crafted save file (imported via file picker or Google Drive sync) can execute arbitrary JS. This is the realistic XSS vector — saves are the cross-user data path. **Fixed in 4b73a06: wrap with `sanitizeRestoredHTML()`.**
- `[x]` **High** — `docs/js/game/save-manager.js:492` — `displayName` (user-controlled save name) is interpolated raw into a `<div class="system-message">…</div>` HTML string, then passed to `addGameText(html, isCommand=false)`. `addGameText` non-command branch calls `div.innerHTML = text` (`docs/js/ui/game-output.js:291`) without escaping. A save name like `<img src=x onerror=…>` executes. **Fixed in 4b73a06: `escapeHtml(displayName)` at both save and restore message sites (lines 493, 639).**
- `[x]` **High** — `docs/js/ui/sync-preview-modal.js:116` — `item.name` (save filename from local or remote) interpolated raw into the modal's `innerHTML`. Same template injection class as above. **Fixed in 4b73a06: `escapeHtml()` on `item.id`, `item.name`, `statusClass`, `statusLabel`. Also upgraded `escapeHtml` to escape quotes for attribute-context safety.**
- `[ ]` **Medium** — `docs/js/utils/gdrive/gdrive-auth.js` — Google OAuth access token in plain `localStorage`. Standard for client-side OAuth; the practical mitigation is closing XSS holes (above), not encrypting at rest (which would be theater since the key has to live client-side). Recording as awareness — fixing the XSS findings reduces this risk significantly.
- `[ ]` **Low** — `docs/index.html` — No CSP meta tag. App uses inline styles in some places, but no `eval` / `new Function` / string-arg timers, so a `default-src 'self'; script-src 'self';` CSP would be feasible and close many residual XSS paths.

#### Verified safe (no findings)
- `eval` / `new Function` / `setTimeout`/`setInterval` with string args — none.
- `googleClientId` in `config.js` — public OAuth client ID by design, expected.
- `target="_blank"` external links — checked, all use `rel="noopener"`.
- `postMessage` — only the SW `SKIP_WAITING` internal message; no cross-origin senders.
- Service worker — caches own-origin only; no open redirect or cache poisoning vector found.
- DOM clobbering — no `getElementById` on user-controlled IDs.

#### Won't pursue
- Map data `JSON.parse` — plain `JSON.parse` of own-localStorage data is not a real threat; if attacker has localStorage write, they own everything. Skip.

### Pass 2: Memory & lifecycle
_Status: complete (2026-04-25)_

**Headline:** No real leaks found. Codebase has good lifecycle hygiene — every `setInterval` (backup, voice meter, lock-screen hold, wake-lock, update countdown) has a matching `clearInterval`, recognition is stopped on every mute path, observers aren't used. Audit verified, agent's flagged items (map re-init, recognition cleanup, listener accumulation) were overstated — guards and pairings are in place.

#### Findings

- `[ ]` **Low** — `docs/js/input/keyboard/keyboard-core.js:619` — `setInterval(updateInputVisibility, 500)` polls input mode every 500ms for the page lifetime. Single timer, no accumulation, but wasteful — visibility only changes on mute toggle, system-entry mode toggle, or input-type change, all of which are event-driven elsewhere. Could be called from those events instead of polling.
- `[ ]` **Low** — `docs/js/app.js:221` — `setInterval(() => registration.update(), 30000)` for SW update check is never cleared. Page-lifetime singleton, no real leak, but worth noting as a one-shot timer that could be paired or moved to a Page Visibility-aware schedule.
- `[ ]` **Low** — `docs/js/narration/tts-player.js:200` — `startTimeout` (2s safety) is cleared on `onstart`/`onend`/`onerror`. `speechSynthesis.cancel()` triggers `onerror('interrupted')` which clears it, so the leak window is bounded by 2s in adversarial cases. Marginal — could explicitly clear in `stopNarration()` for clarity.
- `[ ]` **Low** — `docs/js/features/map-canvas.js:290` — `window.addEventListener('resize', resizeCanvas)` is added once during lazy init and never removed. Not a leak (single listener, page lifetime, map DOM persists after `hideMap`), but the listener fires while map is hidden — wasted work on every viewport resize. Consider gating on `isVisible`.

#### Verified safe
- `setInterval` cleanups: save-manager backup (`backupIntervalId`), voice-meter (`state.voiceMeterInterval`), lock-screen hold (`holdUpdateInterval`), wake-lock periodic check (`periodicCheckTimer`), update countdown (`autoRefreshTimer`) — all properly paired with `clearInterval`.
- `initMapCanvas()` — both call sites in `app.js:1068` and `app.js:1501` are guarded with `if (!mapModule)`, so init runs at most once per session. Not the duplicate-binding hazard the audit suggested.
- `state.recognition.stop()` is called from 8+ paths (mute toggle, push-to-talk release, settings changes, narration start, etc.) — recognition lifecycle is well managed.
- No `MutationObserver` / `IntersectionObserver` / `ResizeObserver` usage anywhere — no observer cleanup risk.
- `state.voiceHistoryItems` capped at 20; `state.recentlySpokenChunks` capped at 30 with TTL; `iftalk_backup_*` capped per `MAX_BACKUPS_PER_GAME`; offline-debug capped at 50. All bounded growth.
- `eval` / `new Function` / string-arg timers — none.

### Pass 3: Error handling
_Status: complete (2026-04-25)_

**Headline:** Mostly solid. Storage API has consistent try/catch wrappers; gdrive UI catches and surfaces errors; quota handling is implemented in the main save path. A few real gaps in non-primary save paths and a couple of intentional empty catches that should be documented as such.

#### Findings

- `[x]` **Medium** — `docs/js/game/save-manager.js:864` — Imported save file written via `setJSON(key, saveData)` without checking return. If the import is large enough to exceed quota, `setJSON` returns `false`, but the user sees `updateStatus('Import successful!')` and is prompted to load, finding nothing on reload. **Fixed in 4b73a06: check return and surface "Import failed: storage full." error.**
- `[x]` **Medium** — `docs/js/game/save-manager.js:928` — Backup save (`createBackup`) calls `setJSON(backupKey, saveData)` and ignores the return. Backups can grow large (full game state + map data); quota failures here mean the backup chain silently breaks. **Fixed in 4b73a06: return false from createBackup() when setJSON fails.**
- `[ ]` **Low** — `docs/js/utils/storage/storage-api.js:30-37,90-97` — `setItem`/`setJSON` return `false` for *any* error (quota, security, type). Callers can't distinguish without re-throwing. The save-manager primary path works around this by re-probing; cleaner long-term: throw a typed error and let callers catch by `error.name === 'QuotaExceededError'`.
- `[ ]` **Low** — `docs/js/features/auto-mapper.js:119` — Empty `catch (e) {}` in VM-memory probe loop. Likely intentional (probing past valid memory regions throws expected errors), but the silence makes diagnosis hard if the auto-mapper actually breaks. A one-line comment explaining "intentional: VM-memory probe expected to throw past objects" would suffice.
- `[ ]` **Low** — `docs/js/utils/remote-console.js:161` — Empty catch around `sendLog` to keep wrapped console from re-throwing. Defensible (don't disrupt original `console.*`), but worth a comment.
- `[ ]` **Low** — `docs/js/app.js:1589-1591` — `visibilitychange` handler catches and silently drops errors stopping recognition. Cleanup path, acceptable, but a comment explaining intent would help.

#### Verified safe (overstated by audit)
- Dynamic `import().then()` without `.catch()` — multiple instances flagged; in this codebase modules are bundled & cached by SW. Realistic failure rate is near zero. Not a real concern in practice.
- Save-manager primary save path (`save-manager.js:459`) — properly probes quota and re-throws meaningful error.
- `JSON.parse` of localStorage data — every call site wraps via `getJSON` which catches.
- `gdrive-ui.js:174-183` (sign-in) — correctly catches and surfaces `error.message` to user; agent misread this one.
- Type coercion — codebase uses `===` consistently; one minor `if (!statusBarText)` falsy trap in auto-mapper, but the value is a name (never "0"), so the trap doesn't fire.

### Pass 4: Dead code & duplication
_Status: complete (2026-04-25)_

**Headline:** Cleanest pass yet on duplication (none found over 10-line threshold), but 7 orphan/backup files cluttering the tree and one disabled-for-debugging branch in production code.

#### Findings

- `[x]` **Medium** — `docs/js/utils/gdrive/gdrive-sync-preview-temp.js` — Orphan file, zero importers, contains broken syntax (escaped `\!` chars on lines 64 and 133, parameter/variable name mismatch `gameNames` vs `gameName`). Looks like an abandoned in-progress refactor. Safe to delete after verifying via grep that no dynamic-import string references it (none found). **Deleted in 4b73a06.**
- `[x]` **Medium** — Six `.bak` files in tree:
  - `docs/js/game/game-loader.js.bak`
  - `docs/js/game/save-manager.js.bak`
  - `docs/js/ui/confirm-dialog.js.bak`
  - `docs/js/ui/settings/gdrive-ui.js.bak`
  - `docs/js/ui/sync-preview-modal.js.bak`
  - `docs/js/utils/gdrive/gdrive-sync-preview.js.bak`

  Git history is the right tool for this. They're not served by Express (extension wouldn't match), but they bloat the tree and confuse search. **Deleted in 4b73a06; `*.bak` was already in `.gitignore`.**
- `[x]` **Medium** — `docs/js/app.js:417` — `if (false && !state.pushToTalkMode && ...)` dead branch with comment "TEMPORARILY DISABLED for debugging". This is blocking auto-mute-on-pause logic. **Fixed in 4b73a06: removed the `false && ` gating, restoring the auto-mute-on-pause behavior described by the comment above it.**
- `[ ]` **Low** — `docs/js/game/voxglk-renderer.js:352` — `// TODO: Re-enable with correct pattern if needed` — stale TODO with no actionable info. Either remove the comment or file an issue.

#### Verified safe
- No copy-pasted blocks ≥10 lines anywhere (good — refactoring effort paid off).
- All exported functions have importers in scope.
- No `export default` followed by unused import patterns; no commented-out code blocks.
- No deeply nested unreachable code after `return`/`throw`.

### Pass 5: Console noise
_Status: complete (2026-04-25)_

**Headline:** Clean. 31 total `console.*` statements (9 log, 15 error, 7 warn) across 6 files. No hot-loop logging, no sensitive data leaks, no debug spew. Better than most codebases this size.

#### Findings

- `[ ]` **Low** — `docs/js/utils/storage/storage-api.js:240-265` — `printStorageReport()` is a user-invokable debug helper that does ~10 sequential `console.log` calls. Not called automatically. Could be one structured `console.table` or `console.group` for readability, but harmless as-is.
- `[ ]` **Low** — `docs/js/features/map-canvas.js:478,516,1222` and `docs/js/ui/mobile-menu.js:272,287` — `console.warn` used for actual errors (failed saves, parse failures). Should be `console.error`. Minor — error → warn mismatches just affect devtools filtering.
- `[ ]` **Low** — `docs/js/game/save-manager.js:31,52` — Compression/decompression `console.error` lines lack context (which save, which key). When debugging real failures, this matters; the error alone is rarely enough.

#### Verified safe
- No logs in hot loops (per-frame render, per-chunk narration, per-keystroke input).
- No transcripts, auth tokens, save bodies, or other sensitive content logged.
- `remote-console.js` and `offline-debug.js` correctly scoped out as intentional logging infra.

### Pass 6: Module hygiene
_Status: complete (2026-04-25)_

**Headline:** Well-structured. No real circular imports, no wildcard re-exports, no upward-layer violations (utils never imports from ui/features), max 3 relative-path levels. Barrel files use explicit named exports. Refactoring effort here would be minimal-payoff.

#### Findings

- `[ ]` **Low** — `docs/js/game/commands/command-router.js:34-36` — Dynamic `await import('../../app.js')` to access `voiceCommandHandlers` defers a soft entry-point cycle (`app.js` → `commands/index.js` → `command-router.js` → would-be `app.js`). Justifiable workaround, isolated to a non-hot lookup. The cleaner long-term shape is to move `voiceCommandHandlers` out of `app.js` into its own module so `command-router` can static-import it, but it's not painful as-is.
- `[ ]` **Low** — `docs/js/game/voxglk.js`, `docs/js/ui/game-output.js`, `docs/js/narration/tts-player.js` — Multiple dynamic `await import(...)` calls inside per-output / per-chunk hot paths (e.g., voxglk.js loads `updateStatus`/`addGameText`/`autoSave` dynamically each time). Modules are cached by the runtime so the perf cost is small, but it muddies the dependency graph. These look like incremental cycle-avoidance accumulated over time — could be statically imported if no actual cycle exists.
- `[ ]` **Low** — `window.*` globals as cross-module channel: `window.lastSentCommand`, `window.lastCommandWasVoice`, `window.lastCommandConfidence`, `window.getCurrentLocation`, `window.getMapData`, `window.showMap`/`hideMap`/`toggleMap`, `window.state`, `window.IFTalkStorage`. Most are debug hooks or one-shot signal flags. The signal flags (`lastSentCommand` for voice echo detection) could be moved to `state.js` for clarity; the debug ones are fine to leave.

#### Verified safe
- No `export * from '...'` wildcard re-exports anywhere.
- `core/state.js` and `core/dom.js` import only from their own layer — no upward leaks.
- `utils/*` does not import from `ui/*` or `features/*` (correct layering).
- Barrel files (`commands/index.js`, `ui/settings/index.js`, `utils/gdrive/index.js`, `input/keyboard/index.js`) use explicit exports — clear dependencies.
- Map modules use a callback-injection pattern (`map-handlers.js`, `map-sheet.js`) to break would-be cycles with `map-canvas.js` — cleaner than dynamic imports.
- No relative paths deeper than `../../../` anywhere.

---

## Tier 2 — Module-by-module review

### Batch 1: Core (`app.js`, `config.js`, `core/`)
_Status: pending_

### Batch 2: Game engine (`game/voxglk*`, `game/game-loader.js`)
_Status: pending_

### Batch 3: Save/restore (`game/save-manager.js`, save formatters)
_Status: pending_

### Batch 4: Commands (`game/commands/`)
_Status: pending_

### Batch 5: Settings UI (`ui/settings/`)
_Status: pending_

### Batch 6: Map system (`features/map-*`, `auto-mapper.js`)
_Status: pending_

### Batch 7: Narration (`narration/`)
_Status: pending_

### Batch 8: Voice (`voice/`)
_Status: pending_

### Batch 9: Input (`input/`)
_Status: pending_

### Batch 10: UI components & utils (`ui/`, `utils/`)
_Status: pending_

### Batch 11: CSS pass
_Status: pending_

---

## Tier 3 — Deep dives on hot spots
_Pending until Tiers 1 & 2 complete._

---

## Findings index

### Open findings

| Sev | File:Line | Hook |
|-----|-----------|------|
| Medium | `gdrive-auth.js` | OAuth token in plain localStorage (mitigated by fixing XSS) |
| Low | `index.html` | No CSP meta tag |
| Low | `keyboard-core.js:619` | 500ms polling for input visibility — could be event-driven |
| Low | `app.js:221` | SW update interval never cleared (page-lifetime singleton) |
| Low | `tts-player.js:200` | TTS startTimeout not explicitly cleared in stopNarration |
| Low | `map-canvas.js:290` | Window resize listener fires while map is hidden |
| Low | `storage-api.js:30,90` | setItem/setJSON return bool — caller can't distinguish error type |
| Low | `auto-mapper.js:119` | Empty catch in VM probe — needs intent comment |
| Low | `remote-console.js:161` | Empty catch in console wrapper — needs intent comment |
| Low | `app.js:1589-1591` | Visibilitychange swallows recognition stop errors |
| Low | `storage-api.js:240-265` | `printStorageReport()` cluster of console.log — could be grouped |
| Low | `map-canvas.js:478,516,1222`, `mobile-menu.js:272,287` | `console.warn` used for real errors, should be `console.error` |
| Low | `save-manager.js:31,52` | Compression error logs lack context for debugging |
| Low | `voxglk-renderer.js:352` | Stale TODO with no actionable info |
| Low | `command-router.js:34-36` | Dynamic import of `app.js` to break entry-point cycle |
| Low | `voxglk.js`, `game-output.js`, `tts-player.js` | Lazy imports in hot paths — could be static |
| Low | various | `window.*` used as cross-module signal channel |
| Low | `voxglk-renderer.js:720` | Duplicate private `escapeHtml` — could share `text-processing.js` version |

### Fixed in v1.5.222 (commit 4b73a06)
- 3 High security findings (innerHTML XSS via save HTML and save names)
- 2 Medium quota error findings (silent failures on import/backup)
- 3 Medium dead-code findings (`.bak` files, orphan temp, dead debug branch)
