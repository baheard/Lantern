# ZVM Integration Reference

## Architecture: Browser-Based Game Engine

Lantern uses **ifvms.js** (Z-machine interpreter) + **GlkOte** (display library) to run games entirely in the browser.

### Key Components

**ifvms.js (ZVM)**
- Interprets Z-code files (.z5, .z8, .z3, etc.)
- Runs game logic, parser, world model
- Handles save/restore operations
- Copyright 2017 (specific version unknown)
- Latest: v1.1.6 (Feb 2021)

**GlkOte**
- Display layer for IF games
- Handles windowing (status line, main window)
- Manages input/output
- Current: v2.2.5 | Latest: v2.3.7
- Author: Andrew Plotkin (erkyrath)

**jQuery**
- v3.7.1 (required by GlkOte)

### How It Works

1. **Game Loading** (`game-loader.js`)
   - User clicks game card
   - Fetch Z-code file as ArrayBuffer
   - Create ZVM instance
   - Prepare VM with story data
   - Initialize GlkOte display

2. **Display Rendering** (GlkOte)
   - GlkOte creates `#gameport` container
   - Renders windows (status line, main text)
   - Handles text styles and formatting
   - Manages line input and character input

3. **Status Bar Rendering**
   - v3 games use `statuswin` (rock 202), created automatically by ifvms
     - ifvms writes the status bar internally via `v3_status()` each turn
     - `v3_status()` writes `width` spaces first (clears the line), then location + score
     - Game code does not need to do anything
   - v5+ games use `upperwin` (rock 203), created by the game via `split_window`
     - The game is fully responsible for writing AND clearing the status bar
     - Some games (e.g. Theatre) reuse a multi-line TextGrid (created for an intro screen) as a 1-line status bar without ever calling `erase_window` — see `bug-fixes-history.md` for the stale-character fix
   - `gridheight` on a glkapi window object is fixed at creation and never updated; the renderer uses `content.lines.length` from each update to distinguish a 1-line status bar from a multi-line upper window
   - `voxglk.js` clears line 0 of the status window before each turn to handle games that don't clear it themselves; only line 0 is touched to avoid disturbing multi-line upper windows

4. **Command Processing**
   - User types command in input field
   - JavaScript sends to ZVM via GlkOte API
   - ZVM processes command
   - Output rendered by GlkOte
   - Text captured for TTS narration

### File Locations

**Libraries:**
- `public/lib/zvm.js` - ifvms Z-machine interpreter
- `public/lib/glkote.js` - Display library
- `public/lib/glkapi.js` - Glk API
- `public/lib/dialog-stub.js` - Dialog handling

**Game Files:**
- `public/games/*.z5` - Z-machine version 5 games
- `public/games/*.z8` - Z-machine version 8 games

**Integration Code:**
- `public/js/game/game-loader.js` - ZVM initialization
- `public/js/game/commands.js` - Command handling

### HTML Structure

```html
<div id="gameport">
  <div id="windowport">
    <!-- GlkOte renders game windows here -->
  </div>
</div>
```

### JavaScript API

**Starting a Game:**
```javascript
const vm = new window.ZVM();
vm.prepare(storyData, options);
window.GlkOte.init();  // Calls Game.accept('init')
vm.start();            // Begin game execution
```

**Sending Commands:**
```javascript
Game.accept({
  type: 'line',
  value: 'look',
  terminator: 'enter'
});
```

### TTS Integration

Output is captured from GlkOte's update cycle:
1. Hook into `GlkOte.update()`
2. Extract text from content structure
3. Pass to narration system
4. Browser TTS speaks text

### Why Browser-Based?

**Advantages:**
- ✅ No server-side game state
- ✅ Works offline (after initial load)
- ✅ Simpler deployment (static files)
- ✅ No WebSocket complexity
- ✅ Easy to host (GitHub Pages, Netlify, etc.)

**Tradeoffs:**
- Browser must download entire game file
- JavaScript overhead vs native interpreter
- Limited to Z-machine games (no Glulx support)

### Related Files

- `CLAUDE.md` - Main architecture overview
- `reference/design-decisions.md` - TTS integration details
- `public/lib/glkote.css` - GlkOte styling
