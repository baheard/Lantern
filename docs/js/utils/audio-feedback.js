/**
 * Audio Feedback Module
 *
 * Provides audio cues for different actions:
 * - Game command sent (gentle tap)
 * - App/navigation command sent (muffled ding)
 * - Low confidence warning (gentle warble)
 * - Blocked command (soft buzz)
 * - Play pressed (rising chirp)
 * - Pause pressed (falling chirp)
 * - Mute pressed (triple tap descending)
 * - Unmute pressed (ascending chime)
 */

import { state } from '../core/state.js';
import { getItem } from './storage/storage-api.js';

let audioCtx = null;

async function getContext() {
  // Recreate if missing or closed (iOS closes AudioContext after extended background)
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy or background)
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Pre-initialize audio context on first user interaction
 * Call this from button clicks to avoid delay on first audio feedback
 */
export function initAudioContext() {
  getContext();
}

/**
 * Get master volume multiplier (0.0 - 1.0)
 * Centralized volume control for all audio feedback
 */
function getMasterVolume() {
  const saved = getItem('iftalk_masterVolume');
  return saved ? parseInt(saved) / 100 : 1.0;
}

/**
 * Check if sound effects are enabled
 * @returns {boolean} True if sound effects should play
 */
function areSoundEffectsEnabled() {
  const setting = getItem('iftalk_soundEffectsEnabled', 'true');
  return setting !== 'false';
}

/**
 * Play tone for game command sent (Subtle Pop)
 */
export async function playCommandSent() {
  // Don't play audio feedback when sound effects are disabled
  if (!areSoundEffectsEnabled()) return;

  try {
    const ctx = await getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const masterVol = getMasterVolume();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Subtle Pop (Sound #8): Very short, barely-there click
    osc.frequency.value = 600;
    osc.type = 'sine';

    // Instant envelope - sharp attack and decay
    gain.gain.setValueAtTime(0.25 * masterVol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.02);
  } catch (err) {
    // Command sent tone error
  }
}

/**
 * Play tone for app/navigation command (Soft Pulse)
 */
export async function playAppCommand() {
  // Don't play audio feedback when sound effects are disabled
  if (!areSoundEffectsEnabled()) return;

  try {
    const ctx = await getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const masterVol = getMasterVolume();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Soft Pulse: Gentle, quiet pulse
    osc.frequency.value = 460;
    osc.type = 'sine';

    // Soft envelope with slow attack
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.10 * masterVol, now + 0.030);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.100);

    osc.start(now);
    osc.stop(now + 0.100);
  } catch (err) {
    // Ignore audio errors
  }
}

/**
 * Play tone for low confidence warning (gentle warble)
 */
export async function playLowConfidence() {
  // Don't play audio feedback when sound effects are disabled
  if (!areSoundEffectsEnabled()) return;

  try{
    const ctx = await getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const masterVol = getMasterVolume();

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 200;
    lfo.frequency.value = 8;
    lfoGain.gain.value = 20;
    osc.type = 'sine';

    gain.gain.setValueAtTime(0.30 * masterVol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    lfo.start(ctx.currentTime);
    osc.start(ctx.currentTime);
    lfo.stop(ctx.currentTime + 0.2);
    osc.stop(ctx.currentTime + 0.2);
  } catch (err) {
    // Ignore audio errors
  }
}

/** Confidence threshold (0.0 - 1.0) */
export const LOW_CONFIDENCE_THRESHOLD = 0.50;

/**
 * Play tone for blocked/failed command (loud buzz - audible during narration)
 */
export async function playBlockedCommand() {
  // Don't play audio feedback when sound effects are disabled
  if (!areSoundEffectsEnabled()) return;

  try {
    const ctx = await getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const masterVol = getMasterVolume();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 150;  // Higher frequency (more noticeable)
    osc.type = 'sawtooth';

    gain.gain.setValueAtTime(0.40 * masterVol, ctx.currentTime);  // Increased from 0.25 to 0.40
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);  // Longer duration

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (err) {
    // Ignore audio errors
  }
}


/**
 * Play tone for mute button (triple tap descending)
 */
export async function playMuteTone() {
  try {
    const ctx = await getContext();
    const masterVol = getMasterVolume();
    const freqs = [300, 250, 200];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.05;
      gain.gain.setValueAtTime(0.3 * masterVol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      osc.start(start);
      osc.stop(start + 0.04);
    });
  } catch (err) {
    // Ignore audio errors
  }
}

/**
 * Play tone for unmute button (ascending chime)
 */
export async function playUnmuteTone() {
  try {
    const ctx = await getContext();
    const masterVol = getMasterVolume();
    // First note (lower)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 660;
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.12 * masterVol, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);
    // Second note (higher)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 880;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.12 * masterVol, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.25);
  } catch (err) {
    // Ignore audio errors
  }
}

/**
 * Play tone before system messages (single clean beep)
 * @returns {Promise<void>} Resolves when beep finishes
 */
export async function playSystemBeep() {
  return new Promise(async (resolve) => {
    try {
      const ctx = await getContext();
      const masterVol = getMasterVolume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      // Clean, neutral beep
      osc.frequency.value = 800;
      osc.type = 'sine';

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.15 * masterVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.start(now);
      osc.stop(now + 0.08);

      // Resolve after beep finishes
      setTimeout(() => resolve(), 80);
    } catch (err) {
      // Ignore audio errors
      resolve();
    }
  });
}
