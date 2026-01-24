# Key State Variables Reference

## App State (`app.js`)

Primary state variables for narration and voice control:

| Variable | Type | Purpose |
|----------|------|---------|
| `isNarrating` | Boolean | Currently playing audio |
| `narrationEnabled` | Boolean | Whether narration should play (controls auto-play) |
| `isPaused` | Boolean | Narration paused (not stopped) |
| `isMuted` | Boolean | Microphone muted (NOT audio muted) |
| `manuallyMuted` | Boolean | User explicitly muted (vs auto-muted by system) - controls auto-unmute behavior |
| `listeningEnabled` | Boolean | Continuous voice recognition active |
| `pushToTalkMode` | Boolean | Mic only activates while button is held (for car Bluetooth) |
| `currentInterimTranscript` | String | Current interim (non-final) recognition text - sent as 0% confidence before clearing |
| `talkModeActive` | Boolean | Both listening and narration active together |
| `currentChunkIndex` | Number | Position in sentence array for navigation |
| `currentChunkStartTime` | Number | Timestamp for smart back button (500ms threshold) |
| `isNavigating` | Boolean | Prevents concurrent navigation operations |
| `hasProcessedResult` | Boolean | Flag to prevent duplicate voice command processing |
| `hasManualTyping` | Boolean | Set when user types manually, prevents auto-send |

**Important Notes:**
- `narrationEnabled` only controls auto-play, NOT chunk creation
- `isMuted` affects microphone input, NOT audio output
- `manuallyMuted` prevents auto-unmute when pressing play (respects user's explicit choice)
- `currentInterimTranscript` preserves partial speech on tab switch (sent as 0% confidence command)
- `pushToTalkMode` disables auto-restart of recognition (only active while button held)
- `isNavigating` includes 100ms delay to prevent race conditions (between navigation actions, not for input polling)
- Chunks are ALWAYS created when new text arrives, regardless of `narrationEnabled`

---

## Command State (`commands.js`)

State variables for meta-command handling and in-game dialogs:

| Variable | Type | Purpose |
|----------|------|---------|
| `awaitingMetaInput` | String\|null | Current meta-command mode: `'save'`, `'restore'`, `'delete'`, `'game-save'`, `'game-restore'`, or `null` |
| `gameDialogCallback` | Function\|null | Callback from in-game save/restore dialog (Dialog.open) |
| `gameDialogRef` | Object\|null | File reference for in-game dialogs |

**awaitingMetaInput modes:**
- `'save'` - Typed SAVE command, waiting for save name
- `'restore'` - Typed RESTORE command, waiting for save selection
- `'delete'` - Typed DELETE SAVE command, waiting for save selection
- `'game-save'` - In-game save dialog (e.g., from game's SAVE command)
- `'game-restore'` - In-game restore dialog (e.g., "Press R to restore")
- `null` - Not waiting for meta-command input

**Important Notes:**
- `awaitingMetaInput` is reset to `null` at start of `handleMetaResponse()`
- Must be restored before re-prompting on errors (enables ESC/Enter cancellation)
- `gameDialogCallback` is called with `null` to cancel, or `fileref` to accept
- After calling callback, clear both `gameDialogCallback` and `gameDialogRef`

---

## Keyboard State (`keyboard.js`)

State variables for system entry mode:

| Variable | Type | Purpose |
|----------|------|---------|
| `systemEntryMode` | Boolean | Currently in system entry mode (save/restore/delete prompts) |
| `systemEntryCallback` | Function\|null | (Unused - kept for compatibility) |

**systemEntryMode behavior:**
- `true` - Suppress char input, show text input, enable auto-focus
- `false` - Normal game input mode (char or line based on game state)

**Important Notes:**
- System entry mode overrides game input mode
- Char input is suppressed: `if (inputType === 'char' && !systemEntryMode)`
- Text input is always visible: `if (systemEntryMode || inputType === 'line')`
- Auto-focus works: `if ((getInputType() === 'line' || systemEntryMode) && ...)`

---

## Window Flags (Global)

Global flags for dialog coordination:

| Variable | Type | Purpose |
|----------|------|---------|
| `window._customSaveFilename` | String\|null | Save name for in-game save (set before VM save) |
| `window._customRestoreFilename` | String\|null | Save name for in-game restore (set before VM restore) |

**Important Notes:**
- Set by `handleGameSaveResponse()` before calling callback
- Read by `Dialog.file_write()` to detect custom save format
- Cleared after use: `window._customSaveFilename = null`
- Similar pattern for restore with `window._customRestoreFilename`
