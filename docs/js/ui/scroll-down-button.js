/**
 * Scroll Down Button Module
 *
 * Provides a floating button on mobile to scroll down through game content.
 * - Tap: scroll down one page (triggered on touchend if no drag detected)
 * - Hold: scroll to bottom after 300ms (canceled on ANY movement)
 * - Drag: passes through to content (natural scroll) - 5px threshold
 * - Fades when at bottom of content
 */

import { getScrollContainer } from '../utils/scroll.js';
import { createTouchTracker } from '../utils/touch-detection.js';

let holdTimer = null;
let isDragging = false;
const SCROLL_TO_BOTTOM_DELAY = 300; // ms - hold duration before scrolling to bottom
const SCROLL_TO_BOTTOM_DURATION = 500; // ms - duration of scroll to bottom animation
const DRAG_THRESHOLD = 5; // px - tight threshold for responsive tap detection
const touchTracker = createTouchTracker(DRAG_THRESHOLD);

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
  // Use passive listener to allow natural scrolling
  button.addEventListener('touchstart', (e) => {
    touchTracker.track(e);
    isDragging = false;

    // Add pressed state (steady glow)
    button.classList.add('pressed');

    // If held after delay, scroll to bottom
    holdTimer = setTimeout(() => {
      if (!isDragging) {
        scrollToBottomSmooth(container);
      }
    }, SCROLL_TO_BOTTOM_DELAY);
  }, { passive: true });

  // Touch move - detect dragging
  // Cancel hold timer on ANY movement to allow natural scrolling
  button.addEventListener('touchmove', (e) => {
    // ANY movement cancels the hold timer immediately
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    // Check if user is dragging beyond threshold
    if (!touchTracker.isTap(e)) {
      isDragging = true;

      // Remove pressed state
      button.style.transition = 'none';
      button.classList.remove('pressed');
      void button.offsetHeight; // Force reflow
      button.style.transition = '';
    }
  }, { passive: true });

  button.addEventListener('touchend', (e) => {
    // Only trigger button action if it was a tap (not a drag)
    const wasTap = !isDragging && touchTracker.isTap(e);

    if (wasTap) {
      // Prevent default only if we're handling it as a button tap
      e.preventDefault();
      scrollDownOnePage(container);
    }

    // Remove focus to prevent hover state from sticking
    button.blur();

    // Remove pressed state instantly (no transition)
    button.style.transition = 'none';
    button.classList.remove('pressed');
    void button.offsetHeight; // Force reflow
    button.style.transition = '';

    // Cancel all timers
    clearTimeout(holdTimer);
    holdTimer = null;
    isDragging = false;

    touchTracker.reset();
  });

  button.addEventListener('touchcancel', () => {
    // Remove focus to prevent hover state from sticking
    button.blur();

    // Remove pressed state instantly (no transition)
    button.style.transition = 'none';
    button.classList.remove('pressed');
    void button.offsetHeight; // Force reflow
    button.style.transition = '';

    // Cancel all timers
    clearTimeout(scrollTimer);
    clearTimeout(holdTimer);
    scrollTimer = null;
    holdTimer = null;
    isDragging = false;

    touchTracker.reset();
  });

  // Mouse events for desktop testing
  button.addEventListener('mousedown', (e) => {
    // Only handle left clicks (button 0), ignore right clicks
    if (e.button !== 0) return;

    e.preventDefault();
    touchTracker.track(e);
    isDragging = false;

    // Add pressed state (steady glow)
    button.classList.add('pressed');

    // Small delay before scrolling to allow drag detection
    scrollTimer = setTimeout(() => {
      if (!isDragging) {
        scrollDownOnePage(container);
      }
    }, INITIAL_SCROLL_DELAY);

    // If still held after delay, scroll to bottom
    holdTimer = setTimeout(() => {
      if (!isDragging) {
        scrollToBottomSmooth(container);
      }
    }, SCROLL_TO_BOTTOM_DELAY);
  });

  // Mouse move - cancel all actions if dragging
  button.addEventListener('mousemove', (e) => {
    // Check if user is dragging (not just a click)
    if (!touchTracker.isTap(e)) {
      isDragging = true;

      // Cancel both scroll timers
      if (scrollTimer) {
        clearTimeout(scrollTimer);
        scrollTimer = null;
      }
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }

      // Remove pressed state
      button.style.transition = 'none';
      button.classList.remove('pressed');
      void button.offsetHeight; // Force reflow
      button.style.transition = '';
    }
  });

  button.addEventListener('mouseup', (e) => {
    // Only handle left clicks (button 0), ignore right clicks
    if (e.button !== 0) return;

    e.preventDefault();

    // Remove focus to prevent hover state from sticking
    button.blur();

    // Remove pressed state instantly (no transition)
    button.style.transition = 'none';
    button.classList.remove('pressed');
    void button.offsetHeight; // Force reflow
    button.style.transition = '';

    // Cancel all timers
    clearTimeout(scrollTimer);
    clearTimeout(holdTimer);
    scrollTimer = null;
    holdTimer = null;
    isDragging = false;

    touchTracker.reset();
  });

  button.addEventListener('mouseleave', () => {
    // Remove focus to prevent hover state from sticking
    button.blur();

    // Remove pressed state instantly if mouse leaves while pressed
    button.style.transition = 'none';
    button.classList.remove('pressed');
    void button.offsetHeight; // Force reflow
    button.style.transition = '';

    // Cancel all timers
    clearTimeout(scrollTimer);
    clearTimeout(holdTimer);
    scrollTimer = null;
    holdTimer = null;
    isDragging = false;

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

  const startPos = container.scrollTop;
  const targetPos = container.scrollHeight - container.clientHeight;
  const distance = targetPos - startPos;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / SCROLL_TO_BOTTOM_DURATION, 1);

    // Easing function (ease-out cubic)
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    container.scrollTop = startPos + (distance * easeProgress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
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
