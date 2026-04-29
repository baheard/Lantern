/**
 * Navigation Buttons Module
 *
 * Updates navigation button states based on current playback position.
 */

import { state } from '../core/state.js';

/**
 * Update navigation button states
 */
export function updateNavButtons() {
  const skipToStartBtn = document.getElementById('skipToStartBtn');
  const prevBtn = document.getElementById('prevChunkBtn');
  const nextBtn = document.getElementById('nextChunkBtn');
  const skipToEndBtn = document.getElementById('skipToEndBtn');
  const pausePlayBtn = document.getElementById('pausePlayBtn');

  if (skipToStartBtn) {
    skipToStartBtn.disabled = state.currentChunkIndex <= 0;
  }

  if (prevBtn) {
    prevBtn.disabled = state.currentChunkIndex <= 0;
  }

  if (nextBtn) {
    nextBtn.disabled = state.currentChunkIndex >= state.narrationChunks.length - 1;
  }

  if (skipToEndBtn) {
    skipToEndBtn.disabled = state.currentChunkIndex >= state.narrationChunks.length;
  }

  // Update pause/play button icon based on autoplay mode
  // When autoplayEnabled is true, show PAUSE icon (even if not currently playing)
  // When autoplayEnabled is false, show PLAY icon
  if (pausePlayBtn) {
    const iconSpan = pausePlayBtn.querySelector('.material-icons');
    if (state.autoplayEnabled) {
      if (iconSpan) iconSpan.textContent = 'pause';
      pausePlayBtn.title = 'Pause (Exit Autoplay)';
      pausePlayBtn.classList.add('playing');
    } else {
      if (iconSpan) iconSpan.textContent = 'play_arrow';
      pausePlayBtn.title = 'Play (Enter Autoplay)';
      pausePlayBtn.classList.remove('playing');
    }
  }

}
