# Tome

Per-project knowledge base. Curated by the `/tome` skill.
Each entry: one `.md` file with YAML frontmatter (title, tags, created, updated, aliases).
Invoke: `/tome <topic>` to search · `/tome <statement>` to save.

## Entries

- [manage-saves-modal](manage-saves-modal.md) — Manage Saves modal design: flat rows, portal dropdown, backup expand, Drive menu states (ui, saves, modal, gdrive) — updated 2026-05-14
- [drive-sync-design](drive-sync-design.md) — Timestamp ≠ progress; two-column sync UI; conflict defaults to skip (gdrive, sync, design) — updated 2026-05-14
- [dev-gotchas](dev-gotchas.md) — ES module cache busting, SW unregister hazard, async console gotcha (dev, debugging, cache) — updated 2026-05-14
- [ui-conventions](ui-conventions.md) — Sentence case for labels; 44px min touch targets for all interactive elements (ui, design, accessibility, mobile) — updated 2026-05-13

- [ptt-recognition-races](ptt-recognition-races.md) — PTT/recognition async race conditions: hasProcessedResult, mute lockout, background loop, AudioContext (voice, ptt, recognition, race-condition) — updated 2026-05-11
- [narration-module-quirks](narration-module-quirks.md) — MediaSession play must call speakTextChunked directly; skipToEnd bypasses stopNarration (narration, tts, cycles) — updated 2026-04-27
- [xss-vectors](xss-vectors.md) — Known XSS vectors: all 4 now fixed (saves + map node names) (security, xss, map) — updated 2026-04-27
- [browser-testing-games](browser-testing-games.md) — Which games to use for browser testing (9:05 good, Lost Pig bad for movement) (testing, games, webagent) — updated 2026-04-26

- [app-init-phases](app-init-phases.md) — initApp() 7-phase split; ordering deps; why phases stay in app.js (app, init, architecture) — updated 2026-04-26
- [bootstrap-restore-flow](bootstrap-restore-flow.md) — two-system restore invariant, char code=line length insight, 'l' seed fix, disambiguation heuristic (zvm, save-restore, voxglk) — updated 2026-05-09
- [quetzal-restore-globals](quetzal-restore-globals.md) — restore_file fixes header but not game globals; perpetuation cycle; CMem decode technique (zvm, save-restore, quetzal, screen-width) — updated 2026-05-09
- [watchdog-repair-flow](watchdog-repair-flow.md) — 5s VM-hang detection + manual REPAIR recovery flow (zvm, watchdog, recovery) — updated 2026-04-26
- [mic-narration-coupling](mic-narration-coupling.md) — Mic state and narration state are independent; vestigial `if (false &&)` clusters (voice, narration, design) — updated 2026-04-26
- [save-system](save-system.md) — Autosave vs quicksave semantics; storage layout; bootstrap bugs all fixed (v1.5.268) (save, restore, design) — updated 2026-05-09
- [snapshot-pollution-pattern](snapshot-pollution-pattern.md) — `inert`+`aria-hidden` for hidden panels; why both are needed (accessibility, testing, ui-pattern) — updated 2026-04-26
- [home-screen-and-quirks](home-screen-and-quirks.md) — Home-screen UI; F5/port/autosave-vs-quicksave gotchas (ui, gotchas) — updated 2026-04-26
