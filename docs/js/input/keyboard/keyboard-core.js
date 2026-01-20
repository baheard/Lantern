/**
 * Keyboard Input Core Module
 *
 * Handles keyboard input via messaging interface in controls panel.
 * Voice UI and system entry mode are in separate modules.
 */

import { state } from '../../core/state.js';
import { sendCommandDirect } from '../../game/commands/index.js';
import { getInputType, sendInput } from '../../game/voxglk.js';
import { scrollToBottom } from '../../utils/scroll.js';
import { playCommandSent } from '../../utils/audio-feedback.js';
import { extractWordAtPoint } from '../word-extractor.js';
import { setVoiceSpeaking, updateVoiceTranscript, showVoiceIndicator, hideVoiceIndicator } from './voice-ui.js';
import { isSystemEntryMode } from './system-entry.js';
import { createTouchTracker } from '../../utils/touch-detection.js';

let messageInputEl = null;
let messageInputRowEl = null;
let clearInputBtnEl = null;
let sendBtnEl = null;

// Char input panel elements
let charInputPanelEl = null;
let charUpBtnEl = null;
let charLeftBtnEl = null;
let charDownBtnEl = null;
let charRightBtnEl = null;
let charEnterBtnEl = null;
let charKeyboardBtnEl = null;
let hiddenKeyInputEl = null;

// Tap-to-examine state (track when word was just populated)
let wordJustPopulated = false;
let populatedWordLength = 0;

// Track input focus state (before blur from clicking buttons)
let inputWasFocused = false;

// Track keyboard state based on viewport resize events
let keyboardIsOpen = false;
let baselineViewportHeight = null;

// Cached media queries for keyboard detection (performance optimization)
const mqCoarse = window.matchMedia('(pointer: coarse)');
const mqHover = window.matchMedia('(hover: hover)');

/**
 * Initialize keyboard input handling
 */
