---
title: Snapshot Pollution & inert+aria-hidden
tags: [accessibility, testing, ui-pattern]
created: 2026-04-26
updated: 2026-04-26
aliases: [a11y, settings panel, ariaSnapshot]
---

# Snapshot Pollution & `inert` + `aria-hidden`

## The problem (v1.5.220)
The settings panel hides via CSS (`right: -550px` slide-out, not `display: none`). That keeps it in the DOM and in the accessibility tree. Result: Playwright's `ariaSnapshot()` listed every closed-panel control alongside the live UI — ~47 elements in the snapshot, most of them un-clickable ("element is outside of the viewport").

## The fix
On every off-canvas / hidden panel, set both:

```html
<div class="settings-panel" inert aria-hidden="true">
```

Then in JS, strip both attributes when opening and restore them when closing. See `docs/js/ui/settings/settings-panel.js`.

**Why both?** Spec-wise, `inert` should imply removal from the a11y tree. In practice, Playwright's `ariaSnapshot` and some screen readers don't honor `inert` alone — they still emit the subtree. `aria-hidden="true"` closes that gap. Keep both until tooling catches up.

## Apply this pattern when…
You add any new panel/modal/drawer that hides via CSS rather than `display: none`. The cost is two attributes and four lines of JS; the benefit is clean snapshots and proper screen-reader behavior.

## Bonus: focus restoration
Same module also saves `document.activeElement` on open and restores focus there on close, so keyboard users return to the trigger button instead of falling through to `<body>`. See `openSettings()` / `closeSettings()` in `docs/js/ui/settings/settings-panel.js`.

## Related
- See `code-review.md` Pass 1 for the security work that built on this.
- For testing-tool quirks, see web-agent lore `cdp-testing-gotchas`.
