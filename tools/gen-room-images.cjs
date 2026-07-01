#!/usr/bin/env node
/*
 * Lantern location-art generator — Nano Banana (Gemini 2.5 Flash Image) hook.
 *
 * Generates location images from prompts and writes them to a per-game staging
 * folder (docs/games/images/<game>/_review/) for review BEFORE they're promoted
 * into the game. This is the "generate without leaving the editor" half of the
 * generate-location-art workflow; the prompts themselves come from
 * tools/gen-room-facts.cjs (which mines the verified walkthrough).
 *
 * AUTH
 * ----
 * Needs a Google Gemini API key (Nano Banana == Gemini 2.5 Flash Image).
 * Get one free at https://aistudio.google.com/apikey, then put it in the repo's
 * .env (already gitignored) as:
 *     GEMINI_API_KEY=AIza...
 * or pass --key, or set the GEMINI_API_KEY env var.
 *
 * COST: Gemini is flat ~$0.039 per image regardless of resolution (per-image token
 * billing, NOT per-pixel) — "low res" is an aesthetic in the prompt, not a cost lever.
 *
 * CHEAP PROTOTYPING (--provider openai): gpt-image-2 at --quality low is ~$0.006/image,
 * ~6x cheaper, for iterating on prompts before committing. Same model at --quality high
 * (~$0.21) for finals. Needs OPENAI_API_KEY in .env. Caveats: no native 3:4 (portrait
 * maps to 2:3 1024x1536, crop downstream); a --ref image bills at the high-fidelity
 * input rate regardless of quality, so the cheap rate only holds ref-free.
 *
 * USAGE
 * -----
 *   # one ad-hoc image (smoke test the hook):
 *   node tools/gen-room-images.cjs --prompt "a gothic alley, old-school pixel art, 3:4 portrait" \
 *        --out docs/games/images/anchorhead/_review/_test.png
 *
 *   # batch from a prompt pack (produced by gen-room-facts.cjs):
 *   node tools/gen-room-images.cjs anchorhead
 *   node tools/gen-room-images.cjs anchorhead --only outside-the-real-estate-office
 *   node tools/gen-room-images.cjs anchorhead --ref <approved.png>   # style-reference chaining
 *
 * FLAGS
 *   --prompt <text> --out <file>  ad-hoc single-image mode
 *   --sbx <game>                  ad-hoc render straight into <game>/_sandbox as the next sbx-rN
 *                                 (+ .txt/.json sidecar, exact prompt inlined) so it shows in
 *                                 artview's Sandbox panel. Supply the prompt either as raw
 *                                 --prompt <text>, OR as layer flags --artist/--scene/--aesthetic/
 *                                 --app which are composed in the labeled ARTIST:/SCENE:/GAME:/APP:
 *                                 format (ARTIST_LEAD auto-appended) and stored as editable fields.
 *                                 Optional meta: --loc <slug> --loc-name <name> --artist-name <name>
 *   --pack <file>                 prompt-pack JSON (default: docs/games/images/<game>/room-facts.json)
 *   --only <slug>                 generate just one room from the pack
 *   --sandbox                     PROTOTYPE target: route batch renders into <game>/_sandbox as
 *                                 sbx-rN (artview Sandbox panel) instead of _review/<slug>.png.
 *                                 Full layer composition + auto-relight preserved; never overwrites.
 *   --ref <image>                 feed this image as a reference (see --ref-mode)
 *   --ref-mode <style|edit>       how --ref is used. style (default) = art-direction
 *                                 reference, render a NEW scene from the prompt. edit =
 *                                 surgical img2img: keep the supplied image's composition
 *                                 and change ONLY what the prompt instructs.
 *   --aspect <ratio>              aspect ratio, default 3:4 (portrait)
 *   --force                       overwrite existing _review images (default: skip)
 *   --key <apikey>                override GEMINI_API_KEY / OPENAI_API_KEY
 *   --model <id>                  default gemini-2.5-flash-image (openai: gpt-image-2)
 *   --provider <gemini|openai>    default gemini; openai = cheap gpt-image-2 prototyping
 *   --quality <low|medium|high>   openai only, default low (~$0.006/img low, ~$0.21 high)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_OPENAI_MODEL = 'gpt-image-2';

// --- tiny .env loader (no dependency) ---------------------------------------
function loadEnvKey(varName = 'GEMINI_API_KEY') {
  if (process.env[varName]) return process.env[varName];
  const envPath = path.join(REPO, '.env');
  if (fs.existsSync(envPath)) {
    const re = new RegExp(`^\\s*${varName}\\s*=\\s*(.+?)\\s*$`);
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(re);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

// --- three-layer prompt composition -----------------------------------------
// Mirrors review-server.cjs composedPrompt(): Artist + Aesthetic + Scene.
// The pack's room.prompt may still carry a stale baked-in style preamble; we
// IGNORE everything before "Scene:" and recompose from the live layer files so
// batch generation and the review tool always send the identical prompt.
function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function artistStyleFor(gameDir) {
  const selId = (readJSON(path.join(gameDir, 'selected-artist.json'), {}) || {}).id;
  const arts = (readJSON(path.join(REPO, 'docs/games/images/_artists/artists.json'), { artists: [] }).artists) || [];
  const a = arts.find((x) => x.id === selId) || arts[0];
  return a ? (a.style || '') : '';
}
function sceneFor(room, styleScenes) {
  if (styleScenes && styleScenes[room.slug]) return styleScenes[room.slug];   // explicit per-room override
  if (room.scene) return room.scene;                                          // future scene-only field
  const p = room.prompt || '';
  const i = p.indexOf('Scene:');                                             // discard any stale style preamble
  if (i >= 0) return p.slice(i + 'Scene:'.length).trim();
  return room.description || '';
}
// App prompt = global, app-wide layer ABOVE the artist (App ▸ Artist ▸ Game ▸ Scene). Read
// from _app/app.json so batch generation matches the reviewer's composed prompt exactly.
function appPromptText() {
  return (readJSON(path.join(REPO, 'docs/games/images/_app/app.json'), {}) || {}).prompt || '';
}
// The artist medium LEADS and is told to govern lighting/finish, so the per-room render
// medium actually shows instead of collapsing into the aesthetic's tone (oil reads as oil,
// riso as riso, photo as photo). Aesthetics describe WORLD content only — lighting/palette
// directives belong to the artist. Order: Artist ▸ Scene ▸ Aesthetic ▸ App. Kept identical to
// review-server.cjs composedFor()/composedPrompt() so batch == reviewer.
const ARTIST_LEAD = 'Render entirely in this medium; let it govern linework, palette and finish. Light each space by what the scene names: genuinely dark where it calls for dark, lit by any source it names, otherwise soft, even and clearly readable — never a murky gloom or an invented dramatic spotlight.';
function composeRoomPrompt(room, layers) {
  const scene = sceneFor(room, layers.scenes);
  return [
    layers.artist ? `${layers.artist} ${ARTIST_LEAD}` : '',
    scene ? `Scene: ${scene}` : '',
    layers.aesthetic ? `Aesthetic: ${layers.aesthetic}` : '',
    appPromptText() ? `App: ${appPromptText()}` : '',
  ].filter(Boolean).join(' ');
}

// --- arg parsing ------------------------------------------------------------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const flagsNoVal = ['force', 'regen', 'sandbox', 'force-locked'];
      if (flagsNoVal.includes(key)) { a[key] = true; }
      else { a[key] = argv[++i]; }
    } else {
      a._.push(t);
    }
  }
  return a;
}

// How a --ref image is framed for the model. STYLE = use as art-direction only and
// render a fresh scene (consistency chaining). EDIT = surgical img2img: preserve the
// supplied image and change ONLY what the prompt asks (the prompt IS the edit instruction).
function refWrappedPrompt(prompt, refMode) {
  if (refMode === 'edit') {
    return 'Modify the supplied image. Preserve its existing composition, layout, '
      + 'perspective, lighting, and every element not mentioned below. Apply ONLY '
      + 'these changes:\n\n' + prompt;
  }
  // GUIDE = the supplied image is a rough grey 3D blockout. Match its CAMERA and the rough
  // placement/scale of major masses, but reinterpret the blocky forms freely as real subjects,
  // and include only what is actually blocked in — text is context for style, not a checklist.
  if (refMode === 'guide') {
    return 'The supplied image is a rough coloured 3D BLOCKOUT marking only the MAJOR masses of the scene. '
      + 'KEEP its composition, camera, perspective, and the position and scale of those major masses — do '
      + 'not move them or change the basic layout, and do not add new LARGE structures that would change '
      + 'the architecture (extra storeys, walls, doorways, staircases, balconies). But fully realise each '
      + 'block as its real counterpart, NOT a copy of its crude facets: a small block with an upright back '
      + 'is one plush upholstered theatre CHAIR (render believable rows of real chairs); the raised slab is '
      + 'a solid stage; panels are walls. '
      + 'IMPORTANT — the blockout fixes only PLACEMENT, SCALE, and which masses are SOLID vs OPEN. Its hard '
      + 'facets, sharp corners and rectangular openings are a modelling artifact, NOT the intended shape. '
      + 'Render the real shape language the materials, era and description imply: doorways, tops and ceilings '
      + 'may arch, vault or curve; edges may round and bevel; where the description calls for a curved or '
      + 'spiral form, render the curve. Do NOT change WHERE an opening is or WHETHER it is open/solid — only '
      + 'its silhouette and finish. '
      + 'You SHOULD take artistic liberty to make the place feel real and lived-in: add logical secondary '
      + 'dressing and detail that plausibly belongs even though it is not blocked in — floor carpets and '
      + 'aisle runners, scattered debris, dust, cobwebs, fallen plaster, drapery, worn fabric, small '
      + 'clutter — and apply the described era, materials, lighting, age and ATMOSPHERE richly (deep '
      + 'shadow, gloom, patina, decay, moody contrast). It should look like the real, weathered place, '
      + 'NOT a clean sterile model. Only the major masses and the overall layout are fixed. '
      + 'CRITICAL: preserve the exact LEFT-RIGHT arrangement of the blockout — never mirror, flip or '
      + 'rotate the composition; whatever is on the left/right of the supplied image stays on that side. '
      + 'The supplied image is the SOLE authority for spatial placement — which wall, which side, what is '
      + 'foreground or background. COMPASS directions in the description (north, south, east, west) are '
      + 'unreliable and do NOT correspond to the image; NEVER move, place or relabel anything to satisfy a '
      + 'compass word. Each element goes exactly where the blockout shows it, full stop.\n\n' + prompt;
  }
  return 'Use the supplied image ONLY as a style/art-direction reference (palette, '
    + 'rendering, mood). Render a NEW scene described below.\n\n' + prompt;
}

// --- provider dispatch -------------------------------------------------------
// Gemini (Nano Banana) is the default/finals provider; OpenAI (gpt-image-2) is
// the cheap prototyping path — same call site, branch on `provider`.
async function generateImage(opts) {
  if (opts.provider === 'openai') return generateImageOpenAI(opts);
  return generateImageGemini(opts);
}

// Map our Gemini aspect strings to the fixed sizes the OpenAI image API accepts.
// OpenAI has NO native 3:4 — portrait collapses to 2:3 (1024x1536); crop downstream.
function openAISizeForAspect(aspect) {
  switch (aspect) {
    case '1:1': return '1024x1024';
    case '4:3':
    case '3:2':
    case '16:9': return '1536x1024';   // landscape
    default:     return '1024x1536';   // 3:4 / 2:3 / portrait
  }
}

// --- the actual OpenAI image call (gpt-image-2 etc.) -------------------------
// No --ref: POST /v1/images/generations (JSON). With --ref: POST /v1/images/edits
// (multipart) — note every reference image bills at the high-fidelity INPUT rate
// regardless of `quality`, so the cheap low-quality rate only holds ref-free.
async function generateImageOpenAI({ prompt, refImagePath, refMode, apiKey, model, aspect, quality }) {
  const size = openAISizeForAspect(aspect);
  const q = quality || 'low';
  let res;
  if (refImagePath) {
    const buf = fs.readFileSync(refImagePath);
    const ext = path.extname(refImagePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', refWrappedPrompt(prompt, refMode));
    form.append('size', size);
    form.append('quality', q);
    form.append('image', new Blob([buf], { type: mime }), 'ref' + ext);
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, size, quality: q, n: 1 }),
    });
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const json = await res.json();
  const b64 = json.data && json.data[0] && json.data[0].b64_json;
  if (!b64) throw new Error('No image returned: ' + JSON.stringify(json).slice(0, 300));
  return Buffer.from(b64, 'base64');
}

// --- the actual Gemini image call -------------------------------------------
async function generateImageGemini({ prompt, refImagePath, refMode, apiKey, model, aspect }) {
  const parts = [];
  if (refImagePath) {
    const buf = fs.readFileSync(refImagePath);
    const ext = path.extname(refImagePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    parts.push({ inlineData: { mimeType: mime, data: buf.toString('base64') } });
    parts.push({ text: refWrappedPrompt(prompt, refMode) });
  } else {
    parts.push({ text: prompt });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(aspect ? { imageConfig: { aspectRatio: aspect } } : {}),
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  async function call(payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
    });
    return res;
  }

  let res = await call(body);
  // Some API versions reject imageConfig/responseModalities with 400 — retry bare.
  if (res.status === 400) {
    const txt = await res.text();
    if (/imageConfig|responseModalities|aspectRatio/i.test(txt)) {
      res = await call({ contents: [{ parts }] });
    } else {
      throw new Error(`HTTP 400: ${txt.slice(0, 500)}`);
    }
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const json = await res.json();
  const cand = json.candidates && json.candidates[0];
  const outParts = (cand && cand.content && cand.content.parts) || [];
  const imgPart = outParts.find((p) => p.inlineData && p.inlineData.data);
  if (!imgPart) {
    const textPart = outParts.find((p) => p.text);
    throw new Error('No image returned' + (textPart ? `: ${textPart.text.slice(0, 300)}` : ` (finishReason: ${cand && cand.finishReason})`));
  }
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

// --- CLI --------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = (args.provider || 'gemini').toLowerCase();
  const quality = args.quality || 'low';   // openai only; ignored by gemini
  const model = args.model || (provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL);
  const aspect = args.aspect || '3:4';

  const keyVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  const apiKey = args.key || loadEnvKey(keyVar);
  if (!apiKey) {
    if (provider === 'openai') {
      console.error('ERROR: no API key. Put OPENAI_API_KEY=... in .env (gitignored), or pass --key.');
    } else {
      console.error('ERROR: no API key. Put GEMINI_API_KEY=... in .env (gitignored), or pass --key.');
      console.error('Get a free key at https://aistudio.google.com/apikey');
    }
    process.exit(2);
  }

  // --sbx <game>: drop an ad-hoc render straight into that game's _sandbox as the next sbx-rN,
  // with the full .txt + .json sidecar the artview Sandbox panel reads — so ANY image made from
  // the CLI is immediately viewable in artview. Two ways to supply the prompt:
  //   (a) layer flags --artist/--scene/--aesthetic/--app → composed in the SAME labeled, blank-
  //       line-separated ARTIST:/SCENE:/GAME:/APP: format as review-server composeForRoom(), with
  //       ARTIST_LEAD appended to the artist layer. The structured fields are stored too, so
  //       clicking the render in artview repopulates every editable layer box.
  //   (b) --prompt <text> → stored verbatim (raw), fields left blank.
  // Optional meta: --loc <slug> --loc-name <name> --artist-name <name> --artist-id <id>.
  if (args.sbx) {
    const hasLayers = args.artist || args.scene || args.aesthetic || args.app;
    if (!hasLayers && !args.prompt) { console.error('ERROR: --sbx needs either --prompt or layer flags (--artist/--scene/--aesthetic/--app).'); process.exit(2); }
    const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const fields = { artist: args.artist || '', scene: args.scene || '', aesthetic: args.aesthetic || '', app: args.app || '' };
    // Labelled, line-broken layers — identical shape to review-server composeForRoom() so the
    // sidecar prompt reads the same as a live artview render (ARTIST: / SCENE: / GAME: / APP:).
    const composed = hasLayers ? [
      fields.artist ? `ARTIST: ${fields.artist} ${ARTIST_LEAD}` : '',
      fields.scene ? `SCENE: ${fields.scene}` : '',
      fields.aesthetic ? `GAME: ${capFirst(fields.aesthetic)}` : '',
      fields.app ? `APP: ${fields.app}` : '',
    ].filter(Boolean).join('\n\n') : args.prompt;
    const sbxDir = path.join(REPO, 'docs/games/images', args.sbx, '_sandbox');
    fs.mkdirSync(sbxDir, { recursive: true });
    let max = 0;
    for (const f of fs.readdirSync(sbxDir)) { const m = f.match(/^sbx-r(\d+)\.png$/i); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    const name = `sbx-r${max + 1}`;
    const out = path.join(sbxDir, `${name}.png`);
    process.stdout.write(`Generating → ${path.relative(REPO, out)} ... `);
    const buf = await generateImage({ prompt: composed, refImagePath: args.ref, refMode: args['ref-mode'], apiKey, model, aspect, provider, quality });
    fs.writeFileSync(out, buf);
    fs.writeFileSync(path.join(sbxDir, `${name}.txt`), composed);
    fs.writeFileSync(path.join(sbxDir, `${name}.json`), JSON.stringify({
      artistId: args['artist-id'] || 'cli', artistName: args['artist-name'] || '(CLI)', edited: true,
      locSlug: args.loc || '', locName: args['loc-name'] || args.loc || '',
      ...fields,                       // app/artist/aesthetic/scene → repopulate the editable boxes
      provider, quality, model,
      prompt: composed,                // the EXACT sent prompt, shown inline in the Sandbox panel
    }, null, 2));
    console.log(`OK (${(buf.length / 1024).toFixed(0)} KB) → Sandbox ${name}`);
    return;
  }

  // --- ad-hoc single image ---
  if (args.prompt) {
    const out = args.out || path.join(REPO, 'docs/games/images/_adhoc.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    process.stdout.write(`Generating → ${path.relative(REPO, out)} ... `);
    const buf = await generateImage({ prompt: args.prompt, refImagePath: args.ref, refMode: args['ref-mode'], apiKey, model, aspect, provider, quality });
    fs.writeFileSync(out, buf);
    fs.writeFileSync(out.replace(/\.png$/i, '.txt'), args.prompt); // sidecar: the exact prompt that made this image
    console.log(`OK (${(buf.length / 1024).toFixed(0)} KB)`);
    return;
  }

  // --- batch from prompt pack ---
  const game = args._[0];
  if (!game) {
    console.error('Usage: node tools/gen-room-images.cjs <game>   (or --prompt "..." --out file.png)');
    process.exit(2);
  }
  const packPath = args.pack || path.join(REPO, 'docs/games/images', game, 'room-facts.json');
  if (!fs.existsSync(packPath)) {
    console.error(`No prompt pack at ${path.relative(REPO, packPath)}.\nRun: node tools/gen-room-facts.cjs ${game}`);
    process.exit(2);
  }
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const gameDir = path.join(REPO, 'docs/games/images', game);
  const reviewDir = path.join(gameDir, '_review');
  fs.mkdirSync(reviewDir, { recursive: true });

  // Live composition layers — recomposed per-room so batch == review tool.
  const styleJson = readJSON(path.join(gameDir, 'style.json'), {});
  const layers = {
    artist: artistStyleFor(gameDir),
    aesthetic: styleJson.aesthetic || '',
    scenes: styleJson.scenes || {},
  };
  // Provenance for the reviewer's thumbnail chip: which artist made each batch render.
  // (Batch output is untagged `<slug>.png`, so the model can't be read from the filename —
  // the .json sidecar carries provider/quality/model too. Regen via review-server tags its
  // own filenames and writes its own sidecar, so this only needs to cover the batch path.)
  const provId = ((readJSON(path.join(gameDir, 'selected-artist.json'), {}) || {}).id) || null;
  const provArts = (readJSON(path.join(REPO, 'docs/games/images/_artists/artists.json'), { artists: [] }).artists) || [];
  const provArtName = ((provArts.find((a) => a.id === provId) || {}).name) || provId;

  let rooms = pack.rooms || [];
  // --only accepts one slug OR a comma-separated subset ("a,b,c") so a render skill can
  // batch an arbitrary set of rooms in a single call.
  if (args.only) {
    const want = new Set(String(args.only).split(',').map((s) => s.trim()).filter(Boolean));
    rooms = rooms.filter((r) => want.has(r.slug));
  }
  if (!rooms.length) { console.error('No matching rooms in pack.'); process.exit(2); }

  // --regen: re-roll an existing image but PRESERVE the prior take as <slug>.prev.png
  // so the review modal can A/B compare. --steer appends guidance to the prompt.
  const regen = !!args.regen;
  const steer = args.steer ? ` ${args.steer}` : '';

  // An anchored state-variant (Gap B) renders as an img2img RELIGHT off its base room's image:
  // feed the base image as an edit ref + a lean state-change instruction, so the geometry holds
  // and only the lighting/atmosphere changes (the validated shared-volume approach). Looks for the
  // committed image first, then the _review staging copy; null if the base isn't rendered yet.
  const anchorImageFor = (slug) => {
    if (sbxRendered.has(slug)) return sbxRendered.get(slug);   // rendered into the sandbox this run
    const committed = path.join(gameDir, `${slug}.png`);
    if (fs.existsSync(committed)) return committed;
    const staged = path.join(reviewDir, `${slug}.png`);
    return fs.existsSync(staged) ? staged : null;
  };
  // Render anchors before the variants that depend on them, so a single full batch "just works".
  rooms = rooms.slice().sort((a, b) => (a.anchorRoom ? 1 : 0) - (b.anchorRoom ? 1 : 0));

  // --sandbox: route batch renders into <game>/_sandbox as sbx-rN (artview Sandbox panel) instead
  // of _review/<slug>.png. This is the PROTOTYPE target — full layer composition + auto-relight are
  // preserved (unlike the ad-hoc --sbx path), but the output is a throwaway numbered take that never
  // shadows a committed image. Default prototyping path; promote a keeper out of the sandbox later.
  const toSandbox = !!args.sandbox;
  const sbxDir = path.join(gameDir, '_sandbox');
  let sbxMax = 0;
  if (toSandbox) {
    fs.mkdirSync(sbxDir, { recursive: true });
    for (const f of fs.readdirSync(sbxDir)) { const m = f.match(/^sbx-r(\d+)\.png$/i); if (m) sbxMax = Math.max(sbxMax, parseInt(m[1], 10)); }
  }
  const sbxRendered = new Map(); // slug -> sandbox png path rendered THIS run (so a variant can relight off an anchor we just put in the sandbox)

  // Promoted winners are LOCKED against clobbering. A committed image is recorded in manifest.images
  // (keyed by room NAME), so that presence = "this room's art was chosen." A full batch (no --only)
  // skips locked rooms even under --force, so "re-render everything" never destroys a hand-picked
  // winner. Overrides: name the room explicitly via --only (deliberate re-roll of that room), or pass
  // --force-locked to re-render locked rooms too. Demoting a room (artview) removes it from
  // manifest.images, which lifts the lock. Sandbox renders never touch committed art, so they ignore it.
  const promotedNames = new Set(Object.keys((readJSON(path.join(gameDir, 'manifest.json'), { images: {} }).images) || {}));
  const lockedSlugs = new Set(rooms.filter((r) => promotedNames.has(r.name)).map((r) => r.slug));

  const qualNote = provider === 'openai' ? `, ${quality}` : '';
  console.log(`Generating ${rooms.length} image(s) for ${game} → ${toSandbox ? '_sandbox/' : '_review/'}  (${provider}: ${model}, ${aspect}${qualNote})${regen ? ' [regen]' : ''}`);
  let ok = 0, skip = 0, fail = 0;
  for (const room of rooms) {
    // Locked promoted winner — skip in a full batch unless explicitly targeted or force-unlocked.
    if (!toSandbox && lockedSlugs.has(room.slug) && !args.only && !args['force-locked']) {
      console.log(`  lock  ${room.slug} (promoted winner — --only ${room.slug} or --force-locked to re-render)`); skip++; continue;
    }
    // Sandbox renders are always-new numbered takes (never overwrite, no exists-skip); review
    // renders write the canonical <slug>.png and respect --force/--regen.
    const sbxName = toSandbox ? `sbx-r${++sbxMax}` : null;
    const out = toSandbox ? path.join(sbxDir, `${sbxName}.png`) : path.join(reviewDir, `${room.slug}.png`);
    if (!toSandbox && fs.existsSync(out) && !args.force && !regen) { console.log(`  skip  ${room.slug} (exists; --force or --regen to replace)`); skip++; continue; }
    // Default render: prompt-only (or whatever --ref the user passed explicitly).
    let composed = composeRoomPrompt(room, layers) + steer;
    let refImagePath = args.ref, refMode = args['ref-mode'];
    // Gap B RELIGHT: an anchored variant with no explicit --ref edits its base image (keep camera,
    // change only the lighting/water state — the validated shared-volume approach).
    // VANTAGE sub-states do NOT anchor: the img2img edit drags composition back to the base's framing
    // and imposes its palette, scattering a radical camera change (A/B-tested on Dreamhold
    // curtained-room-on-the-chair: free text2img r18/r57 beat anchored r41/r55/r56). The vantage
    // scene already describes the new camera fully, so it renders free.
    if (room.anchorRoom && room.anchorMode !== 'vantage' && !args.ref) {
      const anchorImg = anchorImageFor(room.anchorRoom);
      if (!anchorImg) { console.log(`  skip  ${room.slug} (anchor "${room.anchorRoom}" not rendered yet — render it first, then re-run)`); skip++; continue; }
      refImagePath = anchorImg;
      refMode = 'edit';
      const editScene = (layers.scenes && layers.scenes[room.slug]) || room.stateDelta || sceneFor(room, layers.scenes);
      composed = (`Relight of the supplied scene${room.stateLabel ? ` to its "${room.stateLabel}" state` : ''}: ${editScene}`).trim() + steer;
    }
    const anchorTag = refMode === 'edit' && room.anchorRoom ? ` (relight ← ${room.anchorRoom})` : '';
    process.stdout.write(`  ${regen ? 'regen' : 'gen  '} ${room.slug}${anchorTag} ... `);
    try {
      const buf = await generateImage({ prompt: composed, refImagePath, refMode, apiKey, model, aspect, provider, quality });
      if (!toSandbox && regen && fs.existsSync(out)) fs.copyFileSync(out, path.join(reviewDir, `${room.slug}.prev.png`)); // keep old for compare
      fs.writeFileSync(out, buf);
      fs.writeFileSync(out.replace(/\.png$/i, '.txt'), composed); // sidecar: exact prompt used
      if (toSandbox) {
        // artview Sandbox panel sidecar: loc metadata + the exact prompt, shown inline.
        fs.writeFileSync(out.replace(/\.png$/i, '.json'), JSON.stringify({
          artistId: provId || 'cli', artistName: provArtName || '(CLI)', edited: false,
          locSlug: room.slug, locName: room.name || room.slug,
          provider, quality, model, prompt: composed,
        }, null, 2));
        sbxRendered.set(room.slug, out);
        console.log(`OK (${(buf.length / 1024).toFixed(0)} KB) → Sandbox ${sbxName}`);
      } else {
        fs.writeFileSync(out.replace(/\.png$/i, '.json'), JSON.stringify({ artistId: provId, artistName: provArtName, provider, quality, model }, null, 2)); // provenance sidecar (reviewer thumbnail chip)
        console.log(`OK (${(buf.length / 1024).toFixed(0)} KB)${regen ? ' — prev kept' : ''}`);
      }
      ok++;
    } catch (e) {
      console.log(`FAIL — ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} ok, ${skip} skipped, ${fail} failed. ${toSandbox ? `Sandbox: docs/games/images/${game}/_sandbox/ (view in artview)` : `Review: docs/games/images/${game}/_review/`}`);
  if (ok && !toSandbox) console.log(`Build a contact sheet: node tools/gen-room-review.cjs ${game}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
