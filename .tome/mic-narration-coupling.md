---
title: Mic & Narration Are Decoupled
tags: [voice, narration, design]
created: 2026-04-26
updated: 2026-04-26
aliases: [mute, auto-mute, push-to-talk]
---

# Mic & Narration Are Decoupled

In an earlier iteration, the mic muted automatically on pause and unmuted on play, and stayed off while narration was speaking. That's gone — mic state and narration state are now independent subsystems. The decoupling decision is documented in code only via the comment at `docs/js/narration/tts-player.js:259`: *"mic and narration are now decoupled"*.

## What this means in practice
- Pausing narration **does not** auto-mute the mic.
- Starting/resuming narration **does not** auto-unmute the mic.
- Voice recognition stays active while TTS is speaking; echo detection (`docs/js/voice/echo-detection.js`) filters out the app's own voice from being treated as user input.

## Where you'll see vestiges
Four `if (false && …)` blocks gate the legacy auto-mute/unmute behavior:
- `docs/js/app.js:417` — voice-command pause path
- `docs/js/app.js:463` — voice-command play path
- `docs/js/app.js:1150` — pause-button path
- `docs/js/app.js:1186` — play-button path
- `docs/js/narration/tts-player.js:259` — narration-start path (this one explicitly says decoupled)

The four in `app.js` carry "TEMPORARILY DISABLED for debugging" comments, but in practice they've been off long enough that the rest of the system relies on the decoupled behavior. **Treat all five as the canonical "off" state.** If you re-enable any of them, re-enable the cluster together — partial enables produce inconsistent behavior across pause/play paths (voice vs button) that users will notice.

## If you want to delete the dead branches
That's fine — the comments are the only thing preserving the option to flip them back on. If you remove them, capture the decoupling as a comment somewhere prominent (e.g., near `state.isMuted`'s declaration in `state.js`, or in this tome entry).

## Why this matters
- Don't write new code that assumes mic state ↔ narration state. They're orthogonal.
- The push-to-talk mode (`state.pushToTalkMode`) is a separate axis — it gates the old auto-mute conditions but with mic+narration decoupled, push-to-talk really only governs hold-to-talk vs continuous-listen, not narration interplay.
