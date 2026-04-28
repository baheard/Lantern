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

- `[x]` **High** — `docs/js/game/voxglk.js:343-965` — `createVoxGlk()` closure conflates 5+ concerns. **All three sub-extractions complete: `voxglk-watchdog.js` (v1.5.228), `voxglk-grid.js` (v1.5.229), `voxglk-bootstrap.js` (v1.5.231).**
- `[ ]` **High** — `docs/js/game/voxglk.js:14-45` — 22 module-level `let` declarations are state for the closure but read like globals. Lifecycle is implicit: which reset per-game vs per-turn vs never? Examples: `lastContentGeneration` (used once at line 691, set at 424 — race condition with resize), `gridStates` cleared in `init()` unconditionally (line 354), `skipNextUpdateAfterBootstrap` lifecycle spans two updates. Wrap in a typed state object or move into `createVoxGlk()` closure scope so the lifecycle is visible.
- `[ ]` **Medium** — `docs/js/game/voxglk.js:612, 1127` — Status-bar change detection compares the rendered HTML string (`statusBarHTML !== lastStatusLine`). Brittle: any rendering change (extra space, attribute order) triggers a false "changed" signal that re-narrates an unchanged room. Compare extracted plain text instead.
- `[ ]` **Medium** — `docs/js/game/game-loader.js:381-444` — `renderRecentlyPlayedSection()` is UI rendering (DOM creation, event listeners, dialog construction) inside the game-loader. Belongs in `ui/recently-played.js`. Same goes for the resume dialog and custom-game tracking helpers (`showResumeDialog`, `trackCustomGame`, `removeCustomGame`, `getCustomGamesWithAutosaves`).
- `[ ]` **Medium** — `docs/js/game/voxglk-renderer.js:59-74` — `renderUpdate(updateObj, persistentWindows)` accepts both the update's own windows and the persistent map, with fallback logic for when persistentWindows is missing. The only caller (`voxglk.js:602`) always passes persistentWindows, so the fallback is dead. Tighten the signature: require the windows map, document that it must be current.
- `[x]` **Medium** — `docs/js/game/voxglk.js:552-599` — Grid-state reconstruction nested in main loop. **Fixed in v1.5.229: extracted to `voxglk-grid.js`.**
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

### Batch 3: Save/restore (`game/save-manager.js`)
_Status: complete (2026-04-26)_

**Headline:** Focused, well-maintained module (1079 lines). Prior Tier 1 fixes (XSS sanitization, quota-error propagation) leave no security gaps. Two medium concerns: ~200 lines of map-domain logic embedded here, and `initSaveHandlers` mixing UI wiring with save logic. No data-loss bugs. The agent-flagged race condition was a false positive — `flushMapSave()` is synchronous and the flush-before-read pattern is correct.

#### Findings

- `[ ]` **Medium** — `docs/js/game/save-manager.js:102-222, 230-310` — `getOptimizedMapData()` (121 lines) and `restoreMapData()` (80 lines) embed map-domain knowledge in the save module: they hardcode the `iftalk_map_${gameName}` localStorage key and know the internal structure of map node/edge data. This is map-module knowledge. Better: export `exportMapState()` / `importMapState(data)` from `features/map-canvas.js` and have save-manager call those abstractions. Current coupling: if map storage keys or data shape change, save-manager breaks silently.
- `[ ]` **Medium** — `docs/js/game/save-manager.js:1008-1079` — `initSaveHandlers()` wires 5 DOM button event listeners and calls `closeSettings()` (imported from settings module). Save logic and UI-binding are mixed. Save functions are already exported; the event-listener wiring could move to a UI-layer module (e.g., `ui/settings/settings-panel.js` or a toolbar init file), leaving save-manager purely for save/restore operations.
- `[ ]` **Low** — `docs/js/game/save-manager.js:626` — `performRestore()` directly mutates `state.skipNarrationAfterLoad` and `state.currentChunkIndex`. Not a bug, but restore logic is coupled to narration state — testing in isolation requires the full `state` object.
- `[ ]` **Low** — `docs/js/game/save-manager.js:82-84` — `limitHTMLHistory`: if the character-boundary truncation point falls before the first `<` tag, the text before that tag is silently dropped. Minor edge case — the oldest visible turn can lose a trailing text node at the boundary.

#### Verified safe / not concerns
- Race condition in `getOptimizedMapData`: `flushMapSave()` is synchronous (clears debounce timer + calls `saveMapImmediately()` → writes to localStorage synchronously). The flush-before-read pattern is correct. Agent's High flag was a false positive.
- Dynamic `await import('./voxglk.js')` in `performSave()`: voxglk.js ↔ save-manager.js is a real circular dependency (voxglk dynamically imports `quickLoad`, `autoLoad`, `autoSave`). Dynamic import is the correct resolution — not a smell.
- GDrive sync `catch (error) {}` at line 486: intentionally silent — Drive sync is optional, async, and best-effort. Documented in the comment.
- Backup cleanup (`cleanupOldBackups`): collects all keys into an array first, then deletes — no iteration hazard. Sort-by-timestamp + slice logic is correct.
- `performSave`/`performRestore` length (112/144 lines): well-decomposed with private helpers (`compressString`, `getOptimizedMapData`, `getCurrentDisplayState`, etc.). Not a concern.
- Timer: `stopAutosaveBackupTimer()` correctly pairs `clearInterval(backupIntervalId)` and nulls the ID.
- Compression fallback: both `compressString`/`decompressString` catch and return original on error — safe.

#### Top 5 longest functions in batch
1. `performRestore()` — `save-manager.js:518-661` (144 lines)
2. `getOptimizedMapData()` — `save-manager.js:102-222` (121 lines)
3. `performSave()` — `save-manager.js:394-505` (112 lines)
4. `restoreMapData()` — `save-manager.js:230-315` (86 lines)
5. `initSaveHandlers()` — `save-manager.js:1008-1079` (72 lines)

#### Recommended refactor order (value/effort)
1. **Export `exportMapState()`/`importMapState()` from map-canvas.js** — Medium value, ~2 hrs. Removes 200 lines of map knowledge from save-manager; makes both modules independently testable.
2. **Move `initSaveHandlers()` wiring to UI layer** — Low value, ~30 min. Minor separation improvement; unblocks removal of the `closeSettings` import from save-manager.

### Batch 4: Commands (`game/commands/`)
_Status: complete (2026-04-27)_

**Headline:** Well-factored batch — 4 small modules (command-router.js, meta-command-handlers.js, save-list-formatter.js, index.js) with clear single responsibilities. No bloat comparable to prior batches. Three medium concerns: `respondAsGame()` duplicated verbatim across the module boundary; save-name validation logic (~60 lines) duplicated between user-initiated and game-initiated save flows; and `MAX_SAVES = 5` custom-save limit silently dropped during the `commands.js` → `game/commands/` modularization refactor. Low-severity cleanup items: unsafe `JSON.parse` in save-list-formatter, two dead functions, and `window.state` used instead of the imported `state` in one handler.

#### Findings

