# Reference Documentation

Technical documentation for Lantern internals.

## Table of Contents

### Architecture & Core Systems

| Document | Description |
|----------|-------------|
| [zvm-integration.md](zvm-integration.md) | ifvms.js + GlkOte setup, game loading, VM lifecycle |
| [architecture-comparison.md](architecture-comparison.md) | Comparison of Frotz vs ZVM architectures |
| [state-variables.md](state-variables.md) | Key state flags and their purposes |
| [design-decisions.md](design-decisions.md) | Text processing pipeline, navigation, highlighting |

### Game & Save System

| Document | Description |
|----------|-------------|
| [save-restore-research.md](save-restore-research.md) | Z-machine vs Glulx autosave, ifvms.js internals |
| [save-restore-status.md](save-restore-status.md) | Current autosave implementation details |

### UI & UX

| Document | Description |
|----------|-------------|
| [navigation-rules.md](navigation-rules.md) | Playback controls, text highlighting behavior |
| [text-highlighting-system.md](text-highlighting-system.md) | Marker-based highlighting for TTS narration |
| [map-canvas.md](map-canvas.md) | Interactive game map with auto-mapping |

### Development & Debugging

| Document | Description |
|----------|-------------|
| [remote-debugging.md](remote-debugging.md) | iOS/mobile debugging via LogTail |
| [server-management.md](server-management.md) | Local server setup and management |
| [bug-fixes-history.md](bug-fixes-history.md) | Past bugs and solutions for context |

### Deprecated

| Document | Description |
|----------|-------------|
| [frotz-config.md](frotz-config.md) | ~~Server-side Frotz~~ (replaced by browser ZVM) |
