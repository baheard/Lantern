/**
 * Recently Played UI
 *
 * Manages the "Recently Played" section on the welcome screen: tracking custom
 * games, resume/restart dialog, and the loading overlay.
 */

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

  const customGames = JSON.parse(localStorage.getItem('iftalk_custom_games') || '{}');
  customGames[gameName] = {
    url: url,
    name: gameName,
    displayName: gameName.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase()),
    lastPlayed: Date.now()
  };
  localStorage.setItem('iftalk_custom_games', JSON.stringify(customGames));
}

/**
 * Remove a custom game from tracking
 * @param {string} gameName - Normalized game name
 */
export function removeCustomGame(gameName) {
  const customGames = JSON.parse(localStorage.getItem('iftalk_custom_games') || '{}');
  delete customGames[gameName];
  localStorage.setItem('iftalk_custom_games', JSON.stringify(customGames));
}

/**
 * Get custom games that have autosaves
 * @returns {Array} Array of custom game objects with autosaves
 */
export function getCustomGamesWithAutosaves() {
  const customGames = JSON.parse(localStorage.getItem('iftalk_custom_games') || '{}');
  const gamesWithSaves = [];

  for (const [gameName, gameData] of Object.entries(customGames)) {
    const autosaveKey = `iftalk_autosave_${gameName}`;
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
        localStorage.removeItem(`iftalk_autosave_${gameName}`);
        localStorage.removeItem(`iftalk_map_${gameName}`);
        // Skip autoload on the upcoming startGame, otherwise Drive auto-sync
        // re-downloads the cloud autosave and restores it anyway. Mirrors the
        // "Restart Game" settings button.
        localStorage.setItem('iftalk_skip_autoload', 'true');
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
