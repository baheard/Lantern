/**
 * Google Drive Authentication Module
 *
 * Handles OAuth authentication, token management, sign in/out.
 *
 * Auth strategy:
 * - First sign-in: full flow with prompt:'select_account'
 * - Subsequent: silent refresh (prompt:'none') — no UI if Google session is live
 * - Refresh is lazy: the access token is only renewed on demand when a sync
 *   actually needs it (via ensureAuthenticated). No background timer — a
 *   proactive refresh loop produced visible popup flicker while idle and gained
 *   nothing, since on-demand silent refresh relies on the long-lived Google
 *   session cookie, not the short-lived access token.
 */

import { APP_CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { updateStatus } from '../status.js';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

let tokenClient = null;
let accessToken = null;


export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function hasValidToken() {
  if (!accessToken) return false;
  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  if (!tokenData.expiresAt) return false;
  return Date.now() < tokenData.expiresAt;
}

/**
 * Try to get a new token silently (no UI). Returns true if successful.
 * Works as long as the user has an active Google session in the browser.
 *
 * Concurrent callers share one in-flight refresh: _doSilentRefresh swaps
 * tokenClient.callback, so two overlapping calls would capture each other's
 * override as the "original" and GIS would get two requestAccessToken calls.
 */
let refreshInFlight = null;

export function silentRefresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = _doSilentRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

function _doSilentRefresh() {
  return new Promise((resolve) => {
    if (!tokenClient) { resolve(false); return; }

    // One-shot callback override for this refresh attempt
    const originalCallback = tokenClient.callback;
    let settled = false;

    tokenClient.callback = (response) => {
      tokenClient.callback = originalCallback;
      if (settled) return;
      settled = true;

      if (response.error || !response.access_token) {
        resolve(false);
        return;
      }

      _storeToken(response);
      resolve(true);
    };

    try {
      tokenClient.requestAccessToken({ prompt: 'none' });
    } catch {
      tokenClient.callback = originalCallback;
      if (!settled) { settled = true; resolve(false); }
    }

    // Timeout in case the callback never fires. Kept under Safari's ~5s transient
    // activation window so that, on the interactive path, a hung silent refresh
    // can't expire the user gesture before the subsequent sign-in popup opens.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        tokenClient.callback = originalCallback;
        resolve(false);
      }
    }, 3500);
  });
}

/**
 * Ensure user is authenticated, prompting if needed.
 * Tries silent refresh first; only shows UI if that fails.
 * Only shows the confirm dialog on first-ever sign-in — returning users go straight to Google.
 */
export async function ensureAuthenticated(fromAutoSync = false) {
  if (hasValidToken()) return true;

  // Try silent refresh before bothering the user
  if (tokenClient) {
    const refreshed = await silentRefresh();
    if (refreshed) return true;
  }

  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  if (fromAutoSync) {
    // Timer-driven path: a bare signIn() popup here has no user gesture backing
    // it, so browsers block it. Always confirm first — the dialog tap supplies
    // the transient activation the popup needs.
    const { confirmDialog } = await import('../../ui/confirm-dialog.js');
    const confirmed = await confirmDialog(
      'Auto-sync is on — connect to Google Drive?',
      { title: 'Connect Google Drive' }
    );
    if (!confirmed) return false;
  } else if (!tokenData.email) {
    // Only show confirm dialog on first-ever sign-in
    const { confirmDialog } = await import('../../ui/confirm-dialog.js');
    const confirmed = await confirmDialog(
      'Sign in to Google Drive to sync your saves?',
      { title: 'Connect Google Drive' }
    );
    if (!confirmed) return false;
  }
  // Previously authenticated (manual path) — skip the dialog, go straight to sign-in

  await signIn();

  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 300;
    const checkAuth = () => {
      if (hasValidToken()) { resolve(true); }
      else if (attempts >= maxAttempts) { resolve(false); }
      else { attempts++; setTimeout(checkAuth, 100); }
    };
    setTimeout(checkAuth, 500);
  });
}

/**
 * Initialize Google Drive sync.
 */
