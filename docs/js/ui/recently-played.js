/**
 * Recently Played UI
 *
 * Manages the "Recently Played" section on the welcome screen: tracking custom
 * games, resume/restart dialog, and the loading overlay.
 */

import { resetAllHintState } from '../features/hints/hints-state.js';

// Predefined game slugs — excluded from the recently-played list
const PREDEFINED_GAMES = [
  'lostpig', 'dreamhold', 'photopia', '905',
  'spiderweb', 'anchorhead', 'trinity', 'curses',
  'planetfall', 'violet', 'wizardsniffer', 'bronze'
];

/**
 * Track a custom game (played via URL input)
 * @param {string} url - Full URL to the game
 * @param {string} gameName - Normalized game name
 */
export function trackCustomGame(url, gameName) {
  if (PREDEFINED_GAMES.includes(gameName.toLowerCase())) return;

  const customGames = JSON.parse(localStorage.getItem('lantern_custom_games') || '{}');
  customGames[gameName] = {
    url: url,
    name: gameName,
    displayName: gameName.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase()),
    lastPlayed: Date.now()
  };
  localStorage.setItem('lantern_custom_games', JSON.stringify(customGames));
}

/**
 * Remove a custom game from tracking
 * @param {string} gameName - Normalized game name
 */
export function removeCustomGame(gameName) {
  const customGames = JSON.parse(localStorage.getItem('lantern_custom_games') || '{}');
  delete customGames[gameName];
  localStorage.setItem('lantern_custom_games', JSON.stringify(customGames));
}

/**
 * Get custom games that have autosaves
 * @returns {Array} Array of custom game objects with autosaves
 */
export function getCustomGamesWithAutosaves() {
  const customGames = JSON.parse(localStorage.getItem('lantern_custom_games') || '{}');
  const gamesWithSaves = [];

  for (const [gameName, gameData] of Object.entries(customGames)) {
    const autosaveKey = `lantern_autosave_${gameName}`;
    if (localStorage.getItem(autosaveKey) !== null) {
      gamesWithSaves.push(gameData);
    }
  }

  // Sort by last played (most recent first)
  gamesWithSaves.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

  return gamesWithSaves;
}

/**
 * Show loading overlay for transition effect
 */
