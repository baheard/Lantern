/**
 * Save Manager Module
 *
 * Manages quick save/load for browser-based ZVM games.
 * Players can also use in-game SAVE/RESTORE commands.
 */

import { state } from '../core/state.js';
import { updateStatus } from '../utils/status.js';
import { showMessageInput } from '../input/keyboard/index.js';
import { scrollToBottom } from '../utils/scroll.js';
import { addGameText } from '../ui/game-output.js';
import { getItem, setJSON, getJSON, removeItem } from '../utils/storage/storage-api.js';

// ============================================================================
// COMPRESSION HELPERS
// ============================================================================

/**
 * Compress a string using gzip (pako)
 * @param {string} str - String to compress
 * @returns {string} Base64-encoded compressed data
 */
function compressString(str) {
    if (!str || str.length === 0) return '';
    try {
        const uint8array = pako.gzip(str);
        return btoa(String.fromCharCode(...uint8array));
    } catch (error) {
        console.error('Compression failed:', error);
        return str; // Return original on error
    }
}

/**
 * Decompress a gzip-compressed base64 string
 * @param {string} compressed - Base64-encoded compressed data
 * @returns {string} Decompressed string
 */
function decompressString(compressed) {
    if (!compressed || compressed.length === 0) return '';
    try {
        const binaryString = atob(compressed);
        const uint8array = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            uint8array[i] = binaryString.charCodeAt(i);
        }
        const decompressed = pako.ungzip(uint8array, { to: 'string' });
        return decompressed;
    } catch (error) {
        console.error('Decompression failed:', error);
        return compressed; // Return original on error
    }
}

// ============================================================================
// HTML HISTORY LIMITING
// ============================================================================

/**
 * Limit HTML history to most recent N turns (approximately 644 chars/turn)
 * @param {string} html - Full HTML history
 * @param {number} maxTurns - Maximum number of turns to keep (default: 100)
 * @returns {string} Limited HTML
 */
function limitHTMLHistory(html, maxTurns = 100) {
    if (!html || html.length === 0) return '';

    const CHARS_PER_TURN = 644;
    const maxChars = maxTurns * CHARS_PER_TURN;

    if (html.length <= maxChars) {
        return html;
    }

    // Keep only the most recent maxChars
    return html.substring(html.length - maxChars);
}

// ============================================================================
// MAP DATA OPTIMIZATION
// ============================================================================

/**
 * Get optimized map data (remove default values)
 * Returns BOTH map canvas and auto-mapper if map was opened, or just auto-mapper if not
 * Map canvas may be stale (user closed map), auto-mapper always current (in memory)
 * They merge when map opens
 * @param {string} gameName - Name of the current game
 * @returns {Promise<Object|null>} Optimized map data object, or null if no map data
 */
