# Tap-to-Examine Feature

**Status**: Implemented with Settings Toggle
**Last Updated**: December 23, 2024

## Overview

The tap-to-examine feature allows users to tap/click on words in the game text to automatically build commands in the input field. This provides an intuitive, mobile-friendly way to interact with Interactive Fiction games.

**User Control**: The feature can be enabled/disabled via a global setting in the settings panel (available on both desktop and mobile). Disabled by default to allow traditional text selection.

## Settings

**Location**: Settings Panel → "Tap to Examine" toggle
**Default**: Disabled (OFF)
**Scope**: Global setting (applies to all games)
**Storage**: `localStorage` key: `iftalk_tap_to_examine`

**Visual Indicators**:
- Help icon (ⓘ) with tooltip: "Tap or click words in the game text to automatically build commands"
- Cursor changes based on state:
  - **Enabled**: Default cursor (indicates tap-to-examine active)
  - **Disabled**: Text I-beam cursor (indicates text selection mode)

## How It Works

### User Experience

**Command Building Behavior** (when enabled)

- User hovers over words → subtle blue highlight appears (desktop only)
- User taps/clicks on a word (not scrolling):
  - **Common verbs** (look, take, x, etc.): Just the verb with space after, cursor at end
  - **Direction words** (north, south, etc.): `"go direction"` with "go" selected
  - **Regular words** (objects): `"x word"` with "x" selected
  - **Additional words**: Appended to existing command, prefix stays selected (if present)
- User can immediately type to replace the prefix anytime
- User can press Enter to execute command with current prefix
- User taps on whitespace → command input is cleared
- **Text selection works**: Press-and-hold or click-and-drag to select text for copying

**Examples:**

| Action | Result | Cursor/Selection |
|--------|--------|------------------|
| Click "take" | `"take "` | Cursor at end |
| Click "take", then "lamp" | `"take lamp"` | none |
| Click "look" | `"look "` | Cursor at end |
| Click "lamp" | `"x lamp"` | "x" selected |
| Click "lamp", then "pig" | `"x lamp pig"` | "x" still selected |
| Click "lamp", type "take" | `"take lamp"` | none (replaced) |
| Click "north" | `"go north"` | "go" selected |
| Click "north", then "quickly" | `"go north quickly"` | "go" still selected |
| Click whitespace | `""` (cleared) | none |
| Press-and-hold word | Text selection UI | - |

**Key Principles:**
- **User-controlled** - can be enabled/disabled in settings (default: disabled)
- **Smart word detection**:
  - Common verbs (look, take, x, get, etc.) - no prefix, cursor at end
  - Directions (north, south, up, down, etc.) - "go" prefix
  - Objects (lamp, pig, etc.) - "x" prefix
- **Additive building** - clicking multiple words builds up the command
- **Prefix stays selected** - "x" or "go" remains selected for easy verb replacement
- **Scroll detection** - dragging > 10px is treated as scrolling, not tapping (industry standard threshold)
- **Text selection works** - native text selection available when feature disabled
- **Click whitespace clears** - clicking non-word area clears the entire input (when enabled)
- **Works in line mode only** - feature only active when expecting line input
- **No auto-scroll** - page stays put when selecting words (no scroll-to-bottom)
- **Cursor indicates state**:
  - Enabled: default cursor (tap-to-examine active)
  - Disabled: text I-beam cursor (selection mode)

### Visual Feedback

**Desktop (with hover capability):**
- Hovering over words: Subtle blue transparent highlight (rgba(0, 170, 255, 0.12))
- Default cursor throughout (no cursor changes)
- Highlighting active in line input mode only

**Mobile/Touch Devices:**
- No hover highlighting (disabled to prevent artifacts)
- Default cursor throughout
- Word selection still works on tap

**In Char Input Mode:**
- No highlighting (feature disabled in char mode)

## Technical Implementation

### Architecture

**Files:**
- `docs/js/input/keyboard.js` - Main click/hover handling logic, scroll detection
- `docs/js/input/word-extractor.js` - Word extraction utility
- `docs/js/app.js` - Settings initialization, help tooltip handler
- `docs/index.html` - Settings UI (toggle + help tooltip)
- `docs/styles.css` - Cursor states, help tooltip, toggle switch

### Core Components

#### 1. Word Extraction (`word-extractor.js`)

Uses browser APIs to find words at cursor coordinates:

