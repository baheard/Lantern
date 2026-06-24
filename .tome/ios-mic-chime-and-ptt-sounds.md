---
title: iOS Mic Chime & Push-to-Talk Sounds (#138)
tags: [voice, audio, ios, push-to-talk, wont-fix]
created: 2026-06-24
---

# iOS Mic Chime & Push-to-Talk Sounds (#138)

Two distinct sounds fire when you push-to-talk. Don't confuse them.

## 1. The iPhone system "listening" chime — NOT suppressible (won't-fix)

iOS Safari plays its own system tone whenever `webkitSpeechRecognition.start()` is
called. PTT calls `start()` on every press (`startPushToTalk` → `startRecognitionSafely`
in `app.js`), so the chime fires on every press. **This is OS-level and cannot be muted,
disabled, or volume-controlled from the web** — there is no JS API for it.

The *only* way to avoid the repeated chime is to never stop/start recognition per press —
keep it running continuously and gate whether results are processed. That trades the chime
for an always-live mic (battery + privacy cost) and defeats the point of push-to-talk.
Decided **not** to do this (confirmed with the user 2026-06-24: "we can't stop that stupid
iphone chime"). If this resurfaces, the answer is still no — it's not a bug in our code.

## 2. The app's own PTT confirmation tones — ours to tune (fixed)

Separately, the app played its own Web Audio tones around PTT:
- **Release** tone was removed earlier (#138) — `app.js` `stopPushToTalk`.
- **Press** tone was `playUnmuteTone()` (the two-note ascending unmute chime). Too intrusive
  at PTT frequency, so v1.5.640 swapped it for `playMicTick()` — a single short, quiet pop
  (`audio-feedback.js`). Continuous mode still uses the richer `playUnmuteTone` chime.

All app tones are gated by the master `lantern_soundEffectsEnabled` setting; the iOS system
chime is not (it's not ours).
