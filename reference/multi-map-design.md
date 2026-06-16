# Multi-Map Design Document

**Status:** Planned
**Target Version:** v1.5.0
**Last Updated:** 2026-01-09

## Overview

Design for supporting multiple maps per game in Lantern's map canvas feature. Addresses the need for:
- Separate maps for different game areas (Overworld, Dungeon, City, etc.)
- User-created named maps with manual control
- Automatic detection of disconnected regions with user approval

## User Requirements

From user feedback:
> "we need to be able to make multiple maps. i'm not sure how it's going to work, or how it's going to know when to reset. need to think about this"

**Use Cases Selected:**
1. Multiple areas/zones per game (automatic and manual)
2. User-created named maps
3. Automatic detection with user approval
4. Manual override capability

## Current Architecture (v1)

### Single Map Per Game

**Storage Key:** `iftalk_map_${gameName}`

**Data Structure:**
```javascript
{
  nodes: [],              // Array of node objects
  edges: [],              // Array of edge objects
  protectedNodes: [],     // Auto-mapper protection
  protectedEdges: [],
  deletedEdges: [],
  deletedNodes: [],
  viewport: { x, y, scale },
  autoMapEnabled: boolean,
  currentNodeId: string
}
```

**Limitations:**
- Only one map per game
- All locations must exist in single map
- Disconnected regions appear as "jumps" on same map
- Scene transitions (like jail in Lost Pig) create confusing layout

## New Architecture (v2)

### Multi-Map Per Game

**Storage Key:** `iftalk_maps_${gameName}` (note plural)

**Data Structure:**
```javascript
{
  version: 2,  // Schema version

  maps: [
    {
      id: "map_1234567890",
      name: "Overworld",
      color: "#3b82f6",
      nodes: [],
      edges: [],
      protectedNodes: [],
      protectedEdges: [],
      deletedEdges: [],
      deletedNodes: [],
      viewport: { x, y, scale },
      isAutoCreated: boolean,
      createdAt: timestamp,
      metadata: {
        nodeCount: number,
        lastVisited: timestamp
      }
    },
    // ... more maps
  ],

  activeMapId: "map_1234567890",     // Which map receives new auto-mapped locations
  currentPlayerMapId: "map_1234567890",  // Which map player is currently in
  autoMapEnabled: true,               // Global setting
  globalViewport: { x, y, scale }     // Fallback viewport
}
```

### Key Concepts

#### Active Map
The map that receives new auto-mapped locations. By default:
- Active map = map containing player's current location
- User can override to manually set which map is active
- Indicated visually in UI with "Auto →" indicator

#### Current Player Map
The map containing the player's current location. Tracked separately from active map to allow:
- Player exploring one area while manually mapping another
- Visual indication of where player actually is
- Smart defaults for active map

#### Map Metadata
Each map stores:
- **id:** Unique identifier (`map_${timestamp}`)
- **name:** User-visible name ("Overworld", "Dungeon")
- **color:** Hex color for visual distinction
- **isAutoCreated:** Whether created by auto-detection vs user
- **createdAt:** Timestamp for sorting
- **nodeCount:** Cached count for performance
- **lastVisited:** For "recent maps" features

## Auto-Detection System

### Detection Heuristics

**When to suggest a new map:**

1. **Large Position Jump** (HIGH confidence)
   - Expected position for new node is >500px from ALL existing nodes
   - Indicates spatially disconnected region
   - Auto-create without user approval for high confidence

2. **Transition Command** (MEDIUM confidence)
   - Command contains keywords: `enter`, `climb`, `descend`, `board`, `portal`, `teleport`
   - Suggests area transition
   - Show toast notification for user approval

**Configuration:**
```javascript
export const AUTO_DETECT_CONFIG = {
  LARGE_JUMP_DISTANCE: 500,      // Distance threshold in pixels
  MIN_NODES_BEFORE_DETECT: 5,     // Don't suggest until map has substance
  TRANSITION_COMMANDS: [
    'enter', 'climb', 'descend', 'ascend',
    'board', 'go through', 'portal', 'teleport'
  ]
};
```

