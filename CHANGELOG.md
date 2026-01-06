# IFTalk Changelog

## January 2025

### January 5, 2025 - Upper Window Narration Fixes (v1.4.61)

**Fixed multiple issues with upper window narration in Photopia and similar games**

**Issue 1: Narration not starting when content is only in upper window**
- Clicking "Start" when there was no lower window content (main scrolling text) would not trigger narration
- Fixed by ensuring `ensureChunksReady()` runs regardless of lower window content presence
- **File changed:** `docs/js/app.js` (lines 877-905)

**Issue 2: Old transcript being re-narrated after upper window updates**
- When moving from a page with lower window content to a page with only upper window content, old game-text elements remained in the DOM
- This caused narration to play upper window content, then old lower window content from previous page
- Fixed by clearing stale lower window game-text elements when upper window updates without main content
- **File changed:** `docs/js/game/voxglk.js` (lines 578-589)

**Issue 3: Sentences not chunking when ending with quoted punctuation**
- Regex for inserting chunk markers only matched punctuation followed by whitespace, `<`, or end of string
- Missed punctuation followed by quotation marks (e.g., 'together."')
- This caused sentences in quoted dialog to not be properly chunked and highlighted
- Fixed by including trailing quotes in the punctuation capture group: `([.!?…]["']*)`
- This ensures quotes are included in the chunk, not split off as separate chunks (which TTS would read as "quote")
- **File changed:** `docs/js/narration/chunking.js` (line 57)

**Issue 4: hasMainContent incorrectly true for blank-line-spacer divs**
- VM sends blank-line-spacer divs in mainWindowHTML when transitioning to upper-window-only scenes
- Old code checked `hasMainContent = mainWindowHTML.trim()` which was truthy (has HTML)
- But blank-line-spacer divs have no actual text content - they're just whitespace
- This prevented clearing code from running: `hasUpperWindowContent && !hasMainContent` was always false
- Fixed by checking textContent instead of raw HTML - blank spacers now correctly evaluate as empty
- **File changed:** `docs/js/game/voxglk.js` (lines 558-566, 592-605)

### January 5, 2025 - Mobile Keyboard Viewport Fix (v1.4.59)

**Fixed mobile keyboard viewport handling for smooth UX**

1. **VisualViewport API Integration**
   - Uses `visualViewport.height` to accurately track available space when keyboard appears
   - Dynamically updates CSS variable `--vh` based on visual viewport changes
   - Prevents black space and content jumping during keyboard animations

2. **Bottom-Line Pinning**
   - Game content at the bottom of viewport stays pinned when keyboard opens
   - Calculates bottom position before resize, maintains it after
   - Creates smooth "tracking" effect as viewport shrinks

3. **Optimized Timing**
   - 150ms debounce on viewport resize prevents excessive updates during animation
   - Instant scroll adjustment (0ms) for responsive bottom-line tracking
   - Different behavior for keyboard opening vs closing (delayed vs immediate)

4. **Fixed Positioning**
   - HTML element uses `position: fixed` to prevent document-level scrolling
   - Document scroll locked at (0,0) to eliminate black space below keyboard
   - Game content maintains independent scroll container

**Result:** Buttery smooth keyboard appearance with no flashing, jumping, or black space. Content stays visible and properly positioned throughout the animation.

### January 5, 2025 - Journey-Based Auto-Mapper (v1.4.57)

1. **Simplified Auto-Mapper Architecture**
   - Auto-mapper now stores only journey data (location sequence + commands)
   - Removed redundant locations and connections Maps
   - Journey is single source of truth for exploration history
   - Reduced save file complexity and size

2. **Journey Transfer to Map Canvas**
   - Journey is replayed with spatial positioning when map first opens
   - Direction commands (n, s, e, w, up, down, etc.) map to pixel offsets
   - Journey automatically cleared after transfer to map canvas
   - Keeps journey bounded and save files small

