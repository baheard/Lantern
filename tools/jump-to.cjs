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
  console.error('Usage: node tools/jump-to.cjs <game> [marker]');
  console.error('       node tools/jump-to.cjs anchorhead d1-michael');
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

const args = process.argv.slice(2).filter(a => a !== '--inject');
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

if (!markerSlug) {
  console.log(`Markers for ${gameName}:`);
  const w = markers.reduce((n, m) => Math.max(n, m.slug.length), 0);
  for (const m of markers) {
    console.log(`  [${m.slug.padEnd(w)}]  ${m.label}`);
  }
  process.exit(0);
}

const marker = markers.find(m => m.slug === markerSlug);
if (!marker) {
  console.error(`ERROR: marker [${markerSlug}] not found in ${gameName} walkthrough.`);
  console.error('Run without a marker to list available ones.');
  process.exit(1);
}

const signature    = computeSignature(gameFile);
const snapshotFile = `${gameName}-${markerSlug}.snapshot.json`;
const snapshotPath = path.join(ASSETS_DIR, snapshotFile);
const saveKey      = `lantern_customsave_${gameName}_jump-${markerSlug}`;
const saveName     = `jump-${markerSlug}`;

fs.mkdirSync(ASSETS_DIR, { recursive: true });

console.log(`\nReplaying ${gameName} → [${markerSlug}]: ${marker.label}`);
console.log('(this may take a few seconds for long walkthroughs)\n');

const result = spawnSync(process.execPath, [
  PLAY,
  gameName,
  '--seed', '1',
  '--file', walkthroughPath,
  '--snapshot-at', `## [${markerSlug}]`,
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

// Build a short status bar label from the marker label (trim long descriptions)
const shortLabel = marker.label.split('(')[0].split(',')[0].trim().slice(0, 50);
const statusBarHTML =
  `<div class="status-bar-line">` +
  `<span class="status-left">${shortLabel}</span>` +
  `<span class="chunk-delimiter">, </span>` +
  `<span class="status-right">walkthrough jump</span>` +
  `</div>`;

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
      `appMoveCount:${marker.cmdsBefore},` +
      `saveFormat:'engine',` +
      `engineSnapshot:JSON.stringify(s),` +
      `engineSnapshotCompressed:false,` +
      `displayHTML:{` +
        `statusBar:${JSON.stringify(statusBarHTML)},` +
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
