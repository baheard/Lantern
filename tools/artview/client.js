let STATE=null, ARTISTS=null, GLYPHS=null, GAMES={}, GAMEINFO={}, topic=null, curGame=null, curItem=null, sel=null, ver=0;
let BLOCKOUTS=null, pendingBlockoutView=null;   // Blockout rail section: all volumes (grouped by game) + pending room camera
let GENS=[];          // in-flight generations (from /api/jobs poll) — drives the progress banner
let _genSeen={};      // jobId → last-seen status, to fire a toast/refresh on the running→done edge
// Which generator Regenerate uses; persists across re-renders. Default = OpenAI low
// (cheap prototyping) per project preference; switch to Gemini/OpenAI-high for finals.
let genMode='openai-low';
// How Regenerate uses the selected image's note. clean = composed prompt only (today's
// behavior); notes = composed + the note appended as "Adjustments:" (cheap text re-roll,
// fresh composition); edit = surgical img2img — selected image as --ref, note as the edit
// instruction (preserves composition). Persists across re-renders.
let regenMode='clean';
const postJSON=(url,body)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function loadGame(slug){const gi=await (await fetch('/api/game?slug='+encodeURIComponent(slug))).json();GAMES[slug]=gi.locations;GAMEINFO[slug]={aesthetic:gi.aesthetic,artist:gi.artist,app:gi.app||'',blockouts:gi.blockouts||[]};return gi;}
const $=s=>document.querySelector(s);
const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function toast(m){const s=$('#status');s.textContent=m;s.classList.add('show');clearTimeout(s._t);s._t=setTimeout(()=>s.classList.remove('show'),2200);}
// Inline modal — replaces window.prompt()/confirm(), which Chrome SUPPRESSES in the
// chromeless --app= window that artview.ps1 launches (that's why "+ New artist" looked
// dead). fields: [{key,label,type:'text'|'textarea',value,placeholder}]. Resolves to
// {key:value,...} on OK, or null on Cancel/Escape.
function askModal(title, fields, okLabel){
  return new Promise(resolve=>{
    const m=$('#modal');
    const rows=fields.map(f=>{
      const id='mf_'+f.key;
      const input=f.type==='textarea'
        ? '<textarea id="'+id+'" rows="4" placeholder="'+esc(f.placeholder||'')+'">'+esc(f.value||'')+'</textarea>'
        : '<input id="'+id+'" type="text" value="'+esc(f.value||'')+'" placeholder="'+esc(f.placeholder||'')+'">';
      return '<label class="mfld"><span>'+esc(f.label)+'</span>'+input+'</label>';
    }).join('');
    m.innerHTML='<div class="mbox"><h3>'+esc(title)+'</h3>'+rows+
      '<div class="mbtns"><button class="mcancel">Cancel</button><button class="mok">'+esc(okLabel||'Create')+'</button></div></div>';
    m.classList.add('show');
    const close=v=>{m.classList.remove('show');m.innerHTML='';document.removeEventListener('keydown',onkey,true);resolve(v);};
    const submit=()=>{const out={};for(const f of fields){const el=$('#mf_'+f.key);out[f.key]=el?el.value:'';}close(out);};
    const onkey=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(null);}
      else if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();e.stopPropagation();submit();}
    };
    document.addEventListener('keydown',onkey,true);
    m.querySelector('.mcancel').onclick=()=>close(null);
    m.querySelector('.mok').onclick=submit;
    m.querySelector('.mbox').onclick=e=>e.stopPropagation();
    m.onclick=()=>close(null);
    const first=m.querySelector('input,textarea'); if(first) first.focus();
  });
}
function fmtElapsed(s){const m=Math.floor(s/60),ss=s%60;return m?(m+':'+String(ss).padStart(2,'0')):(ss+'s');}
function renderGens(jobs){
  const box=$('#gens'); if(!box)return;
  const running=jobs.filter(j=>j.status==='running');
  const queued=jobs.filter(j=>j.status==='queued');
  if(!running.length&&!queued.length){box.classList.remove('show');box.innerHTML='';return;}
  box.classList.add('show');
  const qNote=queued.length?' <span style="opacity:.6">(+'+queued.length+' queued)</span>':'';
  box.innerHTML=running.map(j=>'<div class="genrow"><span class="spin">⟳</span> Generating <b>'+esc(j.slug)+'</b> · '+esc(j.mode)+' · '+fmtElapsed(j.elapsed)+(j.game!==curGame?(' · '+esc(j.game)):'')+qNote+'</div>').join('')+(running.length?'':'<div class="genrow"><span class="spin">⟳</span> '+queued.length+' image(s) queued…</div>');
}
// Bottom-left generation log — a per-server in-memory ring (survives nothing but the process,
// but catches FAILs that the progress banner prunes). Polls only while the panel is open.
let LOGS_OPEN=false, _logsT=null;
function toggleLogs(){
  LOGS_OPEN=!LOGS_OPEN;
  const p=$('#logsPanel'); if(p) p.classList.toggle('show',LOGS_OPEN);
  if(LOGS_OPEN){ refreshLogs(); _logsT=setInterval(refreshLogs,2000); }
  else { clearInterval(_logsT); _logsT=null; }
}
async function refreshLogs(){
  if(!LOGS_OPEN) return;
  let data; try{ data=await (await fetch('/api/logs')).json(); }catch(e){ return; }
  const p=$('#logsPanel'); if(!p||!LOGS_OPEN) return;
  const logs=data.logs||[];
  const atBottom = p.scrollHeight - p.scrollTop - p.clientHeight < 60;
  const rows = logs.length
    ? logs.map(l=>{ const cls=/FAIL|error/i.test(l.msg)?'bad':(/OK|done/i.test(l.msg)?'good':'');
        return '<div class="ll '+cls+'"><span class="lt">'+esc((l.t||'').slice(11))+'</span>'+esc(l.msg)+'</div>'; }).join('')
    : '<div class="ll" style="opacity:.55;padding:10px 12px">No generation activity yet on this server.</div>';
  p.innerHTML='<div class="logshead">Generation log <span class="ct">'+logs.length+'</span>'
    +'<button class="logsx" title="Close" onclick="toggleLogs()">✕</button></div>'+rows;
  if(atBottom) p.scrollTop=p.scrollHeight;   // keep pinned to newest unless the user scrolled up
}
// Poll server-side job state — the single source of truth for generation progress. Because it
// lives on the server, the banner + completion refresh work across navigation AND full reloads.
let BOOT=null;   // server process id; if it changes, the server was restarted → reload to reconnect
async function pollGens(){
  let data; try{ data=await (await fetch('/api/jobs')).json(); }catch(e){ return; }
  if(data.boot){ if(BOOT===null) BOOT=data.boot; else if(data.boot!==BOOT){ location.reload(); return; } }
  let jobs=data.jobs||[];
  GENS=jobs; renderGens(jobs);
  jobs.forEach(j=>{
    const prev=_genSeen[j.id];
    if(prev==='running' && j.status==='done'){
      toast('✓ '+j.slug+' ready ('+j.file+')');
      if(j.kind==='audition'){
        if(topic==='audition' && curItem===j.game){ ver++; reloadAudition(); }
      } else if(j.kind==='sandbox'){
        if(topic==='sandbox' && curItem===j.game){ ver++; SBXW.sel=j.file; reloadSandbox(); }
      } else if(topic==='titles' && curGame===j.game){ if(curItem===j.slug){ ver++; openItem(curItem); } }
      else if(curGame===j.game){ ver++; loadGame(curGame).then(()=>{ if(isGame(topic)){ renderItems(); if(curItem===j.slug) openItem(curItem); } }); }
    } else if(prev==='running' && j.status==='error'){
      toast('✗ '+j.slug+' failed: '+(j.error||'see log'));
    }
  });
  const ns={}; jobs.forEach(j=>ns[j.id]=j.status); _genSeen=ns;
  // Keep the current location's Regenerate button in sync without a full re-render.
  const b=$('#bRegen');
  if(b&&curLoc){ const busy=jobs.some(j=>j.status==='running'&&j.game===curGame&&j.slug===curLoc.slug);
    b.disabled=busy; b.textContent=busy?'Generating…':'Generate ▸'; }
  const sb=$('#bSbxGen');
  if(sb){ const busy=jobs.some(j=>j.status==='running'&&j.kind==='sandbox'&&j.game===curGame);
    sb.disabled=busy; sb.textContent=busy?'Generating…':'Generate ▸'; }
}
// A note is a string (open) or {note,status,appliedTo?,resolved?}. Read text/status shape-safely.
const noteRaw=k=>(STATE&&STATE.notes&&STATE.notes[k]);
const noteVal=k=>{const v=noteRaw(k);return v==null?'':(typeof v==='string'?v:(v.note||''));};
const noteStatusOf=k=>{const v=noteRaw(k);return (v&&typeof v==='object'&&v.status)?v.status:'open';};
async function saveNote(key,text){const r=await (await postJSON('/api/note',{key,text})).json();if(STATE){STATE.notes=STATE.notes||{};if(r.note==null)delete STATE.notes[key];else STATE.notes[key]=r.note;}return r;}
async function setNoteStatus(key,status,appliedTo){const r=await (await postJSON('/api/note-status',{key,status,appliedTo})).json();if(r.ok&&STATE){STATE.notes=STATE.notes||{};STATE.notes[key]=r.note;}return r;}
const isGame=t=>t&&t.indexOf('g:')===0;
const gameOf=t=>isGame(t)?t.slice(2):null;

const NAVKEY='artreview_nav';
// Persisted navigation: last topic, the last-selected item PER topic (so switching topics
// and coming back restores where you were), and scroll positions keyed by topic|item
// (detail pane) and topic (item list) — so a reload doesn't dump you at the top.
let NAV={topic:null,byTopic:{},scroll:{},listScroll:{}};
try{const s=JSON.parse(localStorage.getItem(NAVKEY)||'{}');
  NAV={topic:s.topic||null,byTopic:s.byTopic||{},scroll:s.scroll||{},listScroll:s.listScroll||{}};}catch(e){}
