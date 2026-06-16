/* ═══════════════════════════════════════════════════════════
   quiz/app.js — Quiz app: home, slides, quiz engine, calculators
   Depends on: topics.js (data) + ../shared/ui.js (theme/esc/shuffle)
   ═══════════════════════════════════════════════════════════ */

/* Redraw active chart when theme changes (colors update). */
window.addEventListener('themechange', () => {
  if (activeTopic && activeSlide !== null) setTimeout(initSlideCalc, 60);
});

/* ══════════════════════════════════════════════════════════
   HOME SCREEN
══════════════════════════════════════════════════════════ */
const WIKI_BASE = 'https://github.com/hachi-admin/hachi-wiki/blob/main/';

/* ── Quiz API / auth ────────────────────────────────────── */
const _QP = new URLSearchParams(window.location.search);
const _DEFAULT_API = 'https://hachi-core-685554938840.asia-northeast1.run.app';
const API_BASE = (_QP.get('api') || localStorage.getItem('nogem-api') || _DEFAULT_API).replace(/\/$/, '');
if (API_BASE) localStorage.setItem('nogem-api', API_BASE);

// Handle ?quiz_token= redirect from OAuth callback
(function _captureToken() {
  const t = _QP.get('quiz_token');
  if (!t) return;
  localStorage.setItem('quiz-jwt', t);
  const url = new URL(window.location.href);
  url.searchParams.delete('quiz_token');
  history.replaceState(null, '', url.toString());
})();

