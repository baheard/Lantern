# Save/Restore Migration Plan — custom Quetzal+bootstrap → engine `do_autorestore`

**Status:** planned, not started. **Created:** 2026-06-15. **Branch:** none (incremental on
`master`, flag-gated).

Retires the recurring bootstrap-restore bug class (char-bootstrap disambiguation v1.5.268,
bufaddr/tv2 corruption v1.5.367/409, Wishbringer Z3 "body unwilling" wedge) by moving the
autosave/resume path off the custom `restore_file`-mid-`aread` + bootstrap mechanism onto the
ZVM engine's built-in full-state `do_autosave`/`do_autorestore`.

See also: `.tome/save-restore-paradigm.md` (options + empirical proof + GiDispa reconciliation),
`.tome/bootstrap-restore-flow.md` (the seam mechanics), `reference/save-restore-research.md`
(original Dec-2025 rationale + 2026-06-15 correction).

## Why this is viable now (the unblock)

The custom system (Dec 2025, commit `335fea3`) exists because the team tried `do_autosave` and
it crashed: `save_allstate` → `GiDispa.get_retained_array(null)`. They concluded it was
"fundamentally incompatible with Z-machine." **That's wrong** — `save_allstate` touches GiDispa
only to resolve a retained line/memory buffer's addr/len (`glkapi.js:800`). A ~25-line GiDispa
shim makes the engine path work for Z-machine; we already have a working one at
`tools/play.cjs:144-176`, proven on Z3 Wishbringer via `--snapshot-in`.

## Strategy

Incremental on `master`, behind `config.useEngineAutorestore` (default `false`) so it lands in
pieces, can be flipped per-session for testing, and reverts without a git revert. Legacy Quetzal
autosaves coexist via format detection. The headless harness is the automated oracle, built
first, so correctness is proven before browser risk.

**Scope:** autosave/resume (page-reload) path only. Manual `SAVE`/`RESTORE` (Quetzal via
`Dialog.file_*`) untouched. Quicksave/customsave restore deferred to Phase 6.

## Conceptual change

- **Today:** fresh boot → intro runs → `restore_file()` mid-`@read` → fake "bootstrap wake"
  input to kick the half-restored VM. Five flag vars, the `'l'` seed, the bufaddr carry-write.
- **After:** `vm.start()` (inside `Glk.init`) sees `do_vm_autosave:true` + a snapshot from
  `Dialog.autosave_read(signature)` and calls `do_autorestore` (`zvm.js:1009-1042` →
  `:3003-3053`): `Glk.restore_allstate` + `restart(1)` + `restore_file` + `read_data =
  snapshot.read_data`. VM lands at a clean `glk_select` waiting for the NEXT real input. No
  intro replay, no mid-`aread` resume, no bootstrap, no seed. First `update()` = restored state.
- The engine snapshot stores window *metadata* + the grid char-array, NOT the buffer window's
  rendered scrollback. So we keep storing `displayHTML` alongside and reapply it (the valid half
  of the 2024 finding).

## Phases

