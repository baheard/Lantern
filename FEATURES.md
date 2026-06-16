# Lantern Feature Implementation Guide

## Cloud-Free Save System (localStorage)

### Overview
Save game data is stored in browser localStorage, eliminating the need for server-side storage or user accounts. Saves persist per-browser and can be exported/imported.

### Architecture

```
SAVE Flow:
┌────────┐     "save"      ┌────────┐    write file    ┌─────────┐
│ Client │ ───────────────▶│ Server │ ────────────────▶│  Frotz  │
└────────┘                 └────────┘                  └─────────┘
                                │                           │
                                │◀──── file written ────────┘
                                │
                          read .sav file
                                │
                                ▼
┌────────┐    base64 data   ┌────────┐
│ Client │ ◀────────────────│ Server │
└────────┘                  └────────┘
     │
     ▼
localStorage.setItem('iftalk_save_<game>_<slot>', base64)
```

```
RESTORE Flow:
┌────────┐   "restore"     ┌────────┐
│ Client │ ───────────────▶│ Server │
└────────┘                 └────────┘
     │                          │
     │   send save data         │
     │   from localStorage      │
     ▼                          │
┌────────┐    base64 data   ┌────────┐   write temp    ┌─────────┐
│ Client │ ────────────────▶│ Server │ ───────────────▶│  Frotz  │
└────────┘                  └────────┘   pass filename └─────────┘
```

### Server Implementation (server.js)

#### Save Detection
```javascript
// In command handler, detect SAVE command
if (command.toLowerCase().startsWith('save')) {
  // Generate predictable filename
  const saveFilename = `saves/${gameBasename}_${Date.now()}.sav`;

  // Send command with filename to Frotz
  gameProcess.stdin.write(command + '\n');
  gameProcess.stdin.write(saveFilename + '\n');

  // After output, check if file exists and send to client
  setTimeout(async () => {
    if (existsSync(saveFilename)) {
      const saveData = readFileSync(saveFilename);
      socket.emit('save-data', {
        filename: saveFilename,
        data: saveData.toString('base64'),
        timestamp: Date.now()
      });
    }
  }, 500);
}
```

#### Restore Handling
```javascript
// Listen for restore-data from client
socket.on('restore-data', async ({ data, originalFilename }) => {
  // Write base64 data to temp file
  const tempFile = `saves/restore_${Date.now()}.sav`;
  writeFileSync(tempFile, Buffer.from(data, 'base64'));

  // Send restore command with filename to Frotz
  gameProcess.stdin.write('restore\n');
  gameProcess.stdin.write(tempFile + '\n');

  // Clean up temp file after restore
  setTimeout(() => unlinkSync(tempFile), 2000);
});
```

### Client Implementation (app.js)

#### localStorage Keys
```javascript
// Save slot format: iftalk_save_<game>_<slot>
// Example: iftalk_save_anchorhead_1

// Metadata format: iftalk_saves_<game>
// Stores: { slots: [{slot: 1, timestamp, description}] }
```

#### Save Handler
```javascript
socket.on('save-data', ({ filename, data, timestamp }) => {
  const gameName = currentGame.replace('.z8', '').toLowerCase();
  const slot = prompt('Save slot (1-10):', '1');

  // Store save data
  localStorage.setItem(`iftalk_save_${gameName}_${slot}`, data);

  // Update metadata
  const meta = JSON.parse(localStorage.getItem(`iftalk_saves_${gameName}`) || '{}');
  meta.slots = meta.slots || [];
  meta.slots[slot] = { timestamp, description: `Slot ${slot}` };
  localStorage.setItem(`iftalk_saves_${gameName}`, JSON.stringify(meta));
});
```

#### Restore Handler
```javascript
function restoreGame(slot) {
  const gameName = currentGame.replace('.z8', '').toLowerCase();
  const saveData = localStorage.getItem(`iftalk_save_${gameName}_${slot}`);

  if (saveData) {
    socket.emit('restore-data', {
      data: saveData,
      originalFilename: `${gameName}_${slot}.sav`
    });
  }
}
```

### UI Components

#### Save Slots Panel
- Show 10 save slots per game
- Display timestamp and optional description
- Quick save to slot 1 via voice: "save game"
- Quick restore via voice: "restore game"

#### Voice Commands
- "save" / "save game" - Quick save to auto-slot
- "restore" / "load game" - Show restore menu or quick restore
- "save slot 3" - Save to specific slot
- "load slot 3" - Restore from specific slot

### File Structure
```
saves/
├── anchorhead_1.sav      (temporary, server-side)
├── anchorhead_2.sav
└── restore_temp.sav      (temporary, cleaned up)
```

Note: Server-side .sav files are temporary. The canonical storage is browser localStorage.

### Export/Import (Future)
- Export all saves as JSON file
- Import saves from another browser
- Share save files with others

---

## Voice Command System

### Navigation Commands (always work)
| Command | Action | Notes |
|---------|--------|-------|
| "restart" | Go to beginning | Restarts narration from chunk 0 |
| "back" | Previous sentence | Smart: <500ms = prev, >500ms = restart current |
| "pause" | Pause narration | Sets isPaused = true |
| "play" | Resume narration | Resumes from current chunk |
| "stop" | Stop narration | Same as pause |
| "skip" | Next sentence | Advances to next chunk |
| "skip all" / "end" | Skip to end | Stops narration completely |
| "mute" | Mute microphone | Recognition continues secretly |
| "unmute" | Unmute microphone | Only command that works while muted |

### Game Commands
| Command | Action |
|---------|--------|
| "next" / "enter" / "more" | Press Enter (empty command) |
| "go [direction]" | Move in direction |
| Custom speech | Translated by AI to IF command |

### Special Behaviors
- **During narration**: Only navigation commands processed
- **While muted**: Only "unmute" processed
- **Echo detection**: Recently spoken TTS text filtered out

---

## Echo Detection System

### Purpose
Prevent microphone from picking up TTS audio output and interpreting it as user commands.

### Implementation
Text fingerprinting compares recognized speech against recently spoken TTS chunks.

```javascript
// State
let recentlySpokenChunks = [];  // {text, timestamp}
const ECHO_CHUNK_RETENTION_MS = 5000;
const ECHO_SIMILARITY_THRESHOLD = 0.5;

// Detection methods
1. Substring match (TTS contains speech or vice versa)
2. Levenshtein distance similarity >= 50%
3. Word overlap >= 50% for longer phrases
```

### Recording Points
- `playWithBrowserTTS()`: Records text BEFORE speechSynthesis.speak()
- Ensures text is in buffer before audio starts playing

---

## Status Line Scene Detection

### How It Works
Frotz status line changes indicate scene/room transitions.

```
Pattern 1: ) Outside the Real Estate Office           day one
Pattern 2:    Outside the Real Estate Office           day one
           ^^^                                 ^^^^^^^^^^^^^
           few spaces                          20+ spaces
```

### Server Detection (server.js)
1. Parse status line from Frotz output
2. Compare to previous status line
3. If changed, emit `clear-screen` event

### Client Handling (app.js)
```javascript
socket.on('clear-screen', () => {
  gameOutputInner.innerHTML = '';
  stopNarration();
  narrationChunks = [];
  currentChunkIndex = 0;
  narrationSessionId++;
});
```