function _quizJwt()  { return localStorage.getItem('quiz-jwt') || ''; }
function _quizUser() {
  const jwt = _quizJwt();
  if (!jwt) return null;
  try {
    const b = jwt.split('.')[1];
    return JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function _renderQuizUser() {
  const btn = document.getElementById('quiz-user-btn');
  if (!btn) return;
  const u = _quizUser();
  if (u) {
    // Show round avatar only — name appears on hover via title
    btn.innerHTML = u.avatar
      ? `<img src="${u.avatar}&s=40" style="width:26px;height:26px;border-radius:50%;display:block">`
      : `<span style="width:26px;height:26px;border-radius:50%;background:var(--acc);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${esc((u.name||u.sub||'?').slice(0,2).toUpperCase())}</span>`;
    btn.title = `@${u.sub} — click to sign out`;
    btn.style.padding = '0';
    btn.style.width = '34px';
    btn.style.height = '34px';
    btn.style.borderRadius = '50%';
    btn.style.overflow = 'hidden';
    btn.onclick = () => { localStorage.removeItem('quiz-jwt'); _renderQuizUser(); _syncLoad(); };
  } else {
    btn.innerHTML = 'Sign in';
    btn.style.padding = '';
    btn.style.width = '';
    btn.style.height = '';
    btn.style.borderRadius = '';
    btn.style.overflow = '';
    btn.title = 'Sign in with GitHub to sync progress';
    btn.onclick = () => { window.location.href = `${API_BASE}/auth/quiz-login?return=${encodeURIComponent(window.location.href)}`; };
  }
}

async function _syncLoad() {
  if (!API_BASE || !_quizJwt()) return;
  try {
    const r = await fetch(`${API_BASE}/api/quiz/progress`, { headers: { Authorization: `Bearer ${_quizJwt()}` } });
    if (!r.ok) return;
    const { srs = {}, scores = {}, hidden = [] } = await r.json();
    if (Object.keys(srs).length)    localStorage.setItem('quiz-srs', JSON.stringify(srs));
    if (Object.keys(scores).length) localStorage.setItem('quiz-scores', JSON.stringify(scores));
    if (hidden.length)              localStorage.setItem('quiz-hidden-topics', JSON.stringify(hidden));
    buildHome();
  } catch {}
}

async function _syncSave() {
  if (!API_BASE || !_quizJwt()) return;
  try {
    const srs     = JSON.parse(localStorage.getItem('quiz-srs')     || '{}');
    const scores  = JSON.parse(localStorage.getItem('quiz-scores')  || '{}');
    const hidden  = JSON.parse(localStorage.getItem('quiz-hidden-topics') || '[]');
    await fetch(`${API_BASE}/api/quiz/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_quizJwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ srs, scores, hidden }),
    });
  } catch {}
}
let manageMode = false;

/* ── New-request form state ─────────────────────────── */
const QKEY = 'sb-quiz';
let obFiles = null, nrSrcs = [];

/* Decode key for wiki-tree.js — XOR+hex, key lives here only */
const _K = 'sb2026xw';
function _dec(h) {
  return (h.match(/.{2}/g)||[]).map((x,i)=>String.fromCharCode(parseInt(x,16)^_K.charCodeAt(i%_K.length))).join('');
}

function getHidden() {
  try { return JSON.parse(localStorage.getItem('quiz-hidden-topics') || '[]'); }
  catch { return []; }
}
function setHidden(arr) { localStorage.setItem('quiz-hidden-topics', JSON.stringify([...new Set(arr)])); }
function toggleHidden(id) {
  const h = getHidden();
  setHidden(h.includes(id) ? h.filter(x => x !== id) : [...h, id]);
  buildHome();
}
function toggleManage() { manageMode = !manageMode; buildHome(); }
function resetHidden() { setHidden([]); buildHome(); }

function wikiLinks(pages) {
  return (pages || []).map(p => {
    const url  = WIKI_BASE + p.replace(/ /g, '%20');
    const name = p.split('/').pop().replace('.md', '');
    return `<li><a href="${url}" target="_blank" onclick="event.stopPropagation()" title="${p}">${name}</a></li>`;
  }).join('');
}

function topicCard(t) {
  const hidden = getHidden().includes(t.id);
  if (hidden && !manageMode) return '';
  const cls     = `topic-card${manageMode ? ' manage' : ''}${hidden ? ' is-hidden' : ''}`;
  const onclick = manageMode ? '' : ` onclick="openTopic('${t.id}')"`;
  const hideBtn = manageMode
    ? `<button class="tc-hide${hidden ? ' unhide' : ''}" onclick="event.stopPropagation();toggleHidden('${t.id}')">${hidden ? '↩ Unhide' : '✕ Hide'}</button>`
    : '';
  const startBtn = manageMode ? ''
    : `<button class="btn btn-acc neu-btn" style="--tc:${t.color}">Start Learning →</button>`;
  return `
    <div class="${cls}"${onclick}>
      ${hideBtn}
      <div class="tc-icon">${t.icon}</div>
      <div class="tc-title">${t.title}</div>
      <div class="tc-desc">${t.description}</div>
      <div class="tc-meta">
        <span class="tc-badge">📖 ${(t.slides||[]).length} slides</span>
        <span class="tc-badge">📝 ${(t.questions||[]).length} questions</span>
      </div>
      <details class="tc-wiki">
        <summary onclick="event.stopPropagation()">📂 ${(t.wikiPages||[]).length} wiki sources</summary>
        <ul>${wikiLinks(t.wikiPages)}</ul>
      </details>
      ${startBtn}
    </div>`;
}

function buildHome() {
  const topics = window.TOPICS || [];
  const hidden = getHidden();
  const hiddenCount = topics.filter(t => hidden.includes(t.id)).length;
  const nrOpen = !(document.getElementById('nr-wrap')?.hidden ?? true);
  const pending = JSON.parse(localStorage.getItem(QKEY) || '[]').length;
  const pendingBadge = pending && !nrOpen
    ? `<a class="hbtn pill" href="requests.html" style="font-size:.72rem;text-decoration:none">📥 ${pending} pending</a>` : '';

  const toolbar = `
    <div class="home-toolbar">
      <button class="hbtn pill" id="nr-toggle-btn" onclick="toggleNR()">${nrOpen ? '✕ Close' : '+ New request'}</button>
      ${pendingBadge}
      <button class="hbtn pill" onclick="toggleManage()" style="margin-left:auto">${manageMode ? '✓ Done' : '⚙️ Manage topics'}</button>
      ${manageMode
        ? `<span class="ht-note">Hide topics you don't want on the home screen — saved in this browser, reversible anytime.</span>
           ${hiddenCount ? `<span class="spacer"></span><button class="hbtn pill" onclick="resetHidden()">↺ Show all (${hiddenCount} hidden)</button>` : ''}`
        : (hiddenCount ? `<span class="ht-note">${hiddenCount} topic${hiddenCount === 1 ? '' : 's'} hidden — ⚙️ Manage to restore</span>` : '')}
    </div>`;
  let tb = document.getElementById('home-toolbar');
  if (tb) tb.remove();
  document.getElementById('topic-grid')
    .insertAdjacentHTML('beforebegin', `<div id="home-toolbar">${toolbar}</div>`);

  const addCard = manageMode ? '' : `
    <div class="topic-card" style="opacity:.55;cursor:default;border-style:dashed">
      <div class="tc-icon">➕</div>
      <div class="tc-title">Add a Topic</div>
      <div class="tc-desc">Edit <code>topics.js</code> following the TOPIC_TEMPLATE. See <code>CLAUDE.md</code> for Claude Code instructions.</div>
    </div>`;
  document.getElementById('topic-grid').innerHTML = topics.map(topicCard).join('') + addCard;
}

/* ══════════════════════════════════════════════════════════
   NEW REQUEST FORM
══════════════════════════════════════════════════════════ */
function toggleNR() {
  const w = document.getElementById('nr-wrap');
  w.hidden = !w.hidden;
  if (!w.hidden) { loadOb(); setTimeout(() => document.getElementById('nr-topic')?.focus(), 60); }
  buildHome();
}

function loadOb() {
  if (obFiles !== null) return;
  obFiles = (window.OB_TREE || []).map(_dec).filter(Boolean);
}

function nrSearch() {
  const q = document.getElementById('nr-src').value.trim().toLowerCase();
  const box = document.getElementById('nr-drop');
  if (!obFiles?.length || !q) { box.classList.remove('show'); return; }
  const m = obFiles.filter(p => p.toLowerCase().includes(q)).slice(0, 12);
  box.innerHTML = m.length
    ? m.map(p => `<div class="nr-item" data-path="${esc(p)}">${esc(p.replace(/^wiki\//, ''))}</div>`).join('')
    : '<div class="nr-item" style="cursor:default;color:var(--m2)">No wiki pages match</div>';
  box.classList.add('show');
}

function nrAdd(p) {
  if (p && !nrSrcs.includes(p)) nrSrcs.push(p);
  nrRenderChips();
  document.getElementById('nr-src').value = '';
  document.getElementById('nr-drop').classList.remove('show');
}

function nrRm(p) { nrSrcs = nrSrcs.filter(x => x !== p); nrRenderChips(); }

function nrRenderChips() {
  document.getElementById('nr-chips').innerHTML = nrSrcs.map(p =>
    `<span class="nr-chip">${esc(p.split('/').pop().replace(/\.md$/, ''))}<button data-rm="${esc(p)}" title="Remove">✕</button></span>`
  ).join('');
}

function nrSave() {
  const topic = document.getElementById('nr-topic').value.trim();
  if (!topic) { document.getElementById('nr-topic').focus(); return; }
  const a = JSON.parse(localStorage.getItem(QKEY) || '[]');
  a.push({ id: Math.random().toString(36).slice(2, 9), topic, sources: nrSrcs.slice(),
           note: document.getElementById('nr-note').value.trim(), ts: new Date().toISOString() });
  localStorage.setItem(QKEY, JSON.stringify(a));
  document.getElementById('nr-topic').value = '';
  document.getElementById('nr-note').value = '';
  nrSrcs = []; nrRenderChips();
  buildHome();
  const btn = document.querySelector('#nr-wrap .btn-acc');
  if (btn) { const t = btn.textContent; btn.textContent = '✓ Saved!'; setTimeout(() => btn.textContent = t, 1400); }
  document.getElementById('nr-topic').focus();
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
let activeTopic = null, activeSlide = 0, activeMode = 'slides';

function show(id) {
  const swap = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + id).classList.add('active');
    window.scrollTo({ top: 0 });
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(swap);
  } else { swap(); }
}

function goHome() {
  CH_destroyAll();
  activeTopic = null;
  show('home');
}

function openTopic(id) {
  activeTopic = (window.TOPICS || []).find(t => t.id === id);
  if (!activeTopic) return;
  activeSlide = 0;
  activeMode = 'slides';
  document.getElementById('topic-title').textContent = activeTopic.icon + ' ' + activeTopic.title;
  setMode('slides');
  show('topic');
  buildSlides();
  goSlide(0);
}

function setMode(mode) {
  activeMode = mode;
  document.getElementById('view-slides').style.display = mode === 'slides' ? '' : 'none';
  document.getElementById('view-quiz').style.display   = mode === 'quiz'   ? '' : 'none';
  document.getElementById('btn-slides').classList.toggle('active', mode === 'slides');
  document.getElementById('btn-quiz').classList.toggle('active', mode === 'quiz');
  if (mode === 'quiz') { qIndex = 0; qScore = 0; qAnswered = false; renderQ(); }
}

/* ══════════════════════════════════════════════════════════
   SLIDES
══════════════════════════════════════════════════════════ */
function buildSlides() {
  const slides = activeTopic.slides || [];
  document.getElementById('sdots').innerHTML = slides.map((s, i) =>
    `<button class="sdot" onclick="goSlide(${i})" title="${s.title}">${i + 1}</button>`
  ).join('');
  document.getElementById('slides-container').innerHTML = slides.map((s, i) =>
    `<div class="slide" id="sl${i}">${renderSlide(s)}</div>`
  ).join('');
}

function goSlide(n) {
  const slides = activeTopic.slides || [];
  CH_destroyAll();
  document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sdot').forEach(d => d.classList.remove('active'));
  activeSlide = n;
  document.getElementById('sl' + n)?.classList.add('active');
  document.querySelectorAll('.sdot')[n]?.classList.add('active');
  document.getElementById('slbl').textContent = slides[n]?.title || '';
  document.getElementById('sctr').textContent = `${n + 1} / ${slides.length}`;
  document.getElementById('pb').disabled = n === 0;
  document.getElementById('nb').textContent = n === slides.length - 1 ? '📝 Take Quiz' : 'Next →';
  document.getElementById('nb').onclick = n === slides.length - 1
    ? () => setMode('quiz')
    : () => nextS();
  if (slides[n]?.calc) setTimeout(initSlideCalc, 80);
}

function prevS() { if (activeSlide > 0) goSlide(activeSlide - 1); }
function nextS() { const l = (activeTopic.slides || []).length; if (activeSlide < l - 1) goSlide(activeSlide + 1); }

/* ── Slide renderer ─────────────────────────────────────── */
function renderSlide(s) {
  const srcLinks = (s.wikiSource || []).map(p => {
    const name = p.split('/').pop().replace('.md', '');
    const url  = WIKI_BASE + p.replace(/ /g, '%20');
    return `<a href="${url}" target="_blank">${name}</a>`;
  }).join(' · ');

  const left = `
    <div>
      <div class="s-num">SLIDE ${s.num}</div>
      <div class="s-ttl">${s.title}</div>
      <p class="s-body">${s.body}</p>
      ${s.formula ? `<div class="fml">${s.formula}</div>` : ''}
      ${s.riskMap ? renderRiskMap() : ''}
      ${s.table   ? renderTable(s.table) : ''}
      ${(s.keyPoints || []).map(k => `<div class="kp ${k.color || ''}">${k.text}</div>`).join('')}
      ${srcLinks ? `<div class="wiki-src">📂 ${srcLinks}</div>` : ''}
    </div>`;

  if (s.calc) {
    return `<div class="s2">${left}<div class="s-calc">${calcHTML(s.calc)}</div></div>`;
  }
  return `<div class="s-full">${left}</div>`;
}

function renderTable(t) {
  return `<table class="st">
    <tr>${t.headers.map(h => `<th>${h}</th>`).join('')}</tr>
    ${t.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
  </table>`;
}

function renderRiskMap() {
  const reg = [['📈','Market Risk','Interest rates, FX, equity price fluctuations ← daily exposure'],
               ['🏦','Credit Risk','Counterparty default ← daily exposure'],
               ['⚙️','Operational Risk','Errors, system failures, fraud ← sudden downside'],
               ['💧','Liquidity Risk','Unable to secure funding ← sudden downside']];
  const oth = [['🌏','Geopolitical / Event Risk','→ BCP (Business Continuity Plan)'],
               ['📡','Systemic Risk / Settlement Risk','→ RRP (Recovery & Resolution Plan)'],
               ['⚖️','Legal Risk',''],
               ['💬','Reputational Risk','']];
  const rows = arr => arr.map(([i, n, d]) => `
    <div class="ri"><span class="ico">${i}</span>
      <div><strong>${n}</strong>${d ? `<br><span>${d}</span>` : ''}</div>
    </div>`).join('');
  return `<div class="rg">
    <div class="rcat"><h4 style="color:var(--acc)">📋 Regulatory Targets</h4>${rows(reg)}</div>
    <div class="rcat"><h4 style="color:var(--m)">🔲 Other Domains</h4>${rows(oth)}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   CALC PANEL HTML
══════════════════════════════════════════════════════════ */
function calcHTML(type) {
  const h = {
    var: `<h4>📐 VaR Simulator</h4>
      <div class="ig"><label>Portfolio 億円</label><input type="number" id="v-p" value="1000" min="1" oninput="dVaR()"></div>
      <div class="ig"><label>Daily volatility σ (%)</label><input type="number" id="v-v" value="1.5" min="0.1" max="20" step="0.1" oninput="dVaR()"></div>
      <div class="ig2">
        <div class="ig"><label>Holding period (days)</label><input type="number" id="v-d" value="10" min="1" max="252" oninput="dVaR()"></div>
        <div class="ig"><label>Confidence</label>
          <select id="v-c" onchange="dVaR()">
            <option value="1.645">95%</option><option value="2.326" selected>99%</option><option value="3.090">99.9%</option>
          </select>
        </div>
      </div>
      <div class="rbox"><div class="rl">VaR (Max Loss)</div><div class="rv" id="v-rv">—</div><div class="rs" id="v-rs">—</div></div>
      <div class="cw"><canvas id="cv"></canvas></div>
      <div class="cw-note">Red = tail (exceeds VaR) / Blue = normal distribution</div>`,

    el: `<h4>📐 Expected Loss (EL)</h4>
      <div class="ig"><label>PD (Default probability) — <span id="pd-v" style="color:var(--acc);font-weight:700">2.0%</span></label>
        <input type="range" id="el-pd" min="0.1" max="30" step="0.1" value="2" oninput="dEL()"></div>
      <div class="ig"><label>EAD (Exposure) 億円</label><input type="number" id="el-ea" value="100" min="1" oninput="dEL()"></div>
      <div class="ig"><label>LGD (Loss rate) — <span id="lgd-v" style="color:var(--red);font-weight:700">45%</span></label>
        <input type="range" id="el-lg" min="1" max="100" step="1" value="45" oninput="dEL()"></div>
      <div class="rbox"><div class="rl">Expected Loss (EL)</div><div class="rv" id="el-rv">—</div><div class="rs" id="el-rs">—</div></div>
      <div class="cw"><canvas id="ce"></canvas></div>`,

    lcr: `<h4>📐 LCR Calculator</h4>
      <div class="ig"><label>Level 1 assets (国債等 100%) 億円</label><input type="number" id="lc-l1" value="500" min="0" oninput="dLCR()"></div>
      <div class="ig"><label>Level 2A assets (社債等 85%) 億円</label><input type="number" id="lc-2a" value="100" min="0" oninput="dLCR()"></div>
      <div class="ig2">
        <div class="ig"><label>Outflows 億円</label><input type="number" id="lc-ot" value="600" min="0" oninput="dLCR()"></div>
        <div class="ig"><label>Inflows 億円</label><input type="number" id="lc-in" value="100" min="0" oninput="dLCR()"></div>
      </div>
      <div class="rbox"><div class="rl">LCR</div><div class="rv" id="lc-rv">—</div><div class="rs" id="lc-rs">—</div></div>
      <div class="cw"><canvas id="cl"></canvas></div>`,

    basel: `<h4>📐 Basel III Capital Ratio</h4>
      <div style="font-size:.68rem;color:var(--m);margin-bottom:6px">▼ Capital (億円)</div>
      <div class="ig2">
        <div class="ig"><label>CET1</label><input type="number" id="bs-c1" value="400" min="0" oninput="dBasel()"></div>
        <div class="ig"><label>AT1</label><input type="number" id="bs-a1" value="100" min="0" oninput="dBasel()"></div>
      </div>
      <div class="ig"><label>Tier 2 億円</label><input type="number" id="bs-t2" value="150" min="0" oninput="dBasel()"></div>
      <div style="font-size:.68rem;color:var(--m);margin-bottom:6px;margin-top:4px">▼ RWA (億円)</div>
      <div class="ig2">
        <div class="ig"><label>Credit RWA</label><input type="number" id="bs-cr" value="5000" min="1" oninput="dBasel()"></div>
        <div class="ig"><label>Market + OpRisk</label><input type="number" id="bs-mo" value="1000" min="0" oninput="dBasel()"></div>
      </div>
      <div class="rbox"><div class="rl">Total Ratio / CET1</div><div class="rv" id="bs-rv">—</div><div class="rs" id="bs-rs">—</div></div>
      <div class="cw"><canvas id="cb"></canvas></div>`,

    raroc: `<h4>📐 RAROC Comparison</h4>
      <div class="ig2">
        <div>
          <div style="font-size:.72rem;font-weight:700;color:var(--acc);margin-bottom:7px">Dept A</div>
          <div class="ig"><label>Revenue 億円</label><input type="number" id="ra-ra" value="100" oninput="dRAROC()"></div>
          <div class="ig"><label>Risk cost 億円</label><input type="number" id="ra-xa" value="10" oninput="dRAROC()"></div>
          <div class="ig"><label>Econ. Capital</label><input type="number" id="ra-ea" value="50" oninput="dRAROC()"></div>
        </div>
        <div>
          <div style="font-size:.72rem;font-weight:700;color:var(--yel);margin-bottom:7px">Dept B</div>
          <div class="ig"><label>Revenue 億円</label><input type="number" id="ra-rb" value="100" oninput="dRAROC()"></div>
          <div class="ig"><label>Risk cost 億円</label><input type="number" id="ra-xb" value="50" oninput="dRAROC()"></div>
          <div class="ig"><label>Econ. Capital</label><input type="number" id="ra-eb" value="50" oninput="dRAROC()"></div>
        </div>
      </div>
      <div class="cw"><canvas id="cr"></canvas></div>
      <div id="ra-verd" style="text-align:center;font-size:.78rem;margin-top:7px;color:var(--m)"></div>`,

    kvcache: `<h4>📐 KV Cache Memory</h4>
      <div class="ig"><label>Layers (L)</label><input type="number" id="kv-l" value="32" min="1" oninput="dKV()"></div>
      <div class="ig"><label>Hidden size (H)</label><input type="number" id="kv-h" value="4096" min="64" step="64" oninput="dKV()"></div>
      <div class="ig"><label>Context length (C) tokens</label><input type="number" id="kv-c" value="128000" min="1024" step="1024" oninput="dKV()"></div>
      <div class="ig"><label>Dtype</label>
        <select id="kv-b" onchange="dKV()">
          <option value="2" selected>fp16 (2 bytes)</option>
          <option value="4">fp32 (4 bytes)</option>
        </select>
      </div>
      <div class="rbox"><div class="rl">KV Cache size</div><div class="rv" id="kv-rv">—</div><div class="rs" id="kv-rs">—</div></div>
      <div class="cw"><canvas id="ck"></canvas></div>
      <div class="cw-note">Formula: 2 × L × H × C × bytes / 1024³</div>`,

    sw30: `<h4>📊 Software Paradigm Evolution</h4>
      <div class="cw" style="height:210px"><canvas id="csw"></canvas></div>
      <div class="cw-note">Adaptability vs. Interpretability trade-off across paradigms</div>`,
  };
  return h[type] || `<p style="color:var(--m);font-size:.8rem">Calc type '${type}' not found.</p>`;
}

/* ══════════════════════════════════════════════════════════
   CHART MANAGER
══════════════════════════════════════════════════════════ */
const CH = {};
const isDark = () => root.getAttribute('data-theme') === 'dark';
const GRD = () => ({ color: isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' });
const TCK = () => ({ color: isDark() ? '#64748b' : '#9ca3af', font: { size: 10 } });

function CH_make(id, type, data, extra) {
  if (CH[id]) { CH[id].destroy(); }
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, ...(extra?.plugins || {}) },
    scales: {
      x: { ticks: TCK(), grid: GRD(), ...(extra?.x || {}) },
      y: { ticks: TCK(), grid: GRD(), ...(extra?.y || {}) }
    }
  };
  const el = document.getElementById(id);
  if (!el) return;
  CH[id] = new Chart(el.getContext('2d'), { type, data, options: opts });
}
function CH_destroyAll() { Object.keys(CH).forEach(k => { CH[k].destroy(); delete CH[k]; }); }

function initSlideCalc() {
  const c = activeTopic?.slides[activeSlide]?.calc;
  const fns = { var: dVaR, el: dEL, lcr: dLCR, basel: dBasel, raroc: dRAROC, kvcache: dKV, sw30: dSW30 };
  if (c && fns[c]) fns[c]();
}

/* ── VaR ── */
function dVaR() {
  const P = +document.getElementById('v-p')?.value || 1000;
  const V = (+document.getElementById('v-v')?.value || 1.5) / 100;
  const D = +document.getElementById('v-d')?.value || 10;
  const z = +document.getElementById('v-c')?.value || 2.326;
  const sig = V * Math.sqrt(D) * P, var_ = z * sig;
  const conf = document.getElementById('v-c')?.selectedOptions[0]?.text || '99%';
  const rv = document.getElementById('v-rv'); if (rv) rv.textContent = var_.toFixed(1) + ' 億円';
  const rs = document.getElementById('v-rs'); if (rs) rs.textContent = conf + ' · ' + D + 'd | σ_eff=' + sig.toFixed(1) + '億';
  const N = 120, xm = -4.5 * sig, xM = 4.5 * sig, st = (xM - xm) / N;
  const xs = [], ty = [], my = [];
  for (let i = 0; i <= N; i++) {
    const x = xm + i * st, y = Math.exp(-0.5 * (x / sig) ** 2) / (sig * Math.sqrt(2 * Math.PI));
    xs.push(x.toFixed(0)); ty.push(x <= -var_ ? y : null); my.push(x > -var_ ? y : null);
  }
  CH_make('cv', 'line', { labels: xs, datasets: [
    { data: ty, borderColor: 'rgba(239,68,68,.8)', backgroundColor: 'rgba(239,68,68,.15)', fill: true, pointRadius: 0, tension: .4 },
    { data: my, borderColor: 'rgba(88,101,242,.7)', backgroundColor: 'rgba(88,101,242,.08)', fill: true, pointRadius: 0, tension: .4 }
  ] }, { x: { ticks: { ...TCK(), maxTicksLimit: 7, callback(v) { return parseFloat(this.getLabelForValue(v)).toFixed(0) + '億'; } } }, y: { display: false } });
}

/* ── EL ── */
function dEL() {
  const pd = +document.getElementById('el-pd')?.value / 100 || .02;
  const ea = +document.getElementById('el-ea')?.value || 100;
  const lg = +document.getElementById('el-lg')?.value / 100 || .45;
  const pdv = document.getElementById('pd-v'); if (pdv) pdv.textContent = (pd * 100).toFixed(1) + '%';
  const lgv = document.getElementById('lgd-v'); if (lgv) lgv.textContent = (lg * 100).toFixed(0) + '%';
  const el = pd * ea * lg;
  const rv = document.getElementById('el-rv'); if (rv) rv.textContent = el.toFixed(3) + ' 億円';
  const rs = document.getElementById('el-rs'); if (rs) rs.textContent = `${(pd * 100).toFixed(2)}% × ${ea}億 × ${(lg * 100).toFixed(0)}%`;
  CH_make('ce', 'bar', {
    labels: ['EAD Breakdown'],
    datasets: [
      { label: 'EL', data: [el], backgroundColor: 'rgba(239,68,68,.75)', borderRadius: 4 },
      { label: 'Recovery', data: [Math.max(ea - el, 0)], backgroundColor: 'rgba(88,101,242,.4)', borderRadius: 4 }
    ]
  }, { plugins: { legend: { display: true, labels: { color: isDark() ? '#94a3b8' : '#6b7280', font: { size: 9 }, boxWidth: 9 } } },
     x: { ticks: { display: false } }, y: { ticks: { ...TCK(), callback: v => v + '億' }, stacked: true }, stacked: true });
  if (CH.ce) { CH.ce.options.scales.x.stacked = true; CH.ce.options.scales.y.stacked = true; CH.ce.update(); }
}

/* ── LCR ── */
function dLCR() {
  const l1 = +document.getElementById('lc-l1')?.value || 0;
  const l2 = +document.getElementById('lc-2a')?.value || 0;
  const ot = +document.getElementById('lc-ot')?.value || 1;
  const inf = +document.getElementById('lc-in')?.value || 0;
  const hqla = l1 + l2 * .85, net = Math.max(ot - inf, .001), lcr = hqla / net * 100;
  const rv = document.getElementById('lc-rv'); if (rv) rv.textContent = lcr.toFixed(1) + '%';
  const rs = document.getElementById('lc-rs');
  if (rs) { rs.textContent = lcr >= 100 ? '✓ ≥100% achieved' : '✗ Below 100% requirement'; rs.style.color = lcr >= 100 ? 'var(--grn)' : 'var(--red)'; }
  CH_make('cl', 'bar', {
    labels: ['Lv1 Assets', 'Lv2A×85%', 'HQLA Total', 'Net Outflow'],
    datasets: [{ data: [l1, l2 * .85, hqla, net],
      backgroundColor: ['rgba(16,185,129,.75)', 'rgba(16,185,129,.4)', 'rgba(88,101,242,.75)', 'rgba(239,68,68,.65)'],
      borderRadius: 4 }]
  }, { y: { ticks: { ...TCK(), callback: v => v + '億' } } });
}

/* ── Basel ── */
function dBasel() {
  const c1 = +document.getElementById('bs-c1')?.value || 0, a1 = +document.getElementById('bs-a1')?.value || 0;
  const t2 = +document.getElementById('bs-t2')?.value || 0, cr = +document.getElementById('bs-cr')?.value || 1;
  const mo = +document.getElementById('bs-mo')?.value || 0, rwa = cr + mo || 1;
  const rc = c1 / rwa * 100, rt = (c1 + a1) / rwa * 100, rT = (c1 + a1 + t2) / rwa * 100;
  const rv = document.getElementById('bs-rv'); if (rv) rv.textContent = rT.toFixed(2) + '% / CET1 ' + rc.toFixed(2) + '%';
  const ok = rT >= 8 && rc >= 4.5;
  const rs = document.getElementById('bs-rs');
  if (rs) { rs.textContent = ok ? '✓ Basel III minimums met' : '✗ Below minimum'; rs.style.color = ok ? 'var(--grn)' : 'var(--red)'; }
  CH_make('cb', 'bar', {
    labels: ['CET1 Ratio', 'Tier1 Ratio', 'Total Capital'],
    datasets: [
      { label: 'Actual', data: [rc, rt, rT], backgroundColor: ['rgba(88,101,242,.75)', 'rgba(167,139,250,.75)', 'rgba(16,185,129,.75)'], borderRadius: 4 },
      { label: 'Minimum', data: [4.5, 6.0, 8.0], backgroundColor: ['rgba(239,68,68,.4)', 'rgba(239,68,68,.4)', 'rgba(239,68,68,.4)'], borderRadius: 4 }
    ]
  }, { plugins: { legend: { display: true, labels: { color: isDark() ? '#94a3b8' : '#6b7280', font: { size: 9 }, boxWidth: 9 } } },
     y: { ticks: { ...TCK(), callback: v => v + '%' } } });
}

/* ── RAROC ── */
function dRAROC() {
  const ra = +document.getElementById('ra-ra')?.value || 0, xa = +document.getElementById('ra-xa')?.value || 0;
  const ea = Math.max(+document.getElementById('ra-ea')?.value, 1);
  const rb = +document.getElementById('ra-rb')?.value || 0, xb = +document.getElementById('ra-xb')?.value || 0;
  const eb = Math.max(+document.getElementById('ra-eb')?.value, 1);
  const rA = (ra - xa) / ea * 100, rB = (rb - xb) / eb * 100;
  CH_make('cr', 'bar', {
    labels: ['Revenue', 'Risk', 'Adj. Revenue', 'RAROC(%)'],
    datasets: [
      { label: 'Dept A', data: [ra, xa, ra - xa, rA], backgroundColor: 'rgba(88,101,242,.72)', borderRadius: 4 },
      { label: 'Dept B', data: [rb, xb, rb - xb, rB], backgroundColor: 'rgba(245,158,11,.72)', borderRadius: 4 }
    ]
  }, { plugins: { legend: { display: true, labels: { color: isDark() ? '#94a3b8' : '#6b7280', font: { size: 9 }, boxWidth: 9 } } } });
  const v = document.getElementById('ra-verd');
  if (v) {
    if (rA > rB) v.innerHTML = `<span style="color:var(--grn)">▲ Dept A higher RAROC (${rA.toFixed(0)}% > ${rB.toFixed(0)}%) → prioritize Dept A for EC</span>`;
    else if (rB > rA) v.innerHTML = `<span style="color:var(--yel)">▲ Dept B higher RAROC (${rB.toFixed(0)}% > ${rA.toFixed(0)}%) → prioritize Dept B for EC</span>`;
    else v.textContent = 'Departments have equal RAROC';
  }
}

/* ── KV Cache ── */
function dKV() {
  const L = +document.getElementById('kv-l')?.value || 32, H = +document.getElementById('kv-h')?.value || 4096;
  const C = +document.getElementById('kv-c')?.value || 128000, B = +document.getElementById('kv-b')?.value || 2;
  const gb = 2 * L * H * C * B / 1073741824;
  const rv = document.getElementById('kv-rv'); if (rv) rv.textContent = gb.toFixed(2) + ' GB';
  const rs = document.getElementById('kv-rs'); if (rs) rs.textContent = `2×${L}L×${H}H×${(C / 1000).toFixed(0)}kCtx×${B}B`;
  CH_make('ck', 'bar', {
    labels: ['KV Cache', 'A100 80GB', 'H100 80GB', 'RTX 4090 24GB'],
    datasets: [{ data: [gb, 80, 80, 24],
      backgroundColor: ['rgba(88,101,242,.75)', 'rgba(16,185,129,.5)', 'rgba(16,185,129,.5)', 'rgba(245,158,11,.5)'],
      borderRadius: 4 }]
  }, { y: { ticks: { ...TCK(), callback: v => v + 'GB' } } });
}

/* ── Software 3.0 ── */
function dSW30() {
  CH_make('csw', 'bar', {
    labels: ['Software 1.0\n(Explicit Code)', 'Software 2.0\n(Neural Nets)', 'Software 3.0\n(LLMs/Prompts)'],
    datasets: [
      { label: 'Adaptability', data: [2, 7, 9.5], backgroundColor: 'rgba(88,101,242,.72)', borderRadius: 4 },
      { label: 'Interpretability', data: [9.5, 5, 3], backgroundColor: 'rgba(239,68,68,.6)', borderRadius: 4 },
      { label: 'Dev Speed', data: [3, 6, 9], backgroundColor: 'rgba(16,185,129,.6)', borderRadius: 4 }
    ]
  }, {
    plugins: { legend: { display: true, labels: { color: isDark() ? '#94a3b8' : '#6b7280', font: { size: 9 }, boxWidth: 9 } } },
    y: { ticks: { ...TCK(), max: 10, callback: v => v }, max: 10 }
  });
}

/* ══════════════════════════════════════════════════════════
   QUIZ ENGINE
══════════════════════════════════════════════════════════ */
let qIndex = 0, qScore = 0, qAnswered = false;

function qSrcLinks(q) {
  const pages = (q && Array.isArray(q.src) && q.src.length) ? q.src : (activeTopic?.wikiPages || []);
  if (!pages.length) return '';
  const links = pages.map(p => {
    const url  = WIKI_BASE + p.replace(/ /g, '%20');
    const name = p.split('/').pop().replace('.md', '');
    return `<a class="esl" href="${url}" target="_blank" rel="noopener" title="${p}">${name}</a>`;
  }).join(' · ');
  return `<div class="exp-src">📂 Linked pages: ${links}</div>`;
}

function renderQ() {
  const qs = activeTopic?.questions || [];
  document.getElementById('qctr').textContent = `Q ${qIndex + 1} / ${qs.length}`;
  document.getElementById('pf').style.width = `${(qIndex / qs.length) * 100}%`;
  document.getElementById('qsc').textContent = `✓ ${qScore}`;
  const q = qs[qIndex];
  if (!q) return;
  const L = ['A', 'B', 'C', 'D'];
  document.getElementById('qcard').innerHTML = `
    <div class="qcat">${q.cat}</div>
    <div class="qtxt">Q${qIndex + 1}. ${q.q}</div>
    ${q.hint ? `<div class="qhnt">💡 ${q.hint}</div>` : ''}
    <div class="opts" id="opts">
      ${q.opts.map((o, i) => `<button class="opt" onclick="pickQ(${i})" id="o${i}"><span class="olbl">${L[i]}</span>${o}</button>`).join('')}
    </div>`;
  qAnswered = false;
  document.getElementById('qnav').style.display = 'none';
}

function pickQ(i) {
  if (qAnswered) return; qAnswered = true;
  const q = (activeTopic?.questions || [])[qIndex];
  document.querySelectorAll('.opt').forEach(b => b.disabled = true);
  if (i === q.ans) {
    qScore++;
    document.getElementById(`o${i}`).classList.add('correct');
    document.querySelector(`#o${i} .olbl`).textContent = '✓';
  } else {
    document.getElementById(`o${i}`).classList.add('wrong');
    document.querySelector(`#o${i} .olbl`).textContent = '✗';
    document.getElementById(`o${q.ans}`).classList.add('correct');
    document.querySelector(`#o${q.ans} .olbl`).textContent = '✓';
  }
  document.getElementById('qsc').textContent = `✓ ${qScore}`;
  const e = document.createElement('div'); e.className = 'exp';
  e.innerHTML = `📖 ${q.exp}${qSrcLinks(q)}`;
  document.getElementById('opts').after(e);
  document.getElementById('qnav').style.display = 'flex';
  document.getElementById('nxt').textContent = qIndex === (activeTopic?.questions || []).length - 1 ? 'See Results 🏆' : 'Next →';
}

function nextQ() {
  qIndex++;
  if (qIndex >= (activeTopic?.questions || []).length) showResults();
  else renderQ();
}

function showResults() {
  const qs = activeTopic?.questions || [], p = Math.round(qScore / qs.length * 100);
  let msg, sub, col;
  if (p >= 90) { msg = "Excellent 🏆"; sub = "Deep understanding demonstrated!"; col = 'var(--grn)'; }
  else if (p >= 70) { msg = "Good 👍"; sub = "Review the slides on weaker areas."; col = 'var(--acc)'; }
  else if (p >= 50) { msg = "Getting there 📚"; sub = "Go back through the slides and retry."; col = 'var(--yel)'; }
  else { msg = "Keep studying 📖"; sub = "Start from Slide 1 and work through."; col = 'var(--red)'; }
  document.getElementById('qcard').innerHTML = `
    <div class="results">
      <div class="sring" style="background:conic-gradient(${col} ${p * 3.6}deg,var(--div) 0)">
        <div class="sinn"><div class="sn">${qScore}</div><div class="sd">/ ${qs.length}</div></div>
      </div>
      <div class="smsg">${msg} — ${p}%</div>
      <div class="ssub">${sub}</div>
      <div class="btn-row">
        <button class="btn btn-sec" onclick="qIndex=0;qScore=0;qAnswered=false;renderQ()">Retry</button>
        <button class="btn btn-acc neu-btn" onclick="setMode('slides')">Back to Slides</button>
      </div>
    </div>`;
  document.getElementById('qnav').style.display = 'none';
  document.getElementById('pf').style.width = '100%';
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
_renderQuizUser();
_syncLoad();
buildHome();

document.getElementById('nr-drop').addEventListener('click', e => {
  const it = e.target.closest('.nr-item'); if (it?.dataset.path) nrAdd(it.dataset.path);
});
document.getElementById('nr-chips').addEventListener('click', e => {
  const b = e.target.closest('button[data-rm]'); if (b) nrRm(b.getAttribute('data-rm'));
});
document.getElementById('nr-src').addEventListener('input', nrSearch);
document.getElementById('nr-src').addEventListener('focus', nrSearch);
document.getElementById('nr-src').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    let v = e.target.value.trim();
    if (v) { if (!/^wiki\//.test(v)) v = 'wiki/' + v; nrAdd(v); }
  }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.nr-srcpick')) document.getElementById('nr-drop').classList.remove('show');
});
