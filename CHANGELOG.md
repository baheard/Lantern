# IFTalk Changelog

## January 2025

### January 1, 2025 - Auto-Mapper & Map Canvas

1. **Auto-Mapper Z-machine v5+ Support** (v1.4.12 - v1.4.15)
   - Fixed location detection for Z-machine v5+ games (Dreamhold, etc.)
   - **Method 1**: Global variable 0 (works for Z-machine v3)
   - **Method 2**: Player object scanning (works for v5+)
     - Scans object table for player names: "yourself", "(self object)", "self", "cretin", "player"
     - Gets player's parent object as current room
   - Object table layout differs by version: v3 = 9 bytes/entry, v4+ = 14 bytes/entry
   - Removed hash-based status bar fallback (could cause incorrect merging of same-named rooms)
   - Files: `docs/js/features/auto-mapper.js`, `docs/js/game/voxglk.js`

2. **Starting Location Detection** (v1.4.14)
   - Added delayed initial location check (500ms after game load)
   - Moved `checkLocationChange()` call to after render for proper timing
   - Ensures starting room appears on map without requiring movement
   - File: `docs/js/features/auto-mapper.js`

3. **Map Canvas UX Improvements** (v1.4.16)
   - **Controls stay visible** during panning/pinch-zoom (removed auto-hide)
   - **Tap legend to collapse** (not just close button)
   - **Double-tap to add node** on empty canvas
     - 300ms tap window, 30px distance threshold
     - Added `hasDragged` state to distinguish taps from pans
   - Files: `docs/js/features/map-handlers.js`, `docs/js/features/map-canvas.js`, `docs/js/features/map-config.js`

4. **Connection Editing** - Via node edit sheet
   - Tap node → Connections section shows all edges
   - Change connection type (Cardinal/Vertical/Portal) via dropdown
   - Delete connections via × button
   - File: `docs/js/features/map-sheet.js`

## December 2024

### December 15, 2024 - Core Fixes

1. **TTS/Narration Fixed** - Removed Socket.IO dependency, now uses browser `speechSynthesis` directly
   - File: `docs/js/narration/tts-player.js`
   - TTS no longer hangs on Socket.IO promises
   - Faster response time (no server round-trip)

2. **Socket.IO Removed** - Completely eliminated legacy Socket.IO infrastructure
   - Files: `docs/js/app.js`, `docs/js/core/socket.js`, `docs/js/game/saves.js`
   - App now runs in pure browser mode
   - No server dependencies for game logic or TTS

3. **Game Loading Fixed** - Resolved initialization hang
   - File: `docs/js/core/socket.js`
   - Made Socket.IO optional (returns null if not loaded)
   - App initialization now completes successfully

4. **Generation Counter Fixed** - Resolved command rejection issue
   - File: `docs/js/game/game-loader.js`
   - Track generation from GlkOte events instead of manual counter
   - Commands now accepted properly by ZVM

5. **VM Start Timing Fixed** - Resolved DOM initialization race condition
   - File: `docs/js/game/game-loader.js`
   - Use `requestAnimationFrame` instead of `setTimeout`
   - Prevents "Cannot read properties of null" error

6. **ifvms.js Updated to 1.1.6** - Upgraded from 2017 version
   - File: `docs/lib/zvm.js`
   - Fixes read opcode handling in Z-Machine v3-4
   - Better game compatibility (upper window input, screen height measurement)
   - Performance improvements and bug fixes
   - Previous version backed up as `zvm.js.backup.2017`

### December 16, 2024 - UX & Feature Improvements

1. **Comprehensive TTS Logging** - Added detailed logging throughout TTS pipeline
   - Files: `docs/js/narration/tts-player.js`, `docs/js/app.js`, `docs/js/ui/game-output.js`
   - Logs speech synthesis events, chunk creation, voice configuration
   - Easier debugging of narration issues

2. **Microphone Muted by Default** - Changed default mic state
   - File: `docs/js/core/state.js:24`
   - `isMuted: true` - mic starts muted, user must enable
   - Prevents accidental voice input on page load

