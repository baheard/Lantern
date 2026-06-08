/**
 * OpenAI TTS Module
 *
 * Calls OpenAI's /v1/audio/speech directly from the browser using the user's
 * own API key. No server proxy — the user's key, browser, and bill.
 *
 * Features: Cache API caching, sentence-boundary chunking, cost tracking,
 * MediaSource streaming (reduces first-play latency to ~100-300ms on iOS 17+ / Chrome).
 */

import { state } from '../core/state.js';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const CACHE_NAME = 'iftalk-openai-tts-v1';
const MAX_CHARS = 4000;
const COST_PER_MILLION_CHARS = 15.00;

let sessionChars = 0;

// Tracks in-flight fetch promises keyed by cache URL. Prevents duplicate API calls
// when prefetch and playWithOpenAITTS both target the same chunk simultaneously.
const pendingFetches = new Map();

export function getSessionCost() {
  return (sessionChars / 1_000_000) * COST_PER_MILLION_CHARS;
}

export function getSessionChars() {
  return sessionChars;
}

export function isOpenAITTSEnabled() {
  const cfg = state.openAiTtsConfig;
  return !!(cfg?.enabled && cfg?.apiKey);
}

function supportsMediaSourceMp3() {
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg');
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function splitIntoChunks(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > MAX_CHARS) {
    const slice = remaining.slice(0, MAX_CHARS);
    const lastBreak = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('\n')
    );
    const cutAt = lastBreak > 0 ? lastBreak + 1 : MAX_CHARS;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Build a Cache API key. Must be a valid http URL — non-http custom schemes
 * fail silently in cache.match(), breaking the cache entirely.
 */
async function makeCacheKey(text, voice, speed) {
  const hash = await sha256(`${voice}:${speed}:${text}`);
  return `https://tts-cache.iftalk.local/${hash}`;
}

async function getCachedBlob(cacheKey) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey);
    if (hit) return await hit.blob();
  } catch (_) {}
  return null;
}

async function storeInCache(cacheKey, blob) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, new Response(blob.slice(), {
      headers: { 'Content-Type': 'audio/mpeg' }
    }));
  } catch (_) {}
}

/**
 * Play a blob as audio. Resolves when playback ends OR when stopped externally
 * (e.g. stopNarration() calls audio.pause()). Without the pause handler the
 * awaiting speakTextChunked loop hangs indefinitely after a stop.
 */
function playBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    state.currentAudio = audio;
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (state.currentAudio === audio) state.currentAudio = null;
    };

    audio.onended = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    audio.onpause = () => {
      if (settled) return;
      if (audio.ended) return;
      // For very short clips (e.g. headers like "Kitchen") Chrome fires pause before
      // audio.ended is set. Defer one tick so onended can win if it fires immediately
      // after — that's natural completion. For real interruptions (phone call, Siri)
      // onended never fires, so the deferred callback correctly sets chunkWasInterrupted.
      setTimeout(() => {
        if (settled) return;
        settled = true;
        if (state.isNarrating && !state.isPaused) {
          state.chunkWasInterrupted = true;
        }
        cleanup();
        resolve();
      }, 0);
    };

    audio.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Audio playback error'));
    };

    if (state.narrationT0) {
      state.narrationT0 = null;
    }
    audio.play().catch(err => { if (!settled) reject(err); });
  });
}

/**
 * Fetch from OpenAI and play via MediaSource, streaming audio as bytes arrive.
 * Starts playing at ~100-300ms (time-to-first-byte) instead of waiting for the
 * full blob. Caches the complete MP3 once the stream finishes so future plays
 * are instant cache hits. Falls back gracefully: if this throws, the caller
 * falls back to the blob path.
 *
 * Requires MediaSource + audio/mpeg support (Chrome, iOS 17+, Safari 17+).
 */
