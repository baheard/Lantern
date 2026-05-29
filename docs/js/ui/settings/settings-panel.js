/**
 * Settings Panel Module
 *
 * Manages settings panel visibility, context updates, and various settings controls.
 */

import { state } from '../../core/state.js';
import { dom } from '../../core/dom.js';
import { updateStatus } from '../../utils/status.js';
import { getItem } from '../../utils/storage/storage-api.js';
// save-manager imported dynamically in initSaveHandlers to break the circular dep:
// settings-panel → save-manager → game-output → tts-player → settings/index → settings-panel
import { showBackupSavesDialog } from '../backup-saves-dialog.js';
import { loadOpenAITTSConfig, saveOpenAITTSConfig, testOpenAITTS } from '../../narration/openai-tts.js';

// Element to return focus to when the panel closes (typically the trigger button)
let lastFocusedBeforeOpen = null;

// inert removes the panel from focus + interaction; aria-hidden is added because
// some tooling (Playwright ariaSnapshot, older screen readers) does not yet honor
// inert as a signal to drop a subtree from the accessibility tree.
export function openSettings() {
  if (dom.settingsPanel) {
    lastFocusedBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    updateSettingsContext();
    dom.settingsPanel.removeAttribute('inert');
    dom.settingsPanel.removeAttribute('aria-hidden');
    dom.settingsPanel.classList.add('open');
    if (dom.settingsOverlay) {
      dom.settingsOverlay.classList.remove('hidden');
    }
  }
}

export function closeSettings() {
  if (dom.settingsPanel) {
    dom.settingsPanel.classList.remove('open');
    dom.settingsPanel.setAttribute('inert', '');
    dom.settingsPanel.setAttribute('aria-hidden', 'true');
    if (dom.settingsOverlay) {
      dom.settingsOverlay.classList.add('hidden');
    }
    if (lastFocusedBeforeOpen && document.contains(lastFocusedBeforeOpen)) {
      lastFocusedBeforeOpen.focus();
    }
    lastFocusedBeforeOpen = null;
  }
}

/**
 * Toggle the settings panel and overlay
 */
export function toggleSettings() {
  if (dom.settingsPanel?.classList.contains('open')) {
    closeSettings();
  } else {
    openSettings();
  }
}

/**
 * Check if we're on the welcome screen (no game loaded)
 * @returns {boolean} True if on welcome screen
 */
export function isOnWelcomeScreen() {
  return !state.currentGameName;
}

/**
 * Get display name for a game (looks up proper title from game card, with fallback)
 * @param {string} gameName - Game filename (with or without extension)
 * @returns {string} Formatted display name
 */