- `[ ]` **Medium** — `docs/js/game/commands/command-router.js:339` and `docs/js/game/commands/meta-command-handlers.js:21` — `respondAsGame()` defined identically in both files (14 lines, byte-for-byte identical: `addGameText` call, `tempDiv` innerHTML, `window.handleGameOutput` dispatch). One module should import it from the other, or extract to a shared `ui/respond-as-game.js`.
- `[ ]` **Medium** — `docs/js/game/commands/meta-command-handlers.js:224-273` vs `meta-command-handlers.js:380-458` — `handleSaveResponse()` and `handleGameSaveResponse()` share ~60 lines of duplicated validation: number-to-save lookup, quicksave/autosave overwrite protection, name format regex, reserved-name check. Difference is only the final action (call `customSave()` vs set `window._customSaveFilename` + invoke `gameDialogCallback`). Extract a `validateSaveName(input, allSaves)` helper returning `{valid, targetSaveName, errorMessage}`.
- `[x]` **Medium** — `docs/js/game/commands/meta-command-handlers.js:handleSaveResponse,handleGameSaveResponse` — `MAX_SAVES = 5` custom-save limit was silently dropped during the `commands.js` → `game/commands/` modularization refactor (commit `107a47b`). Old code blocked new saves when `saves.length >= MAX_SAVES` (same check in both user-typed and game-dialog flows) with a clear message directing the user to delete or overwrite. Now unlimited custom saves are possible, risking localStorage bloat and unwieldy save lists. **Fixed in v1.5.234: restored `const MAX_SAVES = 5` and guards in both response handlers; allows overwrites, blocks net-new saves when at limit.**
- `[ ]` **Low** — `docs/js/game/commands/save-list-formatter.js:21,55,73` — `JSON.parse` called directly on localStorage reads in `getCustomSaves()`, `getQuicksave()`, `getAutosave()`. A corrupted or partially-written save entry throws uncaught. Rest of codebase uses `getJSON` from `storage-api.js` which wraps and catches. Should use `getJSON` here for consistency.
- `[ ]` **Low** — `docs/js/game/commands/meta-command-handlers.js:300,301,307,313,314` — `handleRestoreResponse()` uses `window.state.currentGameName` (5 sites) despite `state` being statically imported at the module top. `handleGameRestoreResponse()` (line 506) correctly uses imported `state`. Inconsistency; should use imported `state` throughout.
- `[ ]` **Low** — `docs/js/game/commands/command-router.js:493-510` — `waitForInputAndContinue()` is defined, unexported, and never called from anywhere in the module (only its own recursive self-call). Dead function; safe to delete.
- `[ ]` **Low** — `docs/js/game/commands/command-router.js:484-487` — `sendCommand()` is an empty no-op exported "for compatibility." app.js imports it (line 43) but never calls it (`window._sendCommand` uses `sendCommandDirect`). Delete from command-router.js, index.js, and the app.js import list.

#### Verified safe / not concerns
- Entry-point cycle from command-router.js is fixed (v1.5.226): confirmed static import of `voiceCommandHandlers` from `voice/command-handlers.js` at line 29.
- `interceptMetaCommand()` at 283 lines looks large but is 95% a command dispatch table — legitimate for this type of code; switch case bodies average 2-3 lines.
- `formatSaveEntry()` injects `save.name` directly into HTML without `escapeHtml`, but names are validated to `/^[a-zA-Z0-9_ -]+$/` at save time — no angle brackets possible. Brittle trust but not a current XSS vector.
- `getCustomSaves()` iterates entire localStorage O(n) — not a performance concern; user-invoked, never in a hot loop.
- `awaitingMetaInput` module-level mutable state is appropriate for single-session interactive dialog. `setAwaitingMetaInput` external setter is the intended cross-module write path.
- `Dialog.file_construct_ref()` bare global (lines 555, 578): same pattern as rest of codebase; consistent with dialog-stub.js load expectations.
- Re-prompting in `handleGameSaveResponse`/`handleGameRestoreResponse` (restore `awaitingMetaInput`, re-enter system mode) is correct behavior for in-game dialogs that must stay open on bad input.
- `handleSaveResponse`/`handleRestoreResponse`/`handleDeleteResponse` in command-router.js receive a `saves` parameter that's ignored — the actual list is re-fetched inside `handleMetaResponse`. Minor but harmless.

#### Top 5 longest functions in batch
1. `interceptMetaCommand()` — `command-router.js:50-333` (283 lines) — command dispatch table; acceptable
2. `sendCommandDirect()` — `command-router.js:379-479` (100 lines) — mute check + display + history + dispatch + send
3. `handleGameSaveResponse()` — `meta-command-handlers.js:380-458` (78 lines)
4. `initDialogInterceptor()` — `meta-command-handlers.js:524-593` (69 lines)
5. `handleMetaResponse()` — `meta-command-handlers.js:157-219` (62 lines)

#### Recommended refactor order (value/effort)
1. **Restore `MAX_SAVES` limit** — Medium value, ~15 min. Re-add `const MAX_SAVES = 5` and both enforcement checks (user-typed save + game-dialog save). Restores intentional UX guard and prevents localStorage bloat.
2. **Extract `respondAsGame()` to shared module** — Low value, ~15 min. Import in both callers. Clear DRY violation.
3. **Extract `validateSaveName()` helper** — Medium value, ~30 min. Eliminates ~60 lines of duplicated validation with divergence risk.
4. **Use `getJSON` in save-list-formatter** — Low value, ~15 min. Consistency and crash protection on corrupt saves.
5. **Delete dead code** (`waitForInputAndContinue`, `sendCommand`) — Low value, ~5 min. Clean-up only.

### Batch 5: Settings UI (`ui/settings/`)
_Status: complete (2026-04-27)_

**Headline:** Five focused modules with clear ownership, but two cross-module duplication problems and a modal-builder that's overstayed its welcome in the settings orchestrator. `data-management-ui.js` silently re-defines two functions verbatim from `settings-panel.js` instead of importing them, and nearly duplicates its own clear-all handler in two places. `showBackupSavesDialog()` (110 lines of inline DOM construction) belongs in a separate file. Low-severity UI concerns: `alert()` for post-deletion feedback and indefinite `populateVoiceDropdown` polling.

#### Findings

- `[ ]` **Medium** — `docs/js/ui/settings/data-management-ui.js:18-53` — `isOnWelcomeScreen()` and `getGameDisplayName()` defined identically to `settings-panel.js:60-95`. Both functions are exported from `settings-panel.js`; `data-management-ui.js` should import them instead of redefining them locally. Exact copy — any future change to either needs to be made in two places.
- `[ ]` **Medium** — `docs/js/ui/settings/settings-panel.js:171-281` — `showBackupSavesDialog()` is 111 lines of inline modal DOM construction (overlay, dialog, HTML content, event listeners, restore button wiring) embedded in the settings orchestrator. Same concern as `renderRecentlyPlayedSection()` in game-loader (Batch 2). Move to `docs/js/ui/backup-saves-dialog.js` with a single `showBackupSavesDialog()` export.
- `[ ]` **Medium** — `docs/js/ui/settings/data-management-ui.js:62-144` vs `149-190` — The welcome-screen path of `clearAllDataBtn` (clear all data + Drive deletion + alert + closeSettings) is ~45 lines that duplicate `deleteAllAppDataBtn`'s handler almost exactly. Extract a shared `async function handleDeleteAllAppData()` and call it from both.
- `[ ]` **Low** — `docs/js/ui/settings/data-management-ui.js:112,130` — `alert()` used for post-deletion confirmation. Native `alert` is synchronous, blocks the event loop, and looks out-of-place in a PWA. Replace with `confirmDialog(..., { okOnly: true })` which is already imported and used in the same file.
- `[ ]` **Low** — `docs/js/ui/settings/voice-selection.js:217-219` — `populateVoiceDropdown()` retries indefinitely if `speechSynthesis.getVoices()` returns empty (`setTimeout(populateVoiceDropdown, 100)`). On browsers where voices never load, this leaks a perpetual timer. Add a max retry count (e.g., 50 attempts = 5 seconds).
- `[ ]` **Low** — `docs/js/ui/settings/gdrive-ui.js:131` — `iftalk_gdrive_folder_id` sometimes stores `'path:' + folderPath` (a path string, not a Drive folder ID). The key name implies an ID. The `'path:'` prefix is handled correctly in `gdrive-api.js:127`, but the naming makes the contract non-obvious to future readers.
- `[ ]` **Low** — `docs/js/ui/settings/voice-selection.js:276` — `loadBrowserVoiceConfig()` is declared `async` but contains no `await`. The `async` keyword is unnecessary and implies async work to callers. Change to a synchronous function.
- `[ ]` **Low** — `docs/js/ui/settings/voice-selection.js:206` — `getVoiceDisplayName()` prefixes voices with `★` based on `getIOSPreferredIndex()` on all platforms. On Windows/Android the iOS-preferred voices (Karen, Tessa, etc.) don't exist, so the `★` never appears — but the intent of the marker is platform-specific and should be gated on `isIOS`.

