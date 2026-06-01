---
title: Quetzal Restore — Game Globals vs Z-Machine Header
tags: [zvm, save-restore, quetzal, screen-width, anchorhead]
created: 2026-05-09
updated: 2026-05-31
aliases: [screen_width, restore globals, quetzal decode, perpetuation cycle]
---

# Quetzal Restore — Game Globals vs Z-Machine Header

## The Core Constraint

`restore_file()` restores ALL of Z-machine dynamic RAM from the Quetzal save — including any game-specific globals that cache interpreter state (like screen_width). After restoring, `update_header()` → `update_screen_size()` correctly fixes `io.width` and the Z-machine **header bytes** (0x20–0x24). But it does NOT fix game globals.

Result: `io.width` is always correct after restore. Game globals that cached a stale value are not.

## The Perpetuation Cycle

Once a bad cached value exists in a save:
1. Restore → bad game global loaded (e.g. screen_width = 15)
2. `update_screen_size()` fixes `io.width` + header → 80
3. Game runs using its global (15), not `io.width` → wrong behavior
4. Autosave captures the bad global (15)
5. Next session: restore → same bad global → repeat

Breaking the cycle requires patching the bad global **before** the game runs.

## Concrete Case: Anchorhead Status Bar (v1.5.265)

Anchorhead caches screen_width in a Z-machine global at startup by reading the header. If a save was made when that global was wrong (e.g. 15 from a pre-MIN_COLUMNS session), every subsequent restore/autosave cycle perpetuates it. The game then writes the right-side status content at col=(15−7)=8, immediately after the room name — glkapi encodes them as one run, and the status bar displays concatenated.

## The Fix Pattern

Decode the saved screen_width from the raw Quetzal bytes **before** calling `restore_file()`. Compare to `io.width` post-restore. If they differ, scan all 240 Z-machine globals and patch any that match the stale value.

```javascript
// Decode header 0x22 (uint16, big-endian) from Quetzal CMem before restore:
function decodeQuetzalScreenWidth(bytes, origram) {
    // ... parse IFF → find CMem/UMem chunk → decode XOR-diff stream up to 0x23
    // CMem: non-zero byte XORed with origram[j]; zero byte = skip next+1 positions
}

const savedWidth = decodeQuetzalScreenWidth(bytes, window.zvmInstance.origram);
const result = window.zvmInstance.restore_file(bytes.buffer);
const correctWidth = window.zvmInstance.io.width; // set by update_screen_size inside restore_file

if (savedWidth != null && savedWidth !== correctWidth) {
    const base = window.zvmInstance.globals;
    for (let i = 0; i < 240; i++) {
        const addr = base + i * 2;
        if (window.zvmInstance.m.getUint16(addr) === savedWidth) {
            window.zvmInstance.m.setUint16(addr, correctWidth);
        }
    }
    // Also: skip restoring the saved status bar HTML — it was rendered with the wrong width too
}
```

Full implementation: `docs/js/game/save-manager.js` → `decodeQuetzalScreenWidth()` + patch block in `performRestore()`.

## Quetzal CMem Decoding (Reference)

CMem is an XOR-diff stream against origram with run-length zero compression:
- **Non-zero byte**: XOR with `origram[j]`, advance `j`
- **Zero byte + count byte**: skip `count + 1` positions (keep origram values), advance `j` by `count + 1`
- Bytes past the end of the stream retain origram values

Z-machine header is big-endian. `DataView.getUint16(offset)` (no endian flag) reads big-endian.

## Why the Saved Status Bar HTML Must Also Be Skipped

The HTML stored in `displayHTML.statusBar` was rendered at save time with the wrong globals. If globals were patched, that HTML is also stale — skip restoring it and let the game redraw on first command.

## glkapi Status Bar Split Mechanism (Why Wrong Width Breaks It)

glkapi groups grid cells into runs by matching attributes. The split between room name and right-side content relies on `reverses` differing:
- Cells written by game (without `garglk_set_reversevideo`): `reverses = win.reverse = undefined`
- Cells from grid expansion (new columns): `reverses = 0`
- `undefined !== 0` → separate runs → status bar splits correctly

With correct width (80): room name at 0–10, gap of expanded cells at 11–72, right side at 73–79 → 3 runs → clean split.
With wrong width (15): room name at 0–7, right side overwrites at 8–14 (both `undefined`) → 1 run → concatenated.

## Unrelated Concatenation: chunk-delimiter Span (v1.5.444)

There is a second, independent way to get `"Master Bedroom, day one, evening"` from the status bar that has nothing to do with screen_width.

`renderStatusBar` (voxglk-renderer.js) wraps the left/right parts in a `<span class="chunk-delimiter">, </span>` for TTS pacing. That span is hidden by CSS but IS included in `element.textContent`. So reading `statusBarEl.textContent` always concatenates left `, ` right regardless of screen_width.

**Affected callers:** `initAutoMapper` and `map-canvas.js` both read `statusBarEl.textContent` directly at init/open time (not from the voxglk `statusBarText` pipeline). Fix: read `statusBarEl.querySelector('.status-left')?.textContent` and fall back to the full element only if `.status-left` is absent.

`getCurrentLocation` (auto-mapper.js) also has a `/,\s+[a-z].*$/` backstop that strips the suffix as a last resort, covering both this case and any wrong-width concatenation that reaches it via `extractPlainText`.