3. **Improved Service Worker Updates**
   - Enabled `skipWaiting()` and `clients.claim()` for immediate updates
   - No longer need to close all tabs for updates to apply
   - "Reset Game" now always loads current version
   - Hard refresh no longer required for version updates

4. **Spatial Positioning from Journey**
   - Replays journey entries in order to calculate node positions
   - Uses direction offsets: cardinals (120px), verticals (180px + 60px offset), portals (diagonal)
   - Unknown commands use last known direction or portal offset as fallback
   - Properly preserves map layout when restoring from save

### January 2, 2025 - Small Nodes & Icons (v1.4.20)

1. **Small Nodes**
   - Toggle "Small node" in node sheet to reduce size to 60%
   - Small nodes fade out when zooming out (below 0.6x scale)
   - Useful for minor locations or details

2. **New Icon System**
   - Default icon is now blank (no icon) for standard locations
   - Available icons: Person, Door, Puzzle, Star, Question
   - Removed old room/outdoor/shop/danger icons

### January 2, 2025 - Connection Editing (v1.4.19)

1. **Arrows Now Opt-In**
   - Arrows are no longer shown by default on any connections
   - Toggle arrows manually via the connection list in the node sheet
   - Use arrows to indicate one-way paths in the game

2. **Connection Color by Provenance**
   - Auto-mapped connections use the connection type color (blue/purple/yellow)
   - Player-created connections are always purple (#8b5cf6)
   - Removed midpoint marker - color alone distinguishes player vs auto connections

### January 2, 2025 - Auto-Mapper Improvements (v1.4.18)

1. **Grid-Based Direction Offsets**
   - Diagonals now use proper grid math: NW = N + W = (-100, -100)
   - Up/down are now straight vertical (0, ±150) instead of diagonal offset
   - Creates more predictable, aligned map layouts

2. **Smarter Duplicate Detection**
   - Uses position-based matching to determine if same-named location is truly a duplicate
   - If expected position (based on direction) matches existing node, adds edge instead of duplicate
   - Only creates duplicate when positions don't match (likely different room with same name)

3. **Duplicate Node UX Improvements**
   - Duplicate nodes now show as **current location** (green) when player arrives there
   - Added **"Not a Duplicate"** button to unmark false positives
   - Keeps the node as a separate location with the same name
   - Merge and Not-Duplicate buttons shown side-by-side

4. **Visual Indicator Cleanup**
   - Removed redundant "Your edit" badge (dashed border already shows edits)
   - Simplified badge priority system (merge conflict > notes > edited)

5. **Bug Fixes**
   - Fixed `isDuplicate` variable rename causing render crashes
   - Added validation for corrupted localStorage data (NaN coordinates, invalid viewport)
   - Added retry mechanism for starting location detection

### January 1, 2025 - Name-Based Auto-Mapper (v1.4.17)

5. **Name-Based Location Tracking** (v1.4.17)
   - **Removed VM memory reading** - No longer scans object tables or reads global variables
   - Uses **status bar text** to identify locations (room name only)
   - Avoids exposing internal object IDs to the user
   - Works consistently across all Z-machine versions
   - Files: `docs/js/features/auto-mapper.js`, `docs/js/game/voxglk.js`

6. **Duplicate Location Handling** (v1.4.17)
   - When same room name is reached via different route, creates a **potential duplicate** node
   - Duplicates shown in **orange** with `?` badge for easy identification
   - Placed close to original node for easy comparison
   - **Merge button** in node sheet combines duplicates with original
   - Transfers all connections when merging
   - Files: `docs/js/features/map-canvas.js`, `docs/js/features/map-render.js`, `docs/js/features/map-sheet.js`

7. **Duplicate Visual Indicators**
   - Orange fill color for potential duplicates
   - Yellow dashed border
   - Question mark badge in corner
   - Orange label background
   - Original node also marked with `?` when it has duplicates

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
