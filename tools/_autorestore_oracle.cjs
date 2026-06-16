#!/usr/bin/env node
/*
 * Phase 0 regression oracle for the save/restore migration
 * (reference/autorestore-migration-plan.md).
 *
 * The engine autorestore path we are migrating TO is exactly tools/play.cjs's
 * `--snapshot-in` (zvm `do_autorestore`: restore_allstate + restart + restore_file +
 * read_data). So a snapshot round-trip that is bit-exact with a no-restore baseline IS
 * proof that the engine mechanism preserves VM state across a reload — the core claim of
 * the migration. This is the green/red gate that must pass before AND after every later
 * phase (it exercises only play.cjs + zvm.js, so it has zero app-code risk).
 *
 * For each matrix game, at several snapshot points:
 *   A (baseline): full replay of PREFIX + TAIL in one run.
 *   B (restore):  replay PREFIX -> --snapshot-out; then --snapshot-in + TAIL only.
 * The TAIL turns' transcript text, per-turn --status location lines, and the
 * [SUMMARY] (location/score/status/last) of B must match A EXACTLY.
 *
 * Generalizes tools/_snapshot_validate.cjs (single game/tail) across the plan's matrix:
 * Z3 line-intro (wishbringer), Z5 char-intro (theatre), Z8 char-intro (anchorhead),
 * Z5 line-intro (9:05), Z3 press-any-key-intro (seastalker).
 *
 * Usage:
 *   node tools/_autorestore_oracle.cjs              # full matrix
 *   node tools/_autorestore_oracle.cjs wishbringer  # one game (substring match)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PLAY = path.join(REPO, 'tools', 'play.cjs');
const WALK = path.join(REPO, 'docs/games/walkthroughs');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-autorestore-'));

const TAIL_LEN = 4; // commands replayed after each snapshot point

// Generic non-mutating, deterministic commands for games without a walkthrough file.
// Round-trip correctness doesn't need a *winning* path — even bounced commands
// ("you can't go that way") are deterministic and exercise the restore seam fully.
const GENERIC = [
  'look', 'examine me', 'inventory', 'wait', 'look', 'wait',
  'inventory', 'examine me', 'look', 'wait', 'wait', 'look', 'inventory', 'wait',
];

// key: dismiss char-mode "press any key" prompts (default space in play.cjs).
const MATRIX = [
  { game: 'wishbringer', file: 'wishbringer.cmds.txt', points: [8, 16, 24], note: 'Z3 line-intro' },
  { game: 'theatre',     file: 'theatre.cmds.txt',     points: [6, 12, 18], note: 'Z5 char-intro' },
  { game: 'anchorhead',  file: 'anchorhead.cmds.txt',  points: [6, 12, 18], note: 'Z8 char-intro' },
  { game: '905',         cmds: GENERIC,                 points: [3, 6, 9],   note: 'Z5 line-intro (generic cmds)' },
  { game: 'seastalker',  cmds: GENERIC,                 points: [3, 6, 9],   note: 'Z3 press-any-key intro (generic cmds)' },
  { game: 'amfv',        cmds: GENERIC,                 points: [3, 6, 9],   note: 'Z4 multi-MORE char-intro (generic cmds)' },
];

function loadCmds(entry) {
  if (entry.cmds) return entry.cmds.slice();
  const p = path.join(WALK, entry.file);
  return fs.readFileSync(p, 'utf8')
    .split(/\r?\n/).map(l => l.replace(/^﻿/, '').trim())
    .filter(l => l && !l.startsWith('#'));
}

function run(game, args) {
  try {
    return execFileSync('node', [PLAY, game, ...args],
      { encoding: 'utf8', cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    return (e.stdout || '') + '\n[STDERR]\n' + (e.stderr || '');
  }
}

// Split a --status transcript into per-command {cmd, text} turn blocks keyed on "> cmd".
function turns(transcript) {
  const lines = transcript.split('\n').filter(l => !l.startsWith('[SUMMARY]'));
  const out = [];
  let cur = null;
  for (const ln of lines) {
    const m = /^> (.*)$/.exec(ln);
    if (m) { if (cur) out.push(cur); cur = { cmd: m[1], body: [] }; continue; }
    if (cur) cur.body.push(ln);
  }
  if (cur) out.push(cur);
  for (const t of out) {
    while (t.body.length && t.body[t.body.length - 1].trim() === '') t.body.pop();
    t.text = t.body.join('\n');
  }
  return out;
}

function summaryLine(t) { const m = /^\[SUMMARY\].*$/m.exec(t); return m ? m[0] : null; }
function stripTurns(s) { return s ? s.replace(/turns=\d+\s*/, '') : s; }

