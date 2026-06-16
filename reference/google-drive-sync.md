# Google Drive Sync Reference

## Overview

Google Drive sync provides optional cloud backup and cross-device synchronization for Lantern game saves. The implementation uses OAuth 2.0 for authentication and the Google Drive API v3 for file storage.

**Key Features:**
- ✅ **Manual Sync**: "Sync Now" button uploads all saves on demand
- ✅ **OAuth 2.0**: Secure authentication with Google Identity Services
- ✅ **Seamless Re-Authentication**: Auto-prompts for sign-in when token expires
- ✅ **Device Tracking**: Each save includes device ID, type, and browser info
- ✅ **Conflict Resolution**: Automatic resolution using newest timestamp
- ✅ **Conflict-Based Backups**: 2 backups per device, created only when overwriting local data
- ✅ **Auto-Sync**: Automatic background upload after saves (5-second debounce)
- ✅ **Graceful Degradation**: App works fully offline without Google Drive
- ✅ **Clear Data Integration**: Deletes Drive data when clearing local data

---

## Architecture

### File Structure

```
docs/js/
├── config.js                    # App configuration (Client ID, folder name)
├── core/state.js               # Drive state properties
├── utils/gdrive-sync.js        # Core sync module (~600 lines)
├── ui/settings.js              # Drive UI handlers + updateGDriveUI()
└── app.js                      # Drive initialization

docs/index.html                 # Cloud Sync UI section
docs/styles.css                 # Drive UI styles
```

### Module: `gdrive-sync.js`

**Exports:**
- `initGDriveSync()` - Initialize OAuth client, check stored token
- `signIn()` - Trigger OAuth consent flow
- `signOut()` - Revoke token, clear state
- `isSignedIn()` - Check authentication status
- `getDeviceId()` - Generate/retrieve unique device ID
- `getDeviceInfo()` - Get device type, browser, timestamp
- `syncAllNow()` - Manual sync: upload all saves to Drive
- `downloadAllSaves()` - Download and merge saves from Drive

**Internal Functions:**
- `waitForGoogleApi()` - Poll for Google API script load
- `handleAuthCallback()` - Process OAuth response
- `fetchUserInfo()` - Get email from Google OAuth2 API
- `ensureAppFolder()` - Create/find "Lantern" folder in Drive
- `uploadFile()` - Upload or update file in Drive
- `downloadFile()` - Download file from Drive
- `listFiles()` - List all files in app folder
- `localStorageKeyToFilename()` - Convert localStorage key to Drive filename
- `filenameToLocalStorageKey()` - Convert Drive filename to localStorage key

---

## OAuth 2.0 Flow

### 1. Initialization (`initGDriveSync()`)

```javascript
// Called on app startup (app.js line 297)
await initGDriveSync();
```

**Process:**
1. Wait for Google Identity Services script to load
2. Initialize `tokenClient` with OAuth config:
   - Client ID from `APP_CONFIG.googleClientId`
   - Scopes: `drive.file` + `userinfo.email`
   - Callback: `handleAuthCallback()`
3. Check `localStorage` for stored token
4. If valid token exists, restore session:
   - Set `accessToken`
   - Update `state.gdriveSignedIn = true`
   - Update `state.gdriveEmail`

### 2. Sign-In Flow (`signIn()`)

```javascript
// Triggered by "Sign in with Google" button
const { signIn } = await import('./utils/gdrive-sync.js');
await signIn();
```

**Process:**
1. Call `tokenClient.requestAccessToken({ prompt: 'consent' })`
2. Google OAuth popup opens
3. User signs in and grants permissions:
   - **Drive**: Read/write files created by this app
   - **Email**: Access email address
4. Google redirects back with auth code
5. `handleAuthCallback()` receives response:
   ```javascript
   {
     access_token: "ya29.a0...",
     expires_in: 3599,  // 1 hour
     scope: "https://www.googleapis.com/auth/drive.file ...",
     token_type: "Bearer"
   }
   ```
6. Fetch user email via Google OAuth2 API:
   ```javascript
   GET https://www.googleapis.com/oauth2/v2/userinfo
   Authorization: Bearer {access_token}
   ```
7. Store token + email in `localStorage`:
   ```javascript
   {
     accessToken: "ya29.a0...",
     expiresAt: 1735000000000,  // timestamp
     email: "user@gmail.com"
   }
   ```
8. Update state and trigger `gdriveSignInChanged` event
9. UI updates via `updateGDriveUI()`

### 3. Sign-Out Flow (`signOut()`)

```javascript
// Triggered by "Sign Out" button
await signOut();
```

**Process:**
1. Revoke token with Google:
   ```javascript
   google.accounts.oauth2.revoke(accessToken, callback);
   ```
