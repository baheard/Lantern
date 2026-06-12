/**
 * Remote Console Logger
 *
 * Mirrors console output to the local Node server's /api/log endpoint so
 * mobile devices on the LAN can be debugged from the server terminal
 * (useful on iOS where dev tools aren't available).
 *
 * Local-only by design: logs never leave the machine/LAN. The previous
 * BetterStack/LogTail integration was removed in v1.5.537 — it shipped
 * console output to a third party and wasn't being used.
 *
 * To use: set LOCAL_SERVER = true below, run `npm start`, and load the app
 * from the dev machine's LAN address. Logs appear in the server terminal.
 */

// ============ CONFIGURATION ============
const LOCAL_SERVER = false; // Only enable if running local Node server
// ========================================

// Set to true to intercept ALL console.log/warn/error (noisy)
// Set to false to only use console.remote() (recommended)
const INTERCEPT_ALL = true;

// Mobile detection (768px breakpoint or touch device)
const isMobile = () => window.innerWidth <= 768 || 'ontouchstart' in window;

/**
 * console.remote(...args) - Logs locally with a [REMOTE] prefix, and forwards
 * to the local server when LOCAL_SERVER is enabled.
 *
 * Example: console.remote('TTS failed', error);
 */
console.remote = function(...args) {
  // Always log locally
  console.log('[REMOTE]', ...args);

  if (LOCAL_SERVER && isMobile()) {
    sendLog('remote', args);
  }
};

function sendLog(level, args) {
  if (!LOCAL_SERVER) {
    return;
  }

  // Skip remote logging when offline to prevent fetch errors
  if (!navigator.onLine) {
    return;
  }

  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level,
      args: args.map(arg => {
        if (arg instanceof Error) {
          return { message: arg.message, stack: arg.stack };
        }
        try {
          return JSON.parse(JSON.stringify(arg));
        } catch {
          return String(arg);
        }
      })
    })
  }).catch(() => {});
}

// Catch hard errors (on mobile only)
if (LOCAL_SERVER) {
  window.addEventListener('error', (event) => {
    if (!isMobile()) return;
    sendLog('error', [{
      type: 'uncaughtError',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    }]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!isMobile()) return;
    sendLog('error', [{
      type: 'unhandledrejection',
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    }]);
  });
}

// Optional: intercept ALL console methods (no-op unless LOCAL_SERVER is on)
if (INTERCEPT_ALL && LOCAL_SERVER) {
  ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
    const original = console[level];
    console[level] = function(...args) {
      original.apply(console, args);
      try {
        sendLog(level, args);
      } catch (e) {
        // Never let the logger break the original console.* call.
      }
    };
  });
}
