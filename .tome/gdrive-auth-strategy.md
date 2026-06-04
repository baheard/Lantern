---
title: Google Drive Auth Strategy
tags: [gdrive, auth, oauth, design]
created: 2026-06-03
updated: 2026-06-03
aliases: [drive auth, token refresh, oauth refresh, silent refresh]
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
