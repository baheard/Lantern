/**
 * Voice Selection Module
 *
 * Handles voice dropdown population, defaults, filtering, and testing.
 */

import { state } from '../../core/state.js';
import { dom } from '../../core/dom.js';
import { updateStatus } from '../../utils/status.js';

// Detect iOS device
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Detect Windows
const isWindows = /Win/.test(navigator.platform);

// Detect Mac (excludes iOS which also reports MacIntel)
const isMac = /Mac/.test(navigator.platform) && !isIOS;

// iOS preferred voices (starred, shown at top, in order)
// High-quality and classic Mac voices
const IOS_PREFERRED_VOICES = [
  // Modern high-quality voices
  { name: 'Karen', lang: 'en-AU' },      // Australian - warm, clear
  { name: 'Daniel', lang: 'en-GB' },     // British male - professional
  { name: 'Moira', lang: 'en-IE' },      // Irish female - expressive
  { name: 'Samantha', lang: 'en-US' },   // US female - clear, loud
  { name: 'Tessa', lang: 'en-ZA' },      // South African - distinctive
  // Classic Mac novelty voices
  { name: 'Fred', lang: 'en-US' },       // Original Mac voice - robotic
  { name: 'Ralph', lang: 'en-US' },      // MacinTalk - used in WALL-E
  { name: 'Junior', lang: 'en-US' }      // MacinTalk 3 - child-like
];

// Preferred voices in order of preference (researched quality voices)
// Chrome uses Google voices, other browsers use system voices
const VOICE_PREFERENCES = [
  // iOS/macOS preferred voices
  'Karen',
  'Daniel',
  'Tessa',
  'Moira',
  'Samantha',
  // Chrome/Google voices (best quality)
  'Google UK English Male',
  'Google UK English Female',
  'Google US English',
  // Microsoft voices (Windows)
  'Microsoft Hazel - English (United Kingdom)',
  'Microsoft George - English (United Kingdom)',
  'Microsoft Susan - English (United Kingdom)',
  'Microsoft Ryan - English (United Kingdom)',
  'Microsoft Sonia - English (United Kingdom)',
  'Microsoft Zira - English (United States)',
  // Classic Mac voices
  'Fred',
  'Ralph',
  'Junior',
  // macOS voices
  'Alex',
  // Fallbacks
  'English United Kingdom',
  'English United States'
];

/**
 * Get the best available voice from preferences
 * On iOS: Default to Karen (en-AU) for narrator
 * @param {Array} voices - Available voices
 * @returns {SpeechSynthesisVoice|null} Best matching voice or null
 */
export function getDefaultVoice(voices) {
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));

  // On iOS, default to Karen first
  if (isIOS) {
    for (const pref of IOS_PREFERRED_VOICES) {
      const match = englishVoices.find(v =>
        v.name === pref.name ||
        v.name.includes(pref.name)
      );
      if (match) return match;
    }
  }

  // Try each preferred voice in order
  for (const preferred of VOICE_PREFERENCES) {
    const match = englishVoices.find(v =>
      v.name === preferred ||
      v.name.includes(preferred)
    );
    if (match) return match;
  }

  // Fallback: first English voice
  return englishVoices[0] || null;
}

/**
 * Get the best available app voice from preferences
 * On iOS: Default to Daniel (en-GB) for app voice
 * On Windows: Default to Zira (en-US) for app voice
 * @param {Array} voices - Available voices
 * @returns {SpeechSynthesisVoice|null} Best matching voice or null
 */
export function getDefaultAppVoice(voices) {
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));

  // On iOS, prefer Daniel for app voice (different from narrator)
  if (isIOS) {
    // Try Daniel first, then Karen, then Tessa
    const appPreferredOrder = [
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Karen', lang: 'en-AU' },
      { name: 'Tessa', lang: 'en-ZA' }
    ];

    for (const pref of appPreferredOrder) {
      const match = englishVoices.find(v =>
        v.name === pref.name ||
        v.name.includes(pref.name)
      );
      if (match) return match;
    }
  }

  // On Windows, prefer Zira for app voice
  if (isWindows) {
    const zira = englishVoices.find(v =>
      v.name.includes('Zira') ||
      v.name === 'Microsoft Zira - English (United States)'
    );
    if (zira) return zira;
  }

  // Try each preferred voice in order
  for (const preferred of VOICE_PREFERENCES) {
    const match = englishVoices.find(v =>
      v.name === preferred ||
      v.name.includes(preferred)
    );
    if (match) return match;
  }

  // Fallback: first English voice
  return englishVoices[0] || null;
}

