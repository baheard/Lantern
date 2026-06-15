/**
 * Game Loader Module
 *
 * Handles game selection and initialization using browser-based ZVM with custom display.
 */

import { state, resetNarrationState } from '../core/state.js';
import { dom } from '../core/dom.js';
import { updateStatus } from '../utils/status.js';
import { updateNavButtons } from '../ui/nav-buttons.js';
import { stopNarration } from '../narration/tts-player.js';
import { createVoxGlk, sendInput, getInputType } from './voxglk.js';
import { APP_CONFIG } from '../config.js';
import { createGiDispaShim } from './gidispa-shim.js';
import { updateCurrentGameDisplay, reloadSettingsForGame, updateSettingsContext } from '../ui/settings/index.js';
import { closeSettings } from '../ui/settings/settings-panel.js';
import { updateMobileMenuForGameState } from '../ui/mobile-menu.js';
import { activateIfEnabled } from '../utils/wake-lock.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import {
  trackCustomGame,
  removeCustomGame,
  showLoadingOverlay,
  showResumeDialog,
  renderRecentlyPlayedSection,
} from '../ui/recently-played.js';

/**
 * Start a game using browser-based ZVM
 * @param {string} gamePath - Path to game file
 * @param {Function} onOutput - Callback for game output (for TTS)
 */