#### Verified safe / not concerns
- `closeSettings()` import in `data-management-ui.js` and `meta-command-handlers.js` — appropriate; settings-panel owns panel open/close state.
- `restoreBackup()` try/catch (settings-panel.js:288) wraps the full operation including the `localStorage.setItem` for the restore copy — errors surface to user.
- `getDriveFolderId()` / `'path:'` prefix: consumed at `gdrive-api.js:127` with an explicit `startsWith('path:')` check — convention is documented and handled correctly.
- Accordion wiring in `initSettings()` — `querySelectorAll` runs once during init, no listener accumulation.
- `populateVoiceDropdown` on `speechSynthesis.onvoiceschanged` — correct Web Speech API pattern; `onvoiceschanged` fires asynchronously on first voice availability.
- `voice-selection.js.backup` — dead backup file in tree (same class as the `.bak` files removed in Batch 4; safe to delete).
- Boolean persistence inconsistency (`keepAwakeToggle` uses `=== 'true'`, others use `!== 'false'`) — intentional: keep-awake defaults to off while others default to on. Not a bug.

#### Top 5 longest functions in batch
1. `initSettings()` — `settings-panel.js:340-551` (212 lines) — settings wiring + accordion + all slider/toggle init
2. `initDataManagementUI()` — `data-management-ui.js:58-191` (134 lines)
3. `openFolderPicker()` — `gdrive-ui.js:37-156` (120 lines) — inline modal constructor
4. `showBackupSavesDialog()` — `settings-panel.js:171-281` (111 lines) — inline modal constructor
5. `populateVoiceDropdown()` — `voice-selection.js:214-270` (57 lines)

#### Recommended refactor order (value/effort)
1. **Import `isOnWelcomeScreen` and `getGameDisplayName` in `data-management-ui.js`** — Medium value, ~10 min. Delete the two local copies; already exported from `settings-panel.js`.
2. **Move `showBackupSavesDialog` to `ui/backup-saves-dialog.js`** — Medium value, ~45 min. Self-contained modal; trivially extractable.
3. **Extract shared `handleDeleteAllAppData()` helper** — Low value, ~20 min. Eliminates 45-line duplication in `data-management-ui.js`.
4. **Replace `alert()` with `confirmDialog({okOnly: true})`** — Low value, ~10 min. Better PWA UX, already imported.
5. **Cap `populateVoiceDropdown` retry loop** — Low value, ~5 min. Add `if (attempts > 50) return;`.

### Batch 6: Map system (`features/map-*`, `auto-mapper.js`)
_Status: complete (2026-04-27)_

**Headline:** Four focused modules with a clear division of concerns — data tracking (`auto-mapper.js`), input handling (`map-handlers.js`), sheet UI (`map-sheet.js`), and orchestration (`map-canvas.js`). The callback-injection pattern in `map-handlers.js` and `map-sheet.js` is a clean cycle-break, confirmed in Pass 6. One XSS finding: unescaped node names in the connections list's `innerHTML`. Two duplication problems: a direction-offset table appears twice in `map-canvas.js`, and the edge-transfer logic is copy-pasted between both merge functions in `map-sheet.js`. `map-canvas.js` at 1963 lines is the largest module reviewed so far — the toast system (~200 lines) and `syncMapFromAutoMapper` (~105 lines) are natural extraction candidates.

#### Findings

- `[x]` **Medium** — `docs/js/features/map-sheet.js:344` — `populateConnectionsList()` builds the connections list via `innerHTML` with `${c.node.name}` unescaped. Node names originate from Z-machine status bar text, which is game-controlled. A crafted `.z5`/`.z8` game file (user-loadable via the custom-game feature) could produce a room name like `<img src=x onerror=…>` that executes when the connections panel is opened. Same class as the save-name XSS fixed in Pass 1. **Fixed in v1.5.234: import `escapeHtml` from `utils/text-processing.js`; wrap `c.node.name` at the injection site.**
- `[ ]` **Medium** — `docs/js/features/map-canvas.js:1553-1569` — `syncFromAutoMapper()` defines an inline `directionOffsets` table that duplicates (and partially diverges from) `DIRECTION_OFFSETS` imported from `map-config.js`. The inline version adds lowercase aliased keys (`'n'`/`'north'` etc.); it also omits portal commands (`in`/`out`/`enter`/`exit`) that appear in `COMMAND_DIRECTIONS`. Any extension to `DIRECTION_OFFSETS` in map-config won't be reflected here. Import and use `DIRECTION_OFFSETS` directly, supplementing only keys genuinely absent from the canonical set.
- `[ ]` **Medium** — `docs/js/features/map-sheet.js:544-569, 704-729` — `handleNodeMerge()` and `performManualMerge()` contain byte-for-byte identical edge-transfer logic: iterate `mapState.edges`, partition into `edgesToAdd`/`edgesToDelete`, apply changes, and re-protect edges. The only differences are the node IDs and the closing `showHint` message. Extract a private `transferEdges(sourceId, targetId)` helper and call it from both. Same class as the `respondAsGame()` duplication in Batch 4.
- `[ ]` **Medium** — `docs/js/features/map-canvas.js:1870` — `syncMapFromAutoMapper()` calls `JSON.parse(existing)` without a try/catch. All other JSON-from-storage reads in the codebase use `getJSON` from `storage-api.js` (which catches and returns `null` on error). A partial write or encoding corruption throws uncaught and unwinds silently. Wrap with try/catch or switch to `getJSON`.
- `[ ]` **Low** — `docs/js/features/map-canvas.js:546` — `toggleAutoMap()` guards on `window.getCurrentLocation ?` before calling it, but `getCurrentLocation` is already a static import from `auto-mapper.js` at line 18. The window-global check is redundant (the module export is always available). Replace with direct `getCurrentLocation(statusText)`.
- `[ ]` **Low** — `docs/js/features/map-handlers.js:250` — `hideFab()` is defined, exported, and never called anywhere. The comment at line 49 of the same file explicitly notes "no hideFab() call" was intentional. Dead export; delete it.
- `[ ]` **Low** — `docs/js/features/map-canvas.js:1153` — `cancelOnboarding(currentToast)` parameter name shadows the module-level `currentToast` variable (line 1033). The function's `currentToast` and the module's `currentToast` are different objects. Rename the parameter to `toastEl` to eliminate confusion.
- `[ ]` **Low** — `docs/js/features/map-canvas.js:1031` — `TOAST_STORAGE_KEY = 'iftalk_map_toasts_dismissed'` is a localStorage key constant defined mid-file. `FIRST_USE_KEY` (same category of map-related storage key) lives in `map-config.js` and is imported. Move `TOAST_STORAGE_KEY` to `map-config.js` for consistent key management.
- `[ ]` **Low** — `docs/js/features/auto-mapper.js:68-138` — 70-line commented-out block for the v5 VM-memory reading approach. The comment says "kept for reference", but Batch 4 removed an identical class of stale blocks from `voxglk-renderer.js` for the same reason: git history is the reference. Delete it.
- `[ ]` **Low** — `docs/js/features/map-sheet.js:149` — `openNodeSheet()` always sets the badge to `'Auto-mapped'` for non-duplicate nodes regardless of `node.isManual`. A freshly-created user location (`isManual: true`) opens with an "Auto-mapped" badge until the user starts typing, at which point `handleNodeNameChange` corrects it to "Your edit". Set badge to `'Your location'` (class `sheet-node-badge user`) upfront when `node.isManual` is true.

