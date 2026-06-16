---
title: Save/Restore Paradigm — Why Bootstrap Bugs Recur & Three Options
tags: [zvm, save-restore, voxglk, design, bootstrap, architecture]
created: 2026-05-30
updated: 2026-06-15
aliases: [bootstrap bug class, full snapshot, input buffer ownership, restore paradigm]
---

# Save/Restore Paradigm — Why Bootstrap Bugs Recur & Three Options

Design note (no implementation as of 2026-05-30). Captures the shared root of a
whole family of restore bugs and three ways to address it, with the realistic
scope of each. Decision so far: **#1 deferred (version fragility), #3 is optional
maintainability polish, not urgent** — the concrete bug it would have prevented
(tv2) is already fixed in v1.5.409. See [[text-decode-corruption]] and
[[bootstrap-restore-flow]].

## The shared root

Restore today is: boot the game fresh → let the intro run → call `restore_file()`
mid-`aread` → fake an input to kick the half-initialized VM forward. The deep
problem is **"two systems, one restore"**: `restore_file()` restores ZVM state
(registers, stack, dynamic RAM, PC) but NOT glkapi state (window list, pending
line/char request, the bound buffer address). That seam is the soil for:
- title-screen-narration-after-refresh (v1.5.407)
- the glkapi/ZVM bufaddr mismatch (v1.5.367)
- char-bootstrap "I beg your pardon" / disambiguation mode (v1.5.268)
- "the"→"tv2" abbreviation corruption (v1.5.409)

All four trace back to resuming *inside* an input read with stale cross-system
state.

## Option 1 — Full interpreter snapshot (deferred)

Serialize the entire live JS state of BOTH ZVM and glkapi into the save; on load,
reconstruct both objects directly — no intro replay, no `restore_file()` mid-aread,
no bootstrap kick. Eliminates the seam entirely.

- **Size:** raw is bigger (full ~19 KB dynamic-memory image for Theatre vs.
  Quetzal's RLE diff of a few KB), but it gzips well and the displayHTML blob
  already dominates saves — net single-digit KB either way. Size is NOT the
  blocker.
- **Real cost — version fragility:** a full snapshot is coupled to the exact
  ZVM/glkapi internal layout. A future engine upgrade can invalidate old saves.
- **Mitigation if pursued:** hybrid — full-snapshot only for the disposable,
  same-session autosave/resume path; keep Quetzal as the portable/export format
  for manual saves that must survive an engine bump.
- **Status:** deferred 2026-05-30 — fragility not worth it today. **Reopened
  2026-06-15** as the recommended fix after the Wishbringer Z3 wedge (see proof
  below) + the GiDispa reconciliation (next bullet).
- **Why this wasn't done in the first place — and why that reason is stale.** The
  custom Quetzal+bootstrap system (Dec 2025, commit `335fea3`) exists because the team
  TRIED `do_autosave` and it crashed: `save_allstate` → `GiDispa.get_retained_array(null)`.
  They concluded (`reference/save-restore-research.md`) it was "fundamentally incompatible
  with Z-machine" because GiDispa is a Glulx-only dispatch layer. **That conclusion is
  wrong.** `save_allstate` touches GiDispa only to resolve the addr/len of a retained
  line/memory buffer (`glkapi.js:800`). A **minimal GiDispa shim** (~25 lines, just the
  methods `save_allstate`/`restore_allstate` call) makes the built-in path work for
  Z-machine. We already have a working one: `tools/play.cjs:144-168` runs `do_autorestore`
  on Z3 Wishbringer cleanly. The Dec-2025 attempt simply ran with no GiDispa at all
  (`do_vm_autosave:false`). So Option 1's only *real* remaining cost is the version-
  fragility above (mitigated by the hybrid) — the historical "incompatible" blocker is gone.
- **Migration shape (de-risked):** (1) port the harness GiDispa shim into the browser +
  flip `do_vm_autosave:true`; (2) re-home app-layer reattachment (displayHTML scrollback,
  status bar, screen-width global patch, narration-chunk invalidation, map-state,
  autosave-grace) onto a *fully-restored* Glk window tree instead of a fresh one;
  (3) coexistence/fallback for existing Quetzal+HTML autosaves. `save_allstate` saves
  window metadata NOT text, so keep saving displayHTML alongside (this was the *valid*
  half of the 2024 finding). Own branch; regression-test Z3/Z5/Z8 × line/char intro with
  `play.cjs` as oracle.

## Option 2 — Restore at a clean prompt boundary (rejected for now)

Instead of resuming inside an `aread`, `restore_file()` then step the VM to the
NEXT input request before any UI interaction, so buffer addresses are the real
game-loop ones from the start and no input needs faking.

- **Blocker:** depends on ifvms exposing a "run until next input request, then
  yield" entry point. We currently drive the VM only through glkapi's
  `acceptCallback`/`VM.resume()` and observe `read_data` after the fact — that
  clean step-to-prompt hook doesn't appear to exist at 1.1.6. Synthesizing it
  means forking ifvms or rebuilding the run loop, risking a NEW mid-execution
  seam.
- **Also:** most of #2's value evaporates once #1 lands (no intro replay, no
  mid-aread resume). It partly competes with #1 rather than composing.

