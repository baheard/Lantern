/**
 * Text Highlighting Module
 *
 * Highlights currently spoken text using CSS Custom Highlight API.
 * Uses marker-based system for precise highlighting.
 */

import { state } from '../core/state.js';
import { dom } from '../core/dom.js';

/**
 * Highlight text using marker elements
 * Searches in status line, upper window, and main content elements
 * @param {number} chunkIndex - Index of chunk to highlight
 * @returns {boolean} True if successful
 */
export function highlightUsingMarkers(chunkIndex) {
  // Find markers in status bar, upper window, or main content (in that order)
  const containers = [
    window.currentStatusBarElement || document.getElementById('statusBar'),
    document.getElementById('upperWindow'),
    state.currentGameTextElement
  ];

  const startSelector = `.chunk-marker-start[data-chunk="${chunkIndex}"]`;
  const endSelector = `.chunk-marker-end[data-chunk="${chunkIndex}"]`;

  let startMarker, endMarker, containerEl;
  for (const container of containers) {
    if (!container) continue;
    startMarker = container.querySelector(startSelector);
    if (startMarker) {
      endMarker = container.querySelector(endSelector);
      containerEl = container;
      break;
    }
  }

  if (!startMarker) {
    return false;
  }

  try {
    // Create main range between markers (or to end of container if last chunk)
    const mainRange = new Range();
    mainRange.setStartAfter(startMarker);
    if (endMarker) {
      mainRange.setEndBefore(endMarker);
    } else {
      mainRange.setEndAfter(containerEl.lastChild);
    }

    // Debug collapsed ranges (indicates marker positioning issue)
    if (mainRange.collapsed) {
      return false;
    }

    // Use TreeWalker to create individual text node ranges (skips excessive whitespace)
    const textRanges = [];
    const walker = document.createTreeWalker(
      containerEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          if (mainRange.intersectsNode(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textNode;
    while (textNode = walker.nextNode()) {
      const text = textNode.textContent;
      if (!text.trim()) continue;

      // Find content boundaries (exclude leading/trailing whitespace)
      const startOffset = text.search(/\S/);
      const endOffset = text.length - (text.match(/\s*$/)?.[0].length || 0);

      // Create range covering only the content
      const range = new Range();
      range.setStart(textNode, startOffset);
      range.setEnd(textNode, endOffset);
      textRanges.push(range);
    }

    // Apply CSS Highlight API with multiple ranges
    if (CSS.highlights) {
      // Clear existing highlight first (fixes iOS WebKit issue where old highlight persists)
      CSS.highlights.delete('speaking');

      // Force synchronous repaint on iOS WebKit:
      // 1. Toggle a class to force style recalculation
      // 2. Read offsetHeight to force layout/repaint
      containerEl.classList.add('highlight-refresh');
      void containerEl.offsetHeight;
      containerEl.classList.remove('highlight-refresh');

      const highlight = new Highlight(...textRanges);
      CSS.highlights.set('speaking', highlight);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Remove highlight when done
 * Forces a repaint on iOS to ensure highlight is visually cleared
 */
export function removeHighlight() {
  if (CSS.highlights) {
    CSS.highlights.delete('speaking');

    // Force synchronous repaint on iOS WebKit
    if (dom.gameOutput) {
      dom.gameOutput.classList.add('highlight-refresh');
      void dom.gameOutput.offsetHeight;
      dom.gameOutput.classList.remove('highlight-refresh');
    }
  }
}

/**
 * Update text highlighting for a specific chunk
 * @param {number} chunkIndex - Chunk index to highlight
 */
export function updateTextHighlight(chunkIndex) {
  if (state.narrationChunks.length === 0 || chunkIndex < 0 || chunkIndex >= state.narrationChunks.length) {
    removeHighlight();
    return;
  }

  // Use marker-based highlighting (per design spec)
  let success = highlightUsingMarkers(chunkIndex);

  // Char-mode (PAK/menu) screens have no DOM markers — their chunks are built
  // from cleaned text, not the DOM (see handleGameOutput). Fall back to matching
  // each chunk to a grid row and highlighting that row. The char-mode path does
  // its own scrolling, so return early on success.
  if (!success && state.isCharMode) {
    if (highlightCharModeRow(chunkIndex)) return;
  }

  if (!success) {
    removeHighlight();
  } else {
    // Scroll to the highlighted text
    scrollToHighlightedText(chunkIndex);
  }

}

/** Strip everything but lowercase alphanumerics — used to match cleaned chunk
 *  text (which has had >, *, =, box-drawing, etc. stripped by processTextForTTS)
 *  against the raw grid text. */
function normAlnum(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Highlight a char-mode (PAK/menu) chunk at grid-row granularity.
 *
 * Char-mode chunks carry no markers, so we re-derive which row each chunk lives
 * on. Walking chunks 0..chunkIndex in order and advancing a cursor (row +
 * consumed-within-row) makes two-column rows resolve to the same row and
 * duplicate lines (e.g. repeated "(missing pages)") resolve to distinct rows.
 *
 * @param {number} chunkIndex - Chunk index to highlight
 * @returns {boolean} True if a row was highlighted
 */
function highlightCharModeRow(chunkIndex) {
  const container = document.getElementById('upperWindow');
  if (!container || !CSS.highlights) return false;

  const chunks = state.narrationChunks;
  const lineEls = Array.from(container.querySelectorAll('.grid-line'));
  if (lineEls.length === 0) return false;
  const lineNorm = lineEls.map(el => normAlnum(el.textContent));

  let row = 0;          // current row in the search
  let consumed = 0;     // alnum chars already matched within `row`
  let targetRow = -1;
  for (let c = 0; c <= chunkIndex; c++) {
    const chunk = chunks[c];
    const needle = normAlnum(typeof chunk === 'string' ? chunk : chunk?.text);
    if (!needle) { if (c === chunkIndex) return false; continue; }

    let placed = false;
    for (let r = row; r < lineNorm.length; r++) {
      const hay = r === row ? lineNorm[r].slice(consumed) : lineNorm[r];
      const idx = hay.indexOf(needle);
      if (idx === -1) continue;
      if (r === row) {
        consumed += idx + needle.length;
      } else {
        row = r;
        consumed = idx + needle.length;
      }
      targetRow = r;
      placed = true;
      break;
    }
    if (!placed && c === chunkIndex) return false;
  }
  if (targetRow === -1) return false;

  // Build highlight ranges over the target row's non-whitespace text.
  const textRanges = [];
  const walker = document.createTreeWalker(lineEls[targetRow], NodeFilter.SHOW_TEXT, null);
  let textNode;
  while (textNode = walker.nextNode()) {
    const text = textNode.textContent;
    if (!text.trim()) continue;
    const startOffset = text.search(/\S/);
    const endOffset = text.length - (text.match(/\s*$/)?.[0].length || 0);
    const range = new Range();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, endOffset);
    textRanges.push(range);
  }
  if (textRanges.length === 0) return false;

  // Clear + force a repaint (iOS WebKit) before applying, same as marker path.
  CSS.highlights.delete('speaking');
  container.classList.add('highlight-refresh');
  void container.offsetHeight;
  container.classList.remove('highlight-refresh');
  CSS.highlights.set('speaking', new Highlight(...textRanges));

  scrollRowIntoView(lineEls[targetRow]);
  return true;
}

/**
 * Scroll a grid row into the upper portion of the visible viewport.
 * Mirrors scrollToHighlightedText's math but works from an element rect
 * (char-mode rows have no markers to range over).
 * @param {HTMLElement} el - Row element to reveal
 */
function scrollRowIntoView(el) {
  const gameOutput = dom.gameOutput;
  if (!gameOutput || !el) return;

  const targetRect = el.getBoundingClientRect();
  if (!targetRect || targetRect.height === 0) return;

  const containerRect = gameOutput.getBoundingClientRect();
  const targetPositionInContent = gameOutput.scrollTop + (targetRect.top - containerRect.top);

  const vv = window.visualViewport;
  const visibleHeight = vv ? vv.height : window.innerHeight;
  const viewportOffset = vv ? vv.offsetTop : 0;
  const bufferFromTop = Math.max(20, visibleHeight * 0.08) + viewportOffset;

  const targetScroll = Math.max(0, targetPositionInContent - bufferFromTop);
  if (Math.abs(gameOutput.scrollTop - targetScroll) > 10) {
    gameOutput.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }
}

/**
 * Scroll to the currently highlighted text
 * Positions text near the TOP of the visible viewport.
 * @param {number} chunkIndex - Chunk index to scroll to
 */
function scrollToHighlightedText(chunkIndex) {
  const gameOutput = dom.gameOutput;
  if (!gameOutput) return;

  // Find the marker for this chunk
  const startMarker = document.querySelector(`.chunk-marker-start[data-chunk="${chunkIndex}"]`);
  if (!startMarker) return;

  // Create a range from start marker to end marker (same as highlighting uses)
  const endMarker = document.querySelector(`.chunk-marker-end[data-chunk="${chunkIndex}"]`);

  const range = new Range();
  range.setStartAfter(startMarker);
  if (endMarker) {
    range.setEndBefore(endMarker);
  } else {
    // Last chunk - extend to end of parent
    range.setEndAfter(startMarker.parentElement.lastChild);
  }

  const targetRect = range.getBoundingClientRect();
  if (!targetRect || targetRect.height === 0) return;

  const containerRect = gameOutput.getBoundingClientRect();

  // Calculate target's position in the scrollable content
  const targetPositionInContent = gameOutput.scrollTop + (targetRect.top - containerRect.top);

  // Account for mobile keyboard using visual viewport API
  // When keyboard is up:
  // - visualViewport.height is smaller (keyboard covers bottom)
  // - visualViewport.offsetTop may be non-zero (viewport shifted down)
  const vv = window.visualViewport;
  const visibleHeight = vv ? vv.height : window.innerHeight;
  const viewportOffset = vv ? vv.offsetTop : 0;

  // Position text in the upper portion of the visible area (above keyboard)
  // Add viewport offset to account for when visual viewport has shifted
  const bufferFromTop = Math.max(20, visibleHeight * 0.08) + viewportOffset;

  const targetScroll = Math.max(0, targetPositionInContent - bufferFromTop);

  // Only scroll if we need to move significantly (more than 10px)
  if (Math.abs(gameOutput.scrollTop - targetScroll) > 10) {
    gameOutput.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }
}