#### Verified safe / not concerns
- The callback-injection pattern in `map-handlers.js` and `map-sheet.js` is clean and intentional — confirmed as the correct cycle-break in Pass 6.
- `findAvailablePosition()` spiral search is bounded at 72 candidate checks (6 rings × 12 angles); the documented fallback-to-overlap for very dense maps is correct.
- `setupResizeHandle()` uses `AbortController` for clean listener cleanup — returned via `resizeState` and called in `hideMap()`. No leak.
- Duplicate-node ID generation (`while (mapState.nodes.has(duplicateId) || mapState.deletedNodes.has(duplicateId))`) correctly handles collisions, including re-use of previously-deleted IDs.
- `transitionend` listener in `hideMap()` is paired with a 500ms fallback timeout that cleans up if the transition never fires.
- `startCheckTimeout` in `auto-mapper.js` is cancelled at the top of every `initAutoMapper()` call — no accumulation on game restarts.
- `toastQueue`, `currentToast`, and `toastContainer` are module-level singletons appropriate for a single-instance UI.
- `performUndo()` `switch/case` uses `const` without per-case block scopes — valid in strict-mode ES6 modules since adjacent cases are never simultaneously live.
- `populateConnectionsList` re-attaches connection-type and delete listeners on every `openNodeSheet` call, but it also replaces the entire list via `innerHTML`, so there is no listener accumulation.

#### Top 5 longest functions in batch
1. `setupEventListeners()` — `map-canvas.js:200-393` (194 lines)
2. `syncFromAutoMapper()` — `map-canvas.js:1541-1702` (162 lines)
3. `handleLocationChange()` — `map-canvas.js:629-771` (143 lines)
4. `syncMapFromAutoMapper()` — `map-canvas.js:1852-1956` (105 lines)
5. `createMapUI()` — `map-canvas.js:108-194` (87 lines)

#### Recommended refactor order (value/effort)
1. **Fix `populateConnectionsList` XSS** — Medium value, ~10 min. One `escapeHtml()` call on `c.node.name`.
2. **Extract `transferEdges()` from merge functions** — Medium value, ~20 min. Eliminates ~50-line duplication between `handleNodeMerge` and `performManualMerge`.
3. **Replace inline `directionOffsets` with `DIRECTION_OFFSETS` import** — Medium value, ~15 min. Removes the diverging duplicate table in `syncFromAutoMapper`.
4. **Wrap `JSON.parse` in `syncMapFromAutoMapper`** — Low value, ~5 min. Switch to `getJSON` from `storage-api.js`.
5. **Delete `hideFab()` + fix `window.getCurrentLocation` in `toggleAutoMap`** — Low value, ~10 min combined.

### Batch 7: Narration (`narration/`)
_Status: complete (2026-04-27)_

**Headline:** Four focused modules with clear responsibilities — `tts-player.js` (playback + keep-alive), `chunking.js` (text splitting + DOM marker insertion), `highlighting.js` (CSS Highlight API + scroll), `navigation.js` (skip/start/end controls). One High bug: the MediaSession `play` action handler calls a non-existent function — lock screen play button is silently broken. One Medium concern: a 40-line inline Glk-class detection block in `insertRealMarkersAtIDs` should be a private helper. Most other issues are Low housekeeping: a missing `stopKeepAlive()` call in `skipToEnd`, an empty catch lacking an intent comment, a confusing `while`/`break` that should be `if`, and a debug event dispatched on every narrated chunk.

#### Findings

- `[ ]` **High** — `docs/js/narration/tts-player.js:55` — MediaSession `play` action handler (inside `startKeepAlive`) does `import('./navigation.js').then(nav => nav.resumeNarration())`. `navigation.js` exports no `resumeNarration` function — the call silently throws a `TypeError` (swallowed by the missing `.catch()`). Lock screen play button does nothing. Fix: call `speakTextChunked(null, state.currentChunkIndex)` directly (same file; no import needed). The dynamic import of `navigation.js` exists only to call this non-existent function and can be removed.
- `[ ]` **Medium** — `docs/js/narration/chunking.js:183-223` — `insertRealMarkersAtIDs` contains a ~40-line inline Glk-class detection block that first checks the immediate previous sibling, then walks ancestors up to `container`. It is a self-contained concern; extract to a private `getGlkClass(textNode, container)` helper to bring the parent function under 100 lines and make the detection logic independently readable.
- `[ ]` **Low** — `docs/js/narration/navigation.js:178-193` — `skipToEnd()` bypasses `stopNarration()` and inlines its own audio teardown (stops `state.currentAudio`, calls `speechSynthesis.cancel()`, clears `state.isNarrating`). In doing so it omits `stopKeepAlive()` — the keep-alive AudioContext continues running unnecessarily after skip-to-end, wasting battery. Add a `stopKeepAlive()` call (import from `tts-player.js` which already exports it).
- `[ ]` **Low** — `docs/js/narration/chunking.js:257` — Empty `catch (e) {}` in `insertRealMarkersAtIDs` (DOM manipulation failure during marker insertion) lacks an intent comment. Same pattern fixed across `auto-mapper.js`, `remote-console.js`, and `app.js` in v1.5.223 — add a brief comment explaining that marker failures are expected for certain DOM structures and narration continues without that marker.
- `[ ]` **Low** — `docs/js/narration/chunking.js:186-202` — `while (prevSibling) { /* check classList */; break; }` is always a single-iteration loop — the `break` is unconditional, making this semantically identical to `if (prevSibling) { /* check classList */ }`. The comment "Only check immediate previous sibling" confirms the intent. Rewrite as `if (prevSibling)` to remove the misleading loop construct.
- `[ ]` **Low** — `docs/js/narration/tts-player.js:223` — `text` parameter of `speakTextChunked` is documented "Unused (chunks come from state.narrationChunks)". All callers pass `null`. The parameter is a vestigial API remnant. Rename to `_text` or remove; if removed, update the two `speakTextChunked(null, ...)` calls in `navigation.js` (lines 99, 153).
- `[ ]` **Low** — `docs/js/narration/highlighting.js:156-168` — `updateTextHighlight()` dispatches a `chunkHighlighted` CustomEvent on every chunk (the hot narration path). Commented as "for debugging/testing". No production listener exists — this is pure overhead on every spoken sentence. Gate behind a debug flag (e.g., `window._iftalkDebug`) or remove.
- `[ ]` **Low** — `docs/js/narration/highlighting.js:127` — `removeHighlight()` fetches `gameOutput` via `document.getElementById('gameOutput')` directly. Every other module uses the pre-cached `dom.gameOutput` from `core/dom.js`. Import `dom` and use `dom.gameOutput` for consistency.
- `[ ]` **Low** — `docs/js/narration/highlighting.js:14-16` — `initScrollDetection()` is a no-op export kept "for API compatibility". It is called from `app.js:295` but does nothing. Remove the export from `highlighting.js` and the import+call from `app.js`.