2. Clear `localStorage.removeItem('gdrive_token')`
3. Reset state:
   - `state.gdriveSignedIn = false`
   - `state.gdriveEmail = null`
   - `state.gdriveLastSyncTime = null`
   - `state.gdriveError = null`
4. Trigger `gdriveSignInChanged` event
5. UI updates to show "Sign in" button

---

## Device Tracking

### Device ID Generation (`getDeviceId()`)

Each browser/device gets a unique ID stored in `localStorage`:

```javascript
// Format: {timestamp}-{random}-{fingerprint}
const deviceId = `${Date.now()}-${random}-${btoa(fingerprint).substring(0, 16)}`;
// Example: 1735234567-abc123def456-dGV4dA==
```

**Fingerprint Components:**
- `navigator.userAgent` - Browser and OS
- `navigator.language` - Browser language
- `screen.width + 'x' + screen.height` - Screen resolution
- `Intl.DateTimeFormat().resolvedOptions().timeZone` - Timezone

**Storage:**
- Key: `iftalk_device_id`
- Persists across page reloads
- Same ID used for all saves on this device

### Device Info Structure (`getDeviceInfo()`)

```javascript
{
  id: "1735234567-abc123-dGV4dA",
  type: "iOS",      // iOS, Android, Desktop, Mobile
  browser: "Safari", // Chrome, Safari, Firefox, Edge
  timestamp: "2024-12-23T10:30:45.123Z"
}
```

**Device Type Detection:**
- iOS: `/iPhone|iPad|iPod/`
- Android: `/Android/`
- Mobile: `/Mobile|Android|iPhone|iPad/i`
- Desktop: Default if none match

**Browser Detection:**
- Edge: `ua.includes('Edg')`
- Chrome: `ua.includes('Chrome')`
- Safari: `ua.includes('Safari')`
- Firefox: `ua.includes('Firefox')`

---

## Save Data Structure

### localStorage Format (Existing)

```javascript
// Key: iftalk_autosave_lostpig
{
  timestamp: "2024-12-23T10:30:45.123Z",
  gameName: "lostpig",
  quetzalData: "base64-encoded-zvm-state...",
  displayHTML: {
    statusBar: "<span>...</span>",
    upperWindow: "<div>...</div>",
    mainWindow: "<div>...</div>"
  },
  voxglkState: {
    generation: 5,
    windows: [...],
    ...
  }
}
```

### Google Drive Format (Enhanced)

Same as localStorage, plus device info:

```javascript
{
  // Original save data (from localStorage)
  timestamp: "2024-12-23T10:30:45.123Z",
  gameName: "lostpig",
  quetzalData: "base64...",
  displayHTML: { ... },
  voxglkState: { ... },

  // NEW: Device tracking (added by syncAllNow)
  device: {
    id: "1735234567-abc123-dGV4dA",
    type: "iOS",
    browser: "Safari",
    timestamp: "2024-12-23T10:30:45.123Z"
  }
}
```

### Filename Mapping

**localStorage → Drive:**
```
iftalk_autosave_lostpig    → lostpig_autosave.json
iftalk_quicksave_lostpig   → lostpig_quicksave.json
iftalk_customsave_lostpig  → lostpig_customsave.json
iftalk_autosave_anchorhead → anchorhead_autosave.json
```

**Algorithm:**
```javascript
// localStorage key format: {prefix}_{type}_{gameName}
// Drive filename format: {gameName}_{type}.json

function localStorageKeyToFilename(key) {
  // "iftalk_autosave_lostpig" → "lostpig_autosave.json"
  const prefix = APP_CONFIG.storagePrefix + '_'; // "iftalk_"
  const rest = key.substring(prefix.length);     // "autosave_lostpig"
  const parts = rest.split('_');                 // ["autosave", "lostpig"]
  const type = parts[0];                         // "autosave"
  const gameName = parts.slice(1).join('_');     // "lostpig"
  return `${gameName}_${type}.json`;             // "lostpig_autosave.json"
}
```

---

## Manual Sync Process

### Upload: `syncAllNow()`

**Triggered by:** "Sync Now" button click

**Process:**
1. **Check authentication:**
   - If not signed in, throw error
   - Set `state.gdriveSyncPending = true`

2. **Find all saves in localStorage:**
   ```javascript
   const saveKeys = [];
   for (let i = 0; i < localStorage.length; i++) {
     const key = localStorage.key(i);
     if (key.startsWith('iftalk_autosave_') ||
         key.startsWith('iftalk_quicksave_') ||
         key.startsWith('iftalk_customsave_')) {
       saveKeys.push(key);
     }
   }
   ```

3. **Upload each save:**
   - Get save data from localStorage
   - Add device info: `{ ...saveData, device: getDeviceInfo() }`
   - Convert key to filename
   - Call `uploadFile(filename, enrichedData)`

