/**
 * Status Message Utilities
 *
 * Functions for updating the status bar.
 */

import { dom } from '../core/dom.js';

let _settingsStatusTimeout = null;

/**
 * Update status bar message. When the settings panel is open, also mirrors
 * the message into the settings header status line so it's readable.
 * @param {string} message - Status message to display
 * @param {string} type - Status type ('error', 'success', '')
 */
export function updateStatus(message, type = '') {
  if (dom.status) {
    const statusText = dom.status.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = message;
    } else {
      dom.status.textContent = message;
    }
    dom.status.className = 'status ' + type;
  }

  // Mirror into settings panel when it's open
  const settingsMsg = document.getElementById('settingsStatusMsg');
  if (settingsMsg) {
    settingsMsg.textContent = message;
    settingsMsg.style.opacity = '1';
    clearTimeout(_settingsStatusTimeout);
    _settingsStatusTimeout = setTimeout(() => {
      settingsMsg.style.opacity = '0';
    }, 3000);
  }
}
