/**
 * Voice Meter Module
 *
 * Audio visualization for voice input.
 * Monitors microphone levels for visual feedback.
 */

import { state, constants } from '../core/state.js';
import { dom } from '../core/dom.js';
import { setVoiceSpeaking, updateVoiceTranscript } from '../input/keyboard/index.js';

/**
 * Start voice meter (audio visualization and sound detection)
 */
export async function startVoiceMeter() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Save stream so we can stop it later
    state.microphoneStream = stream;

    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.microphone = state.audioContext.createMediaStreamSource(stream);

    state.analyser.fftSize = 256;
    state.microphone.connect(state.analyser);

    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Update meter and detect sound for pause/resume
    state.voiceMeterInterval = setInterval(() => {
      state.analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const percentage = Math.min(100, (average / 128) * 100);

      // Update mute button with volume-based glow
      // But NOT when muted - keep muted state
      if (!state.isMuted && dom.muteBtn) {
        // Set CSS variable for volume-based glow intensity (0-1 scale)
        const intensity = Math.min(1, percentage / 100);
        dom.muteBtn.style.setProperty('--mic-intensity', intensity);

        // Add 'listening' class when mic is active (for green color)
        if (!dom.muteBtn.classList.contains('listening')) {
          dom.muteBtn.classList.add('listening');
        }

        // Update voice indicator speaking state
        if (percentage > 20) {
          setVoiceSpeaking(true);
        } else {
          setVoiceSpeaking(false);
        }
      }

      // Sound detection (for voice visualization only, no longer pauses narration)
    }, 50);

  } catch (error) {
    // Voice meter error
  }
}

/**
 * Stop voice meter
 */
export function stopVoiceMeter() {
  if (state.voiceMeterInterval) {
    clearInterval(state.voiceMeterInterval);
    state.voiceMeterInterval = null;
  }

  if (state.soundPauseTimeout) {
    clearTimeout(state.soundPauseTimeout);
    state.soundPauseTimeout = null;
  }

  // Reset sound detection state
  state.soundDetected = false;
  state.pausedForSound = false;

  // IMPORTANT: Stop all media stream tracks to release the microphone
  if (state.microphoneStream) {
    state.microphoneStream.getTracks().forEach(track => track.stop());
    state.microphoneStream = null;
  }

  // Cleanup audio context
  if (state.microphone) {
    state.microphone.disconnect();
    state.microphone = null;
  }

  if (state.analyser) {
    state.analyser.disconnect();
    state.analyser = null;
  }

  if (state.audioContext && state.audioContext.state !== 'closed') {
    state.audioContext.close();
    state.audioContext = null;
  }

}