export function getGameDisplayName(gameName) {
  if (!gameName) return '';

  // Try to find the proper display name from game card
  const gameCard = document.querySelector(`.game-card[data-game="${gameName}"]`) ||
                   document.querySelector(`.game-card[data-game$="/${gameName}"]`);

  if (gameCard) {
    const titleEl = gameCard.querySelector('.game-title');
    if (titleEl) {
      // Get text without the meta span (year, length)
      const metaSpan = titleEl.querySelector('.game-meta');
      return metaSpan
        ? titleEl.textContent.replace(metaSpan.textContent, '').trim()
        : titleEl.textContent.trim();
    }
  }

  // Fallback: format filename nicely
  return gameName
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .trim()
    .split(/[\s_-]+/) // Split on spaces, underscores, hyphens
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Show/hide browser narrator voice settings based on whether OpenAI TTS is active.
 */
export function updateAudioSettingsVisibility() {
  const browserNarratorSettings = document.getElementById('browserNarratorSettings');
  if (!browserNarratorSettings) return;
  const openAiEnabled = !!(state.openAiTtsConfig?.enabled && state.openAiTtsConfig?.apiKey);
  browserNarratorSettings.style.display = openAiEnabled ? 'none' : '';
}

/**
 * Update settings panel labels based on context (welcome vs in-game)
 * Called when settings panel opens and when game loads/unloads
 */
export function updateSettingsContext() {
  const isWelcome = isOnWelcomeScreen();

  // Update panel title
  const titleEl = document.getElementById('settingsPanelTitle');
  if (titleEl) {
    if (isWelcome) {
      titleEl.textContent = 'Settings';
    } else {
      const displayName = getGameDisplayName(state.currentGameName);
      titleEl.textContent = displayName ? `Settings — ${displayName}` : 'Settings';
    }
  }

  // Show/hide game-specific items
  const gameItems = document.querySelectorAll('.game-section-item');
  gameItems.forEach(item => {
    item.style.display = isWelcome ? 'none' : 'block';
  });

  // Show/hide welcome-specific items
  const welcomeItems = document.querySelectorAll('.welcome-section-item');
  welcomeItems.forEach(item => {
    item.style.display = isWelcome ? 'block' : 'none';
  });

  // Sync audio settings visibility with current OpenAI state
  updateAudioSettingsVisibility();

  // Refresh cost display when settings opens
  const costEl = document.getElementById('openaiTtsCost');
  if (costEl) {
    import('../../narration/openai-tts.js').then(({ getSessionCost }) => {
      const cost = getSessionCost();
      costEl.textContent = cost < 0.001 ? '≈ $0.000 this session' : `≈ $${cost.toFixed(3)} this session`;
    });
  }
}

/**
 * Update current game name display in settings
 * @param {string} gameName - Name of the current game (filename with or without extension)
 */
export function updateCurrentGameDisplay(gameName) {
  const displayName = getGameDisplayName(gameName);
  const mobileHomeGameName = document.getElementById('mobileHomeGameName');
  if (mobileHomeGameName) {
    mobileHomeGameName.textContent = displayName || 'Home';
  }
}

/**
 * Update voice controls visibility
 * @param {boolean} enabled - Whether voice controls should be shown
 */
function updateVoiceControlsVisibility(enabled) {
  const body = document.body;

  // Only toggle body class - don't touch controls element
  // Controls visibility is managed by game-loader.js (shown when game loads)
  if (enabled) {
    body.classList.remove('voice-controls-hidden');
  } else {
    body.classList.add('voice-controls-hidden');
  }
}


/**
 * Reload settings for current game (called when game changes)
 * NOTE: Settings are now global, so this mainly handles UI updates
 */
export async function reloadSettingsForGame() {
  // Settings are global now, no need to reload per-game settings

  // Refresh voice dropdowns to show current selection
  const { populateVoiceDropdown } = await import('./voice-selection.js');
  populateVoiceDropdown();
}

/**
 * Initialize OpenAI TTS settings UI and wire handlers
 */
function initOpenAITTSSettings() {
  loadOpenAITTSConfig();
  const cfg = state.openAiTtsConfig || {};

  const toggle = document.getElementById('openaiTtsToggle');
  const settingsDiv = document.getElementById('openaiTtsSettings');
  const apiKeyInput = document.getElementById('openaiApiKey');
  const apiKeySaveBtn = document.getElementById('openaiApiKeySave');
  const apiKeyStatus = document.getElementById('openaiApiKeyStatus');
  const voiceSelect = document.getElementById('openaiVoiceSelect');
  const testBtn = document.getElementById('openaiTestVoiceBtn');
  const speedSlider = document.getElementById('openaiSpeed');
  const speedValue = document.getElementById('openaiSpeedValue');
  const modelSelect = document.getElementById('openaiModelSelect');

  if (!toggle) return;

  // Restore saved state
  const hasKey = !!(cfg.apiKey);
  toggle.checked = !!(cfg.enabled && hasKey);
  if (settingsDiv) settingsDiv.style.display = toggle.checked ? 'block' : 'none';
  if (apiKeyStatus && hasKey) {
    const last4 = cfg.apiKey.slice(-4);
    apiKeyStatus.textContent = `Key saved (…${last4}). Stored only in your browser.`;
  }
  if (voiceSelect && cfg.voice) voiceSelect.value = cfg.voice;
  if (speedSlider && cfg.speed) {
    speedSlider.value = cfg.speed;
    if (speedValue) speedValue.textContent = cfg.speed.toFixed(1) + 'x';
  }
  if (modelSelect && cfg.model) modelSelect.value = cfg.model;

  // Toggle: show/hide sub-settings and browser voice controls
  toggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (settingsDiv) settingsDiv.style.display = enabled ? 'block' : 'none';
    if (!state.openAiTtsConfig) state.openAiTtsConfig = {};
    state.openAiTtsConfig.enabled = enabled;
    saveOpenAITTSConfig();
    updateAudioSettingsVisibility();
    if (enabled) {
      const hasKey = !!(state.openAiTtsConfig?.apiKey);
      updateStatus(hasKey ? '✓ AI narration enabled' : '⚠ AI narration on — save an API key to activate');
    } else {
      updateStatus('✗ AI narration disabled — using device voice');
    }
  });

  // Save API key
  if (apiKeySaveBtn) {
    apiKeySaveBtn.addEventListener('click', () => {
      const key = apiKeyInput?.value?.trim();
      if (!key) {
        updateStatus('Enter your OpenAI API key first');
        return;
      }
      if (!key.startsWith('sk-')) {
        updateStatus('Key should start with sk-');
        return;
      }
      if (!state.openAiTtsConfig) state.openAiTtsConfig = {};
      state.openAiTtsConfig.apiKey = key;
      saveOpenAITTSConfig();
      if (apiKeyInput) apiKeyInput.value = '';
      if (apiKeyStatus) {
        const last4 = key.slice(-4);
        apiKeyStatus.textContent = `Key saved (…${last4}). Stored only in your browser.`;
      }
      updateStatus('✓ API key saved');
    });
  }

  // Voice selection
  if (voiceSelect) {
    voiceSelect.addEventListener('change', (e) => {
      if (!state.openAiTtsConfig) state.openAiTtsConfig = {};
      state.openAiTtsConfig.voice = e.target.value;
      saveOpenAITTSConfig();
      updateStatus(`✓ AI voice: ${e.target.value}`);
    });
  }

  // Speed slider
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      if (speedValue) speedValue.textContent = speed.toFixed(1) + 'x';
      if (!state.openAiTtsConfig) state.openAiTtsConfig = {};
      state.openAiTtsConfig.speed = speed;
      saveOpenAITTSConfig();
    });
  }

  // Model selection
  if (modelSelect) {
    modelSelect.addEventListener('change', (e) => {
      if (!state.openAiTtsConfig) state.openAiTtsConfig = {};
      state.openAiTtsConfig.model = e.target.value;
      saveOpenAITTSConfig();
      updateStatus(`✓ AI model: ${e.target.value}`);
    });
  }

  // Test voice button
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      if (!state.openAiTtsConfig?.apiKey) {
        updateStatus('Save your API key first');
        return;
      }
      updateStatus('Testing AI voice…');
      try {
        await testOpenAITTS();
        updateStatus('✓ AI voice test complete');
      } catch (err) {
        updateStatus('AI TTS error: ' + err.message);
      }
    });
  }
}

