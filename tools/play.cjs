#!/usr/bin/env node
/*
 * Lantern headless ZVM driver — stateless replay CLI.
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
 * WHY REPLAY-FROM-START (default) — and whole-VM snapshots when you need them
 * ----------------------------------------------------------------------------
 * By default, replaying every command from a fresh VM sidesteps the entire bootstrap-restore
 * bug class (char-bootstrap, bufaddr mismatch — see .tome/bootstrap-restore-flow.md). To
 * branch-probe a mechanic ("does X work without doing Y first?") just change the command tail.
 * The fresh char-mode intro (e.g. Anchorhead's "Press R to restore / any other key") is
 * dismissed by sending a key — no restore plumbing involved.
 *
 * For iteratively extending a LONG walkthrough (where re-replaying the whole verified prefix
 * each time is O(n²)), use --snapshot-out/--snapshot-in (below). That path uses zvm's full-state
 * do_autorestore — NOT the in-game SAVE/RESTORE save-file path, which IS still cancelled (the
 * fileref prompt is answered null) precisely because it re-enters the bootstrap-restore bug
 * class. Snapshot fidelity is bit-exact-validated; see .tome/headless-replay-harness.md.
 *
 * USAGE
 * -----
 *   node tools/play.cjs <game.z8|gameName> [options] -- "cmd1" "cmd2" ...
 *   node tools/play.cjs anchorhead -- n n "examine desk"
 *   node tools/play.cjs anchorhead --file commands.txt   (one cmd per line; #=comment)
 *   echo "n\nn\nx desk" | node tools/play.cjs anchorhead --stdin
 *
 * OPTIONS
 *   --file <path>  read commands from a file (one per line, blank/`#` lines skipped).
 *                  A line `@char <key> [count]` sends raw CHARACTER input instead of a line —
 *                  for driving interactive char readers/menus (e.g. `read clippings` then
 *                  `@char return 40` / `@char q`). <key> = a char or Glk name (return/space/escape).
 *   --stdin        read commands from stdin (one per line)
 *   --cmds "a ; b" one quoted arg split on ';' into commands — avoids shell array/quoting pain
 *                  for ad-hoc tails (e.g. with --snapshot-in). Appended after --file/--stdin.
 *   --quiet        only print the final turn's output
 *   --status       print the app-derived location name before each turn
 *   --raw          don't trim/collapse blank lines
 *   --key <c>      key to send to dismiss char-mode prompts (default: space)
 *   --strict       halt on first command that produces a no-op/failed parser response
 *                  (e.g. "You can't go that way.", "You can't see any such thing.");
 *                  exits with code 1 and prints the offending turn number to stderr
 *   --stop-on-death halt as soon as the game prints an end-of-story / death screen
 *                  (the "RESTART, RESTORE or QUIT" prompt), instead of echoing
 *                  "[game has ended]" for every remaining command. Prints the death
 *                  turn to stderr. Pairs well with --strict.
 *   --summary      append a single machine-readable final-state line to stdout:
 *                  [SUMMARY] turns=<n> location=<loc> status=<alive|dead> score=<s|?> last="<line>"
 *                  Lets a caller read where a run ended without scanning the transcript.
 *   --snapshot-out <file>  serialize full VM state to <file> (JSON) at end of replay.
 *   --snapshot-in <file>   restore from that snapshot instead of a fresh boot, then replay the
 *                  (short) command tail — skips O(n²) prefix re-replay. Seed-/build-specific.
 *   --snapshot-at <N|substr|"## marker">  with --snapshot-out, snapshot MID-replay (after the
 *                  Nth command / first command containing <substr> / at a "## marker" line in
 *                  --file) and keep replaying — one pass instead of prefix-file + snapshot-out.
 *   --snapshot-out <file>  after replaying ALL commands, serialize full VM state (Glk +
 *                  io + RAM + stacks + RNG) to <file> as JSON. Lets you persist a verified
 *                  prefix once and probe short tails against it (no O(n²) prefix re-replay).
 *   --snapshot-in <file>   instead of a fresh boot, restore VM state from <file> and replay
 *                  the (short) command tail from there. Output/location/strict/death/summary
 *                  all behave identically to a full replay. Uses zvm's do_autorestore (the
 *                  Glulx-style full-state path) — NOT the bootstrap-restore save-file path,
 *                  so it sidesteps the char-bootstrap bug class. A headless GiDispa +
 *                  GlkOte.restore_allstate (defined below) back the restore. Snapshots are
 *                  seed-/build-specific: replay with the same --seed and game file.
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
// Deterministic PRNG (mulberry32) so the game's @random — which falls back to Math.random()
// when unseeded (zvm.js random()) — is reproducible across runs. This makes randomized
// puzzles (Anchorhead safe combo / flute / mirror) stable, so a walkthrough that passes such
// a gate can be replayed deterministically. NOTE: hint *content* must still teach the method,
// never the value — a real player in the app gets a different (real-random) value.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeInterpreterContext(seed) {
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  // Seeded Math (delegates to real Math for everything except random) when seed is a number;
  // null seed → real Math.random (true per-run randomness, like a real player).
  if (seed !== null && seed !== undefined) {
    const M = Object.create(Math);
    M.random = mulberry32(seed);
    sandbox.Math = M;
  }
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
  // Minimal GiDispa — only the methods glkapi's save_allstate/restore_allstate touch.
  // The browser app runs WITHOUT a GiDispa (do_vm_autosave:false), so this whole-VM
  // snapshot path is otherwise unexercised; we supply just enough dispatch bookkeeping
  // for Glk.save_allstate()/restore_allstate() to round-trip. For the Z-machine, the
  // retained-array addr/arg are never read back by do_autorestore (it relinks linebuf via
  // read_data.buffer and streams by rock), so synthesizing them is safe.  Defined IN the
  // sandbox realm so the arrays it holds are same-realm as the VM.
  vmMod.runInContext(
    '(function(){' +
    '  var byClass = { window:{}, stream:{}, fileref:{} };' +
    '  var arrInfo = new Map();' +
    '  var rockCounter = 1000;' +
    '  globalThis.__GiDispa = {' +
    '    set_vm: function(){}, init: function(){}, check_autosave: function(){ return null; },' +
    '    prepare_resume: function(){}, get_vm: function(){},' +
    '    class_register: function(cls, obj, usedisprock){' +
    '      if (usedisprock === undefined || usedisprock === null) usedisprock = rockCounter++;' +
    '      obj.disprock = usedisprock; byClass[cls][usedisprock] = obj; return usedisprock;' +
    '    },' +
    '    class_unregister: function(cls, obj){ if (obj && obj.disprock != null) delete byClass[cls][obj.disprock]; },' +
    '    class_obj_from_id: function(cls, id){ return (id === undefined || id === null) ? null : (byClass[cls][id] || null); },' +
    '    class_id_from_obj: function(cls, obj){ return obj ? obj.disprock : null; },' +
    '    retain_array: function(arr, info){ arrInfo.set(arr, info || { addr: 0, len: (arr && arr.length) || 0 }); },' +
    '    unretain_array: function(arr){ arrInfo.delete(arr); },' +
    '    get_retained_array: function(arr){' +
    '      var info = arrInfo.get(arr) || {};' +
    '      return { addr: info.addr || 0, len: (info.len != null ? info.len : (arr ? arr.length : 0)),' +
    '               arr: arr, arg: { serialize: function(){ return null; } } };' +
    '    },' +
    '  };' +
    '})();',
    ctx, { filename: 'harness-gidispa' }
  );
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
    // Mirror init()'s side effects without re-firing the {type:'init'} event (the VM is
    // already mid-restore inside VM.start() when glkapi calls this). glkapi stashes our
    // return into gli_autorestore_glkstate and passes it back as the first update's
    // `.autorestore` field — which we ignore (headless has no DOM to rehydrate). We DO
    // need the accept callback wired so the post-restore update/input loop runs, and we
    // need the window-type map rebuilt — the latter is handled by ingesting the windows
    // array that the forced post-restore arrange update emits (see play()).
    restore_allstate(/* glkoteState (={}) */) {
      state.accept = options0 && options0.accept; // re-affirm accept (set at init)
      return null;
    },
    restore_state() {},
    exit() { state.exited = true; },
  };

  // Capture the options passed to init so restore_allstate can re-affirm the accept cb.
  let options0 = null;
  const _init = glkote.init;
  glkote.init = function (options) { options0 = options; return _init.call(glkote, options); };

  return { glkote, state };
}

