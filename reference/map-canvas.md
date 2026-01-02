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

### How It Works (v1.4.17+)

The auto-mapper uses **name-based tracking** via the status bar text. This approach:
- Avoids exposing internal VM object IDs to the user
- Works consistently across all Z-machine versions
- Is simpler and more reliable than VM memory reading

#### Location Detection from Status Bar

```javascript
// Status bar typically has format: "Location Name    Score: X  Moves: Y"
// Extract the location name (left part before score/moves)
export function getCurrentLocation(statusBarText) {
  let locationName = statusBarText.trim();

  // Remove common suffixes
  const suffixPatterns = [
    /\s+Score:\s*\d+.*/i,
    /\s+Moves:\s*\d+.*/i,
    /\s+Time:\s*.*/i,
    /\s{3,}.*$/,  // Multiple spaces separate location from stats
  ];

  for (const pattern of suffixPatterns) {
    locationName = locationName.replace(pattern, '');
  }

  return { name: locationName.trim() };
}
```

#### Why Name-Based (not ID-Based)

Previous versions (v1.4.12-v1.4.16) used VM memory reading to get object IDs. This was problematic:
- Exposed internal game data to users (confusing object IDs like "14", "127")
- Broke some games that use non-standard object layouts
- Required version-specific code paths (v3 vs v5+)

Name-based tracking is more user-friendly and consistent.

### Handling Same-Named Locations

When the player reaches a location with the same name via a different route, the mapper checks if it's likely the same room or a true duplicate:

```javascript
// Calculate expected position based on direction traveled
const expectedPos = { x: parentNode.x + offset.x, y: parentNode.y + offset.y };

// If expected position matches existing node (within 50px), it's the same room
const positionMatches = Math.abs(expectedPos.x - existingNode.x) < 50 &&
                        Math.abs(expectedPos.y - existingNode.y) < 50;

if (positionMatches) {
  // Same room via different route - just add an edge
  addEdge(previousLocationId, locationName);
} else {
  // Different position - create potential duplicate
  createDuplicateNode(locationName, existingNode, previousLocationId, command);
}
```

Duplicates are:
- Placed based on the direction traveled
- Colored orange with a `?` badge
- Shown as **current location** when player arrives there
- Can be **merged** with original via the node sheet
- Can be marked as **"Not a Duplicate"** if it's truly a separate location with the same name

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `locationChanged` | `{ locationId, locationName, previousLocationId, previousLocationName, command }` | Fired when player moves (locationId = locationName for compatibility) |
| `gameLoaded` | `{ gameName }` | Fired when a game is loaded |

### Key Functions

- `getCurrentLocation(statusBarText)` - Extracts location name from status bar text
- `checkLocationChange(statusBarText, generation)` - Called after each game turn with status bar text
- `setLastCommand(cmd)` - Records the last command (for edge labels)
- `getLastLocationName()` - Returns the last known location name
- `initAutoMapper(gameName)` - Initializes mapper for a game

### Starting Location Detection

The starting location is detected on the first status bar update after game load. No delayed VM check is needed since we use status bar text.

---

## Historical Reference: VM Memory Reading (v1.4.12-v1.4.16)

> **Note:** This approach was removed in v1.4.17. Kept for reference only.

### Z-Machine Object Table Layout (Historical)

The object table layout differs by Z-machine version:

| Version | Entry Size | Parent Offset | Property Table Offset |
|---------|------------|---------------|----------------------|
| v3      | 9 bytes    | 4 (1-byte)    | 7                    |
| v4+     | 14 bytes   | 6 (2-byte)    | 12                   |

### Object Tree in Inform Games (Historical)

Inform games have a standard object hierarchy:

```
Object 1: "Class" (parent: 0) - metaclass
Object 2: "Object" (parent: 0) - base class
Object 3-9: Other system classes
Object 10: "(self object)" (parent: 0) - player class definition
Object 14: "(self object)" (parent: room_id) - actual player instance
Object 50+: Rooms, items, etc.
```

