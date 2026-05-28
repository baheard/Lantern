/**
 * OpenAI TTS Module
 *
 * Calls OpenAI's /v1/audio/speech directly from the browser using the user's
 * own API key. No server proxy — the user's key, browser, and bill.
 *
 * Features: Cache API caching, sentence-boundary chunking, cost tracking.
 */

import { state } from '../core/state.js';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const CACHE_NAME = 'iftalk-openai-tts-v1';
const MAX_CHARS = 4000;
const COST_PER_MILLION_CHARS = 15.00;

let sessionChars = 0;

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
    const cutAt = lastBreak > 0 ? lastBreak + 2 : MAX_CHARS;
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

    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    audio.onended = done;
    audio.onpause = done;   // stopNarration() calls audio.pause() — must resolve here
    audio.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Audio playback error'));
    };

    audio.play().catch(err => { if (!settled) reject(err); });
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
 */
export function prefetchOpenAIChunk(text) {
  const cfg = state.openAiTtsConfig;
  if (!cfg?.apiKey || !text) return;
  const voice = cfg.voice || 'fable';
  const speed = cfg.speed || 1.0;

  for (const chunk of splitIntoChunks(text)) {
    (async () => {
      const key = await makeCacheKey(chunk, voice, speed);
      if (await getCachedBlob(key)) return; // already cached
      const blob = await fetchFromOpenAI(chunk, voice, speed, cfg.apiKey);
      await storeInCache(key, blob);
    })().catch(() => {});
  }
}

/**
 * Speak text via OpenAI TTS.
 * Chunks long text, caches results, tracks cost.
 */
export async function playWithOpenAITTS(text) {
  const cfg = state.openAiTtsConfig;
  if (!cfg?.apiKey) throw new Error('No OpenAI API key configured');

  const voice = cfg.voice || 'fable';
  const speed = cfg.speed || 1.0;
  const apiKey = cfg.apiKey;

  for (const chunk of splitIntoChunks(text)) {
    if ((!state.isNarrating && !state.ttsIsSpeaking) || state.isPaused) break;

    const key = await makeCacheKey(chunk, voice, speed);
    let blob = await getCachedBlob(key);

    if (!blob) {
      blob = await fetchFromOpenAI(chunk, voice, speed, apiKey);
      await storeInCache(key, blob);
    }

    sessionChars += chunk.length;
    updateCostDisplay();

    await playBlob(blob);
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
