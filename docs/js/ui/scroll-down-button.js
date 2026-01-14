/**
 * Scroll Down Button Module
 *
 * Provides a floating button on mobile to scroll down through game content.
 * - Tap: scroll down one page (triggered on touchend if no drag detected)
 * - Hold: scroll to bottom after 300ms (canceled on ANY movement)
 * - Drag: passes through to content (natural scroll) - 5px threshold
 * - Fades when at bottom of content
 * - Button uses pointer-events: none in CSS, touch detection on container
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

  // Helper to check if touch is within button bounds
  function isTouchInButton(touch) {
    const rect = button.getBoundingClientRect();
    return (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    );
  }

  // Track touches on the container (button has pointer-events: none)
  let touchStartedInButton = false;

  container.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    if (!touch) return;

    // Check if touch started in button area
    if (isTouchInButton(touch)) {
      touchStartedInButton = true;
      touchTracker.track(e);
      isDragging = false;

      // Add pressed state (steady glow)
      button.classList.add('pressed');

      // If held after delay, scroll to bottom (with text selection prevention)
      holdTimer = setTimeout(() => {
        if (!isDragging && touchStartedInButton) {
          // Prevent text selection during scroll to bottom
          document.body.style.userSelect = 'none';
          document.body.style.webkitUserSelect = 'none';

          scrollToBottomSmooth(container);

          // Re-enable text selection after scroll completes
          setTimeout(() => {
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
          }, SCROLL_TO_BOTTOM_DURATION + 100);
        }
      }, SCROLL_TO_BOTTOM_DELAY);
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!touchStartedInButton) return;

    // ANY movement cancels the hold timer immediately
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    // Check if user is dragging beyond threshold
    if (!touchTracker.isTap(e)) {
      isDragging = true;
      touchStartedInButton = false; // Stop tracking this touch

      // Remove pressed state
      button.style.transition = 'none';
      button.classList.remove('pressed');
      void button.offsetHeight; // Force reflow
      button.style.transition = '';
    }
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!touchStartedInButton) return;

    // Only trigger button action if it was a tap (not a drag)
    const wasTap = !isDragging && touchTracker.isTap(e);

    if (wasTap) {
      scrollDownOnePage(container);
    }

    // Remove pressed state instantly (no transition)
    button.style.transition = 'none';
    button.classList.remove('pressed');
    void button.offsetHeight; // Force reflow
    button.style.transition = '';

    // Cancel all timers
    clearTimeout(holdTimer);
    holdTimer = null;
    isDragging = false;
    touchStartedInButton = false;

    touchTracker.reset();
  });

  container.addEventListener('touchcancel', () => {
    if (!touchStartedInButton) return;

    // Remove pressed state instantly (no transition)
    button.style.transition = 'none';
    button.classList.remove('pressed');
    void button.offsetHeight; // Force reflow
    button.style.transition = '';

    // Cancel all timers
    clearTimeout(holdTimer);
    holdTimer = null;
    isDragging = false;
    touchStartedInButton = false;

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
