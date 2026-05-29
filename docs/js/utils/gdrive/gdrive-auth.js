/**
 * Google Drive Authentication Module
 *
 * Handles OAuth authentication, token management, sign in/out.
 *
 * Auth strategy:
 * - First sign-in: full flow with prompt:'select_account'
 * - Subsequent: silent refresh (prompt:'none') — no UI if Google session is live
 * - Proactive refresh 5 min before expiry so syncs never interrupt gameplay
 */

import { APP_CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { updateStatus } from '../status.js';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

// How many ms before expiry to proactively refresh
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

let tokenClient = null;
let accessToken = null;
let refreshTimer = null;


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
 */
export function silentRefresh() {
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

    // Timeout after 8 seconds in case the callback never fires
    setTimeout(() => {
      if (!settled) {
        settled = true;
        tokenClient.callback = originalCallback;
        resolve(false);
      }
    }, 8000);
  });
}

/**
 * Ensure user is authenticated, prompting if needed.
 * Tries silent refresh first; only shows UI if that fails.
 * Only shows the confirm dialog on first-ever sign-in — returning users go straight to Google.
 */
export async function ensureAuthenticated() {
  if (hasValidToken()) return true;

  // Try silent refresh before bothering the user
  if (tokenClient) {
    const refreshed = await silentRefresh();
    if (refreshed) return true;
  }

  // Only show confirm dialog on first-ever sign-in
  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  if (!tokenData.email) {
    const { confirmDialog } = await import('../../ui/confirm-dialog.js');
    const confirmed = await confirmDialog(
      'Sign in to Google Drive to sync your saves?',
      { title: 'Connect Google Drive' }
    );
    if (!confirmed) return false;
  }
  // Previously authenticated — skip the dialog and go straight to sign-in

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
        scheduleProactiveRefresh(tokenData.expiresAt);
      } else {
        localStorage.removeItem('gdrive_token');
        accessToken = null;
        state.gdriveSignedIn = false;
        state.gdriveEmail = null;

        // Token expired — attempt silent refresh immediately
        const refreshed = await silentRefresh();
        if (!refreshed) {
          window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
        }
      }
    }

    const lastSyncTime = localStorage.getItem('iftalk_lastSyncTime');
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
  scheduleProactiveRefresh(expiresAt);

  // Fetch email in background
  fetchUserInfo().then(userInfo => {
    tokenData.email = userInfo.email;
    localStorage.setItem('gdrive_token', JSON.stringify(tokenData));
    localStorage.setItem('gdrive_email', userInfo.email); // persists past token expiry
    state.gdriveEmail = userInfo.email;
    window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
  }).catch(() => {});
}

function handleAuthCallback(response) {
  if (response.error) {
    updateStatus('Sign-in failed: ' + response.error, 'error');
    return;
  }
  _storeToken(response);
}

/**
 * Schedule a proactive silent refresh before the token expires.
 */
function scheduleProactiveRefresh(expiresAt) {
  if (refreshTimer) clearTimeout(refreshTimer);

  const delay = expiresAt - Date.now() - REFRESH_BUFFER_MS;
  if (delay <= 0) {
    // Already within buffer window — refresh now
    silentRefresh();
    return;
  }

  refreshTimer = setTimeout(async () => {
    const refreshed = await silentRefresh();
    if (!refreshed) {
      // Silent refresh failed (user logged out of Google) — just update UI state
      // Don't interrupt the user; they'll be prompted next time they sync
      state.gdriveSignedIn = false;
      accessToken = null;
      localStorage.removeItem('gdrive_token');
      window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
    }
  }, delay);
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
 */
export async function signIn() {
  if (!tokenClient) throw new Error('Google Drive sync not initialized');

  // Try silent refresh first — avoids popup flash when the Google session is still alive
  if (!hasValidToken()) {
    const refreshed = await silentRefresh();
    if (refreshed) return;
  }

  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  // Only force account selection on very first sign-in; after that go straight through
  const prompt = tokenData.email ? '' : 'select_account';
  tokenClient.requestAccessToken({ prompt });
}

export async function signOut() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }

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
