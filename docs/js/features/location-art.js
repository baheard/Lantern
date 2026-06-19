/**
 * Location Art — per-location generated images.
 *
 * Two consumers share this module:
 *  - the map node sheet (map-sheet.js) shows the image for the tapped node;
 *  - the content area shows a thumbnail of the CURRENT location (this module),
 *    updated as the player moves (the auto-mapper's `locationChanged` event).
 *
 * Both are gated by a single per-game setting (`locationArt`), which falls back
 * to an app-wide default (set from the welcome screen, OFF by default). Tapping
 * either image opens the shared full-screen lightbox.
 */

import { getGameSetting } from '../utils/game-settings.js';
import { state } from '../core/state.js';
import { ensureArtOverlay, openArtOverlay, closeArtOverlay, openArtFeedbackFor } from './art-overlay.js';

// games/images/<game>/manifest.json keyed by the exact locationName the
// auto-mapper records. Loaded once per game and cached (404 cached as null).
const _manifestCache = new Map();

export async function loadLocationManifest(gameName) {
  if (!gameName) return null;
  if (_manifestCache.has(gameName)) return _manifestCache.get(gameName);
  try {
    const resp = await fetch(`games/images/${gameName}/manifest.json`);
    if (!resp.ok) { _manifestCache.set(gameName, null); return null; }
    const data = await resp.json();
    _manifestCache.set(gameName, data);
    return data;
  } catch {
    _manifestCache.set(gameName, null);
    return null;
  }
}

// Resolve the current gameName the same way the map subsystem does (the filename
// stem in localStorage), falling back to state — robust to load-order timing.
export function currentGameName() {
  const fromLs = localStorage.getItem('lantern_last_game');
  if (fromLs) return fromLs.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
  return state.currentGameName || null;
}

// Whether location art should be shown for the current game. Per-game override
// wins; otherwise the app default (welcome screen); otherwise ON (default).
export function isLocationArtEnabled() {
  return getGameSetting('locationArt', true) !== false;
}

// Resolve the image URL for a location name, or null if art is disabled / absent.
export async function getLocationImageUrl(locationName) {
  if (!locationName || !isLocationArtEnabled()) return null;
  const gameName = currentGameName();
  const manifest = await loadLocationManifest(gameName);
  const file = manifest && manifest.images && manifest.images[locationName];
  if (!file) return null;
  return `games/images/${gameName}/${file}`;
}

// ---------------------------------------------------------------------------
// Content-area thumbnail
// ---------------------------------------------------------------------------

let _currentLocationName = null;

const PANEL_WIDTH_KEY = 'lantern_art_panel_w'; // user-chosen width in px
const PANEL_COLLAPSE_KEY = 'lantern_art_panel_collapsed'; // user hid the side panel
const PANEL_MIN = 260;
const PANEL_MAX_VW = 0.62; // cap at 62% of viewport

// --- placeholder glyph (shown when a game HAS art but the current room doesn't) ---
// Single source of truth lives in docs/assets/glyphs/: a set of SVGs plus
// selected.json naming the chosen one. Picked in the review tool, used app-wide.
let _glyphMarkup = null; // cached inline SVG string (null until loaded, '' if absent)
async function loadPlaceholderGlyph() {
  if (_glyphMarkup !== null) return _glyphMarkup;
  try {
    const sel = await (await fetch('assets/glyphs/selected.json')).json();
    const id = (sel && sel.id) || 'lantern-a';
    const svg = await (await fetch(`assets/glyphs/${id}.svg`)).text();
    _glyphMarkup = /<svg[\s\S]*<\/svg>/i.test(svg) ? svg : '';
  } catch {
    _glyphMarkup = '';
  }
  return _glyphMarkup;
}

export function initLocationArt() {
  ensureArtOverlay();
  createStatusIcon();
  createSidePanel();
  applyStoredPanelWidth();
  window.addEventListener('locationChanged', (e) => {
    const name = e.detail && e.detail.locationName;
    if (name) updateForLocation(name);
  });
}

function container() {
  const gameOutput = document.getElementById('gameOutput');
  return gameOutput && gameOutput.parentElement;
}