3. **Upper Window Text Narration** - Fixed missing quote/formatted text narration
   - File: `docs/js/ui/game-output.js:84-107`
   - Now includes upper window content (quotes, ASCII art) in narration chunks
   - Narration order: Status bar → Upper window → Main content

4. **Autoplay Fixes** - Fixed autoplay not respecting off state
   - Files: `docs/js/narration/navigation.js`, `docs/js/app.js`, `docs/js/core/state.js`
   - Fixed restart button auto-starting when autoplay off
   - Fixed new page auto-starting when autoplay off
   - Added state tracking with logging for debugging
   - Navigation only resumes if actively playing, not just based on autoplay

5. **Settings Panel Fixed** - Fixed settings button not opening panel
   - Files: `docs/js/ui/settings.js:20,29`, `docs/index.html:22`
   - Changed from `hidden` class to `open` class to match CSS
   - Panel now slides in/out smoothly from right

6. **Speech Speed Control** - Added adjustable speech rate slider
   - Files: `docs/index.html:74-81`, `docs/styles.css:304-362`, `docs/js/ui/settings.js:69-95`
   - Range: 0.5x - 1.5x speed (default 1.0x)
   - Slider with real-time preview
   - Saved to localStorage

7. **Collapsible Settings Sections** - Made all settings sections expandable
   - Files: `docs/index.html`, `docs/styles.css:264-302`, `docs/js/ui/settings.js:58-67`
   - All sections start collapsed
   - Click header to expand/collapse
   - Smooth animations with arrow indicators
   - Minimal 4px spacing between sections

8. **Push-to-Talk Key Changed** - Changed from Alt to Ctrl
   - Files: `docs/js/app.js:323,355`, `docs/index.html:61`
   - Alt key caused browser menu focus issues
   - Ctrl key works without interfering with browser

9. **Voice Commands Cleanup** - Removed AI translation reference
   - File: `docs/index.html:54`
   - Removed outdated "Any other speech - AI translates to command" line

10. **Auto-scroll to Highlight** - Screen scrolls to currently highlighted text
    - File: `docs/js/narration/highlighting.js:148-221`
    - Finds next visible element after invisible marker
    - Centers highlighted text in viewport
    - Smooth scroll animation

11. **Title Chunking** - Asterisk-wrapped titles split into separate chunks
    - File: `docs/js/narration/chunking.js:24-27`
    - Regex detects `* TITLE *` patterns
    - Creates chunk boundaries before and after titles
    - Enables separate narration of section headers

### December 17, 2024 - Keyboard Input System Overhaul

1. **Removed Old Input System** - Eliminated placeholder input/textarea UI
   - Files: `docs/js/app.js`, `docs/js/core/dom.js`, `docs/js/game/game-loader.js`
   - Removed: `userInput`, `sendBtn`, `inputArea`, `commandHistoryBtn` elements
   - Removed event listeners for old input elements
   - Cleaned up focus and placeholder manipulation code

2. **New Inline Keyboard Input** - Real text input with styled prompt
   - Files: `docs/js/input/keyboard.js`, `docs/index.html`, `docs/styles.css`
   - Text input field with `>` prompt positioned as visual decoration
   - Native browser cursor for editing
   - Click anywhere in game area to focus input
   - Auto-focus when input becomes visible
   - Supports full text editing (click, select, arrow keys, etc.)

3. **Input Mode Detection** - Different behavior for line vs char input
   - File: `docs/js/input/keyboard.js`
   - **Line mode**: Shows input field with `>` prompt for typing commands
   - **Char mode**: Hides input entirely, any key advances from anywhere
   - Polls input type every 100ms to update visibility
   - Prevents flash on mode transitions

4. **Echo Suppression** - Detects and skips game command echoes
   - File: `docs/js/ui/game-output.js`
   - Detects `glk-input` styled echoes (blue command text)
   - Skips display of echoed commands from game
   - User sees command in input field, not duplicated in output
   - Comprehensive pattern matching for various echo formats

5. **Command Display Cleanup** - Removed manual command echo
   - File: `docs/js/game/commands.js`
   - No longer displays user commands with `addGameText()`
   - Commands saved to history only
   - Game handles all output display