function persistNav(){try{localStorage.setItem(NAVKEY,JSON.stringify(NAV));}catch(e){}}
let _navT=null;
function scheduleNavPersist(){clearTimeout(_navT);_navT=setTimeout(persistNav,300);}
function saveNav(){NAV.topic=topic; if(curItem!=null) NAV.byTopic[topic]=curItem; persistNav();}
// Browser-style back/forward over (topic,item) navigation. Every settled navigation funnels
// through openItem() (and the empty-topic branch of selectTopic), which calls pushHist().
// histGo() replays an entry with histNavigating set so the replay itself doesn't push.
let HIST=[], HISTI=-1, histNavigating=false;
function pushHist(){
  if(histNavigating) return;
  const top=HIST[HISTI];
  if(top && top.topic===topic && top.item===curItem) return;   // re-render / no-op move
  HIST=HIST.slice(0,HISTI+1);   // drop any forward branch
  HIST.push({topic,item:curItem}); HISTI=HIST.length-1;
  updateNavBtns();
}
function updateNavBtns(){
  const b=$('#navBack'), f=$('#navFwd');
  if(b) b.disabled=HISTI<=0;
  if(f) f.disabled=HISTI>=HIST.length-1;
}
async function histGo(d){
  const ni=HISTI+d; if(ni<0||ni>=HIST.length) return;
  HISTI=ni; const e=HIST[HISTI];
  histNavigating=true;
  try{
    if(e.topic!==topic) await selectTopic(e.topic, e.item==null?undefined:e.item);
    else if(e.item!=null && e.item!==curItem) await openItem(e.item);
  } finally { histNavigating=false; }
  updateNavBtns();
}
function scrollKey(){return topic+'|'+curItem;}
function detailScroller(){return document.querySelector('#detail .loc-left, #detail .aud-wrap, #detail .sbx-left');}
// Restore the remembered scroll for the current topic|item and keep it updated as you scroll.
// Called at the end of every detail render so it survives in-place re-renders (pollGens,
// edit cancel, act) as well as navigation.
function afterDetailRender(){
  const el=detailScroller(); if(!el) return;
  const k=scrollKey(), y=NAV.scroll[k];
  if(y!=null){ el.scrollTop=y; requestAnimationFrame(()=>{ if(el.isConnected) el.scrollTop=y; }); }
  el.onscroll=()=>{ NAV.scroll[k]=el.scrollTop; scheduleNavPersist(); };
}
async function loadAll(){
  STATE=await (await fetch('/api/state')).json();
  GLYPHS=await (await fetch('/api/glyphs')).json();
  buildRail();
  let t=NAV.topic;
  const valid=t==='placeholders'||t==='artist'||t==='audition'||t==='sandbox'||t==='blockout'||(isGame(t)&&STATE.games.indexOf(gameOf(t))>=0);
  if(!valid) t=STATE.games[0]?'g:'+STATE.games[0]:'placeholders';   // fresh browser only; NAV (localStorage) wins otherwise
  selectTopic(t);   // no explicit item → selectTopic restores NAV.byTopic[t]
  pollGens(); setInterval(pollGens, 2000);   // progress banner + cross-navigation completion refresh
}
// Backstop: capture live scroll positions right before a reload (the debounced onscroll
// handler usually has them already, but a fast reload could outrun the 300ms timer).
window.addEventListener('beforeunload',()=>{
  const el=detailScroller(); if(el) NAV.scroll[scrollKey()]=el.scrollTop;
  const il=$('#itemlist'); if(il) NAV.listScroll[topic]=il.scrollTop;
  persistNav();
});
function buildRail(){
  const games=STATE.games.map(g=>'<div class="topic" data-t="g:'+g+'">'+esc(g)+'</div>').join('');
  $('#rail').innerHTML='<div class="brand">Art Review</div>'+
    '<div class="navbtns"><button id="navBack" title="Back (Alt+←)">‹ Back</button><button id="navFwd" title="Forward (Alt+→)">Fwd ›</button></div>'+
    games+'<div class="sep"></div>'+
    '<div class="topic" data-t="titles">Title Images</div>'+
    '<div class="topic" data-t="blockout">Blockout 3D</div><div class="topic" data-t="audition">Audition</div><div class="topic" data-t="sandbox">Sandbox</div><div class="topic" data-t="placeholders">Placeholders</div><div class="topic" data-t="artist">Artist</div>';
  document.querySelectorAll('.topic').forEach(d=>d.onclick=()=>selectTopic(d.dataset.t));
  const bb=$('#navBack'); if(bb) bb.onclick=()=>histGo(-1);
  const ff=$('#navFwd'); if(ff) ff.onclick=()=>histGo(1);
  updateNavBtns();
}
async function selectTopic(t, wantItem){
  topic=t; curItem=null; sel=null;
  document.querySelectorAll('.topic').forEach(d=>d.classList.toggle('active',d.dataset.t===t));
  if(isGame(t)){
    curGame=gameOf(t);
    if(!GAMES[curGame]) await loadGame(curGame);
    $('#itemhead').textContent=curGame+' · locations';
  } else if(t==='artist'){
    ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    $('#itemhead').innerHTML='Artists <button id="bNewArt" class="newbtn" title="Create a new artist">+ New</button>';
    const nb=$('#bNewArt'); if(nb) nb.onclick=newArtist;
  } else if(t==='audition'){
    $('#itemhead').textContent='Audition · pick a game';
  } else if(t==='sandbox'){
    $('#itemhead').textContent='Sandbox · pick a game';
  } else if(t==='blockout'){
    BLOCKOUTS=((await (await fetch('/api/blockouts')).json()).blockouts)||[];
    $('#itemhead').textContent='Blockouts · by game';
  } else if(t==='titles'){
    $('#itemhead').textContent='Title Images';
  } else { $('#itemhead').textContent='Glyphs'; }
  // Location filter: only meaningful for the per-game location list. Reset on topic switch.
  itemFilter=''; const fi=$('#itemfilter');
  if(fi){ fi.style.display=isGame(t)?'block':'none'; fi.value='';
    fi.oninput=()=>{ itemFilter=fi.value; renderItems(); }; }
  renderItems();
  const list=items();
  // Prefer an explicit item, else the last-selected item remembered for THIS topic, else first.
  const remembered=(wantItem!=null)?wantItem:NAV.byTopic[t];
  const target=(remembered&&list.some(x=>x.id===remembered))?remembered:((list.find(x=>x.id)||{}).id);
  if(target) await openItem(target); else { $('#detail').innerHTML='<p class="none">Nothing here yet.</p>'; saveNav(); pushHist(); }
}
function items(){
  if(isGame(topic)) return (GAMES[curGame]||[]).map(l=>({id:l.slug,name:l.name,mark:l.committed?'●':(l.candidates.length?'○':'·'),has:!!l.committed,count:l.candidates.length}));
  if(topic==='placeholders') return (GLYPHS.glyphs||[]).map(g=>({id:g.id,name:g.id,mark:g.id===GLYPHS.selected?'●':'·',has:g.id===GLYPHS.selected}));
  // Audition / Sandbox are per-game → the item list is the games (pick one to work on).
  if(topic==='audition'||topic==='sandbox') return (STATE.games||[]).map(g=>({id:g,name:g,mark:'·',has:false}));
  // Title Images: one slot per game (its title/cover) + two app-level heroes.
  if(topic==='titles'){ const out=(STATE.games||[]).map(g=>({id:g,name:g,mark:'·',has:false}));
    out.push({header:true,name:'App-level'});
    out.push({id:'app-hero',name:'App Hero',mark:'·',has:false},{id:'mobile-hero',name:'Mobile Hero',mark:'·',has:false});
    return out; }
  // Blockout: every volume across all games, grouped by game with a header before each group.
  if(topic==='blockout'){ const out=[]; let lastG=null;
    (BLOCKOUTS||[]).forEach(b=>{ if(b.game!==lastG){ out.push({header:true,name:b.game}); lastG=b.game; }
      out.push({id:b.game+'::'+b.volume,name:b.title||b.volume,mark:'·',has:false}); });
    return out; }
  return (ARTISTS.artists||[]).map(a=>({id:a.id,name:a.name,mark:a.id===ARTISTS.selected?'●':'·',has:a.id===ARTISTS.selected}));
}
let itemFilter='';
function renderItems(){
  const il=$('#itemlist');
  const q=itemFilter.trim().toLowerCase();
  const list=q?items().filter(it=>it.header||(it.name||'').toLowerCase().includes(q)):items();
  il.innerHTML=list.map(it=>it.header
    ?'<div style="padding:10px 10px 2px;font-size:11px;color:#8a8398;text-transform:uppercase;letter-spacing:.06em">'+esc(it.name)+'</div>'
    :'<div class="item'+(it.id===curItem?' active':'')+'" data-id="'+it.id+'"><span>'+esc(it.name)+'</span>'+
    '<span class="dot '+(it.has?'has':'')+'">'+it.mark+(it.count?' '+it.count:'')+'</span></div>').join('')||'<p class="none" style="padding:12px">none</p>';
  document.querySelectorAll('.item').forEach(d=>d.onclick=()=>openItem(d.dataset.id));
  const ly=NAV.listScroll[topic]; if(ly!=null) il.scrollTop=ly;
  il.onscroll=()=>{ NAV.listScroll[topic]=il.scrollTop; scheduleNavPersist(); };
}
let curTitleAspect=null;   // aspect for the active title slot's Generate (null → server default 3:4)
// Title slots carry their OWN artist (a per-slot override, independent of the game's house
// artist) so a cover can use a different artist than the rooms. curTitleArtist={id,name,style};
// curTitleArtists is the roster for the dropdown. Both null outside the Title Images topic.
let curTitleArtist=null, curTitleArtists=null, curHeroPrompt='';
async function openItem(id){ curItem=id; renderItems(); saveNav();
  if(topic==='titles'){ await detailTitle(id); pushHist(); return; }
  curTitleAspect=null; curTitleArtist=null; curTitleArtists=null;
  if(isGame(topic)) await detailLocation((GAMES[curGame]||[]).find(l=>l.slug===id));
  else if(topic==='placeholders') detailGlyph((GLYPHS.glyphs||[]).find(g=>g.id===id));
  else if(topic==='audition') await detailAudition(id);
  else if(topic==='sandbox') await detailSandbox(id);
  else if(topic==='blockout') detailBlockout(id);
  else detailArtist((ARTISTS.artists||[]).find(a=>a.id===id));
  pushHist();
}
// Embed the generic 3D renderer (served self-contained from /blockout) for the chosen volume.
// pendingBlockoutView (set when arriving via a location's 📦 button) opens at that room's camera.
function detailBlockout(id){
  const [game,volume]=String(id).split('::');
  const b=(BLOCKOUTS||[]).find(x=>x.game===game&&x.volume===volume)||{};
  const view=pendingBlockoutView; pendingBlockoutView=null;
  let src='/blockout?src='+encodeURIComponent('/api/blockout?game='+game+'&volume='+volume)+'&game='+encodeURIComponent(game)+'&volume='+encodeURIComponent(volume);
  if(view) src+='&view='+encodeURIComponent(view);
  $('#detail').innerHTML='<div class="loc-wrap" style="flex-direction:column;height:100%;gap:8px">'+
    '<div style="padding:4px 2px"><b>'+esc(b.title||volume)+'</b> <span style="color:#8a8398">· '+esc(game)+' · members: '+esc((b.members||[]).join(', '))+'</span></div>'+
    '<iframe src="'+src+'" style="flex:1;width:100%;border:1px solid #2a2536;border-radius:8px;min-height:72vh;background:#888"></iframe></div>';
}
function noteSection(key){return '<div class="sec"><label class="ed">Notes / feedback</label><textarea class="edit" id="inote" placeholder="What you think — usually means: regen. (Claude reads these to tune the artist.)">'+esc(noteVal(key))+'</textarea></div>';}
function wireNote(key){const n=$('#inote');if(n)n.onblur=()=>saveNote(key,n.value);}

