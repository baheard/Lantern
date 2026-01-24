# Save/Restore Implementation Status

**Last Updated:** December 21, 2024

## Current Status: ✅ FULLY WORKING

All save/restore mechanisms are fully functional with clean transitions.

## What Works

- ✅ **Autosave** after each turn (saves VM state + display HTML + VoxGlk state)
- ✅ **Auto-restore** on page load
- ✅ **Quick Save/Load** buttons (page reload approach)
- ✅ **Custom SAVE/RESTORE** commands (named saves with page reload)
- ✅ **'R' key restore** from intro screen
- ✅ VM restores to correct position
- ✅ Display HTML shows saved content immediately
- ✅ VM wakes up and processes commands normally
- ✅ Input becomes available automatically
- ✅ Game continues from saved position
- ✅ Clean transition with no error messages

## How It Works

### Autorestore (Page Load)

The restore process uses a "bootstrap" technique to wake the VM:

1. **Save** (on each turn):
   - VM state via `restore_file()` (Quetzal format)
   - VoxGlk state (generation counter, inputWindowId)
   - Display HTML (statusBar, upperWindow, lowerWindow)
   - Verification data (PC, stack depths)

2. **Restore** (on page load):
   - VM starts normally, shows intro screen
   - First update arrives with char input request (gen: 1)
   - `autoLoad()` restores VM memory to saved state
   - VoxGlk state restored (generation → 5, inputWindowId → 1)
   - Display HTML restored (user sees saved content immediately)
   - **Key step**: Send char input with `gen: 1` to fulfill intro's pending request
   - This "wakes" the VM, which is now in restored state
   - VM sends fresh update with line input at correct generation
   - User can send commands normally

## Implementation Details

### Files Modified

- `docs/js/game/game-loader.js` - Sets flag to trigger restore after VM starts
- `docs/js/game/voxglk.js` - Triggers autoLoad() on first update, sends bootstrap char input
- `docs/js/game/save-manager.js` - Handles VM restore, VoxGlk state restore, and display HTML restoration

### Key Code

**Bootstrap technique (voxglk.js):**
```javascript
if (restored) {
    // Wake VM by sending dummy input to fulfill intro char request
    setTimeout(() => {
        // The intro screen char request was created at gen: 1
        // We need to fulfill it with gen: 1, not the restored gen: 5
        acceptCallback({
            type: 'char',
            gen: 1,  // Intro's original generation
            window: 1,
            value: 10  // Enter key
        });
    }, 100);
}
```

**Restore logic (save-manager.js):**
```javascript
autoLoad() {
    // Restore VM memory
    vm.restore_file(bytes.buffer);

    // Restore VoxGlk state (generation, inputWindowId)
    window._voxglkInstance.restore_state(
        saveData.voxglkState.generation,
        saveData.voxglkState.inputWindowId
    );

    // Restore display HTML (preserve command line element)
    const commandLine = document.getElementById('commandLine');
    lowerWindowEl.innerHTML = saveData.displayHTML.lowerWindow;
    lowerWindowEl.appendChild(commandLine);
}
```

**Timing Sequence:**

1. Game starts (shows intro, char input active at gen: 1)
2. First update arrives with char input request
3. autoLoad() called:
   - Restores VM memory to saved state
   - Restores VoxGlk state (generation: 5, inputWindowId: 1)
   - Restores display HTML
4. User sees saved content immediately
5. Bootstrap char input sent (gen: 1, value: Enter)
6. VM wakes up, processes input in restored state
7. VM sends fresh update with line input at gen: 5
8. User can send commands normally (no error messages!)

---

### Manual Restore (Quick Load, RESTORE Command)

**The Problem:**
Manual restore mid-game fails due to **generation number mismatch** between glkapi.js and the restored VM state.

#### The Generation Mismatch Bug:

