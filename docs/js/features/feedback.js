/**
 * Feedback Submission Module
 *
 * Submits user feedback to a Google Form silently (no navigation).
 * Uses mode: 'no-cors' so the response is opaque — we can't confirm delivery,
 * but the POST reliably lands on Google's side.
 */

import { APP_CONFIG } from '../config.js';

const FORM_ID        = '1FAIpQLSfdB2XXAsBC7D-aMb6z0NbquRy29VV6Qlx_soZ54EvPBwjMEA';
const FIELD_GAME     = 'entry.1142768170';
const FIELD_FEEDBACK = 'entry.1685903629';
const FIELD_DEVICE   = 'entry.1513299264';
const FIELD_CONSOLE  = 'entry.2119856681';
const FIELD_OUTPUT   = 'entry.1330585358';
const FIELD_VERSION  = 'entry.788116155';

const OUTPUT_CHAR_LIMIT  = 1500;
const CONSOLE_CHAR_LIMIT = 800;

/**
 * Collect device/browser info as a compact string.
 * @returns {string}
 */
export function getDeviceInfo() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'unknown';
  let os = 'Other';
  if (/iPhone|iPad/.test(ua)) os = /iPad/.test(ua) ? 'iPad' : 'iPhone';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Win/.test(platform)) os = 'Windows';
  else if (/Mac/.test(platform)) os = 'Mac';
  else if (/Linux/.test(platform)) os = 'Linux';

  let browser = 'Other';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  return `${os} / ${browser}`;
}

/**
 * Get recent game output as plain text (last ~800 chars).
 * @returns {string}
 */
export function getRecentOutput() {
  const lowerWindow = document.getElementById('lowerWindow');
  if (!lowerWindow) return '';
  const text = lowerWindow.innerText || lowerWindow.textContent || '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > OUTPUT_CHAR_LIMIT
    ? '…' + trimmed.slice(-OUTPUT_CHAR_LIMIT)
    : trimmed;
}

/**
 * Get recent console output from the rolling buffer (last ~800 chars).
 * @returns {string}
 */
export function getConsoleLog() {
  const buf = window.__consoleBuffer;
  if (!buf || buf.length === 0) return '';
  // Take from the end, building up to the char limit
  let result = '';
  for (let i = buf.length - 1; i >= 0; i--) {
    const line = buf[i] + '\n';
    if (result.length + line.length > CONSOLE_CHAR_LIMIT) break;
    result = line + result;
  }
  return result.trim();
}

/**
 * Submit feedback to Google Form.
 * @param {string} feedbackText - User's feedback text
 * @param {string} gameName - Current game name (or 'None')
 * @returns {Promise<void>}
 */
export async function submitFeedback(feedbackText, gameName = 'None') {
  const formData = new URLSearchParams({
    [FIELD_GAME]:     gameName,
    [FIELD_FEEDBACK]: feedbackText,
    [FIELD_DEVICE]:   getDeviceInfo(),
    [FIELD_CONSOLE]:  getConsoleLog(),
    [FIELD_OUTPUT]:   getRecentOutput(),
    [FIELD_VERSION]:  APP_CONFIG.version,
  });

  try {
    await fetch(`https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`, {
      method: 'POST',
      body: formData,
      mode: 'no-cors',
    });
  } catch {
    // no-cors fetch may throw in some browsers; the POST still lands
  }
}
