/**
 * Hints Panel - UHS-style progressive hint browser
 *
 * Full-screen overlay presenting a collapsible section → question → hint tree.
 * Reveal state persists across sessions via hints-state.js.
 * Location assist: auto-expands and scrolls to the section matching the
 * player's current room (badge only — never auto-reveals hint text).
 *
 * UI pattern mirrors map-canvas.js: overlay div appended to .container,
 * .hidden / .visible toggle with transitionend fallback for slide-out.
 * Focus management mirrors settings-panel.js (lastFocusedBeforeOpen).
 *
 * Z-index: --z-hints-overlay: 950 (same layer as map, below settings 1000).
 * TTS: panel DOM lives outside #gameport so it never enters the narration buffer.
 */

import { loadHints, findCurrentTopics } from './hints-data.js';
import { getRevealedCount, revealNext, resetAll } from './hints-state.js';
import { confirmDialog } from '../../ui/confirm-dialog.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let _initialized = false;
let _overlay = null;
let _isVisible = false;
let _currentHintsData = null;
let _lastFocusedBeforeOpen = null;
let _currentGameName = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the hints panel.
 * Idempotence guard: both #hintsBtn and future shortcut paths may call this;
 * duplicate inits would stack event listeners.
 */
export function initHintsPanel() {
    if (_initialized) return;
    _initialized = true;

    createHintsUI();

    // Load hints data for the current game if one is loaded
    if (window._inGame) {
        const gameName = localStorage.getItem('iftalk_last_game')
            ?.split('/')
            .pop()
            .replace(/\.[^.]+$/, '')
            .toLowerCase();
        if (gameName) {
            _currentGameName = gameName;
            loadHints(gameName).then(data => {
                _currentHintsData = data;
                if (_isVisible) renderHintsContent();
            });
        }
    }

    // Re-load hints when a new game is loaded
    window.addEventListener('gameLoaded', handleGameLoaded);
}

/** @param {CustomEvent} e */
function handleGameLoaded(e) {
    const gameName = e.detail?.gameName
        || localStorage.getItem('iftalk_last_game')
            ?.split('/')
            .pop()
            .replace(/\.[^.]+$/, '')
            .toLowerCase();
    if (!gameName) return;
    _currentGameName = gameName;
    _currentHintsData = null; // clear stale data
    loadHints(gameName).then(data => {
        _currentHintsData = data;
        if (_isVisible) {
            renderHintsContent();
        }
    });
}

// ============================================================================
// UI CREATION
// ============================================================================

function createHintsUI() {
    const cont = document.createElement('div');
    cont.id = 'hintsOverlay';
    cont.className = 'hints-overlay hidden';
    cont.setAttribute('inert', '');
    cont.setAttribute('aria-hidden', 'true');
    cont.setAttribute('role', 'dialog');
    cont.setAttribute('aria-label', 'Game Hints');
    cont.innerHTML = `
      <div class="hints-panel">
        <div class="hints-toolbar">
          <div class="hints-title">
            <span class="material-icons hints-title-icon">lightbulb</span>
            <span class="hints-title-text">Hints</span>
          </div>
          <button class="hints-close-btn" id="hintsCloseBtn" aria-label="Close hints">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="hints-content" id="hintsContent">
          <div class="hints-loading" id="hintsLoading">Loading hints…</div>
        </div>
        <div class="hints-footer" id="hintsFooter">
          <span class="hints-spoiler-warning">
            <span class="material-icons">warning</span>
            Hints may contain spoilers
          </span>
          <button class="hints-reset-btn" id="hintsResetBtn">Reset revealed hints</button>
        </div>
      </div>
    `;

    // Append to .container so hints panel stays behind the control bar (same as map)
    const gameContainer = document.querySelector('.container');
    gameContainer.appendChild(cont);
    _overlay = cont;

    // Wire static controls
    document.getElementById('hintsCloseBtn').addEventListener('click', hideHints);
    document.getElementById('hintsResetBtn').addEventListener('click', handleReset);

    // Close on backdrop click (clicking outside the panel)
    cont.addEventListener('click', e => {
        if (e.target === cont) hideHints();
    });

    // Esc to close (when panel is visible)
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _isVisible) {
            e.preventDefault();
            hideHints();
        }
    });

    // Event delegation for expand/reveal interactions inside hints-content
    document.getElementById('hintsContent').addEventListener('click', handleContentClick);
}

// ============================================================================
// SHOW / HIDE / TOGGLE
// ============================================================================

