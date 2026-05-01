/**
 * Voice / App Command Handlers
 *
 * The behavior bound to each voice keyword (and the same handlers used by the
 * pause/play button click). Extracted from app.js — see code-review Tier 2 Batch 1.
 *
 * Mic state is intentionally decoupled from playback — see .tome/mic-narration-coupling.md.
 */

import { state } from '../core/state.js';
import { dom } from '../core/dom.js';
import { updateStatus } from '../utils/status.js';
import { speakTextChunked, stopNarration, speakAppMessage } from '../narration/tts-player.js';
import { skipToChunk, skipToStart, skipToEnd } from '../narration/navigation.js';
import { updateNavButtons } from '../ui/nav-buttons.js';
import { quickSave, quickLoad } from '../game/save-manager.js';
import { startVoiceMeter, stopVoiceMeter } from './voice-meter.js';
import { playMuteTone, playUnmuteTone } from '../utils/audio-feedback.js';
import { updateLockScreenMicStatus, updateLockButtonVisibility } from '../utils/lock-screen.js';
import { updateVoiceTranscript } from '../input/keyboard/voice-ui.js';
import { sendCommandDirect } from '../game/commands/index.js';

// Shared playback transitions used by both the voice "pause"/"play" handlers below
// and the pause-play button click in app.js.
export function pausePlayback() {
  state.autoplayEnabled = false;
  state.narrationEnabled = false;
  state.isPaused = true;
  stopNarration(true);  // Preserve highlight when pausing
  updateStatus('Autoplay off');
  updateNavButtons();
}

export async function resumePlayback() {
  state.autoplayEnabled = true;
  state.narrationEnabled = true;
  state.isPaused = false;

  if (state.narrationChunks.length > 0 && state.currentChunkIndex < state.narrationChunks.length) {
    // Resume from current position
    speakTextChunked(null, state.currentChunkIndex);
  } else {
    // At end or no chunks — try to read the last game response (or upper-window content like Photopia's intro)
    const { ensureChunksReady } = await import('../ui/game-output.js');
    const lowerWindow = document.getElementById('lowerWindow');
    const gameTexts = lowerWindow?.querySelectorAll('.game-text');
    const lastGameText = gameTexts && gameTexts.length > 0 ? gameTexts[gameTexts.length - 1] : null;

    state.chunksValid = false;
    state.narrationChunks = [];
    state.currentGameTextElement = lastGameText || null;

    if (ensureChunksReady() && state.narrationChunks.length > 0) {
      state.currentChunkIndex = 0;
      speakTextChunked(null, 0);
    }
  }

  updateStatus('Autoplay on');
  updateNavButtons();
}

