import { state } from '../core/state.js';
import { addGameText } from './game-output.js';

/**
 * Respond as if the game sent output — adds text to display and triggers TTS.
 * @param {string} html - HTML content to display
 */
export function respondAsGame(html) {
  addGameText(html, false);

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const plainText = tempDiv.textContent.trim();

  if (state.autoplayEnabled && window.handleGameOutput) {
    window.handleGameOutput(plainText);
  }
}
