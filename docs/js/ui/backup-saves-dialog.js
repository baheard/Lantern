/**
 * Backup Saves Dialog
 *
 * Shows a modal listing backup saves for the current game and lets the user
 * restore any of them.
 */

import { state } from '../core/state.js';
import { updateStatus } from '../utils/status.js';

/**
 * Restore a backup save
 * @param {string} backupKey - localStorage key of the backup
 */
async function restoreBackup(backupKey) {
  try {
    const backupData = localStorage.getItem(backupKey);
    if (!backupData) {
      updateStatus('Backup not found');
      return;
    }

    const saveType = backupKey.includes('_autosave_') ? 'autosave' : 'quicksave';
    const gameId = state.currentGameName.replace(/\.[^.]+$/, '').toLowerCase();

    const currentSaveKey = `lantern_${saveType}_${gameId}`;
    const currentSave = localStorage.getItem(currentSaveKey);

    // Create a backup of current state first (exempt from the rotation limit)
    if (currentSave) {
      const { createBackup } = await import('../game/save-manager.js');
      await createBackup(saveType, true);
    }

    // Restore the backup by writing it as the active save
    localStorage.setItem(`lantern_${saveType}_${gameId}`, backupData);

    // Also write to autosave slot so it's picked up by autoLoad() on reload
    // (quicksave backups would otherwise only restore the quicksave slot, not load into game)
    localStorage.setItem(`lantern_autosave_${gameId}`, backupData);

    updateStatus(`Restoring ${saveType} from backup...`);
    window.location.reload();

  } catch (err) {
    updateStatus(`Error restoring backup: ${err.message}`);
  }
}

/**
 * Show the backup saves modal for the current game
 */
export function showBackupSavesDialog() {
  if (!state.currentGameName) {
    updateStatus('No game loaded');
    return;
  }

  const gameId = state.currentGameName.replace(/\.[^.]+$/, '').toLowerCase();

  // Collect backup entries from localStorage
  const backups = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lantern_backup_') && key.includes(`_${gameId}_`) && !key.endsWith('_exempt')) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          const data = JSON.parse(value);
          const match = key.match(/lantern_backup_(autosave|quicksave)_[^_]+_(\d+)/);
          if (match) {
            backups.push({ key, type: match[1], timestamp: parseInt(match[2]), data });
          }
        } catch (e) {
          // Skip corrupt entries
        }
      }
    }
  }

  backups.sort((a, b) => b.timestamp - a.timestamp);

  // Build backup list HTML
  let backupListHTML = '';
  if (backups.length === 0) {
    backupListHTML = '<p style="padding:20px;text-align:center;color:var(--text-secondary,#999);">No backup saves found for this game.</p>';
  } else {
    backups.forEach(backup => {
      const formattedDate = new Date(backup.timestamp).toLocaleString();
      const saveType = backup.type === 'autosave' ? 'Autosave' :
                       backup.type === 'quicksave' ? 'Quicksave' : 'Save';
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

  // Build modal
  const overlay = document.createElement('div');
  overlay.className = 'backup-saves-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

  const dialog = document.createElement('div');
  dialog.className = 'backup-saves-dialog';
  dialog.style.cssText = 'background:var(--bg-elevated,#2a2a2a);color:var(--text-primary,#e0e0e0);padding:0;border-radius:12px;max-width:600px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

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

  const closeDialog = () => document.body.removeChild(overlay);

  dialog.querySelector('.close-backup-dialog-btn').onclick = closeDialog;
  overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };

  dialog.querySelectorAll('.restore-backup-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const backupKey = btn.getAttribute('data-backup-key');
      await restoreBackup(backupKey);
      closeDialog();
    });
  });
}
