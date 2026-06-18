---
title: art-generation-providers
tags: [location-art, images, gemini, openai, gen-room-images, review-server, cost]
created: 2026-06-17
updated: 2026-06-18
aliases: [gpt-image-2, nano banana cost, cheap prototyping, regen provider]
---

# Art generation — dual provider (Gemini finals / OpenAI cheap proto)

`tools/gen-room-images.cjs` supports **two image providers**, chosen at call time.
Added 2026-06-17 so prompts can be iterated cheaply before spending on finals.

## The two paths
- **Gemini (default)** — `gemini-2.5-flash-image` (Nano Banana). Flat **~$0.039/image**
  regardless of resolution (per-image token billing, not per-pixel). This is the
  **finals** provider — best quality, takes arbitrary `aspectRatio` (we use `3:4`).
- **OpenAI (`--provider openai`)** — `gpt-image-2`, `--quality low|medium|high`
  (default `low`). Low ≈ **$0.006/image** (~6× cheaper) for **prototyping prompts**;
  high ≈ **$0.21** for the keeper. Same model across quality tiers, so what you learn
  at `low` transfers to `high`.

- **Nano Banana Pro (`gemini-3-pro-image-preview`)** — premium Gemini finals, ~**$0.13/image**
  (token-billed; we leave resolution at the default ~1K tier since we crop to a small 3:4 — no
  need for its 2K/4K modes). Still the *gemini* provider, just a pricier model id, so it flows
  through `--model gemini-3-pro-image-preview` (provider stays gemini). In the reviewer it's the
  `gemini-pro` `#genMode` option and fires a **`confirm()` cost warning** before generating
  (it's the only tier that does). Candidate tag = `gem-pro`; mchip = "Nano Pro" (purple).

## Why a runtime choice, not a swap
The user wants to iterate on a *bunch* of prompts cheaply, then render the chosen one
nicely — so provider/quality is a **first-class, per-regen choice**, not a config edit:
- CLI: `--provider openai --quality low` on `gen-room-images.cjs`.
- Reviewer (`/artview`): a **`#genMode` dropdown** next to Regenerate
  (Gemini finals / OpenAI low / OpenAI high). Choice persists across re-renders in the
  client global `genMode`; `doRegen()` maps it to `{provider, quality}` → `/api/regen`
  → `regen()` appends the CLI flags. Default stays Gemini.

## Gotchas / caveats
- **No native 3:4 on OpenAI.** Sizes are 1024², 1024×1536 (2:3), 1536×1024 only.
  `openAISizeForAspect()` maps portrait → `1024x1536`; crop downstream. Gemini keeps `3:4`.
- **`--ref` kills the cheap rate.** We usually send **text only** (the three-layer
  Artist+Aesthetic+Scene composition); `--ref` is an *optional* cross-room consistency
  lever, not the default. On OpenAI a reference image goes through `/v1/images/edits`
  and **bills at the high-fidelity input rate regardless of `quality`** — so the ~$0.006
  rate only holds **ref-free**. Keep prototyping ref-free.
- **`--ref` has two FRAMINGS — `--ref-mode style|edit` (added 2026-06-18).** Same `--ref`
  image, opposite intent, so the wrapper prose differs (`refWrappedPrompt()`):
  - `style` (default) — "use ONLY as a style/art-direction reference … **render a NEW
    scene**." Cross-room consistency chaining. Composition is *not* preserved.
  - `edit` — "**modify the supplied image**, preserve its composition/layout/lighting and
    everything not mentioned, apply ONLY these changes." Surgical img2img; here the prompt
    IS the edit instruction (in the reviewer, the selected image's note text), not the
    full composed prompt. Use when an image is ~90% right and you want a targeted fix.
  Don't reach for `style` framing expecting an edit — the default literally tells the model
  to throw away the composition.
- **`gpt-image-1` is deprecating Oct 23 2026** — we target `gpt-image-2` (and could fall
  back to `gpt-image-1-mini` at $0.005 square). Don't wire to `gpt-image-1`.
- OpenAI key is `OPENAI_API_KEY` in `.env` (gitignored); Gemini is `GEMINI_API_KEY`.
  `loadEnvKey(varName)` is now parameterized by provider.
- Tools under `tools/` are dev-only → **no app version bump** for changes here (nothing
  served changes; service-worker cache version is app-facing only).

## Reviewer plumbing (debugging)
- The hidden review server's stdout/stderr are redirected by `artview.ps1` to
  **`tools/.artview-server.log`** (+ `.err.log`), both `*.log`-gitignored. Each regen
  logs a timestamped `REGEN … via <provider> → file` + `OK (Ns)` / `FAIL` line — read
  this when a gen "flashes by" in the UI with no on-screen error.
- **Typical timings (measured):** Gemini ~6s, OpenAI **low ~3–20s** (variable),
  OpenAI **high ~160s** (!). High-quality finals are slow — expect a 2–3 min wait per
  image. If the Regenerate button re-enables in ~1s with no image, the browser is on a
  **stale pre-`-Restart` page** — hard-refresh (Ctrl+Shift+R); `-Restart` kills the old
  server and orphans any window opened against it.
- **Candidate filenames denote the generator:** `<slug>-<tag>-r<N>.png` where tag =
  `gem` / `oai-low` / `oai-med` / `oai-high`; N is the next free index across all of a
  slug's candidates (legacy untagged `<slug>-rN.png` still counted). The reviewer shows
  a colored model chip (`mchip()`) in each candidate's caption.
- Reviewer now edits **Artist signature** (`/api/artist-style` → shared `_artists/artists.json`,
  affects ALL games) and **Game style/aesthetic** (`/api/style` → per-game `style.json`)
  inline via ✎ Edit; Scene was already editable. Saving updates GAMEINFO + re-renders so
  the Composed prompt reflects the change immediately. UI is mobile/portrait responsive
  (`@media max-width:820px`: stacks columns, image-first, full-width dropdown).

## Bulk scene authoring: worksheet → import (2026-06-17)
- Per-room Scene prompts are authored in bulk in `docs/games/images/<game>/scenes.md`
  (a worksheet: `## <slug> — Name` blocks, authoritative `SCENE:` line, `PROSE:`/`EXITS:`
  reference). `node tools/scenes-import.cjs <game>` pushes non-empty SCENEs into
  `style.json` → `scenes[]` (the live source); rooms absent from the worksheet are
  untouched. Worksheet = author in bulk; reviewer = iterate per-room; style.json = runtime.
- **GOTCHA (fixed):** the reviewer Scene `<textarea>` `onblur` used to POST
  unconditionally; an EMPTY box posts `tail=''` which `saveScene` treats as *delete the
  override*. A stale page (loaded before an import) shows an empty box, and clicking out of
  it silently **deletes** the just-imported scene. Fixed by only POSTing when the value
  changed from what loaded. After importing, **hard-refresh** artview (full reload — the
  in-memory `GAMES` cache is what goes stale, not the server, which reads style.json fresh).

## GOTCHA: review-server client JS lives in a template literal — escape backslashes (2026-06-17)
The entire reviewer client `<script>` is embedded in `const PAGE = \`…\`` (a template literal).
Any backslash escape you write in that client code is processed by the TEMPLATE LITERAL first:
a literal `\n` becomes a real newline (splits comments/strings → whole script dies), and regex
classes `\d` `\s` `\.` lose their backslash (`\d` → `d`, a silently-wrong regex). **Write `\\n`,
`\\d`, `\\s`, `\\.` in the source** so the delivered JS gets the single backslash it needs.
`node -c tools/review-server.cjs` does NOT catch this — the template literal is valid server-side;
the break only exists in the *delivered* script. To verify: fetch `/`, extract the `<script>`,
`node -c` THAT. (Cost me a fully-broken reviewer when a breakPrompt `'\n\n$1'` + a comment
containing `\n` both split the client JS.)

## Four-layer prompt hierarchy: App ▸ Artist ▸ Game ▸ Scene (2026-06-18)
The composed prompt is now FOUR layers, sent in that order:
- **App** — global, app-wide instructions, the HIGHEST layer (above artist). Stored in
  `docs/games/images/_app/app.json` `{prompt}`. Single value shared by ALL games — it persists
  even when the artist is swapped game-to-game. API: `appPrompt()` / `saveAppPrompt()` +
  `POST /api/app-prompt`; included in `/api/game` as `app`.
- **Artist** — global signature (per-game *selected* artist), `_artists/artists.json`.
- **Game** — per-game aesthetic, `<game>/style.json` `aesthetic`.
- **Scene** — per-room, `<game>/style.json` `scenes[slug]`.
Parity invariant: BOTH `review-server.cjs` `composedPrompt()` and `gen-room-images.cjs`
`composeRoomPrompt()` prepend `appPromptText()` so batch + reviewer stay bit-identical.
**Reviewer layout shows the layers in REVERSE** (In-game prose → Scene → Game → Artist → App,
closest-to-room first) while the Composed box re-orders to the sent hierarchy. In-game prose
gets a neutral, squared-off **monospace** container (`.val.ingame-prose`) to read like old-school
game text; all four prompt layers are ✎-editable inline (`beginEdit`/`commitEdit` kinds
`artist`/`aesthetic`/`app`; app edit fans out to every loaded GAMEINFO since it's global).

## Generation progress survives navigation/reload — server-side JOBS registry (2026-06-18)
Regen is now **fire-and-forget** client-side. The server keeps an in-flight `JOBS` map
(`regen()` registers a job synchronously *before* responding, marks done/error in the execFile
callback, prunes 15s after finish) exposed via `GET /api/jobs`. The client polls it every 2s
(`pollGens`), renders a persistent bottom-right banner (`#gens`), and on the running→done edge
toasts + reloads the game if it's the one in view — so the new image lands and the UI catches up
even if you switched locations or hard-reloaded mid-generation. The Regenerate button's
disabled/"Generating…" state is also driven by the poll, not local state. **Why this matters:**
OpenAI-high takes ~140s; previously navigating away lost all UI feedback (the file still wrote,
but silently). The child process is independent of the HTTP connection, so the image always
completed server-side — only the *visibility* was missing, which the JOBS poll now restores.

See also [[location-art-system]] (runtime display side), [[openai-tts-pipeline]]
(the other OpenAI hook in this repo).
