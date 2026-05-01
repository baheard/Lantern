# IFTalk Code Review

Started: 2026-04-25
Scope: `docs/js/**/*.js`, `docs/styles/**/*.css`, `docs/index.html`
Out of scope: `docs/lib/` (3rd-party), `server/`, `node_modules/`

## Severity scale
- **Critical** â€” security hole, data loss, app-breaking bug
- **High** â€” incorrect behavior, leaks, plausible user-visible regression
- **Medium** â€” maintainability/perf concern; refactor candidate
- **Low** â€” minor smell, easy cleanup
- **Nit** â€” stylistic, optional

## Status legend
- `[ ]` open
- `[~]` deferred / discussed, not fixed
- `[x]` fixed (with commit SHA)
- `[-]` won't fix (with reason)

---

## Tier 1 â€” Cross-cutting sweeps

### Pass 1: Security & secrets
_Status: complete (2026-04-25)_

**Threat model context:** Single-user PWA, all data in localStorage, optional Google Drive sync of save files, save files can be exported/imported as JSON. Realistic attacker: someone shares a malicious save file (file import or via shared Drive folder).

#### Findings

- `[x]` **High** â€” `docs/js/game/save-manager.js:570,580,595` â€” Restored save's `displayHTML.statusBar/upperWindow/lowerWindow` is written to `innerHTML` without sanitization. A crafted save file (imported via file picker or Google Drive sync) can execute arbitrary JS. This is the realistic XSS vector â€” saves are the cross-user data path. **Fixed in 4b73a06: wrap with `sanitizeRestoredHTML()`.**
- `[x]` **High** â€” `docs/js/game/save-manager.js:492` â€” `displayName` (user-controlled save name) is interpolated raw into a `<div class="system-message">â€¦</div>` HTML string, then passed to `addGameText(html, isCommand=false)`. `addGameText` non-command branch calls `div.innerHTML = text` (`docs/js/ui/game-output.js:291`) without escaping. A save name like `<img src=x onerror=â€¦>` executes. **Fixed in 4b73a06: `escapeHtml(displayName)` at both save and restore message sites (lines 493, 639).**
- `[x]` **High** â€” `docs/js/ui/sync-preview-modal.js:116` â€” `item.name` (save filename from local or remote) interpolated raw into the modal's `innerHTML`. Same template injection class as above. **Fixed in 4b73a06: `escapeHtml()` on `item.id`, `item.name`, `statusClass`, `statusLabel`. Also upgraded `escapeHtml` to escape quotes for attribute-context safety.**
- `[ ]` **Medium** â€” `docs/js/utils/gdrive/gdrive-auth.js` â€” Google OAuth access token in plain `localStorage`. Standard for client-side OAuth; the practical mitigation is closing XSS holes (above), not encrypting at rest (which would be theater since the key has to live client-side). Recording as awareness â€” fixing the XSS findings reduces this risk significantly.
- `[ ]` **Low** â€” `docs/index.html` â€” No CSP meta tag. App uses inline styles in some places, but no `eval` / `new Function` / string-arg timers, so a `default-src 'self'; script-src 'self';` CSP would be feasible and close many residual XSS paths.

#### Verified safe (no findings)
- `eval` / `new Function` / `setTimeout`/`setInterval` with string args â€” none.
- `googleClientId` in `config.js` â€” public OAuth client ID by design, expected.
- `target="_blank"` external links â€” checked, all use `rel="noopener"`.
- `postMessage` â€” only the SW `SKIP_WAITING` internal message; no cross-origin senders.
- Service worker â€” caches own-origin only; no open redirect or cache poisoning vector found.
- DOM clobbering â€” no `getElementById` on user-controlled IDs.

#### Won't pursue
- Map data `JSON.parse` â€” plain `JSON.parse` of own-localStorage data is not a real threat; if attacker has localStorage write, they own everything. Skip.

### Pass 2: Memory & lifecycle
_Status: complete (2026-04-25)_

**Headline:** No real leaks found. Codebase has good lifecycle hygiene â€” every `setInterval` (backup, voice meter, lock-screen hold, wake-lock, update countdown) has a matching `clearInterval`, recognition is stopped on every mute path, observers aren't used. Audit verified, agent's flagged items (map re-init, recognition cleanup, listener accumulation) were overstated â€” guards and pairings are in place.

#### Findings

- `[ ]` **Low** â€” `docs/js/input/keyboard/keyboard-core.js:619` â€” `setInterval(updateInputVisibility, 500)` polls input mode every 500ms for the page lifetime. Single timer, no accumulation, but wasteful â€” visibility only changes on mute toggle, system-entry mode toggle, or input-type change, all of which are event-driven elsewhere. Could be called from those events instead of polling.
- `[ ]` **Low** â€” `docs/js/app.js:221` â€” `setInterval(() => registration.update(), 30000)` for SW update check is never cleared. Page-lifetime singleton, no real leak, but worth noting as a one-shot timer that could be paired or moved to a Page Visibility-aware schedule.
- `[-]` **Low** â€” `docs/js/narration/tts-player.js:200` â€” `startTimeout` (2s safety) is cleared on `onstart`/`onend`/`onerror`. `speechSynthesis.cancel()` triggers `onerror('interrupted')` which clears it, so the leak window is bounded by 2s in adversarial cases. **Won't fix in 6ea0eea: behavior is self-healing; added a clarifying comment instead.**
- `[x]` **Low** â€” `docs/js/features/map-canvas.js:290` â€” `window.addEventListener('resize', resizeCanvas)` is added once during lazy init and never removed. Not a leak (single listener, page lifetime, map DOM persists after `hideMap`), but the listener fires while map is hidden â€” wasted work on every viewport resize. **Fixed in 6ea0eea: gated on `isVisible`.**

#### Verified safe
- `setInterval` cleanups: save-manager backup (`backupIntervalId`), voice-meter (`state.voiceMeterInterval`), lock-screen hold (`holdUpdateInterval`), wake-lock periodic check (`periodicCheckTimer`), update countdown (`autoRefreshTimer`) â€” all properly paired with `clearInterval`.
- `initMapCanvas()` â€” both call sites in `app.js:1068` and `app.js:1501` are guarded with `if (!mapModule)`, so init runs at most once per session. Not the duplicate-binding hazard the audit suggested.
- `state.recognition.stop()` is called from 8+ paths (mute toggle, push-to-talk release, settings changes, narration start, etc.) â€” recognition lifecycle is well managed.
- No `MutationObserver` / `IntersectionObserver` / `ResizeObserver` usage anywhere â€” no observer cleanup risk.
- `state.voiceHistoryItems` capped at 20; `state.recentlySpokenChunks` capped at 30 with TTL; `iftalk_backup_*` capped per `MAX_BACKUPS_PER_GAME`; offline-debug capped at 50. All bounded growth.
- `eval` / `new Function` / string-arg timers â€” none.

### Pass 3: Error handling
_Status: complete (2026-04-25)_

**Headline:** Mostly solid. Storage API has consistent try/catch wrappers; gdrive UI catches and surfaces errors; quota handling is implemented in the main save path. A few real gaps in non-primary save paths and a couple of intentional empty catches that should be documented as such.

#### Findings

- `[x]` **Medium** â€” `docs/js/game/save-manager.js:864` â€” Imported save file written via `setJSON(key, saveData)` without checking return. If the import is large enough to exceed quota, `setJSON` returns `false`, but the user sees `updateStatus('Import successful!')` and is prompted to load, finding nothing on reload. **Fixed in 4b73a06: check return and surface "Import failed: storage full." error.**
- `[x]` **Medium** â€” `docs/js/game/save-manager.js:928` â€” Backup save (`createBackup`) calls `setJSON(backupKey, saveData)` and ignores the return. Backups can grow large (full game state + map data); quota failures here mean the backup chain silently breaks. **Fixed in 4b73a06: return false from createBackup() when setJSON fails.**
- `[ ]` **Low** â€” `docs/js/utils/storage/storage-api.js:30-37,90-97` â€” `setItem`/`setJSON` return `false` for *any* error (quota, security, type). Callers can't distinguish without re-throwing. The save-manager primary path works around this by re-probing; cleaner long-term: throw a typed error and let callers catch by `error.name === 'QuotaExceededError'`.
- `[x]` **Low** â€” `docs/js/features/auto-mapper.js:119` â€” Empty `catch (e) {}` in VM-memory probe loop. Likely intentional (probing past valid memory regions throws expected errors), but the silence makes diagnosis hard if the auto-mapper actually breaks. **Fixed in 6ea0eea: added intent comment.**
- `[x]` **Low** â€” `docs/js/utils/remote-console.js:161` â€” Empty catch around `sendLog` to keep wrapped console from re-throwing. Defensible (don't disrupt original `console.*`), but worth a comment. **Fixed in 6ea0eea: added intent comment.**
- `[x]` **Low** â€” `docs/js/app.js:1589-1591` â€” `visibilitychange` handler catches and silently drops errors stopping recognition. Cleanup path, acceptable, but a comment explaining intent would help. **Fixed in 6ea0eea: added intent comment.**

#### Verified safe (overstated by audit)
- Dynamic `import().then()` without `.catch()` â€” multiple instances flagged; in this codebase modules are bundled & cached by SW. Realistic failure rate is near zero. Not a real concern in practice.
- Save-manager primary save path (`save-manager.js:459`) â€” properly probes quota and re-throws meaningful error.
- `JSON.parse` of localStorage data â€” every call site wraps via `getJSON` which catches.
- `gdrive-ui.js:174-183` (sign-in) â€” correctly catches and surfaces `error.message` to user; agent misread this one.
- Type coercion â€” codebase uses `===` consistently; one minor `if (!statusBarText)` falsy trap in auto-mapper, but the value is a name (never "0"), so the trap doesn't fire.

### Pass 4: Dead code & duplication
_Status: complete (2026-04-25)_

**Headline:** Cleanest pass yet on duplication (none found over 10-line threshold), but 7 orphan/backup files cluttering the tree and one disabled-for-debugging branch in production code.

#### Findings

- `[x]` **Medium** â€” `docs/js/utils/gdrive/gdrive-sync-preview-temp.js` â€” Orphan file, zero importers, contains broken syntax (escaped `\!` chars on lines 64 and 133, parameter/variable name mismatch `gameNames` vs `gameName`). Looks like an abandoned in-progress refactor. Safe to delete after verifying via grep that no dynamic-import string references it (none found). **Deleted in 4b73a06.**
- `[x]` **Medium** â€” Six `.bak` files in tree:
  - `docs/js/game/game-loader.js.bak`
  - `docs/js/game/save-manager.js.bak`
  - `docs/js/ui/confirm-dialog.js.bak`
  - `docs/js/ui/settings/gdrive-ui.js.bak`
  - `docs/js/ui/sync-preview-modal.js.bak`
  - `docs/js/utils/gdrive/gdrive-sync-preview.js.bak`

  Git history is the right tool for this. They're not served by Express (extension wouldn't match), but they bloat the tree and confuse search. **Deleted in 4b73a06; `*.bak` was already in `.gitignore`.**
- `[x]` **Medium** â€” `docs/js/app.js:417` â€” `if (false && !state.pushToTalkMode && ...)` dead branch with comment "TEMPORARILY DISABLED for debugging". This is blocking auto-mute-on-pause logic. **Fixed in 4b73a06: removed the `false && ` gating, restoring the auto-mute-on-pause behavior described by the comment above it.**
- `[x]` **Low** â€” `docs/js/game/voxglk-renderer.js:352` â€” `// TODO: Re-enable with correct pattern if needed` â€” stale TODO with no actionable info. **Fixed in 6ea0eea: removed the entire ~20-line commented-out blank-line compression block.**
- `[x]` **Low** â€” `docs/js/game/voxglk-renderer.js:720` â€” Duplicate private `escapeHtml` function. **Fixed in 6ea0eea: removed; now imports shared `escapeHtml` from `utils/text-processing.js`.**

#### Verified safe
- No copy-pasted blocks â‰¥10 lines anywhere (good â€” refactoring effort paid off).
- All exported functions have importers in scope.
- No `export default` followed by unused import patterns; no commented-out code blocks.
- No deeply nested unreachable code after `return`/`throw`.

### Pass 5: Console noise
_Status: complete (2026-04-25)_

**Headline:** Clean. 31 total `console.*` statements (9 log, 15 error, 7 warn) across 6 files. No hot-loop logging, no sensitive data leaks, no debug spew. Better than most codebases this size.

#### Findings

- `[x]` **Low** â€” `docs/js/utils/storage/storage-api.js:240-265` â€” `printStorageReport()` is a user-invokable debug helper that does ~10 sequential `console.log` calls. **Fixed in 6ea0eea: collapsed to `console.group` + `console.table`.**
- `[x]` **Low** â€” `docs/js/features/map-canvas.js:478,516,1222` and `docs/js/ui/mobile-menu.js:272,287` â€” `console.warn` used for actual errors. **Fixed in 6ea0eea: changed to `console.error` on all 5 sites.**
- `[x]` **Low** â€” `docs/js/game/save-manager.js:31,52` â€” Compression/decompression `console.error` lines lack context. **Fixed in 6ea0eea: now logs input length alongside error.**

#### Verified safe
- No logs in hot loops (per-frame render, per-chunk narration, per-keystroke input).
- No transcripts, auth tokens, save bodies, or other sensitive content logged.
- `remote-console.js` and `offline-debug.js` correctly scoped out as intentional logging infra.

### Pass 6: Module hygiene
_Status: complete (2026-04-25)_

**Headline:** Well-structured. No real circular imports, no wildcard re-exports, no upward-layer violations (utils never imports from ui/features), max 3 relative-path levels. Barrel files use explicit named exports. Refactoring effort here would be minimal-payoff.

#### Findings

- `[x]` **Low** â€” `docs/js/game/commands/command-router.js:34-36` â€” Dynamic `await import('../../app.js')` to access `voiceCommandHandlers`. **Fixed in v1.5.226: voiceCommandHandlers is now in `voice/command-handlers.js`, imported statically. The `getVoiceCommandHandlers()` workaround function is gone, and ~16 `await getVoiceCommandHandlers()` call sites collapsed to direct references.**
- `[ ]` **Low** â€” `docs/js/game/voxglk.js`, `docs/js/ui/game-output.js`, `docs/js/narration/tts-player.js` â€” Multiple dynamic `await import(...)` calls inside per-output / per-chunk hot paths (e.g., voxglk.js loads `updateStatus`/`addGameText`/`autoSave` dynamically each time). Modules are cached by the runtime so the perf cost is small, but it muddies the dependency graph. These look like incremental cycle-avoidance accumulated over time â€” could be statically imported if no actual cycle exists.
- `[ ]` **Low** â€” `window.*` globals as cross-module channel: `window.lastSentCommand`, `window.lastCommandWasVoice`, `window.lastCommandConfidence`, `window.getCurrentLocation`, `window.getMapData`, `window.showMap`/`hideMap`/`toggleMap`, `window.state`, `window.IFTalkStorage`. Most are debug hooks or one-shot signal flags. The signal flags (`lastSentCommand` for voice echo detection) could be moved to `state.js` for clarity; the debug ones are fine to leave.