## Option 3 — Own the input plumbing (small; maintainability, not a guarantee)

Consolidate the scattered bufaddr machinery into one owner. Today it's smeared
across three files:
- `save-manager.js:351-373` — captures `read_data.bufaddr/parseaddr` at save time
- `save-manager.js:501-521` — on restore: seeds buffer with `'l'`, zeroes parse
  buffer, `setSeededBufaddr`
- `voxglk.js:790-809` + `voxglk-bootstrap.js` — carries the saved address forward,
  writes input + sets `read_data.bufaddr` at submit time

**IMPORTANT correction to an earlier framing:** #3 is NOT "stop carrying a saved
address; just ask the VM where input goes — self-correcting by construction." That
does NOT work, and the tv2 bug is the proof: at submit time the VM's LIVE
`read_data.bufaddr` is the **stale 63** (wrong); the **saved** bufaddr (18183) is
what's authoritative. We carry a saved address precisely because the VM's own live
answer is unreliable in the post-bootstrap window. "Querying live" would
reintroduce the bug.

- **What #3 genuinely buys:** the invariant — *"after a bootstrap restore the VM's
  `read_data` is stale until the first real command, so the saved bufaddr is
  authoritative"* — becomes explicit and testable in one module instead of smeared
  across three files with magic offsets (`+1`/`+2` framing, the `'l'` seed, the
  literal `63`). Harder to half-break in a refactor — which is exactly how the
  v1.5.367 fix left tv2 half-fixed.
- **What it does NOT buy:** prevention of the bug class "by construction." It's a
  legibility/consolidation refactor, modest robustness gain.
- **Scope:** small and contained (the three spots above). Optional. Do it when the
  code bites again or you're already in there; not urgent now that tv2 is fixed.

## Empirical proof the seam (not the data) is the culprit — Wishbringer Z3 (2026-06-15)

The class bit again on **Wishbringer (the first Z3 game)**: after autorestore every
turn-taking command returns "Your body seems unwilling to respond." and the retired
"What next?" prompt resurrects; the in-game clock freezes. Instrumentation + a headless
A/B nailed it to the seam, not the save:

- **Not the seed layout.** The bootstrap 'l' seed *did* hardcode the Z5+ buffer layout
  (wrong for Z1-4 — see [[bootstrap-restore-flow]]); fixed it version-aware (v1.5.571).
  Wedge persisted. And for a **line-mode intro the seed is moot anyway** — glkapi
  overwrites the seeded buffer with the bootstrap's `value` ('bootstrap wake'), so the VM
  executes that, not "look".
- **Not the buffer/address.** Live diag: restored `read_data.bufaddr` == saved bufaddr
  (10588, no mismatch); the first real command lands at the right address in correct Z3
  layout. Still wedged, clock still frozen.
- **Not the saved data.** Decisive A/B: snapshot the exact post-lock save point, then
  restore it through the **engine's own `do_autorestore`** (`tools/play.cjs --snapshot-in`
  → `Glk.restore_allstate` + `restart(1)` + `restore_file`). Result: `take umbrella` →
  "Taken." (clock advances), `e` → next room. **No wedge.** Same snapshot, clean restore.

So the only variable that produces the wedge is the **app's custom restore path**
(`restore_file` mid-`aread` + fake line bootstrap), exactly the "two systems, one restore"
seam. The corrupted state is a game global the bootstrap turn clobbers post-restore;
`do_autorestore` never resumes mid-`aread`, so it can't. This is direct confirmation that
**Option 1 retires the bug** — and that our headless harness already runs the fixed path
in production zvm. Headless `play.cjs` is the ready-made regression oracle for the
migration (default replay = no-restore baseline; `--snapshot-in` = do_autorestore path).

## Bottom line

If/when this class bites again: **#1 (hybrid) is the structural fix** that retires
the most bug surface; **#3 is the standing discipline** that makes the
Lantern↔engine seam honest and composes with #1; **#2 only** if profiling shows #1
left a resume seam. As of 2026-06-15 the Wishbringer Z3 wedge (above) makes #1 the
recommended next move, on its own branch — see scope estimate in [[bootstrap-restore-flow]]
/ the wishbringer_restore_z3 track.

