# Map Canvas & Auto-Mapper Reference

## Overview

The Map Canvas provides an interactive, per-game map that automatically tracks player movement through the game world. Users can also manually add locations and connections.

### Core Principles

1. **User intent always wins** - Auto-mapper never overrides user edits
2. **Auto-map is additive only** - Only adds, never modifies/removes
3. **One-shot creation** - Once auto-mapper creates a node/edge, it's immediately protected
4. **Predictability over cleverness** - Same actions produce same results
5. **Never surprise the user** - Deleted items stay deleted, moved items stay moved

## Module Structure

```
docs/js/features/
├── map-config.js    - Configuration, constants, shared state
├── map-render.js    - Grid, edges, nodes rendering
├── map-handlers.js  - Pointer, touch, wheel input handlers
├── map-sheet.js     - Bottom sheet UI and node/edge CRUD
├── map-canvas.js    - Core orchestrator
└── auto-mapper.js   - Location tracking from ZVM
```

## Auto-Mapper (`auto-mapper.js`)

### How It Works

The auto-mapper hooks into the Z-machine VM to detect player location changes:

```javascript
// Read player location from ZVM global variable 0
const locationId = window.zvmInstance.m.getUint16(window.zvmInstance.globals);
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `locationChanged` | `{ locationId, locationName, previousLocationId, command }` | Fired when player moves |
| `gameLoaded` | `{ gameName }` | Fired when a game is loaded |

### Key Functions

- `getCurrentLocation()` - Returns `{ id, name }` of current location
- `checkLocationChange()` - Called after each game turn to detect movement
- `setLastCommand(cmd)` - Records the last command (for edge labels)

## Map Canvas (`map-canvas.js`)

### State Management

All state is centralized in `mapState` object in `map-config.js`:

```javascript
mapState = {
  gameName: null,
  nodes: Map(),           // locationId → node object
  edges: Map(),           // "fromId-toId" → edge object
  protectedNodes: Set(),  // IDs that auto-mapper cannot modify
  protectedEdges: Set(),  // Keys that auto-mapper cannot modify
  deletedEdges: Set(),    // Keys that auto-mapper cannot recreate
  deletedNodes: Set(),    // IDs that auto-mapper cannot recreate
  viewport: { x, y, scale },
  selectedNode: null,
  autoMapEnabled: true
}
```

### Protection System

Once an item is created (by auto-mapper OR user), it's immediately added to the protected set:

| Protection Set | Purpose |
|----------------|---------|
| `protectedNodes` | Nodes auto-mapper cannot modify (all nodes once created) |
| `protectedEdges` | Edges auto-mapper cannot modify (all edges once created) |
| `deletedNodes` | Nodes auto-mapper cannot recreate |
| `deletedEdges` | Edges auto-mapper cannot recreate |

### Node Object

```javascript
{
  id: string,           // Location ID from ZVM or user-generated
  name: string,         // Location name
  x: number,            // Canvas X position
  y: number,            // Canvas Y position
  type: string,         // 'room', 'outdoor', 'shop', 'danger', etc.
  notes: string,        // User notes
  isManual: boolean,    // Created by user (not auto-mapper)
  isEdited: boolean     // Modified by user after creation
}
```

### Edge Object

```javascript
{
  from: string,              // Source node ID
  to: string,                // Destination node ID
  command: string,           // Command that created this edge (e.g., "north")
  connectionType: string,    // 'cardinal', 'vertical', or 'portal'
  isManual: boolean,         // Created by user
  isEdited: boolean          // Modified by user
}
```

## Connection Types

| Type | Directions | Visual Style | Color |
|------|------------|--------------|-------|
| `cardinal` | N, S, E, W, NE, NW, SE, SW | Solid line | Blue `#60a5fa` |
| `vertical` | Up, Down | Dashed `[8,4]` | Purple `#a78bfa` |
| `portal` | Enter, Exit, In, Out | Dotted `[3,3]` | Yellow `#fbbf24` |

### Direction Offsets

```javascript
// Cardinal - standard grid layout
north: { x: 0, y: -100 }, south: { x: 0, y: 100 }
east: { x: 100, y: 0 }, west: { x: -100, y: 0 }
northeast: { x: 70, y: -70 }, etc.

// Vertical - larger offset, horizontally offset to distinguish from N/S
up: { x: 50, y: -120 }, down: { x: -50, y: 120 }

// Portal - diagonal offset
enter/in: { x: 80, y: -40 }, exit/out: { x: -80, y: 40 }
```

## User Interactions

### Touch/Mouse Gestures

| Gesture | Action |
|---------|--------|
| Tap node | Open edit sheet |
| Drag node | Move node (marks as edited) |
| Long-press node | Start creating edge (drag to destination) |
| Drag canvas | Pan viewport |
| Pinch | Zoom in/out |
| Scroll wheel | Zoom in/out |
| Right-click | Context menu |

### FAB Buttons

- **Add Location** (+) - Enter add-node mode, tap canvas to place
- **Add Connection** (timeline) - Tap first node, then second to connect

### Visual Indicators

| Indicator | Meaning |
|-----------|---------|
| Blue node | Auto-mapped location |
| Purple node | User-edited location |
| Green node + glow | Current player location |
| Small purple dot on node | User-edited node |
| Small purple dot on edge | User-edited edge |
| Dashed node border | User-edited |

## Persistence

Maps are saved per-game in localStorage:

```javascript
localStorage.setItem(`iftalk_map_${gameName}`, JSON.stringify({
  nodes: [...],
  edges: [...],
  protectedNodes: [...],
  protectedEdges: [...],
  deletedEdges: [...],
  deletedNodes: [...],
  viewport: { x, y, scale },
  autoMapEnabled: boolean
}));
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close sheet / exit mode / close map |
| `+` or `=` | Enter add-node mode |
| `C` | Center on current location |

## Circular Dependency Solution

Modules use a callback pattern to avoid circular imports:

```javascript
// In map-canvas.js (orchestrator)
setHandlerCallbacks({
  addNodeAtPosition,
  exitAddMode,
  showHint,
  // ...
});

// In map-handlers.js
let callbacks = { addNodeAtPosition: () => {}, ... };
export function setHandlerCallbacks(cbs) { callbacks = cbs; }
```

## Files Modified for Map Feature

- `docs/js/features/map-canvas.js` - Core orchestrator
- `docs/js/features/map-config.js` - Configuration and state
- `docs/js/features/map-render.js` - Canvas rendering
- `docs/js/features/map-handlers.js` - Input handling
- `docs/js/features/map-sheet.js` - Bottom sheet UI
- `docs/js/features/auto-mapper.js` - ZVM location tracking
- `docs/js/game/voxglk.js` - Added location checking hook
- `docs/js/game/commands/command-router.js` - Command tracking
- `docs/js/game/game-loader.js` - gameLoaded event
- `docs/styles/map-canvas.css` - All map styling
