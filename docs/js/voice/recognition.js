/**
 * Voice Recognition Module
 *
 * Speech recognition using Web Speech API.
 * Handles continuous listening, transcript display, and result processing.
 */

import { state } from '../core/state.js';
import { dom } from '../core/dom.js';
import { updateStatus } from '../utils/status.js';
import { isEchoOfSpokenText } from './echo-detection.js';
import { updateVoiceTranscript } from '../input/keyboard/index.js';
import { playCommandSent, playAppCommand, playLowConfidence, playBlockedCommand, LOW_CONFIDENCE_THRESHOLD } from '../utils/audio-feedback.js';
import { scrollToBottom } from '../utils/scroll.js';

/**
 * Single-word commands that can be sent immediately from interim results
 * These are simple, unambiguous commands that players use frequently
 */
const INSTANT_COMMANDS = [
  // App navigation commands (most important!)
  'play', 'pause', 'resume', 'stop',
  'skip', 'back', 'repeat', 'end',
  'mute',
  'status',
  // Directions
  'north', 'south', 'east', 'west', 'up', 'down',
  'n', 's', 'e', 'w', 'u', 'd',
  'northeast', 'northwest', 'southeast', 'southwest',
  'ne', 'nw', 'se', 'sw',
  'in', 'out',
  // Common IF commands
  'look', 'l',
  'inventory', 'i',
  'wait', 'z',
  'undo',
  'score',
  'yes', 'no',
  'again', 'g',
  'verbose', 'brief', 'superbrief'
];

/**
 * Multi-word command patterns that can be sent immediately from interim results
 * These include app commands and common game command phrases
 */
const INSTANT_PATTERNS = [
  // Skip patterns (app commands)
  /^skip\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i,  // skip 3
  /^skip\s+(?:all|to\s+(?:the\s+)?end)$/i,  // skip all, skip to end, skip to the end

  // Back patterns (app commands)
  /^back\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i,  // back 3

  // Go + direction (common game commands)
  /^go\s+(north|south|east|west|up|down|in|out|n|s|e|w|u|d|ne|nw|se|sw|northeast|northwest|southeast|southwest)$/i
];

/**
 * How long to wait (ms) before processing ANY interim command
 * This prevents short-circuiting compound words like:
 * - "southwest" being heard as "south"
 * - "inventory" being heard as "in"
 * - "southeast" being heard as "south"
 */
const INTERIM_WAIT_MS = 150;

/**
 * Update the last heard text in voice panel
 * @param {string} text - Text that was heard
 * @param {boolean} isNavCommand - Whether this was a navigation command
 */
export function updateLastHeard(text, isNavCommand = false) {
  if (dom.lastHeard) {
    dom.lastHeard.textContent = text;
    dom.lastHeard.className = 'last-heard' + (isNavCommand ? ' nav-command' : '');

    // Clear after 5 seconds
    if (state.lastHeardClearTimeout) clearTimeout(state.lastHeardClearTimeout);
    state.lastHeardClearTimeout = setTimeout(() => {
      dom.lastHeard.textContent = '';
    }, 5000);
  }

  // Add to history array
  state.voiceHistoryItems.unshift({ text, isNavCommand });
  if (state.voiceHistoryItems.length > 20) state.voiceHistoryItems.pop();
}

/**
 * Show confirmed transcript then reset to Listening after 3 seconds
 * @param {string} text - Confirmed transcript text
 * @param {boolean} isNavCommand - Whether this was a navigation command
 * @param {number} confidence - Confidence score (0-1), optional
 */
