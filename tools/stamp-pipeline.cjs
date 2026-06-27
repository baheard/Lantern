#!/usr/bin/env node
/*
 * stamp-pipeline.cjs — record provenance for one art-pipeline step of one game.
 *
 *   node tools/stamp-pipeline.cjs <game> <step> [--at <ISO>]
 *
 * Writes/updates docs/games/images/<game>/pipeline.json, setting:
 *   <step>: { at: <ISO timestamp>, version: <app version>, commit: <git short hash> }
 *
 * Pipeline skills call this on completion so /studio can flag stale steps (a step
 * done before its inputs were last regenerated, or before a major version change).
 * Dev-only provenance — does NOT bump the app version.
 *
 * Canonical step names (the keys /studio reads):
 *   walkthrough · hints · room-facts · aesthetic · mold · artist · render
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STEPS = new Set(['walkthrough', 'hints', 'room-facts', 'aesthetic', 'mold', 'artist', 'render']);
const REPO = path.resolve(__dirname, '..');

function die(msg) { console.error('stamp-pipeline: ' + msg); process.exit(1); }

const [, , game, step, ...rest] = process.argv;
if (!game || !step) die('usage: stamp-pipeline.cjs <game> <step> [--at <ISO>]');
if (!STEPS.has(step)) die(`unknown step "${step}" — expected one of: ${[...STEPS].join(', ')}`);

const atFlag = rest.indexOf('--at');
const at = atFlag >= 0 && rest[atFlag + 1] ? rest[atFlag + 1] : new Date().toISOString();

const gameDir = path.join(REPO, 'docs', 'games', 'images', game);
if (!fs.existsSync(gameDir)) die(`no game dir: docs/games/images/${game}`);

// App version — single source of truth in docs/js/config.js
let version = null;
try {
  const cfg = fs.readFileSync(path.join(REPO, 'docs', 'js', 'config.js'), 'utf8');
  const m = cfg.match(/version:\s*['"]([^'"]+)['"]/);
  version = m ? m[1] : null;
} catch { /* leave null */ }

// Git short commit (best-effort; null outside a checkout)
let commit = null;
try { commit = execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim() || null; } catch { /* null */ }

const file = path.join(gameDir, 'pipeline.json');
let data = {};
if (fs.existsSync(file)) {
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
}
data[step] = { at, version, commit };

// Stable key order: pipeline order first, then any extras.
const ORDER = ['walkthrough', 'hints', 'room-facts', 'aesthetic', 'mold', 'artist', 'render'];
const ordered = {};
for (const k of ORDER) if (data[k]) ordered[k] = data[k];
for (const k of Object.keys(data)) if (!(k in ordered)) ordered[k] = data[k];

fs.writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');
console.log(`stamped ${game}/${step}: ${JSON.stringify(data[step])}`);
