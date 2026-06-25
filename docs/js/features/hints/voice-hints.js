/**
 * Voice Hint Navigation — eyes-free hint steering
 *
 * Intercepts hint verbs in the voice pipeline BEFORE the Z-machine parser.
 * All revealed state lives in hints-state.js; this module only reads/drives it.
 *
 * Two levels:
 *   list level  — hearing the headers of the room's hints (no activeQuestionId)
 *   puzzle level — drilled into one hint, climbing its ladder (activeQuestionId set)
 *
 * Listening context is TRANSIENT: non-hint utterances fall through to the game
 * and exit hint context automatically (voice-commands.js handles the exit).
 *
 * See .tome/voice-hint-navigation.md for the full design rationale.
 */

import { loadHints, findCurrentTopics } from './hints-data.js';
import { getRevealedCount, revealNext, getSeenSections, getSeenQuestions } from './hints-state.js';
import { speakAppMessage } from '../../narration/tts-player.js';

// ============================================================================
// MODULE STATE
// ============================================================================

const _ctx = {
    active: false,
    gameName: null,
    hintsData: null,
    /** null = list level; set = drilled into this question */
    activeQuestionId: null,
    /**
     * Flat ordered list of question objects surfaced at the current list level.
     * Indices are 1-based in user speech ("hint for two" → index 1 here).
     */
    listQuestions: [],
    /** Last spoken text, for "repeat" */
    lastSpoken: '',
};

// ============================================================================
// DATA BRIDGE  (called by hints-panel.js when it loads hint data)
// ============================================================================

/**
 * Update the shared hints data pointer. Called by hints-panel after each load
 * so the voice layer doesn't need its own redundant fetch.
 */
export function setHintsData(gameName, hintsData) {
    _ctx.gameName = gameName;
    _ctx.hintsData = hintsData;
    _hintsLoadAttempted = true;  // already loaded (or confirmed absent) — skip lazy fetch
    exitHintContext();
}

// ============================================================================
// CONTEXT HELPERS
// ============================================================================

export function isHintContextActive() { return _ctx.active; }

export function exitHintContext() {
    _ctx.active = false;
    _ctx.activeQuestionId = null;
    _ctx.listQuestions = [];
}

function speak(text) {
    _ctx.lastSpoken = text;
    speakAppMessage(text);
    import('../../ui/game-output.js').then(({ addGameText }) => {
        addGameText(`<div class="system-message">${text}</div>`, false);
    });
}

// ============================================================================
// VERB RECOGNITION
// ============================================================================

const FRONT_DOOR_RE = /^(?:give|get)(?:\s+me)?(?:\s+a)?\s+hint$/i;
const HINT_FOR_N_RE = /^hint\s+for\s+(\d+|one|two|three|four|five)$/i;
const BARE_NUMBER_RE = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i;

const WORD_TO_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5,
                     six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function parseNum(s) {
    const n = parseInt(s, 10);
    if (!isNaN(n)) return n;
    return WORD_TO_NUM[s.toLowerCase()] || null;
}

/**
 * True if this utterance is a hint verb that should be intercepted.
 * Bare numbers are only hint verbs while hint context is live.
 */
export function isHintVerb(lower) {
    if (FRONT_DOOR_RE.test(lower)) return true;
    if (lower === 'next hint') return true;
    if (lower === 'more hints' || lower === 'what else') return true;
    if (HINT_FOR_N_RE.test(lower)) return true;
    if (_ctx.active && BARE_NUMBER_RE.test(lower)) return true;
    if (_ctx.active && lower === 'repeat') return true;
    if (_ctx.active && (lower === 'cancel' || lower === 'stop hint' || lower === 'stop hints')) return true;
    return false;
}

// ============================================================================
// HINT DATA HELPERS
// ============================================================================

/**
 * Ensure hint data is loaded, loading lazily if needed.
 * Returns null when no hints file exists for this game.
 */
let _hintsLoadAttempted = false;

