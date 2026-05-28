/**
 * Quick Actions Menu - Vertical dropdown menu for all screen sizes
 *
 * Menu button shows a vertical dropdown with quick actions:
 * - Settings
 * - Map
 * - Quick Save
 * - Quick Restore
 */

// Local storage keys for quick access preferences
const QA_PREFS_KEY = 'iftalk_quick_access_prefs';

// DOM refs populated during initMobileMenu
let menuEl = null;
let menuBtnEl = null;
let charMenuBtnEl = null;

// Default preferences (all enabled except Settings and Feedback which are always shown)
const DEFAULT_QA_PREFS = {
  map: true,
  save: true,
  load: true,
  managesaves: true,
  feedback: true
};

/**
 * Initialize the mobile menu
 */
export function initMobileMenu() {
  menuEl = document.getElementById('mobileMenu');
  menuBtnEl = document.getElementById('mobileMenuBtn');
  charMenuBtnEl = document.getElementById('charMenuBtn');

  if (!menuEl) return;

  // Initialize quick access toggles
  initQuickAccessToggles();

  // Toggle menu on button click (main menu button)
  if (menuBtnEl) {
    menuBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }

  // Toggle menu on char panel menu button click
  if (charMenuBtnEl) {
    charMenuBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }

  // Handle menu item clicks
  const menuItems = document.querySelectorAll('.mobile-menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      handleMenuAction(action);
      closeMenu();
    });
  });

  // Close menu when tapping outside
  document.addEventListener('click', (e) => {
    if (!menuEl.classList.contains('hidden') &&
        !menuEl.contains(e.target) &&
        e.target !== menuBtnEl &&
        e.target !== charMenuBtnEl) {
      closeMenu();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Only handle keyboard when menu is open
    if (menuEl.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      // Focus the appropriate menu button (whichever one is visible/available)
      if (charMenuBtnEl && !charMenuBtnEl.classList.contains('hidden')) {
        charMenuBtnEl.focus();
      } else if (menuBtnEl) {
        menuBtnEl.focus();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();

      // Get all visible menu items
      const visibleItems = Array.from(menuItems).filter(item =>
        item.style.display !== 'none' &&
        !item.hasAttribute('hidden')
      );

      if (visibleItems.length === 0) return;

      const currentIndex = visibleItems.indexOf(document.activeElement);
      let nextIndex;

      if (e.key === 'ArrowDown') {
        // Move down (toward bottom)
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % visibleItems.length;
      } else {
        // Move up (toward top/Settings)
        nextIndex = currentIndex === -1 ? visibleItems.length - 1 : (currentIndex - 1 + visibleItems.length) % visibleItems.length;
      }

      visibleItems[nextIndex].focus();
    } else if (e.key === 'Tab') {
      // Allow normal tab navigation within menu
      const visibleItems = Array.from(menuItems).filter(item =>
        item.style.display !== 'none' &&
        !item.hasAttribute('hidden')
      );

      if (visibleItems.length === 0) return;

      const currentIndex = visibleItems.indexOf(document.activeElement);
      const isLastItem = currentIndex === visibleItems.length - 1;
      const isFirstItem = currentIndex === 0;

      // Close menu if tabbing out
      if ((e.shiftKey && isFirstItem) || (!e.shiftKey && isLastItem)) {
        closeMenu();
      }
    }
  });

  // Update menu visibility based on game state
  updateMobileMenuForGameState(!!window._inGame);
}

/**
 * Toggle menu open/closed
 */
function toggleMenu() {
  if (menuEl) {
    const isOpen = menuEl.classList.toggle('hidden');
    menuBtnEl?.setAttribute('aria-expanded', !isOpen);
    charMenuBtnEl?.setAttribute('aria-expanded', !isOpen);
  }
}

/**
 * Close menu
 */
function closeMenu() {
  if (menuEl) {
    menuEl.classList.add('hidden');
    menuBtnEl?.setAttribute('aria-expanded', 'false');
    charMenuBtnEl?.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Handle menu action
 * @param {string} action - Action type
 */
async function handleMenuAction(action) {
  switch(action) {
    case 'settings':
      // Toggle settings panel
      const { toggleSettings } = await import('./settings/settings-panel.js');
      toggleSettings();
      break;

    case 'map':
      // Open map
      const mapBtn = document.getElementById('mapBtn');
      if (mapBtn) {
        mapBtn.click();
      }
      break;

    case 'quicksave':
      // Trigger quick save
      const saveBtn = document.getElementById('quickSaveBtn');
      if (saveBtn) {
        saveBtn.click();
      }
      break;

    case 'quickload':
      // Trigger quick restore
      const loadBtn = document.getElementById('quickRestoreBtn');
      if (loadBtn) {
        loadBtn.click();
      }
      break;

    case 'managesaves':
      const { openManageSavesModal } = await import('./manage-saves-modal.js');
      openManageSavesModal();
      break;

    case 'feedback':
      const { openFeedbackModal } = await import('./feedback-modal.js');
      openFeedbackModal();
      break;

    case 'home':
      localStorage.removeItem('iftalk_last_game');
      location.reload();
      break;

    default:
      console.warn('Unknown menu action:', action);
  }
}

/**
 * Update mobile menu icon visibility based on game state and user preferences
 * @param {boolean} inGame - Whether a game is currently loaded
 */
export function updateMobileMenuForGameState(inGame) {
  const prefs = getQuickAccessPrefs();

  // Settings is always shown (no toggle)
  const settingsIcon = document.getElementById('mobileSettingsIcon');
  if (settingsIcon) settingsIcon.style.display = 'flex';

  // Home item — always shown when in-game, never toggleable
  const homeIcon = document.getElementById('mobileHomeIcon');
  const homeSeparator = document.getElementById('mobileHomeSeparator');
  if (homeIcon) homeIcon.style.display = inGame ? 'flex' : 'none';
  if (homeSeparator) homeSeparator.style.display = inGame ? 'block' : 'none';

  // Toggle-controlled menu items
  const menuItems = [
    { id: 'mobileMapIcon', pref: 'map', gameOnly: true },
    { id: 'mobileSaveIcon', pref: 'save', gameOnly: true },
    { id: 'mobileLoadIcon', pref: 'load', gameOnly: true },
    { id: 'mobileManageSavesIcon', pref: 'managesaves', gameOnly: true },
    { id: 'mobileFeedbackIcon', pref: 'feedback', gameOnly: false }
  ];

  menuItems.forEach(({ id, pref, gameOnly }) => {
    const icon = document.getElementById(id);
    if (icon) {
      // pref === null means no toggle — just respect gameOnly
      const prefOk = pref === null ? true : prefs[pref];
      const shouldShow = (!gameOnly || inGame) && prefOk;
      icon.style.display = shouldShow ? 'flex' : 'none';
    }
  });
}

/**
 * Initialize quick access toggles in settings
 */
function initQuickAccessToggles() {
  const prefs = getQuickAccessPrefs();

  // Set initial toggle states (Settings and Feedback have no toggle - always shown)
  const toggles = {
    qaMapToggle: 'map',
    qaSaveToggle: 'save',
    qaLoadToggle: 'load',
    qaManageSavesToggle: 'managesaves',
    qaFeedbackToggle: 'feedback'
  };

  Object.entries(toggles).forEach(([toggleId, prefKey]) => {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.checked = prefs[prefKey];

      // Listen for changes
      toggle.addEventListener('change', () => {
        prefs[prefKey] = toggle.checked;
        saveQuickAccessPrefs(prefs);
        updateMobileMenuForGameState(!!window._inGame);
      });
    }
  });

  // Wire settings-panel quick menu buttons to their actions
  document.getElementById('manageSavesMenuBtn')?.addEventListener('click', async () => {
    const { openManageSavesModal } = await import('./manage-saves-modal.js');
    openManageSavesModal();
  });
  document.getElementById('feedbackMenuBtn')?.addEventListener('click', async () => {
    const { openFeedbackModal } = await import('./feedback-modal.js');
    openFeedbackModal();
  });

  // Update menu visibility based on initial prefs
  updateMobileMenuForGameState(!!window._inGame);
}

/**
 * Get quick access preferences from localStorage
 * @returns {Object} Quick access preferences
 */
function getQuickAccessPrefs() {
  const stored = localStorage.getItem(QA_PREFS_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_QA_PREFS, ...JSON.parse(stored) };
    } catch (e) {
      console.error('Failed to parse quick access preferences:', e);
      return { ...DEFAULT_QA_PREFS };
    }
  }
  return { ...DEFAULT_QA_PREFS };
}

/**
 * Save quick access preferences to localStorage
 * @param {Object} prefs - Quick access preferences
 */
function saveQuickAccessPrefs(prefs) {
  try {
    localStorage.setItem(QA_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save quick access preferences:', e);
  }
}