4. **Update state:**
   - `state.gdriveLastSyncTime = new Date().toISOString()`
   - `state.gdriveSyncPending = false`
   - `state.gdriveError = null`

5. **Return count:**
   - Number of files uploaded

**Error Handling:**
- Catch errors per file (continue if one fails)
- Set `state.gdriveError` on failure
- Set `state.gdriveSyncPending = false`

### Upload: `uploadFile(filename, data)`

**Process:**
1. **Ensure app folder exists:**
   - Call `ensureAppFolder()`
   - Search for "Lantern" folder in Drive
   - Create if not found
   - Cache `appFolderId`

2. **Check if file exists:**
   ```javascript
   GET https://www.googleapis.com/drive/v3/files
   ?q=name='lostpig_autosave.json' and 'FOLDER_ID' in parents and trashed=false
   Authorization: Bearer {accessToken}
   ```

3. **Upload or update:**
   - If exists: PATCH existing file
   - If new: POST new file
   - Use multipart upload with metadata + content

4. **Multipart request:**
   ```http
   POST/PATCH https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
   Authorization: Bearer {accessToken}
   Content-Type: multipart/related; boundary="-------314159265358979323846"

   -------314159265358979323846
   Content-Type: application/json

   {
     "name": "lostpig_autosave.json",
     "mimeType": "application/json",
     "parents": ["FOLDER_ID"]
   }
   -------314159265358979323846
   Content-Type: application/json

   {
     "timestamp": "2024-12-23T10:30:45.123Z",
     "gameName": "lostpig",
     "device": { ... },
     ...
   }
   -------314159265358979323846--
   ```

5. **Return result:**
   - Drive file metadata (id, name, etc.)

---

## Conflict Resolution

### Download: `downloadAllSaves()`

**Purpose:** Merge Drive saves with local saves (newest wins)

**Process:**
1. **List all files in Drive:**
   ```javascript
   GET https://www.googleapis.com/drive/v3/files
   ?q='FOLDER_ID' in parents and trashed=false
   ```

2. **For each Drive file:**
   - Download file content
   - Convert filename to localStorage key
   - Get local save (if exists)

3. **Conflict resolution:**
   ```javascript
   if (!localData) {
     // No local save - use Drive version
     localStorage.setItem(localKey, JSON.stringify(driveData));
   } else {
     // Compare timestamps
     const localTime = new Date(localData.timestamp).getTime();
     const driveTime = new Date(driveData.timestamp).getTime();

     if (driveTime > localTime) {
       // Drive is newer - overwrite local
       localStorage.setItem(localKey, JSON.stringify(driveData));
     }
     // else: local is newer - keep local
   }
   ```

4. **Device change detection:**
   ```javascript
   const currentDeviceId = getDeviceId();
   if (driveData.device?.id !== currentDeviceId) {
     state.deviceChangeDetected = true;
     state.lastDeviceId = driveData.device.id;

     const deviceName = `${driveData.device.type} (${driveData.device.browser})`;
     updateStatus(`Loaded newer save from ${deviceName}`, 'info');
   }
   ```

**Auto-Download:**
- Currently not implemented
- Future: Call `downloadAllSaves()` on page load if signed in

---

## State Management

### State Properties (`core/state.js`)

```javascript
// Google Drive sync state
gdriveSignedIn: false,        // Is user signed in?
gdriveEmail: null,            // User's email address
gdriveSyncEnabled: false,     // Auto-sync enabled? (unused, for Phase 3)
gdriveSyncPending: false,     // Is sync currently in progress?
gdriveLastSyncTime: null,     // ISO timestamp of last sync
gdriveError: null,            // Last error message (if any)

// Device tracking
deviceId: null,               // Current device ID (set on init)
deviceInfo: null,             // Current device info (type, browser, etc.)
deviceChangeDetected: false,  // Did we load a save from different device?
lastDeviceId: null,           // Device ID that created last loaded save
```

### Token Storage (localStorage)

**Key:** `gdrive_token`

**Value:**
```javascript
{
  accessToken: "ya29.a0AfB_byD...",
  expiresAt: 1735234567000,  // Unix timestamp (ms)
  email: "user@gmail.com"
}
```

**Expiration:**
- Tokens expire after 1 hour
- Currently no auto-refresh (will be added in Phase 5)
- User must sign out and sign in again after expiration

### Device ID Storage (localStorage)

**Key:** `iftalk_device_id`

**Value:**
```
1735234567-abc123def456-dGV4dA==
```

---

## UI Components

### HTML Structure (`index.html`)