#### Verified safe / not concerns
- `speakTextChunked` session-ID mechanism (`narrationSessionId` check at line 271) correctly supersedes stale loops when narration restarts — well-designed guard.
- `startTimeout` 2-second safety in `playWithBrowserTTS` — already documented as self-healing in Pass 2 (`[-]` entry).
- Dynamic imports `await import('../ui/game-output.js')` (line 225) and `await import('../ui/nav-buttons.js')` (lines 265, 430) — break real circular dependencies (`game-output.js` and `nav-buttons.js` import from `tts-player.js`). Correctly cycle-avoiding, consistent with Pass 6 analysis.
- Dynamic import of `navigation.js` in `startKeepAlive` (line 55) — also a justified cycle-break (`navigation.js` statically imports `stopNarration` from `tts-player.js`). The import itself is correct; only the target function name is wrong (see High finding).
- `insertRealMarkersAtIDs` processes nodes in reverse order — correct approach to avoid position shifts during DOM manipulation.
- `removeTemporaryMarkers` regex `lastIndex` handling — `test()` failure auto-resets `lastIndex` to 0; successful `test()` path has explicit `lastIndex = 0` (line 280). Correct.
- `highlightUsingMarkers` forced repaint (`void containerEl.offsetHeight`, lines 104-106) — documented iOS WebKit workaround for the CSS Highlight API not always clearing visually. Correct and intentional.
- `skipToChunk` smart back-button logic (3-second threshold, line 54) — correctly routes "within 3s or paused" to previous chunk, otherwise replays current.
- `skipToEnd` does not guard on `state.isNavigating` (unlike `skipToChunk`/`skipToStart`) — intentional; force-stop should always work.
- `createNarrationChunks` filters out `app` voice chunks (line 123) — correct; echoed user-input spans are not narrator TTS.
- `startKeepAlive`/`stopKeepAlive` singleton guard (`if (keepAliveContext) return`) — correct. Only missing in `skipToEnd` (see Low finding).

#### Top 5 longest functions in batch
1. `speakTextChunked()` — `tts-player.js:223-390` (167 lines)
2. `insertRealMarkersAtIDs()` — `chunking.js:135-262` (127 lines)
3. `playWithBrowserTTS()` — `tts-player.js:95-216` (121 lines)
4. `highlightUsingMarkers()` — `highlighting.js:24-116` (92 lines)
5. `skipToChunk()` — `navigation.js:26-105` (79 lines)

#### Recommended refactor order (value/effort)
1. **Fix MediaSession `play` handler** — `tts-player.js:52-56` — High value, ~5 min. Replace `import('./navigation.js').then(nav => nav.resumeNarration())` with direct `speakTextChunked(null, state.currentChunkIndex)`.
2. **Add `stopKeepAlive()` to `skipToEnd`** — Low value, ~5 min. Import `stopKeepAlive` from tts-player.js and call it at the start of teardown.
3. **Extract `getGlkClass()` helper from `insertRealMarkersAtIDs`** — Medium value, ~20 min. Pulls out 40-line self-contained sibling+ancestor detection block.
4. **Add intent comment to empty catch + rewrite while/break as if** — Low value, ~5 min combined. Consistency with v1.5.223 pattern.
5. **Gate `chunkHighlighted` event / use `dom.gameOutput` / delete `initScrollDetection`** — Low value, ~15 min combined.

### Batch 8: Voice (`voice/`)
_Status: complete (2026-04-27)_

**Headline:** Five focused modules with clear separation — `command-handlers.js` (bound voice actions), `echo-detection.js` (TTS echo suppression), `recognition.js` (Web Speech API lifecycle), `voice-commands.js` (transcript normalization and routing), `voice-meter.js` (audio visualization). The biggest structural concern is `recognition.onresult` at ~408 lines: the process-and-dispatch pattern (processVoiceKeywords → showConfirmedTranscript → sendCommandDirect) appears three times across parallel execution paths that could share a helper. Two definition-duplication problems: `navigationCommands` + `skipNPattern`/`backNPattern` are defined byte-for-byte identically in both `recognition.js` and `voice-commands.js`; and the `gronk`→`grunk` correction appears in both a regex pass and a PRONUNCIATION_DICT entry. Low-severity housekeeping: missing double-call guard in voice-meter, three intent-comment gaps on silent catches, `dom.userInput` bypassed in mute/unmute handlers, a `setTimeout(fn, 0)` dispatch inconsistency, and four separate dynamic imports of the same module.

#### Findings

- `[ ]` **Medium** — `recognition.js:395-431, 462-495, 764-790` — The process-and-dispatch pattern appears copy-pasted across three execution paths in `onresult`/`onend`: `processVoiceKeywords()` → `showConfirmedTranscript()` → `playCommandSent()`/`playAppCommand()` → `sendCommandDirect()`. The logic in each block is ~15 lines and structurally identical. Extract a private `async function dispatchRecognized(text, confidence)` and call it from all three paths; shrinks `onresult` by ~45 lines.
- `[ ]` **Medium** — `recognition.js:581-584` + `voice-commands.js:170-175` — `navigationCommands` (array) and `skipNPattern`/`backNPattern` (regexes) are defined byte-for-byte identically in both files. They serve the same semantic purpose: identifying commands that bypass narration blocking or echo detection. Any future extension (e.g., adding `'freeze'`) must be made in two places. Export from `voice-commands.js` and import in `recognition.js`.
- `[ ]` **Low** — `recognition.js:217` — Empty `catch (err) {}` in `displayInterimAsLowConfidence` (around the `addGameText` dynamic import) lacks an intent comment. Same pattern fixed in Batch 7 (`chunking.js:257`). Add a brief note that display failures are non-fatal and recognition continues.
- `[ ]` **Low** — `recognition.js:699-712` — Normal-confidence final command dispatch wraps `sendCommandDirect` in `setTimeout(fn, 0)`, while the INSTANT_NO_WAIT path (line 416) and the delayed-instant path (line 480) call `sendCommandDirect` directly. A 0ms setTimeout does not produce a visible repaint, yet makes this path async in a way inconsistent with the other two. Document the intent or switch to direct dispatch.
- `[ ]` **Low** — `command-handlers.js:170,225` — Both `unmute` and `mute` handlers call `document.getElementById('messageInput')` directly. The element is pre-cached in `core/dom.js:63` as `dom.userInput`. Consistent with the pattern fixed in Batch 7 (`highlighting.js:127`).
- `[ ]` **Low** — `command-handlers.js:162,186` — `unmute` handler queries `dom.muteBtn?.querySelector('.material-icons')` twice: stored as `icon` at the start of the function (line 162) and re-queried as `icon2` in the recognition-failure revert path (line 186). Since `icon` is still in scope at line 186, the re-query is redundant. Replace `icon2` with `icon`.
- `[ ]` **Low** — `voice-commands.js:33,55` — `gronk`→`grunk` correction is applied by both a regex at line 55 (applies to all transcripts) and `PRONUNCIATION_DICT['gronk']` (applies only to single-word transcripts). Because the regex runs first, the PRONUNCIATION_DICT entry for `gronk` is never reached — it's dead code. Remove it.
- `[ ]` **Low** — `voice-commands.js:191,194,214,218` — `voxglk.js` is dynamically imported four times inside `processVoiceKeywords`: for `getInputType` at lines 191 and 214, and for `sendInput` at lines 196 and 218. Runtime module caching makes this functionally equivalent to one import, but the four separate destructuring lines obscure the dependency. Consolidate to a single `const { getInputType, sendInput } = await import('../game/voxglk.js')` near the char-mode block.
- `[ ]` **Low** — `voice-meter.js:15` — `startVoiceMeter()` has no guard against double-calls. If invoked while a session is already running (e.g., rapid unmute taps), it overwrites `state.microphoneStream`, `state.audioContext`, etc., orphaning the previous stream's tracks. Add `if (state.voiceMeterInterval) return;` at the top of the function.
- `[ ]` **Low** — `voice-meter.js:63` — Silent `catch (error) {}` on `getUserMedia` failure lacks an intent comment. The most common failure (`NotAllowedError`) is already surfaced to the user by `startRecognitionSafely()` upstream, so this catch is correctly silent — but that reasoning isn't visible here. Add an intent comment.
- `[ ]` **Low** — `voice-meter.js:78-84` — `stopVoiceMeter()` clears `state.soundPauseTimeout`, resets `state.soundDetected`, and resets `state.pausedForSound`. The interval callback no longer sets any of these (comment at line 60: "no longer pauses narration"). These three cleanup lines are vestiges of when the meter triggered narration pauses. Remove them; `pausedForSound` is always `false` since nothing sets it `true` anymore.

