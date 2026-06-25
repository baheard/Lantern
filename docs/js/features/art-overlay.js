/**
 * Shared full-screen art lightbox.
 *
 * One overlay (#nodeArtOverlay), reused by every consumer of location art:
 * the map node sheet (inline image + header thumbnail) and the content-area
 * location thumbnail. Built lazily on first use so it exists regardless of
 * whether the map subsystem has been opened yet.
 */

import { state } from '../core/state.js';
import { hashImage, submitArtFeedback } from './feedback.js';
import { openFeedbackModal } from '../ui/feedback-modal.js';

let _wired = false;
// Meta of the image currently shown — { src, location, file } — so the
// "Leave feedback" bubble can key its payload to the exact picture.
let _current = { src: '', location: '', file: '' };
// Whether the overlay is "pinned" (opened by a click/tap and meant to stay up
// until dismissed) vs a transient hover preview. Centralized here so EVERY close
// path resets it — otherwise a per-caller flag goes stale when the overlay is
// dismissed by clicking the backdrop/image and hover stops working afterwards.
let _pinned = false;

export function isArtOverlayPinned() { return _pinned; }

export function ensureArtOverlay() {
  if (!document.getElementById('nodeArtOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'nodeArtOverlay';
    overlay.className = 'node-art-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    // Caption sits OUTSIDE the image, above it, with its own background so it's
    // legible regardless of the picture behind it. The feedback bubble pins to
    // the frame's corner — clicking it opens the shared modal (a separate element,
    // so the lightbox closing underneath on mouseleave doesn't disturb it).
    overlay.innerHTML = `
      <div class="node-art-frame">
        <div id="nodeArtCaption" class="node-art-caption"></div>
        <div class="node-art-actions">
          <button id="nodeArtFeedbackBtn" class="node-art-feedback-btn" type="button"
                  aria-label="Leave feedback" title="Leave feedback">
            <span class="material-icons">chat_bubble_outline</span>
          </button>
          <button id="nodeArtCloseBtn" class="node-art-close-btn" type="button"
                  aria-label="Close" title="Close">
            <span class="material-icons">close</span>
          </button>
        </div>
        <img id="nodeArtOverlayImg" class="node-art-overlay-img" alt="">
      </div>
    `;
    document.body.appendChild(overlay);
  }
  // No close button. When pinned (click/tap-opened), a click ANYWHERE on the overlay
  // — backdrop or image — dismisses it (the feedback button stops propagation so it
  // doesn't). Transient hover previews close on mouseleave instead. Esc always closes.
  if (!_wired) {
    const overlay = document.getElementById('nodeArtOverlay');
    overlay.addEventListener('click', closeArtOverlay);
    document.getElementById('nodeArtFeedbackBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openArtFeedback();
    });
    document.getElementById('nodeArtCloseBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      closeArtOverlay();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeArtOverlay();
    });
    _wired = true;
  }
}

/**
 * Open the lightbox on a specific image.
 * @param {string} src - image URL
 * @param {string} [caption] - caption text (e.g. location name)
 * @param {{location?: string, file?: string}} [meta] - context for the feedback
 *   bubble. `file` defaults to the basename of `src`; `location` to the caption.
 */
export function openArtOverlay(src, caption = '', meta = {}) {
  if (!src) return;
  ensureArtOverlay();
  const overlay = document.getElementById('nodeArtOverlay');
  document.getElementById('nodeArtOverlayImg').src = src;
  document.getElementById('nodeArtCaption').textContent = caption || '';
  _current = {
    src,
    location: meta.location || caption || '',
    file: meta.file || (src.split('?')[0].split('/').pop() || ''),
  };
  // Pinned: the overlay becomes click-dismissable (CSS gives it pointer-events).
  // Transient (hover) previews stay pointer-events:none so they never grab the cursor.
  _pinned = !!meta.pinned;
  overlay.classList.toggle('pinned', _pinned);
  overlay.classList.remove('hidden');
}

/** Open art feedback for the image currently shown in the lightbox. */
function openArtFeedback() {
  openArtFeedbackFor(_current);
}

/**
 * Open the shared feedback modal for a specific image, wiring Submit to the
 * structured `[ART]` payload (with a content hash of the exact picture so
 * `/review-notes` can flag it stale after a regen). Game = the current game.
 * Used by the lightbox bubble AND the always-visible side-panel button.
 *
 * @param {{src: string, location?: string, file?: string}} img
 */
export function openArtFeedbackFor({ src, location = '', file = '' }) {
  if (!src) return;
  const resolvedFile = file || (src.split('?')[0].split('/').pop() || '');
  const gameName = state.currentGameName || 'None';
  openFeedbackModal({
    subject: `Image · ${location || resolvedFile}`,
    placeholder: "What's wrong (or right) with this picture?",
    onSubmit: async (comment) => {
      const hash = await hashImage(src);
      await submitArtFeedback({ gameName, location, file: resolvedFile, hash, comment });
    },
  });
}

export function closeArtOverlay() {
  const overlay = document.getElementById('nodeArtOverlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('pinned'); }
  _pinned = false;
}
