---
title: OpenAI TTS Pipeline & Caching
tags: [narration, tts, openai, cache, prefetch, performance]
created: 2026-05-28
updated: 2026-05-28
aliases: [openai-tts, tts-cache, prefetch pipeline, AI TTS latency]
---

# OpenAI TTS Pipeline & Caching

## Cache API persistence

Audio is cached in the browser's **Cache API** under the name `iftalk-openai-tts-v1`. Cache keys are fake-but-valid HTTP URLs: `https://tts-cache.iftalk.local/<sha256>` where the hash is `SHA-256(voice:speed:text)`.

- Survives page reloads and tab closes — persistent until explicitly cleared.
- Same text + same voice + same speed = instant cache hit, zero API cost.
- Changing any of voice, speed, or text content = cache miss → new API call.
- No expiry: the cache grows unbounded. Worth a "clear TTS cache" settings button if storage becomes a concern.

**Speed is part of the cache key.** Per-chunk `speedModifier` values (header = −0.1, note = +0.1) are passed through the entire prefetch → play pipeline so prefetched audio and played audio always use the same speed → same cache key → cache hit. If you change how speed modifiers work, update both `prefetchOpenAIChunk` and `playWithOpenAITTS` calls in `tts-player.js`.

## Prefetch pipeline (and its gap)

The design is fire-and-forget prefetch so network round-trips overlap with playback:

1. **Before the loop** (`speakTextChunked`): prefetch the first non-app chunk.
2. **Each loop iteration at chunk `i`**: prefetch chunk `i+2` (two ahead).

**Fixed in v1.5.369:** All non-app chunks are now prefetched upfront in one pass (no `break` in the early-fetch loop). All fetches are fire-and-forget, OpenAI handles parallel requests fine, and latency for chunks 1, 2, 3 all overlaps with chunk 0 playing. The in-loop `i+2` lookahead stays as a redundant safety net for very long narration sessions where new chunks might be added dynamically.

## Long chunks always incur first-play latency

For novel text (new room, never visited), even with prefetch there's an irreducible OpenAI API round-trip (~0.5–2 s). This is most noticeable on long chunks because the gap between "got the short header audio" and "need the long body audio" is small. Caching means second visits are instant.

## Cost tracking

`sessionChars` accumulates in memory for the life of the page. `getSessionCost()` returns `sessionChars / 1_000_000 * 15.00` (tts-1 pricing as of 2026). **Only incremented on actual API calls (cache miss), not on Cache API hits.** This is correct for same-session re-plays; it does not charge for cross-session cache hits that were already paid for in an earlier session.

## Interruption handling

`playBlob()` and `playStreamingFromOpenAI()` in `openai-tts.js` own `state.chunkWasInterrupted`:
- `onended` (natural completion): does not set the flag.
- `onpause` when `state.isNarrating && !state.isPaused` (unexpected system pause — phone call, Siri, etc.): sets `chunkWasInterrupted = true`.
- `onpause` when `state.isPaused || !state.isNarrating` (user-requested stop via `stopNarration()`): does not set the flag.

The outer loop in `speakTextChunked` reads `chunkWasInterrupted` and retries the current chunk after 100ms — the same iOS recovery path used by browser TTS. **Do not clear `chunkWasInterrupted` in `tts-player.js` after OpenAI playback** — that was the original bug; let `playBlob` own it.

**Buffer stall vs real pause (v1.5.374):** `playStreamingFromOpenAI` tracks a `isBufferStall` flag via `waiting`/`playing` events. A `pause` event while `isBufferStall = true` is ignored — the browser paused due to the SourceBuffer running out of data mid-stream, and the reader loop's next `appendBuffer` will resume it via a `canplay` handler. Without this, any mid-stream buffer underrun (slow network) triggered the retry loop, causing infinite looping on that chunk.

**Retry limit (v1.5.374):** `speakTextChunked` caps retries per chunk at 3 (`consecutiveRetries` + `lastRetryChunk` tracking). After 3 failures the chunk is skipped rather than looping forever. This is a safety net; the root fix is the buffer stall guard above.

## Error fallback

If `playWithOpenAITTS` throws (network error, 429, 401), `speakTextChunked` falls back to `playWithBrowserTTS` for that chunk and shows a status message. Narration continues uninterrupted in degraded mode. A persistent API outage degrades gracefully rather than silently dropping all remaining chunks.

## Text chunking for long inputs

`splitIntoChunks()` breaks texts > 4000 chars at sentence boundaries (`. `, `! `, `? `, `\n`). Cut point is `lastBreak + 1` — the trailing character of the break pattern goes into chunk N and the remainder is `.trim()`'d, which is correct for all break types including bare `\n`. Normal IF room descriptions are well under 4000 chars and never chunk.
