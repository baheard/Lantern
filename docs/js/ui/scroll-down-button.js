/**
 * Scroll Down Button Module
 *
 * Provides a floating button on mobile to scroll down through game content.
 * - Touch down: immediately scroll down one page
 * - Hold: smoothly scroll to bottom
 * - Release: stop scrolling
 * - Fades when at bottom of content
 */

import { getScrollContainer } from '../utils/scroll.js';
import { createTouchTracker } from '../utils/touch-detection.js';

let holdTimer = null;
const HOLD_DELAY = 500; // ms before starting smooth scroll to bottom
const touchTracker = createTouchTracker(10); // 10px threshold (same as tap-to-examine)

/**
 * Initialize the scroll down button
 */
export function initScrollDownButton() {
  const button = document.getElementById('scrollDownBtn');
  const container = getScrollContainer();

  if (!button || !container) return;

  // Show button when game is loaded
  updateButtonVisibility();

  // Touch start - track position for swipe detection
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchTracker.track(e);

    // Don't scroll immediately - wait for touchend to check if it was a swipe
    // After a delay, if still holding, smoothly scroll to bottom
    holdTimer = setTimeout(() => {
      scrollToBottomSmooth(container);
    }, HOLD_DELAY);
  });

  button.addEventListener('touchend', (e) => {
    e.preventDefault();
    clearTimeout(holdTimer);
    holdTimer = null;

    // Only scroll if it was a tap (not a swipe)
    if (touchTracker.isTap(e)) {
      scrollDownOnePage(container);
    }

    touchTracker.reset();

    // Remove focus to prevent staying lit
    button.blur();
  });

  button.addEventListener('touchcancel', () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    touchTracker.reset();
  });

  // Mouse events for desktop testing
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    touchTracker.track(e);

    // After a delay, if still holding, smoothly scroll to bottom
    holdTimer = setTimeout(() => {
      scrollToBottomSmooth(container);
    }, HOLD_DELAY);
  });

  button.addEventListener('mouseup', (e) => {
    e.preventDefault();
    clearTimeout(holdTimer);
    holdTimer = null;

    // Only scroll if it was a tap (not a drag)
    if (touchTracker.isTap(e)) {
      scrollDownOnePage(container);
    }

    touchTracker.reset();
    // Remove focus to prevent staying lit
    button.blur();
  });

  button.addEventListener('mouseleave', () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    touchTracker.reset();
  });

  // Update fade state on scroll
  container.addEventListener('scroll', () => {
    updateFadeState(button, container);
  });

  // Initial fade state check
  updateFadeState(button, container);
}

/**
 * Scroll down one viewport height (page down)
 * Keep some overlap so user doesn't lose context
 * @param {HTMLElement} container - The scroll container
 */
function scrollDownOnePage(container) {
  if (!container) return;

  const viewportHeight = container.clientHeight;
  const overlapLines = 3; // Keep 3 lines visible for context
  const lineHeight = 24; // Approximate line height in pixels
  const overlap = overlapLines * lineHeight;

  const currentScroll = container.scrollTop;
  const targetScroll = currentScroll + viewportHeight - overlap;

  container.scrollTo({
    top: targetScroll,
    behavior: 'smooth'
  });
}

/**
 * Smoothly scroll to bottom (for hold gesture)
 * @param {HTMLElement} container - The scroll container
 */
function scrollToBottomSmooth(container) {
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth'
  });
}

/**
 * Update fade state based on scroll position
 * @param {HTMLElement} button - The scroll down button
 * @param {HTMLElement} container - The scroll container
 */
function updateFadeState(button, container) {
  if (!button || !container) return;

  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;

  // Check if we're at or near the bottom (within 50px threshold)
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

  if (isAtBottom) {
    button.classList.add('faded');
  } else {
    button.classList.remove('faded');
  }
}

/**
 * Update button visibility based on game state
 * Called when game loads/unloads
 */
export function updateButtonVisibility() {
  const button = document.getElementById('scrollDownBtn');
  if (!button) return;

  // Show button only when game is loaded and on mobile
  const gameOutput = document.getElementById('gameOutput');
  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  const isGameLoaded = gameOutput && !gameOutput.classList.contains('hidden');

  if (isMobile && isGameLoaded) {
    button.classList.remove('hidden');

    // Flash animation to announce presence
    button.classList.add('flash-announce');
    setTimeout(() => {
      button.classList.remove('flash-announce');
    }, 800);

    // Update fade state immediately and after a delay (for initial content render)
    const container = getScrollContainer();
    if (container) {
      updateFadeState(button, container);
      // Check again after content has settled
      setTimeout(() => updateFadeState(button, container), 100);
      setTimeout(() => updateFadeState(button, container), 500);
    }
  } else {
    button.classList.add('hidden');
  }
}

/**
 * Refresh button fade state (called when new content is added)
 * Exported for use by game-output module
 */
export function refreshScrollButton() {
  const button = document.getElementById('scrollDownBtn');
  const container = getScrollContainer();

  if (button && container && !button.classList.contains('hidden')) {
    // Small delay to let content render
    setTimeout(() => updateFadeState(button, container), 50);
  }
}
