# Tome

Per-project knowledge base. Curated by the `/tome` skill.
Each entry: one `.md` file with YAML frontmatter (title, tags, created, updated, aliases).
Invoke: `/tome <topic>` to search · `/tome <statement>` to save.

## Entries

- [gdrive-auth-strategy](gdrive-auth-strategy.md) — Lazy on-demand token refresh; proactive timer removed (v1.5.470) because it flickered & relied on the same long-lived session cookie anyway (gdrive, auth, oauth, design) — updated 2026-06-03
- [manage-saves-modal](manage-saves-modal.md) — Manage Saves modal design: flat rows, portal dropdown, backup expand, Drive menu states (ui, saves, modal, gdrive) — updated 2026-05-14
- [drive-sync-design](drive-sync-design.md) — appMoveCount for conflict detection; false-conflict fix; two-column sync UI (gdrive, sync, design, move-count) — updated 2026-05-30
- [dev-gotchas](dev-gotchas.md) — ES module cache busting, SW unregister hazard, async console gotcha (dev, debugging, cache) — updated 2026-05-14
- [ui-conventions](ui-conventions.md) — Sentence case for labels; 44px min touch targets; alert()/confirm() are no-ops in iOS standalone PWA, use confirmDialog (ui, design, accessibility, mobile, ios) — updated 2026-06-09

- [ptt-recognition-races](ptt-recognition-races.md) — PTT/recognition async race conditions: hasProcessedResult, mute lockout, background loop, AudioContext, conv-button/lock-button vs PTT (voice, ptt, recognition, race-condition) — updated 2026-06-09
- [narration-module-quirks](narration-module-quirks.md) — MediaSession play must call speakTextChunked directly; skipToEnd bypasses stopNarration (narration, tts, cycles) — updated 2026-04-27
- [pak-char-mode-narration](pak-char-mode-narration.md) — PAK/menu narration: cleanCharModeText column-gap split, chunks built in handleGameOutput so play/read-page get pauses, no highlighting (narration, tts, char-mode, pak) — updated 2026-05-30
- [save-restore-paradigm](save-restore-paradigm.md) — DESIGN NOTE: shared root of bootstrap bug class (two systems, one restore); 3 options — #1 full snapshot (deferred, version-fragile), #2 prompt-boundary restore (blocked on ifvms), #3 own input plumbing (small, consolidation not a guarantee); none scheduled (zvm, save-restore, design, architecture) — updated 2026-05-30
- [text-decode-corruption](text-decode-corruption.md) — FIXED v1.5.409: "the"→"tv2" abbreviation corruption = first post-restore line command written to stale read_data.bufaddr (63), clobbering Theatre's abbrev strings at 0x40; fixed by setting read_data.bufaddr=seededAddr in sendInput() at submit time (NOT performRestore — resuming aread resets it) (zvm, save-restore, corruption, fixed) — updated 2026-05-30
- [openai-tts-pipeline](openai-tts-pipeline.md) — Cache API persistence, prefetch pipeline gap at chunk 1, long-chunk latency, cost tracking (narration, tts, openai, cache, prefetch) — updated 2026-05-28
- [xss-vectors](xss-vectors.md) — Known XSS vectors: all 5 fixed (saves, map node names, sync modals ×2) (security, xss, map) — updated 2026-06-12
- [hints-system-design](hints-system-design.md) — App-observed location vocab; getLastLocationName module-only; verified flag; local-only reveal state; lazy-load race condition fix (hints, uhs, design, auto-mapper) — updated 2026-06-12
- [browser-testing-games](browser-testing-games.md) — Which games to use for browser testing (9:05 good, Lost Pig bad for movement) (testing, games, webagent) — updated 2026-04-26

