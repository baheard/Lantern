# Critical Design Decisions

## Keyboard Input System (December 17, 2024)

1. **Inline Text Input**: Real `<input type="text">` field integrated into game output
   - Positioned at bottom of `lowerWindow` as last child
   - `>` prompt positioned absolutely as visual decoration (not editable)
   - Transparent background, monospace font matches game text
   - Native browser cursor for full editing capabilities

2. **Input Mode Detection**: Polls `getInputType()` every 100ms
   - **Line mode**: Shows input with `>` prompt, accepts text commands
   - **Char mode**: Hides input entirely, any keypress sends immediately
   - Prevents flash on transitions by starting hidden

3. **Echo Suppression**: Detects and skips game command echoes
   - Pattern matching for `glk-input` styled spans (blue echo text)
   - Compares plaintext against `window.lastSentCommand`
   - Skips display if content is ONLY an echo (not mixed with response)

4. **Focus Management**:
   - **No auto-focus** - prevents unexpected scroll-to-bottom
   - Click anywhere in game area focuses input (unless selecting text)
   - Typing anywhere focuses input automatically
   - No focus manipulation in char mode (input hidden)

5. **No Manual Command Display**: Commands saved to history only, not echoed to output
   - User sees command in input field while typing
   - Game handles all output display (including echoed commands if applicable)
   - Cleaner separation of input vs output

## Screen Clear Behavior (December 18, 2024)

Content is removed from DOM ONLY when the Z-machine explicitly sends a clear window command.

1. **Z-machine Clear Command**: When game sends `clear: true` in update
   - `clearGameOutput()` removes all content from DOM
   - Frees memory since cleared content is never shown again
   - Examples: Anchorhead clears after title screens, menu transitions

2. **Normal Gameplay**: No clear command
   - New content appends below existing content
   - Old content scrolls up (classic IF behavior)
   - Example: Lost Pig - intro stays, new turns add below

3. **No Special "Intro" Handling**: All game text treated identically
   - No marking first content differently
   - No automatic removal based on turn count
   - Let the game engine decide when to clear

4. **Blank Line Preservation**: Blank lines kept with proper CSS classes
   - `blank-line-spacer` class for styling
   - CSS can hide on mobile to save vertical space
   - Not removed from DOM

Files: `game-output.js` (clearGameOutput), `voxglk.js` (shouldClearScreen detection)

## Text Processing Pipeline

1. **Chunk Creation Always Happens**: `createNarrationChunks()` is called for ALL new game text, regardless of whether narration auto-starts
   - This ensures navigation buttons always work, even when narration is disabled
   - Previously, chunks were only created inside `speakTextChunked()`, causing UI bugs when skipping to end

2. **GlkOte Output Processing**:
   - GlkOte provides structured game output (not raw text streams)
   - Text comes pre-formatted from the Z-machine via proper API
   - No parsing needed - game state accessible directly
   - Game output wrapper (`.game-output-inner`) constrains max-width to 800px for readability

3. **Display vs Narration Split**: Text processed TWO ways:
   - **Display HTML**: Structured HTML from GlkOte with proper formatting
   - **Narration chunks**: All newlines → spaces, split on `.!?` for smooth TTS
   - **Critical**: Display regenerated to match narration chunks for accurate highlighting

4. **Client-side Processing**: All text processing happens in browser
   - No server-side text manipulation needed
   - Direct access to game output via GlkOte API

5. **Sentence splitting**: Split on `.!?` only (not newlines)

6. **Pronunciation fixes**: Applied before TTS via localStorage dictionary

7. **Spaced capitals**: "A N C H O R H E A D" → "Anchorhead" (collapsed + title case)

## Smart Back Button (lines 634-646)

- Within 500ms: Go to previous chunk
- After 500ms: Restart current chunk
- Mimics music player behavior

## Per-Sentence Highlighting

- Text wrapped in `<span class="sentence-chunk" data-chunk-index="N">`
- Only currently-speaking sentence gets `.speaking` class
- Highlight updates on each chunk, not entire text block

## Mute Button Behavior

- Mutes **microphone input** (stops listening)
- Does NOT mute audio output (narration continues)
- Auto-unmutes when starting talk mode
- Alt key = push-to-talk (hold to temporarily unmute)

## Navigation State Management

- `isNavigating` flag prevents concurrent navigation operations
- 100ms delay between navigation actions to prevent race conditions
- Pause/play button icon based on: `isNarrating && narrationEnabled && !isPaused`
- **Auto-resume behavior differs by button**:
  - ⬅️ Back / ➡️ Forward / ⏪ Restart: Auto-resume if `narrationEnabled` was true (lines 1065-1149)
  - ⏩ Skip All: Force stops completely, sets `narrationEnabled = false`, never resumes (lines 1152-1191)
- **Force stop critical**: `skipToEnd()` MUST set `narrationEnabled = false` FIRST before stopping audio, otherwise async loop continues to next chunk
- Voice commands: "skip all", "skip to end", "end" all trigger force stop (line 369)

## ~~AI Translation with Confidence Scoring~~ (DEPRECATED - Removed December 2024)