```
1. Game running at gen:10
   - glkapi.js: event_generation = 10
   - VoxGlk: generation = 10
   - VM: internal state at gen 10

2. User clicks Quick Load (saved at gen:6)

3. restore_file() restores VM memory to gen:6 state
   - VM now thinks it's at gen:6

4. restore_state(6, 1) sets VoxGlk generation = 6
   - VoxGlk.generation = 6

5. Send bootstrap input with gen:1 (to wake VM)
   - Input: { type: 'char', gen: 1, value: 10 }

6. glkapi.js validates input (glkapi.js:155):
   if (obj.gen != event_generation) {
     GlkOte.log('Input event had wrong generation...');
     return;  // ← INPUT REJECTED!
   }
   - Check: obj.gen (1) != event_generation (10)
   - Result: Bootstrap input rejected

7. VM never receives bootstrap → stays frozen ✗
```

**The Root Cause:**
- **glkapi.js `event_generation` is internal** (private variable in closure)
- No public API to reset or modify `event_generation`
- `restore_file()` restores VM memory but does NOT affect glkapi.js state
- **Generation validation is strict:** glkapi.js rejects ANY input with wrong generation
- After restore, VM is at gen:6 but glkapi.js still expects gen:10
- Impossible to sync them without resetting glkapi.js

**The Solution: Page Reload**

Page reload is the **only way** to reset glkapi.js to clean state. This is standard practice for web IF interpreters.

#### Detailed Flow:

**1. Button Click** (Quick Load or RESTORE command):
```javascript
// commands.js, save-manager.js
sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
    type: 'quicksave',  // or 'customsave', or 'autosave'
    key: gameSignature,  // or save name
    gameName: currentGameName
}));
window.location.reload();  // Trigger reload
```

**2. After Reload** (game-loader.js):
```javascript
// Detect pending restore flag
const pendingRestore = JSON.parse(sessionStorage.getItem('iftalk_pending_restore'));

if (pendingRestore) {
    // Clear flag immediately
    sessionStorage.removeItem('iftalk_pending_restore');

    // Set window flags for voxglk.js
    window.shouldAutoRestore = true;
    window.pendingRestoreType = pendingRestore.type;
    window.pendingRestoreKey = pendingRestore.key;

    // Auto-load game using iftalk_last_game path
    const lastGame = localStorage.getItem('iftalk_last_game');
    startGame(lastGame, onOutput);  // Game loads automatically
}
```

**3. Game Starts** (Fresh glkapi.js state):
```
- glkapi.js reloaded → event_generation = 0
- Glk.init() called
- VM starts, sends intro with gen: 1
- glkapi.js: event_generation = 1
- VoxGlk: generation = 1
```

**4. Autorestore Triggered** (voxglk.js):
```javascript
// voxglk.js detects window.shouldAutoRestore
if (window.shouldAutoRestore) {
    window.shouldAutoRestore = false;

    // Call appropriate load function
    if (restoreType === 'quicksave') {
        restored = await quickLoad();
    } else if (restoreType === 'customsave') {
        restored = await customLoad(restoreKey);
    } else {
        restored = await autoLoad();
    }
}
```

**5. Restore Executes** (save-manager.js):
```javascript
quickLoad() {
    // Restore VM memory to saved state (e.g., gen:6)
    window.zvmInstance.restore_file(bytes.buffer);

    // Restore VoxGlk state
    window._voxglkInstance.restore_state(6, 1);

    // Restore display HTML
    lowerWindowEl.innerHTML = saveData.displayHTML.lowerWindow;

    // Send bootstrap input
    // glkapi.js is at gen:1 (clean state), so gen:1 works!
    acceptCallback({ type: 'char', gen: 1, value: 10 });
}
```

**6. Bootstrap Accepted** (glkapi.js):
```javascript
// glkapi.js:155
if (obj.gen != event_generation) {  // 1 == 1 ✓
    return;  // Not triggered!
}
event_generation += 1;  // Now 2
// Bootstrap delivered to VM
```

**7. VM Wakes Up and Sends Update**:
```javascript
// VM processes bootstrap input
// VM calls GlkOte.update() to send output

// glkapi constructs update with current event_generation (now 2)
var update = { type: 'update', gen: event_generation, windows: [...] };

// Update sent to VoxGlk
VoxGlk.update(update);
```