export function showHints() {
    if (!_overlay) return;

    _lastFocusedBeforeOpen = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    _overlay.removeAttribute('inert');
    _overlay.removeAttribute('aria-hidden');
    _overlay.classList.remove('hidden');
    // Trigger reflow so CSS transition fires
    _overlay.offsetHeight; // eslint-disable-line no-unused-expressions
    _overlay.classList.add('visible');
    _isVisible = true;

    renderHintsContent();

    // Focus the close button after the panel slides in
    setTimeout(() => {
        document.getElementById('hintsCloseBtn')?.focus();
    }, 50);
}

export function hideHints() {
    if (!_overlay) return;

    _overlay.classList.remove('visible');
    _overlay.setAttribute('inert', '');
    _overlay.setAttribute('aria-hidden', 'true');
    _isVisible = false;

    // Restore focus to trigger element
    if (_lastFocusedBeforeOpen && document.contains(_lastFocusedBeforeOpen)) {
        _lastFocusedBeforeOpen.focus();
    }
    _lastFocusedBeforeOpen = null;

    // Wait for slide-out animation using transitionend, with fallback
    const panel = _overlay.querySelector('.hints-panel');
    if (panel) {
        const handleTransitionEnd = e => {
            if (e.target === panel && e.propertyName === 'transform' && !_isVisible) {
                _overlay.classList.add('hidden');
                panel.removeEventListener('transitionend', handleTransitionEnd);
            }
        };
        panel.addEventListener('transitionend', handleTransitionEnd);
        setTimeout(() => {
            if (!_isVisible) {
                _overlay.classList.add('hidden');
                panel.removeEventListener('transitionend', handleTransitionEnd);
            }
        }, 500);
    }
}

export function toggleHints() {
    _isVisible ? hideHints() : showHints();
}

// ============================================================================
// CONTENT RENDERING
// ============================================================================