_AI translation has been removed. Commands are now sent directly to the game parser._

## ~~Unified Mode Toggle System~~ (DEPRECATED - Removed December 2024)

_AI mode toggle has been removed. All commands go directly to the game._

## Text Processing Split Architecture

- **Display text** (addGameText): Preserves formatting, wraps sentences for highlighting
- **TTS text** (speakTextChunked): Removes ALL newlines, collapses spaces, fixes pronunciation
- **Critical**: They process SEPARATELY - display ≠ what TTS speaks
- Spaced capitals auto-collapsed: `/\b([A-Z])\s+(?=[A-Z](?:\s+[A-Z]|\s*\b))/g`

## Scroll Behavior (December 20, 2024)

### Core Principles

1. **First display of any screen**: Scroll to top
   - When screen clears and new content appears, scroll to top of content
   - User should start reading from the beginning

2. **During narration**: Narration always controls scrolling
   - Keep currently-spoken text visible in viewport
   - Uses visual viewport API to account for mobile keyboard
   - When keyboard is up, scroll ensures text is above the keyboard
   - No user scroll delay - narration highlighting always controls position
   - Use smooth scrolling for less jarring experience

3. **After loading/restoring**: Scroll to bottom, skip narration
   - When restoring from save, scroll to bottom of restored content
   - User picks up where they left off
   - **Narration positioned at END** - don't read entire transcript
   - User can press Back to hear last chunk, or Restart to hear from beginning

4. **After command input**: Smart scroll to show new text
   - Always ensure TOP of new text remains visible
   - Scroll toward bottom if possible, but stop if new text top would scroll off-screen
   - Rule: `scrollDistance = min(scrollToBottom, scrollToShowNewTextTop)`

5. **When input field focused**: Scroll to bottom
   - Ensures command line is visible when typing
   - Consistent with chat/terminal UX patterns

### Implementation Details

**Scroll container**: `.container` element (or `#gameOutput` in some contexts)

**New text detection**: Track the element created by `addGameText()` - its top position marks where new content begins

**Smart scroll calculation for commands**:
```javascript
const newTextTop = newElement.getBoundingClientRect().top;
const containerRect = container.getBoundingClientRect();
const scrollToBottom = container.scrollHeight - container.clientHeight;
const scrollToShowTop = container.scrollTop + (newTextTop - containerRect.top);
container.scrollTop = Math.min(scrollToBottom, scrollToShowTop);
```

### Files

- `scroll.js` - Scroll utility functions
- `game-output.js` - Scroll on new content
- `highlighting.js` - Scroll during narration
- `save-manager.js` - Scroll after load
- `keyboard.js` - Scroll on input focus

## Highlight Behavior

- **Per-sentence highlighting**: Only currently-speaking sentence highlighted
- **Marker-based system**: Invisible `<span>` markers define chunk boundaries
- **CSS Highlight API**: Uses `CSS.highlights` for efficient highlighting
- Function `updateTextHighlight(chunkIndex)` handles all highlight updates

## Error Suppression

- **Browser TTS**: `interrupted` error silenced (happens on normal pause/stop)
- **Speech recognition**: `no-speech` and `network` errors silenced (cosmetic)
- Only unexpected errors shown to user

## Voice Transcript States

- **Interim**: Gray italic while speaking
- **Confirmed**: Purple background, bold, lingers 2 seconds
- **History**: Moves to scrolling history above, shows last 3 with fading opacity

## ~~Two-Panel Input Layout~~ (DEPRECATED - Removed December 17, 2024)

_Old two-panel input system has been removed. Now uses inline keyboard input at bottom of game output._

**Current Input System**:
- Single inline text input field at bottom of `lowerWindow`
- No separate input panels or areas
- Command history accessible via history button
- Voice commands work via keyboard shortcuts and voice recognition

## Pronunciation Dictionary System

- **Client-side**: localStorage-backed, editable via settings panel
- **Browser TTS**: Dictionary applied before text-to-speech synthesis
- **Auto-detection**: Spaced capitals "A N C H O R H E A D" → "Anchorhead" → Title case
- Settings panel (⚙️) allows adding/removing pronunciation fixes

## Settings System (December 20, 2024)

### Storage Hierarchy

Settings follow a three-tier inheritance model:

1. **Per-game overrides** (`gameSettings_{gameName}`) - Highest priority
   - Stored when user changes settings while playing a specific game
   - Only stores values that differ from defaults

2. **App defaults** (`iftalk_app_defaults`) - Medium priority
   - Set on welcome screen before any game is loaded
   - Inherited by all games that don't have their own overrides

3. **Hardcoded defaults** - Lowest priority
   - Fallback values in code (e.g., speechRate: 1.0)
   - Used when neither app defaults nor game settings exist

### Context-Aware UI

Settings panel adapts based on whether a game is loaded:

| Element | Welcome Screen | In-Game |
|---------|----------------|---------|
| Game section header | "🎮 App Defaults" | "🎮 {Game Name}" |
| Voice header | "🎙️ Default Voice" | "🎙️ Voice Settings" |
| Voice description | "Set default voice settings for all new games" | "Voice settings for {Game} (overrides defaults)" |
| Delete button | "Delete All App Data" | "Delete Game Data" |
| Save/Restore buttons | Hidden | Visible |
| Keep Awake toggle | Hidden | Visible |

