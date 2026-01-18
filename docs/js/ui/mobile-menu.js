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

// Default preferences (all enabled except Settings which is always shown)
const DEFAULT_QA_PREFS = {
  map: true,
  save: true,
  load: true
};

/**
 * Initialize the mobile menu
 */
export function initMobileMenu() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const charMenuBtn = document.getElementById('charMenuBtn');
  const menu = document.getElementById('mobileMenu');

  if (!menu) return;

  // Initialize quick access toggles
  initQuickAccessToggles();

  // Toggle menu on button click (main menu button)
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }

  // Toggle menu on char panel menu button click
  if (charMenuBtn) {
    charMenuBtn.addEventListener('click', (e) => {
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
    if (!menu.classList.contains('hidden') &&
        !menu.contains(e.target) &&
        e.target !== menuBtn &&
        e.target !== charMenuBtn) {
      closeMenu();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Only handle keyboard when menu is open
    if (menu.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      // Focus the appropriate menu button (whichever one is visible/available)
      if (charMenuBtn && !charMenuBtn.classList.contains('hidden')) {
        charMenuBtn.focus();
      } else if (menuBtn) {
        menuBtn.focus();
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
  const menu = document.getElementById('mobileMenu');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const charMenuBtn = document.getElementById('charMenuBtn');
  if (menu) {
    const isOpen = menu.classList.toggle('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', !isOpen);
    if (charMenuBtn) charMenuBtn.setAttribute('aria-expanded', !isOpen);
  }
}

/**
 * Close menu
 */
function closeMenu() {
  const menu = document.getElementById('mobileMenu');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const charMenuBtn = document.getElementById('charMenuBtn');
  if (menu) {
    menu.classList.add('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    if (charMenuBtn) charMenuBtn.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Handle menu action
 * @param {string} action - Action type
 */
async function handleMenuAction(action) {
  switch(action) {
    case 'settings':
      // Open settings panel directly
      const settingsPanel = document.getElementById('settingsPanel');
      if (settingsPanel) {
        // Import and call updateSettingsContext
        const { updateSettingsContext } = await import('./settings/index.js');
        updateSettingsContext();
        settingsPanel.classList.toggle('open');
      }
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
  if (settingsIcon) {
    settingsIcon.style.display = 'flex';
  }

  // Toggle-controlled menu items
  const menuItems = [
    { id: 'mobileMapIcon', pref: 'map', gameOnly: true },
    { id: 'mobileSaveIcon', pref: 'save', gameOnly: true },
    { id: 'mobileLoadIcon', pref: 'load', gameOnly: true }
  ];

  menuItems.forEach(({ id, pref, gameOnly }) => {
    const icon = document.getElementById(id);
    if (icon) {
      // Show if: (1) not game-only OR game is loaded, AND (2) user preference is enabled
      const shouldShow = (!gameOnly || inGame) && prefs[pref];
      icon.style.display = shouldShow ? 'flex' : 'none';
    }
  });
}

/**
 * Initialize quick access toggles in settings
 */
function initQuickAccessToggles() {
  const prefs = getQuickAccessPrefs();

  // Set initial toggle states (Settings has no toggle - always shown)
  const toggles = {
    qaMapToggle: 'map',
    qaSaveToggle: 'save',
    qaLoadToggle: 'load'
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
      console.warn('Failed to parse quick access preferences:', e);
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
    console.warn('Failed to save quick access preferences:', e);
  }
}