// ---------------------------------------------------------------------------
// Replay engine
// ---------------------------------------------------------------------------
function play(storyPath, commands, opts, getCurrentLocation, getStatusContext) {
  const ctx = makeInterpreterContext(opts.seed);
  const storyData = fs.readFileSync(storyPath);
  ctx.__storyArr = Array.from(storyData); // plain array crosses realm cleanly
  const { glkote, state } = createHeadlessGlkote(getCurrentLocation, getStatusContext);
  ctx.__glkote = glkote;

  if (opts.snapshotIn) {
    // RESTORE PATH — drive zvm's own start()→do_autorestore branch. We hand the snapshot
    // to Dialog.autosave_read (keyed by the VM's story signature) and flip do_vm_autosave
    // on; VM.start() then calls do_autorestore (Glk.restore_allstate + restart(1) +
    // restore_file) instead of a fresh restart()+run(). No char-bootstrap, no Glk.init
    // re-launch issue: restore_allstate runs BEFORE any fresh window is opened.
    ctx.__snapshot = JSON.parse(fs.readFileSync(opts.snapshotIn, 'utf8'));
    vmMod.runInContext(
      '(function(){' +
      '  var bytes = new Uint8Array(__storyArr);' +
      '  var vm = new ZVM();' +
      '  globalThis.__vm = vm;' +
      '  var snap = __snapshot;' +
      // Override Dialog.autosave_read to return our on-disk snapshot for this signature.
      '  Dialog.autosave_read = function(){ return snap; };' +
      '  var options = { vm: vm, Glk: Glk, GlkOte: __glkote, Dialog: Dialog, GiDispa: __GiDispa, do_vm_autosave: true };' +
      '  vm.prepare(bytes.buffer, options);' +
      '  Glk.init(options);' +   // → GlkOte.init → accept{init} → VM.start() → do_autorestore
      '})();',
      ctx, { filename: 'harness-boot-restore' }
    );
  } else {
    // FRESH REPLAY PATH (default, untouched). GiDispa is attached only when we may need to
    // snapshot out — harmless either way, but we keep the default identical to before.
    const needDispa = !!opts.snapshotOut;
    vmMod.runInContext(
      '(function(){' +
      '  var bytes = new Uint8Array(__storyArr);' +
      '  var vm = new ZVM();' +
      '  globalThis.__vm = vm;' +
      '  var options = { vm: vm, Glk: Glk, GlkOte: __glkote, Dialog: Dialog, do_vm_autosave: false' +
      (needDispa ? ', GiDispa: __GiDispa' : '') +
      ' };' +
      '  vm.prepare(bytes.buffer, options);' +
      '  Glk.init(options);' +
      '})();',
      ctx, { filename: 'harness-boot' }
    );
    // --xorshift <n>: force the VM's internal Xorshift RNG on (nonzero seed) AFTER the
    // intro has run, so @random becomes deterministic AND part of the VM snapshot. With
    // seed 0 (the default), @random falls through to Math.random (zvm.js:3372), whose
    // mulberry32 closure state lives in this CLI process — NOT the snapshot — so a
    // restored run draws a fresh stream and @random-flavored prose (e.g. NPC follow text)
    // diverges from a full replay. Seeding here (fresh path only; the restore path inherits
    // the seed from the snapshot via restore_allstate) makes prefix+tail RNG reproducible
    // and round-trip-exact. The intro itself still ran with seed 0, but it precedes every
    // snapshot point and compared tail, so its non-determinism is never observed.
    if (opts.xorshift != null) {
      ctx.__xorshift = opts.xorshift;
      vmMod.runInContext('if (globalThis.__vm && __xorshift) { __vm.xorshift_seed = __xorshift; }', ctx, { filename: 'harness-xorshift' });
    }
  }

  const turns = [];
  const key = opts.key || ' ';

  function drain() { const t = state.buffer; state.buffer = ''; return t; }

  // --snapshot-at: write the snapshot mid-replay, right after the command at the resolved
  // 0-based index executes, then keep replaying. Fires once. (End-of-replay --snapshot-out is
  // handled separately when --snapshot-at is absent.) Equivalent to the old write-prefix-file
  // → snapshot-out → snapshot-in dance, in a single pass.
  let _snappedAt = false;
  function maybeSnapshotAt(i) {
    if (_snappedAt || opts.snapshotAtIndex == null || i !== opts.snapshotAtIndex) return;
    if (!opts.snapshotOut) throw new Error('--snapshot-at requires --snapshot-out <file>');
    if (state.exited) return;
    captureAndWriteSnapshot(ctx, opts.snapshotOut);
    _snappedAt = true;
  }

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

  // Parse commands. A line of form `@char <key> [count]` sends raw CHARACTER input
  // (default count 1) instead of a line command — for driving interactive char-input
  // readers/menus that eat line commands (Anchorhead `read clippings`: page with
  // `@char return N` then `@char q`; Theatre `read pages`: `@char q`). <key> is a single
  // char or a Glk special name (return, space, escape, up, down, …).
  const parsed = commands.map((raw) => {
    const m = /^@char\s+(\S+)(?:\s+(\d+))?$/.exec(raw);
    return m ? { raw, isChar: true, key: m[1] === 'space' ? ' ' : m[1], count: m[2] ? parseInt(m[2], 10) : 1 } : { raw, isChar: false };
  });
  const mk = (cmd, text) => ({ cmd, location: state.location, phase: state.phase, statusRaw: state.statusRaw, text });

  // After a restore, the first update glkapi pushes only re-emits content/input — window
  // geometry is NOT marked dirty by restore_allstate, so the shim never learns which window
  // is the grid (status) vs the buffer. Send one arrange event: gli_window_rearrange sets
  // geometry_changed, so the resulting update emits the full `windows` array and the shim
  // can classify windows (needed for location/status derivation). Harmless for the buffer.
  if (opts.snapshotIn && state.accept && !state.exited) {
    state.accept({
      type: 'arrange', gen: state.gen,
      metrics: { width: 1000, height: 600, gridcharwidth: 1, gridcharheight: 1, gridmarginx: 0, gridmarginy: 0, buffercharwidth: 1, buffercharheight: 1, buffermarginx: 0, buffermarginy: 0, outspacingx: 0, outspacingy: 0, inspacingx: 0, inspacingy: 0, charwidth: 1, charheight: 1 },
    });
  }

  // Intro / first prompt before any command (skip auto-dismiss if caller drives it via @char)
  let intro = drain();
  if (!(parsed[0] && parsed[0].isChar)) intro += advanceCharPrompts();
  turns.push(mk(null, intro));

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (state.exited) { turns.push(mk(p.raw, '[game has ended]')); break; }

    // Explicit char input: drive a reader/menu manually, no auto-dismiss.
    if (p.isChar) {
      let text = '';
      for (let k = 0; k < p.count; k++) { send(p.key, 'char'); text += drain(); }
      if (process.env.DBG) process.stderr.write(`DBG @char ${p.key}x${p.count} -> inputType=${state.inputType} gen=${state.gen} bufLen=${text.length}\n`);
      turns.push(mk(p.raw, text));
      maybeSnapshotAt(i);
      continue;
    }

    if (state.inputType !== 'line') advanceCharPrompts();
    if (state.exited) { turns.push(mk(p.raw, '[game has ended]')); break; }
    if (state.inputType !== 'line') {
      // The game isn't requesting line input — it's wedged in a state our replay can't
      // drive (commonly an interactive char-input reader/pager, e.g. Anchorhead's
      // `read clippings` / Theatre's `read pages`). Drive it with `@char` lines, or for a
      // pure lore reader drop the command. This is a real desync, not a no-op: under
      // --strict, halt here rather than silently passing.
      const turn = mk(p.raw, '[no line-input prompt available]');
      if (opts.strict) { turn.strictFail = 'no line-input prompt (game wedged — interactive reader/pager? drive it with @char)'; turns.push(turn); break; }
      turns.push(turn);
      continue;
    }
    send(p.raw, 'line');
    let text = drain();
    // Auto-dismiss post-command char prompts (e.g. [MORE]) — unless the next scripted line
    // is an @char directive, in which case leave the reader for manual driving.
    const next = parsed[i + 1];
    if (!(next && next.isChar)) text += advanceCharPrompts();
    if (process.env.DBG) process.stderr.write(`DBG cmd="${p.raw}" -> inputType=${state.inputType} gen=${state.gen} bufLen=${text.length}\n`);
    const turn = mk(p.raw, text);
    if (opts.strict) {
      const fail = checkStrictFail(text);
      if (fail) { turn.strictFail = fail; turns.push(turn); break; }
    }
    if (opts.stopOnDeath) {
      const dead = checkDeath(text);
      if (dead) { turn.death = dead; turns.push(turn); break; }
    }
    turns.push(turn);
    maybeSnapshotAt(i);
  }

  // SNAPSHOT-OUT at end of replay (when --snapshot-at was NOT used — the mid-replay trigger
  // inside the loop handles that case). The VM must be paused at a line-input prompt (the
  // normal end-of-replay state) for the saved pc to resume cleanly on restore.
  if (opts.snapshotOut && opts.snapshotAtIndex == null && !state.exited) {
    captureAndWriteSnapshot(ctx, opts.snapshotOut);
  }

  return turns;
}

