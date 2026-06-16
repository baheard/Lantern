# Lantern 🎮🎤

**Voice-powered interactive fiction player with AI natural language commands**

Play classic text adventure games using your voice and natural language! Lantern combines:
- 🎤 **Voice input** - Speak your commands naturally
- 🔊 **Voice output** - Browser TTS narration
- 🤖 **AI translation** - Natural language → game commands
- 📱 **Mobile-friendly** - Play from your phone or tablet
- 🌐 **Web-based** - No installation needed, works everywhere

## Quick Start

### 1. Install Dependencies

```bash
cd C:\source\Lantern
npm install
```

### 2. Configure (Optional)

Copy the example config and set up environment variables if needed:

```bash
# Copy example config (first time only)
cp config.example.json config.json

# Copy environment variables template (optional)
cp .env.example .env
```

**For AI providers** (optional - Ollama works locally without API key):
- OpenAI: Set `OPENAI_API_KEY` environment variable
- Anthropic: Set `ANTHROPIC_API_KEY` environment variable

### 3. Run the Server

```bash
npm start
```

### 4. Open in Browser

**On your computer:**
```
http://localhost:3000
```

**On your phone** (same WiFi):
```
http://YOUR-PC-IP:3000
```

The server will show you the exact URL when it starts!

## Features

### 🎤 Voice Input
- Click microphone button
- Speak naturally: "I want to look around"
- AI translates to game command (optional)
- **Works perfectly in Chrome/Edge/Safari**

### 🔊 Voice Output
- Browser TTS (free)
- Manual control - start/stop when you want
- Fast response time

### ⌨️ Keyboard Input (Also Works Great!)
- **Enter** → Send directly ("N", "LOOK", etc.)
- **Ctrl+Enter** → AI translate natural language
- Type or speak - your choice!

### 🎮 Voice Commands
Special keywords for app control:
- **"Skip"** → Stop current narration
- **"Go on"** → Press Enter (empty command)
- **"Print [text]"** → Send literal text (bypass AI)

## Games Included

- **Anchorhead** - Lovecraftian horror
- **Photopia** - Award-winning emotional story
- **Dungeon** - Original Zork adventure

## Configuration

### Method 1: Environment Variables (Recommended)

Set API keys via environment variables:

```bash
# In .env file or system environment
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

### Method 2: Config File

Edit `config.json` to customize:

```json
{
  "provider": "ollama",  // AI for translation (ollama/openai/claude)
  "port": 3000,           // Server port

  "voice": {
    "enabled": true,
    "tts": {
      "method": "browser",
      "browser": {
        "voice": "Microsoft David Desktop",
        "rate": 1.1,
        "pitch": 1.0
      }
    }
  }
}
```

**Note:** Environment variables take precedence over config.json values.

## Mobile Access

### Same WiFi (Easy!)

1. Start server on your PC: `npm start`
2. Note the IP address shown (e.g., `http://192.168.1.100:3000`)
3. On your phone, open that URL in Chrome/Safari
4. Play with voice and touch controls!

### From Anywhere (Optional)

**Using Cloudflare Tunnel** (Free):
```bash
# Install cloudflared
# Then run:
cloudflared tunnel --url http://localhost:3000
```

You'll get a public URL like `https://abc-123.trycloudflare.com`

**Using Tailscale** (Free, Most Secure):
1. Install Tailscale on PC and phone
2. Access via Tailscale IP (only you can access)

## Architecture

**🎮 Fully Browser-Based - No Server-Side Game Logic**

```
┌─────────────────────────────────────────┐
│          Browser (Client)               │
│  ┌───────────────────────────────────┐  │
│  │   ifvms.js (Z-machine VM)         │  │ ← Games run HERE
│  │   ↓                                │  │
│  │   GlkOte (Display Layer)          │  │
│  │   ↓                                │  │
│  │   Your Web UI (Voice + TTS)       │  │
│  └───────────────────────────────────┘  │
│           ↓ (Optional AI translation)   │
└───────────┼─────────────────────────────┘
            │
            ↓ WebSocket (only for AI)
    ┌───────────────────┐
    │  Node.js Server   │ ← Static files + optional AI
    │  (Express)        │
    └───────────────────┘
```