// Small in-flow thumbnail to the left of the status bar (also the mobile affordance,
// since the side panel is wide-screen only). Pushes the status text over (it's a
// flex sibling of the window stack), never overlaps it.
function createStatusIcon() {
  if (document.getElementById('locationArtStatusIcon')) return;
  const header = document.getElementById('gameHeader');
  if (!header) return;
  const icon = document.createElement('img');
  icon.id = 'locationArtStatusIcon';
  icon.className = 'location-art-status-icon hidden';
  icon.alt = '';
  icon.title = 'Hover or press and hold to preview location art';
  // Desktop: preview while hovering. Touch: preview while the finger is held down.
  const show = () => {
    if (icon.src) openArtOverlay(icon.src, _currentLocationName || '', { location: _currentLocationName || '' });
  };
  icon.addEventListener('mouseenter', show);
  icon.addEventListener('mouseleave', closeArtOverlay);
  icon.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
  icon.addEventListener('touchend', closeArtOverlay);
  icon.addEventListener('touchcancel', closeArtOverlay);
  header.insertBefore(icon, header.firstChild);
}

// Persistent image panel beside the story (one image — the current location).
// The column is reserved via `.art-panel-active` on the container, so it doesn't
// reflow when an image is absent or loads late. Resizable via the drag handle.
function createSidePanel() {
  if (document.getElementById('locationArtPanel')) return;
  const gameOutput = document.getElementById('gameOutput');
  const c = container();
  if (!gameOutput || !c) return;
  const panel = document.createElement('aside');
  panel.id = 'locationArtPanel';
  panel.className = 'location-art-panel';
  panel.innerHTML = `
    <div class="location-art-resize" id="locationArtResize" title="Drag to resize"></div>
    <div class="location-art-inner">
      <div class="location-art-stage">
        <img id="locationArtPanelImg" class="location-art-panel-img" alt="">
        <div id="locationArtPlaceholder" class="location-art-placeholder" aria-hidden="true"></div>
      </div>
      <div class="location-art-footer">
        <span id="locationArtCaption" class="location-art-caption"></span>
        <button id="locationArtFeedback" class="location-art-feedback" type="button"
                aria-label="Leave feedback" title="Leave feedback">
          <span class="material-icons">chat_bubble_outline</span>
        </button>
        <button id="locationArtCollapse" class="location-art-collapse" type="button"
                aria-label="Hide location art" title="Hide location art">›</button>
      </div>
    </div>
  `;
  gameOutput.insertAdjacentElement('afterend', panel);
  // The panel image is display-only — not interactive. Only the header thumbnail
  // (top-right status icon) opens the full-screen preview. The footer feedback
  // button is the always-visible "Leave feedback" affordance (the lightbox bubble
  // is unreachable in the desktop hover-preview path, which closes on mouseleave).
  setupResize(panel.querySelector('#locationArtResize'));
  panel.querySelector('#locationArtCollapse').addEventListener('click', () => setPanelCollapsed(true));
  panel.querySelector('#locationArtFeedback').addEventListener('click', () => {
    const img = document.getElementById('locationArtPanelImg');
    if (img && img.getAttribute('src')) {
      openArtFeedbackFor({ src: img.src, location: _currentLocationName || '' });
    }
  });
  createPanelToggle();
}

// --- drag-to-resize ---------------------------------------------------------
function clampWidth(px) {
  return Math.max(PANEL_MIN, Math.min(px, window.innerWidth * PANEL_MAX_VW));
}
function applyStoredPanelWidth() {
  const c = container();
  if (!c) return;
  const stored = parseFloat(localStorage.getItem(PANEL_WIDTH_KEY) || '');
  if (!isNaN(stored)) c.style.setProperty('--art-panel-w', `${clampWidth(stored)}px`);
}
function setupResize(handle) {
  if (!handle) return;
  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const w = clampWidth(window.innerWidth - clientX); // panel hugs the right edge
    container()?.style.setProperty('--art-panel-w', `${w}px`);
    e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    const w = container()?.style.getPropertyValue('--art-panel-w');
    if (w) localStorage.setItem(PANEL_WIDTH_KEY, parseFloat(w).toString());
  };
  const onDown = (e) => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
}

