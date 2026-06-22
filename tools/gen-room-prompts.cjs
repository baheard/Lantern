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
    .replace(/\bwhat (?:now|next|do you want to do)\b\s*\??/gi, ' ');
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const game = args._[0];
  if (!game) { console.error('Usage: node tools/gen-room-prompts.cjs <game> [--seed N] [--style gothic]'); process.exit(2); }
  const seed = args.seed || 1;
  const styleKey = args.style || 'gothic';   // recorded in pack metadata; style text now lives in <game>/style.json

  const cmdsPath = findWalkthrough(game);
  console.error(`Replaying ${game} walkthrough (seed ${seed})…`);
  const transcript = replay(game, cmdsPath, seed);
  const turns = parseTurns(transcript);

  // Build per-location data: first-seen description + exit edges from movement.
  const locs = new Map(); // name -> { name, slug, description, exits: Map<dir,dest>, examines: [] }
  function ensure(name) {
    if (!locs.has(name)) locs.set(name, { name, slug: slugify(name), description: null, transition: null, exits: new Map(), examines: [] });
    return locs.get(name);
  }
  // Objects the walkthrough TAKES anywhere = removable; their EXAMINE detail is kept out of the
  // (fixed-establishing-view) scene. Collected across the whole replay, applied at compose time.
  const takenHeads = new Set();
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const L = ensure(t.location);
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

  // Compose prompts.
  const rooms = [];
  // Coverage report: every location seen gets a classified verdict, so a real room never
  // disappears silently (the old behavior — a bare skipped[]→stderr line — hid the kind of
  // regression that dropped 13 real Dreamhold rooms). Buckets:
  //   ok            description → scene, normal path
  //   recovered     no description, but scene rebuilt from captured examines/looks  [Gap A]
  //   stateRecov    state-variant: scene = base room's scene + transition delta       [Gap B]
  //   thin          scene built but suspiciously short — probably under-described
  //   needsHuman    a real node (had exits or examine attempts) we still couldn't voice
  //   phantom       nothing attached (no prose/exits/examines) — status-line flavor, safe skip
  const report = { ok: [], recovered: [], stateRecov: [], thin: [], needsHuman: [], phantom: [] };
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
    if (sceneSource === 'examines') room.recoveredFrom = 'examines'; // Gap A provenance for mold/review
    rooms.push(room);
    // Index this prose-bearing room under its stem so Gap B variants can anchor to it.
    const stem = roomStem(L.name);
    if (!stemIndex.has(stem)) stemIndex.set(stem, []);
    stemIndex.get(stem).push({ name: L.name, slug: L.slug, scene, source: sceneSource, isBase: stem === L.name });
    // Classify for the coverage report (recovered wins over thin — it's the more useful flag).
    const preview = scene.length > 140 ? scene.slice(0, 140) + '…' : scene;
    if (sceneSource === 'examines') report.recovered.push({ name: L.name, examineCount: L.examines.length, preview });
    else if (scene.length < THIN_CHARS) report.thin.push({ name: L.name, preview });
    else report.ok.push({ name: L.name });
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

  // --- Coverage report (loud + classified; replaces the old silent skipped[] line) ---
  const c = report;
  const pad = (n) => String(n).padStart(3);
  console.error(`\n=== Coverage: ${locs.size} location(s) seen → ${rooms.length} in pack ===`);
  console.error(`  ok          ${pad(c.ok.length)}  description → scene`);
  console.error(`  recovered   ${pad(c.recovered.length)}  Gap A: no description; scene rebuilt from examines/looks`);
  console.error(`  state-recov ${pad(c.stateRecov.length)}  Gap B: state-variant; base scene + transition delta (img2img anchor)`);
  console.error(`  thin        ${pad(c.thin.length)}  scene < ${THIN_CHARS} chars — likely under-described`);
  console.error(`  needs-human ${pad(c.needsHuman.length)}  real node, no usable prose — NOT in pack`);
  console.error(`  phantom     ${pad(c.phantom.length)}  no prose/exits/examines — status-line flavor, skipped`);

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

main();
