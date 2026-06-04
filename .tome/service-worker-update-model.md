---
title: Service Worker Update Model
tags: [pwa, service-worker, update, cache, design]
created: 2026-06-04
updated: 2026-06-04
aliases: [sw-update, pwa-update, silent-activate]
---

# Service Worker Update Model (v1.5.476+)

## The key insight

Freshness is governed by the **fetch strategy**, not SW activation. The SW serves JS/CSS with **network-first + 1.5s timeout** (`cache: 'no-cache'`), so a normal page reload already gets fresh code — even while an older worker controls the page. This makes the traditional "update available → reload" toast redundant.

## What the old model did (removed v1.5.476)

1. New SW installed → `waiting` state
2. `showUpdateNotification()` → "Update available, reloading in 5s…" toast
3. User confirms (or auto-timeout) → `SKIP_WAITING` message → `controllerchange` event → `window.location.reload()`

Problems: disruptive mid-session, redundant (page already has fresh code), caused double-reload noise.

## What the new model does

1. New SW installed → `waiting` state  
2. `activate(worker)` → `SKIP_WAITING` immediately, silently  
3. New worker activates: deletes superseded version caches, finishes precaching for offline  
4. Next natural reload picks up everything

No toast. No forced reload. No `controllerchange → reload`.

**First-install guard:** only auto-activate when `navigator.serviceWorker.controller` is already set (i.e. this is an update, not the very first install). First install activates and claims on its own via `clients.claim()` in the SW.

## Manual "Check for updates" button

Still does a forced reload — that's an explicit user action, so a reload there is expected and fine.

## Forward-looking limitation

This model only applies once a v476+ SW *controls* the page. Users on an older SW get one update cycle (old model or natural expiry) before landing on the new behavior. No action needed — it's self-resolving.

## Files

- `docs/js/utils/pwa-updater.js` — SW registration + silent activate logic
- `docs/service-worker.js` — `networkFirstWithTimeout` fetch handler for JS/CSS (commit bb39947)
