---
title: iOS Web Audio Bypasses Silent Switch and Volume Buttons
tags: [audio, ios, web-audio-api, gotcha, fixed]
created: 2026-06-07
updated: 2026-06-07
aliases: [silent mode, ringer switch, AudioContext, audio session, audio-feedback]
---

# iOS Web Audio Bypasses Silent Switch and Volume Buttons

## The quirk

On iOS, **all** browsers (Chrome, Firefox, Edge, Safari) run on WebKit —
Apple requires it. Raw Web Audio API output (`AudioContext` + oscillators,
as used in `audio-feedback.js` for SFX tones) is routed through an audio
session that iOS treats like a system/UI sound: it **ignores both the
Ring/Silent switch and the hardware volume buttons**.

`speechSynthesis` (used for narration) and real `<audio>`/`<video>`
elements use the standard "media" audio session, which **does** respect
both controls. This is why a user can report "all my SFX play at full
volume in silent mode" while narration behaves normally — they're on two
different audio sessions entirely.

## The fix (implemented v1.5.490)

Loop a real (silent) `<audio>` element continuously. This forces Safari/WebKit
to register the page under the standard media audio session — which then
governs Web Audio API output too, fixing both the silent-switch and
volume-button bypass at once.

`docs/js/utils/audio-feedback.js`:
- `SILENT_WAV_DATA_URI` — an embedded base64 data URI for a tiny (0.1s,
  8-bit PCM mono, 8kHz) WAV file where every sample byte is `128`
  (silence in 8-bit unsigned PCM). Generated inline with a Node script
  rather than committing a binary asset.
- `ensureSilentAudioLoop()` — creates the looping `<audio>`, called from
  inside `getContext()` so it always rides along on a user-gesture (button
  press) and satisfies autoplay policy.
- `initAudioContext()` also resumes the loop if iOS paused it while the
  page was backgrounded (mirrors the existing `audioCtx.resume()` logic).

**Reusable pattern:** if other Web Audio usages surface "ignores silent
mode" reports, the same `ensureSilentAudioLoop()` call (or lifting it to a
shared module) is the fix — the silent loop only needs to exist once
per page, not once per audio source.
