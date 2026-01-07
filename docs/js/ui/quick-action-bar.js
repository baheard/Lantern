/**
 * Quick Action Bar - Desktop collapsible sidebar with quick actions
 *
 * Provides a collapsible sidebar for ≥800px screens with quick access to:
 * - Map
 * - Quick Save
 * - Quick Restore
 * - Lock Screen
 *
 * Note: On mobile (<800px), quick actions are accessed via the mobile menu instead.
 */

import { updateStatus } from '../utils/status.js';

/**
 * Initialize the quick action bar
 */
export function initQuickActionBar() {
  const bar = document.getElementById('quickActionBar');
  const toggle = document.getElementById('quickActionToggle');

  if (!bar) return;

  // Handle initial state based on saved preference
  const applyInitialState = () => {
    // Load collapsed state (default: NOT collapsed on first visit)
    const savedState = localStorage.getItem('iftalk_quickBarCollapsed');
    const isCollapsed = savedState === 'true'; // Default to expanded if never set

    if (isCollapsed) {
      bar.classList.add('collapsed');
      if (toggle) updateToggleIcon(toggle, true);
    } else {
      bar.classList.remove('collapsed');
      if (toggle) updateToggleIcon(toggle, false);
    }
  };

  // Apply initial state immediately
  applyInitialState();

  // Handle collapse/expand toggle button
  if (toggle) {

    // Toggle collapse/expand when toggle button is clicked
    toggle.addEventListener('click', () => {
      const collapsed = bar.classList.toggle('collapsed');
      updateToggleIcon(toggle, collapsed);
      localStorage.setItem('iftalk_quickBarCollapsed', collapsed);
    });

    // Handle window resize - maintain collapsed state across breakpoints
    window.addEventListener('resize', () => {
      // Keep current collapsed state when resizing
      // (User's preference persists across desktop/mobile)
    });
  }

  // Load visibility preferences
  loadQuickActionPreferences();

  // Attach action handlers
  document.querySelectorAll('.quick-action-icon').forEach(btn => {
    btn.addEventListener('click', () => handleQuickAction(btn.dataset.action, btn));
  });

  // Listen for settings changes
  initSettingsListeners();

  // Initialize visibility based on current game state
  // If no game is loaded, only show lock screen button
  updateQuickBarForGameState(!!window._inGame);
}

/**
 * Update toggle button icon based on collapsed state
 * @param {HTMLElement} toggle - Toggle button element
 * @param {boolean} collapsed - Whether bar is collapsed
 */
function updateToggleIcon(toggle, collapsed) {
  const icon = toggle.querySelector('.material-icons');
  if (icon) {
    icon.textContent = collapsed ? 'keyboard_arrow_left' : 'keyboard_arrow_right';
  }
}

/**
 * Load visibility preferences from localStorage
 */
function loadQuickActionPreferences() {
  const actions = [
    { id: 'map', elementId: 'qaMapIcon' },
    { id: 'quicksave', elementId: 'qaSaveIcon' },
    { id: 'quickload', elementId: 'qaLoadIcon' },
    { id: 'lock', elementId: 'qaLockIcon' }
  ];

  actions.forEach(action => {
    // Default: all visible
    const enabled = localStorage.getItem(`iftalk_qa_${action.id}`) !== 'false';
    const btn = document.getElementById(action.elementId);
    if (btn) {
      btn.classList.toggle('hidden', !enabled);
    }
  });
}

/**
 * Initialize listeners for settings panel toggles
 */
function initSettingsListeners() {
  const settingsMap = [
    { settingId: 'qaMapToggle', action: 'map', elementId: 'qaMapIcon' },
    { settingId: 'qaSaveToggle', action: 'quicksave', elementId: 'qaSaveIcon' },
    { settingId: 'qaLoadToggle', action: 'quickload', elementId: 'qaLoadIcon' },
    { settingId: 'qaLockToggle', action: 'lock', elementId: 'qaLockIcon' }
  ];

  settingsMap.forEach(({ settingId, action, elementId }) => {
    const toggle = document.getElementById(settingId);
    if (!toggle) return;

    // Load saved state (default: checked)
    const enabled = localStorage.getItem(`iftalk_qa_${action}`) !== 'false';
    toggle.checked = enabled;

    // Listen for changes
    toggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem(`iftalk_qa_${action}`, enabled);

      // Update quick bar icon visibility
      const icon = document.getElementById(elementId);
      if (icon) {
        icon.classList.toggle('hidden', !enabled);
      }

      updateStatus(enabled ? `✓ ${action} added to quick bar` : `✗ ${action} removed from quick bar`);

      // Re-check toggle visibility based on visible icon count
      updateQuickBarForGameState(!!window._inGame);
    });
  });
}

/**
 * Handle quick action button clicks
 * @param {string} action - Action type (map, quicksave, quickload, lock)
 * @param {HTMLElement} btn - Button element
 */
async function handleQuickAction(action, btn) {
  // Add pulse animation
  btn.classList.add('pulse');
  setTimeout(() => btn.classList.remove('pulse'), 400);

  switch(action) {
    case 'map':
      // Trigger map button click
      const mapBtn = document.getElementById('mapBtn');
      if (mapBtn) {
        mapBtn.click();
      }
      break;

    case 'quicksave':
      // Trigger quick save button click
      const saveBtn = document.getElementById('quickSaveBtn');
      if (saveBtn) {
        saveBtn.click();
      }
      break;

    case 'quickload':
      // Trigger quick restore button click
      const loadBtn = document.getElementById('quickRestoreBtn');
      if (loadBtn) {
        loadBtn.click();
      }
      break;

    case 'lock':
      // Trigger lock screen button click
      const lockBtn = document.getElementById('lockScreenBtn');
      if (lockBtn) {
        lockBtn.click();
      }
      break;

    default:
      console.warn('Unknown quick action:', action);
  }
}

/**
 * Update quick bar visibility based on game state
 * Called when game loads/unloads
 * @param {boolean} inGame - Whether a game is currently loaded
 */
export function updateQuickBarForGameState(inGame) {
  const bar = document.getElementById('quickActionBar');
  const toggle = document.getElementById('quickActionToggle');
  if (!bar) return;

  // Hide entire quick bar on welcome screen
  if (!inGame) {
    bar.style.display = 'none';
    return;
  } else {
    bar.style.display = 'flex';
  }

  // Show/hide game-specific actions
  const gameActions = ['qaMapIcon', 'qaSaveIcon', 'qaLoadIcon'];
  gameActions.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      // Check if it's enabled in settings AND we're in a game
      const action = btn.dataset.action;
      const enabled = localStorage.getItem(`iftalk_qa_${action}`) !== 'false';
      btn.classList.toggle('hidden', !enabled || !inGame);
    }
  });

  // Lock screen is always available (not game-specific)
  const lockBtn = document.getElementById('qaLockIcon');
  if (lockBtn) {
    const enabled = localStorage.getItem('iftalk_qa_lock') !== 'false';
    lockBtn.classList.toggle('hidden', !enabled);
  }

  // Count visible icons
  const allIcons = document.querySelectorAll('.quick-action-icon');
  const visibleIcons = Array.from(allIcons).filter(icon => !icon.classList.contains('hidden'));

  // Hide toggle if 0 or 1 icons visible
  if (toggle) {
    if (visibleIcons.length <= 1) {
      toggle.style.display = 'none';
      // If only 1 icon, ensure bar is not collapsed
      if (visibleIcons.length === 1) {
        bar.classList.remove('collapsed');
      }
    } else {
      toggle.style.display = 'flex';
    }
  }
}
