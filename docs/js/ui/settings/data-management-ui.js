/**
 * Data Management UI Module
 *
 * Handles delete game data and clear all data buttons.
 */

import { state } from '../../core/state.js';
import { dom } from '../../core/dom.js';
import { updateStatus } from '../../utils/status.js';
import { clearAllGameData, clearAllAppData } from '../../utils/game-settings.js';
import { confirmDialog } from '../confirm-dialog.js';
import { closeSettings, isOnWelcomeScreen, getGameDisplayName } from './settings-panel.js';

/**
 * Initialize data management UI
 */
export function initDataManagementUI() {
  // Clear Data button - behavior depends on context
  const clearAllDataBtn = document.getElementById('clearAllDataBtn');
  if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', async () => {
      const onWelcome = isOnWelcomeScreen();
      const gameName = state.currentGameName;

      // Different confirmation based on context
      let confirmed;
      if (onWelcome) {
        // Welcome screen: clear ALL app data
        confirmed = await confirmDialog(
          'This will permanently delete ALL data for ALL games.\n\n' +
          'This includes:\n' +
          '• All saves and autosaves\n' +
          '• All game progress\n' +
          '• All settings (voices, speed)\n' +
          '• App defaults\n\n' +
          'This action cannot be undone!',
          { title: 'Delete All Data?' }
        );
      } else {
        // In-game: clear only this game's data
        const displayName = getGameDisplayName(gameName);
        confirmed = await confirmDialog(
          'This includes:\n' +
          '• Saves and autosave\n' +
          '• Game progress\n' +
          '• Voice/speed settings for this game\n\n' +
          'App defaults and other games will NOT be affected.',
          { title: `Delete "${displayName}"?` }
        );
      }

      if (confirmed) {
        try {
          if (onWelcome) {
            // Clear everything (localStorage + Google Drive)
            const count = clearAllAppData();

            // Also delete from Drive if signed in
            if (state.gdriveSignedIn) {
              try {
                const { deleteAllDataFromDrive } = await import('../../utils/gdrive/index.js');
                await deleteAllDataFromDrive();
                updateStatus(`✓ Cleared all app data (local + Drive)`);
              } catch (driveError) {
                updateStatus(`✓ Cleared local data (Drive deletion failed)`);
              }
            } else {
              updateStatus(`✓ Cleared all app data`);
            }

            alert('Successfully deleted all app data.\n\nAll saves, progress, and settings have been cleared.');
          } else {
            // Clear only current game (localStorage + Google Drive)
            clearAllGameData(gameName);

            // Also delete from Drive if signed in
            if (state.gdriveSignedIn) {
              try {
                const { deleteGameDataFromDrive } = await import('../../utils/gdrive/index.js');
                const deleteCount = await deleteGameDataFromDrive(gameName);
                updateStatus(`✓ Cleared data for ${gameName} (${deleteCount} files from Drive)`);
              } catch (driveError) {
                updateStatus(`✓ Cleared local data for ${gameName} (Drive deletion failed)`);
              }
            } else {
              updateStatus(`✓ Cleared data for ${gameName}`);
            }

            alert(`Successfully deleted data for "${gameName}".\n\nThis game will use app defaults on next load.`);
          }

          // Close settings panel
          closeSettings();

        } catch (error) {
          updateStatus('Error clearing data');
          alert('Failed to clear data: ' + error.message);
        }
      } else {
        updateStatus('Clear data cancelled');
      }
    });
  }

  // Standalone "Delete All App Data" button (welcome screen only)
  const deleteAllAppDataBtn = document.getElementById('deleteAllAppDataBtn');
  if (deleteAllAppDataBtn) {
    deleteAllAppDataBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog(
        'This will permanently delete ALL data for ALL games.\n\n' +
        'This includes:\n' +
        '• All saves and autosaves\n' +
        '• All game progress\n' +
        '• All settings (voices, speed)\n' +
        '• App defaults\n\n' +
        'This action cannot be undone!',
        { title: 'Delete All Data?' }
      );

      if (confirmed) {
        try {
          clearAllAppData();

          // Also delete from Drive if signed in
          if (state.gdriveSignedIn) {
            try {
              const { deleteAllDataFromDrive } = await import('../../utils/gdrive/index.js');
              await deleteAllDataFromDrive();
              updateStatus('✓ Cleared all app data (local + Drive)');
            } catch (driveError) {
              updateStatus('✓ Cleared local data (Drive deletion failed)');
            }
          } else {
            updateStatus('✓ Cleared all app data');
          }

          alert('Successfully deleted all app data.\n\nAll saves, progress, and settings have been cleared.');

          // Close settings panel
          closeSettings();
        } catch (error) {
          updateStatus('Error clearing data');
          alert('Failed to clear data: ' + error.message);
        }
      } else {
        updateStatus('Clear data cancelled');
      }
    });
  }
}