## Implementation status — COMPLETE (Phase 6b, v1.5.582, 2026-06-15)

Option 1 (engine `do_autosave`/`do_autorestore`) is the **sole** restore path. Migration is done
end-to-end (phases 0–6b all committed; 6b = `4da25f5`, v1.5.582). The custom Quetzal+bootstrap
mechanism is **deleted**, not just bypassed:

- **Phase 5 (v1.5.577):** flipped `config.useEngineAutorestore` from opt-in to opt-OUT (`!== 'false'`;
  clear/omit the localStorage key → on, set `'false'` → legacy). Engine became the default.
- **Phase 6a (v1.5.578, `8506d3e`):** quick/custom restore moved onto the boot `do_autorestore` path.
  `window.__engineRestoreKey` (resolved in game-loader) tells `dialog-stub.autosave_read` which slot
  to feed (autosave / quicksave / customsave_<name>) — making ALL slots restorable via the boot path.
- **Phase 6b (v1.5.582, `4da25f5`):** retired the legacy Quetzal restore + all bootstrap-kick
  machinery. Deleted from `voxglk-bootstrap.js`: `skipNextUpdateAfterBootstrap`/`checkSuppressUpdate`/
  `isBootstrapping`, `seededBufaddr`/`setSeededBufaddr`/`consumeSeededBufaddr`, `introInputType`/
  `captureIntroInputType`, and the bootstrap-wake kick block — leaving just `justRestored` lifecycle +
  `handleAutoRestore` engine dispatch. `save-manager.performRestore` dropped the Quetzal decode branch,
  the `'l'` seed, parse-buffer zero, screen-width patch, and `decodeQuetzalScreenWidth`; it now rejects
  non-engine saves up front with a graceful "older format" message. `importSaveFromFile` now also
  accepts `engineSnapshot` (was a separate pre-existing bug). Engine WRITE now applies to ALL slots.
  **Old Quetzal saves are stranded by design** — a legacy save boots a fresh intro and `performRestore`
  rejects it gracefully (no crash). The whole [[bootstrap-restore-flow]] seam is now dead code/history.

See `reference/autorestore-migration-plan.md`. The `savegame_conversion` track is closed.
Browser-verified on 9:05 (Z5), Anchorhead (Z8 char-intro), Wishbringer (Z3 — the wedge above),
and amfv (Z4 multi-MORE char-intro); oracle 18/18; Drive sync is format-agnostic (spreads the whole
save object, conflict-detects on timestamp/appMoveCount which engine saves carry). Engine restore
round-trips, next command parses, clock advances, no resurrection.
Key files: `docs/js/game/gidispa-shim.js`, `save-manager.js` (`buildEngineSnapshot`, format
branch in `performSave`/`performRestore`), `dialog-stub.js` (`autosave_write` stash /
`autosave_read` boot feed), `game-loader.js` (plumbing wiring), `voxglk-bootstrap.js` (skip kick).

### GOTCHA — `vm.prepare()` copies options, so wire the plumbing BEFORE it
`ZVM.prepare()` does `this.options = utils.extend({}, default_options, options)` (`zvm.js:971`)
— a COPY. So `options.do_vm_autosave` + `options.GiDispa` must be set BEFORE `vm.prepare()`,
or the VM's `this.options` never sees them and `vm.start()` skips `do_autorestore` entirely.
Symptom when wrong: VM boots a fresh intro (autosave_read never called) while the app's HTML
reattach paints the saved scrollback over it → stuck at a char "press key to continue" with
intro text bleeding in. game-loader defers `vm.prepare()` until after the engine-plumbing
decision for this reason. Cost an hour of Anchorhead debugging; the headless oracle can't
catch it because it never exercises the browser boot/`Glk.init` ordering.

### Coexistence rule — read plumbing keys off SAVE FORMAT, not the write flag
An engine snapshot can only be restored by `do_autorestore` at boot (needs GiDispa +
do_vm_autosave wired before `Glk.init`). So enable that plumbing whenever the *existing
autosave* is engine-format (`saveData.saveFormat==='engine'`), regardless of the write flag —
otherwise flipping the flag off (or the eventual default flip) strands existing engine saves.
The flag independently controls the NEXT save's format, so flag-off cleanly downgrades to
legacy Quetzal on the next autosave. Engine WRITE is gated to the autosave slot only
(quicksave/customsave stay legacy until Phase 6); a pending manual restore forces the legacy path.