#### Verified safe
- No `export * from '...'` wildcard re-exports anywhere.
- `core/state.js` and `core/dom.js` import only from their own layer â€” no upward leaks.
- `utils/*` does not import from `ui/*` or `features/*` (correct layering).
- Barrel files (`commands/index.js`, `ui/settings/index.js`, `utils/gdrive/index.js`, `input/keyboard/index.js`) use explicit exports â€” clear dependencies.
- Map modules use a callback-injection pattern (`map-handlers.js`, `map-sheet.js`) to break would-be cycles with `map-canvas.js` â€” cleaner than dynamic imports.
- No relative paths deeper than `../../../` anywhere.

---

## Tier 2 â€” Module-by-module review

### Batch 1: Core (`app.js`, `config.js`, `core/`)
_Status: complete (2026-04-26)_

**Headline:** `app.js` (1714 lines) is doing far more than entry-point wiring â€” it owns PWA update UI, install-prompt handling, the entire voice-command handler implementation, game-output narration glue, and a 902-line `initApp()` orchestrator. `state.js` is a coherent but kitchen-sink object (98 properties, no nesting). `core/dom.js` and `config.js` are appropriately thin.

#### Findings

- `[x]` **High** â€” `docs/js/app.js:391-719` â€” `voiceCommandHandlers` is ~330 lines of business logic (pause/play/skip/mute/unmute behavior) defined in the entry point. **Fixed in v1.5.226: extracted to `docs/js/voice/command-handlers.js` along with shared `pausePlayback()` / `resumePlayback()` helpers. app.js re-exports for backwards compatibility. Net: -447 lines from app.js. Also killed the entry-point cycle in `command-router.js` (was using a dynamic-import workaround to access voiceCommandHandlers; now a static import).**
- `[x]` **High** â€” `docs/js/app.js:747-1649` â€” `initApp()` is a 902-line orchestrator covering viewport, DOM init, voice init, UI components, event listeners, keyboard shortcuts, and lifecycle handlers. Single function with implicit ordering dependencies. **Fixed in v1.5.230: phase-split into 7 private functions (`initViewport`, `initDOMandValidation`, `initVoice`, `initUIComponents`, `wireEventListeners`, `wireKeyboardShortcuts`, `wireLifecycle`) called from a thin coordinator. app.js initApp() reduced to 9 lines.**
- `[x]` **Medium** â€” `docs/js/app.js:60-257` â€” ~200 lines of PWA service-worker registration, update notification UI, and countdown logic. **Fixed in v1.5.227: extracted to `docs/js/utils/pwa-updater.js` with one `initPWA()` export. Also moved install-prompt wiring, the manual "Check for updates" button, and standalone/iOS detection (additional ~115 lines) into the same module â€” they all share lifecycle and DOM concerns. app.js -315 lines.**
- `[x]` **Medium** â€” `docs/js/app.js:1140-1250` and `docs/js/app.js:391-445` â€” pause/play state mutations duplicated between the button handler (`handlePausePlay`) and the voice-command handler. **Fixed in v1.5.226: extracted to shared `pausePlayback()` / `resumePlayback()` in `voice/command-handlers.js`. The button handler is now a 5-line if/else. Voice "play" also gained the upper-window narration handling that only the button version had (e.g., Photopia intro).**
- `[ ]` **Medium** â€” `docs/js/core/state.js` â€” 98 properties, comment-grouped but not structurally grouped. A few clearly misplaced (`ttsIsSpeaking`, `appVoicePromise` wedged between narration and audio analysis; `soundDetected`/`soundPauseTimeout` interrupting the narration block). Consider nesting by subsystem (`state.voice`, `state.narration`, `state.gdrive`, etc.) â€” large refactor (100+ refs across the codebase) but big readability win.
- `[x]` **Low** â€” `docs/js/app.js:463, 1150, 1186` and `docs/js/narration/tts-player.js:259` â€” Three more `if (false && ...)` "TEMPORARILY DISABLED for debugging" auto-mute/unmute branches I missed in v1.5.222. **Fixed in v1.5.226: deleted all five dead `if (false &&)` blocks. The decoupling rationale now lives in `.tome/mic-narration-coupling.md` and the new `voice/command-handlers.js` references it in a comment. Code is the canonical state; tome is the canonical doc.**
- `[ ]` **Low** â€” `docs/js/app.js:1486-1537` â€” Keyboard shortcuts as a flat if/else cascade (`Ctrl+M`, `Ctrl+S`, `Ctrl+R`, `Ctrl+X`, `Escape`, arrow keys). Could be a `Map<string, handler>` with a single dispatcher. Quick win, marginal impact.
- `[ ]` **Low** â€” `docs/js/core/dom.js:103-118` â€” `validateDOM()` throws when critical IDs are missing. Defensive and correct, but couples `dom.js` to the HTML structure such that any HTML refactor needs this updated too. Acceptable; flag for awareness.

#### Verified safe / not concerns
- `core/dom.js` is genuinely just a DOM-ref cache + one validator; no logic creep.
- `core/config.js` is the right shape â€” single `APP_CONFIG` object, no logic.
- `core/app-commands.js` â€” focused module for `/`-prefixed app commands; not bloated.
- No inverted layering in `core/` â€” those modules don't import from `ui/`, `features/`, or `game/`.
- Cyclomatic complexity â‰¤10 across the batch â€” `handlePausePlay()` is the closest at ~8 nested branches.

#### Top 5 longest functions in batch
1. `initApp()` â€” `app.js:747-1649` (902 lines) â€” the elephant
2. `setupMuteButton` event cluster â€” `app.js:1332-1482` (~150 lines)
3. `handlePausePlay()` â€” `app.js:1140-1250` (~110 lines)
4. `showUpdateNotification()` â€” `app.js:91-200` (~110 lines)
5. Voice command pause handler â€” `app.js:407-445` (~40 lines)

#### Recommended refactor order (value/effort)
1. **Extract `voiceCommandHandlers`** to `voice/command-handlers.js` â€” High value, ~2 hrs. Removes 330 lines from entry point; voice behavior becomes testable.
2. **Extract PWA update logic** to `utils/pwa-updater.js` â€” Medium value, ~1 hr. Trivial and self-contained.
3. **Consolidate pause/play helpers** â€” Medium value, ~30 min. Quick DRY-up.
4. **Phase-split `initApp()`** â€” Medium value, ~4 hrs. Big readability win, careful to preserve init order.
5. **Nest `state.js` by subsystem** â€” Lower value, ~2 hrs core change + auditing 100+ refs. Defer until other refactors settle.

### Batch 2: Game engine (`game/voxglk*`, `game/game-loader.js`)
_Status: complete (2026-04-26)_

**Headline:** Clean three-way split between ZVM bridging (`voxglk.js`), HTML rendering (`voxglk-renderer.js`), and orchestration (`game-loader.js`). But `voxglk.js` is 1129 lines with 22 module-level `let` declarations and a single `update()` method that's 471 lines covering 5+ concerns. Renderer is properly side-effect-free. Game-loader mixes orchestration with recently-played UI rendering.

#### Findings

- `[x]` **High** â€” `docs/js/game/voxglk.js:343-965` â€” `createVoxGlk()` closure conflates 5+ concerns. **All three sub-extractions complete: `voxglk-watchdog.js` (v1.5.228), `voxglk-grid.js` (v1.5.229), `voxglk-bootstrap.js` (v1.5.231).**
- `[ ]` **High** â€” `docs/js/game/voxglk.js:14-45` â€” 22 module-level `let` declarations are state for the closure but read like globals. Lifecycle is implicit: which reset per-game vs per-turn vs never? Examples: `lastContentGeneration` (used once at line 691, set at 424 â€” race condition with resize), `gridStates` cleared in `init()` unconditionally (line 354), `skipNextUpdateAfterBootstrap` lifecycle spans two updates. Wrap in a typed state object or move into `createVoxGlk()` closure scope so the lifecycle is visible.
- `[ ]` **Medium** â€” `docs/js/game/voxglk.js:612, 1127` â€” Status-bar change detection compares the rendered HTML string (`statusBarHTML !== lastStatusLine`). Brittle: any rendering change (extra space, attribute order) triggers a false "changed" signal that re-narrates an unchanged room. Compare extracted plain text instead.
- `[ ]` **Medium** â€” `docs/js/game/game-loader.js:381-444` â€” `renderRecentlyPlayedSection()` is UI rendering (DOM creation, event listeners, dialog construction) inside the game-loader. Belongs in `ui/recently-played.js`. Same goes for the resume dialog and custom-game tracking helpers (`showResumeDialog`, `trackCustomGame`, `removeCustomGame`, `getCustomGamesWithAutosaves`).
- `[ ]` **Medium** â€” `docs/js/game/voxglk-renderer.js:59-74` â€” `renderUpdate(updateObj, persistentWindows)` accepts both the update's own windows and the persistent map, with fallback logic for when persistentWindows is missing. The only caller (`voxglk.js:602`) always passes persistentWindows, so the fallback is dead. Tighten the signature: require the windows map, document that it must be current.
- `[x]` **Medium** â€” `docs/js/game/voxglk.js:552-599` â€” Grid-state reconstruction nested in main loop. **Fixed in v1.5.229: extracted to `voxglk-grid.js`.**
- `[ ]` **Low** â€” `docs/js/game/voxglk.js:1088-1090` â€” `isSafeToSave()` exports `!justExitedCharMode`. Misleading name for a very specific check (only guards against autosaving during char-modeâ†’line transitions). Either rename to `isCharModeTransitioning()` or inline at the call site.
- `[ ]` **Low** â€” `docs/js/game/voxglk.js:974-1053` â€” `sendInput()` guards on `acceptCallback` at entry but not before the final call (line 1046). Theoretical race; in practice the callback isn't nullified mid-function. Add a defensive re-check before invoking.

#### Verified safe / not concerns
- `voxglk-renderer.js` is genuinely side-effect-free (good â€” pure functions for HTML generation).
- No cycles between `voxglk.js` and `voxglk-renderer.js`.
- `game-loader.js`'s actual loading path (ZVM init â†’ fetch game file â†’ start) is appropriately structured.

#### Top 5 longest functions in batch
1. `createVoxGlk()` closure â€” `voxglk.js:343-965` (623 lines)
2. `update()` method body â€” `voxglk.js:416-887` (471 lines)
3. `initGameSelection()` â€” `game-loader.js:538-789` (252 lines)
4. `startGame()` â€” `game-loader.js:24-264` (241 lines)
5. `processStyledContent()` â€” `voxglk-renderer.js:186-340` (155 lines)

#### Recommended refactor order (value/effort)
1. **Extract watchdog/repair to `voxglk-watchdog.js`** â€” High value, ~3 hrs. Self-contained module, removes ~150 lines from voxglk.js.
2. **Move recently-played UI to `ui/recently-played.js`** â€” Medium value, ~1.5 hrs. Clean separation; no shared mutable state.
3. **Status-bar plain-text comparison** â€” Medium value, ~30 min. Two variable renames + one extraction.
4. **Wrap voxglk module state into a `VoxGlkState` object** â€” High value, ~4 hrs. Big readability win, but touches every closure access.
5. **Extract bootstrap-restore to `voxglk-bootstrap.js`** â€” Medium value, ~2 hrs. Makes a fragile multi-file flow explicit and testable.

### Batch 3: Save/restore (`game/save-manager.js`)
_Status: complete (2026-04-26)_

**Headline:** Focused, well-maintained module (1079 lines). Prior Tier 1 fixes (XSS sanitization, quota-error propagation) leave no security gaps. Two medium concerns: ~200 lines of map-domain logic embedded here, and `initSaveHandlers` mixing UI wiring with save logic. No data-loss bugs. The agent-flagged race condition was a false positive â€” `flushMapSave()` is synchronous and the flush-before-read pattern is correct.

#### Findings

- `[ ]` **Medium** â€” `docs/js/game/save-manager.js:102-222, 230-310` â€” `getOptimizedMapData()` (121 lines) and `restoreMapData()` (80 lines) embed map-domain knowledge in the save module: they hardcode the `iftalk_map_${gameName}` localStorage key and know the internal structure of map node/edge data. This is map-module knowledge. Better: export `exportMapState()` / `importMapState(data)` from `features/map-canvas.js` and have save-manager call those abstractions. Current coupling: if map storage keys or data shape change, save-manager breaks silently.
- `[ ]` **Medium** â€” `docs/js/game/save-manager.js:1008-1079` â€” `initSaveHandlers()` wires 5 DOM button event listeners and calls `closeSettings()` (imported from settings module). Save logic and UI-binding are mixed. Save functions are already exported; the event-listener wiring could move to a UI-layer module (e.g., `ui/settings/settings-panel.js` or a toolbar init file), leaving save-manager purely for save/restore operations.
- `[ ]` **Low** â€” `docs/js/game/save-manager.js:626` â€” `performRestore()` directly mutates `state.skipNarrationAfterLoad` and `state.currentChunkIndex`. Not a bug, but restore logic is coupled to narration state â€” testing in isolation requires the full `state` object.
- `[ ]` **Low** â€” `docs/js/game/save-manager.js:82-84` â€” `limitHTMLHistory`: if the character-boundary truncation point falls before the first `<` tag, the text before that tag is silently dropped. Minor edge case â€” the oldest visible turn can lose a trailing text node at the boundary.

#### Verified safe / not concerns
- Race condition in `getOptimizedMapData`: `flushMapSave()` is synchronous (clears debounce timer + calls `saveMapImmediately()` â†’ writes to localStorage synchronously). The flush-before-read pattern is correct. Agent's High flag was a false positive.
- Dynamic `await import('./voxglk.js')` in `performSave()`: voxglk.js â†” save-manager.js is a real circular dependency (voxglk dynamically imports `quickLoad`, `autoLoad`, `autoSave`). Dynamic import is the correct resolution â€” not a smell.
- GDrive sync `catch (error) {}` at line 486: intentionally silent â€” Drive sync is optional, async, and best-effort. Documented in the comment.
- Backup cleanup (`cleanupOldBackups`): collects all keys into an array first, then deletes â€” no iteration hazard. Sort-by-timestamp + slice logic is correct.
- `performSave`/`performRestore` length (112/144 lines): well-decomposed with private helpers (`compressString`, `getOptimizedMapData`, `getCurrentDisplayState`, etc.). Not a concern.
- Timer: `stopAutosaveBackupTimer()` correctly pairs `clearInterval(backupIntervalId)` and nulls the ID.
- Compression fallback: both `compressString`/`decompressString` catch and return original on error â€” safe.