**8. Sync Established**:
```
- VoxGlk receives update with gen:2
- VoxGlk sets generation = 2
- User sends next command with gen:2
- glkapi checks: obj.gen (2) == event_generation (2) ✓
- Everything synced!
```

#### Critical Insight: Generation Numbers Explained

**Important:** The `generation` number used for input validation is NOT the VM's internal game state. It's a **UI turn counter** managed by glkapi.js:

1. **glkapi.js `event_generation`:** UI turn counter (0, 1, 2, 3...)
   - Starts at 0
   - Increments each time an input event is ACCEPTED
   - Included in every update sent to VoxGlk as `arg.gen`

2. **VM internal state:** Completely separate (confusingly also called "generation" in save files)
   - VM memory restored to saved position (PC, stack, variables)
   - `restore_file()` restores this memory
   - The "generation" saved in voxglkState is just for reference - it's NOT the UI counter
   - **CRITICAL:** We do NOT restore VoxGlk.generation from saved state

3. **VoxGlk `generation`:** Mirror of glkapi's counter
   - Updated from VM updates: `generation = arg.gen`
   - Used to tag input events: `{ gen: generation, ... }`
   - **After restore:** Set naturally by VM update, NOT by restore_state()

**Why we DON'T call restore_state() anymore:**
- Old code: `restore_state(savedGeneration)` set VoxGlk.generation = 6
- Problem: After page reload, glkapi.js is at gen:1, but VoxGlk would be at gen:6
- Result: Generation mismatch → commands rejected
- **Fix:** Don't call restore_state() - VoxGlk.generation is set automatically when VM sends updates
- After page reload: Both glkapi and VoxGlk start at gen:1, stay in sync

**The saved "generation" field:**
- It's VM memory state metadata, NOT the UI event counter
- We save it for reference but DON'T restore it to VoxGlk
- The UI counter always starts fresh at 1 after page reload