/**
 * Check if a voice is in the iOS preferred list
 * @param {SpeechSynthesisVoice} voice - Voice to check
 * @returns {number} Index in preferred list, or -1 if not preferred
 */
function getIOSPreferredIndex(voice) {
  return IOS_PREFERRED_VOICES.findIndex(pref =>
    voice.name === pref.name ||
    voice.name.includes(pref.name)
  );
}

/**
 * Filter and sort voices
 * - Deduplicate voices (iOS returns duplicates)
 * - Preferred (starred) voices at top, then all other English voices alphabetically
 */
function filterAndSortVoices(voices) {
  // Filter to English voices only
  let filtered = voices.filter(voice => voice.lang.startsWith('en'));

  // Deduplicate by voice name (iOS often returns duplicates)
  const seen = new Set();
  filtered = filtered.filter(voice => {
    if (seen.has(voice.name)) return false;
    seen.add(voice.name);
    return true;
  });

  // Sort: preferred voices first (in order), then all other voices alphabetically
  filtered.sort((a, b) => {
    const aPreferred = getIOSPreferredIndex(a);
    const bPreferred = getIOSPreferredIndex(b);

    // Both preferred: sort by preferred order
    if (aPreferred !== -1 && bPreferred !== -1) {
      return aPreferred - bPreferred;
    }
    // Only a is preferred
    if (aPreferred !== -1) return -1;
    // Only b is preferred
    if (bPreferred !== -1) return 1;

    // Neither preferred: local voices first, then alphabetically
    if (a.localService !== b.localService) {
      return a.localService ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return filtered;
}

/**
 * Get display name for a voice (with star if preferred)
 * @param {SpeechSynthesisVoice} voice - Voice object
 * @returns {string} Display name with optional star
 */
function getVoiceDisplayName(voice) {
  const star = isIOS && getIOSPreferredIndex(voice) !== -1 ? '★ ' : '';
  // Skip lang suffix when the name already has a parenthesized region (e.g. "Microsoft Zira - English (United States)")
  const langSuffix = / \([^)]+\)$/.test(voice.name) ? '' : ` (${voice.lang})`;
  return `${star}${voice.name}${langSuffix}`;
}

/**
 * Populate voice dropdown
 */
let _voiceRetries = 0;
export function populateVoiceDropdown() {
  const voices = speechSynthesis.getVoices();

  if (voices.length === 0) {
    if (_voiceRetries++ < 50) setTimeout(populateVoiceDropdown, 100); // give up after ~5s
    return;
  }
  _voiceRetries = 0;

  // Filter to English voices only (deduped, sorted, iOS-restricted if on iOS)
  const filteredVoices = filterAndSortVoices(voices);

  // Get default voice for fallback
  const defaultVoice = getDefaultVoice(voices);

  // Populate narrator voice dropdown
  if (dom.voiceSelect) {
    dom.voiceSelect.innerHTML = '';

    // Get saved voice (undefined means use default)
    const savedVoice = state.browserVoiceConfig?.voice;
    const selectedVoice = savedVoice || defaultVoice?.name;

    filteredVoices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = getVoiceDisplayName(voice);

      if (voice.name === selectedVoice) {
        option.selected = true;
      }

      dom.voiceSelect.appendChild(option);
    });
  }

  // Populate app voice dropdown
  if (dom.appVoiceSelect) {
    dom.appVoiceSelect.innerHTML = '';

    // Get saved voice (undefined means use default app voice)
    const savedAppVoice = state.browserVoiceConfig?.appVoice;
    const defaultAppVoice = getDefaultAppVoice(voices);
    const selectedAppVoice = savedAppVoice || defaultAppVoice?.name;

    filteredVoices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = getVoiceDisplayName(voice);

      if (voice.name === selectedAppVoice) {
        option.selected = true;
      }

      dom.appVoiceSelect.appendChild(option);
    });
  }

  initMoreVoicesHint();
}

/**
 * Load browser voice config from localStorage
 * (No server-side config - fully client-side app)
 */
