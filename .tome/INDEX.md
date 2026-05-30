# Tome

Per-project knowledge base. Curated by the `/tome` skill.
Each entry: one `.md` file with YAML frontmatter (title, tags, created, updated, aliases).
Invoke: `/tome <topic>` to search · `/tome <statement>` to save.

## Entries

- [manage-saves-modal](manage-saves-modal.md) — Manage Saves modal design: flat rows, portal dropdown, backup expand, Drive menu states (ui, saves, modal, gdrive) — updated 2026-05-14
- [drive-sync-design](drive-sync-design.md) — appMoveCount for conflict detection; false-conflict fix; two-column sync UI (gdrive, sync, design, move-count) — updated 2026-05-30
- [dev-gotchas](dev-gotchas.md) — ES module cache busting, SW unregister hazard, async console gotcha (dev, debugging, cache) — updated 2026-05-14
- [ui-conventions](ui-conventions.md) — Sentence case for labels; 44px min touch targets for all interactive elements (ui, design, accessibility, mobile) — updated 2026-05-13

- [ptt-recognition-races](ptt-recognition-races.md) — PTT/recognition async race conditions: hasProcessedResult, mute lockout, background loop, AudioContext (voice, ptt, recognition, race-condition) — updated 2026-05-11
- [narration-module-quirks](narration-module-quirks.md) — MediaSession play must call speakTextChunked directly; skipToEnd bypasses stopNarration (narration, tts, cycles) — updated 2026-04-27
- [pak-char-mode-narration](pak-char-mode-narration.md) — PAK/menu narration: cleanCharModeText column-gap split, chunks built in handleGameOutput so play/read-page get pauses, no highlighting (narration, tts, char-mode, pak) — updated 2026-05-30
- [save-restore-paradigm](save-restore-paradigm.md) — DESIGN NOTE: shared root of bootstrap bug class (two systems, one restore); 3 options — #1 full snapshot (deferred, version-fragile), #2 prompt-boundary restore (blocked on ifvms), #3 own input plumbing (small, consolidation not a guarantee); none scheduled (zvm, save-restore, design, architecture) — updated 2026-05-30
- [text-decode-corruption](text-decode-corruption.md) — FIXED v1.5.409: "the"→"tv2" abbreviation corruption = first post-restore line command written to stale read_data.bufaddr (63), clobbering Theatre's abbrev strings at 0x40; fixed by setting read_data.bufaddr=seededAddr in sendInput() at submit time (NOT performRestore — resuming aread resets it) (zvm, save-restore, corruption, fixed) — updated 2026-05-30
- [openai-tts-pipeline](openai-tts-pipeline.md) — Cache API persistence, prefetch pipeline gap at chunk 1, long-chunk latency, cost tracking (narration, tts, openai, cache, prefetch) — updated 2026-05-28
- [xss-vectors](xss-vectors.md) — Known XSS vectors: all 4 now fixed (saves + map node names) (security, xss, map) — updated 2026-04-27
- [browser-testing-games](browser-testing-games.md) — Which games to use for browser testing (9:05 good, Lost Pig bad for movement) (testing, games, webagent) — updated 2026-04-26

- [app-init-phases](app-init-phases.md) — initApp() 7-phase split; ordering deps; why phases stay in app.js (app, init, architecture) — updated 2026-04-26
- [bootstrap-restore-flow](bootstrap-restore-flow.md) — two-system restore invariant, char code=line length insight, 'l' seed fix, glkapi/ZVM bufaddr mismatch fix (zvm, save-restore, voxglk) — updated 2026-05-28
- [parchment-vs-iftalk-engine](parchment-vs-iftalk-engine.md) — Parchment uses bocfel (WASM), not ifvms.js; bufaddr bug is ifvms-specific; nothing to copy from Parchment (zvm, bocfel, parchment, architecture) — updated 2026-05-28
- [quetzal-restore-globals](quetzal-restore-globals.md) — restore_file fixes header but not game globals; perpetuation cycle; CMem decode technique (zvm, save-restore, quetzal, screen-width) — updated 2026-05-09
- [watchdog-repair-flow](watchdog-repair-flow.md) — 5s VM-hang detection + manual REPAIR recovery flow (zvm, watchdog, recovery) — updated 2026-04-26
- [mic-narration-coupling](mic-narration-coupling.md) — Mic state and narration state are independent; vestigial `if (false &&)` clusters (voice, narration, design) — updated 2026-04-26
- [save-system](save-system.md) — Autosave vs quicksave semantics; storage layout; restore injects HTML directly so must invalidate narration chunks (v1.5.407); restore-debug + SW-cache notes (save, restore, design) — updated 2026-05-30
- [snapshot-pollution-pattern](snapshot-pollution-pattern.md) — `inert`+`aria-hidden` for hidden panels; why both are needed (accessibility, testing, ui-pattern) — updated 2026-04-26
- [home-screen-and-quirks](home-screen-and-quirks.md) — Home-screen UI; F5/port/autosave-vs-quicksave gotchas (ui, gotchas) — updated 2026-04-26