export const voiceCommandHandlers = {
  restart: () => {
    state.autoplayEnabled = true;
    skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
  },
  back: () => {
    state.autoplayEnabled = true;
    skipToChunk(-1, () => speakTextChunked(null, state.currentChunkIndex));
  },
  backN: (count) => {
    state.autoplayEnabled = true;
    skipToChunk(-count, () => speakTextChunked(null, state.currentChunkIndex));
  },
  pause: () => {
    if (state.autoplayEnabled || state.isNarrating) {
      pausePlayback();
    }
  },
  play: async () => {
    // If at end, restart from beginning (like "repeat")
    if (state.narrationChunks.length > 0 && state.currentChunkIndex >= state.narrationChunks.length) {
      state.autoplayEnabled = true;
      skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
      return;
    }
    if (!state.autoplayEnabled) {
      await resumePlayback();
    }
  },
  skip: () => {
    state.autoplayEnabled = true;
    skipToChunk(1, () => speakTextChunked(null, state.currentChunkIndex));
  },
  skipN: (count) => {
    state.autoplayEnabled = true;
    skipToChunk(count, () => speakTextChunked(null, state.currentChunkIndex));
  },
  skipToEnd: () => {
    state.autoplayEnabled = true;
    skipToEnd();
  },
  status: () => {
    const statusText = dom.statusBar?.textContent?.trim();
    if (statusText) {
      speakAppMessage(statusText);
      updateStatus('Reading status');
    } else {
      speakAppMessage('No status presently shown');
      updateStatus('No status to read');
    }
  },
  quickSave: () => quickSave(),
  quickLoad: () => quickLoad(),
  restoreLatest: async () => {
    try {
      const { handleRestoreCommand } = await import('../game/commands/meta-command-handlers.js');
      await handleRestoreCommand();
    } catch (error) {
      console.error('Error in restoreLatest:', error);
      updateStatus('Restore failed', 'error');
      speakAppMessage('Restore command failed');
    }
  },
  restoreSlot: async (slot) => {
    try {
      const { getUnifiedSavesList } = await import('../game/commands/save-list-formatter.js');
      const { handleMetaResponse, setAwaitingMetaInput } = await import('../game/commands/meta-command-handlers.js');

      const allSaves = getUnifiedSavesList();

      if (!slot || slot < 1 || slot > allSaves.length) {
        speakAppMessage(`Invalid slot number. There are ${allSaves.length} saved games.`);
        updateStatus('Invalid slot number');
        return;
      }

      setAwaitingMetaInput('restore');
      await handleMetaResponse(slot.toString());
    } catch (error) {
      console.error('Error in restoreSlot:', error);
      updateStatus('Restore failed', 'error');
      speakAppMessage('Restore command failed');
    }
  },
  saveGame: async () => {
    try {
      const { handleSaveCommand } = await import('../game/commands/meta-command-handlers.js');
      await handleSaveCommand();
    } catch (error) {
      console.error('Error in saveGame:', error);
      updateStatus('Save failed', 'error');
      speakAppMessage('Save command failed');
    }
  },
  unmute: async () => {
    state.isMuted = false;
    state.manuallyMuted = false;  // User manually unmuted - allow auto-management again
    state.listeningEnabled = true;
    const icon = dom.muteBtn?.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic';
    if (dom.muteBtn) dom.muteBtn.classList.remove('muted');
    startVoiceMeter();
    updateStatus('Starting microphone...');
    updateNavButtons();
    updateLockScreenMicStatus();
    updateLockButtonVisibility();

    if (dom.userInput) dom.userInput.placeholder = 'Say command...';

    if (state.recognition && !state.isRecognitionActive) {
      const { startRecognitionSafely } = await import('./recognition.js');
      const success = await startRecognitionSafely();

      if (success) {
        playUnmuteTone();
        updateStatus('Microphone unmuted - Listening...');
      } else {
        // Revert UI to muted state (error buzz already played by startRecognitionSafely)
        state.isMuted = true;
        state.listeningEnabled = false;
        if (icon) icon.textContent = 'mic_off';
        if (dom.muteBtn) {
          dom.muteBtn.classList.add('muted');
          dom.muteBtn.classList.remove('listening');
          dom.muteBtn.style.setProperty('--mic-intensity', '0');
        }
        stopVoiceMeter();
        updateNavButtons();
        updateLockScreenMicStatus();
        updateLockButtonVisibility();

        if (dom.userInput) dom.userInput.placeholder = 'Type a command...';
      }
    } else {
      // Recognition not available or already active
      playUnmuteTone();
      updateStatus('Microphone unmuted - Listening...');
    }
  },
  mute: () => {
    playMuteTone();
    state.isMuted = true;
    state.manuallyMuted = true;  // User manually muted - break auto-link to play/pause
    state.listeningEnabled = false;
    const icon = dom.muteBtn?.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic_off';
    if (dom.muteBtn) {
      dom.muteBtn.classList.add('muted');
      dom.muteBtn.classList.remove('listening');
      dom.muteBtn.style.setProperty('--mic-intensity', '0');
    }
    stopVoiceMeter();
    updateStatus('Microphone muted');
    updateNavButtons();
    updateLockScreenMicStatus();
    updateLockButtonVisibility();

    if (dom.userInput) dom.userInput.placeholder = 'Type a command...';

    if (state.recognition && state.isRecognitionActive) {
      try {
        state.recognition.stop();
      } catch (err) {
        // Ignore stop errors
      }
    }
  },
  holdMic: async () => {
    playMuteTone();
    state.isHoldMic = true;
    state.currentInterimTranscript = '';
    updateStatus('Frozen - Say "Unfreeze" to resume');
    updateVoiceTranscript('Frozen', 'listening');
    if (dom.voiceTranscript) dom.voiceTranscript.textContent = 'Frozen';

    const { addGameText } = await import('../ui/game-output.js');
    addGameText('<div class="system-message">Frozen. Say "unfreeze" to resume.</div>', false);

    updateLockScreenMicStatus();
    // Keep recognition active so we still hear "unfreeze".
  },
  openMic: async () => {
    playUnmuteTone();
    state.isHoldMic = false;
    updateStatus('Microphone listening...');
    updateVoiceTranscript('Listening...', 'listening');
    if (dom.voiceTranscript) dom.voiceTranscript.textContent = 'Listening...';

    const { addGameText } = await import('../ui/game-output.js');
    addGameText('<div class="system-message">Microphone listening</div>', false);

    updateLockScreenMicStatus();
  },
  sendCommandDirect: (cmd) => sendCommandDirect(cmd),
};
