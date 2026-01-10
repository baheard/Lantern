/**
 * Touch Detection Utilities
 *
 * Shared utilities for detecting taps vs swipes/scrolls
 */

/**
 * Create a touch tracker for detecting swipes vs taps
 * @param {number} threshold - Maximum movement in pixels to still count as a tap (default: 15)
 * @returns {Object} Tracker with track() and isTap() methods
 */
export function createTouchTracker(threshold = 15) {
  let startX = null;
  let startY = null;

  return {
    /**
     * Track the start position of a touch/mouse event
     * @param {TouchEvent|MouseEvent} e - The event
     */
    track(e) {
      if (e.touches) {
        // Touch event
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
      } else {
        // Mouse event
        startX = e.clientX;
        startY = e.clientY;
      }
    },

    /**
     * Check if the current position is a tap (not a swipe)
     * @param {TouchEvent|MouseEvent} e - The event
     * @returns {boolean} True if tap, false if swipe
     */
    isTap(e) {
      if (startX === null || startY === null) {
        return true; // No start position tracked, assume tap
      }

      let endX, endY;
      if (e.changedTouches) {
        // Touch event (use changedTouches for touchend)
        const touch = e.changedTouches[0];
        endX = touch.clientX;
        endY = touch.clientY;
      } else {
        // Mouse event
        endX = e.clientX;
        endY = e.clientY;
      }

      const deltaX = Math.abs(endX - startX);
      const deltaY = Math.abs(endY - startY);

      return deltaX <= threshold && deltaY <= threshold;
    },

    /**
     * Reset the tracker
     */
    reset() {
      startX = null;
      startY = null;
    }
  };
}
