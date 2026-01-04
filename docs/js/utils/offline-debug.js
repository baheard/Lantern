/**
 * Offline Debug Console
 *
 * Logs timing information to localStorage and displays on screen
 * for debugging offline PWA load times
 */

const DEBUG_KEY = 'iftalk_offline_debug_logs';
const MAX_LOGS = 50;

// Store logs in localStorage
function logToStorage(message) {
  const timestamp = new Date().toISOString();
  const entry = `${timestamp} - ${message}`;

  try {
    const logs = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    logs.push(entry);

    // Keep only last MAX_LOGS entries
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }

    localStorage.setItem(DEBUG_KEY, JSON.stringify(logs));

    // Don't log to console - only store in localStorage
  } catch (e) {
    console.error('Failed to store debug log:', e);
  }
}

// Add debug overlay to page
function createDebugOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'debugOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.95);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    z-index: 99999;
    max-height: 300px;
    overflow-y: auto;
    display: none;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 10px; border-bottom: 1px solid #0f0; padding-bottom: 5px;';
  header.innerHTML = `
    <strong>Offline Debug Console</strong>
    <button id="copyDebugBtn" style="float: right; background: #0a0; color: #fff; border: none; padding: 2px 8px; cursor: pointer; margin-right: 5px;">Copy All</button>
    <button id="clearDebugBtn" style="float: right; background: #f00; color: #fff; border: none; padding: 2px 8px; cursor: pointer; margin-right: 5px;">Clear</button>
    <button id="hideDebugBtn" style="float: right; background: #555; color: #fff; border: none; padding: 2px 8px; cursor: pointer;">Hide</button>
  `;

  const logContainer = document.createElement('div');
  logContainer.id = 'debugLogContainer';

  overlay.appendChild(header);
  overlay.appendChild(logContainer);
  document.body.appendChild(overlay);

  // Copy All button
  document.getElementById('copyDebugBtn').addEventListener('click', () => {
    const logs = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    const text = logs.join('\n');

    // Copy to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyDebugBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy All', 2000);
      });
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      const btn = document.getElementById('copyDebugBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy All', 2000);
    }
  });

  // Clear button
  document.getElementById('clearDebugBtn').addEventListener('click', () => {
    localStorage.removeItem(DEBUG_KEY);
    logContainer.innerHTML = '<div style="color: #ff0;">Logs cleared</div>';
  });

  // Hide button
  document.getElementById('hideDebugBtn').addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  return overlay;
}

// Show debug overlay
export function showDebugOverlay() {
  let overlay = document.getElementById('debugOverlay');

  if (!overlay) {
    overlay = createDebugOverlay();
  }

  // Load logs from storage
  const logs = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
  const logContainer = document.getElementById('debugLogContainer');

  if (logs.length === 0) {
    logContainer.innerHTML = '<div style="color: #999;">No debug logs yet</div>';
  } else {
    logContainer.innerHTML = logs
      .map(log => `<div>${log}</div>`)
      .join('');

    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  overlay.style.display = 'block';
}

// Log with timing
export function debugLog(message) {
  const elapsed = performance.now();
  logToStorage(`[${elapsed.toFixed(0)}ms] ${message}`);

  // Update overlay if visible
  const overlay = document.getElementById('debugOverlay');
  if (overlay && overlay.style.display !== 'none') {
    showDebugOverlay();
  }
}

// Show overlay on triple-tap of status bar
let tapCount = 0;
let tapTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');

  if (statusEl) {
    statusEl.addEventListener('click', () => {
      tapCount++;

      if (tapCount === 3) {
        showDebugOverlay();
        tapCount = 0;
      }

      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 1000);
    });
  }
});

// offline-debug.js loaded
// Debug overlay can be accessed by triple-tapping the status bar or calling window.showDebugOverlay()
