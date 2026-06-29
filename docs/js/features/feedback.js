/**
 * Feedback Submission Module
 *
 * Submits user feedback to a Google Form silently (no navigation).
 * Uses mode: 'no-cors' so the response is opaque — we can't confirm delivery,
 * but the POST reliably lands on Google's side.
 */

import { APP_CONFIG } from '../config.js';
import { getStatusLog } from '../utils/status.js';

const FORM_ID        = '1FAIpQLSfdB2XXAsBC7D-aMb6z0NbquRy29VV6Qlx_soZ54EvPBwjMEA';
const FIELD_GAME     = 'entry.1142768170';
const FIELD_FEEDBACK = 'entry.1685903629';
const FIELD_DEVICE   = 'entry.1513299264';
const FIELD_CONSOLE  = 'entry.2119856681';
const FIELD_OUTPUT   = 'entry.1330585358';
const FIELD_VERSION  = 'entry.788116155';

const OUTPUT_CHAR_LIMIT  = 1500;
const CONSOLE_CHAR_LIMIT = 800;
const STATUS_CHAR_LIMIT  = 700;

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
 * Get the recent status-message log (last ~700 chars). The on-screen status bar
 * was removed in #182, so these messages are folded into feedback instead.
 * @returns {string}
 */
export function getStatusMessages() {
  const log = getStatusLog();
  if (!log.length) return '';
  let result = '';
  for (let i = log.length - 1; i >= 0; i--) {
    const line = log[i] + '\n';
    if (result.length + line.length > STATUS_CHAR_LIMIT) break;
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
  // The status-message log rides in the console field with a header — the form
  // has a fixed set of fields, and status messages are diagnostic like console.
  const statusMsgs = getStatusMessages();
  const consoleLog = getConsoleLog();
  const diagnostics = [
    statusMsgs && `--- Status messages ---\n${statusMsgs}`,
    consoleLog && `--- Console ---\n${consoleLog}`,
  ].filter(Boolean).join('\n\n');

  const formData = new URLSearchParams({
    [FIELD_GAME]:     gameName,
    [FIELD_FEEDBACK]: feedbackText,
    [FIELD_DEVICE]:   getDeviceInfo(),
    [FIELD_CONSOLE]:  diagnostics,
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

/**
 * Submit free-text feedback about a single hint. Rides the same Google Form as
 * submitFeedback() — an external automation files these as `feedback`-labelled
 * GitHub issues, which `/triage-feedback --consolidate` (and `/review-notes`)
 * fold into `docs/games/hints/_review-notes.json` and then close. The structured
 * header line is the contract those skills parse. See .tome/hints-feedback-system.md.
 *
 * Text-only (no 👍/👎 rating) and not locked — the player can leave as many
 * comments on a hint as they like.
 *
 * @param {Object} p
 * @param {string} p.gameName
 * @param {string} p.sectionId
 * @param {string} p.questionId
 * @param {number} p.hintIndex     - 0-based index of the commented hint
 * @param {number} p.total         - total hints in the question
 * @param {string} p.hintText      - the exact hint text being commented on
 * @param {string} [p.hintsVersion]- meta.appVersion (or generatedAt) of the hints file
 * @param {string} p.comment       - the player's free-text comment
 * @returns {Promise<void>}
 */
export async function submitHintFeedback({
  gameName, sectionId, questionId, hintIndex, total,
  hintText, hintsVersion, comment,
}) {
  const lines = [
    `[HINT] game=${gameName} · section=${sectionId} · q=${questionId} `
      + `· hint=${hintIndex + 1}/${total} · hintsVersion=${hintsVersion || 'unknown'}`,
    `"${hintText}"`,
    '',
    `Comment: ${comment && comment.trim() ? comment.trim() : '(none)'}`,
  ];
  await submitFeedback(lines.join('\n'), gameName || 'None');
}

/**
 * Compute a short content fingerprint of an image so feedback can be matched to
 * the *exact* picture it was about — a regen overwrites the same path, so the
 * filename alone can't tell `/review-notes` whether the committed art still
 * matches what the player saw. SHA-256 of the bytes, first 12 hex chars.
 *
 * @param {string} url - the displayed image URL
 * @returns {Promise<string>} short hex hash, or '' if it couldn't be computed
 */
export async function hashImage(url) {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].slice(0, 6)
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

/**
 * Submit free-text feedback about a single location image. Rides the same Google
 * Form rails; `/triage-feedback --consolidate` and `/review-notes` fold these
 * `[ART]` issues into `docs/games/images/_review-notes.json` (as `[player]`-tagged
 * notes), then close them. The image hash lets the skill flag the note stale if
 * the committed picture has since been regenerated.
 *
 * @param {Object} p
 * @param {string} p.gameName
 * @param {string} p.location  - location name as shown in-app
 * @param {string} p.file      - committed image filename (e.g. "alley.png")
 * @param {string} [p.hash]    - short content hash of the displayed image
 * @param {string} p.comment   - the player's free-text comment
 * @returns {Promise<void>}
 */
export async function submitArtFeedback({ gameName, location, file, hash, comment }) {
  const lines = [
    `[ART] game=${gameName} · location=${location} · image=${file || 'unknown'} `
      + `· hash=${hash || 'unknown'} · appVersion=${APP_CONFIG.version}`,
    '',
    `Comment: ${comment && comment.trim() ? comment.trim() : '(none)'}`,
  ];
  await submitFeedback(lines.join('\n'), gameName || 'None');
}