#### Top 5 longest functions in batch
1. `performRestore()` â€” `save-manager.js:518-661` (144 lines)
2. `getOptimizedMapData()` â€” `save-manager.js:102-222` (121 lines)
3. `performSave()` â€” `save-manager.js:394-505` (112 lines)
4. `restoreMapData()` â€” `save-manager.js:230-315` (86 lines)
5. `initSaveHandlers()` â€” `save-manager.js:1008-1079` (72 lines)

#### Recommended refactor order (value/effort)
1. **Export `exportMapState()`/`importMapState()` from map-canvas.js** â€” Medium value, ~2 hrs. Removes 200 lines of map knowledge from save-manager; makes both modules independently testable.
2. **Move `initSaveHandlers()` wiring to UI layer** â€” Low value, ~30 min. Minor separation improvement; unblocks removal of the `closeSettings` import from save-manager.

### Batch 4: Commands (`game/commands/`)
_Status: complete (2026-04-27)_

**Headline:** Well-factored batch â€” 4 small modules (command-router.js, meta-command-handlers.js, save-list-formatter.js, index.js) with clear single responsibilities. No bloat comparable to prior batches. Three medium concerns: `respondAsGame()` duplicated verbatim across the module boundary; save-name validation logic (~60 lines) duplicated between user-initiated and game-initiated save flows; and `MAX_SAVES = 5` custom-save limit silently dropped during the `commands.js` â†’ `game/commands/` modularization refactor. Low-severity cleanup items: unsafe `JSON.parse` in save-list-formatter, two dead functions, and `window.state` used instead of the imported `state` in one handler.

#### Findings

- `[x]` **Medium** â€” `docs/js/game/commands/command-router.js:339` and `docs/js/game/commands/meta-command-handlers.js:21` â€” `respondAsGame()` defined identically in both files (14 lines, byte-for-byte identical: `addGameText` call, `tempDiv` innerHTML, `window.handleGameOutput` dispatch). One module should import it from the other, or extract to a shared `ui/respond-as-game.js`. **Fixed in v1.5.243: `meta-command-handlers.js` now imports `respondAsGame` from `ui/respond-as-game.js`; local copy deleted.**
- `[x]` **Medium** â€” `docs/js/game/commands/meta-command-handlers.js:224-273` vs `meta-command-handlers.js:380-458` â€” `handleSaveResponse()` and `handleGameSaveResponse()` share ~60 lines of duplicated validation: number-to-save lookup, quicksave/autosave overwrite protection, name format regex, reserved-name check. Difference is only the final action (call `customSave()` vs set `window._customSaveFilename` + invoke `gameDialogCallback`). Extract a `validateSaveName(input, allSaves)` helper returning `{valid, targetSaveName, errorMessage}`. **Fixed in v1.5.243: `validateSaveName()` extracted; both response handlers now call it.**
- `[x]` **Medium** â€” `docs/js/game/commands/meta-command-handlers.js:handleSaveResponse,handleGameSaveResponse` â€” `MAX_SAVES = 5` custom-save limit was silently dropped during the `commands.js` â†’ `game/commands/` modularization refactor (commit `107a47b`). Old code blocked new saves when `saves.length >= MAX_SAVES` (same check in both user-typed and game-dialog flows) with a clear message directing the user to delete or overwrite. Now unlimited custom saves are possible, risking localStorage bloat and unwieldy save lists. **Fixed in v1.5.234: restored `const MAX_SAVES = 5` and guards in both response handlers; allows overwrites, blocks net-new saves when at limit.**
- `[ ]` **Low** â€” `docs/js/game/commands/save-list-formatter.js:21,55,73` â€” `JSON.parse` called directly on localStorage reads in `getCustomSaves()`, `getQuicksave()`, `getAutosave()`. A corrupted or partially-written save entry throws uncaught. Rest of codebase uses `getJSON` from `storage-api.js` which wraps and catches. Should use `getJSON` here for consistency.
- `[ ]` **Low** â€” `docs/js/game/commands/meta-command-handlers.js:300,301,307,313,314` â€” `handleRestoreResponse()` uses `window.state.currentGameName` (5 sites) despite `state` being statically imported at the module top. `handleGameRestoreResponse()` (line 506) correctly uses imported `state`. Inconsistency; should use imported `state` throughout.
- `[x]` **Low** â€” `docs/js/game/commands/command-router.js:493-510` â€” `waitForInputAndContinue()` is defined, unexported, and never called from anywhere in the module (only its own recursive self-call). Dead function; safe to delete. **Fixed in v1.5.243: deleted.**
- `[x]` **Low** â€” `docs/js/game/commands/command-router.js:484-487` â€” `sendCommand()` is an empty no-op exported "for compatibility." app.js imports it (line 43) but never calls it (`window._sendCommand` uses `sendCommandDirect`). Delete from command-router.js, index.js, and the app.js import list. **Fixed in v1.5.243: deleted from command-router.js, index.js, and app.js import.**

#### Verified safe / not concerns
- Entry-point cycle from command-router.js is fixed (v1.5.226): confirmed static import of `voiceCommandHandlers` from `voice/command-handlers.js` at line 29.
- `interceptMetaCommand()` at 283 lines looks large but is 95% a command dispatch table â€” legitimate for this type of code; switch case bodies average 2-3 lines.
- `formatSaveEntry()` injects `save.name` directly into HTML without `escapeHtml`, but names are validated to `/^[a-zA-Z0-9_ -]+$/` at save time â€” no angle brackets possible. Brittle trust but not a current XSS vector.
- `getCustomSaves()` iterates entire localStorage O(n) â€” not a performance concern; user-invoked, never in a hot loop.
- `awaitingMetaInput` module-level mutable state is appropriate for single-session interactive dialog. `setAwaitingMetaInput` external setter is the intended cross-module write path.
- `Dialog.file_construct_ref()` bare global (lines 555, 578): same pattern as rest of codebase; consistent with dialog-stub.js load expectations.
- Re-prompting in `handleGameSaveResponse`/`handleGameRestoreResponse` (restore `awaitingMetaInput`, re-enter system mode) is correct behavior for in-game dialogs that must stay open on bad input.
- `handleSaveResponse`/`handleRestoreResponse`/`handleDeleteResponse` in command-router.js receive a `saves` parameter that's ignored â€” the actual list is re-fetched inside `handleMetaResponse`. Minor but harmless.

#### Top 5 longest functions in batch
1. `interceptMetaCommand()` â€” `command-router.js:50-333` (283 lines) â€” command dispatch table; acceptable
2. `sendCommandDirect()` â€” `command-router.js:379-479` (100 lines) â€” mute check + display + history + dispatch + send
3. `handleGameSaveResponse()` â€” `meta-command-handlers.js:380-458` (78 lines)
4. `initDialogInterceptor()` â€” `meta-command-handlers.js:524-593` (69 lines)
5. `handleMetaResponse()` â€” `meta-command-handlers.js:157-219` (62 lines)

#### Recommended refactor order (value/effort)
1. **Restore `MAX_SAVES` limit** â€” Medium value, ~15 min. Re-add `const MAX_SAVES = 5` and both enforcement checks (user-typed save + game-dialog save). Restores intentional UX guard and prevents localStorage bloat.
2. **Extract `respondAsGame()` to shared module** â€” Low value, ~15 min. Import in both callers. Clear DRY violation.
3. **Extract `validateSaveName()` helper** â€” Medium value, ~30 min. Eliminates ~60 lines of duplicated validation with divergence risk.
4. **Use `getJSON` in save-list-formatter** â€” Low value, ~15 min. Consistency and crash protection on corrupt saves.
5. **Delete dead code** (`waitForInputAndContinue`, `sendCommand`) â€” Low value, ~5 min. Clean-up only.

### Batch 5: Settings UI (`ui/settings/`)
_Status: complete (2026-04-27)_

**Headline:** Five focused modules with clear ownership, but two cross-module duplication problems and a modal-builder that's overstayed its welcome in the settings orchestrator. `data-management-ui.js` silently re-defines two functions verbatim from `settings-panel.js` instead of importing them, and nearly duplicates its own clear-all handler in two places. `showBackupSavesDialog()` (110 lines of inline DOM construction) belongs in a separate file. Low-severity UI concerns: `alert()` for post-deletion feedback and indefinite `populateVoiceDropdown` polling.

#### Findings

- `[x]` **Medium** â€” `docs/js/ui/settings/data-management-ui.js:18-53` â€” `isOnWelcomeScreen()` and `getGameDisplayName()` defined identically to `settings-panel.js:60-95`. Both functions are exported from `settings-panel.js`; `data-management-ui.js` should import them instead of redefining them locally. Exact copy â€” any future change to either needs to be made in two places. **Fixed in v1.5.243: local copies deleted; now imports from `settings-panel.js`.**
- `[ ]` **Medium** â€” `docs/js/ui/settings/settings-panel.js:171-281` â€” `showBackupSavesDialog()` is 111 lines of inline modal DOM construction (overlay, dialog, HTML content, event listeners, restore button wiring) embedded in the settings orchestrator. Same concern as `renderRecentlyPlayedSection()` in game-loader (Batch 2). Move to `docs/js/ui/backup-saves-dialog.js` with a single `showBackupSavesDialog()` export.
- `[ ]` **Medium** â€” `docs/js/ui/settings/data-management-ui.js:62-144` vs `149-190` â€” The welcome-screen path of `clearAllDataBtn` (clear all data + Drive deletion + alert + closeSettings) is ~45 lines that duplicate `deleteAllAppDataBtn`'s handler almost exactly. Extract a shared `async function handleDeleteAllAppData()` and call it from both.
- `[ ]` **Low** â€” `docs/js/ui/settings/data-management-ui.js:112,130` â€” `alert()` used for post-deletion confirmation. Native `alert` is synchronous, blocks the event loop, and looks out-of-place in a PWA. Replace with `confirmDialog(..., { okOnly: true })` which is already imported and used in the same file.
- `[ ]` **Low** â€” `docs/js/ui/settings/voice-selection.js:217-219` â€” `populateVoiceDropdown()` retries indefinitely if `speechSynthesis.getVoices()` returns empty (`setTimeout(populateVoiceDropdown, 100)`). On browsers where voices never load, this leaks a perpetual timer. Add a max retry count (e.g., 50 attempts = 5 seconds).
- `[ ]` **Low** â€” `docs/js/ui/settings/gdrive-ui.js:131` â€” `iftalk_gdrive_folder_id` sometimes stores `'path:' + folderPath` (a path string, not a Drive folder ID). The key name implies an ID. The `'path:'` prefix is handled correctly in `gdrive-api.js:127`, but the naming makes the contract non-obvious to future readers.
- `[ ]` **Low** â€” `docs/js/ui/settings/voice-selection.js:276` â€” `loadBrowserVoiceConfig()` is declared `async` but contains no `await`. The `async` keyword is unnecessary and implies async work to callers. Change to a synchronous function.
- `[ ]` **Low** â€” `docs/js/ui/settings/voice-selection.js:206` â€” `getVoiceDisplayName()` prefixes voices with `â˜…` based on `getIOSPreferredIndex()` on all platforms. On Windows/Android the iOS-preferred voices (Karen, Tessa, etc.) don't exist, so the `â˜…` never appears â€” but the intent of the marker is platform-specific and should be gated on `isIOS`.

#### Verified safe / not concerns
- `closeSettings()` import in `data-management-ui.js` and `meta-command-handlers.js` â€” appropriate; settings-panel owns panel open/close state.
- `restoreBackup()` try/catch (settings-panel.js:288) wraps the full operation including the `localStorage.setItem` for the restore copy â€” errors surface to user.
- `getDriveFolderId()` / `'path:'` prefix: consumed at `gdrive-api.js:127` with an explicit `startsWith('path:')` check â€” convention is documented and handled correctly.
- Accordion wiring in `initSettings()` â€” `querySelectorAll` runs once during init, no listener accumulation.
- `populateVoiceDropdown` on `speechSynthesis.onvoiceschanged` â€” correct Web Speech API pattern; `onvoiceschanged` fires asynchronously on first voice availability.
- `voice-selection.js.backup` â€” dead backup file in tree (same class as the `.bak` files removed in Batch 4; safe to delete).
- Boolean persistence inconsistency (`keepAwakeToggle` uses `=== 'true'`, others use `!== 'false'`) â€” intentional: keep-awake defaults to off while others default to on. Not a bug.

#### Top 5 longest functions in batch
1. `initSettings()` â€” `settings-panel.js:340-551` (212 lines) â€” settings wiring + accordion + all slider/toggle init
2. `initDataManagementUI()` â€” `data-management-ui.js:58-191` (134 lines)
3. `openFolderPicker()` â€” `gdrive-ui.js:37-156` (120 lines) â€” inline modal constructor
4. `showBackupSavesDialog()` â€” `settings-panel.js:171-281` (111 lines) â€” inline modal constructor
5. `populateVoiceDropdown()` â€” `voice-selection.js:214-270` (57 lines)

#### Recommended refactor order (value/effort)
1. **Import `isOnWelcomeScreen` and `getGameDisplayName` in `data-management-ui.js`** â€” Medium value, ~10 min. Delete the two local copies; already exported from `settings-panel.js`.
2. **Move `showBackupSavesDialog` to `ui/backup-saves-dialog.js`** â€” Medium value, ~45 min. Self-contained modal; trivially extractable.
3. **Extract shared `handleDeleteAllAppData()` helper** â€” Low value, ~20 min. Eliminates 45-line duplication in `data-management-ui.js`.
4. **Replace `alert()` with `confirmDialog({okOnly: true})`** â€” Low value, ~10 min. Better PWA UX, already imported.
5. **Cap `populateVoiceDropdown` retry loop** â€” Low value, ~5 min. Add `if (attempts > 50) return;`.

### Batch 6: Map system (`features/map-*`, `auto-mapper.js`)
_Status: complete (2026-04-27)_

