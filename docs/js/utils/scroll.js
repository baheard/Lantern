/**
 * Scroll Utility Module
 *
 * Centralized scroll behavior for consistent UX.
 * See reference/design-decisions.md for scroll behavior rules.
 */

/**
 * Get the main scrollable container
 * @returns {HTMLElement|null}
 */
export function getScrollContainer() {
  return document.getElementById('gameOutput');
}

/**
 * Height of the sticky header (status bar + upper window) that overlays the top
 * of the scroll container. Games without an upper window collapse this to ~0,
 * so callers can safely add it to a scroll buffer unconditionally. See #181.
 * @returns {number} Header height in px (0 if absent/hidden)
 */
function getStickyHeaderHeight() {
  const header = document.getElementById('gameHeader');
  return header ? header.offsetHeight : 0;
}

/**
 * Scroll to bottom of container
 * @param {HTMLElement} [container] - Container to scroll (defaults to gameOutput)
 */
export function scrollToBottom(container) {
  const el = container || getScrollContainer();
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

/**
 * Scroll to top of container
 * @param {HTMLElement} [container] - Container to scroll (defaults to gameOutput)
 */
export function scrollToTop(container) {
  const el = container || getScrollContainer();
  if (!el) return;
  el.scrollTop = 0;
}

/**
 * Smart scroll for new content after command
 * Scrolls toward bottom, but stops if top of new content would go off-screen.
 * Rule: Always keep the top of new text visible.
 * Accounts for mobile keyboard using Visual Viewport API.
 * Smart keyboard blur: If new content won't fit with keyboard up, blur keyboard first.
 *
 * @param {HTMLElement} newElement - The newly added content element
 * @param {HTMLElement} [container] - Container to scroll (defaults to gameOutput)
 */
export function scrollToNewContent(newElement, container) {
  const el = container || getScrollContainer();
  if (!el || !newElement) return;

  // Get positions
  const containerRect = el.getBoundingClientRect();
  const newElementRect = newElement.getBoundingClientRect();

  // Calculate target's position in the scrollable content
  const targetPositionInContent = el.scrollTop + (newElementRect.top - containerRect.top);

  // Account for mobile keyboard using visual viewport API
  // When keyboard is up:
  // - visualViewport.height is smaller (keyboard covers bottom)
  // - visualViewport.offsetTop may be non-zero (viewport shifted down)
  const vv = window.visualViewport;
  const visibleHeight = vv ? vv.height : window.innerHeight;
  const viewportOffset = vv ? vv.offsetTop : 0;

  // Smart keyboard blur: If new content won't fit in visible viewport, blur keyboard first
  // This gives more screen space and prevents text from going off-screen
  // BUT: Never close keyboard when map is open - user needs it for navigation
  // ALSO: Respect user preference to keep keyboard open
  const mapOverlay = document.getElementById('mapCanvasOverlay');
  const isMapOpen = mapOverlay && mapOverlay.classList.contains('visible');
  const keepKeyboardOpen = localStorage.getItem('lantern_keep_keyboard_open') === 'true';

  if (vv && vv.height < window.innerHeight && !isMapOpen && !keepKeyboardOpen) {
    // Keyboard is open (visual viewport is smaller than window)
    const newContentHeight = newElementRect.height;
    const availableHeight = visibleHeight - 100; // Reserve space for controls/margins

    // If new content is taller than available space, blur keyboard to show more
    if (newContentHeight > availableHeight) {
      const messageInput = document.getElementById('messageInput');
      if (messageInput && document.activeElement === messageInput) {
        // Set flag to prevent bottom-line pinning during this keyboard close
        window.skipBottomLinePinning = true;

        messageInput.blur(); // Close keyboard
        // Give time for keyboard to close and viewport to resize, then scroll
        // Increased delay for smoother keyboard animation on various devices
        setTimeout(() => {
          scrollToNewContentDelayed(newElement, el);
        }, 300);
        return;
      }
    }
  }

  // Position text near the top of the visible area to maximize content shown
  // 60px buffer: ensures command line above new content stays visible (command ~30-40px + breathing room)
  // Add viewport offset to account for when visual viewport has shifted
  // Add the sticky header height: .game-header (status bar + upper window) is
  // position:sticky inside the scroll container and overlays the top of the
  // visible area, so without this the echoed command hides behind it in games
  // with an upper window (e.g. Bronze). See issue #181.
  // Cap the total so a tall header (e.g. Bronze's compass on a narrow phone)
  // can't push the buffer past roughly half the visible area — otherwise the
  // new content lands too low, leaving a large dead gap above it (issue #187).
  const rawBuffer = 60 + viewportOffset + getStickyHeaderHeight();
  const bufferFromTop = Math.min(rawBuffer, visibleHeight * 0.5);

  const targetScroll = Math.max(0, targetPositionInContent - bufferFromTop);

  // Calculate scroll to reach bottom
  const scrollToBottom = el.scrollHeight - el.clientHeight;

  // Use the smaller of the two - this ensures new text top stays visible
  // while not scrolling past the bottom
  const finalScroll = Math.min(scrollToBottom, targetScroll);

  el.scrollTo({
    top: finalScroll,
    behavior: 'smooth'
  });
}

/**
 * Helper function for delayed scroll after keyboard closes
 * @param {HTMLElement} newElement - The newly added content element
 * @param {HTMLElement} container - Container to scroll
 */
function scrollToNewContentDelayed(newElement, container) {
  if (!container || !newElement) return;

  const containerRect = container.getBoundingClientRect();
  const newElementRect = newElement.getBoundingClientRect();
  const targetPositionInContent = container.scrollTop + (newElementRect.top - containerRect.top);

  // After keyboard closes, use full window height
  const vv = window.visualViewport;
  const visibleHeight = vv ? vv.height : window.innerHeight;
  const viewportOffset = vv ? vv.offsetTop : 0;
  // Include sticky header height so the command isn't hidden behind it (see #181),
  // capped so a tall header can't leave a large dead gap above it (issue #187)
  const rawBuffer = 60 + viewportOffset + getStickyHeaderHeight();
  const bufferFromTop = Math.min(rawBuffer, visibleHeight * 0.5);

  const targetScroll = Math.max(0, targetPositionInContent - bufferFromTop);
  const scrollToBottom = container.scrollHeight - container.clientHeight;
  const finalScroll = Math.min(scrollToBottom, targetScroll);

  container.scrollTo({
    top: finalScroll,
    behavior: 'smooth'
  });
}

/**
 * Scroll element into view with buffer space (for narration highlighting)
 * Centers the element in the viewport, not at exact edge.
 *
 * @param {HTMLElement} element - Element to scroll into view
 * @param {HTMLElement} [container] - Container to scroll (defaults to gameOutput)
 * @param {Object} [options] - Scroll options
 * @param {number} [options.bufferRatio=0.3] - Portion of viewport to use as top buffer (0-0.5)
 * @param {boolean} [options.smooth=true] - Use smooth scrolling
 */
export function scrollIntoViewWithBuffer(element, container, options = {}) {
  const el = container || getScrollContainer();
  if (!el || !element) return;

  const { bufferRatio = 0.3, smooth = true } = options;

  // Get positions
  const containerRect = el.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  // Calculate relative position of element within container
  const relativeTop = elementRect.top - containerRect.top;

  // Calculate target scroll to place element with buffer from top
  const bufferPixels = containerRect.height * bufferRatio;
  const targetScroll = el.scrollTop + relativeTop - bufferPixels;

  // Clamp to valid scroll range
  const maxScroll = el.scrollHeight - el.clientHeight;
  const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll));

  if (smooth) {
    el.scrollTo({
      top: clampedScroll,
      behavior: 'smooth'
    });
  } else {
    el.scrollTop = clampedScroll;
  }
}

/**
 * Check if element is currently visible in container
 * @param {HTMLElement} element - Element to check
 * @param {HTMLElement} [container] - Container (defaults to gameOutput)
 * @returns {boolean} True if element is fully visible
 */
export function isElementVisible(element, container) {
  const el = container || getScrollContainer();
  if (!el || !element) return false;

  const containerRect = el.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  return (
    elementRect.top >= containerRect.top &&
    elementRect.bottom <= containerRect.bottom
  );
}
