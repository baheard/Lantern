# IFTalk - Interactive Fiction with Voice Control

## Architecture Overview

**ðŸŽ® Fully Browser-Based - No Server-Side Game Logic**

- **Frontend**: Vanilla JavaScript (ES6 modules)
- **Game Engine**: ifvms.js (Z-machine interpreter) + GlkOte (display library)
  - Games run **entirely in the browser** (client-side)
  - ZVM interprets Z-code files (.z5, .z8)
  - GlkOte handles display, windowing, and input
- **Backend**: Node.js/Express - **static file server ONLY**
  - No game processing on server
  - **No Socket.IO** - legacy Frotz/Socket.IO code fully deleted in v1.5.537
  - Serves HTML, JS, CSS, and game files, plus two small endpoints:
    `/api/log` (local dev logging, off by default) and `/api/fetch-game` (CORS proxy, domain-whitelisted)
- **TTS**: Browser Web Speech API (client-side only)
  - Narration runs entirely in browser with `speechSynthesis`
  - No server round-trip for audio generation
- **Speech Recognition**: Web Speech Recognition API (webkitSpeechRecognition)
- **Save/Restore**: Custom system with autosave + manual save/restore commands

## File Structure

- `docs/js/`: Modular JavaScript (ES6 modules)
  - `app.js`: Main application entry point
  - `game/`: ZVM initialization, game management, save/restore
  - `voice/`: Voice recognition and voice commands
  - `narration/`: TTS, chunking, highlighting, navigation
  - `input/`: Keyboard input and tap-to-examine
  - `ui/`: UI components (settings, game output, etc.)
  - `utils/`: Storage, scrolling, wake lock, etc.
  - `features/`: Auto-mapper, map canvas, feedback
- `docs/lib/`: Third-party libraries
  - `zvm.js`: ifvms Z-machine interpreter (v1.1.6)
  - `glkote.js`, `glkapi.js`: GlkOte display library (v2.2.5)
  - `dialog-stub.js`: Dialog handling
- `docs/index.html`: UI structure
- `docs/styles.css`, `docs/styles/`: CSS styling
- `server/`: Express server (static file serving only)

## Quick Start

```bash
cd /e/Project/IFTalk && npm start
# Access at http://localhost:3002 (port set in config.json)
```

## Working with Claude

**Current Branch:** `claude/map-canvas-4hYUa` - Auto-mapper and interactive map canvas feature development

**Context Management:** Claude will warn when context usage reaches 85% (15% remaining). Use `/context` to check current usage.

**Tome:** When implementing a feature, save non-obvious design decisions, gotchas, and architectural rationale to `.tome/` â€” not just on explicit request, but proactively whenever something worth remembering surfaces (e.g. a pipeline gap, a cache design, a module cycle workaround). The global instructions already say to do this; this is a project-level reminder to not skip it during feature work.

## Version Management

**IMPORTANT:** Every time a new feature is added or a significant change is made:

**âš ï¸ Claude: ALWAYS increment the version number when making any code changes, bug fixes, or feature additions. No exceptions.**

1. **Increment the version number** in THREE places:
   - `docs/js/config.js` (line ~10) - **Single source of truth**:
     ```javascript
     version: '1.5.103',
     ```
   - `docs/service-worker.js` (line ~6):
     ```javascript
     const CACHE_VERSION = 'v1.5.103';
     ```
   - `CLAUDE.md` (line ~93):
     ```markdown
     **Current Version:** v1.5.103
     ```

   **Notes:**
   - Version in `config.js` is automatically injected into HTML status bars by `app.js`
   - HTML files (`docs/index.html`) contain placeholder versions that get replaced on load
   - All three locations must use the same version number

   **Quick commands:**
   ```bash
   # Find current version
   grep -n "version:" docs/js/config.js
   grep -n "CACHE_VERSION" docs/service-worker.js
   grep -n "Current Version" CLAUDE.md

   # Verify HTML injection (should match config.js after page load)
   grep -n "status-version" docs/index.html
   ```

2. **Include the version number in commit messages**:
   ```bash
   git commit -m "v1.5.104: Add safe area insets for PWA mode"
   ```

3. **Version numbering scheme:**
   - Major (v2.0.0): Breaking changes, major rewrites
   - Minor (v1.5.0): New features, significant improvements
   - Patch (v1.5.105): Bug fixes, small tweaks

