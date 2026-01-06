# Bug Fixes & Key Learnings History

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