// Capture full VM state the way do_autosave builds its snapshot object, but forced JSON-safe
// (Dialog.streaming is false in our stub, so ram is already a plain Array and clone() strips the
// non-serialisable `buffer`/`str` refs). We build it directly rather than via do_autosave() so we
// don't round-trip through Dialog.autosave_write's localStorage/HTML plumbing. Caller must ensure
// the VM is paused at a line-input prompt (not exited) so the saved pc resumes cleanly on restore.
function captureAndWriteSnapshot(ctx, outPath) {
  ctx.__snapOut = null;
  vmMod.runInContext(
    '(function(){' +
    '  var vm = globalThis.__vm;' +
    '  var ram = vm.save_file(vm.pc, 1);' +   // autosaving=1 → uncompressed full RAM
    // zvm's clone() is module-private; replicate it (strip buffer/str) for io + read_data.
    '  function clone(obj){' +
    '    if (obj === null || typeof obj !== "object") return obj;' +
    '    if (Array.isArray(obj)) return obj.map(clone);' +
    '    var o = {}; for (var k in obj){ if (k!=="buffer" && k!=="str") o[k]=clone(obj[k]); } return o;' +
    '  }' +
    '  globalThis.__snapOut = {' +
    '    glk: Glk.save_allstate(),' +
    '    io: clone(vm.io),' +
    '    ram: Array.from(new Uint8Array(ram)),' +
    '    read_data: clone(vm.read_data),' +
    '    xorshift_seed: vm.xorshift_seed,' +
    '  };' +
    '})();',
    ctx, { filename: 'harness-snapshot-out' }
  );
  fs.writeFileSync(outPath, JSON.stringify(ctx.__snapOut));
  process.stderr.write('[SNAPSHOT] wrote ' + outPath + ' (pc-paused VM state)\n');
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
  // NOTE: "nothing happens" was removed — it's authored flavor for deliberately-inert
  // objects, not a parser failure (Bronze: TURN ON the broken chessplayer automaton →
  // "nothing happens -- the switch flops loosely back... connected to nothing"). Strict
  // mode must only flag *parser-level* failures (command didn't parse/apply), never
  // game-level "no effect" responses, which are frequently intended. See bronze test 2026-06-14.
];