**Headline:** Four focused modules with a clear division of concerns â€” data tracking (`auto-mapper.js`), input handling (`map-handlers.js`), sheet UI (`map-sheet.js`), and orchestration (`map-canvas.js`). The callback-injection pattern in `map-handlers.js` and `map-sheet.js` is a clean cycle-break, confirmed in Pass 6. One XSS finding: unescaped node names in the connections list's `innerHTML`. Two duplication problems: a direction-offset table appears twice in `map-canvas.js`, and the edge-transfer logic is copy-pasted between both merge functions in `map-sheet.js`. `map-canvas.js` at 1963 lines is the largest module reviewed so far â€” the toast system (~200 lines) and `syncMapFromAutoMapper` (~105 lines) are natural extraction candidates.

#### Findings

- `[x]` **Medium** â€” `docs/js/features/map-sheet.js:344` â€” `populateConnectionsList()` builds the connections list via `innerHTML` with `${c.node.name}` unescaped. Node names originate from Z-machine status bar text, which is game-controlled. A crafted `.z5`/`.z8` game file (user-loadable via the custom-game feature) could produce a room name like `<img src=x onerror=â€¦>` that executes when the connections panel is opened. Same class as the save-name XSS fixed in Pass 1. **Fixed in v1.5.234: import `escapeHtml` from `utils/text-processing.js`; wrap `c.node.name` at the injection site.**
- `[ ]` **Medium** â€” `docs/js/features/map-canvas.js:1553-1569` â€” `syncFromAutoMapper()` defines an inline `directionOffsets` table that duplicates (and partially diverges from) `DIRECTION_OFFSETS` imported from `map-config.js`. The inline version adds lowercase aliased keys (`'n'`/`'north'` etc.); it also omits portal commands (`in`/`out`/`enter`/`exit`) that appear in `COMMAND_DIRECTIONS`. Any extension to `DIRECTION_OFFSETS` in map-config won't be reflected here. Import and use `DIRECTION_OFFSETS` directly, supplementing only keys genuinely absent from the canonical set.
- `[ ]` **Medium** â€” `docs/js/features/map-sheet.js:544-569, 704-729` â€” `handleNodeMerge()` and `performManualMerge()` contain byte-for-byte identical edge-transfer logic: iterate `mapState.edges`, partition into `edgesToAdd`/`edgesToDelete`, apply changes, and re-protect edges. The only differences are the node IDs and the closing `showHint` message. Extract a private `transferEdges(sourceId, targetId)` helper and call it from both. Same class as the `respondAsGame()` duplication in Batch 4.
- `[ ]` **Medium** â€” `docs/js/features/map-canvas.js:1870` â€” `syncMapFromAutoMapper()` calls `JSON.parse(existing)` without a try/catch. All other JSON-from-storage reads in the codebase use `getJSON` from `storage-api.js` (which catches and returns `null` on error). A partial write or encoding corruption throws uncaught and unwinds silently. Wrap with try/catch or switch to `getJSON`.
- `[x]` **Low** â€” `docs/js/features/map-canvas.js:546` â€” `toggleAutoMap()` guards on `window.getCurrentLocation ?` before calling it, but `getCurrentLocation` is already a static import from `auto-mapper.js` at line 18. The window-global check is redundant (the module export is always available). Replace with direct `getCurrentLocation(statusText)`. **Fixed in v1.5.243: replaced with `getCurrentLocation(statusText)`.**
- `[x]` **Low** â€” `docs/js/features/map-handlers.js:250` â€” `hideFab()` is defined, exported, and never called anywhere. The comment at line 49 of the same file explicitly notes "no hideFab() call" was intentional. Dead export; delete it. **Fixed in v1.5.243: deleted.**
- `[ ]` **Low** â€” `docs/js/features/map-canvas.js:1153` â€” `cancelOnboarding(currentToast)` parameter name shadows the module-level `currentToast` variable (line 1033). The function's `currentToast` and the module's `currentToast` are different objects. Rename the parameter to `toastEl` to eliminate confusion.
- `[ ]` **Low** â€” `docs/js/features/map-canvas.js:1031` â€” `TOAST_STORAGE_KEY = 'iftalk_map_toasts_dismissed'` is a localStorage key constant defined mid-file. `FIRST_USE_KEY` (same category of map-related storage key) lives in `map-config.js` and is imported. Move `TOAST_STORAGE_KEY` to `map-config.js` for consistent key management.
- `[ ]` **Low** â€” `docs/js/features/auto-mapper.js:68-138` â€” 70-line commented-out block for the v5 VM-memory reading approach. The comment says "kept for reference", but Batch 4 removed an identical class of stale blocks from `voxglk-renderer.js` for the same reason: git history is the reference. Delete it.
- `[ ]` **Low** â€” `docs/js/features/map-sheet.js:149` â€” `openNodeSheet()` always sets the badge to `'Auto-mapped'` for non-duplicate nodes regardless of `node.isManual`. A freshly-created user location (`isManual: true`) opens with an "Auto-mapped" badge until the user starts typing, at which point `handleNodeNameChange` corrects it to "Your edit". Set badge to `'Your location'` (class `sheet-node-badge user`) upfront when `node.isManual` is true.

#### Verified safe / not concerns
- The callback-injection pattern in `map-handlers.js` and `map-sheet.js` is clean and intentional â€” confirmed as the correct cycle-break in Pass 6.
- `findAvailablePosition()` spiral search is bounded at 72 candidate checks (6 rings Ã— 12 angles); the documented fallback-to-overlap for very dense maps is correct.
- `setupResizeHandle()` uses `AbortController` for clean listener cleanup â€” returned via `resizeState` and called in `hideMap()`. No leak.
- Duplicate-node ID generation (`while (mapState.nodes.has(duplicateId) || mapState.deletedNodes.has(duplicateId))`) correctly handles collisions, including re-use of previously-deleted IDs.
- `transitionend` listener in `hideMap()` is paired with a 500ms fallback timeout that cleans up if the transition never fires.
- `startCheckTimeout` in `auto-mapper.js` is cancelled at the top of every `initAutoMapper()` call â€” no accumulation on game restarts.
- `toastQueue`, `currentToast`, and `toastContainer` are module-level singletons appropriate for a single-instance UI.
- `performUndo()` `switch/case` uses `const` without per-case block scopes â€” valid in strict-mode ES6 modules since adjacent cases are never simultaneously live.
- `populateConnectionsList` re-attaches connection-type and delete listeners on every `openNodeSheet` call, but it also replaces the entire list via `innerHTML`, so there is no listener accumulation.

#### Top 5 longest functions in batch
1. `setupEventListeners()` â€” `map-canvas.js:200-393` (194 lines)
2. `syncFromAutoMapper()` â€” `map-canvas.js:1541-1702` (162 lines)
3. `handleLocationChange()` â€” `map-canvas.js:629-771` (143 lines)
4. `syncMapFromAutoMapper()` â€” `map-canvas.js:1852-1956` (105 lines)
5. `createMapUI()` â€” `map-canvas.js:108-194` (87 lines)

#### Recommended refactor order (value/effort)
1. **Fix `populateConnectionsList` XSS** â€” Medium value, ~10 min. One `escapeHtml()` call on `c.node.name`.
2. **Extract `transferEdges()` from merge functions** â€” Medium value, ~20 min. Eliminates ~50-line duplication between `handleNodeMerge` and `performManualMerge`.
3. **Replace inline `directionOffsets` with `DIRECTION_OFFSETS` import** â€” Medium value, ~15 min. Removes the diverging duplicate table in `syncFromAutoMapper`.
4. **Wrap `JSON.parse` in `syncMapFromAutoMapper`** â€” Low value, ~5 min. Switch to `getJSON` from `storage-api.js`.
5. **Delete `hideFab()` + fix `window.getCurrentLocation` in `toggleAutoMap`** â€” Low value, ~10 min combined.

### Batch 7: Narration (`narration/`)
_Status: complete (2026-04-27)_

**Headline:** Four focused modules with clear responsibilities â€” `tts-player.js` (playback + keep-alive), `chunking.js` (text splitting + DOM marker insertion), `highlighting.js` (CSS Highlight API + scroll), `navigation.js` (skip/start/end controls). One High bug: the MediaSession `play` action handler calls a non-existent function â€” lock screen play button is silently broken. One Medium concern: a 40-line inline Glk-class detection block in `insertRealMarkersAtIDs` should be a private helper. Most other issues are Low housekeeping: a missing `stopKeepAlive()` call in `skipToEnd`, an empty catch lacking an intent comment, a confusing `while`/`break` that should be `if`, and a debug event dispatched on every narrated chunk.

#### Findings

- `[ ]` **High** â€” `docs/js/narration/tts-player.js:55` â€” MediaSession `play` action handler (inside `startKeepAlive`) does `import('./navigation.js').then(nav => nav.resumeNarration())`. `navigation.js` exports no `resumeNarration` function â€” the call silently throws a `TypeError` (swallowed by the missing `.catch()`). Lock screen play button does nothing. Fix: call `speakTextChunked(null, state.currentChunkIndex)` directly (same file; no import needed). The dynamic import of `navigation.js` exists only to call this non-existent function and can be removed.
- `[ ]` **Medium** â€” `docs/js/narration/chunking.js:183-223` â€” `insertRealMarkersAtIDs` contains a ~40-line inline Glk-class detection block that first checks the immediate previous sibling, then walks ancestors up to `container`. It is a self-contained concern; extract to a private `getGlkClass(textNode, container)` helper to bring the parent function under 100 lines and make the detection logic independently readable.
- `[ ]` **Low** â€” `docs/js/narration/navigation.js:178-193` â€” `skipToEnd()` bypasses `stopNarration()` and inlines its own audio teardown (stops `state.currentAudio`, calls `speechSynthesis.cancel()`, clears `state.isNarrating`). In doing so it omits `stopKeepAlive()` â€” the keep-alive AudioContext continues running unnecessarily after skip-to-end, wasting battery. Add a `stopKeepAlive()` call (import from `tts-player.js` which already exports it).
- `[ ]` **Low** â€” `docs/js/narration/chunking.js:257` â€” Empty `catch (e) {}` in `insertRealMarkersAtIDs` (DOM manipulation failure during marker insertion) lacks an intent comment. Same pattern fixed across `auto-mapper.js`, `remote-console.js`, and `app.js` in v1.5.223 â€” add a brief comment explaining that marker failures are expected for certain DOM structures and narration continues without that marker.
- `[ ]` **Low** â€” `docs/js/narration/chunking.js:186-202` â€” `while (prevSibling) { /* check classList */; break; }` is always a single-iteration loop â€” the `break` is unconditional, making this semantically identical to `if (prevSibling) { /* check classList */ }`. The comment "Only check immediate previous sibling" confirms the intent. Rewrite as `if (prevSibling)` to remove the misleading loop construct.
- `[ ]` **Low** â€” `docs/js/narration/tts-player.js:223` â€” `text` parameter of `speakTextChunked` is documented "Unused (chunks come from state.narrationChunks)". All callers pass `null`. The parameter is a vestigial API remnant. Rename to `_text` or remove; if removed, update the two `speakTextChunked(null, ...)` calls in `navigation.js` (lines 99, 153).
- `[ ]` **Low** â€” `docs/js/narration/highlighting.js:156-168` â€” `updateTextHighlight()` dispatches a `chunkHighlighted` CustomEvent on every chunk (the hot narration path). Commented as "for debugging/testing". No production listener exists â€” this is pure overhead on every spoken sentence. Gate behind a debug flag (e.g., `window._iftalkDebug`) or remove.
- `[ ]` **Low** â€” `docs/js/narration/highlighting.js:127` â€” `removeHighlight()` fetches `gameOutput` via `document.getElementById('gameOutput')` directly. Every other module uses the pre-cached `dom.gameOutput` from `core/dom.js`. Import `dom` and use `dom.gameOutput` for consistency.
- `[ ]` **Low** â€” `docs/js/narration/highlighting.js:14-16` â€” `initScrollDetection()` is a no-op export kept "for API compatibility". It is called from `app.js:295` but does nothing. Remove the export from `highlighting.js` and the import+call from `app.js`.

#### Verified safe / not concerns
- `speakTextChunked` session-ID mechanism (`narrationSessionId` check at line 271) correctly supersedes stale loops when narration restarts â€” well-designed guard.
- `startTimeout` 2-second safety in `playWithBrowserTTS` â€” already documented as self-healing in Pass 2 (`[-]` entry).
- Dynamic imports `await import('../ui/game-output.js')` (line 225) and `await import('../ui/nav-buttons.js')` (lines 265, 430) â€” break real circular dependencies (`game-output.js` and `nav-buttons.js` import from `tts-player.js`). Correctly cycle-avoiding, consistent with Pass 6 analysis.
- Dynamic import of `navigation.js` in `startKeepAlive` (line 55) â€” also a justified cycle-break (`navigation.js` statically imports `stopNarration` from `tts-player.js`). The import itself is correct; only the target function name is wrong (see High finding).
- `insertRealMarkersAtIDs` processes nodes in reverse order â€” correct approach to avoid position shifts during DOM manipulation.
- `removeTemporaryMarkers` regex `lastIndex` handling â€” `test()` failure auto-resets `lastIndex` to 0; successful `test()` path has explicit `lastIndex = 0` (line 280). Correct.
- `highlightUsingMarkers` forced repaint (`void containerEl.offsetHeight`, lines 104-106) â€” documented iOS WebKit workaround for the CSS Highlight API not always clearing visually. Correct and intentional.
- `skipToChunk` smart back-button logic (3-second threshold, line 54) â€” correctly routes "within 3s or paused" to previous chunk, otherwise replays current.
- `skipToEnd` does not guard on `state.isNavigating` (unlike `skipToChunk`/`skipToStart`) â€” intentional; force-stop should always work.
- `createNarrationChunks` filters out `app` voice chunks (line 123) â€” correct; echoed user-input spans are not narrator TTS.
- `startKeepAlive`/`stopKeepAlive` singleton guard (`if (keepAliveContext) return`) â€” correct. Only missing in `skipToEnd` (see Low finding).

#### Top 5 longest functions in batch
1. `speakTextChunked()` â€” `tts-player.js:223-390` (167 lines)
2. `insertRealMarkersAtIDs()` â€” `chunking.js:135-262` (127 lines)
3. `playWithBrowserTTS()` â€” `tts-player.js:95-216` (121 lines)
4. `highlightUsingMarkers()` â€” `highlighting.js:24-116` (92 lines)
5. `skipToChunk()` â€” `navigation.js:26-105` (79 lines)