### Delete Behavior

- **Welcome screen** ("Delete All App Data"):
  - Clears ALL localStorage keys: `iftalk_*`, `gameSettings_*`, `glkote_quetzal_*`, `zvm_autosave_*`
  - Removes app defaults and all game data
  - Returns app to fresh state

- **In-game** ("Delete Game Data"):
  - Clears ONLY current game: `gameSettings_{name}`, `iftalk_quicksave_{name}`, `iftalk_autosave_{name}`, etc.
  - Game reverts to using app defaults on next load
  - Other games unaffected

### Setting Save Behavior

When user changes a setting:
- **On welcome screen** → Saved to `iftalk_app_defaults`
- **In-game** → Saved to `gameSettings_{gameName}`

### localStorage Keys

| Key Pattern | Purpose |
|-------------|---------|
| `iftalk_app_defaults` | App-wide default settings (JSON) |
| `gameSettings_{name}` | Per-game setting overrides (JSON) |
| `iftalk_autosave_{name}` | Auto-save state for resume |
| `iftalk_quicksave_{name}` | Manual quick save |
| `iftalk_last_game` | Last played game path (for auto-resume) |
| `iftalk_custom_games` | User-uploaded game metadata |
| `glkote_quetzal_{name}` | GlkOte save format |

### Files

- `game-settings.js` - Storage API: `getGameSetting()`, `setGameSetting()`, `getAppDefault()`, `setAppDefault()`, `clearAllGameData()`, `clearAllAppData()`
- `settings.js` - UI: `updateSettingsContext()`, `isOnWelcomeScreen()`

## Save/Restore System (January 2026)

### Save Naming Convention

**All saves use `state.currentGameName` for consistency** (filename-based, not VM signature):

```javascript
state.currentGameName = gamePath.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
// Example: "games/lostpig.z8" → "lostpig"
```

**Why filename, not VM signature?**
- Available immediately (before VM loads)
- Consistent with custom game tracking
- Works for autosave checks on welcome screen
- VM signature requires parsing game file first

**All save types use the same naming:**
- Autosave: `iftalk_autosave_${state.currentGameName}`
- Quicksave: `iftalk_quicksave_${state.currentGameName}`
- Custom save: `iftalk_customsave_${state.currentGameName}_${saveName}`

### Save Data Structure

Each save (compressed with pako.gzip):
1. **Quetzal data** (VM state) - compressed, base64-encoded
2. **Display HTML** - status bar, upper window, lower window (100 turns max, compressed)
3. **Map data** (if auto-mapper used) - compressed
4. **Metadata** - timestamp, game name, signature, VoxGlk state

### Storage Estimates

- **Per save**: 15-50KB (compressed, varies by game progress)
- **Average**: ~30KB per save
- **LocalStorage limit**: 5MB (Safari) to 10MB (Chrome/Firefox)
- **Safe capacity** (50% buffer): ~2,560KB = **~85 total saves**
- **For 10 games**:
  - Auto/Quick system: 80 saves (8 per game: 1 autosave + 3 backups + 1 quicksave + 3 backups)
  - Custom saves: **~5 total** across all games (or **3-4 per game** if playing fewer games)

### Save Types

**Autosave** (1 per game):
- Saves automatically every turn
- Restored on game load
- Includes verification data (PC, stack depth, call stack depth)
- **Backups**: 3 timestamped backups created every 5 minutes

**Quicksave** (1 per game):
- Manual save via Quick Save button or 'S' key
- Loaded via Quick Load button or 'L' key
- **Backups**: 3 timestamped backups created on each quicksave

**Custom saves** (unlimited):
- Created via in-game SAVE command
- Loaded via in-game RESTORE command
- Includes custom save name
- **Backups**: 1 timestamped backup per custom save

### Complete localStorage Key Reference

| Key Pattern | Purpose |
|-------------|---------|
| `iftalk_app_defaults` | App-wide default settings (JSON) |
| `gameSettings_{name}` | Per-game setting overrides (JSON) |
| `iftalk_autosave_{name}` | Auto-save state for resume |
| `iftalk_quicksave_{name}` | Manual quick save |
| `iftalk_customsave_{name}_{saveName}` | Custom named saves |
| `iftalk_backup_autosave_{name}_{timestamp}` | Autosave backups (3 per game, every 5 min) |
| `iftalk_backup_quicksave_{name}_{timestamp}` | Quicksave backups (3 per game) |
| `iftalk_backup_{type}_{name}_{timestamp}` | Other save type backups (1 each) |
| `iftalk_last_game` | Last played game path (for auto-resume) |
| `iftalk_custom_games` | User-uploaded game metadata |

### Files

- `save-manager.js` - Core save/restore system: `autoSave()`, `autoLoad()`, `quickSave()`, `quickLoad()`, `customSave()`, `customLoad()`
- `game-loader.js` - Game loading and autosave detection
- `storage-api.js` - Storage operations with compression
