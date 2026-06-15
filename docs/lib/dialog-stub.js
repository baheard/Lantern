/* Minimal Dialog stub for basic game play without save/load */

var Dialog = function() {

var dialog_el_id = 'dialog';

/* Stub implementations */
function dialog_open(tosave, usage, gameid, callback) {
    // Dispatch event for IFTalk to handle (it will call callback)
    var event = new CustomEvent('lantern-dialog-open', {
        detail: {
            tosave: tosave,
            usage: usage,
            gameid: gameid,
            callback: callback
        }
    });
    window.dispatchEvent(event);
}

function file_clean_fixed_name(filename, usage) {
    return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function file_construct_ref(filename, usage, gameid) {
    return { filename: filename, usage: usage, gameid: gameid };
}

function file_construct_temp_ref(usage) {
    return { filename: '_temp_' + Date.now(), usage: usage, gameid: '', temporary: true };
}

function file_write(ref, content, israw) {
    try {
        // Check if this is a custom save filename (set by game dialog interceptor)
        if (ref.usage === 'save' && window._customSaveFilename) {
            // This is a game-initiated save - store in custom save format with metadata
            var gameName = window.state ? window.state.currentGameName : 'unknown';
            var saveName = window._customSaveFilename;
            window._customSaveFilename = null; // Clear after use

            // Convert Quetzal data to base64
            var quetzalData;
            if (israw && typeof content === 'string') {
                quetzalData = btoa(content);
            } else if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
                var bytes = new Uint8Array(content);
                quetzalData = btoa(String.fromCharCode.apply(null, bytes));
            } else {
                console.error('[Dialog] Unexpected save data format:', typeof content, content);
                return false;
            }

            // Get display HTML
            var statusBarEl = document.getElementById('statusBar');
            var upperWindowEl = document.getElementById('upperWindow');
            var lowerWindowEl = document.getElementById('lowerWindow');

            var lowerWindowHTML = '';
            if (lowerWindowEl) {
                var commandLine = document.getElementById('commandLine');
                if (commandLine) {
                    var clone = lowerWindowEl.cloneNode(true);
                    var commandLineClone = clone.querySelector('#commandLine');
                    if (commandLineClone) {
                        commandLineClone.remove();
                    }
                    lowerWindowHTML = clone.innerHTML;
                } else {
                    lowerWindowHTML = lowerWindowEl.innerHTML;
                }
            }

            // Save with extended metadata
            var saveData = {
                timestamp: new Date().toISOString(),
                gameName: gameName,
                saveName: saveName,
                quetzalData: quetzalData,
                displayHTML: {
                    statusBar: statusBarEl ? statusBarEl.innerHTML : '',
                    upperWindow: upperWindowEl ? upperWindowEl.innerHTML : '',
                    lowerWindow: lowerWindowHTML
                },
                voxglkState: window._voxglkInstance ? {
                    generation: window._voxglkInstance.generation || 0,
                    inputWindowId: window._voxglkInstance.inputWindowId || null
                } : {}
            };

            var customKey = 'lantern_customsave_' + gameName + '_' + saveName;
            localStorage.setItem(customKey, JSON.stringify(saveData));

            // Show system message in game area
            if (window.addGameTextFromDialog) {
                window.addGameTextFromDialog('<div class="system-message">Game saved - ' + saveName + '</div>', false);
            }

            return true;
        }

        // Normal Dialog save
        var key = 'lantern_' + ref.usage + '_' + ref.filename;
        localStorage.setItem(key, israw ? content : JSON.stringify(content));
        return true;
    } catch (e) {
        console.error('[Dialog] Write error:', e);
        return false;
    }
}

function file_read(ref, israw) {
    try {
        // Check if this is a custom save filename (set by game dialog interceptor)
        if (ref.usage === 'save' && window._customRestoreFilename) {
            // This is a game-initiated restore - read from custom save format
            var gameName = window.state ? window.state.currentGameName : 'unknown';
            var saveName = window._customRestoreFilename;
            window._customRestoreFilename = null; // Clear after use

            var customKey = 'lantern_customsave_' + gameName + '_' + saveName;
            var saveDataStr = localStorage.getItem(customKey);

            if (!saveDataStr) {
                console.error('[Dialog] Custom save not found:', saveName);
                return null;
            }

            var saveData = JSON.parse(saveDataStr);

            // Decode base64 Quetzal data to binary string (Dialog.file_read returns strings when israw=true)
            var binaryString = atob(saveData.quetzalData);

            // Schedule display HTML restoration after VM restore completes
            setTimeout(function() {
                if (saveData.displayHTML) {
                    var statusBarEl = document.getElementById('statusBar');
                    var upperWindowEl = document.getElementById('upperWindow');
                    var lowerWindowEl = document.getElementById('lowerWindow');

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
                        var commandLine = document.getElementById('commandLine');
                        lowerWindowEl.innerHTML = saveData.displayHTML.lowerWindow;
                        if (commandLine) {
                            lowerWindowEl.appendChild(commandLine);
                        }
                    }
                }
            }, 100);

            return binaryString; // Return binary string (Dialog uses strings for raw data)
        }

        // Normal Dialog read
        var key = 'lantern_' + ref.usage + '_' + ref.filename;
        var data = localStorage.getItem(key);
        if (data === null) return null;
        return israw ? data : JSON.parse(data);
    } catch (e) {
        console.error('[Dialog] Read error:', e);
        return null;
    }
}

