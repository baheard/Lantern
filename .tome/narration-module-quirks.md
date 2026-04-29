---
title: Narration Module Quirks
tags: [narration, tts, cycles, architecture]
created: 2026-04-27
updated: 2026-04-27
aliases: [tts-player, speakTextChunked, skipToEnd, MediaSession, navigation cycle]
---

# Narration Module Quirks

## MediaSession `play` handler must call `speakTextChunked` directly

`tts-player.js` registers the MediaSession `play` action inside `startKeepAlive()`. To resume narration it must call `speakTextChunked(null, state.currentChunkIndex)` from the **same file** — not import `navigation.js`.

**Why:** `navigation.js` statically imports `stopNarration` from `tts-player.js`. A dynamic `import('./navigation.js')` inside tts-player is valid (cycle resolved at runtime), but there is no `resumeNarration` export in navigation.js — that function never existed. The correct resume path is `speakTextChunked`, which is defined right there in tts-player.js.

**Regression trap:** This broke silently (no `.catch()` on the dynamic import, TypeError swallowed). If the play handler ever gets rewritten, keep the call local to tts-player.js.

## `skipToEnd()` is a brute-force stop that bypasses `stopNarration()`

`navigation.js:skipToEnd()` inlines its own audio teardown instead of calling the async `stopNarration()`. This is intentional: it needs to set `narrationEnabled = false` (not just `isPaused = true`) and must be synchronous.

**Maintenance trap:** Anything `stopNarration()` does that `skipToEnd()` doesn't mirror will silently not happen after skip-to-end. Current example: `stopKeepAlive()` was missing from `skipToEnd` until v1.5.235. If new cleanup logic is ever added to `stopNarration`, check whether `skipToEnd` also needs it.

**Current shared teardown in skipToEnd:** stops `state.currentAudio`, calls `speechSynthesis.cancel()`, clears `state.isNarrating`, calls `stopKeepAlive()`.

## Dynamic import cycle map for the narration layer

```
tts-player.js
  ├─ static ← highlighting.js
  ├─ dynamic → game-output.js  (cycle: game-output imports tts-player)
  ├─ dynamic → nav-buttons.js  (cycle: nav-buttons imports tts-player)
  └─ dynamic → navigation.js   (cycle: navigation imports stopNarration from tts-player)

navigation.js
  └─ static ← tts-player.js (stopNarration, stopKeepAlive)
```

The dynamic imports in `tts-player.js` are all legitimate cycle-breaks — don't convert them to static without verifying the cycle is actually gone.
