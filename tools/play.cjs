#!/usr/bin/env node
/*
 * IFTalk headless ZVM driver — stateless replay CLI.
 *
 * Loads our EXACT interpreter stack (docs/lib/zvm.js + docs/lib/glkapi.js) with a
 * minimal headless GlkOte shim in place of the browser's VoxGlk display layer, then
 * replays a list of line commands and prints the resulting transcript. This lets us
 * verify walkthroughs and probe game mechanics without driving the real app through a
 * browser/web-agent — cheap, deterministic, reproducible.
 *
 * WHY IT MATCHES THE APP
 * ----------------------
 * - ZVM + GlkApi are pure JS and are the same files the browser loads (loaded here in a
 *   `vm` sandbox exactly as a <script> tag would, so they attach window.ZVM/Glk/Dialog).
 *   Only the display end (GlkOte) differs, and the GlkOte protocol (init/update + an
 *   `accept` callback) is identical to what VoxGlk implements — so parser behavior and
 *   output text are what a player sees.
 * - Location names are derived with the app's OWN `getCurrentLocation()` from
 *   auto-mapper.js (the same function VoxGlk feeds), so the names this prints match the
 *   `locationName` strings the auto-mapper records — which is exactly the vocabulary the
 *   hints `locations` arrays must use (see .tome/hints-system-design.md).
 *
 * WHY REPLAY-FROM-START (not save/restore)
 * ----------------------------------------
 * Replaying every command from a fresh VM sidesteps the entire bootstrap-restore bug
 * class (char-bootstrap, bufaddr mismatch — see .tome/bootstrap-restore-flow.md). To
 * branch-probe a mechanic ("does X work without doing Y first?") just change the command
 * tail; no SAVE/RESTORE needed. The fresh char-mode intro (e.g. Anchorhead's "Press R to
 * restore / any other key") is dismissed by sending a key — no restore plumbing involved.
 *
 * USAGE
 * -----
 *   node tools/play.cjs <game.z8|gameName> [options] -- "cmd1" "cmd2" ...
 *   node tools/play.cjs anchorhead -- n n "examine desk"
 *   node tools/play.cjs anchorhead --file commands.txt   (one cmd per line; #=comment)
 *   echo "n\nn\nx desk" | node tools/play.cjs anchorhead --stdin
 *
 * OPTIONS
 *   --file <path>  read commands from a file (one per line, blank/`#` lines skipped)
 *   --stdin        read commands from stdin (one per line)
 *   --quiet        only print the final turn's output
 *   --status       print the app-derived location name before each turn
 *   --raw          don't trim/collapse blank lines
 *   --key <c>      key to send to dismiss char-mode prompts (default: space)
 *   --strict       halt on first command that produces a no-op/failed parser response
 *                  (e.g. "You can't go that way.", "You can't see any such thing.");
 *                  exits with code 1 and prints the offending turn number to stderr
 *
 * NOTE ON RANDOMNESS: command sequencing is deterministic, but in-game @random is seeded
 * from the clock, so randomized puzzles (Anchorhead: safe combo, flute holes, mirror
 * measurement) differ per run — read the game's own clue each run, don't hardcode.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vmMod = require('vm');
const { pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Load the real interpreter stack in a sandbox, exactly as the browser does.
// The lib files are UMD/global scripts that attach window.ZVM / window.Glk /
// window.Dialog. We give them a `window` and read those back. (require() of the
// UMD bundle yields an empty object, so we eval in a vm context instead.)
// ---------------------------------------------------------------------------
function makeInterpreterContext() {
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  const memStore = {};
  sandbox.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null),
    setItem: (k, v) => { memStore[k] = String(v); },
    removeItem: (k) => { delete memStore[k]; },
    clear: () => { for (const k of Object.keys(memStore)) delete memStore[k]; },
  };
  sandbox.CustomEvent = function (t, o) { this.type = t; if (o && o.detail) this.detail = o.detail; };
  sandbox.dispatchEvent = () => {};
  sandbox.addEventListener = () => {};
  const ctx = vmMod.createContext(sandbox);
  for (const f of ['docs/lib/zvm.js', 'docs/lib/glkapi.js', 'docs/lib/dialog-stub.js']) {
    vmMod.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Text extraction from GlkOte content runs (mirrors voxglk-renderer.js run forms)
// ---------------------------------------------------------------------------
function runsToText(runs) {
  if (!Array.isArray(runs)) return '';
  // Flat form: ["style","text","style","text", ...]
  if (runs.length >= 2 && typeof runs[0] === 'string') {
    let out = '';
    for (let i = 1; i < runs.length; i += 2) out += runs[i] || '';
    return out;
  }
  // Object/array run forms
  let out = '';
  for (const run of runs) {
    if (typeof run === 'string') out += run;
    else if (Array.isArray(run) && run.length >= 2) out += run[1] || '';
    else if (run && typeof run.text === 'string') out += run.text;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Headless GlkOte shim — implements the same contract VoxGlk does (init/update +
// accept callback). Derives location via the app's own getCurrentLocation().
// ---------------------------------------------------------------------------
function createHeadlessGlkote(getCurrentLocation, getStatusContext) {
  const METRICS = {
    width: 1000, height: 600,
    gridcharwidth: 1, gridcharheight: 1, gridmarginx: 0, gridmarginy: 0,
    buffercharwidth: 1, buffercharheight: 1, buffermarginx: 0, buffermarginy: 0,
    outspacingx: 0, outspacingy: 0, inspacingx: 0, inspacingy: 0,
    charwidth: 1, charheight: 1,
  };

  const state = {
    accept: null,
    gen: 0,
    inputType: null,     // 'line' | 'char' | null
    inputWindowId: null,
    windows: new Map(),  // id -> window def {id, type}
    buffer: '',          // accumulated buffer-window text since last drain
    statusRaw: '',       // latest grid/status text (lines joined with \n)
    location: null,      // app-derived location name (mirrors auto-mapper)
    phase: '',           // app-derived status context, e.g. "day one, evening"
    exited: false,
  };

  function ingest(content) {
    const win = state.windows.get(content.id);
    const isGrid = win && win.type === 'grid';
    if (isGrid) {
      if (Array.isArray(content.lines)) {
        const lines = content.lines.map((l) => runsToText(l.content));
        const joined = lines.join('\n').replace(/[ \t]+$/gm, '');
        if (joined.trim()) state.statusRaw = joined;
      }
      return;
    }
    // Buffer window (main scrolling text)
    if (Array.isArray(content.text)) {
      for (const block of content.text) {
        if (!block.content || !Array.isArray(block.content)) { state.buffer += '\n'; continue; }
        state.buffer += runsToText(block.content) + '\n';
      }
    }
  }

  const glkote = {
    init(options) {
      state.accept = options.accept;
      state.accept({ type: 'init', gen: 0, metrics: METRICS, support: ['timer'] });
    },
    update(arg) {
      if (arg.gen !== undefined) state.gen = arg.gen;
      if (arg.windows) for (const w of arg.windows) state.windows.set(w.id, w);
      if (arg.content) for (const c of arg.content) ingest(c);
      if (arg.input && arg.input.length) {
        const types = arg.input.map((i) => i.type);
        state.inputType = types.includes('char') ? 'char' : 'line';
        state.inputWindowId = arg.input[0].id;
      } else {
        state.inputType = null;
      }
      // Location: mirror checkLocationChange — only update outside char mode
      // (char-mode screens are menus/PAK/intro, never real locations).
      if (state.inputType !== 'char' && state.statusRaw) {
        const loc = getCurrentLocation(state.statusRaw);
        if (loc && loc.name) state.location = loc.name;
        state.phase = getStatusContext(state.statusRaw);
      }
      if (arg.specialinput && state.accept) {
        // Save/restore file prompt — cancel (replay doesn't use in-game save).
        state.accept({ type: 'specialresponse', gen: state.gen, response: 'fileref_prompt', value: null });
      }
      if (arg.type === 'exit' || arg.disable) state.exited = true;
    },
    getlibrary() { return null; },
    error(msg) { process.stderr.write('[glk error] ' + msg + '\n'); state.exited = true; },
    warning() {},
    log() {},
    save_allstate() { return {}; },
    restore_state() {},
    exit() { state.exited = true; },
  };

  return { glkote, state };
}

// ---------------------------------------------------------------------------
// Replay engine
// ---------------------------------------------------------------------------
function play(storyPath, commands, opts, getCurrentLocation, getStatusContext) {
  const ctx = makeInterpreterContext();
  const storyData = fs.readFileSync(storyPath);
  ctx.__storyArr = Array.from(storyData); // plain array crosses realm cleanly
  const { glkote, state } = createHeadlessGlkote(getCurrentLocation, getStatusContext);
  ctx.__glkote = glkote;

  // prepare + init inside the sandbox realm so all typed arrays / DataViews are same-realm
  vmMod.runInContext(
    '(function(){' +
    '  var bytes = new Uint8Array(__storyArr);' +
    '  var vm = new ZVM();' +
    '  var options = { vm: vm, Glk: Glk, GlkOte: __glkote, Dialog: Dialog, do_vm_autosave: false };' +
    '  vm.prepare(bytes.buffer, options);' +
    '  Glk.init(options);' +
    '})();',
    ctx, { filename: 'harness-boot' }
  );

  const turns = [];
  const key = opts.key || ' ';

  function drain() { const t = state.buffer; state.buffer = ''; return t; }

  function send(value, type) {
    const ev = { type, gen: state.gen, window: state.inputWindowId, value };
    if (type === 'line') ev.terminator = 'enter';
    state.accept(ev);
  }

  // Dismiss char-mode prompts (title screens, [MORE], "press a key", death screens),
  // collecting their text. Returns the text seen.
  function advanceCharPrompts(maxKeys = 100) {
    let seen = '', n = 0;
    while (!state.exited && state.inputType === 'char' && n < maxKeys) {
      send(key, 'char');
      seen += drain();
      n++;
    }
    return seen;
  }

  // Intro / first prompt before any command
  let intro = drain();
  intro += advanceCharPrompts();
  turns.push({ cmd: null, location: state.location, phase: state.phase, statusRaw: state.statusRaw, text: intro });

  for (const cmd of commands) {
    if (state.exited) { turns.push({ cmd, location: state.location, phase: state.phase, statusRaw: state.statusRaw, text: '[game has ended]' }); break; }
    if (state.inputType !== 'line') advanceCharPrompts();
    if (state.exited) { turns.push({ cmd, location: state.location, phase: state.phase, statusRaw: state.statusRaw, text: '[game has ended]' }); break; }
    if (state.inputType !== 'line') {
      turns.push({ cmd, location: state.location, phase: state.phase, statusRaw: state.statusRaw, text: '[no line-input prompt available]' });
      continue;
    }
    send(cmd, 'line');
    let text = drain();
    text += advanceCharPrompts();
    const turn = { cmd, location: state.location, phase: state.phase, statusRaw: state.statusRaw, text };
    if (opts.strict) {
      const fail = checkStrictFail(text);
      if (fail) { turn.strictFail = fail; turns.push(turn); break; }
    }
    turns.push(turn);
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Strict-mode failure detection — "command had no effect" parser responses
// ---------------------------------------------------------------------------
const STRICT_PATTERNS = [
  /you can't go that way/i,
  /you can't see any such thing/i,
  /i don't understand/i,
  /i only understood you as far as/i,
  /that's not a verb i recognize/i,
  /you don't need to refer to that in this game/i,
  /nothing happens/i,
];

function checkStrictFail(text) {
  for (const line of text.split('\n')) {
    for (const p of STRICT_PATTERNS) {
      if (p.test(line)) return line.trim();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------
function tidy(text, raw) {
  if (raw) return text;
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

function render(turns, opts) {
  const out = [];
  const list = opts.quiet ? turns.slice(-1) : turns;
  for (const t of list) {
    if (t.cmd !== null) out.push('\n> ' + t.cmd);
    if (opts.statusraw && t.statusRaw) out.push('[status: ' + t.statusRaw.replace(/\n/g, ' / ').replace(/\s+/g, ' ').trim() + ']');
    if (opts.status && t.location) out.push('[@ ' + t.location + (t.phase ? '  |  phase: ' + t.phase : '') + ']');
    const body = tidy(t.text, opts.raw);
    if (body) out.push(body);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function resolveStory(arg) {
  if (fs.existsSync(arg)) return arg;
  const inGames = path.join(REPO, 'docs/games', arg);
  if (arg.includes('.') && fs.existsSync(inGames)) return inGames;
  // Try common Z-machine story file extensions in preference order
  for (const ext of ['.z5', '.z8', '.z3', '.z4', '.z6', '.z7', '.zblorb', '.blorb']) {
    const guess = path.join(REPO, 'docs/games', arg + ext);
    if (fs.existsSync(guess)) return guess;
  }
  throw new Error('Game file not found: ' + arg + ' (tried docs/games/' + arg + '.z{3-8}/.zblorb)');
}

function parseArgs(argv) {
  const opts = { quiet: false, status: false, statusraw: false, raw: false, file: null, stdin: false, key: ' ', strict: false };
  const commands = [];
  let game = null, afterDashDash = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (afterDashDash) { commands.push(a); continue; }
    if (a === '--') { afterDashDash = true; continue; }
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--status') opts.status = true;
    else if (a === '--statusraw') opts.statusraw = true;
    else if (a === '--raw') opts.raw = true;
    else if (a === '--stdin') opts.stdin = true;
    else if (a === '--strict') opts.strict = true;
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--key') opts.key = argv[++i];
    else if (a.startsWith('--')) { /* ignore unknown */ }
    else if (game === null) game = a;
    else commands.push(a);
  }
  return { game, commands, opts };
}