function file_ref_exists(ref) {
    // Check for custom save/restore
    if (ref.usage === 'save' && window._customRestoreFilename) {
        var gameName = window.state ? window.state.currentGameName : 'unknown';
        var saveName = window._customRestoreFilename;
        var customKey = 'lantern_customsave_' + gameName + '_' + saveName;
        var exists = localStorage.getItem(customKey) !== null;
        return exists;
    }

    if (ref.usage === 'save' && window._customSaveFilename) {
        // For save, we'll create the file, so it "exists" for the VM's purposes
        return true;
    }

    // Normal Dialog check
    var key = 'lantern_' + ref.usage + '_' + ref.filename;
    var exists = localStorage.getItem(key) !== null;
    return exists;
}

function file_remove_ref(ref) {
    var key = 'lantern_' + ref.usage + '_' + ref.filename;
    localStorage.removeItem(key);
}

/* Engine autorestore migration (autorestore-migration-plan.md, Phase 2).
 *
 * When config.useEngineAutorestore is on, the VM (via Glk.update with
 * do_vm_autosave) or the app's autoSave() drives vm.do_autosave(), which lands
 * here with the full-state engine snapshot. We do NOT persist or wrap it here:
 * save-manager.performSave is the single owner of the parity envelope (gzip,
 * displayHTML, map data, hintsMilestone, appMoveCount, gameName keying, Drive
 * sync, backup rotation, quota handling). So this just stashes the raw snapshot
 * on a global for performSave to pick up. A null snapshot (engine quit/error
 * path, save<0) must NOT wipe a good autosave — we record the quit signal and
 * leave storage to the app.
 */
function autosave_write(key, snapshot) {
    try {
        if (snapshot) {
            window.__engineAutosaveSnapshot = snapshot;
        } else {
            window.__engineAutosaveQuit = true;
        }
    } catch (e) {
        console.error('[Dialog] Autosave write error:', e);
    }
}

/* Engine autorestore migration (autorestore-migration-plan.md, Phase 3).
 *
 * Called by the VM during vm.start() (inside Glk.init) when do_vm_autosave is on.
 * If it returns a snapshot, the engine runs do_autorestore immediately — before
 * any intro — and lands cleanly at the next glk_select (no bootstrap seam).
 *
 * The engine snapshot lives inside the app's parity envelope, keyed by gameName
 * (lantern_autosave_<gameName>), NOT by the raw VM signature passed here. We use
 * window.state.currentGameName (set by game-loader before Glk.init) to find it,
 * format-detect (saveFormat === 'engine'), and return the decompressed snapshot.
 *
 * Returns null when there is no save, or the save is legacy Quetzal format. As of
 * Phase 6b the legacy bootstrap-restore path is gone: a legacy save boots a fresh
 * intro and performRestore rejects it gracefully ("older format, can't restore").
 * The app-side reattachment (displayHTML, map, narration, etc.) is NOT done here;
 * performRestore owns it. See save-manager.performRestore.
 */
function autosave_read(key) {
    try {
        var gameName = (window.state && window.state.currentGameName) || null;
        if (!gameName) return null;

        // Read the slot game-loader resolved for this boot (autosave by default, or the
        // quicksave/customsave slot the user asked to restore). All restores now reuse
        // boot-time do_autorestore.
        var restoreKey = window.__engineRestoreKey || ('lantern_autosave_' + gameName);
        var raw = localStorage.getItem(restoreKey);
        if (!raw) return null;

        var saveData = JSON.parse(raw);
        if (!saveData || saveData.saveFormat !== 'engine' || !saveData.engineSnapshot) {
            return null; // legacy Quetzal save → performRestore rejects it gracefully
        }

        var snapshotStr = saveData.engineSnapshot;
        if (saveData.engineSnapshotCompressed) {
            var binaryString = atob(saveData.engineSnapshot);
            var bytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            snapshotStr = pako.ungzip(bytes, { to: 'string' });
        }

        return JSON.parse(snapshotStr);
    } catch (e) {
        console.error('[Dialog] Autosave read error:', e);
        return null; // treat as no-autosave → clean boot, never a hard crash
    }
}

return {
    streaming: false,
    open: dialog_open,
    file_clean_fixed_name: file_clean_fixed_name,
    file_construct_ref: file_construct_ref,
    file_construct_temp_ref: file_construct_temp_ref,
    file_write: file_write,
    file_read: file_read,
    file_ref_exists: file_ref_exists,
    file_remove_ref: file_remove_ref,
    autosave_write: autosave_write,
    autosave_read: autosave_read
};

}();

// Export to window
if (typeof window !== 'undefined') {
    window.Dialog = Dialog;
}