async function getOptimizedMapData(gameName) {
    if (!gameName) return null;

    // Check for map canvas data first (user opened the map)
    const mapKey = `iftalk_map_${gameName}`;
    const mapDataStr = localStorage.getItem(mapKey);

    // If map canvas exists, save both map canvas AND auto-mapper
    // Map canvas may be stale (user closed map and continued playing)
    // Auto-mapper has current state in memory
    // They'll merge when map opens
    if (mapDataStr) {
        try {
            const mapData = JSON.parse(mapDataStr);

            // Optimize nodes: remove default values
            const optimizedNodes = (mapData.nodes || []).map(node => {
                const optimized = {
                    id: node.id,
                    name: node.name,
                    x: node.x,
                    y: node.y
                };

                // Only include non-default values
                if (node.type && node.type !== 'room') optimized.type = node.type;
                if (node.notes && node.notes !== '') optimized.notes = node.notes;
                if (node.isManual === true) optimized.isManual = true;
                if (node.isEdited === true) optimized.isEdited = true;

                return optimized;
            });

            // Optimize edges: remove default values, use shorter key 'cmd' instead of 'command'
            const optimizedEdges = (mapData.edges || []).map(edge => {
                const optimized = {
                    from: edge.from,
                    to: edge.to,
                    cmd: edge.command || edge.cmd
                };

                // Only include non-default values
                if (edge.connectionType && edge.connectionType !== 'cardinal') {
                    optimized.connectionType = edge.connectionType;
                }
                if (edge.isManual === true) optimized.isManual = true;
                if (edge.isEdited === true) optimized.isEdited = true;

                return optimized;
            });

            // Build optimized map canvas data object
            const optimized = {
                nodes: optimizedNodes,
                edges: optimizedEdges,
                protectedNodes: mapData.protectedNodes || [],
                protectedEdges: mapData.protectedEdges || []
            };

            // Include optional fields only if present
            if (mapData.deletedEdges && mapData.deletedEdges.length > 0) {
                optimized.deletedEdges = mapData.deletedEdges;
            }
            if (mapData.deletedNodes && mapData.deletedNodes.length > 0) {
                optimized.deletedNodes = mapData.deletedNodes;
            }
            if (mapData.viewport) optimized.viewport = mapData.viewport;
            if (mapData.currentNodeId) optimized.currentNodeId = mapData.currentNodeId;
            if (typeof mapData.autoMapEnabled === 'boolean') {
                optimized.autoMapEnabled = mapData.autoMapEnabled;
            }

            // Get auto-mapper data to save alongside map canvas
            const { getMapData, getLastLocationName } = await import('../features/auto-mapper.js');
            const autoMapperData = getMapData();

            // Return BOTH map canvas and auto-mapper
            // Map canvas: positions, notes, edits (may be stale on nodes/edges)
            // Auto-mapper: journey only (new moves since last map open)
            // Journey will be cleared when map is opened, keeping saves small
            return {
                mapCanvas: optimized,
                autoMapper: {
                    journey: autoMapperData.journey
                }
            };

        } catch (error) {
            console.error('Failed to optimize map data:', error);
            // Fall through to try auto-mapper only
        }
    }

    // Map canvas doesn't exist - try auto-mapper data only
    try {
        const { getMapData } = await import('../features/auto-mapper.js');
        const autoMapperData = getMapData();
        if (autoMapperData && autoMapperData.journey && autoMapperData.journey.length > 0) {
            // Return ONLY auto-mapper (map never opened)
            // Save journey only - will be parsed on first map open
            return {
                autoMapper: {
                    journey: autoMapperData.journey
                }
            };
        }
    } catch (error) {
        // Auto-mapper not available
    }

    // No map data at all
    return null;
}

/**
 * Restore map data from optimized format
 * Handles both auto-mapper journey data AND map canvas data
 * @param {Object} optimizedMapData - Optimized map data with autoMapper and/or mapCanvas
 * @param {string} gameName - Name of the current game
 */
