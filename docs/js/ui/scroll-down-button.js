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
const SCROLL_TO_BOTTOM_DELAY = 375; // ms - if still held after 3/4 of one-page scroll animation, scroll to bottom
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

    // Add pressed state (steady glow)
    button.classList.add('pressed');

    // Start scrolling one page immediately
    scrollDownOnePage(container);

    // If still held after 3/4 of scroll animation, scroll to bottom
    holdTimer = setTimeout(() => {
      scrollToBottomSmooth(container);
    }, SCROLL_TO_BOTTOM_DELAY);
  });

  button.addEventListener('touchend', (e) => {
    e.preventDefault();

    // Remove pressed state
    button.classList.remove('pressed');

    // Cancel scroll-to-bottom if still pending
    clearTimeout(holdTimer);
    holdTimer = null;

    touchTracker.reset();
  });

  button.addEventListener('touchcancel', () => {
    // Remove pressed state
    button.classList.remove('pressed');

    clearTimeout(holdTimer);
    holdTimer = null;
    touchTracker.reset();
  });

  // Mouse events for desktop testing
  button.addEventListener('mousedown', (e) => {
    // Only handle left clicks (button 0), ignore right clicks
    if (e.button !== 0) return;

    e.preventDefault();
    touchTracker.track(e);

    // After a delay, if still holding, smoothly scroll to bottom
    holdTimer = setTimeout(() => {
      scrollToBottomSmooth(container);
    }, HOLD_DELAY);
  });

  button.addEventListener('mouseup', (e) => {
    // Only handle left clicks (button 0), ignore right clicks
    if (e.button !== 0) return;

    e.preventDefault();
    clearTimeout(holdTimer);
    holdTimer = null;

    // Only scroll if it was a tap (not a drag)
    if (touchTracker.isTap(e)) {
      scrollDownOnePage(container);
    }

    touchTracker.reset();
    // Note: blur() removed - CSS :active handles desktop feedback
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

  // Show button when game is loaded (both mobile and desktop)
  const gameOutput = document.getElementById('gameOutput');
  const isGameLoaded = gameOutput && !gameOutput.classList.contains('hidden');

  if (isGameLoaded) {
    button.classList.remove('hidden');

    // Flash animation to announce presence (skip on desktop to be less intrusive)
    const isMobile = window.matchMedia('(max-width: 600px)').matches;
    if (isMobile) {
      button.classList.add('flash-announce');
      setTimeout(() => {
        button.classList.remove('flash-announce');
      }, 800);
    }

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
