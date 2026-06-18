#!/usr/bin/env node
/*
 * scenes-import.cjs — push authored Scene prompts from the worksheet into the live
 * style.json that the generator + reviewer actually read.
 *
 * Worksheet: docs/games/images/<game>/scenes.md
 *   Each room is a block headed `## <slug> — <Name>`; the authoritative line is
 *   `SCENE: <prompt text>` (single line). EXITS:/PROSE: lines are reference only.
 *
 * Writes each non-empty SCENE into style.json → scenes[slug]. Rooms absent from the
 * worksheet are left untouched (so existing overrides for other rooms survive).
 *
 * Usage:  node tools/scenes-import.cjs <game> [--dry]
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');

const game = process.argv[2];
const dry = process.argv.includes('--dry');
if (!game) { console.error('Usage: node tools/scenes-import.cjs <game> [--dry]'); process.exit(2); }

const gameDir = path.join(REPO, 'docs/games/images', game);
const wsPath = path.join(gameDir, 'scenes.md');
const stylePath = path.join(gameDir, 'style.json');
if (!fs.existsSync(wsPath)) { console.error(`No worksheet at ${path.relative(REPO, wsPath)}`); process.exit(2); }

// Parse: walk lines, track current slug from `## <slug> — …`, grab its `SCENE:` line.
const lines = fs.readFileSync(wsPath, 'utf8').split(/\r?\n/);
const scenes = {};
let slug = null;
for (const line of lines) {
  const h = line.match(/^##\s+([a-z0-9-]+)\s+[—-]/i);
  if (h) { slug = h[1]; continue; }
  const s = line.match(/^SCENE:\s*(.+)$/);
  if (s && slug) { scenes[slug] = s[1].trim(); slug = null; }
}
const found = Object.keys(scenes);
if (!found.length) { console.error('No `SCENE:` lines found — check the worksheet format.'); process.exit(1); }

const style = JSON.parse(fs.readFileSync(stylePath, 'utf8'));
style.scenes = style.scenes || {};
let added = 0, changed = 0, same = 0;
for (const [k, v] of Object.entries(scenes)) {
  if (!(k in style.scenes)) added++;
  else if (style.scenes[k] !== v) changed++;
  else { same++; continue; }
  if (!dry) style.scenes[k] = v;
}
console.log(`${found.length} scene(s) in worksheet → ${added} new, ${changed} changed, ${same} unchanged.`);
console.log('Slugs:', found.join(', '));
if (dry) { console.log('\n(--dry: style.json NOT written)'); return; }
fs.writeFileSync(stylePath, JSON.stringify(style, null, 2) + '\n');
console.log(`\nWrote ${path.relative(REPO, stylePath)}.`);