function loadCommandsFromText(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length && !l.startsWith('#'));
}

async function main() {
  const { game, commands, opts } = parseArgs(process.argv.slice(2));
  if (!game) {
    process.stderr.write('Usage: node tools/play.cjs <game> [--file f|--stdin|--quiet|--status|--raw|--key c] -- "cmd" ...\n');
    process.exit(2);
  }
  let cmds = commands.slice();
  if (opts.file) cmds = cmds.concat(loadCommandsFromText(fs.readFileSync(opts.file, 'utf8')));
  if (opts.stdin) cmds = cmds.concat(loadCommandsFromText(fs.readFileSync(0, 'utf8')));

  // Reuse the app's own location extraction (ESM) so names match the auto-mapper exactly.
  // auto-mapper.js registers a top-level window listener; give it a no-op window.
  if (typeof global.window === 'undefined') {
    global.window = { addEventListener() {}, dispatchEvent() {} };
    global.CustomEvent = function (t, o) { this.type = t; if (o && o.detail) this.detail = o.detail; };
  }
  const amUrl = pathToFileURL(path.join(REPO, 'docs/js/features/auto-mapper.js')).href;
  const { getCurrentLocation, getStatusContext } = await import(amUrl);

  const storyPath = resolveStory(game);
  const turns = play(storyPath, cmds, opts, getCurrentLocation, getStatusContext);
  process.stdout.write(render(turns, opts) + '\n');
  if (opts.strict) {
    const failIdx = turns.findIndex(t => t.strictFail);
    if (failIdx !== -1) {
      const ft = turns[failIdx];
      process.stderr.write('\n[STRICT FAIL] Turn ' + failIdx + ': "' + ft.cmd + '"\n  → ' + ft.strictFail + '\n');
      process.exit(1);
    }
  }
}

main().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
