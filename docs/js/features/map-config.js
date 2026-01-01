/**
 * Map Canvas - Configuration and Shared State
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const DIRECTION_OFFSETS = {
  // Cardinal directions
  north: { x: 0, y: -100 }, south: { x: 0, y: 100 },
  east: { x: 100, y: 0 }, west: { x: -100, y: 0 },
  northeast: { x: 70, y: -70 }, northwest: { x: -70, y: -70 },
  southeast: { x: 70, y: 70 }, southwest: { x: -70, y: 70 },
  // Vertical - offset horizontally to distinguish from N/S, larger distance
  up: { x: 50, y: -120 }, down: { x: -50, y: 120 },
  // Portal/special exits - offset diagonally
  enter: { x: 80, y: -40 }, exit: { x: -80, y: 40 },
  'in': { x: 80, y: -40 }, out: { x: -80, y: 40 }
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

// Connection type styles
export const CONNECTION_STYLES = {
  cardinal: { dash: [], color: '#60a5fa' },
  vertical: { dash: [8, 4], color: '#a78bfa' },
  portal: { dash: [3, 3], color: '#fbbf24' }
};

export const COMMAND_DIRECTIONS = {
  'n': 'north', 'north': 'north', 's': 'south', 'south': 'south',
  'e': 'east', 'east': 'east', 'w': 'west', 'west': 'west',
  'ne': 'northeast', 'northeast': 'northeast', 'nw': 'northwest', 'northwest': 'northwest',
  'se': 'southeast', 'southeast': 'southeast', 'sw': 'southwest', 'southwest': 'southwest',
  'u': 'up', 'up': 'up', 'd': 'down', 'down': 'down',
  'enter': 'enter', 'go in': 'enter', 'in': 'enter',
  'exit': 'exit', 'go out': 'exit', 'out': 'exit'
};

export const NODE_ICONS = {
  room: 'home', outdoor: 'park', shop: 'store', danger: 'warning',
  npc: 'person', item: 'inventory_2', locked: 'lock', custom: 'place'
};

export const NODE_COLORS = {
  auto: '#3b82f6',    // Blue
  user: '#8b5cf6',    // Purple
  current: '#22c55e'  // Green
};

export const NODE_RADIUS = 28;
export const TOUCH_TARGET = 44;
export const LONG_PRESS_DURATION = 400;
export const FIRST_USE_KEY = 'iftalk_map_first_use_shown';

// ============================================================================
// SHARED STATE
// ============================================================================

export const mapState = {
  gameName: null,
  nodes: new Map(),
  edges: new Map(),
  protectedNodes: new Set(),
  protectedEdges: new Set(),
  deletedEdges: new Set(),
  deletedNodes: new Set(),
  viewport: { x: 0, y: 0, scale: 1 },
  selectedNode: null,
  autoMapEnabled: true,
  // Interaction state
  isDragging: false,
  hasDragged: false,  // True if actual movement occurred during drag
  dragStart: null,
  dragNode: null,
  isCreatingEdge: false,
  edgeStartNode: null,
  currentPointer: null,
  isAddingNode: false
};

// Canvas & DOM references (set by map-canvas.js)
export let canvas = null;
export let ctx = null;
export let container = null;
export let isVisible = false;
export let domRefs = { modeIndicator: null, contextMenu: null, fabContainer: null, hint: null, legend: null };

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
  hintTimeout: null
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