### Detection Algorithm

```javascript
function shouldSuggestNewMap(newLocationName, previousLocationName, command) {
  const currentMap = getActiveMap();

  // Don't suggest if map is still small
  if (currentMap.metadata.nodeCount < MIN_NODES_BEFORE_DETECT) {
    return false;
  }

  // Calculate expected position
  const direction = getDirectionFromCommand(command);
  const parentNode = currentMap.nodes.get(previousLocationName);

  if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
    const offset = DIRECTION_OFFSETS[direction];
    const expectedPos = {
      x: parentNode.x + offset.x,
      y: parentNode.y + offset.y
    };

    // Check distance to ALL nodes
    const minDistance = Math.min(
      ...[...currentMap.nodes.values()].map(n =>
        Math.sqrt((n.x - expectedPos.x) ** 2 + (n.y - expectedPos.y) ** 2)
      )
    );

    // Large jump = high confidence
    if (minDistance > LARGE_JUMP_DISTANCE) {
      return {
        reason: 'disconnected',
        suggestedName: inferMapName(command, newLocationName),
        confidence: 'high'
      };
    }
  }

  // Check for transition commands
  const cmdLower = (command || '').toLowerCase();
  const hasTransition = TRANSITION_COMMANDS.some(tc => cmdLower.includes(tc));

  if (hasTransition) {
    return {
      reason: 'transition',
      suggestedName: inferMapName(command, newLocationName),
      confidence: 'medium'
    };
  }

  return false;
}
```

### Map Name Inference

Extract area name from command or location:
- "enter tower" → "Tower"
- "climb stairs to attic" → "Attic"
- "go through portal to dungeon" → "Dungeon"
- Fallback: use location name

### User Approval Flow

**For HIGH confidence:**
- Auto-create map silently
- Show brief hint: "Created new map: Dungeon"
- User can undo or merge maps later

**For MEDIUM confidence:**
- Show non-blocking toast notification:
  ```
  New area detected: "Tower"
  [Create New Map] [Add to Current] [Dismiss]
  ```
- Auto-dismiss after 10 seconds
- Store as pending suggestion (accessible from map menu)

## UI Components

### Map Tabs (Primary Navigation)

**Location:** Top of map panel, below toolbar

**Design:**
```
┌─────────────────────────────────────────┐
│ [🔵 Overworld 42] [🟢 Dungeon 18] [+]   │
└─────────────────────────────────────────┘
```

**Features:**
- Horizontal scrollable tabs
- Color dot for visual distinction
- Node count badge
- Active tab highlighted
- "+" button to create new map
- Long-press tab for management menu

**HTML:**
```html
<div class="map-tabs-container">
  <div class="map-tabs">
    <button class="map-tab active" data-map-id="map_123">
      <span class="map-tab-color" style="background: #3b82f6"></span>
      <span class="map-tab-name">Overworld</span>
      <span class="map-tab-badge">42</span>
    </button>
    <!-- more tabs -->
  </div>
  <button class="map-tab-add" title="Create new map">+</button>
</div>
```

### Active Map Indicator

**Location:** Toolbar, near Auto toggle

**Design:**
```
Auto → Overworld ⇄
```

Shows which map is receiving auto-mapped locations. Click to switch.

### Create Map Dialog

**Triggered by:**
- Clicking "+" tab button
- Auto-detection suggestion
- Moving node to new map

**Fields:**
- Name (text input, max 50 chars)
- Color (picker with 8 preset colors)

**Presets:**
- Blue #3b82f6
- Green #22c55e
- Amber #f59e0b
- Red #ef4444
- Purple #8b5cf6
- Pink #ec4899
- Cyan #06b6d4
- Lime #84cc16

### Map Management Sheet

**Triggered by:** Long-press on map tab

**Actions:**
- Rename Map
- Change Color
- Set as Active for Auto-Mapping
- Merge with Another Map...
- Delete Map (confirmation required)

### Node Edit Sheet Updates

**Add field:**
```
Map: [Dropdown: Overworld | Dungeon | + Create New Map]
```