export function showConfirmedTranscript(text, isNavCommand = false, confidence = null) {
  // Clear any pending reset
  if (state.transcriptResetTimeout) {
    clearTimeout(state.transcriptResetTimeout);
  }

  // Add confidence percentage if provided (always show for voice commands)
  let displayText = text;
  if (confidence !== null) {
    const confidencePercent = (confidence * 100).toFixed(0);
    displayText = `${text} (${confidencePercent}%)`;
  }

  // Determine mode for visual feedback
  const mode = isNavCommand ? 'nav' : 'confirmed';
  const isLowConfidence = confidence !== null && confidence === 0;
  const lockMode = isLowConfidence ? 'low-confidence' : (isNavCommand ? 'nav-command' : 'confirmed');

  // Update both DOM transcript and keyboard indicator
  updateVoiceTranscript(displayText, mode);

  // Also update old DOM element if it exists
  if (dom.voiceTranscript) {
    dom.voiceTranscript.textContent = displayText;
    dom.voiceTranscript.classList.remove('interim');
    dom.voiceTranscript.classList.add('confirmed');
    if (isNavCommand) {
      dom.voiceTranscript.classList.add('nav-command');
    } else {
      dom.voiceTranscript.classList.remove('nav-command');
    }
  }

  // Update lock screen transcript with visual feedback
  if (state.isScreenLocked) {
    import('../utils/lock-screen.js').then(({ updateLockTranscript }) => {
      updateLockTranscript(displayText, lockMode);
    });
  }

  // Also update lastHeard for history (use original text without confidence)
  updateLastHeard(text, isNavCommand);

  // Reset transcript after 3 seconds
  state.transcriptResetTimeout = setTimeout(() => {
    updateVoiceTranscript(state.isMuted ? 'Muted' : 'Listening...', 'listening');
    if (dom.voiceTranscript) {
      dom.voiceTranscript.textContent = state.isMuted ? 'Muted' : 'Listening...';
      dom.voiceTranscript.classList.remove('confirmed', 'nav-command');
    }
    // Change lock screen transcript to processed state (dim it) instead of clearing
    if (state.isScreenLocked) {
      import('../utils/lock-screen.js').then(({ updateLockTranscript }) => {
        updateLockTranscript(displayText, 'processed');
      });
    }
  }, 3000);
}

/**
 * Display any pending interim transcript with low confidence feedback (warble)
 * This shows the user what was heard but does NOT execute it
 * Call this before clearing interim text to ensure it's not lost
 */
async function displayInterimAsLowConfidence() {
  if (state.currentInterimTranscript && state.currentInterimTranscript.trim()) {
    const interimText = state.currentInterimTranscript.trim();

    // Play low confidence sound (warble)
    playLowConfidence();

    // Show in transcript area WITH 0% confidence
    showConfirmedTranscript(interimText, false, 0);

    // Display in game window with muted styling (but don't send to game)
    try {
      const { addGameText } = await import('../ui/game-output.js');
      addGameText(interimText, true, true, false, 0);
    } catch (err) {
      // Failed to display interim text
    }

    state.currentInterimTranscript = '';
  }
}

/**
 * Safely start voice recognition with proper error handling
 * @returns {Promise<boolean>} True if started successfully, false if failed
 */
export async function startRecognitionSafely() {
  if (!state.recognition || state.isRecognitionActive) {
    return false;
  }

  try {
    await state.recognition.start();
    return true;
  } catch (err) {
    // Recognition failed to start
    // Get error message from various possible properties
    const errorMessage = err?.message || err?.error || String(err);
    const errorName = err?.name || '';
    const errorType = err?.type || '';

    // Import audio feedback
    const { playBlockedCommand } = await import('../utils/audio-feedback.js');

    // Check for common errors
    if (errorMessage.toLowerCase().includes('secure') ||
        errorMessage.toLowerCase().includes('https') ||
        errorMessage.toLowerCase().includes('ssl')) {
      updateStatus('⚠️ Microphone requires HTTPS connection');
      playBlockedCommand(); // Buzz sound for error
    } else if (errorMessage.toLowerCase().includes('not-allowed') ||
               errorMessage.toLowerCase().includes('permission') ||
               errorName === 'NotAllowedError') {
      updateStatus('⚠️ Microphone permission denied');
      playBlockedCommand(); // Buzz sound for error
    } else if (errorMessage.toLowerCase().includes('not-found')) {
      updateStatus('⚠️ No microphone found');
      playBlockedCommand(); // Buzz sound for error
    } else {
      updateStatus('⚠️ Microphone failed: ' + errorMessage);
      playBlockedCommand(); // Buzz sound for error
    }

    // Update state to reflect failure
    state.isRecognitionActive = false;
    state.isListening = false;

    return false;
  }
}

/**
 * Initialize voice recognition
 * @param {Function} processVoiceKeywords - Function to process voice commands
 * @returns {SpeechRecognition|null} Recognition instance
 */