**Key Components:**
- **ifvms.js (ZVM)**: Z-machine interpreter runs in browser - no server needed
- **GlkOte**: Display and windowing library for interactive fiction
- **glkapi.js**: Bridge between VM and display layer
- **Express Server**: Static file serving ONLY (no game logic)
- **AI Services** (Optional): Ollama/OpenAI/Claude for natural language translation
- **Voice**: Web Speech API (recognition) + Browser TTS (narration)

**Why Browser-Based?**
- ✅ Free static hosting (GitHub Pages, Netlify, Vercel)
- ✅ Instant response (no network latency for game commands)
- ✅ Unlimited concurrent users (no server bottleneck)
- ✅ Simple deployment (just HTML/JS/CSS files)
- ✅ No backend dependencies (Frotz/WSL/process management eliminated)

## Free Voice Recognition Options

The web app uses **Web Speech API** (built into browsers):
- ✅ **100% free**
- ✅ Works in Chrome, Edge, Safari
- ✅ Good quality
- ✅ No setup needed

## Requirements

- **Node.js** 18+ (for server)
- **Ollama** (for free AI) or API key for OpenAI/Claude
- **Modern browser** with microphone support

## Adding More Games

1. Download any Z-machine (.z3, .z5, .z8) or Glulx (.ulx) game
2. Place in Lantern directory
3. Add to `public/index.html` game list
4. Or select via file picker (optional feature)

Find games at:
- https://ifdb.org/
- https://ifcomp.org/
- https://ifarchive.org/

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Send directly (bypass AI) |
| Ctrl+Enter | AI translate & send |
| Escape | Stop narration |

## Troubleshooting

### "Cannot connect to server"
Make sure server is running: `npm start`

### "Voice input not working"
1. Use Chrome, Edge, or Safari
2. Allow microphone permission
3. Check microphone is connected

### "No voice narration"
1. Click "Start Narration" button
2. Check browser has TTS voices available
3. Check browser console for errors

### "Games not loading"
1. Games load from IF Archive (internet required for first load)
2. Check browser console (F12) for errors
3. Ensure modern browser (Chrome, Edge, Safari, Firefox)
4. See server console for AI translation errors

## Development

### Run in Dev Mode

```bash
npm run dev
```

### View Server Logs

All logs appear in the terminal where you ran `npm start`

### Customize UI

Edit files in `public/`:
- `index.html` - Structure
- `styles.css` - Styling
- `app.js` - Functionality

## What Makes This Special

1. **Real IF engines** - Not AI simulation, actual game logic
2. **Voice control** - Natural language interface
3. **Mobile-friendly** - Play anywhere
4. **Completely free** - No API costs for TTS (browser-based)
5. **Local-first** - Everything runs on your PC
6. **Shareable** - Anyone on your network can play

## Future Enhancements

- [ ] Game save states
- [ ] Multiple simultaneous players
- [ ] Game library browser
- [ ] Voice visualization
- [ ] Custom voice selection UI
- [ ] Hints system
- [ ] Transcript export

## Credits

Built with:
- **ifvms.js (ZVM)** - Browser-based Z-machine interpreter
- **GlkOte** - Display and input handling library
- **glkapi.js** - Glk API implementation
- **Express** - Static file web server
- **Socket.IO** - Real-time AI translation communication
- **Web Speech API** - Voice recognition (built into browsers)
- **Browser TTS** - Text-to-speech (built into browsers)
- **Ollama/OpenAI/Claude** - AI command translation (optional)

## Current Status

**✅ Browser-Based Architecture Complete**

- ✅ Games run entirely in browser (ifvms.js + GlkOte)
- ✅ Voice recognition and TTS narration working
- ✅ AI command translation (optional - Ollama/OpenAI/Claude)
- ✅ Navigation controls (back, forward, pause, play, skip)
- ✅ Text highlighting system for narration sync
- 🔄 **In Progress**: Architecture improvements (see TODO.md)

See [TODO.md](TODO.md) for detailed technical status and current tasks.

---

**Enjoy playing interactive fiction with your voice!** 🎮🎤🔊
