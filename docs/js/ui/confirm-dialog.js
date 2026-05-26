/**
 * Confirm Dialog Module
 *
 * Provides a custom confirm dialog that replaces browser confirm() dialogs.
 * Features:
 * - Non-blocking (returns Promise instead of blocking execution)
 * - Consistent styling with app theme
 * - Better mobile UX
 * - Supports custom icons and messages
 * - Keyboard accessible (Escape to cancel, Enter to confirm)
 */

// DOM elements
let overlay = null;
let dialog = null;
let titleEl = null;
let messageEl = null;
let okBtn = null;
let cancelBtn = null;
let inputRow = null;
let inputLabel = null;
let inputField = null;
let inputHint = null;

// Current promise resolver
let currentResolve = null;
let hasInput = false;

/**
 * Initialize confirm dialog module
 */
export function initConfirmDialog() {
  // Query DOM elements
  overlay = document.getElementById('confirmDialogOverlay');
  dialog = overlay?.querySelector('.confirm-dialog');
  titleEl = document.getElementById('confirmDialogTitle');
  messageEl = document.getElementById('confirmDialogMessage');
  okBtn = document.getElementById('confirmOkBtn');
  cancelBtn = document.getElementById('confirmCancelBtn');
  inputRow = document.getElementById('confirmDialogInputRow');
  inputLabel = document.getElementById('confirmDialogInputLabel');
  inputField = document.getElementById('confirmDialogInput');
  inputHint = document.getElementById('confirmDialogInputHint');

  if (!overlay || !dialog || !titleEl || !messageEl || !okBtn || !cancelBtn) {
    return;
  }

  // Set up event listeners
  okBtn.addEventListener('click', handleOk);
  cancelBtn.addEventListener('click', handleCancel);

  // Close on overlay click (background)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      handleCancel();
    }
  });

  // Enter in input field submits
  inputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOk();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Show confirm dialog.
 * @param {string} message - Message to display
 * @param {Object} options - Optional configuration
 * @param {string} options.title - Dialog title (default: 'Confirm')
 * @param {string} options.okText - OK button text (default: 'OK')
 * @param {string} options.cancelText - Cancel button text (default: 'Cancel')
 * @param {boolean} options.okOnly - If true, hide cancel button (default: false)
 * @param {string} options.inputValue - Pre-filled value; presence enables input mode
 * @param {string} options.inputPlaceholder - Placeholder for the input field
 * @param {string} options.inputLabel - Label shown above the input
 * @param {string} options.inputHint - Small hint text shown below the input
 * @returns {Promise<boolean|string>} In normal mode: true/false. In input mode: the input string or false if cancelled.
 */
export function confirmDialog(message, options = {}) {
  if (!overlay || !titleEl || !messageEl) {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise((resolve) => {
    currentResolve = resolve;
    hasInput = 'inputValue' in options;

    titleEl.textContent = options.title || 'Confirm';
    messageEl.textContent = message;

    if (okBtn) okBtn.textContent = options.okText || 'OK';
    if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Cancel';

    if (options.okOnly && cancelBtn) {
      cancelBtn.classList.add('hidden');
    } else if (cancelBtn) {
      cancelBtn.classList.remove('hidden');
    }

    // Input field
    if (hasInput && inputRow && inputField) {
      inputRow.classList.remove('hidden');
      if (inputLabel) inputLabel.textContent = options.inputLabel || '';
      inputField.value = options.inputValue ?? '';
      inputField.placeholder = options.inputPlaceholder || '';
      if (inputHint) inputHint.textContent = options.inputHint || '';
    } else if (inputRow) {
      inputRow.classList.add('hidden');
    }

    overlay.classList.remove('hidden');

    setTimeout(() => {
      if (hasInput && inputField) {
        inputField.focus();
        inputField.select();
      } else {
        okBtn?.focus();
      }
    }, 100);
  });
}

/**
 * Handle OK button click
 */
function handleOk() {
  closeDialog(true);
}

/**
 * Handle Cancel button click
 */
function handleCancel() {
  closeDialog(false);
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeydown(e) {
  // Only handle if dialog is visible
  if (!overlay || overlay.classList.contains('hidden')) {
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    handleCancel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    handleOk();
  }
}

/**
 * Close dialog and resolve promise
 * @param {boolean} confirmed - Whether the user confirmed
 */
function closeDialog(confirmed) {
  if (!overlay) return;

  overlay.classList.add('hidden');

  if (currentResolve) {
    if (!confirmed) {
      currentResolve(false);
    } else if (hasInput && inputField) {
      currentResolve(inputField.value);
    } else {
      currentResolve(true);
    }
    currentResolve = null;
  }
}