#### Verified safe
- `echo-detection.js` — pure string comparison; no DOM access, no timers; `state.recentlySpokenChunks` correctly bounded at 30 with TTL filter in `isEchoOfSpokenText`.
- `isEchoOfSpokenText` mutates `state.recentlySpokenChunks` inline (TTL cleanup) — side-effectful in a query function but always correct behavior.
- `voice-meter.js` resource cleanup — `stopVoiceMeter()` properly releases all Web Audio API resources: stream tracks stopped, microphone node disconnected, analyser disconnected, AudioContext closed if not already closed.
- `state.hasProcessedResult` guard in `onresult` and `onend` — correctly prevents duplicate command dispatch across the three processing paths.
- `recognition.onerror` silently ignoring `network`/`aborted`/`no-speech` — all three are expected Web Speech API lifecycle events; correct behavior.
- PRONUNCIATION_DICT single-word-only restriction (`words.length === 1`) — intentional and correct; prevents phrase-level false-positive corrections.
- `onend` push-to-talk revert path (`wasPushToTalkRelease`) — correctly waits until after result processing to set `state.isMuted = true`, ensuring pending commands from PTT button release are dispatched first.
- `voice-commands.js` char-mode special keys (arrow keys, space, backspace) — correctly bypass voice command routing and send raw key codes via `sendInput`.
- `recordSpokenChunk` minimum length guard (`text.length < 3`) — prevents spurious echo matching on short TTS artifacts.

#### Top 5 longest functions in batch
1. `recognition.onresult` handler — `recognition.js:313-721` (~408 lines) — the elephant
2. `processVoiceKeywords()` — `voice-commands.js:44-259` (~216 lines)
3. `recognition.onend` handler — `recognition.js:746-842` (~96 lines)
4. `showConfirmedTranscript()` — `recognition.js:128-190` (~62 lines)
5. `unmute` handler — `command-handlers.js:157-206` (~50 lines)

#### Recommended refactor order (value/effort)
1. **Export `navigationCommands` + `skipNPattern`/`backNPattern` from `voice-commands.js`** — Medium value, ~20 min. Eliminates the highest-risk duplication (navigation command list that both files must stay in sync on).
2. **Extract `dispatchRecognized()` helper** — Medium value, ~30 min. Removes 3× copy-pasted process-and-dispatch blocks; shrinks `onresult` by ~45 lines.
3. **Add double-call guard to `startVoiceMeter()`** — Low value, ~5 min. Prevents orphaned media streams on rapid unmute.
4. **Consolidate voxglk.js imports in `processVoiceKeywords`** — Low value, ~10 min. Clarifies dependency with a single destructuring import.
5. **Dead code cleanup** (PRONUNCIATION_DICT `gronk` entry, voiceMeter state resets, `icon2` re-query, `dom.userInput` bypass) — Low value, ~20 min combined.

### Batch 9: Input (`input/`)
_Status: complete (2026-04-27)_

**Headline:** Five focused modules — `keyboard-core.js` (input wiring + tap-to-examine), `voice-ui.js` (voice indicator DOM), `system-entry.js` (meta-command prompt), `word-extractor.js` (tap-to-examine word extraction), `index.js` (barrel). `word-extractor.js` and `system-entry.js` are clean with no findings. The main concern is `initKeyboardInput()` at 610 lines: three large closures (`populateInputWithWord`, `handleGameClick`, `handleGameMouseMove`) and their captured state live inside the init function when they could be module-level. Low-severity housekeeping: hot-path event handlers re-read localStorage on every mousemove/click instead of using the body class already maintained by `updateTapExamineCursor`; two disabled scroll calls with "testing" comments; a no-op `updateClearButtonVisibility`; a dead variable; an always-true condition; and `voice-ui.js` locally caching DOM elements already in `core/dom.js`.

#### Findings

- `[ ]` **Medium** — `keyboard-core.js:52-662` — `initKeyboardInput()` is 610 lines because three substantial closures (`populateInputWithWord`, lines 295-372, 77 lines; `handleGameClick`, lines 379-463, 85 lines; `handleGameMouseMove`, lines 511-583, 73 lines) and their shared state (`directions`, `commonVerbs`, `highlightOverlay`, `currentHighlightedWord`) are all scoped inside the init function. None of these closures need to capture init-local state that couldn't be module-level. Extract as named module-level functions; promote `directions` and `commonVerbs` to module-level `const`s. Init function would shrink to ~150 lines of pure wiring.
- `[ ]` **Low** — `keyboard-core.js:398,532` — `localStorage.getItem('iftalk_tap_to_examine')` is read directly inside `handleGameClick` and `handleGameMouseMove`. The latter fires on every pixel of mouse movement. `updateTapExamineCursor()` (line 599) already maintains `document.body.classList.has('tap-to-examine-enabled')` as a live flag (updated on init and on `storage` events). Replace the direct localStorage reads with `document.body.classList.contains('tap-to-examine-enabled')` to eliminate hot-path storage access.
- `[ ]` **Low** — `keyboard-core.js:756-757, 767-768` — Two `// DISABLED: Testing if we need this scroll` comment blocks around disabled `scrollToBottom()` calls. Same pattern removed in Batch 1 (`if (false &&)`) and Batch 7. If the scroll is not needed, delete the commented lines; if the behavior is desirable, re-enable with a clear condition.
- `[ ]` **Low** — `keyboard-core.js:789-792` — `updateClearButtonVisibility()` is a module-private no-op ("Button is always visible now — no action needed. Kept as no-op to avoid breaking existing calls"). It is called from 3 internal sites (lines 112, 120, 898) and has no callers outside the module. Delete the function and its 3 call sites.
- `[ ]` **Low** — `keyboard-core.js:900-901` — `if (cmd || cmd === '')` is always true: `cmd` is the result of `messageInputEl.value.trim()`, which always returns a string; `'' || '' === ''` evaluates to `false || true` = `true`. The condition is dead. Remove it, or if the intent was to block `null`/`undefined`, note that `.trim()` already guarantees a string.
- `[ ]` **Low** — `keyboard-core.js:466` — `currentHighlightedWord` is assigned at lines 576 and 582 but never read anywhere. Remove the dead variable.
- `[ ]` **Low** — `voice-ui.js:8-9` — `voiceListeningIndicatorEl` and `voiceTranscriptEl` are module-local caches of the same elements already cached in `core/dom.js` as `dom.voiceListeningIndicator` (line 82) and `dom.voiceTranscript` (line 81). Dual caches diverge if the DOM is updated. `recognition.js` already uses `dom.voiceTranscript` directly (line 155); `voice-ui.js` uses its own local reference. Import `dom` from `core/dom.js` and use `dom.voiceListeningIndicator`/`dom.voiceTranscript` instead; `initVoiceUI()` then becomes a no-op and can be removed from `index.js`.

