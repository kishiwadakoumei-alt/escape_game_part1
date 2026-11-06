
const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const VERSION = 1;
const ORDER = ['books','seal','scraps','mirror','glass','star','beam','door'];
const BOOKS = [{id:'鍵',symbol:'⚿'},{id:'月',symbol:'☾'},{id:'花',symbol:'✿'},{id:'星',symbol:'✦'}];
const SEALS = [{id:'五角形',n:5},{id:'円',n:0},{id:'四角形',n:4},{id:'三角形',n:3}];
let overlay = null;
let toastHandle = 0;
let soundContext = null;
let storageOK = true;

function freshState(){
  return {
    version:VERSION,phase:'intro',view:0,elapsedMs:0,paused:false,
    solved:[],inventory:[],selectedItem:null,hints:{},mistakes:0,
    personalNote:'',sound:true,
    puzzle:{books:[],seal:[],scraps:[3,1,0,2],scrapSelected:null,glass:[2,1,3,1],
      mirrorUsed:false,starInstalled:false,starRot:0,beamA:'\\',beamB:'\\',lensInstalled:false,feedback:{}}
  };
}
function loadState(){
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if (!saved||saved.version!==VERSION||!Array.isArray(saved.solved))return freshState();
    const base=freshState();
    return {...base,...saved,
      solved:saved.solved.filter(id=>ORDER.includes(id)),
      inventory:Array.isArray(saved.inventory)?saved.inventory.filter(id=>ITEMS[id]):[],
      hints:{...base.hints,...(saved.hints||{})},
      puzzle:{...base.puzzle,...(saved.puzzle||{}),feedback:{}}};
  }catch(err){console.warn('保存データの読込に失敗しました。',err);return freshState();}
}
function readBest(){try{return JSON.parse(localStorage.getItem(BEST_KEY)||'null')}catch{return null}}
let state=loadState();
let best=readBest();
overlay=state.phase==='intro'?{type:'intro'}:state.phase==='cleared'?{type:'result'}:state.solved.length?{type:'resume'}:null;
let lastTick=performance.now();
let lastPersist=performance.now();
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageOK=true}
  catch(err){storageOK=false;console.warn('保存に失敗しました。',err)}
}
function saveBest(){try{localStorage.setItem(BEST_KEY,JSON.stringify(best))}catch(err){console.warn(err)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function duration(ms){const s=Math.floor(Math.max(0,ms)/1000);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function numberOfHints(){return Object.values(state.hints).reduce((sum,v)=>sum+Number(v||0),0)}
function solved(id){return state.solved.includes(id)}
function unlocked(id){return (PUZZLE_MAP[id]?.deps||[]).every(solved)}
function feedback(id){const f=state.puzzle.feedback[id];return f?`<div class="message ${f.ok?'success':'err'}" role="status">${esc(f.text)}</div>`:''}
function rank(){const n=numberOfHints(),t=state.elapsedMs;if(n===0&&state.mistakes<=1&&t<30*60*1000)return 'S';if(n<=4&&state.mistakes<=4)return 'A';return 'B'}
function beep(kind='okay'){
  if(!state.sound)return;
  try{soundContext ||= new (window.AudioContext||window.webkitAudioContext)();const now=soundContext.currentTime;
    const notes=kind==='win'?[523,659,783,1046]:kind==='wrong'?[220,174]:[440,586];
    notes.forEach((f,i)=>{const o=soundContext.createOscillator(),g=soundContext.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(soundContext.destination);const start=now+i*.105;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.055,start+.017);g.gain.exponentialRampToValueAtTime(.0001,start+.20);o.start(start);o.stop(start+.23)})
  }catch{/* Audio is optional */}
}
function toast(message){clearTimeout(toastHandle);toastEl.textContent=message;toastEl.classList.add('show');toastHandle=setTimeout(()=>toastEl.classList.remove('show'),3100)}
function closeModal(){if(overlay?.type==='puzzle'||['notes','map','settings','guide'].includes(overlay?.type)){overlay=null;render()}}
function overlayOpen(type,id){overlay={type,id};render()}
function notifyFeedback(id,ok,text){state.puzzle.feedback[id]={ok,text};if(!ok){state.mistakes++;beep('wrong')}save();render()}
function complete(id){
  if(solved(id))return;
  state.solved.push(id);
  const puzzle=PUZZLE_MAP[id];
  if(puzzle.reward&&!state.inventory.includes(puzzle.reward))state.inventory.push(puzzle.reward);
  state.puzzle.feedback={};
  if(id==='door'){
    state.phase='cleared';state.paused=true;
    if(!best||state.elapsedMs<best.time){best={time:Math.round(state.elapsedMs),hints:numberOfHints(),date:new Date().toISOString()};saveBest()}
    overlay={type:'result'};beep('win');toast('脱出成功！ 封印の扉が開いた');
  }else{beep('win');toast(`${puzzle.num}「${puzzle.title}」を解決！`)}
  save();render();
}
function resetGame(){
  if(!window.confirm('第1ステージの進行状況・メモ・ヒント使用履歴をリセットします。よろしいですか？（自己ベストは残ります）'))return;
  state=freshState();overlay={type:'intro'};lastTick=performance.now();save();render();toast('進行状況を初期化しました');
}
function setView(v){state.view=Math.max(0,Math.min(2,v));save();render()}
function selectItem(id){
  if(!state.inventory.includes(id))return;
  state.selectedItem=state.selectedItem===id?null:id;
  save();render();toast(state.selectedItem?`${ITEMS[id].name}を選択しました`:'アイテムの選択を解除しました');
}
function modalFrame({title,eyebrow='',sub='',body='',footer='',wide=false,closable=true}){
  return `<div class="overlay-backdrop" data-overlay-backdrop="true"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
    <header class="modal-header"><div><div class="modal-eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2>${sub?`<p>${sub}</p>`:''}</div>${closable?'<button type="button" class="x-btn" data-action="close" aria-label="閉じる">×</button>':''}</header>
    <div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
}
function miniStatus(id){return solved(id)?'✓':!unlocked(id)?'⌑':'✦'}
function renderHeader(){const count=state.solved.length;return `<header class="topbar"><div class="brand"><div class="brand-icon" aria-hidden="true">⌑</div><div><div class="brand-name">BEYOND THE DOORS</div><div class="brand-sub">扉の向こうの世界へ</div></div></div><div class="topbar-right">
  <div class="top-pill"><span class="pill-icon">✧</span><div><div class="eyebrow">PROGRESS</div><strong>${count} / 8</strong></div></div>
  <div class="top-pill"><span class="pill-icon">◷</span><div><div class="eyebrow">PLAY TIME</div><strong id="play-clock">${duration(state.elapsedMs)}</strong></div></div>
  <button class="top-action" data-action="notes" title="調査メモを開く">▤ <span>メモ</span></button>
  <button class="top-action" data-action="settings" title="設定を開く">⚙ <span>設定</span></button></div></header>`}
function hotspotsForView(v){return PUZZLES.filter(p=>p.zone===v)}
function sceneHtml(){
  const z=ZONES[state.view];
  const spots=hotspotsForView(state.view).map(p=>`<button class="hotspot ${solved(p.id)?'solved':!unlocked(p.id)?'locked':''}" style="left:${p.x}%;top:${p.y}%" data-action="open-puzzle" data-id="${p.id}" aria-label="${esc(p.title)}を調べる" title="${esc(p.title)}"><span aria-hidden="true">${solved(p.id)?'✓':unlocked(p.id)?p.glyph:'⌑'}</span><span class="spot-label">${esc(p.title)}</span></button>`).join('');
  return `<section class="scene-card"><div class="scene-head"><b><span class="status-dot"></span>${esc(z.title)}</b><small>${esc(z.description)}</small></div>
    <div class="scene-frame ${solved('beam')?'is-door-lit':''}" data-view="${state.view}"><div class="scene-art" role="img" aria-label="星が輝く夜の魔法図書館。書架、机、星読み装置、ステンドグラス、封印の扉が見える"></div><div class="scene-prompt">✦ 光る印や下の調査ボタンを押そう</div>${spots}
    <button class="scene-arrow left" data-action="view-prev" aria-label="左のエリアへ" ${state.view===0?'disabled':''}>‹</button><button class="scene-arrow right" data-action="view-next" aria-label="右のエリアへ" ${state.view===2?'disabled':''}>›</button></div>
    <div class="scene-bottom"><div class="scene-view-tabs">${ZONES.map((v,i)=>`<button class="view-tab ${state.view===i?'active':''}" data-action="view" data-view="${i}" aria-pressed="${state.view===i}">${esc(v.short)}</button>`).join('')}</div><small>キーボード ← → でも移動</small></div></section>
    <div class="location-strip" aria-label="調査できる場所">${hotspotsForView(state.view).map(p=>`<button class="loc-btn ${solved(p.id)?'done':!unlocked(p.id)?'locked':''}" data-action="open-puzzle" data-id="${p.id}"><span class="loc-status">${miniStatus(p.id)}</span><span>${esc(p.title)}</span></button>`).join('')}</div>`;
}
function inventoryHtml(){
  const inv=state.inventory;return `<section class="inventory"><div class="inventory-head"><b><span aria-hidden="true">♧</span> 持ち物</b><small>${inv.length} / 6</small></div><div class="inv-slots">
  ${Array.from({length:6},(_,i)=>{const id=inv[i];return id?`<button class="inv-slot ${state.selectedItem===id?'is-selected':''}" data-action="item" data-id="${id}" aria-label="${esc(ITEMS[id].name)}を${state.selectedItem===id?'選択解除':'選択'}" aria-pressed="${state.selectedItem===id}" title="${esc(ITEMS[id].desc)}"><span class="inv-symbol">${ITEMS[id].symbol}</span><span>${esc(ITEMS[id].name)}</span></button>`:`<div class="inv-slot empty" aria-label="空の持ち物枠"><span class="inv-symbol">·</span></div>`}).join('')}
  </div><p class="inventory-tip">${state.selectedItem?`選択中：${esc(ITEMS[state.selectedItem]?.name||'')}。仕掛けの画面で使えます。`:'アイテムを使うときは、ここで選択してから仕掛けを調べます。'}</p></section>`
}
function sidebarHtml(){
  const n=state.solved.length;const available=PUZZLES.filter(p=>!solved(p.id)&&unlocked(p.id));const next=available[0];
  return `<aside class="sidebar"><section class="side-card"><div class="side-icon">✦</div><div class="side-eyebrow">YOUR MISSION</div><h2>この部屋から脱出せよ</h2><p>8つの仕掛けを解き、星図と光の秘密を明らかにしよう。最初の謎は自由な順番で調べられます。</p><div class="progress-track"><span style="width:${n/8*100}%"></span></div><div class="progress-meta"><span>探索の進行度</span><b>${n} / 8</b></div></section>
  <section class="side-card"><div class="side-eyebrow">PUZZLE LOG</div><h2>調査の記録</h2><ul class="quest-list">${PUZZLES.map(p=>`<li class="${solved(p.id)?'done':''}"><span class="quest-mark">${solved(p.id)?'✓':unlocked(p.id)?'○':'⌑'}</span><span>${p.num}　${esc(p.title)}</span></li>`).join('')}</ul></section>
  <section class="side-card"><div class="side-eyebrow">DETECTIVE'S DESK</div><h2>ひらめきの手がかり</h2><p>${n===8?'扉が開いた。おめでとう！':n===0?'まずは本棚・壁の封印・机の紙片を調べよう。':next?`現在調査できる仕掛け：${esc(next.title)}。解いた情報はメモに残ります。`:'これまでの情報を整理してみよう。'}</p><div class="button-row" style="margin-top:13px"><button class="soft-btn" data-action="map">⌖　探索マップ</button><button class="soft-btn" data-action="guide">？　遊び方</button></div></section></aside>`;
}
function shellHtml(){
  return `<div class="site-shell">${renderHeader()}<div class="section-heading"><div><div class="kicker">CHAPTER 01 / THE SEALED LIBRARY</div><h1>封印された魔法図書館</h1><p>光の届かない場所にこそ、帰り道は隠されている。</p></div><div class="chapter-progress"><div class="mini-progress"><span style="width:${state.solved.length/8*100}%"></span></div><span>${Math.round(state.solved.length/8*100)}%</span></div></div>
  <main class="game-grid"><div class="game-left">${sceneHtml()}${inventoryHtml()}</div>${sidebarHtml()}</main>
  <div class="footer-note">オリジナル脱出ゲーム / 第1ステージ・プレイ可能版　—　進行状況はこのブラウザに自動保存されます。<br>公式の名探偵コナン・リアル脱出ゲームとは関係のない自主制作作品です。</div></div>`;
}
function hintHtml(p){
  const n=state.hints[p.id]||0;
  return `<div class="hint-box"><div class="info-line"><span>✧　3段階ヒント（使用：${n}/3）</span>${n<3?`<button class="soft-btn" data-action="hint" data-id="${p.id}">ヒント ${n+1} を見る</button>`:'<span class="mini-copy">すべて表示済み</span>'}</div>
  ${n?`<div class="hint-list">${p.hints.slice(0,n).map((h,i)=>`<div class="hint-row"><b>ヒント ${i+1}</b><br>${esc(h)}</div>`).join('')}</div>`:''}</div>`;
}
function lockedHtml(p){
  return `<div class="locked-card"><div class="lock-icon">⌑</div><h3>まだ仕掛けを動かせない</h3><p>ここを解くには、先に見つけなければならない情報があるようだ。</p><div class="need-list">${p.deps.map(id=>`<div class="need-item ${solved(id)?'yes':''}">${solved(id)?'✓':'○'}　${esc(PUZZLE_MAP[id].title)}　${solved(id)?'確認済み':'未解決'}</div>`).join('')}</div><button class="soft-btn" data-action="close">探索に戻る</button></div>`;
}
function solvedHtml(p){return `<div class="big-success"><div class="trophy">✦</div><h3>仕掛けを解決した</h3><p>${esc(p.note)}</p>${p.reward?`<div class="message success">獲得アイテム：${esc(ITEMS[p.reward].name)}</div>`:''}<div style="margin-top:20px"><button class="primary-btn" data-action="close">探索へ戻る</button></div></div>`}
function bookHtml(){
  const order=state.puzzle.books;
  return `<p class="puzzle-lede">星・花・鍵・月を表す4冊の魔法書がある。古いメモの条件を満たすよう、<b>左から</b>並べてみよう。</p>
    <div class="engraving">① 月の本は一番右に置く<br>② 花の本は鍵の本のすぐ左<br>③ 星の本は花の本より左</div>
    <div class="puzzle-subtitle">本をタップして並び順を決める</div>
    <div class="book-picker">${BOOKS.map(b=>`<button class="book-btn" data-action="add-book" data-id="${b.id}" ${order.includes(b.id)?'disabled':''}><div class="book-emblem">${b.symbol}</div><b>${b.id}の書</b></button>`).join('')}</div>
    <div class="slot-row">${Array.from({length:4},(_,i)=>`<div class="slot-box">${order[i]||String(i+1)}</div>`).join('')}</div>
    ${feedback('books')}<div class="puzzle-actions"><button class="primary-btn" data-action="check-books" ${order.length!==4?'disabled':''}>この順番で並べる</button><button class="soft-btn" data-action="reset-books">並べ直す</button></div>`;
}
function polygonSvg(n){if(n===0)return `<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="21" fill="none" stroke="#ecd4a6" stroke-width="3"/></svg>`;const points=Array.from({length:n},(_,i)=>{const a=(-90+360*i/n)*Math.PI/180;return `${(30+22*Math.cos(a)).toFixed(1)},${(30+22*Math.sin(a)).toFixed(1)}`}).join(' ');return `<svg viewBox="0 0 60 60" aria-hidden="true"><polygon points="${points}" fill="#7d6b9c55" stroke="#ecd4a6" stroke-width="3"/></svg>`}
function sealHtml(){const order=state.puzzle.seal;return `<p class="puzzle-lede">壁の封印に4つの図形が刻まれている。文字のない石板には、短い言葉だけが残されていた。</p><div class="engraving">「角を持たぬ者から、少ない順に触れよ」</div><div class="shape-picker">${SEALS.map(s=>`<button class="shape-btn" data-action="add-seal" data-id="${s.id}" ${order.includes(s.id)?'disabled':''}>${polygonSvg(s.n)}<span>${s.id}</span></button>`).join('')}</div><div class="seal-steps">${Array.from({length:4},(_,i)=>`<span>${order[i]?esc(order[i].slice(0,1)):i+1}</span>`).join('')}</div>${feedback('seal')}<div class="puzzle-actions"><button class="primary-btn" data-action="check-seal" ${order.length!==4?'disabled':''}>封印を解く</button><button class="soft-btn" data-action="reset-seal">やり直す</button></div>`}
function parchmentArt(){
  return `<defs><radialGradient id="paper" cx="45%" cy="30%"><stop stop-color="#f6e8c2"/><stop offset="1" stop-color="#d5bc84"/></radialGradient></defs>
  <rect width="320" height="320" fill="url(#paper)"/><g fill="none" stroke="#916f47" opacity=".5"><path d="M18 20H302V300H18z" stroke-width="3"/><path d="M30 31H290V290H30z" stroke-width="1.5"/></g>
  <circle cx="160" cy="144" r="106" fill="none" stroke="#aa874a" stroke-width="10"/><circle cx="160" cy="144" r="85" fill="none" stroke="#e2c27b" stroke-width="2"/><path d="M56 144H264M160 41V247" fill="none" stroke="#bba069" stroke-width="2"/><path d="M98 74L220 213M220 74L98 213" stroke="#947c50" stroke-width="1"/><path d="M75 63l12 3-8 9m145-7l11 9-12 4m5 167l-12-2 7-10m-137 0l-10-7 10-8" fill="none" stroke="#684e29" stroke-width="3"/>
  <rect x="59" y="125" width="202" height="58" rx="7" fill="#e8d4a0" stroke="#95754c" stroke-width="2"/>
  <text x="160" y="169" font-size="37" text-anchor="middle" fill="#6d4c2e" font-family="serif" font-weight="bold">月を左へ</text>
  <g fill="#91653c"><path d="M51 42l4 7 8 1-6 6 1 8-7-4-8 4 2-8-6-6 8-1z"/><path d="M271 234l4 7 8 1-6 6 1 8-7-4-8 4 2-8-6-6 8-1z"/></g><path d="M43 282q115-21 234 0" stroke="#8c713e" fill="none" stroke-width="2"/>`;
}
function scrapSvg(index){const x=(index%2)*160,y=Math.floor(index/2)*160;return `<svg viewBox="${x} ${y} 160 160" role="img" aria-label="天文学者の破れた手記の断片">${parchmentArt()}</svg>`}
function scrapsHtml(){const p=state.puzzle;return `<p class="puzzle-lede">机の上には破れた手記が4枚ある。絵と文字のつながりが自然になるよう復元しよう。<b>2枚を順番にタップすると位置を交換</b>できます。</p><div class="torn-grid">${p.scraps.map((idx,pos)=>`<button class="torn-tile ${p.scrapSelected===pos?'selected':''}" data-action="scrap-swap" data-position="${pos}" aria-label="${pos+1}番目の紙片を選択">${scrapSvg(idx)}</button>`).join('')}</div><div class="mini-copy" style="text-align:center;margin-top:12px">${p.scrapSelected===null?'交換したい紙片を2枚選んでください':'最初の紙片を選択中。交換するもう1枚を選択。'}</div>${feedback('scraps')}<div class="puzzle-actions"><button class="primary-btn" data-action="check-scraps">これで復元する</button><button class="soft-btn" data-action="reset-scraps">最初の配置に戻す</button></div>`}
function mirrorHtml(){const used=state.puzzle.mirrorUsed;return `<p class="puzzle-lede">閲覧台の金属板には、不思議な向きの文字が刻まれている。<b>持ち物の道具を選択</b>して調べよう。</p><div class="reversed-text ${used?'read':''}"><div>星の光を追う者は 帰り道を見失う</div></div>
    ${used?`<div class="engraving">「星の光を追う者は、帰り道を見失う。<br>言葉は影に残る」</div><p class="puzzle-lede">扉では、光と何を見比べるべきだろう？</p><form id="mirror-form" class="answer-form"><input name="answer" aria-label="鏡文字の答え" placeholder="ひらがなで回答" required autocomplete="off"><button class="primary-btn" type="submit">答える</button></form>`:
    `<div class="message">${state.selectedItem==='mirror'?'手鏡が選択されています。鏡を金属板に向けてみよう。':'持ち物から「古い手鏡」を選んでください。'}</div><div class="puzzle-actions"><button class="primary-btn" data-action="use-mirror" ${state.selectedItem!=='mirror'?'disabled':''}>手鏡で文字を映す</button></div>`}
    ${feedback('mirror')}`}
function glassArt(){return `<defs><radialGradient id="glassBg"><stop stop-color="#8b4ae5"/><stop offset="1" stop-color="#10214b"/></radialGradient><linearGradient id="shine" x2="1" y2="1"><stop stop-color="#b2f4ff"/><stop offset="1" stop-color="#a475ee"/></linearGradient></defs><rect width="300" height="300" fill="url(#glassBg)"/><g opacity=".55" stroke="#a1c2ef" stroke-width="2" fill="none"><path d="M0 150H300M150 0V300"/><path d="M0 0L300 300M300 0L0 300"/></g><circle cx="150" cy="150" r="105" fill="none" stroke="#e2c0ef" stroke-width="7"/><circle cx="150" cy="150" r="75" fill="#3d2b74" stroke="#d5b2ff" stroke-width="3"/><path d="M163 73a75 75 0 1 0 0 154a62 62 0 1 1 0-154" fill="#faf0bc" opacity=".88"/><path d="M150 91L162 134L204 150L162 163L150 206L136 163L96 150L136 135z" fill="url(#shine)" stroke="#fff0c3" stroke-width="2"/><g fill="#f7d89d"><circle cx="55" cy="45" r="6"/><circle cx="254" cy="65" r="5"/><circle cx="65" cy="257" r="4"/><circle cx="247" cy="241" r="8"/></g><g stroke="#99dfff" stroke-width="3" fill="none"><path d="M5 70Q80 95 150 150Q245 180 294 240"/><path d="M7 251Q98 231 150 150Q210 81 298 33"/></g>`}
function glassSvg(index,rot){const x=(index%2)*150,y=Math.floor(index/2)*150;return `<svg viewBox="${x} ${y} 150 150" style="transform:rotate(${rot*90}deg)" role="img" aria-label="回転可能なステンドグラス">${glassArt()}</svg>`}
function glassHtml(){return `<p class="puzzle-lede">窓のステンドグラスが4枚に分かれている。各ガラスをタップして<b>90度ずつ回転</b>させ、月と星の模様を復元しよう。</p><div class="glass-grid">${state.puzzle.glass.map((rot,i)=>`<button class="glass-tile" data-action="rotate-glass" data-index="${i}" aria-label="${i+1}番目のガラスを90度回転">${glassSvg(i,rot)}<span class="glass-rotate">↻</span></button>`).join('')}</div>${feedback('glass')}<div class="puzzle-actions"><button class="primary-btn" data-action="check-glass">絵柄を確認する</button><button class="soft-btn" data-action="reset-glass">最初から</button></div>`}
function starSvg(){return `<svg viewBox="0 0 240 240" role="img" aria-label="回転する透明星図。上部に月の印、他の方向に星の印がある"><circle cx="120" cy="120" r="108" fill="none" stroke="#c8c8ff" stroke-width="2" stroke-dasharray="4 8"/><circle cx="120" cy="120" r="76" fill="none" stroke="#a7a8fd" stroke-width="1"/><path d="M120 20V220M20 120H220M49 49L191 191M191 49L49 191" stroke="#d0d9ff" stroke-opacity=".5" stroke-width="1"/><path d="M120 83L131 108L158 120L131 132L120 160L109 132L82 120L109 108z" fill="#bea2ff" stroke="#f9e8ff" stroke-width="2"/><path d="M126 29a18 18 0 1 0 0 35a13 13 0 1 1 0-35" fill="#f3dda6"/><g fill="#9fedf1"><circle cx="200" cy="119" r="7"/><circle cx="118" cy="204" r="5"/><circle cx="44" cy="120" r="4"/></g></svg>`}
function starHtml(){const p=state.puzzle;return `<p class="puzzle-lede">星図装置の上に、古い紙片の文字が刻まれている。透明星図を重ね、示された向きに回そう。</p><div class="engraving">「月を左へ」</div><div class="star-chart">${p.starInstalled?`<div class="star-sheet" style="transform:rotate(${p.starRot*90}deg)">${starSvg()}</div>`:'<div style="font-size:62px;opacity:.3">✧</div>'}</div>
    ${p.starInstalled?`<div class="puzzle-actions" style="justify-content:center"><button class="soft-btn" data-action="rotate-star">↻　星図を90度回す</button><button class="primary-btn" data-action="check-star">この向きで固定</button></div>`:
    `<div class="message">${state.selectedItem==='chart'?'透明星図が選択されています。投影台に重ねてみよう。':'持ち物から「透明星図」を選んでください。'}</div><div class="puzzle-actions"><button class="primary-btn" data-action="place-chart" ${state.selectedItem!=='chart'?'disabled':''}>星図を投影台に設置</button></div>`}${feedback('star')}`}
function traceBeam(){
  let x=0,y=3,dir='R',passedLens=false,reached=false;
  const d={R:[1,0],L:[-1,0],U:[0,-1],D:[0,1]};
  const reflect={'/':{R:'U',U:'R',L:'D',D:'L'},'\\':{R:'D',D:'R',L:'U',U:'L'}};
  const points=[[x,y]];const seen=new Set();
  for(let i=0;i<24;i++){
    const [dx,dy]=d[dir];x+=dx;y+=dy;
    if(x<0||x>=6||y<0||y>=4)break;
    points.push([x,y]);
    if(x===2&&y===3)dir=reflect[state.puzzle.beamA][dir];
    if(x===2&&y===1)dir=reflect[state.puzzle.beamB][dir];
    if(x===4&&y===1){if(!state.puzzle.lensInstalled)break;passedLens=true}
    if(x===5&&y===1){reached=passedLens;break}
    const k=`${x},${y},${dir}`;if(seen.has(k))break;seen.add(k);
  }
  return {points,reached,passedLens};
}
function beamSvg(){const result=traceBeam();const cs=70;const pos=([x,y])=>`${x*cs+35},${y*cs+35}`;
  let grid='';for(let x=0;x<6;x++){for(let y=0;y<4;y++)grid+=`<rect x="${x*cs+2}" y="${y*cs+2}" width="66" height="66" rx="7" fill="${(x+y)%2?'#182749':'#152343'}" stroke="#354970" stroke-width="1"/>`}
  const beamPath=result.points.map(pos).join(' ');
  const mirror=(x,y,v,label)=>`<circle cx="${x*cs+35}" cy="${y*cs+35}" r="27" fill="#263056" stroke="#a9acd8" stroke-width="2"/><text x="${x*cs+35}" y="${y*cs+41}" fill="#e8d2ff" text-anchor="middle" font-size="35" font-weight="bold">${v==='/'?'／':'＼'}</text><text x="${x*cs+35}" y="${y*cs+70}" fill="#d2d5ed" text-anchor="middle" font-size="12">${label}</text>`;
  return `<svg class="beam-canvas" viewBox="0 0 420 280" role="img" aria-label="光源から鏡A・Bとレンズを通って扉に届ける配線盤"><defs><filter id="beamGlow"><feGaussianBlur stdDeviation="4"/></filter></defs>${grid}
  <polyline points="${beamPath}" fill="none" stroke="#ffdc87" stroke-width="14" opacity=".4" filter="url(#beamGlow)"/><polyline points="${beamPath}" fill="none" stroke="#ffe7a6" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="35" cy="245" r="21" fill="#ba8d3c" stroke="#ffdc85" stroke-width="2"/><text x="35" y="251" text-anchor="middle" fill="#fff2c9" font-size="18">☼</text>
  ${mirror(2,3,state.puzzle.beamA,'鏡A')}${mirror(2,1,state.puzzle.beamB,'鏡B')}
  <circle cx="315" cy="105" r="23" fill="${state.puzzle.lensInstalled?'#286e87':'#273252'}" stroke="#9fe8ff" stroke-width="2" stroke-dasharray="${state.puzzle.lensInstalled?'0':'5 4'}"/><text x="315" y="111" fill="#e8fcff" text-anchor="middle" font-size="18">${state.puzzle.lensInstalled?'◉':'＋'}</text><text x="315" y="144" fill="#b7ccef" text-anchor="middle" font-size="12">レンズ</text>
  <rect x="361" y="75" width="58" height="62" rx="10" fill="${result.reached?'#543c91':'#253251'}" stroke="${result.reached?'#d4a6ff':'#7a8fc0'}" stroke-width="2"/><text x="390" y="102" fill="#e7d7ff" text-anchor="middle" font-size="16">扉</text><text x="390" y="123" fill="#c6d1e9" text-anchor="middle" font-size="11">GOAL</text></svg>`;
}
function beamHtml(){const p=state.puzzle;return `<p class="puzzle-lede">星図装置が起動し、光源に火がともった。2枚の鏡の向きを調節して光を<b>上へ、そして右へ</b>と導き、光学レンズを経由して扉を照らそう。</p><div class="beam-wrap">${beamSvg()}</div><div class="beam-controls"><button class="beam-control" data-action="rotate-beam-a">鏡A：${p.beamA==='/'?'／':'＼'}　切替 ↻</button><button class="beam-control" data-action="rotate-beam-b">鏡B：${p.beamB==='/'?'／':'＼'}　切替 ↻</button><button class="beam-control" data-action="place-lens" ${p.lensInstalled||state.selectedItem!=='lens'?'disabled':''}>${p.lensInstalled?'✓ レンズ装着済み':'◉ レンズを装着'}</button></div>
  <div class="mini-copy" style="text-align:center;margin-top:9px">${p.lensInstalled?'光学レンズは正しい位置にセットされている。':'レンズを置くには、先に持ち物から選択してください。'}</div>${feedback('beam')}<div class="puzzle-actions"><button class="primary-btn" data-action="check-beam">光を照射する</button></div>`}
function doorHtml(){return `<p class="puzzle-lede">光が扉の9文字を照らし、一部の文字だけが影になっている。これまでに見つけた手がかりを思い出して、扉の言葉を答えよう。</p>
  <div class="door-letter-grid">${LETTERS.map(l=>`<div class="door-letter ${l.lit?'lit':''}">${l.c}</div>`).join('')}</div>
  <div class="engraving">「星の光を追う者は、帰り道を見失う」</div>
  <form id="door-form" class="answer-form"><input name="answer" aria-label="封印の扉の答え" placeholder="扉を開く言葉を入力" autocomplete="off" required><button class="primary-btn" type="submit">解錠する</button></form>${feedback('door')}`}
function puzzleHtml(id){
  const p=PUZZLE_MAP[id];if(!p)return '';
  const panel=solved(id)?solvedHtml(p):!unlocked(id)?lockedHtml(p):({books:bookHtml,seal:sealHtml,scraps:scrapsHtml,mirror:mirrorHtml,glass:glassHtml,star:starHtml,beam:beamHtml,door:doorHtml}[id]||(()=>''))();
  return modalFrame({title:p.title,eyebrow:`${p.num} / ${p.kind}`,sub:`${esc(ZONES[p.zone].title)}　${solved(id)?'・解決済み':unlocked(id)?'・調査可能':'・未解放'}`,body:`${panel}${!solved(id)&&unlocked(id)?hintHtml(p):''}`,
    footer:`<span class="mini-copy">${solved(id)?'記録済み':unlocked(id)?'観察 → 仮説 → 試す　の順番で考えよう':'ほかの仕掛けを先に解こう'}</span><button class="soft-btn" data-action="close">探索に戻る</button>`,wide:id==='beam'});
}
function introHtml(isResume=false){
  return `<div class="overlay-backdrop"><section class="modal wide" role="dialog" aria-modal="true" aria-label="ゲーム開始" tabindex="-1"><div class="intro-hero"><div class="intro-canvas"><div class="kicker">BEYOND THE DOORS • CHAPTER 01</div><h2>封印された魔法図書館</h2></div></div>
  <div class="intro-story">${isResume?`<p>この図書館での探索記録が残っています。前回の続きから再開できます。</p><p style="color:var(--purple-soft)">解決：${state.solved.length}/8 ／ プレイ時間：${duration(state.elapsedMs)}</p>`:
    `<p>目を覚ますと、そこは星の光が差し込む巨大な図書館だった。時計の針は動かず、どの扉にも鍵穴がない。</p><p class="story-quote">「光を追うだけでは、真実には届かない」</p><p>目の前に8つの謎が待ち受ける。部屋を探索し、道具と手がかりを集めて、出口の封印を解こう。</p>`}</div>
  <div class="intro-footer"><button class="primary-btn" data-action="start">${isResume?'前回の続きから':'探索をはじめる'}　→</button>${isResume?'<button class="soft-btn" data-action="reset">最初からやり直す</button>':'<button class="soft-btn" data-action="guide">遊び方を見る</button>'}</div>
  <div class="intro-footnote">時間制限なし / 8つの謎 / 自動セーブ / PC・スマートフォン対応</div></section></div>`;
}
function resultHtml(){const hs=numberOfHints();const rows=DEBRIEF.map(d=>`<div><b>${esc(d.title)}</b><p>${esc(d.description)}</p></div>`).join('');
  return modalFrame({title:'第1世界 脱出成功',eyebrow:'STAGE CLEAR / THE SEALED LIBRARY',sub:'封印が解け、遠くで次の扉が目を覚ました。',wide:true,closable:false,
    body:`<div class="big-success"><div class="trophy">✦</div><div class="result-grade">${rank()} RANK</div><h3>光の向こうには、影があった。</h3><p>星図と古い手記の意味がつながり、扉に刻まれた秘密を解き明かした。<br>最初の扉の欠片を手に入れた！</p></div>
    <div class="result-stats"><div><b>${duration(state.elapsedMs)}</b><span>クリア時間</span></div><div><b>${hs}</b><span>ヒント使用数</span></div><div><b>${state.mistakes}</b><span>誤答回数</span></div></div>
    <div class="puzzle-subtitle">今回身につけた考え方</div><div class="debrief">${rows}</div>
    <div class="message">今回の評価はこのゲーム内での参考値です。本番の脱出成功率を保証するものではありません。初見の高難度問題では、資料の整理と発想の転換がさらに重要になります。</div>
    ${best?`<div class="mini-copy" style="margin-top:13px">自己ベスト：${duration(best.time)} / ヒント ${best.hints}回</div>`:''}`,
    footer:`<button class="soft-btn" data-action="notes">調査メモを見る</button><div class="button-row"><button class="soft-btn" data-action="copy-result">結果をコピー</button><button class="primary-btn" data-action="reset">もう一度プレイ</button></div>`});
}
function notesHtml(){const noteList=PUZZLES.filter(s=>solved(s.id)).map(p=>`<article class="note-entry"><b>${p.num}　${esc(p.title)}</b><p>${esc(p.note)}</p></article>`).join('');return modalFrame({title:'探偵の調査ノート',eyebrow:'DETECTIVE NOTES',sub:'一度見つけた手がかりは、別の謎でも役に立つ。',wide:true,
  body:`<div class="puzzle-subtitle">自動記録した発見（${state.solved.length}件）</div><div class="notes-list">${noteList||'<div class="note-entry"><p>まだ記録はありません。部屋を探索しましょう。</p></div>'}</div><div class="puzzle-subtitle" style="margin-top:21px">自由メモ</div><textarea id="personal-note" rows="5" aria-label="自由メモ" placeholder="気づいた法則、まだ使っていない手がかりなどを書いてみよう" style="width:100%;resize:vertical;background:#0b1429;color:white;border:1px solid #586080;border-radius:12px;padding:13px;line-height:1.8">${esc(state.personalNote)}</textarea><div class="mini-copy">入力内容はこのブラウザ内に自動保存されます。</div>`,footer:'<span class="mini-copy">情報を整理しながら考える練習に。</span><button class="soft-btn" data-action="close">探索に戻る</button>'});}
function mapHtml(){return modalFrame({title:'探索マップ',eyebrow:'LIBRARY MAP',sub:'エリアを選び、気になる仕掛けを調べよう。',wide:true,body:`<div class="map-grid">${PUZZLES.map(p=>`<button class="map-card" data-action="jump-puzzle" data-id="${p.id}"><strong>${p.num} ${esc(p.title)}</strong><small>${esc(ZONES[p.zone].short)}　 / ${solved(p.id)?'✓ 解決済み':unlocked(p.id)?'調査可能':'まだ調べる情報が足りない'}</small></button>`).join('')}</div>`,footer:'<span class="mini-copy">どこから調査しても構いません。</span><button class="soft-btn" data-action="close">探索に戻る</button>'});}
function settingsHtml(){return modalFrame({title:'ゲームの設定',eyebrow:'SETTINGS',sub:'記録は自動保存されます。',body:`<div class="opt-row"><span>効果音</span><button class="toggle" data-action="sound">${state.sound?'ON':'OFF'}</button></div><div class="opt-row"><span>プレイ時間の計測</span><button class="toggle" data-action="pause">${state.paused?'再開する':'一時停止'}</button></div><div class="message">このブラウザのlocalStorageに保存します。別の端末へ自動では引き継がれません。プライベートモードなどでは保存できない場合があります。</div>${storageOK?'':'<div class="message err">この環境ではデータ保存ができません。</div>'}<div style="margin-top:20px"><button class="danger-btn" data-action="reset">このステージを最初からやり直す</button></div>`,footer:'<span class="mini-copy">進行状況・メモ・ヒント使用履歴は自動保存</span><button class="soft-btn" data-action="close">閉じる</button>'});}
function guideHtml(){return modalFrame({title:'遊び方',eyebrow:'HOW TO PLAY',body:`<div class="debrief"><div><b>1. 部屋を調べる</b><p>画面内の光る印、または背景下の調査ボタンから仕掛けを開きます。左右の矢印でエリアを移動できます。</p></div><div><b>2. 謎を解く</b><p>本を並べる、図形を押す、紙片を入れ替える、ガラスを回すなど、操作によって答えを導きます。</p></div><div><b>3. アイテムを使う</b><p>手に入れた道具は「持ち物」から選択し、対象の仕掛け画面で使用します。選択中のアイテムは紫色に光ります。</p></div><div><b>4. 情報を組み合わせる</b><p>解いた内容は調査メモに自動記録されます。中謎や大謎で以前の情報を使います。ヒントは3段階です。</p></div><div><b>5. 自動セーブ</b><p>進行状況と自由メモはこのブラウザに保存されます。通常は次回アクセス時に途中から再開できます。</p></div></div><div class="message">本作品はオリジナルの練習ゲームです。公式の名探偵コナン脱出ゲームの問題・演出を再現したものではありません。</div>`,footer:'<span class="mini-copy">探索に迷ったらマップとメモを確認しましょう。</span><button class="primary-btn" data-action="close">わかった</button>'});}
function modalHtml(){if(!overlay)return '';switch(overlay.type){case'intro':return introHtml();case'resume':return introHtml(true);case'result':return resultHtml();case'puzzle':return puzzleHtml(overlay.id);case'notes':return notesHtml();case'map':return mapHtml();case'settings':return settingsHtml();case'guide':return guideHtml();default:return ''}}
function render(){app.innerHTML=shellHtml()+modalHtml();document.body.style.overflow=overlay?'hidden':'';const timer=document.querySelector('#play-clock');if(timer)timer.textContent=duration(state.elapsedMs);if(overlay){document.querySelector('.modal')?.focus({preventScroll:true})}}
function normalizeAnswer(value){return String(value??'').normalize('NFKC').trim().replace(/[\s　]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[!！。.、,]/g,'').toLowerCase()}

function handleAction(action,el){
  const id=el.dataset.id;
  switch(action){
    case'start':state.phase='playing';state.paused=false;overlay=null;lastTick=performance.now();save();render();break;
    case'reset':resetGame();break;
    case'close':closeModal();break;
    case'view':setView(Number(el.dataset.view));break;
    case'view-prev':setView(state.view-1);break;
    case'view-next':setView(state.view+1);break;
    case'open-puzzle':overlayOpen('puzzle',id);break;
    case'jump-puzzle':state.view=PUZZLE_MAP[id].zone;save();overlayOpen('puzzle',id);break;
    case'notes':overlayOpen('notes');break;
    case'map':overlayOpen('map');break;
    case'settings':overlayOpen('settings');break;
    case'guide':overlayOpen('guide');break;
    case'item':selectItem(id);break;
    case'hint':state.hints[id]=Math.min(3,(state.hints[id]||0)+1);save();render();break;
    case'add-book':if(!state.puzzle.books.includes(id))state.puzzle.books.push(id);state.puzzle.feedback={};save();render();break;
    case'reset-books':state.puzzle.books=[];state.puzzle.feedback={};save();render();break;
    case'check-books':if(state.puzzle.books.join('')==='星花鍵月')complete('books');else notifyFeedback('books',false,'まだ並びが違う。3つの条件を確認してみよう。');break;
    case'add-seal':if(!state.puzzle.seal.includes(id))state.puzzle.seal.push(id);state.puzzle.feedback={};save();render();break;
    case'reset-seal':state.puzzle.seal=[];state.puzzle.feedback={};save();render();break;
    case'check-seal':if(state.puzzle.seal.join(',')==='円,三角形,四角形,五角形')complete('seal');else notifyFeedback('seal',false,'封印はまだ解けない。角の数を見直してみよう。');break;
    case'scrap-swap':{
      const pos=Number(el.dataset.position);if(state.puzzle.scrapSelected===null){state.puzzle.scrapSelected=pos}
      else if(state.puzzle.scrapSelected===pos){state.puzzle.scrapSelected=null}
      else{const from=state.puzzle.scrapSelected;[state.puzzle.scraps[from],state.puzzle.scraps[pos]]=[state.puzzle.scraps[pos],state.puzzle.scraps[from]];state.puzzle.scrapSelected=null}
      state.puzzle.feedback={};save();render();break;
    }
    case'reset-scraps':state.puzzle.scraps=[3,1,0,2];state.puzzle.scrapSelected=null;state.puzzle.feedback={};save();render();break;
    case'check-scraps':if(state.puzzle.scraps.join(',')==='0,1,2,3')complete('scraps');else notifyFeedback('scraps',false,'紙片がまだつながっていない。中央の模様と文字を確かめよう。');break;
    case'use-mirror':if(state.selectedItem==='mirror'&&state.inventory.includes('mirror')){state.puzzle.mirrorUsed=true;save();render();beep()}break;
    case'rotate-glass':state.puzzle.glass[Number(el.dataset.index)]=(state.puzzle.glass[Number(el.dataset.index)]+1)%4;state.puzzle.feedback={};save();render();break;
    case'reset-glass':state.puzzle.glass=[2,1,3,1];state.puzzle.feedback={};save();render();break;
    case'check-glass':if(state.puzzle.glass.every(v=>v===0))complete('glass');else notifyFeedback('glass',false,'つながりの一部がまだ不自然だ。絵の切れ目を確認しよう。');break;
    case'place-chart':if(state.selectedItem==='chart'&&state.inventory.includes('chart')){state.puzzle.starInstalled=true;save();render();beep()}break;
    case'rotate-star':state.puzzle.starRot=(state.puzzle.starRot+1)%4;state.puzzle.feedback={};save();render();break;
    case'check-star':if(state.puzzle.starInstalled&&state.puzzle.starRot===3)complete('star');else notifyFeedback('star',false,'月の印はまだ左側にないようだ。');break;
    case'rotate-beam-a':state.puzzle.beamA=state.puzzle.beamA==='/'?'\\':'/';state.puzzle.feedback={};save();render();break;
    case'rotate-beam-b':state.puzzle.beamB=state.puzzle.beamB==='/'?'\\':'/';state.puzzle.feedback={};save();render();break;
    case'place-lens':if(state.selectedItem==='lens'&&state.inventory.includes('lens')){state.puzzle.lensInstalled=true;save();render();beep()}break;
    case'check-beam':if(traceBeam().reached)complete('beam');else notifyFeedback('beam',false,'光はまだ扉へ届かない。2枚の鏡の向きとレンズを確認しよう。');break;
    case'pause':state.paused=!state.paused;lastTick=performance.now();save();render();break;
    case'sound':state.sound=!state.sound;save();render();if(state.sound)beep();break;
    case'copy-result':{
      const text=`BEYOND THE DOORS / 第1世界 脱出成功\nランク：${rank()}　時間：${duration(state.elapsedMs)}　ヒント：${numberOfHints()}回　誤答：${state.mistakes}回`;
      if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(()=>toast('結果をコピーしました')).catch(()=>toast('コピーできませんでした'))}
      else{window.prompt('コピーする文章',text)}break;
    }
  }
}
document.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(!target||target.disabled)return;handleAction(target.dataset.action,target)});
document.addEventListener('submit',e=>{
  if(!['mirror-form','door-form'].includes(e.target.id))return;
  e.preventDefault();const val=normalizeAnswer(e.target.elements.answer.value);
  if(e.target.id==='mirror-form'){if(state.puzzle.mirrorUsed&&['かげ','影'].map(normalizeAnswer).includes(val))complete('mirror');else notifyFeedback('mirror',false,'まだ違うようだ。文章が何を示しているか読み直そう。')}
  else if(e.target.id==='door-form'){if(unlocked('door')&&['ひらけ','開け','ひらけよ'].map(normalizeAnswer).includes(val))complete('door');else notifyFeedback('door',false,'扉は反応しない。何を読むべきか、手記を見直そう。')}
});
document.addEventListener('input',e=>{if(e.target.id==='personal-note'){state.personalNote=e.target.value;save()}});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(overlay?.type==='puzzle'||['notes','map','settings','guide'].includes(overlay?.type)){e.preventDefault();closeModal()}}
  if(!overlay&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){
    if(e.key==='ArrowLeft'){e.preventDefault();setView(state.view-1)}
    if(e.key==='ArrowRight'){e.preventDefault();setView(state.view+1)}
  }
});
let activeTs=performance.now();
setInterval(()=>{
  const now=performance.now(),delta=Math.min(1000,Math.max(0,now-activeTs));activeTs=now;
  if(state.phase==='playing'&&!state.paused&&!document.hidden){state.elapsedMs+=delta;const t=document.querySelector('#play-clock');if(t)t.textContent=duration(state.elapsedMs)}
  if(now-lastPersist>4000){if(state.phase==='playing')save();lastPersist=now}
},250);
document.addEventListener('visibilitychange',()=>{activeTs=performance.now();save()});
window.addEventListener('pagehide',save);
render();
