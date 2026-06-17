#!/usr/bin/env node
/*
 * jump-to.cjs — replay a game walkthrough to a named marker and inject the
 * resulting VM state into the web app's localStorage as a loadable custom save.
 *
 * USAGE
 *   node tools/jump-to.cjs <game>                   # list available markers
 *   node tools/jump-to.cjs <game> <marker>           # replay + write snapshot
 *   node tools/jump-to.cjs <game> <marker> --inject  # also inject via fetch snippet auto-run
 *
 * EXAMPLES
 *   node tools/jump-to.cjs anchorhead
 *   node tools/jump-to.cjs anchorhead d1-michael
 *
 * OUTPUT
 *   Writes docs/assets/<game>-<marker>.snapshot.json (the raw VM state).
 *   Prints a one-liner you can paste into the browser console to inject the save.
 *   The save appears in Saves panel as "jump-<marker>" for the given game.
 *
 * HOW IT WORKS
 *   Uses play.cjs --snapshot-at to capture VM state mid-walkthrough at the
 *   ## [marker] line. Wraps that snapshot in the app's engine-format save
 *   structure (same format as performSave() in save-manager.js) and writes it
 *   to docs/assets/ so the running dev server can serve it. The browser-side
 *   injection fetches that file and writes it directly to localStorage.
 *
 *   The game signature (first 30 bytes of the .z8/.z5 file, hex) is computed
 *   locally — no need to spin up the ZVM just for that.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT           = path.resolve(__dirname, '..');
const GAMES_DIR      = path.join(ROOT, 'docs', 'games');
const WALKTHROUGHS   = path.join(GAMES_DIR, 'walkthroughs');
const ASSETS_DIR     = path.join(ROOT, 'docs', 'assets');
const PLAY           = path.join(__dirname, 'play.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage() {
  console.error('Usage: node tools/jump-to.cjs <game> [marker] [--name <slot>] [--at <N|substr>]');
  console.error('       node tools/jump-to.cjs anchorhead d1-michael');
  console.error('       node tools/jump-to.cjs anchorhead d2-journal --name go-to   # /go-to skill');
  console.error('       node tools/jump-to.cjs anchorhead --at 40 --name go-to       # by turn count');
  process.exit(1);
}

function findGameFile(name) {
  for (const ext of ['.z8', '.z5', '.z3', '.z6', '.z7', '.zblorb']) {
    const p = path.join(GAMES_DIR, name + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// First 30 bytes of the story file, hex — matches ZVM's this.signature computation.
function computeSignature(filePath) {
  const buf = fs.readFileSync(filePath);
  let sig = '';
  for (let i = 0; i < 0x1E; i++) {
    sig += (buf[i] < 0x10 ? '0' : '') + buf[i].toString(16);
  }
  return sig;
}

function parseWalkthrough(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const markers = [];
  let cmdCount = 0;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^## \[([^\]]+)\](.*)/);
    if (m) {
      markers.push({ slug: m[1], label: m[2].trim(), cmdsBefore: cmdCount });
    } else if (line && !line.startsWith('#')) {
      cmdCount++;
    }
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// --name <saveName> overrides the default `jump-<marker>` save slot. The /go-to skill
// passes --name go-to so it writes ONE fixed, always-overwritten slot. Reserved save
// names (go-to) are exempt from the app's custom-save limit — see meta-command-handlers.js.
const rawArgs = process.argv.slice(2).filter(a => a !== '--inject');
let customName = null;
let atTarget = null; // --at <N|substr|"## marker"> : snapshot at an arbitrary point, not a slug
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--name') { customName = rawArgs[++i]; continue; }
  if (rawArgs[i] === '--at')   { atTarget   = rawArgs[++i]; continue; }
  args.push(rawArgs[i]);
}
const [gameName, markerSlug] = args;

if (!gameName) usage();

const gameFile = findGameFile(gameName);
if (!gameFile) {
  console.error(`ERROR: no game file found for "${gameName}" in docs/games/`);
  process.exit(1);
}

const walkthroughPath = path.join(WALKTHROUGHS, gameName + '.cmds.txt');
if (!fs.existsSync(walkthroughPath)) {
  console.error(`ERROR: no walkthrough found at ${walkthroughPath}`);
  process.exit(1);
}

const markers = parseWalkthrough(walkthroughPath);

if (!markerSlug && !atTarget) {
  console.log(`Markers for ${gameName}:`);
  const w = markers.reduce((n, m) => Math.max(n, m.slug.length), 0);
  for (const m of markers) {
    console.log(`  [${m.slug.padEnd(w)}]  ${m.label}`);
  }
  process.exit(0);
}

// Resolve the snapshot target. A marker slug and --at are mutually exclusive ways to
// name the point: a slug anchors to a `## [slug]` line (locations/scenarios authored in
// the walkthrough); --at <N|substr|"## marker"> hits an arbitrary point (a turn count, a
// prose substring) for targets that have no marker. Both feed play.cjs --snapshot-at.
let snapshotAtArg, target;
if (atTarget) {
  snapshotAtArg = atTarget;
  // cmdsBefore (appMoveCount) is only known for a numeric turn target; else leave 0.
  const cmdsBefore = /^\d+$/.test(atTarget.trim()) ? Number(atTarget.trim()) : 0;
  target = { label: atTarget, cmdsBefore };
} else {
  const marker = markers.find(m => m.slug === markerSlug);
  if (!marker) {
    console.error(`ERROR: marker [${markerSlug}] not found in ${gameName} walkthrough.`);
    console.error('Run without a marker to list available ones, or use --at <N|substr>.');
    process.exit(1);
  }
  snapshotAtArg = `## [${markerSlug}]`;
  target = marker;
}

const signature    = computeSignature(gameFile);
const saveName     = customName || `jump-${markerSlug}`;
// Asset filename tracks the save name so a fixed slot (go-to) reuses ONE file
// rather than littering docs/assets with one per target.
const snapshotFile = `${gameName}-${saveName}.snapshot.json`;
const snapshotPath = path.join(ASSETS_DIR, snapshotFile);
const saveKey      = `lantern_customsave_${gameName}_${saveName}`;

fs.mkdirSync(ASSETS_DIR, { recursive: true });

console.log(`\nReplaying ${gameName} → ${target.label}`);
console.log('(this may take a few seconds for long walkthroughs)\n');

const result = spawnSync(process.execPath, [
  PLAY,
  gameName,
  '--seed', '1',
  '--file', walkthroughPath,
  '--snapshot-at', snapshotAtArg,
  '--snapshot-out', snapshotPath,
  '--quiet',
], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  console.error(`\nERROR: play.cjs exited with code ${result.status}`);
  process.exit(1);
}

if (!fs.existsSync(snapshotPath)) {
  console.error('\nERROR: snapshot file was not written — marker may not have been reached.');
  console.error('Check that the marker slug is spelled correctly in the walkthrough file.');
  process.exit(1);
}

const snapSize = fs.statSync(snapshotPath).size;
console.log(`Snapshot written: docs/assets/${snapshotFile} (${Math.round(snapSize / 1024)}KB)`);

// Leave displayHTML empty — do NOT bake a synthetic status bar. The engine restore
// (do_autorestore at boot) repaints the REAL status bar from VM state; performRestore
// only overwrites the DOM status bar when displayHTML.statusBar is non-empty, so an
// empty string lets the genuine "Room, day two" status show immediately. A baked label
// (the marker text + "walkthrough jump") otherwise lingers until the next turn.

// The injection one-liner: fetches the snapshot from the running dev server and
// writes the full app-format save entry into localStorage.
const injectSnippet =
  `fetch('/assets/${snapshotFile}').then(r=>r.json()).then(s=>{` +
  `localStorage.setItem(` +
    `'${saveKey}',` +
    `JSON.stringify({` +
      `timestamp:new Date().toISOString(),` +
      `gameName:'${gameName}',` +
      `gameSignature:'${signature}',` +
      `appMoveCount:${target.cmdsBefore},` +
      `saveFormat:'engine',` +
      `engineSnapshot:JSON.stringify(s),` +
      `engineSnapshotCompressed:false,` +
      `displayHTML:{` +
        `statusBar:'',` +
        `upperWindow:'',` +
        `lowerWindow:''` +
      `},` +
      `mapData:'',mapDataCompressed:false,hintsMilestone:null` +
    `})` +
  `);window.__jumpInjectDone='${saveName}';` +
  `}).catch(e=>console.error('jump-to inject failed:',e))`;

console.log(`\nSave key: ${saveKey}`);
console.log('\nPaste this in the browser console to inject the save:');
console.log('\n' + injectSnippet + '\n');
console.log(`Then open Saves panel and load "${saveName}".`);
