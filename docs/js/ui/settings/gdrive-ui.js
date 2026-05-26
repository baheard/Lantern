/**
 * Google Drive UI Module
 *
 * Handles Google Drive sign in/out, sync buttons, and UI state updates.
 */

import { state } from '../../core/state.js';
import { updateStatus } from '../../utils/status.js';

const AUTO_SYNC_KEY = 'iftalk_gdrive_autosync';

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

    // Update connection status: email + folder (with clickable (change) link)
    if (connectionInfo) {
      const email = state.gdriveEmail || 'Unknown';
      const folderName = localStorage.getItem('iftalk_gdrive_folder_name') || 'IFTalk';
      connectionInfo.innerHTML = `${email}<br><span style="font-size: 13px; color: var(--text-secondary, #999);">Using folder "${folderName}" <a href="#" id="gdriveFolderLink" style="color: var(--accent-primary, #4CAF50); text-decoration: none;">(change)</a></span>`;
    }
  } else {
    signInArea?.classList.remove('hidden');
    accountArea?.classList.add('hidden');
  }
}

/**
 * Open folder path input dialog
 */
export async function openFolderPicker() {
  try {
    const { getAccessToken } = await import('../../utils/gdrive/gdrive-auth.js');
    const accessToken = getAccessToken();

    if (!accessToken) {
      updateStatus('Please sign in to Google Drive first', 'error');
      return;
    }

    const currentFolderName = localStorage.getItem('iftalk_gdrive_folder_name') || 'IFTalk';

    const { confirmDialog } = await import('../confirm-dialog.js');
    const result = await confirmDialog(
      'Enter the folder path where you want to save your games.\nUse / for subfolders (e.g., "MyGames/IF" or just "IFTalk").',
      {
        title: 'Choose Folder',
        okText: 'Save',
        inputValue: currentFolderName,
        inputLabel: 'Folder Path',
        inputPlaceholder: 'IFTalk',
        inputHint: 'Examples: IFTalk, Games/Interactive Fiction',
      }
    );

    if (!result && result !== '') return;

    let folderPath = (result || '').trim().replace(/^\/+|\/+$/g, '') || 'IFTalk';

    localStorage.setItem('iftalk_gdrive_folder_name', folderPath);
    localStorage.setItem('iftalk_gdrive_folder_id', 'path:' + folderPath);

    const { clearAppFolderId } = await import('../../utils/gdrive/gdrive-api.js');
    clearAppFolderId();

    updateGDriveUI();
    updateStatus(`Folder set to: ${folderPath}`, 'success');

  } catch (error) {
    updateStatus('Failed to open folder picker: ' + error.message, 'error');
  }
}

/**
 * Initialize Google Drive UI
 */
export function initGDriveUI() {

  // Folder link click handler (set up delegation on parent to handle dynamic link)
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'gdriveFolderLink') {
      e.preventDefault();
      openFolderPicker();
    }
  });

  async function runSyncAll() {
    try {
      const { showSyncModal } = await import('../sync-modal.js');
      await showSyncModal(null);
    } catch (error) {
      updateStatus('Sync failed: ' + error.message, 'error');
    }
  }

  // Sync button — auth if needed, then show sync modal
  const gdriveSyncBtn = document.getElementById('gdriveSyncBtn');
  if (gdriveSyncBtn) {
    gdriveSyncBtn.addEventListener('click', runSyncAll);
  }

  // Sync All Saves button (signed-in state)
  const gdriveSyncAllBtn = document.getElementById('gdriveSyncAllBtn');
  if (gdriveSyncAllBtn) {
    gdriveSyncAllBtn.addEventListener('click', runSyncAll);
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

  // Listen for sign-in/sign-out events to update UI
  window.addEventListener('gdriveSignInChanged', () => {
    updateGDriveUI();
  });

  // Listen for auto-sync completion to update last sync time
  window.addEventListener('gdriveSyncComplete', () => {
    updateGDriveUI();
  });

  // Auto-sync toggle
  const autoSyncToggle = document.getElementById('gdriveAutoSyncToggle');
  if (autoSyncToggle) {
    // Restore persisted setting
    state.gdriveSyncEnabled = localStorage.getItem(AUTO_SYNC_KEY) === 'true';
    autoSyncToggle.checked = state.gdriveSyncEnabled;

    autoSyncToggle.addEventListener('change', () => {
      state.gdriveSyncEnabled = autoSyncToggle.checked;
      localStorage.setItem(AUTO_SYNC_KEY, state.gdriveSyncEnabled);
    });
  }

  // Listen for auto-sync errors and surface them in Drive UI
  window.addEventListener('gdriveAutoSyncError', () => {
    updateGDriveUI();
  });

  // Initialize UI on load
  updateGDriveUI();
}
