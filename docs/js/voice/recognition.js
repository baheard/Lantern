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
import { PRONUNCIATION_DICT, NAVIGATION_COMMANDS, SKIP_N_PATTERN, BACK_N_PATTERN } from './voice-commands.js';

/**
 * Commands that process INSTANTLY with NO delay (whitelist)
 * These are critical commands that need immediate response
 */
const INSTANT_NO_WAIT = [
  'stop',
  'repeat'
];

/**
 * Single-word commands that can be sent from interim results WITH a short delay
 * The delay prevents false triggers like "south" when saying "southwest"
 */
const INSTANT_COMMANDS = [
  // App navigation commands (most important!)
  'play', 'pause', 'resume',
  'skip', 'end',  // "back" moved to patterns, "stop" and "repeat" moved to no-wait list
  'mute',
  'status',
  // Directions
  'north', 'south', 'east', 'west', 'up', 'down',
  'n', 's', 'e', 'w', 'u', 'd',
  'northeast', 'northwest', 'southeast', 'southwest',
  'ne', 'nw', 'se', 'sw',
  'out',  // 'in' removed - conflicts with "inventory"
  'exit',  // 'enter' removed - only process on press any key screens
  // Common IF commands
  'look', 'l',
  'inventory', 'i',
  'wait', 'z',
  'undo',
  'score',
  // 'yes' and 'no' removed - not instant commands
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

  // Back patterns (app commands) - standalone OR with number
  /^back$/i,  // just "back" - for navigation
  /^back\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i,  // back 3

  // Quick save/load patterns (app commands)
  /^quick\s+save$/i,  // quick save
  /^quicksave$/i,     // quicksave
  /^quick\s+load$/i,  // quick load
  /^quickload$/i,     // quickload

  // Go + direction (common game commands)
  /^go\s+(north|south|east|west|up|down|in|out|n|s|e|w|u|d|ne|nw|se|sw|northeast|northwest|southeast|southwest)$/i
];

/**
 * How long to wait (ms) before processing ANY interim command
 * This prevents short-circuiting compound words like:
 * - "southwest" being heard as "south"
 * - "inventory" being heard as "in"
 * - "southeast" being heard as "south"
 * - "back three" being heard as "back"
 * - "back for something" being heard as "back"
 */
const INTERIM_WAIT_MS = 300;

/**
 * Longer delay for directions that have extended versions
 * (e.g., south -> southwest, north -> northeast)
 * This gives more time for the second part of the word to come through
 */
const INTERIM_WAIT_DIRECTION_MS = 500;

/**
 * Directions that have longer versions (need extended delay)
 */