async function restoreMapData(optimizedMapData, gameName) {
    if (!optimizedMapData || !gameName) return;

    // Restore auto-mapper data if present
    if (optimizedMapData.autoMapper) {
        try {
            const { initAutoMapper } = await import('../features/auto-mapper.js');
            // Store the data temporarily in a special key
            const autoMapperKey = `iftalk_automapper_restore_${gameName}`;
            localStorage.setItem(autoMapperKey, JSON.stringify(optimizedMapData.autoMapper));

            // Immediately restore auto-mapper state to memory
            // (gameLoaded event doesn't fire on quickload/restore, only on initial game load)
            initAutoMapper(gameName);
        } catch (error) {
            console.error('Failed to restore auto-mapper data:', error);
        }
    }

    // Restore map canvas data if present
    if (optimizedMapData.mapCanvas) {
        try {
            const mapCanvasData = optimizedMapData.mapCanvas;

            // Restore nodes with default values
            const nodes = (mapCanvasData.nodes || []).map(node => ({
                id: node.id,
                name: node.name,
                x: node.x,
                y: node.y,
                type: node.type || 'room',
                notes: node.notes || '',
                isManual: node.isManual || false,
                isEdited: node.isEdited || false
            }));

            // Restore edges with default values, convert 'cmd' back to 'command'
            const edges = (mapCanvasData.edges || []).map(edge => ({
                from: edge.from,
                to: edge.to,
                command: edge.cmd || edge.command,
                connectionType: edge.connectionType || 'cardinal',
                isManual: edge.isManual || false,
                isEdited: edge.isEdited || false
            }));

            // Build full map canvas data object
            const mapData = {
                nodes: nodes,
                edges: edges,
                protectedNodes: mapCanvasData.protectedNodes || [],
                protectedEdges: mapCanvasData.protectedEdges || [],
                deletedEdges: mapCanvasData.deletedEdges || [],
                deletedNodes: mapCanvasData.deletedNodes || [],
                viewport: mapCanvasData.viewport || { x: 0, y: 0, scale: 1 },
                currentNodeId: mapCanvasData.currentNodeId || null,
                autoMapEnabled: mapCanvasData.autoMapEnabled !== undefined
                    ? mapCanvasData.autoMapEnabled
                    : true
            };

            // Save to localStorage
            const mapKey = `iftalk_map_${gameName}`;
            localStorage.setItem(mapKey, JSON.stringify(mapData));

            // Set auto-mapper current location so it can track from here
            // Then clear journey since map canvas now has everything
            // Auto-mapper will track only new moves from this point
            const { setCurrentLocation, clearJourney } = await import('../features/auto-mapper.js');
            setCurrentLocation(mapData.currentNodeId, gameName);
            clearJourney();

        } catch (error) {
            console.error('Failed to restore map canvas data:', error);
        }
    }
}

/**
 * Get current game signature from ZVM
 */
function getGameSignature() {
    if (!window.zvmInstance) return null;
    return window.zvmInstance.get_signature?.() || state.currentGameName || 'unknown';
}

/**
 * Clean HTML for saving - remove system messages, app commands, and low confidence voice commands
 * Keep only: game text and game commands (high confidence)
 * @param {string} html - Raw HTML from lowerWindow
 * @returns {string} Cleaned HTML
 */
function cleanHTMLForSave(html) {
    if (!html || !html.trim()) return '';

    // Create a temporary div to parse and filter HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove all elements we don't want to save:
    // 1. System messages (.system-message or .game-text.system-message)
    temp.querySelectorAll('.system-message').forEach(el => el.remove());

    // 2. App commands (.app-command)
    temp.querySelectorAll('.app-command').forEach(el => el.remove());

    // 3. Low confidence voice commands (.low-confidence)
    temp.querySelectorAll('.low-confidence').forEach(el => el.remove());

    // What remains:
    // - .game-text (game responses)
    // - .user-command (game commands, but not app-command or low-confidence)

    return temp.innerHTML;
}

/**
 * Get current display state (HTML from status bar, upper window, lower window)
 * @returns {Object} Object with statusBarHTML, upperWindowHTML, lowerWindowHTML
 */
function getCurrentDisplayState() {
    const statusBarEl = document.getElementById('statusBar');
    const upperWindowEl = document.getElementById('upperWindow');
    const lowerWindowEl = document.getElementById('lowerWindow');

    // Get lowerWindow content excluding command line
    let lowerWindowHTML = '';
    if (lowerWindowEl) {
        const commandLine = document.getElementById('commandLine');
        if (commandLine) {
            // Clone lowerWindow, remove commandLine, get HTML
            const clone = lowerWindowEl.cloneNode(true);
            const commandLineClone = clone.querySelector('#commandLine');
            if (commandLineClone) {
                commandLineClone.remove();
            }
            lowerWindowHTML = clone.innerHTML;
        } else {
            lowerWindowHTML = lowerWindowEl.innerHTML;
        }
    }

    // Clean HTML to remove system messages, app commands, and low confidence voice commands
    lowerWindowHTML = cleanHTMLForSave(lowerWindowHTML);

    return {
        statusBarHTML: statusBarEl?.innerHTML || '',
        upperWindowHTML: upperWindowEl?.innerHTML || '',
        lowerWindowHTML: lowerWindowHTML
    };
}

