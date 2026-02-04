# Bug Fixes & Key Learnings History

## Status Bar Stale Characters in Theatre (Bug Fix - 2026-02-04)

**Bug**: Status bar displayed concatenated/mashed location names (e.g. "Sick Bayf Long Corridor" instead of "Sick Bay") after loading a saved game.

**Symptoms**:
- First move after load: location displays correctly
- Second move: previous location name bleeds through on the right side
- Subsequent moves: location names accumulate, especially visible when a short location name follows longer ones (short name doesn't overwrite the tail of the previous name)

**Root cause**: Theatre (z5) creates a 24-line TextGrid for its intro screen (`window id=4, gridheight=24`), then reuses that same window as a 1-line status bar during gameplay. The game writes only leading spaces + location name to line 0 and never calls `erase_window(1)` or `glk_window_clear`. In glkapi, each dirty line's full `chars` array (all `gridwidth` positions) is sent to the renderer — positions the game didn't write retain whatever was there before. All Theatre corridor locations share the "...of Long Corridor" suffix (~17 chars), so their tails perfectly mask each other. Only when visiting a short location like "Sick Bay" do positions ~34+ expose the stale tail from the previous longer name.

**Why `glk_window_clear` didn't work (first fix attempt)**: The initial fix used `glk_window_clear(win)` guarded by `win.gridheight === 1`. Theatre's window retains `gridheight=24` from when it was created for the intro screen — this value is never updated by the game. The guard blocked the clear entirely. Additionally, `glk_window_clear` is unsuitable here because (a) it clears ALL lines of the window, which would break multi-line upper windows in other games, and (b) it throws if a `line_request` is pending on the window.

**Fix** (`docs/js/game/voxglk.js`, in `sendInput()`): Before each line-mode input is sent to Glk, directly zero `win.lines[0].chars` (set every char to `' '`) and set `lines[0].dirty = true`. Only line 0 is touched, so multi-line upper windows in other games are unaffected. glkapi sends the full char array for every dirty line in its update, so the renderer sees a clean slate before the game writes the new location name.

**v3 vs v5+ status bars**: v3 games use `statuswin` (rock 202), created automatically by ifvms. ifvms's internal `v3_status()` writes `width` spaces first (clearing the line) then the location + score — no game code needed. v5+ games use `upperwin` (rock 203), created by the game via `split_window`, and are fully responsible for their own clearing. Theatre is z5 and doesn't clear.

**Key diagnostic detail**: `gridheight` on a glkapi window object is set at creation and never updated. The renderer correctly uses `content.lines.length` from each update (not `gridheight`) to distinguish a 1-line status bar from a multi-line upper window.

**Implementation files**:
- `docs/js/game/voxglk.js` (in `sendInput()`): Line-0 clearing before each turn, guarded by `type === 'line'`

---

## Mobile Keyboard Viewport Handling (Bug Fix - 2025-01-05)

**Bug**: Mobile keyboard appearance caused black space, content jumping, and poor UX

**Symptoms**:
- Black/white space appearing above or below keyboard during animation
- Content jumping to wrong position when keyboard opens
- Status bar scrolling off screen
- Bottom content becoming invisible
- Jarring transitions and flashing during keyboard animation

**Root cause**: Mobile browsers resize viewport when keyboard appears, but timing and scroll behavior were not properly synchronized

**Solution**: Multi-part fix using VisualViewport API

1. **Accurate viewport tracking**:
   - Use `visualViewport.height` instead of `window.innerHeight` or viewport units
   - Update CSS variable `--vh` based on visual viewport changes
   - Listen to `visualViewport` resize events for real-time updates

2. **Bottom-line pinning** (app.js:495-527):
   - Calculate position of bottom edge before resize: `bottomPosition = scrollTop + clientHeight`
   - After viewport shrinks, restore: `scrollTop = bottomPosition - newClientHeight`
   - Creates smooth "tracking" where bottom content stays pinned as viewport shrinks

3. **Optimized timing**:
   - 150ms debounce on viewport resize (prevents excessive updates during animation)
   - Instant scroll adjustment (0ms delay for responsive tracking)
   - Detect keyboard direction (opening vs closing) for different behavior

4. **Fixed positioning** (mobile.css:325-345):
   - HTML element: `position: fixed; top: 0; left: 0;`
   - Prevents document-level scroll and black space
   - Lock document scroll at (0,0) on every viewport change
   - Game content maintains independent scroll container

**Key insight**: The "tracking" effect comes from continuous viewport updates (every 150ms during keyboard animation) with instant scroll adjustments. This creates smooth bottom-pinning without transitions or delays.

**Result**: Buttery smooth keyboard appearance with no flashing, jumping, or black space

**Implementation files**:
- `docs/js/app.js` (lines 489-534): VisualViewport tracking and bottom-line pinning
- `docs/styles/mobile.css` (lines 324-345): Fixed positioning and overflow control
- `docs/js/input/keyboard/keyboard-core.js` (lines 623-630): Keyboard state detection

## Chunk Creation Separation (Bug Fix - 2025-12-12)

**Bug**: After "skip to end", new text (e.g., from "more" command) had disabled navigation buttons

**Root cause**: Chunks only created when `speakTextChunked()` ran, but skip-to-end set `narrationEnabled = false`, so chunks never created

**Fix**: Extracted chunk creation into separate `createNarrationChunks()` function

**New behavior**:
- Chunks ALWAYS created when new text arrives, regardless of narration state
- `narrationEnabled` now only controls auto-play, not chunk creation
- Navigation buttons now work properly even when narration is disabled

## Stale Audio Race Condition (Bug Fix - 2025-12-12)

**Bug**: When navigating during audio loading, wrong audio would play (e.g., chunk 2's audio playing for chunk 3)

**Root cause**: Socket 'audio-ready' handler would receive ANY audio response, including stale ones from cancelled chunks

**Fix**: `stopNarration()` now calls `socket.off('audio-ready')` to clear ALL pending audio handlers (line 559)

**Scenario prevented**:
1. Chunk 2 requests audio from server
2. User navigates → cancels → chunk 3 starts
3. Old audio from chunk 2 arrives → ignored (handler removed)
4. Chunk 3 requests its own audio → plays correctly

## Voice Command Processing (lines 176-278)

**hasProcessedResult flag**: Only set in `onend` AFTER sending, not in `onresult`

**Bug fix**: Was setting true in `onresult`, preventing auto-send in `onend`

**Behavior**:
- Voice commands (restart/back/stop/pause/play/skip) NEVER sent to IF parser
- During narration, all non-navigation speech is ignored

## Manual Typing Protection (Bug Fix - 2025-12-12)

**Bug**: Voice recognition auto-send would send manually-typed text when recognition ended

**hasManualTyping flag**: Set to `true` on any keydown (except Enter), prevents auto-send

**Implementation**:
- Voice sets input: Flag cleared when voice recognition populates input box (line 234, 239)
- After sending: Flag cleared in both `sendCommand()` (line 1423) and `sendCommandDirect()` (line 1372)
- **Behavior**: If user types anything manually, they MUST press Enter to send (no auto-send)
