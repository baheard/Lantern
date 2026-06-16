#!/usr/bin/env node
/*
 * Lantern location-art prompt builder.
 *
 * Replays a game's VERIFIED walkthrough once through tools/play.cjs (--status), then
 * for every distinct location captures:
 *   - the canonical locationName (the SAME string the auto-mapper records, so images
 *     bind to map nodes by name),
 *   - the room's description prose (first time we enter it),
 *   - its real exits, derived from the walkthrough's own movement edges
 *     (from-location --<dir>--> to-location) — accurate game geometry, not prose-guessing.
 *
 * Emits a prompt pack: a shared STYLE PREAMBLE (the agreed "low-res gothic illustration"
 * recipe) + one ready-to-generate prompt per room, with scene + exits baked in. The pack
 * feeds tools/gen-room-images.cjs.
 *
 * USAGE
 *   node tools/gen-room-prompts.cjs anchorhead
 *   node tools/gen-room-prompts.cjs anchorhead --seed 1 --style gothic
 *   node tools/gen-room-prompts.cjs anchorhead --out docs/games/images/anchorhead/prompts.json
 *
 * Writes <gamedir>/prompts.json (machine, for gen-room-images.cjs) and prompts.md (human).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

// Per-game art direction. `gothic` is the agreed Anchorhead recipe; add more as we go.
const STYLES = {
  gothic: 'Old-school pixel art, low-resolution retro adventure-game scene art in the style of early-1990s VGA point-and-click adventures (≈320×200, limited 16–32 colour palette), chunky visible pixels and hand-dithered shading. Gothic horror mood, muted desaturated palette — slate grey, sickly green, deep shadow, weak gaslight. Lovecraftian dread, rain and gloom, no people, no text or UI overlays. Portrait composition, taller than wide. 3:4.',
  neutral: 'Old-school pixel art, low-resolution retro interactive-fiction scene art (early-1990s VGA adventure-game look, ≈320×200, limited palette), chunky visible pixels, hand-dithered shading. Evocative lighting, rich but slightly muted palette, no people, no text or UI overlays. Portrait composition, taller than wide. 3:4.',
};

const MOVES = new Set([
  'n','s','e','w','ne','nw','se','sw','u','d','up','down','in','out',
  'north','south','east','west','northeast','northwest','southeast','southwest',
  'enter','exit','go',
]);
const DIR_LABEL = {
  n:'north', s:'south', e:'east', w:'west', ne:'northeast', nw:'northwest',
  se:'southeast', sw:'southwest', u:'up', d:'down', up:'up', down:'down',
  in:'inside', out:'outside', enter:'inside', exit:'outside',
};

// Reduce a room description to its visual core for a prompt: drop dialogue and
// character-action / interiority sentences, flatten whitespace, cap length.
function visualCore(desc) {
  // On first entry the game prints STATIC scenery first, then DYNAMIC events/dialogue.
  // Keep paragraphs in order up to (not including) the first dialogue/NPC-event paragraph.
  const STOP = /["“”]|\b(?:he|she|Michael)\s+(?:says|goes|hurries|kisses|stretches|yawns|nods|turns|walks|stands|sits|whispers|mutters)\b|\bAnd with that\b/i;
  const all = desc.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const kept = [];
  for (const p of all) { if (STOP.test(p)) break; kept.push(p); }
  let scene = (kept.length ? kept : all).join(' ');
  if (scene.length > 750) {
    const cut = scene.slice(0, 750);
    scene = cut.slice(0, cut.lastIndexOf('. ') + 1) || cut;
  }
  return scene.trim();
}

function slugify(name) {
  return name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) a[t.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    else a._.push(t);
  }
  return a;
}

function findWalkthrough(game) {
  const cmds = path.join(REPO, 'docs/games/walkthroughs', `${game}.cmds.txt`);
  if (!fs.existsSync(cmds)) throw new Error(`No verified walkthrough at ${path.relative(REPO, cmds)} — run trace-walkthrough for ${game} first.`);
  return cmds;
}

// Run the real harness and capture its --status transcript.
function replay(game, cmdsPath, seed) {
  const out = execFileSync('node', [
    path.join(REPO, 'tools/play.cjs'), game, '--status', '--seed', String(seed), '--file', cmdsPath,
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, cwd: REPO });
  return out;
}

// Split transcript into ordered turns keyed off the `[@ Location | phase: ...]` headers.
function parseTurns(transcript) {
  const lines = transcript.split(/\r?\n/);
  const headerRe = /^\[@ (.+?)\s+\|\s+phase:.*\]$/;
  const turns = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (cur) turns.push(cur);
      cur = { location: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) turns.push(cur);
  // The echoed command is the first non-empty body line after the header in --status mode.
  for (const t of turns) {
    const firstNonEmpty = t.body.find((l) => l.trim().length);
    t.command = firstNonEmpty ? firstNonEmpty.trim() : '';
  }
  return turns;
}

// Pull a room description out of a turn's body: the prose between the room-name
// heading line and the trailing `>` prompt.
function extractDescription(turn) {
  const name = turn.location;
  const body = turn.body;
  // Find a line that equals the location name (the game's printed room heading).
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i].trim().toLowerCase() === name.toLowerCase()) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const out = [];
  for (let i = start; i < body.length; i++) {
    const t = body[i].trim();
    if (t === '>' || t === '') { if (t === '>') break; out.push(''); continue; }
    out.push(t);
  }
  return out.join('\n').replace(/\n{2,}/g, '\n\n').trim() || null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const game = args._[0];
  if (!game) { console.error('Usage: node tools/gen-room-prompts.cjs <game> [--seed N] [--style gothic]'); process.exit(2); }
  const seed = args.seed || 1;
  const styleKey = args.style || 'gothic';
  const preamble = STYLES[styleKey] || STYLES.gothic;

  const cmdsPath = findWalkthrough(game);
  console.error(`Replaying ${game} walkthrough (seed ${seed})…`);
  const transcript = replay(game, cmdsPath, seed);
  const turns = parseTurns(transcript);

  // Build per-location data: first-seen description + exit edges from movement.
  const locs = new Map(); // name -> { name, slug, description, exits: Map<dir,dest> }
  function ensure(name) {
    if (!locs.has(name)) locs.set(name, { name, slug: slugify(name), description: null, exits: new Map() });
    return locs.get(name);
  }
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const L = ensure(t.location);
    if (!L.description) {
      const d = extractDescription(t);
      if (d) L.description = d;
    }
    // Exit edge: a movement command that changed location.
    const cmd = (t.command || '').toLowerCase().split(/\s+/)[0];
    const next = turns[i + 1];
    if (next && next.location !== t.location && MOVES.has(cmd)) {
      const dir = DIR_LABEL[cmd] || cmd;
      if (!L.exits.has(dir)) L.exits.set(dir, next.location);
    }
  }

  // Compose prompts.
  const rooms = [];
  for (const L of locs.values()) {
    // exits stay as map/manifest metadata, but are NOT baked into the prompt: the
    // traversal graph records puzzle-movement (e.g. climbing a window = "northwest"),
    // which contradicts the prose's own compass directions. The description already
    // states real exits ("office lies to the east"), so we let the prose drive composition.
    const exits = [...L.exits.entries()].map(([dir, dest]) => `${dir} → ${dest}`);
    const scene = L.description ? ` Scene: ${visualCore(L.description)}` : '';
    const prompt = `${preamble}${scene}`;
    rooms.push({ name: L.name, slug: L.slug, exits, description: L.description, prompt });
  }

  const gameDir = path.join(REPO, 'docs/games/images', game);
  fs.mkdirSync(gameDir, { recursive: true });
  const pack = { game, seed, style: styleKey, generatedFrom: path.relative(REPO, cmdsPath), rooms };
  const jsonOut = args.out || path.join(gameDir, 'prompts.json');
  fs.writeFileSync(jsonOut, JSON.stringify(pack, null, 2));

  // Human-readable companion.
  const md = [`# ${game} — location art prompt pack`, '',
    `Style: **${styleKey}** · ${rooms.length} locations · from \`${pack.generatedFrom}\` (seed ${seed})`, '',
    '---', ''];
  for (const r of rooms) {
    md.push(`## ${r.name}  \`${r.slug}\``);
    if (r.exits.length) md.push(`**Exits:** ${r.exits.join(' · ')}`);
    md.push('', '```', r.prompt, '```', '');
  }
  fs.writeFileSync(path.join(gameDir, 'prompts.md'), md.join('\n'));

  console.error(`\nWrote ${rooms.length} room prompts:`);
  console.error(`  ${path.relative(REPO, jsonOut)}`);
  console.error(`  ${path.relative(REPO, path.join(gameDir, 'prompts.md'))}`);
  const noDesc = rooms.filter((r) => !r.description).length;
  if (noDesc) console.error(`  (note: ${noDesc} location(s) had no extractable description — they got style-only prompts)`);
  console.error(`\nNext: node tools/gen-room-images.cjs ${game}`);
}

main();
