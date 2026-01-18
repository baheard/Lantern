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
async function openFolderPicker() {
  try {
    const { getAccessToken } = await import('../../utils/gdrive/gdrive-auth.js');
    const accessToken = getAccessToken();

    if (!accessToken) {
      updateStatus('Please sign in to Google Drive first', 'error');
      return;
    }

    // Get current folder name
    const currentFolderName = localStorage.getItem('iftalk_gdrive_folder_name') || 'IFTalk';

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'folder-picker-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

    const dialog = document.createElement('div');
    dialog.className = 'folder-picker-dialog';
    dialog.style.cssText = 'background:var(--bg-elevated,#2a2a2a);color:var(--text-primary,#e0e0e0);padding:0;border-radius:12px;max-width:500px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

    dialog.innerHTML = `
      <div class="folder-picker-header" style="padding:20px;border-bottom:1px solid var(--border-subtle,#3a3a3a);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="margin:0;font-size:18px;font-weight:600;">
            <span class="material-icons" style="vertical-align:middle;margin-right:8px;color:var(--accent-primary,#4CAF50);">folder_open</span>
            Choose Folder
          </h3>
          <button class="close-folder-picker-btn" style="background:none;border:none;color:var(--text-secondary,#999);font-size:24px;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:4px;">✕</button>
        </div>
        <p style="margin:0;font-size:13px;color:var(--text-secondary,#999);">
          Enter the folder path where you want to save your games. Use / for subfolders (e.g., "MyGames/IF" or just "IFTalk").
        </p>
      </div>
      <div class="folder-picker-body" style="padding:20px;">
        <label style="display:block;margin-bottom:8px;font-size:14px;font-weight:500;">Folder Path</label>
        <input
          type="text"
          id="folderPathInput"
          value="${currentFolderName}"
          placeholder="IFTalk"
          style="width:100%;padding:10px 12px;background:var(--bg-subtle,#1a1a1a);border:1px solid var(--border-subtle,#3a3a3a);border-radius:6px;color:var(--text-primary,#e0e0e0);font-size:14px;font-family:inherit;"
        />
        <p style="margin:12px 0 0 0;font-size:12px;color:var(--text-secondary,#999);">
          Examples: <code style="background:var(--bg-subtle,#1a1a1a);padding:2px 6px;border-radius:3px;">IFTalk</code>,
          <code style="background:var(--bg-subtle,#1a1a1a);padding:2px 6px;border-radius:3px;">Games/Interactive Fiction</code>
        </p>
      </div>
      <div class="folder-picker-footer" style="padding:20px;border-top:1px solid var(--border-subtle,#3a3a3a);display:flex;gap:12px;justify-content:flex-end;">
        <button class="cancel-folder-btn" style="padding:8px 16px;background:transparent;color:var(--text-secondary,#999);border:1px solid var(--border-subtle,#3a3a3a);border-radius:6px;cursor:pointer;font-size:14px;">Cancel</button>
        <button class="save-folder-btn" style="padding:8px 16px;background:var(--accent-primary,#4CAF50);color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const input = dialog.querySelector('#folderPathInput');
    const saveBtn = dialog.querySelector('.save-folder-btn');
    const cancelBtn = dialog.querySelector('.cancel-folder-btn');
    const closeBtn = dialog.querySelector('.close-folder-picker-btn');

    // Auto-focus and select text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);

    // Close dialog
    const closeDialog = () => {
      document.body.removeChild(overlay);
    };

    closeBtn.onclick = closeDialog;
    cancelBtn.onclick = closeDialog;
    overlay.onclick = (e) => {
      if (e.target === overlay) closeDialog();
    };

    // Save folder path
    const saveFolderPath = async () => {
      let folderPath = input.value.trim();
      if (!folderPath) {
        folderPath = 'IFTalk'; // Default
      }

      // Clean up the path (remove leading/trailing slashes)
      folderPath = folderPath.replace(/^\/+|\/+$/g, '');

      // Save folder name (we'll use this as the folder name in Drive)
      // Note: We're storing null for folderId since we don't have an actual ID
      // The API will create/find the folder by path
      localStorage.setItem('iftalk_gdrive_folder_name', folderPath);
      localStorage.setItem('iftalk_gdrive_folder_id', 'path:' + folderPath); // Special marker

      // Clear cached folder ID so next sync uses new folder
      const { clearAppFolderId } = await import('../../utils/gdrive/gdrive-api.js');
      clearAppFolderId();

      // Update UI immediately
      updateGDriveUI();

      updateStatus(`Folder set to: ${folderPath}`, 'success');
      closeDialog();
    };

    saveBtn.onclick = saveFolderPath;

    // Enter key to save
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveFolderPath();
      }
    });

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
