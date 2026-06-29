/**
 * Location Art — per-location generated images.
 *
 * Two consumers share this module:
 *  - the map node sheet (map-sheet.js) shows the image for the tapped node;
 *  - the content area drops a per-room eye marker into the transcript as the player
 *    moves (driven by the auto-mapper's `locationChanged` event), next to the room
 *    name. It's hidden whenever the side panel is on screen (the panel already shows
 *    the image), so it's effectively the narrow-screen / collapsed-panel affordance.
 *    The eye is a glyph, not a thumbnail — the full-res image only loads when peeked.
 *
 * Both are gated by a single per-game setting (`locationArt`), which falls back
 * to an app-wide default (set from the welcome screen, OFF by default). Hovering
 * or press-and-holding an eye opens the shared full-screen lightbox.
 */

import { getGameSetting } from '../utils/game-settings.js';
import { state } from '../core/state.js';
import { ensureArtOverlay, openArtOverlay, closeArtOverlay, openArtFeedbackFor, isArtOverlayPinned } from './art-overlay.js';

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
// wins; otherwise the app default; otherwise OFF (default). The Settings toggles
// were removed for now (see docs/index.html), so with no stored value this stays
// off. Was defaulting ON; flip the hardcoded default back to `true` to restore.
export function isLocationArtEnabled() {
  return getGameSetting('locationArt', false) !== false;
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

// Resolve a representative "title" image for a game — used by the home game-card eye
// (hover preview / full-screen). Prefers an explicit `title` field in the manifest
// (a dedicated title piece rendered by the same artist); falls back to the first
// location image so this works before any title art is generated. Returns null if
// the game ships no art at all.
export async function getTitleImageUrl(gameName) {
  if (!gameName) return null;
  const manifest = await loadLocationManifest(gameName);
  if (!manifest || !manifest.images) return null;
  const file = manifest.title || Object.values(manifest.images)[0];
  if (!file) return null;
  return `games/images/${gameName}/${file}`;
}

// ---------------------------------------------------------------------------
// Content-area thumbnail
// ---------------------------------------------------------------------------

let _currentLocationName = null;

// Inline eye glyph — no text content (so narration/chunking never reads it), stroke
// follows currentColor. Used by both the status-bar affordance and the per-room
// inline markers.
const EYE_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

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

// --- hover thumbnail ---------------------------------------------------------
// A small floating preview shown on PC hover, anchored to the hovered eye. This is
// deliberately NOT the full-screen lightbox — popping the whole overlay open on a
// stray mouseover was jarring. Click/tap still opens the full lightbox (below).
// One reused element; pointer-events:none so it never grabs the cursor (which would
// pull the hover off the eye and flicker the preview).
let _thumbEl = null;
function ensureThumb() {
  if (_thumbEl) return _thumbEl;
  const el = document.createElement('div');
  el.id = 'locationArtThumb';
  el.className = 'location-art-thumb hidden';
  el.innerHTML = `<img alt="">`;
  document.body.appendChild(el);
  _thumbEl = el;
  return el;
}
function showThumb(anchor, url) {
  if (!url) return;
  const el = ensureThumb();
  const img = el.querySelector('img');
  if (img.getAttribute('src') !== url) img.setAttribute('src', url);
  el.classList.remove('hidden');
  // Position below the eye, left-aligned to it, but clamp into the viewport.
  const r = anchor.getBoundingClientRect();
  const margin = 8;
  const w = el.offsetWidth || 280;
  const h = el.offsetHeight || 200;
  let left = r.left;
  let top = r.bottom + margin;
  if (left + w > window.innerWidth - margin) left = window.innerWidth - margin - w;
  if (left < margin) left = margin;
  // If it would run off the bottom, flip above the eye instead.
  if (top + h > window.innerHeight - margin) top = Math.max(margin, r.top - margin - h);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}
function hideThumb() {
  if (_thumbEl) _thumbEl.classList.add('hidden');
}

// Wire an eye element to preview the location image, keyed to a lazily-resolved
// URL + caption:
//   - PC hover: a small floating thumbnail anchored to the eye (showThumb), unless
//     the full lightbox is already pinned open.
//   - Click / phone tap: TOGGLES the full-screen lightbox — first click/tap opens it
//     pinned and keeps it up, a second closes it. `touchstart` is preventDefault'd so
//     the tap doesn't also fire a synthetic hover/click (no thumbnail on touch).
export function attachPeek(el, getUrl, getCaption) {
  // Is the overlay currently up AND showing this element's image? (getAttribute
  // keeps the relative URL we set, unlike img.src which resolves to absolute.)
  const isShowingThis = () => {
    const overlay = document.getElementById('nodeArtOverlay');
    if (!overlay || overlay.classList.contains('hidden')) return false;
    const img = document.getElementById('nodeArtOverlayImg');
    return !!(img && img.getAttribute('src') === getUrl());
  };
  const open = (pinned) => {
    const url = getUrl();
    if (url) openArtOverlay(url, getCaption(), { location: getCaption(), pinned });
  };
  // Click / tap toggles a PINNED preview (stays up until dismissed). State lives in
  // the overlay (isArtOverlayPinned), so dismissing by clicking the backdrop/image
  // can't leave us out of sync.
  const toggle = () => {
    if (isArtOverlayPinned() && isShowingThis()) closeArtOverlay();
    else open(true);
  };
  // PC hover: small floating thumbnail, but never while the full lightbox is pinned.
  el.addEventListener('mouseenter', () => { if (!isArtOverlayPinned()) showThumb(el, getUrl()); });
  el.addEventListener('mouseleave', () => { hideThumb(); });
  // Click opens the full lightbox — drop the hover thumbnail first so they don't stack.
  // stopPropagation keeps a peek from also firing an enclosing handler (e.g. the home
  // game-card's launch-on-click when the eye is nested inside the card button).
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hideThumb(); toggle(); });
  el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); }, { passive: false });
}

