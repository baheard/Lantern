/**
 * Keyboard Input Core Module
 *
 * Handles keyboard input via messaging interface in controls panel.
 * Voice UI and system entry mode are in separate modules.
 */

import { state } from '../../core/state.js';
import { sendCommandDirect } from '../../game/commands/index.js';
import { getInputType, sendInput } from '../../game/voxglk.js';
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
let charEscBtnEl = null;
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

// Game area element refs (populated in initKeyboardInput)
let lowerWindowEl = null;
let gameOutputEl = null;

// Word hover highlight overlay (created on demand, persists across events)
let highlightOverlay = null;

// Touch tracker for tap-to-examine (no DOM dependency — safe at module level)
const tapExamineTouchTracker = createTouchTracker(10);

// Direction words that use "go" prefix in tap-to-examine
const DIRECTIONS = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
  'up', 'down', 'u', 'd',
  'in', 'out'
];

// Common IF verbs that receive no prefix in tap-to-examine
const COMMON_VERBS = [
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

/**
 * Populate input with a tapped/clicked word.
 * First word gets a verb prefix (examine/go) unless it is a common verb.
 * Additional words are appended; the prefix stays selected for easy replacement.
 */
function populateInputWithWord(word) {
  if (!messageInputEl) return;

  const wordLower = word.toLowerCase();
  const currentValue = messageInputEl.value.trim();

  if (currentValue === '') {
    const isVerb = COMMON_VERBS.includes(wordLower);
    const isDirection = DIRECTIONS.includes(wordLower);

    if (isVerb) {
      messageInputEl.value = `${word} `;
      if (hasPhysicalKeyboard() || document.activeElement === messageInputEl) {
        messageInputEl.setSelectionRange(messageInputEl.value.length, messageInputEl.value.length);
      }
      wordJustPopulated = true;
      populatedWordLength = word.length;
    } else {
      const prefix = isDirection ? 'go' : 'examine';
      messageInputEl.value = `${prefix} ${word}`;
      if (hasPhysicalKeyboard() || document.activeElement === messageInputEl) {
        messageInputEl.setSelectionRange(0, prefix.length);
      }
      wordJustPopulated = true;
      populatedWordLength = word.length;
    }
  } else {
    const words = currentValue.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.toLowerCase() === wordLower) {
      if (hasPhysicalKeyboard()) {
        messageInputEl.focus();
      }
      return;
    }

    let prefixLength = 0;
    if (currentValue.startsWith('go ')) prefixLength = 2;
    else if (currentValue.startsWith('x ')) prefixLength = 1;

    messageInputEl.value = `${currentValue} ${word} `;

    if (prefixLength > 0 && (hasPhysicalKeyboard() || document.activeElement === messageInputEl)) {
      messageInputEl.setSelectionRange(0, prefixLength);
    }

    wordJustPopulated = true;
    populatedWordLength = word.length;
  }

  if (hasPhysicalKeyboard()) {
    messageInputEl.focus();
  } else {
    messageInputEl.scrollLeft = messageInputEl.scrollWidth;
  }
}

function handleTouchStart(e) {
  tapExamineTouchTracker.track(e);
}

function handleGameClick(e) {
  if (e.type === 'mouseup' && e.button !== 0) return;

  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

  const inputType = getInputType();
  if (inputType !== 'line' || !messageInputEl) {
    tapExamineTouchTracker.reset();
    return;
  }

  const isTapExamineEnabled = document.body.classList.contains('tap-to-examine-enabled');
  if (!isTapExamineEnabled) {
    if (hasPhysicalKeyboard()) messageInputEl.focus();
    tapExamineTouchTracker.reset();
    return;
  }

  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
    tapExamineTouchTracker.reset();
    return;
  }

  if (!tapExamineTouchTracker.isTap(e)) {
    e.preventDefault();
    e.stopPropagation();
    tapExamineTouchTracker.reset();
    return;
  }

  const selection = window.getSelection();
  const selectedText = selection ? selection.toString() : '';

  if (selectedText.length > 0) {
    const anchorNode = selection.anchorNode;
    const isGameTextSelection = anchorNode && (
      lowerWindowEl?.contains(anchorNode) ||
      gameOutputEl?.contains(anchorNode)
    );
    if (isGameTextSelection) {
      if (hasPhysicalKeyboard()) messageInputEl.focus();
      return;
    }
  }

  const wordData = extractWordAtPoint(clientX, clientY);
  tapExamineTouchTracker.reset();

  if (wordData && wordData.word) {
    e.preventDefault();
    e.stopPropagation();
    populateInputWithWord(wordData.word);
  } else {
    if (hasPhysicalKeyboard()) messageInputEl.focus();
  }
}

