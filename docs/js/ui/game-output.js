/**
 * Game Output Module
 *
 * Handles rendering game text and commands to the screen.
 * Uses lazy chunking - chunks are created on-demand when narration starts.
 */

import { state, resetNarrationState } from '../core/state.js';
import { dom } from '../core/dom.js';
import { escapeHtml, escapeRegExp } from '../utils/text-processing.js';
import { insertTemporaryMarkers, createNarrationChunks, insertRealMarkersAtIDs, removeTemporaryMarkers } from '../narration/chunking.js';
import { stopNarration } from '../narration/tts-player.js';
import { scrollToTop, scrollToNewContent, scrollToBottom } from '../utils/scroll.js';
import { LOW_CONFIDENCE_THRESHOLD } from '../utils/audio-feedback.js';

/**
 * Extract chunks and marker IDs in a single pass
 * @param {Array} chunksWithMarkers - Array of {text, markerID, index, voice} objects
 * @returns {{chunks: Array, markerIDs: number[]}} Extracted chunks (with voice info) and marker IDs
 */
function extractChunksAndMarkers(chunksWithMarkers) {
  const chunks = [];
  const markerIDs = [];

  for (const item of chunksWithMarkers) {
    // Preserve full chunk object (including voice type)
    chunks.push({
      text: item.text,
      voice: item.voice || 'narrator'
    });
    if (item.markerID !== null) {
      markerIDs.push(item.markerID);
    }
  }

  return { chunks, markerIDs };
}

/**
 * Ensure chunks are ready for narration
 * Creates chunks on-demand from status line + game text (lazy evaluation)
 * @returns {boolean} True if chunks are ready
 */