export async function startGame(gamePath, onOutput, { skipDriveCheck = false } = {}) {

  try {
    state.currentGamePath = gamePath;
    // Set game name for save/restore
    state.currentGameName = gamePath.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();

    // Per-game auto-sync: inherit global default on first play, then use per-game value
    const perGameSyncKey = `lantern_gdrive_autosync_${state.currentGameName}`;
    if (localStorage.getItem(perGameSyncKey) === null) {
      localStorage.setItem(perGameSyncKey, localStorage.getItem('lantern_gdrive_autosync') === 'true');
    }
    state.gdriveSyncEnabled = localStorage.getItem(perGameSyncKey) === 'true';
    window.dispatchEvent(new Event('gameContextChanged'));

    // Update document title to show game name
    const gameDisplayName = gamePath.split('/').pop().replace(/\.[^.]+$/, '')
      .replace(/([A-Z])/g, ' $1').trim()
      .replace(/^\w/, c => c.toUpperCase());
    document.title = `${gameDisplayName} - IF Talk`;

    // Update game name display in settings
    updateCurrentGameDisplay(gamePath.split('/').pop());

    // Update UI for game context (refresh voice dropdowns, inject sync button)
    reloadSettingsForGame();

    // Always start with autoplay OFF — unless this is a page-reload restore,
    // which sets autoplayEnabled in initApp() and needs it preserved.
    if (!window._suppressFirstNarration) {
      state._loadingAutoplay = true;
      state.autoplayEnabled = false;
      state._loadingAutoplay = false;
    }

    // Activate keep awake if enabled (requires user gesture - game click qualifies)
    activateIfEnabled();

    updateStatus('Starting game...', 'processing');

    // Hide welcome, show game output and controls
    if (dom.welcome) dom.welcome.classList.add('hidden');
    const gameOutput = document.getElementById('gameOutput');
    if (gameOutput) gameOutput.classList.remove('hidden');

    // Set flag to indicate we're in a game (for popstate handler)
    window._inGame = true;

    // Update scroll-down button visibility
    const { updateButtonVisibility } = await import('../ui/scroll-down-button.js');
    updateButtonVisibility();

    // Push history state so back button returns to game selection
    // Only push if we're not already in a game state (avoid duplicates on refresh)
    if (!history.state?.screen || history.state.screen !== 'game') {
      history.pushState({ screen: 'game', gamePath }, '', null);
    }

    // Show controls wrapper, status bar, and message input
    const controlsWrapper = document.getElementById('controlsWrapper');
    const status = document.getElementById('status');
    if (controlsWrapper) controlsWrapper.classList.remove('hidden');
    if (status) status.classList.remove('hidden');
    const controls = document.getElementById('controls');
    if (controls) controls.classList.remove('hidden');
    const messageInputRow = document.getElementById('messageInputRow');
    if (messageInputRow) messageInputRow.classList.remove('hidden');
    const charInputPanel = document.getElementById('charInputPanel');
    if (charInputPanel) charInputPanel.classList.add('hidden'); // Hidden initially, shown by updateInputVisibility

    // Update settings context to show game-specific items (map button, etc.)
    updateSettingsContext();
    updateMobileMenuForGameState(true); // Show game-specific mobile menu icons

    // Initialize keyboard input
    const { initKeyboardInput } = await import('../input/keyboard/index.js');
    initKeyboardInput();

    // Verify ZVM is loaded
    if (typeof window.ZVM === 'undefined') {
      updateStatus('Error: Game engine not loaded');
      return;
    }

    // Verify Glk is loaded
    if (typeof window.Glk === 'undefined') {
      updateStatus('Error: Glk library not loaded');
      return;
    }

    // Fetch the story file as binary data
    updateStatus('Downloading game file...', 'processing');

    // Determine the fetch URL
    let fetchUrl = gamePath;
    let isRemoteUrl = gamePath.startsWith('http://') || gamePath.startsWith('https://');

    if (!isRemoteUrl) {
      // Local file - add games/ prefix if not already present (relative path for GitHub Pages compatibility)
      fetchUrl = gamePath.startsWith('games/') ? gamePath : `games/${gamePath}`;
    } else {
      // Remote URL - use proxy endpoint to avoid CORS issues
      fetchUrl = `/api/fetch-game?url=${encodeURIComponent(gamePath)}`;
    }

    const response = await fetch(fetchUrl);

    if (!response.ok) {
      // Check if it's a JSON error response from our proxy
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load game file: ${response.status}`);
      }
      throw new Error(`Failed to load game file: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const storyData = arrayBuffer;

    // Create ZVM instance
    const vm = new window.ZVM();
    window.zvmInstance = vm;

    // Create VoxGlk display engine
    const voxglk = createVoxGlk(onOutput);

    // Prepare options for Glk
    const options = {
      vm: vm,
      Glk: window.Glk,
      GlkOte: voxglk,  // Pass VoxGlk as GlkOte - duck typing!
      Dialog: window.Dialog,
      do_vm_autosave: false  // Disabled - custom Quetzal+bootstrap path handles Z-machine autosave
    };

    // Engine autorestore migration (autorestore-migration-plan.md, Phase 1).
    // When enabled, supply a GiDispa shim + turn on the engine's full-state
    // do_autosave/do_autorestore. Otherwise keep the legacy custom path.
    if (APP_CONFIG.useEngineAutorestore) {
      options.GiDispa = createGiDispaShim();
      options.do_vm_autosave = true;
    }

    // Prepare VM with story data
    vm.prepare(storyData, options);
    // Check if user requested to skip autoload (restart game)
    const skipAutoload = localStorage.getItem('lantern_skip_autoload');
    if (skipAutoload === 'true') {
      localStorage.removeItem('lantern_skip_autoload');
      localStorage.removeItem(`lantern_autosave_${state.currentGameName}`);
    }

    // Check for pending restore request (from 'R' key restore dialog)
    const pendingRestoreJson = sessionStorage.getItem('lantern_pending_restore');
    if (pendingRestoreJson) {
      sessionStorage.removeItem('lantern_pending_restore');
      try {
        const pendingRestore = JSON.parse(pendingRestoreJson);
        // Set flag for restore - VoxGlk will handle it
        window.shouldAutoRestore = true;
        window.pendingRestoreType = pendingRestore.type;
        window.pendingRestoreKey = pendingRestore.key;
      } catch (e) {
        // Failed to parse pending restore - silently ignored
      }
    }

    // If auto-sync is enabled, check Drive for a newer autosave before loading local.
    // This lets a save from another device appear seamlessly on first load here.
    if (state.gdriveSyncEnabled && !skipAutoload && !pendingRestoreJson && !skipDriveCheck) {
      const { checkDriveForNewerAutosave } = await import('../utils/gdrive/index.js');
      await checkDriveForNewerAutosave(state.currentGameName);
    }

    // Check for autosave - will restore after VM starts (on first update)
    const autosaveKey = `lantern_autosave_${state.currentGameName}`;
    const autosaveRaw = (!skipAutoload && !pendingRestoreJson) ? localStorage.getItem(autosaveKey) : null;
    const hasAutosave = autosaveRaw !== null;

    // Detect engine-format autosaves (autorestore-migration-plan.md, Phase 3).
    // For these, the engine restores the VM itself during Glk.init (via
    // Dialog.autosave_read → do_autorestore), so the legacy bootstrap "wake" kick
    // must be skipped — the VM is already parked at the correct glk_select. The
    // app-side reattachment (displayHTML/map/narration) still runs via performRestore.
    window.__engineAutorestoreActive = false;
    if (hasAutosave && APP_CONFIG.useEngineAutorestore) {
      try {
        window.__engineAutorestoreActive = JSON.parse(autosaveRaw).saveFormat === 'engine';
      } catch (e) {
        window.__engineAutorestoreActive = false;
      }
    }

    // Flag to trigger auto-restore on first update (after VM is running)
    if (hasAutosave) {
      window.shouldAutoRestore = true;
    }

    // Initialize Glk - this starts everything!
    window.Glk.init(options);
    // Glk.init() will:
    // 1. Set options.accept to its internal handler
    // 2. Call customDisplay.init(options)
    // 3. customDisplay.init() will call options.accept({type: 'init'})
    // 4. Glk will call vm.start()
    // 5. Game output will come through customDisplay.update()

    // Autosave restore is now done BEFORE Glk.init() above (no delayed restore needed)

    updateStatus('Ready - Game loaded');

    // Dispatch gameLoaded event for auto-mapper and other listeners
    window.dispatchEvent(new CustomEvent('gameLoaded', {
      detail: { gameName: state.currentGameName, gamePath }
    }));

    // Start autosave backup timer (every 2 minutes, max 5 backups)
    import('./save-manager.js').then(({ startAutosaveBackupTimer }) => {
      startAutosaveBackupTimer();
    });

    // Fade out loading overlay (100ms delay + 100ms fade)
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      setTimeout(() => {
        loadingOverlay.classList.add('fade-out');
        const finish = () => {
          loadingOverlay.remove();
          window.dispatchEvent(new CustomEvent('loadingFadeComplete'));
        };
        // Fallback in case transitionend doesn't fire (background tab, reduced-motion, etc.)
        const fallback = setTimeout(finish, 300);
        loadingOverlay.addEventListener('transitionend', () => { clearTimeout(fallback); finish(); }, { once: true });
      }, 100);
    }

    // Save as last played game for auto-resume
    localStorage.setItem('lantern_last_game', gamePath);

    // Reset narration state
    resetNarrationState();
    updateNavButtons();

    // Don't auto-start talk mode - user clicks the talk mode button to enable

    // Stop any existing narration
    stopNarration();

  } catch (error) {
    updateStatus('Error: ' + error.message);

    // Return to welcome screen on error
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.remove();
    }

    // Show welcome screen, hide game output and controls
    const welcome = document.getElementById('welcome');
    const gameOutput = document.getElementById('gameOutput');
    const controlsWrapper = document.getElementById('controlsWrapper');
    const status = document.getElementById('status');
    if (welcome) welcome.classList.remove('hidden');
    if (gameOutput) gameOutput.classList.add('hidden');
    if (controlsWrapper) controlsWrapper.classList.add('hidden');
    if (status) status.classList.add('hidden');

    // Clear last game so we don't auto-retry on refresh
    localStorage.removeItem('lantern_last_game');

    // Update settings context to hide game-specific items (map button, etc.)
    updateSettingsContext();
    updateMobileMenuForGameState(false); // Hide game-specific mobile menu icons

    // Update scroll-down button visibility
    const { updateButtonVisibility } = await import('../ui/scroll-down-button.js');
    updateButtonVisibility();

    // Show error to user
    alert('Failed to load game: ' + error.message);
  }
}