function renderHintsContent() {
    const contentEl = document.getElementById('hintsContent');
    if (!contentEl) return;

    if (!_currentHintsData) {
        contentEl.innerHTML = `
          <div class="hints-empty">
            <span class="material-icons hints-empty-icon">lightbulb_outline</span>
            <p>No hints available for this game.</p>
            <p class="hints-empty-sub">Hints can be added by running the <code>generate-hints</code> skill.</p>
          </div>`;
        document.getElementById('hintsFooter')?.classList.add('hidden');
        return;
    }

    document.getElementById('hintsFooter')?.classList.remove('hidden');

    // Determine matched sections/questions for the 📍 badge
    const { sectionIds, questionIds } = findCurrentTopics(_currentHintsData);

    const sections = _currentHintsData.sections || [];
    if (sections.length === 0) {
        contentEl.innerHTML = '<div class="hints-empty"><p>No hint sections defined.</p></div>';
        return;
    }

    let html = '';
    let firstMatchedSectionId = null;

    for (const section of sections) {
        const isMatched = sectionIds.has(section.id);
        if (isMatched && !firstMatchedSectionId) {
            firstMatchedSectionId = section.id;
        }
        html += renderSection(section, isMatched, questionIds);
    }

    contentEl.innerHTML = html;

    // Auto-scroll the first matched section into view
    if (firstMatchedSectionId) {
        const sectionEl = contentEl.querySelector(`[data-section-id="${firstMatchedSectionId}"]`);
        if (sectionEl) {
            // Expand it
            sectionEl.classList.add('expanded');
            const header = sectionEl.querySelector('.hints-section-header');
            if (header) header.setAttribute('aria-expanded', 'true');

            setTimeout(() => {
                sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        }
    }
}

/**
 * Render a single section block.
 *
 * @param {Object} section
 * @param {boolean} isMatched - Whether this section matches current location
 * @param {Set<string>} matchedQuestionIds
 * @returns {string} HTML string
 */
function renderSection(section, isMatched, matchedQuestionIds) {
    const badgeHtml = isMatched
        ? '<span class="hints-location-badge" title="You may be here">📍</span>'
        : '';
    const unverifiedHtml = !section.verified
        ? '<span class="hints-unverified-tag" title="Room names in this section were not verified by live playthrough">unverified</span>'
        : '';
    const expandedClass = isMatched ? ' expanded' : '';
    const ariaExpanded = isMatched ? 'true' : 'false';

    let questionsHtml = '';
    const questions = Array.isArray(section.questions) ? section.questions : [];
    for (const question of questions) {
        questionsHtml += renderQuestion(question, matchedQuestionIds.has(question.id));
    }

    return `
      <div class="hints-section${expandedClass}" data-section-id="${escHtml(section.id)}">
        <button class="hints-section-header" aria-expanded="${ariaExpanded}" data-action="toggle-section" data-section-id="${escHtml(section.id)}">
          <span class="material-icons hints-section-chevron">chevron_right</span>
          <span class="hints-section-title">${escHtml(section.title)}</span>
          ${badgeHtml}
          ${unverifiedHtml}
        </button>
        <div class="hints-section-body">
          ${questionsHtml || '<div class="hints-no-questions">No questions defined for this section.</div>'}
        </div>
      </div>`;
}

/**
 * Render a single question with its revealed hints.
 *
 * @param {Object} question
 * @param {boolean} isMatched - Whether this question matches current location
 * @returns {string} HTML string
 */
function renderQuestion(question, isMatched) {
    const hints = Array.isArray(question.hints) ? question.hints : [];
    const total = hints.length;
    const revealed = getRevealedCount(question.id, _currentGameName);

    let hintsHtml = '';
    for (let i = 0; i < revealed; i++) {
        const isAnswer = i === total - 1;
        hintsHtml += `
          <div class="hints-hint-item ${isAnswer ? 'hints-hint-answer' : ''}">
            <span class="hints-hint-number">${isAnswer ? 'Answer' : `Hint ${i + 1}`}</span>
            <span class="hints-hint-text">${escHtml(hints[i])}</span>
          </div>`;
    }

    let revealButtonHtml = '';
    if (revealed < total) {
        const nextNum = revealed + 1;
        const isNextAnswer = nextNum === total;
        const btnClass = isNextAnswer ? 'hints-reveal-btn hints-reveal-answer-btn' : 'hints-reveal-btn';
        const btnLabel = isNextAnswer
            ? 'Tap to reveal the answer'
            : `Tap to reveal hint ${nextNum} of ${total}`;
        revealButtonHtml = `
          <button class="${btnClass}" data-action="reveal-hint" data-question-id="${escHtml(question.id)}" data-total="${total}">
            ${escHtml(btnLabel)}
          </button>
          <div class="hints-remaining">${total - revealed} hint${total - revealed !== 1 ? 's' : ''} remaining</div>`;
    } else if (total > 0) {
        revealButtonHtml = '<div class="hints-all-revealed">All hints revealed</div>';
    }

    const matchedClass = isMatched ? ' hints-question-matched' : '';

    return `
      <div class="hints-question${matchedClass}" data-question-id="${escHtml(question.id)}">
        <div class="hints-question-text">${escHtml(question.q)}</div>
        <div class="hints-hints-list" id="hints-list-${escHtml(question.id)}">
          ${hintsHtml}
        </div>
        ${revealButtonHtml}
      </div>`;
}

// ============================================================================
// EVENT DELEGATION
// ============================================================================

function handleContentClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'toggle-section') {
        const sectionId = target.dataset.sectionId;
        const sectionEl = _overlay.querySelector(`.hints-section[data-section-id="${sectionId}"]`);
        if (!sectionEl) return;
        const expanded = sectionEl.classList.toggle('expanded');
        target.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    if (action === 'reveal-hint') {
        const questionId = target.dataset.questionId;
        const total = parseInt(target.dataset.total, 10);
        if (!questionId || isNaN(total)) return;
        const newCount = revealNext(questionId, total, _currentGameName);

        // Re-render just this question in place
        const questionEl = _overlay.querySelector(`.hints-question[data-question-id="${questionId}"]`);
        if (questionEl) {
            const section = findQuestionSection(questionId);
            if (section) {
                const question = section.questions.find(q => q.id === questionId);
                if (question) {
                    const isMatched = questionEl.classList.contains('hints-question-matched');
                    questionEl.outerHTML = renderQuestion(question, isMatched);
                }
            }
        }
    }
}

/** Find the section containing a given questionId */
function findQuestionSection(questionId) {
    if (!_currentHintsData) return null;
    for (const section of _currentHintsData.sections) {
        if (Array.isArray(section.questions)) {
            if (section.questions.some(q => q.id === questionId)) {
                return section;
            }
        }
    }
    return null;
}

// ============================================================================
// RESET
// ============================================================================

async function handleReset() {
    const confirmed = await confirmDialog(
        'Reset all revealed hints for this game? This cannot be undone.',
        {
            title: 'Reset Hints',
            okText: 'Reset',
            cancelText: 'Cancel'
        }
    );

    if (confirmed) {
        resetAll(_currentGameName);
        renderHintsContent();
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
