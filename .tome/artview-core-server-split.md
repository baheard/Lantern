# artview: core.cjs logic layer vs review-server.cjs transport

`tools/review-server.cjs` grew to ~1200 lines mixing HTTP routing with all the data/compose/
generation logic. Split (2026-06-29) into two files:

- **`tools/artview/lib/core.cjs`** — ALL logic: data access (gamePaths, locationsFor, gameStyle),
  prompt composition (composeForRoom, composedFor, ARTIST_LEAD), image generation
  (regen, auditionGen, sandboxGen, blockoutGen + the JOBS registry / scheduleGen concurrency
  limiter), notes, titles, blockouts, audition, sandbox, glyphs, artists. Owns the path
  constants (REPO/IMAGES_ROOT/…), computing `REPO = resolve(__dirname,'..','..','..')` since it
  sits at `tools/artview/lib/`.
- **`tools/review-server.cjs`** — transport only (~216 lines): arg/port parsing, `BOOT_ID`, the
  `http.createServer` route table, `sendJSON`/`sendImg`/`readBody`, `openBrowser`, and the
  `PAGE` assembly from `tools/artview/{shell.html,client.css,client.js}`.

## Why it's wired by destructure-all, not `core.foo`

The server does `const { ...82 names... } = require('./artview/lib/core.cjs');` — every exported
name pulled into local scope — so the HTTP route handlers call `gamePaths(...)`,
`composeForRoom(...)`, `jobsList()` etc. **unqualified, exactly as before**. The split was a
*verbatim move* of the logic body (lines 51–1050 of the old file) into core; no call site in the
handlers or in the gen functions changed. This is what made it safe: the only new thing is the
require boundary. Dependency direction is strictly one-way: server → core (core never imports the
server). Stateful singletons (`JOBS`, `LOG_RING`, `jobSeq`, the `_genQueue`) live once in core.

## Gotcha: keep the export list complete

If you add a top-level function/const to core, add it to `module.exports` (the splitter emitted
the list from a regex over `^(const|let|var|function) NAME`). A missing export surfaces only at
runtime as a `ReferenceError` when that route is hit — node --check won't catch it. Verify after
any core change by booting and diffing the read endpoints against a known-good run (the
/api/state, /api/game, /api/title, /api/audition, /api/sandbox, /api/glyphs, /api/blockouts
hashes were byte-identical across the split).

## ARTIST_LEAD still triplicated

The `ARTIST_LEAD` constant must stay identical in THREE places: `core.cjs`, `client.js`
(composedPrompt), and `gen-room-images.cjs`. The split didn't change that — core just inherited
the server's copy. See the existing comments at each site.
