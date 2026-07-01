#!/usr/bin/env node
/*
 * Lantern location-art review SERVER (multi-game).
 *
 * Three-pane reviewer:
 *   NAV rail  →  ITEM list (+ topic notes)  →  DETAIL (+ item notes + actions).
 *
 * The rail lists every GAME that has art (a docs/games/images/<game>/room-facts.json),
 * then two global topics: Placeholders and Artist.
 *   - <game>:       locations → candidate images in _review/, 3 sections
 *                   (in-game / style / full prompt), Promote/Reject/Regenerate.
 *   - Placeholders: glyphs in docs/assets/glyphs/ — pick the app-wide placeholder.
 *   - Artist:       personas in docs/games/images/_artists/artists.json — example
 *                   renders (big selected preview) + style signature.
 *
 * Notes (per topic and per item) persist in docs/games/images/_review-notes.json.
 *
 *   node tools/review-server.cjs [--port 3009] [--no-open]
 *
 * The server is game-agnostic: it serves ALL games and topics. The reviewer remembers
 * where you last navigated in localStorage, so there is no launch-time "focus game".
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Unique per server process. The client polls it and reloads itself when it changes,
// so a -Restart reconnects the open reviewer WITHOUT artview.ps1 sending an F5 keystroke
// (SendKeys toggles NumLock as a side effect — the "numlock on" announcement on restart).
const BOOT_ID = String(Date.now());
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = parseInt((args.find((a) => a.startsWith('--port=')) || '').split('=')[1]
  || (portIdx !== -1 ? args[portIdx + 1] : null) || '3009', 10);

// All data + generation logic lives in the core module; the server is transport only.
const {
  REPO, IMAGES_ROOT, notesPath, glyphsDir, glyphSelPath, artistsDir, artistsPath, appDir, appPromptPath, readJSON, listGames, gamePaths, blockoutsFor, composeForRoom, sceneForRoom, blockoutGenDir, blockoutInfo, ROLE_LEGEND, blockoutGen, blockoutRefine, saveBlockoutCamera, saveBlockoutPart, deleteBlockoutGen, saveBlockoutNote, cap, ARTIST_LEAD, candidatesFor, appPrompt, saveAppPrompt, gameStyle, saveStyle, saveScene, saveDescription, artistSignatureFor, saveArtistStyle, saveArtistStyleById, locationsFor, modelTag, nextRegenName, promote, promoteBlockout, demote, demoteBulk, TITLE_HEROES, titleSlot, titleArtistFor, saveTitleArtist, titleCommitted, titleLocationObj, setGameTitle, clearTitle, reject, LOG_RING, LOG_RING_MAX, logLine, JOBS, jobSeq, MAX_CONCURRENT_GENS, _genActive, _genQueue, scheduleGen, jobsList, regen, listGlyphs, selectGlyph, listArtists, createArtist, selectArtist, composedFor, classifyRoom, suggestScenes, listAuditionImages, scanTaggedImages, auditionState, saveAuditionCfg, toggleFinalist, auditionGen, composeInline, sbxRev, sandboxState, sandboxReject, sandboxAdopt, sandboxGen, noteText, noteStatus, saveNote, setNoteStatus
} = require('./artview/lib/core.cjs');

// --- HTTP -------------------------------------------------------------------
const sendJSON = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
function sendImg(res, file) {
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  const q = u.searchParams;
  try {
    // no-store so F5 (and the BOOT_ID auto-reload) always refetch the live PAGE — otherwise the
    // --app window serves a cached copy and code changes don't show up on refresh.
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(PAGE); return; }
    if (u.pathname === '/api/state') {
      const games = listGames();
      // No server-side focus game — the client restores its last spot from localStorage and
      // falls back to the first game only on a brand-new browser. defaultGame is always null.
      return sendJSON(res, 200, { games, defaultGame: null, notes: readJSON(notesPath, {}) });
    }
    if (u.pathname === '/api/game') {
      const s = q.get('slug');
      return sendJSON(res, 200, { slug: s, aesthetic: gameStyle(s).aesthetic, artist: artistSignatureFor(s), app: appPrompt(), locations: locationsFor(s), blockouts: blockoutsFor(s) });
    }
    // The generic 3D blockout renderer (served from disk so artview is self-contained on :3009).
    if (u.pathname === '/blockout') {
      const f = path.join(IMAGES_ROOT, '_blockout', 'renderer.html');
      if (!fs.existsSync(f)) { res.writeHead(404); res.end('no renderer'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f)); return;
    }
    // All blockouts across all games (for the Blockout rail section, grouped by game).
    if (u.pathname === '/api/blockouts') {
      const all = [];
      for (const g of listGames()) for (const b of blockoutsFor(g)) all.push({ game: g, ...b });
      return sendJSON(res, 200, { blockouts: all });
    }
    // Per-member canon prose + scene + saved note (renderer's description panel).
    if (u.pathname === '/api/blockout-info') return sendJSON(res, 200, { rooms: blockoutInfo(q.get('game'), q.get('volume')) });
    // All kept gens for a volume (the gallery), newest first.
    if (u.pathname === '/api/blockout-gens') {
      const game = q.get('game') || '', dir = blockoutGenDir(game, q.get('volume') || ''); const out = [];
      const notes = readJSON(notesPath, {});   // image notes share the reviewer's _review-notes.json
      // Hash the committed in-game image per view (<view>.png in the game dir) so the gallery can
      // tag the gen a room's current picture was promoted from — byte-identical since promote copies.
      const gdir = gamePaths(game).dir, _hashCache = {};
      const committedHash = (view) => {
        if (!(view in _hashCache)) { const p = path.join(gdir, `${view}.png`);
          _hashCache[view] = fs.existsSync(p) ? crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex') : null; }
        return _hashCache[view];
      };
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => /-r\d+\.png$/i.test(n))) {
        const view = f.split('__')[0], key = `game:${game}:${view}:${f}`;
        let prompt = ''; try { prompt = fs.readFileSync(path.join(dir, f.replace(/\.png$/i, '.txt')), 'utf8'); } catch (e) {}
        const ch = committedHash(view);
        const inGame = !!ch && crypto.createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex') === ch;
        out.push({ file: f, view, mtime: fs.statSync(path.join(dir, f)).mtimeMs, key, note: noteText(notes[key]), status: noteStatus(notes[key]), prompt, inGame }); }
      out.sort((a, b) => b.mtime - a.mtime);
      return sendJSON(res, 200, { gens: out });
    }
    if (u.pathname === '/img/blockout') return sendImg(res, path.join(blockoutGenDir(q.get('game') || '', q.get('volume') || ''), path.basename(q.get('f') || '')));
    // Scene-def JSON for a game's volume (the renderer fetches this via ?src=).
    if (u.pathname === '/api/blockout') {
      const f = path.join(gamePaths(q.get('game') || '').blockout, path.basename(q.get('volume') || '') + '.scene.json');
      if (!fs.existsSync(f)) return sendJSON(res, 404, { error: 'no such blockout' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f)); return;
    }
    if (u.pathname === '/api/title') {
      const slot = titleSlot(q.get('id'));
      const roster = ((readJSON(artistsPath, { artists: [] }).artists) || [])
        .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((a) => ({ id: a.id, name: a.name, style: a.style || '' }));
      return sendJSON(res, 200, { game: slot.game, slug: slot.slug, aspect: slot.aspect, name: slot.name,
        artist: titleArtistFor(q.get('id')), artists: roster, location: titleLocationObj(q.get('id')) });
    }
    if (u.pathname === '/api/jobs') return sendJSON(res, 200, { jobs: jobsList(), boot: BOOT_ID });
    if (u.pathname === '/api/logs') return sendJSON(res, 200, { logs: LOG_RING, boot: BOOT_ID });
    if (u.pathname === '/api/glyphs') return sendJSON(res, 200, listGlyphs());
    if (u.pathname === '/api/artists') return sendJSON(res, 200, listArtists(q.get('game')));
    if (u.pathname === '/api/audition') return sendJSON(res, 200, auditionState(q.get('game')));
    if (u.pathname === '/api/sandbox') return sendJSON(res, 200, sandboxState(q.get('game')));
    if (u.pathname === '/img/audition') return sendImg(res, path.join(gamePaths(q.get('game') || '').audition, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/sandbox') return sendImg(res, path.join(gamePaths(q.get('game') || '').sandbox, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/review') return sendImg(res, path.join(gamePaths(q.get('game') || '').review, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/committed') return sendImg(res, path.join(gamePaths(q.get('game') || '').dir, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/artist') return sendImg(res, path.join(artistsDir, path.basename(q.get('f') || '')));
    // Actual prompt for an audition cell, from its _audition/<f>.txt sidecar (the lightbox shows
    // it under the notes; loc-mode reads candidatePrompts client-side, so this is aud-only).
    if (u.pathname === '/api/aud-prompt') {
      const g = gamePaths(q.get('game') || '');
      const tp = path.join(g.audition, path.basename(q.get('f') || '').replace(/\.png$/i, '') + '.txt');
      let prompt = ''; try { prompt = fs.readFileSync(tp, 'utf8'); } catch (e) {}
      return sendJSON(res, 200, { prompt });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const wrap = (fn) => { try { return sendJSON(res, 200, { ok: true, ...fn() }); } catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); } };
      if (u.pathname === '/api/promote') return wrap(() => promote(body.game, body.slug, body.candidate));
      if (u.pathname === '/api/reject') return wrap(() => { reject(body.game, body.candidate); return {}; });
      if (u.pathname === '/api/select-glyph') return wrap(() => selectGlyph(body.id));
      if (u.pathname === '/api/select-artist') return wrap(() => selectArtist(body.game, body.id));
      if (u.pathname === '/api/title-artist') return wrap(() => saveTitleArtist(body.id, body.artistId));
      if (u.pathname === '/api/set-title') return wrap(() => setGameTitle(body.game, body.slug));
      if (u.pathname === '/api/clear-title') return wrap(() => clearTitle(body.id));
      if (u.pathname === '/api/artist-create') return wrap(() => ({ artist: createArtist(body) }));
      if (u.pathname === '/api/app-prompt') return wrap(() => saveAppPrompt(body.prompt));
      if (u.pathname === '/api/style') return wrap(() => saveStyle(body.game, body.aesthetic));
      if (u.pathname === '/api/artist-style') return wrap(() => saveArtistStyle(body.game, body.style));
      if (u.pathname === '/api/artist-style-by-id') return wrap(() => saveArtistStyleById(body.id, body.style));
      if (u.pathname === '/api/blockout-camera') return wrap(() => saveBlockoutCamera(body));
      if (u.pathname === '/api/blockout-part') return wrap(() => saveBlockoutPart(body));
      if (u.pathname === '/api/blockout-gen-delete') return wrap(() => deleteBlockoutGen(body));
      if (u.pathname === '/api/blockout-promote') return wrap(() => promoteBlockout(body));
      if (u.pathname === '/api/demote') return wrap(() => demote(body));
      if (u.pathname === '/api/demote-bulk') return wrap(() => demoteBulk(body));
      if (u.pathname === '/api/blockout-note') return wrap(() => saveBlockoutNote(body));
      if (u.pathname === '/api/blockout-gen') {
        try { const r = await blockoutGen(body); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/blockout-refine') {
        try { const r = await blockoutRefine(body); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/scene') return wrap(() => saveScene(body.game, body.slug, body.tail));
      if (u.pathname === '/api/description') return wrap(() => saveDescription(body.game, body.slug, body.text));
      if (u.pathname === '/api/note') return wrap(() => saveNote(body.key, body.text));
      if (u.pathname === '/api/note-status') return wrap(() => setNoteStatus(body.key, body.status, body.appliedTo));
      if (u.pathname === '/api/regen') {
        try { const r = await regen(body.game, body.slug, body.prompt, body.provider, body.quality, body.model, body.ref, body.refMode, body.artistId, body.artistName, body.aspect); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/audition-config') return wrap(() => saveAuditionCfg(body.game, body.scenes, body.artists));
      if (u.pathname === '/api/audition-finalist') return wrap(() => toggleFinalist(body.game, body.artist, body.on));
      if (u.pathname === '/api/audition-gen') {
        try { const r = await auditionGen(body.game, body.scene, body.artist, body.provider, body.quality, body.model); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/sandbox-reject') return wrap(() => sandboxReject(body.game, body.file));
      if (u.pathname === '/api/sandbox-adopt') return wrap(() => sandboxAdopt(body.game, body.srcKind, body.srcFile, body.fields, body.meta));
      if (u.pathname === '/api/sandbox-gen') {
        try { const r = await sandboxGen(body.game, body.fields, body.meta, body.provider, body.quality, body.model); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
    }
    res.writeHead(404); res.end();
  } catch (e) { sendJSON(res, 500, { ok: false, error: e.message }); }
});

const noOpen = args.includes('--no-open');
const url = `http://localhost:${port}`;
function openBrowser(target) {
  if (noOpen) return;
  const p = process.platform;
  const [cmd, cmdArgs] = p === 'win32' ? ['cmd', ['/c', 'start', '""', target]]
    : p === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  try { require('child_process').spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref(); } catch {}
}
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`Review server already running on ${port} — opening the UI.`); openBrowser(url); process.exit(0); }
  console.error(e.message); process.exit(1);
});
server.listen(port, () => { console.log(`\nLocation-art review server (all games)\n  → ${url}\n`); openBrowser(url); });

// --- client page ------------------------------------------------------------
// The artview client (HTML shell + CSS + JS) lives in tools/artview/ as plain files so this
// server stays focused on data/routes. shell.html carries two sentinel tokens; we substitute the
// CSS and JS bodies via FUNCTION replacement so any $-sequences in the client code are inserted
// literally (String.replace would otherwise interpret $&, $1, $` in the replacement text).
const ARTVIEW_DIR = path.join(__dirname, "artview");
const CLIENT_CSS = fs.readFileSync(path.join(ARTVIEW_DIR, "client.css"), "utf8");
const CLIENT_JS = fs.readFileSync(path.join(ARTVIEW_DIR, "client.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ARTVIEW_DIR, "shell.html"), "utf8")
  .replace("__CLIENT_CSS__", () => CLIENT_CSS)
  .replace("__CLIENT_JS__", () => CLIENT_JS);
