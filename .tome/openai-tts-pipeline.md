---
title: OpenAI TTS Pipeline & Caching
tags: [narration, tts, openai, cache, prefetch, performance]
created: 2026-05-28
updated: 2026-05-29
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

## API cost — this is real money

OpenAI TTS is **BYOK and billed to the user's own API key** at $15/million chars (tts-1). Every API call costs real money. Design decisions must prioritize minimizing API calls:

- **Cache hits are free** — persistent Cache API means second visits to any room cost nothing.
- **Duplicate fetches are waste** — the current duplicate-fetch bug on chunk 0 (first visit) burns ~2× the tokens for every room entered in autoplay. Fix this before shipping.
- **Prefetch is speculative cost** — prefetching chunks the user never plays wastes money. Only prefetch if narration is active or likely (autoplay mode). Don't prefetch on manual-play unless the user already pressed play.
- **`sessionChars` only counts API calls** (cache misses), not cache hits. This is the right metric to show the user.
- **Token-saving priority order:** (1) deduplication Map to prevent double-fetching, (2) early prefetch only in active autoplay, (3) cache hit rate (already good after first visit).

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

## Autoplay chain and first-chunk latency

**The full autoplay flow (every command in autoplay mode):**

```
voxglk.js:399  addGameText(mainWindowHTML)      ← DOM updated, currentGameTextElement set
voxglk.js:467  s.onTextOutput(finalTextForTTS)  ← same sync block, calls handleGameOutput
app.js:115     handleGameOutput → speakTextChunked()
tts-player.js  await stopNarration()
               await sleep(50)                  ← ~50ms wait (almost always paid in autoplay)
               ensureChunksReady()
               prefetchOpenAIChunk(chunk 0..N)  ← OpenAI fetch starts HERE
               [2 RAF frames ~33ms]
               playWithOpenAITTS(chunk 0)
                 getCachedBlob → miss (prefetch not done)
                 playStreamingFromOpenAI        ← second OpenAI fetch starts HERE
                 first byte arrives 1–3s later → playback starts
```

`s.onTextOutput` = `handleGameOutput`, wired via `initGameSelection(handleGameOutput)` in `app.js:478`.

**The 50ms wait is the main recoverable gap.** In autoplay, narration is almost always active when a new command is entered, so `stopNarration() + sleep(50)` is almost always paid. The prefetch could fire ~50ms earlier if triggered directly in `handleGameOutput` (before `speakTextChunked`), since the DOM is already updated by `addGameText` at that point.

**Optimization: early prefetch in `handleGameOutput`**
Call `ensureChunksReady()` + `prefetchOpenAIChunk` for chunk 0 inside `handleGameOutput`, before `speakTextChunked`. Saves ~50ms. `ensureChunksReady()` is already imported in `app.js`. This is safe: `ensureChunksReady` is idempotent (guards on `chunksValid`), and `speakTextChunked` will call it again harmlessly.

**Duplicate fetch problem (not yet fixed, HIGH PRIORITY — costs real money):** Both the early prefetch and `speakTextChunked`'s own prefetch loop check `getCachedBlob` and both find a miss ~simultaneously, so two parallel OpenAI requests fire for the same chunk 0 text. Fix requires a `pendingFetches: Map<cacheKey, Promise<Blob>>` deduplication layer in `openai-tts.js`. This is not theoretical — every autoplay command currently fires a duplicate request for chunk 0 on first visit.

**The hard ceiling:** OpenAI API round trip is ~1–3s. No amount of early prefetching beats that for first-visit novel text. The streaming path (`playStreamingFromOpenAI`) already starts playback at first byte (~100–300ms into the response), which is the best achievable latency for cache misses. Second visits are instant (cache hit via `playBlob`).

## Text chunking for long inputs

`splitIntoChunks()` breaks texts > 4000 chars at sentence boundaries (`. `, `! `, `? `, `\n`). Cut point is `lastBreak + 1` — the trailing character of the break pattern goes into chunk N and the remainder is `.trim()`'d, which is correct for all break types including bare `\n`. Normal IF room descriptions are well under 4000 chars and never chunk.