```javascript
export function extractWordAtPoint(x, y) {
  // 1. Get caret position from coordinates
  //    - Chrome/Safari: document.caretRangeFromPoint()
  //    - Firefox: document.caretPositionFromPoint()

  // 2. Find text node and character offset

  // 3. Expand to word boundaries (letters, numbers, hyphens, apostrophes)

  // 4. Verify click is inside word's bounding box
  //    (prevents selecting words when clicking trailing whitespace)

  // 5. Return { word, element, range }
}
```

**Word Character Definition:**
- Letters (a-z, A-Z)
- Numbers (0-9)
- Hyphens (-)
- Apostrophes (')

**Sanitization:**
- Removes leading/trailing punctuation
- Preserves mid-word hyphens and apostrophes
- Examples: `"lamp,"` → `"lamp"`, `"north-east"` → `"north-east"`

#### 2. Click/Tap Handling (`keyboard.js`)

Uses `mouseup`/`touchend` with `touchstart`/`mousedown` tracking:

```javascript
const handleTouchStart = (e) => {
  // Track start position for scroll detection
  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
  touchStartX = clientX;
  touchStartY = clientY;
};

const handleGameClick = (e) => {
  // Get coordinates (works for both mouse and touch)
  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

  // 1. Only in line input mode
  if (getInputType() !== 'line') return;

  // 2. Check if feature is enabled
  const isTapExamineEnabled = localStorage.getItem('iftalk_tap_to_examine') === 'true';
  if (!isTapExamineEnabled) return;

  // 3. Detect scrolling - if moved > 10px, user was scrolling
  // Using industry standard threshold (10px) to distinguish tap from scroll
  if (touchStartX !== null && touchStartY !== null) {
    const deltaX = Math.abs(clientX - touchStartX);
    const deltaY = Math.abs(clientY - touchStartY);
    if (deltaX > 10 || deltaY > 10) return; // Scrolling, not tapping
  }

  // 4. If user selected text, don't process (allows copying)
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) {
    const isGameTextSelection = lowerWindow?.contains(selection.anchorNode);
    if (isGameTextSelection) return;
  }

  // 5. Extract word at tap/click point
  const wordData = extractWordAtPoint(clientX, clientY);

  if (wordData?.word) {
    e.preventDefault();
    e.stopPropagation();
    populateInputWithWord(wordData.word);
  } else {
    e.preventDefault();
    e.stopPropagation();
    messageInputEl.value = '';
    messageInputEl.focus();
  }
}
```

**Key Features:**
- Tracks touch/mouse start position to detect scrolling vs tapping
- Checks localStorage setting before processing
- Ignores drags > 50px (scrolling on mobile)
- Checks for existing text selection - if found, ignores (allows copying)
- Works on both desktop (mouse) and mobile (touch)
- Only prevents default when actually processing a word
- Focuses input and scrolls into view (mobile keyboard visibility)

#### 3. Hover Highlighting (`keyboard.js`)

Real-time word highlighting on `mousemove` (desktop only):

```javascript
const handleGameMouseMove = (e) => {
  // Disable hover highlighting on touch devices (prevents artifacts)
  const isTouchDevice = mqCoarse.matches && !mqHover.matches;
  if (isTouchDevice) {
    hideHighlight();
    return;
  }

  // Only in line input mode
  if (getInputType() !== 'line') {
    hideHighlight();
    return;
  }

  const wordData = extractWordAtPoint(e.clientX, e.clientY);

  if (wordData?.word) {
    // Show blue highlight overlay
    const rect = wordData.range.getBoundingClientRect();
    highlightOverlay.style.left = rect.left + 'px';
    highlightOverlay.style.top = rect.top + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
    highlightOverlay.style.display = 'block';
    // No cursor change - use default
  } else {
    hideHighlight();
  }
}
```

**Highlight Overlay:**
- Fixed position `<div>` overlaid on word
- Subtle blue transparent background: `rgba(0, 170, 255, 0.12)`
- No transition (instant positioning to avoid "flying" effect)
- `pointer-events: none` (doesn't interfere with clicks)
- **Disabled on touch devices** to prevent mobile artifacts

#### 4. Input Population Logic

```javascript
const directions = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
  'up', 'down', 'u', 'd',
  'in', 'out'
];

function populateInputWithWord(word) {
  const wordLower = word.toLowerCase();
  const currentValue = messageInputEl.value.trim();

  if (currentValue === '') {
    // Empty input - add prefix
    const isDirection = directions.includes(wordLower);
    const prefix = isDirection ? 'go' : 'x';
    messageInputEl.value = `${prefix} ${word}`;
    messageInputEl.setSelectionRange(0, prefix.length);
  } else {
    // Input has content - append word and keep prefix selected
    let prefixLength = 0;
    if (currentValue.startsWith('go ')) prefixLength = 2;
    else if (currentValue.startsWith('x ')) prefixLength = 1;

    // Append the new word
    messageInputEl.value = `${currentValue} ${word}`;

    // Re-select the prefix if it exists
    if (prefixLength > 0) {
      messageInputEl.setSelectionRange(0, prefixLength);
    }
  }

  messageInputEl.focus();
}
```

**Smart and Additive:**
- Detects direction words for smart defaults (first word only)
- Appends additional words instead of replacing
- Keeps prefix ("x" or "go") selected after appending
- User can type anytime to replace prefix
- No state tracking or cycling needed

### Browser Compatibility

| Browser | API Used | Status |
|---------|----------|--------|
| Chrome/Edge | `document.caretRangeFromPoint()` | ✅ Supported |
| Safari | `document.caretRangeFromPoint()` | ✅ Supported |
| Firefox | `document.caretPositionFromPoint()` | ✅ Supported (fallback) |

## Known Issues & Gotchas

### 1. Event Bubbling (RESOLVED)

**Previous Problem:** Both `lowerWindow` and `gameOutput` had click handlers. Since `lowerWindow` is inside `gameOutput`, events bubbled and fired twice, causing scroll detection to fail on the second handler.

**Solution (v2.4):** Removed `gameOutput` event listeners entirely. Only `lowerWindow` has listeners now, eliminating the bubbling issue.

### 2. Text Selection vs Word Click

**Problem:** Need to distinguish between:
- Text selected in command input (should allow word clicks)
- Text selected in game output (user copying, should ignore clicks)

**Solution:** Check if selection anchor is within `messageInputEl`. Only ignore click if selection is in game text, not in input field.

### 3. Whitespace Selection

**Problem:** Clicking whitespace after a word would select that word because `caretRangeFromPoint()` places caret at word boundary.

**Solution:** After finding a word, verify the click coordinates (x, y) are actually inside the word's bounding rectangle:

```javascript
const wordRect = wordRange.getBoundingClientRect();
if (x < wordRect.left || x > wordRect.right ||
    y < wordRect.top || y > wordRect.bottom) {
  return null; // Click outside word bounds
}
```

### 4. Duplicate Word Highlighting

**Problem:** If text contains duplicate words (e.g., "floor" appears twice), using `indexOf()` would always highlight the first occurrence.

**Solution:** Don't search for the word string. Instead, use the exact `Range` object returned by `extractWordAtPoint()` which has the precise text node position.

### 5. Hover Animation "Flying"

**Problem:** CSS `transition: all 0.05s ease` on highlight overlay caused it to animate between distant words, creating a "flying" effect.

**Solution:** Remove transition entirely. Highlight jumps instantly to new words.

### 6. Mobile Hover Artifacts

**Problem:** Touch devices trigger `mousemove` events differently, causing highlight to appear and stick after taps, creating visual artifacts.

**Solution:** Detect touch devices using media queries (`pointer: coarse` + no `hover: hover`). Disable hover highlighting entirely on touch devices. Word selection still works via tap.

### 7. Text Overlay Alignment

**Problem:** Initial implementation tried to render blue text on top of the word. Font rendering differences made alignment imperfect.

**Solution:** Use transparent blue background instead of text overlay. Background aligns perfectly via bounding box.

## Performance Considerations

### Mousemove Throttling

**Current:** No throttling - runs on every mousemove event

**Potential Optimization:**
- Throttle mousemove handler to ~60fps (16ms)
- Use `requestAnimationFrame()` for smooth updates
- Only update if word actually changed

**Why Not Implemented:**
- Word extraction is fast (<1ms typically)
- Performance is acceptable on tested devices
- Premature optimization avoided

### Memory

**Overlay Element:**
- Single reusable `<div>` created once
- Not destroyed/recreated on each hover
- Minimal memory footprint

## Testing Checklist

### Basic Behavior
- [ ] First click on word → shows command with prefix in input
- [ ] Click on whitespace → input cleared
- [ ] Click in char mode → no word extraction
- [ ] Text selection active → no word extraction

### Word Extraction
- [ ] Single word in main text → extracts correctly
- [ ] Word in emphasized/styled span → works
- [ ] Hyphenated word → preserves hyphen
- [ ] Word with punctuation → strips trailing punctuation
- [ ] Click on whitespace → clears input
- [ ] Click on punctuation → clears input

### Command Building
- [ ] Click "lamp" → input shows "x lamp" with "x" selected
- [ ] Click "lamp", then "pig" → input shows "x lamp pig" with "x" still selected
- [ ] Click "lamp", then "pig", then "quickly" → "x lamp pig quickly" with "x" selected
- [ ] Click "lamp" then type "take" → input shows "take lamp" (replaces "x")
- [ ] Click "lamp", click "pig", type "take" → "take lamp pig" (replaces "x")
- [ ] Click "lamp" then press Enter → sends "x lamp" command
- [ ] Click "north" → input shows "go north" with "go" selected
- [ ] Click "north", then "quickly" → "go north quickly" with "go" still selected
- [ ] Click "north" then type "x" → input shows "x north" (replaces "go")
- [ ] Directions use "go": n, s, e, w, ne, nw, se, sw, north, south, east, west, up, down, in, out
- [ ] Regular words (enter, exit, lamp, etc.) use "x" prefix
- [ ] Typing replaces the selected prefix
- [ ] Input cursor is default (not I-beam text cursor)

### Hover Highlighting (Desktop Only)
- [ ] Hover over word (line mode, desktop) → blue highlight
- [ ] Hover over whitespace (line mode) → no highlight
- [ ] Hover (char mode) → no highlight
- [ ] Moving between words → highlight jumps instantly (no flying)
- [ ] Default cursor throughout (no pointer cursor changes)
- [ ] No hover highlighting on mobile/touch devices
- [ ] Word selection still works on mobile (via tap)

### Edge Cases
- [ ] Text selected in game output → no word extraction (allows copying)
- [ ] Text selected in command input → word extraction still works
- [ ] Duplicate words → highlights correct instance
- [ ] Very long words → works
- [ ] Single-character words → works
- [ ] Words at line breaks → works

## Future Enhancements

### Possible Improvements

1. **Context-Aware Default Prefix**
   - Detect object type from game state (inventory vs scenery)
   - Use "go" for obvious directions, "talk to" for characters, etc.
   - Keep "x" as universal fallback

2. **Multi-word Selection**
   - Shift+click to select phrase ("brass lantern")
   - Detect compound object names from game parser
   - Select entire phrase in input

3. **Smart Prefix Suggestions**
   - Show tooltip with common verbs for the object
   - Based on game parser vocabulary or command history
   - Click tooltip to use that verb instead of "x"

4. **Keyboard Navigation**
   - Tab through highlighted words
   - Arrow keys to move between words
   - Enter to select word with "x" prefix

5. **Throttled Mousemove**
   - Optimize performance for slower devices
   - `requestAnimationFrame()` batching
   - Only update if word changed

6. **Accessibility**
   - Screen reader announcements
   - ARIA labels for highlighted words
   - Announce selected text when word clicked

## Related Documentation

- [Design Decisions](design-decisions.md) - Overall architecture
- [ZVM Integration](zvm-integration.md) - Game engine integration
- [Navigation Rules](navigation-rules.md) - UI interaction patterns

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2024-12-22 | 1.0 | Initial implementation |
| 2024-12-22 | 1.1 | Fixed whitespace selection issue |
| 2024-12-22 | 1.2 | Changed to blue background highlight |
| 2024-12-22 | 1.3 | Simplified to always-append behavior |
| 2024-12-22 | 2.0 | Removed focus requirement, removed auto-scroll on focus |
| 2024-12-22 | 2.1 | **Simplified**: Pre-select prefix for easy replacement, removed verb cycling. Smart defaults: "x" for objects, "go" for directions |
| 2024-12-22 | 2.2 | **UX Polish**: Increased highlight opacity (0.12), removed pointer cursor, fixed input selection handling, disabled hover on mobile to prevent artifacts |
| 2024-12-22 | 2.3 | **Additive Building**: Clicking multiple words now appends instead of replacing. Prefix stays selected. Input uses default cursor. |
| 2024-12-23 | 2.4 | **Mobile Improvements**: Increased scroll detection threshold (10px → 50px), removed duplicate event listeners (only lowerWindow, not gameOutput), fixed event bubbling bypass, added scrollIntoView for input visibility on mobile |
| 2026-01-04 | 2.5 | **Strict Tap Detection**: Reduced scroll threshold to industry standard (50px → 10px), removed scroll-to-bottom behavior when tapping words to preserve user's scroll position |