```html
<!-- Cloud Sync Section -->
<div class="settings-section collapsible collapsed" id="cloudSyncSection">
  <h3 class="section-header">
    <span class="material-icons">cloud</span> Cloud Sync
  </h3>
  <div class="section-content">

    <!-- Sign-in area (shown when not signed in) -->
    <div id="gdriveSignInArea">
      <button class="btn btn-primary btn-full-width" id="gdriveSignInBtn">
        Sign in with Google
      </button>
    </div>

    <!-- Account area (shown when signed in) -->
    <div id="gdriveAccountArea" class="hidden">
      <div class="gdrive-account-info">
        <span class="material-icons">account_circle</span>
        <span id="gdriveEmail">user@gmail.com</span>
      </div>

      <div class="gdrive-sync-status">
        <span id="gdriveSyncStatus">Last synced: Never</span>
      </div>

      <button id="gdriveSyncNowBtn">Sync Now</button>
      <button id="gdriveSignOutBtn">Sign Out</button>
    </div>

  </div>
</div>
```

### Event Handlers (`ui/settings.js`)

**Sign In Button:**
```javascript
gdriveSignInBtn.addEventListener('click', async () => {
  const { signIn } = await import('../utils/gdrive-sync.js');
  await signIn();
  updateGDriveUI();
  updateStatus('Signed in to Google Drive', 'success');
});
```

**Sign Out Button:**
```javascript
gdriveSignOutBtn.addEventListener('click', async () => {
  const { signOut } = await import('../utils/gdrive-sync.js');
  await signOut();
  updateGDriveUI();
  updateStatus('Signed out of Google Drive');
});
```

**Sync Now Button:**
```javascript
gdriveSyncNowBtn.addEventListener('click', async () => {
  const { syncAllNow } = await import('../utils/gdrive-sync.js');
  updateStatus('Syncing saves to Google Drive...', 'processing');
  const count = await syncAllNow();
  updateGDriveUI();
  updateStatus(`Synced ${count} file(s) to Google Drive`, 'success');
});
```

**Sign-In Changed Event:**
```javascript
window.addEventListener('gdriveSignInChanged', () => {
  updateGDriveUI();
});
```

### UI Update Function (`updateGDriveUI()`)

**Purpose:** Show/hide UI based on sign-in state

**Logic:**
```javascript
function updateGDriveUI() {
  const signInArea = document.getElementById('gdriveSignInArea');
  const accountArea = document.getElementById('gdriveAccountArea');
  const emailSpan = document.getElementById('gdriveEmail');
  const statusSpan = document.getElementById('gdriveSyncStatus');

  if (state.gdriveSignedIn) {
    // Show account area, hide sign-in area
    signInArea?.classList.add('hidden');
    accountArea?.classList.remove('hidden');

    // Update email
    emailSpan.textContent = state.gdriveEmail || '';

    // Update last sync time
    const lastSync = state.gdriveLastSyncTime
      ? new Date(state.gdriveLastSyncTime).toLocaleString()
      : 'Never';
    statusSpan.textContent = `Last synced: ${lastSync}`;
  } else {
    // Show sign-in area, hide account area
    signInArea?.classList.remove('hidden');
    accountArea?.classList.add('hidden');
  }
}
```

### CSS Styles (`styles.css`)

```css
/* Account info box */
.gdrive-account-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-surface, #2a2a2a);
  border-radius: 8px;
  margin-bottom: 12px;
}

/* Sync status text */
.gdrive-sync-status {
  font-size: 0.9em;
  color: var(--text-muted, #888);
  padding: 8px 0;
  margin-bottom: 10px;
}

/* Primary button (Sign in) */
.btn-primary {
  background: var(--accent-warm, #e8b86d);
  color: var(--text-primary, #fff);
  border: none;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1em;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Secondary button (Sync Now, Sign Out) */
.btn-secondary {
  background: var(--bg-surface, #2a2a2a);
  color: var(--text-primary, #fff);
  border: 1px solid var(--border-subtle, #444);
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
}

/* Full-width button */
.btn-full-width {
  width: 100%;
  justify-content: center;
}

/* Hidden class */
.hidden {
  display: none !important;
}
```

---

## Configuration

### Google Cloud Console Setup

**1. Create Project:**
- Go to https://console.cloud.google.com/
- Create project: "Lantern"

**2. Enable API:**
- Navigate to: APIs & Services → Library
- Search: "Google Drive API"
- Click "Enable"

**3. Configure OAuth Consent Screen:**
- APIs & Services → OAuth consent screen
- User Type: External
- App name: Lantern
- User support email: (your email)
- Developer contact: (your email)
- Scopes: (skip, use default)
- Test users: (add your email)

**4. Create OAuth Client:**
- APIs & Services → Credentials
- Create Credentials → OAuth client ID
- Application type: Web application
- Name: Lantern Web Client
- Authorized JavaScript origins:
  - `http://localhost:3000`
  - `https://baheard.github.io` (if deploying)