6. **Focus Behavior** - Improved keyboard accessibility
   - File: `docs/js/input/keyboard.js`
   - Input auto-focuses when visible (line mode)
   - Clicking game content focuses input (unless selecting text)
   - Typing anywhere focuses input automatically
   - No focus flash or jarring transitions

7. **Styling** - Clean visual integration
   - File: `docs/styles.css`
   - `>` prompt positioned absolutely inside input area

8. **Autosave System Investigation** - Researched ifvms.js built-in autosave
   - **Critical Finding**: ifvms.js autosave ONLY works for Glulx games, NOT Z-machine games
   - Root cause: `save_allstate()` in glkapi.js requires GiDispa (Glulx dispatch layer)
   - GiDispa is null for Z-machine games (Lost Pig, Anchorhead, Zork, etc.)
   - Error: `Cannot read properties of null (reading 'get_retained_array')`
   - **Solution**: Confirmed custom save-manager.js is the correct approach for Z-machine
   - File: `docs/js/game/game-loader.js:82` - Set `do_vm_autosave: false`
   - File: `docs/js/game/voxglk.js:335-348` - Restored manual autoSave() calls
   - Files modified but reverted: `docs/lib/dialog-stub.js`, `docs/lib/glkapi.js`
   - **Documentation**: Updated `reference/save-restore-research.md` with findings
   - See: [Save/Restore Research](reference/save-restore-research.md#critical-finding-z-machine-vs-glulx-autosave-support)

9. **Autosave/Restore Completed** - Fully functional with "bootstrap" technique
   - **The Problem**: After `restore_file()`, VM memory restored but VM frozen (not running)
   - **The Solution**: "Wake" VM by fulfilling intro's pending char input request
   - Files: `docs/js/game/voxglk.js`, `docs/js/game/save-manager.js`
   - **How it works**:
     1. Game starts, intro shows char input request at gen: 1
     2. autoLoad() restores VM memory + VoxGlk state + display HTML
     3. Send char input with `gen: 1` to fulfill intro's pending request
     4. VM wakes up, processes input in restored state
     5. VM sends fresh update with line input at restored generation
     6. User can send commands normally
   - **Why this works**: Uses intro's char request as "bootstrap trigger" to wake frozen VM
   - **Failed alternatives**: vm.run() (conflicts), cancel input (doesn't help), no wake (VM stays frozen)
   - **Key insight**: Must use `gen: 1` (intro's generation), not restored generation (e.g., 5)
   - **Result**: Clean restore with no error messages, commands work immediately
   - **Documentation**: Updated `reference/save-restore-status.md` with complete details

### December 18, 2024 - Per-Game Settings System

1. **Organized Per-Game Settings** - Centralized storage for game-specific preferences
   - Files: `docs/js/utils/game-settings.js` (new), `docs/js/ui/settings.js`, `docs/js/game/game-loader.js:13,31`
   - Settings stored as JSON objects in localStorage: `gameSettings_LostPig`, `gameSettings_Anchorhead`, etc.
   - Each game remembers its own: narrator voice, app voice, speech rate
   - Settings automatically reload when switching games
   - Default fallback when no game-specific settings saved
   - **Extensible architecture** ready for future per-game preferences:
     - Current: narratorVoice, appVoice, speechRate
     - Future: autoplay, highlightColor, fontSize, etc.
   - Clean API:
     - Settings: `getGameSetting()`, `setGameSetting()`, `loadGameSettings()`, `reloadSettingsForGame()`
     - Data management: `getGameData()`, `hasGameData()`, `clearAllGameData()`, `listAllGames()`
   - **Save data kept separate** (performance/size) but **logically grouped** via helper functions
   - Helpers manage settings + saves together: `clearAllGameData('lostpig')` removes settings, quicksave, and glkote save
   - Separation of concerns: game-settings.js (storage) → settings.js (UI) → game-loader.js (triggers)
   - Status messages show game name when changing settings: "Narrator voice: Karen (lostpig)"
