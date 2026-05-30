---
title: PAK / Char-Mode Narration Chunking
tags: [narration, tts, char-mode, pak, voxglk, chunking]
created: 2026-05-30
updated: 2026-05-30
aliases: [press any key, menu narration, char mode chunks, read page]
---

# PAK / Char-Mode Narration Chunking

How "press any key" / menu screens (char input mode) get narrated with pauses
between lines and columns. Solved in v1.5.401.

## The text path

1. **voxglk update handler** (char mode): diffs the new screen against
   `s.lastCharModePlainText` to narrate only what changed on arrow-nav (the
   "line grew" heuristic — see code comments). On full-screen entry / `read page`
   the whole screen is the "diff".
2. **`cleanCharModeText(text)`** (voxglk.js) turns the raw grid text into a
   TTS string with natural break points:
   - Per line: replace runs of **8+ spaces** with `". "` BEFORE `processTextForTTS`
     collapses whitespace. This is the **column separator** (e.g.
     `"N = next subject        P = previous"` → two clauses). Threshold is 8
     because article/body indentation is ≤4 spaces — 4 would split prose.
   - Run each line through `processTextForTTS` (symbol stripping, spaced-caps
     collapse, title-case 4+ caps → "RETURN"→"Return").
   - Join lines with `". "`.
3. **`s.onTextOutput(cleaned)`** → `handleGameOutput` in app.js.

## Why chunks are built in handleGameOutput (not ensureChunksReady)

`handleGameOutput` splits the cleaned text on `/\.\s+/` into **one chunk per
line/column** and sets `state.narrationChunks` + `state.chunksValid = true`.
This is done for char mode **unconditionally** (outside the autoplay gate) so all
three trigger paths get the split chunks:

- **autoplay** (arrow-nav auto-narrate) → plays them
- **play button** → `speakTextChunked` → `ensureChunksReady` returns early
  because `chunksValid` is already true
- **`read page` voice command** → `triggerCharModeNarration` (voxglk) force-plays

If chunks were NOT pre-built, `ensureChunksReady` falls back to the upper-window
DOM, which uses `skipLineBreaks=true` → **one mashed-together chunk** → no pauses.
That was the bug.

## triggerCharModeNarration force-plays

`read page` must speak even when autoplay is off. `triggerCharModeNarration`
awaits `s.onTextOutput(text)` (builds chunks) then sets `narrationEnabled` and
calls `speakTextChunked(null, 0)` via dynamic import (avoids voxglk↔tts-player
cycle).

## Inter-chunk pauses: removed (v1.5.405)

We briefly added manual pauses between chunks (300→200ms for bare chunks, 400ms
after header chunks). **Both were removed** — the TTS engine already produces a
natural gap between separate utterances, so the manual delay only made narration
feel sluggish. tts-player.js now adds **no** inter-chunk delay. Headers still get
a slower rate (−0.1) and lower pitch (−0.1) via `glkClass` on the chunk's end
marker, which is enough to set a title apart without a gap.

Note (AI vs device TTS): the OpenAI voice has a *short* natural gap between
utterances; the browser/device TTS has a *bigger* one. The 0ms decision was made
listening to AI TTS — if device-TTS PAK ever feels too tight, a small bare-chunk
delay could come back, but gate it so AI TTS stays at 0.

## PAK highlighting: row-level matching (v1.5.406)

PAK chunks are built from cleaned text, not the DOM, so they have **no
`chunk-marker` spans** — the marker-based `highlightUsingMarkers` finds nothing.
Resolved with a fallback in `updateTextHighlight`: when `state.isCharMode` and
markers fail, `highlightCharModeRow(chunkIndex)` (highlighting.js) re-derives the
row for each chunk and highlights the whole grid row.

How the matching survives the text transforms:
- `processTextForTTS` strips `> * = |` etc. and title-cases caps, so cleaned chunk
  text ≠ raw grid text. Match on **alphanumerics only** (`normAlnum`, lowercased,
  `[^a-z0-9]` removed) so `"> (missing pages)"` and `"(missing pages)"` both →
  `"missingpages"`.
- Walk chunks `0..chunkIndex` in order, advancing a cursor (`row` +
  `consumed`-within-row). This makes **two-column rows** resolve both columns to
  the same row, and **duplicate lines** (e.g. two `"(missing pages)"` entries)
  resolve to **distinct** rows. Verified live: a 9-chunk journal mapped every
  chunk to the correct row, duplicates to rows 6 and 8.
- Granularity is **per row**, not per column. Reading either column of a
  two-column menu row highlights the whole row. Column precision would need
  markers injected at chunk-build time — deliberately not done (low ROI).
- Paint + scroll reuse the same CSS Highlight API (`'speaking'`) and viewport
  math as the marker path. `scrollRowIntoView` works from the row element's rect
  (no markers to range over).

## Files

- `docs/js/game/voxglk.js` — `cleanCharModeText()`, char-mode diff block (~440-525),
  `triggerCharModeNarration()`, `getCharModeText()`
- `docs/js/app.js` — `handleGameOutput()` char-mode chunk build
- `docs/js/narration/tts-player.js` — speed/pitch by glkClass (~345); pauses removed
- `docs/js/narration/highlighting.js` — `highlightCharModeRow()`, `normAlnum()`,
  `scrollRowIntoView()`; `updateTextHighlight()` char-mode fallback
- `docs/js/voice/voice-commands.js` — `read`/`read page`/`read all` handler (~210)

Related: [[text-decode-corruption]] (the "tv2" bug surfaced during this work but
is unrelated — VM-side, not narration).
