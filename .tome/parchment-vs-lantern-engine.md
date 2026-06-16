---
title: Parchment vs Lantern — Engine Difference
tags: [zvm, save-restore, bocfel, parchment, architecture]
created: 2026-05-28
updated: 2026-05-28
aliases: [parchment-engine, bocfel]
---

Parchment uses **bocfel** (a C Z-machine interpreter compiled to WASM) for z-code games — not ifvms.js. This means the bufaddr mismatch bug fixed in Lantern v1.5.367 is **ifvms.js-specific** and cannot be compared to or learned from Parchment's implementation.

**What Parchment does differently:**
- ZVM runs in a web worker (bocfel.js + bocfel.wasm, loaded dynamically)
- GlkOte's `autorestore(e)` only handles display: stores window history, scrolls buffer to bottom, sends an `arrange` event — no input seeding
- Save data is stored as binary in localStorage (`.glksave` format), same as Lantern
- No `restore_file`, no `ifvms`, no bootstrap mechanism in web.js — bocfel handles restore internally in WASM

**Why this matters:**
Lantern's char bootstrap and seededBufaddr mechanism exist because ifvms.js exposes the raw Z-machine buffer address and the glkapi/ZVM address mismatch requires manual patching. bocfel's WASM boundary hides all of this. There is nothing to copy from Parchment — our fix is the right approach for ifvms.js.

**Related:** [[bootstrap-restore-flow]], [[save-system]]
