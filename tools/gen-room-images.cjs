#!/usr/bin/env node
/*
 * Lantern location-art generator — Nano Banana (Gemini 2.5 Flash Image) hook.
 *
 * Generates location images from prompts and writes them to a per-game staging
 * folder (docs/games/images/<game>/_review/) for review BEFORE they're promoted
 * into the game. This is the "generate without leaving the editor" half of the
 * generate-location-art workflow; the prompts themselves come from
 * tools/gen-room-prompts.cjs (which mines the verified walkthrough).
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
 *   # batch from a prompt pack (produced by gen-room-prompts.cjs):
 *   node tools/gen-room-images.cjs anchorhead
 *   node tools/gen-room-images.cjs anchorhead --only outside-the-real-estate-office
 *   node tools/gen-room-images.cjs anchorhead --ref <approved.png>   # style-reference chaining
 *
 * FLAGS
 *   --prompt <text> --out <file>  ad-hoc single-image mode
 *   --pack <file>                 prompt-pack JSON (default: docs/games/images/<game>/prompts.json)
 *   --only <slug>                 generate just one room from the pack
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
function composeRoomPrompt(room, layers) {
  const scene = sceneFor(room, layers.scenes);
  return [
    appPromptText(),
    layers.artist ? `Artist: ${layers.artist}` : '',
    layers.aesthetic ? `Aesthetic: ${layers.aesthetic}` : '',
    scene ? `Scene: ${scene}` : '',
  ].filter(Boolean).join(' ');
}

// --- arg parsing ------------------------------------------------------------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const flagsNoVal = ['force', 'regen'];
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
  const packPath = args.pack || path.join(REPO, 'docs/games/images', game, 'prompts.json');
  if (!fs.existsSync(packPath)) {
    console.error(`No prompt pack at ${path.relative(REPO, packPath)}.\nRun: node tools/gen-room-prompts.cjs ${game}`);
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
    const committed = path.join(gameDir, `${slug}.png`);
    if (fs.existsSync(committed)) return committed;
    const staged = path.join(reviewDir, `${slug}.png`);
    return fs.existsSync(staged) ? staged : null;
  };
  // Render anchors before the variants that depend on them, so a single full batch "just works".
  rooms = rooms.slice().sort((a, b) => (a.anchorRoom ? 1 : 0) - (b.anchorRoom ? 1 : 0));

  const qualNote = provider === 'openai' ? `, ${quality}` : '';
  console.log(`Generating ${rooms.length} image(s) for ${game} → _review/  (${provider}: ${model}, ${aspect}${qualNote})${regen ? ' [regen]' : ''}`);
  let ok = 0, skip = 0, fail = 0;
  for (const room of rooms) {
    const out = path.join(reviewDir, `${room.slug}.png`);
    if (fs.existsSync(out) && !args.force && !regen) { console.log(`  skip  ${room.slug} (exists; --force or --regen to replace)`); skip++; continue; }
    // Default render: prompt-only (or whatever --ref the user passed explicitly).
    let composed = composeRoomPrompt(room, layers) + steer;
    let refImagePath = args.ref, refMode = args['ref-mode'];
    // Gap B relight: an anchored variant with no explicit --ref edits its base image instead.
    if (room.anchorRoom && !args.ref) {
      const anchorImg = anchorImageFor(room.anchorRoom);
      if (!anchorImg) { console.log(`  skip  ${room.slug} (anchor "${room.anchorRoom}" not rendered yet — render it first, then re-run)`); skip++; continue; }
      refImagePath = anchorImg;
      refMode = 'edit';
      const relight = (layers.scenes && layers.scenes[room.slug]) || room.stateDelta || sceneFor(room, layers.scenes);
      composed = (`Relight of the supplied scene${room.stateLabel ? ` to its "${room.stateLabel}" state` : ''}: ${relight}`).trim() + steer;
    }
    process.stdout.write(`  ${regen ? 'regen' : 'gen  '} ${room.slug}${refMode === 'edit' && room.anchorRoom ? ` (relight ← ${room.anchorRoom})` : ''} ... `);
    try {
      const buf = await generateImage({ prompt: composed, refImagePath, refMode, apiKey, model, aspect, provider, quality });
      if (regen && fs.existsSync(out)) fs.copyFileSync(out, path.join(reviewDir, `${room.slug}.prev.png`)); // keep old for compare
      fs.writeFileSync(out, buf);
      fs.writeFileSync(out.replace(/\.png$/i, '.txt'), composed); // sidecar: exact prompt used
      console.log(`OK (${(buf.length / 1024).toFixed(0)} KB)${regen ? ' — prev kept' : ''}`);
      ok++;
    } catch (e) {
      console.log(`FAIL — ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} ok, ${skip} skipped, ${fail} failed. Review: docs/games/images/${game}/_review/`);
  if (ok) console.log(`Build a contact sheet: node tools/gen-room-review.cjs ${game}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
