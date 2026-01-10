# IFTalk - Issue Tracker

**Last Updated:** 2026-01-03

---

## 🔴 Critical Issues

### Save/Restore System
- [ ] **#1** - Save slot numbering broken - Saving with a number creates new save instead of overwriting. Manual numbered saves not working properly. Only 2 save slots available?
- [ ] **#2** - Quick restore button not functional
- [ ] **#3** - Save error in Dreamhold - Investigate specific failure case
- [ ] **#4** - False success messages - "Game saved" shows even when save fails

### Voice Recognition
- [ ] **#5** - Voice stops working after app switch - Need remote debugging logs
- [ ] **#6** - Audio permission handling - App should gracefully handle denied microphone permissions

---

## 🟠 High Priority

### Input & Keyboard (Mobile/PWA)
- [x] **#7** - ~~Viewport height with keyboard~~ - FIXED: Dynamically adjust container maxHeight to visual viewport
- [x] **#8** - ~~Smart keyboard blur behavior~~ - FIXED: Auto-blur keyboard if new content won't fit with keyboard up
- [x] **#9** - ~~Tap-to-examine scrolling~~ - FIXED: Scroll game output to bottom on mobile when tapping words
- [x] **#10** - ~~Word insertion spacing~~ - FIXED: Added trailing space after appended words for easier continuation

### Mapping System
- [ ] **#12** - Scene transitions - "Clear" command should create new map. Currently creates random jumps (e.g., "935 went to jail" created wsw jump with solid line)
- [ ] **#13** - Direction-based node placement - Displacement should follow direction traveled (clockwise ordering?)

### Google Drive Sync
- [ ] **#15** - Disable auto-sync - Remove automatic export, manual sync only
- [ ] **#16** - Add status messages - Show sync progress/completion feedback
- [ ] **#17** - Test ChatGPT hints integration with Google Gemini

### Voice Commands & Speech
- [ ] **#18** - Direction recognition poor - West/east and south especially hard to recognize. Need better parsing
- [ ] **#19** - Lock Screen voice feedback - Clear text or change color when command processed
- [ ] **#20** - Lock Screen mic control - Add mute/unmute to Lock Screen
- [ ] **#21** - Bluetooth audio quality - Poor quality for voice input via Bluetooth

---

## 🟡 Medium Priority

### UI/UX Improvements
- [ ] **#22** - "Scroll to bottom" button - Should indicate when more content exists below
- [x] **#23** - ~~Nav bar toggle broken~~ - FIXED: Added CSS to hide controls when `voice-controls-hidden` class active
- [x] **#24** - ~~Desktop scrollbar positioning~~ - FIXED: Changed grid to `minmax(49%, 1fr)` for 50% card width
- [x] **#26** - ~~Status bar position~~ - FIXED: Added safe-area-inset-top padding for phone notch

### App Commands
- [x] **#27** - ~~Disable "app help" command~~ - FIXED: Emptied HELP array, passes through to game
- [ ] **#28** - Interim command recognition - Accept partial/interim words for common commands and narration controls
- [ ] **#29** - Play command failure - "Play" app command did nothing after reading
- [x] **#30** - ~~Command cancel instructions~~ - FIXED: Added "Say 'pause' or 'skip'" to blocked message
- [x] **#31** - ~~Remove "unmute" speak option~~ - FIXED: Emptied UNMUTE array

### Input & Interaction
- [x] **#32** - ~~Send button focus~~ - FIXED: Added focus retention logic for send button
- [ ] **#33** - Scroll gesture conflict - On mobile pull up from bottom after scrolling breaks game area scrolling
- [x] **#34** - ~~Tap activation threshold~~ - FIXED: Increased from 50px to 80px
- [x] **#35** - ~~Clear by tapping blank~~ - FIXED: Removed auto-clear feature

---

## 🟢 Low Priority / Future Enhancements

### Features to Explore
- [ ] **#36** - Quick access menu - Design and implement
- [ ] **#37** - Note-taking system - Add in-game note capability
- [ ] **#38** - Map pages - Multi-page mapping support
- [ ] **#39** - Quick mapping buttons - Optional quick-access mapping interface
- [ ] **#40** - Mapping toast updates - Improve mapping feedback messages

### Investigation Needed
- [ ] **#41** - First boot delay - Investigate cause of delay on initial load
- [ ] **#42** - Parchment "Enter" behavior - Research what empty Enter does in Parchment
- [ ] **#43** - App name change - Consider renaming