export function initKeyboardInput() {
  // Query DOM elements for messaging interface
  messageInputEl = document.getElementById('messageInput');
  messageInputRowEl = document.getElementById('messageInputRow');
  clearInputBtnEl = document.getElementById('clearInputBtn');
  sendBtnEl = document.getElementById('sendBtn');

  // Query DOM elements for char input panel
  charInputPanelEl = document.getElementById('charInputPanel');
  charUpBtnEl = document.getElementById('charUpBtn');
  charLeftBtnEl = document.getElementById('charLeftBtn');
  charDownBtnEl = document.getElementById('charDownBtn');
  charRightBtnEl = document.getElementById('charRightBtn');
  charEnterBtnEl = document.getElementById('charEnterBtn');
  charKeyboardBtnEl = document.getElementById('charKeyboardBtn');

  // Create hidden input for arbitrary key capture (keyboard button)
  hiddenKeyInputEl = document.createElement('input');
  hiddenKeyInputEl.id = 'hiddenKeyInput';
  hiddenKeyInputEl.type = 'text';
  hiddenKeyInputEl.maxLength = 1;
  hiddenKeyInputEl.style.position = 'absolute';
  hiddenKeyInputEl.style.left = '-9999px';
  hiddenKeyInputEl.style.opacity = '0';
  hiddenKeyInputEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hiddenKeyInputEl);

  // Update input visibility based on input type
  updateInputVisibility();

  // Listen for keydown events on document
  document.addEventListener('keydown', handleKeyPress);

  // Listen for Enter key on message input
  if (messageInputEl) {
    messageInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendCommand();
      }
    });

    // Enable horizontal scrolling with touch gestures on mobile
    let touchStartX = 0;
    let scrollStartLeft = 0;

    messageInputEl.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      scrollStartLeft = messageInputEl.scrollLeft;
    }, { passive: true });

    messageInputEl.addEventListener('touchmove', (e) => {
      const touchX = e.touches[0].clientX;
      const deltaX = touchStartX - touchX;
      messageInputEl.scrollLeft = scrollStartLeft + deltaX;
    }, { passive: true });

    // Show/hide inline clear button based on input content
    messageInputEl.addEventListener('input', () => {
      updateClearButtonVisibility();
      // Clear flag when user types (manual editing)
      wordJustPopulated = false;
    });

    // On focus, select populated word for easy replacement (mobile only)
    messageInputEl.addEventListener('focus', () => {
      inputWasFocused = true; // Track focus state
      updateClearButtonVisibility();

      // If word was just populated and we're on mobile, select it
      if (wordJustPopulated && !hasPhysicalKeyboard()) {
        // Small delay to ensure keyboard is shown and cursor positioned
        setTimeout(() => {
          if (messageInputEl && wordJustPopulated) {
            // Select the first word/prefix for easy command override
            const value = messageInputEl.value;
            const firstSpaceIndex = value.indexOf(' ');
            if (firstSpaceIndex > 0) {
              // Has space - select first word (e.g., "x" or "go")
              messageInputEl.setSelectionRange(0, firstSpaceIndex);
            } else {
              // No space - select all (single verb command)
              messageInputEl.select();
            }
          }
        }, 100);
      }
    });

    // On blur, track that focus was lost
    messageInputEl.addEventListener('blur', () => {
      inputWasFocused = false;
    });
  }

  // Send button - sends the command without opening keyboard
  if (sendBtnEl) {
    // Capture keyboard state on mousedown/touchstart (before blur happens)
    let sendBtnKeyboardCapture = false;
    const captureSendBtnKeyboardState = () => {
      const inputFocused = document.activeElement === messageInputEl;

      // Restore focus if:
      // - Input is focused AND keyboard is visible (mobile with keyboard up)
      // - OR input is focused and no visualViewport API (desktop)
      const shouldKeepFocus = inputFocused && (keyboardIsOpen || !window.visualViewport);

      sendBtnKeyboardCapture = shouldKeepFocus;
    };
    sendBtnEl.addEventListener('mousedown', captureSendBtnKeyboardState);
    sendBtnEl.addEventListener('touchstart', captureSendBtnKeyboardState, { passive: true });

    sendBtnEl.addEventListener('click', () => {
      const inputType = getInputType();

      // In char mode, send Enter key to game
      if (inputType === 'char' && !isSystemEntryMode()) {
        sendInput('return', 'char');
      } else {
        // In line mode, send the command normally
        sendCommand();
        // Restore focus if it was focused before clicking send button
        if (sendBtnKeyboardCapture && messageInputEl) {
          messageInputEl.focus();
        }
      }
    });
  }

  // Clear button - clears the input and cancels system mode if active
  if (clearInputBtnEl) {
    // Capture keyboard state on mousedown/touchstart (before blur happens)
    let clearBtnKeyboardCapture = false;
    const captureKeyboardState = () => {
      const inputFocused = document.activeElement === messageInputEl;

      // Restore focus if:
      // - Input is focused AND keyboard is visible (mobile with keyboard up)
      // - OR input is focused and no visualViewport API (desktop)
      const shouldKeepFocus = inputFocused && (keyboardIsOpen || !window.visualViewport);

      clearBtnKeyboardCapture = shouldKeepFocus;
    };
    clearInputBtnEl.addEventListener('mousedown', captureKeyboardState);
    clearInputBtnEl.addEventListener('touchstart', captureKeyboardState, { passive: true });

    clearInputBtnEl.addEventListener('click', async () => {
      // Use captured keyboard visibility from mousedown/touchstart
      const shouldRestoreFocus = clearBtnKeyboardCapture;

      // In system mode: clear text first, then cancel if already empty
      if (isSystemEntryMode()) {
        if (messageInputEl && messageInputEl.value.trim().length > 0) {
          // Has text - clear it first
          messageInputEl.value = '';
          // Only restore focus if it was focused before (prevents keyboard jump)
          if (shouldRestoreFocus) {
            messageInputEl.focus();
          }
        } else {
          // No text - cancel system mode
          const { cancelMetaInput } = await import('../../game/commands/index.js');
          cancelMetaInput();
          // Only restore focus if it was focused before (prevents keyboard jump)
          if (shouldRestoreFocus && messageInputEl) {
            messageInputEl.focus();
          }
        }
        return;
      }

      // Otherwise just clear the input
      if (messageInputEl) {
        messageInputEl.value = '';
        // Only restore focus if it was focused before (prevents keyboard jump)
        if (shouldRestoreFocus) {
          messageInputEl.focus();
        }
      }
    });
  }

  // Add click handlers for char input buttons
  if (charUpBtnEl) {
    charUpBtnEl.addEventListener('click', () => sendInput('up', 'char'));
  }
  if (charLeftBtnEl) {
    charLeftBtnEl.addEventListener('click', () => sendInput('left', 'char'));
  }
  if (charDownBtnEl) {
    charDownBtnEl.addEventListener('click', () => sendInput('down', 'char'));
  }
  if (charRightBtnEl) {
    charRightBtnEl.addEventListener('click', () => sendInput('right', 'char'));
  }
  if (charEnterBtnEl) {
    charEnterBtnEl.addEventListener('click', () => sendInput('return', 'char'));
  }

  // Keyboard button: Focus hidden input to open mobile keyboard
  if (charKeyboardBtnEl) {
    charKeyboardBtnEl.addEventListener('click', () => {
      hiddenKeyInputEl.value = '';
      hiddenKeyInputEl.focus();
    });
  }

  // Capture key from hidden input
  hiddenKeyInputEl.addEventListener('input', (e) => {
    const key = e.target.value;
    if (key.length === 1) {
      // Send key to game
      sendInput(key, 'char');
      hiddenKeyInputEl.blur();
      hiddenKeyInputEl.value = '';
    }
  });

  // Also handle Enter key in hidden input
  hiddenKeyInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendInput('return', 'char');
      hiddenKeyInputEl.blur();
    }
  });

  // Click on game area - different behavior based on mode
  const lowerWindow = document.getElementById('lowerWindow');
  const gameOutput = document.getElementById('gameOutput');

  /**
   * Populate input with word (tap-to-examine feature)
   * First word gets prefix (unless it's a common verb)
   * Additional words are appended, prefix stays selected
   * @param {string} word - The word to insert
   */
  const populateInputWithWord = (word) => {
    if (!messageInputEl) return;

    const wordLower = word.toLowerCase();
    const currentValue = messageInputEl.value.trim();

    if (currentValue === '') {
      // Empty input - determine what to add
      const isVerb = commonVerbs.includes(wordLower);
      const isDirection = directions.includes(wordLower);

      if (isVerb) {
        // Common verb - no prefix, add space after for objects
        messageInputEl.value = `${word} `;
        // Cursor at end, ready for objects (only if input will be/is focused)
        if (hasPhysicalKeyboard() || document.activeElement === messageInputEl) {
          messageInputEl.setSelectionRange(messageInputEl.value.length, messageInputEl.value.length);
        }
        // Track populated word for mobile focus selection
        wordJustPopulated = true;
        populatedWordLength = word.length;
      } else {
        // Regular word or direction - add prefix
        const prefix = isDirection ? 'go' : 'x';
        messageInputEl.value = `${prefix} ${word}`;
        // Select the prefix so user can type to replace it (only if input will be/is focused)
        if (hasPhysicalKeyboard() || document.activeElement === messageInputEl) {
          messageInputEl.setSelectionRange(0, prefix.length);
        }
        // Track populated word for mobile focus selection
        wordJustPopulated = true;
        populatedWordLength = word.length;
      }
    } else {
      // Input has content - check if word is already the last word
      const words = currentValue.split(/\s+/);
      const lastWord = words[words.length - 1];

      if (lastWord.toLowerCase() === wordLower) {
        // Focus on desktop only (mobile keyboard stays closed)
        if (hasPhysicalKeyboard()) {
          messageInputEl.focus();
        }
        return; // Don't add duplicate
      }

      // Input has content - append word and keep prefix selected
      // First, determine what the current prefix is
      let prefixLength = 0;

      if (currentValue.startsWith('go ')) {
        prefixLength = 2;
      } else if (currentValue.startsWith('x ')) {
        prefixLength = 1;
      }

      // Append the new word with trailing space for easier continuation
      messageInputEl.value = `${currentValue} ${word} `;

      // Re-select the prefix if it exists (only if input will be/is focused)
      if (prefixLength > 0 && (hasPhysicalKeyboard() || document.activeElement === messageInputEl)) {
        messageInputEl.setSelectionRange(0, prefixLength);
      }

      // Track populated word for mobile focus selection
      wordJustPopulated = true;
      populatedWordLength = word.length;
    }

    // Focus on desktop, scroll input horizontally on mobile (no vertical scroll)
    if (hasPhysicalKeyboard()) {
      messageInputEl.focus();
    } else {
      // Mobile: scroll input to end horizontally (keep page position unchanged)
      messageInputEl.scrollLeft = messageInputEl.scrollWidth;
      // Don't scroll game output - keep user's current scroll position
    }
  };

  const handleTouchStart = (e) => {
    // Track touch/mouse start position for scroll detection
    tapExamineTouchTracker.track(e);
  };

  const handleGameClick = (e) => {
    // Only process left-click (button 0) for mouse events - allow right-click default behavior
    if (e.type === 'mouseup' && e.button !== 0) {
      return; // Not left click - allow default behavior (context menu, etc.)
    }

    // Get coordinates (different for touch vs mouse)
    // For touchend, use changedTouches since touches array is empty
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    // Only process in line input mode
    const inputType = getInputType();
    if (inputType !== 'line' || !messageInputEl) {
      tapExamineTouchTracker.reset();
      return; // Not in line mode - allow normal behavior
    }

    // Check if tap-to-examine is enabled
    const isTapExamineEnabled = localStorage.getItem('iftalk_tap_to_examine') === 'true';
    if (!isTapExamineEnabled) {
      // Tap-to-examine disabled - on PC, just focus the input for easy typing
      if (hasPhysicalKeyboard()) {
        messageInputEl.focus();
      }
      tapExamineTouchTracker.reset();
      return; // Feature disabled by user
    }

    // Check if mobile menu is open - if so, allow the click-outside handler to close it
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      // Menu is open - don't trigger tap-to-examine, let menu close naturally
      tapExamineTouchTracker.reset();
      return;
    }

    // Detect scrolling/dragging - if finger moved more than 10px, user was scrolling
    if (!tapExamineTouchTracker.isTap(e)) {
      // User was scrolling, not tapping
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent gameOutput listener
      tapExamineTouchTracker.reset();
      return;
    }

    // If user has selected text, don't process word click (allows text selection/copying)
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';

    if (selectedText.length > 0) {
      const anchorNode = selection.anchorNode;
      const isGameTextSelection = anchorNode && (
        lowerWindow?.contains(anchorNode) ||
        gameOutput?.contains(anchorNode)
      );

      if (isGameTextSelection) {
        // User was selecting text - on PC, still focus input for easy typing after
        if (hasPhysicalKeyboard()) {
          messageInputEl.focus();
        }
        return; // User was selecting text - don't process
      }
    }

    // Try to extract word at click point
    const wordData = extractWordAtPoint(clientX, clientY);

    // Reset tracking
    tapExamineTouchTracker.reset();

    if (wordData && wordData.word) {
      // Word found - populate input
      e.preventDefault();
      e.stopPropagation();
      populateInputWithWord(wordData.word);
    } else {
      // No word found (whitespace) - just focus on desktop
      // Don't clear input to allow intentional blank clicks without losing work
      if (hasPhysicalKeyboard()) {
        messageInputEl.focus();
      }
    }
  };

  // Word hover highlighting (tap-to-examine feature)
  let currentHighlightedWord = null;
  let highlightOverlay = null;

  // Track touch/mouse position to detect scrolling vs tapping
  const tapExamineTouchTracker = createTouchTracker(10); // 10px threshold

  // Direction words that should use "go" prefix
  const directions = [
    'north', 'south', 'east', 'west',
    'northeast', 'northwest', 'southeast', 'southwest',
    'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
    'up', 'down', 'u', 'd',
    'in', 'out'
  ];

  // Common IF verbs that should not get a prefix
  const commonVerbs = [
    'look', 'l',
    'examine', 'x',
    'take', 'get',
    'drop', 'put',
    'insert',
    'inventory', 'i',
    'open', 'close',
    'lock', 'unlock',
    'push', 'pull',
    'turn', 'switch',
    'move',
    'climb', 'enter', 'exit',
    'read',
    'listen', 'smell', 'taste',
    'eat', 'drink',
    'wear', 'remove',
    'give',
    'talk', 'ask', 'tell', 'say',
    'wait', 'z',
    'search',
    'light', 'extinguish',
    'save', 'restore',
    'quit', 'q',
    'help',
    'yes', 'y', 'no',
    'repair', 'confirm'
  ];

  const handleGameMouseMove = (e) => {
    // Disable hover highlighting on touch devices (prevents artifacts on mobile)
    const isTouchDevice = mqCoarse.matches && !mqHover.matches;
    if (isTouchDevice) {
      if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
      }
      return;
    }

    // Check if we're in line mode
    const inputType = getInputType();
    if (inputType !== 'line') {
      // Not in line mode - hide highlight
      if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
      }
      return;
    }

    // Check if tap-to-examine is enabled
    const isTapExamineEnabled = localStorage.getItem('iftalk_tap_to_examine') === 'true';
    if (!isTapExamineEnabled) {
      if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
      }
      return;
    }

    // Check if mobile menu is open - don't highlight words while menu is open
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
      }
      return;
    }

    // Extract word at current mouse position (returns exact position)
    const wordData = extractWordAtPoint(e.clientX, e.clientY);

    if (wordData && wordData.word && wordData.range) {
      // Word found - show highlight (no cursor change)
      // Create highlight overlay if it doesn't exist
      if (!highlightOverlay) {
        highlightOverlay = document.createElement('div');
        highlightOverlay.style.position = 'fixed';
        highlightOverlay.style.backgroundColor = 'rgba(0, 170, 255, 0.12)'; // Blue background (subtle but visible)
        highlightOverlay.style.borderRadius = '2px';
        highlightOverlay.style.pointerEvents = 'none';
        highlightOverlay.style.zIndex = '1000';
        // No transition - instant positioning to avoid flying effect
        document.body.appendChild(highlightOverlay);
      }

      // Get the bounding rect from the range
      const rect = wordData.range.getBoundingClientRect();

      // Position highlight overlay over the word
      highlightOverlay.style.left = rect.left + 'px';
      highlightOverlay.style.top = rect.top + 'px';
      highlightOverlay.style.width = rect.width + 'px';
      highlightOverlay.style.height = rect.height + 'px';
      highlightOverlay.style.display = 'block';

      currentHighlightedWord = wordData.word;
    } else {
      // No word - hide highlight
      if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
      }
      currentHighlightedWord = null;
    }
  };

  // Only listen on lowerWindow (main game text), not gameOutput container
  if (lowerWindow) {
    // Mouse events (desktop)
    lowerWindow.addEventListener('mousemove', handleGameMouseMove); // Hover highlighting
    lowerWindow.addEventListener('mousedown', handleTouchStart); // Track start position
    lowerWindow.addEventListener('mouseup', handleGameClick); // Word click

    // Touch events (mobile)
    lowerWindow.addEventListener('touchstart', handleTouchStart, { passive: true }); // Track start position
    lowerWindow.addEventListener('touchend', handleGameClick); // Word tap
  }

  // Function to update cursor based on tap-to-examine setting
  function updateTapExamineCursor() {
    const isTapExamineEnabled = localStorage.getItem('iftalk_tap_to_examine') === 'true';
    if (isTapExamineEnabled) {
      document.body.classList.add('tap-to-examine-enabled');
    } else {
      document.body.classList.remove('tap-to-examine-enabled');
    }
  }

  // Set initial cursor based on setting
  updateTapExamineCursor();

  // Listen for storage changes (when setting changed in another tab or by settings panel)
  window.addEventListener('storage', (e) => {
    if (e.key === 'iftalk_tap_to_examine') {
      updateTapExamineCursor();
    }
  });

  // Listen for input type changes (poll periodically - check every 500ms)
  setInterval(updateInputVisibility, 500);

  // Track keyboard open/close state based on viewport resize
  if (window.visualViewport) {
    // Set baseline height (when keyboard is closed)
    baselineViewportHeight = window.visualViewport.height;

    window.visualViewport.addEventListener('resize', () => {
      const currentHeight = window.visualViewport.height;
      const heightDiff = baselineViewportHeight - currentHeight;

      // Keyboard opened if viewport shrunk by >100px from baseline
      const wasOpen = keyboardIsOpen;
      keyboardIsOpen = heightDiff > 100;

      // Note: Viewport height is now handled via --vh CSS variable in app.js
      // which responds to visualViewport.resize events

      // Add class to body when keyboard is open for additional mobile fixes
      if (keyboardIsOpen) {
        document.body.classList.add('keyboard-open');
        // Document scroll is locked in app.js (runs on every viewport resize)
        // Game output maintains its own scroll position via overflow-y: auto
      } else {
        document.body.classList.remove('keyboard-open');
      }

      if (wasOpen !== keyboardIsOpen) {
        // When keyboard closes, clear selection and blur input
        if (!keyboardIsOpen && messageInputEl) {
          // Clear selection
          messageInputEl.setSelectionRange(0, 0);
          // Blur input to remove focus
          messageInputEl.blur();
        }
      }

      // Update baseline when keyboard fully closes (height returns to normal)
      if (!keyboardIsOpen && currentHeight > baselineViewportHeight) {
        baselineViewportHeight = currentHeight;
      }
    });
  }
}