/**
 * Core save logic used by all save functions
 * @param {string} storageKey - localStorage key for this save
 * @param {string|null} displayName - Name shown in UI (null for autosave)
 * @param {Object} additionalData - Extra data to include in save (e.g., saveName, verification)
 * @returns {boolean} Success/failure
 */
async function performSave(storageKey, displayName = null, additionalData = {}) {
    try {
        const gameSignature = getGameSignature();
        if (!gameSignature) {
            if (displayName) updateStatus('Error: No game loaded', 'error');
            return false;
        }

        // Get Quetzal save data from ZVM
        const pc = window.zvmInstance.pc;
        const quetzalData = window.zvmInstance.save_file(pc);

        // Convert to base64 for localStorage
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(quetzalData)));

        // Get current display state (status bar, upper window, lower window)
        const displayHTML = getCurrentDisplayState();

        // Limit lowerWindow to 100 turns and compress
        const limitedLowerWindow = limitHTMLHistory(displayHTML.lowerWindowHTML, 100);
        const compressedLowerWindow = compressString(limitedLowerWindow);

        // Compress quetzalData
        const compressedQuetzalData = compressString(base64Data);

        // Get optimized map data (auto-mapper + map canvas) and compress
        const optimizedMapData = await getOptimizedMapData(state.currentGameName);
        const mapDataStr = optimizedMapData ? JSON.stringify(optimizedMapData) : '';
        const compressedMapData = mapDataStr ? compressString(mapDataStr) : '';

        // Get VoxGlk state
        const { getGeneration, getInputWindowId } = await import('./voxglk.js');
        const savedGeneration = getGeneration();
        const savedInputWindowId = getInputWindowId();

        // Build save data object with compressed data
        const saveData = {
            timestamp: new Date().toISOString(),
            gameName: state.currentGameName,
            gameSignature: gameSignature,
            quetzalData: compressedQuetzalData,
            quetzalDataCompressed: true,
            displayHTML: {
                statusBar: displayHTML.statusBarHTML,
                upperWindow: displayHTML.upperWindowHTML,
                lowerWindow: compressedLowerWindow,
                lowerWindowCompressed: true
            },
            mapData: compressedMapData,
            mapDataCompressed: compressedMapData ? true : false,
            voxglkState: {
                generation: savedGeneration,
                inputWindowId: savedInputWindowId
            },
            // Note: narrationState removed - start fresh on each load
            ...additionalData // Merge any additional data (saveName, verification, etc.)
        };

        // Save to localStorage using storage API
        const saveSuccess = setJSON(storageKey, saveData);

        if (!saveSuccess) {
            // Check if it's a quota error
            try {
                const testKey = `__storage_test_${Date.now()}`;
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
                // If we get here, it's not a quota issue
                throw new Error('Failed to save data to localStorage');
            } catch (quotaError) {
                if (quotaError.name === 'QuotaExceededError' ||
                    quotaError.message.includes('quota') ||
                    quotaError.message.includes('storage')) {
                    throw new Error('Storage quota exceeded - Try exporting old saves and clearing data');
                }
                throw new Error('Failed to save data to localStorage');
            }
        }

        // Auto-sync to Google Drive (if enabled)
        if (state.gdriveSyncEnabled && state.gdriveSignedIn) {
            try {
                const { scheduleDriveSync, getDeviceInfo } = await import('../utils/gdrive/index.js');
                const enrichedData = { ...saveData, device: getDeviceInfo() };
                scheduleDriveSync(storageKey, enrichedData);
            } catch (error) {
                // Drive sync failed silently
            }
        }

        // Show system message in game area (if displayName provided)
        if (displayName) {
            addGameText(`<div class="system-message">Game saved - ${displayName}</div>`, false);
            updateStatus(`Saved: ${displayName}`, 'success');
        }

        return true;

    } catch (error) {
        if (displayName) {
            updateStatus(`Save failed: ${error.message}`, 'error');
        }
        return false;
    }
}

