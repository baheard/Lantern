#!/usr/bin/env node
/*
 * _check_walkthrough_map.cjs — lint the cmds.txt <-> notes.md anchor mapping for a walkthrough.
 *
 *   node tools/_check_walkthrough_map.cjs <game> [--strict]
 *
 * The standardized mapping (see .claude/skills/trace-walkthrough/SKILL.md Step 3/5):
 *   - docs/games/walkthroughs/<game>.cmds.txt marks each probe-worthy puzzle/act with a marker
 *     line of the form:   ## [slug] Human-readable label
 *     `slug` is lowercase-kebab ([a-z0-9-]+), unique in the file, and is the CANONICAL link.
 *     Because the slug is bracketed, `--snapshot-at "## [slug]"` resolves unambiguously
 *     (the closing `]` makes one slug never a prefix of another).
 *   - docs/games/walkthroughs/<game>.notes.md carries a matching heading for each slug:
 *     any heading line (## / ### / ####) whose text contains the same `[slug]` token.
 *     notes.md MAY also have heading sections with NO `[slug]` (e.g. the randomized-values
 *     section, score-ceiling, OPEN PUZZLE meta) — those are ignored, not errored.
 *
 * Checks (errors -> exit 1; warnings -> exit 0 unless --strict):
 *   E1  duplicate slug within a file
 *   E2  cmds slug with no matching notes slug (the probe path would dead-end)
 *   E3  notes slug with no matching cmds slug (a note pointing at commands that don't exist)
 *   W1  unmarked span: > SPAN_WARN consecutive real command lines with no preceding marker
 *       (the "back-half-only marking" failure the skill warns about)
 *   W2  cmds file has zero markers (trivial game? or un-migrated)
 *
 * Exit: 0 = OK (possibly with warnings), 1 = errors (or warnings under --strict), 2 = bad usage.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SPAN_WARN = 30; // consecutive command lines with no marker before we warn

function die(msg, code) { process.stderr.write(msg + '\n'); process.exit(code); }

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const game = args.find(a => !a.startsWith('--'));
if (!game) die('usage: node tools/_check_walkthrough_map.cjs <game> [--strict]', 2);

const dir = path.join('docs', 'games', 'walkthroughs');
const cmdsPath = path.join(dir, game + '.cmds.txt');
const notesPath = path.join(dir, game + '.notes.md');
if (!fs.existsSync(cmdsPath)) die('[map] no cmds file: ' + cmdsPath, 2);

// A slug anchor must be the FIRST token right after the leading # / ## marker — both in cmds
// (`## [slug] label`) and in notes (`### [slug] label`). Requiring it at the start means a slug
// merely MENTIONED in prose inside another heading (e.g. "Lantern divergence (affects [d3-church])")
// is correctly ignored, not mistaken for that section's own anchor.
const CMDS_MARKER_RE = /^##\s+\[([a-z0-9][a-z0-9-]*)\]/;       // cmds marker:  ## [slug] ...
const NOTES_HEADING_RE = /^#{1,6}\s+\[([a-z0-9][a-z0-9-]*)\]/; // notes heading: ### [slug] ...

const errors = [];
const warnings = [];

// ---- parse cmds.txt ----
const cmdsLines = fs.readFileSync(cmdsPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const cmdsSlugs = new Map();   // slug -> {line, label}
let markerCount = 0;
// Collect every maximal run of real command lines (including the LEADING run before the first
// marker — that's the "back-half-only marking" case). Emit W1 only if the file has markers at all
// (a marker-less file gets W2 instead, not W1 spam).
const spans = [];              // {start, count}
let curStart = 0, curCount = 0;
const flushSpan = () => { if (curCount) spans.push({ start: curStart, count: curCount }); curCount = 0; };
cmdsLines.forEach((raw, i) => {
  const ln = i + 1;
  const line = raw.trim();
  const m = line.match(CMDS_MARKER_RE);
  if (m) {
    markerCount++; flushSpan();
    const slug = m[1];
    const label = line.replace(/^##\s+/, '');
    if (cmdsSlugs.has(slug)) errors.push(`E1 cmds: duplicate slug [${slug}] (lines ${cmdsSlugs.get(slug).line} and ${ln})`);
    else cmdsSlugs.set(slug, { line: ln, label });
    return;
  }
  if (line === '' || line.startsWith('#')) return; // blank or non-marker comment
  if (curCount === 0) curStart = ln;
  curCount++;
});
flushSpan();
if (markerCount === 0) {
  warnings.push('W2 cmds: no "## [slug]" markers found (trivial game, or not yet migrated to the anchor standard)');
} else {
  for (const s of spans) {
    if (s.count > SPAN_WARN) {
      const where = s.start < cmdsSlugs.values().next().value.line ? ' (LEADING span — before the first marker)' : '';
      warnings.push(`W1 cmds: unmarked span of ${s.count} command lines starting at line ${s.start}${where} (add a ## [slug] marker)`);
    }
  }
}

// ---- parse notes.md ----
const notesSlugs = new Map(); // slug -> {line, heading}
if (fs.existsSync(notesPath)) {
  const notesLines = fs.readFileSync(notesPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  notesLines.forEach((raw, i) => {
    const ln = i + 1;
    const h = raw.match(NOTES_HEADING_RE);
    if (!h) return; // not a heading, or a heading without a leading [slug] — meta section, ignored
    const slug = h[1];
    if (notesSlugs.has(slug)) errors.push(`E1 notes: duplicate slug [${slug}] (lines ${notesSlugs.get(slug).line} and ${ln})`);
    else notesSlugs.set(slug, { line: ln, heading: h[1].trim() });
  });
} else {
  warnings.push('note: no notes.md (' + notesPath + ') — pairing checks skipped');
}

// ---- cross-check ----
if (fs.existsSync(notesPath)) {
  for (const [slug, info] of cmdsSlugs) {
    if (!notesSlugs.has(slug)) errors.push(`E2 cmds [${slug}] (line ${info.line}) has no matching notes heading — probe path dead-ends`);
  }
  for (const [slug, info] of notesSlugs) {
    if (!cmdsSlugs.has(slug)) errors.push(`E3 notes [${slug}] (line ${info.line}) has no matching cmds marker — note points at non-existent commands`);
  }
}

// ---- report ----
const pairs = [...cmdsSlugs.keys()].filter(s => notesSlugs.has(s)).length;
console.log(`[map] ${game}: ${markerCount} cmds marker(s), ${notesSlugs.size} notes section(s) w/ slug, ${pairs} paired`);
for (const w of warnings) console.log('  WARN ' + w);
for (const e of errors) console.log('  ERR  ' + e);

if (errors.length) { console.log(`[map] FAIL — ${errors.length} error(s)`); process.exit(1); }
if (warnings.length && strict) { console.log(`[map] FAIL (--strict) — ${warnings.length} warning(s)`); process.exit(1); }
console.log('[map] OK');
process.exit(0);
