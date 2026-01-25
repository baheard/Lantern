/**
 * Echo Detection Module
 *
 * Prevents voice recognition from picking up TTS audio playback.
 * Tracks recently spoken text and compares against transcripts.
 */

import { state, constants } from '../core/state.js';
import { textSimilarity } from '../utils/text-processing.js';

/**
 * Record a chunk as spoken for echo detection
 * @param {string} text - Text that was just spoken by TTS
 */
export function recordSpokenChunk(text) {
  if (!text || text.length < 3) return;

  state.recentlySpokenChunks.push({
    text: text,
    timestamp: Date.now()
  });

  // Keep only recent chunks (max 30)
  if (state.recentlySpokenChunks.length > 30) {
    state.recentlySpokenChunks.shift();
  }

}

/**
 * Check if transcript is echo of recently spoken TTS
 * @param {string} transcript - Voice recognition transcript
 * @returns {boolean} True if likely echo
 */
export function isEchoOfSpokenText(transcript) {
  if (!transcript || transcript.length < 3) return false;

  const now = Date.now();
  const normalizedTranscript = transcript.toLowerCase().trim();

  // Clean up old entries
  state.recentlySpokenChunks = state.recentlySpokenChunks.filter(
    chunk => (now - chunk.timestamp) < constants.ECHO_CHUNK_RETENTION_MS
  );

  for (const chunk of state.recentlySpokenChunks) {
    const normalizedChunk = chunk.text.toLowerCase().trim();

    // Check for substring match (even partial)
    if (normalizedChunk.includes(normalizedTranscript) ||
        normalizedTranscript.includes(normalizedChunk)) {
      return true;
    }

    // Check similarity ratio
    const similarity = textSimilarity(normalizedTranscript, normalizedChunk);
    if (similarity >= constants.ECHO_SIMILARITY_THRESHOLD) {
      return true;
    }

    // Check word overlap for phrases (more aggressive matching for Bluetooth)
    const transcriptWords = normalizedTranscript.split(/\s+/).filter(w => w.length > 2);
    const chunkWords = normalizedChunk.split(/\s+/).filter(w => w.length > 2);

    // If transcript has 2+ words and chunk has any words, check overlap
    if (transcriptWords.length >= 2 && chunkWords.length >= 2) {
      const commonWords = transcriptWords.filter(w => chunkWords.includes(w));
      const wordOverlap = commonWords.length / transcriptWords.length;
      // Lower threshold for Bluetooth environments (was 0.4, now 0.35)
      if (wordOverlap >= 0.35) {
        return true;
      }
    }

    // Also check if transcript is a single significant word from the chunk
    // Lower minimum word length for better echo detection (was 4, now 3)
    if (transcriptWords.length === 1 && chunkWords.includes(transcriptWords[0]) && transcriptWords[0].length >= 3) {
      return true;
    }
  }

  return false;
}