const filter = process.argv[2];
let totalPass = 0, totalFail = 0;

for (const entry of MATRIX) {
  if (filter && !entry.game.includes(filter)) continue;

  const all = loadCmds(entry);
  // --xorshift forces the VM's internal RNG on so @random is deterministic AND
  // snapshot-carried; without it, Math.random flavor text (e.g. Anchorhead's Michael
  // follow-text) diverges across processes and masks the real state-equivalence signal.
  const keyArgs = ['--xorshift', '1', ...(entry.key ? ['--key', entry.key] : [])];
  console.log(`\n=== ${entry.game} (${entry.note}) — ${all.length} cmds available ===`);

  for (const point of entry.points) {
    if (point + TAIL_LEN > all.length) {
      console.log(`  [skip] point ${point}: not enough cmds (need ${point + TAIL_LEN}, have ${all.length})`);
      continue;
    }
    const prefix = all.slice(0, point);
    const tail = all.slice(point, point + TAIL_LEN);

    const prefixFile = path.join(WORK, `${entry.game}_${point}_prefix.txt`);
    const tailFile = path.join(WORK, `${entry.game}_${point}_tail.txt`);
    const fullFile = path.join(WORK, `${entry.game}_${point}_full.txt`);
    const snapFile = path.join(WORK, `${entry.game}_${point}_snap.json`);
    fs.writeFileSync(prefixFile, prefix.join('\n'));
    fs.writeFileSync(tailFile, tail.join('\n'));
    fs.writeFileSync(fullFile, prefix.concat(tail).join('\n'));

    // A: full replay baseline.
    const aFull = run(entry.game, [...keyArgs, '--status', '--summary', '--file', fullFile]);
    // B: snapshot the prefix, then restore + replay the tail only.
    run(entry.game, [...keyArgs, '--snapshot-out', snapFile, '--file', prefixFile, '--quiet']);
    if (!fs.existsSync(snapFile)) {
      console.log(`  [XX ] point ${point}: snapshot file not written`);
      totalFail++; continue;
    }
    const bRestore = run(entry.game, [...keyArgs, '--snapshot-in', snapFile, '--status', '--summary', '--file', tailFile]);

    const aTail = turns(aFull).filter(t => tail.includes(t.cmd)).slice(-TAIL_LEN);
    const bTail = turns(bRestore).filter(t => tail.includes(t.cmd));

    let ok = true;
    const diffs = [];
    for (let i = 0; i < tail.length; i++) {
      const a = aTail[i], b = bTail[i];
      if (!a || !b || a.cmd !== b.cmd || a.text !== b.text) {
        ok = false;
        diffs.push({ cmd: tail[i], a: a ? a.text : '(missing)', b: b ? b.text : '(missing)' });
      }
    }
    const aSum = summaryLine(aFull), bSum = summaryLine(bRestore);
    const sumOk = stripTurns(aSum) === stripTurns(bSum);
    if (!sumOk) ok = false;

    if (ok) {
      console.log(`  [OK ] point ${point}: tail ${JSON.stringify(tail)} round-trips bit-exact`);
      totalPass++;
    } else {
      console.log(`  [XX ] point ${point}: tail ${JSON.stringify(tail)} DIVERGED`);
      for (const d of diffs) {
        console.log(`        cmd "${d.cmd}":`);
        console.log(`        --- A ---\n${d.a.split('\n').map(l => '          ' + l).join('\n')}`);
        console.log(`        --- B ---\n${d.b.split('\n').map(l => '          ' + l).join('\n')}`);
      }
      if (!sumOk) {
        console.log(`        [SUMMARY] diverged:\n          A: ${aSum}\n          B: ${bSum}`);
      }
      totalFail++;
    }
  }
}

console.log(`\n=== ${totalFail === 0 ? 'PASS' : 'FAIL'} — ${totalPass} ok, ${totalFail} failed ===`);
process.exitCode = totalFail === 0 ? 0 : 1;
