/**
 * Shared full-screen art lightbox.
 *
 * One overlay (#nodeArtOverlay), reused by every consumer of location art:
 * the map node sheet (inline image + header thumbnail) and the content-area
 * location thumbnail. Built lazily on first use so it exists regardless of
 * whether the map subsystem has been opened yet.
 */

let _wired = false;

export function ensureArtOverlay() {
  if (!document.getElementById('nodeArtOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'nodeArtOverlay';
    overlay.className = 'node-art-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    // Caption sits OUTSIDE the image, above it, with its own background so it's
    // legible regardless of the picture behind it.
    overlay.innerHTML = `
      <div class="node-art-frame">
        <div id="nodeArtCaption" class="node-art-caption"></div>
        <img id="nodeArtOverlayImg" class="node-art-overlay-img" alt="">
      </div>
    `;
    document.body.appendChild(overlay);
  }
  // No close button (hover-driven). Click the image or press Esc to dismiss the
  // click-opened cases (panel / node sheet); the hover case closes on mouseleave.
  if (!_wired) {
    const overlay = document.getElementById('nodeArtOverlay');
    document.getElementById('nodeArtOverlayImg').addEventListener('click', closeArtOverlay);
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
 */
export function openArtOverlay(src, caption = '') {
  if (!src) return;
  ensureArtOverlay();
  const overlay = document.getElementById('nodeArtOverlay');
  document.getElementById('nodeArtOverlayImg').src = src;
  document.getElementById('nodeArtCaption').textContent = caption || '';
  overlay.classList.remove('hidden');
}

export function closeArtOverlay() {
  const overlay = document.getElementById('nodeArtOverlay');
  if (overlay) overlay.classList.add('hidden');
}
