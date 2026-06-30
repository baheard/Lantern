---
title: Google Drive Auth Strategy
tags: [gdrive, auth, oauth, design]
created: 2026-06-03
updated: 2026-06-30
aliases: [drive auth, token refresh, oauth refresh, silent refresh, popup blocked, ios safari popup, transient activation]
---

# Google Drive Auth Strategy

All in `docs/js/utils/gdrive/gdrive-auth.js`. Uses Google Identity Services
(GIS) token client (`google.accounts.oauth2.initTokenClient`).

## Lazy refresh — no background timer (v1.5.470)

**Decision:** the access token is refreshed **only on demand**, when a sync
actually needs it (`ensureAuthenticated()` → `silentRefresh()` → fall back to
`signIn()` popup). There is deliberately **no background refresh timer**.

**Why we removed the proactive timer:** earlier versions had
`scheduleProactiveRefresh()`, a `setTimeout` that fired ~5 min before the
~1-hour access token expired, re-arming itself each cycle. Two problems:

1. **It wasn't actually silent.** `requestAccessToken({ prompt: 'none' })` is
   supposed to use a hidden iframe, but in practice it produced a **visible
   popup-window flicker** every ~55 min while the app sat idle. User reported
   the "sneaky background activity."
2. **It bought nothing.** On-demand silent refresh succeeds for the same reason
   the proactive one did: it relies on the **long-lived Google session cookie**
   (weeks), not the short-lived access token (1 hr). Whichever moment you next
   sync, the silent refresh works without a consent screen because consent was
   already granted.

**Key insight (the tell):** a 1-hour token can't survive an overnight machine
sleep, and `setTimeout` doesn't fire reliably while asleep — yet the user
stayed "signed in" overnight. Proof the session cookie, not the timer, is what
keeps you authenticated. So dropping the timer changes nothing about the
sign-in experience; it only removes the idle flicker.

## Refresh ladder (still in place)

`ensureAuthenticated()`:
1. `hasValidToken()` → done if access token still unexpired.
2. `silentRefresh()` (`prompt: 'none'`) → no UI if Google session alive.
3. First-ever sign-in only: confirm dialog, then `signIn()`.
   Returning users (have `gdrive_token.email`) skip the dialog and go straight
   to Google. `signIn()` uses `prompt: 'select_account'` only on the very first
   auth, empty `prompt` thereafter.

`gdrive_email` is persisted separately in localStorage so it survives token
expiry and is used to distinguish first-ever vs returning sign-in.

## Caveat

The on-demand `silentRefresh()` uses the same `prompt: 'none'` call that
flickered. If a flicker still appears, it's now tied to a real user sync action
(acceptable), not idle. A lingering flicker on actual syncs would point at a
GIS third-party-cookie quirk — a separate issue from the timer removal.

## iOS Safari popup blocked — don't await before requestAccessToken (#185, v1.5.727)

**Symptom:** `[GSI_LOGGER]: Failed to open popup window … display=popup … Maybe
blocked by the browser?` on iPhone/Safari; interactive sign-in never completes.

**Cause:** `requestAccessToken()` opens a popup, and Safari only allows it while
the page holds **transient activation** — a ~5s window after a user tap. The old
`signIn()` did `await silentRefresh()` *first*, which on a dead Google session
can run up to its safety-net timeout (was **8s**) and **expire the activation
window** before the popup ever opens. In the reported first-time path the user's
tap on the confirm dialog's "Connect" button granted a *fresh* gesture, but
`signIn()` immediately squandered it on another silent refresh → popup blocked.
(`prompt=select_account` in the URL = first-time path, set at the `tokenData.email`
-falsy branch — confirms it.)

**Fix:** `signIn()` is the interactive (tap-driven) entry point, so it now calls
`requestAccessToken()` **promptly** — no preceding `silentRefresh()` await. The
silent-first optimisation still lives in `ensureAuthenticated()` (tries
`silentRefresh()` *before* the user-facing tap). Belt-and-suspenders: the
`_doSilentRefresh()` safety-net timeout was cut **8s → 3.5s** so a hung silent
refresh can't outlast the 5s activation window on any path.

**Rule:** never `await` anything slow (silent refresh, dynamic `import()` of a
cold module, a network call) on the synchronous path between a user gesture and
`requestAccessToken()`. GIS popups need the gesture *fresh*.
