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
 * COST: flat ~$0.039 per image regardless of resolution (per-image token billing,
 * NOT per-pixel) — "low res" is an aesthetic in the prompt, not a cost lever.
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
 *   --ref <image>                 feed this image as a style reference (consistency chaining)
 *   --aspect <ratio>              aspect ratio, default 3:4 (portrait)
 *   --force                       overwrite existing _review images (default: skip)
 *   --key <apikey>                override GEMINI_API_KEY
 *   --model <id>                  default gemini-2.5-flash-image
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

// --- tiny .env loader (no dependency) ---------------------------------------
function loadEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = path.join(REPO, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

// --- arg parsing ------------------------------------------------------------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const flagsNoVal = ['force'];
      if (flagsNoVal.includes(key)) { a[key] = true; }
      else { a[key] = argv[++i]; }
    } else {
      a._.push(t);
    }
  }
  return a;
}

// --- the actual Gemini image call -------------------------------------------
async function generateImage({ prompt, refImagePath, apiKey, model, aspect }) {
  const parts = [];
  if (refImagePath) {
    const buf = fs.readFileSync(refImagePath);
    const ext = path.extname(refImagePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    parts.push({ inlineData: { mimeType: mime, data: buf.toString('base64') } });
    parts.push({ text: 'Use the supplied image ONLY as a style/art-direction reference (palette, rendering, mood). Render a NEW scene described below.\n\n' + prompt });
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
  const apiKey = args.key || loadEnvKey();
  const model = args.model || DEFAULT_MODEL;
  const aspect = args.aspect || '3:4';

  if (!apiKey) {
    console.error('ERROR: no API key. Put GEMINI_API_KEY=... in .env (gitignored), or pass --key.');
    console.error('Get a free key at https://aistudio.google.com/apikey');
    process.exit(2);
  }

  // --- ad-hoc single image ---
  if (args.prompt) {
    const out = args.out || path.join(REPO, 'docs/games/images/_adhoc.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    process.stdout.write(`Generating → ${path.relative(REPO, out)} ... `);
    const buf = await generateImage({ prompt: args.prompt, refImagePath: args.ref, apiKey, model, aspect });
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
  const reviewDir = path.join(REPO, 'docs/games/images', game, '_review');
  fs.mkdirSync(reviewDir, { recursive: true });

  let rooms = pack.rooms || [];
  if (args.only) rooms = rooms.filter((r) => r.slug === args.only);
  if (!rooms.length) { console.error('No matching rooms in pack.'); process.exit(2); }

  // --regen: re-roll an existing image but PRESERVE the prior take as <slug>.prev.png
  // so the review modal can A/B compare. --steer appends guidance to the prompt.
  const regen = !!args.regen;
  const steer = args.steer ? ` ${args.steer}` : '';

  console.log(`Generating ${rooms.length} image(s) for ${game} → _review/  (model ${model}, ${aspect})${regen ? ' [regen]' : ''}`);
  let ok = 0, skip = 0, fail = 0;
  for (const room of rooms) {
    const out = path.join(reviewDir, `${room.slug}.png`);
    if (fs.existsSync(out) && !args.force && !regen) { console.log(`  skip  ${room.slug} (exists; --force or --regen to replace)`); skip++; continue; }
    process.stdout.write(`  ${regen ? 'regen' : 'gen  '} ${room.slug} ... `);
    try {
      const buf = await generateImage({ prompt: room.prompt + steer, refImagePath: args.ref, apiKey, model, aspect });
      if (regen && fs.existsSync(out)) fs.copyFileSync(out, path.join(reviewDir, `${room.slug}.prev.png`)); // keep old for compare
      fs.writeFileSync(out, buf);
      fs.writeFileSync(out.replace(/\.png$/i, '.txt'), room.prompt + steer); // sidecar: exact prompt used
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