// Drop a per-room eye marker into the transcript, just to the RIGHT of the location
// name at the top of the current room's text block. Narrow screens only (CSS-gated) —
// wide screens have the side panel. The renderer emits each line as its own <div>, so
// the room name is the first content line; we append the eye into that line's div so
// it trails the name. The eye carries no text content, so narration chunking (which
// re-serializes the block's innerHTML) never reads it. Bound to a fixed URL/name so
// scrolling back peeks the right room even after the player has moved on.
function placeInlineEye(url, locationName) {
  const block = state.currentGameTextElement;
  if (!block) return;
  if (block.dataset.locationEye === '1') return; // already marked this block
  block.dataset.locationEye = '1';
  const eye = document.createElement('button');
  eye.type = 'button';
  eye.className = 'location-art-inline-eye';
  eye.setAttribute('aria-label', `Preview art for ${locationName || 'this location'}`);
  // No title attr — hovering already shows the image; a tooltip would just block it.
  eye.innerHTML = EYE_SVG;
  attachPeek(eye, () => url, () => locationName || '');
  // Append the eye after the ROOM-HEADER line — the content line whose text is the
  // location name. On a normal room entry that's the first content line, but on the
  // intro/first screen the game's title banner ("ANCHORHEAD", author, release info)
  // precedes the room name, so we match by name rather than by position. Fall back to
  // the first content line, then the block itself, if nothing matches.
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const want = norm(locationName);
  const content = Array.from(block.children).filter(
    (el) => el.tagName === 'DIV' && !el.classList.contains('blank-line-spacer') && el.textContent.trim()
  );
  const nameLine =
    (want && content.find((el) => norm(el.textContent) === want)) ||
    (want && content.find((el) => norm(el.textContent).startsWith(want))) ||
    content[0];
  (nameLine || block).appendChild(eye);
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
// Drives the side panel and the per-room inline eye markers, and reserves the panel
// column for the session once the game is known to have art.
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

  const panel = document.getElementById('locationArtPanel');
  const img = document.getElementById('locationArtPanelImg');
  const placeholder = document.getElementById('locationArtPlaceholder');
  const caption = document.getElementById('locationArtCaption');

  // Caption (location name) sits BELOW the image; shown whenever the panel is
  // populated — for a real image or the placeholder glyph.
  if (caption) caption.textContent = hasArtGame ? (locationName || '') : '';

  if (url) {
    if (panel && img) {
      img.onerror = () => { panel.classList.remove('has-art'); img.removeAttribute('src'); };
      img.src = url; img.alt = locationName; panel.classList.add('has-art');
    }
    if (placeholder) placeholder.classList.remove('show');
    // Per-room marker in the transcript (CSS hides it whenever the side panel is up).
    placeInlineEye(url, locationName);
  } else {
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