---

## 📋 Notes

**Duplicates Consolidated:**
- Google Drive sync issues merged into single section
- Voice direction parsing consolidated
- Keyboard/scroll behavior grouped together

**Old/Vague Entries Removed:**
- "Maybe ok" items deprioritized or flagged as optional
- "Location mapper? Notepad?" expanded into concrete tasks
- Unclear investigation items moved to Low Priority

---

## ✅ Ready for Testing

**Fixed on 2026-01-03** - 13 issues resolved, organized by test category:

---

### 🖥️ Desktop UI Testing

#### **#23** - Navigation bar toggle
- **File**: `docs/styles/settings.css`
- **Fix**: Added CSS rule `body.voice-controls-hidden .controls { display: none !important; }`
- **Test**: Toggle "Show voice controls" setting - nav bar should hide/show correctly

#### **#24** - Desktop card grid width
- **File**: `docs/styles/welcome.css`
- **Fix**: Changed `grid-template-columns: repeat(auto-fit, minmax(49%, 1fr))`
- **Test**: View welcome screen on desktop - game cards should be 2 columns max width

---

### 📱 Mobile UI & Layout

#### **#26** - Status bar position (mobile)
- **File**: `docs/styles/mobile.css`
- **Fix**: Added `padding-top: env(safe-area-inset-top)` to #statusBar
- **Test**: Open on iPhone/PWA mode - status bar should not hide behind notch

#### **#7** - Viewport height with keyboard (mobile)
- **File**: `docs/js/input/keyboard/keyboard-core.js`
- **Fix**: Dynamically adjust `gameOutput` maxHeight to match visual viewport height
- **Test**: Open keyboard on mobile - content should not go off-screen at top, container adjusts to visible area

---

### ⌨️ Mobile Keyboard Behavior

#### **#8** - Smart keyboard blur behavior
- **File**: `docs/js/utils/scroll.js`
- **Fix**: Auto-blur keyboard before scrolling if new content height exceeds available viewport space
- **Test**: Send command that produces tall output with keyboard up - keyboard should close automatically, then scroll

#### **#32** - Send button focus retention
- **File**: `docs/js/input/keyboard/keyboard-core.js`
- **Fix**: Added keyboard state capture and focus restoration after send
- **Test**: Focus input, click send button - focus should remain on input (desktop/mobile with keyboard up)

---

### 👆 Tap-to-Examine (Mobile)

#### **#9** - Tap-to-examine scrolling (mobile)
- **File**: `docs/js/input/keyboard/keyboard-core.js`
- **Fix**: Scroll game output to bottom when tapping words on mobile (in addition to scrolling input)
- **Test**: Tap word on mobile - game output should scroll to show input at bottom

#### **#10** - Word insertion spacing
- **File**: `docs/js/input/keyboard/keyboard-core.js`
- **Fix**: Added trailing space after appended words for easier continuation
- **Test**: Tap multiple words - each word should have trailing space, ready for next word

#### **#34** - Tap activation threshold
- **File**: `docs/js/input/keyboard/keyboard-core.js`
- **Fix**: Increased drag threshold from 50px to 80px before canceling tap
- **Test**: Tap word while scrolling - should be more forgiving of slight finger movement

#### **#35** - Clear by tapping blank
- **File**: `docs/js/input/keyboard/keyboard-core.js`
- **Fix**: Removed auto-clear when tapping whitespace
- **Test**: Tap blank area in game text - input should NOT clear (only focus on desktop)

---

### 🎮 App Commands

#### **#27** - Disable "help" app command
- **File**: `docs/js/core/app-commands.js`
- **Fix**: Emptied `HELP` array so "help" and "commands" pass through to game
- **Test**: Type "help" - should use game's help instead of app help

#### **#31** - Remove "unmute" voice command
- **File**: `docs/js/core/app-commands.js`
- **Fix**: Emptied `UNMUTE` array (use lock screen instead)
- **Test**: Saying "unmute" should no longer work as app command

---

### 🎤 Voice & Narration

#### **#30** - Blocked command instructions
- **File**: `docs/js/ui/game-output.js`
- **Fix**: Updated blocked message to include "Say 'pause' or 'skip' to control playback"
- **Test**: Try game command during narration - message should show cancel instructions