export function ensureChunksReady() {
  // If chunks are already valid, nothing to do
  if (state.chunksValid && state.narrationChunks.length > 0) {
    return true;
  }

  // CRITICAL: Remove ALL old chunk markers from the entire document first
  // Old markers from previous content would cause duplicate results and wrong scroll positions
  document.querySelectorAll('.chunk-marker-start, .chunk-marker-end').forEach(el => el.remove());

  // Get elements
  const statusEl = window.currentStatusBarElement || document.getElementById('statusBar');
  const upperEl = document.getElementById('upperWindow');

  // Get main element - use currentGameTextElement if set, otherwise find last game-text element
  // (Fallback needed after restore when currentGameTextElement is null)
  let mainEl = state.currentGameTextElement;
  if (!mainEl) {
    const lowerWindow = document.getElementById('lowerWindow');
    const gameTexts = lowerWindow?.querySelectorAll('.game-text');
    mainEl = gameTexts && gameTexts.length > 0 ? gameTexts[gameTexts.length - 1] : null;

    // Set it so future calls don't need to search
    if (mainEl) {
      state.currentGameTextElement = mainEl;
    }
  }

  // Get HTML
  const statusHTML = statusEl ? statusEl.innerHTML : '';
  const upperHTML = upperEl ? upperEl.innerHTML : '';
  const mainHTML = mainEl ? mainEl.innerHTML : '';

  const hasStatus = statusHTML && statusHTML.trim();
  const hasUpper = upperHTML && upperHTML.trim();
  const hasMain = mainHTML && mainHTML.trim();

  if (!hasStatus && !hasUpper && !hasMain) {
    return false;
  }

  let allChunks = [];
  let chunkOffset = 0;

  // Check if status bar should be included (set by voxglk when status bar changes)
  const shouldIncludeStatus = window.includeStatusBarInChunks !== false; // Default true for first load

  // Process status line first (if exists AND should be included)
  if (hasStatus && statusEl && shouldIncludeStatus) {
    const statusMarkedHTML = insertTemporaryMarkers(statusHTML);
    const statusChunksWithMarkers = createNarrationChunks(statusMarkedHTML);
    const { chunks: statusChunks, markerIDs: statusMarkerIDs } =
      extractChunksAndMarkers(statusChunksWithMarkers);

    // Prefix first status chunk with "Status: " for clarity
    if (statusChunks.length > 0 && statusChunks[0].text.trim()) {
      statusChunks[0].text = 'Status: ' + statusChunks[0].text;
    }

    // Apply markers to status element
    statusEl.innerHTML = statusMarkedHTML;

    // Insert start marker for chunk 0 at the BEGINNING of the container
    // (temp markers are at sentence endings, so start[0] must be inserted separately)
    if (statusEl.firstChild) {
      const startMarker = document.createElement('span');
      startMarker.className = 'chunk-marker-start';
      startMarker.dataset.chunk = 0;
      startMarker.style.cssText = 'display: none; position: absolute;';
      statusEl.insertBefore(startMarker, statusEl.firstChild);
    }

    // Now insert real markers (this removes temp markers from DOM)
    // Skip creating final start marker if another container follows (upper window or main content)
    const statusHasFollowingContainer = hasUpper || hasMain;
    insertRealMarkersAtIDs(statusEl, statusMarkerIDs, 0, statusHasFollowingContainer);

    removeTemporaryMarkers(statusEl, statusChunks);

    allChunks = allChunks.concat(statusChunks);
    chunkOffset = statusChunks.length;
  }

  // Process upper window second (if exists) - for quotes, formatted text, etc.
  // Process upper window second (if exists) - for quotes, formatted text, etc.
  // Always skip line breaks: keeps upper window as one big chunk, avoids running
  // processTextForTTS on article/grid text that would corrupt it.
  if (hasUpper && upperEl) {
    const upperMarkedHTML = insertTemporaryMarkers(upperHTML, true); // skip line breaks
    const upperChunksWithMarkers = createNarrationChunks(upperMarkedHTML);
    const { chunks: upperChunks, markerIDs: upperMarkerIDs } =
      extractChunksAndMarkers(upperChunksWithMarkers);

    // Apply markers to upper window element (NO renumbering - keep original marker IDs!)
    upperEl.innerHTML = upperMarkedHTML;

    // Insert start marker at the BEGINNING of the container
    // (temp markers are at sentence endings, so first chunk's start must be inserted separately)
    if (upperEl.firstChild) {
      const startMarker = document.createElement('span');
      startMarker.className = 'chunk-marker-start';
      startMarker.dataset.chunk = chunkOffset;
      startMarker.style.cssText = 'display: none; position: absolute;';
      upperEl.insertBefore(startMarker, upperEl.firstChild);
    }

    // Now insert real markers (this removes temp markers from DOM)
    // Skip creating final start marker if main content follows
    insertRealMarkersAtIDs(upperEl, upperMarkerIDs, chunkOffset, hasMain);

    removeTemporaryMarkers(upperEl, upperChunks);

    allChunks = allChunks.concat(upperChunks);
    chunkOffset += upperChunks.length;
  }

  // Process main content third (if exists)
  if (hasMain && mainEl) {
    // CRITICAL: Remove glk-input (command echo) and user-command divs from HTML before chunking
    // The narrator should NEVER read user commands - only game responses
    let cleanedMainHTML = mainHTML
      // Remove glk-input spans (game's command echo - styled blue command text)
      .replace(/<span[^>]*class="[^"]*glk-input[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
      // Remove user-command divs (our own command display)
      .replace(/<div[^>]*class="[^"]*user-command[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    let mainMarkedHTML = insertTemporaryMarkers(cleanedMainHTML);
    const mainChunksWithMarkers = createNarrationChunks(mainMarkedHTML);
    const { chunks: mainChunks, markerIDs: mainMarkerIDs } =
      extractChunksAndMarkers(mainChunksWithMarkers);

    // Check if this is a system message - use app voice (beep will play before speaking)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = mainHTML;
    const hasSystemMessage = tempDiv.querySelector('.system-message') !== null;

    if (hasSystemMessage && mainChunks.length > 0) {
      // Mark all system message chunks to use app voice
      for (const chunk of mainChunks) {
        chunk.voice = 'app';
      }
      // No text prefix needed - beep will indicate system message
    }

    // Apply markers to main element (NO renumbering - keep original marker IDs!)
    mainEl.innerHTML = mainMarkedHTML;

    // Insert start marker at the BEGINNING of the container
    // (temp markers are at sentence endings, so first chunk's start must be inserted separately)
    if (mainEl.firstChild) {
      const startMarker = document.createElement('span');
      startMarker.className = 'chunk-marker-start';
      startMarker.dataset.chunk = chunkOffset;
      startMarker.style.cssText = 'display: none; position: absolute;';
      mainEl.insertBefore(startMarker, mainEl.firstChild);
    }

    // Now insert real markers (this removes temp markers from DOM)
    // Main content is last container, so don't skip any start markers
    insertRealMarkersAtIDs(mainEl, mainMarkerIDs, chunkOffset, false);

    removeTemporaryMarkers(mainEl, mainChunks);

    allChunks = allChunks.concat(mainChunks);
  }

  state.narrationChunks = allChunks;

  // Mark chunks as valid
  state.chunksValid = true;

  // If we're loading from a save, position at end (don't read whole transcript)
  // User can use back/restart to hear content if desired
  if (state.skipNarrationAfterLoad) {
    state.currentChunkIndex = allChunks.length;  // Position past last chunk
    state.skipNarrationAfterLoad = false;  // Clear flag
  }

  return true;
}

/**
 * Add text to game output
 * @param {string} text - Text to add (HTML or plain text)
 * @param {boolean} isCommand - Whether this is a user command
 * @param {boolean} isVoiceCommand - Whether this was a voice command
 * @param {boolean} isAppCommand - Whether this is an app/navigation command
 * @param {number|null} confidence - Voice recognition confidence (0.0-1.0), null for keyboard
 * @returns {HTMLElement} The created element
 */
export function addGameText(text, isCommand = false, isVoiceCommand = false, isAppCommand = false, confidence = null) {
  // For game text (not commands), remove glk-input echoes before displaying
  if (!isCommand) {
    // Remove glk-input spans (game's command echo) - we display commands ourselves
    text = text.replace(/<span[^>]*class="[^"]*glk-input[^"]*"[^>]*>.*?<\/span>/gi, '');

    // Also remove any leading ">command" text that might not be in a span
    if (window.lastSentCommand) {
      const lastCmd = window.lastSentCommand.trim();
      // Remove patterns like ">look\n" or "> look\n" at the start
      const escapedCmd = escapeRegExp(lastCmd);
      text = text.replace(new RegExp(`^\\s*&gt;\\s*${escapedCmd}\\s*(<br\\s*/?>|\\n)?`, 'i'), '');
      text = text.replace(new RegExp(`^\\s*>\\s*${escapedCmd}\\s*(<br\\s*/?>|\\n)?`, 'i'), '');
      window.lastSentCommand = null; // Clear after use
    }

    // If nothing left after removing echo, skip display
    const plainText = text.replace(/<[^>]*>/g, '').trim();
    if (!plainText) {
      return null;
    }
  }

  const div = document.createElement('div');

  // Determine if low confidence
  const isLowConfidence = confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;

  if (isCommand) {
    // Build class list based on command type
    let classNames = ['user-command'];
    if (isVoiceCommand) classNames.push('voice-command');
    if (isAppCommand) classNames.push('app-command');
    if (isLowConfidence) classNames.push('low-confidence');
    div.className = classNames.join(' ');

    // Build the command display
    // Format: ">command" for typed, ">command (95%) 🎤" for voice
    const displayText = (text === '' || text === '[ENTER]') ? '[ENTER]' : escapeHtml(text);
    // Show confidence percentage and mic icon for voice commands
    const confidenceLabel = (isVoiceCommand && confidence !== null) ? ` <span class="confidence-percent">(${Math.round(confidence * 100)}%)</span>` : '';
    const voiceIndicator = isVoiceCommand ? ' <span class="voice-indicator material-icons">mic</span>' : '';

    div.innerHTML = `<span class="command-label">&gt;</span><span class="command-text">${displayText}</span>${confidenceLabel}${voiceIndicator}`;
  } else {
    // Game text - cleared only when Z-machine sends clear command
    div.className = 'game-text';

    // Check if this is a system message (for auto-narration)
    const tempCheck = document.createElement('div');
    tempCheck.innerHTML = text;
    const isSystemMessage = tempCheck.querySelector('.system-message') !== null;

    // Stop any active narration when new content arrives
    if (state.isNarrating) {
      stopNarration();
    }

    // LAZY CHUNKING: Just render HTML, don't create chunks yet
    // Chunks will be created on-demand when narration is requested
    div.innerHTML = text;

    // Invalidate existing chunks - they're for old content
    state.chunksValid = false;
    state.narrationChunks = []; // Clear old chunks to prevent reading stale data
    state.currentChunkIndex = 0;
    state.currentChunkStartTime = 0;

    // Auto-narrate system messages using app voice (only if narration is active)
    // Skip if _pendingRepeatAfterRestore — performRestore will speak + chain section narration itself
    if (isSystemMessage && (state.isNarrating || state.autoplayEnabled) && !window._pendingRepeatAfterRestore) {
      // Speak system message
      (async () => {
        const { speakAppMessage } = await import('../narration/tts-player.js');

        // Extract text from system message, respecting newlines as sentence boundaries
        const systemMsgEl = tempCheck.querySelector('.system-message');
        // Replace <br> tags with ". " to create natural pauses between lines
        const htmlWithPauses = systemMsgEl.innerHTML.replace(/<br\s*\/?>/gi, '. ');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlWithPauses;
        const systemText = tempDiv.textContent.trim();

        // Speak system message (no beep)
        speakAppMessage(systemText);
      })().catch(err => {
        // Failed to auto-narrate system message
      });
    }
  }

  if (dom.lowerWindow) {
    // Append new content before the command line (keep command line at bottom)
    const commandLine = document.getElementById('commandLine');
    if (commandLine && commandLine.parentElement === dom.lowerWindow) {
      dom.lowerWindow.insertBefore(div, commandLine);
    } else {
      dom.lowerWindow.appendChild(div);
    }
  }

  // Scroll behavior (see reference/design-decisions.md):
  // - User commands: scroll to show the command (not all the way to top)
  // - First game text on screen (fresh screen): scroll to top
  // - Subsequent game text (after command): scroll to show top of new text

  // Game text: check if this is first content
  const existingContent = dom.lowerWindow?.querySelectorAll('.game-text, .user-command');
  const isFirstOnScreen = existingContent && existingContent.length <= 1;

  if (isFirstOnScreen) {
    // Fresh screen: scroll to top so user reads from beginning
    scrollToTop(dom.gameOutput);
  } else if (dom.gameOutput) {
    // After command or new content: scroll toward bottom, but keep top of new content visible
    scrollToNewContent(div, dom.gameOutput);
  }

  // Track for highlighting (only for game text, not commands)
  if (!isCommand) {
    state.currentGameTextElement = div;
  }

  // Refresh scroll-down button fade state after adding content
  import('./scroll-down-button.js').then(({ refreshScrollButton }) => {
    refreshScrollButton();
  }).catch(() => {
    // Scroll button module not loaded yet or not available
  });

  return div;
}

/**
 * Clear all game output (but preserve command line)
 * Called when Z-machine sends a clear window command.
 * Removes all content from DOM to free memory.
 */
export function clearGameOutput() {
  if (dom.lowerWindow) {
    // Extract command line first (it might be nested inside a game-text div)
    const commandLine = document.getElementById('commandLine');

    // Clear everything from DOM
    dom.lowerWindow.innerHTML = '';

    // Re-append command line directly to lowerWindow
    if (commandLine) {
      dom.lowerWindow.appendChild(commandLine);
    }
  }
  resetNarrationState();
}

/**
 * Display an app/navigation command in the game output
 * @param {string} command - The command text (e.g., "back", "pause", "skip")
 * @param {number|null} confidence - Voice recognition confidence, null for keyboard
 */
export function displayAppCommand(command, confidence = null) {
  addGameText(command, true, true, true, confidence);
}

/**
 * Display a blocked command (game command during narration)
 * Shows with special styling and a message
 * @param {string} command - The command text
 * @param {number|null} confidence - Voice recognition confidence
 */
export async function displayBlockedCommand(command, confidence = null) {
  // In char mode (press any key screens), don't display blocked commands
  // They're distracting and unnecessary since the screen content is static
  const { getInputType } = await import('../game/voxglk.js');
  const inputType = getInputType();

  if (inputType === 'char') {
    return; // Silently skip display in char mode
  }

  const div = document.createElement('div');
  div.className = 'user-command blocked-command';

  const displayText = escapeHtml(command);
  const confidenceLabel = confidence !== null ? ` (${Math.round(confidence * 100)}%)` : '';

  div.innerHTML = `<span class="command-label">&gt;</span><span class="command-text">${displayText}</span>${confidenceLabel} <span class="blocked-message">— game commands blocked during narration. Say "pause" or "skip" to control playback.</span>`;

  // Add to game output
  if (state.currentGameTextElement) {
    state.currentGameTextElement.appendChild(div);
  } else if (dom.lowerWindow) {
    dom.lowerWindow.appendChild(div);
  }

  // Smart scroll - only scroll if user was near bottom
  const gameOutput = document.getElementById('gameOutput');
  if (gameOutput) {
    const threshold = 100;
    const distanceFromBottom = gameOutput.scrollHeight - gameOutput.scrollTop - gameOutput.clientHeight;
    if (distanceFromBottom < threshold) {
      scrollToBottom();
    }
  }
}

/**
 * Clear system messages (dialog prompts) from game output
 * Called when exiting system entry mode to prevent them from being saved in autosave
 */
export function clearSystemMessages() {
  if (dom.lowerWindow) {
    const systemMessages = dom.lowerWindow.querySelectorAll('.system-message');
    systemMessages.forEach(msg => {
      // Remove the parent game-text div if it only contains the system message
      const parent = msg.parentElement;
      if (parent && parent.classList.contains('game-text')) {
        parent.remove();
      } else {
        msg.remove();
      }
    });
  }
}

// Export addGameText to window for use by dialog-stub.js (non-module context)
if (typeof window !== 'undefined') {
  window.addGameTextFromDialog = addGameText;
}