Allows moving nodes between maps.

## Data Migration

### v1 → v2 Migration

**Automatic migration on first load:**

1. Detect v1 format (no `version` field)
2. Create default map object:
   ```javascript
   {
     id: "map_default",
     name: "Main Map",
     color: "#3b82f6",
     nodes: [...],  // From v1 data
     edges: [...],  // From v1 data
     // ... other fields from v1
   }
   ```
3. Wrap in v2 structure:
   ```javascript
   {
     version: 2,
     maps: [defaultMap],
     activeMapId: "map_default",
     currentPlayerMapId: "map_default"
   }
   ```
4. Save to new key: `iftalk_maps_${gameName}`
5. Keep old key temporarily for safety

**Validation:**
- Check all required fields present
- Verify node/edge references
- Ensure at least one map exists
- Validate map IDs are unique

## Auto-Mapper Integration

### Location Change Flow (Updated)

```javascript
function handleLocationChange(newLocation, command) {
  // 1. Check if location already exists in ANY map
  const existingMap = findMapContainingNode(newLocation);

  if (existingMap) {
    // Already mapped - just track player position
    mapState.currentPlayerMapId = existingMap.id;
    mapState.currentNodeId = newLocation;
    return;
  }

  // 2. Get active map for auto-mapping
  const activeMap = getActiveMap();

  // 3. Check if should suggest new map
  const suggestion = shouldSuggestNewMap(
    newLocation,
    lastLocationName,
    command,
    activeMap
  );

  if (suggestion) {
    if (suggestion.confidence === 'high') {
      // Auto-create new map
      const newMap = createNewMap(suggestion.suggestedName, getNextColor());
      showHint(`Created new map: ${suggestion.suggestedName}`);
      addNodeToMap(newMap, newLocation, lastLocationName, command);
      mapState.activeMapId = newMap.id;
      mapState.currentPlayerMapId = newMap.id;
    } else {
      // Show suggestion toast
      showMapSuggestion(suggestion);
      // Don't auto-add yet - wait for user decision
      pendingSuggestions.push({ newLocation, command, suggestion });
    }
    return;
  }

  // 4. Add to active map
  addNodeToMap(activeMap, newLocation, lastLocationName, command);
  mapState.currentPlayerMapId = activeMap.id;
  mapState.currentNodeId = newLocation;
}
```

### Journey Replay (Updated)

When opening map after auto-mapper has been tracking:

```javascript
function syncFromAutoMapper() {
  const autoMapperData = getMapData();
  if (!autoMapperData.journey || autoMapperData.journey.length === 0) return;

  let previousNode = null;
  let currentMap = getActiveMapForAutoMapping();

  for (const visit of autoMapperData.journey) {
    const locationName = visit.locationName;

    // Check if location exists in any map
    const existingMap = findMapContainingNode(locationName);

    if (existingMap) {
      // Switch context to that map
      currentMap = existingMap;
      previousNode = existingMap.nodes.get(locationName);
      continue;
    }

    // Check if should create new map
    if (previousNode) {
      const suggestion = shouldSuggestNewMap(
        locationName,
        previousNode.id,
        visit.command,
        currentMap
      );

      if (suggestion && suggestion.confidence === 'high') {
        // Auto-create new map
        currentMap = createNewMap(suggestion.suggestedName, getNextColor());
        showHint(`Created new map: ${suggestion.suggestedName}`);
      }
    }

    // Add node to current map
    addNodeToMap(currentMap, locationName, previousNode?.id, visit.command);
    previousNode = currentMap.nodes.get(locationName);
  }

  saveAllMaps();
  clearJourney();
}
```

## Edge Cases & Solutions

### 1. Cross-Map Movement

**Problem:** Player moves between two different maps (e.g., "enter tower" from overworld to tower interior)

**Solution (Phase 1):** Don't create cross-map edges initially
- Each map is independent
- Player's location tracked separately
- Can enhance later with "portal" edges