/**
 * Send command to the game
 * @param {string} cmd - Command to send
 */
export function sendCommandToGame(cmd) {
  const input = cmd !== undefined ? cmd : '';

  // Get the current input type from VoxGlk (game may want 'char' or 'line')
  const type = getInputType();

  // For char input with empty string, send Enter key
  const text = (type === 'char' && input === '') ? '\n' : input;

  // Send through our custom display layer with correct type
  sendInput(text, type);
}

/**
 * Unload current game and return to welcome screen
 */
export function unloadGame() {
  // Restore original title
  document.title = 'IF Talk - Voice-Powered Interactive Fiction';

  // Hide game output, show welcome screen
  const gameOutput = document.getElementById('gameOutput');
  const welcome = document.getElementById('welcome');
  if (gameOutput) gameOutput.classList.add('hidden');
  if (welcome) welcome.classList.remove('hidden');

  // Hide controls wrapper and status bar
  const controlsWrapper = document.getElementById('controlsWrapper');
  const status = document.getElementById('status');
  if (controlsWrapper) controlsWrapper.classList.add('hidden');
  if (status) status.classList.add('hidden');

  // Update scroll-down button visibility
  import('../ui/scroll-down-button.js').then(({ updateButtonVisibility }) => {
    updateButtonVisibility();
  });

  // Clear game state
  window._inGame = false;
  localStorage.removeItem('lantern_last_game');

  // Update settings context to hide game-specific items (map button, etc.)
  updateSettingsContext();
  updateMobileMenuForGameState(false); // Hide game-specific mobile menu icons

  // Reset gdriveSyncEnabled to global default when no game is loaded
  state.gdriveSyncEnabled = localStorage.getItem('lantern_gdrive_autosync') === 'true';
  window.dispatchEvent(new Event('gameContextChanged'));

  // Update status
  updateStatus('Select a game to start');
}

