/**
 * Feedback Modal
 *
 * Opens a modal for leaving feedback via the quick menu button.
 * Auto-populates game name and device/browser; user types their note.
 */

import { state } from '../core/state.js';
import { submitFeedback, getDeviceInfo } from '../features/feedback.js';

let overlay = null;
let textarea = null;
let gameEl = null;
let deviceEl = null;
let subjectEl = null;
let submitBtn = null;
let cancelBtn = null;

// When set by openFeedbackModal(opts), Submit calls this instead of the default
// general-feedback path — used for hint/image feedback, which carry their own
// structured payload. Cleared on close so the modal reverts to general feedback.
let _onSubmit = null;

export function initFeedbackModal() {
  overlay    = document.getElementById('feedbackModalOverlay');
  textarea   = document.getElementById('feedbackModalText');
  gameEl     = document.getElementById('feedbackModalGame');
  deviceEl   = document.getElementById('feedbackModalDevice');
  subjectEl  = document.getElementById('feedbackModalSubject');
  submitBtn  = document.getElementById('feedbackModalSubmitBtn');
  cancelBtn  = document.getElementById('feedbackModalCancelBtn');

  if (!overlay) return;

  submitBtn.addEventListener('click', handleSubmit);
  cancelBtn.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
}

/**
 * Open the feedback modal.
 *
 * @param {Object} [opts]
 * @param {string} [opts.subject]     - short line naming what's being commented on
 *   (e.g. "Hint · open the safe (2/3)" or "Image · Narrow Street"). Shown above
 *   the textarea; omitted → general feedback.
 * @param {string} [opts.placeholder] - textarea placeholder override.
 * @param {(text: string) => (void|Promise<void>)} [opts.onSubmit] - custom submit
 *   handler (hint/art feedback). Omitted → default general-feedback POST.
 */
export function openFeedbackModal(opts = {}) {
  if (!overlay) return;

  _onSubmit = typeof opts.onSubmit === 'function' ? opts.onSubmit : null;

  if (subjectEl) {
    if (opts.subject) {
      subjectEl.textContent = opts.subject;
      subjectEl.classList.remove('hidden');
    } else {
      subjectEl.textContent = '';
      subjectEl.classList.add('hidden');
    }
  }
  textarea.placeholder = opts.placeholder || "What's on your mind?";

  gameEl.textContent   = state.currentGameName || 'None';
  deviceEl.textContent = getDeviceInfo();

  textarea.value = '';
  overlay.classList.remove('hidden');
  setTimeout(() => textarea.focus(), 100);
}

async function handleSubmit() {
  const text = textarea.value.trim();
  if (!text) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    if (_onSubmit) {
      await _onSubmit(text);
    } else {
      await submitFeedback(text, state.currentGameName || 'None');
    }
  } finally {
    close();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

function close() {
  overlay?.classList.add('hidden');
  _onSubmit = null;
}