/**
 * Handle key press
 */
function handleKeyPress(e) {
  // Don't capture if settings panel is open or other modals
  if (document.querySelector('.settings-panel.open')) {
    return;
  }

  const inputType = getInputType();

  // In char mode (press any key), send any key immediately
  // BUT NOT during system entry mode (save/restore prompts)
  if (inputType === 'char' && !isSystemEntryMode()) {
    // Don't capture modifier keys alone
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
      return;
    }

    // Don't capture if user is typing in the message input
    if (e.target === messageInputEl) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Map special keys to Glk key names (for glkapi.js KeystrokeNameMap)
    // These match the string keys expected by glkapi.js (lines 1419-1422)
    const specialKeyNames = {
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'Enter': 'return',
      'Backspace': 'delete',
      'Delete': 'delete',
      'Escape': 'escape',
      'Tab': 'tab',
      'PageUp': 'pageup',
      'PageDown': 'pagedown',
      'Home': 'home',
      'End': 'end',
    };

    // Check if this is a special key
    if (specialKeyNames[e.key]) {
      // Send special key name (string) that glkapi will convert to keycode
      sendInput(specialKeyNames[e.key], 'char');
    } else if (e.key.length === 1) {
      // Regular printable character - send as-is
      sendInput(e.key, 'char');
    }
    // Unknown special keys are ignored
    return;
  }

  // Line input mode - normal command typing
  // Handle Escape key to clear input or cancel system mode
  if (e.key === 'Escape' && messageInputEl) {
    e.preventDefault();

    // Cancel system mode if active
    if (isSystemEntryMode()) {
      import('../../game/commands/index.js').then(module => {
        module.cancelMetaInput();
      });
      return;
    }

    // Otherwise just clear the input
    messageInputEl.value = '';
    messageInputEl.focus();
    return;
  }

  // Don't capture if user is in other input elements (but allow from buttons)
  if (e.target.isContentEditable ||
      (e.target.tagName === 'INPUT' && e.target !== messageInputEl) ||
      e.target.tagName === 'TEXTAREA') {
    return;
  }

  // If typing a letter key from anywhere (including buttons), redirect to command input
  if (e.target !== messageInputEl && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // For line input mode OR system entry mode (save/restore prompts)
    if ((getInputType() === 'line' || isSystemEntryMode()) && messageInputEl && !messageInputEl.classList.contains('hidden')) {
      // Special handling for buttons: explicitly move focus and insert key
      // This allows users to start typing from any button (nav, mic, etc.)
      messageInputEl.focus();
      messageInputEl.value += e.key;
      state.hasManualTyping = true;
      // DISABLED: Testing if we need this scroll
      // scrollToBottom(); // Scroll now that they're typing
      e.preventDefault(); // Prevent double-typing and button default behavior
    }
    return;
  }

  // When typing in message input, mark as manual and scroll to show input
  if (e.target === messageInputEl && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.hasManualTyping = true;
    // DISABLED: Testing if we need this scroll
    // scrollToBottom();
  }
}