- Copy Client ID

**5. Update config.js:**
```javascript
export const APP_CONFIG = {
  googleClientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  // ...
};
```

### App Configuration (`config.js`)

```javascript
export const APP_CONFIG = {
  // App identity
  name: 'Lantern',
  displayName: 'Lantern',
  version: '1.0.0',

  // Storage prefixes (localStorage keys)
  storagePrefix: 'iftalk',

  // Google Drive folder name
  driveFolderName: 'Lantern',

  // OAuth Client ID (from Google Cloud Console)
  googleClientId: '159814585278-bgntpcpcpa4pcmc77vimbr9t3e0ogfta.apps.googleusercontent.com',

  // Backup settings (Phase 4)
  maxBackupVersions: 10,

  // Device tracking
  deviceIdKey: 'iftalk_device_id',
};
```

---

## Error Handling

### Initialization Errors

**Google API not loaded:**
```javascript
try {
  await initGDriveSync();
} catch (error) {
  console.warn('[App] Google Drive sync unavailable:', error.message);
  // Hide Cloud Sync section
  const cloudSyncSection = document.getElementById('cloudSyncSection');
  if (cloudSyncSection) cloudSyncSection.style.display = 'none';
}
```

**App continues to work offline** - graceful degradation.

### Sign-In Errors

**OAuth popup blocked:**
- User sees browser popup blocker warning
- Click "Allow popups" and try again

**User denies permissions:**
```javascript
handleAuthCallback(response) {
  if (response.error) {
    console.error('[GDrive] Auth error:', response);
    updateStatus('Sign-in failed: ' + response.error, 'error');
    return;
  }
  // ...
}
```

**Fetch user info fails:**
```javascript
.catch(error => {
  console.error('[GDrive] Failed to fetch user info:', error);
  // User is signed in but email not displayed
  // Can still use sync functionality
});
```

### Sync Errors

**Not signed in:**
```javascript
if (!isSignedIn()) {
  throw new Error('Not signed in to Google Drive');
}
```

**File upload fails:**
```javascript
try {
  await uploadFile(filename, data);
  uploadCount++;
} catch (error) {
  console.error('[GDrive] Failed to upload', key, ':', error);
  // Continue with next file
}
```

**Network error:**
```javascript
state.gdriveError = error.message;
updateStatus('Sync failed - will retry later', 'error');
```

### Token Expiration

**Current behavior:**
- Token expires after 1 hour
- No auto-refresh (Phase 5 feature)
- API calls return 401 Unauthorized
- User must sign out and sign in again

**Future (Phase 5):**
```javascript
async function getValidToken() {
  const tokenData = JSON.parse(localStorage.getItem('gdrive_token') || '{}');
  const expiresAt = tokenData.expiresAt || 0;

  if (Date.now() >= expiresAt - 60000) { // Refresh 1 min before expiry
    return await refreshToken();
  }
  return tokenData.accessToken;
}
```

---

## Google Drive API Usage

### API Endpoints

**Search for folder:**
```http
GET https://www.googleapis.com/drive/v3/files
?q=name='Lantern' and mimeType='application/vnd.google-apps.folder' and trashed=false
Authorization: Bearer {accessToken}
```

**Create folder:**
```http
POST https://www.googleapis.com/drive/v3/files
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "name": "Lantern",
  "mimeType": "application/vnd.google-apps.folder"
}
```

**Search for file:**
```http
GET https://www.googleapis.com/drive/v3/files
?q=name='lostpig_autosave.json' and 'FOLDER_ID' in parents and trashed=false
Authorization: Bearer {accessToken}
```

**Upload new file:**
```http
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
Authorization: Bearer {accessToken}
Content-Type: multipart/related; boundary="-------314159265358979323846"

[multipart body with metadata + content]
```

**Update existing file:**
```http
PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=multipart
Authorization: Bearer {accessToken}
Content-Type: multipart/related; boundary="-------314159265358979323846"

[multipart body with metadata + content]
```

**Download file:**
```http
GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
Authorization: Bearer {accessToken}
```

**List files in folder:**
```http
GET https://www.googleapis.com/drive/v3/files
?q='FOLDER_ID' in parents and trashed=false
Authorization: Bearer {accessToken}
```

### Rate Limits

**Google Drive API v3:**
- 1000 requests per 100 seconds per user
- 10000 requests per 100 seconds per project

**Current usage:**
- Sign in: 3 requests (folder search/create, file list, user info)
- Sync Now: 1 + (2 × number of saves) requests
  - 1 folder check
  - 2 per save (search + upload/update)
- Example: 3 saves = 7 requests

**Optimization:**
- Cache folder ID after first lookup
- Batch operations in future phases

### Scopes

**Currently requested:**
```
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/userinfo.email
```

