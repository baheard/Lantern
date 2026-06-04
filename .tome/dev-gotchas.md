---
title: Dev Gotchas
tags: [dev, debugging, browser, cache, gotcha]
created: 2026-05-14
updated: 2026-06-03
aliases: [module cache, service worker, dev workflow, gotcha, skipWaiting, stale cache, waiting worker]
---

# Dev Gotchas

## Browser ES module cache during development

When editing a JS module and reloading the page, Chrome often serves the old module from its HTTP cache even after the service worker is unregistered. `location.reload(true)` doesn't help.

**Fix:** use a cache-busting query string on dynamic imports:
```js
import(`/js/ui/my-module.js?v=${Date.now()}`).then(m => m.myFunction());
```

**Also:** reload the CSS link the same way:
```js
document.querySelector('link[href*="my-style"]').href = `/styles/my-style.css?v=${Date.now()}`;
```

## Service worker update mechanism — how it ACTUALLY works (the stale-cache trap)

The SW does **not** auto-activate on install — this is deliberate (`service-worker.js`
install handler: "Don't auto-activate - wait for user approval"). A version bump does
**not** serve fresh code on the next reload. Definitive flow:

1. `pwa-updater.js` registers `service-worker.js?v=<APP_CONFIG.version, dots stripped>`
   (1.5.472 → `?v=15472`). The query is what makes the browser refetch/compare on a bump.
2. The new SW installs, precaches, and parks in **`waiting`** (no `skipWaiting`).
3. `updatefound` → state `installed` (with an existing controller) → `showUpdateNotification()`
   shows the **"Update available — refreshing in Ns" toast** with a 5s countdown.
4. Only when that countdown completes, OR the user clicks **Update**, does the page
   `postMessage({type:'SKIP_WAITING'})` to the waiting worker.
5. SW runs `self.skipWaiting()` → activate → deletes old caches → `clients.claim()` →
   posts `NEW_VERSION_ACTIVATED`.
6. The page's `controllerchange` listener fires → `window.location.reload()` → **now**
   fresh assets are served.

**The trap:** the *first* reload after a version bump runs STALE code — the new worker
is only `waiting`. `navigator.serviceWorker.controller.scriptURL` stays pinned at the
`?v=` of the last version that completed step 5; you can be several bumps ahead in the
files while the controller (and thus the served JS) is old. Confirmed in a CDP test:
controller stuck at `?v=15470` across 1.5.471 and 1.5.472 file bumps.

**Why automation/CDP makes it worse:** the toast→countdown→skipWaiting→controllerchange
dance assumes a real interactive page. Driving headless/CDP, with multiple tabs on the
origin both holding the old worker as controller, the cycle often never completes, so it
sits `waiting` forever. Manually posting `SKIP_WAITING` to `reg.waiting` does not reliably
flip it in that state either.

**Getting fresh code definitively (for testing):**
- **Verify file CONTENT** without fighting the SW: cache-bust the fetch —
  `fetch('/js/features/x.js?cb='+Date.now())` bypasses the SW cache (verified: returns
  the new bytes while the un-busted fetch still returns stale). A cache-busted dynamic
  `import('...?v='+Date.now())` likewise loads fresh code, but gives a SEPARATE module
  instance with its own state — useless for exercising the live app's singleton.
- **Run fresh code in the live app:** force activation, then let the auto-reload happen —
  `navigator.serviceWorker.getRegistration().then(r=>r.waiting&&r.waiting.postMessage({type:'SKIP_WAITING'}))`.
  If it won't flip (stuck `waiting`), **close the other tabs on the origin first**, then
  retry; or use the settings "Check for updates" button (`#updatePwaBtn`) which does the
  skip+reload explicitly. Unregister+reload works too but see the hazard below.
- **Simplest in a manual session:** bump version, reload, **wait ~5s for the update toast
  to finish its auto-refresh** (a second reload), and only THEN test. Never trust the
  first post-bump load. Always confirm `controller.scriptURL`'s `?v=` matches the bumped
  version before believing a live test.

## Unregistering the service worker kills the server reload

Running `navigator.serviceWorker.getRegistrations().then(r => r.forEach(r => r.unregister()))` + `location.reload()` will attempt to reload before the server is ready if the server also restarted. Wait for the server to be up before navigating.

## `execute_console` async IIFE results

`execute_console` returns the synchronous value of the last expression. An async IIFE returns a `Promise`, not its resolved value — you won't see the result. Use `console.log()` inside and read via a follow-up call, or chain with `.then(r => console.log(r))`.