---

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
  type: string,         // Icon type: 'location' (blank), 'person', 'door', 'puzzle', 'star', 'question'
  notes: string,        // User notes
  isManual: boolean,    // Created by user (not auto-mapper)
  isEdited: boolean,    // Modified by user after creation
  isSmall: boolean      // Small node (60% size, fades when zoomed out)
}
```

### Node Icons

| Type | Icon | Use For |
|------|------|---------|
| `location` | (blank) | Standard locations (default) |
| `person` | 👤 | NPCs or characters |
| `door` | 🚪 | Exits or entrances |
| `puzzle` | 🧩 | Puzzle elements |
| `star` | ⭐ | Important/notable |
| `question` | ❓ | Unknown or mystery |

### Small Nodes

Nodes can be marked as "small" (60% size) via the node sheet toggle:
- Radius: 17px (vs 28px normal)
- Fade out when zoomed below 0.6x scale
- Completely hidden below 0.3x scale
- Useful for minor locations or details

### Edge Object

```javascript
{
  from: string,              // Source node ID
  to: string,                // Destination node ID
  command: string,           // Command that created this edge (e.g., "north")
  connectionType: string,    // 'cardinal', 'vertical', or 'portal'
  showArrow: boolean,        // Show directional arrow (opt-in, for one-way paths)
  isManual: boolean,         // Created by user
  isEdited: boolean          // Modified by user
}
```

### Edge Behavior

- **Color by provenance**: Auto-mapped connections use the connection type color (blue/purple/yellow). Player-created connections are always purple (#8b5cf6).
- **Arrows are opt-in**: Connections don't show arrows by default. Toggle arrows via the node sheet to indicate one-way paths.
- **Deleted edges stay deleted**: Deleted connections are tracked in `deletedEdges` to prevent auto-mapper from recreating them.

## Connection Types

| Type | Directions | Visual Style | Color |
|------|------------|--------------|-------|
| `cardinal` | N, S, E, W, NE, NW, SE, SW | Solid line | Blue `#60a5fa` |
| `vertical` | Up, Down | Dashed `[8,4]` | Purple `#a78bfa` |
| `portal` | Enter, Exit, In, Out | Dotted `[3,3]` | Yellow `#fbbf24` |

### Direction Offsets

```javascript
// Cardinal - 100px grid
north: { x: 0, y: -100 }, south: { x: 0, y: 100 }
east: { x: 100, y: 0 }, west: { x: -100, y: 0 }

// Diagonals - NW = N + W, forms proper grid
northeast: { x: 100, y: -100 }, northwest: { x: -100, y: -100 }
southeast: { x: 100, y: 100 }, southwest: { x: -100, y: 100 }

// Vertical - straight up/down with more distance to avoid N/S collision
up: { x: 0, y: -150 }, down: { x: 0, y: 150 }

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

### Sheet Dismissal

The node edit sheet can be closed by:
| Gesture | Action |
|---------|--------|
| Tap backdrop | Tap the darkened area above the sheet to close |
| Drag handle down | Drag the handle bar down >100px to dismiss |
| Tap X button | Close button in sheet header |
| Press Escape | Keyboard shortcut |

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

The visual system follows three rules with distinct channels:

#### Fill = Provenance (who made it)
| Fill Color | Meaning |
|------------|---------|
| Blue | Auto-mapped location |
| Purple | Manually created by player |

Fill color never changes for current location, duplicates, or edits.

#### Halo = Attention (where you are)
| Halo | Meaning |
|------|---------|
| Green glow + border | Current player location |
| White glow + border | Selected/focused node |
| Subtle white border | Default state |

Halo is never used for metadata or warnings.

#### Badge = Player-relevant info (one at a time)
| Priority | Badge | Meaning |
|----------|-------|---------|
| 1 (highest) | Yellow ? | Merge conflict (potential duplicate) |
| 2 | Blue 📝 | Has notes |
| 3 | Purple ✎ | Edited by player |

Only one badge shows at a time - highest priority wins.

**Mental model:**
- Color = who made it
- Glow = where I am
- Badge = what needs attention

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