**Future Enhancement:**
```javascript
{
  from: "Forest Path",
  to: "Tower Entrance",
  fromMapId: "map_overworld",
  toMapId: "map_tower",
  isCrossMap: true,
  command: "enter tower",
  connectionType: 'portal'
}
```

Render as dotted line to edge of canvas with badge showing destination map.

### 2. Merging Maps

**Use Case:** User realizes two maps are actually same area

**Implementation:**
```javascript
function mergeMaps(sourceMapId, targetMapId) {
  const source = mapState.maps.get(sourceMapId);
  const target = mapState.maps.get(targetMapId);

  // Confirm with user
  if (!confirm(`Merge "${source.name}" into "${target.name}"? Cannot undo.`)) {
    return;
  }

  // Transfer all nodes
  for (const [nodeId, node] of source.nodes) {
    node.mapId = targetMapId;
    target.nodes.set(nodeId, node);
  }

  // Transfer all edges
  for (const [edgeKey, edge] of source.edges) {
    target.edges.set(edgeKey, edge);
  }

  // Transfer protection sets
  for (const id of source.protectedNodes) target.protectedNodes.add(id);
  for (const key of source.protectedEdges) target.protectedEdges.add(key);

  // Delete source map
  mapState.maps.delete(sourceMapId);

  // Switch to target
  switchToMap(targetMapId);
  saveAllMaps();
}
```

### 3. Deleting Maps

**Constraints:**
- Cannot delete last map
- Warn user about node count
- Update active/player map references

```javascript
function deleteMap(mapId) {
  if (mapState.maps.size <= 1) {
    showHint('Cannot delete the only map');
    return;
  }

  const map = mapState.maps.get(mapId);
  const nodeCount = map.nodes.size;

  if (!confirm(`Delete "${map.name}" with ${nodeCount} locations?`)) {
    return;
  }

  mapState.maps.delete(mapId);

  // Update references
  if (mapState.activeMapId === mapId) {
    mapState.activeMapId = mapState.maps.keys().next().value;
  }
  if (mapState.currentPlayerMapId === mapId) {
    mapState.currentPlayerMapId = null;
  }

  switchToMap(mapState.activeMapId);
  saveAllMaps();
}
```

### 4. Empty Maps

**Allow creation but show helpful message:**

When rendering empty map:
```
┌─────────────────────────────┐
│                             │
│     No locations yet        │
│ Explore the game to start   │
│       mapping               │
│                             │
└─────────────────────────────┘
```

### 5. Moving Nodes Between Maps

**When moving a node:**
1. Remove from source map
2. Add to destination map
3. Update `node.mapId`
4. Handle connected edges:
   - If both nodes in same map → keep edge
   - If nodes in different maps → remove edge (or mark as cross-map in future)

### 6. Viewport Management

**Per-Map Viewports (Recommended):**
- Each map remembers its own viewport
- When switching maps:
  ```javascript
  function switchToMap(mapId) {
    // Save current map's viewport
    if (mapState.activeMapId) {
      const prevMap = mapState.maps.get(mapState.activeMapId);
      prevMap.viewport = { ...mapState.viewport };
    }

    // Switch to new map
    mapState.activeMapId = mapId;
    const newMap = mapState.maps.get(mapId);

    // Restore viewport or center on content
    if (newMap.viewport) {
      mapState.viewport = { ...newMap.viewport };
    } else {
      centerOnMapContent(newMap);
    }

    newMap.metadata.lastVisited = Date.now();
    render();
  }
  ```

### 7. Undo System

**Options:**

**Option A: Global undo stack** (simpler)
- Single undo stack across all maps
- Store `mapId` with each action
- When undoing, switch to that map if needed

**Option B: Per-map undo stacks** (more complex)
- Each map has its own undo stack
- More intuitive but harder to implement

**Recommend Option A initially**

## Performance Considerations

### Limits

```javascript
export const MULTI_MAP_LIMITS = {
  MAX_MAPS: 10,                    // Max maps per game
  MAX_TOTAL_NODES: 500,            // Max nodes across ALL maps
  MAX_NODES_PER_MAP: 200,          // Max nodes per individual map
  MAX_EDGES_PER_MAP: 400           // Max edges per individual map
};
```