const EXTENDABLE_DIRECTIONS = ['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'];

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
  // Don't show transcript when in hold mic mode
  if (state.isHoldMic) {
    return;
  }

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
    updateVoiceTranscript(state.isHoldMic ? 'Frozen - say unfreeze...' : 'Listening...', 'listening');
    if (dom.voiceTranscript) {
      dom.voiceTranscript.textContent = state.isHoldMic ? 'Frozen - say unfreeze...' : 'Listening...';
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
  // Don't display anything when in hold mic mode
  if (state.isHoldMic) {
    state.currentInterimTranscript = '';
    return;
  }

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

  // Process, display, and dispatch a recognized transcript.
  // stopAfter=true stops recognition after dispatch (used by instant-command paths).
  async function dispatchRecognized(transcript, confidence, stopAfter = false) {
    const processed = await processVoiceKeywords(transcript, confidence);
    showConfirmedTranscript(transcript, processed === false, confidence);
    if (processed !== false) {
      playCommandSent();
      const { sendCommandDirect } = await import('../game/commands/command-router.js');
      sendCommandDirect(processed, true, confidence);
    } else if (state.pendingCommandProcessed) {
      playAppCommand();
    }
    if (stopAfter && state.recognition) {
      state.recognition.stop();
    }
  }

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
    // But not when in hold mic mode - we don't want any transcripts stored then
    if (!state.isHoldMic) {
      state.currentInterimTranscript = interimTranscript;
    }

    // Detect if user is spelling letters (3+ consecutive single-letter words OR 2-letter directions)
    // If so, flag it so we can use the interim result instead of final's word interpretation
    const words = interimTranscript.split(/\s+/);
    let consecutiveLetters = 0;
    let maxConsecutiveLetters = 0;
    let letterSequences = []; // Track all sequences
    let currentSequence = [];

    for (const word of words) {
      if (word.length === 1 && /^[a-zA-Z]$/.test(word)) {
        consecutiveLetters++;
        currentSequence.push(word.toLowerCase());
        maxConsecutiveLetters = Math.max(maxConsecutiveLetters, consecutiveLetters);
      } else {
        if (currentSequence.length > 0) {
          letterSequences.push(currentSequence);
          currentSequence = [];
        }
        consecutiveLetters = 0;
      }
    }
    if (currentSequence.length > 0) {
      letterSequences.push(currentSequence);
    }

    // Check if we have 3+ letter spelling OR 2-letter directional abbreviations
    const validTwoLetterDirs = ['ne', 'nw', 'se', 'sw'];
    const hasTwoLetterDir = letterSequences.some(seq =>
      seq.length === 2 && validTwoLetterDirs.includes(seq.join(''))
    );

    state.isSpellingLetters = maxConsecutiveLetters >= 3 || hasTwoLetterDir;
    if (state.isSpellingLetters) {
      state.spellingInterimTranscript = interimTranscript; // Save this to use instead of final
    }

    // Show live transcript (but not when muted or in hold mic mode)
    if (interimTranscript && !state.isMuted && !state.isHoldMic) {
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

      // FIRST: Check for truly instant commands (no delay)
      if (INSTANT_NO_WAIT.includes(interimLower) && !state.hasProcessedResult) {
        state.hasProcessedResult = true; // Prevent duplicate processing

        // Cancel any pending interim command timeout
        if (state.interimCommandTimeout) {
          clearTimeout(state.interimCommandTimeout);
          state.interimCommandTimeout = null;
        }

        state.currentInterimTranscript = ''; // Clear so it doesn't get sent again

        // Process and send immediately with high confidence (0.95 = instant interim command)
        await dispatchRecognized(interimTranscript, 0.95, true);
        return;
      }

      // SECOND: Check for delayed instant commands
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

        // Capture current transcript in closure
        const capturedTranscript = interimTranscript;

        // Determine delay: use longer delay for extendable directions (south -> southwest, etc.)
        const isExtendableDirection = EXTENDABLE_DIRECTIONS.includes(interimLower);
        const delay = isExtendableDirection ? INTERIM_WAIT_DIRECTION_MS : INTERIM_WAIT_MS;

        // Start new timeout to wait for potential continuation
        state.interimCommandTimeout = setTimeout(async () => {
          state.interimCommandTimeout = null;

          // Timeout expired - process the command now
          if (!state.hasProcessedResult) {
            state.hasProcessedResult = true; // Prevent duplicate processing
            state.currentInterimTranscript = ''; // Clear so it doesn't get sent again

            // Process and send with high confidence (0.95 = instant interim command)
            await dispatchRecognized(capturedTranscript, 0.95, true);
          }
        }, delay);

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
      } else if (state.interimCommandTimeout) {
        // Interim transcript changed to something that's NOT an instant command
        // Cancel the pending timeout (e.g., user said "s t" - not a command anymore)
        clearTimeout(state.interimCommandTimeout);
        state.interimCommandTimeout = null;
      }

      // Don't show interim transcripts when in hold mic mode
      if (!state.isHoldMic) {
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
    }

    // Process final result
    if (finalTranscript && !state.hasProcessedResult) {
      // Mark processed immediately — prevents onend from racing and re-sending currentInterimTranscript
      // while this async block is still awaiting (onend fires before displayInterimAsLowConfidence clears it)
      state.hasProcessedResult = true;

      // Clear any pending interim command timeout
      if (state.interimCommandTimeout) {
        clearTimeout(state.interimCommandTimeout);
        state.interimCommandTimeout = null;
      }

      // If we detected letter spelling in interim, use that instead of final's word interpretation
      // (e.g., interim "go to s t r e a m" should not become final "go to strain")
      if (state.isSpellingLetters && state.spellingInterimTranscript) {
        finalTranscript = state.spellingInterimTranscript;
        state.isSpellingLetters = false;
        state.spellingInterimTranscript = null;
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

      // When mic is frozen, silently discard all commands except "unfreeze"
      // (processVoiceKeywords will handle "unfreeze" if it comes through)
      if (state.isHoldMic) {
        const lower = finalTranscript.toLowerCase().trim();
        // Only allow "unfreeze" through
        if (lower !== 'unfreeze') {
          state.hasManualTyping = false;
          return; // Silently discard
        }
      }

      // Check for echo (but skip for navigation commands - they should always work)
      try {
        // Check if this is a navigation command first
        const finalLower = finalTranscript.toLowerCase().trim();
        const isNavigationCommand = NAVIGATION_COMMANDS.includes(finalLower) ||
                                     SKIP_N_PATTERN.test(finalLower) ||
                                     BACK_N_PATTERN.test(finalLower);

        // Only check for echo if NOT a navigation command
        if (!isNavigationCommand && isEchoOfSpokenText(finalTranscript)) {
          // Echo detected: play BUZZ (blocked) and show as blocked
          playBlockedCommand();

          // Show in transcript area as blocked (echo) with actual confidence
          showConfirmedTranscript(`${finalTranscript} (blocked)`, false, finalConfidence);

          // Display in game window with muted styling with actual confidence
          import('../ui/game-output.js').then(({ addGameText }) => {
            addGameText(`${finalTranscript} (blocked during narration)`, true, true, false, finalConfidence);
          });

          state.hasManualTyping = false;
          return;
        }
      } catch (e) {
        // Echo detection error (final) - silently ignored
      }

      // Apply single-word pronunciation corrections before confidence checks
      // (e.g., "wet" → "west") so corrected commands are recognized as instant
      const corrWords = finalTranscript.trim().split(/\s+/);
      if (corrWords.length === 1) {
        const corrected = PRONUNCIATION_DICT[corrWords[0].toLowerCase()];
        if (corrected) finalTranscript = corrected;
      }

      // Check for low confidence
      const isLowConfidence = finalConfidence < LOW_CONFIDENCE_THRESHOLD;

      if (isLowConfidence) {
        // Check if this is an instant command - if so, process it anyway
        const finalLower = finalTranscript.toLowerCase().trim();
        let isInstantCmd = INSTANT_NO_WAIT.includes(finalLower) || INSTANT_COMMANDS.includes(finalLower);

        // Check for pattern match in INSTANT_PATTERNS
        if (!isInstantCmd) {
          for (const pattern of INSTANT_PATTERNS) {
            if (pattern.test(finalLower)) {
              isInstantCmd = true;
              break;
            }
          }
        }

        // Check for 2-letter spelled directions (e.g., "n e" -> should be treated like "ne")
        if (!isInstantCmd) {
          const words = finalLower.split(/\s+/);
          if (words.length === 2 && words.every(w => w.length === 1 && /^[a-z]$/.test(w))) {
            const validTwoLetterDirs = ['ne', 'nw', 'se', 'sw'];
            if (validTwoLetterDirs.includes(words.join(''))) {
              isInstantCmd = true;
            }
          }
        }

        if (!isInstantCmd) {
          // Low confidence AND not an instant command
          // In char mode (press any key screens), silently discard low confidence commands
          const { getInputType } = await import('../game/voxglk.js');
          const inputType = getInputType();

          if (inputType === 'char') {
            // Char mode: silently discard low confidence commands (don't display or process)
            state.hasManualTyping = false;
            return;
          }

          // Line mode: display but don't act
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
        // If it IS an instant command with low confidence, process it but use normal confidence for display
        // (so it shows purple instead of red, but still shows the confidence %)
        finalConfidence = LOW_CONFIDENCE_THRESHOLD; // Bump to exactly the threshold so it's not "low" but still shows %
      }

      // Normal confidence: process and execute
      const processed = await processVoiceKeywords(finalTranscript, finalConfidence);
      const isNavCommand = (processed === false);

      // Show as confirmed (with bumped confidence if it was a low-confidence instant command)
      showConfirmedTranscript(finalTranscript, isNavCommand, finalConfidence);

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
    // Clear any pending instant command timeout
    if (state.interimCommandTimeout) {
      clearTimeout(state.interimCommandTimeout);
      state.interimCommandTimeout = null;
    }

    // If we already processed a result (instant command), clear any stale interim text
    // that came in after processing but before recognition stopped
    if (state.hasProcessedResult) {
      state.currentInterimTranscript = '';
    }

    // Check if we're in push-to-talk mode and button was just released
    // In this case, process interim text as a normal command (not low confidence)
    const wasPushToTalkRelease = state.pushToTalkMode && !state.pushToTalkActive;

    // Process any pending instant command or interim transcript
    if (!state.hasProcessedResult && state.currentInterimTranscript) {
      const interimText = state.currentInterimTranscript;
      state.hasProcessedResult = true;
      state.currentInterimTranscript = '';

      // In push-to-talk mode, treat interim text as final result when button is released
      // Otherwise, process with instant command confidence
      const confidence = wasPushToTalkRelease ? 0.90 : 0.95;

      // Process and send with appropriate confidence
      await dispatchRecognized(interimText, confidence);
    } else if (!wasPushToTalkRelease && !state.hasProcessedResult) {
      // No pending instant command - display any remaining interim text as low confidence
      // BUT: Skip this in push-to-talk mode when button was released (already processed above)
      // AND: Skip if we already processed a result (instant command) to avoid duplicate processing
      await displayInterimAsLowConfidence();
    }

    state.isListening = false;
    state.isRecognitionActive = false;

    // Voice commands are now sent immediately in onresult handler
    // No need to check for input field or auto-send here

    // If push-to-talk was released, now we can safely mute
    // (results have been processed above)
    // Extra guard: don't mute if user already started a new PTT session during the await above
    if (wasPushToTalkRelease && !state.isMuted && !state.pushToTalkActive) {
      state.isMuted = true;
      updateStatus('Hold mic button to speak');
    }

    // Don't restart if muted, or if page is hidden — the visibilitychange handler will
    // restart cleanly when the page becomes visible again, avoiding a background restart loop
    if (state.isMuted || document.hidden) {
      return;
    }

    // Restart listening if enabled
    if (state.listeningEnabled) {
      // In push-to-talk mode with button held, restart immediately with no delay
      // This prevents the "stuck" state after sending a command
      const restartDelay = (state.pushToTalkMode && state.pushToTalkActive) ? 0 : 200;

      setTimeout(() => {
        if (state.listeningEnabled && !state.isRecognitionActive && !state.isMuted) {
          // In push-to-talk mode, only restart if button is still held
          if (state.pushToTalkMode && !state.pushToTalkActive) {
            return;
          }

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
      }, restartDelay);
    }
  };

  return recognition;
}