/**
 * Initialize settings panel
 */
export function initSettings() {
  // Settings button (in-game)
  if (dom.settingsBtn) {
    dom.settingsBtn.addEventListener('click', toggleSettings);
  }

  // Settings button (welcome screen)
  const welcomeSettingsBtn = document.getElementById('welcomeSettingsBtn');
  if (welcomeSettingsBtn) {
    welcomeSettingsBtn.addEventListener('click', openSettings);
  }

  // Close settings button
  if (dom.closeSettingsBtn) {
    dom.closeSettingsBtn.addEventListener('click', closeSettings);
  }

  // Click overlay to close settings
  if (dom.settingsOverlay) {
    dom.settingsOverlay.addEventListener('click', closeSettings);
  }


  // View Backup Saves button
  const viewBackupSavesBtn = document.getElementById('viewBackupSavesBtn');
  if (viewBackupSavesBtn) {
    viewBackupSavesBtn.addEventListener('click', () => {
      showBackupSavesDialog();
    });
  }

  // Collapsible sections with accordion behavior (only top-level sections)
  const topLevelSections = document.querySelectorAll('.settings-content > .settings-section.collapsible');
  topLevelSections.forEach(section => {
    const header = section.querySelector('.section-header');
    if (header) {
      header.addEventListener('click', () => {
        const wasCollapsed = section.classList.contains('collapsed');

        // Collapse all top-level sections (accordion behavior)
        topLevelSections.forEach(s => {
          s.classList.add('collapsed');
        });

        // If this section was collapsed, expand it
        if (wasCollapsed) {
          section.classList.remove('collapsed');
        }
      });
    }
  });

  // Nested collapsible sections (inside top-level sections) - toggle independently
  const nestedSections = document.querySelectorAll('.settings-section.collapsible .settings-section.collapsible');
  nestedSections.forEach(section => {
    const header = section.querySelector('.section-header');
    if (header) {
      header.addEventListener('click', (e) => {
        // Stop propagation to prevent parent section from collapsing
        e.stopPropagation();
        section.classList.toggle('collapsed');
      });
    }
  });

  // Note: Quick Save/Restore button handlers are in save-manager.js
  // to avoid duplicate handlers

  // Master volume slider (global, not per-game)
  const volumeSlider = document.getElementById('masterVolume');
  const volumeValue = document.getElementById('masterVolumeValue');
  if (volumeSlider && volumeValue) {
    // Load saved volume (global setting)
    const savedVolume = localStorage.getItem('iftalk_masterVolume');
    const volume = savedVolume ? parseInt(savedVolume) : 100;
    volumeSlider.value = volume;
    volumeValue.textContent = volume + '%';
    if (state.browserVoiceConfig) {
      state.browserVoiceConfig.volume = volume / 100;
    }

    volumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      volumeValue.textContent = vol + '%';

      // Update voice config
      if (state.browserVoiceConfig) {
        state.browserVoiceConfig.volume = vol / 100;
      }

      // Save globally (not per-game)
      localStorage.setItem('iftalk_masterVolume', vol.toString());
      updateStatus(`Volume: ${vol}%`);
    });
  }

  // Speech rate slider
  const speechRateSlider = document.getElementById('speechRate');
  const speechRateValue = document.getElementById('speechRateValue');
  if (speechRateSlider && speechRateValue) {
    // Load saved speech rate from global localStorage
    const savedRate = localStorage.getItem('iftalk_speechRate');
    const rate = savedRate ? parseFloat(savedRate) : 1.0;
    speechRateSlider.value = rate;
    speechRateValue.textContent = rate.toFixed(1) + 'x';
    if (state.browserVoiceConfig) {
      state.browserVoiceConfig.rate = rate;
    }

    speechRateSlider.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      speechRateValue.textContent = rate.toFixed(1) + 'x';

      // Update voice config
      if (state.browserVoiceConfig) {
        state.browserVoiceConfig.rate = rate;
      }

      // Save to global localStorage
      localStorage.setItem('iftalk_speechRate', rate.toString());
      updateStatus(`✓ Speech speed: ${rate.toFixed(1)}x`);
    });
  }

  // Voice Controls toggle
  const voiceControlsToggle = document.getElementById('voiceControlsToggle');
  if (voiceControlsToggle) {
    const voiceControlsEnabled = localStorage.getItem('iftalk_voiceControlsEnabled') !== 'false';
    voiceControlsToggle.checked = voiceControlsEnabled;
    updateVoiceControlsVisibility(voiceControlsEnabled);

    voiceControlsToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('iftalk_voiceControlsEnabled', enabled);
      updateVoiceControlsVisibility(enabled);
      updateStatus(enabled ? '✓ Voice controls shown' : '✗ Voice controls hidden');
    });
  }

  // Sound Effects toggle
  const soundEffectsToggle = document.getElementById('soundEffectsToggle');
  if (soundEffectsToggle) {
    const soundEffectsEnabled = localStorage.getItem('iftalk_soundEffectsEnabled') !== 'false';
    soundEffectsToggle.checked = soundEffectsEnabled;

    soundEffectsToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('iftalk_soundEffectsEnabled', enabled);
      updateStatus(enabled ? '✓ Sound effects enabled' : '✗ Sound effects disabled');
    });
  }

  // Auto-save toggle
  const autosaveToggle = document.getElementById('autosaveToggle');
  if (autosaveToggle) {
    const autosaveEnabled = localStorage.getItem('iftalk_autosaveEnabled') !== 'false';
    autosaveToggle.checked = autosaveEnabled;

    autosaveToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('iftalk_autosaveEnabled', enabled);
      updateStatus(enabled ? '✓ Auto-save enabled' : '✗ Auto-save disabled');
    });
  }

  // Automap by Default toggle (welcome screen only)
  const automapByDefaultToggle = document.getElementById('automapByDefaultToggle');
  if (automapByDefaultToggle) {
    const automapPref = localStorage.getItem('iftalk_automap_default');
    const automapByDefault = automapPref !== null ? automapPref === 'true' : true; // Default: enabled
    automapByDefaultToggle.checked = automapByDefault;

    automapByDefaultToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('iftalk_automap_default', enabled);
      updateStatus(enabled ? '✓ New games will auto-map by default' : '✗ Auto-mapping off by default');
    });
  }

  // Keep Screen Awake toggle (already uses global state)
  const keepAwakeToggle = document.getElementById('keepAwakeToggle');
  if (keepAwakeToggle) {
    const keepAwake = localStorage.getItem('iftalk_keepScreenAwake') === 'true';
    keepAwakeToggle.checked = keepAwake;

    keepAwakeToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('iftalk_keepScreenAwake', enabled);
      // Update screen wake lock if available
      if (window.screenLock) {
        if (enabled) {
          window.screenLock.enable();
        } else {
          window.screenLock.disable();
        }
      }
      updateStatus(enabled ? '✓ Screen will stay awake' : '✗ Screen lock disabled');
    });
  }

  initOpenAITTSSettings();
}

