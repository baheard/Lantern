#!/usr/bin/env node
/*
 * Lantern location-art review & progress tracker.
 *
 * Builds a standalone HTML dashboard of EVERY location in a game's prompt pack, with
 * each room's current status baked in at generation time:
 *   - approved  : promoted + in manifest.json (live in the game)
 *   - review    : a PNG sits in _review/ awaiting your verdict
 *   - pending   : no image generated yet
 *
 * Doubles as the "what have I approved / what's left" tracker. Re-run after generating
 * or promoting to refresh status.
 *
 *   node tools/gen-room-review.cjs anchorhead
 *   → docs/games/images/anchorhead/_review/review.html  (open in any browser)
 *
 * Click any image for a full-screen MODAL: large preview, the exact prompt that made it,
 * approve/regen/reject + a comment box, and ◀ ▶ to walk the set (arrow keys / Esc too).
 * Verdicts + comments persist in localStorage. "Copy verdicts" emits lines to paste back:
 *   APPROVE → promote-room-images.cjs   REGEN <note> → tweak+regenerate   REJECT <note> → drop
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function main() {
  const game = process.argv[2];
  if (!game) { console.error('Usage: node tools/gen-room-review.cjs <game>'); process.exit(2); }
  const gameDir = path.join(REPO, 'docs/games/images', game);
  const reviewDir = path.join(gameDir, '_review');
  fs.mkdirSync(reviewDir, { recursive: true });

  const pack = fs.existsSync(path.join(gameDir, 'room-facts.json'))
    ? JSON.parse(fs.readFileSync(path.join(gameDir, 'room-facts.json'), 'utf8')) : { rooms: [] };
  const manifest = fs.existsSync(path.join(gameDir, 'manifest.json'))
    ? JSON.parse(fs.readFileSync(path.join(gameDir, 'manifest.json'), 'utf8')) : { images: {} };
  const approvedNames = new Set(Object.keys(manifest.images || {}));
  const inReview = new Set(fs.readdirSync(reviewDir).filter((f) => f.endsWith('.png') && !f.startsWith('_')).map((f) => f.replace(/\.png$/, '')));

  const cards = pack.rooms.map((r) => {
    let status, src;
    if (approvedNames.has(r.name)) { status = 'approved'; src = `../${r.slug}.png`; }
    else if (inReview.has(r.slug)) { status = 'review'; src = `${r.slug}.png`; }
    else { status = 'pending'; src = null; }
    const scene = (r.prompt && r.prompt.split('Scene:')[1] || '').trim();
    const hasPrev = inReview.has(r.slug) && fs.existsSync(path.join(reviewDir, `${r.slug}.prev.png`));
    return { slug: r.slug, name: r.name, scene, exits: r.exits || [], prompt: r.prompt || '', status, src, prev: hasPrev ? `${r.slug}.prev.png` : null };
  });
  const order = { review: 0, pending: 1, approved: 2 };
  cards.sort((a, b) => (order[a.status] - order[b.status]) || a.name.localeCompare(b.name));
  const counts = { approved: 0, review: 0, pending: 0 };
  cards.forEach((c) => counts[c.status]++);

  const CARDS_JSON = JSON.stringify(cards);
  const APPROVED_JSON = JSON.stringify([...approvedNames]);

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${game} — location art (${cards.length})</title>
<style>
  body{background:#15131a;color:#e8e4ee;font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#9a93a8;margin-bottom:8px}
  .bar{position:sticky;top:0;background:#15131a;padding:12px 0;z-index:5;border-bottom:1px solid #2c2735;margin-bottom:16px}
  button{background:#2c2735;color:#e8e4ee;border:1px solid #463d57;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;margin-right:6px}
  button:hover{background:#3a3347}
  .filters label{margin-right:12px;color:#b9b2c6;font-size:13px;cursor:pointer}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
  .card{background:#1d1a24;border:1px solid #2c2735;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
  .imgwrap{position:relative}
  .card img{width:100%;display:block;background:#000;aspect-ratio:3/4;object-fit:cover;cursor:zoom-in;transition:filter .12s}
  .card img:hover{filter:brightness(1.12)}
  .ph{width:100%;aspect-ratio:3/4;background:repeating-linear-gradient(45deg,#1a1722,#1a1722 10px,#1d1a26 10px,#1d1a26 20px);display:flex;align-items:center;justify-content:center;color:#5b5470;font-size:13px}
  .badge{position:absolute;top:8px;left:8px;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
  .badge.approved{background:#1e5631;color:#9be8b0} .badge.review{background:#5c4a16;color:#f0d98a} .badge.pending{background:#2c2735;color:#8a8398}
  .cmark{position:absolute;top:8px;right:8px;font-size:16px}
  .meta{padding:10px 12px;flex:1}
  .name{font-weight:600;margin-bottom:2px} .slug{color:#7d7690;font-size:12px;font-family:monospace}
  .scene{color:#b9b2c6;font-size:12px;margin-top:6px;max-height:5.5em;overflow:auto}
  .exits{color:#8a8398;font-size:11px;margin-top:6px}
  .verdicts{display:flex;gap:6px;padding:0 12px 12px}
  .v{flex:1;text-align:center;padding:6px 0;border-radius:6px;border:1px solid #463d57;cursor:pointer;user-select:none;font-size:12px}
  .v.on.approve{background:#1e5631;border-color:#2e7d46} .v.on.regen{background:#5c4a16;border-color:#8a6e1e} .v.on.reject{background:#5c1e1e;border-color:#8a2e2e}
  #out{width:100%;box-sizing:border-box;margin-top:12px;background:#0e0c12;color:#9fe8b0;border:1px solid #2c2735;border-radius:6px;padding:10px;font-family:monospace;font-size:12px;min-height:60px}
  /* modal */
  #modal{position:fixed;inset:0;background:rgba(8,7,11,.92);z-index:50;display:none;align-items:center;justify-content:center}
  #modal.open{display:flex}
  .mbox{width:min(1100px,94vw);max-height:94vh;background:#16131d;border:1px solid #332c40;border-radius:12px;overflow:hidden;display:grid;grid-template-columns:1.4fr 1fr}
  .mimg{background:#000;display:flex;align-items:center;justify-content:center;position:relative}
  .mimg img{max-width:100%;max-height:94vh;display:block}
  .mside{padding:18px 20px;overflow:auto;display:flex;flex-direction:column;gap:10px}
  .mside h2{margin:0;font-size:18px} .mstatus{font-size:11px;padding:2px 8px;border-radius:10px;align-self:flex-start}
  .mlabel{color:#8a8398;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-top:4px}
  .mprompt{background:#0e0c12;border:1px solid #2c2735;border-radius:6px;padding:8px;font-size:12px;color:#c5bfd2;max-height:30vh;overflow:auto;white-space:pre-wrap}
  .mverdicts{display:flex;gap:8px} .mverdicts .v{padding:9px 0}
  #mcomment{width:100%;box-sizing:border-box;background:#0e0c12;color:#e8e4ee;border:1px solid #2c2735;border-radius:6px;padding:8px;font:inherit;font-size:13px;min-height:54px;resize:vertical}
  .mnav{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:8px}
  .mnav button{font-size:18px;padding:4px 14px}
  .mclose{position:absolute;top:14px;right:18px;font-size:26px;color:#bbb;cursor:pointer;z-index:51}
  @media(max-width:760px){.mbox{grid-template-columns:1fr;overflow:auto}}
</style></head><body>
<h1>${game} — location art</h1>
<div class="sub">${cards.length} locations · <b style="color:#9be8b0">${counts.approved} in game</b> · <b style="color:#f0d98a">${counts.review} in review</b> · <b style="color:#8a8398">${counts.pending} not generated</b></div>
<div class="bar">
  <button onclick="bulk('approve')">✓ Approve all in-review</button>
  <button onclick="emit()">⧉ Copy verdicts</button>
  <span class="filters" style="margin-left:8px">
    <label><input type="checkbox" class="f" value="review" checked> review</label>
    <label><input type="checkbox" class="f" value="pending" checked> pending</label>
    <label><input type="checkbox" class="f" value="approved" checked> approved</label>
  </span>
  <span id="tally" style="margin-left:12px;color:#9a93a8"></span>
  <textarea id="out" placeholder="verdict summary appears here — paste it back to Claude"></textarea>
</div>
<div class="grid" id="grid"></div>

<div id="modal" role="dialog" aria-modal="true">
  <span class="mclose" onclick="closeModal()">×</span>
  <div class="mbox">
    <div class="mimg"><img id="mimg" alt=""><button id="mcompare" style="position:absolute;bottom:14px;left:14px;display:none" onmousedown="showPrev(true)" onmouseup="showPrev(false)" onmouseleave="showPrev(false)">↔ hold to see previous</button></div>
    <div class="mside">
      <span class="mstatus badge" id="mstatus"></span>
      <h2 id="mname"></h2><div class="slug" id="mslug"></div>
      <div class="mverdicts">
        <div class="v approve" data-v="approve" onclick="modalVote('approve')">approve</div>
        <div class="v regen" data-v="regen" onclick="modalVote('regen')">regen</div>
        <div class="v reject" data-v="reject" onclick="modalVote('reject')">reject</div>
      </div>
      <div class="mlabel">comment (steers regen / explains reject)</div>
      <textarea id="mcomment" placeholder="e.g. too bright; make the luggage pile bigger; wrong era…" oninput="modalComment(this.value)"></textarea>
      <div class="mlabel">scene</div><div class="scene" id="mscene"></div>
      <div class="mlabel">full prompt</div><div class="mprompt" id="mprompt"></div>
      <div class="mlabel" id="mexitlabel">exits</div><div class="exits" id="mexits"></div>
      <div class="mnav"><button onclick="nav(-1)">◀ prev</button><span id="mpos" style="color:#8a8398"></span><button onclick="nav(1)">next ▶</button></div>
    </div>
  </div>
</div>

<script>
const CARDS=${CARDS_JSON};
const APPROVED=new Set(${APPROVED_JSON});
const KEY='artreview_${game}';
let state=JSON.parse(localStorage.getItem(KEY)||'{}');
// migrate old string-form verdicts -> {v,c}
for(const k in state){if(typeof state[k]==='string')state[k]={v:state[k],c:''};}
// pre-seed committed approvals
CARDS.forEach(c=>{if(c.status==='approved'&&!state[c.slug])state[c.slug]={v:'approve',c:''};});
function save(){localStorage.setItem(KEY,JSON.stringify(state));}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function render(){
  const grid=document.getElementById('grid');
  grid.innerHTML=CARDS.map((c,i)=>{
    const st=state[c.slug];const mark=st?{approve:'✓',regen:'↻',reject:'✗'}[st.v]:'';
    const img=c.src?\`<img src="\${c.src}" loading="lazy" onclick="openModal(\${i})">\`:'<div class="ph">not generated yet</div>';
    const verd=c.status!=='pending'?\`<div class="verdicts">
      <div class="v approve" onclick="vote('\${c.slug}','approve')">approve</div>
      <div class="v regen" onclick="vote('\${c.slug}','regen')">regen</div>
      <div class="v reject" onclick="vote('\${c.slug}','reject')">reject</div></div>\`:'';
    return \`<div class="card" data-slug="\${c.slug}" data-status="\${c.status}" data-i="\${i}">
      <div class="imgwrap"><span class="badge \${c.status}">\${c.status}</span>\${mark?\`<span class="cmark">\${mark}</span>\`:''}\${img}</div>
      <div class="meta"><div class="name">\${esc(c.name)}</div><div class="slug">\${c.slug}</div>
        <div class="scene">\${esc(c.scene)}</div>\${c.exits.length?\`<div class="exits">exits: \${esc(c.exits.join(' · '))}</div>\`:''}</div>
      \${verd}</div>\`;
  }).join('');
  paint();applyFilters();
}
function paint(){
  document.querySelectorAll('.card').forEach(card=>{const st=state[card.dataset.slug];card.querySelectorAll('.v').forEach(v=>v.classList.remove('on'));
    if(st){const el=card.querySelector('.verdicts .v.'+st.v);if(el)el.classList.add('on');}});
  const c={approve:0,regen:0,reject:0};Object.values(state).forEach(s=>c[s.v]&&c[s.v]++);
  document.getElementById('tally').textContent='✓'+c.approve+' ↻'+c.regen+' ✗'+c.reject;
}
function vote(slug,v){const cur=state[slug];if(cur&&cur.v===v){delete state[slug];}else{state[slug]={v,c:(cur&&cur.c)||''};}save();render();}
function bulk(v){CARDS.filter(c=>c.status==='review').forEach(c=>state[c.slug]={v,c:(state[c.slug]&&state[c.slug].c)||''});save();render();}

// ----- modal -----
let mi=-1;
function visibleIdx(){const on=new Set([...document.querySelectorAll('.f:checked')].map(f=>f.value));return CARDS.map((c,i)=>({c,i})).filter(x=>on.has(x.c.status)&&x.c.src).map(x=>x.i);}
function openModal(i){mi=i;fill();document.getElementById('modal').classList.add('open');}
function closeModal(){document.getElementById('modal').classList.remove('open');mi=-1;}
function fill(){const c=CARDS[mi];const st=state[c.slug]||{v:'',c:''};
  document.getElementById('mimg').src=c.src||'';
  document.getElementById('mname').textContent=c.name;
  document.getElementById('mslug').textContent=c.slug;
  const ms=document.getElementById('mstatus');ms.textContent=c.status;ms.className='mstatus badge '+c.status;
  document.getElementById('mscene').textContent=c.scene;
  document.getElementById('mprompt').textContent=c.prompt;
  document.getElementById('mexits').textContent=c.exits.join(' · ')||'—';
  document.getElementById('mcomment').value=st.c||'';
  document.getElementById('mcompare').style.display=c.prev?'':'none';
  document.querySelectorAll('.mverdicts .v').forEach(v=>v.classList.toggle('on',v.dataset.v===st.v));
  const vis=visibleIdx();const pos=vis.indexOf(mi);
  document.getElementById('mpos').textContent=(pos+1)+' / '+vis.length;
}
function showPrev(on){const c=CARDS[mi];if(!c||!c.prev)return;document.getElementById('mimg').src=on?c.prev:c.src;}
function modalVote(v){const c=CARDS[mi];vote(c.slug,v);fill();}
function modalComment(val){const c=CARDS[mi];const cur=state[c.slug]||{v:'',c:''};cur.c=val;if(!cur.v&&!val){/*keep*/}state[c.slug]=cur;save();}
function nav(d){const vis=visibleIdx();if(!vis.length)return;let pos=vis.indexOf(mi);pos=(pos+d+vis.length)%vis.length;openModal(vis[pos]);}
document.addEventListener('keydown',e=>{if(!document.getElementById('modal').classList.contains('open'))return;
  if(e.key==='Escape')closeModal();else if(e.key==='ArrowLeft')nav(-1);else if(e.key==='ArrowRight')nav(1);});
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});

function applyFilters(){const on=new Set([...document.querySelectorAll('.f:checked')].map(f=>f.value));document.querySelectorAll('.card').forEach(c=>{c.style.display=on.has(c.dataset.status)?'':'none';});}
document.querySelectorAll('.f').forEach(f=>f.addEventListener('change',applyFilters));

function emit(){const g={approve:[],regen:[],reject:[]};
  CARDS.forEach(c=>{const st=state[c.slug];if(!st)return;
    if(c.status==='approved'&&st.v==='approve')return; // already committed
    const note=(st.c||'').trim();g[st.v]&&g[st.v].push(st.v==='approve'?c.slug:(note?c.slug+' — '+note:c.slug));});
  const L=[];if(g.approve.length)L.push('APPROVE: '+g.approve.join(' '));
  if(g.regen.length)L.push('REGEN:\\n  '+g.regen.join('\\n  '));
  if(g.reject.length)L.push('REJECT:\\n  '+g.reject.join('\\n  '));
  const t=L.join('\\n')||'(no new verdicts)';document.getElementById('out').value=t;navigator.clipboard&&navigator.clipboard.writeText(t);}

render();
</script></body></html>`;

  const outPath = path.join(reviewDir, 'review.html');
  fs.writeFileSync(outPath, html);
  console.log(`Tracker: ${counts.approved} approved · ${counts.review} in review · ${counts.pending} pending  (of ${cards.length})`);
  console.log(`Open: file:///${outPath.replace(/\\/g, '/')}`);
}

main();