let curLoc=null, curArtist=null, artSel=null, AUD=null, audLBList=[], audGrid=[], audFinalistsOnly=false;
// Candidate-strip sort (persists across re-renders). 'date' = newest first; 'model' groups by
// generator (cheap→pricey); 'name' = filename. Sorts l.candidates IN PLACE so the rendered strip
// AND the arrow-key nav (which reads l.candidates) stay in the same order.
let candSort='date';
const MODEL_RANK={'oai-low':0,'oai-med':1,'oai-high':2,'gem':3,'gem-pro':4,'':5};
function modelOf(f){const m=(f||'').match(/[-_](gem-pro|gem|oai-(?:low|med|high))-r\d+\.png$/i);return m?m[1].toLowerCase():'';}
function sortCands(l){
  const nm=f=>(f.indexOf('aud:')===0?f.slice(4):f).toLowerCase();
  const mt=f=>(l.mtimes&&l.mtimes[f])||0;
  const rk=f=>{const r=MODEL_RANK[modelOf(f)];return r==null?9:r;};
  l.candidates.sort((a,b)=>{
    if(candSort==='name') return nm(a).localeCompare(nm(b));
    if(candSort==='model') return (rk(a)-rk(b))||nm(a).localeCompare(nm(b));
    return (mt(b)-mt(a))||nm(a).localeCompare(nm(b));   // date: newest first
  });
}
function detailLocation(l){
  if(!l){$('#detail').innerHTML='<p class="none">No location.</p>';return;}
  curLoc=l;
  sortCands(l);
  if(!sel||l.candidates.indexOf(sel)<0) sel=l.committed||l.candidates[0]||null;
  const gi=GAMEINFO[curGame]||{artist:{},aesthetic:''};
  const art=(gi.artist&&gi.artist.name)||'(none)';
  // Is this location a member of a 3D blockout volume? If so, offer a link to view it.
  const bo=(gi.blockouts||[]).find(b=>(b.members||[]).indexOf(l.slug)>=0);
  const boBtn=bo?'<button id="bBlockout" title="View this room in the '+esc(bo.title)+' 3D blockout">📦 Blockout</button>':'';
  const cands=l.candidates.map(f=>{const isC=l.committedSource===f;
    const aud=(l.auditions||{})[f];
    const meta=(l.candMeta||{})[f]||{};
    const audChip=aud?'<span class="mchip m-aud" title="Audition piece">aud</span>':'';
    const aChip=meta.artistName?'<span class="mchip m-art" title="Artist">'+esc(meta.artistName)+'</span>':'';
    const mChip=mchipTag(meta.modelTag||modelOf(f));
    const dChip=dchip((l.mtimes||{})[f]);
    return '<div class="cand'+(f===sel?' sel':'')+(isC?' committed':'')+(aud?' aud':'')+'" data-f="'+esc(f)+'" title="'+esc(aud?f.slice(4):f)+'">'+candImg(f)+
      '<div class="cap"><span class="meta">'+audChip+aChip+mChip+dChip+'</span></div></div>';}).join('');
  // Scope-tagged field helper: tag chip + label + a read-only value box.
  const field=(scope,tag,label,val,cls)=>'<div class="sec scope-'+scope+'"><label class="ro"><span class="tag">'+tag+'</span>'+esc(label)+'</label>'+
    '<div class="val '+(cls||'')+'">'+esc(val)+'</div></div>';
  // LEFT column (widest): candidate strip, then read-only reference layers (In-game prose →
  // Artist → Style), then the ONLY editable prompt layer (Scene), Composed, Actual, Notes.
  const left='<h1>'+esc(l.name)+'</h1><div class="sub">'+(l.exits.length?l.exits.join('  ·  '):'no recorded exits')+'</div>'+
    '<div class="btns"><button id="bSetTitle" '+(sel?'':'disabled')+' title="Use the selected image as this game\'s title/cover (shown on the home game card)">★ Set as title</button>'+
      '<button id="bSandbox" title="Open the Sandbox pre-loaded with this location\'s layers to play freely">⚗ Sandbox!</button>'+boBtn+
      '<button class="primary" id="bProm" '+(sel?'':'disabled')+'>Promote → in game</button>'+
      '<button class="danger" id="bRej" '+(sel?'':'disabled')+'>Delete selected</button>'+
      '<span class="segmode" id="regenSeg" title="How the selected image\'s note feeds Generate">'+
        '<button data-rm="clean" title="Composed prompt only — ignores the note">Clean</button>'+
        '<button data-rm="notes" title="Composed prompt + the note as an Adjustments line (cheap text re-roll)">+Notes</button>'+
        '<button data-rm="edit" title="Img2img: feed the selected image back in, note = edit instruction (preserves composition)">Edit img</button>'+
      '</span>'+
      // Model selector hidden for now — always OpenAI · low. Kept in DOM so genMode reads a value.
      '<select id="genMode" class="genmode" style="display:none" title="Which generator Generate uses">'+
        '<option value="openai-low">OpenAI · low — cheap proto (~$0.006)</option>'+
        '<option value="gemini">Gemini · finals (~$0.04)</option>'+
        '<option value="openai-medium">OpenAI · medium (~$0.05)</option>'+
        '<option value="gemini-pro">Nano Banana Pro (~$0.13)</option>'+
      '</select>'+
      '<button id="bRegen" style="margin-left:auto">Generate ▸</button></div>'+
    '<div class="candbar">'+(l.candidates.length>1?'<label>Sort <select id="candSort">'+
        '<option value="date">date (newest)</option><option value="name">name</option>'+
        '<option value="model">model</option></select></label>':'')+'</div>'+
    '<div class="cands">'+(cands||'<span class="none">No candidates yet — Generate to create one.</span>')+'</div>'+
    // Actual prompt that made the selected image — TOP, right under the candidates.
    '<div class="sec scope-image"><label class="ro"><span class="tag">Per-image</span>Actual prompt used for the selected image</label><div class="val" id="actual">(none)</div></div>'+
    // Layers are shown in REVERSE hierarchy (closest-to-this-room first): In-game prose → Scene
    // → Game → Artist → App. The Composed prompt below re-orders them to App ▸ Artist ▸ Game ▸ Scene.
    // In-game prose — canonical room text; old-school mono container so it stands apart.
    // A 🔍 badge shows how many examine/look reveals (beyond the first-visit description) were
    // folded into this image; clicking it opens a modal listing each command and its prose.
    ((l.sceneExtras&&l.sceneExtras.length)
      ? '<div class="sec scope-ingame"><label class="ro"><span class="tag">In-game</span>In-game prose · canonical room text'
          +'<button class="extras-badge" id="bExtras" title="'+l.sceneExtras.length+' examine/look reveal(s) beyond the room description colored this image — click to view">🔍 '+l.sceneExtras.length+'</button></label>'
          +'<div class="val ingame-prose">'+esc(l.description||'(none)')+'</div></div>'
      : field('ingame','In-game','In-game prose · canonical room text', l.description||'(none)','ingame-prose'))+
    // Scene — editable; live-updates Composed. Sits right next to the In-game prose by design.
    '<div class="sec scope-scene scope-editable"><label class="ed"><span class="tag">Scene · editable</span>Scene · this location</label>'+
      '<textarea class="edit scene-edit" id="eScene" placeholder="'+esc(l.sceneDefault||'(scene)')+'">'+esc(l.sceneOverride||'')+'</textarea></div>'+
    // Game style (per-game) → Artist (global) → App (global, highest) — all EDITABLE via ✎ Edit.
    '<div class="sec scope-global" data-efield="aesthetic"><label class="ed"><span class="tag">Game · '+esc(curGame)+'</span>Style · this game'+
      '<button class="editbtn" data-edit="aesthetic">✎ Edit</button></label>'+
      '<div class="val" data-view="aesthetic">'+esc(gi.aesthetic?cap(gi.aesthetic):'(not set)')+'</div></div>'+
    '<div class="sec scope-global" data-efield="artist"><label class="ed"><span class="tag">Artist · '+esc(art)+'</span>Signature · all games'+
      '<button class="editbtn" data-edit="artist">✎ Edit</button></label>'+
      '<div class="val" data-view="artist">'+esc((gi.artist&&gi.artist.style)||'(no artist selected)')+'</div></div>'+
    '<div class="sec scope-app" data-efield="app"><label class="ed"><span class="tag">App · all games</span>App instructions · highest layer'+
      '<button class="editbtn" data-edit="app">✎ Edit</button></label>'+
      '<div class="val" data-view="app">'+esc(gi.app||'(not set)')+'</div></div>'+
    '<div class="sec scope-derived"><label class="ro"><span class="tag">Derived</span>Composed prompt → what Regenerate sends</label><div class="val" id="composed"></div></div>'+
    '<div class="sec scope-image"><label class="ed"><span class="tag">Selected image</span>Notes / feedback · <span id="noteFor">'+esc(sel||'no image')+'</span><span class="noteflag" id="noteFlag"></span></label>'+
      '<textarea class="edit" id="inote" placeholder="What you think of THIS image — usually means: regen. (Claude reads these to tune the artist.)"></textarea>'+
      '<div class="noteacts" id="noteActs"></div></div>';
  // RIGHT column: the selected image, alone, filling the height.
  const right='<div class="bigprev empty" id="bigprev"><span>no image selected</span></div>';
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>selectCand(c.dataset.f));
  document.querySelectorAll('#detail .zoom').forEach(b=>b.onclick=(e)=>{e.stopPropagation();openLB(b.dataset.zoom);});
  $('#bProm').onclick=()=>act('/api/promote',{game:curGame,slug:l.slug,candidate:sel},'Promoted '+sel);
  $('#bRej').onclick=()=>rejectSelected();
  { const bt=$('#bSetTitle'); if(bt) bt.onclick=()=>{ if(!sel) return; act('/api/set-title',{game:curGame,candidate:sel},'Set as title for '+curGame); }; }
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>{genMode=gm.value;}; }
  const cs=$('#candSort'); if(cs){ cs.value=candSort; cs.onchange=()=>{candSort=cs.value; detailLocation(curLoc);}; }
  const seg=$('#regenSeg');
  if(seg){ seg.querySelectorAll('button').forEach(b=>{
    b.classList.toggle('on',b.dataset.rm===regenMode);
    b.onclick=()=>{regenMode=b.dataset.rm;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.rm===regenMode));}; }); }
  document.querySelectorAll('#detail .editbtn').forEach(b=>b.onclick=()=>beginEdit(b.dataset.edit));
  $('#bRegen').onclick=()=>doRegen(l);
  { const be=$('#bExtras'); if(be) be.onclick=()=>openExtras(l); }
  if(bo){const bb=$('#bBlockout'); if(bb) bb.onclick=()=>{ pendingBlockoutView=l.slug; selectTopic('blockout', curGame+'::'+bo.volume); };}
  $('#bSandbox').onclick=()=>{
    const gi=GAMEINFO[curGame]||{artist:{},aesthetic:'',app:''};
    // Carry the currently selected picture in (if any): aud:-pieces come from _audition, the
    // rest are _review candidates / committed.
    const adopt=sel?{srcKind:(sel.indexOf('aud:')===0?'audition':'review'), srcFile:sel}:null;
    SANDBOX_PREFILL={game:curGame, app:gi.app||'', aesthetic:gi.aesthetic||'',
      artist:(gi.artist&&gi.artist.style)||'', artistId:(gi.artist&&gi.artist.id)||null,
      artistName:(gi.artist&&gi.artist.name)||'(custom)', locSlug:l.slug, locName:l.name, scene:sceneTextForLoc(l), adopt};
    selectTopic('sandbox', curGame);
  };
  // Scene: live-update Composed on every keystroke, persist on blur.
  const es=$('#eScene');
  const sceneOrig=l.sceneOverride||'';   // guard: only persist a REAL edit
  es.oninput=()=>{l.sceneOverride=es.value;updateComposed();};
  es.onblur=async()=>{
    if(es.value===sceneOrig) return;     // unchanged → never POST (prevents empty-blur DELETING an override)
    await postJSON('/api/scene',{game:curGame,slug:l.slug,tail:es.value});
    toast(es.value.trim()?'Scene saved':'Scene cleared');
  };
  updateComposed(); updateSelUI();
  afterDetailRender();
}
// Modal: every examine/look reveal (beyond the first-visit room description) that was folded into
// this location's scene, attributed to the command that produced it. Read-only — context for why
// the image looks the way it does (e.g. the seated mirror-vision comes entirely from examine mirror).
function openExtras(l){
  const items=(l.sceneExtras||[]).map(e=>
    '<div class="exrow"><div class="excmd">'+esc(e.cmd)+'</div><div class="extext">'+esc(e.text)+'</div></div>').join('')
    ||'<p class="none">No examine/look detail beyond the room description.</p>';
  const ov=document.createElement('div');
  ov.className='exmodal';
  ov.innerHTML='<div class="exbox"><div class="exhead"><b>Beyond the room description</b>'
    +'<span class="exsub">examine / look reveals folded into <i>'+esc(l.name)+'</i></span>'
    +'<button class="exclose">✕</button></div><div class="exbody">'+items+'</div></div>';
  const close=()=>ov.remove();
  ov.onclick=(e)=>{ if(e.target===ov) close(); };
  ov.querySelector('.exclose').onclick=close;
  document.addEventListener('keydown',function esc(e){ if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);} });
  document.body.appendChild(ov);
}
// ---- Edit Artist signature (global) / Game style (per-game) inline ----
// Swaps the read-only value box for a textarea + Save/Cancel. Save persists, updates
// GAMEINFO, and re-renders so the Composed prompt reflects the new layer immediately.
function beginEdit(kind){
  const gi=GAMEINFO[curGame]||{};
  const cur = kind==='artist' ? ((gi.artist&&gi.artist.style)||'') : kind==='app' ? (gi.app||'') : (gi.aesthetic||'');
  const sec=document.querySelector('#detail [data-efield="'+kind+'"]'); if(!sec) return;
  const view=sec.querySelector('[data-view="'+kind+'"]'); if(!view) return;
  const btn=sec.querySelector('.editbtn'); if(btn) btn.style.display='none';
  const ta=document.createElement('textarea'); ta.className='edit'; ta.value=cur; ta.style.minHeight='110px';
  const acts=document.createElement('div'); acts.className='editacts';
  const save=document.createElement('button'); save.className='primary'; save.textContent='Save';
  const cancel=document.createElement('button'); cancel.textContent='Cancel';
  acts.append(save,cancel);
  view.replaceWith(ta); ta.after(acts); ta.focus();
  save.onclick=()=>commitEdit(kind, ta.value);
  cancel.onclick=()=>detailLocation(curLoc);
}
async function commitEdit(kind, value){
  const ep = kind==='artist' ? '/api/artist-style' : kind==='app' ? '/api/app-prompt' : '/api/style';
  const payload = kind==='artist' ? {game:curGame, style:value} : kind==='app' ? {prompt:value} : {game:curGame, aesthetic:value};
  try{
    const r=await (await postJSON(ep, payload)).json();
    if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
    if(kind==='app'){ // global — apply to every loaded game so Composed updates everywhere
      Object.keys(GAMEINFO).forEach(g=>{GAMEINFO[g]=GAMEINFO[g]||{};GAMEINFO[g].app=value;});
      toast('App prompt saved (all games)');
    } else {
      const gi=GAMEINFO[curGame]||(GAMEINFO[curGame]={artist:{},aesthetic:''});
      if(kind==='artist'){ gi.artist=gi.artist||{}; gi.artist.style=value; toast('Artist style saved (all games)'); }
      else { gi.aesthetic=value; toast('Game style saved'); }
    }
    detailLocation(curLoc);
  }catch(e){ toast('Error: '+e.message); }
}
// Per-image note key for a candidate file + its location slug. A borrowed audition piece
// (aud:<file>) gets a canonical, page-independent key by its audition filename, so a note on
// the location page and on the Audition page are literally the same note. Native candidates
// stay location-scoped (they never appear on the Audition page).
function imgNoteKey(file, slug){
  if(file && file.indexOf('aud:')===0) return 'aud:'+curGame+':'+file.slice(4);
  return 'game:'+curGame+':'+slug+(file?(':'+file):'');
}
// Per-image note key — feedback is tied to the SELECTED candidate, not the location.
function noteKeyFor(l){ return imgNoteKey(sel, l.slug); }
// Render the note's flag chip + status actions. A note must exist to be flagged; resolved/
// wontfix grey the textarea and offer Re-open; open offers Resolved / Won't fix.
function renderNoteStatus(k){
  const flag=$('#noteFlag'), acts=$('#noteActs'), ta=$('#inote'); if(!flag||!acts) return;
  const hasText=!!noteVal(k).trim(), st=noteStatusOf(k);
  const done=st==='resolved'||st==='wontfix';   // checkbox is binary; both read as "done"
  flag.className='noteflag'+(done?' resolved':'');
  flag.textContent=done?'✓ resolved':'';
  if(ta) ta.classList.toggle('resolved',done);
  // A single Resolved checkbox: check → status resolved, uncheck → re-open. The AI checks it
  // by writing status:"resolved"; the user can check/uncheck freely. Editing the note text
  // re-opens it (server-side), which unchecks the box on the next render.
  acts.innerHTML='<label class="resolvebox"><input type="checkbox" id="nResolved"'+(done?' checked':'')+(hasText?'':' disabled')+'>Resolved</label>';
  const cb=$('#nResolved');
  if(cb) cb.onchange=async()=>{await setNoteStatus(k,cb.checked?'resolved':'open');renderNoteStatus(k);};
}
// Composed from the live layers — Artist + Style + Scene. The Scene component is the
// per-location override if set, else the canonical in-game prose (so editing EITHER the
// Scene box or the In-game prose updates the Composed prompt in real time).
// Artist medium leads + governs lighting (keep in sync with ARTIST_LEAD in review-server.cjs
// server scope and gen-room-images.cjs).
const ARTIST_LEAD='This medium is the PRIMARY instruction for STYLE: render the entire image in this medium and let it govern the linework, palette, colour treatment and finish. But the SCENE itself sets the overall brightness and value key: when the scene describes a dim, dark, or barely-lit space, render it genuinely low-key and shadow-dominated, mostly dark with only the light the scene names, and do NOT add light sources, glow, bright skies or bright reflective surfaces the scene does not mention in order to manufacture contrast.';
function composedPrompt(){
  const gi=GAMEINFO[curGame]||{}; const l=curLoc||{};
  const app=gi.app||'';
  const art=(gi.artist&&gi.artist.style)||'';
  const aes=gi.aesthetic||'';
  const sc=(l.sceneOverride&&l.sceneOverride.trim())||l.description||l.sceneDefault||'';
  // SENT order: Artist (leads, governs lighting) ▸ Scene ▸ Aesthetic ▸ App.
  return [art?(art+' '+ARTIST_LEAD):'', sc?('Scene: '+sc):'', aes?('Aesthetic: '+cap(aes)):'', app?('App: '+app):''].filter(Boolean).join(' ');
}
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
// DISPLAY ONLY: split a composed prompt into Artist / Aesthetic / Scene paragraphs at the
// layer markers (the .val boxes are white-space:pre-wrap, so a blank line shows between).
// What's SENT to the generator is unchanged — this only formats the on-screen text.
// NOTE: this lives inside the PAGE template literal, so a literal backslash-n must be written
// as a double backslash escape, or it becomes a real newline and breaks the client JS.
function breakPrompt(t){ return (t||'').replace(/\s*(Artist:|Aesthetic:|Scene:|App:)/g,'\n\n$1'); }
function updateComposed(){ const c=$('#composed'); if(c) c.textContent=breakPrompt(composedPrompt()); }
async function doRegen(l){
  // Build the prompt + (optional) image reference from the selected mode:
  //   clean = composed prompt only · notes = composed + "Adjustments:" note · edit = img2img.
  let prompt=composedPrompt(), ref=null, refMode=null;
  const note=(noteVal(noteKeyFor(l))||'').trim();
  if(regenMode==='notes'){
    if(!note){ toast('No note on the selected image — add feedback first, or use Clean.'); return; }
    prompt=composedPrompt()+'\n\nAdjustments: '+note;
  } else if(regenMode==='edit'){
    if(!sel){ toast('Select an image to edit first.'); return; }
    if(!note){ toast('No note on the selected image — add an edit instruction first.'); return; }
    prompt=note; ref=sel; refMode='edit';
    if(!confirm('Edit "'+sel+'" via img2img? A reference image bills at the high-fidelity input rate regardless of quality (cheap rate only holds ref-free). Proceed?')) return;
  }
  // Nano Banana Pro is ~3x the cost of finals — confirm before spending.
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image (vs ~$0.04 Gemini finals / ~$0.006 OpenAI low). Generate one?')) return;
  const provider=genMode.startsWith('openai')?'openai':'gemini';
  const quality=genMode==='openai-medium'?'medium':'low';
  const model=genMode==='gemini-pro'?'gemini-3-pro-image-preview':null;
  const b=$('#bRegen'); if(b){b.disabled=true;b.textContent='Generating…';}
  // Fire-and-forget: the SERVER tracks the job and the poller below renders progress + refreshes
  // on completion — so it keeps working (and the new image still lands) even if you navigate away
  // or reload. We don't await the response for UI; we only surface a network/launch error.
  const gi=GAMEINFO[curGame]||{artist:{}};
  postJSON('/api/regen',{game:curGame,slug:l.slug,prompt,provider,quality,model,ref,refMode,
    artistId:(gi.artist&&gi.artist.id)||null, artistName:(gi.artist&&gi.artist.name)||null, aspect:curTitleAspect})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); })
    .catch(e=>toast('Error: '+e.message));
  toast('Generating '+l.slug+(regenMode!=='clean'?(' ['+regenMode+']'):'')+'… (tracked bottom-right — safe to navigate away)');
  setTimeout(pollGens,500);   // pick up the freshly-registered job fast
}
// Small colored chip naming the generator that made a candidate, parsed from the
// filename tag (<slug>-gem-rN / -oai-low-rN / …). Legacy untagged files show nothing.
// Build an <img> for a candidate id. Audition pieces (aud:<file>) come from /img/audition;
// native candidates from /img/review with a committed-copy fallback. attrs = extra attributes.
function candImg(f,attrs){
  attrs=attrs||'';
  if(f&&f.indexOf('aud:')===0){ const file=f.slice(4);
    return '<img '+attrs+' src="/img/audition?game='+curGame+'&f='+encodeURIComponent(file)+'&v='+ver+'">'; }
  return '<img '+attrs+' src="/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'" '+
    'onerror="this.onerror=null;this.src=\'/img/committed?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'\'">';
}
// URL only (no <img> wrapper) for a candidate id — used by the big preview + lightbox.
function candUrl(f){
  if(f&&f.indexOf('aud:')===0) return '/img/audition?game='+curGame+'&f='+encodeURIComponent(f.slice(4))+'&v='+ver;
  return '/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;
}
function mchipTag(tag){ if(!tag) return ''; const t=String(tag).toLowerCase();
  if(!/^(gem-pro|gem|oai-(?:low|med|high))$/.test(t)) return '';
  const label=t==='gem-pro'?'Nano Pro':(t==='gem'?'Gemini':('OpenAI '+t.slice(4)));
  const cls=t==='gem-pro'?'m-pro':(t==='gem'?'m-gem':'m-oai');
  return '<span class="mchip '+cls+'">'+label+'</span>';
}
function mchip(f){ return mchipTag(modelOf(f)); }   // modelOf() reads the tag from the filename
// Date chip from a file mtime (ms) — short, sortable. User chose mtime over a stored timestamp.
function dchip(ms){ if(!ms) return ''; const d=new Date(ms);
  const s=d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  return '<span class="mchip m-date" title="Created (file mtime)">'+esc(s)+'</span>'; }