/**
 * Core restore logic used by all load functions
 * @param {string} storageKey - localStorage key for this save
 * @param {string|null} displayName - Name shown in UI (null for autosave)
 * @param {Object} options - Configuration options
 * @param {boolean} options.showSystemMessage - Show "Game restored" in game area
 * @param {boolean} options.restoreNarrationState - Restore currentChunkIndex
 * @param {string} options.successStatus - Status message on success
 * @param {string} options.errorNotFound - Error message if save not found
 * @returns {boolean} Success/failure
 */
async function performRestore(storageKey, displayName = null, options = {}) {
    try {
        // Read from localStorage using storage API
        const saveData = getJSON(storageKey);

        if (!saveData) {
            if (options.errorNotFound) {
                updateStatus(options.errorNotFound, 'error');
            }
            return false;
        }

        // Decompress quetzalData if compressed
        let quetzalDataBase64 = saveData.quetzalData;
        if (saveData.quetzalDataCompressed) {
            quetzalDataBase64 = decompressString(saveData.quetzalData);
        }

        // Decode base64 to binary
        const binaryString = atob(quetzalDataBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Restore using ZVM
        const result = window.zvmInstance.restore_file(bytes.buffer);

        if (result === 2) { // ZVM returns 2 on successful restore
            // DON'T restore VoxGlk generation - keep it at 1 (current intro state)
            // After page reload, glkapi.js is at gen:1, so VoxGlk must stay at gen:1
            // The saved generation is just VM memory state, not the UI turn counter
            // voxglk.js will send bootstrap with gen:1 which will be accepted

            // Restore display HTML
            if (saveData.displayHTML) {
                const statusBarEl = document.getElementById('statusBar');
                const upperWindowEl = document.getElementById('upperWindow');
                const lowerWindowEl = document.getElementById('lowerWindow');

                if (statusBarEl && saveData.displayHTML.statusBar) {
                    statusBarEl.innerHTML = saveData.displayHTML.statusBar;
                    statusBarEl.style.display = '';
                }
                if (upperWindowEl) {
                    upperWindowEl.innerHTML = saveData.displayHTML.upperWindow || '';
                    if (saveData.displayHTML.upperWindow && saveData.displayHTML.upperWindow.trim()) {
                        upperWindowEl.style.display = '';
                    } else {
                        upperWindowEl.style.display = 'none';
                    }
                }
                if (lowerWindowEl && saveData.displayHTML.lowerWindow) {
                    // Decompress lowerWindow if compressed
                    let lowerWindowHTML = saveData.displayHTML.lowerWindow;
                    if (saveData.displayHTML.lowerWindowCompressed) {
                        lowerWindowHTML = decompressString(saveData.displayHTML.lowerWindow);
                    }

                    const commandLine = document.getElementById('commandLine');
                    lowerWindowEl.innerHTML = lowerWindowHTML;
                    if (commandLine) {
                        lowerWindowEl.appendChild(commandLine);
                    }
                    // Show command input immediately and scroll to bottom
                    showMessageInput();
                    scrollToBottom();
                }
            }

            // Restore map data if present
            if (saveData.mapData && saveData.gameName) {
                let mapDataStr = saveData.mapData;
                if (saveData.mapDataCompressed) {
                    mapDataStr = decompressString(saveData.mapData);
                }
                if (mapDataStr) {
                    try {
                        const optimizedMapData = JSON.parse(mapDataStr);
                        await restoreMapData(optimizedMapData, saveData.gameName);
                    } catch (error) {
                        console.error('Failed to restore map data:', error);
                    }
                }
            }

            // Restore narration position from old saves (backwards compatibility)
            // New saves don't include narrationState, so this will only apply to old saves
            if (options.restoreNarrationState && saveData.narrationState) {
                state.currentChunkIndex = saveData.narrationState.currentChunkIndex || 0;
            }

            // DON'T send bootstrap here - let voxglk.js handle it
            // voxglk.js will check if generation === 1 and send bootstrap
            // Since we didn't call restore_state(), generation is still 1

            // Set flag to position at end of chunks when created (overrides restored position)
            // This ensures we start at the end so user can use back/rewind buttons
            state.skipNarrationAfterLoad = true;

            // Show system message in game area (if requested)
            if (options.showSystemMessage && displayName) {
                addGameText(`<div class="system-message">Game restored - ${displayName}</div>`, false);
            }

            // Update status (if provided)
            if (options.successStatus) {
                updateStatus(options.successStatus, 'success');
            }

            return true;
        } else {
            if (displayName) {
                updateStatus(`Restore failed: Invalid save data`, 'error');
            }
            return false;
        }

    } catch (error) {
        if (displayName) {
            updateStatus(`Restore failed: ${error.message}`, 'error');
        }
        return false;
    }
}

/**
 * Quick save to dedicated quick slot
 * Uses same comprehensive approach as autosave
 */
export async function quickSave() {
    if (!state.currentGameName) {
        updateStatus('Error: No game loaded', 'error');
        return false;
    }

    const key = `iftalk_quicksave_${state.currentGameName}`;
    const success = await performSave(key, 'quicksave');

    // Create backup after successful save
    if (success) {
        await createBackup('quicksave', false);
    }

    return success;
}

/**
 * Custom save to named slot (for SAVE meta-command)
 * @param {string} saveName - Name for the save slot
 */
export async function customSave(saveName) {
    if (!state.currentGameName || !saveName) {
        return false;
    }

    const key = `iftalk_customsave_${state.currentGameName}_${saveName}`;
    return await performSave(key, saveName, { saveName: saveName });
}

/**
 * Custom load from named slot (for RESTORE meta-command)
 * @param {string} saveName - Name of the save slot
 */
export async function customLoad(saveName) {
    if (!state.currentGameName || !saveName) {
        return false;
    }

    const key = `iftalk_customsave_${state.currentGameName}_${saveName}`;
    return await performRestore(key, saveName, {
        showSystemMessage: true,
        restoreNarrationState: true
    });
}

/**
 * Auto save (happens automatically every turn)
 */
export async function autoSave() {
    if (!state.currentGameName) {
        return false;
    }

    // Verification data to confirm successful restore
    const verification = {
        pc: window.zvmInstance?.pc || 0,
        stackDepth: window.zvmInstance?.stack?.length || 0,
        callStackDepth: window.zvmInstance?.callstack?.length || 0
    };

    const key = `iftalk_autosave_${state.currentGameName}`;
    return await performSave(key, null, { verification });
}

/**
 * Auto load (happens automatically on game start)
 */
export async function autoLoad() {
    if (!state.currentGameName) {
        return false;
    }

    const key = `iftalk_autosave_${state.currentGameName}`;
    return await performRestore(key, null, {
        successStatus: 'Restored from last session'
    });
}

/**
 * Quick load from dedicated quick slot
 * Uses same bootstrap technique as autoLoad
 */
export async function quickLoad() {
    if (!state.currentGameName) {
        updateStatus('Error: No game loaded', 'error');
        return false;
    }

    const key = `iftalk_quicksave_${state.currentGameName}`;
    return await performRestore(key, 'quicksave', {
        showSystemMessage: true,
        restoreNarrationState: true,
        successStatus: 'Quick loaded',
        errorNotFound: 'No quick save found - Use Quick Save button first'
    });
}

/**
 * Export current quick save to a file on disk
 */
export function exportSaveToFile() {
    try {
        if (!state.currentGameName) {
            updateStatus('Error: No game loaded', 'error');
            return;
        }

        // Get the quick save from localStorage
        const key = `iftalk_quicksave_${state.currentGameName}`;
        const saveData = getJSON(key);

        if (!saveData) {
            updateStatus('No quick save found - Use Quick Save button first', 'error');
            return;
        }

        // Create a blob with the save data
        const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const gameName = state.currentGameName || 'game';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `${gameName}_${timestamp}.sav`;

        // Trigger download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus('Save exported to file!', 'success');

    } catch (error) {
        updateStatus('Export failed: ' + error.message, 'error');
    }
}

/**
 * Import a save file from disk
 */
export function importSaveFromFile() {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sav,.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Read file
            const text = await file.text();
            const saveData = JSON.parse(text);

            // Validate save data
            if (!saveData.quetzalData || !saveData.gameName) {
                updateStatus('Invalid save file format', 'error');
                return;
            }

            // Store in localStorage as quick save using current game name
            if (!state.currentGameName) {
                updateStatus('Error: No game loaded', 'error');
                return;
            }
            const key = `iftalk_quicksave_${state.currentGameName}`;
            setJSON(key, saveData);

            // Import successful - prompt user to reload
            const { confirmDialog } = await import('../ui/confirm-dialog.js');
            const shouldReload = await confirmDialog(
                'Import complete! Click "Reload" to load the imported save.',
                'Reload',
                'Cancel'
            );

            if (shouldReload) {
                // Reload the page to load the imported save
                window.location.reload();
            } else {
                updateStatus('Save imported! Use Quick Load button to load', 'success');
            }

        } catch (error) {
            updateStatus('Import failed: ' + error.message, 'error');
        }
    };

    // Trigger file picker
    input.click();
}

