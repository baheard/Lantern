/**
 * Google Drive Authentication Module
 *
 * Handles OAuth authentication, token management, sign in/out.
 */

import { APP_CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { updateStatus } from '../status.js';

// Google API configuration
// drive.file: Create/modify app files, userinfo.email: Get user email
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

// Google API client instances
let tokenClient = null;
let accessToken = null;

// Session flag: user declined auth for auto-sync (don't prompt again this session)
let autoSyncAuthDeclined = false;

/**
 * Get current access token
 * @returns {string|null} Access token or null
 */
export function getAccessToken() {
  return accessToken;
}

/**
 * Set access token (used by API module)
 * @param {string} token - Access token
 */
export function setAccessToken(token) {
  accessToken = token;
}

/**
 * Check if current token is valid
 * @returns {boolean} True if token is valid
 */
export function hasValidToken() {
  if (!accessToken) return false;

  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  if (!tokenData.expiresAt) return false;

  return Date.now() < tokenData.expiresAt;
}

/**
 * Ensure user is authenticated, prompting if needed
 * @param {boolean} isAutoSync - If true, respects session-level cancellation
 * @returns {Promise<boolean>} true if authenticated, false if cancelled
 */
export async function ensureAuthenticated(isAutoSync = false) {
  if (hasValidToken()) {
    return true; // Already authenticated
  }

  // If this is auto-sync and user previously declined this session, skip silently
  if (isAutoSync && autoSyncAuthDeclined) {
    return false;
  }

  // Token expired or missing - ask user to sign in
  const { confirmDialog } = await import('../../ui/confirm-dialog.js');
  const confirmed = await confirmDialog(
    'Sign in to Google Drive to sync your saves?',
    { title: 'Authentication Required' }
  );

  if (!confirmed) {
    // If auto-sync, remember the cancellation for this session
    if (isAutoSync) {
      autoSyncAuthDeclined = true;
    }
    return false;
  }

  // Sign in
  await signIn();

  // Wait for auth to complete (check every 100ms, timeout after 30s)
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 300; // 30 seconds

    const checkAuth = () => {
      if (hasValidToken()) {
        resolve(true);
      } else if (attempts >= maxAttempts) {
        resolve(false);
      } else {
        attempts++;
        setTimeout(checkAuth, 100);
      }
    };

    setTimeout(checkAuth, 500); // Initial delay for popup to complete
  });
}

/**
 * Initialize Google Drive sync
 * Sets up OAuth client and checks for existing authentication
 */
export async function initGDriveSync() {
  try {
    // Wait for Google Identity Services to load
    await waitForGoogleApi();

    // Initialize token client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: APP_CONFIG.googleClientId,
      scope: SCOPES,
      callback: handleAuthCallback,
    });

    // Check for stored token
    const storedToken = localStorage.getItem('gdrive_token');
    if (storedToken) {
      const tokenData = JSON.parse(storedToken);

      // Check if token is still valid
      if (tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
        accessToken = tokenData.accessToken;
        state.gdriveSignedIn = true;
        state.gdriveEmail = tokenData.email || null;

        // Notify UI to update
        window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
      } else {
        // Token expired, clear it
        localStorage.removeItem('gdrive_token');
        accessToken = null;
        state.gdriveSignedIn = false;
        state.gdriveEmail = null;
      }
    }

    // Restore last sync time from localStorage
    const lastSyncTime = localStorage.getItem('iftalk_lastSyncTime');
    if (lastSyncTime) {
      state.gdriveLastSyncTime = lastSyncTime;
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Wait for Google API to load
 */
function waitForGoogleApi() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds

    const checkApi = () => {
      if (typeof google !== 'undefined' && google.accounts) {
        resolve();
      } else if (attempts >= maxAttempts) {
        reject(new Error('Google API failed to load'));
      } else {
        attempts++;
        setTimeout(checkApi, 100);
      }
    };

    checkApi();
  });
}

/**
 * Handle OAuth callback
 */
function handleAuthCallback(response) {
  if (response.error) {
    updateStatus('Sign-in failed: ' + response.error, 'error');
    return;
  }

  // Store access token immediately
  accessToken = response.access_token;
  const expiresAt = Date.now() + (response.expires_in * 1000);

  // Save token to localStorage FIRST (before fetching email)
  const tokenData = {
    accessToken: response.access_token,
    expiresAt: expiresAt,
    email: null, // Will be updated if email fetch succeeds
  };
  localStorage.setItem('gdrive_token', JSON.stringify(tokenData));

  // Update state
  state.gdriveSignedIn = true;
  state.gdriveError = null;

  // Trigger UI update event immediately
  window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));

  // Try to get user info (but don't fail if this doesn't work)
  fetchUserInfo().then(userInfo => {
    // Update with email
    tokenData.email = userInfo.email;
    localStorage.setItem('gdrive_token', JSON.stringify(tokenData));
    state.gdriveEmail = userInfo.email;

    // Trigger UI update again with email
    window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
  }).catch(error => {
    // Failed to fetch user info, token saved anyway
  });
}

/**
 * Fetch user info from Google
 */
async function fetchUserInfo() {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return await response.json();
}

/**
 * Sign in to Google Drive
 */
export async function signIn() {
  if (!tokenClient) {
    throw new Error('Google Drive sync not initialized');
  }

  // Request access token (prompt: consent forces re-authorization with updated scopes)
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Sign out from Google Drive
 */
export async function signOut() {
  if (accessToken) {
    // Revoke token
    google.accounts.oauth2.revoke(accessToken, () => {});
  }

  // Clear stored data
  localStorage.removeItem('gdrive_token');
  accessToken = null;

  // Clear app folder ID (will be re-fetched on next sign in)
  // Import clearAppFolderId from gdrive-api if needed
  const { clearAppFolderId } = await import('./gdrive-api.js');
  clearAppFolderId();

  state.gdriveSignedIn = false;
  state.gdriveEmail = null;
  state.gdriveLastSyncTime = null;
  state.gdriveError = null;

  // Trigger UI update event
  window.dispatchEvent(new CustomEvent('gdriveSignInChanged'));
}

/**
 * Check if signed in
 * @returns {boolean} True if signed in
 */
export function isSignedIn() {
  return state.gdriveSignedIn && accessToken !== null;
}
