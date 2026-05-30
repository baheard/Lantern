/**
 * Centralized Application State
 *
 * Single source of truth for all application state.
 * Export as object so properties can be mutated from other modules.
 */

// Create state object with property tracking for debugging
const _state = {
  // Socket connection
  socket: null,

  // Game state
  currentGamePath: null,
  currentGameName: null,
  currentGameTextElement: null,
  currentStatusLineElement: null,

  // Voice recognition state
  recognition: null,
  isListening: false,
  listeningEnabled: false,
  isRecognitionActive: false,
  isMuted: true,  // Start with microphone muted by default
  manuallyMuted: false,  // Tracks if user explicitly muted (vs auto-muted by system)
  isHoldMic: false,  // When true, mic only responds to "open mic" command
  hasProcessedResult: false,
  hasManualTyping: false,
  pushToTalkMode: false,  // When true, mic only activates while button is held (for car Bluetooth)
  pushToTalkActive: false,  // Tracks whether push-to-talk button is currently being held
  currentInterimTranscript: '',  // Current interim (non-final) recognition text
  pttPendingTranscript: null,  // Final transcript captured during PTT hold; dispatched on button release
  pttPendingConfidence: null,  // Confidence for pttPendingTranscript
  pttReleasePending: false,    // Button released before onstart fired; stop recognition as soon as it starts
  pttStopTimeout: null,        // Delayed recognition.stop() after PTT release (gives buffered audio time to transcribe)
  isSpellingLetters: false,  // True when interim shows 3+ consecutive single letters being spelled
  spellingInterimTranscript: null,  // Saved interim when spelling detected (to override final's word interpretation)

  // Narration state
  pausedByTabSwitch: false,  // Track if narration was auto-paused by tab switch (for auto-resume)
  pausedByHint: false,  // Track if narration was auto-paused for hint gathering
  currentAudio: null,
  narrationEnabled: false,
  _autoplayEnabled: false,  // When true, new content auto-plays and nav buttons auto-start
  isNarrating: false,
  pendingNarrationText: null,
  isCharMode: false,        // true when Z-machine is requesting char (key) input (PAK/menu screens)
  narrationChunks: [],
  chunksValid: false,
  currentChunkIndex: 0,
  isPaused: false,
  narrationSessionId: 0,
  currentChunkStartTime: 0,
  lastStatusBarText: null,  // Track previous status bar text to avoid re-reading
  restoredChunkIndex: null,  // Chunk index restored from autosave (used once after autoload)
  skipNarrationAfterLoad: false,  // When true, position at end of chunks after load (don't read transcript)

  // TTS state
  ttsIsSpeaking: false,
  appVoicePromise: null,

  // Audio analysis
  audioContext: null,
  analyser: null,
  microphone: null,
  voiceMeterInterval: null,
  soundDetected: false,
  pausedForSound: false,
  soundPauseTimeout: null,

  // Navigation
  isNavigating: false,
  isUserScrubbing: false,

  // History & transcripts
  voiceHistoryItems: [],
  commandHistoryItems: [],
  recentlySpokenChunks: [],
  confirmedTranscriptTimeout: null,
  lastHeardClearTimeout: null,
  transcriptResetTimeout: null,
  pendingCommandProcessed: false,

  // Voice config
  browserVoiceConfig: null,

  // OpenAI TTS config (BYOK — stored in localStorage)
  openAiTtsConfig: null,

  // Lock screen state
  isScreenLocked: false,

  // Google Drive sync state
  gdriveSignedIn: false,
  gdriveEmail: null,
  gdriveSyncEnabled: false,
  gdriveLastSyncTime: null,
  gdriveError: null,

  // Autosave grace period: number of turns to skip autosave after a restore
  autosaveGraceMoves: 0,

  // Device tracking
  deviceId: null,
  deviceInfo: null,
  deviceChangeDetected: false,
  lastDeviceId: null
};

// Add getter/setter for autoplayEnabled with logging and persistence
Object.defineProperty(_state, 'autoplayEnabled', {
  get() {
    return this._autoplayEnabled;
  },
  set(value) {
    if (this._autoplayEnabled !== value) {
      // Note: No longer persisting autoplay state - always start paused
    }
    this._autoplayEnabled = value;
  },
  enumerable: true,
  configurable: true
});

export const state = _state;

// Expose state to window for debugging
if (typeof window !== 'undefined') {
  window.state = state;
}

export const constants = {
  SOUND_THRESHOLD: 60,
  SILENCE_DELAY: 800,
  ECHO_CHUNK_RETENTION_MS: 5000,  // 5 seconds - longer retention for Bluetooth audio delays
  ECHO_SIMILARITY_THRESHOLD: 0.3,  // Lower threshold = more aggressive echo blocking (was 0.4)
  VOICE_CONFIDENCE_THRESHOLD: 0.5
};

/**
 * Reset narration state for new content
 */
export function resetNarrationState() {
  state.narrationChunks = [];
  state.chunksValid = false;
  state.currentChunkIndex = 0;
  state.isNarrating = false;
  state.isPaused = false;
  state.currentChunkStartTime = 0;
}

/**
 * Reset voice history
 */
export function resetVoiceHistory() {
  state.voiceHistoryItems = [];
}

/**
 * Reset command history
 */
export function resetCommandHistory() {
  state.commandHistoryItems = [];
}