export function showLoadingOverlay() {
  const existing = document.getElementById('loadingOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loadingOverlay';
  document.body.appendChild(overlay);

  // Force reflow to ensure the overlay is visible before any transition
  overlay.offsetHeight;
}

/**
 * Show resume/restart dialog for games with autosave
 * @param {string} gamePath - Path to game file
 * @param {string} gameName - Normalized game name
 * @returns {Promise<string|null>} 'resume', 'restart', or null if cancelled
 */
export function showResumeDialog(gamePath, gameName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'resume-dialog-overlay';

    const displayName = gamePath.split('/').pop().replace(/\.[^.]+$/, '')
      .replace(/([A-Z])/g, ' $1').trim()
      .replace(/^\w/, c => c.toUpperCase());

    overlay.innerHTML = `
      <div class="resume-dialog">
        <h3>Resume ${displayName}?</h3>
        <p>You have a saved game in progress.</p>
        <div class="resume-dialog-buttons">
          <button class="btn btn-primary resume-btn btn-compact-dialog" data-action="resume">
            <span class="material-icons">play_arrow</span>
            Resume Game
          </button>
          <button class="btn btn-secondary restart-btn btn-compact-dialog" data-action="restart">
            <span class="material-icons">replay</span>
            Start Over
          </button>
        </div>
        <button class="resume-dialog-cancel" data-action="cancel">&times;</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const handleClick = (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'restart') {
        localStorage.removeItem(`lantern_autosave_${gameName}`);
        localStorage.removeItem(`lantern_map_${gameName}`);
        resetAllHintState(gameName); // "Start Over" is a fresh game → wipe hint progress too
        // Skip autoload on the upcoming startGame, otherwise Drive auto-sync
        // re-downloads the cloud autosave and restores it anyway. Mirrors the
        // "Restart Game" settings button.
        localStorage.setItem('lantern_skip_autoload', 'true');
      }

      overlay.remove();
      resolve(action === 'cancel' ? null : action);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      } else {
        handleClick(e);
      }
    });

    setTimeout(() => overlay.querySelector('.resume-btn')?.focus(), 50);
  });
}

/**
 * Render the "Resume" card pinned to the top of the home screen. Offers a one-tap
 * jump back into the last-played game's autosave. Shown only when there's a persisted
 * last game (lantern_resume_path) that still has an autosave. Tapping the card resumes
 * directly (no Resume/Restart dialog — "Resume" already states the intent).
 *
 * Metadata (display name + the ⓘ tooltip's year/author/difficulty/length) is reused
 * from the matching predefined game card in the DOM; custom URL games fall back to a
 * name derived from the path and get no ⓘ.
 *
 * @param {Function} onOutput - Callback for game output (TTS)
 * @param {Function} startGameFn - startGame function from game-loader (passed to avoid circular import)
 */
// Resolve a loadable game path to offer in the Resume card, or null if there's
// nothing to resume. Prefers the explicit lantern_resume_path pointer (set on every
// game start); falls back to the most-recently-saved autosave across all games, so a
// save made before this feature existed still surfaces a card. The fallback maps a
// game name back to a path via the matching predefined card or the custom-games registry.
function resolveResumePath() {
  // Explicit pointer wins — it's stamped the moment a game starts (see startGame),
  // so the card points at the last game you ran immediately, even before its first
  // autosave. Clicking resumes if there's a save, otherwise just opens the game.
  const explicit = localStorage.getItem('lantern_resume_path');
  if (explicit) return explicit;

  // No pointer (e.g. a save predating this feature): fall back to the newest autosave
  // by its stored ISO timestamp.
  let best = null; // { name, ts }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('lantern_autosave_')) continue;
    const name = key.slice('lantern_autosave_'.length);
    let ts = 0;
    try { ts = Date.parse(JSON.parse(localStorage.getItem(key))?.timestamp) || 0; } catch {}
    if (!best || ts > best.ts) best = { name, ts };
  }
  if (!best) return null;

  // Map the winning game name to a loadable path.
  for (const c of document.querySelectorAll('.game-card[data-game]')) {
    const p = c.dataset.game;
    if (p.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase() === best.name) return p;
  }
  try {
    const custom = JSON.parse(localStorage.getItem('lantern_custom_games') || '{}');
    if (custom[best.name]?.url) return custom[best.name].url;
  } catch {}
  return null;
}

export function renderResumeCard(onOutput, startGameFn) {
  document.getElementById('resumeCard')?.remove(); // idempotent

  const path = resolveResumePath();
  if (!path) return; // nothing to resume

  const gameList = document.querySelector('.game-list');
  if (!gameList) return;

  // Reuse display name + ⓘ metadata from the matching predefined card, if present.
  const srcCard = document.querySelector(`.game-card[data-game="${CSS.escape(path)}"]`);
  let displayName = '';
  let meta = null;
  if (srcCard) {
    displayName = srcCard.querySelector('.game-title')?.childNodes[0]?.textContent?.trim() || '';
    meta = srcCard.querySelector('.game-meta');
  }
  if (!displayName) {
    const gameName = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
    displayName = gameName.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase());
  }

  const card = document.createElement('button');
  card.className = 'resume-card';
  card.id = 'resumeCard';
  card.dataset.game = path;

  const infoHtml = meta ? `<span class="game-meta resume-card-info"
        data-title="${displayName}"
        data-year="${meta.dataset.year || ''}"
        data-author="${meta.dataset.author || ''}"
        data-difficulty="${meta.dataset.difficulty || ''}"
        data-length="${meta.dataset.length || ''}">ⓘ</span>` : '';

  card.innerHTML = `
    <span class="material-icons resume-card-icon">play_arrow</span>
    <span class="resume-card-text">
      <span class="resume-card-label">Resume</span>
      <span class="resume-card-title">${displayName}</span>
    </span>
    ${infoHtml}
  `;

  // ⓘ: hover tooltip is pure CSS; this handles tap-to-toggle (touch) and closes on
  // the next outside tap. stopPropagation so tapping ⓘ doesn't launch the game.
  const info = card.querySelector('.resume-card-info');
  if (info) {
    info.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasActive = info.classList.contains('active');
      document.querySelectorAll('.game-meta.active').forEach(t => t.classList.remove('active'));
      if (!wasActive) {
        info.classList.add('active');
        setTimeout(() => {
          document.addEventListener('click', function onDoc(ev) {
            if (!ev.target.closest('.resume-card-info')) {
              info.classList.remove('active');
              document.removeEventListener('click', onDoc);
            }
          });
        }, 0);
      }
    });
  }

  // Tap the card → resume straight into the autosave (matches the launch auto-resume path).
  card.addEventListener('click', () => {
    showLoadingOverlay();
    startGameFn(path, onOutput);
  });

  gameList.insertBefore(card, gameList.firstChild);
}

/**
 * Render the "Recently Played" section on the welcome screen.
 * @param {Function} onOutput - Callback for game output (TTS)
 * @param {Function} startGameFn - startGame function from game-loader (passed to avoid circular import)
 */
export function renderRecentlyPlayedSection(onOutput, startGameFn) {
  const customGames = getCustomGamesWithAutosaves();

  const existingSection = document.getElementById('recentlyPlayedSection');
  if (existingSection) existingSection.remove();

  if (customGames.length === 0) return;

  const gameList = document.querySelector('.game-list');
  if (!gameList) return;

  const ifDbSection = document.querySelector('.if-database-section');

  const section = document.createElement('div');
  section.className = 'game-category';
  section.id = 'recentlyPlayedSection';

  section.innerHTML = `
    <h3 class="category-title">🕐 Recently Played</h3>
    <p class="category-desc">Games you've started from URLs</p>
    <div class="game-category-grid">
      ${customGames.map(game => `
        <button class="game-card custom-game-card" data-game="${game.url}" data-game-name="${game.name}">
          <span class="save-badge has-save" data-save-indicator title="Game in progress"></span>
          <div class="game-title">${game.displayName}</div>
          <div class="game-desc">Custom game from URL</div>
        </button>
      `).join('')}
    </div>
  `;

  if (ifDbSection) {
    gameList.insertBefore(section, ifDbSection);
  } else {
    gameList.appendChild(section);
  }

  section.querySelectorAll('.custom-game-card').forEach(card => {
    card.addEventListener('click', async () => {
      const gameUrl = card.dataset.game;
      const gameName = card.dataset.gameName;

      const choice = await showResumeDialog(gameUrl, gameName);
      if (choice === 'resume' || choice === 'restart') {
        showLoadingOverlay();
        startGameFn(gameUrl, onOutput);
      }
    });
  });
}
