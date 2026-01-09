# AI Hints System - Reference Documentation

**Status:** Removed in v1.4.85 (January 2026)

This document preserves learnings and design decisions from the AI hints feature that was built and then removed.

---

## Overview

The AI hints system was designed to help players get unstuck by:
1. Gathering game context (status, location, inventory)
2. Loading relevant walkthrough sections
3. Building a structured prompt for ChatGPT
4. Opening ChatGPT with the prompt pre-filled

The feature was removed because maintaining walkthrough-to-game room mappings proved unsustainable.

---

## Architecture

### Files Involved

- `docs/js/features/hints.js` - ChatGPT hints (with walkthrough context)
- `docs/js/features/gemini-hints.js` - Gemini API hints (direct AI integration)
- `docs/games/walkthroughs/` - Walkthrough files (.md, .html)

### Key Components

1. **Context Gathering**
   - Sends `look` and `i` commands to capture game state
   - Polls for game output with 5-second timeout
   - Reads status bar from `.WindowRock_0` element

2. **Walkthrough Integration**
   - Maps game files to walkthrough paths
   - Extracts relevant section based on current room
   - Falls back to null if room not found

3. **Prompt Building**
   - System instructions emphasizing "guide thinking, not commands"
   - Walkthrough context (if available)
   - Current situation (status, location, inventory)
   - 3-tier hint structure: Orientation → Strategy → Direction

---

## Key Learnings

### 1. Room Name Matching is Fragile

**Problem:**
- Game rooms: "Table Room", "Fountain Room"
- Walkthrough sections: "## VENDING MACHINE AREA", "## FOUNTAIN ROOM"
- Mismatches require manual mapping

**Solution Attempted:**
```javascript
const LOST_PIG_ROOM_MAPPINGS = {
  'Table Room': 'VENDING MACHINE AREA',
  // Manual mappings for each game
};
```

**Why This Failed:**
- Every game has different naming conventions
- Walkthroughs use descriptive names vs actual game names
- Unsustainable to maintain mappings for dozens of games
- Walkthroughs often don't cover every room

### 2. Walkthrough Context Inclusion Strategy

**Evolution:**

**v1 (Too generous):**
```javascript
if (!match) {
  return walkthrough.substring(0, 3000); // First 3000 chars
}
```
- Problem: Included irrelevant rooms (OUTSIDE, FOUNTAIN, STATUE, SHELF)
- Wasted tokens on irrelevant context

**v2 (Too restrictive):**
```javascript
if (!match) {
  return null; // No walkthrough context
}
```
- Problem: Room not found = no help at all
- Better for token usage, but less helpful

**Ideal (Never implemented):**
- Semantic search over walkthrough chunks
- Find relevant sections by content, not room name
- Would require embedding/vector search

### 3. Prompt Engineering Insights

**What Worked:**
- "Guide thinking, NOT commands" - prevented spoilers
- 3-tier progressive hints (Orientation → Strategy → Direction)
- Explicit rules: "Don't invent obstacles not clearly present"

**What Didn't Work:**
- Including full walkthrough sections verbatim
- Expecting AI to ignore irrelevant context
- Generic "help me" prompts without structure

**Best Prompt Structure:**
```
SYSTEM INSTRUCTIONS (rules for hint style)
WALKTHROUGH REFERENCE (if relevant section found)
CURRENT SITUATION (status, location, inventory)
SPECIFIC REQUEST (what kind of hint needed)
```

### 4. Context Extraction Challenges

**Room Name Parsing:**
Multiple strategies needed because games format differently:

```javascript
// Strategy 1: First line if short
if (lines[0].trim().length < 50) {
  roomName = lines[0].trim();
}

// Strategy 2: Pattern matching "RoomNameYou/The/A"
const match = location.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?:You|The|A |An |It |This )/);

// Strategy 3: Take capitalized words
const titleWords = [];
for (const word of words) {
  if (word.match(/^[A-Z]/)) {
    titleWords.push(word);
  } else {
    break;
  }
}
```

Lost Pig example:
- Game output: `"Table RoomThis room look like it maybe for eating..."`
- Parsed as: `"Table Room"`
- But walkthrough has: `"## VENDING MACHINE AREA"`

### 5. Token Usage Optimization

**Before optimization:**
- Full walkthrough: ~10,000 characters
- 3000 char fallback: ~1000 tokens wasted

**After optimization:**
- Relevant section only: ~1500 characters (~500 tokens)
- No match = null: 0 tokens

**Best practice:**
- Extract 300 chars before + 1200 chars after room header
- Captures context without bloat

---

## Integration Points (For Removal)

### Frontend UI Elements