function handleGameMouseMove(e) {
  const isTouchDevice = mqCoarse.matches && !mqHover.matches;
  if (isTouchDevice) {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    return;
  }

  const inputType = getInputType();
  if (inputType !== 'line') {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    return;
  }

  const isTapExamineEnabled = document.body.classList.contains('tap-to-examine-enabled');
  if (!isTapExamineEnabled) {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    return;
  }

  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    return;
  }

  const wordData = extractWordAtPoint(e.clientX, e.clientY);

  if (wordData && wordData.word && wordData.range) {
    if (!highlightOverlay) {
      highlightOverlay = document.createElement('div');
      highlightOverlay.style.position = 'fixed';
      highlightOverlay.style.backgroundColor = 'rgba(0, 170, 255, 0.12)';
      highlightOverlay.style.borderRadius = '2px';
      highlightOverlay.style.pointerEvents = 'none';
      highlightOverlay.style.zIndex = '1000';
      document.body.appendChild(highlightOverlay);
    }

    const rect = wordData.range.getBoundingClientRect();
    highlightOverlay.style.left = rect.left + 'px';
    highlightOverlay.style.top = rect.top + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
    highlightOverlay.style.display = 'block';
  } else {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
  }
}

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
  charEscBtnEl = document.getElementById('charEscBtn');

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

    // Clear flag when user types (manual editing)
    messageInputEl.addEventListener('input', () => {
      wordJustPopulated = false;
    });

    // On focus, select populated word for easy replacement (mobile only)
    messageInputEl.addEventListener('focus', () => {
      inputWasFocused = true; // Track focus state

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

  // ESC button: Send escape key to game
  if (charEscBtnEl) {
    charEscBtnEl.addEventListener('click', () => sendInput('escape', 'char'));
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

  // Cache game area elements used by tap-to-examine handlers
  lowerWindowEl = document.getElementById('lowerWindow');
  gameOutputEl = document.getElementById('gameOutput');

  // Only listen on lowerWindow (main game text), not gameOutput container
  if (lowerWindowEl) {
    // Mouse events (desktop)
    lowerWindowEl.addEventListener('mousemove', handleGameMouseMove);
    lowerWindowEl.addEventListener('mousedown', handleTouchStart);
    lowerWindowEl.addEventListener('mouseup', handleGameClick);

    // Touch events (mobile)
    lowerWindowEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    lowerWindowEl.addEventListener('touchend', handleGameClick);
  }

  // Function to update cursor based on tap-to-examine setting
  function updateTapExamineCursor() {
    const enabled = localStorage.getItem('iftalk_tap_to_examine') !== 'false';
    document.body.classList.toggle('tap-to-examine-enabled', enabled);
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
      e.preventDefault(); // Prevent double-typing and button default behavior
    }
    return;
  }

  // When typing in message input, mark as manual and scroll to show input
  if (e.target === messageInputEl && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.hasManualTyping = true;
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
 * Update input visibility based on input type and mute state
 */
export function updateInputVisibility() {
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
  }

  // Store last command for echo detection
  window.lastSentCommand = cmd;

  // Play feedback tone
  playCommandSent();

  sendCommandDirect(cmd, false); // false = not a voice command
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