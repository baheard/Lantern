/**
 * Storage API - Centralized localStorage access layer
 * Provides consistent interface for all localStorage operations
 * Eliminates duplication and improves error handling
 */

import { state } from '../../core/state.js';

/**
 * Get item from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {string|null} Stored value or default
 */
export function getItem(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch (error) {
        return defaultValue;
    }
}

/**
 * Set item in localStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} Success status
 */
export function setItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Remove item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} Success status
 */
export function removeItem(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Check if item exists in localStorage
 * @param {string} key - Storage key
 * @returns {boolean} True if key exists
 */
export function hasItem(key) {
    try {
        return localStorage.getItem(key) !== null;
    } catch (error) {
        return false;
    }
}

/**
 * Get JSON object from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist or parsing fails
 * @returns {*} Parsed JSON object or default
 */
export function getJSON(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) {
            return defaultValue;
        }
        return JSON.parse(value);
    } catch (error) {
        return defaultValue;
    }
}

/**
 * Set JSON object in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON.stringify'd)
 * @returns {boolean} Success status
 */
export function setJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get all localStorage keys matching a prefix
 * @param {string} prefix - Key prefix to match
 * @returns {string[]} Array of matching keys
 */
export function getItemsByPrefix(prefix) {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keys.push(key);
            }
        }
        return keys;
    } catch (error) {
        return [];
    }
}

/**
 * Remove all localStorage items matching a prefix
 * @param {string} prefix - Key prefix to match
 * @returns {number} Number of items removed
 */
export function removeItemsByPrefix(prefix) {
    try {
        const keys = getItemsByPrefix(prefix);
        keys.forEach(key => localStorage.removeItem(key));
        return keys.length;
    } catch (error) {
        return 0;
    }
}

/**
 * Get all localStorage keys
 * @returns {string[]} Array of all keys
 */
export function getAllKeys() {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                keys.push(key);
            }
        }
        return keys;
    } catch (error) {
        return [];
    }
}

/**
 * Generate game-specific storage key
 * @param {string} type - Type of data (autosave, quicksave, customsave, etc.)
 * @param {string} gameName - Game name (defaults to current game)
 * @returns {string} Full storage key
 */
export function getGameKey(type, gameName = null) {
    const game = gameName || state.currentGameName;
    if (!game) {
        return `lantern_${type}`;
    }
    return `lantern_${type}_${game}`;
}

/**
 * Get all keys for a specific game
 * @param {string} gameName - Game name (defaults to current game)
 * @returns {string[]} Array of keys for this game
 */
export function getGameKeys(gameName = null) {
    const game = gameName || state.currentGameName;
    if (!game) {
        return [];
    }
    return getItemsByPrefix(`lantern_`).filter(key => key.includes(`_${game}`));
}

/**
 * Clear all data for a specific game
 * @param {string} gameName - Game name (defaults to current game)
 * @returns {number} Number of items removed
 */
export function clearGameData(gameName = null) {
    const game = gameName || state.currentGameName;
    if (!game) {
        return 0;
    }

    const keys = getGameKeys(game);
    keys.forEach(key => localStorage.removeItem(key));
    return keys.length;
}

/**
 * Get storage usage info (for debugging)
 * @returns {object} Storage statistics
 */
export function getStorageInfo() {
    try {
        const keys = getAllKeys();
        const lanternKeys = keys.filter(k => k.startsWith('lantern_'));

        let totalSize = 0;
        const sizeByType = {};

        lanternKeys.forEach(key => {
            const value = localStorage.getItem(key);
            if (value) {
                const size = key.length + value.length;
                totalSize += size;

                // Categorize by type (autosave, quicksave, backup, etc.)
                const type = key.split('_')[1] || 'other';
                sizeByType[type] = (sizeByType[type] || 0) + size;
            }
        });

        return {
            totalKeys: keys.length,
            lanternKeys: lanternKeys.length,
            estimatedSizeKB: (totalSize / 1024).toFixed(2),
            estimatedSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            sizeByType: Object.entries(sizeByType).map(([type, bytes]) => ({
                type,
                sizeKB: (bytes / 1024).toFixed(2),
                count: lanternKeys.filter(k => k.includes(`_${type}_`)).length
            })),
            keys: lanternKeys
        };
    } catch (error) {
        return { totalKeys: 0, lanternKeys: 0, estimatedSizeKB: 0, estimatedSizeMB: 0, sizeByType: [], keys: [] };
    }
}

/**
 * Print detailed storage report to console (for debugging)
 */
export function printStorageReport() {
    const info = getStorageInfo();
    const estimatedQuotaMB = 5; // Conservative estimate; real quota is 5-10MB and varies by browser.
    const usagePercent = ((parseFloat(info.estimatedSizeMB) / estimatedQuotaMB) * 100).toFixed(1);
    const itemSizes = info.keys.map(key => {
        const value = localStorage.getItem(key);
        return { key, sizeKB: parseFloat(((value ? value.length : 0) / 1024).toFixed(2)) };
    }).sort((a, b) => b.sizeKB - a.sizeKB).slice(0, 10);

    console.group(`Lantern Storage Report — ${info.estimatedSizeMB} MB (~${usagePercent}% of ${estimatedQuotaMB}MB), ${info.lanternKeys}/${info.totalKeys} keys`);
    console.table(info.sizeByType);
    console.log('Top 10 largest items:');
    console.table(itemSizes);
    if (parseFloat(info.estimatedSizeMB) > 3) {
        console.warn('Storage usage is high — consider exporting and deleting old saves.');
    }
    console.groupEnd();

    return info;
}

// Expose to window for console debugging
if (typeof window !== 'undefined') {
    window.LanternStorage = { getStorageInfo, printStorageReport };
}