// Autosave backup interval (5 minutes)
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BACKUPS_PER_GAME = 3;
let backupIntervalId = null;

/**
 * Create a timestamped backup of the current autosave
 * @returns {Promise<boolean>} Success/failure
 */
async function createAutosaveBackup() {
    if (!state.currentGameName) {
        return false;
    }

    // Use the new createBackup function with autosave type
    return await createBackup('autosave', false);
}

/**
 * Create a backup of any save type (autosave or quicksave)
 * @param {string} saveType - Type of save ('autosave' or 'quicksave')
 * @param {boolean} exemptFromLimit - If true, this backup won't count toward the max limit
 * @returns {Promise<boolean>} Success/failure
 */
export async function createBackup(saveType, exemptFromLimit = false) {
    if (!state.currentGameName) {
        return false;
    }

    // Get current save
    const saveKey = `iftalk_${saveType}_${state.currentGameName}`;
    const saveData = getJSON(saveKey);

    if (!saveData) {
        return false;
    }

    // Create timestamped backup
    const timestamp = Date.now();
    const backupKey = exemptFromLimit
        ? `iftalk_backup_${saveType}_${state.currentGameName}_${timestamp}_exempt`
        : `iftalk_backup_${saveType}_${state.currentGameName}_${timestamp}`;

    setJSON(backupKey, saveData);

    // Clean up old backups (unless this is exempt)
    if (!exemptFromLimit) {
        cleanupOldBackups(state.currentGameName, saveType);
    }

    return true;
}

