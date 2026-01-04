/**
 * Remote Console Logger
 *
 * Intercepts console methods and sends them to the server for remote debugging.
 * Useful for debugging on iOS devices where dev tools aren't available.
 *
 * Supports:
 * - Local server logging (when running npm start)
 * - LogTail/BetterStack (for GitHub Pages - get token at betterstack.com/logtail)
 */

// ============ CONFIGURATION ============
const LOGTAIL_TOKEN = 'R7uVJrZCEUV3wnKGYaLEWkzN';   // LogTail source token
const LOGTAIL_ENDPOINT = 'https://s1642064.eu-nbg-2.betterstackdata.com';  // Ingesting host
const LOCAL_SERVER = false; // Only enable if running local Node server
// ========================================

// Set to true to intercept ALL console.log/warn/error (noisy)
// Set to false to only use console.remote() (recommended)
const INTERCEPT_ALL = true;

// Mobile detection (768px breakpoint or touch device)
const isMobile = () => window.innerWidth <= 768 || 'ontouchstart' in window;

/**
 * console.remote(...args) - Sends to LogTail only on mobile devices
 * Use this for debugging mobile devices on local network
 *
 * Example: console.remote('TTS failed', error);
 */
console.remote = function(...args) {
  // Always log locally
  console.log('[REMOTE]', ...args);

  // Skip remote logging when offline
  if (!navigator.onLine) {
    return;
  }

  // Only send to LogTail on mobile
  if (LOGTAIL_TOKEN && isMobile()) {
    const payload = {
      level: 'remote',
      message: args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        try {
          return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch {
          return String(arg);
        }
      }).join(' '),
      dt: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    fetch(LOGTAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOGTAIL_TOKEN}`
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
};

function sendLog(level, args) {
  // Skip remote logging when offline to prevent fetch errors
  if (!navigator.onLine) {
    return;
  }

  const payload = {
    level,
    message: args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack}`;
      }
      try {
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      } catch {
        return String(arg);
      }
    }).join(' '),
    dt: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent
  };

  // Send to local server
  if (LOCAL_SERVER) {
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
        }),
        url: payload.url,
        userAgent: payload.userAgent
      })
    }).catch(() => {});
  }

  // Send to LogTail
  if (LOGTAIL_TOKEN) {
    fetch(LOGTAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOGTAIL_TOKEN}`
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
}

// Always catch hard errors (on mobile only)
if (LOGTAIL_TOKEN) {
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

// Optional: intercept ALL console methods (noisy, off by default)
if (INTERCEPT_ALL) {
  ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
    const original = console[level];
    console[level] = function(...args) {
      original.apply(console, args);
      try {
        sendLog(level, args);
      } catch (e) {}
    };
  });
}