// Big-preview zoom: click (mouse) OR press-and-hold (touch) opens the full-size overlay.
// On touch we suppress the tap so a stray tap while scrolling doesn't open the overlay —
// you must hold (~380ms) to view full size, per the mobile design.
function bindZoom(im, key){
  im.onclick=(e)=>{ if(im._touched){ im._touched=false; e.preventDefault(); return; } openLB(key); };
  let timer=null;
  im.addEventListener('touchstart',()=>{ im._touched=true; clearTimeout(timer);
    timer=setTimeout(()=>{ openLB(key); }, 380); },{passive:true});
  const cancel=()=>clearTimeout(timer);
  im.addEventListener('touchend',cancel,{passive:true});
  im.addEventListener('touchmove',cancel,{passive:true});
  im.addEventListener('touchcancel',cancel,{passive:true});
}
function selectCand(f){ sel=f; hideLB(); updateSelUI(); }
function updateSelUI(){
  const l=curLoc; if(!l) return;
  document.querySelectorAll('#detail .cand').forEach(c=>c.classList.toggle('sel',c.dataset.f===sel));
  // Big preview: a <img> built fresh from the selected candidate (review → committed fallback).
  const box=$('#bigprev');
  if(box){
    if(sel){ box.classList.remove('empty');
      box.innerHTML=candImg(sel,'alt="'+esc(sel)+'"');
      const im=box.querySelector('img'); if(im) bindZoom(im, sel); }
    else { box.classList.add('empty'); box.innerHTML='<span>no image selected</span>'; }
  }
  const cp=(l.candidatePrompts||{})[sel];
  const av=$('#actual'); if(av) av.textContent=sel?(cp?breakPrompt(cp):'(no recorded prompt for this image)'):'(none)';
  const nf=$('#noteFor'); if(nf) nf.textContent=sel||'no image';
  // Per-image notes: reload the note for THIS image and rebind the blur handler.
  const note=$('#inote');
  if(note){ const k=noteKeyFor(l); note.value=noteVal(k);
    // Editing the text re-opens a flagged note (server unflags); reflect that in the chip.
    note.onblur=async()=>{await saveNote(k,note.value);renderNoteStatus(k);};
    renderNoteStatus(k); }
  const bp=$('#bProm'); if(bp) bp.disabled=!sel;
  const br=$('#bRej'); if(br) br.disabled=!sel;
  const bt=$('#bSetTitle'); if(bt) bt.disabled=!sel;
}
// ---- Title Images: per-game title (view / pick / unselect) + the two app heroes (mini-gen) ----
// A game's title is now just an EXISTING game image you designate via "★ Set as title" on the
// location page — the title nav only views/clears it. The two app heroes have no source game, so
// they keep a stripped-down generator: a prompt + an artist (dropdown), nothing more.
async function detailTitle(id){
  const t=await (await fetch('/api/title?id='+encodeURIComponent(id))).json();
  curItem=id; curGame=t.game; curTitleAspect=t.aspect||null;
  curTitleArtist=t.artist||null; curTitleArtists=t.artists||[];
  curHeroPrompt=(t.location&&t.location.sceneOverride)||'';
  if(t.game==='_app') renderHeroSlot(t); else renderGameTitle(t);
  afterDetailRender();
}
function renderGameTitle(t){
  const l=t.location||{}, committed=l.committed;
  const right=committed
    ? '<div class="bigprev" id="bigprev"><img alt="title" src="/img/committed?game='+curGame+'&f='+encodeURIComponent(committed)+'&v='+ver+'"></div>'
    : '<div class="bigprev empty" id="bigprev"><span>No title set</span></div>';
  const left='<h1>'+esc(t.name)+' · title</h1>'+
    '<div class="sub">The game\'s cover, shown on the home game card. Set it from any image on this game\'s location pages.</div>'+
    '<div class="btns"><button class="primary" id="bPickTitle">Pick from '+esc(curGame)+' locations ▸</button>'+
      '<button class="danger" id="bClearTitle"'+(committed?'':' disabled')+'>Unselect title</button></div>'+
    (committed
      ? '<div class="sec scope-image"><label class="ro"><span class="tag">Current</span>'+esc(committed)+'</label></div>'
      : '<div class="sec"><div class="val">No title image yet. Open a location, select an image, then click <b>★ Set as title</b>.</div></div>');
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  $('#bPickTitle').onclick=()=>selectTopic('g:'+curGame);
  const bc=$('#bClearTitle'); if(bc) bc.onclick=()=>{ if(!committed) return;
    if(confirm('Unselect the title image for '+curGame+'?')) clearTitleSlot(); };
}
function composeHero(){
  const art=(curTitleArtist&&curTitleArtist.style)||'';
  const sc=(curHeroPrompt||'').trim();
  return [art?(art+' '+ARTIST_LEAD):'', sc?('Scene: '+sc):''].filter(Boolean).join(' ');
}
function heroUpdateComposed(){ const c=$('#composed'); if(c) c.textContent=breakPrompt(composeHero()); }
function renderHeroSlot(t){
  const l=t.location||{};
  if(!sel||(l.candidates||[]).indexOf(sel)<0) sel=l.committedSource||(l.candidates||[])[0]||null;
  const cands=(l.candidates||[]).map(f=>{const isC=l.committedSource===f;const meta=(l.candMeta||{})[f]||{};
    const aChip=meta.artistName?'<span class="mchip m-art">'+esc(meta.artistName)+'</span>':'';
    const mChip=mchipTag(meta.modelTag||modelOf(f)); const dChip=dchip((l.mtimes||{})[f]);
    return '<div class="cand'+(f===sel?' sel':'')+(isC?' committed':'')+'" data-f="'+esc(f)+'" title="'+esc(f)+'">'+candImg(f)+
      '<div class="cap"><span class="meta">'+aChip+mChip+dChip+'</span></div></div>';}).join('');
  const artOpts=(curTitleArtists||[]).map(a=>'<option value="'+esc(a.id)+'"'+((curTitleArtist&&a.id===curTitleArtist.id)?' selected':'')+'>'+esc(a.name)+'</option>').join('');
  const left='<h1>'+esc(t.name)+'</h1>'+
    '<div class="sub">App-level hero · '+esc(t.aspect||'')+'. A prompt and an artist, nothing more.</div>'+
    '<div class="btns"><button class="primary" id="bHeroProm" '+(sel?'':'disabled')+'>Set as hero</button>'+
      '<button class="danger" id="bHeroRej" '+(sel?'':'disabled')+'>Delete selected</button>'+
      '<button id="bHeroClear">Unselect hero</button></div>'+
    '<div class="cands">'+(cands||'<span class="none">No candidates yet — Generate to create one.</span>')+'</div>'+
    '<div class="sec scope-global"><label class="ed"><span class="tag">Artist</span>Artist · this hero</label>'+
      '<select id="heroArtist" class="genmode" style="width:100%;margin:2px 0 6px">'+artOpts+'</select>'+
      '<div class="val" id="heroArtStyle">'+esc((curTitleArtist&&curTitleArtist.style)||'(no artist)')+'</div></div>'+
    '<div class="sec scope-scene scope-editable"><label class="ed"><span class="tag">Prompt · editable</span>Prompt · what to draw</label>'+
      '<textarea class="edit scene-edit" id="eHeroPrompt" placeholder="Describe the hero image…">'+esc(curHeroPrompt||'')+'</textarea></div>'+
    '<div class="sec scope-derived"><label class="ro"><span class="tag">Derived</span>Composed prompt → what Generate sends</label><div class="val" id="composed"></div>'+
      '<div class="btns genctrls"><select id="genMode" class="genmode" title="Which generator Generate uses">'+GENMODE_OPTS+'</select>'+
        '<button id="bHeroGen" class="primary">Generate ▸</button></div></div>';
  const right=sel
    ? '<div class="bigprev" id="bigprev">'+candImg(sel,'alt="hero"')+'</div>'
    : '<div class="bigprev empty" id="bigprev"><span>no image selected</span></div>';
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>{ sel=c.dataset.f; renderHeroSlot(t); });
  const ha=$('#heroArtist'); if(ha) ha.onchange=()=>setTitleArtist(ha.value);
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>{genMode=gm.value;}; }
  const ep=$('#eHeroPrompt');
  if(ep){ ep.oninput=()=>{ curHeroPrompt=ep.value; heroUpdateComposed(); };
    ep.onblur=()=>postJSON('/api/scene',{game:'_app',slug:curItem,tail:ep.value}); }
  $('#bHeroGen').onclick=heroGen;
  $('#bHeroProm').onclick=()=>{ if(!sel) return; act('/api/promote',{game:'_app',slug:curItem,candidate:sel},'Set as hero'); };
  $('#bHeroRej').onclick=()=>{ if(!sel) return; if(confirm('Delete this candidate?\n\n'+sel)) act('/api/reject',{game:'_app',candidate:sel},'Deleted '+sel); };
  $('#bHeroClear').onclick=()=>{ if(confirm('Unselect the '+t.name+'?')) clearTitleSlot(); };
  heroUpdateComposed();
}
function heroGen(){
  if(!(curHeroPrompt||'').trim()){ toast('Add a prompt first.'); return; }
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image. Generate one?')) return;
  const {provider,quality,model}=genParams();
  const art=curTitleArtist||{};
  postJSON('/api/regen',{game:'_app',slug:curItem,prompt:composeHero(),provider,quality,model,
    artistId:art.id||null, artistName:art.name||null, aspect:curTitleAspect})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); }).catch(e=>toast('Error: '+e.message));
  toast('Generating '+curItem+'… (tracked bottom-right — safe to navigate away)');
  setTimeout(pollGens,500);
}
// Pick the artist for the active hero slot: persist the per-slot override, update the live
// signature + Composed in place (no full re-render, so the prompt textarea keeps unsaved text).
async function setTitleArtist(id){
  const a=(curTitleArtists||[]).find(x=>x.id===id); if(!a) return;
  curTitleArtist=a;
  const r=await (await postJSON('/api/title-artist',{id:curItem,artistId:id})).json();
  if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
  toast('Artist → '+a.name);
  const sv=$('#heroArtStyle'); if(sv) sv.textContent=a.style||'(no artist)';
  heroUpdateComposed();
}
async function clearTitleSlot(){
  const r=await (await postJSON('/api/clear-title',{id:curItem})).json();
  if(!r.ok){ toast('Error: '+(r.error||'failed')); return; }
  toast('Cleared'); ver++; openItem(curItem);
}
function detailGlyph(g){
  if(!g){$('#detail').innerHTML='<p class="none">No glyph.</p>';return;}
  const isSel=g.id===GLYPHS.selected;
  $('#detail').innerHTML='<h1>'+esc(g.id)+'</h1><div class="sub">Placeholder shown when a game has art but the current room has none.</div>'+
    '<div class="cands"><div class="cand" style="width:190px;cursor:default"><div class="glyphbox">'+g.svg+'</div><div class="cap"><span>'+g.id+'</span>'+(isSel?'<span class="badge">in app</span>':'')+'</div></div></div>'+
    '<div class="btns"><button class="primary" id="bUse" '+(isSel?'disabled':'')+'>'+(isSel?'In use':'Use app-wide')+'</button></div>'+noteSection('glyph:'+g.id);
  $('#bUse').onclick=()=>act('/api/select-glyph',{id:g.id},'Using '+g.id);
  wireNote('glyph:'+g.id);
}
// Create a new artist from the Artist page: prompt for name, summary, and signature,
// POST to the server, then refresh the list and open the new persona.
async function newArtist(){
  const v=await askModal('New artist',[
    {key:'name',label:'Name',placeholder:'e.g. Wren Halloway'},
    {key:'summary',label:'One-line summary (optional)'},
    {key:'style',label:'Style signature — the prompt text that defines this artist (optional, editable later)',type:'textarea'},
  ],'Create');
  if(!v) return;
  if(!v.name.trim()){ toast('Name is required.'); return; }
  const {name,summary,style}=v;
  try{
    const r=await (await postJSON('/api/artist-create',{name,summary,style})).json();
    if(!r.ok){ toast('Error: '+(r.error||'create failed')); return; }
    ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    toast('Artist created: '+r.artist.name);
    renderItems(); openItem(r.artist.id);
  }catch(e){ toast('Error: '+e.message); }
}
function detailArtist(a){
  if(!a){$('#detail').innerHTML='<p class="none">No artist.</p>';return;}
  curArtist=a;
  const isSel=a.id===ARTISTS.selected, gname=curGame||'(no game)';
  const exs=a.examples||[];
  if(!artSel||!exs.some(e=>e.file===artSel)) artSel=exs[0]?exs[0].file:null;
  const cands=exs.map(e=>'<div class="cand'+(e.file===artSel?' sel':'')+'" data-f="'+esc(e.file)+'">'+
    '<img src="/img/artist?f='+encodeURIComponent(e.file)+'">'+
    '<button class="zoom" data-zoom="'+esc(e.file)+'" title="View full screen">🔍</button>'+
    '<div class="cap"><span>'+esc(e.label)+'</span></div></div>').join('');
  // LEFT: name, summary, example strip, style signature, notes. RIGHT: big selected example.
  const left='<h1>'+esc(a.name)+(isSel?' <span class="badge" style="font-size:12px;padding:2px 6px">'+esc(gname)+' artist</span>':'')+'</h1>'+
    '<div class="sub">'+esc(a.summary||'')+'</div>'+
    (a.goodFor?'<div style="font-size:12px;color:#888;margin:2px 0 8px"><em>Good for:</em> '+esc(a.goodFor)+'</div>':'')+
    '<div class="cands">'+(cands||'<span class="none">No examples.</span>')+'</div>'+
    '<div class="sec" data-eartfield="'+esc(a.id)+'"><label class="ro">Style signature <button class="editbtn" data-editartstyle="'+esc(a.id)+'">✎ Edit</button></label><div class="val" data-artstyle="'+esc(a.id)+'">'+esc(a.style||'')+'</div></div>'+noteSection('artist:'+a.id);
  const right='<div class="bigprev empty" id="bigprev"><span>no image selected</span></div>';
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>{artSel=c.dataset.f;updateArtistSel();});
  document.querySelectorAll('#detail .zoom').forEach(b=>b.onclick=(e)=>{e.stopPropagation();openArtistLB(b.dataset.zoom);});
  const esb=$('#detail').querySelector('[data-editartstyle]'); if(esb) esb.onclick=()=>artistEditStyle(a.id);
  wireNote('artist:'+a.id);
  updateArtistSel();
  afterDetailRender();
}
function updateArtistSel(){
  document.querySelectorAll('#detail .cand').forEach(c=>c.classList.toggle('sel',c.dataset.f===artSel));
  const box=$('#bigprev'); if(!box) return;
  if(artSel){ box.classList.remove('empty');
    box.innerHTML='<img alt="" src="/img/artist?f='+encodeURIComponent(artSel)+'">';
    const im=box.querySelector('img'); if(im) im.onclick=()=>openArtistLB(artSel); }
  else { box.classList.add('empty'); box.innerHTML='<span>no image selected</span>'; }
}
// Inline-edit the displayed artist's Style signature on the Artist topic page (✎ Edit).
// Edits by id (any artist, not just the game's selected one), global save like the
// audition grid. Mirrors audEditArtist() but re-renders via detailArtist().
function artistEditStyle(id){
  const box=document.querySelector('#detail [data-artstyle="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); if(!box) return;
  const a=curArtist; if(!a||a.id!==id) return;
  const btn=document.querySelector('#detail [data-editartstyle]'); if(btn) btn.style.display='none';
  const ta=document.createElement('textarea'); ta.className='edit'; ta.value=a.style||''; ta.style.minHeight='160px';
  const acts=document.createElement('div'); acts.className='editacts';
  const save=document.createElement('button'); save.className='primary'; save.textContent='Save';
  const cancel=document.createElement('button'); cancel.textContent='Cancel';
  acts.append(save,cancel);
  box.replaceWith(ta); ta.after(acts); ta.focus();
  save.onclick=async()=>{
    const r=await (await postJSON('/api/artist-style-by-id',{id,style:ta.value})).json();
    if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
    a.style=ta.value;
    if(ARTISTS&&ARTISTS.artists){const ent=ARTISTS.artists.find(x=>x.id===id);if(ent)ent.style=ta.value;}
    toast('Style saved (all games)'); detailArtist(a);
  };
  cancel.onclick=()=>detailArtist(a);
}
// ---- Audition: artists × 3 scenes for one game ----------------------------
const GENMODE_OPTS=
  '<option value="openai-low">OpenAI · low — cheap proto (~$0.006)</option>'+
  '<option value="gemini">Gemini · finals (~$0.04)</option>'+
  '<option value="openai-medium">OpenAI · medium (~$0.05)</option>'+
  '<option value="gemini-pro">Nano Banana Pro (~$0.13)</option>';
function genParams(){
  return {provider:genMode.startsWith('openai')?'openai':'gemini',
    quality:genMode==='openai-medium'?'medium':'low',
    model:genMode==='gemini-pro'?'gemini-3-pro-image-preview':null};
}
function audCellUrl(source,file){ const k=source==='sandbox'?'sandbox':'review'; return '/img/'+k+'?game='+curGame+'&f='+encodeURIComponent(file)+'&v='+ver; }
async function reloadAudition(){ AUD=await (await fetch('/api/audition?game='+encodeURIComponent(curGame))).json(); renderAudition(); }
async function detailAudition(slug){ curGame=slug; await reloadAudition(); }
// ---- Sandbox: free-play workbench (every layer editable, nothing committed) ----
let SBX=null, SBXW=null, SANDBOX_PREFILL=null;
function rosterStyle(id){ const a=(ARTISTS&&ARTISTS.artists||[]).find(x=>x.id===id); return a?(a.style||''):''; }
function rosterName(id){ const a=(ARTISTS&&ARTISTS.artists||[]).find(x=>x.id===id); return a?a.name:(id||'(custom)'); }
function sbxIsEdited(){ return !!SBXW.artistId && (SBXW.artist||'')!==rosterStyle(SBXW.artistId); }
function sceneTextForLoc(l){ return (l&&((l.sceneOverride&&l.sceneOverride.trim())||l.description||l.sceneDefault))||''; }
function defaultSBXW(game,gi){
  return {_game:game, app:gi.app||'', artist:(gi.artist&&gi.artist.style)||'', aesthetic:gi.aesthetic||'',
    scene:'', artistId:(gi.artist&&gi.artist.id)||null, artistName:(gi.artist&&gi.artist.name)||'(custom)',
    locSlug:'', locName:'', sel:null, multi:[]};
}
function composeSandbox(){ const w=SBXW; return [w.app||'', w.artist?('Artist: '+w.artist):'', w.aesthetic?('Aesthetic: '+cap(w.aesthetic)):'', w.scene?('Scene: '+w.scene):''].filter(Boolean).join(' '); }
function sbxUrl(f){ return '/img/sandbox?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver; }
async function reloadSandbox(){ SBX=await (await fetch('/api/sandbox?game='+encodeURIComponent(curGame))).json(); renderSandbox(); }
async function detailSandbox(game){
  curGame=game;
  if(!GAMES[game]) await loadGame(game);
  ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(game))).json();
  SBX=await (await fetch('/api/sandbox?game='+encodeURIComponent(game))).json();
  const gi=GAMEINFO[game]||{artist:{},aesthetic:'',app:''};
  if(!SBXW || SBXW._game!==game) SBXW=defaultSBXW(game,gi);
  // A pending "Sandbox!" prefill (from clicking an image elsewhere) wins, fresh from defaults.
  if(SANDBOX_PREFILL && SANDBOX_PREFILL.game===game){
    const p=SANDBOX_PREFILL; SANDBOX_PREFILL=null; SBXW=defaultSBXW(game,gi);
    if(p.app!=null) SBXW.app=p.app;
    if(p.aesthetic!=null) SBXW.aesthetic=p.aesthetic;
    if(p.artist!=null) SBXW.artist=p.artist;
    if(p.artistId!==undefined){ SBXW.artistId=p.artistId; SBXW.artistName=p.artistName||rosterName(p.artistId); }
    if(p.locSlug){ const l=(GAMES[game]||[]).find(x=>x.slug===p.locSlug); SBXW.locSlug=p.locSlug; SBXW.locName=(l&&l.name)||p.locName||''; if(p.scene==null) SBXW.scene=sceneTextForLoc(l); }
    if(p.scene!=null) SBXW.scene=p.scene;
    // Carry the source picture in: copy it into _sandbox with a sidecar from the resolved
    // layers, then select it. Fields are now fully resolved above, so the sidecar is faithful.
    if(p.adopt && p.adopt.srcFile){
      try{
        const r=await (await postJSON('/api/sandbox-adopt',{game, srcKind:p.adopt.srcKind, srcFile:p.adopt.srcFile,
          fields:{app:SBXW.app,artist:SBXW.artist,aesthetic:SBXW.aesthetic,scene:SBXW.scene},
          meta:{artistId:SBXW.artistId,artistName:SBXW.artistName,edited:sbxIsEdited(),locSlug:SBXW.locSlug,locName:SBXW.locName}})).json();
        if(r.ok){ SBX=await (await fetch('/api/sandbox?game='+encodeURIComponent(game))).json(); SBXW.sel=r.file; }
        else toast('Sandbox: '+(r.error||'could not copy image'));
      }catch(e){ toast('Sandbox: '+e.message); }
    }
  }
  renderSandbox();
}
function renderSandbox(){
  if(!SBXW){ $('#detail').innerHTML='<p class="none">No game.</p>'; return; }
  const game=curGame;
  const gameOpts=(STATE.games||[]).map(g=>'<option value="'+esc(g)+'"'+(g===game?' selected':'')+'>'+esc(g)+'</option>').join('');
  const locOpts='<option value="">— pick a location —</option>'+(GAMES[game]||[]).map(l=>'<option value="'+esc(l.slug)+'"'+(l.slug===SBXW.locSlug?' selected':'')+'>'+esc(l.name)+'</option>').join('');
  const artOpts='<option value="">— custom (unsaved) —</option>'+((ARTISTS&&ARTISTS.artists)||[]).map(a=>'<option value="'+esc(a.id)+'"'+(a.id===SBXW.artistId?' selected':'')+'>'+esc(a.name)+'</option>').join('');
  const cands=(SBX&&SBX.images||[]).map(im=>{
    const lbl=(im.artistName||'custom')+(im.edited?' · edited':'');
    const chip='<span class="mchip m-aud" title="'+esc(lbl+(im.locName?(' — '+im.locName):''))+'">'+esc(lbl)+'</span>';
    const inMulti=(SBXW.multi||[]).indexOf(im.file)>=0;
    return '<div class="cand'+(im.file===SBXW.sel?' sel':'')+(inMulti?' msel':'')+'" data-f="'+esc(im.file)+'"><img src="'+sbxUrl(im.file)+'">'+
      '<div class="cap"><span>'+chip+esc(im.file)+'</span></div></div>';
  }).join('');
  const overLbl=SBXW.artistId?('Overwrite '+SBXW.artistName):'Overwrite artist';
  const left='<h1>Sandbox · '+esc(game)+'</h1>'+
    '<div class="sub">Free-play — load a location &amp; artist, tweak any layer, Generate. Renders persist per game; nothing touches the roster until you commit.</div>'+
    '<div class="sbx-controls">'+
      '<label class="sbxsel">Game<select id="sbxGame">'+gameOpts+'</select></label>'+
      '<label class="sbxsel">Location<select id="sbxLoc">'+locOpts+'</select></label>'+
      '<label class="sbxsel">Artist<select id="sbxArtistSel">'+artOpts+'</select></label>'+
    '</div>'+
    '<div class="btns"><select id="genMode" class="genmode" title="Which generator Generate uses">'+GENMODE_OPTS+'</select>'+
      '<button id="bSbxNew" title="Copy the Artist text into a brand-new roster artist">＋ Save as new artist</button>'+
      '<button id="bSbxOver"'+(SBXW.artistId?'':' disabled')+' title="Write the Artist text back onto the selected artist (global)">'+esc(overLbl)+'</button>'+
      '<button class="danger" id="bSbxDel"'+(SBXW.sel?'':' disabled')+' title="Delete the selected sandbox render (Delete key)">Delete selected</button>'+
      '<button id="bSbxGen">Generate ▸</button></div>'+
    '<div class="cands">'+(cands||'<span class="none">No sandbox renders yet — Generate to create one.</span>')+'</div>'+
    '<div class="sec scope-image"><label class="ro"><span class="tag">Per-image</span>Actual prompt used for the selected render</label><div class="val" id="sbxActual">(none)</div></div>'+
    // Reverse-hierarchy order matching the location page (closest-to-room first, App last);
    // scope classes give each label the SAME colour as on the location page.
    sbxField('scene','Scene'+(SBXW.locName?(' · '+esc(SBXW.locName)):''),'Scene · this location','sbxScene',SBXW.scene)+
    sbxField('global','Game · '+esc(game),'Style · this game','sbxAesthetic',SBXW.aesthetic)+
    sbxField('global','Artist · '+esc(SBXW.artistName||'custom')+(sbxIsEdited()?' (edited)':''),'Signature · all games','sbxArtist',SBXW.artist)+
    sbxField('app','App · all games','App instructions · highest layer','sbxApp',SBXW.app)+
    '<div class="sec scope-derived"><label class="ro"><span class="tag">Derived</span>Composed prompt → what Generate sends</label><div class="val" id="sbxComposed"></div></div>';
  const multi=(SBXW.multi||[]);
  let right;
  if(multi.length){
    // Bulk-select mode: the preview is replaced by a compare grid of the selected renders
    // plus the bulk action menu. Modifier-click candidates to add/remove; plain click exits.
    const tiles=multi.map(f=>'<div class="cmp"><img src="'+sbxUrl(f)+'"><div class="cmpcap">'+esc(f)+'</div></div>').join('');
    right='<div class="sbx-bulk">'+
      '<div class="bulkbar"><b>'+multi.length+' selected</b>'+
        '<span class="hint">shift/ctrl-click to add · plain click exits</span>'+
        '<button id="bBulkClear" class="ghost">Clear</button></div>'+
      '<div class="cmpgrid">'+tiles+'</div>'+
      '<div class="bulkacts">'+
        '<button class="danger" id="bBulkDel">Delete selected ('+multi.length+')</button>'+
        '<button id="bBulkKeep" title="Delete every OTHER sandbox render, keeping only the selected">Keep only these</button>'+
      '</div></div>';
  } else {
    right='<div class="bigprev empty" id="sbxBig"><span>no render selected</span></div>';
  }
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left sbx-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  if(multi.length){ $('#bBulkClear').onclick=sbxClearMulti; $('#bBulkDel').onclick=sbxBulkDelete; $('#bBulkKeep').onclick=sbxBulkKeep; }
  $('#sbxGame').onchange=e=>openItem(e.target.value);
  $('#sbxLoc').onchange=e=>sbxPickLoc(e.target.value);
  $('#sbxArtistSel').onchange=e=>sbxPickArtist(e.target.value);
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>{genMode=gm.value;}; }
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=(e)=>{
    if(e.shiftKey||e.ctrlKey||e.metaKey){ e.preventDefault(); sbxToggleMulti(c.dataset.f); return; }
    if((SBXW.multi||[]).length){ SBXW.multi=[]; }  // plain click leaves bulk mode
    sbxSelect(c.dataset.f);
  });
  $('#bSbxGen').onclick=sbxGen;
  $('#bSbxDel').onclick=()=>sbxReject();
  $('#bSbxNew').onclick=sbxSaveNew;
  $('#bSbxOver').onclick=sbxOverwrite;
  const map={sbxApp:'app',sbxArtist:'artist',sbxAesthetic:'aesthetic',sbxScene:'scene'};
  Object.keys(map).forEach(id=>{ const t=$('#'+id); if(t) t.oninput=()=>{ SBXW[map[id]]=t.value; sbxUpdateComposed(); }; });
  sbxUpdateComposed(); sbxUpdateSel();
  afterDetailRender();
}
function sbxField(scope,tag,label,id,val){
  return '<div class="sec scope-'+scope+'"><label class="ed"><span class="tag">'+tag+'</span>'+label+'</label>'+
    '<textarea class="edit" id="'+id+'">'+esc(val||'')+'</textarea></div>';
}
function sbxUpdateComposed(){ const c=$('#sbxComposed'); if(c) c.textContent=breakPrompt(composeSandbox()); }
function sbxUpdateSel(){
  const box=$('#sbxBig');
  if(box){ if(SBXW.sel){ box.classList.remove('empty'); box.innerHTML='<img alt="" src="'+sbxUrl(SBXW.sel)+'">'; }
    else { box.classList.add('empty'); box.innerHTML='<span>no render selected</span>'; } }
  const im=(SBX&&SBX.images||[]).find(x=>x.file===SBXW.sel);
  const av=$('#sbxActual'); if(av) av.textContent=im?(im.prompt?breakPrompt(im.prompt):'(no recorded prompt)'):'(none)';
}
async function sbxReject(file){
  const f=file||SBXW.sel; if(!f) return;
  if(!confirm('Delete this sandbox render?\n\n'+f)) return;
  await postJSON('/api/sandbox-reject',{game:curGame,file:f});
  if(SBXW.sel===f) SBXW.sel=null;
  await reloadSandbox();
  toast('Deleted '+f);
}
function sbxToggleMulti(file){
  if(!SBXW.multi) SBXW.multi=[];
  const i=SBXW.multi.indexOf(file);
  if(i>=0) SBXW.multi.splice(i,1); else SBXW.multi.push(file);
  renderSandbox();
}
function sbxClearMulti(){ SBXW.multi=[]; renderSandbox(); }
async function sbxBulkDelete(){
  const files=(SBXW.multi||[]).slice(); if(!files.length) return;
  if(!confirm('Delete '+files.length+' sandbox render'+(files.length>1?'s':'')+'?')) return;
  for(const f of files){ await postJSON('/api/sandbox-reject',{game:curGame,file:f}); }
  if(files.indexOf(SBXW.sel)>=0) SBXW.sel=null;
  SBXW.multi=[];
  await reloadSandbox();
  toast('Deleted '+files.length+' render'+(files.length>1?'s':''));
}
async function sbxBulkKeep(){
  const keep=(SBXW.multi||[]).slice(); if(!keep.length) return;
  const drop=((SBX&&SBX.images)||[]).map(im=>im.file).filter(f=>keep.indexOf(f)<0);
  if(!drop.length){ toast('Nothing else to delete.'); return; }
  if(!confirm('Keep only '+keep.length+' render'+(keep.length>1?'s':'')+' and delete the other '+drop.length+'?')) return;
  for(const f of drop){ await postJSON('/api/sandbox-reject',{game:curGame,file:f}); }
  if(drop.indexOf(SBXW.sel)>=0) SBXW.sel=null;
  SBXW.multi=[];
  await reloadSandbox();
  toast('Deleted '+drop.length+', kept '+keep.length);
}
function sbxSelect(file){
  const im=(SBX&&SBX.images||[]).find(x=>x.file===file); if(!im) return;
  SBXW.sel=file;
  SBXW.app=im.app||''; SBXW.artist=im.artist||''; SBXW.aesthetic=im.aesthetic||''; SBXW.scene=im.scene||'';
  if(im.artistId!==undefined){ SBXW.artistId=im.artistId; SBXW.artistName=im.artistName||rosterName(im.artistId); }
  SBXW.locSlug=im.locSlug||''; SBXW.locName=im.locName||'';
  renderSandbox();
}
function sbxPickLoc(slug){
  const l=(GAMES[curGame]||[]).find(x=>x.slug===slug);
  SBXW.locSlug=slug||''; SBXW.locName=(l&&l.name)||''; SBXW.scene=sceneTextForLoc(l);
  renderSandbox();
}
function sbxPickArtist(id){
  if(!id){ SBXW.artistId=null; SBXW.artistName='(custom)'; renderSandbox(); return; }
  SBXW.artistId=id; SBXW.artistName=rosterName(id); SBXW.artist=rosterStyle(id);
  renderSandbox();
}
function sbxGen(){
  const fields={app:SBXW.app, artist:SBXW.artist, aesthetic:SBXW.aesthetic, scene:SBXW.scene};
  const meta={artistId:SBXW.artistId, artistName:SBXW.artistName, edited:sbxIsEdited(), locSlug:SBXW.locSlug, locName:SBXW.locName};
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image. Generate one?')) return;
  const {provider,quality,model}=genParams();
  const b=$('#bSbxGen'); if(b){b.disabled=true;b.textContent='Generating…';}
  postJSON('/api/sandbox-gen',{game:curGame,fields,meta,provider,quality,model})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); })
    .catch(e=>toast('Error: '+e.message));
  toast('Generating sandbox render… (tracked bottom-right — safe to navigate away)');
  setTimeout(pollGens,500);
}
async function sbxSaveNew(){
  const suggested=(SBXW.artistName&&SBXW.artistName!=='(custom)')?SBXW.artistName+' variant':'';
  const v=await askModal('Save as new roster artist',[
    {key:'name',label:'Name (its id is slugified from this; available to every game)',value:suggested},
  ],'Save');
  if(!v||!v.name.trim()) return;
  const name=v.name;
  const r=await (await postJSON('/api/artist-create',{name,style:SBXW.artist})).json();
  if(!r.ok){ toast('Error: '+(r.error||'create failed')); return; }
  ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame))).json();
  SBXW.artistId=r.artist.id; SBXW.artistName=r.artist.name;
  toast('Created artist '+r.artist.name+' (all games)'); renderSandbox();
}
async function sbxOverwrite(){
  if(!SBXW.artistId){ toast('No artist selected — use Save as new artist.'); return; }
  if(!confirm('Overwrite "'+SBXW.artistName+'" signature globally? Affects every game using this artist.')) return;
  const r=await (await postJSON('/api/artist-style-by-id',{id:SBXW.artistId,style:SBXW.artist})).json();
  if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
  if(ARTISTS&&ARTISTS.artists){const ent=ARTISTS.artists.find(x=>x.id===SBXW.artistId);if(ent)ent.style=SBXW.artist;}
  toast('Overwrote '+SBXW.artistName+' (all games)'); renderSandbox();
}
// Persist the current scene/artist selection, then reload (scene swaps change the columns).
async function audSaveCfg(){
  const scenes=[...document.querySelectorAll('[data-scene-slot]')].map(s=>s.value).filter(Boolean);
  const artists=[...document.querySelectorAll('[data-art]')].filter(c=>c.checked).map(c=>c.dataset.art);
  await postJSON('/api/audition-config',{game:curGame,scenes,artists});
  await reloadAudition();
}
// Bulk-check every artist into the grid, or clear them all (scenes untouched server-side).
async function audSelectAll(on){
  const artists=on?(AUD.artists||[]).map(a=>a.id):[];
  await postJSON('/api/audition-config',{game:curGame,artists});
  await reloadAudition();
}
// Star/unstar an artist as a finalist. Updates the local model, persists, and re-renders the
// grid (and the lightbox caption/button if it's open over this artist).
async function audToggleFinalist(id){
  const a=(AUD.artists||[]).find(x=>x.id===id); if(!a) return;
  const on=!a.finalist;
  const r=await (await postJSON('/api/audition-finalist',{game:curGame,artist:id,on})).json();
  if(!r.ok){ toast('Error: '+(r.error||'failed')); return; }
  a.finalist=on;
  renderAudition();
  if(lbOpen && lbMode==='aud') renderLB();
}
function renderAudition(){
  const A=AUD; if(!A){$('#detail').innerHTML='<p class="none">No game.</p>';return;}
  const finCount=A.artists.filter(a=>a.finalist).length;
  if(audFinalistsOnly && !finCount) audFinalistsOnly=false;   // nothing starred → don't blank the grid
  let selArts=A.artists.filter(a=>a.selected);
  if(audFinalistsOnly) selArts=selArts.filter(a=>a.finalist);
  const cols=A.scenes.filter(s=>s&&s.slug);
  const slots=[0,1,2,3].map(i=>{
    const cur=A.scenes[i]?A.scenes[i].slug:'';
    const opts=A.allScenes.map(s=>'<option value="'+esc(s.slug)+'"'+(s.slug===cur?' selected':'')+'>'+esc(s.name)+'</option>').join('');
    return '<div class="slot"><label>Scene '+(i+1)+'</label><select data-scene-slot="'+i+'"><option value="">— none —</option>'+opts+'</select></div>';
  }).join('');
  const checks=A.artists.map(a=>'<label><input type="checkbox" data-art="'+esc(a.id)+'"'+(a.selected?' checked':'')+'>'+esc(a.name)+(a.finalist?' <span class="finstar">★</span>':'')+'</label>').join('');
  const audTools='<div class="aud-tools">'+
    '<button class="audtool" id="audAll">Select all</button>'+
    '<button class="audtool" id="audNone">Select none</button>'+
    '<label class="audfilter"><input type="checkbox" id="audFinOnly"'+(audFinalistsOnly?' checked':'')+(finCount?'':' disabled')+'><span>Finalists only ('+finCount+')</span></label>'+
    '</div>';
  audLBList=[]; audGrid=[];   // audGrid[row=artist][col=scene] = native file | null (for 2D lightbox nav)
  const head='<tr><th class="aud-rowhead">Artist</th>'+cols.map(s=>'<th class="scenecol">'+esc(s.name)+'</th>').join('')+'</tr>';
  const rows=selArts.map(a=>{
    const house=a.id===A.houseArtist;
    const rh='<th class="aud-rowhead'+(house?' house':'')+(a.finalist?' finalist':'')+'"><div class="aname">'+esc(a.name)+(a.finalist?' <span class="finstar">★</span>':'')+'</div><div class="asum">'+esc(a.summary)+'</div>'+
      '<div class="aud-style" data-astyle="'+esc(a.id)+'">'+esc(a.style||'(no signature)')+'</div>'+
      '<button class="editbtn" data-editart="'+esc(a.id)+'">✎ Edit signature</button><br>'+
      '<button class="finbtn'+(a.finalist?' on':'')+'" data-fin="'+esc(a.id)+'" title="Toggle finalist (shortlist)">'+(a.finalist?'★ Finalist':'☆ Finalist')+'</button> '+
      '<button class="housebtn" data-aud-art="'+esc(a.id)+'">Audition ▸</button> '+
      (house?'<span class="badge">★ game artist</span>':'<button class="housebtn" data-house="'+esc(a.id)+'">Make game artist</button>')+'</th>';
    const gridRow=[];
    const cells=cols.map(s=>{
      const arr=A.images[a.id+'__'+s.slug]||[]; const f=arr.length?arr[arr.length-1].file:null;
      if(f) audLBList.push(f);
      gridRow.push(f||null);
      const bor=!f?((A.borrowed||{})[a.id+'__'+s.slug]||null):null;   // only when no native audition take
      let img;
      if(f){ img='<img class="thumb" data-zoomaud="'+esc(f)+'" src="/img/audition?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'">'; }
      else if(bor){ const u=audCellUrl(bor.source,bor.file);
        img='<div class="borrowwrap"><span class="borrow-badge">'+esc(bor.source)+'</span>'+
          '<img class="thumb borrowed" data-zoomurl="'+esc(u)+'" data-zoomcap="'+esc(bor.source+' · '+bor.file)+'" src="'+u+'"></div>'; }
      else { img='<div class="empty">not generated</div>'; }
      const goloc='<a class="goloc" data-goloc="'+esc(s.slug)+'" title="Open this scene\'s location review page">→ location</a>';
      const sbx='<a class="goloc" data-sbxart="'+esc(a.id)+'" data-sbxscene="'+esc(s.slug)+'" title="Play with this artist + scene in the Sandbox">⚗ sandbox</a>';
      return '<td class="aud-cell">'+img+goloc+sbx+'<button data-gen-art="'+esc(a.id)+'" data-gen-scene="'+esc(s.slug)+'">Generate</button></td>';
    }).join('');
    audGrid.push(gridRow);
    return '<tr>'+rh+cells+'</tr>';
  }).join('');
  const grid=(cols.length&&selArts.length)?'<table class="aud-grid"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>':'<p class="none">Pick at least one scene and one artist above.</p>';
  $('#detail').innerHTML='<div class="aud-wrap"><h1>Audition · '+esc(curGame)+'</h1>'+
    '<div class="sub">Render the selected artists against the same 4 scenes (this game\'s Aesthetic + saved Scene prompts), compare, then make one the game artist. Click an artist\'s <b>Audition ▸</b> to render that artist across all scenes at the selected model.</div>'+
    '<div class="aud-scenes">'+slots+'</div><div class="aud-artists">'+checks+'</div>'+audTools+
    '<div class="aud-controls"><select id="genMode" class="genmode" title="Which generator to use">'+GENMODE_OPTS+'</select>'+
      '<button class="primary" id="bGenAll">Generate all missing ▸</button></div>'+grid+'</div>';
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>genMode=gm.value; }
  document.querySelectorAll('[data-scene-slot]').forEach(s=>s.onchange=audSaveCfg);
  document.querySelectorAll('[data-art]').forEach(c=>c.onchange=audSaveCfg);
  const fo=$('#audFinOnly'); if(fo) fo.onchange=()=>{audFinalistsOnly=fo.checked; renderAudition();};
  const aa=$('#audAll'); if(aa) aa.onclick=()=>audSelectAll(true);
  const an=$('#audNone'); if(an) an.onclick=()=>audSelectAll(false);
  document.querySelectorAll('[data-fin]').forEach(b=>b.onclick=()=>audToggleFinalist(b.dataset.fin));
  document.querySelectorAll('[data-house]').forEach(b=>b.onclick=()=>audMakeHouse(b.dataset.house));
  document.querySelectorAll('[data-aud-art]').forEach(b=>b.onclick=()=>audArtistGen(b.dataset.audArt));
  document.querySelectorAll('[data-editart]').forEach(b=>b.onclick=()=>audEditArtist(b.dataset.editart));
  document.querySelectorAll('[data-gen-art]').forEach(b=>b.onclick=()=>audCellGen(b.dataset.genArt,b.dataset.genScene));
  document.querySelectorAll('[data-goloc]').forEach(b=>b.onclick=()=>selectTopic('g:'+curGame,b.dataset.goloc));
  document.querySelectorAll('[data-sbxart]').forEach(b=>b.onclick=()=>{
    const a=(AUD.artists||[]).find(x=>x.id===b.dataset.sbxart);
    const key=b.dataset.sbxart+'__'+b.dataset.sbxscene;
    const arr=(AUD.images||{})[key]||[]; const nf=arr.length?arr[arr.length-1].file:null;
    const bor=!nf?((AUD.borrowed||{})[key]||null):null;
    const adopt=nf?{srcKind:'audition',srcFile:nf}:(bor?{srcKind:bor.source,srcFile:bor.file}:null);
    SANDBOX_PREFILL={game:curGame, artistId:b.dataset.sbxart, artist:(a&&a.style)||'',
      artistName:(a&&a.name)||rosterName(b.dataset.sbxart), locSlug:b.dataset.sbxscene, adopt};
    selectTopic('sandbox', curGame);
  });
  document.querySelectorAll('[data-zoomaud]').forEach(im=>im.onclick=()=>openAudLB(im.dataset.zoomaud));
  document.querySelectorAll('[data-zoomurl]').forEach(im=>im.onclick=()=>openOneLB(im.dataset.zoomurl,im.dataset.zoomcap));
  $('#bGenAll').onclick=audGenAll;
  afterDetailRender();
}
// Inline-edit an artist's signature from its grid row (✎ Edit) — global save, like the
// location page's Artist field. Swaps the read-only style box for a textarea + Save/Cancel.
function audEditArtist(id){
  const box=document.querySelector('[data-astyle="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); if(!box) return;
  const a=AUD.artists.find(x=>x.id===id); if(!a) return;
  const th=box.closest('th'); const eb=th&&th.querySelector('[data-editart]'); if(eb) eb.style.display='none';
  const ta=document.createElement('textarea'); ta.className='edit'; ta.value=a.style||'';
  const acts=document.createElement('div'); acts.className='editacts';
  const save=document.createElement('button'); save.className='primary'; save.textContent='Save';
  const cancel=document.createElement('button'); cancel.textContent='Cancel';
  acts.append(save,cancel);
  box.replaceWith(ta); ta.after(acts); ta.focus();
  save.onclick=async()=>{
    const r=await (await postJSON('/api/artist-style-by-id',{id,style:ta.value})).json();
    if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
    a.style=ta.value; toast('Signature saved (all games)'); renderAudition();
  };
  cancel.onclick=()=>renderAudition();
}
async function audMakeHouse(id){
  const r=await (await postJSON('/api/select-artist',{game:curGame,id})).json();
  if(r.ok){ AUD.houseArtist=id; toast('Game artist for '+curGame+' → '+rosterName(id)); renderAudition(); }
  else toast('Error: '+(r.error||'failed'));
}
function audCellGen(artist,scene){
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image. Generate one?')) return;
  const {provider,quality,model}=genParams();
  postJSON('/api/audition-gen',{game:curGame,scene,artist,provider,quality,model})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); }).catch(e=>toast('Error: '+e.message));
  toast('Generating '+rosterName(artist)+' × '+scene+'… (tracked bottom-right)');
  setTimeout(pollGens,500);
}
// Audition one artist: render them across ALL selected scenes at the current model,
// in one click. Always generates a fresh take per scene (it's an audition, not a fill-gaps).
function audArtistGen(artist){
  const cols=AUD.scenes.filter(s=>s&&s.slug);
  if(!cols.length){ toast('Pick at least one scene first.'); return; }
  const name=(AUD.artists.find(a=>a.id===artist)||{}).name||artist;
  if(!confirm('Audition '+name+' across '+cols.length+' scene(s) via '+genMode+'?')) return;
  if(genMode==='gemini-pro' && !confirm('That is Nano Banana Pro at ~$0.13 each (~$'+(cols.length*0.13).toFixed(2)+' total). Proceed?')) return;
  const {provider,quality,model}=genParams();
  cols.forEach(s=>postJSON('/api/audition-gen',{game:curGame,scene:s.slug,artist,provider,quality,model}).then(r=>r.json()).then(r=>{if(r&&!r.ok&&r.error)toast('Error: '+r.error);}).catch(e=>toast('Error: '+e.message)));
  toast('Auditioning '+name+' across '+cols.length+' scene(s)… (tracked bottom-right)');
  setTimeout(pollGens,500);
}
function audGenAll(){
  const A=AUD; let sel=A.artists.filter(a=>a.selected); if(audFinalistsOnly) sel=sel.filter(a=>a.finalist); const cols=A.scenes.filter(s=>s&&s.slug);
  const missing=[];
  sel.forEach(a=>cols.forEach(s=>{ if(!(A.images[a.id+'__'+s.slug]||[]).length) missing.push([a.id,s.slug]); }));
  if(!missing.length){ toast('Nothing missing — every cell has an image.'); return; }
  if(!confirm('Generate '+missing.length+' missing image(s) via '+genMode+'?')) return;
  if(genMode==='gemini-pro' && !confirm('That is Nano Banana Pro at ~$0.13 each (~$'+(missing.length*0.13).toFixed(2)+' total). Proceed?')) return;
  const {provider,quality,model}=genParams();
  missing.forEach(([artist,scene])=>postJSON('/api/audition-gen',{game:curGame,scene,artist,provider,quality,model}).then(r=>r.json()).then(r=>{if(r&&!r.ok&&r.error)toast('Error: '+r.error);}).catch(e=>toast('Error: '+e.message)));
  toast('Generating '+missing.length+' image(s)… (tracked bottom-right)');
  setTimeout(pollGens,500);
}
function openAudLB(f){ lbMode='aud'; const i=audLBList.indexOf(f); lbIndex=i<0?0:i; renderLB(); lb.classList.add('show'); lbOpen=true; }
async function refreshState(){STATE=await (await fetch('/api/state')).json();}
async function act(url,body,msg){const r=await (await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  if(r.ok){toast(msg);ver++;
    if(url.indexOf('glyph')>=0)GLYPHS=await (await fetch('/api/glyphs')).json();
    if(url.indexOf('artist')>=0)ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    if(isGame(topic))await loadGame(curGame);
    renderItems();openItem(curItem);
  }else toast('Error: '+(r.error||'failed'));}
// Full-screen lightbox. Open via a thumbnail's magnifier (or clicking the big preview);
// click anywhere / Esc to close; on-screen arrows + arrow keys step through candidates.
const lb=$('#lb'), lbimg=lb.querySelector('img'), lbcap=lb.querySelector('.lbcap'), lbfin=lb.querySelector('.lbfin');
let lbOpen=false, lbIndex=0, lbMode='loc';   // lbMode: 'loc' candidates | 'artist' examples
// The lightbox finalist button is shown only in audition mode (aud images carry an artist id
// in their filename: <artist>__<scene>__…). updateLBFin paints state; click + F key toggle it.
function audArtistOf(f){ return f?f.split('__')[0]:null; }
function updateLBFin(aid){
  if(!lbfin) return;
  if(!aid){ lbfin.style.display='none'; return; }
  const a=(AUD&&AUD.artists||[]).find(x=>x.id===aid); const fin=!!(a&&a.finalist);
  lbfin.style.display=''; lbfin.dataset.fin=aid;
  lbfin.classList.toggle('on',fin); lbfin.textContent=fin?'★ Finalist':'☆ Finalist';
}
if(lbfin) lbfin.onclick=e=>{ e.stopPropagation(); const aid=lbfin.dataset.fin; if(aid) audToggleFinalist(aid); };
// Per-image note key for the zoomed file. loc mode reuses the EXACT detail-screen per-image key
// (renderLB sets sel=f, so the lightbox note and the location screen note are one and the same).
// aud/artist images have no detail-screen view, so they get their own stable namespaced keys.
function lbNoteKey(f){
  if(!f) return null;
  if(lbMode==='loc') return imgNoteKey(f, curItem);   // borrowed aud:<file> → canonical aud: key (synced)
  if(lbMode==='aud') return 'aud:'+curGame+':'+f;     // f is the raw audition filename
  if(lbMode==='artist') return 'artist-ex:'+f;
  return null;   // 'one' (arbitrary-URL) views have no stable key → no notes
}
function renderLBNoteStatus(k){
  const flag=$('#lbNoteFlag'), acts=$('#lbNoteActs'), ta=$('#lbNote'); if(!flag||!acts) return;
  const hasText=!!noteVal(k).trim(), st=noteStatusOf(k), done=st==='resolved'||st==='wontfix';
  flag.className='noteflag'+(done?' resolved':''); flag.textContent=done?'✓ resolved':'';
  if(ta) ta.classList.toggle('resolved',done);
  acts.innerHTML='<label class="resolvebox"><input type="checkbox" id="lbNResolved"'+(done?' checked':'')+(hasText?'':' disabled')+'>Resolved</label>';
  const cb=$('#lbNResolved');
  if(cb) cb.onchange=async()=>{await setNoteStatus(k,cb.checked?'resolved':'open');renderLBNoteStatus(k);};
}
// Load/wire the notes panel for the zoomed file. Editing persists to the shared notes store;
// in loc mode it also mirrors back into the detail screen's note box so both stay in sync.
function loadLBNote(f){
  const ta=$('#lbNote'); if(!ta) return;
  const k=lbNoteKey(f);
  if(!k){ lb.classList.remove('notes'); return; }
  lb.classList.add('notes');
  const forEl=$('#lbNoteFor'); if(forEl) forEl.textContent=f||'';
  ta.value=noteVal(k);
  ta.onblur=async()=>{ await saveNote(k,ta.value); renderLBNoteStatus(k);
    if(lbMode==='loc'){ const di=$('#inote'); if(di){ di.value=ta.value; renderNoteStatus(k); } } };
  renderLBNoteStatus(k);
}
// Fill the lower half of the notes column with the ACTUAL prompt that made the zoomed image.
// loc mode reads the in-memory candidatePrompts; aud mode fetches the _audition/<f>.txt sidecar.
function loadLBPrompt(f){
  const el=$('#lbPrompt'); if(!el) return;
  const set=t=>{ const s=(t||'').trim();
    if(s){ el.textContent=breakPrompt(s); el.classList.remove('empty'); }
    else { el.textContent='(no recorded prompt for this image)'; el.classList.add('empty'); } };
  if(!f){ set(''); return; }
  if(lbMode==='loc'){ const l=(GAMES[curGame]||[]).find(x=>x.slug===curItem); set(l&&(l.candidatePrompts||{})[f]); return; }
  if(lbMode==='aud'){ el.textContent='loading…'; el.classList.add('empty');
    fetch('/api/aud-prompt?game='+encodeURIComponent(curGame)+'&f='+encodeURIComponent(f))
      .then(r=>r.json()).then(d=>{ if(lbOpen&&lbList()[lbIndex]===f) set(d&&d.prompt); }).catch(()=>set('')); return; }
  set('');   // artist examples have no per-image prompt provenance
}
const lbList=()=>{
  if(lbMode==='artist') return (curArtist&&curArtist.examples||[]).map(e=>e.file);
  if(lbMode==='aud') return audLBList;
  const l=(GAMES[curGame]||[]).find(x=>x.slug===curItem);return l?l.candidates:[];
};
function renderLB(){
  if(lbfin) lbfin.style.display='none';   // only audition mode re-shows it
  if(lbMode==='one'){ lb.classList.remove('notes'); lbimg.onerror=null; lbimg.src=(lbOne&&lbOne.url)||''; lbcap.textContent=(lbOne&&lbOne.cap)||''; return; }
  const list=lbList();if(!list.length){hideLB();return;}
  if(lbIndex>=list.length) lbIndex=list.length-1; if(lbIndex<0) lbIndex=0;   // list can shrink (filter/cull)
  const f=list[lbIndex];
  if(lbMode==='artist'){
    lbimg.onerror=null; lbimg.src='/img/artist?f='+encodeURIComponent(f);
    lbcap.textContent=f+'  ('+(lbIndex+1)+'/'+list.length+')';
    artSel=f; updateArtistSel();
  } else if(lbMode==='aud'){
    lbimg.onerror=null; lbimg.src='/img/audition?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;
    const aid=audArtistOf(f); const a=(AUD&&AUD.artists||[]).find(x=>x.id===aid);
    const sslug=f.split('__')[1]; const sc=(AUD&&AUD.scenes||[]).find(x=>x&&x.slug===sslug);
    lbcap.textContent=((sc&&sc.name)||sslug||'')+' — '+((a&&a.name)||aid)+'  ('+(lbIndex+1)+'/'+list.length+')';
    updateLBFin(aid);
  } else {
    if(f&&f.indexOf('aud:')===0){ lbimg.onerror=null; lbimg.src=candUrl(f); }
    else { lbimg.src='/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;
      lbimg.onerror=function(){this.onerror=null;this.src='/img/committed?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;}; }
    lbcap.textContent=(f&&f.indexOf('aud:')===0?f.slice(4):f)+'  ('+(lbIndex+1)+'/'+list.length+')';
    sel=f; updateSelUI();   // keep the main view in sync with what's shown full screen
  }
  loadLBNote(f);
  loadLBPrompt(f);
}
// Single arbitrary-URL lightbox (borrowed audition images live in sandbox/review dirs, not
// the audition list — so they get a one-off view with no prev/next stepping).
let lbOne=null;
function openOneLB(url,cap){lbMode='one';lbOne={url,cap};renderLB();lb.classList.add('show');lbOpen=true;}
function openLB(f){lbMode='loc';const list=lbList();let i=list.indexOf(f);lbIndex=i<0?0:i;renderLB();lb.classList.add('show');lbOpen=true;}
function openArtistLB(f){lbMode='artist';const list=lbList();let i=list.indexOf(f);lbIndex=i<0?0:i;renderLB();lb.classList.add('show');lbOpen=true;}
function hideLB(){lb.classList.remove('show');lbOpen=false;}
function lbStep(d){const list=lbList();if(!list.length)return;lbIndex=(lbIndex+d+list.length)%list.length;renderLB();}
// 2D step within the audition grid lightbox: Left/Right (dc=±1) move between scenes in the
// same artist row; Up/Down (dr=±1) move between artists in the same scene column. Empty/borrowed
// cells (no native take, so nothing to show full-screen) are skipped; wraps within the row/column.
function audLBMove(dr,dc){
  const cur=audLBList[lbIndex]; let r=-1,c=-1;
  for(let i=0;i<audGrid.length&&r<0;i++){const j=audGrid[i].indexOf(cur);if(j>=0){r=i;c=j;}}
  if(r<0){lbStep(dc||dr);return;}                                  // fallback: flat step
  const rows=audGrid.length, colN=audGrid[0]?audGrid[0].length:0;
  if(dc){ for(let k=1;k<=colN;k++){const cc=((c+dc*k)%colN+colN)%colN;const f=audGrid[r][cc];if(f){lbIndex=audLBList.indexOf(f);renderLB();return;}} }
  else  { for(let k=1;k<=rows;k++){const rr=((r+dr*k)%rows+rows)%rows;const f=audGrid[rr][c];if(f){lbIndex=audLBList.indexOf(f);renderLB();return;}} }
}
lb.querySelector('.lbprev').onclick=e=>{e.stopPropagation();lbStep(-1);};
lb.querySelector('.lbnext').onclick=e=>{e.stopPropagation();lbStep(1);};
lb.addEventListener('click',e=>{if(!e.target.closest('.lbnav')&&!e.target.closest('.lbnotes'))hideLB();});  // click anywhere else closes
// Delete the selected candidate (location detail view) — shared by the Delete button and the
// Delete/Backspace key. Audition pieces (aud:<file>) are labelled distinctly in the confirm.
function rejectSelected(){
  if(!sel) return;
  const label=sel.indexOf('aud:')===0?sel.slice(4)+' (audition piece)':sel;
  if(!confirm('Delete this image?\n\n'+label)) return;
  act('/api/reject',{game:curGame,candidate:sel},'Deleted '+label);
}
// Keyboard: in the lightbox, arrows navigate & Esc closes. Otherwise arrows cycle the
// selected candidate (ignored while typing in a notes/prompt field).
document.addEventListener('keydown',e=>{
  // Alt+←/→ = back/forward through navigation history (anywhere except while typing).
  if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    if(/^(TEXTAREA|INPUT)$/.test((document.activeElement||{}).tagName||'')) return;
    e.preventDefault(); histGo(e.key==='ArrowLeft'?-1:1); return;
  }
  if(lbOpen){
    if(document.activeElement&&document.activeElement.id==='lbNote'){   // typing a note — don't navigate
      if(e.key==='Escape'){e.preventDefault();document.activeElement.blur();hideLB();}
      return;
    }
    if(e.key==='Escape'){e.preventDefault();hideLB();return;}
    if(lbMode==='aud'){   // grid nav: ←/→ change scene (same artist), ↑/↓ change artist (same scene)
      if(e.key==='f'||e.key==='F'){e.preventDefault();const aid=audArtistOf(audLBList[lbIndex]);if(aid)audToggleFinalist(aid);return;}
      if(e.key==='ArrowLeft'){e.preventDefault();audLBMove(0,-1);return;}
      if(e.key==='ArrowRight'){e.preventDefault();audLBMove(0,1);return;}
      if(e.key==='ArrowUp'){e.preventDefault();audLBMove(-1,0);return;}
      if(e.key==='ArrowDown'){e.preventDefault();audLBMove(1,0);return;}
      return;
    }
    if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();lbStep(-1);return;}
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();lbStep(1);return;}
    return;
  }
  if(/^(TEXTAREA|INPUT)$/.test((document.activeElement||{}).tagName||''))return;
  if(topic==='sandbox'){
    if(e.key==='Escape'&&SBXW&&(SBXW.multi||[]).length){ e.preventDefault(); sbxClearMulti(); return; }
    if((e.key==='Delete'||e.key==='Backspace')&&SBXW&&(SBXW.multi||[]).length){ e.preventDefault(); sbxBulkDelete(); return; }
    if((e.key==='Delete'||e.key==='Backspace')&&SBXW&&SBXW.sel){ e.preventDefault(); sbxReject(); return; }
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)>=0){
      const ims=(SBX&&SBX.images)||[]; if(!ims.length) return;
      e.preventDefault();
      const vert=(e.key==='ArrowUp'||e.key==='ArrowDown');
      // For up/down, jump a full row: count how many cards share the first row's top.
      const cells=Array.from(document.querySelectorAll('#detail .cand'));
      let cols=1;
      if(vert&&cells.length){ const top0=cells[0].offsetTop; cols=cells.filter(c=>c.offsetTop===top0).length||1; }
      const step=((e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1)*(vert?cols:1);
      let i=ims.findIndex(x=>x.file===(SBXW&&SBXW.sel)); if(i<0)i=(step>0?-1:0);
      i=((i+step)%ims.length+ims.length)%ims.length;
      sbxSelect(ims[i].file);
    }
    return;
  }
  if(!isGame(topic))return;
  if((e.key==='Delete'||e.key==='Backspace')&&sel){ e.preventDefault(); rejectSelected(); return; }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0)return;
  const l=(GAMES[curGame]||[]).find(x=>x.slug===curItem);
  if(!l||!l.candidates.length)return;
  e.preventDefault();
  // Up/Down jump a full ROW of the wrapped candidate strip (count cards sharing the first row's
  // top), Left/Right step one — same row-aware nav as the Sandbox grid above. DOM order of
  // #detail .cand matches l.candidates order, so the col-count maps onto the array.
  const vert=(e.key==='ArrowUp'||e.key==='ArrowDown');
  const cells=Array.from(document.querySelectorAll('#detail .cands .cand'));
  let cols=1;
  if(vert&&cells.length){ const top0=cells[0].offsetTop; cols=cells.filter(c=>c.offsetTop===top0).length||1; }
  const step=((e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1)*(vert?cols:1);
  let i=l.candidates.indexOf(sel);if(i<0)i=(step>0?-1:0);
  i=((i+step)%l.candidates.length+l.candidates.length)%l.candidates.length;
  selectCand(l.candidates[i]);
});
loadAll();