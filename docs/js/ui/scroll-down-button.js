/**
 * Scroll Down Button Module
 *
 * Provides a floating button on mobile to scroll down through game content.
 * - Tap: scroll down one page (with 50ms delay for drag detection)
 * - Hold: scroll one page, then smoothly scroll to bottom
 * - Drag: ignore tap and long press (cancel all scroll actions)
 * - Fades when at bottom of content
 */

import { getScrollContainer } from '../utils/scroll.js';
import { createTouchTracker } from '../utils/touch-detection.js';

let holdTimer = null;
let scrollTimer = null;
let isDragging = false;
let debounceTimer = null; // For debouncing viewport resize updates
const INITIAL_SCROLL_DELAY = 50; // ms - small delay to detect drag before scrolling
const SCROLL_TO_BOTTOM_DELAY = 300; // ms - if still held after this, interrupt with fast scroll to bottom
const SCROLL_TO_BOTTOM_DURATION = 500; // ms - duration of scroll to bottom animation
const DEBOUNCE_DELAY = 100; // ms - debounce delay for viewport resize updates
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
    e.stopPropagation();
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
  }, { passive: false });

  // Touch move - cancel all actions if dragging
  button.addEventListener('touchmove', (e) => {
    // Check if user is dragging (not just a tap)
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
  }, { passive: true });

  button.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();

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
    e.stopPropagation();
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
    e.stopPropagation();

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

  // Update fade state on viewport resize (debounced for keyboard animations)
  // This ensures button visibility is correct when keyboard opens/closes
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new timer - only update after keyboard animation settles
      debounceTimer = setTimeout(() => {
        updateFadeState(button, container);
        debounceTimer = null;
      }, DEBOUNCE_DELAY);
    });
  }

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
 * Uses Visual Viewport API to account for mobile keyboard visibility
 * @param {HTMLElement} button - The scroll down button
 * @param {HTMLElement} container - The scroll container
 */
function updateFadeState(button, container) {
  if (!button || !container) return;

  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;

  // Account for mobile keyboard using Visual Viewport API
  // When keyboard is up, we need to check if we're at the bottom of the VISIBLE area
  const vv = window.visualViewport;
  const containerRect = container.getBoundingClientRect();

  // Calculate how much of the container is actually visible
  let visibleContainerHeight = clientHeight;
  if (vv) {
    const viewportBottom = vv.pageY + vv.height;
    const containerBottom = containerRect.top + clientHeight + window.scrollY;
    const containerTop = containerRect.top + window.scrollY;

    // If keyboard covers part of container, use only visible portion
    if (viewportBottom < containerBottom) {
      visibleContainerHeight = Math.max(0, viewportBottom - containerTop - window.scrollY);
    }
  }

  // Check if we're at or near the bottom (within 50px threshold)
  // Use visible height instead of full client height
  const isAtBottom = scrollTop + visibleContainerHeight >= scrollHeight - 50;

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
    // Delay to let content render and keyboard animations settle
    setTimeout(() => updateFadeState(button, container), 150);
  }
}