/**
 * Check if device has a physical keyboard
 * Uses pointer and hover media queries to detect touch-only devices
 */
export function hasPhysicalKeyboard() {
  // Devices with coarse pointer (touch) and no hover capability = touch-only
  const hasCoarsePointer = mqCoarse.matches;
  const canHover = mqHover.matches;

  // If primary pointer is coarse AND can't hover = touch-only device (no physical keyboard)
  // If can hover OR pointer is fine = has physical keyboard/mouse
  return canHover || !hasCoarsePointer;
}

/**
 * Update inline clear button visibility based on input content
 * NOTE: Clear button is now always visible (for cancel system mode + clear input)
 */
function updateClearButtonVisibility() {
  // Button is always visible now - no action needed
  // Kept as no-op to avoid breaking existing calls
}

/**
 * Update input visibility based on input type and mute state
 */
function updateInputVisibility() {
  const inputType = getInputType();
  const hasKeyboard = hasPhysicalKeyboard();
  const isMuted = state.isMuted;

  // Show/hide message input row (line mode only)
  if (messageInputRowEl) {
    // ALWAYS show input during system entry mode, line mode, OR when input type not yet set (game loading)
    // inputType is null when game first loads, treat as line mode to avoid pop-in
    if (isSystemEntryMode() || inputType === 'line' || inputType === null) {
      // Show message input row
      messageInputRowEl.classList.remove('hidden');

      // Toggle between text input and voice indicator based on mute state
      if (isMuted || isSystemEntryMode()) {
        // Muted or system entry - show text input, send button, and clear button
        if (messageInputEl) {
          messageInputEl.classList.remove('hidden');
          // Re-enable input and restore normal placeholder (in case coming from char mode)
          messageInputEl.disabled = false;
          if (!isSystemEntryMode()) {
            messageInputEl.placeholder = 'Type a command...';
          }
        }
        if (sendBtnEl) {
          sendBtnEl.classList.remove('hidden');
          sendBtnEl.disabled = false; // Re-enable send button
          sendBtnEl.title = 'Send (Enter)'; // Restore default title
        }
        if (clearInputBtnEl) {
          clearInputBtnEl.classList.remove('hidden');
          clearInputBtnEl.disabled = false; // Re-enable clear button
        }
        hideVoiceIndicator();
      } else {
        // Unmuted (voice mode) - hide text input, send button, and clear button, show voice indicator
        if (messageInputEl) messageInputEl.classList.add('hidden');
        if (sendBtnEl) sendBtnEl.classList.add('hidden');
        if (clearInputBtnEl) clearInputBtnEl.classList.add('hidden');
        showVoiceIndicator();
      }
    } else {
      // Char mode (press any key) or no input
      if (hasKeyboard) {
        // Desktop: Keep input visible but disabled with helpful placeholder
        messageInputRowEl.classList.remove('hidden');

        // Show text input in muted/text mode
        if (isMuted) {
          if (messageInputEl) {
            messageInputEl.classList.remove('hidden');
            // Disable input and show "Press key to continue..." placeholder
            messageInputEl.disabled = true;
            messageInputEl.placeholder = 'Press key to continue...';
          }
          if (sendBtnEl) {
            sendBtnEl.classList.remove('hidden');
            sendBtnEl.disabled = false; // Keep enabled - sends Enter key in char mode
            // Update title to show it sends Enter
            sendBtnEl.title = 'Press Enter to continue';
          }
          if (clearInputBtnEl) {
            clearInputBtnEl.classList.remove('hidden');
            clearInputBtnEl.disabled = true; // Disable clear button (nothing to clear)
          }
          hideVoiceIndicator();
        } else {
          // Voice mode - show voice indicator
          if (messageInputEl) messageInputEl.classList.add('hidden');
          if (sendBtnEl) sendBtnEl.classList.add('hidden');
          if (clearInputBtnEl) clearInputBtnEl.classList.add('hidden');
          showVoiceIndicator();
        }
      } else {
        // Mobile: Hide message input row in char mode
        messageInputRowEl.classList.add('hidden');
      }
    }
  }

  // Show/hide char input panel (char mode only, and only if no physical keyboard)
  if (charInputPanelEl) {
    if (inputType === 'char' && !hasKeyboard) {
      // Char mode on touch-only device - show char input panel immediately
      // This happens before messageInputRow hide (which is delayed 50ms) to prevent flash
      charInputPanelEl.classList.remove('hidden');
    } else {
      // Line mode, or has physical keyboard - hide char input panel
      charInputPanelEl.classList.add('hidden');
    }
  }
}

/**
 * Send command and clear input
 */
function sendCommand() {
  const cmd = messageInputEl ? messageInputEl.value.trim() : '';

  if (messageInputEl) {
    messageInputEl.value = '';
    updateClearButtonVisibility(); // Hide inline clear button after clearing
  }

  if (cmd || cmd === '') {
    // Store last command for echo detection
    window.lastSentCommand = cmd;

    // Play feedback tone
    playCommandSent();

    sendCommandDirect(cmd, false); // false = not a voice command

    // DISABLED: Testing if we need this scroll
    // Scroll to bottom after sending command
    // scrollToBottom();
  }
}

/**
 * Show message input
 */
export function showMessageInput() {
  if (messageInputRowEl) {
    messageInputRowEl.classList.remove('hidden');
  }
}

/**
 * Hide message input
 */
export function hideMessageInput() {
  if (messageInputRowEl) {
    messageInputRowEl.classList.add('hidden');
  }
  if (messageInputEl) {
    messageInputEl.value = '';
  }
}