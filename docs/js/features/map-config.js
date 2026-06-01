/**
 * Map Canvas - Configuration and Shared State
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const GRID_SIZE = 160;

export const DIRECTION_OFFSETS = {
  // Cardinal directions - 1 grid cell
  north: { x: 0, y: -GRID_SIZE }, south: { x: 0, y: GRID_SIZE },
  east: { x: GRID_SIZE, y: 0 }, west: { x: -GRID_SIZE, y: 0 },
  // Diagonals - 1 grid cell each axis
  northeast: { x: GRID_SIZE, y: -GRID_SIZE }, northwest: { x: -GRID_SIZE, y: -GRID_SIZE },
  southeast: { x: GRID_SIZE, y: GRID_SIZE }, southwest: { x: -GRID_SIZE, y: GRID_SIZE },
  // Vertical - 1.5 grid cells up, 0.5 grid cell horizontal
  up: { x: GRID_SIZE * 0.5, y: -(GRID_SIZE * 1.5) }, down: { x: -(GRID_SIZE * 0.5), y: GRID_SIZE * 1.5 }
  // Portal/special exits (enter, exit, in, out) - NO OFFSETS
  // These will use the last cardinal direction traveled (fallback logic in map-canvas.js)
};

// Connection types for visual distinction
export const CONNECTION_TYPES = {
  cardinal: 'cardinal',   // N, S, E, W, NE, NW, SE, SW - solid line
  vertical: 'vertical',   // Up, Down - dashed line
  portal: 'portal'        // Enter, Exit, In, Out - dotted line
};

// Map directions to connection types
export const DIRECTION_TO_TYPE = {
  north: 'cardinal', south: 'cardinal', east: 'cardinal', west: 'cardinal',
  northeast: 'cardinal', northwest: 'cardinal', southeast: 'cardinal', southwest: 'cardinal',
  up: 'vertical', down: 'vertical',
  enter: 'portal', exit: 'portal', 'in': 'portal', out: 'portal'
};

// Connection type styles (all auto-mapped connections are blue)
export const CONNECTION_STYLES = {
  cardinal: { dash: [], color: '#60a5fa' },
  vertical: { dash: [8, 4], color: '#60a5fa' },
  portal: { dash: [3, 3], color: '#60a5fa' }
};

export const COMMAND_DIRECTIONS = {
  'n': 'north', 'north': 'north', 's': 'south', 'south': 'south',
  'e': 'east', 'east': 'east', 'w': 'west', 'west': 'west',
  'ne': 'northeast', 'northeast': 'northeast', 'nw': 'northwest', 'northwest': 'northwest',
  'se': 'southeast', 'southeast': 'southeast', 'sw': 'southwest', 'southwest': 'southwest',
  'u': 'up', 'up': 'up', 'upstairs': 'up', 'go upstairs': 'up',
  'd': 'down', 'down': 'down', 'downstairs': 'down', 'go downstairs': 'down',
  'enter': 'enter', 'go in': 'enter', 'in': 'enter',
  'exit': 'exit', 'go out': 'exit', 'out': 'exit'
};

// Reverse directions — used to infer approach direction from return direction
export const DIRECTION_OPPOSITES = {
  north: 'south', south: 'north', east: 'west', west: 'east',
  northeast: 'southwest', southwest: 'northeast',
  northwest: 'southeast', southeast: 'northwest',
  up: 'down', down: 'up',
  enter: 'exit', exit: 'enter', in: 'out', out: 'in'
};

export const NODE_ICONS = {
  // Default is blank (no icon) - most common for locations
  location: '',           // Blank - default
  person: 'person',       // NPC or character
  door: 'door_front',     // Exit or entrance
  puzzle: 'extension',    // Puzzle element
  star: 'back_hand',      // Hand icon
  question: 'help'        // Unknown or mystery
};

export const NODE_COLORS = {
  auto: '#3b82f6',    // Blue
  user: '#8b5cf6',    // Purple
  current: '#22c55e'  // Green
};

export const NODE_RADIUS = 20;
export const NODE_RADIUS_SMALL = 12;  // 60% of normal
export const SMALL_NODE_FADE_SCALE = 0.6;  // Fade out small nodes below this zoom
export const TOUCH_TARGET = 44;
export const LONG_PRESS_DURATION = 400;
export const FIRST_USE_KEY = 'iftalk_map_first_use_shown';

// Map size limits (for performance and localStorage constraints)
export const NODE_COUNT_WARNING = 200;  // Warn when approaching limits
export const NODE_COUNT_MAX = 500;       // Hard limit (prevents localStorage overflow)
export const EDGE_COUNT_MAX = 1000;      // Hard limit for edges

// ============================================================================
// SHARED STATE
// ============================================================================

export const mapState = {
  gameName: null,
  activeMapId: null,       // ID of the currently active map
  mapOrder: [],            // [{id, name}, ...] ordered list of maps for this game
  nodes: new Map(),
  edges: new Map(),
  protectedNodes: new Set(),
  protectedEdges: new Set(),
  deletedEdges: new Set(),
  deletedNodes: new Set(),
  viewport: { x: 0, y: 0, scale: 1 },
  selectedNode: null,
  currentNodeId: null,  // Tracks which specific node player is at (for duplicates)
  autoMapEnabled: true,  // Enabled by default - user can disable if needed
  undoStack: [],  // Stack of pre-edit state snapshots (undo)
  redoStack: [],  // Stack of state snapshots popped by undo (redo); cleared on any new edit
  hasUnsavedChanges: false,  // Track if map has user changes since last game save
  // Interaction state
  isDragging: false,
  hasDragged: false,  // True if actual movement occurred during drag
  dragStart: null,
  dragNode: null,
  isCreatingEdge: false,
  edgeStartNode: null,
  currentPointer: null,
  isAddingNode: false,
  isMerging: false,
  mergeSourceNode: null
};

// Canvas & DOM references (set by map-canvas.js)
export let canvas = null;
export let ctx = null;
export let container = null;
export let isVisible = false;
export let domRefs = { modeIndicator: null, fabContainer: null, hint: null, legend: null };

// Setters for module references
export function setCanvas(c) { canvas = c; }
export function setCtx(c) { ctx = c; }
export function setContainer(c) { container = c; }
export function setIsVisible(v) { isVisible = v; }
export function setDomRefs(refs) { domRefs = refs; }

// Timer state (managed by handlers)
export const timers = {
  longPressTimer: null,
  longPressTriggered: false,
  longPressProgress: 0,
  longPressAnimationFrame: null,
  longPressStartTime: 0,
  longPressNode: null,
  fabHideTimer: null,
  fabVisible: true,
  isInteracting: false,
  onboardingTimeout: null,
  hintTimeout: null,
  saveTimer: null  // Debounce timer for localStorage saves
};

// Touch state
export const touchState = {
  lastTouchDistance: 0,
  lastTouchCenter: { x: 0, y: 0 },
  touchStartTime: 0,
  // Double-tap detection
  lastTapTime: 0,
  lastTapPosition: { x: 0, y: 0 }
};
