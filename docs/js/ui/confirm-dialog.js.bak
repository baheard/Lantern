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

// Current promise resolver
let currentResolve = null;

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

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Show confirm dialog
 * @param {string} message - Message to display
 * @param {Object} options - Optional configuration
 * @param {string} options.title - Dialog title (default: 'Confirm')
 * @param {string} options.okText - OK button text (default: 'OK')
 * @param {string} options.cancelText - Cancel button text (default: 'Cancel')
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export function confirmDialog(message, options = {}) {
  if (!overlay || !titleEl || !messageEl) {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise((resolve) => {
    // Store resolver
    currentResolve = resolve;

    // Set title
    const title = options.title || 'Confirm';
    titleEl.textContent = title;

    // Set message
    messageEl.textContent = message;

    // Set button text
    if (options.okText && okBtn) {
      okBtn.textContent = options.okText;
    } else if (okBtn) {
      okBtn.textContent = 'OK';
    }

    if (options.cancelText && cancelBtn) {
      cancelBtn.textContent = options.cancelText;
    } else if (cancelBtn) {
      cancelBtn.textContent = 'Cancel';
    }

    // Show overlay
    overlay.classList.remove('hidden');

    // Focus OK button for keyboard accessibility
    setTimeout(() => okBtn?.focus(), 100);
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
 * @param {boolean} result - Dialog result
 */
function closeDialog(result) {
  if (!overlay) return;

  // Hide overlay
  overlay.classList.add('hidden');

  // Resolve promise
  if (currentResolve) {
    currentResolve(result);
    currentResolve = null;
  }
}