// --- show/hide side panel ----------------------------------------------------
// A slide-out tab on the right edge, shown only when the current game has art.
// Collapsing removes the reserved column so the story re-centers; the choice
// persists across sessions.
function isPanelCollapsed() {
  return localStorage.getItem(PANEL_COLLAPSE_KEY) === '1';
}
function setPanelCollapsed(collapsed) {
  localStorage.setItem(PANEL_COLLAPSE_KEY, collapsed ? '1' : '0');
  applyCollapseState();
}
function applyCollapseState() {
  container()?.classList.toggle('art-panel-collapsed', isPanelCollapsed());
}
// Edge tab used ONLY to re-open a collapsed panel (CSS shows it only when
// collapsed); the in-panel button at the caption's right edge does the collapsing.
function createPanelToggle() {
  if (!document.getElementById('locationArtReopen')) {
    const c = container();
    if (!c) return;
    const btn = document.createElement('button');
    btn.id = 'locationArtReopen';
    btn.className = 'location-art-toggle';
    btn.type = 'button';
    btn.title = 'Show location art';
    btn.setAttribute('aria-label', 'Show location art');
    btn.textContent = '‹';
    btn.addEventListener('click', () => setPanelCollapsed(false));
    c.appendChild(btn);
  }
  applyCollapseState();
}

// --- per-location update -----------------------------------------------------
// Drives the status icon AND the side panel, and reserves the panel column for the
// session once the game is known to have art.
async function updateForLocation(locationName) {
  _currentLocationName = locationName;
  const enabled = isLocationArtEnabled();
  const gameName = currentGameName();
  const manifest = enabled ? await loadLocationManifest(gameName) : null;
  if (_currentLocationName !== locationName) return; // player moved on

  const hasArtGame = !!(manifest && manifest.images && Object.keys(manifest.images).length);
  // Mark the game as having art for the whole session — drives the slide-out
  // toggle's visibility and (unless the user collapsed it) reserves the panel
  // column, so nothing reflows on a missing/late image.
  container()?.classList.toggle('art-has-art', hasArtGame);

  const file = hasArtGame ? manifest.images[locationName] : null;
  const url = file ? `games/images/${gameName}/${file}` : null;

  const icon = document.getElementById('locationArtStatusIcon');
  const panel = document.getElementById('locationArtPanel');
  const img = document.getElementById('locationArtPanelImg');
  const placeholder = document.getElementById('locationArtPlaceholder');
  const caption = document.getElementById('locationArtCaption');

  // Caption (location name) sits BELOW the image; shown whenever the panel is
  // populated — for a real image or the placeholder glyph.
  if (caption) caption.textContent = hasArtGame ? (locationName || '') : '';

  if (url) {
    if (icon) {
      icon.onerror = () => { icon.classList.add('hidden'); icon.removeAttribute('src'); };
      icon.src = url; icon.alt = locationName; icon.classList.remove('hidden');
    }
    if (panel && img) {
      img.onerror = () => { panel.classList.remove('has-art'); img.removeAttribute('src'); };
      img.src = url; img.alt = locationName; panel.classList.add('has-art');
    }
    if (placeholder) placeholder.classList.remove('show');
  } else {
    if (icon) { icon.classList.add('hidden'); icon.removeAttribute('src'); }
    if (panel && img) { panel.classList.remove('has-art'); img.removeAttribute('src'); }
    // Game has art but THIS room doesn't — show the faint lantern glyph so the
    // reserved column reads as intentional rather than broken/empty.
    if (placeholder) {
      if (hasArtGame) {
        loadPlaceholderGlyph().then((svg) => {
          if (_currentLocationName !== locationName) return;
          if (svg && !placeholder.innerHTML) placeholder.innerHTML = svg;
          placeholder.classList.add('show');
        });
      } else {
        placeholder.classList.remove('show');
      }
    }
  }
}

// Re-evaluate when the setting changes (toggled in Settings) or on game load.
export function refreshLocationArt() {
  if (_currentLocationName) updateForLocation(_currentLocationName);
}
