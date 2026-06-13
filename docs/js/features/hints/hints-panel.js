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
import { getRevealedCount, revealNext, resetAll, getSeenSections, markSectionsSeen } from './hints-state.js';
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
let _openQuestionId = null; // only one question's hints shown at a time (accordion)

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

    if (!document.getElementById('hints-css')) {
        const link = document.createElement('link');
        link.id = 'hints-css';
        link.rel = 'stylesheet';
        link.href = '/styles/hints.css';
        document.head.appendChild(link);
    }

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

    // Unblur areas as soon as the player enters them — even with the panel
    // closed — so a section is "available" the moment you've stood there,
    // not only if you happened to have Hints open at the time. Stays
    // spoiler-safe: only sections matching the current room get marked seen.
    window.addEventListener('locationChanged', () => {
        if (_currentHintsData && _currentGameName) {
            const { sectionIds } = findCurrentTopics(_currentHintsData);
            if (sectionIds.size > 0) markSectionsSeen(sectionIds, _currentGameName);
        }
        if (_isVisible) renderHintsContent();
    });
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
        <div class="hints-resize-handle" id="hintsResizeHandle"></div>
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

    setupResizeHandle();
}

// ============================================================================
// RESIZE HANDLE — drag left edge to adjust panel width
// ============================================================================

const HINTS_RESIZE = {
    DEFAULT_WIDTH_VW: 75,
    MIN_WIDTH_VW: 35,
    MAX_WIDTH_VW: 92,
    STORAGE_KEY: 'iftalk_hints_width_vw',
};

function setupResizeHandle() {
    const handle = document.getElementById('hintsResizeHandle');
    const panel = document.querySelector('.hints-panel');
    if (!handle || !panel) return;

    // Restore saved width
    try {
        const saved = parseFloat(localStorage.getItem(HINTS_RESIZE.STORAGE_KEY));
        if (saved >= HINTS_RESIZE.MIN_WIDTH_VW && saved <= HINTS_RESIZE.MAX_WIDTH_VW) {
            panel.style.width = `${saved}vw`;
        }
    } catch (_) {}

    let isResizing = false;
    let startX = 0;
    let startWidthPx = 0;

    function getClientX(e) { return e.clientX ?? e.touches?.[0]?.clientX; }

    function startResize(e) {
        isResizing = true;
        startX = getClientX(e);
        startWidthPx = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');
        panel.classList.add('resizing');
        document.body.classList.add('hints-resizing');
        e.preventDefault();
        e.stopPropagation();
    }

    function doResize(e) {
        if (!isResizing) return;
        const dx = startX - getClientX(e); // dragging left = wider
        const newWidthVw = Math.min(
            HINTS_RESIZE.MAX_WIDTH_VW,
            Math.max(HINTS_RESIZE.MIN_WIDTH_VW, ((startWidthPx + dx) / window.innerWidth) * 100)
        );
        panel.style.width = `${newWidthVw}vw`;
        e.preventDefault();
    }

    function stopResize() {
        if (!isResizing) return;
        isResizing = false;
        handle.classList.remove('dragging');
        panel.classList.remove('resizing');
        document.body.classList.remove('hints-resizing');
        try {
            const widthVw = (panel.getBoundingClientRect().width / window.innerWidth) * 100;
            localStorage.setItem(HINTS_RESIZE.STORAGE_KEY, widthVw.toString());
        } catch (_) {}
    }

    handle.addEventListener('mousedown', startResize);
    handle.addEventListener('touchstart', startResize, { passive: false });
    document.addEventListener('mousemove', doResize);
    document.addEventListener('touchmove', doResize, { passive: false });
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);
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
    _isVisible = true;

    // Render content while the panel is still off-screen (transform: 100%),
    // THEN force a reflow and slide in — avoids the content reflowing
    // mid-transition (the "slides and slides back" glitch).
    renderHintsContent();
    _overlay.offsetHeight; // eslint-disable-line no-unused-expressions
    _overlay.classList.add('visible');

    // Focus the close button after the panel slides in (no scroll jump)
    setTimeout(() => {
        document.getElementById('hintsCloseBtn')?.focus({ preventScroll: true });
    }, 50);
}