export async function initGDriveSync() {
  try {
    await waitForGoogleApi();

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: APP_CONFIG.googleClientId,
      scope: SCOPES,
      callback: handleAuthCallback,
    });

    const storedToken = localStorage.getItem('gdrive_token');
    if (storedToken) {
      const tokenData = JSON.parse(storedToken);
      if (tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
        accessToken = tokenData.accessToken;
        state.gdriveSignedIn = true;
        state.gdriveEmail = tokenData.email || null;
        window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
      } else {
        localStorage.removeItem('gdrive_token');
        accessToken = null;
        state.gdriveSignedIn = false;
        state.gdriveEmail = null;

        // Token expired — only attempt silent refresh if auto-sync is on;
        // otherwise a requestAccessToken() call can trigger a popup on load.
        const syncEnabled = localStorage.getItem('lantern_gdrive_autosync') === 'true';
        if (syncEnabled) {
          const refreshed = await silentRefresh();
          if (!refreshed) window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
        } else {
          window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
        }
      }
    }

    const lastSyncTime = localStorage.getItem('lantern_lastSyncTime');
    if (lastSyncTime) state.gdriveLastSyncTime = lastSyncTime;

  } catch (error) {
    throw error;
  }
}

function waitForGoogleApi() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkApi = () => {
      if (typeof google !== 'undefined' && google.accounts) { resolve(); }
      else if (attempts >= 50) { reject(new Error('Google API failed to load')); }
      else { attempts++; setTimeout(checkApi, 100); }
    };
    checkApi();
  });
}

/**
 * Store token, update state, schedule proactive refresh.
 */
function _storeToken(response) {
  accessToken = response.access_token;
  const expiresAt = Date.now() + (response.expires_in * 1000);

  const tokenData = { accessToken: response.access_token, expiresAt, email: null };
  localStorage.setItem('gdrive_token', JSON.stringify(tokenData));

  state.gdriveSignedIn = true;
  state.gdriveError = null;
  window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));

  // Fetch email in background
  fetchUserInfo().then(userInfo => {
    tokenData.email = userInfo.email;
    localStorage.setItem('gdrive_token', JSON.stringify(tokenData));
    localStorage.setItem('gdrive_email', userInfo.email); // persists past token expiry
    state.gdriveEmail = userInfo.email;
    window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
  }).catch(err => {
    // Non-fatal, but a missing email makes the next sign-in look "first-ever"
    // (shows the consent dialog again) — worth a trace when debugging auth.
    console.warn('[GDrive] Could not fetch account email:', err?.message || err);
  });
}

function handleAuthCallback(response) {
  if (response.error) {
    updateStatus('Sign-in failed: ' + response.error, 'error');
    return;
  }
  _storeToken(response);
}

async function fetchUserInfo() {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Failed to fetch user info');
  return await response.json();
}

/**
 * Sign in — uses select_account on first auth, empty prompt on subsequent
 * (consent was already granted; no need to show it again).
 *
 * IMPORTANT (iOS Safari): requestAccessToken() opens a popup, which Safari only
 * permits while the page has transient activation (~5s after a user tap). Do NOT
 * await anything slow here first — a preceding silentRefresh() can burn up to 8s
 * on a dead Google session and expire the activation window, so the popup is
 * blocked ([GSI_LOGGER]: Failed to open popup window … Maybe blocked by the
 * browser?). signIn() is the interactive (tap-driven) entry point, so we open the
 * popup promptly. Callers that want the silent-first optimisation use
 * ensureAuthenticated(), which tries silentRefresh() before the user-facing tap.
 */
export async function signIn() {
  if (!tokenClient) throw new Error('Google Drive sync not initialized');

  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  // Only force account selection on very first sign-in; after that go straight through
  const prompt = tokenData.email ? '' : 'select_account';
  tokenClient.requestAccessToken({ prompt });
}

export async function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }

  localStorage.removeItem('gdrive_token');
  localStorage.removeItem('gdrive_email');
  accessToken = null;

  const { clearAppFolderId } = await import('./gdrive-api.js');
  clearAppFolderId();

  state.gdriveSignedIn = false;
  state.gdriveEmail = null;
  state.gdriveLastSyncTime = null;
  state.gdriveError = null;

  window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
}

export function isSignedIn() {
  return state.gdriveSignedIn && accessToken !== null;
}