export function initVoiceRecognition(processVoiceKeywords) {
  let recognition = null;

  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
  } else if ('SpeechRecognition' in window) {
    recognition = new SpeechRecognition();
  } else {
    return null;
  }

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    state.isListening = true;
    state.isRecognitionActive = true;
    state.hasProcessedResult = false;

    // Update status based on lock state
    if (state.isScreenLocked && !state.isMuted) {
      updateStatus('🎤 Listening... Say "unlock"');
      // Show listening indicator on lock screen
      import('../utils/lock-screen.js').then(({ showLockListeningIndicator }) => {
        showLockListeningIndicator();
      });
    } else if (!state.isNarrating && !state.isMuted) {
      updateStatus('🎤 Listening... Speak now!');
    }

    // Browser handles silence detection automatically - no manual timeout needed
  };

  recognition.onresult = async (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    let finalConfidence = 1.0; // Default to full confidence

    // Collect both interim and final results
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
        // Capture confidence (use lowest if multiple final results)
        if (result[0].confidence !== undefined) {
          finalConfidence = Math.min(finalConfidence, result[0].confidence);
        }
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    // Store interim transcript for potential use when tab is switched
    state.currentInterimTranscript = interimTranscript;

    // Show live transcript (but not when muted)
    if (interimTranscript && !state.isMuted) {
      // Cancel any pending confirmed transition
      if (state.confirmedTranscriptTimeout) {
        clearTimeout(state.confirmedTranscriptTimeout);
        state.confirmedTranscriptTimeout = null;
      }

      // During narration, filter echo from interim transcripts
      try {
        if (state.isNarrating && isEchoOfSpokenText(interimTranscript)) {
          return;
        }
      } catch (e) {
        // Echo detection error (interim) - silently ignored
      }

      // Check if interim transcript matches an instant command (exact or pattern)
      const interimLower = interimTranscript.toLowerCase().trim();

      // Check for exact match in INSTANT_COMMANDS
      let isInstantCommand = INSTANT_COMMANDS.includes(interimLower);

      // Check for pattern match in INSTANT_PATTERNS
      if (!isInstantCommand) {
        for (const pattern of INSTANT_PATTERNS) {
          if (pattern.test(interimLower)) {
            isInstantCommand = true;
            break;
          }
        }
      }

      // If we have a potential instant command, wait briefly before processing
      // This prevents "south" from being sent when user is saying "southwest"
      if (isInstantCommand && !state.hasProcessedResult) {
        // Cancel any existing interim timeout
        if (state.interimCommandTimeout) {
          clearTimeout(state.interimCommandTimeout);
        }

        // Start new timeout to wait for potential continuation
        state.interimCommandTimeout = setTimeout(() => {
          state.interimCommandTimeout = null;

          // Timeout expired - process the command now
          if (!state.hasProcessedResult) {
            state.hasProcessedResult = true; // Prevent duplicate processing
            state.currentInterimTranscript = ''; // Clear so it doesn't get sent again

            // Process and send with high confidence (0.95 = instant interim command)
            const processed = processVoiceKeywords(interimTranscript, 0.95);
            const isNavCommand = (processed === false);

            // Show as confirmed with mic indicator
            showConfirmedTranscript(interimTranscript, isNavCommand);

            if (processed !== false) {
              // Game command - send immediately
              playCommandSent();
              import('../game/commands/command-router.js').then(({ sendCommandDirect }) => {
                sendCommandDirect(processed, true, 0.95);
              });
            } else {
              // Navigation command
              if (state.pendingCommandProcessed) {
                playAppCommand();
              }
            }

            // Stop recognition after instant command (will restart automatically)
            if (state.recognition) {
              state.recognition.stop();
            }
          }
        }, INTERIM_WAIT_MS);

        // Update display but don't process yet - waiting for potential continuation
        updateVoiceTranscript(interimTranscript, 'interim');
        if (state.isScreenLocked) {
          import('../utils/lock-screen.js').then(({ updateLockTranscript }) => {
            updateLockTranscript(interimTranscript, 'interim');
          });
        }
        if (dom.voiceTranscript) {
          dom.voiceTranscript.textContent = interimTranscript;
          dom.voiceTranscript.classList.remove('confirmed');
          dom.voiceTranscript.classList.add('interim');
        }
        return;
      }

      // Update voice indicator with interim text
      updateVoiceTranscript(interimTranscript, 'interim');

      // Update lock screen transcript if locked
      if (state.isScreenLocked) {
        import('../utils/lock-screen.js').then(({ updateLockTranscript }) => {
          updateLockTranscript(interimTranscript, 'interim');
        });
      }

      // Also update old DOM element if it exists
      if (dom.voiceTranscript) {
        dom.voiceTranscript.textContent = interimTranscript;
        dom.voiceTranscript.classList.remove('confirmed');
        dom.voiceTranscript.classList.add('interim');
      }
    }

    // Process final result
    if (finalTranscript && !state.hasProcessedResult) {
      // Clear any pending interim command timeout
      if (state.interimCommandTimeout) {
        clearTimeout(state.interimCommandTimeout);
        state.interimCommandTimeout = null;
      }

      // Send any pending interim text before clearing it
      await displayInterimAsLowConfidence();

      // Reset command processed flag
      state.pendingCommandProcessed = false;

      // When muted, mic should be off - ignore any stray results (shouldn't happen)
      if (state.isMuted) {
        state.hasManualTyping = false;
        return;
      }

      // Check for echo
      try {
        if (isEchoOfSpokenText(finalTranscript)) {
          // Echo detected: play BUZZ (blocked) and show as blocked
          playBlockedCommand();

          // Show in transcript area as blocked (echo)
          showConfirmedTranscript(`${finalTranscript} (blocked)`, false, 0);

          // Display in game window with muted styling
          import('../ui/game-output.js').then(({ addGameText }) => {
            addGameText(`${finalTranscript} (blocked during narration)`, true, true, false, 0);
          });

          state.hasManualTyping = false;
          return;
        }
      } catch (e) {
        // Echo detection error (final) - silently ignored
      }

      // Check for low confidence
      const isLowConfidence = finalConfidence < LOW_CONFIDENCE_THRESHOLD;

      if (isLowConfidence) {
        // Low confidence: display but don't act
        playLowConfidence();

        // Show in transcript area WITH confidence percentage
        showConfirmedTranscript(finalTranscript, false, finalConfidence);

        // Display in game window with muted styling (but don't send to game)
        import('../ui/game-output.js').then(({ addGameText }) => {
          addGameText(finalTranscript, true, true, false, finalConfidence);
        });

        state.hasManualTyping = false;
        return; // Don't process further
      }

      // Normal confidence: process and execute
      const processed = processVoiceKeywords(finalTranscript, finalConfidence);
      const isNavCommand = (processed === false);

      // Show as confirmed
      showConfirmedTranscript(finalTranscript, isNavCommand);

      if (processed !== false) {
        // Game command - populate input and show indicator
        if (dom.userInput) {
          dom.userInput.value = processed;
        }
        if (dom.voiceIndicator) {
          dom.voiceIndicator.classList.add('active');
        }

        state.hasManualTyping = false;

        // Auto-submit after brief delay to show user what was recognized
        setTimeout(() => {
          playCommandSent();

          // Import and call sendCommandDirect with confidence info
          import('../game/commands/command-router.js').then(({ sendCommandDirect }) => {
            sendCommandDirect(processed, true, finalConfidence);

            // Clear input and hide indicator after sending
            if (dom.userInput) {
              dom.userInput.value = '';
            }
            if (dom.voiceIndicator) {
              dom.voiceIndicator.classList.remove('active');
            }
          });
        }, 0); // Instant submission for immediate response
      } else {
        // Navigation command - only play sound if it was actually processed (not rejected)
        if (state.pendingCommandProcessed) {
          playAppCommand();
        }
        state.hasManualTyping = false;
      }
    }
  };

  recognition.onerror = async (event) => {
    // Clear any pending interim command timeout
    if (state.interimCommandTimeout) {
      clearTimeout(state.interimCommandTimeout);
      state.interimCommandTimeout = null;
    }

    // Send interim text before handling error
    await displayInterimAsLowConfidence();

    // Silently ignore common expected errors
    if (event.error === 'network' || event.error === 'aborted') {
      return;
    } else if (event.error === 'no-speech') {
      // Ignore no-speech errors
    } else {
      updateStatus('Voice error: ' + event.error);
    }

    state.isListening = false;
    state.isRecognitionActive = false;
  };

  recognition.onend = async () => {
    // Clear any pending interim command timeout
    if (state.interimCommandTimeout) {
      clearTimeout(state.interimCommandTimeout);
      state.interimCommandTimeout = null;
    }

    // Send any interim text before recognition ends
    await displayInterimAsLowConfidence();

    state.isListening = false;
    state.isRecognitionActive = false;

    // Voice commands are now sent immediately in onresult handler
    // No need to check for input field or auto-send here

    // In push-to-talk mode, don't auto-restart (only restart when button is held)
    if (state.pushToTalkMode) {
      return;
    }

    // Don't restart if muted - mic should be fully off
    if (state.isMuted) {
      return;
    }

    // Restart listening if enabled
    if (state.listeningEnabled) {
      setTimeout(() => {
        if (state.listeningEnabled && !state.isRecognitionActive && !state.isMuted) {
          try {
            // Clear transcript display if not showing confirmed text
            if (dom.voiceTranscript && !dom.voiceTranscript.classList.contains('confirmed')) {
              updateVoiceTranscript('Listening...', 'listening');
              dom.voiceTranscript.textContent = 'Listening...';
              dom.voiceTranscript.classList.remove('interim');
            }

            recognition.start();
          } catch (err) {
            // Ignore if already running - silently ignore restart errors
          }
        }
      }, 200);
    }
  };

  return recognition;
}