async function playStreamingFromOpenAI(text, voice, speed, apiKey, cacheKey) {
  const t0 = performance.now();

  const response = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: state.openAiTtsConfig?.model || 'tts-1',
      voice,
      input: text,
      response_format: 'mp3',
      speed
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS ${response.status}: ${errText}`);
  }

  return new Promise((resolve, reject) => {
    const collectedChunks = [];
    const ms = new MediaSource();
    const url = URL.createObjectURL(ms);
    const audio = new Audio(url);
    // Do NOT revoke url here — Safari needs it valid until sourceopen fires.
    // Revoked in finish()/fail() once we're truly done.
    state.currentAudio = audio;
    let settled = false;
    let streamEnded = false; // True once ms.endOfStream() has been called
    let reader = null;
    let isBufferStall = false; // True when browser paused due to buffer underrun (not user action)

    const finish = (interrupted = false) => {
      if (settled) return;
      if (interrupted) console.log(`[TTS:stream] interrupted at ${audio.currentTime.toFixed(3)}s, elapsed=${(performance.now() - t0).toFixed(0)}ms`);
      settled = true;
      if (interrupted) state.chunkWasInterrupted = true;
      if (reader) reader.cancel();
      URL.revokeObjectURL(url);
      if (state.currentAudio === audio) state.currentAudio = null;
      resolve();
    };

    // Shared reject path — pauses audio first to prevent overlap with fallback browser TTS
    const fail = (err) => {
      if (settled) return;
      console.log(`[TTS:stream] fail: ${err?.message}, elapsed=${(performance.now() - t0).toFixed(0)}ms, readyState=${audio.readyState}`);
      settled = true;
      try { audio.pause(); } catch (_) {}
      if (reader) reader.cancel();
      URL.revokeObjectURL(url);
      if (state.currentAudio === audio) state.currentAudio = null;
      reject(err);
    };

    audio.onended = () => finish(false);

    // Track buffer stalls vs real pauses. `waiting` = browser ran out of buffered data;
    // `playing` = playback resumed (clears the stall flag).
    audio.addEventListener('waiting', () => {
      if (!settled) {
        console.log(`[TTS:stream] waiting (buffer stall) at ${audio.currentTime.toFixed(3)}s, readyState=${audio.readyState}`);
        isBufferStall = true;
      }
    });
    audio.addEventListener('playing', () => {
      if (isBufferStall) console.log(`[TTS:stream] playing (stall cleared) at ${audio.currentTime.toFixed(3)}s`);
      isBufferStall = false;
    });
    // When enough data arrives after a stall, force-resume in case the browser didn't auto-resume.
    audio.addEventListener('canplay', () => {
      if (isBufferStall && !settled && !state.isPaused) {
        console.log(`[TTS:stream] canplay — force-resuming after stall`);
        isBufferStall = false;
        audio.play().catch(() => {});
      }
    });

    audio.onpause = () => {
      if (settled) return;
      if (streamEnded) return; // Browser fires pause before ended after endOfStream() — ignore
      if (audio.currentTime === 0 && !state.isPaused) return; // Pre-play buffer-empty stall — ignore
      if (isBufferStall) return; // Mid-stream buffer underrun — appendBuffer loop will catch up
      finish(state.isNarrating && !state.isPaused);
    };

    audio.onerror = () => fail(new Error('Audio playback error'));

    ms.addEventListener('sourceopen', async () => {
      const sb = ms.addSourceBuffer('audio/mpeg');
      reader = response.body.getReader();

      (async () => {
        try {
          let playStarted = false;
          while (true) {
            const { done, value } = await reader.read();
            if (settled) break;

            if (done) {
              if (sb.updating) {
                await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
              }
              if (!settled) {
                streamEnded = true;
                ms.endOfStream();
                storeInCache(cacheKey, new Blob(collectedChunks, { type: 'audio/mpeg' })).catch(() => {});
              }
              break;
            }

            collectedChunks.push(value);
            if (sb.updating) {
              await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
            }
            if (settled) break;
            sb.appendBuffer(value);

            // Start playback after the first chunk is committed to the SourceBuffer.
            // Calling play() before any data is buffered causes Chrome to stall/pause,
            // which triggers our interruption-recovery loop.
            if (!playStarted) {
              playStarted = true;
              await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
              if (!settled) {
                state.narrationT0 = null;
                audio.play().catch(err => fail(err));
              }
            }
          }
        } catch (err) {
          if (!settled) fail(err);
        }
      })();
    });
  });
}

async function fetchFromOpenAI(text, voice, speed, apiKey) {
  const response = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: state.openAiTtsConfig?.model || 'tts-1',
      voice,
      input: text,
      response_format: 'mp3',
      speed
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS ${response.status}: ${errText}`);
  }

  return response.blob();
}

/**
 * Prefetch audio for a future narration chunk into the cache.
 * Fire-and-forget — call while current chunk is playing so the next is ready.
 * Registers in-flight promises in pendingFetches so playWithOpenAITTS can await
 * them instead of firing a duplicate request.
 */
