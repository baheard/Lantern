---
title: "the"→"tv2" Z-String Abbreviation Corruption (FIXED v1.5.409)
tags: [zvm, save-restore, corruption, abbreviations, theatre, fixed]
created: 2026-05-30
updated: 2026-05-30
aliases: [tv2, abbreviation corruption, garbled text, the becomes tv2]
---

# "the"→"tv2" Z-String Abbreviation Corruption (FIXED, v1.5.409)

## ROOT CAUSE (found 2026-05-30, live VM probe)

The first **line** command typed after a bootstrap auto-restore is written by the
ZVM into memory at a **bogus low buffer address (observed 63 = 0x3F)** instead of
the game's real text buffer. In Theatre that bogus buffer overlaps the **Z-string
abbreviation table strings** at ~0x40, so the command bytes overwrite the
abbreviations. Every abbreviated word ("the") then decodes to garbage ("tv2") on
the next room redraw. Exiting a PAK (`read page`→`q`) isn't special — it's just
the first redraw that re-renders an abbreviated word. ANY first line command
corrupts it; a short `x me` reproduces it.

**Why 63:** after `restore_file()`, the ZVM's in-progress `read_data` (the pending
aread) still holds the PRE-restore intro request's `bufaddr` = 63. The restored
continuation copies the typed line into `read_data.bufaddr` = 63. This is the same
"63" the [[bootstrap-restore-flow]] doc's v1.5.367 section noted but couldn't
explain — it's the stale intro buffer, inherited across the restore. v1.5.367's
seeded dual-write made the command EXECUTE correctly (wrote it to the real buffer
too) but never stopped the stray write to 63.

Confirmed live (Theatre autosave, bufaddr should be 18183):
- Right after restore: `read_data.bufaddr` = 63; abbrev region at 0x40 = clean
  (`80 00 16 40 ...`, matches `origram`).
- Type `examine me` → bytes `09/0a "examine me"` appear at addr 63-73; abbrev
  string clobbered → "the"→"tv2" on next redraw.
- Patch `read_data.bufaddr` = 18183 BEFORE typing → command lands at 18183, abbrev
  region stays intact, room renders "...from the desk... the manager's office...
  trapdoor in the floor." CLEAN. No tv2.

## FIX (v1.5.409) — confirmed working live on Theatre

**Location matters.** It must be applied at command-SUBMIT time, NOT at restore
time. An earlier attempt (v1.5.408) set `read_data.bufaddr` in
`performRestore` and FAILED on real code: when the restored aread resumes during
the char bootstrap it re-reads its operands and resets `read_data.bufaddr` back to
63, overwriting the patch. (The manual console test only worked because it patched
right before typing — i.e. submit time.)

The working fix lives in `voxglk.js` `sendInput()`, inside the existing
`seededBufaddr` one-shot block (the v1.5.367 dual-write), right before
`acceptCallback`:
```js
const seededAddr = consumeSeededBufaddr();
if (seededAddr && window.zvmInstance?.m) {
    // ...existing dual-write of text into seededAddr...
    if (window.zvmInstance?.read_data) {
        window.zvmInstance.read_data.bufaddr = seededAddr;  // <-- the fix
    }
}
```
This redirects the ZVM's pending aread to the saved game-loop buffer just before
the input is processed, so the first command lands at the real buffer (18183 in
Theatre) instead of the stale 63 that overlaps the abbreviation strings. One-shot:
fires only for the first line input after a bootstrap restore. The dual-write of
the text is now redundant for Theatre but kept as belt-and-suspenders for
Anchorhead. `performRestore` carries only a comment pointing here.

## ORIGINAL SYMPTOM / investigation notes (kept for context)

## Symptom

In a restored Theatre game, some occurrences of `"the"` render in the main
(buffer) window as `"tv2"`, with the leading space eaten:
`"Judging from the desk"` → `"Judging fromtv2 desk"`. Selective — in the SAME
paragraph `"Doors lead to the southeast"` is intact. Char codes: `tv2` =
t(116) v(118) 2(50); `the` = t/h/e.

## It is NOT a display / narration bug (ruled out 2026-05-30)

Investigated end-to-end in the live browser:
- The corrupt text contains **zero `chunk-marker` spans** — the narration/marker
  pipeline never touched it.
- `renderBufferWindow` / `processStyledContent` (voxglk-renderer.js) copy VM
  output **verbatim** — no substitution. Verified by reading the code.
- `insertTemporaryMarkers` returns the text clean (tested on the exact sentence).
- No save in localStorage contains the literal "tv2" (saves store compressed VM
  state, not the rendered string).
- Decompressed the theatre autosave `displayHTML.lowerWindow` (gzip+base64): the
  stored room (Basement) is **clean**. The corruption only appears in the
  **live VM-generated** room (Manager's Office).

Conclusion: the **ifvms.js Z-machine VM produces the corrupt text** when
decoding Z-strings after restore.

## Root-cause theory

`"the"` is a common **Z-string abbreviation**. The selective corruption
(abbreviated "the" → garbage, inline "the" → fine) points at a corrupted
**abbreviation table** or its pointer. This is the same family as
[[quetzal-restore-globals]]: `restore_file()` reloads ALL dynamic RAM from the
Quetzal save; if the save baked corrupted memory (or the abbrev region / its
pointer got clobbered during a prior session and perpetuated via autosave), every
restore reproduces it. User confirmed it's tied to the save: hitting `q` to exit
a PAK shows it again, and a fresh restart was clean.

## Status / next steps

- Reproduces from a specific corrupted Theatre save (the one synced/restored in
  the live tab as of 2026-05-30).
- NOT yet root-caused. Likely a save/restore memory-corruption bug, possibly
  ifvms.js-specific (see [[parchment-vs-iftalk-engine]] — Parchment uses bocfel,
  not ifvms, so this class of bug wouldn't appear there).
- To investigate: decode the abbreviation table region (header 0x18 = abbrev
  table address) from the live VM memory vs origram; check whether restore is
  overwriting static-memory regions it shouldn't. Compare a fresh-start VM's
  abbrev pointers/bytes against the restored VM's.
- Capture the bad save before it's overwritten if continuing.
