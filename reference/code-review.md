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
- `[-]` **Low** — `docs/js/narration/tts-player.js:200` — `startTimeout` (2s safety) is cleared on `onstart`/`onend`/`onerror`. `speechSynthesis.cancel()` triggers `onerror('interrupted')` which clears it, so the leak window is bounded by 2s in adversarial cases. **Won't fix in 6ea0eea: behavior is self-healing; added a clarifying comment instead.**
- `[x]` **Low** — `docs/js/features/map-canvas.js:290` — `window.addEventListener('resize', resizeCanvas)` is added once during lazy init and never removed. Not a leak (single listener, page lifetime, map DOM persists after `hideMap`), but the listener fires while map is hidden — wasted work on every viewport resize. **Fixed in 6ea0eea: gated on `isVisible`.**

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
- `[x]` **Low** — `docs/js/features/auto-mapper.js:119` — Empty `catch (e) {}` in VM-memory probe loop. Likely intentional (probing past valid memory regions throws expected errors), but the silence makes diagnosis hard if the auto-mapper actually breaks. **Fixed in 6ea0eea: added intent comment.**
- `[x]` **Low** — `docs/js/utils/remote-console.js:161` — Empty catch around `sendLog` to keep wrapped console from re-throwing. Defensible (don't disrupt original `console.*`), but worth a comment. **Fixed in 6ea0eea: added intent comment.**
- `[x]` **Low** — `docs/js/app.js:1589-1591` — `visibilitychange` handler catches and silently drops errors stopping recognition. Cleanup path, acceptable, but a comment explaining intent would help. **Fixed in 6ea0eea: added intent comment.**

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
- `[x]` **Low** — `docs/js/game/voxglk-renderer.js:352` — `// TODO: Re-enable with correct pattern if needed` — stale TODO with no actionable info. **Fixed in 6ea0eea: removed the entire ~20-line commented-out blank-line compression block.**
- `[x]` **Low** — `docs/js/game/voxglk-renderer.js:720` — Duplicate private `escapeHtml` function. **Fixed in 6ea0eea: removed; now imports shared `escapeHtml` from `utils/text-processing.js`.**

#### Verified safe
- No copy-pasted blocks ≥10 lines anywhere (good — refactoring effort paid off).
- All exported functions have importers in scope.
- No `export default` followed by unused import patterns; no commented-out code blocks.
- No deeply nested unreachable code after `return`/`throw`.

### Pass 5: Console noise
_Status: complete (2026-04-25)_

**Headline:** Clean. 31 total `console.*` statements (9 log, 15 error, 7 warn) across 6 files. No hot-loop logging, no sensitive data leaks, no debug spew. Better than most codebases this size.

#### Findings

- `[x]` **Low** — `docs/js/utils/storage/storage-api.js:240-265` — `printStorageReport()` is a user-invokable debug helper that does ~10 sequential `console.log` calls. **Fixed in 6ea0eea: collapsed to `console.group` + `console.table`.**
- `[x]` **Low** — `docs/js/features/map-canvas.js:478,516,1222` and `docs/js/ui/mobile-menu.js:272,287` — `console.warn` used for actual errors. **Fixed in 6ea0eea: changed to `console.error` on all 5 sites.**
- `[x]` **Low** — `docs/js/game/save-manager.js:31,52` — Compression/decompression `console.error` lines lack context. **Fixed in 6ea0eea: now logs input length alongside error.**

#### Verified safe
- No logs in hot loops (per-frame render, per-chunk narration, per-keystroke input).
- No transcripts, auth tokens, save bodies, or other sensitive content logged.
- `remote-console.js` and `offline-debug.js` correctly scoped out as intentional logging infra.

### Pass 6: Module hygiene
_Status: complete (2026-04-25)_

**Headline:** Well-structured. No real circular imports, no wildcard re-exports, no upward-layer violations (utils never imports from ui/features), max 3 relative-path levels. Barrel files use explicit named exports. Refactoring effort here would be minimal-payoff.

#### Findings

- `[x]` **Low** — `docs/js/game/commands/command-router.js:34-36` — Dynamic `await import('../../app.js')` to access `voiceCommandHandlers`. **Fixed in v1.5.226: voiceCommandHandlers is now in `voice/command-handlers.js`, imported statically. The `getVoiceCommandHandlers()` workaround function is gone, and ~16 `await getVoiceCommandHandlers()` call sites collapsed to direct references.**
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
_Status: complete (2026-04-26)_

**Headline:** `app.js` (1714 lines) is doing far more than entry-point wiring — it owns PWA update UI, install-prompt handling, the entire voice-command handler implementation, game-output narration glue, and a 902-line `initApp()` orchestrator. `state.js` is a coherent but kitchen-sink object (98 properties, no nesting). `core/dom.js` and `config.js` are appropriately thin.

#### Findings

- `[x]` **High** — `docs/js/app.js:391-719` — `voiceCommandHandlers` is ~330 lines of business logic (pause/play/skip/mute/unmute behavior) defined in the entry point. **Fixed in v1.5.226: extracted to `docs/js/voice/command-handlers.js` along with shared `pausePlayback()` / `resumePlayback()` helpers. app.js re-exports for backwards compatibility. Net: -447 lines from app.js. Also killed the entry-point cycle in `command-router.js` (was using a dynamic-import workaround to access voiceCommandHandlers; now a static import).**
- `[x]` **High** — `docs/js/app.js:747-1649` — `initApp()` is a 902-line orchestrator covering viewport, DOM init, voice init, UI components, event listeners, keyboard shortcuts, and lifecycle handlers. Single function with implicit ordering dependencies. **Fixed in v1.5.230: phase-split into 7 private functions (`initViewport`, `initDOMandValidation`, `initVoice`, `initUIComponents`, `wireEventListeners`, `wireKeyboardShortcuts`, `wireLifecycle`) called from a thin coordinator. app.js initApp() reduced to 9 lines.**
- `[x]` **Medium** — `docs/js/app.js:60-257` — ~200 lines of PWA service-worker registration, update notification UI, and countdown logic. **Fixed in v1.5.227: extracted to `docs/js/utils/pwa-updater.js` with one `initPWA()` export. Also moved install-prompt wiring, the manual "Check for updates" button, and standalone/iOS detection (additional ~115 lines) into the same module — they all share lifecycle and DOM concerns. app.js -315 lines.**
- `[x]` **Medium** — `docs/js/app.js:1140-1250` and `docs/js/app.js:391-445` — pause/play state mutations duplicated between the button handler (`handlePausePlay`) and the voice-command handler. **Fixed in v1.5.226: extracted to shared `pausePlayback()` / `resumePlayback()` in `voice/command-handlers.js`. The button handler is now a 5-line if/else. Voice "play" also gained the upper-window narration handling that only the button version had (e.g., Photopia intro).**
- `[ ]` **Medium** — `docs/js/core/state.js` — 98 properties, comment-grouped but not structurally grouped. A few clearly misplaced (`ttsIsSpeaking`, `appVoicePromise` wedged between narration and audio analysis; `soundDetected`/`soundPauseTimeout` interrupting the narration block). Consider nesting by subsystem (`state.voice`, `state.narration`, `state.gdrive`, etc.) — large refactor (100+ refs across the codebase) but big readability win.
- `[x]` **Low** — `docs/js/app.js:463, 1150, 1186` and `docs/js/narration/tts-player.js:259` — Three more `if (false && ...)` "TEMPORARILY DISABLED for debugging" auto-mute/unmute branches I missed in v1.5.222. **Fixed in v1.5.226: deleted all five dead `if (false &&)` blocks. The decoupling rationale now lives in `.tome/mic-narration-coupling.md` and the new `voice/command-handlers.js` references it in a comment. Code is the canonical state; tome is the canonical doc.**
- `[ ]` **Low** — `docs/js/app.js:1486-1537` — Keyboard shortcuts as a flat if/else cascade (`Ctrl+M`, `Ctrl+S`, `Ctrl+R`, `Ctrl+X`, `Escape`, arrow keys). Could be a `Map<string, handler>` with a single dispatcher. Quick win, marginal impact.
- `[ ]` **Low** — `docs/js/core/dom.js:103-118` — `validateDOM()` throws when critical IDs are missing. Defensive and correct, but couples `dom.js` to the HTML structure such that any HTML refactor needs this updated too. Acceptable; flag for awareness.

#### Verified safe / not concerns
- `core/dom.js` is genuinely just a DOM-ref cache + one validator; no logic creep.
- `core/config.js` is the right shape — single `APP_CONFIG` object, no logic.
- `core/app-commands.js` — focused module for `/`-prefixed app commands; not bloated.
- No inverted layering in `core/` — those modules don't import from `ui/`, `features/`, or `game/`.
- Cyclomatic complexity ≤10 across the batch — `handlePausePlay()` is the closest at ~8 nested branches.

#### Top 5 longest functions in batch
1. `initApp()` — `app.js:747-1649` (902 lines) — the elephant
2. `setupMuteButton` event cluster — `app.js:1332-1482` (~150 lines)
3. `handlePausePlay()` — `app.js:1140-1250` (~110 lines)
4. `showUpdateNotification()` — `app.js:91-200` (~110 lines)
5. Voice command pause handler — `app.js:407-445` (~40 lines)

#### Recommended refactor order (value/effort)
1. **Extract `voiceCommandHandlers`** to `voice/command-handlers.js` — High value, ~2 hrs. Removes 330 lines from entry point; voice behavior becomes testable.
2. **Extract PWA update logic** to `utils/pwa-updater.js` — Medium value, ~1 hr. Trivial and self-contained.
3. **Consolidate pause/play helpers** — Medium value, ~30 min. Quick DRY-up.
4. **Phase-split `initApp()`** — Medium value, ~4 hrs. Big readability win, careful to preserve init order.
5. **Nest `state.js` by subsystem** — Lower value, ~2 hrs core change + auditing 100+ refs. Defer until other refactors settle.

### Batch 2: Game engine (`game/voxglk*`, `game/game-loader.js`)
_Status: complete (2026-04-26)_

**Headline:** Clean three-way split between ZVM bridging (`voxglk.js`), HTML rendering (`voxglk-renderer.js`), and orchestration (`game-loader.js`). But `voxglk.js` is 1129 lines with 22 module-level `let` declarations and a single `update()` method that's 471 lines covering 5+ concerns. Renderer is properly side-effect-free. Game-loader mixes orchestration with recently-played UI rendering.

#### Findings

- `[ ]` **High** — `docs/js/game/voxglk.js:343-965` — `createVoxGlk()` closure (623 lines including the 471-line `update()` method) conflates Glk dispatch, autosave triggering, watchdog/repair state, grid-state reconstruction, status-line tracking, input mode transitions, and bootstrap restore. Each is a separable concern. Best split: `voxglk-watchdog.js` (5s timer + REPAIR command flow), `voxglk-grid.js` (char-mode grid reconstruction), `voxglk-bootstrap.js` (auto-restore sequencing).
- `[ ]` **High** — `docs/js/game/voxglk.js:14-45` — 22 module-level `let` declarations are state for the closure but read like globals. Lifecycle is implicit: which reset per-game vs per-turn vs never? Examples: `lastContentGeneration` (used once at line 691, set at 424 — race condition with resize), `gridStates` cleared in `init()` unconditionally (line 354), `skipNextUpdateAfterBootstrap` lifecycle spans two updates. Wrap in a typed state object or move into `createVoxGlk()` closure scope so the lifecycle is visible.
- `[ ]` **Medium** — `docs/js/game/voxglk.js:612, 1127` — Status-bar change detection compares the rendered HTML string (`statusBarHTML !== lastStatusLine`). Brittle: any rendering change (extra space, attribute order) triggers a false "changed" signal that re-narrates an unchanged room. Compare extracted plain text instead.
- `[ ]` **Medium** — `docs/js/game/game-loader.js:381-444` — `renderRecentlyPlayedSection()` is UI rendering (DOM creation, event listeners, dialog construction) inside the game-loader. Belongs in `ui/recently-played.js`. Same goes for the resume dialog and custom-game tracking helpers (`showResumeDialog`, `trackCustomGame`, `removeCustomGame`, `getCustomGamesWithAutosaves`).
- `[ ]` **Medium** — `docs/js/game/voxglk-renderer.js:59-74` — `renderUpdate(updateObj, persistentWindows)` accepts both the update's own windows and the persistent map, with fallback logic for when persistentWindows is missing. The only caller (`voxglk.js:602`) always passes persistentWindows, so the fallback is dead. Tighten the signature: require the windows map, document that it must be current.
- `[ ]` **Medium** — `docs/js/game/voxglk.js:552-599` — Grid-state reconstruction (rebuilding multi-line grid content from partial updates) is char-mode-only but lives inside the main `update()` loop. Hides what's actually a niche optimization for menus / "press any key" screens. Extract to a `processGridUpdates()` function called only when `inputType === 'char'`.
- `[ ]` **Low** — `docs/js/game/voxglk.js:1088-1090` — `isSafeToSave()` exports `!justExitedCharMode`. Misleading name for a very specific check (only guards against autosaving during char-mode→line transitions). Either rename to `isCharModeTransitioning()` or inline at the call site.
- `[ ]` **Low** — `docs/js/game/voxglk.js:974-1053` — `sendInput()` guards on `acceptCallback` at entry but not before the final call (line 1046). Theoretical race; in practice the callback isn't nullified mid-function. Add a defensive re-check before invoking.

#### Verified safe / not concerns
- `voxglk-renderer.js` is genuinely side-effect-free (good — pure functions for HTML generation).
- No cycles between `voxglk.js` and `voxglk-renderer.js`.
- `game-loader.js`'s actual loading path (ZVM init → fetch game file → start) is appropriately structured.

#### Top 5 longest functions in batch
1. `createVoxGlk()` closure — `voxglk.js:343-965` (623 lines)
2. `update()` method body — `voxglk.js:416-887` (471 lines)
3. `initGameSelection()` — `game-loader.js:538-789` (252 lines)
4. `startGame()` — `game-loader.js:24-264` (241 lines)
5. `processStyledContent()` — `voxglk-renderer.js:186-340` (155 lines)

#### Recommended refactor order (value/effort)
1. **Extract watchdog/repair to `voxglk-watchdog.js`** — High value, ~3 hrs. Self-contained module, removes ~150 lines from voxglk.js.
2. **Move recently-played UI to `ui/recently-played.js`** — Medium value, ~1.5 hrs. Clean separation; no shared mutable state.
3. **Status-bar plain-text comparison** — Medium value, ~30 min. Two variable renames + one extraction.
4. **Wrap voxglk module state into a `VoxGlkState` object** — High value, ~4 hrs. Big readability win, but touches every closure access.
5. **Extract bootstrap-restore to `voxglk-bootstrap.js`** — Medium value, ~2 hrs. Makes a fragile multi-file flow explicit and testable.

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
| Low | `storage-api.js:30,90` | setItem/setJSON return bool — caller can't distinguish error type |
| Low | `voxglk.js`, `game-output.js`, `tts-player.js` | Lazy imports in hot paths — could be static |
| Low | various | `window.*` used as cross-module signal channel |
| Medium | `core/state.js` | 98 props, kitchen-sink — consider nesting by subsystem |
| Low | `app.js:1486-1537` | Keyboard shortcuts as if-cascade; could be a Map dispatcher |
| Low | `core/dom.js:103-118` | `validateDOM()` couples to HTML structure (acceptable; awareness) |
| High | `voxglk.js:343-965` | `createVoxGlk()` closure conflates 5+ concerns (ember `20260426-054005-7990`) |
| High | `voxglk.js:14-45` | 22 module-level `let` decls with implicit lifecycle (ember `20260426-054023-392e`) |
| Medium | `voxglk.js:612` | Status-bar change detection compares HTML strings — use plain text |
| Medium | `game-loader.js:381-444` | Recently-played UI rendering belongs in `ui/recently-played.js` |
| Medium | `voxglk-renderer.js:59-74` | Dead fallback for missing `persistentWindows` — tighten signature |
| Medium | `voxglk.js:552-599` | Char-mode grid reconstruction nested in main loop — extract |
| Low | `voxglk.js:1088-1090` | `isSafeToSave()` misleading name for char→line transition guard |
| Low | `voxglk.js:974-1053` | `sendInput()` lacks defensive re-check on `acceptCallback` |

### Fixed
- **v1.5.222 (commit 4b73a06)** — 3 High security (XSS via save HTML and save names), 2 Medium quota errors (silent failures on import/backup), 3 Medium dead-code (`.bak` files, orphan temp, dead debug branch).
- **v1.5.223 (commit 6ea0eea)** — 8 Low: duplicate `escapeHtml` consolidated, stale TODO/commented block deleted, intent comments on 3 empty catches, `console.warn`→`console.error` on 5 real-error sites, compression error context, `printStorageReport` collapsed to `console.group`+`console.table`, TTS safety-timeout self-healing comment, map resize listener gated on `isVisible`.
- **v1.5.226 (commit 21d40cf)** — 1 High + 1 Medium + 2 Low: extracted `voiceCommandHandlers` (~330 lines) + shared `pausePlayback`/`resumePlayback` to `voice/command-handlers.js`; deleted 5 dead `if (false &&)` mic auto-mute blocks; killed the `command-router.js` entry-point cycle (now static import). app.js -447 lines.
- **v1.5.227 (commit f0fa1ac)** — 1 Medium: extracted PWA logic (SW reg, update notification, install prompt, standalone/iOS detection) to `utils/pwa-updater.js` with one `initPWA()` export. app.js -315 lines.
- **v1.5.230** — 1 High: phase-split `initApp()` (798 lines) into 7 private coordinator functions (`initViewport`, `initDOMandValidation`, `initVoice`, `initUIComponents`, `wireEventListeners`, `wireKeyboardShortcuts`, `wireLifecycle`). `initApp()` reduced to 9-line thin coordinator. All phases kept in `app.js`.