export function prefetchOpenAIChunk(text, speedModifier = 0) {
  const cfg = state.openAiTtsConfig;
  if (!cfg?.apiKey || !text) return;
  const voice = cfg.voice || 'fable';
  const speed = Math.min(4.0, Math.max(0.25, (cfg.speed || 1.0) + speedModifier));

  for (const chunk of splitIntoChunks(text)) {
    (async () => {
      const key = await makeCacheKey(chunk, voice, speed);
      if (await getCachedBlob(key)) return;  // already cached
      if (pendingFetches.has(key)) return;   // already in-flight
      const promise = fetchFromOpenAI(chunk, voice, speed, cfg.apiKey)
        .then(async blob => {
          await storeInCache(key, blob);
          pendingFetches.delete(key);
          return blob;
        })
        .catch(err => {
          pendingFetches.delete(key);
          throw err;
        });
      pendingFetches.set(key, promise);
    })().catch(() => {});
  }
}

/**
 * Speak text via OpenAI TTS.
 * Chunks long text, caches results, tracks cost only for actual API calls.
 */
export async function playWithOpenAITTS(text, speedModifier = 0) {
  const cfg = state.openAiTtsConfig;
  if (!cfg?.apiKey) throw new Error('No OpenAI API key configured');

  const voice = cfg.voice || 'fable';
  const speed = Math.min(4.0, Math.max(0.25, (cfg.speed || 1.0) + speedModifier));
  const apiKey = cfg.apiKey;

  for (const chunk of splitIntoChunks(text)) {
    if ((!state.isNarrating && !state.ttsIsSpeaking) || state.isPaused) break;

    const key = await makeCacheKey(chunk, voice, speed);
    const cachedBlob = await getCachedBlob(key);

    if (cachedBlob) {
      await playBlob(cachedBlob);
    } else if (pendingFetches.has(key)) {
      // Prefetch already in-flight — await it instead of firing a duplicate request.
      // One API call serves both prefetch and playback.
      const blob = await pendingFetches.get(key);
      if ((!state.isNarrating && !state.ttsIsSpeaking) || state.isPaused) break;
      sessionChars += chunk.length;
      updateCostDisplay();
      await playBlob(blob);
    } else if (supportsMediaSourceMp3()) {
      // No prefetch in flight — stream directly. Starts playing at first-byte (~100-300ms).
      await playStreamingFromOpenAI(chunk, voice, speed, apiKey, key);
      sessionChars += chunk.length;
      updateCostDisplay();
    } else {
      // Fallback: fetch full blob first (older Safari, non-supporting browsers)
      const blob = await fetchFromOpenAI(chunk, voice, speed, apiKey);
      await storeInCache(key, blob);
      sessionChars += chunk.length;
      updateCostDisplay();
      await playBlob(blob);
    }
  }
}

export function updateCostDisplay() {
  const el = document.getElementById('openaiTtsCost');
  if (!el) return;
  const cost = getSessionCost();
  el.textContent = cost < 0.001
    ? '≈ $0.000 this session'
    : `≈ $${cost.toFixed(3)} this session`;
}

/**
 * Validate an API key by making a minimal TTS request (2 chars ≈ $0.00003).
 * Throws with a user-facing message if the key is invalid or lacks TTS access.
 */
export async function validateOpenAIKey(apiKey) {
  const response = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'tts-1', voice: 'fable', input: 'Hi', response_format: 'mp3' })
  });
  if (!response.ok) {
    let msg = `Error ${response.status}`;
    try {
      const body = await response.json();
      msg = body?.error?.message || msg;
    } catch (_) {}
    if (response.status === 401) throw new Error('Invalid API key');
    if (response.status === 429) throw new Error('Rate limited — try again shortly');
    throw new Error(msg);
  }
}

export async function testOpenAITTS() {
  const cfg = state.openAiTtsConfig;
  if (!cfg?.apiKey) throw new Error('No API key');

  const testText = 'Hello! This is how I sound. You are standing in a dark room with a mysterious door.';
  const key = await makeCacheKey(testText, cfg.voice || 'fable', cfg.speed || 1.0);
  let blob = await getCachedBlob(key);
  if (!blob) {
    blob = await fetchFromOpenAI(testText, cfg.voice || 'fable', cfg.speed || 1.0, cfg.apiKey);
    await storeInCache(key, blob);
  }
  await playBlob(blob);
}

export function loadOpenAITTSConfig() {
  const raw = localStorage.getItem('iftalk_openaiTts');
  if (raw) {
    try {
      state.openAiTtsConfig = JSON.parse(raw);
    } catch (_) {
      state.openAiTtsConfig = {};
    }
  } else {
    state.openAiTtsConfig = {};
  }
}

export function saveOpenAITTSConfig() {
  localStorage.setItem('iftalk_openaiTts', JSON.stringify(state.openAiTtsConfig || {}));
}