function checkStrictFail(text) {
  for (const line of text.split('\n')) {
    for (const p of STRICT_PATTERNS) {
      if (p.test(line)) return line.trim();
    }
  }
  return null;
}

// End-of-story / death detection. The Z-machine doesn't "exit" on death — it prints a
// restart prompt and keeps requesting line input, so a long command tail would otherwise
// produce a wall of failing turns. These patterns mark the death/win screen.
const DEATH_PATTERNS = [
  /\b(RESTART|RESTORE)\b.*\b(QUIT)\b/i,        // "Type RESTART, RESTORE or QUIT."
  /the story (is over|has ended)|story's over/i,
  /you have (died|won)/i,
];

function checkDeath(text) {
  for (const line of text.split('\n')) {
    for (const p of DEATH_PATTERNS) {
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
  const opts = { quiet: false, status: false, statusraw: false, raw: false, file: null, stdin: false, key: ' ', strict: false, stopOnDeath: false, summary: false, seed: 1, xorshift: null, snapshotOut: null, snapshotIn: null, snapshotAt: null, snapshotAtIndex: null };
  const commands = [];
  const inlineCmds = [];   // from --cmds "a ; b ; c" — appended like a tiny file (after --)
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
    else if (a === '--stop-on-death') opts.stopOnDeath = true;
    else if (a === '--summary') opts.summary = true;
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--key') opts.key = argv[++i];
    else if (a === '--seed') opts.seed = parseInt(argv[++i], 10);
    else if (a === '--random') opts.seed = null;
    else if (a === '--xorshift') opts.xorshift = parseInt(argv[++i], 10);
    else if (a === '--snapshot-out') opts.snapshotOut = argv[++i];
    else if (a === '--snapshot-in') opts.snapshotIn = argv[++i];
    else if (a === '--snapshot-at') opts.snapshotAt = argv[++i];
    else if (a === '--cmds') { for (const c of argv[++i].split(';').map((s) => s.trim()).filter(Boolean)) inlineCmds.push(c); }
    else if (a.startsWith('--')) { /* ignore unknown */ }
    else if (game === null) game = a;
    else commands.push(a);
  }
  return { game, commands, inlineCmds, opts };
}

function loadCommandsFromText(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length && !l.startsWith('#'));
}

