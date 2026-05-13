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
let submitBtn = null;
let cancelBtn = null;

export function initFeedbackModal() {
  overlay    = document.getElementById('feedbackModalOverlay');
  textarea   = document.getElementById('feedbackModalText');
  gameEl     = document.getElementById('feedbackModalGame');
  deviceEl   = document.getElementById('feedbackModalDevice');
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

export function openFeedbackModal() {
  if (!overlay) return;

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

  const gameName = state.currentGameName || 'None';
  await submitFeedback(text, gameName);

  close();
  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';
}

function close() {
  overlay?.classList.add('hidden');
}
