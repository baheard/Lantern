/**
 * Word Extraction Utility
 *
 * Extracts words from clicked/tapped coordinates in the game text.
 * Uses browser APIs to find the word at a specific point without
 * modifying the DOM structure.
 *
 * Part of the tap-to-examine feature.
 * See: reference/tap-to-examine.md
 */

/**
 * Extract word at specific screen coordinates
 * @param {number} x - X coordinate (clientX)
 * @param {number} y - Y coordinate (clientY)
 * @returns {{word: string, element: HTMLElement, range: Range} | null} - Word data or null if no word found
 */
export function extractWordAtPoint(x, y) {
  try {
    // Get caret position at coordinates (browser-specific APIs)
    let range = null;
    let textNode = null;
    let offset = 0;

    // Chrome, Safari, Edge
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
      if (!range) return null;

      textNode = range.startContainer;
      offset = range.startOffset;
    }
    // Firefox
    else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) return null;

      textNode = position.offsetNode;
      offset = position.offset;
    }
    // Unsupported browser
    else {
      return null;
    }

    // Ensure we have a text node
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    // Get full text content from the text node
    const text = textNode.textContent || '';
    if (!text.trim()) {
      return null; // Empty or whitespace-only text
    }

    // Find word boundaries around the clicked offset
    const wordData = extractWordAtOffset(text, offset);
    if (!wordData) {
      return null;
    }

    // Find the parent element (for debugging/context)
    let element = textNode.parentElement;
    while (element && !element.classList.contains('game-text')) {
      element = element.parentElement;
    }

    // Create a range for the exact word position
    const wordRange = document.createRange();
    wordRange.setStart(textNode, wordData.start);
    wordRange.setEnd(textNode, wordData.end);

    // Verify click point is inside the word's bounding box (with padding for easier tapping)
    // Padding makes tap targets larger without changing font size
    const tapPadding = 6; // pixels of extra tap area around each word
    const wordRect = wordRange.getBoundingClientRect();
    if (x < wordRect.left - tapPadding ||
        x > wordRect.right + tapPadding ||
        y < wordRect.top - tapPadding ||
        y > wordRect.bottom + tapPadding) {
      // Click is outside the word's tap area
      return null;
    }

    return {
      word: wordData.word,
      element: element || textNode.parentElement,
      range: wordRange
    };
  } catch (error) {
    return null;
  }
}

/**
 * Extract word at a specific character offset in text
 * @param {string} text - The full text content
 * @param {number} offset - Character offset to search around
 * @returns {{word: string, start: number, end: number} | null} - The word and its position, or null if not found
 */
function extractWordAtOffset(text, offset) {
  // Ensure offset is within bounds
  if (offset < 0 || offset > text.length) {
    return null;
  }

  // Check if the offset is positioned on a word character
  // We check both the character at offset and before offset
  // because caret can be between characters
  const charBefore = offset > 0 ? text[offset - 1] : '';
  const charAt = offset < text.length ? text[offset] : '';

  // If neither character is a word char, we're in whitespace/punctuation
  if (!isWordChar(charBefore) && !isWordChar(charAt)) {
    return null;
  }

  // Find the start of the word (work backwards from offset)
  let start = offset;
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
  }

  // Find the end of the word (work forwards from offset)
  let end = offset;
  while (end < text.length && isWordChar(text[end])) {
    end++;
  }

  // Double-check we found a word
  if (start === end) {
    return null;
  }

  // Extract the word
  const rawWord = text.substring(start, end);

  // Sanitize and validate
  const word = sanitizeWord(rawWord);
  if (!word) {
    return null;
  }

  return {
    word: word,
    start: start,
    end: end
  };
}

/**
 * Check if a character is part of a word
 * Includes letters, numbers, hyphens, and apostrophes
 * @param {string} char - Single character to check
 * @returns {boolean} - True if character is part of a word
 */
function isWordChar(char) {
  // Letters, numbers, hyphens, apostrophes
  // This matches typical IF object names like "north-east", "lamp's"
  return /[\w'-]/.test(char);
}

/**
 * Sanitize a word by removing unwanted punctuation
 * @param {string} word - Raw extracted word
 * @returns {string | null} - Cleaned word, or null if invalid
 */
function sanitizeWord(word) {
  if (!word) return null;

  // Remove leading and trailing punctuation (except hyphens and apostrophes mid-word)
  // This handles cases like: "lamp," → "lamp", "'hello" → "hello", "world!" → "world"
  let cleaned = word.replace(/^[^\w-]+|[^\w-]+$/g, '');

  // If the word is now empty or only punctuation, return null
  if (!cleaned || !/\w/.test(cleaned)) {
    return null;
  }

  return cleaned;
}
