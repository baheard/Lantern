/**
 * Status Message Utilities
 *
 * Functions for updating the status bar.
 */

import { dom } from '../core/dom.js';

let _settingsStatusTimeout = null;

// Rolling log of status messages. The on-screen status bar was removed to save
// vertical space (#182), so these messages would otherwise be invisible — we
// keep the last N here and fold them into feedback reports (see feedback.js).
const STATUS_LOG_LIMIT = 50;
const _statusLog = [];
let _lastStatusText = '';

/**
 * Recent status messages, oldest → newest. Each entry: "[hh:mm:ss] message".
 * @returns {string[]}
 */
export function getStatusLog() {
  return _statusLog.slice();
}

/**
 * Update status bar message. When the settings panel is open, also mirrors
 * the message into the settings header status line so it's readable.
 * @param {string} message - Status message to display
 * @param {string} type - Status type ('error', 'success', '')
 */
export function updateStatus(message, type = '') {
  // Record into the rolling log (skip empties and exact consecutive repeats).
  const text = (message || '').trim();
  if (text && text !== _lastStatusText) {
    _lastStatusText = text;
    const ts = new Date().toTimeString().slice(0, 8);
    _statusLog.push(`[${ts}]${type ? ` (${type})` : ''} ${text}`);
    if (_statusLog.length > STATUS_LOG_LIMIT) _statusLog.shift();
  }

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