async function ensureHintsData() {
    if (_ctx.hintsData !== null || _hintsLoadAttempted) return _ctx.hintsData;
    if (!_ctx.gameName) {
        // Try to derive game name from localStorage
        const stored = localStorage.getItem('lantern_last_game');
        if (!stored) return null;
        _ctx.gameName = stored.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
    }
    _hintsLoadAttempted = true;
    const data = await loadHints(_ctx.gameName);
    _ctx.hintsData = data;
    return data;
}

/**
 * Return an ordered array of unlocked question objects for the current room.
 * "Unlocked" = location-matched (questionIds) OR cross-cutting (no locations) in a matched section.
 */
function getCurrentRoomQuestions(hintsData) {
    const { sectionIds, questionIds } = findCurrentTopics(hintsData, _ctx.gameName);
    const seenQ = getSeenQuestions(_ctx.gameName);
    const questions = [];
    for (const section of (hintsData.sections || [])) {
        if (!sectionIds.has(section.id)) continue;
        for (const q of (section.questions || [])) {
            const locs = Array.isArray(q.locations) ? q.locations : [];
            const unlocked = locs.length === 0
                || questionIds.has(q.id)
                || seenQ.has(q.id);
            if (unlocked) questions.push(q);
        }
    }
    return questions;
}

/**
 * Return an ordered array of ALL unlocked questions across every seen section
 * (for "what else" / wide-scope mode).
 */
function getAllUnlockedQuestions(hintsData) {
    const seenSec = getSeenSections(_ctx.gameName);
    const seenQ = getSeenQuestions(_ctx.gameName);
    const { sectionIds, questionIds } = findCurrentTopics(hintsData, _ctx.gameName);
    const questions = [];
    for (const section of (hintsData.sections || [])) {
        const visible = sectionIds.has(section.id) || seenSec.has(section.id);
        if (!visible) continue;
        for (const q of (section.questions || [])) {
            const locs = Array.isArray(q.locations) ? q.locations : [];
            const unlocked = locs.length === 0
                || questionIds.has(q.id)
                || seenQ.has(q.id);
            if (unlocked) questions.push(q);
        }
    }
    return questions;
}

/**
 * Read the latest revealed rung, or reveal rung 1 if none revealed yet.
 * Returns the combined speech string.
 */
function _buildRungText(question) {
    const hints = Array.isArray(question.hints) ? question.hints : [];
    const total = hints.length;
    if (total === 0) return 'No hint text available for this question.';

    let revealed = getRevealedCount(question.id, _ctx.gameName);
    if (revealed === 0) {
        revealed = revealNext(question.id, total, _ctx.gameName);
    }

    const rung = hints[revealed - 1];
    return rung;
}

function readOrRevealQuestion(question) {
    speak(_buildRungText(question));
}

/** Speak the question header + its current rung in one utterance. */
function _readOrRevealQuestionWithHeader(question) {
    speak(`${question.q}. ${_buildRungText(question)}`);
}

// ============================================================================
// LIST ANNOUNCEMENT HELPERS  (cap at 3, overflow announcement)
// ============================================================================