#### Recommended refactor order (value/effort)
1. **Fix MediaSession `play` handler** â€” `tts-player.js:52-56` â€” High value, ~5 min. Replace `import('./navigation.js').then(nav => nav.resumeNarration())` with direct `speakTextChunked(null, state.currentChunkIndex)`.
2. **Add `stopKeepAlive()` to `skipToEnd`** â€” Low value, ~5 min. Import `stopKeepAlive` from tts-player.js and call it at the start of teardown.
3. **Extract `getGlkClass()` helper from `insertRealMarkersAtIDs`** â€” Medium value, ~20 min. Pulls out 40-line self-contained sibling+ancestor detection block.
4. **Add intent comment to empty catch + rewrite while/break as if** â€” Low value, ~5 min combined. Consistency with v1.5.223 pattern.
5. **Gate `chunkHighlighted` event / use `dom.gameOutput` / delete `initScrollDetection`** â€” Low value, ~15 min combined.

### Batch 8: Voice (`voice/`)
_Status: complete (2026-04-27)_

**Headline:** Five focused modules with clear separation â€” `command-handlers.js` (bound voice actions), `echo-detection.js` (TTS echo suppression), `recognition.js` (Web Speech API lifecycle), `voice-commands.js` (transcript normalization and routing), `voice-meter.js` (audio visualization). The biggest structural concern is `recognition.onresult` at ~408 lines: the process-and-dispatch pattern (processVoiceKeywords â†’ showConfirmedTranscript â†’ sendCommandDirect) appears three times across parallel execution paths that could share a helper. Two definition-duplication problems: `navigationCommands` + `skipNPattern`/`backNPattern` are defined byte-for-byte identically in both `recognition.js` and `voice-commands.js`; and the `gronk`â†’`grunk` correction appears in both a regex pass and a PRONUNCIATION_DICT entry. Low-severity housekeeping: missing double-call guard in voice-meter, three intent-comment gaps on silent catches, `dom.userInput` bypassed in mute/unmute handlers, a `setTimeout(fn, 0)` dispatch inconsistency, and four separate dynamic imports of the same module.

#### Findings

- `[ ]` **Medium** â€” `recognition.js:395-431, 462-495, 764-790` â€” The process-and-dispatch pattern appears copy-pasted across three execution paths in `onresult`/`onend`: `processVoiceKeywords()` â†’ `showConfirmedTranscript()` â†’ `playCommandSent()`/`playAppCommand()` â†’ `sendCommandDirect()`. The logic in each block is ~15 lines and structurally identical. Extract a private `async function dispatchRecognized(text, confidence)` and call it from all three paths; shrinks `onresult` by ~45 lines.
- `[ ]` **Medium** â€” `recognition.js:581-584` + `voice-commands.js:170-175` â€” `navigationCommands` (array) and `skipNPattern`/`backNPattern` (regexes) are defined byte-for-byte identically in both files. They serve the same semantic purpose: identifying commands that bypass narration blocking or echo detection. Any future extension (e.g., adding `'freeze'`) must be made in two places. Export from `voice-commands.js` and import in `recognition.js`.
- `[ ]` **Low** â€” `recognition.js:217` â€” Empty `catch (err) {}` in `displayInterimAsLowConfidence` (around the `addGameText` dynamic import) lacks an intent comment. Same pattern fixed in Batch 7 (`chunking.js:257`). Add a brief note that display failures are non-fatal and recognition continues.
- `[ ]` **Low** â€” `recognition.js:699-712` â€” Normal-confidence final command dispatch wraps `sendCommandDirect` in `setTimeout(fn, 0)`, while the INSTANT_NO_WAIT path (line 416) and the delayed-instant path (line 480) call `sendCommandDirect` directly. A 0ms setTimeout does not produce a visible repaint, yet makes this path async in a way inconsistent with the other two. Document the intent or switch to direct dispatch.
- `[ ]` **Low** â€” `command-handlers.js:170,225` â€” Both `unmute` and `mute` handlers call `document.getElementById('messageInput')` directly. The element is pre-cached in `core/dom.js:63` as `dom.userInput`. Consistent with the pattern fixed in Batch 7 (`highlighting.js:127`).
- `[ ]` **Low** â€” `command-handlers.js:162,186` â€” `unmute` handler queries `dom.muteBtn?.querySelector('.material-icons')` twice: stored as `icon` at the start of the function (line 162) and re-queried as `icon2` in the recognition-failure revert path (line 186). Since `icon` is still in scope at line 186, the re-query is redundant. Replace `icon2` with `icon`.
- `[ ]` **Low** â€” `voice-commands.js:33,55` â€” `gronk`â†’`grunk` correction is applied by both a regex at line 55 (applies to all transcripts) and `PRONUNCIATION_DICT['gronk']` (applies only to single-word transcripts). Because the regex runs first, the PRONUNCIATION_DICT entry for `gronk` is never reached â€” it's dead code. Remove it.
- `[ ]` **Low** â€” `voice-commands.js:191,194,214,218` â€” `voxglk.js` is dynamically imported four times inside `processVoiceKeywords`: for `getInputType` at lines 191 and 214, and for `sendInput` at lines 196 and 218. Runtime module caching makes this functionally equivalent to one import, but the four separate destructuring lines obscure the dependency. Consolidate to a single `const { getInputType, sendInput } = await import('../game/voxglk.js')` near the char-mode block.
- `[ ]` **Low** â€” `voice-meter.js:15` â€” `startVoiceMeter()` has no guard against double-calls. If invoked while a session is already running (e.g., rapid unmute taps), it overwrites `state.microphoneStream`, `state.audioContext`, etc., orphaning the previous stream's tracks. Add `if (state.voiceMeterInterval) return;` at the top of the function.
- `[ ]` **Low** â€” `voice-meter.js:63` â€” Silent `catch (error) {}` on `getUserMedia` failure lacks an intent comment. The most common failure (`NotAllowedError`) is already surfaced to the user by `startRecognitionSafely()` upstream, so this catch is correctly silent â€” but that reasoning isn't visible here. Add an intent comment.
- `[x]` **Low** â€” `voice-meter.js:78-84` â€” `stopVoiceMeter()` clears `state.soundPauseTimeout`, resets `state.soundDetected`, and resets `state.pausedForSound`. The interval callback no longer sets any of these (comment at line 60: "no longer pauses narration"). These three cleanup lines are vestiges of when the meter triggered narration pauses. Remove them; `pausedForSound` is always `false` since nothing sets it `true` anymore. **Fixed in v1.5.243: deleted the three vestigial cleanup lines.**

#### Verified safe
- `echo-detection.js` â€” pure string comparison; no DOM access, no timers; `state.recentlySpokenChunks` correctly bounded at 30 with TTL filter in `isEchoOfSpokenText`.
- `isEchoOfSpokenText` mutates `state.recentlySpokenChunks` inline (TTL cleanup) â€” side-effectful in a query function but always correct behavior.
- `voice-meter.js` resource cleanup â€” `stopVoiceMeter()` properly releases all Web Audio API resources: stream tracks stopped, microphone node disconnected, analyser disconnected, AudioContext closed if not already closed.
- `state.hasProcessedResult` guard in `onresult` and `onend` â€” correctly prevents duplicate command dispatch across the three processing paths.
- `recognition.onerror` silently ignoring `network`/`aborted`/`no-speech` â€” all three are expected Web Speech API lifecycle events; correct behavior.
- PRONUNCIATION_DICT single-word-only restriction (`words.length === 1`) â€” intentional and correct; prevents phrase-level false-positive corrections.
- `onend` push-to-talk revert path (`wasPushToTalkRelease`) â€” correctly waits until after result processing to set `state.isMuted = true`, ensuring pending commands from PTT button release are dispatched first.
- `voice-commands.js` char-mode special keys (arrow keys, space, backspace) â€” correctly bypass voice command routing and send raw key codes via `sendInput`.
- `recordSpokenChunk` minimum length guard (`text.length < 3`) â€” prevents spurious echo matching on short TTS artifacts.

#### Top 5 longest functions in batch
1. `recognition.onresult` handler â€” `recognition.js:313-721` (~408 lines) â€” the elephant
2. `processVoiceKeywords()` â€” `voice-commands.js:44-259` (~216 lines)
3. `recognition.onend` handler â€” `recognition.js:746-842` (~96 lines)
4. `showConfirmedTranscript()` â€” `recognition.js:128-190` (~62 lines)
5. `unmute` handler â€” `command-handlers.js:157-206` (~50 lines)

#### Recommended refactor order (value/effort)
1. **Export `navigationCommands` + `skipNPattern`/`backNPattern` from `voice-commands.js`** â€” Medium value, ~20 min. Eliminates the highest-risk duplication (navigation command list that both files must stay in sync on).
2. **Extract `dispatchRecognized()` helper** â€” Medium value, ~30 min. Removes 3Ã— copy-pasted process-and-dispatch blocks; shrinks `onresult` by ~45 lines.
3. **Add double-call guard to `startVoiceMeter()`** â€” Low value, ~5 min. Prevents orphaned media streams on rapid unmute.
4. **Consolidate voxglk.js imports in `processVoiceKeywords`** â€” Low value, ~10 min. Clarifies dependency with a single destructuring import.
5. **Dead code cleanup** (PRONUNCIATION_DICT `gronk` entry, voiceMeter state resets, `icon2` re-query, `dom.userInput` bypass) â€” Low value, ~20 min combined.

### Batch 9: Input (`input/`)
_Status: complete (2026-04-27)_

**Headline:** Five focused modules â€” `keyboard-core.js` (input wiring + tap-to-examine), `voice-ui.js` (voice indicator DOM), `system-entry.js` (meta-command prompt), `word-extractor.js` (tap-to-examine word extraction), `index.js` (barrel). `word-extractor.js` and `system-entry.js` are clean with no findings. The main concern is `initKeyboardInput()` at 610 lines: three large closures (`populateInputWithWord`, `handleGameClick`, `handleGameMouseMove`) and their captured state live inside the init function when they could be module-level. Low-severity housekeeping: hot-path event handlers re-read localStorage on every mousemove/click instead of using the body class already maintained by `updateTapExamineCursor`; two disabled scroll calls with "testing" comments; a no-op `updateClearButtonVisibility`; a dead variable; an always-true condition; and `voice-ui.js` locally caching DOM elements already in `core/dom.js`.

#### Findings

- `[ ]` **Medium** â€” `keyboard-core.js:52-662` â€” `initKeyboardInput()` is 610 lines because three substantial closures (`populateInputWithWord`, lines 295-372, 77 lines; `handleGameClick`, lines 379-463, 85 lines; `handleGameMouseMove`, lines 511-583, 73 lines) and their shared state (`directions`, `commonVerbs`, `highlightOverlay`, `currentHighlightedWord`) are all scoped inside the init function. None of these closures need to capture init-local state that couldn't be module-level. Extract as named module-level functions; promote `directions` and `commonVerbs` to module-level `const`s. Init function would shrink to ~150 lines of pure wiring.
- `[ ]` **Low** â€” `keyboard-core.js:398,532` â€” `localStorage.getItem('iftalk_tap_to_examine')` is read directly inside `handleGameClick` and `handleGameMouseMove`. The latter fires on every pixel of mouse movement. `updateTapExamineCursor()` (line 599) already maintains `document.body.classList.has('tap-to-examine-enabled')` as a live flag (updated on init and on `storage` events). Replace the direct localStorage reads with `document.body.classList.contains('tap-to-examine-enabled')` to eliminate hot-path storage access.
- `[ ]` **Low** â€” `keyboard-core.js:756-757, 767-768` â€” Two `// DISABLED: Testing if we need this scroll` comment blocks around disabled `scrollToBottom()` calls. Same pattern removed in Batch 1 (`if (false &&)`) and Batch 7. If the scroll is not needed, delete the commented lines; if the behavior is desirable, re-enable with a clear condition.
- `[ ]` **Low** â€” `keyboard-core.js:789-792` â€” `updateClearButtonVisibility()` is a module-private no-op ("Button is always visible now â€” no action needed. Kept as no-op to avoid breaking existing calls"). It is called from 3 internal sites (lines 112, 120, 898) and has no callers outside the module. Delete the function and its 3 call sites.
- `[x]` **Low** â€” `keyboard-core.js:900-901` â€” `if (cmd || cmd === '')` is always true: `cmd` is the result of `messageInputEl.value.trim()`, which always returns a string; `'' || '' === ''` evaluates to `false || true` = `true`. The condition is dead. Remove it, or if the intent was to block `null`/`undefined`, note that `.trim()` already guarantees a string. **Fixed in v1.5.243: removed outer condition, body is now unconditional.**
- `[x]` **Low** â€” `keyboard-core.js:466` â€” `currentHighlightedWord` is assigned at lines 576 and 582 but never read anywhere. Remove the dead variable. **Fixed in v1.5.243: deleted declaration and both assignments.**
- `[ ]` **Low** â€” `voice-ui.js:8-9` â€” `voiceListeningIndicatorEl` and `voiceTranscriptEl` are module-local caches of the same elements already cached in `core/dom.js` as `dom.voiceListeningIndicator` (line 82) and `dom.voiceTranscript` (line 81). Dual caches diverge if the DOM is updated. `recognition.js` already uses `dom.voiceTranscript` directly (line 155); `voice-ui.js` uses its own local reference. Import `dom` from `core/dom.js` and use `dom.voiceListeningIndicator`/`dom.voiceTranscript` instead; `initVoiceUI()` then becomes a no-op and can be removed from `index.js`.

#### Verified safe
- `word-extractor.js` â€” zero findings; pure utility with no state, no DOM writes, and no injection risk. `extractWordAtPoint` returns `null` on any error. `isWordChar` correctly permits hyphens and apostrophes for compound IF object names.
- `system-entry.js` â€” clean; `enterSystemEntryMode` accepts `showMessageInputFn` and `hasPhysicalKeyboardFn` as injected dependencies â€” correct cycle-break; no imports needed.
- `sendBtnKeyboardCapture`/`clearBtnKeyboardCapture` mousedown-capture pattern â€” correct approach for preserving keyboard open/close state before click fires (after blur) on mobile.
- `hiddenKeyInputEl` (lines 69-78) â€” created once, positioned off-screen (`left: -9999px`, `opacity: 0`), `aria-hidden: true`, `maxLength: 1`; correct mobile arbitrary-key-capture approach.
- `visualViewport` baseline tracking â€” `baselineViewportHeight` updates when keyboard fully closes (line 657), correctly adapting to orientation changes.
- `hasPhysicalKeyboard()` â€” `mqCoarse` and `mqHover` `MediaQueryList` objects cached at module scope (lines 46-47); no new instances created on each call.
- `handleKeyPress` char-mode capture â€” correctly excludes bare modifier keys (line 679) and events targeting the message input itself (line 683).
- `showVoiceIndicator`/`hideVoiceIndicator` in `voice-ui.js` â€” not re-exported from `index.js` barrel, but are directly imported and used by `keyboard-core.js`. Not dead exports.