#### Verified safe
- `word-extractor.js` — zero findings; pure utility with no state, no DOM writes, and no injection risk. `extractWordAtPoint` returns `null` on any error. `isWordChar` correctly permits hyphens and apostrophes for compound IF object names.
- `system-entry.js` — clean; `enterSystemEntryMode` accepts `showMessageInputFn` and `hasPhysicalKeyboardFn` as injected dependencies — correct cycle-break; no imports needed.
- `sendBtnKeyboardCapture`/`clearBtnKeyboardCapture` mousedown-capture pattern — correct approach for preserving keyboard open/close state before click fires (after blur) on mobile.
- `hiddenKeyInputEl` (lines 69-78) — created once, positioned off-screen (`left: -9999px`, `opacity: 0`), `aria-hidden: true`, `maxLength: 1`; correct mobile arbitrary-key-capture approach.
- `visualViewport` baseline tracking — `baselineViewportHeight` updates when keyboard fully closes (line 657), correctly adapting to orientation changes.
- `hasPhysicalKeyboard()` — `mqCoarse` and `mqHover` `MediaQueryList` objects cached at module scope (lines 46-47); no new instances created on each call.
- `handleKeyPress` char-mode capture — correctly excludes bare modifier keys (line 679) and events targeting the message input itself (line 683).
- `showVoiceIndicator`/`hideVoiceIndicator` in `voice-ui.js` — not re-exported from `index.js` barrel, but are directly imported and used by `keyboard-core.js`. Not dead exports.

#### Top 5 longest functions in batch
1. `initKeyboardInput()` — `keyboard-core.js:52-662` (~610 lines) — the elephant
2. `handleKeyPress()` — `keyboard-core.js:667-769` (~102 lines)
3. `updateInputVisibility()` — `keyboard-core.js:797-888` (~91 lines)
4. `handleGameClick` (closure) — `keyboard-core.js:379-463` (~85 lines)
5. `populateInputWithWord` (closure) — `keyboard-core.js:295-372` (~77 lines)

#### Recommended refactor order (value/effort)
1. **Extract `populateInputWithWord`, `handleGameClick`, `handleGameMouseMove` as module-level functions** — Medium value, ~45 min. Move `directions`, `commonVerbs` to module-level consts; `highlightOverlay` and `currentHighlightedWord` to module-level lets. `initKeyboardInput()` becomes pure wiring.
2. **Replace hot-path localStorage reads with body class check** — Low value, ~10 min. Use `document.body.classList.contains('tap-to-examine-enabled')` in both event handlers.
3. **Delete `updateClearButtonVisibility` no-op + 3 call sites** — Low value, ~5 min. Obvious cleanup.
4. **Decide on disabled scroll calls** — Low value, ~5 min. Delete or restore the two commented `scrollToBottom()` blocks.
5. **Fix `voice-ui.js` dual DOM cache + remove `initVoiceUI`** — Low value, ~15 min. Import `dom` and use `dom.voiceListeningIndicator`/`dom.voiceTranscript`; remove the no-longer-needed init function.

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
| ~~High~~ DONE | `voxglk.js` | `createVoxGlk()` closure split: watchdog (v1.5.228), grid (v1.5.229), bootstrap (v1.5.231) |
| High | `voxglk.js:14-45` | 22 module-level `let` decls with implicit lifecycle (ember `20260426-054023-392e`) |
| Medium | `voxglk.js:612` | Status-bar change detection compares HTML strings — use plain text |
| Medium | `game-loader.js:381-444` | Recently-played UI rendering belongs in `ui/recently-played.js` |
| Medium | `voxglk-renderer.js:59-74` | Dead fallback for missing `persistentWindows` — tighten signature |
| ~~Medium~~ DONE | `voxglk.js:552-599` | Char-mode grid reconstruction — extracted to `voxglk-grid.js` (v1.5.229) |
| Low | `voxglk.js:1088-1090` | `isSafeToSave()` misleading name for char→line transition guard |
| Low | `voxglk.js:974-1053` | `sendInput()` lacks defensive re-check on `acceptCallback` |
| Medium | `save-manager.js:102-222,230-310` | Map-domain logic (200 lines) embedded in save module — belongs in map-canvas.js |
| Medium | `save-manager.js:1008-1079` | `initSaveHandlers()` mixes UI event wiring + settings coupling into save module |
| Low | `save-manager.js:626` | `performRestore()` mutates `state.skipNarrationAfterLoad` — couples save to narration state |
| Low | `save-manager.js:82-84` | `limitHTMLHistory` silently drops text before first tag at truncation boundary |
| Medium | `command-router.js:339`, `meta-command-handlers.js:21` | `respondAsGame()` defined identically in both files — extract to shared module |
| Medium | `meta-command-handlers.js:224-273` vs `380-458` | `handleSaveResponse` / `handleGameSaveResponse` duplicate ~60 lines of save-name validation |
| ~~Medium~~ DONE | `meta-command-handlers.js` (both save handlers) | `MAX_SAVES = 5` limit restored in v1.5.234 |
| Low | `save-list-formatter.js:21,55,73` | Direct `JSON.parse` without try/catch — use `getJSON` from storage-api |
| Low | `meta-command-handlers.js:300-314` | `handleRestoreResponse` uses `window.state.currentGameName` — use imported `state` |
| Low | `command-router.js:493-510` | `waitForInputAndContinue()` unexported, never called — dead function |
| Low | `command-router.js:484-487` | `sendCommand()` empty no-op, re-exported, app.js imports but never calls — delete |
| Medium | `data-management-ui.js:18-53` | `isOnWelcomeScreen()` + `getGameDisplayName()` exact-copy from settings-panel.js — import instead |
| Medium | `settings-panel.js:171-281` | `showBackupSavesDialog()` 111-line inline modal — move to `ui/backup-saves-dialog.js` |
| Medium | `data-management-ui.js:62-190` | Delete-all-data logic ~45-line duplicate between two button handlers |
| Low | `data-management-ui.js:112,130` | `alert()` for post-deletion feedback — use `confirmDialog({okOnly:true})` |
| Low | `voice-selection.js:217-219` | `populateVoiceDropdown()` retries indefinitely if voices never load |
| Low | `gdrive-ui.js:131` | `iftalk_gdrive_folder_id` stores `'path:...'` string — key name implies an ID, not a path |
| Low | `voice-selection.js:276` | `loadBrowserVoiceConfig()` marked async but awaits nothing |
| Low | `voice-selection.js:206` | `★` iOS-preferred marker shown on all platforms, not just iOS |
| ~~Medium~~ DONE | `map-sheet.js:344` | XSS via node names fixed in v1.5.234 — `escapeHtml(c.node.name)` |
| Medium | `map-canvas.js:1553-1569` | Inline `directionOffsets` table duplicates and diverges from `DIRECTION_OFFSETS` in map-config.js |
| Medium | `map-sheet.js:544-569, 704-729` | `handleNodeMerge` / `performManualMerge` share ~50-line identical edge-transfer logic — extract `transferEdges()` |
| Medium | `map-canvas.js:1870` | `syncMapFromAutoMapper` calls `JSON.parse` without try/catch — use `getJSON` |
| Low | `map-canvas.js:546` | `window.getCurrentLocation` used in `toggleAutoMap` — static import already available |
| Low | `map-handlers.js:250` | `hideFab()` defined, exported, and never called — dead export |
| Low | `map-canvas.js:1153` | `cancelOnboarding(currentToast)` parameter shadows module-level `currentToast` variable |
| Low | `map-canvas.js:1031` | `TOAST_STORAGE_KEY` inline constant — should live in `map-config.js` alongside `FIRST_USE_KEY` |
| Low | `auto-mapper.js:68-138` | 70-line commented-out v5 VM-memory block — git history is the reference; delete it |
| Low | `map-sheet.js:149` | `openNodeSheet` badges manual nodes (`isManual: true`) as `'Auto-mapped'` initially |
| ~~High~~ DONE | `tts-player.js:55` | MediaSession `play` fixed in v1.5.235 — now calls `speakTextChunked` directly |
| ~~Medium~~ DONE | `chunking.js:183-223` | `getGlkClass()` helper extracted in v1.5.236 |
| ~~Low~~ DONE | `navigation.js:178-193` | `skipToEnd` `stopKeepAlive` added in v1.5.235 |
| ~~Low~~ DONE | `chunking.js:257` | Intent comment added to empty catch in v1.5.235 |
| ~~Low~~ DONE | `chunking.js:186-202` | `while/break` rewritten as `if` in v1.5.235 |
| ~~Low~~ DONE | `tts-player.js:223` | `text` param renamed to `_text` in v1.5.236 |
| ~~Low~~ DONE | `highlighting.js:156-168` | `chunkHighlighted` debug event removed in v1.5.236 |
| ~~Low~~ DONE | `highlighting.js:127` | `removeHighlight` + `scrollToHighlightedText` now use `dom.gameOutput` (v1.5.236) |
| ~~Low~~ DONE | `highlighting.js:14-16` | `initScrollDetection()` deleted from highlighting.js and app.js in v1.5.235 |
| Medium | `recognition.js:395-431,462-495,764-790` | Process-and-dispatch pattern repeated 3× in onresult/onend — extract `dispatchRecognized()` |
| Medium | `recognition.js:581-584`, `voice-commands.js:170-175` | `navigationCommands` + skipN/backN patterns defined identically in both files — export from voice-commands.js |
| Low | `recognition.js:217` | Empty catch in `displayInterimAsLowConfidence` lacks intent comment |
| Low | `recognition.js:699-712` | `setTimeout(fn,0)` final dispatch inconsistent with direct-call paths — document or remove |
| Low | `command-handlers.js:170,225` | `document.getElementById('messageInput')` direct query — use `dom.userInput` |
| Low | `command-handlers.js:162,186` | `icon2` re-queries `dom.muteBtn` icon in unmute error path — reuse `icon` already in scope |
| Low | `voice-commands.js:33,55` | `gronk→grunk` in both regex and PRONUNCIATION_DICT — dict entry is dead; remove it |
| Low | `voice-commands.js:191,194,214,218` | voxglk.js imported 4× in `processVoiceKeywords` — consolidate to one import |
| Low | `voice-meter.js:15` | `startVoiceMeter()` lacks double-call guard — rapid calls orphan MediaStream tracks |
| Low | `voice-meter.js:63` | Silent catch on getUserMedia failure lacks intent comment |
| Low | `voice-meter.js:78-84` | `stopVoiceMeter` resets soundPauseTimeout/soundDetected/pausedForSound — vestigial; nothing sets them anymore |
| Medium | `keyboard-core.js:52-662` | `initKeyboardInput()` 610 lines — 3 large closures + shared state should be module-level |
| Low | `keyboard-core.js:398,532` | `localStorage.getItem('iftalk_tap_to_examine')` in hot-path handlers — use body class `tap-to-examine-enabled` instead |
| Low | `keyboard-core.js:756-757,767-768` | Two disabled `scrollToBottom()` calls with "testing" comments — decide and delete |
| Low | `keyboard-core.js:789-792` | `updateClearButtonVisibility()` no-op with 3 internal call sites — delete all |
| Low | `keyboard-core.js:900-901` | `if (cmd \|\| cmd === '')` always true for `.trim()` result — remove dead condition |
| Low | `keyboard-core.js:466` | `currentHighlightedWord` written but never read — dead variable |
| Low | `voice-ui.js:8-9` | `voiceListeningIndicatorEl`/`voiceTranscriptEl` duplicate `dom.voiceListeningIndicator`/`dom.voiceTranscript` — use `dom.*` refs; `initVoiceUI` becomes removable |

