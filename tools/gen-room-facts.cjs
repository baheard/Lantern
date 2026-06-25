#!/usr/bin/env node
/*
 * Lantern room-facts builder (location-art pipeline, phase 1).
 *
 * Replays a game's VERIFIED walkthrough once through tools/play.cjs (--status), then
 * for every distinct location captures:
 *   - the canonical locationName (the SAME string the auto-mapper records, so images
 *     bind to map nodes by name),
 *   - the room's description prose (first time we enter it),
 *   - its real exits, derived from the walkthrough's own movement edges
 *     (from-location --<dir>--> to-location) — accurate game geometry, not prose-guessing.
 *
 * Emits a room-facts pack: a shared STYLE PREAMBLE (the agreed "low-res gothic illustration"
 * recipe) + one ready-to-generate prompt per room, with scene + exits baked in. The pack
 * feeds tools/gen-room-images.cjs.
 *
 * USAGE
 *   node tools/gen-room-facts.cjs anchorhead
 *   node tools/gen-room-facts.cjs anchorhead --seed 1 --style gothic
 *   node tools/gen-room-facts.cjs anchorhead --out docs/games/images/anchorhead/room-facts.json
 *
 * Writes <gamedir>/room-facts.json (machine, for gen-room-images.cjs) and room-facts.md (human).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

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
  // Strip PARSER CHROME and AUTO-LISTED TAKEABLES first — text the game prints inside room
  // prose that must never enter a STATIC backdrop image. The art is a fixed establishing view,
  // not a live state mirror, so removable/takeable items and parser noise are dropped (see the
  // persistence rule in .tome/art-direction-model.md). Three classes:
  //   "[Your score has just gone up...]"   bracketed status notes
  //   "You can also see <items> here."      the parser's listing of loose/takeable objects
  //                                         (the "(?!\bfrom\b)" guard spares a real "...from here" vista)
  //   "What now?" / "What do you want to do?"  the input prompt
  // Fixtures named in PROSE (e.g. "the statue is holding a jewelled dagger") are NOT touched.
  desc = desc
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\byou can (?:also )?see\b(?:(?!\bfrom\b)[^.?!])*?\bhere\b\s*[.?!]?/gi, ' ')
    .replace(/\bwhat (?:now|next|do you want to do)\b(?:\s+now)?\s*\??/gi, ' ');
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
  const headerRe = /^\[@ (.+?)(?:\s+\|\s+phase:.*)?\]$/;
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
    if (/^\[[^\]]*\]$/.test(t)) continue;   // standalone status note ("[…score…]") is not description
    out.push(t);
  }
  // If the only post-heading content was status-note chrome, treat as no description — this lets a
  // state-transition turn (heading printed but no real prose) fall through to extractTransition,
  // preserving the delta instead of latching onto a bracketed score note. (See Gap B.)
  return out.join('\n').replace(/\n{2,}/g, '\n\n').trim() || null;
}

// Pull the parser RESPONSE to a non-movement command (e.g. EXAMINE) out of a turn:
// everything between the echoed command and the trailing `>` prompt. The command echoes
// (Glk echo + CLI header) are dropped; chrome is left for visualCore to strip.
function extractResponse(turn) {
  const cmd = (turn.command || '').trim().toLowerCase();
  const out = [];
  for (const raw of turn.body) {
    const t = raw.trim();
    if (t === '>') break;                    // post-response prompt → end of this turn
    if (!t) { out.push(''); continue; }
    if (t.toLowerCase() === cmd) continue;   // drop the echoed command (appears up to twice)
    out.push(t);
  }
  return out.join('\n').replace(/\n{2,}/g, '\n\n').trim() || null;
}

// Narration printed when ARRIVING at a location WITHOUT a fresh room description — the
// state-change message that precedes the short room-name heading ("The sky fades to night as
// you climb.", "the dome is flooded with light.", "The black tide rises…"). Gap B adds this as
// the state DELTA on top of the base room's scene. Returns the prose between the echoed command
// and the room-name heading (or the trailing prompt, if the game printed no heading at all).
function extractTransition(turn) {
  const cmd = (turn.command || '').trim().toLowerCase();
  const name = (turn.location || '').toLowerCase();
  const out = [];
  for (const raw of turn.body) {
    const t = raw.trim();
    if (t === '>') break;                    // trailing prompt → end of turn
    if (t.toLowerCase() === name) break;     // reached the room-name heading → stop
    if (!t) { out.push(''); continue; }
    if (t.toLowerCase() === cmd) continue;   // drop the echoed command
    out.push(t);
  }
  return out.join('\n').replace(/\n{2,}/g, '\n\n').trim() || null;
}

// State-variant name analysis. A "Catwalk, South; Night" / "Lit Dome, Center" / "Cistern, Rising"
// is the SAME physical space as a base room under a different lighting/water state. roomStem()
// reduces a name to its state-independent stem (so a variant can be anchored to its base for an
// img2img relight); stateLabel() reads off the state word for the delta hint + render note.
const DOME_LIGHT = /^(Lit|Dark|Starry|Translucent|Unlit)\s+Dome\b/i;
const WATER_STATE = /,\s*(Rising|Risen|Flooded|Draining)\s*$/i;
function roomStem(name) {
  let s = name.replace(/\s*;\s*[^;]+$/, '');   // drop trailing "; Night" / "; Unearthly"
  s = s.replace(WATER_STATE, '');              // drop trailing ", Rising"
  s = s.replace(DOME_LIGHT, 'Dome');           // "Lit Dome, Center" → "Dome, Center"
  return s.trim();
}
function stateLabel(name) {
  const semi = name.match(/;\s*([^;]+)$/);   if (semi) return semi[1].trim();
  const water = name.match(WATER_STATE);     if (water) return water[1];
  const dome = name.match(DOME_LIGHT);       if (dome) return dome[1];
  return '';
}

// Command classifiers + object-head extraction, used to fold EXAMINE detail into a room's
// scene while keeping TAKEABLE objects out (the persistence rule: see .tome/art-direction-model.md).
const EXAMINE_RE = /^(?:examine|x|look at)\s+(.+)/i;
// Directional/prepositional LOOK (no object) — folds in volume/vista reveals a room's default
// description hides: LOOK UP exposing a two-story atrium + wraparound landing, LOOK DOWN naming
// what's below a balcony, etc. The direction word doubles as a synthetic object-head (never a
// TAKE head, so mergeExamines always keeps it). 'look around' is excluded — it's a plain re-LOOK.
const LOOK_DIR_RE = /^look\s+(up|down|behind|under|through|out|inside|in)\b/i;
const TAKE_RE = /^(?:get|take|grab|pick up)\s+(.+)/i;
const OBJ_STOP = new Set(['the','a','an','my','your','his','her','some','that','this']);
const EXAMINE_SKIP = new Set(['me','self','myself','around','room','it','them','here']);
// Visually load-bearing fixture classes whose APPEARANCE usually lives in an EXAMINE, not the
// room summary (a "portrait" in the prose, but the gentleman/fireplace/door only in `examine
// portrait`). Walkthroughs examine for PUZZLE reasons, not visual ones, so these are routinely
// un-probed. Used to (a) flag "named but never examined" fixtures per room (`unprobed`) so mold
// knows what to probe, and (b) build a cross-room landmark glossary so a fixture examined in one
// room (the Landing portrait) is available to any room that SEES it (the Lobby establishing shot).
const FIXTURE_LEXICON = ['painting', 'portrait', 'mural', 'fresco', 'tapestry', 'statue', 'sculpture',
  'bust', 'carving', 'engraving', 'inscription', 'relief', 'sign', 'poster', 'playbill', 'mirror',
  'window', 'fireplace', 'hearth', 'mantel', 'mantelpiece', 'altar', 'throne', 'chandelier', 'fountain',
  'tomb', 'sarcophagus', 'banner', 'crest', 'mosaic', 'frieze', 'pillar', 'column', 'clock', 'shrine', 'idol'];
const FIXTURE_SET = new Set(FIXTURE_LEXICON);
// Lexicon nouns present in a chunk of prose (singular or plural), as their canonical singular.
function fixtureHits(text) {
  const t = (text || '').toLowerCase();
  return FIXTURE_LEXICON.filter((w) => new RegExp('\\b' + w + 's?\\b').test(t));
}
// Reduce a verb's object phrase to its head noun (last significant word), cut at a preposition
// so "get earth crystal FROM dagger" → "crystal" and "examine statue" → "statue".
function objectHead(rest) {
  let s = (rest || '').toLowerCase().replace(/[.?!,]+$/g, '').trim();
  s = s.split(/\b(?:from|with|on|onto|in|into|under|behind|at|using|to)\b/)[0].trim();
  const w = s.split(/\s+/).filter((x) => x && !OBJ_STOP.has(x));
  return w[w.length - 1] || '';
}
const splitSentences = (s) => (s || '').split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter(Boolean);
const normSent = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
// Fold captured EXAMINE detail into the base scene: skip examines of objects the walkthrough
// takes (removable → not in a fixed backdrop), strip chrome via visualCore, dedup at the
// sentence level against what's already there, and cap the merged scene.
function mergeExamines(baseScene, examines, takenHeads) {
  if (!examines || !examines.length) return baseScene;
  const seen = new Set(splitSentences(baseScene).map(normSent));
  const adds = [];
  for (const e of examines) {
    if (!e.obj || takenHeads.has(e.obj)) continue;   // takeable → leave to the room text
    for (const s of splitSentences(visualCore(e.resp))) {
      const k = normSent(s);
      if (!k || seen.has(k)) continue;
      seen.add(k); adds.push(s);
    }
  }
  if (!adds.length) return baseScene;
  let scene = [baseScene, ...adds].join(' ').replace(/\s+/g, ' ').trim();
  if (scene.length > 1100) { const cut = scene.slice(0, 1100); scene = cut.slice(0, cut.lastIndexOf('. ') + 1) || cut; }
  return scene.trim();
}

// ---------------------------------------------------------------------------
// Branch-probe phase: find rooms the spine walkthrough never visits.
// ---------------------------------------------------------------------------

// Async wrapper for execFile. Always resolves (never rejects) — probe failures are non-fatal.
function execAsync(args, opts) {
  return new Promise((resolve) => {
    execFile('node', args, { encoding: 'utf8', ...opts }, (_err, stdout) => resolve(stdout || ''));
  });
}

// Parse the last location from a probe run's --status output.
// Returns { location, description } or null when the probe stayed at parentRoom or hit a known room.
// The probe output includes a scrollback re-emission before the actual result; scanning from the
// end finds the real result header, which is always AFTER the scrollback (appended by the probe cmd).
const PROBE_HEADER_RE = /^\[@ (.+?)(?:\s+\|.*?)?\]$/;
function parseProbeResult(output, parentRoom, knownNames) {
  const lines = output.split(/\r?\n/);
  let lastLoc = null, lastLocIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(PROBE_HEADER_RE);
    if (m) { lastLoc = m[1].trim(); lastLocIdx = i; break; }
  }
  if (!lastLoc || lastLoc === parentRoom || knownNames.has(lastLoc)) return null;
  const fakeTurn = { location: lastLoc, body: lines.slice(lastLocIdx + 1), command: '' };
  for (const l of fakeTurn.body) { if (l.trim()) { fakeTurn.command = l.trim(); break; } }
  return { location: lastLoc, description: extractDescription(fakeTurn) };
}

// Build incremental snapshots for each spine room's first-visit parseTurns index.
// Processes rooms in first-visit order, reusing each snapshot as the starting point for the
// next — total commands replayed ≈ walkthrough length (amortised), not O(rooms × walkthrough).
// Returns Map<roomName, snapshotFilePath>. All files are temp; caller cleans them up.
async function buildSnapshotsIncremental(game, seed, cmdsPath, firstVisitIdx) {
  const fileText = fs.readFileSync(cmdsPath, 'utf8');
  const cmdLines = fileText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length && !l.startsWith('#'));
  const tmpDir = os.tmpdir();
  const snapshots = new Map();
  let prevSnap = null;
  let prevIdx = 0;  // parseTurns index of prevSnap (0 = fresh game, 0 commands executed)

  // Sort by parseTurns index for incremental advancement.
  const sorted = [...firstVisitIdx.entries()].sort((a, b) => a[1] - b[1]);
  for (const [name, T] of sorted) {
    if (T === 0) continue;  // intro state has no commands to snapshot yet
    if (prevSnap && T === prevIdx) { snapshots.set(name, prevSnap); continue; }
    // parseTurns[T] = state after cmdLines[T-1]. Advancing from parseTurns[prevIdx] requires
    // executing cmdLines[prevIdx .. T-1] = cmdLines.slice(prevIdx, T).
    const segment = cmdLines.slice(prevIdx, T);
    if (!segment.length) { if (prevSnap) snapshots.set(name, prevSnap); continue; }
    const snapPath = path.join(tmpDir, `lantern-br-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    const args = [path.join(REPO, 'tools/play.cjs'), game, '--seed', String(seed), '--snapshot-out', snapPath];
    if (prevSnap) args.push('--snapshot-in', prevSnap);
    args.push('--cmds', segment.join(' ; '));
    await execAsync(args, { maxBuffer: 32 * 1024 * 1024, cwd: REPO, timeout: 60000 });
    if (fs.existsSync(snapPath)) {
      snapshots.set(name, snapPath); prevSnap = snapPath; prevIdx = T;
    } else {
      process.stderr.write(`[probe] snapshot write failed for "${name}" at T=${T}\n`);
    }
  }
  return snapshots;
}

// Probe all 12 directions from a snapshot. Returns found[] = { dir, location, description }.
// knownNames is checked (not mutated here) so callers de-dup before registering.
const PROBE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'in', 'out'];
async function probeFromSnap(game, seed, snapPath, knownNames, parentRoom) {
  const results = await Promise.all(PROBE_DIRS.map((dir) =>
    execAsync([
      path.join(REPO, 'tools/play.cjs'), game,
      '--snapshot-in', snapPath, '--cmds', dir,
      '--status', '--seed', String(seed),
    ], { maxBuffer: 16 * 1024 * 1024, cwd: REPO, timeout: 15000 })
    .then((out) => ({ dir, out }))
  ));
  const found = [];
  for (const { dir, out } of results) {
    const r = parseProbeResult(out, parentRoom, knownNames);
    if (r) found.push({ dir, location: r.location, description: r.description });
  }
  return found;
}

// Chronological BFS exploration — discover every room reachable from ANY point in the walkthrough,
// capturing each in the EARLIEST (most pre-puzzle) state we can reach it. Replaces the old
// game-start BFS + spine branch-probe with a single pass.
//
// Seeds a priority queue with:
//   • the game-start snapshot (parseTurns[0], timestamp 0), and
//   • every spine room's first-visit snapshot (timestamp = that room's firstVisitIdx).
// Each newly reached room gets a BFS-path snapshot (navigate one direction from a parent); it
// inherits the parent's timestamp. The queue is always processed in ASCENDING timestamp order, so
// when two paths can reach the same room, the earliest (most pristine) one wins. A room is
// explored-FROM exactly once, and captured from the lowest-timestamp snapshot that reaches it.
//
// Why both seed kinds: the game-start seed reaches only freely-accessible rooms; puzzle-locked
// areas open only after the walkthrough performs the unlocking steps, so each spine room deep in
// such an area contributes its own (already-unlocked) seed. Concrete win: the theatre aisles are
// captured chandelier-UP because the attic seed (taken on first entry, before the winch is turned)
// reaches them earlier than the post-winch spine seeds do.
//
// Limitation (room-level dedup, not edge-level): if a puzzle opens a NEW exit from an
// already-explored room, the room behind that exit is not re-discovered through it. Such rooms are
// still found if any OTHER reaching room contributes a later seed — they just land post-puzzle.
//
// Mutates `locs`: adds discovered rooms (bfsDiscovered) and refreshes spine descriptions
// (bfsRefreshed) to their earliest reachable state. Returns { discovered, refreshed } for the report.
async function exploreChronological(game, seed, cmdsPath, locs, seedIdxOverride) {
  const cmdsText = fs.readFileSync(cmdsPath, 'utf8');
  if (cmdsText.split(/\r?\n/).some((l) => l.trim().startsWith('@char'))) {
    process.stderr.write('[explore] @char lines — skipping chronological BFS.\n');
    return { discovered: [], refreshed: [] };
  }

  const tmpSnapPaths = new Set();
  const discovered = [];
  const refreshed = [];

  // Seed 1 — game-start snapshot (no commands → parseTurns[0]).
  const introSnap = path.join(os.tmpdir(), `lantern-ex0-${Date.now()}.json`);
  tmpSnapPaths.add(introSnap);
  const introOut = await execAsync([
    path.join(REPO, 'tools/play.cjs'), game,
    '--snapshot-out', introSnap, '--status', '--seed', String(seed),
  ], { maxBuffer: 32 * 1024 * 1024, cwd: REPO, timeout: 30000 });
  if (!fs.existsSync(introSnap)) {
    process.stderr.write('[explore] Intro snapshot failed — skipping.\n');
    return { discovered: [], refreshed: [] };
  }
  let startRoom = null;
  const introLines = introOut.split(/\r?\n/);
  for (let i = introLines.length - 1; i >= 0; i--) {
    const m = introLines[i].match(PROBE_HEADER_RE);
    if (m) { startRoom = m[1].trim(); break; }
  }
  if (!startRoom) {
    process.stderr.write('[explore] Cannot determine starting room — skipping.\n');
    return { discovered: [], refreshed: [] };
  }

  // bestTs source — always the real per-room first-visit (the walkthrough's own capture point),
  // independent of which seeding scheme we use for exploration below.
  const firstVisitIdx = new Map();
  for (const L of locs.values()) { if (L.firstVisitIdx !== null) firstVisitIdx.set(L.name, L.firstVisitIdx); }

  // Seed 2 — the SEED set for exploration. Default: every spine room's first-visit snapshot.
  // `seedIdxOverride` (e.g. aggressive action-boundary seeding) swaps in a smaller set to cut cost.
  const seedIdx = seedIdxOverride || firstVisitIdx;
  process.stderr.write(`\n[explore] Building ${seedIdx.size} seed snapshots${seedIdxOverride ? ' (aggressive action-boundary)' : ''}…\n`);
  let spineSnaps;
  try {
    spineSnaps = await buildSnapshotsIncremental(game, seed, cmdsPath, seedIdx);
    for (const p of spineSnaps.values()) tmpSnapPaths.add(p);
  } catch (e) {
    process.stderr.write(`[explore] Spine snapshot error: ${e.message} — game-start seed only.\n`);
    spineSnaps = new Map();
  }

  // bestTs[room] = lowest timestamp at which we have CAPTURED a description for that room (earliest
  // wins → most pristine prose). Spine rooms start at their own firstVisitIdx (the walkthrough
  // already captured them then). This is the DESCRIPTION gate, independent of exploration below.
  const bestTs = new Map();
  for (const [name, T] of firstVisitIdx) bestTs.set(name, T);

  // Exploration is keyed by `room@ts`, NOT by room. A room's reachable EXITS change over the course
  // of the game (a puzzle opens a door), so the same room must be re-explored at each distinct
  // timestamp that reaches it — exploring only once at the lowest ts would miss an exit that opens
  // later, and exploring only at the latest ts would capture post-puzzle prose. The hard case: the
  // theatre aisles are reachable in a MIDDLE window — after a blocking thug clears the way into the
  // (always-open) auditorium, but before the attic winch lowers the chandelier — found only by threading through the
  // connecting rooms at exactly that mid-walkthrough timestamp. `room@ts` dedup makes each
  // (room, game-state) pair explored once; ts values come only from seeds, so the set is finite.
  const explored = new Set();   // `${room}@${ts}` we have probed outward from
  const queued = new Set();     // `${room}@${ts}` already enqueued (avoid duplicate snapshot builds)
  const key = (room, ts) => `${room}@${ts}`;

  // Safety valve: bound total outward probes so a pathological game can't run away (~12 probes per
  // exploration). Logged loudly if hit.
  const MAX_EXPLORATIONS = 4000;
  let exploreCount = 0, cappedNote = false;

  const queue = [{ snapPath: introSnap, roomName: startRoom, ts: 0 }];
  queued.add(key(startRoom, 0));
  for (const [name, T] of seedIdx) {
    if (spineSnaps.has(name)) { queue.push({ snapPath: spineSnaps.get(name), roomName: name, ts: T }); queued.add(key(name, T)); }
  }
  process.stderr.write(`[explore] From "${startRoom}" + ${queue.length - 1} spine seeds — chronological BFS (room@ts)…\n`);

  const BATCH = 6;
  while (queue.length > 0) {
    queue.sort((a, b) => a.ts - b.ts);            // earliest game-state first
    const batch = [];
    while (batch.length < BATCH && queue.length) {
      const item = queue.shift();
      const k = key(item.roomName, item.ts);
      if (explored.has(k)) continue;              // already probed this room at this exact game-state
      explored.add(k);
      batch.push(item);
    }
    if (!batch.length) continue;
    if (exploreCount >= MAX_EXPLORATIONS) {
      if (!cappedNote) { process.stderr.write(`[explore] ⚠ hit MAX_EXPLORATIONS (${MAX_EXPLORATIONS}); stopping early — some late-opening rooms may be missed.\n`); cappedNote = true; }
      break;
    }
    exploreCount += batch.length;

    // Probe every batched snapshot's 12 directions. Empty filter → return all landings except the
    // parent room. Capture (description) and traversal (continue BFS) are decided independently.
    const raw = [];
    await Promise.all(batch.map(async ({ snapPath, roomName, ts }) => {
      const found = await probeFromSnap(game, seed, snapPath, new Set(), roomName);
      for (const d of found) raw.push({ ...d, fromRoom: roomName, fromSnap: snapPath, ts });
    }));

    // Traversal set: every landing we haven't yet explored OR queued at its ts → build a snapshot
    // and continue the BFS through it (even through already-known rooms — that is what lets a
    // mid-walkthrough path thread THROUGH explored rooms to reach a still-pristine room beyond).
    // Dedup to one candidate per `room@ts` within this batch.
    const byKey = new Map();
    for (const d of raw) {
      const k = key(d.location, d.ts);
      if (explored.has(k) || queued.has(k)) continue;
      if (!byKey.has(k)) byKey.set(k, d);
    }
    const toProcess = [...byKey.values()];
    for (const d of toProcess) queued.add(key(d.location, d.ts));

    // Build a BFS-path snapshot for each (inherits parent ts) so we can continue through it.
    await Promise.all(toProcess.map(async (d) => {
      const newSnap = path.join(os.tmpdir(), `lantern-ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
      tmpSnapPaths.add(newSnap);
      await execAsync([
        path.join(REPO, 'tools/play.cjs'), game,
        '--snapshot-in', d.fromSnap, '--cmds', d.dir,
        '--snapshot-out', newSnap, '--seed', String(seed),
      ], { maxBuffer: 32 * 1024 * 1024, cwd: REPO, timeout: 30000 });
      d.newSnap = fs.existsSync(newSnap) ? newSnap : null;
    }));

    for (const d of toProcess) {
      const { location, description, fromRoom, dir, ts, newSnap } = d;
      // DESCRIPTION capture — earliest ts wins, independent of whether we traverse onward.
      const prevBest = bestTs.has(location) ? bestTs.get(location) : Infinity;
      if (ts < prevBest) {
        bestTs.set(location, ts);
        const existing = locs.get(location);
        if (!existing) {
          // Brand-new room — the walkthrough never entered it.
          locs.set(location, {
            name: location, slug: slugify(location),
            description, transition: null, exits: new Map(), examines: [],
            firstVisitIdx: null,
            bfsDiscovered: true, discoveredFrom: fromRoom, discoveryDir: dir, discoveryTs: ts,
          });
          discovered.push(locs.get(location));
          process.stderr.write(`[explore] FOUND: "${location}" from "${fromRoom}" via ${dir} (turn ${ts})\n`);
        } else if (existing.firstVisitIdx !== null) {
          // Spine room reached earlier than the walkthrough did → refresh to its pristine state.
          if (description && existing.description && description !== existing.description) {
            existing.description = description;
            existing.bfsRefreshed = true;
            existing.bfsFrom = fromRoom;
            refreshed.push({ name: location, from: fromRoom, via: dir, ts });
            process.stderr.write(`[explore] REFRESHED: "${location}" (from "${fromRoom}" via ${dir}, turn ${ts})\n`);
          }
        } else if (description) {
          // Previously-discovered branch room reached even earlier → silently improve its capture.
          existing.description = description;
          existing.discoveryTs = ts;
        }
      }
      // TRAVERSAL — continue the BFS through this room at this ts (snapshot already built above).
      if (newSnap) queue.push({ snapPath: newSnap, roomName: location, ts });
    }
  }
  process.stderr.write(`[explore] ${exploreCount} room-states explored.\n`);

  for (const p of tmpSnapPaths) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  process.stderr.write(`[explore] Complete: ${discovered.length} discovered, ${refreshed.length} refreshed.\n`);
  return { discovered, refreshed };
}

// ---------------------------------------------------------------------------
// Exit-probe phase: capture each spine room's EXIT FORM + visibility — what an exit
// physically IS (door / stairs / climbable wall / transom window) and what shows through
// it. The room description routinely undersells this, and the exit GRAPH omits examine/
// puzzle-gated exits entirely (the alley's transom window + loose-board fence), so the
// model invents form (phantom stairs at the pit). For each spine room, from its first-entry
// snapshot (canonical, pre-mutation):
//   • examine each exit-lexicon noun in the prose      → form
//   • go through <noun>                                 → confirm hidden exits + reciprocal
//   • look up / look down                               → vertical form/visibility
//   • graph-exit reciprocals from known destinations    → cross-room form (free, no probe)
// Stored on L.exitFacts / L.lookFacts → folded into room-facts.json for the mold. Spine-only in
// v1 (rooms with a first-visit index); explored/state-variant rooms are a follow-up.
const EXIT_LEXICON = ['door', 'doorway', 'gate', 'window', 'archway', 'arch', 'passage', 'passageway',
  'corridor', 'hallway', 'staircase', 'stairway', 'stairs', 'steps', 'tunnel', 'trapdoor', 'hatch',
  'ladder', 'hole', 'opening', 'fence', 'slope', 'gap', 'grate', 'crack', 'crevice', 'threshold',
  'ramp', 'chute', 'shaft', 'aperture', 'mouth',
  // feature-nouns you descend into / pass through that carry exit form (the pit's "rough walls
  // make an easy climb"; a chasm/recess/alcove the room is built around)
  'pit', 'chasm', 'pool', 'alcove', 'recess', 'niche', 'crater', 'cavity'];
function exitHits(text) {
  const t = (text || '').toLowerCase();
  return [...new Set(EXIT_LEXICON.filter((w) => new RegExp('\\b' + w + 's?\\b').test(t)))];
}
// A probe response sentence carrying no form signal (parser-fail / generic dead-end) — dropped
// per-sentence so a useful clause survives alongside a dead one ("nothing special below you. You
// can hear something large moving" keeps the second sentence).
const DEAD_SENT_RE = /^(you can'?t see any such thing|you can'?t go that way|you (can )?see nothing special|i only understood|that'?s not (a verb|something)|nothing (happens|special)\b)/i;
function cleanResp(s) {
  return splitSentences(s || '').filter((x) => x && !DEAD_SENT_RE.test(x.trim())).join(' ').replace(/\s+/g, ' ').trim();
}
const capWords = (s, n) => (s && s.length > n ? (s.slice(0, s.lastIndexOf(' ', n)) || s.slice(0, n)) + '…' : (s || ''));
// Pull the final turn's location + response body out of a single-command probe run (--status).
// Mirrors parseProbeResult's end-scan past the restore scrollback; returns the response BODY too
// (for examine/look) and the location (so a traversal probe can detect a real move).
function probeTurn(output) {
  const lines = (output || '').split(/\r?\n/);
  let idx = -1, loc = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(PROBE_HEADER_RE);
    if (m) { loc = m[1].trim(); idx = i; break; }
  }
  if (idx < 0) return { loc: null, resp: '' };
  const after = lines.slice(idx + 1);
  let k = 0;
  while (k < after.length && !after[k].trim()) k++;  // skip blanks before the command echo
  k++;                                               // skip the game's command echo line
  const body = [];
  for (; k < after.length; k++) {
    const tr = after[k].trim();
    if (/^>/.test(tr) || /^(What now\?|What do you want|Would you like)/i.test(tr)) break;
    if (tr) body.push(tr);
  }
  return { loc, resp: body.join(' ').replace(/\s+/g, ' ').trim() };
}

async function exitProbe(game, seed, cmdsPath, locs) {
  const firstVisitIdx = new Map();
  for (const L of locs.values()) if (L.description && L.firstVisitIdx != null && L.firstVisitIdx > 0) firstVisitIdx.set(L.name, L.firstVisitIdx);
  if (!firstVisitIdx.size) return 0;
  process.stderr.write(`\n[exit] Probing exit form for ${firstVisitIdx.size} spine rooms…\n`);
  let snaps; const tmp = new Set();
  try {
    snaps = await buildSnapshotsIncremental(game, seed, cmdsPath, firstVisitIdx);
    for (const p of snaps.values()) tmp.add(p);
  } catch (e) { process.stderr.write('[exit] snapshot build failed — skipping exit-probe.\n'); return 0; }
  const PLAY = path.join(REPO, 'tools/play.cjs');
  const run = (snap, cmd) => execAsync([PLAY, game, '--seed', String(seed), '--snapshot-in', snap, '--status', '--cmds', cmd],
    { maxBuffer: 16 * 1024 * 1024, cwd: REPO, timeout: 15000 });
  const rooms = [...locs.values()].filter((L) => snaps.has(L.name));
  const BATCH = 5;
  let probed = 0;
  for (let b = 0; b < rooms.length; b += BATCH) {
    await Promise.all(rooms.slice(b, b + BATCH).map(async (L) => {
      const snap = snaps.get(L.name);
      const nouns = exitHits(L.description);
      // Fire every probe for this room first, THEN clean — so we can detect per-turn ambient flavor.
      const [upOut, downOut] = await Promise.all([run(snap, 'look up'), run(snap, 'look down')]);
      const upRaw = probeTurn(upOut).resp, downRaw = probeTurn(downOut).resp;
      const nounRaw = await Promise.all(nouns.map(async (noun) => {
        const [exOut, goOut] = await Promise.all([run(snap, 'examine ' + noun), run(snap, 'go through ' + noun)]);
        return { noun, ex: probeTurn(exOut), go: probeTurn(goOut) };
      }));
      // Per-turn ambient flavor (a beast's random roar, weather mutter) LEAKS across different
      // verbs — it shows up in look AND examine alike. Legit content that merely repeats across
      // synonym targets stays under ONE verb ("examine pit" and "examine pool" both saying "for a
      // closer look go down"). So strip a sentence only if it spans ≥2 distinct verbs (factor 3);
      // a moved traversal's response is the DESTINATION's text, excluded from this room's ambient.
      const tagged = [{ v: 'lu', r: upRaw }, { v: 'ld', r: downRaw },
        ...nounRaw.flatMap((n) => [{ v: 'ex', r: n.ex.resp }, { v: 'go', r: (n.go.loc && n.go.loc !== L.name) ? '' : n.go.resp }])];
      const verbsOf = new Map();
      for (const { v, r } of tagged) for (const s of new Set(splitSentences(r).map((x) => x.trim()).filter(Boolean))) {
        if (!verbsOf.has(s)) verbsOf.set(s, new Set());
        verbsOf.get(s).add(v);
      }
      const ambient = new Set([...verbsOf].filter(([, vs]) => vs.size >= 2).map(([s]) => s));
      const clean = (s) => splitSentences(s || '').map((x) => x.trim()).filter((x) => x && !ambient.has(x) && !DEAD_SENT_RE.test(x)).join(' ').replace(/\s+/g, ' ').trim();
      const look = {};
      const up = clean(upRaw), down = clean(downRaw);
      if (up) look.up = capWords(up, 200);
      if (down) look.down = capWords(down, 200);
      const facts = [];
      const seenTraverseDest = new Set();
      for (const { noun, ex, go } of nounRaw) {
        const f = { ref: noun, kind: 'noun' };
        const exResp = clean(ex.resp);
        if (exResp) f.examine = capWords(exResp, 220);
        if (go.loc && go.loc !== L.name) f.traverse = { verb: 'go through ' + noun, destination: go.loc, reciprocal: capWords(clean(go.resp), 220) };
        // Synonym nouns (pit/pool, door/doorway) often resolve to the SAME exit — keep only the
        // first noun that traverses to a given destination (lexicon order; it carries the fact).
        if (f.traverse) { if (seenTraverseDest.has(f.traverse.destination)) continue; seenTraverseDest.add(f.traverse.destination); }
        if (f.examine || f.traverse) facts.push(f);
      }
      // graph-exit reciprocals — no probe; the destination's own description IS the reciprocal view
      for (const [dir, dest] of L.exits.entries()) {
        const D = locs.get(dest);
        const recip = D && D.description ? splitSentences(visualCore(D.description))[0] : null;
        const f = { ref: dir, kind: 'dir', destination: dest };
        if (recip) f.reciprocal = capWords(recip, 200);
        facts.push(f);
      }
      if (facts.length) L.exitFacts = facts;
      if (Object.keys(look).length) L.lookFacts = look;
      probed++;
    }));
  }
  for (const p of tmp) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  process.stderr.write(`[exit] Exit facts captured for ${probed} rooms.\n`);
  return probed;
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const game = args._[0];
  if (!game) { console.error('Usage: node tools/gen-room-facts.cjs <game> [--seed N] [--style gothic]'); process.exit(2); }
  const seed = args.seed || 1;
  const styleKey = args.style || 'gothic';   // recorded in pack metadata; style text now lives in <game>/style.json

  const cmdsPath = findWalkthrough(game);
  console.error(`Replaying ${game} walkthrough (seed ${seed})…`);
  const transcript = replay(game, cmdsPath, seed);
  const turns = parseTurns(transcript);

  // Build per-location data: first-seen description + exit edges from movement.
  const locs = new Map(); // name -> { name, slug, description, exits: Map<dir,dest>, examines: [], firstVisitIdx }
  function ensure(name) {
    if (!locs.has(name)) locs.set(name, { name, slug: slugify(name), description: null, transition: null, exits: new Map(), examines: [], firstVisitIdx: null });
    return locs.get(name);
  }
  // Objects the walkthrough TAKES anywhere = removable; their EXAMINE detail is kept out of the
  // (fixed-establishing-view) scene. Collected across the whole replay, applied at compose time.
  const takenHeads = new Set();
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const L = ensure(t.location);
    if (L.firstVisitIdx === null) L.firstVisitIdx = i;   // record turn index of first visit
    if (!L.description) {
      const d = extractDescription(t);
      if (d) L.description = d;
      // No fresh description on this arrival → keep the state-change narration that preceded the
      // bare room-name heading (Gap B's delta). First substantive one wins.
      else if (!L.transition) { const tr = extractTransition(t); if (tr) L.transition = tr; }
    }
    const fullCmd = (t.command || '').trim();
    let mm;
    if ((mm = fullCmd.match(TAKE_RE))) { const h = objectHead(mm[1]); if (h) takenHeads.add(h); }
    if ((mm = fullCmd.match(EXAMINE_RE))) {
      const obj = objectHead(mm[1]);
      if (obj && !EXAMINE_SKIP.has(obj)) {
        const resp = extractResponse(t);
        if (resp) L.examines.push({ obj, resp });
      }
    } else if ((mm = fullCmd.match(LOOK_DIR_RE))) {
      const resp = extractResponse(t);
      if (resp) L.examines.push({ obj: 'look-' + mm[1].toLowerCase(), resp });
    }
    // Exit edge: t.command is the command that ARRIVED at t.location from the previous turn.
    // Record the exit on the SOURCE (previous) location so the direction matches the actual
    // movement command used, not a stale command from a prior blocked attempt.
    const cmd = fullCmd.toLowerCase().split(/\s+/)[0];
    if (i > 0 && MOVES.has(cmd)) {
      const prev = turns[i - 1];
      if (prev.location !== t.location) {
        const prevL = ensure(prev.location);
        const dir = DIR_LABEL[cmd] || cmd;
        if (!prevL.exits.has(dir)) prevL.exits.set(dir, t.location);
      }
    }
  }

  // Chronological exploration: discover every reachable room (spine, optional, puzzle-locked) and
  // capture each in the earliest pre-puzzle state we can reach it. Subsumes the old game-start BFS
  // and spine branch-probe in one priority-ordered pass.
  // --aggressive-seeds (experimental): instead of one seed per room (first-visit), seed only the
  // first room entered AFTER each state-changing action, treating ALL inventory verbs — including
  // get/take — as inert. Fewer distinct seed timestamps → less room@ts overlap → faster, but risks
  // dropping a seed in a pristine window whose ONLY opening action is an inventory verb. (Theatre is
  // safe: its gate is a `wait` for a thug to clear, not a `get`.) Measures the cost/coverage trade-off.
  let seedIdxOverride = null;
  if (args['aggressive-seeds']) {
    const INSPECT = new Set(['look', 'l', 'examine', 'x', 'search', 'read']);
    const IGNORE = new Set(['get', 'take', 'drop', 'put', 'wear', 'remove', 'show', 'give', 'pick', 'eat', 'drink']);
    seedIdxOverride = new Map();
    let armed = false;
    for (let i = 1; i < turns.length; i++) {
      const verb = (turns[i].command || '').toLowerCase().split(/\s+/)[0];
      if (MOVES.has(verb)) { if (armed) { if (!seedIdxOverride.has(turns[i].location)) seedIdxOverride.set(turns[i].location, i); armed = false; } }
      else if (INSPECT.has(verb)) { /* inert */ }
      else if (!IGNORE.has(verb)) armed = true;
    }
    console.error(`[aggressive] ${seedIdxOverride.size} action-boundary seeds (vs ${[...locs.values()].filter((L) => L.firstVisitIdx !== null).length} per-room)`);
  }

  // Chronological exploration: discover every reachable room (spine, optional, puzzle-locked) and
  // capture each in the earliest pre-puzzle state we can reach it. Subsumes the old game-start BFS
  // and spine branch-probe in one priority-ordered pass.
  const { discovered, refreshed } = args['no-probe']
    ? { discovered: [], refreshed: [] }
    : await exploreChronological(game, seed, cmdsPath, locs, seedIdxOverride);

  // Exit-form facts: probe each spine room's exits + look-dirs so the mold gets exit FORM from
  // facts instead of inventing it (post-THRESHOLDS). Reuses the same first-entry snapshots.
  // Independent of exploration (`--no-probe`) — gated by its own `--no-exit-probe`.
  if (!args['no-exit-probe']) await exitProbe(game, seed, cmdsPath, locs);

  // Compose prompts.
  const rooms = [];
  // Coverage report buckets:
  //   ok            description → scene, normal path
  //   discovered    room found by exploration the walkthrough never entered (optional/puzzle-locked)
  //   refreshed     spine room whose description was updated to an earlier (pre-puzzle) state
  //   recovered     no description, but scene rebuilt from captured examines/looks  [Gap A]
  //   stateRecov    state-variant: scene = base room's scene + transition delta       [Gap B]
  //   thin          scene built but suspiciously short — probably under-described
  //   needsHuman    a real node (had exits or examine attempts) we still couldn't voice
  //   phantom       nothing attached (no prose/exits/examines) — status-line flavor, safe skip
  const report = { ok: [], discovered: [], refreshed: [], recovered: [], stateRecov: [], thin: [], needsHuman: [], phantom: [] };
  const THIN_CHARS = 80;
  // Cross-room landmark glossary: every fixture-lexicon object that WAS examined anywhere, with
  // its examined detail + owning room. Lets mold render a shared landmark (a portrait seen from
  // the room below it) consistently, even though only the owning room examined it. Keyed by noun;
  // first substantive examine wins (a fixture is usually examined where it's most salient).
  const landmarks = {};
  for (const L of locs.values()) {
    for (const e of L.examines) {
      if (!e.obj || !FIXTURE_SET.has(e.obj) || landmarks[e.obj]) continue;
      const detail = visualCore(e.resp).trim();
      if (detail) landmarks[e.obj] = { room: L.name, detail };
    }
  }
  // Names some other location can move INTO — hard evidence a prose-less node is a real,
  // navigable place (a status-line phantom is never part of the movement graph). Keeps the
  // needsHuman/phantom split honest: a graph-referenced room is never written off as "expected".
  const exitTargets = new Set();
  for (const L of locs.values()) for (const dest of L.exits.values()) exitTargets.add(dest);
  // Stem index for Gap B: maps each state-independent stem → the prose-bearing rooms that share
  // it, so a prose-less state-variant ("Catwalk, South; Night") can borrow its base room's scene
  // ("Catwalk, South") as the geometry anchor. Filled in the main pass below; consumed after it.
  const stemIndex = new Map();
  const deferred = []; // prose-less rooms, processed by the Gap B pass once stemIndex is complete
  for (const L of locs.values()) {
    // exits stay as map/manifest metadata, but are NOT baked into the prompt: the
    // traversal graph records puzzle-movement (e.g. climbing a window = "northwest"),
    // which contradicts the prose's own compass directions. The description already
    // states real exits ("office lies to the east"), so we let the prose drive composition.
    const exits = [...L.exits.entries()].map(([dir, dest]) => `${dir} → ${dest}`);
    // Scene-only. Artist + game aesthetic are NOT baked here — they are composed
    // downstream (gen-room-images.cjs / review-server.cjs) from _artists/artists.json
    // (via selected-artist.json) + <game>/style.json. We keep a `scene` field and a
    // legacy "Scene:"-prefixed `prompt` so both old and new readers find the scene.
    // Base scene = first-entry description; then fold in EXAMINE detail the walkthrough
    // already revealed (e.g. the Witch's-Lair statue's four eye-sockets), minus takeables.
    //
    // Gap A: when the game never printed a description for this node (an in-place state
    // transition, or a sub-view the walkthrough only LOOKed at — e.g. the Starry Dome facings),
    // the visual prose still lives in the captured examines/LOOK-dir responses. Rebuild the
    // scene from those instead of discarding the whole room. Takeables stay excluded.
    let scene, sceneSource;
    if (L.description) {
      scene = mergeExamines(visualCore(L.description), L.examines, takenHeads);
      sceneSource = 'description';
    } else {
      scene = mergeExamines('', L.examines, takenHeads);
      sceneSource = 'examines';
    }
    if (!scene) { deferred.push({ L, exits }); continue; }  // → Gap B pass (needs stemIndex)
    const prompt = `Scene: ${scene}`;
    // Gap flag: fixture-lexicon nouns named in this room's prose that were never examined here.
    // mold reads these to decide what to probe (or to let render indistinct per the app rule).
    const examinedHeads = new Set(L.examines.map((e) => e.obj));
    const unprobed = fixtureHits(L.description).filter((w) => !examinedHeads.has(w));
    const room = { name: L.name, slug: L.slug, exits, description: L.description, scene, prompt };
    if (unprobed.length) room.unprobed = unprobed;
    if (L.exitFacts) room.exitFacts = L.exitFacts;   // exit FORM + reciprocals (exit-probe)
    if (L.lookFacts) room.lookFacts = L.lookFacts;    // look up/down visibility (exit-probe)
    if (sceneSource === 'examines') room.recoveredFrom = 'examines'; // Gap A provenance for mold/review
    rooms.push(room);
    // Index this prose-bearing room under its stem so Gap B variants can anchor to it.
    const stem = roomStem(L.name);
    if (!stemIndex.has(stem)) stemIndex.set(stem, []);
    stemIndex.get(stem).push({ name: L.name, slug: L.slug, scene, source: sceneSource, isBase: stem === L.name });
    // Classify for the coverage report.
    const preview = scene.length > 140 ? scene.slice(0, 140) + '…' : scene;
    if (L.bfsDiscovered) report.discovered.push({ name: L.name, from: L.discoveredFrom, via: L.discoveryDir, turn: L.discoveryTs, preview });
    else {
      if (L.bfsRefreshed) report.refreshed.push({ name: L.name, from: L.bfsFrom, preview });
      if (sceneSource === 'examines') report.recovered.push({ name: L.name, examineCount: L.examines.length, preview });
      else if (scene.length < THIN_CHARS) report.thin.push({ name: L.name, preview });
      else report.ok.push({ name: L.name });
    }
  }

  // Gap B pass: prose-less state-variants. Each is the same physical space as a base room under a
  // different lighting/water state — anchor it to that base's scene (geometry) and append the
  // transition narration (the delta). Tag anchorRoom + stateLabel so render can do an img2img
  // relight off the committed base image (the validated shared-volume approach) rather than a
  // blind text-to-image that would drift. A variant with no base but a strong self-contained
  // transition (e.g. "Cistern, Rising" — the flooding scene) builds from the delta alone.
  for (const { L, exits } of deferred) {
    const stem = roomStem(L.name);
    const label = stateLabel(L.name);
    const delta = L.transition ? visualCore(L.transition) : '';
    // Resolve a base: prefer a true base (its own stem), then a description-sourced sibling.
    let anchor = null;
    if (stem !== L.name) {
      const cands = (stemIndex.get(stem) || []).filter((c) => c.name !== L.name);
      cands.sort((a, b) => (Number(b.isBase) - Number(a.isBase)) || (Number(b.source === 'description') - Number(a.source === 'description')));
      anchor = cands[0] || null;
    }
    let scene = '', sceneSource = '';
    if (anchor && anchor.scene) { scene = delta ? `${anchor.scene} ${delta}` : anchor.scene; sceneSource = 'state-delta'; }
    else if (delta && delta.length >= THIN_CHARS) { scene = delta; sceneSource = 'transition'; }
    // A transition-only scene with no anchor and no inbound navigation is a status-line flash
    // (e.g. Theatre's Latin-curse text that getCurrentLocation() briefly reports on Boiler Room
    // entry). The fixed exit tracker now gives these locations exits, but nothing ever LEADS to
    // them, so they are not real rooms. Treat them as phantoms before adding to the pack.
    if (sceneSource === 'transition' && !anchor && !exitTargets.has(L.name)) {
      report.phantom.push({ name: L.name, reason: 'transition-only scene, no inbound navigation — status-line flash phantom' });
      continue;
    }
    if (!scene) {
      // Still nothing usable. Phantom = nothing attached (status-line flavor); else needsHuman.
      const isPhantom = !exits.length && !L.examines.length && !exitTargets.has(L.name);
      (isPhantom ? report.phantom : report.needsHuman).push({
        name: L.name, exits, examineCount: L.examines.length,
        reason: isPhantom ? 'no description, exits, examines, or transition delta'
          : (stem !== L.name ? `state-variant but no base room "${stem}" in pack and no usable transition delta`
                             : 'real node but no usable prose could be built'),
      });
      continue;
    }
    const room = { name: L.name, slug: L.slug, exits, description: null, scene, prompt: `Scene: ${scene}`, recoveredFrom: sceneSource };
    if (anchor) {
      room.anchorRoom = anchor.slug;
      // The delta alone (not the whole base scene) is the lean edit instruction the renderer
      // sends when relighting off the anchor image — keeps the img2img edit surgical.
      if (delta) room.stateDelta = delta;
    }
    if (label) room.stateLabel = label;
    rooms.push(room);
    const preview = scene.length > 140 ? scene.slice(0, 140) + '…' : scene;
    report.stateRecov.push({ name: L.name, anchor: anchor ? anchor.name : null, label, preview });
  }

  const gameDir = path.join(REPO, 'docs/games/images', game);
  fs.mkdirSync(gameDir, { recursive: true });
  const pack = { game, seed, style: styleKey, generatedFrom: path.relative(REPO, cmdsPath), landmarks, rooms };
  const jsonOut = args.out || path.join(gameDir, 'room-facts.json');
  fs.writeFileSync(jsonOut, JSON.stringify(pack, null, 2));

  // Human-readable companion.
  const md = [`# ${game} — room-facts pack`, '',
    `Style: **${styleKey}** · ${rooms.length} locations · from \`${pack.generatedFrom}\` (seed ${seed})`, '',
    '---', ''];
  for (const r of rooms) {
    md.push(`## ${r.name}  \`${r.slug}\``);
    if (r.exits.length) md.push(`**Exits:** ${r.exits.join(' · ')}`);
    if (r.exitFacts) md.push(`**Exit form:** ${r.exitFacts.map((f) => f.kind === 'noun'
      ? (f.ref + (f.traverse ? ' →' + f.traverse.destination : '') + (f.examine ? ': ' + f.examine.slice(0, 60) : ''))
      : (f.ref + '→' + f.destination)).join('  ·  ')}`);
    if (r.lookFacts) md.push(`**Look:** ${[r.lookFacts.up && 'up: ' + r.lookFacts.up.slice(0, 60), r.lookFacts.down && 'down: ' + r.lookFacts.down.slice(0, 60)].filter(Boolean).join('  ·  ')}`);
    md.push('', '```', r.prompt, '```', '');
  }
  fs.writeFileSync(path.join(gameDir, 'room-facts.md'), md.join('\n'));

  console.error(`\nWrote ${rooms.length} room prompts:`);
  console.error(`  ${path.relative(REPO, jsonOut)}`);
  console.error(`  ${path.relative(REPO, path.join(gameDir, 'room-facts.md'))}`);

  // --- Coverage report (loud + classified; replaces the old silent skipped[] line) ---
  const c = report;
  const pad = (n) => String(n).padStart(3);
  const discoveredPackCount = c.discovered.length;
  const spinePackCount = rooms.length - discoveredPackCount;
  console.error(`\n=== Coverage: ${locs.size} locations seen · ${spinePackCount} spine + ${discoveredPackCount} explored → ${rooms.length} in pack ===`);
  console.error(`  ok          ${pad(c.ok.length)}  description → scene`);
  console.error(`  discovered  ${pad(c.discovered.length)}  rooms found by exploration (walkthrough never entered)`);
  console.error(`  refreshed   ${pad(c.refreshed.length)}  spine rooms recaptured in earlier (pre-puzzle) state`);
  console.error(`  recovered   ${pad(c.recovered.length)}  Gap A: no description; scene rebuilt from examines/looks`);
  console.error(`  state-recov ${pad(c.stateRecov.length)}  Gap B: state-variant; base scene + transition delta (img2img anchor)`);
  console.error(`  thin        ${pad(c.thin.length)}  scene < ${THIN_CHARS} chars — likely under-described`);
  console.error(`  needs-human ${pad(c.needsHuman.length)}  real node, no usable prose — NOT in pack`);
  console.error(`  phantom     ${pad(c.phantom.length)}  no prose/exits/examines — status-line flavor, skipped`);

  if (c.discovered.length) {
    console.error(`\nDISCOVERED — rooms the walkthrough never entered, captured at earliest reachable turn:`);
    for (const r of c.discovered) console.error(`  • ${r.name}  (from "${r.from}" via ${r.via}, turn ${r.turn})\n      ${r.preview}`);
  }
  if (c.refreshed.length) {
    console.error(`\nREFRESHED — spine rooms recaptured pre-puzzle (walkthrough first saw them post-puzzle):`);
    for (const r of c.refreshed) console.error(`  • ${r.name}  (from "${r.from}")\n      ${r.preview}`);
  }
  if (c.recovered.length) {
    console.error(`\nRECOVERED — now in pack via Gap A; verify each rebuilt scene reads right:`);
    for (const r of c.recovered) console.error(`  • ${r.name}  (from ${r.examineCount} look/examine)\n      ${r.preview}`);
  }
  if (c.stateRecov.length) {
    console.error(`\nSTATE-RECOVERED — now in pack via Gap B; render as img2img relight off the anchor:`);
    for (const r of c.stateRecov) console.error(`  • ${r.name}  [${r.label || '?'} → anchor: ${r.anchor || 'none (delta-only)'}]\n      ${r.preview}`);
  }
  if (c.thin.length) {
    console.error(`\nTHIN — in pack but sparse; consider probing before render:`);
    for (const r of c.thin) console.error(`  • ${r.name}\n      ${r.preview}`);
  }
  if (c.needsHuman.length) {
    console.error(`\n⚠ NEEDS-HUMAN — real location, NO usable prose, NOT in pack:`);
    for (const r of c.needsHuman) console.error(`  • ${r.name}  [exits: ${r.exits.join(', ') || 'none'} · examines: ${r.examineCount}] — ${r.reason}`);
  }
  if (c.phantom.length) {
    console.error(`\nPHANTOM — skipped (expected; status-line flavor):`);
    for (const r of c.phantom) console.error(`  • ${r.name}`);
  }

  console.error(`\nNext: node tools/gen-room-images.cjs ${game}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
