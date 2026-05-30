---
title: "the"→"tv2" Z-String Abbreviation Corruption (OPEN)
tags: [zvm, save-restore, corruption, abbreviations, theatre, open-bug]
created: 2026-05-30
updated: 2026-05-30
aliases: [tv2, abbreviation corruption, garbled text, the becomes tv2]
---

# "the"→"tv2" Z-String Abbreviation Corruption (OPEN — not root-caused)

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