/**
 * Wire save/restore button event listeners (toolbar + settings).
 * Lives here rather than in save-manager so that module stays UI-free.
 */
export function initSaveHandlers() {
  const quickSaveBtn = document.getElementById('quickSaveBtn');
  if (quickSaveBtn) {
    quickSaveBtn.addEventListener('click', () => {
      import('../../game/save-manager.js').then(({ quickSave }) => { quickSave(); });
      closeSettings();
    });
  }

  const quickRestoreBtn = document.getElementById('quickRestoreBtn');
  if (quickRestoreBtn) {
    quickRestoreBtn.addEventListener('click', () => {
      if (!state.currentGameName) {
        updateStatus('Error: No game loaded', 'error');
        return;
      }
      const key = `iftalk_quicksave_${state.currentGameName}`;
      if (!getItem(key)) {
        updateStatus('No quick save found - Use Quick Save button first', 'error');
        return;
      }
      sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
        type: 'quicksave',
        key: state.currentGameName,
        gameName: state.currentGameName
      }));
      window.location.reload();
    });
  }

  const quickLoadBtn = document.getElementById('quickLoadBtn');
  if (quickLoadBtn) {
    quickLoadBtn.addEventListener('click', () => {
      if (!state.currentGameName) {
        updateStatus('Error: No game loaded', 'error');
        return;
      }
      const key = `iftalk_quicksave_${state.currentGameName}`;
      if (!getItem(key)) {
        updateStatus('No quick save found - Use Quick Save button first', 'error');
        return;
      }
      sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
        type: 'quicksave',
        key: state.currentGameName,
        gameName: state.currentGameName
      }));
      window.location.reload();
    });
  }

  const exportSaveBtn = document.getElementById('exportSaveBtn');
  if (exportSaveBtn) {
    exportSaveBtn.addEventListener('click', () => {
      import('../../game/save-manager.js').then(({ exportSaveToFile }) => exportSaveToFile());
    });
  }

  const importSaveBtn = document.getElementById('importSaveBtn');
  if (importSaveBtn) {
    importSaveBtn.addEventListener('click', () => {
      import('../../game/save-manager.js').then(({ importSaveFromFile }) => importSaveFromFile());
    });
  }
}
