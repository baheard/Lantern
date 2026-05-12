---
title: PTT and Recognition Race Conditions
tags: [voice, ptt, recognition, race-condition, async]
created: 2026-05-11
updated: 2026-05-11
aliases: [push-to-talk, speech recognition, mic state]
---

# PTT and Recognition Race Conditions

`recognition.onend` is an `async` function with multiple `await` calls. This creates race windows where caller state can change between when `onend` starts and when it resumes after an `await`.

## Key invariant: hasProcessedResult

`state.hasProcessedResult` is the gate that prevents `onend` from double-firing a command that was already handled in `onresult`. It must be set to `true` at the **top** of any `onresult` processing branch that consumes the final transcript — not after the first `await`.

**Bug (fixed v1.5.272):** The non-instant final-transcript path in `onresult` never set `hasProcessedResult = true`. When `recognition.stop()` was called (PTT release), `onend` fired while `onresult` was still awaiting `displayInterimAsLowConfidence()`. `onend` saw `hasProcessedResult = false` + stale `currentInterimTranscript` and sent a second command.

## PTT mute lockout race

`wasPushToTalkRelease` is captured at the start of `onend`. If the user presses PTT again during the `await dispatchRecognized()` call, `startPushToTalk` sets `isMuted = false` and `pushToTalkActive = true`. When `onend` resumes it sees `wasPushToTalkRelease = true` (stale) and `!isMuted = true`, so it sets `isMuted = true` again — locking out the new session.

**Fix (v1.5.272):** Guard the mute-set with `!state.pushToTalkActive`. Similarly guard `isRecognitionActive = false` with `!(state.pushToTalkMode && state.pushToTalkActive)` to avoid clobbering the new session's state.

## Background restart loop (#51)

When the page is hidden, `recognition.stop()` fires `onend`. Without a guard, `onend` tries to restart recognition in a hidden tab. This restart may succeed briefly then fail, leaving `isRecognitionActive` stale. When the page becomes visible, the restart check can fail.

**Fix (v1.5.272):** Early-return in `onend` if `document.hidden` (alongside the `isMuted` check). The `visibilitychange` visible handler force-clears `isRecognitionActive` before restarting to handle any stale state.

## AudioContext after backgrounding (#52)

`audio-feedback.js` uses a single `audioCtx`. After extended backgrounding, iOS may close the context entirely (`state === 'closed'`). `getContext()` handled `'suspended'` but not `'closed'`, so sounds stopped working silently.

**Fix (v1.5.272):** `getContext()` recreates the context if `state === 'closed'`. The `visibilitychange` visible handler calls `initAudioContext()` proactively to resume/recreate before any sound is needed.

## Navigation notes

- Race conditions all live in `docs/js/voice/recognition.js` `recognition.onend` and `recognition.onresult`
- PTT button handlers: `startPushToTalk` / `stopPushToTalk` in `docs/js/app.js` ~line 606
- AudioContext: `docs/js/utils/audio-feedback.js` `getContext()`
- Visibility/focus handlers: `docs/js/app.js` ~lines 816–881