- [app-init-phases](app-init-phases.md) — initApp() 7-phase split; ordering deps; why phases stay in app.js (app, init, architecture) — updated 2026-04-26
- [bootstrap-restore-flow](bootstrap-restore-flow.md) — two-system restore invariant, char code=line length insight, 'l' seed fix, glkapi/ZVM bufaddr mismatch fix (zvm, save-restore, voxglk) — updated 2026-05-28
- [parchment-vs-iftalk-engine](parchment-vs-iftalk-engine.md) — Parchment uses bocfel (WASM), not ifvms.js; bufaddr bug is ifvms-specific; nothing to copy from Parchment (zvm, bocfel, parchment, architecture) — updated 2026-05-28
- [quetzal-restore-globals](quetzal-restore-globals.md) — restore_file fixes header but not game globals; perpetuation cycle; CMem decode; chunk-delimiter textContent gotcha (zvm, save-restore, quetzal, screen-width) — updated 2026-05-31
- [watchdog-repair-flow](watchdog-repair-flow.md) — 5s VM-hang detection + manual REPAIR recovery flow (zvm, watchdog, recovery) — updated 2026-04-26
- [mic-narration-coupling](mic-narration-coupling.md) — Mic state and narration state are independent; vestigial `if (false &&)` clusters (voice, narration, design) — updated 2026-04-26
- [save-system](save-system.md) — Autosave vs quicksave semantics; storage layout; map restore clears localStorage; restore injects HTML so must invalidate narration chunks; MAX_SAVES regression resolved; restore-debug + SW-cache notes (save, restore, design) — updated 2026-06-12
- [snapshot-pollution-pattern](snapshot-pollution-pattern.md) — `inert`+`aria-hidden` for hidden panels; why both are needed (accessibility, testing, ui-pattern) — updated 2026-04-26
- [home-screen-and-quirks](home-screen-and-quirks.md) — Home-screen UI; F5/port/autosave-vs-quicksave gotchas (ui, gotchas) — updated 2026-04-26
- [map-undo-snapshots](map-undo-snapshots.md) — Map undo/redo is full-state snapshots (not deltas); memory-only, never serialized; lazy-first-change capture to keep LIFO order; auto-mapper intentionally excluded (map-canvas, undo, redo, design) — updated 2026-05-31
- [map-multiselect](map-multiselect.md) — Multi-select design: selectedNodes vs selectedNode, select mode, rect-select, group drag, wasSelectAction flag (map-canvas, multi-select, design) — updated 2026-06-01
- [automap-two-build-paths](automap-two-build-paths.md) — Auto-map builds via two paths (live handleLocationChange vs syncFromAutoMapper replay) that must stay in parity; reverse-portal-upgrade bug (v1.5.471); lazy-load means no live mapping before first map open (map-canvas, auto-mapper, architecture, gotcha) — updated 2026-06-03
- [automap-never-overrides-user-edits](automap-never-overrides-user-edits.md) — Hard invariant: auto-mapping can add/adjust untouched nodes/edges but must never override a user edit; enforced via isEdited + protectedEdges/deletedEdges; new bent-path code must guard the same way in both build paths (map-canvas, auto-mapper, invariant) — updated 2026-06-03
- [automap-bent-paths](automap-bent-paths.md) — Non-reciprocal connections (Anchorhead se↔sw): one edge carries command + reverseCommand (set when player walks back), bent = both cardinal & non-opposite, rendered as a rim-anchored Bézier curve; Exits list has a per-row direction picker; replay edge-create guard tightened to suppress duplicate reverse edge (map-canvas, auto-mapper, rendering, design) — updated 2026-06-04
- [service-worker-update-model](service-worker-update-model.md) — controllerchange→reload v1.5.510; alert()→confirmDialog v1.5.512; Check for Updates forces cache-busted re-register v1.5.515 (pwa, service-worker, update, cache, design, ios) — updated 2026-06-09
- [ios-web-audio-silent-mode](ios-web-audio-silent-mode.md) — Raw Web Audio API (AudioContext/oscillators) bypasses iOS Ring/Silent switch AND volume buttons (separate audio session from speechSynthesis/<audio>); fixed v1.5.490 by looping a silent <audio> element to coerce the page into the standard media session (audio, ios, web-audio-api, gotcha, fixed) — updated 2026-06-07
- [upper-window-fit](upper-window-fit.md) — Upper-window TEXT_GRID (Bronze compass) fits width in 2 layers: CSS --grid-template shrinks only EMPTY columns (minmax(0,1ch)) keeping chars full size; fitUpperWindow() font-scales as last resort. Never reflows/scrolls; mobile collapse scoped to .single-line only (rendering, mobile, css, voxglk, status-bar) — updated 2026-06-06