### Optimization Strategies

1. **Render Only Active Map**
   - Don't render inactive maps
   - Reduces canvas operations

2. **Lazy Load Map Data**
   - Load map data on-demand
   - Keep active map in memory
   - Cache recently viewed maps

3. **Viewport Caching**
   - Cache each map's viewport
   - Reduces recalculation on switch

4. **Storage Optimization**
   - Compress map data before saving
   - Already implemented in current system
   - Multi-map adds minimal overhead

## Implementation Files

### New Files

1. **map-tabs.js** (~250 lines)
   - Map tab rendering
   - Tab switching
   - Create/delete/rename dialogs
   - Map management sheet

2. **map-detection.js** (~200 lines)
   - Auto-detection heuristics
   - Suggestion generation
   - Map name inference
   - Confidence scoring

3. **map-migration.js** (~150 lines)
   - v1 → v2 migration
   - Data validation
   - Backup creation

### Modified Files

1. **map-config.js**
   - Add multi-map state structure
   - Add multi-map constants
   - Add MapData documentation

2. **map-canvas.js**
   - Update `loadMapForGame()` for multi-map
   - Update `saveMapForGame()` for all maps
   - Add helper functions (getActiveMap, etc.)
   - Update `syncFromAutoMapper()` for multi-map

3. **map-render.js**
   - Update `render()` to use active map
   - Add `renderEmptyMapMessage()`

4. **map-handlers.js**
   - Use active map for hit detection
   - Update `addNodeAtPosition()` for active map

5. **map-sheet.js**
   - Add map selector to node edit sheet
   - Add `handleNodeMapChange()`
   - Add map management sheet

6. **auto-mapper.js**
   - Update `handleLocationChange()` for multi-map
   - Add `findMapContainingNode()`

7. **map-canvas.css**
   - Add `.map-tabs-container` styles
   - Add `.map-tab` styles
   - Add `.create-map-form` styles
   - Add `.map-manage-sheet` styles

## Testing Plan

### Unit Tests

1. **Migration:**
   - v1 → v2 with various data sizes
   - Empty v1 map
   - Missing fields in v1
   - Multiple games

2. **Auto-Detection:**
   - Large position jumps
   - Transition commands
   - Edge cases (small maps, first few nodes)

3. **Map Operations:**
   - Create map
   - Delete map (prevent last deletion)
   - Rename map
   - Change color
   - Merge maps

4. **Node Movement:**
   - Move node between maps
   - Handle connected edges
   - Undo movement

### Integration Tests

1. **Game Scenarios:**
   - Lost Pig (jail scene transition)
   - Anchorhead (multiple areas)
   - Linear game (should not over-suggest)

2. **Save/Restore:**
   - Save game with multiple maps
   - Restore and verify all maps present
   - Autosave with multiple maps

3. **Journey Replay:**
   - Open map after extensive exploration
   - Verify journey creates correct maps
   - Check node placement accuracy

## Future Enhancements

### Cross-Map Edges (v1.6.0)

- Visual "portal" connections between maps
- Show on both source and destination maps
- Badge indicating destination map name

### Map Templates (v1.7.0)

- Predefined map types (Dungeon, Outdoor, City)
- Different grid sizes/styles per map
- Map-specific node icons

### Map Layers (v2.0.0)

- Multiple layers per map (floors of building)
- Vertical navigation between layers
- 3D-style rendering option

### Smart Map Naming (v1.6.0)

- Analyze game text for area names
- Suggest names based on location patterns
- Learn from user naming conventions

## Version History

- **v1.0.0 - v1.4.x:** Single map per game
- **v1.5.0:** Multi-map support (this design)
- **v1.6.0:** Cross-map edges (planned)
- **v1.7.0:** Map templates (planned)
- **v2.0.0:** Map layers (planned)

## References

- [Map Canvas Documentation](./map-canvas.md)
- [Design Decisions](./design-decisions.md)
- [State Variables](./state-variables.md)
- [Text Highlighting System](./text-highlighting-system.md)