#### Top 5 longest functions in batch
1. `initKeyboardInput()` â€” `keyboard-core.js:52-662` (~610 lines) â€” the elephant
2. `handleKeyPress()` â€” `keyboard-core.js:667-769` (~102 lines)
3. `updateInputVisibility()` â€” `keyboard-core.js:797-888` (~91 lines)
4. `handleGameClick` (closure) â€” `keyboard-core.js:379-463` (~85 lines)
5. `populateInputWithWord` (closure) â€” `keyboard-core.js:295-372` (~77 lines)

#### Recommended refactor order (value/effort)
1. **Extract `populateInputWithWord`, `handleGameClick`, `handleGameMouseMove` as module-level functions** â€” Medium value, ~45 min. Move `directions`, `commonVerbs` to module-level consts; `highlightOverlay` and `currentHighlightedWord` to module-level lets. `initKeyboardInput()` becomes pure wiring.
2. **Replace hot-path localStorage reads with body class check** â€” Low value, ~10 min. Use `document.body.classList.contains('tap-to-examine-enabled')` in both event handlers.
3. **Delete `updateClearButtonVisibility` no-op + 3 call sites** â€” Low value, ~5 min. Obvious cleanup.
4. **Decide on disabled scroll calls** â€” Low value, ~5 min. Delete or restore the two commented `scrollToBottom()` blocks.
5. **Fix `voice-ui.js` dual DOM cache + remove `initVoiceUI`** â€” Low value, ~15 min. Import `dom` and use `dom.voiceListeningIndicator`/`dom.voiceTranscript`; remove the no-longer-needed init function.

### Batch 10: UI components (`ui/`, excluding `settings/`)
_Status: complete (2026-04-27)_

**Headline:** Seven focused modules covering game output, scroll button, sync modal, mobile menu, history, nav buttons, and confirm dialog. One High XSS gap: `sync-preview-modal.js` fixed `item.name` injection in the preview list (Batch 1) but missed the same pattern in `updateProgress`'s `insertAdjacentHTML` call. One Medium security: `window.lastSentCommand` used unescaped in `new RegExp()` â€” commands with regex metacharacters throw `SyntaxError`. One Medium duplication: `scroll-down-button.js` repeats a 4-line "release pressed state" sequence 6Ã— and a 6-line timer teardown 4Ã—. Low housekeeping: `alert()` for history popups, dead empty blocks, a dead function, and re-queried DOM refs in `mobile-menu.js`.

#### Findings

- `[x]` **High** â€” `docs/js/ui/sync-preview-modal.js:407-413` â€” `updateProgress()` builds `itemHtml` via template literal injecting `${currentItem.name}` (save filename from Drive API) into `insertAdjacentHTML('beforeend', itemHtml)` without `escapeHtml`. Same class as the `item.name` XSS fixed in Batch 1 (`sync-preview-modal.js:116`); that fix covered the preview list but missed the progress log. `currentItem.statusText` also includes `error.message` from a caught exception, which could contain attacker-controlled text if the Drive API returns a crafted error string. Wrap both with `escapeHtml`. **Fixed in v1.5.239.**
- `[ ]` **Medium** â€” `docs/js/ui/game-output.js:242-243` â€” `window.lastSentCommand` is used directly in `new RegExp(...)` without escaping regex metacharacters. A user command containing unmatched `[`, `(`, or a leading `*` (e.g., `get [all]`, `(enter)`, `*score`) throws `SyntaxError`, silently failing to strip the echo. Escape before use: `lastCmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
- `[ ]` **Medium** â€” `docs/js/ui/scroll-down-button.js:initScrollDownButton` â€” The "release pressed state" 4-line sequence (`button.style.transition = 'none'; button.classList.remove('pressed'); void button.offsetHeight; button.style.transition = ''`) appears 6Ã— across `touchmove`, `touchend`, `touchcancel`, `mousemove`, `mouseup`, `mouseleave`. The timer teardown (`clearTimeout(scrollTimer); clearTimeout(holdTimer); scrollTimer = null; holdTimer = null; isDragging = false; touchTracker.reset()`) appears 4Ã— in `touchend`, `touchcancel`, `mouseup`, `mouseleave`. Extract two private helpers â€” `releasePressedState(button)` and `cancelInteractions()` â€” to eliminate ~50 lines of duplication.
- `[ ]` **Low** â€” `docs/js/ui/history.js:28,37,43,63` â€” `showVoiceHistory()` and `showCommandHistory()` display output via `alert()`. Same pattern flagged in Batch 5 for `data-management-ui.js` â€” synchronous, blocks event loop, mismatched with PWA UX. Replace with a non-blocking display (e.g., `confirmDialog` with `okOnly: true`).
- `[x]` **Low** â€” `docs/js/ui/nav-buttons.js:51-53` â€” Empty `if (state.narrationChunks.length > 0) {}` block with `// Log position for debugging` comment. Dead code; remove it. **Fixed in v1.5.243: deleted.**
- `[ ]` **Low** â€” `docs/js/ui/mobile-menu.js:135-158` â€” `toggleMenu()` and `closeMenu()` both call `document.getElementById` for `mobileMenu`, `mobileMenuBtn`, and `charMenuBtn` on every invocation. These are the same elements queried by `initMobileMenu()`. Promote to module-level variables (`let menuEl`, `let menuBtnEl`, `let charMenuBtnEl`) populated during init.
- `[ ]` **Low** â€” `docs/js/ui/sync-preview-modal.js:237-261` â€” `formatTimestamp()` is defined but never called; only `formatTimestampCompact()` is used throughout the file. Dead function; delete it.
- `[x]` **Low** â€” `docs/js/ui/game-output.js:125-126` â€” Empty `else if (hasStatus && statusEl && !shouldIncludeStatus) {}` block in `ensureChunksReady`. Dead code; remove it. **Fixed in v1.5.243: deleted.**
- `[ ]` **Low** â€” `docs/js/ui/game-output.js:315` â€” Empty `.catch(err => {})` on the auto-narration of system messages lacks an intent comment. Same pattern fixed in Batches 7 and 8. Add a brief note that narration failure is non-fatal.

#### Verified safe
- `addGameText` command path â€” `displayText = escapeHtml(text)` before `div.innerHTML` (line 269). Safe.
- `displayBlockedCommand` â€” `escapeHtml(command)` before HTML injection (line 412). Safe.
- `addGameText` non-command path â€” `div.innerHTML = text` where `text` is ZVM renderer output (structured HTML from game engine, not user-controlled data). Threat model: crafted Z-code games. Realistic risk is low given Z-code binary format constraints; addressed for cross-user data paths (save files) in Pass 1.
- `renderSyncItems` / `getStatusDetails` â€” `escapeHtml` applied to all user-origin data (`item.id`, `item.name`, `statusClass`, `statusLabel`) since Batch 1. The `syncDirection === 'export'` string comparisons produce only literal strings, not user data.
- `confirmDialog` fallback to `window.confirm` (line 67) â€” acceptable defensive fallback when modal DOM is missing.
- `scroll-down-button.js` timer management â€” `holdTimer` and `scrollTimer` are always both cleared together; no scenario where one leaks while the other is cancelled.
- `mobile-menu.js` quick-access toggles â€” `getQuickAccessPrefs` wraps `JSON.parse` in try/catch (line 269-271); `saveQuickAccessPrefs` wraps `localStorage.setItem` in try/catch (line 285-287). Both correct.

#### Top 5 longest functions in batch
1. `ensureChunksReady()` â€” `game-output.js:44-221` (~177 lines)
2. `addGameText()` â€” `game-output.js:232-361` (~130 lines)
3. `initScrollDownButton()` â€” `scroll-down-button.js:27-250` (~224 lines; heavily repeated)
4. `renderSyncItems()` â€” `sync-preview-modal.js:91-137` (~47 lines)
5. `updateInputVisibility()` / `initMobileMenu()` â€” ~130 / ~107 lines

#### Recommended refactor order (value/effort)
1. **Fix `updateProgress` XSS** â€” `escapeHtml(currentItem.name)` and `escapeHtml(currentItem.statusText)` â€” High value, ~5 min.
2. **Escape `lastSentCommand` before `new RegExp`** â€” Medium value, ~5 min. Prevents SyntaxError on commands with brackets/parens.
3. **Extract `releasePressedState`/`cancelInteractions` in scroll-down-button** â€” Medium value, ~20 min. Removes ~50 lines of repetition.
4. **Promote mobile-menu element refs to module level** â€” Low value, ~10 min.
5. **Delete dead code** (`formatTimestamp`, empty blocks, debug empty if) â€” Low value, ~5 min combined.

### Batch 11: Utils (`utils/`)
_Status: complete (2026-04-27)_

**Headline:** Nineteen utility modules. Most are clean thin helpers (`status.js`, `touch-detection.js`, `scroll.js`, `game-settings.js`, `wake-lock.js`, `gdrive-device.js`, `gdrive/index.js`). Two medium-severity concerns: `processAndSplitText` in `text-processing.js` re-implements `processTextForTTS`'s 15-line normalization body verbatim instead of calling it; and user-entered pronunciation keys are used directly in `new RegExp()` without metacharacter escaping. The gdrive cluster has 6 bare `JSON.parse(localStorage.getItem(...))` calls without try/catch across three files â€” same class as the Batch 4 finding in `save-list-formatter.js`. Low housekeeping: `lock-screen.js` exports 8 no-op compatibility shims and uses redundant dynamic imports of an already-statically-imported module; `playSystemBeep` uses the `new Promise(async executor)` anti-pattern; folder names are interpolated unescaped into Drive API query strings.

Note: `storage-api.js`, `remote-console.js`, and `offline-debug.js` were already reviewed in Tier 1 Passes 3, 5, and 2 respectively. `gdrive-auth.js` OAuth token concern documented in Pass 1. Modules verified safe there are not re-flagged here.

#### Findings