/**
 * Clean up old backups, keeping only the most recent backups per save type
 * @param {string} gameName - Game name to clean up backups for
 * @param {string} saveType - Save type ('autosave', 'quicksave', 'customsave')
 */
function cleanupOldBackups(gameName, saveType = 'autosave') {
    const prefix = `iftalk_backup_${saveType}_${gameName}_`;

    // Find all backup keys for this game and save type (exclude exempt backups)
    const backupKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix) && !key.endsWith('_exempt')) {
            // Extract timestamp from key
            const parts = key.substring(prefix.length).split('_');
            const timestamp = parseInt(parts[0]);
            backupKeys.push({ key, timestamp });
        }
    }

    // Sort by timestamp (newest first)
    backupKeys.sort((a, b) => b.timestamp - a.timestamp);

    // Different max backups for different save types
    // Autosaves: 3 backups (created every 5 minutes)
    // Quicksaves: 3 backups (created on each quicksave)
    // Other types: 1 backup (manual saves, less frequent)
    const maxBackups = (saveType === 'autosave' || saveType === 'quicksave') ? 3 : 1;

    if (backupKeys.length > maxBackups) {
        const toRemove = backupKeys.slice(maxBackups);
        toRemove.forEach(({ key }) => {
            removeItem(key);
        });
    }
}