async function main() {
  const { game, commands, inlineCmds, opts } = parseArgs(process.argv.slice(2));
  if (!game) {
    process.stderr.write('Usage: node tools/play.cjs <game> [--file f|--stdin|--cmds "a ; b"|--quiet|--status|--raw|--key c] -- "cmd" ...\n');
    process.exit(2);
  }
  let cmds = commands.slice();
  let fileText = null;
  if (opts.file) { fileText = fs.readFileSync(opts.file, 'utf8'); cmds = cmds.concat(loadCommandsFromText(fileText)); }
  if (opts.stdin) cmds = cmds.concat(loadCommandsFromText(fs.readFileSync(0, 'utf8')));
  if (inlineCmds.length) cmds = cmds.concat(inlineCmds);

  // Resolve --snapshot-at <N | substring | "## marker"> → 0-based command index to snapshot after.
  if (opts.snapshotAt != null) {
    const at = String(opts.snapshotAt).trim();
    if (/^\d+$/.test(at)) {
      opts.snapshotAtIndex = parseInt(at, 10) - 1;   // 1-based count → after the Nth command
    } else if (fileText && /##/.test(at)) {
      // Marker match: `## ...` lines are stripped from cmds, so map them via the raw file.
      // Snapshot at a marker = state right before that section's commands → after the last
      // command preceding the marker line.
      const needle = at.replace(/^#+\s*/, '').toLowerCase();
      let count = 0, found = null;
      for (const line of fileText.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('#')) {
          if (t.startsWith('##') && t.toLowerCase().includes(needle)) { found = count; break; }
          continue;
        }
        count++;
      }
      if (found == null) { process.stderr.write('[snapshot-at] no "## " marker matching: ' + at + '\n'); process.exit(2); }
      opts.snapshotAtIndex = found - 1;
    } else {
      // Substring match against command text → snapshot after the first matching command.
      const needle = at.toLowerCase();
      const idx = cmds.findIndex((c) => c.toLowerCase().includes(needle));
      if (idx === -1) { process.stderr.write('[snapshot-at] no command matching: ' + at + '\n'); process.exit(2); }
      opts.snapshotAtIndex = idx;
    }
    if (!opts.snapshotOut) { process.stderr.write('[snapshot-at] requires --snapshot-out <file>\n'); process.exit(2); }
  }

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

  if (opts.summary) {
    const last = turns[turns.length - 1] || {};
    const allText = turns.map(t => t.text || '').join('\n');
    // Prefer an absolute score phrasing ("(total) score is N", "score of N", "N out of M")
    // over the incremental "(went up by) N points", which would otherwise win as the last match.
    let score = '?';
    const absRe = /\bscore(?:\s+is|:|\s+of)?\s+(\d+)(?:\s+(?:out\s+of|of)\s+\d+)?/gi;
    const outOfRe = /\b(\d+)\s+(?:out\s+of|of)\s+\d+\b/gi;
    let m, lastAbs = null, lastOutOf = null;
    while ((m = absRe.exec(allText))) lastAbs = m[1];
    while ((m = outOfRe.exec(allText))) lastOutOf = m[1];
    score = lastAbs || lastOutOf || '?';
    const dead = turns.some(t => t.death) || /\b(RESTART|RESTORE)\b.*\bQUIT\b/i.test(allText);
    // Last meaningful line: skip bare ">" prompts and echoed command lines.
    const lastLine = (last.text || '').split('\n').map(s => s.trim())
      .filter(s => s && s !== '>' && !s.startsWith('> ')).pop() || '';
    const turnCount = turns.filter(t => t.cmd !== null).length;
    process.stdout.write(
      `\n[SUMMARY] turns=${turnCount} location=${last.location || '?'} ` +
      `status=${dead ? 'dead' : 'alive'} score=${score} last=${JSON.stringify(lastLine)}\n`
    );
  }

  const deathIdx = turns.findIndex(t => t.death);
  if (deathIdx !== -1) {
    process.stderr.write('\n[DEATH] Turn ' + deathIdx + ': "' + turns[deathIdx].cmd + '"\n  → ' + turns[deathIdx].death + '\n');
  }

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
