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
- **Duplicate fetches prevented (v1.5.379)** — `pendingFetches: Map<cacheKey, Promise<Blob>>` in `openai-tts.js`. Prefetch registers its in-flight promise; `playWithOpenAITTS` awaits it instead of streaming. One API call per chunk regardless of path. Verified: 4-chunk session fires exactly 4 calls.
- **Prefetch is speculative cost** — prefetching chunks the user never plays wastes money. Only prefetch if narration is active or likely (autoplay mode). Don't prefetch on manual-play unless the user already pressed play.
- **`sessionChars` only counts API calls** (cache misses), not cache hits. This is the right metric to show the user.

## Cost tracking

`sessionChars` accumulates in memory for the life of the page. `getSessionCost()` returns `sessionChars / 1_000_000 * 15.00` (tts-1 pricing as of 2026). **Only incremented on actual API calls (cache miss), not on Cache API hits.** This is correct for same-session re-plays; it does not charge for cross-session cache hits that were already paid for in an earlier session.

## Interruption handling

`playBlob()` and `playStreamingFromOpenAI()` in `openai-tts.js` own `state.chunkWasInterrupted`:
- `onended` (natural completion): does not set the flag.
- `onpause` when `state.isNarrating && !state.isPaused` (unexpected system pause — phone call, Siri, etc.): sets `chunkWasInterrupted = true`.
- `onpause` when `state.isPaused || !state.isNarrating` (user-requested stop via `stopNarration()`): does not set the flag.

The outer loop in `speakTextChunked` reads `chunkWasInterrupted` and retries the current chunk after 100ms — the same iOS recovery path used by browser TTS. **Do not clear `chunkWasInterrupted` in `tts-player.js` after OpenAI playback** — that was the original bug; let `playBlob` own it.

**Chrome fires `pause` before `ended` at natural completion (v1.5.378):** This affects BOTH `playBlob` and `playStreamingFromOpenAI`. When audio reaches its natural end, Chrome sets `audio.ended = true` and then fires `pause` before firing `ended`. Without guards, `onpause` falsely sets `chunkWasInterrupted = true`, causing every cached chunk to retry. Fix:
- `playBlob.onpause`: `if (audio.ended) return;` — `audio.ended` is already `true` when the spurious pause fires.
- `playStreamingFromOpenAI.onpause`: `if (streamEnded) return;` — same pattern, `streamEnded` flag set when `ms.endOfStream()` is called.
- A `naturalEnd` boolean set in `onended` does NOT work — `onpause` fires before `onended`, so the flag is always false when you need it.

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
               prefetchOpenAIChunk(chunk 1..N)  ← chunks 1+ prefetched; chunk 0 intentionally skipped
               [2 RAF frames ~33ms]
               playWithOpenAITTS(chunk 0)
                 getCachedBlob → hit  → playBlob()               ← ~35ms e2e (second visit)
                 getCachedBlob → miss → playStreamingFromOpenAI() ← ~2s e2e (first visit, short text)
               playWithOpenAITTS(chunk 1)
                 pendingFetches.has(key) → true  ← awaits in-flight promise from prefetch
                 blob arrives → playBlob()
```

`s.onTextOutput` = `handleGameOutput`, wired via `initGameSelection(handleGameOutput)` in `app.js:478`.

## Measured latency benchmarks (2026-05-29, Anchorhead/Kitchen, Chrome desktop)

| Path | e2e latency (handleGameOutput → audio) |
|---|---|
| AI TTS — cache hit | 32–40ms |
| Browser TTS | 68ms |
| AI TTS — uncached, short text ("Kitchen") | ~2s (full API round-trip, no streaming benefit) |
| AI TTS — uncached, long text | ~300–500ms first-byte via MediaSource streaming |

**Cache hit is faster than browser TTS.** 32–40ms vs 68ms — because `audio.play()` on a pre-fetched blob resolves immediately, while browser TTS `onstart` waits for the synthesizer.

**Short text kills streaming benefit.** "Kitchen" is one word — the entire MP3 arrives in a single HTTP read so MediaSource streaming fires at the same time as a full blob fetch (~2s). Streaming only helps on long chunks where first bytes arrive well before the full response.

**The 50ms wait is the remaining recoverable gap.** In autoplay, narration is almost always active when a new command is entered, so `stopNarration() + sleep(50)` is almost always paid. The prefetch fires ~50ms later than it could.

**Early prefetch blocker:** Firing `prefetchOpenAIChunk` earlier (in `handleGameOutput`) requires `ensureChunksReady()` to get correct chunk boundaries and speed modifiers. But `ensureChunksReady` starts by removing ALL `.chunk-marker-start/.chunk-marker-end` elements from the DOM. While old narration is active, those markers drive text highlighting — removing them mid-narration would break it. Safe only when `!state.isNarrating`, which is rare in autoplay.

## Chunk 0 streaming vs chunk 1+ pendingFetches (v1.5.381)

**Chunk 0 is intentionally NOT prefetched.** The early-fetch loop in `speakTextChunked` starts at `startFromIndex + 1`. This lets chunk 0 fall through to `playStreamingFromOpenAI` directly, giving first-byte audio as soon as OpenAI starts responding rather than waiting for the complete blob.

**Why chunk 0 was accidentally broken (v1.5.379):** The dedup fix registered ALL chunks (including chunk 0) in `pendingFetches` via `prefetchOpenAIChunk`. By the time `playWithOpenAITTS` ran 2 RAF frames later, `pendingFetches` already had chunk 0 — forcing the `await pendingFetches.get(key)` (full blob) path. The streaming branch at the bottom of `playWithOpenAITTS` became unreachable. Fixed in v1.5.381 by starting the prefetch loop at `startFromIndex + 1`.

**Chunks 1+ use pendingFetches/blob intentionally.** Their prefetch fires ~23ms into the session and runs in parallel with chunk 0 streaming/playback. If the prefetch completes before chunk 0 finishes playing → instant transition. If not → waits for blob. No streaming for chunk 1+ currently; adding it would require changing `pendingFetches` to hold a streamable response rather than a blob promise.

## Text chunking for long inputs

`splitIntoChunks()` breaks texts > 4000 chars at sentence boundaries (`. `, `! `, `? `, `\n`). Cut point is `lastBreak + 1` — the trailing character of the break pattern goes into chunk N and the remainder is `.trim()`'d, which is correct for all break types including bare `\n`. Normal IF room descriptions are well under 4000 chars and never chunk.
