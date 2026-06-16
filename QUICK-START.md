# Lantern - Quick Start Guide

## 🚀 Get Started in 30 Seconds

### 1. Run the Server

```bash
cd C:\source\Lantern
npm start
```

### 2. Open in Browser

The server will show you the URLs:
```
📱 Access from:
   This computer:  http://localhost:3000
   Your phone:     http://192.168.1.XXX:3000
```

### 3. Play!

1. Click a game (Anchorhead, Photopia, or Dungeon)
2. Type or click 🎤 to speak commands
3. Click "▶️ Start Narration" to hear the voice

## Voice Control

### Voice Input (🎤 Microphone Button)
- Click microphone
- Speak: "I want to look around"
- AI translates to: `LOOK`
- Command sent automatically

### Voice Commands
- **"Skip"** → Stop narration
- **"Go on"** → Press Enter
- **"Print [text]"** → Send literal text

### Voice Output (Narration)
- Click "▶️ Start Narration" when ready
- Browser TTS reads game text aloud
- Click "⏹️ Stop Narration" to pause
- Press Escape to stop anytime

## Keyboard Controls

| Key | Action |
|-----|--------|
| Enter | Send directly (no AI) |
| Ctrl+Enter | AI translate & send |
| Escape | Stop narration |

## Natural Language Examples

| You Say/Type | AI Translates To |
|--------------|------------------|
| "look around" | LOOK |
| "go north" | N |
| "check out the wall" | EXAMINE WALL |
| "grab the key" | TAKE KEY |
| "what am I carrying" | INVENTORY |

## Mobile Setup

**Your Phone Must Be On Same WiFi as Your PC!**

1. Start server on PC
2. Find your PC's IP:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Or server shows it when it starts
3. On phone, open browser
4. Go to: `http://YOUR-PC-IP:3000`
5. Add to home screen for app-like experience!

## What's Free vs Paid

### 100% Free:
- ✅ Web Speech API (voice input)
- ✅ Ollama (AI translation)
- ✅ Server hosting (local)
- ✅ All game files

### Completely Free:
- 🆓 Browser TTS (unlimited, built into your browser)
  - No API costs or monthly fees

## Troubleshooting

### Server won't start
```bash
# Make sure you're in the right directory
cd C:\source\Lantern

# Check if Ollama is running
# In another terminal:
ollama serve
```

### Can't access from phone
1. Check PC and phone on same WiFi
2. Check Windows Firewall (allow port 3000)
3. Try `http://localhost:3000` on PC first

### Voice input not working
1. Use Chrome or Edge (best support)
2. Click "Allow" for microphone permission
3. Make sure microphone is working

### No voice narration
1. Click "Start Narration" button
2. Check browser has TTS voices available
3. Check your volume/speakers

## Tips

1. **Mobile is amazing** - Touch + voice makes this feel like a real voice assistant
2. **Use headphones** - Better for voice input/output
3. **Quiet environment** - Voice recognition works best without background noise
4. **Natural language** - Speak conversationally, AI figures it out

## Next Steps

1. Try all 3 games
2. Test voice control
3. Try on your phone!
4. Customize voice settings in `config.json`

**Have fun!** 🎉