/**
 * Check Drive for a newer autosave, then show resume/restart dialog if one exists,
 * then start the game. Call this from click handlers instead of startGame() directly
 * so the dialog sees any cloud saves before deciding what to show.
 */
async function launchGame(gamePath, gameName, onOutput, { trackFn = null } = {}) {
  // Drive check first — downloads any cloud save into localStorage before we look
  if (state.gdriveSyncEnabled) {
    const { checkDriveForNewerAutosave } = await import('../utils/gdrive/index.js');
    await checkDriveForNewerAutosave(gameName);
  }

  const autosaveKey = `lantern_autosave_${gameName}`;
  const hasAutosave = localStorage.getItem(autosaveKey) !== null;

  if (hasAutosave) {
    const choice = await showResumeDialog(gamePath, gameName);
    if (choice === 'resume' || choice === 'restart') {
      showLoadingOverlay();
      if (trackFn) trackFn();
      startGame(gamePath, onOutput, { skipDriveCheck: true });
    }
    // null = cancelled, do nothing
  } else {
    showLoadingOverlay();
    if (trackFn) trackFn();
    startGame(gamePath, onOutput, { skipDriveCheck: true });
  }
}

/**
 * Initialize game selection handlers
 * @param {Function} onOutput - Callback for game output (for TTS)
 */