- `[ ]` **Medium** â€” `docs/js/utils/text-processing.js:102-115` â€” `processAndSplitText()` re-implements the full normalization body of `processTextForTTS()` verbatim (4 regex passes + title-case replacement, lines 103-115). The only difference is that `processAndSplitText` continues to split + filter; `processTextForTTS` just returns the normalized string. Replace the duplicated opening of `processAndSplitText` with `const processed = processTextForTTS(text)` and remove the duplicate lines.
- `[ ]` **Medium** â€” `docs/js/utils/pronunciation.js:51-54` â€” `fixPronunciation()` builds `new RegExp(\`\\\\b${word}\\\\b\`, 'gi')` where `word` is a key from the user-editable pronunciation map stored in localStorage. A user-entered word containing regex metacharacters (`[`, `(`, `+`, `*`, `.`, etc.) throws `SyntaxError`, breaking the entire pronunciation pass. Same class as the `game-output.js:242` finding in Batch 10. Escape before use: `word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
- `[ ]` **Low** â€” `docs/js/utils/gdrive/gdrive-auth.js:45`, `docs/js/utils/gdrive/gdrive-sync.js:82,159,175`, `docs/js/utils/gdrive/gdrive-sync-preview.js:85,249` â€” Six bare `JSON.parse(localStorage.getItem(...))` calls without try/catch. A corrupt entry throws `SyntaxError`, which in `gdrive-sync`/`gdrive-sync-preview` breaks the entire sync loop. Same class as `save-list-formatter.js:21,55,73` (Batch 4 finding). Use `getJSON` from `storage-api.js` (already imported by callers' dependency chain) for consistency and crash protection.
- `[ ]` **Low** â€” `docs/js/utils/audio-feedback.js:256` â€” `playSystemBeep` uses `new Promise(async (resolve) => {...})` â€” the explicit-promise-with-async-executor anti-pattern. Errors thrown from the async function are silently dropped as unhandled rejections rather than rejecting the outer promise. Rewrite as a top-level `async function` using `await new Promise(r => setTimeout(r, 80))` after starting the oscillator.
- `[ ]` **Low** â€” `docs/js/utils/gdrive/gdrive-api.js:69` â€” `findOrCreateFolder` interpolates `folderName` directly into the Drive API query string: `name='${folderName}'`. A folder path segment containing `'` (e.g., `O'Brien`) produces a malformed query and a 400 error from the Drive API. Escape before use: `folderName.replace(/'/g, "\\'")`.
- `[ ]` **Low** â€” `docs/js/utils/lock-screen.js:83-88, 154-158` â€” `lockScreen()` and `unlockScreen()` use `import('./wake-lock.js').then(...)` to access `isKeepAwakeEnabled()`, despite `wake-lock.js` being statically imported at line 17 for `enableKeepAwake`/`disableKeepAwake`. Add `isKeepAwakeEnabled` to the static import at line 17; replace the two dynamic imports with direct calls to the static import.
- `[ ]` **Low** â€” `docs/js/utils/lock-screen.js:459-489` â€” Eight no-op functions (`showLockListeningIndicator`, `hideLockListeningIndicator`, `updateLockTranscript`, `clearLockTranscript`, `showLockMutedIndicator`, `hideLockMutedIndicator`, `showLockMicLockedIndicator`, `hideLockMicLockedIndicator`) are exported as compatibility shims with "No-op: indicators removed from new design" comment. Same class as `initScrollDetection` (removed v1.5.235) and `updateClearButtonVisibility` (Batch 9 finding). Find callers and remove call sites + exports.
- `[ ]` **Low** â€” `docs/js/utils/pwa-updater.js:189,196,201,206,210,241` â€” Six `alert()` calls in `initUpdateButton` and `detectStandalone` for update check feedback and iOS install instructions. `confirmDialog` is available in the codebase; `alert()` blocks the event loop and is inconsistent with PWA UX. Replace with non-blocking feedback.

#### Verified safe
- `status.js`, `touch-detection.js`, `scroll.js`, `game-settings.js`, `wake-lock.js`, `gdrive-device.js` â€” clean with no findings; correctly scoped, no unsafe patterns.
- `text-processing.js:escapeHtml` â€” correct HTML entity escaping including quotes for attribute contexts (documented at lines 7-10).
- `text-processing.js:sanitizeRestoredHTML` â€” correctly uses `<template>` (inert context), `TreeWalker`, tag blocklist, event-handler attribute stripping, and URL scheme blocklist. Reviewed in depth and confirmed safe.
- `gdrive-auth.js:ensureAuthenticated` polling loop â€” capped at 300 attempts (30 seconds); resolves `false` on timeout. Correct.
- `gdrive-sync.js` auto-sync queue â€” `pendingSyncQueue` as a `Set` prevents duplicate queue entries; `syncTimer` is a single global debounce timer â€” both correct.
- `gdrive-api.js` multipart upload boundary â€” `'-------314159265358979323846'` is a valid fixed boundary; `JSON.stringify(data)` serializes the save data safely.
- `offline-debug.js` module-level side effect (`DOMContentLoaded` listener) â€” intentional self-installing debug module; only imported where needed; no security concern since it only reads localStorage debug logs.
- `lock-screen.js` hold-to-unlock â€” `holdTimer`/`holdUpdateInterval` both cleared in `clearHoldTimer()` called from both `unlockScreen()` and `handleUnlockHoldEnd()`. No leak.
- `audio-feedback.js` oscillator nodes â€” each playback function creates a new oscillator, connects it to the shared `audioCtx.destination`, and calls `.stop(time)` with an explicit end time; Web Audio GC handles cleanup of finished nodes. No accumulation.

#### Top 5 longest functions in batch
1. `scrollToNewContent()` â€” `scroll.js:46-114` (~68 lines)
2. `clearAllAppData()` / `listAllGames()` â€” `game-settings.js:283-321` (~38 lines each)
3. `handleAuthCallback()` â€” `gdrive-auth.js:178-215` (~37 lines)
4. `showUpdateNotification()` â€” `pwa-updater.js:38-114` (~76 lines)
5. `lockScreen()` / `unlockScreen()` â€” `lock-screen.js:74-141, 146-212` (~68 / ~66 lines)

#### Recommended refactor order (value/effort)
1. **Fix `processAndSplitText` to call `processTextForTTS`** â€” Medium value, ~10 min. Delete 15 duplicate lines; reduces divergence risk.
2. **Escape pronunciation keys before `new RegExp`** â€” Medium value, ~5 min. Prevents SyntaxError on user-entered patterns.
3. **Replace 6 bare `JSON.parse(localStorage.getItem(...))` with `getJSON`** â€” Low value, ~15 min. Consistent error handling across gdrive cluster.
4. **Add `isKeepAwakeEnabled` to static import in `lock-screen.js`; remove 2 dynamic imports** â€” Low value, ~5 min.
5. **Audit and remove lock-screen.js no-op shims + their callers** â€” Low value, ~15 min. Same class as prior removals.

### Batch 12: CSS pass (`styles/`)
_Status: complete (2026-04-27)_

**Headline:** Thirteen CSS files (7051 lines) with a clear modular structure: `variables.css` â†’ `base.css` â†’ components â†’ `mobile.css`. No dead `@keyframes` accumulation, no TODO/FIXME comments, no user-supplied data injected into styles. The main structural concern is z-index architecture: the map-canvas file (`map-canvas.css:8-21`) defines both map-specific AND global z-index variables (`--z-controls: 980`) that are consumed by other files; these should be in `variables.css`. The non-map components (`lock-screen.css`, `base.css`, `modals.css`, `sync-preview.css`) use ~20 hardcoded z-index magic numbers instead of named variables, while the map system has a clean named-variable system. Low-severity housekeeping: one commented-out alternative color in `variables.css`; `base.css:62` uses `!important` on the body rule with a comment but the intent could be clearer.

#### Findings

- `[ ]` **Low** â€” `docs/styles/map-canvas.css:8-21` â€” The `--z-*` CSS custom properties block is defined inside `map-canvas.css`, but `--z-controls: 980` is consumed by `controls.css:14`. This creates a cross-component dependency: `controls.css` implicitly requires `map-canvas.css` to be loaded first or `--z-controls` resolves to the CSS initial value. Move all `--z-*` variables to `variables.css` where they establish the global stacking-context contract for the whole app.
- `[ ]` **Low** â€” `lock-screen.css:13,48,103,129,135,143,162,188,208`, `base.css:78,155,472`, `modals.css:14,142,251`, `sync-preview.css:16`, `welcome.css:299,427`, `settings.css:34,61` â€” ~20 hardcoded z-index integers across non-map files (5000, 5001, 5100, 5200, 10000, 10001, 10002, 9999, 999, 1000) while the map system uses named `--z-*` variables. Extend the named-variable system in `variables.css` to cover all layers: `--z-settings: 1000`, `--z-modal: 10000`, `--z-lock-screen: 5000`, `--z-lock-overlay: 5100`, `--z-loading: 9999`, `--z-above-modal: 10001`, etc.
- `[x]` **Low** â€” `docs/styles/variables.css:10` â€” Commented-out alternative `--accent-primary: #aec8ff;` value. Stale dead comment; delete it. **Fixed in v1.5.243: deleted.**

#### Verified safe / not concerns
- `mobile.css` (28 `!important`) and `game-output.css` (16 `!important`) â€” all instances are in `@media` or `body.force-mobile` responsive override selectors. Defensible; this is the correct use of `!important` for overriding specificity-heavy base rules in a targeted context.
- `base.css:62` â€” `padding-bottom: 0 !important` on `body` with comment "Override browser safe area on body" â€” intentional; safe-area insets are applied per-section instead.
- 20 `@keyframes` definitions across 7 files â€” no duplicates found; all named distinctly by component.
- No TODO, FIXME, HACK, or TEMP comments in any CSS file.
- `--z-controls` value (980) correctly places the control panel above the map overlay (950) but below modals (1000+) â€” the stacking order is correct, just not fully named.
- No user-supplied data reaches CSS properties (no `style` attribute injection, no CSS `attr()` with user data); all dynamic styling via class toggling or `setProperty` with controlled values.

#### Recommended refactor order (value/effort)
1. **Move `--z-*` variables to `variables.css`** â€” Low value, ~15 min. Eliminates the hidden cross-file dependency.
2. **Replace hardcoded z-index integers with named variables** â€” Low value, ~30 min. Makes the stacking-context contract explicit and prevents future layering bugs.
3. **Delete commented-out `--accent-primary`** â€” ~30 seconds.

---

## Tier 3 â€” Deep dives on hot spots
_Pending until Tiers 1 & 2 complete._

---

## Findings index

### Open findings

| Sev | File:Line | Hook |
|-----|-----------|------|
| Medium | `gdrive-auth.js` | OAuth token in plain localStorage (mitigated by fixing XSS) |
| Low | `index.html` | No CSP meta tag |
| Low | `keyboard-core.js:619` | 500ms polling for input visibility â€” could be event-driven |
| Low | `app.js:221` | SW update interval never cleared (page-lifetime singleton) |
| Low | `storage-api.js:30,90` | setItem/setJSON return bool â€” caller can't distinguish error type |
| Low | `voxglk.js`, `game-output.js`, `tts-player.js` | Lazy imports in hot paths â€” could be static |
| Low | various | `window.*` used as cross-module signal channel |
| Medium | `core/state.js` | 98 props, kitchen-sink â€” consider nesting by subsystem |
| Low | `app.js:1486-1537` | Keyboard shortcuts as if-cascade; could be a Map dispatcher |
| Low | `core/dom.js:103-118` | `validateDOM()` couples to HTML structure (acceptable; awareness) |
| ~~High~~ DONE | `voxglk.js` | `createVoxGlk()` closure split: watchdog (v1.5.228), grid (v1.5.229), bootstrap (v1.5.231) |
| ~~High~~ DONE | `voxglk.js:14-45` | 22 module-level `let` decls wrapped in `const s = {...}` state object â€" v1.5.245 |
| Medium | `voxglk.js:612` | Status-bar change detection compares HTML strings â€” use plain text |
| ~~Medium~~ DONE | `game-loader.js:381-444` | Recently-played UI rendering moved to `ui/recently-played.js` â€" v1.5.251 |
| Medium | `voxglk-renderer.js:59-74` | Dead fallback for missing `persistentWindows` â€” tighten signature |
| ~~Medium~~ DONE | `voxglk.js:552-599` | Char-mode grid reconstruction â€” extracted to `voxglk-grid.js` (v1.5.229) |
| Low | `voxglk.js:1088-1090` | `isSafeToSave()` misleading name for charâ†’line transition guard |
| Low | `voxglk.js:974-1053` | `sendInput()` lacks defensive re-check on `acceptCallback` |
| ~~Medium~~ DONE | `save-manager.js:102-222,230-310` | `exportMapState()`/`importMapState()` added to map-canvas.js; save-manager delegates map structure knowledge â€” v1.5.247 |
| ~~Medium~~ DONE | `save-manager.js:1008-1079` | `initSaveHandlers()` moved to `settings-panel.js`; `closeSettings` import removed from save-manager â€" v1.5.248 |
| Low | `save-manager.js:626` | `performRestore()` mutates `state.skipNarrationAfterLoad` â€” couples save to narration state |
| Low | `save-manager.js:82-84` | `limitHTMLHistory` silently drops text before first tag at truncation boundary |
| ~~Medium~~ DONE | `command-router.js:339`, `meta-command-handlers.js:21` | `respondAsGame()` defined identically in both files â€” `meta-command-handlers.js` now imports from `respond-as-game.js` v1.5.243 |
| ~~Medium~~ DONE | `meta-command-handlers.js:224-273` vs `380-458` | `validateSaveName()` helper extracted in v1.5.243; both handlers ~10 lines each |
| ~~Medium~~ DONE | `meta-command-handlers.js` (both save handlers) | `MAX_SAVES = 5` limit restored in v1.5.234 |
| Low | `save-list-formatter.js:21,55,73` | Direct `JSON.parse` without try/catch â€” use `getJSON` from storage-api |
| Low | `meta-command-handlers.js:300-314` | `handleRestoreResponse` uses `window.state.currentGameName` â€” use imported `state` |
| ~~Low~~ DONE | `command-router.js:493-510` | `waitForInputAndContinue()` unexported, never called â€” deleted v1.5.243 |
| ~~Low~~ DONE | `command-router.js:484-487` | `sendCommand()` empty no-op, re-exported, app.js imports but never calls â€” deleted v1.5.243 |
| ~~Medium~~ DONE | `data-management-ui.js:18-53` | `isOnWelcomeScreen()` + `getGameDisplayName()` exact-copy from settings-panel.js â€” deleted local copies, imports from settings-panel.js v1.5.243 |
| ~~Medium~~ DONE | `settings-panel.js:171-281` | `showBackupSavesDialog()` + `restoreBackup()` moved to `ui/backup-saves-dialog.js` â€” v1.5.253 |
| Medium | `data-management-ui.js:62-190` | Delete-all-data logic ~45-line duplicate between two button handlers |
| Low | `data-management-ui.js:112,130` | `alert()` for post-deletion feedback â€” use `confirmDialog({okOnly:true})` |
| Low | `voice-selection.js:217-219` | `populateVoiceDropdown()` retries indefinitely if voices never load |
| Low | `gdrive-ui.js:131` | `iftalk_gdrive_folder_id` stores `'path:...'` string â€” key name implies an ID, not a path |
| Low | `voice-selection.js:276` | `loadBrowserVoiceConfig()` marked async but awaits nothing |
| Low | `voice-selection.js:206` | `â˜…` iOS-preferred marker shown on all platforms, not just iOS |
| ~~Medium~~ DONE | `map-sheet.js:344` | XSS via node names fixed in v1.5.234 â€” `escapeHtml(c.node.name)` |
| ~~Medium~~ DONE | `map-canvas.js:1553-1569` | Inline `directionOffsets` table replaced with `COMMAND_DIRECTIONS`/`DIRECTION_OFFSETS` from map-config.js â€" v1.5.252 |
| ~~Medium~~ DONE | `map-sheet.js:544-569, 704-729` | `transferEdges(sourceId, targetId)` extracted; both merge functions call it â€” v1.5.246 |
| Medium | `map-canvas.js:1870` | `syncMapFromAutoMapper` calls `JSON.parse` without try/catch â€” use `getJSON` |
| ~~Low~~ DONE | `map-canvas.js:546` | `window.getCurrentLocation` used in `toggleAutoMap` â€” replaced with direct import v1.5.243 |
| ~~Low~~ DONE | `map-handlers.js:250` | `hideFab()` defined, exported, and never called â€” deleted v1.5.243 |
| Low | `map-canvas.js:1153` | `cancelOnboarding(currentToast)` parameter shadows module-level `currentToast` variable |
| Low | `map-canvas.js:1031` | `TOAST_STORAGE_KEY` inline constant â€” should live in `map-config.js` alongside `FIRST_USE_KEY` |
| Low | `auto-mapper.js:68-138` | 70-line commented-out v5 VM-memory block â€” git history is the reference; delete it |
| Low | `map-sheet.js:149` | `openNodeSheet` badges manual nodes (`isManual: true`) as `'Auto-mapped'` initially |
| ~~High~~ DONE | `tts-player.js:55` | MediaSession `play` fixed in v1.5.235 â€” now calls `speakTextChunked` directly |
| ~~Medium~~ DONE | `chunking.js:183-223` | `getGlkClass()` helper extracted in v1.5.236 |
| ~~Low~~ DONE | `navigation.js:178-193` | `skipToEnd` `stopKeepAlive` added in v1.5.235 |
| ~~Low~~ DONE | `chunking.js:257` | Intent comment added to empty catch in v1.5.235 |
| ~~Low~~ DONE | `chunking.js:186-202` | `while/break` rewritten as `if` in v1.5.235 |
| ~~Low~~ DONE | `tts-player.js:223` | `text` param renamed to `_text` in v1.5.236 |
| ~~Low~~ DONE | `highlighting.js:156-168` | `chunkHighlighted` debug event removed in v1.5.236 |
| ~~Low~~ DONE | `highlighting.js:127` | `removeHighlight` + `scrollToHighlightedText` now use `dom.gameOutput` (v1.5.236) |
| ~~Low~~ DONE | `highlighting.js:14-16` | `initScrollDetection()` deleted from highlighting.js and app.js in v1.5.235 |
| ~~Medium~~ DONE | `recognition.js:395-431,462-495,764-790` | `dispatchRecognized(transcript, confidence, stopAfter)` extracted as closure in `initVoiceRecognition` â€” v1.5.249 |
| ~~Medium~~ DONE | `recognition.js:581-584`, `voice-commands.js:170-175` | `NAVIGATION_COMMANDS`/`SKIP_N_PATTERN`/`BACK_N_PATTERN` exported from voice-commands.js; recognition.js imports them â€” v1.5.246 |
| Low | `recognition.js:217` | Empty catch in `displayInterimAsLowConfidence` lacks intent comment |
| Low | `recognition.js:699-712` | `setTimeout(fn,0)` final dispatch inconsistent with direct-call paths â€” document or remove |
| Low | `command-handlers.js:170,225` | `document.getElementById('messageInput')` direct query â€” use `dom.userInput` |
| Low | `command-handlers.js:162,186` | `icon2` re-queries `dom.muteBtn` icon in unmute error path â€” reuse `icon` already in scope |
| Low | `voice-commands.js:33,55` | `gronkâ†’grunk` in both regex and PRONUNCIATION_DICT â€” dict entry is dead; remove it |
| Low | `voice-commands.js:191,194,214,218` | voxglk.js imported 4Ã— in `processVoiceKeywords` â€” consolidate to one import |
| Low | `voice-meter.js:15` | `startVoiceMeter()` lacks double-call guard â€” rapid calls orphan MediaStream tracks |
| Low | `voice-meter.js:63` | Silent catch on getUserMedia failure lacks intent comment |
| ~~Low~~ DONE | `voice-meter.js:78-84` | `stopVoiceMeter` resets soundPauseTimeout/soundDetected/pausedForSound â€” vestigial; deleted v1.5.243 |
| ~~Medium~~ DONE | `keyboard-core.js:52-662` | `populateInputWithWord`, `handleTouchStart`, `handleGameClick`, `handleGameMouseMove` extracted to module level; `DIRECTIONS`, `COMMON_VERBS`, `highlightOverlay`, `tapExamineTouchTracker`, `lowerWindowEl`, `gameOutputEl` promoted to module scope â€” v1.5.250 |
| Low | `keyboard-core.js:398,532` | `localStorage.getItem('iftalk_tap_to_examine')` in hot-path handlers â€” use body class `tap-to-examine-enabled` instead |
| Low | `keyboard-core.js:756-757,767-768` | Two disabled `scrollToBottom()` calls with "testing" comments â€” decide and delete |
| Low | `keyboard-core.js:789-792` | `updateClearButtonVisibility()` no-op with 3 internal call sites â€” delete all |
| ~~Low~~ DONE | `keyboard-core.js:900-901` | `if (cmd \|\| cmd === '')` always true for `.trim()` result â€” removed, body unconditional v1.5.243 |
| ~~Low~~ DONE | `keyboard-core.js:466` | `currentHighlightedWord` written but never read â€” deleted v1.5.243 |
| Low | `voice-ui.js:8-9` | `voiceListeningIndicatorEl`/`voiceTranscriptEl` duplicate `dom.voiceListeningIndicator`/`dom.voiceTranscript` â€” use `dom.*` refs; `initVoiceUI` becomes removable |
| ~~High~~ DONE | `sync-preview-modal.js:413` | `updateProgress` XSS â€” `currentItem.name`/`statusText` unescaped in `insertAdjacentHTML` â€” fixed v1.5.239 |
| ~~Medium~~ DONE | `game-output.js:242-243` | `lastSentCommand` RegExp injection fixed v1.5.242 â€” `escapeRegExp()` added to text-processing.js |
| ~~Medium~~ DONE | `scroll-down-button.js:initScrollDownButton` | `releasePressedState(button)` + `cancelInteractions()` extracted â€” v1.5.246 |
| Low | `history.js:28,37,43,63` | `alert()` for history display â€” same pattern as Batch 5 |
| ~~Low~~ DONE | `nav-buttons.js:51-53` | Empty `if (narrationChunks.length > 0) {}` debug block â€” deleted v1.5.243 |
| Low | `mobile-menu.js:135-158` | `toggleMenu`/`closeMenu` re-query 3 DOM elements on every call â€” promote to module-level |
| Low | `sync-preview-modal.js:237-261` | `formatTimestamp()` defined but never called â€” dead function |
| ~~Low~~ DONE | `game-output.js:125-126` | Empty `else if (!shouldIncludeStatus) {}` block â€” deleted v1.5.243 |
| Low | `game-output.js:315` | Empty catch on auto-narration of system messages â€” add intent comment |
| ~~Medium~~ DONE | `text-processing.js:102-115` | `processAndSplitText` reimplements `processTextForTTS` normalization verbatim â€” replaced with `processTextForTTS(text)` call v1.5.246 |
| ~~Medium~~ DONE | `pronunciation.js:51-54` | Pronunciation key RegExp injection fixed v1.5.242 â€” `escapeRegExp()` from text-processing.js |
| Low | `gdrive-auth.js:45`, `gdrive-sync.js:82,159,175`, `gdrive-sync-preview.js:85,249` | 6Ã— bare `JSON.parse(localStorage.getItem(...))` without try/catch â€” use `getJSON` |
| Low | `audio-feedback.js:256` | `new Promise(async executor)` anti-pattern in `playSystemBeep` â€” rewrite as `async function` |
| Low | `gdrive-api.js:69` | `folderName` interpolated into Drive API query string â€” unescaped `'` breaks query syntax |
| Low | `lock-screen.js:83-88,154-158` | `isKeepAwakeEnabled` accessed via dynamic import despite `wake-lock.js` being statically imported |
| Low | `lock-screen.js:459-489` | 8 no-op compatibility shims still exported and called from callers â€” remove |
| Low | `pwa-updater.js:189,196,201,206,210,241` | `alert()` calls in update check/iOS install flow â€” use `confirmDialog` |
| Low | `map-canvas.css:8-21` | `--z-controls` and other `--z-*` vars defined in component file; should live in `variables.css` |
| Low | `lock-screen.css`, `base.css`, `modals.css`, `sync-preview.css`, `settings.css`, `welcome.css` | ~20 hardcoded z-index integers â€” extend named `--z-*` variable system to cover all layers |
| ~~Low~~ DONE | `variables.css:10` | Commented-out `--accent-primary: #aec8ff;` â€” deleted v1.5.243 |

### Fixed
- **v1.5.222 (commit 4b73a06)** â€” 3 High security (XSS via save HTML and save names), 2 Medium quota errors (silent failures on import/backup), 3 Medium dead-code (`.bak` files, orphan temp, dead debug branch).
- **v1.5.223 (commit 6ea0eea)** â€” 8 Low: duplicate `escapeHtml` consolidated, stale TODO/commented block deleted, intent comments on 3 empty catches, `console.warn`â†’`console.error` on 5 real-error sites, compression error context, `printStorageReport` collapsed to `console.group`+`console.table`, TTS safety-timeout self-healing comment, map resize listener gated on `isVisible`.
- **v1.5.226 (commit 21d40cf)** â€” 1 High + 1 Medium + 2 Low: extracted `voiceCommandHandlers` (~330 lines) + shared `pausePlayback`/`resumePlayback` to `voice/command-handlers.js`; deleted 5 dead `if (false &&)` mic auto-mute blocks; killed the `command-router.js` entry-point cycle (now static import). app.js -447 lines.
- **v1.5.227 (commit f0fa1ac)** â€” 1 Medium: extracted PWA logic (SW reg, update notification, install prompt, standalone/iOS detection) to `utils/pwa-updater.js` with one `initPWA()` export. app.js -315 lines.
- **v1.5.230** â€” 1 High: phase-split `initApp()` (798 lines) into 7 private coordinator functions (`initViewport`, `initDOMandValidation`, `initVoice`, `initUIComponents`, `wireEventListeners`, `wireKeyboardShortcuts`, `wireLifecycle`). `initApp()` reduced to 9-line thin coordinator. All phases kept in `app.js`.
- **v1.5.233 (commit deb2998)** â€” Batch 6 review doc (4 Medium, 6 Low findings). Import path fixes: `resetRepairFlag`/`performRepair` now imported from `voxglk-watchdog.js`.
- **v1.5.234** â€” 1 Medium security (XSS in `map-sheet.js:344` â€” `escapeHtml(c.node.name)` in connections list); 1 Medium regression (`MAX_SAVES = 5` restored in both save handlers in `meta-command-handlers.js`). Batch 7 review doc (1 High, 1 Medium, 8 Low findings).
- **v1.5.235** â€” 1 High fix (MediaSession `play` action: replaced broken `nav.resumeNarration()` dynamic import with direct `speakTextChunked` call â€” lock screen play now works); 4 Low: `stopKeepAlive()` added to `skipToEnd`, intent comment on empty catch in `insertRealMarkersAtIDs`, `while/break` â†’ `if` in sibling Glk-class check, deleted `initScrollDetection` no-op from `highlighting.js` + `app.js`.
- **v1.5.236** â€” 1 Medium: extracted `getGlkClass(textNode, container)` helper from `insertRealMarkersAtIDs` â€” removes 26-line inline detection block; 3 Low: renamed `text` â†’ `_text` in `speakTextChunked`, removed `chunkHighlighted` debug event from hot narration path, `removeHighlight`/`scrollToHighlightedText` now use `dom.gameOutput` instead of raw `getElementById`.
- **v1.5.237** â€” Batch 8 review doc: `voice/` (2 Medium, 9 Low findings). No code changes this pass.
- **v1.5.238** â€” Batch 9 review doc: `input/` (1 Medium, 7 Low findings). No code changes this pass.
- **v1.5.239** â€” Batch 10 review doc: `ui/` (1 High, 2 Medium, 6 Low findings). 1 High fix: `escapeHtml` on `currentItem.name`/`currentItem.statusText` in `sync-preview-modal.updateProgress` (`insertAdjacentHTML` XSS â€” same class as Batch 1 fix).
- **v1.5.240** â€” Batch 11 review doc: `utils/` (2 Medium, 7 Low findings). No code changes this pass.
- **v1.5.241** â€” Batch 12 review doc: CSS pass (0 Medium, 3 Low findings). No code changes this pass. All Tier 2 module-by-module review complete.
- **v1.5.242** â€” 2 Medium runtime bugs: added `escapeRegExp()` to `utils/text-processing.js`; escaped `lastSentCommand` before `new RegExp` in `game-output.js` (commands with `[`, `(`, `*` no longer throw SyntaxError); escaped pronunciation map keys in `pronunciation.js` (user-entered words with metacharacters no longer break the entire pronunciation pass).
- **v1.5.250** â€” 1 Medium: `keyboard-core.js` tap-to-examine closures extracted to module level — `populateInputWithWord`, `handleTouchStart`, `handleGameClick`, `handleGameMouseMove` are now named functions; `DIRECTIONS`, `COMMON_VERBS`, `highlightOverlay`, `tapExamineTouchTracker`, `lowerWindowEl`, `gameOutputEl` promoted to module scope. `initKeyboardInput()` is now pure event-listener wiring.
- **v1.5.249** â€” 1 Medium: `dispatchRecognized(transcript, confidence, stopAfter)` extracted as closure inside `initVoiceRecognition` — replaces 3 identical 15-line process-and-dispatch blocks across the INSTANT_NO_WAIT path, the delayed-instant timeout, and the `onend` handler.
- **v1.5.248** â€” 1 Medium: `initSaveHandlers()` moved from `save-manager.js` to `settings-panel.js` — UI event wiring now lives in the UI layer. `closeSettings` import removed from save-manager (no longer imports from settings layer at all). `getItem` import removed from save-manager (was only used by the moved function). app.js import updated.
- **v1.5.247** â€” 1 Medium: `exportMapState(gameName)` + `importMapState(optimizedData, gameName)` added to `map-canvas.js` — map canvas key name (`iftalk_map_${gameName}`) and node/edge optimization logic now live in the map module. `getOptimizedMapData` in save-manager shrinks from 90 to 24 lines; `restoreMapData` from 80 to 28 lines.
- **v1.5.246** â€” 4 Medium deduplication fixes: (1) `processAndSplitText` normalized by calling `processTextForTTS()` â€” deleted 15-line duplicate block; (2) `NAVIGATION_COMMANDS`/`SKIP_N_PATTERN`/`BACK_N_PATTERN` promoted to module-level exports in `voice-commands.js` â€” `recognition.js` now imports them instead of redefining; (3) `releasePressedState(button)` + `cancelInteractions()` extracted in `scroll-down-button.js` â€” removes ~50 lines of repetition; (4) `transferEdges(sourceId, targetId)` extracted in `map-sheet.js` â€” `handleNodeMerge` and `performManualMerge` each call it instead of having identical 30-line edge-transfer blocks.
- **v1.5.253** â€” 1 Medium: `showBackupSavesDialog()` + `restoreBackup()` extracted from `settings-panel.js` to `ui/backup-saves-dialog.js`. settings-panel.js imports the single `showBackupSavesDialog` export; `restoreBackup` is now private to the new module.
- **v1.5.252** â€” 1 Medium: inline `directionOffsets` table in `syncFromAutoMapper` replaced with `COMMAND_DIRECTIONS[cmd]`â†'`DIRECTION_OFFSETS[canonical]` lookups. Deleted the 16-key duplicate table and the redundant `directionalCommands` array. `recentDirections` now stores canonical names.
- **v1.5.251** â€” 1 Medium: recently-played UI extracted from `game-loader.js` to `ui/recently-played.js` â€” `renderRecentlyPlayedSection`, `showResumeDialog`, `showLoadingOverlay`, `trackCustomGame`, `removeCustomGame`, `getCustomGamesWithAutosaves`, `PREDEFINED_GAMES`. `startGame` passed as a parameter to break the circular import. `game-loader.js` is now pure orchestration.
- **v1.5.245** â€” 1 High: wrapped 15 module-level `let`/`var` declarations in `voxglk.js` into a `const s = {...}` state object with lifecycle comments indicating which fields reset per-game vs per-turn vs never. Also `v1.5.244`: fixed missing resets in `init()` for `previousInputType`, `justExitedCharMode`, `lastCharModePlainText`.
- **v1.5.243** â€” Dead code sweep: 10 Low + 2 Medium findings. 10 Low: deleted `waitForInputAndContinue()` and `sendCommand()` (+ index.js export + app.js import); removed empty debug block in `nav-buttons.js`; removed empty `else if` in `game-output.js`; removed always-true `if (cmd || cmd === '')` guard in `keyboard-core.js`; deleted dead `currentHighlightedWord` variable and assignments; removed vestigial `soundPauseTimeout`/`soundDetected`/`pausedForSound` resets from `stopVoiceMeter`; deleted commented-out `--accent-primary` in `variables.css`; deleted `hideFab()` dead export from `map-handlers.js`; replaced `window.getCurrentLocation ?` guard with direct import call in `map-canvas.js`. 2 Medium: `meta-command-handlers.js` now imports `respondAsGame` from `ui/respond-as-game.js` (deleted local copy); `validateSaveName()` helper extracted from `handleSaveResponse`; `data-management-ui.js` now imports `isOnWelcomeScreen`/`getGameDisplayName` from `settings-panel.js` (deleted local copies).
