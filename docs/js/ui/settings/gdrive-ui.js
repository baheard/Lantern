/**
 * Google Drive UI Module
 *
 * Handles Google Drive sign in/out, sync buttons, and UI state updates.
 */

import { state } from '../../core/state.js';
import { updateStatus } from '../../utils/status.js';

/**
 * Update Google Drive UI based on sign-in state
 */
function updateGDriveUI() {
  const signInArea = document.getElementById('gdriveSignInArea');
  const accountArea = document.getElementById('gdriveAccountArea');
  const connectionInfo = document.getElementById('gdriveConnectionInfo');

  if (state.gdriveSignedIn) {
    signInArea?.classList.add('hidden');
    accountArea?.classList.remove('hidden');

    // Update connection status: email + last sync time
    if (connectionInfo) {
      const email = state.gdriveEmail || 'Unknown';
      const lastSync = state.gdriveLastSyncTime
        ? new Date(state.gdriveLastSyncTime).toLocaleString()
        : 'Never';
      connectionInfo.textContent = `${email} • Last synced: ${lastSync}`;
    }
  } else {
    signInArea?.classList.remove('hidden');
    accountArea?.classList.add('hidden');
  }
}

/**
 * Initialize Google Drive UI
 */
export function initGDriveUI() {
  // Sync button (triggers sign-in when not signed in)
  const gdriveSyncBtn = document.getElementById('gdriveSyncBtn');
  if (gdriveSyncBtn) {
    gdriveSyncBtn.addEventListener('click', async () => {
      try {
        const { signIn } = await import('../../utils/gdrive/index.js');
        await signIn();
        updateGDriveUI();
        updateStatus('Connected to Google Drive', 'success');
      } catch (error) {
        updateStatus('Connection failed: ' + error.message, 'error');
      }
    });
  }

  // Disconnect button
  const gdriveDisconnectBtn = document.getElementById('gdriveDisconnectBtn');
  if (gdriveDisconnectBtn) {
    gdriveDisconnectBtn.addEventListener('click', async () => {
      try {
        const { signOut } = await import('../../utils/gdrive/index.js');
        await signOut();
        updateGDriveUI();
        updateStatus('Disconnected from Google Drive');
      } catch (error) {
        updateStatus('Disconnect failed: ' + error.message, 'error');
      }
    });
  }

  // Export to Drive button
  const gdriveExportBtn = document.getElementById('gdriveExportBtn');
  if (gdriveExportBtn) {
    gdriveExportBtn.addEventListener('click', async () => {
      try {
        // All saves now use state.currentGameName (filename-based) for consistency

        // Show preview modal
        const { showSyncPreview } = await import('../sync-preview-modal.js');
        const { compareSaves } = await import('../../utils/gdrive/gdrive-sync-preview.js');

        updateStatus('Loading saves...', 'processing');
        const items = await compareSaves(state.currentGameName, 'export');
        updateStatus('');

        if (items.length === 0) {
          const { confirmDialog } = await import('../../ui/confirm-dialog.js');
          await confirmDialog('No saves found to export for this game.', {
            title: 'No Saves to Export',
            okOnly: true
          });
          return;
        }

        showSyncPreview('export', items);
      } catch (error) {
        updateStatus('Failed to load saves: ' + error.message, 'error');
      }
    });
  }

  // Import from Drive button
  const gdriveImportBtn = document.getElementById('gdriveImportBtn');
  if (gdriveImportBtn) {
    gdriveImportBtn.addEventListener('click', async () => {
      try {
        // All saves now use state.currentGameName (filename-based) for consistency

        // Show preview modal
        const { showSyncPreview } = await import('../sync-preview-modal.js');
        const { compareSaves } = await import('../../utils/gdrive/gdrive-sync-preview.js');

        updateStatus('Loading saves...', 'processing');
        const items = await compareSaves(state.currentGameName, 'import');
        updateStatus('');

        if (items.length === 0) {
          const { confirmDialog } = await import('../../ui/confirm-dialog.js');
          await confirmDialog('No saves found on Google Drive for this game.', {
            title: 'No Saves to Import',
            okOnly: true
          });
          return;
        }

        showSyncPreview('import', items);
      } catch (error) {
        updateStatus('Failed to load saves: ' + error.message, 'error');
      }
    });
  }

  // Listen for sign-in/sign-out events to update UI
  window.addEventListener('gdriveSignInChanged', () => {
    updateGDriveUI();
  });

  // Listen for auto-sync completion to update last sync time
  window.addEventListener('gdriveSyncComplete', () => {
    updateGDriveUI();
  });

  // Initialize UI on load
  updateGDriveUI();
}