export function initGameSelection(onOutput) {
  // Game card click handlers
  const gameCards = document.querySelectorAll('.game-card');

  gameCards.forEach((card, index) => {
    card.addEventListener('click', async (e) => {
      closeSettings();
      const gamePath = card.dataset.game;
      const gameName = gamePath.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
      await launchGame(gamePath, gameName, onOutput);
    });

    // Check for autosave and update badge
    const gamePath = card.dataset.game;
    if (gamePath) {
      const gameName = gamePath.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
      const autosaveKey = `lantern_autosave_${gameName}`;
      const hasSave = localStorage.getItem(autosaveKey) !== null;

      const badge = card.querySelector('[data-save-indicator]');
      if (badge && hasSave) {
        badge.classList.add('has-save');
        badge.title = 'Game in progress';
      }
    }
  });

  // Classics expander toggle
  const classicsToggle = document.getElementById('classicsToggle');
  const classicsExpander = document.getElementById('classicsExpander');
  if (classicsToggle && classicsExpander) {
    classicsToggle.addEventListener('click', () => {
      classicsExpander.classList.toggle('expanded');
    });
  }

  // Select game button (reload page)
  if (dom.selectGameBtn) {
    dom.selectGameBtn.addEventListener('click', () => {
      // Clear last game so it doesn't auto-load
      localStorage.removeItem('lantern_last_game');
      location.reload();
    });
  }

  // Restart game button (set flag to skip autoload, then reload)
  const restartGameBtn = document.getElementById('restartGameBtn');
  if (restartGameBtn) {
    restartGameBtn.addEventListener('click', async () => {
      // Show confirmation dialog
      const confirmed = await confirmDialog(
        'This will restart the game from the beginning.\nYour autosave and map will be cleared.\n\nAre you sure you want to continue?',
        { title: 'Restart Game?' }
      );

      if (confirmed) {
        // Set flag to skip autoload on next page load
        localStorage.setItem('lantern_skip_autoload', 'true');
        // Clear the map data for this game
        if (state.currentGameName) {
          localStorage.removeItem(`lantern_map_${state.currentGameName}`);
        }
        // Reload to restart the game from beginning
        location.reload();
      }
    });
  }

  // Custom URL form handler
  const customUrlForm = document.getElementById('customUrlForm');
  const customUrlInput = document.getElementById('customUrlInput');
  if (customUrlForm && customUrlInput) {
    customUrlForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = customUrlInput.value.trim();
      if (!url) return;

      // Validate URL format
      try {
        new URL(url);
      } catch {
        alert('Please enter a valid URL');
        return;
      }

      // Check for valid Z-machine file extensions
      const validExtensions = ['.z3', '.z4', '.z5', '.z8', '.zblorb', '.zlb'];
      const hasValidExtension = validExtensions.some(ext =>
        url.toLowerCase().endsWith(ext)
      );

      if (!hasValidExtension) {
        const proceed = await confirmDialog(
          'This URL doesn\'t end with a recognized Z-machine extension (.z3, .z4, .z5, .z8, .zblorb).\n\nTry to load it anyway?',
          { title: 'Unrecognized File Extension' }
        );
        if (!proceed) return;
      }

      // Extract game name from URL for autosave key
      const urlPath = new URL(url).pathname;
      const fileName = urlPath.split('/').pop() || 'custom-game';
      const gameName = fileName.replace(/\.[^.]+$/, '').toLowerCase();

      await launchGame(url, gameName, onOutput, {
        trackFn: () => trackCustomGame(url, gameName)
      });
    });
  }

  // Handle browser back button - return to welcome screen
  window.addEventListener('popstate', (event) => {
    // If we're in a game, return to welcome screen
    if (window._inGame) {
      // Clear last game and reload for clean state
      // (Reloading is simpler than trying to reset all VM/VoxGlk state)
      localStorage.removeItem('lantern_last_game');
      location.reload();
    }
  });

  // Check for pending restore (from Quick Load or RESTORE command)
  const pendingRestoreJson = sessionStorage.getItem('lantern_pending_restore');
  let shouldAutoLoad = false;
  let gameToLoad = null;

  // Declare these variables in outer scope for later access
  let lastGame = localStorage.getItem('lantern_last_game');
  let lastGameName = lastGame ? lastGame.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase() : null;
  let hasAutosave = lastGameName ? localStorage.getItem(`lantern_autosave_${lastGameName}`) !== null : false;

  // Check if user requested to skip autoload (restart game)
  const skipAutoload = localStorage.getItem('lantern_skip_autoload');
  if (skipAutoload === 'true' && lastGame) {
    // Force load last game even without autosave (for restart)
    // Note: startGame() will remove the flag and autosave
    gameToLoad = lastGame;
    shouldAutoLoad = true;
  } else if (pendingRestoreJson) {
    // Pending restore - use last game path (should still be set)
    const pendingRestore = JSON.parse(pendingRestoreJson);

    // Set flags for voxglk.js to pick up
    sessionStorage.removeItem('lantern_pending_restore');
    window.shouldAutoRestore = true;
    window.pendingRestoreType = pendingRestore.type;
    window.pendingRestoreKey = pendingRestore.key;

    if (lastGame) {
      gameToLoad = lastGame;
      shouldAutoLoad = true;
    } else {
      // Fallback: use gameName from pending restore and guess path
      const gameName = pendingRestore.gameName;

      if (gameName) {
        // Try common extensions
        gameToLoad = `games/${gameName}.z8`;
        shouldAutoLoad = true;
      }
    }
  } else {
    // No pending restore - check for last game with autosave
    if (lastGame && hasAutosave) {
      gameToLoad = lastGame;
      shouldAutoLoad = true;
    }
  }

  if (shouldAutoLoad && gameToLoad) {
    // On auto-load, only set up welcome state if this is a fresh page load (no history state yet)
    if (!history.state) {
      history.replaceState({ screen: 'welcome' }, '', location.href);
    }

    // Note: Don't call showLoadingOverlay() here - the initial HTML overlay is already visible
    // and startGame() will fade it out. Creating a new overlay causes timing issues.

    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      startGame(gameToLoad, onOutput);
    }, 100);
  } else {
    // Clear last game if no autosave (user should pick from welcome screen)
    if (lastGame && !hasAutosave) {
      localStorage.removeItem('lantern_last_game');
    }

    // Fade out loading overlay to reveal welcome screen
    setTimeout(() => {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.classList.add('fade-out');
        const finish = () => {
          loadingOverlay.remove();
          renderRecentlyPlayedSection(onOutput, startGame);
        };
        // Fallback in case transitionend doesn't fire (background tab, reduced-motion, etc.)
        const fallback = setTimeout(finish, 300);
        loadingOverlay.addEventListener('transitionend', () => { clearTimeout(fallback); finish(); }, { once: true });
      } else {
        // No overlay present - render immediately
        renderRecentlyPlayedSection(onOutput, startGame);
      }
    }, 100);
  }
}