### Fixed
- **v1.5.222 (commit 4b73a06)** — 3 High security (XSS via save HTML and save names), 2 Medium quota errors (silent failures on import/backup), 3 Medium dead-code (`.bak` files, orphan temp, dead debug branch).
- **v1.5.223 (commit 6ea0eea)** — 8 Low: duplicate `escapeHtml` consolidated, stale TODO/commented block deleted, intent comments on 3 empty catches, `console.warn`→`console.error` on 5 real-error sites, compression error context, `printStorageReport` collapsed to `console.group`+`console.table`, TTS safety-timeout self-healing comment, map resize listener gated on `isVisible`.
- **v1.5.226 (commit 21d40cf)** — 1 High + 1 Medium + 2 Low: extracted `voiceCommandHandlers` (~330 lines) + shared `pausePlayback`/`resumePlayback` to `voice/command-handlers.js`; deleted 5 dead `if (false &&)` mic auto-mute blocks; killed the `command-router.js` entry-point cycle (now static import). app.js -447 lines.
- **v1.5.227 (commit f0fa1ac)** — 1 Medium: extracted PWA logic (SW reg, update notification, install prompt, standalone/iOS detection) to `utils/pwa-updater.js` with one `initPWA()` export. app.js -315 lines.
- **v1.5.230** — 1 High: phase-split `initApp()` (798 lines) into 7 private coordinator functions (`initViewport`, `initDOMandValidation`, `initVoice`, `initUIComponents`, `wireEventListeners`, `wireKeyboardShortcuts`, `wireLifecycle`). `initApp()` reduced to 9-line thin coordinator. All phases kept in `app.js`.
- **v1.5.233 (commit deb2998)** — Batch 6 review doc (4 Medium, 6 Low findings). Import path fixes: `resetRepairFlag`/`performRepair` now imported from `voxglk-watchdog.js`.
- **v1.5.234** — 1 Medium security (XSS in `map-sheet.js:344` — `escapeHtml(c.node.name)` in connections list); 1 Medium regression (`MAX_SAVES = 5` restored in both save handlers in `meta-command-handlers.js`). Batch 7 review doc (1 High, 1 Medium, 8 Low findings).
- **v1.5.235** — 1 High fix (MediaSession `play` action: replaced broken `nav.resumeNarration()` dynamic import with direct `speakTextChunked` call — lock screen play now works); 4 Low: `stopKeepAlive()` added to `skipToEnd`, intent comment on empty catch in `insertRealMarkersAtIDs`, `while/break` → `if` in sibling Glk-class check, deleted `initScrollDetection` no-op from `highlighting.js` + `app.js`.
- **v1.5.236** — 1 Medium: extracted `getGlkClass(textNode, container)` helper from `insertRealMarkersAtIDs` — removes 26-line inline detection block; 3 Low: renamed `text` → `_text` in `speakTextChunked`, removed `chunkHighlighted` debug event from hot narration path, `removeHighlight`/`scrollToHighlightedText` now use `dom.gameOutput` instead of raw `getElementById`.
- **v1.5.237** — Batch 8 review doc: `voice/` (2 Medium, 9 Low findings). No code changes this pass.
- **v1.5.238** — Batch 9 review doc: `input/` (1 Medium, 7 Low findings). No code changes this pass.
