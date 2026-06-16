# Remote Debugging (iOS/Mobile)

Debug console logs from mobile devices where dev tools aren't available.

## Local Server Logging

Logs from a phone on the LAN are mirrored to the dev server's terminal.
This is local-only by design — the BetterStack/LogTail integration was
removed in v1.5.537 (it shipped console output to a third party and wasn't
being used).

### Setup

File: `docs/js/utils/remote-console.js`

1. Set `LOCAL_SERVER = true` in `remote-console.js`
2. Run `npm start` — logs appear in your terminal with colors
3. Access from phone via local IP (e.g., `http://192.168.1.x:3002`)

Server endpoint: `POST /api/log` (defined in `server/core/app.js`)

With `INTERCEPT_ALL = true` (default), all `console.log`, `warn`, `error`,
`info`, `debug` calls from mobile devices are forwarded. Both flags must be
on for anything to be sent; with `LOCAL_SERVER = false` (the committed
default) the module is a no-op apart from defining `console.remote()`.

### Manual Remote Logging

Use `console.remote()` for targeted debug output:

```javascript
console.remote('Debug info', { state: someValue });
console.remote('Error occurred', error);
```

- Shows as `[REMOTE]` prefix in the device's local console always
- Forwards to the server terminal when `LOCAL_SERVER = true` and the device is mobile

### Unhandled Errors

When `LOCAL_SERVER = true`, automatically captures from mobile devices:
- Uncaught exceptions (`window.onerror`)
- Unhandled promise rejections

## Cross-Origin Storage Sync

Sync localStorage from GitHub Pages to your dev environment (localhost, Tailscale, LAN).

### How It Works
1. Dev server loads hidden iframe from `https://baheard.github.io/Lantern/bridge.html`
2. Bridge page accesses GitHub Pages localStorage
3. Data sent back via postMessage
4. Dev server merges saves (newer timestamp wins)

### Files
- `docs/bridge.html` - Hosted on GitHub Pages, responds to postMessage
- `docs/js/utils/storage-sync.js` - Creates iframe, handles sync logic
- `docs/js/ui/settings.js` - "Sync from GitHub" button (dev only)

### Usage
1. Open Settings panel on dev server
2. Click "Sync from GitHub" button (only visible in dev)
3. Saves from GitHub Pages merge into local storage

### ⚠️ IMPORTANT: Production Origin Hardcoded

If you change production environment, update these files:

| File | Constant | Current Value |
|------|----------|---------------|
| `docs/bridge.html` | `PRODUCTION_ORIGIN` | `https://baheard.github.io` |
| `docs/js/utils/storage-sync.js` | `REMOTE_ORIGIN` | `https://baheard.github.io` |

The sync button appears on any origin that is NOT the production origin.
