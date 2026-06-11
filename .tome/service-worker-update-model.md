---
title: Service Worker Update Model
tags: [pwa, service-worker, update, cache, design, ios, alert]
created: 2026-06-04
updated: 2026-06-11
aliases: [sw-update, pwa-update, silent-activate, controllerchange, check-for-updates, double-reload]
---

# Service Worker Update Model (v1.5.510+)

## The key insight

Freshness is governed by **both** the fetch strategy and SW activation. The SW serves
JS/CSS with **network-first + 1.5s timeout** (`cache: 'no-cache'`), so a reload after a
new SW takes control gets fresh code. But the page's already-loaded JS modules (ES
modules) don't re-fetch themselves — only a reload does that. So a `controllerchange →
reload` is needed for the running page to pick up new code, not just future reloads.

v1.5.476 removed the reload (see "What v1.5.476 did" below) on the theory that "the next
natural reload picks up everything" — but that left the OLD pwa-updater.js permanently
running in memory until the user closed/reopened the app, including on iOS PWAs that may
stay backgrounded/alive for a long time. v1.5.510 restored `controllerchange → reload`.

## What v1.5.476 did (superseded by v1.5.510)

1. New SW installed → `waiting` state
2. `activate(worker)` → `SKIP_WAITING` immediately, silently
3. New worker activates: deletes superseded version caches, finishes precaching for offline
4. Next natural reload picks up everything — no toast, no forced reload, no `controllerchange → reload`

**First-install guard** (still true): only auto-activate when `navigator.serviceWorker.controller`
is already set (i.e. this is an update, not the very first install). First install
activates and claims on its own via `clients.claim()` in the SW.

## Current model (v1.5.510+)

1. New SW installed → `waiting` state
2. `activate(worker)` → `SKIP_WAITING` immediately, silently
3. New worker activates (`clients.claim()`) → fires `controllerchange` on
   `navigator.serviceWorker`
4. `pwa-updater.js`'s `controllerchange` listener calls `window.location.reload()` —
   the page picks up fresh code immediately, not "next time"

## Manual "Check for updates" button

As of v1.5.515, instead of `registration.update()`, the button calls
`navigator.serviceWorker.register('./service-worker.js?v=' + Date.now())` — a
never-before-used URL, guaranteed to bypass any HTTP cache. `registration.update()`'s
SW-script fetch can be served from iOS's HTTP cache, reporting "no update" even when the
server has a newer version; the fresh-URL re-register forces a real network fetch every
time. Re-registering with a different scriptURL for the same scope updates the existing
registration (doesn't create a duplicate) — the browser still compares script BYTES to
decide whether to install a new worker.

Then it waits up to 15s for `updatefound` → `installed`, then sends `SKIP_WAITING`. As
of v1.5.512, after sending `SKIP_WAITING` it also sets a 3s fallback
`setTimeout(() => location.reload())` in case `controllerchange` doesn't fire (seen as a
possibility on some iOS WebKit versions) — belt-and-suspenders so the explicit user
action always results in either a reload or a dialog.

## Bug: double reload + blank flash (fixed v1.5.523)

The 3s fallback timeout above raced with the automatic `controllerchange` listener in
`initServiceWorker()`. Normal sequence after `SKIP_WAITING`: the new SW activates and
calls `clients.claim()` almost immediately, firing `controllerchange` → `reload()`
(reload #1, near-instant). But the 3s fallback `setTimeout` set by the update button was
*also* still pending — once it fired, it called `reload()` again (reload #2), landing
mid- or post-navigation from #1 and producing a visible blank-screen flash between the
two reloads.

Fix: a module-level `reloadTriggered` flag + `reloadForUpdate(reason)` helper in
`pwa-updater.js`. Both the `controllerchange` listener and the two 3s fallback timeouts
(in `registration.waiting` and `newWorker installed` branches of the update button) now
call `reloadForUpdate()`, which only calls `window.location.reload()` the first time —
later calls are no-ops. This makes the "belt-and-suspenders" fallback safe: it still
covers the case where `controllerchange` never fires, but no longer double-fires when it
does.

## Gotcha: alert()/confirm() are no-ops in iOS standalone PWAs

**Found/fixed v1.5.512.** The "Check for Updates" button used raw `alert()` for every
outcome, including the correct "you're already up to date" case. On an installed iOS
home-screen PWA, `alert()`/`confirm()`/`prompt()` are silently swallowed — no dialog, no
error. So the button looked completely broken/unresponsive even when it was working
exactly as designed and correctly reporting "no update found" (because 1.5.510 — the
version the user was already on — was in fact the latest deployed version at the time).
Fixed by switching to `confirmDialog()` (see [[ui-conventions]]). This is a general
convention now, not just a PWA-updater fix — see ui-conventions.md.

## Forward-looking limitation

Users on a pre-v1.5.510 SW get one update cycle (old silent-activate model, no reload)
before landing on the new controllerchange→reload behavior. Self-resolving once they
relaunch/reload once.

## Files

- `docs/js/utils/pwa-updater.js` — SW registration, controllerchange→reload, Check for Updates button
- `docs/service-worker.js` — `networkFirstWithTimeout` fetch handler for JS/CSS (commit bb39947)
- `docs/js/ui/confirm-dialog.js` — `confirmDialog()`, the alert()/confirm() replacement