export function loadBrowserVoiceConfig() {
  // Initialize config object if needed
  if (!state.browserVoiceConfig) state.browserVoiceConfig = {};

  // Load global voice settings from localStorage
  const savedNarratorVoice = localStorage.getItem('iftalk_narratorVoice');
  if (savedNarratorVoice) {
    state.browserVoiceConfig.voice = savedNarratorVoice;
  }

  const savedAppVoice = localStorage.getItem('iftalk_appVoice');
  if (savedAppVoice) {
    state.browserVoiceConfig.appVoice = savedAppVoice;
  }

  // Load global speech rate
  const savedSpeechRate = localStorage.getItem('iftalk_speechRate');
  if (savedSpeechRate) {
    state.browserVoiceConfig.rate = parseFloat(savedSpeechRate);
  }

  // Load global volume
  const savedVolume = localStorage.getItem('iftalk_masterVolume');
  const volume = savedVolume ? parseInt(savedVolume) / 100 : 1.0;
  state.browserVoiceConfig.volume = volume;

  // Populate dropdown after loading config
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = populateVoiceDropdown;
    populateVoiceDropdown();
  }
}

/**
 * Initialize voice selection handlers
 */
export function initVoiceSelection() {
  // Narrator voice selection
  if (dom.voiceSelect) {
    dom.voiceSelect.addEventListener('change', (e) => {
      if (!state.browserVoiceConfig) state.browserVoiceConfig = {};
      state.browserVoiceConfig.voice = e.target.value;

      // Save to global localStorage
      localStorage.setItem('iftalk_narratorVoice', e.target.value);
      updateStatus(`✓ Narrator voice: ${e.target.value}`);
    });
  }

  // App voice selection
  if (dom.appVoiceSelect) {
    dom.appVoiceSelect.addEventListener('change', (e) => {
      if (!state.browserVoiceConfig) state.browserVoiceConfig = {};
      state.browserVoiceConfig.appVoice = e.target.value;

      // Save to global localStorage
      localStorage.setItem('iftalk_appVoice', e.target.value);
      updateStatus(`✓ App voice: ${e.target.value}`);
    });
  }

  // Test narrator voice button
  const testVoiceBtn = document.getElementById('testVoiceBtn');
  if (testVoiceBtn) {
    testVoiceBtn.addEventListener('click', () => {
      if (!dom.voiceSelect || !('speechSynthesis' in window)) {
        updateStatus('Voice not available');
        return;
      }

      const testText = 'Hello! This is how I sound. You are standing in a dark room with a mysterious door.';
      const utterance = new SpeechSynthesisUtterance(testText);
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === dom.voiceSelect.value);

      if (voice) utterance.voice = voice;
      utterance.rate = state.browserVoiceConfig?.rate || 1.0;
      utterance.pitch = state.browserVoiceConfig?.pitch || 1.0;

      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);

      updateStatus('Testing voice: ' + dom.voiceSelect.value);
    });
  }

  // Test app voice button
  if (dom.testAppVoiceBtn) {
    dom.testAppVoiceBtn.addEventListener('click', () => {
      if (!dom.appVoiceSelect || !('speechSynthesis' in window)) {
        updateStatus('App voice not available');
        return;
      }

      const testText = 'Hello! This is the app voice. I will use this voice to ask you questions.';
      const utterance = new SpeechSynthesisUtterance(testText);
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === dom.appVoiceSelect.value);

      if (voice) utterance.voice = voice;
      utterance.rate = state.browserVoiceConfig?.rate || 1.0;
      utterance.pitch = state.browserVoiceConfig?.pitch || 1.0;

      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);

      updateStatus('Testing app voice: ' + dom.appVoiceSelect.value);
    });
  }

  initMoreVoicesHint();
}

function initMoreVoicesHint() {
  const hint = document.getElementById('moreVoicesHint');
  if (!hint) return;

  let html;
  if (isWindows) {
    html = 'Missing a voice? <a href="ms-settings:speech">Open Windows Speech Settings</a> to download more.';
  } else if (isIOS) {
    html = 'Missing a voice? <strong>Settings → Accessibility → Spoken Content → Voices → English</strong> to download more.';
  } else if (isMac) {
    html = 'Missing a voice? <strong>System Settings → Accessibility → Spoken Content → Manage Voices</strong> to download more.';
  } else {
    html = 'Voice availability depends on your OS and browser. In Chrome, Google voices load automatically.';
  }

  hint.innerHTML = html;
}
