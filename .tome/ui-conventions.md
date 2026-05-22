---
title: UI Conventions
tags: [ui, design, material-design, labels, accessibility, mobile]
created: 2026-05-13
updated: 2026-05-13
aliases: [design conventions, button labels, casing, touch targets, 44px]
---

# UI Conventions

## Label casing — sentence case throughout

Follow Material Design: **sentence case only**, not title case.

- First word capitalized, everything else lowercase — unless it's a proper noun.
- Proper nouns stay capitalized: "Drive", "Google", game titles.

**Examples:**
- ✓ "Import save file" — not "Import Save File"
- ✓ "Delete save" — not "Delete Save"
- ✓ "Upload to Drive" — "Drive" is a proper noun, stays capitalized
- ✓ "Sync Drive" — same
- ✓ "Export to file"
- ✗ "New Named Save" — should be "New named save" or "Save game"

Applies to: button labels, dropdown menu items, dialog titles, status messages.

## Touch targets — minimum 44px

All interactive elements must be at least 44×44px. This is the Apple HIG / Material Design minimum for comfortable mobile tapping.

- Buttons: `height: 44px` or `min-height: 44px`
- Dropdown menu items: `min-height: 44px` (use padding, not fixed height, so text wraps gracefully)
- Icon-only buttons: 44×44px hit area even if the icon is smaller
- Backup row load buttons: 44px height
- Row ⋮ buttons: 44×44px

**Why:** fingers are ~44px wide. Smaller targets cause mis-taps. Verified on the Manage Saves modal — dropdown items were 36px and got bumped to 44px.