export function hideHints() {
    if (!_overlay) return;

    _overlay.classList.remove('visible');
    _overlay.setAttribute('inert', '');
    _overlay.setAttribute('aria-hidden', 'true');
    _isVisible = false;
    _openQuestionId = null;

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

    // Mark matched sections as seen (persists across sessions)
    if (sectionIds.size > 0) {
        markSectionsSeen(sectionIds, _currentGameName);
    }
    const seenSections = getSeenSections(_currentGameName);

    let html = '';
    for (const section of sections) {
        html += renderSection(section, sectionIds.has(section.id), questionIds, seenSections);
    }

    contentEl.innerHTML = html;
}

/**
 * Render a single section block.
 *
 * @param {Object} section
 * @param {boolean} isMatched - Whether this section matches current location
 * @param {Set<string>} matchedQuestionIds
 * @param {Set<string>} seenSections - Section IDs ever pinned for this game
 * @returns {string} HTML string
 */
function renderSection(section, isMatched, matchedQuestionIds, seenSections) {
    const isSeen = isMatched || seenSections.has(section.id);
    const lockedClass = isSeen ? '' : ' hints-section-locked';
    const inertAttr = isSeen ? '' : ' inert';
    const badgeHtml = isMatched
        ? '<button class="material-icons hints-location-badge" data-action="open-map" title="Current location — open map">add_location</button>'
        : '';

    let questionsHtml = '';
    const questions = Array.isArray(section.questions) ? section.questions : [];
    for (const question of questions) {
        questionsHtml += renderQuestion(question, matchedQuestionIds.has(question.id));
    }

    return `
      <div class="hints-section${lockedClass}" data-section-id="${escHtml(section.id)}"${inertAttr}>
        <div class="hints-section-row">
          <button class="hints-section-header" aria-expanded="false" data-action="toggle-section" data-section-id="${escHtml(section.id)}">
            <span class="material-icons hints-section-chevron">chevron_right</span>
            <span class="hints-section-title">${escHtml(section.title)}</span>
          </button>
          ${badgeHtml}
        </div>
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
    const allRevealed = total > 0 && revealed >= total;

    // Revealed hints — plain text; final hint (answer) tinted amber
    let hintsHtml = '';
    for (let i = 0; i < revealed; i++) {
        const isAnswer = i === total - 1;
        hintsHtml += `
          <div class="hints-hint-item ${isAnswer ? 'hints-hint-answer' : ''}">
            <span class="hints-hint-text">${escHtml(hints[i])}</span>
          </div>`;
    }

    // Slim reveal button below the revealed hints, until everything is shown.
    // "Show answer" when the next reveal is the final hint, else "Show next hint".
    let revealBtnHtml = '';
    if (revealed > 0 && !allRevealed) {
        const nextIsAnswer = revealed + 1 === total;
        revealBtnHtml = `
          <button class="hints-reveal-btn ${nextIsAnswer ? 'hints-reveal-answer' : ''}" data-action="reveal-hint" data-question-id="${escHtml(question.id)}" data-total="${total}">
            ${nextIsAnswer ? 'Show answer' : 'Show next hint'}
          </button>`;
    }

    // Count badge: bare total before any reveal (e.g. "3"), else "revealed/total"
    const countText = revealed === 0 ? `${total}` : `${revealed}/${total}`;
    const countTitle = revealed === 0
        ? `${total} hint${total !== 1 ? 's' : ''}`
        : `${revealed} of ${total} hints shown`;
    const countHtml = `<span class="hints-count" title="${countTitle}">${countText}</span>`;

    // Question text: reveals hint 1 (if none revealed yet) or toggles expand/collapse
    const triggerAction = revealed === 0 ? 'reveal-hint' : 'toggle-question';
    const triggerDisabled = total === 0 ? ' disabled' : '';

    const matchedClass = isMatched ? ' hints-question-matched' : '';
    // Accordion: only the single open question shows its hints
    const expandedClass = question.id === _openQuestionId ? ' expanded' : '';

    return `
      <div class="hints-question${matchedClass}${expandedClass}" data-question-id="${escHtml(question.id)}">
        <div class="hints-question-header">
          <button class="hints-question-trigger" data-action="${triggerAction}" data-question-id="${escHtml(question.id)}" data-total="${total}"${triggerDisabled}>
            ${escHtml(question.q)}
          </button>
          ${countHtml}
          <button class="hints-question-close" data-action="close-question" data-question-id="${escHtml(question.id)}" aria-label="Collapse">
            <span class="material-icons">expand_less</span>
          </button>
        </div>
        <div class="hints-hints-list">
          ${hintsHtml}
          ${revealBtnHtml}
        </div>
      </div>`;
}

// ============================================================================
// EVENT DELEGATION
// ============================================================================

function handleContentClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'open-map') {
        openMap();
        return;
    }

    if (action === 'toggle-section') {
        const sectionId = target.dataset.sectionId;
        const sectionEl = _overlay.querySelector(`.hints-section[data-section-id="${sectionId}"]`);
        if (!sectionEl) return;
        const willExpand = !sectionEl.classList.contains('expanded');
        // Accordion: close all other open sections
        if (willExpand) {
            _overlay.querySelectorAll('.hints-section.expanded').forEach(el => {
                el.classList.remove('expanded');
                const h = el.querySelector('.hints-section-header');
                if (h) h.setAttribute('aria-expanded', 'false');
            });
        }
        sectionEl.classList.toggle('expanded', willExpand);
        target.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
        return;
    }

    if (action === 'reveal-hint') {
        const questionId = target.dataset.questionId;
        const total = parseInt(target.dataset.total, 10);
        if (!questionId || isNaN(total)) return;
        revealNext(questionId, total, _currentGameName);

        // Accordion: this question becomes the single open one
        _openQuestionId = questionId;
        collapseOtherQuestions(questionId);
        rerenderQuestion(questionId);
    }

    if (action === 'toggle-question') {
        const questionId = target.dataset.questionId;
        if (_openQuestionId === questionId) {
            _openQuestionId = null;
            const questionEl = _overlay.querySelector(`.hints-question[data-question-id="${questionId}"]`);
            if (questionEl) questionEl.classList.remove('expanded');
        } else {
            _openQuestionId = questionId;
            collapseOtherQuestions(questionId);
            const questionEl = _overlay.querySelector(`.hints-question[data-question-id="${questionId}"]`);
            if (questionEl) questionEl.classList.add('expanded');
        }
    }

    if (action === 'close-question') {
        const questionId = target.dataset.questionId;
        if (_openQuestionId === questionId) _openQuestionId = null;
        const questionEl = _overlay.querySelector(`.hints-question[data-question-id="${questionId}"]`);
        if (questionEl) questionEl.classList.remove('expanded');
    }
}

/**
 * Open the map canvas. Lazy-loads the module and inits it; initMapCanvas() is
 * idempotent (module-level _initialized guard) and ES imports are cached, so
 * this is safe alongside app.js's own map-button init path.
 */
async function openMap() {
    const mapModule = await import('../map-canvas.js');
    mapModule.initMapCanvas();
    mapModule.showMap();
}

/** Collapse every open question except the given one (accordion behavior). */
function collapseOtherQuestions(exceptId) {
    _overlay.querySelectorAll('.hints-question.expanded').forEach(el => {
        if (el.dataset.questionId !== exceptId) el.classList.remove('expanded');
    });
}

/** Re-render a single question's DOM in place from current state. */
function rerenderQuestion(questionId) {
    const questionEl = _overlay.querySelector(`.hints-question[data-question-id="${questionId}"]`);
    if (!questionEl) return;
    const section = findQuestionSection(questionId);
    if (!section) return;
    const question = section.questions.find(q => q.id === questionId);
    if (!question) return;
    const isMatched = questionEl.classList.contains('hints-question-matched');
    questionEl.outerHTML = renderQuestion(question, isMatched);
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
