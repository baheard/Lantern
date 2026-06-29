---
title: artview client lives in tools/artview/ (extracted from the PAGE template)
tags: [artview, review-server, refactor, build, gotcha]
created: 2026-06-28
updated: 2026-06-28
aliases: [PAGE template, shell.html, client.js, client.css, $-replacement gotcha]
---

# artview client extraction

`tools/review-server.cjs` used to be ~2810 lines because the entire browser client (HTML +
~28KB CSS + ~90KB JS) was an inline `const PAGE = \`…\`` template literal. The client now lives
as plain files and the server is ~1193 lines:

- `tools/artview/client.css`, `tools/artview/client.js` — the resolved bodies (what the browser
  receives), single backslashes, no escaping.
- `tools/artview/shell.html` — the surrounding HTML with two sentinel tokens
  `__CLIENT_CSS__` / `__CLIENT_JS__`.
- Server rebuilds `PAGE` at boot: `shell.replace('__CLIENT_CSS__', () => CSS).replace('__CLIENT_JS__', () => JS)`.

## Two gotchas that make or break this

1. **Function replacement, not string replacement.** The client JS is full of `$('#x')` and
   regex. `String.prototype.replace(token, replacementString)` interprets `$&`, `$1`, `` $` ``,
   `$'` in the *replacement* text — which would silently corrupt the injected code. Passing a
   **function** (`() => CSS`) inserts the value literally. This is mandatory, not stylistic.

2. **Resolving template escapes for byte-identical output.** The old `PAGE` body had
   `\\d`, `\\n`, `\\'` because it lived inside a template literal. The served text had *single*
   backslashes. To extract byte-identically, the one-shot script `eval`-ed the extracted source
   wrapped in backticks (safe: verified PAGE had **no `${}` and no nested backticks**), then sliced
   CSS/JS from the resolved string. A round-trip assert (`shell.replace(…) === resolved`) guarded it.

The extraction script is `scratchpad/extract-client.cjs` (one-shot; not needed again unless
re-deriving). Editing the client now = edit `client.js`/`client.css` directly; restart the server
(it reads the files at boot — no build step). Verified: server + client `node --check` pass, page
serves, rail + Title Images interactive with zero console errors.

Next refactor seam (not done): peel the server-side generation layer (`regen`/`blockoutGen`/
`auditionGen`/`sandboxGen` + job queue) and the data layer into `require()`d modules.