/**
 * Start automatic backup timer
 */
export function startAutosaveBackupTimer() {
    // Stop existing timer if any
    stopAutosaveBackupTimer();

    // Set up interval for future backups (start timer without immediate backup)
    backupIntervalId = setInterval(() => {
        createAutosaveBackup();
    }, BACKUP_INTERVAL_MS);
}

/**
 * Stop automatic backup timer
 */
export function stopAutosaveBackupTimer() {
    if (backupIntervalId) {
        clearInterval(backupIntervalId);
        backupIntervalId = null;
    }
}

/**
 * Initialize save handlers and keyboard shortcuts
 */
export function initSaveHandlers() {

    // Quick Save button (in both toolbar and settings)
    const quickSaveBtn = document.getElementById('quickSaveBtn');
    if (quickSaveBtn) {
        quickSaveBtn.addEventListener('click', () => {
            quickSave();
            // Close settings panel if open
            const settingsPanel = document.getElementById('settingsPanel');
            if (settingsPanel) {
                settingsPanel.classList.remove('open');
            }
        });
    }

    // Quick Restore button (in settings)
    const quickRestoreBtn = document.getElementById('quickRestoreBtn');
    if (quickRestoreBtn) {
        quickRestoreBtn.addEventListener('click', () => {
            // Manual restore requires page reload to reset glkapi.js state
            if (!state.currentGameName) {
                updateStatus('Error: No game loaded', 'error');
                return;
            }
            const key = `iftalk_quicksave_${state.currentGameName}`;
            if (!getItem(key)) {
                updateStatus('No quick save found - Use Quick Save button first', 'error');
                return;
            }
            // Set flag for autorestore to pick up after reload
            sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
                type: 'quicksave',
                key: state.currentGameName,
                gameName: state.currentGameName
            }));
            window.location.reload();
        });
    }

    // Quick Load button (in toolbar)
    const quickLoadBtn = document.getElementById('quickLoadBtn');
    if (quickLoadBtn) {
        quickLoadBtn.addEventListener('click', () => {
            // Manual restore requires page reload to reset glkapi.js state
            if (!state.currentGameName) {
                updateStatus('Error: No game loaded', 'error');
                return;
            }
            const key = `iftalk_quicksave_${state.currentGameName}`;
            if (!getItem(key)) {
                updateStatus('No quick save found - Use Quick Save button first', 'error');
                return;
            }
            // Set flag for autorestore to pick up after reload
            sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
                type: 'quicksave',
                key: state.currentGameName,
                gameName: state.currentGameName
            }));
            window.location.reload();
        });
    }

    // Export Save button (in settings)
    const exportSaveBtn = document.getElementById('exportSaveBtn');
    if (exportSaveBtn) {
        exportSaveBtn.addEventListener('click', exportSaveToFile);
    }

    // Import Save button (in settings)
    const importSaveBtn = document.getElementById('importSaveBtn');
    if (importSaveBtn) {
        importSaveBtn.addEventListener('click', importSaveFromFile);
    }
}