**Why Page Reload is Necessary:**
- **Only way to reset glkapi.js internal `event_generation` variable**
- glkapi.js `event_generation` is in a closure (private, not accessible)
- No public API to reset it (`Glk.init()` doesn't reset the counter)
- Attempting to sync without reload is impossible
- **Standard approach:** Parchment, Lectrote, and other web interpreters use page reload
- **Fast:** Local reload from cache, content restored immediately
- **Clean UX:** Brief flash, no data loss, familiar browser behavior

#### Bug Fix History (December 21, 2024)

**The Bug:** Custom restore loaded HTML but VM was frozen - commands didn't work.

**Root Causes:**

1. **Type Mismatch** (commands.js:133)
   - `getCustomSaves()` set `type: 'custom'`
   - But `handleRestoreResponse()` checked for `type: 'customsave'`
   - Result: All custom restores incorrectly treated as autosave
   - **Fix:** Changed to `type: 'customsave'`

2. **Generation Confusion** (save-manager.js)
   - Old code called `restore_state(savedGeneration)` which set VoxGlk.generation = 6
   - But after page reload, glkapi.js is at gen:1, needs VoxGlk at gen:1 too
   - **Critical insight:** Saved "generation" is VM memory state (turn number), NOT UI event counter
   - After `restore_file()`, VM naturally sends update with new generation
   - **Fix:** Removed `restore_state()` calls - let VM updates set generation naturally

3. **Bootstrap Logic** (voxglk.js:267)
   - Old: `if (generation === 1) { send bootstrap }`
   - Problem: For manual restores, VM update sets generation before check
   - Result: Bootstrap skipped, VM stays frozen
   - **Fix:** `if (restoreType === 'quicksave' || restoreType === 'customsave' || generation === 1)`
   - Manual restores ALWAYS send bootstrap with gen:1

**Correct Flow After Fix:**
```
1. RESTORE command → sessionStorage flag → page reload
2. glkapi.js: event_generation = 0 (reset)
3. Game loads → intro screen → gen:1
4. customLoad() called:
   - restore_file() → VM memory restored
   - Restore HTML → display updated
   - DON'T call restore_state() → VoxGlk.generation stays at 1
5. voxglk.js detects type: 'customsave'
6. Send bootstrap: { type: 'line', gen: 1, value: '' }
7. glkapi.js: accepts (1 == 1) ✓, increments to gen:2
8. VM wakes, processes bootstrap, sends update with gen:2
9. VoxGlk receives update, sets generation = 2
10. Commands work! User sends with gen:2, glkapi accepts ✓
```

#### Alternative Approaches (Not Recommended):

**Option 1: Patch glkapi.js** ❌
- Add `reset_generation()` function to glkapi.js
- Modifies third-party library
- Breaks on updates
- Requires maintaining patches

**Option 2: Module Reload** ❌
- Remove and re-add script tags
- Complex and fragile
- Need to reload VM and all dependencies
- Might as well reload page

#### Comparison: With vs Without Page Reload

**WITHOUT Page Reload (Broken):**
```
Game at gen:10 → Quick Load → restore_file() → Send bootstrap gen:1
→ glkapi rejects (1 != 10) → VM frozen ✗
```

**WITH Page Reload (Working):**
```
Game at gen:10 → Quick Load → Page reload → glkapi reset to gen:0
→ Game loads (gen:1) → restore_file() → Send bootstrap gen:1
→ glkapi accepts (1 == 1) → VM wakes → Update gen:2 → Synced ✓
```

**Restore Types:**
- **Autosave** → `autoLoad()` (no reload needed, happens during initial page load)
- **Quicksave** → Page reload → `quickLoad()` during autorestore
- **Customsave** → Page reload → `customLoad(saveName)` during autorestore

**Files Modified for Manual Restore:**
- `docs/js/game/save-manager.js` - Quick Load button triggers page reload
- `docs/js/game/commands.js` - RESTORE command triggers page reload
- `docs/js/game/voxglk.js` - Handles customsave restore type, generation check for bootstrap
- `docs/js/game/game-loader.js` - Auto-loads game after pending restore reload

## Why This Approach Works

### Why restore_file() Freezes the VM

**Understanding the Problem**: `restore_file()` is designed to be called FROM WITHIN the VM (as part of the RESTORE opcode), not from external JavaScript.

**How RESTORE Normally Works (In-Game)**:
1. Game code calls RESTORE opcode (like calling a function)
2. VM saves current PC (program counter - where it is in the code)
3. VM restores memory from save file
4. VM RETURNS to game code with result code (2 = success)
5. Game code sees result, prints "Restored", continues executing
6. VM keeps running - it never stopped!

**What Happens with External restore_file()**:
1. JavaScript calls `vm.restore_file(buffer)`
2. VM restores memory from buffer
3. VM returns result (2) to JavaScript
4. **But... there's no game code waiting!**
5. **VM is frozen** at the saved PC, but that instruction isn't running
6. **No execution happening** - the VM is like a paused video

**Analogy**:
- **In-game RESTORE**: Like hibernating your laptop (saves state and continues running after resume)
- **External restore_file()**: Like restoring a disk image to a powered-off computer (memory loaded, but CPU not running)

**Why the input event wakes the VM**:
- Glk delivers the input event to the VM
- VM starts processing the input (CPU "wakes up")
- VM is already in restored state (memory was restored earlier)
- VM executes from restored position and sends fresh update
- VM keeps running normally from that point

### The "Bootstrap" Technique

**Problem**: After `restore_file()`, the VM memory is restored but the VM is **frozen** - not actively running.

**Solution**: "Wake" the VM by fulfilling the intro's pending char input request.

1. ✅ **Intro's char request is still active** - Created at gen: 1, waiting for input
2. ✅ **Send char input with gen: 1** - Glk accepts it because generation matches
3. ✅ **VM wakes up** - Glk delivers input to VM, which starts processing
4. ✅ **VM is in restored state** - Memory already restored (PC 74744, gen: 5)
5. ✅ **VM sends fresh update** - With line input at correct generation
6. ✅ **No conflicts** - We don't call vm.run() or cancel input

### Attempted Alternatives (Failed)

1. **Call vm.run() after restore** - ❌ Throws "window already has keyboard request"
2. **Cancel input before vm.run()** - ❌ Inputs get recreated, vm.run() still fails
3. **Don't wake VM at all** - ❌ VM stays frozen, doesn't process user commands
4. **Send char input with restored gen: 5** - ❌ Glk rejects (intro request expects gen: 1)

## Critical Implementation Notes

### DO
- ✅ Send bootstrap char input with `gen: 1` to wake VM
- ✅ Restore VoxGlk state (generation, inputWindowId)
- ✅ Preserve command line element during HTML restore
- ✅ Use `restore_file()` for VM memory restoration

### DON'T
- ❌ Call `vm.run()` after restore (conflicts with input requests)
- ❌ Try to cancel input requests (doesn't prevent vm.run() errors)
- ❌ Send bootstrap input with restored generation (use gen: 1)
- ❌ Use ifvms.js built-in autosave (Glulx-only, doesn't work for Z-machine)

## Testing

### Test Autosave/Restore:
1. Load a game (e.g., Anchorhead)
2. Play for a few turns (each turn autosaves)
3. Reload the page (Ctrl+R)
4. ✅ Should restore to last position automatically
5. ✅ Saved content displays immediately
6. ✅ Input prompt appears
7. ✅ Commands work normally
8. ✅ No error messages or glitches

### Test Manual Restore (Quick Save/Load):
1. Load a game and play for a few turns
2. Click "Quick Save" button in settings
3. Continue playing for more turns
4. Click "Quick Load" button
5. ✅ Page reloads automatically
6. ✅ Game loads automatically (no welcome screen)
7. ✅ Restores to quick save position
8. ✅ Saved content displays immediately
9. ✅ Input prompt appears
10. ✅ Commands work normally

### Test Custom SAVE/RESTORE:
1. Load a game and play for a few turns
2. Type command: `SAVE mysave`
3. Continue playing for more turns
4. Type command: `RESTORE mysave`
5. ✅ Page reloads automatically
6. ✅ Game loads automatically (no welcome screen)
7. ✅ Restores to custom save position
8. ✅ Saved content displays immediately
9. ✅ Input prompt appears
10. ✅ Commands work normally

---

## In-Game Save/Restore Dialogs (December 22, 2024)

### Overview

Games can trigger native save/restore dialogs (e.g., "Press 'R' to restore" in Anchorhead intro, or in-game SAVE commands). IFTalk intercepts these dialogs and provides a custom UI using the system entry mode paradigm with save list selection.

### Implementation

**System Entry Mode Approach:**
- Shows save list as game output (like typed SAVE/RESTORE commands)
- Enters system entry mode with text input prompt
- User types save name (or number) to select
- ESC or empty Enter to cancel
- Page reload for restore (safe VM state management)

### Dialog Interceptor

**File:** `docs/js/game/commands.js` - `initDialogInterceptor()`

Listens for `iftalk-dialog-open` events from Dialog.open():

```javascript
window.addEventListener('iftalk-dialog-open', (e) => {
    const { tosave, usage, gameid, callback } = e.detail;

    if (usage === 'save') {
        if (!tosave) {
            // RESTORE request - show save list and enter system entry mode
            const allSaves = getUnifiedSavesList();
            respondAsGame(saveListHTML);
            gameDialogCallback = callback;
            awaitingMetaInput = 'game-restore';
            enterSystemEntryMode('Enter save name to restore (send nothing to cancel)');
        } else {
            // SAVE request - show existing saves and prompt for name
            respondAsGame(saveListHTML);
            gameDialogCallback = callback;
            awaitingMetaInput = 'game-save';
            enterSystemEntryMode('Enter save name (send nothing to cancel)');
        }
    }
});
```

### Restore Flow

**File:** `docs/js/game/commands.js` - `handleGameRestoreResponse()`

```
1. User presses 'R' at intro screen
   ↓
2. Game calls glk_fileref_create_by_prompt()
   ↓
3. VoxGlk calls Dialog.open(false, 'save', gameid, callback)
   ↓
4. Dialog interceptor catches event
   ↓
5. Shows save list: "Restore - Choose a file to restore. (# or name)"
   ↓
6. Enters system entry mode (text input enabled)
   ↓
7. User types save name or number (e.g., "mysave" or "3")
   OR
   User presses ESC or empty Enter to cancel
   ↓
8a. Cancel path:
    - Clear all system messages
    - Call callback(null)
    - Game shows "Restore failed." and continues
   ↓
8b. Valid save path:
    - Set sessionStorage: { type: 'customsave', key: saveName }
    - Show "Restoring from 'saveName'..."
    - Reload page
   ↓
9. Page reload triggers autorestore flow
   ↓
10. Game loads at saved position
```

### Save Flow

**File:** `docs/js/game/commands.js` - `handleGameSaveResponse()`

```
1. Game calls glk_fileref_create_by_prompt() for save
   ↓
2. VoxGlk calls Dialog.open(true, 'save', gameid, callback)
   ↓
3. Dialog interceptor catches event
   ↓
4. Shows existing saves and prompt: "Save - Enter a file name for your save."
   ↓
5. Enters system entry mode
   ↓
6. User types save name (validation: alphanumeric, spaces, dashes, underscores)
   ↓
7. Validation checks:
   - Invalid characters? → Re-prompt
   - Reserved name (quicksave/autosave)? → Re-prompt
   - Max saves exceeded (5)? → Re-prompt
   ↓
8. Set window._customSaveFilename = saveName
   ↓
9. Call callback(fileref) with file reference
   ↓
10. VM calls Dialog.file_write()
   ↓
11. file_write() detects _customSaveFilename flag
   ↓
12. Saves in custom format: Quetzal + display HTML + VoxGlk state
```

### Cancellation Handling

**ESC Key:**
- `keyboard.js` calls `cancelMetaInput()` on Escape press
- Clears system messages before calling callback(null)
- Game receives null and shows "Restore/Save failed."

**Empty Enter:**
- `handleMetaResponse()` detects empty input
- Same cleanup and callback(null) flow

**Re-Prompting on Errors:**
- When invalid input (save not found, invalid name, etc.)
- Restore `awaitingMetaInput` flag before re-entering system entry mode
- Enables ESC/Enter cancellation after errors

### Custom Save Format

**File:** `docs/lib/dialog-stub.js` - `file_write()`, `file_read()`

**Storage Key:** `iftalk_customsave_{gameName}_{saveName}`

**Format:**
```javascript
{
    timestamp: "2024-12-22T...",
    gameName: "anchorhead",
    saveName: "mysave",
    quetzalData: "<base64 Quetzal>",  // VM memory state
    displayHTML: {
        statusBar: "<HTML>",
        upperWindow: "<HTML>",
        lowerWindow: "<HTML>"
    },
    voxglkState: {
        generation: 5,
        inputWindowId: 1
    }
}
```

### System Entry Mode

**Keyboard Behavior:**
- **Char input suppressed** - `if (inputType === 'char' && !systemEntryMode)`
- **Text input visible** - `if (systemEntryMode || inputType === 'line')`
- **Auto-focus enabled** - Typing anywhere focuses input
- **ESC cancellation** - Returns null to game dialog

### Page Reload Pattern

**Why Page Reload:**
- Avoids VM crash from calling `restore_file()` then returning to dialog callback
- Resets glkapi.js generation counter to clean state
- Same proven approach as Quick Load and typed RESTORE

**How It Works:**
```javascript
sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
    type: 'customsave',
    key: save.name,
    gameName: state.currentGameName
}));
window.location.reload();
```

### Files Modified

- `docs/js/game/commands.js` - Dialog interceptor, handlers, cancellation
- `docs/js/input/keyboard.js` - System entry mode input handling
- `docs/lib/dialog-stub.js` - Custom save format read/write

### Testing Checklist

- ✅ Press 'R' at Anchorhead intro → shows save list
- ✅ Select save by name → restores correctly
- ✅ Select save by number → restores correctly
- ✅ ESC to cancel → shows "Restore failed"
- ✅ Empty Enter to cancel → shows "Restore failed"
- ✅ Invalid save name → re-prompts, ESC still works
- ✅ In-game SAVE → shows save list, saves correctly
- ✅ Reserved name rejected → re-prompts
- ✅ Max saves (5) enforced → error + re-prompt