### Phase 0 — Headless regression oracle (no app risk)
Commit a test script wrapping `tools/play.cjs`: for each matrix game, replay a path,
`--snapshot-out` mid-game, then `--snapshot-in` and assert the post-restore transcript tail ==
the no-restore baseline tail. Already works (it's how the Wishbringer fix was proven). This is
the green/red gate for every later phase.

### Phase 1 — GiDispa shim + options wiring (flag-gated)
- New `docs/js/game/gidispa-shim.js` — port the shim from `play.cjs:144-176`
  (`class_register`/`class_*`/`retain_array`/`get_retained_array`/etc.).
- `game-loader.js:158-164`: when `config.useEngineAutorestore`, set `GiDispa: shim` +
  `do_vm_autosave: true`; else current behavior (`do_vm_autosave:false`).

### Phase 2 — Autosave write path
- Engine `vm.do_autosave()` → `Dialog.autosave_write(signature, snapshot)`. Trigger where the
  manual `autoSave()` fires today (`voxglk.js`, after each line turn), flag-gated.
- Fix `dialog-stub.js autosave_write` (currently dead, wrong IDs `status-bar`/`upper-window`):
  use live IDs `statusBar`/`upperWindow`/`lowerWindow`, reuse `displayHTML` capture +
  `compressString` from `save-manager.js`, and **key by `gameName`** (`lantern_autosave_<gameName>`)
  not the raw signature — so Drive sync / backup rotation / home-screen bullet keep working.
- Preserve autosave-grace + first-3-line-moves skip semantics.

### Phase 3 — Autorestore read path + reattachment
- `dialog-stub.js autosave_read`: return engine snapshot; detect format (`snapshot.glk` present
  = new). Reattach `displayHTML` (decompress lowerWindow), narration state, map state, apply the
  screen-width global patch — onto the FULLY-RESTORED Glk tree, reconciled with the first
  post-restore `update()` (engine renders status/upper from the grid; we inject saved lower
  scrollback).
- Remove bootstrap/`shouldAutoRestore`/seed machinery from THIS path (leave intact for legacy
  fallback + quicksave until Phase 6).

### Phase 4 — Coexistence / fallback
- New-format snapshot → engine path. Only a legacy Quetzal+HTML autosave present → run existing
  `performRestore` once (don't strand mid-game users), then next turn re-saves new format. Keep
  both readable for the grace window.

### Phase 5 — Flip + bake
Flip `useEngineAutorestore` default `true`. Ship. Monitor.

### Phase 6 — Cleanup + quicksave decision (after grace)
Remove bootstrap kick, `'l'` seed, bufaddr carry-write, `skipNextUpdateAfterBootstrap` /
`seededBufaddr`, and the legacy `performRestore` autosave branch.

**Quicksave/customsave restore** shares the bootstrap and has the same latent bug. Mid-session
restore can't use boot-time `do_autorestore` without a VM restart. Two clean options, both
avoid the bootstrap (modeled on how Parchment does mid-game restore — see below):
1. **Drive the real `@restore` opcode** through the live VM while parked at a prompt, so the run
   loop continues naturally (the Parchment way). No page reload.
2. **In-place `do_autorestore`** — `restart()` + `restore_allstate` + `restore_file` +
   `read_data`, triggered on the button without a reload.

#### How Parchment does mid-game restore (reference)
Parchment has NO special mid-game mechanism and no separate quick-restore button. In-game
RESTORE is just the standard Z-machine `@restore` *opcode* executing in the live VM:
`restore(pc)` (`zvm.js:3484`) → `fileref_create_by_prompt` (file picker) → event loop →
`save_restore_handler` (`:3702`) → `restore_file` (`:3723`) → resolve the opcode branch (v3) /
store (v4+) (`:3728+`) → **live run loop continues to the next `@read`**. It's seamless because
there's NO page reload: glkapi/glkote is already the real game's display and the VM is actively
executing the opcode — `restore_file` just rewinds RAM/stack/PC. Our seam exists ONLY because a
refresh gives a fresh-intro Glk that disagrees with the restored VM. For the page-reload case
Parchment uses `do_autorestore` (full dual-system snapshot) — exactly this migration.

## Parity inventory — everything the legacy path does that the engine path MUST carry

The engine snapshot replaces only the **VM-state + bootstrap** machinery. Every other behavior
below is feature parity and must survive on the engine path (Phase 2 = write, Phase 3 = reattach).
This is an explicit acceptance gate for those phases — none of these may silently drop.

**GOES AWAY on engine path (the point of the migration):** VoxGlk gen/bufaddr/parseaddr carry
(`save-manager.js:404`/`541-573`), the `'l'` look-seed + `setSeededBufaddr`, `skipNextUpdateAfterBootstrap`/
`seededBufaddr`, the mid-`aread` resume, `shouldAutoRestore`. The screen_width global patch
(`decodeQuetzalScreenWidth` + globals scan, `:33-79`/`:516-529`) stays as a post-restore pass
until proven unnecessary (engine `restore_allstate` may already fix it — verify in Phase 3).

**MUST carry forward (re-wire onto the engine snapshot):**
- **Save (Phase 2):** (a) `displayHTML` statusBar+upperWindow+**lowerWindow scrollback**, gzip +
  `*Compressed` flags; (b) `cleanHTMLForSave` (strip system-msg / app-command / low-confidence);
  (c) `limitHTMLHistory` 100-turn cap; (d) map data — auto-mapper journey + canvas + journey-seed
  anchor (`getOptimizedMapData`); (e) `hintsMilestone`; (f) `appMoveCount`; (g) **key by
  `gameName`** (`lantern_autosave_<gameName>`); (h) **Google Drive auto-sync** (`scheduleDriveSync`);
  (i) **backup rotation** — autosave 3-deep/5-min, quicksave 3-deep, named-save 1-deep-before-overwrite,
  `_exempt` backups (`createBackup`/`cleanupOldBackups`/`backupNamedSaveBeforeOverwrite`);
  (j) quota-exceeded handling.
- **Restore (Phase 3):** (k) `displayHTML` reattach + `sanitizeRestoredHTML`; (l) `fitUpperWindow`
  grid scaling; (m) **narration chunk invalidation + `currentGameTextElement` repoint** (the
  "don't narrate the title screen" fix); (n) map restore + `setSuppressNextJourneyClear`;
  (o) `hintsMilestone` restore (permits down-move to earlier act); (p) autosave **grace period**
  (skip 3 moves) + backup-cooldown reset; (q) `_pendingRepeatAfterRestore` narration-on-restore.
- **Untouched but must keep working against the new format:** export/import `.sav` JSON
  (`exportSaveToFile`/`importSaveFromFile`) — Phase 4 format-detect applies on import too.

## Files touched
`config.js` (flag), `game-loader.js` (options + flag-gated restore plumbing),
`gidispa-shim.js` (new), `dialog-stub.js` (autosave_write/read: fix IDs, compression, gameName
keying, format detect), `voxglk.js` (autosave trigger; first-update reconciliation),
`voxglk-bootstrap.js` + `save-manager.js` (legacy retained until Phase 6), `tools/play.cjs`
test script.

## Testing

**Automated (headless oracle — gate for every phase).** Matrix = {Wishbringer Z3 line-intro,
9:05 Z5 line-intro, Anchorhead Z8 char-intro, Theatre Z5 char-intro, a Z3 "press any key"
intro}. For each: snapshot at ≥3 points (early room, mid-puzzle, a scripted-transition point
like Wishbringer's gate-lock), restore via `--snapshot-in`, assert next-command transcript ==
no-restore baseline. Explicit: Wishbringer post-lock → `take umbrella` = "Taken." + clock
advances.

**Browser (web-agent, per game class).**
- Fresh play ≥4 moves → reload → autorestore → command works; clock advances; NO "What next?"
  resurrection.
- Scrollback HTML intact; status/upper windows correct; narration chunks valid; map restored.
- Char-intro game (Anchorhead "Press R") restored cleanly.
- Restore at game start (moves 0–2, before autosave exists) — no crash.
- "Restart / Start Over" (skip-autoload) still bypasses restore.
- Cross-device: Drive-synced autosave from device A restores on device B.
- Coexistence: seed a legacy Quetzal autosave → load → legacy fallback restores → next turn
  writes new format → reload → engine path restores.
- Flag off → byte-for-byte current behavior (regression guard).

**Acceptance criteria.** Headless matrix all green; **every item in the Parity inventory verified
present on the engine path** (Phase 2/3 sign-off checklist); the four prior bug-class symptoms
cannot reproduce on the engine path; flag-off unchanged; SW-cache discipline when testing each
build (unregister SW + `caches.delete` + confirm served version).

**Risks.** (1) `restore_allstate` rebuilds windows differently than VoxGlk expects → reconcile
against the first update, don't pre-paint. (2) GiDispa shim incompleteness → headless matrix
catches it. (3) snapshot version-fragility on a future zvm bump → keep Quetzal as portable
export; add a snapshot schema-version byte, treat mismatch as "no autosave" (clean reboot).
