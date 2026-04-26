/**
 * Settings Panel Module
 *
 * Manages settings panel visibility, context updates, and various settings controls.
 */

import { state } from '../../core/state.js';
import { dom } from '../../core/dom.js';
import { updateStatus } from '../../utils/status.js';

/**
 * Open the settings panel with overlay
 */
export function openSettings() {
  if (dom.settingsPanel) {
    updateSettingsContext();
    dom.settingsPanel.removeAttribute('inert');
    dom.settingsPanel.removeAttribute('aria-hidden');
    dom.settingsPanel.classList.add('open');
    if (dom.settingsOverlay) {
      dom.settingsOverlay.classList.remove('hidden');
    }
  }
}

/**
 * Close the settings panel and overlay
 */
export function closeSettings() {
  if (dom.settingsPanel) {
    dom.settingsPanel.classList.remove('open');
    dom.settingsPanel.setAttribute('inert', '');
    dom.settingsPanel.setAttribute('aria-hidden', 'true');
    if (dom.settingsOverlay) {
      dom.settingsOverlay.classList.add('hidden');
    }
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
 * Update settings panel labels based on context (welcome vs in-game)
 * Called when settings panel opens and when game loads/unloads
 */
export function updateSettingsContext() {
  const isWelcome = isOnWelcomeScreen();

  // Update current game display
  const currentGameDisplay = document.getElementById('currentGameDisplay');
  if (currentGameDisplay) {
    currentGameDisplay.style.display = isWelcome ? 'none' : 'flex';
    if (!isWelcome) {
      const gameNameSpan = document.getElementById('currentGameName');
      if (gameNameSpan) {
        gameNameSpan.textContent = getGameDisplayName(state.currentGameName);
      }
    }
  }

  // Show/hide game-specific items (exclude currentGameDisplay, it's handled separately)
  const gameItems = document.querySelectorAll('.game-section-item:not(#currentGameDisplay)');
  gameItems.forEach(item => {
    if (isWelcome) {
      item.style.display = 'none';
    } else {
      // Show the item by setting explicit display value (override CSS display: none)
      item.style.display = 'block';
    }
  });

  // Show/hide welcome-specific items
  const welcomeItems = document.querySelectorAll('.welcome-section-item');
  welcomeItems.forEach(item => {
    if (isWelcome) {
      item.style.display = 'block'; // Explicitly show (overrides CSS display: none)
    } else {
      item.style.display = 'none';
    }
  });

  // No need to reload settings - they're global now!
}

/**
 * Update current game name display in settings
 * @param {string} gameName - Name of the current game (filename with or without extension)
 */
export function updateCurrentGameDisplay(gameName) {
  const currentGameNameEl = document.getElementById('currentGameName');
  if (currentGameNameEl) {
    currentGameNameEl.textContent = getGameDisplayName(gameName);
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
 * Show backup saves dialog
 */
function showBackupSavesDialog() {
  if (!state.currentGameName) {
    updateStatus('No game loaded');
    return;
  }

  // Get all backup saves from localStorage
  const backups = [];
  const gameId = state.currentGameName.replace(/\.[^.]+$/, '').toLowerCase();

  // Scan localStorage for backup keys (exclude exempt backups)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('iftalk_backup_') && key.includes(`_${gameId}_`) && !key.endsWith('_exempt')) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          const data = JSON.parse(value);
          const match = key.match(/iftalk_backup_(autosave|quicksave)_[^_]+_(\d+)/);
          if (match) {
            backups.push({
              key,
              type: match[1],
              timestamp: parseInt(match[2]),
              data
            });
          }
        } catch (e) {
          // Skip invalid backups
        }
      }
    }
  }

  // Sort by timestamp (newest first)
  backups.sort((a, b) => b.timestamp - a.timestamp);

  // Create modal
  const overlay = document.createElement('div');
  overlay.className = 'backup-saves-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

  const dialog = document.createElement('div');
  dialog.className = 'backup-saves-dialog';
  dialog.style.cssText = 'background:var(--bg-elevated,#2a2a2a);color:var(--text-primary,#e0e0e0);padding:0;border-radius:12px;max-width:600px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

  let backupListHTML = '';
  if (backups.length === 0) {
    backupListHTML = '<p style="padding:20px;text-align:center;color:var(--text-secondary,#999);">No backup saves found for this game.</p>';
  } else {
    backups.forEach(backup => {
      const date = new Date(backup.timestamp);
      const formattedDate = date.toLocaleString();
      const saveType = backup.type === 'autosave' ? 'Autosave' :
                       backup.type === 'quicksave' ? 'Quicksave' :
                       'Save';

      backupListHTML += `
        <div class="backup-item">
          <div class="backup-info">
            <div style="font-weight:600;">${saveType} Backup</div>
            <div style="font-size:13px;color:var(--text-secondary,#999);">${formattedDate}</div>
          </div>
          <button class="restore-backup-btn" data-backup-key="${backup.key}" style="padding:8px 16px;background:var(--accent-primary,#4CAF50);color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
            Restore
          </button>
        </div>
      `;
    });
  }

  dialog.innerHTML = `
    <div class="backup-dialog-header" style="padding:20px;border-bottom:1px solid var(--border-subtle,#3a3a3a);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:18px;font-weight:600;">
          <span class="material-icons" style="vertical-align:middle;margin-right:8px;color:var(--accent-primary,#4CAF50);">history</span>
          Backup Saves
        </h3>
        <button class="close-backup-dialog-btn" style="background:none;border:none;color:var(--text-secondary,#999);font-size:24px;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:4px;">✕</button>
      </div>
      <p style="margin:0;font-size:13px;padding:10px 12px;background:var(--bg-subtle,rgba(255,255,255,0.05));border-radius:6px;border-left:3px solid var(--accent-primary,#4CAF50);">
        <strong>Note:</strong> Restoring a backup will create a new backup of your current state first.
      </p>
    </div>
    <div class="backup-dialog-body" style="flex:1;overflow:auto;padding:16px;">
      ${backupListHTML}
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close button
  const closeDialog = () => {
    document.body.removeChild(overlay);
  };

  dialog.querySelector('.close-backup-dialog-btn').onclick = closeDialog;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeDialog();
  };

  // Restore backup buttons
  dialog.querySelectorAll('.restore-backup-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const backupKey = btn.getAttribute('data-backup-key');
      await restoreBackup(backupKey);
      closeDialog();
    });
  });
}

/**
 * Restore a backup save
 * @param {string} backupKey - localStorage key of the backup
 */
async function restoreBackup(backupKey) {
  try {
    // Get the backup data
    const backupData = localStorage.getItem(backupKey);
    if (!backupData) {
      updateStatus('Backup not found');
      return;
    }

    // Determine save type (autosave or quicksave)
    const saveType = backupKey.includes('_autosave_') ? 'autosave' : 'quicksave';
    const gameId = state.currentGameName.replace(/\.[^.]+$/, '').toLowerCase();

    // Check if there's a current save to backup
    const currentSaveKey = `iftalk_${saveType}_${gameId}`;
    const currentSave = localStorage.getItem(currentSaveKey);

    // Create a backup of current state FIRST (extra backup, exempt from limit)
    // Only if there's actually a current save to backup
    if (currentSave) {
      const { createBackup } = await import('../../game/save-manager.js');
      await createBackup(saveType, true); // true = exempt from limit
    }

    // Restore the backup by setting it as the current save
    const saveKey = `iftalk_${saveType}_${gameId}`;
    localStorage.setItem(saveKey, backupData);

    // Reload the page to restore from the backup
    // (This is the same approach used by quickRestore button)
    updateStatus(`Restoring ${saveType} from backup...`);
    window.location.reload();

  } catch (err) {
    updateStatus(`Error restoring backup: ${err.message}`);
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

  // Home button (return to game selection)
  const selectGameBtn = document.getElementById('selectGameBtn');
  if (selectGameBtn) {
    selectGameBtn.addEventListener('click', async () => {
      // Import and call unload function
      const { unloadGame } = await import('../../game/game-loader.js');
      unloadGame();
      // Close settings panel
      closeSettings();
    });
  }
}