**Permissions granted:**
- `drive.file`: Read/write files created by this app only (not all Drive files)
- `userinfo.email`: Read user's email address

**Security:**
- App cannot access files created by other apps
- App cannot see user's entire Drive
- Limited to app-created folder only

---

## Testing

### Manual Testing Checklist

**Phase 2: Manual Sync**

- [x] Google Cloud project created
- [x] Drive API enabled
- [x] OAuth consent screen configured
- [x] OAuth Client ID created
- [x] Client ID added to config.js
- [x] Sign in opens OAuth popup
- [x] After sign-in, email displayed
- [x] "Sync Now" button visible when signed in
- [x] Click "Sync Now" → saves upload to Drive
- [x] Check Drive → "Lantern" folder exists
- [x] Drive folder contains `{game}_{type}.json` files
- [x] Open file in Drive → contains device info
- [x] Sign out → UI resets
- [x] Reload page → session restored (if token valid)
- [x] Device ID persists across reloads
- [x] Load save from different device → notification shown

### Cross-Device Testing

1. **Device A (Desktop Chrome):**
   - Load game, play to turn 5
   - Sign in to Google Drive
   - Click "Sync Now"
   - Verify upload succeeded

2. **Device B (Mobile Safari):**
   - Load same game
   - Sign in to Google Drive (same account)
   - Click "Sync Now" (uploads local autosave if newer)
   - Open console, check for device change notification
   - Play to turn 10
   - Click "Sync Now"

3. **Device A (Desktop Chrome):**
   - Reload page
   - Manual download (future): should get turn 10 save
   - Notification: "Loaded newer save from iOS (Safari)"

### Error Scenarios

**Test these:**
- [ ] Block Google API script → Cloud Sync section hidden
- [ ] Revoke app permissions in Google account → sign in fails
- [ ] Network offline during sync → error message shown
- [ ] Token expires (wait 1 hour) → API calls fail, need re-sign-in
- [ ] Multiple rapid "Sync Now" clicks → should handle gracefully
- [ ] Sign out with sync in progress → should cancel/complete cleanly

---

## Future Enhancements

### Phase 3: Auto-Export (Not Yet Implemented)

**Goal:** Automatically upload saves in background after each turn

**Implementation:**
1. Add debounce function (5-second delay)
2. Hook into save-manager.js:
   - `autoSave()` → schedule upload
   - `quickSave()` → schedule upload
   - `customSave()` → schedule upload
3. Non-blocking background upload

**Code (planned):**
```javascript
// In save-manager.js
localStorage.setItem(key, JSON.stringify(saveData));

// NEW: Background sync
if (state.gdriveSignedIn) {
  const { scheduleDriveSync, getDeviceInfo } = await import('../utils/gdrive-sync.js');
  const enrichedData = { ...saveData, device: getDeviceInfo() };
  scheduleDriveSync(key, enrichedData); // 5-second debounce
}
```

### Phase 4: Versioned Backups (Not Yet Implemented)

**Goal:** Keep last 10 versions of each save for recovery

**Folder Structure:**
```
Lantern/
├── lostpig_autosave.json       # Current (latest)
├── lostpig_quicksave.json
└── backups/
    ├── lostpig_autosave/
    │   ├── v001.json            # Oldest
    │   ├── v002.json
    │   ├── ...
    │   └── v010.json            # Newest backup
    └── lostpig_quicksave/
        └── ...
```

**Rotation Logic:**
1. Before uploading new version, download current
2. Move current to `backups/{saveKey}/v{next}.json`
3. Delete oldest if > 10 versions
4. Upload new version as current

### Phase 5: Polish (Not Yet Implemented)

**Features:**
- [ ] Auto-download on page load
- [ ] Token auto-refresh
- [ ] Exponential backoff retry
- [ ] Sync progress indicator
- [ ] Backup history UI
- [ ] Restore from backup

---

## Troubleshooting

### "Sign in with Google" button does nothing

**Cause:** Google API script not loaded

**Fix:**
1. Check console for errors
2. Verify `<script src="https://accounts.google.com/gsi/client">` in index.html
3. Check network tab - script should load successfully
4. Try hard refresh (Ctrl+Shift+R)

### "401 Unauthorized" when fetching user info

**Cause:** Missing `userinfo.email` scope

**Fix:**
1. Check `SCOPES` in gdrive-sync.js includes:
   ```javascript
   const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
   ```
2. Sign out, clear token, sign in again to get new scope

### UI doesn't update after sign-in

**Cause:** `gdriveSignInChanged` event not firing or UI not listening

**Fix:**
1. Check console for errors in `handleAuthCallback()`
2. Verify `window.dispatchEvent(new CustomEvent('gdriveSignInChanged'))` is called
3. Verify event listener in settings.js
4. Check `updateGDriveUI()` function