1. **Settings Panel** (`docs/index.html`)
   - `#getHintBtn` - ChatGPT hint button
   - `#getGeminiHintBtn` - Gemini hint button
   - `#saveGeminiApiKeyBtn` - Save API key
   - `#clearGeminiApiKeyBtn` - Clear API key
   - Gemini API key input field

2. **Mobile Menu** (`docs/index.html`)
   - `#mobileHintIcon` - Mobile ChatGPT hint action

3. **Settings Panel Items** (`docs/js/ui/settings/settings-panel.js`)
   - Hint section initialization
   - Event listeners for hint buttons

### JavaScript Modules

1. **`docs/js/features/hints.js`**
   - `getHint()` - Main hint function
   - Context gathering
   - Walkthrough loading
   - Prompt building

2. **`docs/js/features/gemini-hints.js`**
   - Gemini API integration
   - API key management
   - Direct AI query (no walkthrough)

3. **Imports in other files:**
   - `docs/js/app.js` - May import hint functions
   - `docs/js/ui/settings/settings-panel.js` - Hint button handlers

### Data Files

- `docs/games/walkthroughs/` - Walkthrough markdown/HTML files
- LocalStorage: `iftalk_geminiApiKey` - Stored API key

---

## Why It Was Removed

1. **Unsustainable Maintenance**
   - Every game needs custom room mappings
   - Walkthroughs have inconsistent naming
   - No automated way to validate mappings

2. **Limited Value**
   - Users can just paste context into ChatGPT themselves
   - Room matching unreliable = feature unreliable
   - Gemini API requires key management (friction)

3. **Better Alternatives**
   - Players can use ChatGPT/Claude directly
   - Walkthroughs are available online
   - Built-in game hints (HINT command) often better

4. **Code Complexity**
   - Two separate implementations (ChatGPT, Gemini)
   - Async context gathering with polling
   - Walkthrough parsing and section extraction
   - Room name heuristics

---

## What We'd Do Differently

If rebuilding this feature:

1. **Semantic Search Over Walkthroughs**
   - Embed walkthrough chunks with text-embedding-3-small
   - Vector search based on current situation
   - No room name matching needed

2. **LLM-Powered Extraction**
   - Use AI to identify current puzzle/situation
   - Query: "What puzzle is the player facing?" + context
   - Then search walkthrough for that puzzle type

3. **User-Provided Context**
   - Let user describe what they're stuck on
   - Don't assume current room = stuck point
   - Many players get hints for future planning

4. **Built-in AI Chat**
   - Embedded chat interface in app
   - Maintains conversation history
   - Can reference earlier hints
   - Better UX than opening ChatGPT in new tab

5. **Community Hints**
   - Let players submit hints for specific situations
   - Crowdsourced, not AI-generated
   - More reliable, less token cost

---

## Preserved Code Snippets

### Room Mapping Approach
```javascript
const LOST_PIG_ROOM_MAPPINGS = {
  'Table Room': 'VENDING MACHINE AREA',
};

let searchName = roomName;
if (LOST_PIG_ROOM_MAPPINGS[roomName]) {
  searchName = LOST_PIG_ROOM_MAPPINGS[roomName];
}
```

### Walkthrough Section Extraction
```javascript
function extractRelevantSection(walkthrough, location) {
  // Extract room name from location
  const roomPattern = new RegExp(`^.*${roomName}.*$`, 'im');
  const match = walkthrough.match(roomPattern);

  if (!match) return null;

  const startIndex = walkthrough.indexOf(match[0]);
  const beforeContext = 300;
  const afterContext = 1200;
  const start = Math.max(0, startIndex - beforeContext);
  const end = Math.min(walkthrough.length, startIndex + afterContext);

  return walkthrough.substring(start, end);
}
```

### Prompt Structure
```javascript
let prompt = `You are a hint system for "${gameName}".

RULES FOR HINTS:
- Guide thinking, NOT commands
- Don't fixate on objects unless clearly required
- Do NOT invent obstacles not clearly present
- Provide 3 progressive hints: Orientation → Strategy → Direction

WALKTHROUGH REFERENCE:
${walkthroughContext}

PLAYER'S CURRENT SITUATION:
**Status:** ${status}
**Location:** ${location}
**Inventory:** ${inventory}

Provide 3 progressive hints.`;
```

---

## Conclusion

The AI hints system was a valuable learning experience in:
- LLM prompt engineering for IF contexts
- Game state extraction and context gathering
- Walkthrough integration challenges
- Token optimization strategies

However, the maintenance burden of room mapping and unreliable matching made it unsustainable. Players are better served by using AI chat tools directly with manual context provision.

**Removal Date:** January 2026 (v1.4.85)
**Reason:** Unsustainable maintenance, limited reliability, better alternatives exist