**Current Version:** v1.5.560

## Third-Party Libraries

### ifvms.js (Z-Machine Interpreter)
- **Current Version**: 1.1.6 (released February 11, 2021)
- **GitHub**: [curiousdannii/ifvms.js](https://github.com/curiousdannii/ifvms.js)
- **npm**: [ifvms package](https://www.npmjs.com/package/ifvms)
- **Documentation**: [IFWiki - ZVM (ifvms.js)](https://www.ifwiki.org/ZVM_(ifvms.js))
- **License**: MIT
- **Description**: Third-generation VM engine for web IF interpreters with JIT compiler

### GlkOte (Display Library)
- **Current Version**: 2.2.5 (copyright 2008-2020)
- **Latest Version**: 2.3.7
- **GitHub**: [erkyrath/glkote](https://github.com/erkyrath/glkote)
- **Official Docs**: [eblong.com/zarf/glk/glkote/docs.html](https://eblong.com/zarf/glk/glkote/docs.html)
- **License**: MIT
- **Author**: Andrew Plotkin (erkyrath)
- **Description**: JavaScript display library for IF interfaces

### Other Dependencies
- **jQuery**: 3.7.1 (required by GlkOte)

## Reference Documentation

For detailed technical information, see the `reference/` folder:

### Architecture & Design
- **[ZVM Integration](reference/zvm-integration.md)** - ifvms.js + GlkOte setup and game loading
- **[Design Decisions](reference/design-decisions.md)** - Text processing pipeline, navigation, highlighting, scroll behavior
- **[State Variables](reference/state-variables.md)** - Key state flags and their purposes

### UX & Behavior
- **[Navigation Rules](reference/navigation-rules.md)** - Expected behavior for playback controls and text highlighting

### Implementation Details
- **[Text Highlighting System](reference/text-highlighting-system.md)** - Marker-based highlighting for TTS narration
- **[Map Canvas](reference/map-canvas.md)** - Auto-mapper and interactive map canvas
- **[Bug Fixes History](reference/bug-fixes-history.md)** - Past bugs and solutions for context

### Development & Debugging
- **[Remote Debugging](reference/remote-debugging.md)** - iOS/mobile debugging via local server logging
- **[Reference Index](reference/README.md)** - Full table of contents for all reference docs

## Recent Changes

See [CHANGELOG.md](CHANGELOG.md) for detailed development history.

### Recent Fixes (May Need Reversion)

**Mobile Scrolling & Keyboard Behavior (v1.5.104 - 2026-01-17)**

Fixed issues where scroll-down button and scrolling were off when mobile keyboard was up:

**Changes made:**
1. **Scroll button visibility**: Made `updateFadeState()` viewport-aware using Visual Viewport API
   - Now checks if at bottom based on visible area (with keyboard), not full container height
   - Files: `docs/js/ui/scroll-down-button.js` (lines ~289-304)

2. **Timing adjustments**: Increased delays for keyboard animations
   - Keyboard close delay: 150ms â†’ 300ms
   - Scroll button refresh delay: 50ms â†’ 150ms
   - Files: `docs/js/utils/scroll.js` (line ~87), `docs/js/ui/scroll-down-button.js` (line ~344)

3. **Debounced updates**: Added debouncing to scroll button updates during viewport resizes
   - Prevents multiple rapid calculations during keyboard animations
   - Files: `docs/js/ui/scroll-down-button.js` (new debounce logic in init)

**To revert:** Check git history for these files and revert the viewport-aware calculations and timing changes.

## Current Status

**Working Features:**
- âœ… Game selection and loading
- âœ… Browser-based ZVM game engine (Z-machine v3-8)
- âœ… Inline keyboard input with mode detection
- âœ… Autosave/restore system
- âœ… Text-to-speech narration with speed control
- âœ… Text highlighting with auto-scroll during narration
- âœ… Voice recognition and voice commands
- âœ… Push-to-talk mode
- âœ… Settings panel with per-game preferences
- âœ… Google Drive sync
- âœ… Lock screen mode
- âœ… Fully offline-capable
- âœ… Auto-mapper with interactive map canvas

**Active Development:**
- ðŸ”„ Code refactoring (Phase 3 of 7 - see [refactoring plan](reference/refactoring-plan.md))
- See [TODO.md](TODO.md) for other tasks and progress
