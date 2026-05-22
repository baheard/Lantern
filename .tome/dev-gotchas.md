---
title: Dev Gotchas
tags: [dev, debugging, browser, cache, gotcha]
created: 2026-05-14
updated: 2026-05-14
aliases: [module cache, service worker, dev workflow, gotcha]
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

**Normal dev loop (no manual busting needed):** bump `CACHE_VERSION` in `service-worker.js` + version in `config.js` → reload once → service worker detects new version → shows "Update available / Refreshing in 5s" toast → reloads with fresh assets. The module cache only gets stuck when the service worker was manually unregistered mid-session.

## Unregistering the service worker kills the server reload

Running `navigator.serviceWorker.getRegistrations().then(r => r.forEach(r => r.unregister()))` + `location.reload()` will attempt to reload before the server is ready if the server also restarted. Wait for the server to be up before navigating.

## `execute_console` async IIFE results

`execute_console` returns the synchronous value of the last expression. An async IIFE returns a `Promise`, not its resolved value — you won't see the result. Use `console.log()` inside and read via a follow-up call, or chain with `.then(r => console.log(r))`.
