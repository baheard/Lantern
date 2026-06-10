/**
 * STT Substitutions UI Module
 *
 * Handles speech-to-text substitution dictionary UI (add/remove entries).
 */

import { dom } from '../../core/dom.js';
import { updateStatus } from '../../utils/status.js';
import { getSttSubstitutionsMap, addSttSubstitution, removeSttSubstitution, resetSttSubstitutions } from '../../utils/stt-substitutions.js';
import { confirmDialog } from '../confirm-dialog.js';

/**
 * Load STT substitutions dictionary into UI
 */
function loadSttSubstitutionsUI() {
  const list = dom.sttSubstitutionsList || document.getElementById('sttSubstitutionsList');
  if (!list) return;

  const map = getSttSubstitutionsMap();
  list.innerHTML = '';

  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  for (const [heard, command] of entries) {
    const item = document.createElement('div');
    item.className = 'pronunciation-item';

    const text = document.createElement('span');
    text.textContent = `${heard} → ${command}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => {
      removeSttSubstitution(heard);
      loadSttSubstitutionsUI();
      updateStatus(`Removed substitution: ${heard}`);
    });

    item.appendChild(text);
    item.appendChild(deleteBtn);
    list.appendChild(item);
  }
}

/**
 * Initialize STT substitutions UI
 */
export function initSttSubstitutionsUI() {
  // Load STT substitutions UI
  loadSttSubstitutionsUI();

  // Add substitution button
  if (dom.addSttSubstitutionBtn) {
    dom.addSttSubstitutionBtn.addEventListener('click', () => {
      const heardInput = document.getElementById('newSttHeard');
      const commandInput = document.getElementById('newSttCommand');

      if (heardInput && commandInput) {
        const heard = heardInput.value.trim();
        const command = commandInput.value.trim();

        if (heard && command) {
          addSttSubstitution(heard, command);
          heardInput.value = '';
          commandInput.value = '';
          loadSttSubstitutionsUI();
          updateStatus(`Added substitution: ${heard} → ${command}`);
        }
      }
    });
  }

  // Reset to defaults button
  if (dom.resetSttSubstitutionsBtn) {
    dom.resetSttSubstitutionsBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog(
        'This will remove any voice recognition substitutions you\'ve added or changed, and restore the default list.',
        { title: 'Reset to Defaults?' }
      );
      if (!confirmed) return;

      resetSttSubstitutions();
      loadSttSubstitutionsUI();
      updateStatus('Voice recognition substitutions reset to defaults');
    });
  }
}