### "Sync Now" button fails silently

**Cause:** No saves in localStorage or API error

**Fix:**
1. Open console, check for errors
2. Verify saves exist: `Object.keys(localStorage).filter(k => k.startsWith('iftalk_'))`
3. Check `state.gdriveError` for error message
4. Verify token is valid: `localStorage.getItem('gdrive_token')`

### Files not appearing in Google Drive

**Cause:** Folder creation failed or files uploaded to wrong location

**Fix:**
1. Check `appFolderId` is set
2. Search Drive for "Lantern" folder
3. Check file permissions (should be owned by you)
4. Try manual folder creation and update code with folder ID

---

## Security Considerations

### Token Storage

**Current:**
- Access token stored in `localStorage`
- No encryption (standard practice for web OAuth)
- Token expires after 1 hour

**Risks:**
- XSS attacks could steal token
- Token valid for 1 hour only
- Limited to `drive.file` scope (can't access other files)

**Mitigations:**
- Use Content Security Policy (CSP)
- Regular dependency audits
- Short token lifetime
- Minimal scopes requested

### Device Fingerprinting

**Privacy:**
- Device ID includes browser fingerprint
- Not personally identifiable
- Used only for save tracking

**User Control:**
- Device ID stored locally
- Not sent to any server except Google Drive (in save files)
- User can clear by deleting localStorage

### Google Drive Permissions

**Principle of Least Privilege:**
- Only request `drive.file` scope (not full Drive access)
- App cannot see files created by other apps
- App cannot modify user's existing files

### HTTPS Requirement

**OAuth Security:**
- Google requires HTTPS for OAuth (except localhost)
- Deploy to GitHub Pages (HTTPS by default)
- Never use HTTP in production

---

## Performance

### localStorage Speed

**Save operations:**
- Instant (< 1ms)
- No change from before (sync happens after save)
- No blocking or delays

### Sync Performance

**Manual sync with 3 saves:**
- Total time: ~2-3 seconds
- Breakdown:
  - Folder lookup: ~300ms (cached after first time)
  - Per file: ~500-700ms each
    - Search: ~200ms
    - Upload: ~300-500ms

**Network impact:**
- Files typically < 50 KB each
- Total upload: < 200 KB for 3 saves
- Minimal bandwidth usage

### Optimization Opportunities

**Future:**
- Cache folder ID (avoid repeated lookups) ✅ Already implemented
- Batch file operations (Drive API supports batch)
- Compress save data before upload
- Only sync changed files (checksum comparison)

---

## Code Examples

### Complete Sign-In Flow Example

```javascript
// 1. User clicks "Sign in with Google"
const signInBtn = document.getElementById('gdriveSignInBtn');
signInBtn.addEventListener('click', async () => {
  try {
    // 2. Import and call signIn
    const { signIn } = await import('./utils/gdrive-sync.js');
    await signIn();

    // 3. OAuth popup opens, user grants permissions
    // 4. handleAuthCallback() processes response
    // 5. fetchUserInfo() gets email
    // 6. Token stored in localStorage
    // 7. gdriveSignInChanged event fires

    // 8. Update UI
    updateGDriveUI();

    // 9. Show success message
    updateStatus('Signed in to Google Drive', 'success');
  } catch (error) {
    console.error('[Settings] Sign-in failed:', error);
    updateStatus('Sign-in failed: ' + error.message, 'error');
  }
});
```

### Complete Sync Flow Example

```javascript
// 1. User clicks "Sync Now"
const syncBtn = document.getElementById('gdriveSyncNowBtn');
syncBtn.addEventListener('click', async () => {
  try {
    // 2. Import and call syncAllNow
    const { syncAllNow } = await import('./utils/gdrive-sync.js');

    // 3. Show progress message
    updateStatus('Syncing saves to Google Drive...', 'processing');

    // 4. Upload all saves
    const count = await syncAllNow();
    // - Finds all iftalk_autosave_*, iftalk_quicksave_*, etc.
    // - Adds device info to each
    // - Uploads to Drive
    // - Updates state.gdriveLastSyncTime

    // 5. Update UI
    updateGDriveUI();

    // 6. Show success message
    updateStatus(`Synced ${count} file(s) to Google Drive`, 'success');
  } catch (error) {
    console.error('[Settings] Sync failed:', error);
    updateStatus('Sync failed: ' + error.message, 'error');
  }
});
```

### Device Tracking Example

```javascript
// Generate device ID (first load)
const deviceId = getDeviceId();
// → "1735234567-abc123def456-dGV4dA=="

// Get device info
const deviceInfo = getDeviceInfo();
// → {
//     id: "1735234567-abc123def456-dGV4dA==",
//     type: "iOS",
//     browser: "Safari",
//     timestamp: "2024-12-23T10:30:45.123Z"
//   }

// Add to save before upload
const enrichedData = {
  ...saveData,
  device: deviceInfo
};

// Upload to Drive
await uploadFile('lostpig_autosave.json', enrichedData);
```

---

## Changelog

### December 23, 2024 - Initial Implementation

**Phase 0: App Configuration**
- Created `config.js` with app constants
- Added Google Client ID: `159814585278-bgntpcpcpa4pcmc77vimbr9t3e0ogfta.apps.googleusercontent.com`

**Phase 1: Core Module + Authentication**
- Created `gdrive-sync.js` (~600 lines)
- Implemented OAuth 2.0 with Google Identity Services
- Added device ID generation and tracking
- Implemented Drive API operations (upload, download, list)
- Added folder management (Lantern folder in Drive)

**Phase 2: Manual Sync UI**
- Added Google API script to index.html
- Created Cloud Sync section in settings
- Implemented sign-in/sign-out buttons
- Implemented "Sync Now" button
- Added `updateGDriveUI()` function
- Added Drive state properties to state.js
- Added Drive UI styles to styles.css
- Fixed: Added `userinfo.email` scope for fetching user email

**Status:** ✅ Manual sync working
**Next:** Phase 3 (Auto-export) after testing Phase 2

### December 23, 2024 - Phase 3 & 4 Implementation

**Phase 3: Auto-Export** ✅ COMPLETE
- Added `scheduleDriveSync()` with 5-second debounce
- Added `autoSyncToggle` checkbox in Cloud Sync UI (default: OFF)
- Hooked auto-sync into `save-manager.js`:
  - `autoSave()` - auto-uploads after each turn
  - `quickSave()` - auto-uploads after quick save
  - `customSave()` - auto-uploads after custom save
- Added `state.gdriveSyncEnabled` property
- Saves to localStorage: `iftalk_autoSyncEnabled`
- **User Control:** Toggle can be enabled/disabled at any time
- **Files Modified:**
  - `docs/js/utils/gdrive-sync.js` (+55 lines)
  - `docs/js/core/state.js` (+1 line)
  - `docs/js/game/save-manager.js` (+33 lines, 3 hooks)
  - `docs/index.html` (+8 lines)
  - `docs/js/ui/settings.js` (+15 lines)

**Phase 4: Versioned Backups** ✅ COMPLETE
- Added `backupHistoryToggle` checkbox in Cloud Sync UI (default: OFF)
- Implemented backup folder structure:
  - `Lantern/backups/{saveKey}/v001.json` → `v010.json`
- Added backup versioning functions:
  - `ensureBackupFolder()` - creates `Lantern/backups/` folder
  - `ensureSaveBackupFolder()` - creates save-specific subfolder
  - `uploadWithBackup()` - uploads with version rotation
  - `listBackupVersions()` - lists versions for a save
  - `getBackupHistory()` - downloads all backup versions
  - `restoreFromBackup()` - restores from specific version
- Added "View Backup History" button
- Added backup history modal UI with restore functionality
- Automatic rotation: deletes oldest when > 10 versions
- Added `state.gdriveBackupHistoryEnabled` property
- Saves to localStorage: `iftalk_backupHistoryEnabled`
- **User Control:** Both toggles independent, can enable either/both/neither
- **Files Modified:**
  - `docs/js/utils/gdrive-sync.js` (+366 lines)
  - `docs/js/core/state.js` (+1 line)
  - `docs/index.html` (+28 lines - modal UI)
  - `docs/js/ui/settings.js` (+100 lines - handlers + backup UI)
  - `docs/styles.css` (+100 lines - modal styles)

**Testing Status:**
- ⚠️ Phase 3 (Auto-Sync): NOT TESTED - toggle added, needs testing
- ⚠️ Phase 4 (Backup History): NOT TESTED - toggle added, needs testing
- ✅ Both features can be enabled/disabled independently
- ✅ Default: Both OFF (preserves Phase 2 manual sync behavior)

**How to Test:**
1. **Phase 2 only (current):** Leave both toggles OFF, use "Sync Now" button
2. **Phase 3 test:** Enable "Auto-Sync", play game, check auto-upload after 5 seconds
3. **Phase 4 test:** Enable "Keep Backup History", sync multiple times, click "View Backup History"
4. **Combined test:** Enable both, verify backups rotate correctly with auto-sync

---

## Related Documentation

- [Save/Restore System](save-restore-status.md) - Autosave and manual save system
- [State Variables](state-variables.md) - Application state management
- [Bug Fixes History](bug-fixes-history.md) - Past issues and solutions

---

**Last Updated:** December 23, 2024
**Implementation Status:** Phase 2 Complete (Manual Sync)
**Next Phase:** Phase 3 (Auto-Export)
