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

The auto-mapper hooks into the Z-machine VM to detect player location changes. It uses a two-method approach to support different Z-machine versions and game implementations.

#### Method 1: Global Variable 0 (Z-machine v3)

For Z-machine version 3 games, the interpreter automatically maintains the player's location in global variable 0:

```javascript
const locationId = vm.m.getUint16(vm.globals); // Global 0 = current location
```

This is defined by the [Z-Machine Standard](https://inform-fiction.org/zmachine/standards/z1point1/sect08.html): *"The short name of the object whose number is in the first global variable should be printed on the left hand side of the [status] line."*

#### Method 2: Player Object Scanning (Z-machine v5+)

For Z-machine version 5+ games (like Dreamhold), global 0 may not contain the location. Instead, we scan the object table to find the player object, then get its parent (the current room):

```javascript
// Scan objects looking for the player
for (let objId = 1; objId < 1000; objId++) {
  const objName = vm.decode(propTable + 1, nameLen * 2);

  // Player object names: "yourself", "(self object)", "self", "cretin", "player"
  if (lowerName.includes('yourself') || lowerName.includes('self object') || ...) {
    const parentId = vm.m.getUint16(objAddr + parentOffset);
    if (parentId > 0) {
      locationId = parentId; // Parent is the current room
      break;
    }
  }
}
```

### Z-Machine Object Table Layout

The object table layout differs by Z-machine version:

| Version | Entry Size | Parent Offset | Property Table Offset |
|---------|------------|---------------|----------------------|
| v3      | 9 bytes    | 4 (1-byte)    | 7                    |
| v4+     | 14 bytes   | 6 (2-byte)    | 12                   |

### Object Tree in Inform Games

Inform games have a standard object hierarchy:

```
Object 1: "Class" (parent: 0) - metaclass
Object 2: "Object" (parent: 0) - base class
Object 3-9: Other system classes
Object 10: "(self object)" (parent: 0) - player class definition
Object 14: "(self object)" (parent: room_id) - actual player instance ← THIS IS THE PLAYER
Object 50+: Rooms, items, etc.
```

The player object's parent is always the current room. When the player moves, the parent changes.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `locationChanged` | `{ locationId, locationName, previousLocationId, command }` | Fired when player moves |
| `gameLoaded` | `{ gameName }` | Fired when a game is loaded |

### Key Functions

- `getCurrentLocation()` - Returns `{ id, name }` of current location (object IDs only, no hash-based fallbacks)
- `checkLocationChange(generation)` - Called after each game turn to detect movement
- `setLastCommand(cmd)` - Records the last command (for edge labels)
- `initAutoMapper(gameName)` - Initializes mapper, includes delayed starting location check

### Starting Location Detection

The auto-mapper captures the starting location via a delayed check after game initialization:

```javascript
// In initAutoMapper()
setTimeout(() => {
  checkLocationChange(0);  // Check after VM fully initialized
}, 500);
```

This 500ms delay ensures the VM has valid object data before the first location check.

### Direction/Command Tracking

Commands are tracked via `setLastCommand()` called from `command-router.js` before sending to VM:

```javascript
// command-router.js:376
setLastCommand(input);  // e.g., "north"
sendCommandToGame(input);

// When location changes, the edge stores the command
recordConnection(previousLocationId, newLocationId, lastCommand);
```

The command becomes the edge label in the map.

### Common Player Object Names

Different Inform games use different names for the player object:

| Name Pattern | Example Games |
|--------------|---------------|
| `"yourself"` | Most Inform 6/7 games |
| `"(self object)"` | Dreamhold, some custom libraries |
| `"self"` | Older Inform games |
| `"cretin"` | Some adventure games |
| `"player"` | Custom implementations |

### Debugging Location Detection

To debug location issues, temporarily enable logging in `getCurrentLocation()`:
- Check `vm.m.getUint8(0x00)` for Z-machine version (3, 5, or 8)
- Log objects 1-50 to see the object hierarchy
- Look for player object's parent changing between turns

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
| Double-tap empty canvas | Add new node at position |
| Drag node | Move node (marks as edited) |
| Long-press node | Start creating edge (drag to destination) |
| Drag canvas | Pan viewport |
| Pinch | Zoom in/out |
| Scroll wheel | Zoom in/out |
| Right-click | Context menu |
| Tap legend | Collapse legend |

### Double-Tap Detection

Double-tap to add nodes uses `hasDragged` state to distinguish taps from pans:

```javascript
// In map-config.js
mapState.hasDragged = false;  // Reset on pointer down

// In handlePointerMove - set true if actual movement
if (Math.abs(dx) > 5 || Math.abs(dy) > 5) mapState.hasDragged = true;

// In handlePointerUp - only detect double-tap if no drag
if (!hitNode && !mapState.hasDragged) {
  if (now - touchState.lastTapTime < 300 && tapDist < 30) {
    callbacks.addNodeAtPosition(canvasPoint.x, canvasPoint.y);
  }
}
```

### Controls Visibility

FAB buttons and controls stay visible during all interactions (panning, pinch-zoom). No auto-hide behavior.

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