/** Announce a numbered list of questions (max 3 + overflow). */
function announceList(questions) {
    const MAX = 3;
    const shown = questions.slice(0, MAX);
    const overflow = questions.length - shown.length;

    let text;
    if (questions.length === 0) {
        text = "No hints available here.";
    } else if (questions.length === 1) {
        text = `One hint here: ${shown[0].q}`;
    } else {
        const items = shown.map((q, i) => `${i + 1}: ${q.q}`).join('. ');
        text = `${questions.length} hint${questions.length !== 1 ? 's' : ''} here. ${items}.`;
        if (overflow > 0) {
            text += ` And ${overflow} more. Say "what else" for all.`;
        } else {
            text += ' Say a number to choose.';
        }
    }
    speak(text);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Attempt to handle a voice utterance as a hint command.
 *
 * @param {string} lower - Normalized (lowercase, trimmed) utterance
 * @returns {Promise<boolean>} true = handled (don't send to game), false = not a hint verb
 */
export async function tryHandleHintCommand(lower) {
    if (!isHintVerb(lower)) return false;

    // "repeat" — re-narrate last rung without advancing
    if (lower === 'repeat' && _ctx.active) {
        if (_ctx.lastSpoken) speak(_ctx.lastSpoken);
        return true;
    }

    // "cancel" / "stop hint[s]" — explicit exit
    if (_ctx.active && (lower === 'cancel' || lower === 'stop hint' || lower === 'stop hints')) {
        exitHintContext();
        speak('Hints closed.');
        return true;
    }

    // Load hint data
    const hintsData = await ensureHintsData();

    // "more hints" / "what else" — wide scope across all seen sections
    if (lower === 'more hints' || lower === 'what else') {
        _ctx.active = true;
        _ctx.activeQuestionId = null;
        if (!hintsData) {
            speak('No hints available for this game.');
            return true;
        }
        const all = getAllUnlockedQuestions(hintsData);
        _ctx.listQuestions = all;
        if (all.length === 0) {
            speak("No hints unlocked yet. Explore more of the game first.");
        } else {
            announceList(all);
        }
        return true;
    }

    // "give hint" / "get hint" — front door (current room)
    if (FRONT_DOOR_RE.test(lower)) {
        _ctx.active = true;
        _ctx.activeQuestionId = null;
        if (!hintsData) {
            speak('No hints available for this game.');
            return true;
        }
        const roomQ = getCurrentRoomQuestions(hintsData);
        _ctx.listQuestions = roomQ;
        if (roomQ.length === 0) {
            speak("No hints unlocked here.");
            return true;
        }
        if (roomQ.length === 1) {
            // Auto-select single hint — combine question + rung into one utterance
            _ctx.activeQuestionId = roomQ[0].id;
            _readOrRevealQuestionWithHeader(roomQ[0]);
        } else {
            announceList(roomQ);
        }
        return true;
    }

    // "hint for N" — explicit number selection from list
    const hintForMatch = lower.match(HINT_FOR_N_RE);
    if (hintForMatch) {
        _ctx.active = true;
        const n = parseNum(hintForMatch[1]);
        return await _selectFromList(n, hintsData);
    }

    // Bare number — select from current list (only valid while context is live)
    if (_ctx.active && BARE_NUMBER_RE.test(lower)) {
        const n = parseNum(lower);
        return await _selectFromList(n, hintsData);
    }

    // "next hint" — go deeper on active question
    if (lower === 'next hint') {
        _ctx.active = true;
        if (!hintsData) {
            speak('No hints available for this game.');
            return true;
        }
        if (!_ctx.activeQuestionId) {
            speak('No active hint. Say "give hint" first.');
            return true;
        }
        const question = (hintsData.sections || []).flatMap(s => s.questions || [])
            .find(q => q.id === _ctx.activeQuestionId);
        if (!question) {
            speak('Hint not found.');
            return true;
        }
        const hints = Array.isArray(question.hints) ? question.hints : [];
        const total = hints.length;
        const revealed = getRevealedCount(_ctx.activeQuestionId, _ctx.gameName);
        if (revealed >= total) {
            speak(hints[total - 1]);
            return true;
        }
        const newCount = revealNext(_ctx.activeQuestionId, total, _ctx.gameName);
        const rung = hints[newCount - 1];
        speak(rung);
        return true;
    }

    return false;
}

/**
 * Select hint N from the current list context.
 */
async function _selectFromList(n, hintsData) {
    if (!hintsData) {
        speak('No hints available for this game.');
        return true;
    }

    // Build list if it's empty (e.g. user said "hint for 2" without a prior "give hint")
    if (_ctx.listQuestions.length === 0) {
        _ctx.listQuestions = getCurrentRoomQuestions(hintsData);
    }

    const list = _ctx.listQuestions;
    if (!n || n < 1 || n > list.length) {
        if (list.length === 0) {
            speak('No hints available here.');
        } else {
            speak(`Say a number from 1 to ${list.length}.`);
        }
        return true;
    }

    const question = list[n - 1];
    _ctx.activeQuestionId = question.id;
    _readOrRevealQuestionWithHeader(question);
    return true;
}
