/* ═══════════════════════════════════════════════════════════
   app.js — hachi Dashboard (static GitHub Pages edition)
   Auth: GitHub OAuth → JWT stored in localStorage.
   API_BASE read from ?api=... URL param; no key in URLs.
   Local dev (no ?api=): direct /api/... calls, no auth guard.
   ═══════════════════════════════════════════════════════════ */

/* ── Config from URL ─────────────────────────────────────── */
const _params = new URLSearchParams(window.location.search);
// Persist api= param so the URL is bookmarkable without query strings.
// Default to the production Cloud Run URL so no manual setup is needed.
const _DEFAULT_API = 'https://hachi-core-685554938840.asia-northeast1.run.app';
const API_BASE = (_params.get('api') || localStorage.getItem('nogem-api') || _DEFAULT_API).replace(/\/$/, '');
if (_params.get('api')) localStorage.setItem('nogem-api', _params.get('api')); // persist override

// If /auth/callback redirected here with ?token=, store it and clean the URL.
(function _handleAuthReturn() {
  const token = _params.get('token');
  if (!token) return;
  localStorage.setItem('dash-jwt', token);
  const clean = new URL(window.location.href);
  clean.searchParams.delete('token');
  window.history.replaceState({}, '', clean.toString());
})();

function _jwt()         { return localStorage.getItem('dash-jwt') || ''; }
function _authHeaders() { const j = _jwt(); return j ? { Authorization: `Bearer ${j}` } : {}; }
function apiUrl(path)   { return `${API_BASE}${path}`; }

function _jwtPayload() {
  const jwt = _jwt();
  if (!jwt) return null;
  try {
    const part = jwt.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function _renderUserPill() {
  const p = _jwtPayload();
  const nameEl    = document.getElementById('user-name');
  const avatarEl  = document.getElementById('user-avatar');
  const detailN   = document.getElementById('user-detail-name');
  const detailL   = document.getElementById('user-detail-login');
  if (!nameEl) return;
  if (!p) { nameEl.textContent = '—'; return; }
  if (avatarEl && p.avatar) {
    avatarEl.src = `${p.avatar}&s=60`;
    avatarEl.style.display = '';
    nameEl.style.display = 'none';
    const pillBtn = document.getElementById('user-pill');
    if (pillBtn) { pillBtn.style.padding = '3px'; pillBtn.style.borderRadius = '50%'; pillBtn.style.width = '36px'; pillBtn.style.height = '36px'; }
  } else {
    nameEl.textContent = p.name || p.sub || '—';
  }
  if (detailN) detailN.textContent = p.name || p.sub || '—';
  if (detailL) detailL.textContent = `@${p.sub || ''}`;
}

function logoutUser() {
  localStorage.removeItem('dash-jwt');
  if (API_BASE) window.location.href = `${API_BASE}/auth/login?return=${encodeURIComponent(window.location.href)}`;
  else window.location.reload();
}

function _handleForbidden(msg) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:14px;background:var(--bg);font-family:inherit;text-align:center;padding:24px">
      <div style="font-size:2.5rem">🚫</div>
      <div style="font-weight:800;color:var(--txt);font-size:1.1rem">アクセス拒否</div>
      <div style="color:var(--m);font-size:13px;max-width:340px">${esc(msg || 'このダッシュボードへのアクセス権がありません。')}</div>
      <div style="color:var(--m2);font-size:11px">ダッシュボードのオーナーに GitHub ユーザー名を許可リストへ追加するよう依頼してください。</div>
      <button onclick="logoutUser()" style="margin-top:8px;padding:10px 22px;border-radius:10px;border:none;background:var(--surf);box-shadow:var(--sh-sm);color:var(--acc);font-weight:700;cursor:pointer;font-family:inherit">別のアカウントでサインイン</button>
    </div>`;
}

let _currentUser = _jwtPayload();

// Verify JWT with backend on load; redirect to OAuth if missing or invalid.
async function _ensureAuth() {
  if (!API_BASE) return true; // local dev — no auth required
  if (!_jwt()) {
    window.location.href = `${API_BASE}/auth/login?return=${encodeURIComponent(window.location.href)}`;
    return false;
  }
  try {
    const res = await fetch(apiUrl('/auth/verify'), { headers: _authHeaders() });
    if (res.status === 403) { _handleForbidden(); return false; }
    if (!res.ok) { _handleUnauthorized(); return false; }
    const { user } = await res.json();
    _currentUser = user;
  } catch {
    // network error — proceed, API calls will 401 if truly invalid
  }
  return true;
}

// On 401 from any API call: clear JWT and redirect to re-auth.
function _handleUnauthorized() {
  localStorage.removeItem('dash-jwt');
  if (API_BASE) {
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg);font-family:inherit;color:var(--m);font-size:13px">セッションが期限切れです — ログインページへ移動します…</div>`;
    setTimeout(() => { window.location.href = `${API_BASE}/auth/login?return=${encodeURIComponent(window.location.href)}`; }, 1200);
  }
}

/* ── Global state (populated after fetch) ─────────────────── */
let AVATARS = {}, DQ_AVATARS = {}, DQ_TYPE_MAP = {}, DQ_COLORS = {};
let REGISTRY = [], DETAIL_DATA = {}, TASK_STATS = { recent:[], upcoming:[], byDay:{}, byType:{} };
let ALL_BY_STATUS = {}, SOURCES = [], COSTS = {}, PRIVILEGE_MATRIX = {}, LEVEL_OVERRIDES = {};
let FORCE_FLASH = false, INTENSITY_MODE = 'balanced', ACTIVE_PROVIDER = 'gemini', PROJECT_LANG = 'JP';
let PANEL_PREFS = {}, COST_BY_DAY = {}, LAST_7_KEYS = [], COST_BY_AGENT_7D = {};
let LOCATION_PROFILE = null;
const SCALE = 6, DS = 8;
const AGENT_SOURCE_DOMAINS = { 'news-agent':'news', 'scout-agent':'scout' };

const TASK_TO_AGENT_ID = {
  deep_context:'context-agent', wiki_lint:'lint-agent', develop:'dev-agent',
  review:'review-agent', db_audit:'db-audit-agent', content:'drafting-agent',
  content_review:'editorial-agent', plan:'orchestrator', scout:'scout-agent',
};
const TASK_MODEL_MAP = {
  deep_context:'flash', wiki_lint:'flash', review:'flash', db_audit:'flash',
  develop:'pro', content:'pro', content_review:'pro', plan:'pro', scout:'pro',
};
const LV_COLORS = ['','#64748B','#38BDF8','#A78BFA','#F97316','#EF4444'];
const LV_NAMES = ['','Utility','Responder','Producer','Orchestrator','Builder'];
const FLOWS = [
  {name:'Daily Intelligence', color:'#60A5FA', agents:['news-agent','context-agent','lint-agent','scout-agent']},
  {name:'Development',        color:'#F97316', agents:['orchestrator','dev-agent','review-agent']},
  {name:'Content Pipeline',   color:'#A78BFA', agents:['orchestrator','structure-agent','drafting-agent','editorial-agent']},
  {name:'On-demand',          color:'#34D399', agents:['chat-agent','slide-agent','summary-agent']},
];

/* ═══════════════════════════════════════════════════════════
   BOOTSTRAP — load data then render
══════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  if (!await _ensureAuth()) return;
  _renderUserPill();

  const loaderId = '_dash-load-overlay';
  const isInitial = !document.getElementById(loaderId);

  if (isInitial) {
    // First load — show skeleton placeholders so the page feels populated immediately
    _renderLoadingSkeletons();
  } else {
    // Re-fetch — show a subtle full-page overlay that fades out on completion
    const loader = document.getElementById(loaderId);
    loader.style.opacity = '.85';
    loader.style.display = 'flex';
  }

  try {
    const res = await fetch(apiUrl('/api/dashboard-data'), { headers: _authHeaders() });
    if (res.status === 401) { _handleUnauthorized(); return; }
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      _handleForbidden(body.error || 'Your account is not authorized for this dashboard.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    _applyData(data);
    _renderAll(data);

    // Create the re-fetch overlay now (hidden); it won't appear until next loadDashboard()
    if (isInitial && !document.getElementById(loaderId)) {
      const loader = document.createElement('div');
      loader.id = loaderId;
      loader.className = 'dash-loading';
      loader.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--bg);display:none';
      loader.innerHTML = '<div class="dash-loading-spinner"></div><div class="dash-loading-text">読み込み中…</div>';
      document.body.appendChild(loader);
    }
  } catch (err) {
    const errEl = document.querySelector('.page.active') || document.querySelector('.page');
    if (errEl) errEl.innerHTML = `
      <div class="dash-error">
        <div class="dash-error-title">ダッシュボードの読み込みに失敗しました</div>
        <div class="dash-error-msg">${esc(err.message)}</div>
        <div class="dash-error-hint">
          バックエンド <code>${API_BASE}</code> に接続できることを確認してください。<br>
          別のバックエンドを使用する場合は <code>?api=https://your-cloud-run-url</code> をURLに追加してください。
        </div>
        <button class="save-btn" style="margin-top:14px" onclick="loadDashboard()">再試行</button>
      </div>`;
  } finally {
    // Fade out the re-fetch overlay smoothly
    const loader = document.getElementById(loaderId);
    if (loader && loader.style.display !== 'none') {
      loader.style.opacity = '0';
      setTimeout(() => { loader.style.display = 'none'; loader.style.opacity = '.85'; }, 320);
    }
  }
}

function _renderLoadingSkeletons() {
  const grid = document.getElementById('agent-grid');
  if (grid) {
    grid.classList.remove('loaded');
    grid.innerHTML = Array.from({length: 8}, () =>
      `<div class="acard skel"><div class="skel-av"></div>` +
      `<div class="skel-line" style="height:11px;width:65%;margin:10px auto 6px"></div>` +
      `<div class="skel-line" style="height:9px;width:45%;margin:0 auto 4px"></div></div>`
    ).join('');
  }
  const kpi = document.getElementById('kpi-row');
  if (kpi) {
    kpi.innerHTML = Array.from({length: 4}, () =>
      `<div class="kpi-card skel">` +
      `<div class="skel-line" style="height:11px;width:55%;margin-bottom:8px"></div>` +
      `<div class="skel-line" style="height:22px;width:40%"></div></div>`
    ).join('');
  }
}

function _applyData(d) {
  AVATARS          = d.avatars         || {};
  DQ_AVATARS       = d.dqAvatars       || {};
  DQ_TYPE_MAP      = d.dqTypeMap       || {};
  DQ_COLORS        = d.dqColors        || {};
  REGISTRY         = d.registry        || [];
  DETAIL_DATA      = d.detailData      || {};
  TASK_STATS       = d.taskStats       || { recent:[], upcoming:[], byDay:{}, byType:{} };
  ALL_BY_STATUS    = d.allByStatus     || {};
  SOURCES          = d.sources         || [];
  COSTS            = d.costs           || {};
  PRIVILEGE_MATRIX = d.privilegeMatrix || {};
  LEVEL_OVERRIDES  = d.levelOverrides  || {};
  FORCE_FLASH      = !!d.forceFlash;
  INTENSITY_MODE   = d.intensityMode   || 'balanced';
  ACTIVE_PROVIDER  = d.activeProvider  || 'gemini';
  PROJECT_LANG     = d.language        || 'JP';
  _syncLangUI();
  PANEL_PREFS      = d.panelPrefs      || {};
  COST_BY_DAY      = d.costByDay       || {};
  LAST_7_KEYS      = d.last7Keys       || [];
  COST_BY_AGENT_7D = d.costByAgent7d   || {};
  LOCATION_PROFILE = d.locationProfile || null;
  // Side-load data referenced by render helpers
  window._inboxData      = d.inbox         || { pending:[], done:[], ignored:[] };
  window._factChecks     = d.factChecks    || [];
  window._knowledgeData  = d.knowledgeData || {};
  window._routingRows    = d.routing?.rows || [];
}

function _renderAll(d) {
  window._allChannels = d.channels || [];
  _renderAgentStatsBox();
  _renderAgentGrid();
  document.getElementById('agent-grid')?.classList.add('loaded');
  _renderKpiRow();
  _renderChannelCards(d.channels || []);
  if (d.routing) _renderRoutingTable(d.routing.rows || [], d.channels || []);
  _renderCostStrip();
  _renderTaskFeed();
  _renderKnowledge();
  _renderInbox();
  _renderAnalytics();
  _renderSettings(d.channels || []);
  _syncProviderUI();
  _renderLocationPill();
  _renderFlashList();
  _renderBadges();
  _renderDocsTree(d.docs || []);
  _initCharts();
  _startAvatarAnimations();
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════ */
let _activePage = 'tasks';

/* ═══════════════════════════════════════════════════════════
   KEYBOARD ACTIVATION
   Several surfaces are clickable divs (cards, KPI tiles, queue rows). A div is
   not focusable or activatable by keyboard, so any element marked
   role="button" is activated here on Enter/Space — one handler rather than an
   onkeydown attribute repeated on every template.
══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest?.('[role="button"]');
  if (!el || el.tagName === 'BUTTON' || el.tagName === 'A') return;
  e.preventDefault();
  el.click();
});

/* ═══════════════════════════════════════════════════════════
   NAVIGATION — five destinations, named by intent
══════════════════════════════════════════════════════════════
   The dashboard had ten pages behind four pills and a ⋯ drawer, which meant the article
   pipeline — the thing this system exists to run — sat seven tabs deep inside ソース. Pages are
   now grouped by what you came to do. A destination holding one page shows no sub-navigation;
   the strip only appears where there is a real choice to make. Desktop and mobile read from this
   same table, so the two can no longer drift apart (概要 / エージェント was the same page under
   two names). */
const DESTINATIONS = {
  today:     { label: '今日', pages: [ ['tasks','タスク'], ['inbox','受信箱'] ] },
  articles:  { label: '記事', pages: [ ['articles','カテゴリ'] ] },
  knowledge: { label: '知識', pages: [ ['knowledge','ソース'], ['wiki','Wiki'] ] },
  ops:       { label: '運用', pages: [ ['overview','エージェント'], ['channels','チャンネル'], ['repos','リポジトリ'], ['analytics','分析'] ] },
  system:    { label: '設定', pages: [ ['settings','設定'], ['docs','ドキュメント'] ] },
};

// Which page each destination was last left on, so returning to 運用 does not always dump you
// back on the agent grid after you were reading 分析.
const _lastPage = {};
let _activeDest = 'today';

const _destOf = (pageId) =>
  Object.keys(DESTINATIONS).find(d => DESTINATIONS[d].pages.some(([id]) => id === pageId));

/** Accepts either a destination key or a page id — deep links and old call sites both work. */
function navTo(target) {
  let dest, pageId;
  if (DESTINATIONS[target]) {
    dest = target;
    pageId = _lastPage[dest] ?? DESTINATIONS[dest].pages[0][0];
  } else {
    dest = _destOf(target);
    if (!dest) return;
    pageId = target;
  }
  _activeDest = dest;
  _lastPage[dest] = pageId;
  _activePage = pageId;
  _syncHash(pageId);

  const swap = () => {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + pageId));
    document.querySelectorAll('.nav-pill[data-dest]').forEach(p => p.classList.toggle('active', p.dataset.dest === dest));
    document.querySelectorAll('.mob-tab[data-dest]').forEach(b => b.classList.toggle('active', b.dataset.dest === dest));
    _renderDestSub(dest, pageId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    document.startViewTransition(swap);
  } else {
    swap();
  }
  _initPage(pageId);
}

// A single-page destination gets no strip at all — a tab bar with one tab is furniture.
function _renderDestSub(dest, pageId) {
  const bar = document.getElementById('dest-sub');
  if (!bar) return;
  const pages = DESTINATIONS[dest]?.pages ?? [];
  if (pages.length < 2) { bar.innerHTML = ''; bar.classList.remove('show'); return; }
  bar.classList.add('show');
  bar.innerHTML = pages.map(([id, label]) =>
    `<button class="dest-sub-btn${id === pageId ? ' active' : ''}" role="tab" aria-selected="${id === pageId}" onclick="navTo('${id}')">${label}</button>`
  ).join('');
}

// Per-page lazy initialisation, unchanged in behaviour — just moved out of navTo so the
// destination logic above stays readable.
function _initPage(pageId) {
  if (pageId === 'analytics') { _initCharts(); _loadAnalytics(); }
  if (pageId === 'docs') _initDocsIfNeeded();
  if (pageId === 'wiki') _initWikiIfNeeded();
  if (pageId === 'articles') _loadTopics();
  if (pageId === 'settings') { _loadContextSettings(); _loadAccessUsers(); _renderSettingsLocation(); }
  if (pageId === 'channels') { _initChannelsPage(); _loadContextSettings(); _renderChannelCtxList(); }
  if (pageId === 'repos') _initReposPage();
}

document.querySelectorAll('.nav-pill[data-dest]').forEach(p => p.addEventListener('click', () => navTo(p.dataset.dest)));

/* The location hash names the current page, so a view can be linked to and survives a reload —
   previously every refresh dropped you back on the first page whatever you were reading. */
function _syncHash(pageId) {
  const h = '#' + pageId;
  if (location.hash !== h) history.replaceState(null, '', h);
}
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== _activePage) navTo(id);
});
const _openAt = location.hash.slice(1);


function toggleDrop(id) {
  const drop = document.getElementById(id);
  if (!drop) return;
  const open = drop.classList.toggle('open');
  if (open) {
    const close = (e) => { if (!drop.contains(e.target)) { drop.classList.remove('open'); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 10);
  }
}

/* ═══════════════════════════════════════════════════════════
   TOAST + CONFIRM HELPERS  (replace blocking alert/confirm)
══════════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// Replaces confirm() — inserts an inline banner next to a target element.
// onConfirm fires when user clicks Confirm; banner auto-removes on dismiss.
// Returns a cleanup fn in case you need to remove it early.
function showConfirm(msg, onConfirm, targetEl) {
  const existing = targetEl?.parentElement?.querySelector('.confirm-banner');
  if (existing) { existing.remove(); return () => {}; }
  const banner = document.createElement('div');
  banner.className = 'confirm-banner';
  banner.innerHTML = `<span style="flex:1">${esc(msg)}</span>
    <button class="act-btn cancel" data-dismiss>Cancel</button>
    <button class="act-btn resume" data-confirm>Confirm</button>`;
  banner.querySelector('[data-confirm]').addEventListener('click', () => { banner.remove(); onConfirm(); });
  banner.querySelector('[data-dismiss]').addEventListener('click', () => banner.remove());
  if (targetEl) targetEl.insertAdjacentElement('afterend', banner);
  else document.body.appendChild(banner);
  return () => banner.remove();
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function relTime(iso) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', { timeZone:'Asia/Tokyo', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function cmap(colors) { const [b,a,h,d] = colors; return {0:null,1:b,2:a,3:h,4:d}; }

function drawGrid(ctx, grid, cm, blink, scale) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!grid) return;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let v = grid[y]?.[x]; const c = (blink && v === 3) ? cm[1] : cm[v];
    if (c) { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, scale, scale); }
  }
}

function nextRun(freq) {
  if (!freq) return '';
  const now = new Date(), tj = new Date(now.toLocaleString('en-US', { timeZone:'Asia/Tokyo' }));
  if (freq.includes('On-demand') || freq.includes('Inline')) return 'When triggered';
  if (freq.includes('10 min')) { const m = 10 - tj.getMinutes() % 10; return `In ~${m}m`; }
  if (freq.includes('07:0')) {
    const min = freq.includes('07:01') ? 1 : 0, next = new Date(tj);
    next.setHours(7, min, 0, 0); if (next <= tj) next.setDate(next.getDate() + 1);
    const dh = Math.round((next - tj) / 3600000);
    return dh < 1 ? '< 1h' : dh < 24 ? `In ~${dh}h` : 'Tomorrow 07:00 JST';
  }
  if (freq.includes('Wed & Sun')) {
    const day = tj.getDay(), du = [3,0].map(t => (t-day+7)%7).sort((a,b)=>a-b)[0] || 7;
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return du === 0 ? 'Today 07:00 JST' : `In ${du}d (${names[(day+du)%7]})`;
  }
  return freq;
}

function agentChip(taskType) {
  const agentId = TASK_TO_AGENT_ID[taskType]; if (!agentId) return '';
  const reg = REGISTRY.find(r => r.id === agentId); if (!reg) return '';
  return `<span class="agent-chip" style="border-color:${reg.colors[0]}66;color:${reg.colors[0]}">⬡ ${esc(reg.name)}</span>`;
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW — AGENT STATS BOX
══════════════════════════════════════════════════════════════ */
function _renderAgentStatsBox() {
  const running = Object.values(DETAIL_DATA).filter(d => d.status === 'running').length;
  const failed  = Object.values(DETAIL_DATA).filter(d => d.status === 'failed').length;
  const enabled = Object.values(DETAIL_DATA).filter(d => d.enabled !== false).length;
  const pending = (TASK_STATS.upcoming || []).length;
  const t = _I18N[PROJECT_LANG] || _I18N.JP;
  document.getElementById('agent-stats-box').innerHTML = `
    <div class="asb-stat"><div class="asb-val">${REGISTRY.length}</div><div class="asb-label">${t['stat-agents']}</div></div>
    <div class="asb-sep"></div>
    <div class="asb-stat"><div class="asb-val run">${running}</div><div class="asb-label">${t['stat-running']}</div></div>
    <div class="asb-sep"></div>
    <div class="asb-stat"><div class="asb-val fail">${failed}</div><div class="asb-label">${t['stat-failed']}</div></div>
    <div class="asb-sep"></div>
    <div class="asb-stat"><div class="asb-val">${enabled}</div><div class="asb-label">${t['stat-enabled']}</div></div>
    <div class="asb-sep"></div>
    <div class="asb-stat"><div class="asb-val">${pending}</div><div class="asb-label">${t['stat-pending']}</div></div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW — AGENT GRID
══════════════════════════════════════════════════════════════ */
let _avTheme = localStorage.getItem('avTheme') || 'classic';
let _catFilter = 'all', _lvFilter = null, _trigFilter = null;

function _renderAgentGrid() {
  const grid = document.getElementById('agent-grid');
  if (!grid) return;
  const t = _I18N[PROJECT_LANG] || _I18N.JP;
  const isJP = PROJECT_LANG === 'JP';
  grid.innerHTML = REGISTRY.map(reg => {
    const d = DETAIL_DATA[reg.id] || {};
    const status = d.status || 'idle';
    const enabled = d.enabled !== false;
    const pct = Math.min(100, Math.round(((d.tokensUsed || 0) / (d.tokenLimit || 1)) * 100));
    const barColor = pct > 80 ? '#EF4444' : pct > 50 ? '#FBBF24' : reg.colors[0];
    const costEst = (COST_BY_AGENT_7D[reg.id] || 0);
    const trig = (d.trigger || 'interactive');
    const spark = LAST_7_KEYS.map(k => (TASK_STATS.byDay?.[k]?.agentCounts?.[reg.id] || 0)).join(',');
    const displayName = reg.name; // agent names stay English — natural in JP tech context
    const displayDesc = isJP && reg.descJp ? reg.descJp : (reg.desc || '');
    const statusLabel = t[status] || status;
    const catLabel    = t['cat-' + (reg.category || '').toLowerCase()] || reg.category || '';
    return `<div class="acard ${status} ${enabled ? '' : 'disabled'}" role="button" tabindex="0"
      aria-label="${esc(reg.name)} の詳細を開く"
      data-agent="${reg.id}" data-avatar="${reg.avatar || ''}"
      data-colors="${(reg.colors || []).join('|')}"
      data-category="${reg.category || ''}" data-level="${reg.level || 1}"
      data-trigger="${trig}" data-name="${esc(reg.name)}"
      data-tools="${esc((reg.tools || []).join(','))}"
      data-spark="${spark}" data-tokens="${d.tokensUsed || 0}"
      data-anim="${status}" onclick="openDetail('${reg.id}')">
      <div style="display:flex;justify-content:center;margin-bottom:4px">
        <canvas class="avatar" width="${SCALE*8}" height="${SCALE*8}" style="image-rendering:pixelated"></canvas>
      </div>
      <div class="acard-info">
        <div class="acard-name">${esc(displayName)}</div>
        <div class="acard-foot" style="margin-top:6px">
          <div style="flex:1">
            <div class="tok-bar-wrap"><div class="tok-bar" style="width:${pct}%;background:${barColor}"></div></div>

          </div>

        </div>
      </div>
      <button class="agent-toggle ${enabled ? 'on' : ''}" onclick="toggleAgent('${reg.id}',event)" title="${enabled ? t['lbl-disable']:t['lbl-enable']}">
        ${enabled ? '●' : '○'}
      </button>
    </div>`;
  }).join('');

  // Sync av-theme buttons
  document.querySelectorAll('.av-theme-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(_avTheme)));

  _startAvatarAnimations();
  _applyAgentFilters();
}

function _startAvatarAnimations() {
  document.querySelectorAll('.acard[data-agent]').forEach(card => {
    const cv = card.querySelector('canvas.avatar'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const reg = REGISTRY.find(r => r.id === card.dataset.agent); if (!reg) return;
    const anim = card.dataset.anim; let t0 = 0;
    (function frame(ts) {
      if (!t0) t0 = ts; const e = ts - t0;
      const blink = e % 4200 > 4000;
      let dy = 0, dx = 0;
      if (anim === 'running') dy = Math.round(Math.sin(e/280)*3);
      else if (anim !== 'failed') dy = Math.round(Math.sin(e/1300)*2);
      if (anim === 'failed') dx = Math.round(Math.sin(e/75)*2);
      cv.style.transform = `translate(${dx}px,${dy}px)`;
      if (_avTheme === 'dq') {
        const dqType = DQ_TYPE_MAP[reg.id] || 'scholar';
        const grid = DQ_AVATARS[dqType];
        const cols = DQ_COLORS[dqType] || reg.colors;
        drawGrid(ctx, grid, {0:null,1:cols[0],2:cols[1],3:cols[2],4:cols[3]}, blink, SCALE);
      } else if (_avTheme === 'initials') {
        ctx.clearRect(0,0,cv.width,cv.height);
        ctx.fillStyle = reg.colors[0] || '#888'; ctx.fillRect(0,0,cv.width,cv.height);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${cv.width*.42}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const initStr = PROJECT_LANG === 'JP' && reg.nameJp ? reg.nameJp.slice(0,1) : (reg.name||'?').slice(0,2).toUpperCase();
        ctx.fillText(initStr, cv.width/2, cv.height/2);
      } else {
        drawGrid(ctx, AVATARS[card.dataset.avatar], cmap(card.dataset.colors.split('|')), blink, SCALE);
      }
      if (anim === 'running') { const l = Math.floor((e/55)%48); ctx.fillStyle='rgba(0,0,0,.06)'; ctx.fillRect(0,l,48,2); }
      requestAnimationFrame(frame);
    })();
  });
}

function setAvTheme(t, el) {
  _avTheme = t; localStorage.setItem('avTheme', t);
  document.querySelectorAll('.av-theme-btn').forEach(b => b.classList.toggle('active', b === el));
}

function setCatFilter(el, cat) {
  _catFilter = cat;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', b === el));
  _applyAgentFilters();
}

// Search was removed: with 30 agents on one screen, scanning beats typing, and the input was one
// more control competing with the grid it filtered.
function _applyAgentFilters() {
  document.querySelectorAll('.acard[data-agent]').forEach(c => {
    const ok = (_catFilter === 'all' || c.dataset.category === _catFilter)
      && (!_lvFilter || +c.dataset.level === _lvFilter)
      && (!_trigFilter || c.dataset.trigger === _trigFilter);
    c.classList.toggle('hidden', !ok);
  });
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW — KPI + COST STRIP
══════════════════════════════════════════════════════════════ */
function _renderKpiRow() {
  const bs = ALL_BY_STATUS || {};
  const t = _I18N[PROJECT_LANG] || _I18N.JP;
  const statuses = [
    { s:'pending',   key:'kpi-pending',   color:'#64748B' },
    { s:'running',   key:'kpi-running',   color:'#38BDF8' },
    { s:'completed', key:'kpi-completed', color:'#34D399' },
    { s:'failed',    key:'kpi-failed',    color:'#EF4444' },
  ];
  document.getElementById('kpi-row').innerHTML = statuses.map(({s,key,color}) => {
    const n = (bs[s] || []).length;
    return `<div class="kpi" role="button" tabindex="0" aria-label="${esc(s)} のタスクを開く" onclick="openTaskModal('${s}')" style="border-top:2px solid ${color}">
      <div class="kpi-label">${t[key]}</div>
      <div class="kpi-value" style="color:${color}">${n}</div>
      <div class="kpi-hint">${t['click-view']}</div>
    </div>`;
  }).join('');
}

function _renderCostStrip() {
  const today = new Date().toISOString().split('T')[0];
  const dayCost = COST_BY_DAY[today] || 0;
  const el = document.getElementById('day-cost-label');
  if (el) el.textContent = dayCost > 0 ? `Today: $${dayCost.toFixed(4)}` : '';

  const sel = document.getElementById('intensity-select');
  const selS = document.getElementById('intensity-select-s');
  if (sel) sel.value = INTENSITY_MODE;
  if (selS) selS.value = INTENSITY_MODE;

  const fb = document.getElementById('flash-global-btn');
  const fbS = document.getElementById('flash-global-btn-s');
  [fb, fbS].forEach(b => { if (b) { b.textContent = `⚡ Flash: ${FORCE_FLASH ? 'on' : 'off'}`; b.className = 'flash-toggle ' + (FORCE_FLASH ? 'active' : 'inactive'); } });

  const cb = document.getElementById('cost-badge');
  if (cb) { cb.textContent = dayCost > 0 ? `$${dayCost.toFixed(3)}` : ''; cb.className = 'cost-badge' + (dayCost > 0.1 ? ' high' : ''); }
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW — CHANNEL CARDS
══════════════════════════════════════════════════════════════ */
function _renderChannelCards(channels) {
  const el = document.getElementById('channel-cards');
  if (!el) return;
  if (!channels || !channels.length) { el.innerHTML = '<div style="font-size:11px;color:var(--m)">No channel data.</div>'; return; }
  el.innerHTML = channels.map(ch => `
    <div class="ch-card">
      <div class="ch-card-key">${esc(ch.key || ch.channelId || '—')}</div>
      <div class="ch-card-id">${esc(ch.channelId || '')}</div>
      ${ch.threadId ? `<div class="ch-card-thread">${esc(ch.threadId)}</div>` : ''}
      <div class="ch-card-agents">
        ${(ch.agents || []).map(a => `<span class="ch-agent-pill">${esc(a)}</span>`).join('')}
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   TASKS PAGE
══════════════════════════════════════════════════════════════ */
let _taskStatusFilter = 'all';

function setTaskFilter(el, status) {
  _taskStatusFilter = status;
  document.querySelectorAll('.qcat[data-status]').forEach(b => b.classList.toggle('active', b === el));
  _renderTaskFeed();
}

function _renderTaskFeed() {
  const el = document.getElementById('task-feed'); if (!el) return;
  let tasks;
  if (_taskStatusFilter === 'all') {
    tasks = [...(TASK_STATS.upcoming || []), ...(TASK_STATS.recent || [])];
  } else {
    tasks = ALL_BY_STATUS[_taskStatusFilter] || [];
  }
  if (!tasks.length) { const t=_I18N[PROJECT_LANG]||_I18N.JP; el.innerHTML = `<div style="color:var(--m);font-size:11px;padding:12px 0">${t['empty-tasks']}</div>`; return; }
  el.innerHTML = tasks.slice(0, 60).map(t => {
    const isUpcoming = t.status === 'pending' || t.status === 'running';
    const btn = isUpcoming
      ? (t.id && t.status === 'pending' ? `<button class="act-btn cancel" aria-label="中止" title="中止" onclick="doTaskAction('${t.id}','cancel',this)"><i class="ni ni-close" aria-hidden="true"></i></button>`
        : t.id && t.status === 'running' ? `<button class="act-btn stop" onclick="doTaskAction('${t.id}','stop',this)">⏹</button>` : '')
      : (t.id && (t.status === 'failed' || t.status === 'cancelled') ? `<button class="act-btn resume" onclick="doTaskAction('${t.id}','resume',this)">↻</button>` : '');
    const timeStr = isUpcoming ? `Queued ${relTime(t.createdAt)} · P${t.priority ?? 3}` : `${fmtDate(t.updatedAt)} · ${relTime(t.updatedAt)}`;
    const clickable = t.id ? `style="cursor:pointer" onclick="openTaskDetail('${t.id}')"` : '';
    return `<div class="feed-item" ${clickable ? `role="button" tabindex="0" aria-label="タスクの詳細を開く" ${clickable}` : ''}>
      <div class="feed-dot ${t.status}"></div>
      <div class="feed-text">${esc(t.goal)}
        <div class="feed-type"><span class="tl-type">${esc((t.type||'').replace(/_/g,' '))}</span>${agentChip(t.type)} ${timeStr}</div>
      </div>${btn}
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   KNOWLEDGE PAGE
══════════════════════════════════════════════════════════════ */
let _kTab = 'sources';

function setKTab(el, tab) {
  _kTab = tab;
  document.querySelectorAll('.tab-btn[data-ktab]').forEach(b => b.classList.toggle('active', b === el));
  document.querySelectorAll('#page-knowledge .tab-content > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('k-' + tab)?.classList.remove('hidden');
}

// ─── Topic categories + articles (Note article pipeline) ─────────────────────
// A topic category is a recurring content stream: an editable editorial prompt, an audience, a
// cadence, and a star rating rolled up from the articles it produced. Individual articles get
// their angle chosen per cycle by the article-angle agent, so this panel tunes the *stream*.
let CATEGORIES = [];
let CAT_ARTICLES = [];
let CAT_META = null;   // option lists from /api/article-categories/meta
let _catView = 'categories';

async function _loadTopics() {
  const box = document.getElementById('k-topics');
  if (box && !box.dataset.loaded) box.innerHTML = '<div style="color:var(--m);font-size:11px;padding:8px 0">読み込み中…</div>';
  try {
    const [meta, cats, arts] = await Promise.all([
      CAT_META ? Promise.resolve(CAT_META)
        : fetch(apiUrl('/api/article-categories/meta'), { headers: _authHeaders() }).then(r => r.json()),
      fetch(apiUrl('/api/article-categories'), { headers: _authHeaders() }).then(r => r.json()),
      fetch(apiUrl('/api/articles?limit=100'), { headers: _authHeaders() }).then(r => r.json()),
    ]);
    CAT_META = meta;
    CATEGORIES = Array.isArray(cats.categories) ? cats.categories : [];
    CAT_ARTICLES = Array.isArray(arts.articles) ? arts.articles : [];
  } catch { CATEGORIES = []; CAT_ARTICLES = []; }
  if (box) box.dataset.loaded = '1';
  _renderTopics();
}

function setCatView(v) { _catView = v; _renderTopics(); }

const _catStars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));
const _CAT_STATUS = {
  suggested: { label: '未承認', color: '#FBBF24' },
  active:    { label: '稼働中', color: '#34D399' },
  paused:    { label: '停止中', color: '#94A3B8' },
  blocked:   { label: '却下',   color: '#F87171' },
};

function _catDate(ts) {
  if (!ts) return '';
  const ms = ts._seconds ? ts._seconds * 1000 : (ts.seconds ? ts.seconds * 1000 : Date.parse(ts));
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
}

function _renderTopics() {
  const box = document.getElementById('k-topics');
  if (!box) return;

  // Two rows with distinct jobs: what you can *do* here, and which of the two lists you are
  // looking at. They had 6px between them and 4px between the segments, which put raised shadows
  // inside each other's clearance — the crowding was the shadows overlapping, not the labels.
  const toolbar = `<div class="qs-card cat-toolbar">
    <div class="cat-toolbar-actions">
      <button class="save-btn" onclick="scoutTopicsNow()">カテゴリを探す</button>
      <button class="save-btn" onclick="showArticleFromUrl()">URLから書く</button>
    </div>
    <p class="cat-toolbar-note">note.com のトレンドから継続的なカテゴリを提案します</p>
    <div class="cat-toolbar-views" role="tablist">
      <button class="cat-view-btn${_catView === 'categories' ? ' active' : ''}" role="tab" aria-selected="${_catView === 'categories'}" onclick="setCatView('categories')">カテゴリ <b>${CATEGORIES.length}</b></button>
      <button class="cat-view-btn${_catView === 'articles' ? ' active' : ''}" role="tab" aria-selected="${_catView === 'articles'}" onclick="setCatView('articles')">記事 <b>${CAT_ARTICLES.length}</b></button>
      <button class="cat-view-btn${_catView === 'reception' ? ' active' : ''}" role="tab" aria-selected="${_catView === 'reception'}" onclick="setCatView('reception')">note の反応</button>
    </div>
  </div>`;

  box.innerHTML = toolbar + (
    _catView === 'articles'  ? _buildArticleRows()  :
    _catView === 'reception' ? _buildReception()    :
                               _buildCategoryCards());
  if (_catView === 'reception' && !NOTE_STATS) _loadNoteStats();
}

function _buildCategoryCards() {
  if (!CATEGORIES.length) {
    return `<div style="color:var(--m);font-size:11px;padding:8px 0">カテゴリがありません。「カテゴリを探す」で提案を生成できます。</div>`;
  }
  const order = { suggested: 0, active: 1, paused: 2, blocked: 3 };
  const cards = [...CATEGORIES]
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
    .map(_categoryTile).join('');
  return `<div class="cat-tile-grid loaded">${cards}</div>`;
}

// One tile answers only: what is this, is it running, is it any good, when does it fire next.
// Everything else lives behind the click — same two-level structure as the agents page.
// Format marks reuse the dashboard's embossed .ni icon language rather than emoji. A full-colour
// raster glyph sits *on* a neumorphic surface; an embossed mark is *part* of it.
// The money state was an unlabelled icon whose shadow was clipped by the footer's overflow.
// A named chip says which scheme is in play, which is the thing worth knowing at a glance.
const _MONEY_LABEL = { amazon: 'Amazon', paid: '有料', sponsor: 'PR' };

const _CAT_FMT = {
  news_reflection: 'news', analysis: 'analysis', narrative: 'narrative',
  tutorial: 'tutorial', listicle: 'listicle', review: 'review',
};

function _categoryTile(c) {
  const st = _CAT_STATUS[c.status] ?? { label: c.status, color: 'var(--m)' };
  const r = c.rating || {};
  const style = c.style || {};
  const fmt = _CAT_FMT[style.format] || 'analysis';
  const earns = ((c.monetization || {}).mode || 'none') !== 'none';
  const freq = (CAT_META?.frequencies || []).find(f => f.id === c.frequency)?.label || c.frequency;
  const statusClass = c.status === 'active' ? 'done' : c.status === 'suggested' ? 'running' : c.status === 'blocked' ? 'failed' : 'idle';
  return `<div class="acard ${statusClass}" data-id="${c.id}" role="button" tabindex="0"
    aria-label="${esc(c.name)} の設定を開く"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCategoryDetail('${c.id}')}"
    onclick="openCategoryDetail('${c.id}')">
    <i class="ni ni-lg ni-fmt-${fmt}" aria-hidden="true"></i>
    <div class="acard-info">
      <div class="acard-name">${esc(c.name)}</div>
      <div class="acard-chips" style="margin-top:4px">
        <span class="chip">${st.label}</span>
        <span class="cat-chip">${esc(freq)}</span>
      </div>
      <div class="acard-foot">
        <span class="acard-rating">${r.count ? `★${r.average}` : '—'}</span>
        <span class="acard-count">${c.articleCount || 0}本</span>
        ${earns ? `<span class="cat-chip earns" title="${esc(_MONEY_LABEL[(c.monetization||{}).mode] || '収益化')}">${esc(_MONEY_LABEL[(c.monetization||{}).mode] || '収益')}</span>` : ''}
      </div>
    </div>
  </div>`;
}

// The full editor, opened in the shared detail overlay.
function openCategoryDetail(id) {
  const c = CATEGORIES.find(x => x.id === id);
  if (!c) return;
  document.getElementById('detail-content').innerHTML = _categoryEditor(c);
  document.getElementById('detail-panel')?.classList.add('panel-wide');
  const ov = document.getElementById('detail-overlay');
  ov.classList.add('open');
  // Move focus into the dialog so keyboard and screen-reader users land inside it rather than
  // continuing to tab through the page behind.
  document.getElementById('detail-panel')?.focus();
  _moneyChanged(c.id);
}

function _categoryEditor(c) {
  const st = _CAT_STATUS[c.status] ?? { label: c.status, color: 'var(--m)' };
  const t = c.targeting || {};
  const r = c.rating || {};
  const style = c.style || {};
  const m = c.monetization || {};
  const fmt = _CAT_FMT[style.format] || 'analysis';
  const lbl = (list, id) => (list || []).find(o => o.id === id)?.label || id || '—';
  const freqLabel = lbl(CAT_META?.frequencies, c.frequency);

  const freqOpts = (CAT_META?.frequencies || []).map(f =>
    `<option value="${f.id}"${f.id === c.frequency ? ' selected' : ''}>${esc(f.label)}</option>`).join('');
  const sel = (id, opts) => `<select id="${id}" class="cat-in">${opts}</select>`;
  const genderOpts = [['any', '男女問わず'], ['male', '男性中心'], ['female', '女性中心']].map(([v, l]) =>
    `<option value="${v}"${v === (t.gender || 'any') ? ' selected' : ''}>${l}</option>`).join('');
  const scaleOpts = [['mass', 'マス（幅広い）'], ['niche', 'ニッチ（狭く深い）']].map(([v, l]) =>
    `<option value="${v}"${v === (t.scale || 'mass') ? ' selected' : ''}>${l}</option>`).join('');

  const statusActions = c.status === 'suggested'
    ? `<button class="act-btn resume" onclick="catAction('${c.id}','approve')">承認</button>
       <button class="act-btn cancel" onclick="catAction('${c.id}','reject')">却下</button>`
    : c.status === 'paused'
      ? `<button class="act-btn resume" onclick="catAction('${c.id}','resume')">再開</button>`
      : c.status === 'active'
        ? `<button class="act-btn" onclick="catAction('${c.id}','pause')">停止</button>` : '';

  // Only the editorial prompt is open by default — it is the lever that matters and the one thing
  // you come here to change. Everything else states its current value on the closed row, so the
  // panel answers "how is this configured" without expanding anything.
  const section = (title, summary, body, open = false) => `
    <details class="neu-sec"${open ? ' open' : ''}>
      <summary>${title}<span class="sum-val">${summary}</span><span class="chev">▶</span></summary>
      <div class="neu-sec-body">${body}</div>
    </details>`;

  return `
    <div class="p-header">
      <i class="ni ni-xl ni-fmt-${fmt}" aria-hidden="true"></i>
      <div>
        <div class="p-title">${esc(c.name)}</div>
        <div class="p-sub">${st.label} · ${freqLabel} · ${c.articleCount || 0}本${r.count ? ` · ★${r.average}` : ''}</div>
      </div>
    </div>

    <div class="neu-well" style="font-size:11.5px;color:var(--m);line-height:1.65">${esc(c.definition || '')}</div>

    ${section('編集方針', '', `
      <textarea class="cat-prompt" id="cat-prompt-${c.id}" rows="9">${esc(c.prompt || '')}</textarea>
      <div style="font-size:9.5px;color:var(--m2);margin-top:8px;line-height:1.5">
        毎回の記事ブリーフにそのまま渡されます。事実の正確性や構成ルールより優先されることはありません。
      </div>
      ${c.promptSuggested && c.promptSuggested !== c.prompt
        ? `<button class="act-btn" style="margin-top:10px" onclick="resetCategoryPrompt('${c.id}')">提案に戻す</button>` : ''}`, true)}

    ${section('記事のかたち',
      `${lbl(CAT_META?.formats, style.format)} · ${lbl(CAT_META?.visualDensities, style.visualDensity)} · ${lbl(CAT_META?.depths, style.depth)}`, `
      <div class="cat-grid cat-style neu-well">
        ${_styleField(c, 'format', '形式', CAT_META?.formats)}
        ${_styleField(c, 'voice', '語り口', CAT_META?.voices)}
        ${_styleField(c, 'visualDensity', 'ビジュアル', CAT_META?.visualDensities)}
        ${_styleField(c, 'depth', '情報量', CAT_META?.depths)}
      </div>`)}

    ${section('読者と頻度',
      `${t.ageMin ?? 25}〜${t.ageMax ?? 45}歳 · ${(t.scale || 'mass') === 'niche' ? 'ニッチ' : 'マス'} · ${freqLabel}`, `
      <div class="cat-grid neu-well">
        <label class="cat-field"><span>頻度</span>${sel(`cat-freq-${c.id}`, freqOpts)}</label>
        <label class="cat-field"><span>年齢</span><span class="cat-age">
          <input type="number" class="cat-in" id="cat-agemin-${c.id}" value="${t.ageMin ?? 25}" min="10" max="99">
          <span>〜</span>
          <input type="number" class="cat-in" id="cat-agemax-${c.id}" value="${t.ageMax ?? 45}" min="10" max="99">
        </span></label>
        <label class="cat-field"><span>性別</span>${sel(`cat-gender-${c.id}`, genderOpts)}</label>
        <label class="cat-field"><span>読者規模</span>${sel(`cat-scale-${c.id}`, scaleOpts)}</label>
        <label class="cat-field cat-wide"><span>専門性</span>
          <input type="text" class="cat-in" id="cat-spec-${c.id}" value="${esc(t.specialization || '')}"
            placeholder="空欄なら専門を前提としない"></label>
      </div>`)}

    ${section('収益化', lbl(CAT_META?.monetizationModes, m.mode || 'none'),
      `<div class="neu-well">${_moneyField(c)}</div>`)}

    <div class="p-actions">
      <button class="save-btn" onclick="saveCategory('${c.id}')">保存</button>
      ${statusActions}
      <button class="act-btn" onclick="generateNow('${c.id}')">今すぐ1本</button>
      <button class="act-btn cancel" onclick="deleteCategory('${c.id}')">削除</button>
    </div>`;
}

/* ── note reception ──────────────────────────────────────────────────────────
   What readers actually did with what we published. Two rules shape this panel:

   Generated and hand-written posts are never pooled. The account carries both, and the
   hand-written ones currently out-perform the pipeline — averaging them would report a
   flattering number that describes neither.

   And it says what it does not know. PV, 読了率 and 売上 live behind the operator's logged-in
   note dashboard; this reads only the public creator feed, so the panel names the gap rather
   than letting ♡ stand in for reach. */
let NOTE_STATS = null;
let _noteStatsErr = null;

async function _loadNoteStats() {
  try {
    const res = await fetch(apiUrl('/api/note-stats'), { headers: _authHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    NOTE_STATS = await res.json();
    _noteStatsErr = null;
  } catch (e) {
    _noteStatsErr = e.message;
  }
  if (_catView === 'reception') _renderTopics();
}

function _noteBar(mean, max) {
  const pct = max > 0 ? Math.round((mean / max) * 100) : 0;
  return `<span class="note-bar"><span class="note-bar-fill" style="width:${Math.max(pct, 2)}%"></span></span>`;
}

function _buildReception() {
  if (_noteStatsErr) return `<div class="note-empty">note の反応を読み込めませんでした（${esc(_noteStatsErr)}）。</div>`;
  if (!NOTE_STATS) return `<div class="note-empty">読み込み中…</div>`;
  if (!NOTE_STATS.collected) {
    return `<div class="note-empty">まだ収集されていません。1日1回、自動で取得します。</div>`;
  }

  const g = NOTE_STATS.totals.generated;
  const m = NOTE_STATS.totals.manual;
  const cats = NOTE_STATS.byCategory ?? [];
  const maxCat = Math.max(...cats.map(c => c.meanLikes), 0);
  const top = (NOTE_STATS.generated ?? []).slice(0, 6);

  const row = (p) => `<div class="note-row">
    <div class="note-row-main">
      <div class="note-row-title">${p.url
        ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
        : esc(p.title)}</div>
      <div class="note-row-meta">
        ${p.isPaid ? `<span class="cat-chip earns">有料 ¥${p.price}</span>` : ''}
        ${(p.hashtags ?? []).slice(0, 3).map(h => `<span class="note-tag">${esc(h)}</span>`).join('')}
        ${p.hashtags?.length ? '' : '<span class="note-warn">タグ無し</span>'}
      </div>
    </div>
    <div class="note-row-nums">
      <span class="note-likes">♡${p.likes}</span>
      ${p.trend && p.trend.likes > 0 ? `<span class="note-trend">+${p.trend.likes}</span>` : ''}
    </div>
  </div>`;

  return `<div class="note-panel">
    <div class="note-totals">
      <div class="note-stat">
        <span class="note-stat-label">自動生成</span>
        <span class="note-stat-value">${g.articles}本 · ♡${g.totalLikes}</span>
        <span class="note-stat-sub">平均 ♡${g.meanLikes}　反応ゼロ ${g.zeroLike}本</span>
      </div>
      <div class="note-stat">
        <span class="note-stat-label">手動</span>
        <span class="note-stat-value">${m.articles}本 · ♡${m.totalLikes}</span>
        <span class="note-stat-sub">平均 ♡${m.meanLikes}（比較用の基準）</span>
      </div>
    </div>

    ${cats.length ? `<div class="note-block">
      <h4 class="note-h">カテゴリ別の平均♡</h4>
      ${cats.map(c => `<div class="note-cat">
        <span class="note-cat-name">${esc(c.label)}</span>
        ${_noteBar(c.meanLikes, maxCat)}
        <span class="note-cat-num">${c.meanLikes}<span class="note-cat-n">/${c.n}本</span></span>
      </div>`).join('')}
    </div>` : ''}

    ${top.length ? `<div class="note-block">
      <h4 class="note-h">自動生成記事の反応</h4>
      ${top.map(row).join('')}
    </div>` : ''}

    <p class="note-foot">${(NOTE_STATS.missing ?? []).join('・')} は note のログイン内でのみ公開されるため、ここには含まれません。1日1回収集${NOTE_STATS.lastCollectedAt ? `（最終 ${_catDate(NOTE_STATS.lastCollectedAt)}）` : ''}。</p>
  </div>`;
}

function _buildArticleRows() {
  if (!CAT_ARTICLES.length) return `<div style="color:var(--m);font-size:11px;padding:8px 0">記事がまだありません。</div>`;
  const catName = (id) => CATEGORIES.find(c => c.id === id)?.name || (id ? '(削除済みカテゴリ)' : 'URL考察');
  return CAT_ARTICLES.map(a => `<div class="src-row" data-id="${a.id}">
    <div class="src-body">
      <div class="src-name">${a.wikiUrl
        ? `<a href="${esc(a.wikiUrl)}" target="_blank" rel="noopener" style="color:inherit">${esc(a.title || a.angle || '(無題)')}</a>`
        : esc(a.title || a.angle || '(無題)')}</div>
      <div class="src-meta">
        <span style="color:#A78BFA">${esc(catName(a.categoryId))}</span>
        ${a.articleKind ? `<span style="color:#60A5FA">${esc(a.articleKind)}</span>` : ''}
        ${a.status !== 'published' ? `<span style="color:var(--error)">${esc(a.status)}</span>` : ''}
        ${a.charCount ? `<span style="color:var(--m)">約${a.charCount.toLocaleString()}字</span>` : ''}
        ${a.imageCount ? `<span style="color:var(--m)">画像${a.imageCount}（web${a.webImageCount ?? 0}）</span>` : ''}
        <span style="color:var(--m)">${_catDate(a.publishedAt || a.createdAt)}</span>
      </div>
    </div>
    <div class="art-score">${[1, 2, 3, 4, 5].map(n =>
      `<button type="button" class="art-star${a.score >= n ? ' on' : ''}"
        aria-label="${n}点をつける" aria-pressed="${a.score === n ? 'true' : 'false'}"
        onclick="scoreArticleRow('${a.id}',${n})">★</button>`).join('')}</div>
  </div>`).join('');
}

// A style control: the select, plus the chosen option's one-line explanation underneath. The hint
// updates on change, so the card explains what each setting actually does to the writing rather
// than showing a bare enum the user has to remember the meaning of.
function _styleField(c, key, label, options) {
  const cur = (c.style || {})[key];
  const opts = options || [];
  const chosen = opts.find(o => o.id === cur) || opts[0] || {};
  const id = `cat-${key}-${c.id}`;
  return `<label class="cat-field cat-style-field"><span>${label}</span>
    <select id="${id}" class="cat-in" onchange="_styleHint('${id}')"
      data-hints='${esc(JSON.stringify(Object.fromEntries(opts.map(o => [o.id, o.hint || '']))))}'>
      ${opts.map(o => `<option value="${o.id}"${o.id === cur ? ' selected' : ''}>${esc(o.label || o.id)}</option>`).join('')}
    </select>
    <em class="cat-hint" id="${id}-hint">${esc(chosen.hint || '')}</em></label>`;
}

function _styleHint(selectId) {
  const el = document.getElementById(selectId);
  const out = document.getElementById(`${selectId}-hint`);
  if (!el || !out) return;
  let hints = {};
  try { hints = JSON.parse(el.dataset.hints || '{}'); } catch {}
  out.textContent = hints[el.value] || '';
}

// Monetization control. The price input only appears for `paid`, because it is the only mode where
// the number changes anything — it sets the minimum length the article must reach.
function _moneyField(c) {
  const m = c.monetization || {};
  const opts = CAT_META?.monetizationModes || [];
  const cur = m.mode || 'none';
  const chosen = opts.find(o => o.id === cur) || {};
  return `<div class="cat-grid cat-money">
    <label class="cat-field cat-style-field"><span>方針</span>
      <select id="cat-money-${c.id}" class="cat-in" onchange="_moneyChanged('${c.id}')"
        data-hints='${esc(JSON.stringify(Object.fromEntries(opts.map(o => [o.id, o.hint || '']))))}'>
        ${opts.map(o => `<option value="${o.id}"${o.id === cur ? ' selected' : ''}>${esc(o.label || o.id)}</option>`).join('')}
      </select>
      <em class="cat-hint" id="cat-money-${c.id}-hint">${esc(chosen.hint || '')}</em></label>
    <label class="cat-field" id="cat-price-wrap-${c.id}" style="${cur === 'paid' ? '' : 'display:none'}">
      <span>想定価格（円）</span>
      <input type="number" class="cat-in" id="cat-price-${c.id}" value="${m.priceYen || 0}" min="0" max="50000" step="100"
        onchange="_moneyChanged('${c.id}')">
      <em class="cat-hint" id="cat-price-${c.id}-hint">${esc(_priceHint(m.priceYen || 0))}</em></label>
    <label class="cat-field cat-wide"><span>メモ（ライターへの補足指示）</span>
      <input type="text" class="cat-in" id="cat-moneynote-${c.id}" value="${esc(m.notes || '')}"
        placeholder="例: 入門書を紹介できる回があれば記録すること"></label>
  </div>`;
}

// Mirrors PAID_LENGTH in categories.js — shown live so the price and the length it demands are
// visible together rather than discovered after an article comes out short.
function _priceHint(yen) {
  const y = Number(yen) || 0;
  if (y <= 0) return '価格を入れると必要な文字数が出ます';
  if (y <= 500) return '最低5,000字・目安7,000字';
  if (y <= 1000) return '最低6,000字・目安9,000字';
  return '最低10,000字・目安15,000字';
}

function _moneyChanged(id) {
  _styleHint(`cat-money-${id}`);
  const mode = _catVal(`cat-money-${id}`);
  const wrap = document.getElementById(`cat-price-wrap-${id}`);
  if (wrap) wrap.style.display = mode === 'paid' ? '' : 'none';
  const ph = document.getElementById(`cat-price-${id}-hint`);
  if (ph) ph.textContent = _priceHint(_catVal(`cat-price-${id}`));
}

const _catVal = (id) => document.getElementById(id)?.value ?? '';

async function saveCategory(id) {
  const body = {
    prompt: _catVal(`cat-prompt-${id}`),
    frequency: _catVal(`cat-freq-${id}`),
    style: {
      format: _catVal(`cat-format-${id}`),
      voice: _catVal(`cat-voice-${id}`),
      visualDensity: _catVal(`cat-visualDensity-${id}`),
      depth: _catVal(`cat-depth-${id}`),
    },
    monetization: {
      mode: _catVal(`cat-money-${id}`),
      priceYen: Number(_catVal(`cat-price-${id}`)) || 0,
      notes: _catVal(`cat-moneynote-${id}`),
    },
    targeting: {
      ageMin: Number(_catVal(`cat-agemin-${id}`)),
      ageMax: Number(_catVal(`cat-agemax-${id}`)),
      gender: _catVal(`cat-gender-${id}`),
      scale: _catVal(`cat-scale-${id}`),
      specialization: _catVal(`cat-spec-${id}`),
    },
  };
  const res = await fetch(apiUrl(`/api/article-categories/${id}`), {
    method: 'PATCH', headers: { ..._authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => null);
  if (!res?.ok) { showToast('保存に失敗しました', 'error'); return; }
  showToast('保存しました。次回以降の記事に反映されます。', 'success');
  closeDetail(); _loadTopics();
}

function resetCategoryPrompt(id) {
  showConfirm('編集方針を最初の提案内容に戻しますか？', async () => {
    await fetch(apiUrl(`/api/article-categories/${id}/reset-prompt`), { method: 'POST', headers: _authHeaders() }).catch(() => {});
    showToast('提案内容に戻しました。', 'success');
    _loadTopics();
  }, document.querySelector(`.cat-card[data-id="${CSS.escape(id)}"]`));
}

async function catAction(id, action) {
  const labels = { approve: '承認', reject: '却下', pause: '停止', resume: '再開' };
  const run = async () => {
    await fetch(apiUrl(`/api/article-categories/${id}/${action}`), { method: 'POST', headers: _authHeaders() }).catch(() => {});
    showToast(`${labels[action]}しました。`, 'success');
    closeDetail(); _loadTopics();
  };
  // Rejecting is the only irreversible one here — it marks the category "do not re-suggest".
  if (action === 'reject') {
    showConfirm('却下すると今後スカウトから再提案されません。よろしいですか？', run,
      document.querySelector(`.cat-card[data-id="${CSS.escape(id)}"]`));
  } else { await run(); }
}

function deleteCategory(id) {
  showConfirm('このカテゴリを完全に削除しますか？（生成済みの記事は残ります）', async () => {
    await fetch(apiUrl(`/api/article-categories/${id}`), { method: 'DELETE', headers: _authHeaders() }).catch(() => {});
    showToast('削除しました。', 'success');
    closeDetail(); _loadTopics();
  }, document.querySelector(`.cat-card[data-id="${CSS.escape(id)}"]`));
}

async function generateNow(id) {
  const res = await fetch(apiUrl(`/api/article-categories/${id}/generate`), { method: 'POST', headers: _authHeaders() }).catch(() => null);
  showToast(res?.ok ? '記事を書き始めました。完成すると #articles に投稿されます。' : '起動に失敗しました', res?.ok ? 'success' : 'error');
}

async function scoreArticleRow(id, score) {
  const res = await fetch(apiUrl(`/api/articles/${id}/score`), {
    method: 'POST', headers: { ..._authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ score }),
  }).catch(() => null);
  if (!res?.ok) { showToast('評価に失敗しました', 'error'); return; }
  const out = await res.json().catch(() => ({}));
  showToast(out.average ? `${score}点を記録（カテゴリ平均 ${out.average}）` : `${score}点を記録しました`, 'success');
  _loadTopics();
}

// Ad-hoc article from any URL — the dashboard twin of the /article Discord command.
function showArticleFromUrl() {
  document.getElementById('article-url-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'article-url-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg);box-shadow:var(--sh-lg);border-radius:16px;width:min(520px,95vw);display:flex;flex-direction:column;padding:20px;gap:12px">
      <div style="font-weight:700;font-size:14px;color:var(--txt,var(--fg))">📝 URLから考察記事を書く</div>
      <div style="font-size:11px;color:var(--m)">YouTube動画・記事・論文など、URLなら何でも。題材を読み込んで背景を調べ、考察記事にします。</div>
      <input class="form-input" id="afu-url" placeholder="https://www.youtube.com/watch?v=…" style="font-size:12px">
      <input class="form-input" id="afu-note" placeholder="補足指示（任意）例: 日本の事例と比較して" style="font-size:12px">
      <div style="display:flex;gap:8px">
        <button class="save-btn" onclick="submitArticleFromUrl()">書き始める</button>
        <button class="act-btn" onclick="document.getElementById('article-url-modal').remove()">キャンセル</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  document.getElementById('afu-url').focus();
}

async function submitArticleFromUrl() {
  const url = _catVal('afu-url').trim();
  if (!/^https?:\/\//i.test(url)) { showToast('http(s) で始まるURLを入れてください', 'error'); return; }
  const res = await fetch(apiUrl('/api/articles/from-url'), {
    method: 'POST', headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, note: _catVal('afu-note').trim() }),
  }).catch(() => null);
  document.getElementById('article-url-modal')?.remove();
  showToast(res?.ok ? '記事を書き始めました。完成すると #articles に投稿されます。' : '起動に失敗しました', res?.ok ? 'success' : 'error');
}

async function scoutTopicsNow() {
  showToast('カテゴリを探しています…（数十秒かかります）', 'info');
  await fetch(apiUrl('/api/article-categories/scout'), { method: 'POST', headers: _authHeaders() }).catch(() => {});
  setTimeout(_loadTopics, 8000);
}

function _renderKnowledge() {
  document.getElementById('k-sources').innerHTML   = _buildSourceRows(SOURCES.filter(s => !s.blocked));
  document.getElementById('k-blocked').innerHTML   = _buildBlockedSourceRows(SOURCES.filter(s => s.blocked));
  const kd = (window._knowledgeData || {});
  document.getElementById('k-followups').innerHTML = _buildSuggestedFollowupRows(kd.suggestedFollowups || []);
  document.getElementById('k-merges').innerHTML    = _buildMergeSuggestionRows(kd.mergeSuggestions || []);
  document.getElementById('k-vaults').innerHTML    = _buildVaultRows(kd.vaults || [], kd.pendingVaultTasks || []);
  document.getElementById('k-bases').innerHTML     = _buildBasesRows(kd.bases || []);
}

function _buildSourceRows(sources) {
  if (!sources || !sources.length) { const t=_I18N[PROJECT_LANG]||_I18N.JP; return `<div style="color:var(--m);font-size:11px;padding:8px 0">${t['empty-sources']}</div>`; }
  return sources.map(s => {
    const tc = s.type === 'rss' ? '#60A5FA' : s.type === 'url' ? '#A78BFA' : '#34D399';
    const dc = s.domain === 'news' ? '#FBBF24' : '#2DD4BF';
    return `<div class="src-row" data-domain="${s.domain}" data-id="${s.id}">
      <button type="button" class="src-toggle ${s.enabled ? 'on':'off'}" role="switch"
        aria-checked="${s.enabled ? 'true' : 'false'}"
        aria-label="${esc(s.name)} を${s.enabled ? '無効' : '有効'}にする"
        onclick="toggleSource('${s.id}',${!s.enabled})"></button>
      <div class="src-body">
        <div class="src-name">${esc(s.name)}</div>
        <div class="src-meta">
          <span style="color:${tc}">${(s.type||'').toUpperCase()}</span>
          <span style="color:${dc}">${s.domain}</span>
          ${s.genre ? `<span style="color:var(--m)">${esc(s.genre)}</span>` : ''}
          <a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--m);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${esc(s.url)}</a>
        </div>
      </div>
      <button class="act-btn cancel" onclick="blockSource('${s.id}')" style="font-size:8px;padding:2px 6px" aria-label="ブロック" title="ブロック"><i class="ni ni-block" aria-hidden="true"></i></button>
    </div>`;
  }).join('');
}

function _buildBlockedSourceRows(blocked) {
  const t=_I18N[PROJECT_LANG]||_I18N.JP; if (!blocked || !blocked.length) return `<div style="color:var(--m);font-size:11px;padding:8px 0">${t['empty-blocked']}</div>`;
  return blocked.map(s => `<div class="src-row" data-id="${s.id}">
    <div class="src-toggle blocked"></div>
    <div class="src-body">
      <div class="src-name" style="text-decoration:line-through">${esc(s.name)}</div>
      <div class="src-meta"><span style="color:var(--error)">⛔ ${esc(s.blockedReason || 'blocked')}</span></div>
    </div>
    <button class="act-btn resume" onclick="unblockSource('${s.id}')" style="font-size:8px;padding:2px 6px">↻</button>
  </div>`).join('');
}

function _buildMergeSuggestionRows(items) {
  const t=_I18N[PROJECT_LANG]||_I18N.JP; if (!items || !items.length) return `<div style="color:var(--m);font-size:11px;padding:8px 0">${t['empty-merges']}</div>`;
  return items.map(m => {
    const pct = (Number(m.similarity) * 100).toFixed(1);
    return `<div class="src-row" data-merge-id="${esc(m.id)}" style="display:block;padding:6px 8px;border-left:3px solid #FBBF24">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="flex:1"><div class="src-name">${esc(m.slugAName||m.slugA)} ⇔ ${esc(m.slugBName||m.slugB)}</div>
          <div style="font-size:10px;color:var(--m)">${pct}${(_I18N[PROJECT_LANG]||_I18N.JP)['lbl-similar']}</div></div>
        <div style="display:flex;gap:6px">
          <button class="act-btn resume" onclick="markMerged('${esc(m.id)}')" style="font-size:9px;padding:3px 9px">${(_I18N[PROJECT_LANG]||_I18N.JP)['act-merged']}</button>
          <button class="act-btn cancel" aria-label="閉じる" title="閉じる" onclick="dismissMerge('${esc(m.id)}')" style="font-size:9px;padding:3px 8px"><i class="ni ni-close" aria-hidden="true"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _buildSuggestedFollowupRows(items) {
  if (!items || !items.length) { const t=_I18N[PROJECT_LANG]||_I18N.JP; return `<div style="color:var(--m);font-size:11px;padding:8px 0">${t['empty-followups']}</div>`; }
  const byPage = {};
  for (const it of items) (byPage[it.pageSlug] ??= { pageName: it.pageName, items:[] }).items.push(it);
  return Object.entries(byPage).map(([slug, g]) => `<div class="src-row" style="display:block;padding:6px 8px;border-left:3px solid #A78BFA">
    <div class="src-name">${(_I18N[PROJECT_LANG]||_I18N.JP)['src-from']} <span style="color:var(--acc)">${esc(g.pageName)}</span></div>
    ${g.items.map(it => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--div)">
      <div style="font-size:10px;color:var(--txt);flex:1">${esc(it.question)}</div>
      <div style="display:flex;gap:4px">
        <button class="act-btn resume" onclick="researchFollowup('${esc(slug)}','${esc(it.question).replace(/'/g,'')}',this)" style="font-size:9px;padding:3px 9px">${(_I18N[PROJECT_LANG]||_I18N.JP)['act-research']}</button>
        <button class="act-btn cancel" aria-label="閉じる" title="閉じる" onclick="dismissFollowup('${esc(slug)}','${esc(it.question).replace(/'/g,'')}',this)" style="font-size:9px;padding:3px 8px"><i class="ni ni-close" aria-hidden="true"></i></button>
      </div>
    </div>`).join('')}
  </div>`).join('');
}

function _buildVaultRows(vaults, pendingVaultTasks) {
  const pending = (pendingVaultTasks || []).map(p => `<div class="src-row" style="display:block;border-left:3px solid #F97316;padding:6px 8px">
    <div class="src-name">${esc(p.vaultId)} → ${esc(p.repoName)}</div>
    <div style="font-size:10px;color:var(--m)">承認待ち · ${p.visibility}</div>
  </div>`).join('');
  if (!vaults || !vaults.length) return pending + `<div style="color:var(--m);font-size:11px;padding:8px 0">${(_I18N[PROJECT_LANG]||_I18N.JP)['empty-vaults']}</div>`;
  return pending + vaults.slice().sort((a,b) => (b.is_default?1:0)-(a.is_default?1:0)).map(v => {
    const vc = v.visibility === 'confidential' ? '#EF4444' : v.visibility === 'internal' ? '#F97316' : '#34D399';
    const db = v.is_default ? `<span style="background:color-mix(in srgb,var(--grn) 14%,transparent);color:var(--grn);padding:1px 5px;border-radius:3px;font-size:9px">デフォルト</span> ` : '';
    return `<div class="src-row" style="display:block;padding:6px 8px;border-left:3px solid ${vc}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div><div class="src-name">${db}${esc(v.id)}</div>
          <div style="font-size:10px;color:var(--m)">${esc(v.categories?.join(', ') || '(任意)')} · ${v.pageCount||0} ページ</div></div>
        <div style="display:flex;gap:6px">
          ${!v.is_default ? `<button class="act-btn cancel" aria-label="削除" title="削除" onclick="deleteVault('${esc(v.id)}')" style="font-size:9px;padding:3px 8px"><i class="ni ni-close" aria-hidden="true"></i></button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function _buildBasesRows(bases) {
  const t=_I18N[PROJECT_LANG]||_I18N.JP; if (!bases || !bases.length) return `<div style="color:var(--m);font-size:11px;padding:8px 0">${t['empty-bases']}</div>`;
  return bases.map(b => `<div class="src-row base-row" data-base-slug="${esc(b.id)}" style="display:block;padding:6px 8px;border-left:3px solid #6366F1">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div><div class="src-name">${esc(b.name)}</div>${b.description?`<div style="font-size:10px;color:var(--m)">${esc(b.description)}</div>`:''}</div>
      <div style="display:flex;gap:6px">
        <button class="act-btn resume" onclick="runBase('${esc(b.id)}')" style="font-size:9px;padding:3px 10px">${t['act-run']}</button>
        <button class="act-btn cancel" aria-label="削除" title="削除" onclick="deleteBase('${esc(b.id)}')" style="font-size:9px;padding:3px 8px"><i class="ni ni-close" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="base-result" id="baseResult-${esc(b.id)}" style="display:none;margin-top:8px"></div>
  </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   INBOX PAGE
══════════════════════════════════════════════════════════════ */
let _iTab = 'pending';

function setITab(el, tab) {
  _iTab = tab;
  document.querySelectorAll('.tab-btn[data-itab]').forEach(b => b.classList.toggle('active', b === el));
  _renderInbox();
}

function _renderInbox() {
  _renderInboxList(_iTab);
  _renderFactChecks();
}

function _renderInboxList(status) {
  const el = document.getElementById('inbox-list'); if (!el) return;
  const items = (window._inboxData || {})[status] || [];
  if (!items.length) { const t=_I18N[PROJECT_LANG]||_I18N.JP; el.innerHTML = `<div style="color:var(--m);font-size:11px;padding:12px 0">${status === 'pending' ? t['empty-inbox'] : t['empty-items']}</div>`; return; }
  el.innerHTML = items.map(it => {
    const ago = it.lastSeenAt ? new Date(it.lastSeenAt).toLocaleString('en-US', { timeZone:'Asia/Tokyo', hour12:false }) : '';
    const isUrl = it.command && /^https?:\/\//i.test(it.command);
    const cmdEl = it.command
      ? (isUrl ? `<a href="${esc(it.command)}" target="_blank" rel="noopener" style="color:var(--acc);word-break:break-all">${esc(it.command.substring(0,120))}${it.command.length>120?'…':''}</a>`
          : `<code style="font-size:9px;padding:2px 4px;border-radius:3px">${esc(it.command)}</code>`)
      : '';
    return `<div class="inbox-item" data-id="${esc(it.id)}">
      <div class="inbox-action">🚧 ${esc(it.action)}</div>
      <div class="inbox-why">${esc(it.reason)}</div>
      ${cmdEl ? `<div class="inbox-cmd">${cmdEl}</div>` : ''}
      <div class="inbox-foot">
        ${status === 'pending' ? `<button class="act-btn resume" onclick="inboxDone('${esc(it.id)}')" style="font-size:9px;padding:3px 10px">${(_I18N[PROJECT_LANG]||_I18N.JP)['act-done']}</button>
          <button class="act-btn cancel" onclick="inboxIgnore('${esc(it.id)}')" style="font-size:9px;padding:3px 10px">${(_I18N[PROJECT_LANG]||_I18N.JP)['act-ignore']}</button>` : ''}
        ${it.occurrences > 1 ? `<span style="font-size:9px;color:var(--warn)">×${it.occurrences}</span>` : ''}
        <span class="inbox-time">${ago}</span>
      </div>
    </div>`;
  }).join('');
}

function _renderFactChecks() {
  const el = document.getElementById('factcheck-list'); if (!el) return;
  const fcs = (window._factChecks || []);
  if (!fcs.length) { const t=_I18N[PROJECT_LANG]||_I18N.JP; el.innerHTML = `<div style="color:var(--m);font-size:11px;padding:8px 0">${t['empty-factchecks']}</div>`; return; }
  el.innerHTML = fcs.map(fc => {
    const c = fc.counts || {};
    const total = (fc.verdicts || []).length || 0;
    const verPct = total > 0 ? Math.round(((c.verified||0)/total)*100) : 0;
    const hasIssues = (c.unsupported||0) + (c.partial||0) > 0;
    const dotColor = hasIssues ? '#EF4444' : verPct >= 80 ? '#34D399' : '#FBBF24';
    return `<details class="fc-row" style="border-left:3px solid ${dotColor}">
      <summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span class="fc-date">${esc(fc.newsDate || fc.id)} — ${total} blocks</span>
        <span class="fc-verdict">
          <span style="color:#34D399">✓${c.verified||0}</span>
          <span style="color:#FBBF24">~${c.partial||0}</span>
          <span style="color:#EF4444">!${c.unsupported||0}</span>
          <span style="color:var(--m)">?${c.unverifiable||0}</span>
          <span style="color:${verPct>=80?'#34D399':verPct>=60?'#FBBF24':'#EF4444'}">${verPct}%</span>
        </span>
      </summary>
      <div style="font-size:10px;margin-top:6px">
        ${(fc.verdicts||[]).filter(v=>v.verdict==='unsupported'||v.verdict==='partial').slice(0,5).map(v=>`
          <div style="margin-top:4px;color:var(--txt)">${v.verdict==='unsupported'?'🚨':'⚠️'} ${esc((v.headline||'').substring(0,80))}</div>
          <div style="color:var(--m);font-style:italic;margin-left:14px">${esc(v.reason)}</div>
        `).join('') || '<div style="color:var(--m)">All blocks verified.</div>'}
      </div>
    </details>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS PAGE
══════════════════════════════════════════════════════════════ */
function _renderAnalytics() {
  _renderCostTable();
  _renderPrivMatrix();
}

function _renderCostTable() {
  const tbody = document.getElementById('cost-table-body'); if (!tbody) return;
  const entries = Object.entries(COSTS).sort((a,b) => b[1].estimatedCost - a[1].estimatedCost);
  const t=_I18N[PROJECT_LANG]||_I18N.JP; if (!entries.length) { tbody.innerHTML = `<tr><td colspan="4" style="color:var(--m);font-size:11px;padding:8px">${t['empty-cost']}</td></tr>`; return; }
  tbody.innerHTML = entries.map(([agentId, c]) => {
    const reg = REGISTRY.find(r => r.id === agentId);
    const model = reg ? reg.model : agentId;
    const tok = c.tokensUsed >= 1000 ? (c.tokensUsed/1000).toFixed(1)+'k' : String(c.tokensUsed||0);
    return `<tr>
      <td class="ct-name">${esc(reg?.name || agentId)}</td>
      <td class="ct-model">${esc(model)}</td>
      <td class="ct-tok">${tok}</td>
      <td class="ct-cost">${c.estimatedCost > 0 ? '$'+c.estimatedCost.toFixed(4) : '—'}</td>
    </tr>`;
  }).join('');
}

function _renderPrivMatrix() {
  const el = document.getElementById('priv-matrix'); if (!el) return;
  const ALL_ACTIONS = ['read_firestore','post_discord_message','read_github_files',
    'write_wiki','backup_to_drive','query_knowledge_base','write_firestore',
    'queue_orchestrator_tasks','trigger_github_actions','manage_agent_privileges',
    'create_branch','create_pr','execute_dev_workflow'];
  el.innerHTML = Object.entries(PRIVILEGE_MATRIX).map(([lv, pm]) => {
    const allowed = new Set(pm.actions || []);
    return `<div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:${LV_COLORS[lv]||'var(--m)'};margin-bottom:4px">Lv.${lv} ${LV_NAMES[lv]||''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${ALL_ACTIONS.map(a => `<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:color-mix(in srgb,${allowed.has(a)?'var(--grn)':'var(--m)'} 12%,transparent);color:${allowed.has(a)?'var(--grn)':'var(--m2)'}">${a.replace(/_/g,' ')}</span>`).join('')}
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS PAGE
══════════════════════════════════════════════════════════════ */
function _renderSettings(channels) {
  // Channel assignments are now in the Channels page (channel-centric view).
  // Flash list and location are rendered by _renderFlashList() and _renderLocationPill().
}

function setSettingsSection(btn, id) {
  document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.settings-section').forEach(s => s.classList.toggle('active', s.id === 'ss-' + id));
  if (id === 'general') _renderSettingsLocation();
  if (id === 'mail') _loadMailAccounts();
  if (id === 'providers') _loadProviders();
}

/* ── Mail accounts ─────────────────────────────────────────── */

async function _loadMailAccounts() {
  const list = document.getElementById('mail-accounts-list');
  if (!list) return;
  list.innerHTML = '<div style="font-size:11px;color:var(--m)">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl('/api/mail/accounts'), { headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    const { accounts } = await res.json();
    if (!accounts.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--m)">アカウントがありません。「＋ 追加」でGmailを追加してください。</div>';
      return;
    }
    list.innerHTML = accounts.map(a => _renderMailAccountCard(a)).join('');
  } catch (e) {
    list.innerHTML = `<div style="font-size:11px;color:var(--red)">読み込み失敗: ${esc(e.message)}</div>`;
  }
}

function _renderMailAccountCard(a) {
  const lastScan = a.lastScanAt
    ? new Date(a.lastScanAt._seconds ? a.lastScanAt._seconds * 1000 : a.lastScanAt).toLocaleString('ja-JP', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : 'なし';
  const oauthBadge = a.authType === 'oauth2' || a.oauthConfigured
    ? '<span style="color:#4caf50;font-size:10px;font-weight:700">● OAuth2</span>'
    : '<span style="color:var(--m);font-size:10px">● パスワード</span>';
  const activeBadge = a.active
    ? '<span style="background:var(--acc);color:#fff;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:700">アクティブ</span>'
    : '';
  return `<div style="padding:12px 14px;background:var(--bg2);border-radius:10px;border:1px solid ${a.active ? 'var(--acc)' : 'var(--div)'}">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:12px;font-weight:700;color:var(--txt);flex:1">${esc(a.email)}</span>
      ${activeBadge}
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--m);margin-bottom:8px">
      <span>${oauthBadge}</span>
      <span>IMAP: ${esc(a.host)}:${a.port}</span>
      <span>間隔: ${a.intervalHours}h</span>
      <span>最終スキャン: ${lastScan}</span>
    </div>
    <div style="display:flex;gap:6px">
      ${!a.active ? `<button class="save-btn" style="font-size:10px;padding:4px 10px" onclick="setMailAccountActive('${esc(a.id)}')">アクティブに設定</button>` : ''}
      <button class="save-btn" style="font-size:10px;padding:4px 10px;background:var(--bg2);color:var(--txt)" onclick="openMailRules('${esc(a.id)}','${esc(a.email)}')">&#9776; ルール</button>
      <button class="refresh-btn" style="font-size:10px;padding:4px 10px" onclick="removeMailAccount('${esc(a.id)}', '${esc(a.email)}')">削除</button>
    </div>
  </div>`;
}

function showAddMailAccountModal() {
  const f = document.getElementById('mail-add-form');
  if (f) f.style.display = 'block';
  document.getElementById('add-mail-email')?.focus();
}

function hideAddMailAccountModal() {
  const f = document.getElementById('mail-add-form');
  if (f) f.style.display = 'none';
}

async function addMailAccount() {
  const get = id => document.getElementById(id)?.value.trim();
  const email = get('add-mail-email');
  if (!email || !email.includes('@')) { showToast('有効なメールアドレスを入力してください。', 'warn'); return; }
  const body = {
    email,
    host:           get('add-mail-host')        || 'imap.gmail.com',
    port:           Number(get('add-mail-port')) || 993,
    smtpHost:       get('add-mail-smtp-host')    || 'smtp.gmail.com',
    smtpPort:       Number(get('add-mail-smtp-port')) || 587,
    spamFolder:     get('add-mail-spam')         || 'Spam',
    intervalHours:  Number(get('add-mail-interval')) || 4,
    activeStartUtc: Number(get('add-mail-start-utc')),
    activeEndUtc:   Number(get('add-mail-end-utc')),
  };
  const s = document.getElementById('mail-add-status');
  if (s) s.textContent = '保存中…';
  try {
    const res = await fetch(apiUrl('/api/mail/accounts'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || res.status); }
    hideAddMailAccountModal();
    if (s) s.textContent = '';
    showToast(`${email} を追加しました。`, 'success');
    await _loadMailAccounts();
  } catch (e) {
    if (s) s.textContent = 'Error: ' + e.message;
  }
}

async function setMailAccountActive(id) {
  try {
    const res = await fetch(apiUrl(`/api/mail/accounts/${id}`), {
      method:'PATCH', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) throw new Error(res.status);
    showToast('アクティブアカウントを変更しました。', 'success');
    await _loadMailAccounts();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

async function removeMailAccount(id, email) {
  if (!confirm(`${email} を削除しますか？`)) return;
  try {
    const res = await fetch(apiUrl(`/api/mail/accounts/${id}`), { method:'DELETE', headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    showToast(`${email} を削除しました。`, 'success');
    await _loadMailAccounts();
    // Also hide rules panel if showing this account's rules
    const rulesSec = document.getElementById('mail-rules-section');
    if (rulesSec) rulesSec.style.display = 'none';
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

/* ── Mail rules ─────────────────────────────────────────── */
let _currentRulesAccountId = null;

async function openMailRules(accountId, email) {
  _currentRulesAccountId = accountId;
  const sec = document.getElementById('mail-rules-section');
  const label = document.getElementById('mail-rules-account-label');
  if (sec) sec.style.display = 'block';
  if (label) label.textContent = email;
  await _loadMailRules(accountId);
}

async function _loadMailRules(accountId) {
  const list = document.getElementById('mail-rules-list'); if (!list) return;
  list.innerHTML = '<div style="font-size:11px;color:var(--m)">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl(`/api/mail/accounts/${accountId}/rules`), { headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    const { rules } = await res.json();
    if (!rules.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--m)">ルールなし</div>';
      return;
    }
    list.innerHTML = rules.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-radius:8px">
      <span style="font-size:10px;color:var(--acc);font-weight:700;min-width:40px">${esc(r.field)}</span>
      <span style="font-size:10px;color:var(--m);min-width:50px">${esc(r.matchType)}</span>
      <span style="font-size:11px;color:var(--txt);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.pattern)}</span>
      ${r.folder ? `<span style="font-size:10px;color:var(--m)">→ ${esc(r.folder)}</span>` : ''}
      ${r.classification ? `<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--accent-bg);color:var(--acc)">${esc(r.classification)}</span>` : ''}
      <button class="refresh-btn" style="font-size:9px;padding:2px 7px" onclick="deleteMailRule('${esc(accountId)}','${esc(r.id)}')">削除</button>
    </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div style="font-size:11px;color:var(--red)">読み込み失敗: ${esc(e.message)}</div>`;
  }
}

function showAddRuleForm() {
  const f = document.getElementById('mail-rule-add-form'); if (f) f.style.display = 'block';
}
function hideAddRuleForm() {
  const f = document.getElementById('mail-rule-add-form'); if (f) f.style.display = 'none';
}

async function saveMailRule() {
  if (!_currentRulesAccountId) { showToast('アカウントを先に選択してください', 'warn'); return; }
  const get = id => document.getElementById(id)?.value.trim();
  const body = {
    field: get('rule-field') || 'from',
    matchType: get('rule-match-type') || 'contains',
    pattern: get('rule-pattern'),
    folder: get('rule-folder') || null,
    classification: get('rule-classification') || null,
  };
  if (!body.pattern) { showToast('パターンを入力してください', 'warn'); return; }
  const s = document.getElementById('mail-rule-status');
  if (s) s.textContent = '保存中…';
  try {
    const res = await fetch(apiUrl(`/api/mail/accounts/${_currentRulesAccountId}/rules`), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||res.status); }
    hideAddRuleForm();
    if (s) s.textContent = '';
    document.getElementById('rule-pattern').value = '';
    showToast('ルールを追加しました', 'success');
    await _loadMailRules(_currentRulesAccountId);
  } catch (e) {
    if (s) s.textContent = 'Error: ' + e.message;
  }
}

async function deleteMailRule(accountId, ruleId) {
  try {
    await fetch(apiUrl(`/api/mail/accounts/${accountId}/rules/${ruleId}`), { method:'DELETE', headers:_authHeaders() });
    showToast('削除しました', 'success');
    await _loadMailRules(accountId);
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

/* ── Channel per-channel context window ─────────────────── */

function _renderChannelCtxList() {
  const list = document.getElementById('channel-ctx-list'); if (!list) return;
  // Use the channels already loaded (from dashboard data)
  const chans = (window._allChannels || []).filter(c => c.key);
  if (!chans.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--m)">登録済みチャンネルがありません。チャンネルを登録するとここに表示されます。</div>';
    return;
  }
  list.innerHTML = chans.map(c => {
    const cur = c.maxContextMessages ?? 20;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border-radius:8px">
      <span style="font-size:12px;color:var(--txt);font-weight:600;min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.key)}</span>
      <input type="range" min="5" max="100" step="5" value="${cur}"
        style="flex:1" id="ctx-ch-${esc(c.channelId)}"
        oninput="document.getElementById('ctx-ch-label-${esc(c.channelId)}').textContent=this.value">
      <span id="ctx-ch-label-${esc(c.channelId)}" style="font-size:11px;font-weight:700;color:var(--txt);min-width:28px;text-align:right">${cur}</span>
      <button class="save-btn" style="font-size:10px;padding:3px 10px" onclick="saveChannelCtx('${esc(c.channelId)}','${esc(c.key)}')">保存</button>
    </div>`;
  }).join('');
}

async function saveChannelCtx(channelId, key) {
  const val = Number(document.getElementById(`ctx-ch-${channelId}`)?.value);
  if (!val) return;
  try {
    const res = await fetch(apiUrl('/api/channels'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ channelId, key, maxContextMessages: val }),
    });
    if (!res.ok) throw new Error(res.status);
    showToast(`${key}: コンテキスト ${val} 件に設定しました`, 'success');
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

function _renderSettingsLocation() {
  const lp = LOCATION_PROFILE;
  const el = document.getElementById('settings-loc-detail');
  if (el) {
    el.innerHTML = lp?.city
      ? `<strong style="color:var(--txt)">${esc(lp.city)}, ${esc(lp.country || '')}</strong>${lp.timezone ? ' &middot; ' + esc(lp.timezone) : ''}${lp.confidence ? ' &middot; ' + esc(lp.confidence) + ' confidence' : ''}${lp.userOverride ? ' <span style="color:var(--grn)">(manual override)</span>' : ''}`
      : '<span>No location profile yet. Infers automatically from chat + calendar signals.</span>';
  }
  const ci = document.getElementById('settings-loc-city');
  const coi = document.getElementById('settings-loc-country');
  if (lp && ci && !ci.value) ci.value = lp.city || '';
  if (lp && coi && !coi.value) coi.value = lp.countryCode || '';
}

async function saveLocationOverrideSettings() {
  const city = document.getElementById('settings-loc-city')?.value.trim();
  const cc   = document.getElementById('settings-loc-country')?.value.trim().toUpperCase();
  if (!city) { showToast('都市を入力してください。', 'warn'); return; }
  const res = await fetch(apiUrl('/api/project/location'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ city, countryCode: cc || null, userOverride: true })
  });
  if (!res.ok) { showToast('Save failed: ' + res.status, 'error'); return; }
  showToast('位置情報のオーバーライドを保存しました。', 'success');
  loadDashboard();
}

/* ═══════════════════════════════════════════════════════════
   AI PROVIDER MANAGEMENT
══════════════════════════════════════════════════════════════ */

async function _loadProviders() {
  const list = document.getElementById('providers-list');
  if (!list) return;
  list.innerHTML = '<div style="font-size:11px;color:var(--m)">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl('/api/project/providers'), { headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const sel = document.getElementById('provider-select');
    if (sel) sel.value = data.activeProvider || 'gemini';
    list.innerHTML = data.providers.map(p => _renderProviderCard(p, data.activeProvider)).join('');
  } catch (e) {
    list.innerHTML = `<div style="font-size:11px;color:var(--red)">読み込み失敗: ${esc(e.message)}</div>`;
  }
}

function _renderProviderCard(p, activeProvider) {
  const isActive = p.id === activeProvider;
  const keyBadge = p.keyConfigured
    ? '<span style="color:#4caf50;font-size:10px;font-weight:700">● キー設定済</span>'
    : '<span style="color:var(--red);font-size:10px;font-weight:700">● キー未設定</span>';
  const overrideBadge = p.keyOverrideInFirestore
    ? '<span style="color:#ff9800;font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(255,152,0,.15);font-weight:600">Firestoreキー</span>'
    : '';
  const activeBadge = isActive
    ? '<span style="background:var(--acc);color:#fff;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:700">アクティブ</span>'
    : '';
  const modelsText = p.models.join(', ');
  const rotateLink = p.rotationUrl
    ? `<a href="${p.rotationUrl}" target="_blank" rel="noopener" style="font-size:10px;color:var(--acc)">キーをローテーション →</a>`
    : '';
  const secretText = p.secretName ? `<div style="font-size:10px;color:var(--m);margin-top:2px">Secret: ${esc(p.secretName)}</div>` : '';
  return `<div style="padding:14px;background:var(--bg2);border-radius:10px;border:1px solid ${isActive ? 'var(--acc)' : 'var(--div)'}">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:13px;font-weight:700;color:var(--txt);flex:1">${esc(p.name)}</span>
      ${activeBadge}
      ${overrideBadge}
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--m);margin-bottom:8px">
      <span>${keyBadge}</span>
      ${p.agentCount ? `<span>エージェント: ${p.agentCount}</span>` : ''}
      <span style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">モデル: ${esc(modelsText)}</span>
    </div>
    ${secretText}
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
      <button class="save-btn" style="font-size:10px;padding:4px 10px" onclick="testProvider('${esc(p.id)}', this)">接続テスト</button>
      ${rotateLink}
    </div>
    <div id="provider-test-${esc(p.id)}" style="font-size:10px;color:var(--m);margin-top:6px"></div>
  </div>`;
}

async function testProvider(id, btn) {
  const statusEl = document.getElementById(`provider-test-${id}`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  if (statusEl) statusEl.textContent = 'テスト中…';
  try {
    const res = await fetch(apiUrl(`/api/project/providers/${id}/test`), {
      method:'POST', headers: _authHeaders(),
    });
    const d = await res.json();
    if (d.ok) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#4caf50">✓ 接続成功</span>';
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">✗ ${esc(d.error || 'Failed')}</span>`;
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">✗ ${esc(e.message)}</span>`;
  } finally {
    if (btn) { btn.textContent = '接続テスト'; btn.disabled = false; }
  }
}

function _syncProviderUI() {
  const sel = document.getElementById('provider-select');
  if (sel) sel.value = ACTIVE_PROVIDER;
}

async function setActiveProvider(value) {
  ACTIVE_PROVIDER = value;
  await fetch(apiUrl('/api/project/provider'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ activeProvider: value })
  }).catch(()=>{});
}

async function saveProviderKey() {
  const key = document.getElementById('provider-key-input')?.value.trim();
  if (!key) { showToast('APIキーを貼り付けてください。', 'warn'); return; }
  const btn = document.querySelector('[onclick="saveProviderKey()"]');
  const statusEl = document.getElementById('provider-key-status');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const res = await fetch(apiUrl('/api/project/provider'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ activeProvider: ACTIVE_PROVIDER, apiKey: key })
    });
    if (!res.ok) throw new Error(res.status);
    document.getElementById('provider-key-input').value = '';
    if (statusEl) statusEl.textContent = `✓ ${ACTIVE_PROVIDER} のキーを保存しました。環境変数を上書きする場合は Cloud Run を再起動してください。`;
    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; }, 2000); }
  } catch (e) {
    if (statusEl) statusEl.textContent = `Failed: ${e.message}`;
    if (btn) { btn.textContent = 'ERR'; setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 2000); }
  }
}

/* ═══════════════════════════════════════════════════════════
   DISCORD CHANNEL MANAGEMENT
══════════════════════════════════════════════════════════════ */
let _discordChannels = [];

async function _loadDiscordChannels() {
  if (!API_BASE) return;
  try {
    const res = await fetch(apiUrl('/api/channels'), { headers: _authHeaders() });
    if (res.status === 401) { _handleUnauthorized(); return; }
    if (!res.ok) return;
    const data = await res.json();
    _discordChannels = Object.entries(data.channels || {}).map(([key, ch]) => ({ key, ...ch }));
    _renderRegisteredChannels(_discordChannels);
    _renderSettings(_discordChannels); // refresh agent assignment dropdowns with live channel list
  } catch {}
}

function _renderRegisteredChannels(channels) {
  const el = document.getElementById('registered-channel-list'); if (!el) return;
  if (!channels || !channels.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--m);padding:8px 0">No Discord channels registered yet. Click "+ Add" to register one.</div>';
    return;
  }
  el.innerHTML = channels.map(ch => {
    const agentToggles = REGISTRY.map(reg => {
      const isAssigned = (ch.agents || []).includes(reg.id);
      const short = esc(reg.id.replace(/-agent$/, ''));
      return `<button class="ch-agent-assign-btn${isAssigned ? ' active' : ''}"
        title="${esc(reg.name)}"
        onclick="toggleChannelAgent('${esc(ch.key)}','${esc(reg.id)}',this)">${short}</button>`;
    }).join('');
    return `<div class="ch-reg-card" data-ch-key="${esc(ch.key)}">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;min-width:0">
          <div class="ch-card-key"># ${esc(ch.key)}</div>
          <div style="font-size:10px;color:var(--m);font-family:ui-monospace,monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ch.id || ch.channelId || '')}</div>
          ${ch.asThread ? `<div style="font-size:9px;color:var(--acc);margin-top:2px">thread${ch.threadName ? ': ' + esc(ch.threadName) : ''}</div>` : ''}
        </div>
        <button class="act-btn cancel" onclick="removeDiscordChannel('${esc(ch.key)}')" style="font-size:8px;padding:2px 8px;flex-shrink:0">&#10005;</button>
      </div>
      <div style="margin-top:10px">
        <div class="form-label" style="font-size:9px;margin-bottom:6px">Agents posted here</div>
        <div class="ch-agent-assign-row">${agentToggles || '<span style="font-size:10px;color:var(--m)">No agents registered yet.</span>'}</div>
      </div>
    </div>`;
  }).join('');
}

async function toggleChannelAgent(channelKey, agentId, btn) {
  const isActive = btn.classList.contains('active');
  btn.disabled = true;
  await saveAgentChannel(agentId, isActive ? '' : channelKey);
  btn.classList.toggle('active', !isActive);
  btn.disabled = false;
}

function toggleRegisterForm() {
  const form = document.getElementById('reg-ch-form');
  const toggleBtn = document.getElementById('reg-ch-toggle-btn');
  const visible = form && form.style.display !== 'none';
  if (form) form.style.display = visible ? 'none' : '';
  if (toggleBtn) toggleBtn.textContent = visible ? '+ Add' : '✕ Cancel';
  if (!visible) document.getElementById('reg-ch-key')?.focus();
}

async function registerDiscordChannel() {
  const key = document.getElementById('reg-ch-key')?.value.trim();
  const id  = document.getElementById('reg-ch-id')?.value.trim();
  const asThread  = document.getElementById('reg-ch-thread')?.checked || false;
  const threadName = document.getElementById('reg-ch-threadname')?.value.trim() || undefined;
  if (!key || !id) { showToast('キーとチャンネルIDは必須です。', 'warn'); return; }
  const res = await fetch(apiUrl('/api/channels'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ key, id, asThread, ...(threadName ? { threadName } : {}) })
  });
  if (res.ok) {
    ['reg-ch-key','reg-ch-id','reg-ch-threadname'].forEach(eId => { const e = document.getElementById(eId); if (e) e.value = ''; });
    const cb = document.getElementById('reg-ch-thread'); if (cb) cb.checked = false;
    showToast(`チャンネル「${key}」を登録しました。`, 'success');
    _loadDiscordChannels();
  } else showToast('Failed to save: ' + res.status, 'error');
}

// Keep old name for any legacy callers
async function addDiscordChannel() { return registerDiscordChannel(); }

function removeDiscordChannel(key) {
  const row = document.querySelector(`[data-ch-key="${CSS.escape(key)}"]`);
  showConfirm(`チャンネル「${key}」を削除しますか？`, async () => {
    if (row) row.style.opacity = '0.3';
    const res = await fetch(apiUrl(`/api/channels/${encodeURIComponent(key)}`), {
      method:'DELETE', headers:_authHeaders()
    });
    if (res.ok) { showToast(`チャンネル「${key}」を削除しました。`, 'success'); _loadDiscordChannels(); }
    else { if (row) row.style.opacity = ''; showToast('Failed: ' + res.status, 'error'); }
  }, row);
}

function resetDashLayout() {
  showConfirm('レイアウトをデフォルトに戻しますか？', async () => {
    await fetch(apiUrl('/api/dashboard/prefs'), { method:'DELETE', headers:_authHeaders() }).catch(()=>{});
    loadDashboard();
  }, document.querySelector('[onclick="resetDashLayout()"]'));
}

// ── Dashboard Access management ───────────────────────────────────────────────
async function _loadAccessUsers() {
  const listEl   = document.getElementById('access-user-list');
  const statusEl = document.getElementById('access-status');
  if (!listEl) return;
  try {
    const res  = await fetch(apiUrl('/api/dashboard/access'), { headers: _authHeaders() });
    if (!res.ok) { listEl.innerHTML = `<div style="color:var(--error);font-size:11px">Failed to load</div>`; return; }
    const { allowedUsers } = await res.json();
    const me = (_currentUser?.sub || '').toLowerCase();
    listEl.innerHTML = allowedUsers.map(u => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:10px;background:var(--bg);font-size:12px">
        <span style="font-weight:${u === me ? '700' : '400'}">${esc(u)}${u === me ? ' <span style="color:var(--m2);font-size:10px">(you)</span>' : ''}</span>
        ${u !== me ? `<button class="act-btn cancel" aria-label="削除" title="削除" onclick="removeDashboardUser('${esc(u)}')" style="font-size:9px;padding:2px 8px"><i class="ni ni-close" aria-hidden="true"></i></button>` : ''}
      </div>`).join('');
    if (statusEl) statusEl.textContent = '';
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div style="color:var(--error);font-size:11px">${esc(e.message)}</div>`;
  }
}

async function addDashboardUser() {
  const input    = document.getElementById('access-add-input');
  const statusEl = document.getElementById('access-status');
  const login    = input?.value.trim().toLowerCase();
  if (!login) { if (statusEl) statusEl.textContent = 'Enter a GitHub username.'; return; }
  if (statusEl) statusEl.textContent = 'Adding…';
  try {
    const res = await fetch(apiUrl('/api/dashboard/access'), {
      method: 'POST', headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', login }),
    });
    const data = await res.json();
    if (!res.ok) { if (statusEl) statusEl.textContent = data.error || 'Error'; return; }
    if (input) input.value = '';
    if (statusEl) statusEl.textContent = `Added ${login}.`;
    _loadAccessUsers();
  } catch (e) { if (statusEl) statusEl.textContent = e.message; }
}

async function removeDashboardUser(login) {
  const statusEl = document.getElementById('access-status');
  showConfirm(`「${login}」のアクセス権を削除しますか？`, async () => {
    try {
      const res = await fetch(apiUrl('/api/dashboard/access'), {
        method: 'POST', headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', login }),
      });
      const data = await res.json();
      if (!res.ok) { if (statusEl) statusEl.textContent = data.error || 'Error'; return; }
      if (statusEl) statusEl.textContent = `${login} を削除しました。`;
      _loadAccessUsers();
    } catch (e) { if (statusEl) statusEl.textContent = e.message; }
  });
}

async function saveAgentChannel(agentId, channelKey) {
  await fetch(apiUrl('/api/agent-channel'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ agentId, channelKey: channelKey || '' })
  }).catch(()=>{});
}

/* ═══════════════════════════════════════════════════════════
   LOCATION PILL + MODAL
══════════════════════════════════════════════════════════════ */
function _renderLocationPill() {
  // Location is now Settings-only — delegate directly.
  _renderSettingsLocation();
}

async function saveLocationOverride() {
  const city = document.getElementById('loc-city-input')?.value.trim();
  const cc = document.getElementById('loc-country-input')?.value.trim().toUpperCase();
  if (!city) { showToast('City is required.', 'warn'); return; }
  const res = await fetch(apiUrl('/api/project/location'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ city, countryCode:cc || null, userOverride:true })
  });
  if (!res.ok) { showToast('Save failed: ' + res.status, 'error'); return; }
  loadDashboard();
}

function clearLocationOverride() {
  showConfirm('手動オーバーライドをクリアしますか？自動推論が再開されます。', async () => {
    await fetch(apiUrl('/api/project/location'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ clearOverride:true })
    }).catch(()=>{});
    loadDashboard();
  }, document.getElementById('settings-loc-city'));
}

function closeLocOverlay(e) {
  if (!e || e.target === document.getElementById('loc-overlay')) {
    document.getElementById('loc-overlay')?.classList.remove('open');
  }
}

/* ═══════════════════════════════════════════════════════════
   FLASH LIST + SETTINGS
══════════════════════════════════════════════════════════════ */
function _renderFlashList() {
  const html = REGISTRY.map(reg => {
    const isFlash = FORCE_FLASH || (LEVEL_OVERRIDES && LEVEL_OVERRIDES[reg.id] === 'flash');
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;font-size:11px;border-bottom:1px solid color-mix(in srgb,var(--m2) 15%,transparent)">
      <span style="color:var(--txt)">${esc(reg.name)}</span>
      <button class="flash-toggle ${isFlash?'active':'inactive'}" style="font-size:9px;padding:3px 8px" onclick="toggleAgentFlash('${reg.id}',this)">
        ${isFlash ? '&#9889; Flash' : 'Pro'}
      </button>
    </div>`;
  }).join('');
  ['flash-list', 'settings-flash-list'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = html;
  });
}

async function toggleFlashGlobal() {
  await fetch(apiUrl('/api/project/settings'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ forceFlash: !FORCE_FLASH })
  }).catch(()=>{});
  loadDashboard();
}

async function toggleAgentFlash(agentId, btn) {
  btn.disabled = true;
  const cur = btn.classList.contains('active');
  await fetch(apiUrl(`/api/agents/${agentId}/settings`), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ forceFlash: !cur })
  }).catch(()=>{});
  loadDashboard();
}

async function setIntensity(value) {
  if (!value || value === INTENSITY_MODE) return;
  const sel = document.getElementById('intensity-select');
  const selS = document.getElementById('intensity-select-s');
  if (sel) sel.value = value; if (selS) selS.value = value;
  await fetch(apiUrl('/api/project/intensity'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ intensityMode: value })
  }).catch(()=>{});
  INTENSITY_MODE = value;
}

/* ═══════════════════════════════════════════════════════════
   PROJECT LANGUAGE + I18N
══════════════════════════════════════════════════════════════ */
// Translation map. Strategy:
//   - Translate: UI labels, section headers, page descriptions, action hints
//   - Keep English: agent names, status chips, category names, model names, technical terms
const _I18N = {
  JP: {
    // filter / status tabs
    'all':               'すべて',
    'pending':           '保留中',
    'running':           '実行中',
    'done':              '完了',
    'failed':            '失敗',
    'ignored':           '無視',
    // section headers (overview)
    'channels':          'チャンネル',
    'intensity':         '強度',
    'queue':             'キュー',
    'fact-checks':       'ファクトチェック',
    // placeholders
    'search-agents':     'エージェントを検索…',
    // KPI bar
    'kpi-pending':       '保留中',
    'kpi-running':       '実行中',
    'kpi-completed':     '完了',
    'kpi-failed':        '失敗',
    'click-view':        'タップして確認',
    // stats box
    'stat-agents':       'エージェント',
    'stat-running':      '実行中',
    'stat-failed':       '失敗',
    'stat-enabled':      '有効',
    'stat-pending':      '保留タスク',
    // analytics page
    'analytics-chart':   'トークンコスト — 直近7日',
    'analytics-costs':   '本日のコスト',
    'analytics-priv':    '権限マトリクス',
    'analytics-agent':   'エージェント',
    'analytics-tokens':  'トークン',
    'analytics-cost':    'コスト (概算)',
    // wiki page
    'wiki-pages-tab':    'Wikiページ',
    'wiki-files-tab':    'ファイル',
    'wiki-welcome':      'Wikiページを左から選択',
    'wiki-selected':     '件選択',
    'wiki-search':       '検索…',
    'wiki-no-pages':     'ページが見つかりません',
    'wiki-no-files':     'ファイルが見つかりません',
    'wiki-pages-label':  'ページ',
    'wiki-cats-label':   'カテゴリ',
    'wiki-recent-label': '最近',
    'wiki-files-label':  'ファイル',
    'wiki-types-label':  '種別',
    'wiki-results-label':'件',
    // docs page
    'docs-welcome':      'ドキュメントをツリーから選択',
    // inbox
    'inbox-sub':         'ローカルアクション待ちのアイテム',
    // sources/knowledge
    'src-sources':       'ソース',
    'src-blocked':       'ブロック済み',
    'src-followups':     'フォローアップ',
    'src-merges':        'マージ',
    'src-vaults':        'ヴォールト',
    'src-bases':         'ベース',
    'src-from':          '出典:',
    // channels page
    'ch-routing':        'ルーティング',
    'ch-server':         'サーバーチャンネル',
    'ch-new-folder':     '+ フォルダ',
    'ch-new-channel':    '+ チャンネル',
    'ch-add-tag':        '+ タグ',
    // settings
    'set-save':          '保存',
    'set-cancel':        'キャンセル',
    // empty states (dynamic JS strings)
    'empty-tasks':       'タスクなし',
    'empty-inbox':       'アイテムなし — オーケストレーターは稼働中です',
    'empty-items':       'アイテムなし',
    'empty-factchecks':  'ファクトチェックの実行記録がありません',
    'empty-sources':     'ソースなし',
    'empty-followups':   'フォローアップなし',
    'empty-channels':    'チャンネルなし',
    'empty-blocked':     'ブロック済みのソースはありません',
    'empty-merges':      '重複フラグなし',
    'empty-vaults':      'ヴォールト未登録',
    'empty-bases':       '保存済みのベースはありません',
    'empty-cost':        'データなし',
    'empty-repos':       'リポジトリなし',
    // agent detail overlay labels
    'lbl-description':   '説明',
    'lbl-model':         'モデル',
    'lbl-level':         'レベル',
    'lbl-status':        'ステータス',
    'lbl-enabled':       '有効',
    'lbl-disabled':      '無効',
    'lbl-disable':       '無効化',
    'lbl-enable':        '有効化',
    'lbl-next-run':      '次回実行',
    'lbl-token-budget':  'トークン予算',
    'lbl-in-flows':      'フロー',
    'lbl-tools':         'ツール',
    'lbl-last-task':     '最終タスク',
    'lbl-created':       '作成',
    'lbl-updated':       '更新',
    // task detail labels
    'lbl-goal':          '目標',
    'lbl-priority':      '優先度',
    'lbl-review':        'レビュー',
    'lbl-result':        '結果',
    'lbl-error':         'エラー',
    'lbl-branch':        'ブランチ',
    'lbl-pr':            'PR',
    // action buttons (dynamic)
    'act-cancel':        '✕ キャンセル',
    'act-stop':          '⏹ 停止',
    'act-resume':        '↻ 再開',
    'act-run':           '実行',
    'act-queuing':       '…追加中',
    'act-queued':        '✓ 追加済み',
    'act-research':      '🔬 調査',
    'act-merged':        '✓ マージ済み',
    'act-done':          '✓ 処理済み',
    'act-ignore':        '✕ 無視',
    'lbl-similar':       '% 類似度',
    // agent card chips
    'idle':              '待機中',
    'cat-intelligence':  '情報',
    'cat-knowledge':     '知識',
    'cat-development':   '開発',
    'cat-content':       '制作',
    // wiki file type group labels
    'ext-txt':           'テキスト',
    'ext-scripts':       'スクリプト',
    'ext-other':         'その他',
  },
  EN: {
    'all':               'All',
    'pending':           'Pending',
    'running':           'Running',
    'done':              'Done',
    'failed':            'Failed',
    'ignored':           'Ignored',
    'channels':          'Channels',
    'intensity':         'Intensity',
    'queue':             'Queue',
    'fact-checks':       'Fact Checks',
    'search-agents':     'Search agents…',
    'kpi-pending':       'Pending',
    'kpi-running':       'Running',
    'kpi-completed':     'Completed',
    'kpi-failed':        'Failed',
    'click-view':        'click to view',
    'stat-agents':       'Agents',
    'stat-running':      'Running',
    'stat-failed':       'Failed',
    'stat-enabled':      'Enabled',
    'stat-pending':      'Pending tasks',
    'analytics-chart':   'Token cost — last 7 days',
    'analytics-costs':   'Agent costs today',
    'analytics-priv':    'Privilege matrix',
    'analytics-agent':   'Agent',
    'analytics-tokens':  'Tokens',
    'analytics-cost':    'Cost (est.)',
    'wiki-pages-tab':    'Wiki pages',
    'wiki-files-tab':    'Raw files',
    'wiki-welcome':      'Select a page from the wiki',
    'wiki-selected':     ' selected',
    'wiki-search':       'Search…',
    'docs-welcome':      'Select a document from the tree',
    'inbox-sub':         'Items queued for local action',
    'src-sources':       'Sources',
    'src-blocked':       'Blocked',
    'src-followups':     'Follow-ups',
    'src-merges':        'Merges',
    'src-vaults':        'Vaults',
    'src-bases':         'Bases',
    'ch-routing':        'Routing',
    'ch-server':         'Server channels',
    'ch-new-folder':     '+ New folder',
    'ch-new-channel':    '+ New channel',
    'ch-add-tag':        '+ Add tag',
    'set-save':          'Save',
    'set-cancel':        'Cancel',
    'empty-tasks':       'No tasks.',
    'empty-inbox':       'No pending items — orchestrator is unblocked.',
    'empty-items':       'No items.',
    'empty-factchecks':  'No fact-check runs yet.',
    'empty-sources':     'No sources yet.',
    'empty-followups':   'No pending follow-ups.',
    'empty-channels':    'No channels found.',
    'wiki-no-pages':     'No pages found.',
    'wiki-no-files':     'No files found.',
    'wiki-pages-label':  'pages',
    'wiki-cats-label':   'categories',
    'wiki-recent-label': 'Recent',
    'wiki-files-label':  'files',
    'wiki-types-label':  'types',
    'wiki-results-label':'result(s)',
    'src-from':          'from',
    'empty-blocked':     'No blocked sources.',
    'empty-merges':      'No flagged duplicates.',
    'empty-vaults':      'No vaults registered.',
    'empty-bases':       'No saved bases.',
    'empty-cost':        'No data yet.',
    'empty-repos':       'No repositories found.',
    'lbl-description':   'Description',
    'lbl-model':         'Model',
    'lbl-level':         'Level',
    'lbl-status':        'Status',
    'lbl-enabled':       'ENABLED',
    'lbl-disabled':      'DISABLED',
    'lbl-disable':       'Disable',
    'lbl-enable':        'Enable',
    'lbl-next-run':      'Next Run',
    'lbl-token-budget':  'Token budget',
    'lbl-in-flows':      'In Flows',
    'lbl-tools':         'Tools',
    'lbl-last-task':     'Last task',
    'lbl-created':       'Created',
    'lbl-updated':       'Updated',
    'lbl-goal':          'Goal',
    'lbl-priority':      'Priority',
    'lbl-review':        'Review',
    'lbl-result':        'Result',
    'lbl-error':         'Error',
    'lbl-branch':        'Branch',
    'lbl-pr':            'PR',
    'act-cancel':        '✕ Cancel',
    'act-stop':          '⏹ Stop',
    'act-resume':        '↻ Resume',
    'act-run':           'Run',
    'act-queuing':       '…queuing',
    'act-queued':        '✓ queued',
    'act-research':      '🔬 Research',
    'act-merged':        '✓ Merged',
    'act-done':          '✓ Done',
    'act-ignore':        '✕ Ignore',
    'lbl-similar':       '% similar',
    // agent card chips
    'idle':              'idle',
    'cat-intelligence':  'Intelligence',
    'cat-knowledge':     'Knowledge',
    'cat-development':   'Development',
    'cat-content':       'Content',
    // wiki file type group labels
    'ext-txt':           'Text',
    'ext-scripts':       'Scripts',
    'ext-other':         'Other',
  },
};

function _applyI18n() {
  const t = _I18N[PROJECT_LANG] || _I18N.JP;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t[el.dataset.i18n];
    if (v !== undefined) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const v = t[el.dataset.i18nPh];
    if (v !== undefined) el.placeholder = v;
  });
}

function _syncLangUI() {
  for (const id of ['lang-select-s', 'lang-select-h']) {
    const sel = document.getElementById(id);
    if (sel) sel.value = PROJECT_LANG;
  }
  document.documentElement.lang = PROJECT_LANG === 'JP' ? 'ja' : 'en';
  _applyI18n();
  // Re-render dynamic content that embeds translated strings
  if (Object.keys(DETAIL_DATA).length) {
    _renderAgentStatsBox();
    _renderAgentGrid();
    _renderKpiRow();
  }
}

async function setProjectLanguage(value) {
  if (!value || value === PROJECT_LANG) return;
  const res = await fetch(apiUrl('/api/project/language'), {
    method: 'POST',
    headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: value }),
  }).catch(() => null);
  if (!res?.ok) { showToast('言語設定の更新に失敗しました', 'error'); return; }
  PROJECT_LANG = value;
  _syncLangUI();
  showToast('記事の言語を更新しました', 'success');
}

/* ═══════════════════════════════════════════════════════════
   AGENT DETAIL OVERLAY
══════════════════════════════════════════════════════════════ */
function openDetail(id) {
  const reg = REGISTRY.find(r => r.id === id), d = DETAIL_DATA[id]; if (!reg || !d) return;
  const pct = Math.min(100, Math.round(((d.tokensUsed||0)/(d.tokenLimit||1))*100));
  const bc = pct > 80 ? '#EF4444' : pct > 50 ? '#FBBF24' : reg.colors[0];
  const lc = LV_COLORS[d.level || 1];
  const myFlows = FLOWS.filter(f => f.agents.includes(id));
  const t = _I18N[PROJECT_LANG]||_I18N.JP;

  document.getElementById('detail-content').innerHTML = `
    <div class="p-header">
      <canvas id="detailCanvas" width="${DS*8}" height="${DS*8}" style="image-rendering:pixelated;flex-shrink:0"></canvas>
      <div>
        <div class="p-title">${esc(PROJECT_LANG==='JP'&&reg.nameJp?reg.nameJp:id.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))}</div>
        <div class="p-sub">${esc(d.category||'')} · ${esc(d.agentType||'')} · Lv.${d.level||1} ${LV_NAMES[d.level]||''}</div>
      </div>
    </div>
    <div class="p-section"><div class="p-label">${t['lbl-description']}</div><div class="p-value">${esc((PROJECT_LANG==='JP'&&reg.fullDescJp)||d.fullDesc||d.desc||'')}</div></div>
    <div class="p-row">
      <div class="p-stat"><div class="s-label">${t['lbl-model']}</div><div class="s-value" style="font-size:9px">${esc(d.model||reg.model||'')}</div></div>
      <div class="p-stat"><div class="s-label">${t['lbl-level']}</div><div class="s-value" style="color:${lc}">Lv.${d.level||1}</div></div>
      <div class="p-stat"><div class="s-label">${t['lbl-status']}</div><div class="s-value" style="color:${d.enabled!==false?'#34D399':'#EF4444'};font-size:9px">
        ${d.enabled!==false?t['lbl-enabled']:t['lbl-disabled']}
        <button class="act-btn ${d.enabled!==false?'cancel':'resume'}" onclick="toggleAgent('${id}',event)" style="font-size:9px;padding:2px 8px;margin-left:4px">${d.enabled!==false?t['lbl-disable']:t['lbl-enable']}</button>
      </div></div>
      <div class="p-stat"><div class="s-label">${t['lbl-next-run']}</div><div class="s-value" style="font-size:9px">${esc(nextRun(d.frequency||reg.frequency||''))}</div></div>
    </div>
    <div class="p-section">
      <div class="p-label">${t['lbl-token-budget']}</div>
      <div class="p-bar-wrap"><div class="p-bar-fill" style="width:${pct}%;background:${bc}"></div></div>
      <div style="font-size:10px;color:var(--m);margin-top:3px">
        ${d.tokensUsed>=1000?(d.tokensUsed/1000).toFixed(1)+'k':d.tokensUsed||0} / ${((d.tokenLimit||0)/1000).toFixed(0)}k (${pct}%)
        ${d.estimatedCost>0?` · ≈$${d.estimatedCost.toFixed(4)}`:'' }
      </div>
    </div>
    ${myFlows.length ? `<div class="p-section"><div class="p-label">${t['lbl-in-flows']}</div>${myFlows.map(f=>`<div style="font-size:9px;margin-top:4px;color:${f.color}">${esc(f.name)}: ${f.agents.map(a=>{const r=REGISTRY.find(x=>x.id===a);return a===id?`<b>[${esc(r?.name||a)}]</b>`:`<span style="color:var(--m)">${esc(r?.name||a)}</span>`;}).join(' → ')}</div>`).join('')}</div>` : ''}
    ${(d.tools||reg.tools||[]).length ? `<div class="p-section"><div class="p-label">${t['lbl-tools']}</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${(d.tools||reg.tools||[]).map(tl=>`<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--accent-bg);color:var(--acc)">${esc(tl)}</span>`).join('')}</div></div>` : ''}
    ${d.task ? `<div class="p-task" style="margin-top:12px"><div class="t-label">${t['lbl-last-task']}</div><div class="t-value">[${(d.task.status||'').toUpperCase()}] ${esc(d.task.goal||'—')}</div><div class="t-value" style="margin-top:3px;color:var(--m)">${t['lbl-created']}: ${fmtDate(d.task.createdAt)} · ${t['lbl-updated']}: ${fmtDate(d.task.updatedAt)}</div>${d.task.error?`<div style="color:var(--error);font-size:10px;margin-top:4px">${esc(d.task.error.substring(0,150))}</div>`:''}</div>` : ''}
  `;

  // Draw avatar
  const dc = document.getElementById('detailCanvas');
  if (dc) drawGrid(dc.getContext('2d'), AVATARS[reg.avatar], cmap(reg.colors), false, DS);

  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  document.getElementById('detail-panel')?.classList.remove('panel-wide');
}
function closeDetailIfBg(e) { if (e.target === document.getElementById('detail-overlay')) closeDetail(); }

/* ═══════════════════════════════════════════════════════════
   TASK MODALS
══════════════════════════════════════════════════════════════ */
let _taskModal = null;

function openTaskModal(status) {
  const tasks = ALL_BY_STATUS[status] || [];
  // Reuse detail overlay
  const title = `${status.charAt(0).toUpperCase()+status.slice(1)} Tasks (${tasks.length})`;
  document.getElementById('detail-content').innerHTML = `
    <div class="p-title">${esc(title)}</div>
    <div style="margin-top:14px">
      ${tasks.length ? tasks.map(t => `<div class="tl-item" ${t.id ? `role="button" tabindex="0" aria-label="タスクの詳細を開く" onclick="openTaskDetail('${t.id}')" style="cursor:pointer"`:''}>
        <div class="feed-dot ${t.status}" style="margin-top:4px;flex-shrink:0"></div>
        <div class="tl-body">
          <div class="tl-goal">${esc(t.goal)}</div>
          <div class="tl-meta"><span class="tl-type">${esc((t.type||'').replace(/_/g,' '))}</span> · ${fmtDate(t.createdAt)}</div>
          ${t.error ? `<div style="color:var(--error);font-size:10px">${esc(t.error.substring(0,80))}</div>` : ''}
        </div>
        ${status==='pending'&&t.id?`<button class="act-btn cancel" aria-label="中止" title="中止" onclick="doTaskAction('${t.id}','cancel',this)"><i class="ni ni-close" aria-hidden="true"></i></button>`:''}
        ${status==='running'&&t.id?`<button class="act-btn stop" onclick="doTaskAction('${t.id}','stop',this)">⏹</button>`:''}
        ${(status==='failed'||status==='cancelled')&&t.id?`<button class="act-btn resume" onclick="doTaskAction('${t.id}','resume',this)">↻</button>`:''}
      </div>`).join('') : `<div style="color:var(--m);font-size:11px;padding:8px">${(_I18N[PROJECT_LANG]||_I18N.JP)['empty-tasks']}</div>`}
    </div>`;
  document.getElementById('detail-overlay').classList.add('open');
}

function openTaskDetail(taskId) {
  const all = [...(TASK_STATS.recent||[]), ...(TASK_STATS.upcoming||[]), ...Object.values(ALL_BY_STATUS).flat()];
  const t = all.find(x => x.id === taskId); if (!t) return;
  const colors = { completed:'#34D399', running:'#22D3EE', failed:'#EF4444', pending:'#64748B', cancelled:'#6B7280' };
  const i18n = _I18N[PROJECT_LANG]||_I18N.JP;
  document.getElementById('detail-content').innerHTML = `
    <div class="p-header">
      <div style="width:12px;height:12px;border-radius:50%;background:${colors[t.status]||'#64748B'};flex-shrink:0;margin-top:4px"></div>
      <div>
        <div class="p-title">${esc(t.status.toUpperCase())} — ${esc((t.type||'').replace(/_/g,' '))}</div>
        <div class="p-sub">${agentChip(t.type)} ${t.id ? t.id.substring(0,12) : ''}</div>
      </div>
    </div>
    <div class="p-section"><div class="p-label">${i18n['lbl-goal']}</div><div class="p-value">${esc(t.goal||'—')}</div></div>
    <div class="p-row">
      ${t.priority!=null?`<div class="p-stat"><div class="s-label">${i18n['lbl-priority']}</div><div class="s-value">P${t.priority}</div></div>`:''}
      ${t.createdAt?`<div class="p-stat"><div class="s-label">${i18n['lbl-created']}</div><div class="s-value" style="font-size:9px">${fmtDate(t.createdAt)}</div></div>`:''}
      ${t.updatedAt?`<div class="p-stat"><div class="s-label">${i18n['lbl-updated']}</div><div class="s-value" style="font-size:9px">${fmtDate(t.updatedAt)}</div></div>`:''}
      ${t.reviewScore!=null?`<div class="p-stat"><div class="s-label">${i18n['lbl-review']}</div><div class="s-value" style="color:var(--grn)">${t.reviewScore}/10</div></div>`:''}
    </div>
    ${t.result?`<div class="p-section"><div class="p-label">${i18n['lbl-result']}</div><div class="p-value" style="white-space:pre-wrap;font-size:11px">${esc(t.result.substring(0,500))}</div></div>`:''}
    ${t.error?`<div class="p-section"><div class="p-label" style="color:var(--error)">${i18n['lbl-error']}</div><div class="p-value" style="color:var(--error)">${esc(t.error)}</div></div>`:''}
    ${t.branch?`<div class="p-section"><div class="p-label">${i18n['lbl-branch']}</div><div class="p-value" style="font-family:monospace">${esc(t.branch)}</div></div>`:''}
    ${t.prUrl?`<div class="p-section"><div class="p-label">${i18n['lbl-pr']}</div><div class="p-value"><a href="${esc(t.prUrl)}" target="_blank" rel="noopener" style="color:var(--acc)">${esc(t.prUrl)}</a></div></div>`:''}
    <div style="display:flex;gap:8px;margin-top:16px">
      ${t.status==='pending'?`<button class="act-btn cancel" aria-label="中止" title="中止" onclick="doTaskAction('${t.id}','cancel',this)">${i18n['act-cancel']}</button>`:''}
      ${t.status==='running'?`<button class="act-btn stop" onclick="doTaskAction('${t.id}','stop',this)">${i18n['act-stop']}</button>`:''}
      ${(t.status==='failed'||t.status==='cancelled')?`<button class="act-btn resume" onclick="doTaskAction('${t.id}','resume',this)">${i18n['act-resume']}</button>`:''}
    </div>`;
  document.getElementById('detail-overlay').classList.add('open');
}

/* ═══════════════════════════════════════════════════════════
   ACTION HANDLERS
══════════════════════════════════════════════════════════════ */
async function doTaskAction(taskId, action, btn) {
  btn.disabled = true; const orig = btn.textContent; btn.textContent = '…';
  try {
    const r = await fetch(apiUrl(`/api/tasks/${taskId}/action`), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({action})
    });
    const j = await r.json();
    if (j.ok) { btn.textContent = '✓'; btn.style.color = '#34D399'; setTimeout(() => loadDashboard(), 800); }
    else { btn.textContent = j.error || 'ERR'; btn.style.color = 'var(--error)'; setTimeout(()=>{ btn.textContent=orig; btn.style.color=''; btn.disabled=false; }, 2000); }
  } catch { btn.textContent = 'ERR'; btn.style.color = 'var(--error)'; setTimeout(()=>{ btn.textContent=orig; btn.style.color=''; btn.disabled=false; }, 2000); }
}

async function toggleAgent(agentId, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const d = DETAIL_DATA[agentId]; const current = d ? d.enabled !== false : true;
  if (e && e.target) e.target.disabled = true;
  await fetch(apiUrl(`/api/agents/${agentId}/settings`), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ enabled: !current })
  }).catch(()=>{});
  loadDashboard();
}

async function toggleSource(id, enabled) {
  const row = document.querySelector(`.src-row[data-id="${id}"]`);
  const dot = row?.querySelector('.src-toggle');
  if (dot) { dot.classList.toggle('on', enabled); dot.classList.toggle('off', !enabled); }
  await fetch(apiUrl(`/api/sources/${id}`), {
    method:'PATCH', headers:{..._authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ enabled })
  }).catch(()=>{});
}

function blockSource(id) {
  const row = document.querySelector(`.src-row[data-id="${id}"]`);
  showConfirm('このソースをブロックしますか？', async () => {
    if (row) row.style.opacity = '0.3';
    await fetch(apiUrl(`/api/sources/${id}/block`), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ reason: 'manually blocked' })
    }).catch(()=>{});
    showToast('ソースをブロックしました。', 'success');
    loadDashboard();
  }, row);
}

function unblockSource(id) {
  const row = document.querySelector(`.src-row[data-id="${id}"]`);
  showConfirm('このソースのブロックを解除しますか？', async () => {
    await fetch(apiUrl(`/api/sources/${id}/unblock`), { method:'POST', headers:_authHeaders() }).catch(()=>{});
    showToast('ソースのブロックを解除しました。', 'success');
    loadDashboard();
  }, row);
}

async function inboxDone(id) {
  const row = document.querySelector(`[data-id="${id}"]`); if (row) row.style.opacity = '0.3';
  await fetch(apiUrl(`/api/inbox/${id}/done`), { method:'POST', headers:_authHeaders() }).catch(()=>{});
  row?.remove();
}

function inboxIgnore(id) {
  const row = document.querySelector(`[data-id="${id}"]`);
  showConfirm('解決せずに閉じますか？', async () => {
    if (row) row.style.opacity = '0.3';
    await fetch(apiUrl(`/api/inbox/${id}/ignore`), { method:'POST', headers:_authHeaders() }).catch(()=>{});
    row?.remove();
  }, row);
}

function markMerged(id) {
  const row = document.querySelector(`[data-merge-id="${id}"]`);
  showConfirm('マージ済みとしてマークしますか？', async () => {
    const res = await fetch(apiUrl(`/api/merges/${encodeURIComponent(id)}/mark-merged`), { method:'POST', headers:_authHeaders() });
    if (res.ok) row?.remove();
  }, row);
}

function dismissMerge(id) {
  const row = document.querySelector(`[data-merge-id="${id}"]`);
  showConfirm('この提案を無視しますか？', async () => {
    const res = await fetch(apiUrl(`/api/merges/${encodeURIComponent(id)}/dismiss`), { method:'POST', headers:_authHeaders() });
    if (res.ok) row?.remove();
  }, row);
}

async function researchFollowup(pageSlug, question, btn) {
  btn.disabled = true; btn.textContent = '…';
  const res = await fetch(apiUrl('/api/wiki/followup'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ pageSlug, question, mode:'queue' })
  });
  if (res.ok) { btn.textContent = '✓ Queued'; btn.closest('div').parentElement?.style.setProperty('opacity','0.4'); }
  else { btn.disabled = false; btn.textContent = '🔬 Research'; }
}

async function dismissFollowup(pageSlug, question, btn) {
  btn.disabled = true; btn.textContent = '…';
  const res = await fetch(apiUrl('/api/wiki/followup'), {
    method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ pageSlug, question, mode:'dismiss' })
  });
  if (res.ok) btn.closest('div').parentElement?.remove();
  else { btn.disabled = false; btn.textContent = '✕'; }
}

function deleteVault(id) {
  const row = document.querySelector(`[data-vault-id="${id}"]`);
  showConfirm(`ヴォールト「${id}」を削除しますか？GitHubリポジトリは削除されません。`, async () => {
    const res = await fetch(apiUrl(`/api/vaults/${encodeURIComponent(id)}`), { method:'DELETE', headers:_authHeaders() });
    if (res.ok) row?.remove();
    else showToast('Delete failed: ' + res.status, 'error');
  }, row);
}

async function runBase(id) {
  const resEl = document.getElementById('baseResult-' + id); if (resEl) { resEl.style.display = 'block'; resEl.textContent = 'Running…'; }
  const res = await fetch(apiUrl(`/api/bases/${encodeURIComponent(id)}/run`), { method:'POST', headers:_authHeaders() }).catch(()=>null);
  if (!resEl) return;
  if (!res || !res.ok) { resEl.textContent = 'Run failed: ' + (res?.status || 'error'); return; }
  const data = await res.json().catch(()=>({}));
  resEl.textContent = JSON.stringify(data, null, 2);
}

function deleteBase(id) {
  const row = document.querySelector(`[data-base-slug="${id}"]`);
  showConfirm(`ベース「${id}」を削除しますか？`, async () => {
    const res = await fetch(apiUrl(`/api/bases/${encodeURIComponent(id)}`), { method:'DELETE', headers:_authHeaders() });
    if (res.ok) row?.remove();
    else showToast('Delete failed: ' + res.status, 'error');
  }, row);
}

/* ═══════════════════════════════════════════════════════════
   BADGES (nav + mobile)
══════════════════════════════════════════════════════════════ */
function _renderBadges() {
  const pendingCount = (TASK_STATS.upcoming || []).length;
  const inboxCount = (window._inboxData?.pending || []).length;

  ['tasks-badge','mob-tasks-badge'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = pendingCount || '';
    el.style.display = pendingCount > 0 ? '' : 'none';
  });
  ['inbox-badge','mob-inbox-badge'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = inboxCount || '';
    el.style.display = inboxCount > 0 ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS CHARTS (canvas)
══════════════════════════════════════════════════════════════ */
let _chartMode = 'bar', _chartInited = false;
const _CD = { days:[], linesOn:{total:true,done:true,failed:true,flash:true,pro:true,cost:true}, hoverDay:null, maxV:1, costMax:0.01, flashFrac:.5, PL:32, PR:42, PT:14, PB:38, H:215, W:0 };
const _LINES = [
  {key:'total', color:'#60A5FA',width:2,   fill:true,  dash:null, dk:'total'},
  {key:'done',  color:'#34D399',width:1.5, fill:false, dash:null, dk:'completed'},
  {key:'failed',color:'#EF4444',width:1.5, fill:false, dash:null, dk:'failed'},
  {key:'flash', color:'#22D3EE',width:1,   fill:false, dash:[4,3],dk:'flash'},
  {key:'pro',   color:'#A78BFA',width:1,   fill:false, dash:[4,3],dk:'pro'},
  {key:'cost',  color:'#FBBF24',width:1.5, fill:false, dash:null, dk:'cost', axis:'right'},
];

function _initCharts() {
  if (!document.getElementById('cost-chart')) return;
  _buildDays();
  drawCostChart();
}

async function _loadAnalytics() {
  try {
    const res = await fetch(apiUrl('/api/analytics'), { headers: _authHeaders() });
    if (!res.ok) return;
    const d = await res.json();

    // KPIs
    const today = d.today || new Date().toISOString().split('T')[0];
    const todayTasks = (d.byDay?.[today]?.total) ?? 0;
    const todayFail  = (d.byDay?.[today]?.failed) ?? 0;
    const newsTotal  = (d.newsHistory || []).reduce((s, n) => s + n.count, 0);
    _setText('kpi-tasks-today', todayTasks);
    _setText('kpi-tasks-fail', todayFail > 0 ? `${todayFail} 件失敗` : '');
    _setText('kpi-queue', TASK_STATS?.byStatus ? ((TASK_STATS.byStatus.pending||0) + (TASK_STATS.byStatus.running||0)) : '—');
    _setText('kpi-cost-today', `$${(COST_BY_DAY[d.today] || 0).toFixed(4)}`);
    _setText('kpi-news', newsTotal);

    // Task activity chart
    _drawTaskChart(d.byDay || {});

    // Task type breakdown
    const typeList = document.getElementById('task-type-list');
    if (typeList) {
      const entries = Object.entries(d.byType || {}).sort((a,b) => b[1]-a[1]).slice(0, 12);
      const max = Math.max(1, ...entries.map(([,v]) => v));
      typeList.innerHTML = entries.map(([type, cnt]) => {
        const pct = Math.round(cnt/max*100);
        return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
          <span style="font-size:10px;color:var(--m);width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(type)}</span>
          <div style="flex:1;background:var(--div);border-radius:3px;height:6px"><div style="width:${pct}%;height:6px;border-radius:3px;background:var(--acc)"></div></div>
          <span style="font-size:10px;color:var(--txt);min-width:24px;text-align:right">${cnt}</span>
        </div>`;
      }).join('') || '<div style="font-size:11px;color:var(--m)">データなし</div>';
    }

    // Mail run log
    const mailLog = document.getElementById('mail-run-log');
    if (mailLog) {
      if (!d.mailRuns?.length) {
        mailLog.innerHTML = '<div style="font-size:11px;color:var(--m)">メールタスク実行記録なし</div>';
      } else {
        mailLog.innerHTML = d.mailRuns.slice(0, 8).map(r => {
          const dt = new Date(r.date).toLocaleString('ja-JP', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
          const ok = r.status === 'completed';
          const badge = ok
            ? '<span style="color:#4caf50;font-size:9px;font-weight:700">●</span>'
            : '<span style="color:var(--red);font-size:9px;font-weight:700">●</span>';
          const msg = ok ? (r.result || 'OK').slice(0, 60) : (r.error || 'failed').slice(0, 60);
          return `<div style="display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid var(--div)">
            <div style="padding-top:2px">${badge}</div>
            <div><div style="font-size:10px;color:var(--m)">${dt}</div><div style="font-size:11px;color:var(--txt);line-height:1.4">${esc(msg)}</div></div>
          </div>`;
        }).join('');
      }
    }
  } catch { /* silent */ }
}

function _setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function _drawTaskChart(byDay) {
  const canvas = document.getElementById('task-chart'); if (!canvas) return;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i*86400000);
    const key = d.toISOString().split('T')[0];
    const label = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
    days.push({ key, label, completed: byDay[key]?.completed||0, failed: byDay[key]?.failed||0, total: byDay[key]?.total||0 });
  }
  const dpr = window.devicePixelRatio||1;
  const par = canvas.parentElement;
  const W = par ? par.clientWidth - 28 : 300, H = 140, PL=32, PR=8, PT=8, PB=28;
  canvas.width = W*dpr; canvas.height = H*dpr; canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const CT = _chartTheme();
  ctx.fillStyle = CT.bg; ctx.fillRect(0,0,W,H);
  const CW = W-PL-PR, CH = H-PT-PB;
  const n = days.length, gap = CW/n, barW = Math.max(4, gap*.6);
  const maxV = Math.max(1, ...days.map(d=>d.total));
  days.forEach((d, i) => {
    const x = PL + i*gap + gap/2 - barW/2;
    const bh = (d.total/maxV)*CH;
    ctx.fillStyle = '#34D39966'; ctx.fillRect(x, PT+CH-bh, barW, bh);
    const fh = (d.failed/maxV)*CH;
    if (fh>0) { ctx.fillStyle = '#EF444466'; ctx.fillRect(x, PT+CH-fh, barW, fh); }
    ctx.fillStyle = CT.label; ctx.font = '9px Courier New'; ctx.textAlign='center';
    ctx.fillText(d.label, x+barW/2, H-PB+13);
    if (d.total>0) { ctx.fillStyle=CT.axis; ctx.font='8px Courier New'; ctx.fillText(d.total, x+barW/2, PT+CH-bh-2); }
  });
  [0,.5,1].forEach(r => {
    const y = PT+CH*(1-r); ctx.fillStyle=CT.label; ctx.font='8px Courier New'; ctx.textAlign='right';
    ctx.fillText(Math.round(maxV*r), PL-3, y+3);
    ctx.strokeStyle=CT.grid; ctx.lineWidth=.5; ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
  });
}

function _buildDays() {
  let ft = 0, pt = 0;
  for (const [type, cnt] of Object.entries(TASK_STATS.byType || {})) {
    if (TASK_MODEL_MAP[type] === 'flash') ft += cnt; else pt += cnt;
  }
  _CD.flashFrac = (ft+pt) > 0 ? ft/(ft+pt) : .5;
  _CD.days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i*86400000);
    const key = d.toISOString().split('T')[0];
    const label = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
    const co = TASK_STATS.byDay?.[key]?.completed||0, fa = TASK_STATS.byDay?.[key]?.failed||0, tot = co+fa;
    const cost = COST_BY_DAY?.[key] || 0;
    _CD.days.push({key,label,completed:co,failed:fa,total:tot,flash:Math.round(tot*_CD.flashFrac),pro:Math.round(tot*(1-_CD.flashFrac)),cost});
  }
  _CD.maxV = Math.max(1,..._CD.days.map(d=>d.total));
  _CD.costMax = Math.max(0.01,..._CD.days.map(d=>d.cost));
}

function _chartTheme() {
  const cs = getComputedStyle(document.documentElement), g = v => cs.getPropertyValue(v).trim();
  return { bg:g('--bg')||'#e7eaf1', grid:g('--div')||'#ccd3e0', axis:g('--m')||'#5c6478', label:g('--m2')||'#717b92', txt:g('--txt')||'#2b3350', warn:g('--yel')||'#f59e0b' };
}

function setCostTab(el, mode) {
  _chartMode = mode;
  document.querySelectorAll('.chart-tab[data-ctab]').forEach(t => t.classList.toggle('active', t === el));
  const lt = document.getElementById('line-toggles'); if (lt) lt.classList.toggle('hidden', mode !== 'line');
  if (mode === 'bar') drawCostChart();
  else if (mode === 'line') drawLineChart(null, null, null);
}

function drawCostChart() {
  const lc = document.getElementById('cost-chart'); if (!lc) return;
  const dpr = window.devicePixelRatio||1, par = lc.parentElement;
  const W = par ? par.clientWidth - 28 : 500, H = 160, PL=40, PR=12, PT=10, PB=30;
  lc.width = W*dpr; lc.height = H*dpr; lc.style.width = W+'px'; lc.style.height = H+'px';
  const ctx = lc.getContext('2d'); ctx.scale(dpr, dpr);
  const CT = _chartTheme();
  ctx.fillStyle = CT.bg; ctx.fillRect(0,0,W,H);
  const CW = W-PL-PR, CH = H-PT-PB;
  const days = _CD.days, n = days.length, barW = Math.max(4, CW/n*.6), gap = CW/n;
  const maxV = Math.max(1, ...days.map(d => d.total));
  days.forEach((d, i) => {
    const x = PL + i*gap + gap/2 - barW/2, bh = (d.total/maxV)*CH;
    ctx.fillStyle = '#60A5FA66'; ctx.fillRect(x, PT+CH-bh, barW, bh);
    const fh = (d.failed/maxV)*CH;
    if (fh > 0) { ctx.fillStyle = '#EF444466'; ctx.fillRect(x, PT+CH-fh, barW, fh); }
    const isH = d.key === _CD.hoverDay;
    ctx.fillStyle = isH ? CT.txt : CT.label; ctx.font = (isH ? 'bold ' : '') + '9px Courier New';
    ctx.textAlign = 'center'; ctx.fillText(d.label, x+barW/2, H-PB+13);
    if (d.total > 0) { ctx.fillStyle = CT.axis; ctx.font = '8px Courier New'; ctx.fillText(d.total, x+barW/2, PT+CH-bh-2); }
  });
  // Left axis
  [0,.5,1].forEach(r => {
    const y = PT+CH*(1-r); ctx.fillStyle = CT.label; ctx.font = '8px Courier New'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxV*r), PL-3, y+3);
    ctx.strokeStyle = CT.grid; ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
  });
}

function drawLineChart(hoverDay, cxX, hovLine) {
  const lc = document.getElementById('cost-chart'); if (!lc) return;
  const dpr = window.devicePixelRatio||1, par = lc.parentElement;
  const W = par ? par.clientWidth-28 : 500, H = _CD.H; _CD.W = W;
  lc.width = W*dpr; lc.height = H*dpr; lc.style.width = W+'px'; lc.style.height = H+'px';
  const ctx = lc.getContext('2d'); ctx.scale(dpr, dpr);
  const {PL,PR,PT,PB} = _CD, CW = W-PL-PR, CH = H-PT-PB, maxV = _CD.maxV;
  const CT = _chartTheme();
  ctx.fillStyle = CT.bg; ctx.fillRect(0,0,W,H);
  const hdi = hoverDay ? _CD.days.findIndex(d=>d.key===hoverDay) : -1;
  if (hdi >= 0) { ctx.fillStyle='rgba(128,128,128,.07)'; ctx.fillRect(PL+hdi*(CW/6)-CW/12,PT,CW/6,CH); }
  [0,.25,.5,.75,1].forEach(r => {
    const y = PT+CH*(1-r);
    ctx.strokeStyle = CT.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
    if (r > 0) { ctx.fillStyle = CT.axis; ctx.font = '9px Courier New'; ctx.textAlign = 'right'; ctx.fillText(Math.round(maxV*r), PL-3, y+3); }
  });
  _CD.days.forEach((d,i) => {
    const x = PL+i*(CW/6), isH = d.key === hoverDay;
    ctx.fillStyle = isH ? CT.txt : CT.label; ctx.font = (isH?'bold ':'')+'10px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(d.label, x, H-PB+12);
  });
  _LINES.forEach(ls => {
    if (!_CD.linesOn[ls.key]) return;
    const scale = ls.axis === 'right' ? _CD.costMax : maxV; if (scale <= 0) return;
    const isHov = ls.key === hovLine;
    const pts = _CD.days.map((d,i) => ({x:PL+i*(CW/6), y:PT+CH*(1-(d[ls.dk]||0)/scale)}));
    ctx.strokeStyle = ls.color; ctx.lineWidth = isHov ? ls.width*2.5 : ls.width;
    ctx.globalAlpha = (hovLine && !isHov) ? .4 : 1;
    if (ls.dash) ctx.setLineDash(ls.dash); else ctx.setLineDash([]);
    ctx.beginPath();
    pts.forEach((p,i) => { if (i===0) ctx.moveTo(p.x,p.y); else { const prev=pts[i-1],mx=(prev.x+p.x)/2; ctx.bezierCurveTo(mx,prev.y,mx,p.y,p.x,p.y); } });
    ctx.stroke(); ctx.setLineDash([]);
    pts.forEach(p => { ctx.fillStyle=ls.color; ctx.beginPath(); ctx.arc(p.x,p.y,isHov?3.5:2.5,0,Math.PI*2); ctx.fill(); });
    ctx.globalAlpha = 1;
  });
}

window.addEventListener('themechange', () => { if (_chartMode==='bar') drawCostChart(); else drawLineChart(null,null,null); });

/* ═══════════════════════════════════════════════════════════
   DOCS VIEWER
══════════════════════════════════════════════════════════════ */
let _docsInited = false, _activeDoc = null;

function _renderDocsTree(sections) {
  const el = document.getElementById('docs-tree'); if (!el) return;
  if (!sections || !sections.length) { el.innerHTML = '<div class="docs-welcome" style="font-size:11px">No docs configured.</div>'; return; }
  el.innerHTML = sections.map(sec => `
    <div class="docs-section">
      <div class="docs-section-label">${esc(sec.label || 'General')}</div>
      ${(sec.docs || []).map(d => `<button class="docs-tree-item" data-doc-slug="${esc(d.slug||'')}" onclick="loadDoc(this,'${esc(d.slug||'')}','${esc(d.title||d.slug||'')}')">${esc(d.title||d.slug||'')}</button>`).join('')}
    </div>`).join('');
}

async function _initDocsIfNeeded() {
  if (_docsInited || !API_BASE) return;
  _docsInited = true;
  const el = document.getElementById('docs-tree');
  if (el) el.innerHTML = '<div class="docs-welcome" style="font-size:11px">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl('/api/docs/list'), { headers: _authHeaders() });
    if (res.status === 401) { _handleUnauthorized(); return; }
    const data = await res.json();
    _renderDocsTree(data.sections || []);
  } catch (e) {
    if (el) el.innerHTML = `<div class="docs-welcome" style="font-size:11px;color:var(--error)">Failed to load docs</div>`;
  }
}

async function loadDoc(btn, path, label) {
  if (!path) return;
  document.querySelectorAll('.docs-tree-item').forEach(b => b.classList.toggle('active', b === btn));
  const reader = document.getElementById('docs-reader');
  reader.innerHTML = '<div class="docs-loading">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl(`/api/docs/file?slug=${encodeURIComponent(path)}`), { headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    reader.innerHTML = `<div class="docs-content"><h1>${esc(label)}</h1>${_markdownToHtml(data.content || '')}</div>`;
    if (window.mermaid) {
      const nodes = reader.querySelectorAll('.mermaid');
      if (nodes.length) mermaid.run({ nodes }).catch(() => {});
    }
  } catch (e) {
    reader.innerHTML = `<div class="docs-welcome" style="color:var(--error)">Failed to load: ${esc(e.message)}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   WIKI VIEWER
══════════════════════════════════════════════════════════════ */
let _wikiInited = false, _wikiPages = [], _wikiFiles = [], _wikiQuery = '';
let _wikiTab = 'pages'; // 'pages' | 'files'
let _wikiSelectMode = false, _wikiSelected = new Set();

async function _initWikiIfNeeded() {
  if (_wikiInited || !API_BASE) return;
  _wikiInited = true;
  const treeEl = document.getElementById('wiki-tree');
  if (treeEl) treeEl.innerHTML = '<div class="docs-welcome" style="font-size:11px">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl('/api/wiki/pages'), { headers: _authHeaders() });
    if (res.status === 401) { _handleUnauthorized(); return; }
    const data = await res.json();
    _wikiPages = data.pages || [];
    _renderWikiTree(_wikiPages);
  } catch (e) {
    if (treeEl) treeEl.innerHTML = `<div class="docs-welcome" style="font-size:11px;color:var(--error)">Failed to load wiki</div>`;
  }
}

async function _loadWikiFiles() {
  const treeEl = document.getElementById('wiki-tree'); if (!treeEl) return;
  if (_wikiFiles.length) { _renderWikiFiles(_wikiFiles); return; }
  treeEl.innerHTML = '<div class="docs-welcome" style="font-size:11px">Loading files…</div>';
  try {
    const res = await fetch(apiUrl('/api/wiki/files'), { headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    _wikiFiles = data.files || [];
    _renderWikiFiles(_wikiFiles);
  } catch (e) {
    treeEl.innerHTML = `<div class="docs-welcome" style="font-size:11px;color:var(--error)">Failed to load files: ${esc(e.message)}</div>`;
  }
}

function setWikiTab(tab) {
  _wikiTab = tab;
  _wikiQuery = '';
  const searchEl = document.getElementById('wiki-search');
  if (searchEl) searchEl.value = '';
  document.getElementById('wiki-tab-pages')?.classList.toggle('active', tab === 'pages');
  document.getElementById('wiki-tab-files')?.classList.toggle('active', tab === 'files');
  if (tab === 'pages') _renderWikiTree(_wikiPages);
  else _loadWikiFiles();
}

function _wikiSearchInput(q) {
  _wikiQuery = (q || '').toLowerCase().trim();
  if (_wikiTab === 'pages') {
    _renderWikiTree(_wikiQuery
      ? _wikiPages.filter(p =>
          p.title.toLowerCase().includes(_wikiQuery) ||
          (p.category || '').toLowerCase().includes(_wikiQuery) ||
          (p.tags || []).some(t => t.toLowerCase().includes(_wikiQuery)))
      : _wikiPages);
  } else {
    _renderWikiFiles(_wikiQuery
      ? _wikiFiles.filter(f => f.path.toLowerCase().includes(_wikiQuery))
      : _wikiFiles);
  }
}

// keep old name working for any existing callers
function filterWikiPages(q) { _wikiSearchInput(q); }

function _wikiItemBtn(id, label, badge, isFile) {
  const selAttr = _wikiSelectMode ? `data-wiki-sel="${esc(id)}"` : '';
  const checked = _wikiSelected.has(id) ? 'checked' : '';
  const selBox = _wikiSelectMode
    ? `<input type="checkbox" class="wiki-sel-cb" ${checked} onclick="event.stopPropagation();_wikiToggleSel('${esc(id)}')">`
    : '';
  const clickFn = isFile
    ? `loadWikiFile(this,'${esc(id)}')`
    : `loadWikiPage(this,'${esc(id)}','${esc(label)}')`;
  return `<button class="wiki-flat-item${_wikiSelected.has(id)?' wiki-sel-active':''}" ${selAttr} onclick="${clickFn}">
    ${selBox}<span class="wiki-flat-title">${esc(label)}</span>${badge ? `<span class="wiki-cat-badge">${esc(badge)}</span>` : ''}
  </button>`;
}

function _wikiToggleSel(id) {
  if (_wikiSelected.has(id)) _wikiSelected.delete(id);
  else _wikiSelected.add(id);
  const countEl = document.getElementById('wiki-select-count');
  if (countEl) { const t=_I18N[PROJECT_LANG]||_I18N.JP; countEl.textContent = `${_wikiSelected.size}${t['wiki-selected']}`; }
  document.querySelectorAll(`[data-wiki-sel="${CSS.escape(id)}"]`).forEach(el => {
    el.classList.toggle('wiki-sel-active', _wikiSelected.has(id));
    const cb = el.querySelector('.wiki-sel-cb');
    if (cb) cb.checked = _wikiSelected.has(id);
  });
}

function toggleWikiSelect() {
  _wikiSelectMode = !_wikiSelectMode;
  if (!_wikiSelectMode) _wikiSelected.clear();
  const bar = document.getElementById('wiki-select-bar');
  if (bar) bar.style.display = _wikiSelectMode ? 'flex' : 'none';
  const fab = document.getElementById('wiki-fab');
  if (fab) { fab.textContent = _wikiSelectMode ? '✕' : '＋'; fab.title = _wikiSelectMode ? 'Cancel selection' : 'Select multiple files'; }
  const countEl = document.getElementById('wiki-select-count');
  if (countEl) { const t=_I18N[PROJECT_LANG]||_I18N.JP; countEl.textContent = `0${t['wiki-selected']}`; }
  if (_wikiTab === 'pages') _renderWikiTree(_wikiPages);
  else _renderWikiFiles(_wikiFiles);
}

function _renderWikiTree(pages) {
  const treeEl = document.getElementById('wiki-tree'); if (!treeEl) return;
  // Preserve fab button
  const fab = document.getElementById('wiki-fab');
  if (!pages.length) {
    treeEl.innerHTML = `<div class="docs-welcome" style="font-size:11px">${(_I18N[PROJECT_LANG]||_I18N.JP)['wiki-no-pages']}</div>`;
    if (fab) treeEl.appendChild(fab);
    return;
  }

  if (_wikiQuery) {
    treeEl.innerHTML = `<div class="wiki-count">${pages.length}${(_I18N[PROJECT_LANG]||_I18N.JP)['wiki-results-label']}</div>` +
      pages.map(p => _wikiItemBtn(p.slug, p.title, p.category, false)).join('');
  } else {
    const recent = pages.slice(0, 10);
    const groups = {};
    for (const p of pages) { const c = p.category||'General'; (groups[c]||(groups[c]=[])).push(p); }
    const catCount = Object.keys(groups).length;
    const _wt=_I18N[PROJECT_LANG]||_I18N.JP;
    treeEl.innerHTML =
      `<div class="wiki-count">${pages.length} ${_wt['wiki-pages-label']} · ${catCount} ${_wt['wiki-cats-label']}</div>` +
      `<div class="docs-section"><div class="docs-section-label">${_wt['wiki-recent-label']}</div>${recent.map(p=>_wikiItemBtn(p.slug,p.title,p.category,false)).join('')}</div>` +
      Object.entries(groups).map(([cat,ps])=>`<details class="wiki-cat-group">
        <summary class="docs-section-label wiki-cat-summary">${esc(cat)} <span class="wiki-cat-count">${ps.length}</span></summary>
        ${ps.map(p=>_wikiItemBtn(p.slug,p.title,'',false)).join('')}
      </details>`).join('');
  }
  if (fab) treeEl.appendChild(fab);
}

function _renderWikiFiles(files) {
  const treeEl = document.getElementById('wiki-tree'); if (!treeEl) return;
  const fab = document.getElementById('wiki-fab');
  if (!files.length) {
    treeEl.innerHTML = `<div class="docs-welcome" style="font-size:11px">${(_I18N[PROJECT_LANG]||_I18N.JP)['wiki-no-files']}</div>`;
    if (fab) treeEl.appendChild(fab);
    return;
  }
  // Group by ext type: md, json, other
  const _xt = _I18N[PROJECT_LANG] || _I18N.JP;
  const EXT_LABEL = { md:'Markdown', json:'JSON', txt:_xt['ext-txt'], yaml:'YAML', yml:'YAML', js:_xt['ext-scripts'], ts:_xt['ext-scripts'], py:'Python' };
  const groups = {};
  for (const f of files) {
    const grp = EXT_LABEL[f.ext] || (f.dir ? f.dir.split('/')[0] : _xt['ext-other']);
    (groups[grp]||(groups[grp]=[])).push(f);
  }
  const _wf=_I18N[PROJECT_LANG]||_I18N.JP;
  treeEl.innerHTML =
    `<div class="wiki-count">${files.length} ${_wf['wiki-files-label']} · ${Object.keys(groups).length} ${_wf['wiki-types-label']}</div>` +
    Object.entries(groups).map(([grp,fs])=>`<details class="wiki-cat-group" ${grp==='Markdown'?'open':''}>
      <summary class="docs-section-label wiki-cat-summary">${esc(grp)} <span class="wiki-cat-count">${fs.length}</span></summary>
      ${fs.map(f=>_wikiItemBtn(f.path, f.name, f.dir||'', true)).join('')}
    </details>`).join('');
  if (fab) treeEl.appendChild(fab);
}

async function loadWikiFile(btn, path) {
  if (!path) return;
  const reader = document.getElementById('wiki-reader');
  reader.innerHTML = '<div class="docs-loading">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl(`/api/wiki/pages/${encodeURIComponent(path)}`), { headers: _authHeaders() });
    if (!res.ok) {
      // Fallback: try raw GitHub URL
      reader.innerHTML = `<div class="docs-content"><p style="color:var(--m);font-size:12px">File: <code>${esc(path)}</code></p><p style="font-size:11px;color:var(--m2)">Raw preview not available for this file type.</p></div>`;
      return;
    }
    const data = await res.json();
    reader.innerHTML = `<div class="docs-content"><h1>${esc(data.title||path)}</h1>${_markdownToHtml(data.content||'')}</div>`;
    if (window.mermaid) {
      const nodes = reader.querySelectorAll('.mermaid');
      if (nodes.length) mermaid.run({ nodes }).catch(()=>{});
    }
  } catch (e) {
    reader.innerHTML = `<div class="docs-welcome" style="color:var(--error)">Failed to load: ${esc(e.message)}</div>`;
  }
}

async function loadWikiPage(btn, slug, title) {
  if (!slug) return;
  document.querySelectorAll('#wiki-tree .docs-tree-item').forEach(b => b.classList.toggle('active', b === btn));
  const reader = document.getElementById('wiki-reader');
  reader.innerHTML = '<div class="docs-loading">読み込み中…</div>';
  try {
    const res = await fetch(apiUrl(`/api/wiki/pages/${encodeURIComponent(slug)}`), { headers: _authHeaders() });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const tags = (data.tags || []).map(t => `<span class="wiki-tag">${esc(t)}</span>`).join('');
    const qs = (data.suggestedQuestions || []).map(q =>
      `<button class="wiki-q-btn" onclick="queueWikiFollowup('${esc(slug)}',this)" data-q="${esc(q)}" title="Queue as research task">${esc(q)}</button>`
    ).join('');
    const ghLink = data.wikiUrl ? `<a class="wiki-open-btn" href="${esc(data.wikiUrl)}" target="_blank" rel="noopener">↗ GitHub</a>` : '';
    const storeSlug = slug; const storeTitle = data.title || title; const storeContent = data.content || '';
    reader.innerHTML = `
      <div class="docs-content">
        <h1>${esc(data.title || title)}</h1>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          ${tags ? `<div class="wiki-tags" style="margin:0">${tags}</div>` : ''}
          ${ghLink}
          <button class="wiki-open-btn" onclick="showWikiPrompt('quiz','${esc(storeSlug)}','${esc(storeTitle)}')">クイズ</button>
          <button class="wiki-open-btn" onclick="showWikiPrompt('vocab','${esc(storeSlug)}','${esc(storeTitle)}')">単語</button>
        </div>
        ${_markdownToHtml(storeContent)}
        ${qs ? `<div style="margin-top:20px;border-top:1px solid var(--div);padding-top:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--m2);margin-bottom:6px">フォローアップ候補</div>${qs}</div>` : ''}
      </div>`;
    if (window.mermaid) {
      const nodes = reader.querySelectorAll('.mermaid');
      if (nodes.length) mermaid.run({ nodes }).catch(() => {});
    }
  } catch (e) {
    reader.innerHTML = `<div class="docs-welcome" style="color:var(--error)">Failed to load: ${esc(e.message)}</div>`;
  }
}

async function queueWikiFollowup(pageSlug, btn) {
  const q = btn.dataset.q;
  if (!q) return;
  btn.disabled = true; btn.textContent = (_I18N[PROJECT_LANG]||_I18N.JP)['act-queuing'];
  try {
    const res = await fetch(apiUrl('/api/wiki/followup'), {
      method: 'POST', headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSlug, question: q, mode: 'queue' }),
    });
    if (!res.ok) throw new Error(res.status);
    btn.textContent = (_I18N[PROJECT_LANG]||_I18N.JP)['act-queued'];
  } catch { btn.disabled = false; btn.textContent = q; }
}

function showWikiPrompt(type, slug, title) {
  const isQuiz = type === 'quiz';
  const prompt = isQuiz
    ? `You are an expert educator. Using the wiki page titled "${title}" (slug: ${slug}), create a quiz topic JSON for the hachi quiz app.

The format must match this schema:
{
  "id": "${slug}-quiz",
  "title": "${title}",
  "emoji": "💎",
  "slides": [
    { "title": "...", "bullets": ["...", "..."], "note": "..." }
  ],
  "quiz": [
    { "q": "Question?", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "..." }
  ]
}

Rules:
- 5–8 slides covering key concepts from the page
- 8–12 quiz questions, multiple choice, 4 options each
- answer is the index (0-3) of the correct option
- explanations should reference the source material
- Output only valid JSON, no markdown fencing`
    : `You are an expert educator. Using the wiki page titled "${title}" (slug: ${slug}), create vocabulary flashcard entries for the hachi vocab app.

The format must match this schema (array of entries):
[
  {
    "term": "Term or concept",
    "reading": "pronunciation or abbreviation (optional)",
    "definition": "Clear 1-2 sentence definition",
    "example": "Example sentence or use case",
    "tags": ["tag1", "tag2"]
  }
]

Rules:
- Extract 10–20 key terms, acronyms, or concepts from the page
- Definitions should be precise and self-contained
- Tags should reflect the category/domain (e.g. "finance", "AI", "market")
- Output only valid JSON array, no markdown fencing`;

  const existingModal = document.getElementById('wiki-prompt-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'wiki-prompt-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg);box-shadow:var(--sh-lg);border-radius:16px;width:min(640px,95vw);max-height:85vh;display:flex;flex-direction:column;padding:20px;gap:12px;position:relative">
      <div style="font-weight:700;font-size:14px;color:var(--txt)">${isQuiz ? '✏️ クイズプロンプト' : '📖 ボキャブラリープロンプト'} — ${esc(title)}</div>
      <div style="font-size:11px;color:var(--m)">このプロンプトをコピーして Gemini CLI または Claude Code で実行してください。</div>
      <textarea id="wiki-prompt-text" style="flex:1;min-height:280px;background:var(--bg);box-shadow:var(--sh-in);border:none;border-radius:10px;padding:12px;font-size:11px;font-family:'SF Mono','Monaco',monospace;color:var(--txt);resize:vertical;line-height:1.5" readonly>${prompt}</textarea>
      <div style="display:flex;gap:8px">
        <button class="save-btn" onclick="navigator.clipboard.writeText(document.getElementById('wiki-prompt-text').value).then(()=>{this.textContent='コピーしました';setTimeout(()=>{this.textContent='コピー'},1500)})">コピー</button>
        <button class="refresh-btn" onclick="document.getElementById('wiki-prompt-modal').remove()">閉じる</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function showWikiMultiPrompt(type) {
  if (!_wikiSelected.size) { alert('Select at least one page first.'); return; }
  const isQuiz = type === 'quiz';
  const items = [..._wikiSelected];
  const pages = _wikiTab === 'pages'
    ? items.map(id => { const p = _wikiPages.find(x => x.slug===id); return p ? `"${p.title}" (slug: ${id})` : id; })
    : items.map(id => `file: ${id}`);
  const pageList = pages.map((p,i) => `${i+1}. ${p}`).join('\n');
  const ids = items.join(', ');

  const prompt = isQuiz
    ? `You are an expert educator. Using the following wiki pages, create a combined quiz topic JSON for the hachi quiz app.

Pages to cover:
${pageList}

The format must match this schema:
{
  "id": "combined-quiz",
  "title": "Combined Quiz",
  "emoji": "🧠",
  "slides": [
    { "title": "...", "bullets": ["...", "..."], "note": "..." }
  ],
  "quiz": [
    { "q": "Question?", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "..." }
  ]
}

Rules:
- 2–4 slides per source page covering key concepts
- 3–6 quiz questions per source page, multiple choice, 4 options each
- Mix questions across all pages for an integrated quiz
- answer is the index (0-3) of the correct option
- Include page title as a tag or note in each question's explanation
- Output only valid JSON, no markdown fencing`
    : `You are an expert educator. Using the following wiki pages, create vocabulary flashcard entries for the hachi vocab app.

Pages to cover:
${pageList}

The format must match this schema (array of entries):
[
  {
    "term": "Term or concept",
    "definition": "Clear 1-2 sentence definition",
    "example": "Example sentence or use case",
    "tags": ["tag1", "tag2", "source-page-slug"]
  }
]

Rules:
- Extract 5–15 key terms per source page
- Include the source page slug in the tags array so terms can be filtered by origin
- Definitions should be precise and self-contained
- Output only valid JSON array, no markdown fencing`;

  const existingModal = document.getElementById('wiki-prompt-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'wiki-prompt-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg);box-shadow:var(--sh-lg);border-radius:16px;width:min(680px,95vw);max-height:85vh;display:flex;flex-direction:column;padding:20px;gap:12px">
      <div style="font-weight:700;font-size:14px;color:var(--txt)">${isQuiz ? '✏️ クイズプロンプト' : '📖 ボキャブラリープロンプト'} — ${_wikiSelected.size} ページ</div>
      <div style="font-size:11px;color:var(--m)">対象ページ: ${esc(pages.join(' · '))}。コピーして Gemini CLI または Claude Code でローカル実行してください。</div>
      <textarea id="wiki-prompt-text" style="flex:1;min-height:300px;background:var(--bg);box-shadow:var(--sh-in);border:none;border-radius:10px;padding:12px;font-size:11px;font-family:'SF Mono','Monaco',monospace;color:var(--txt);resize:vertical;line-height:1.5" readonly>${prompt}</textarea>
      <div style="display:flex;gap:8px">
        <button class="save-btn" onclick="navigator.clipboard.writeText(document.getElementById('wiki-prompt-text').value).then(()=>{this.textContent='コピーしました';setTimeout(()=>{this.textContent='コピー'},1500)})">コピー</button>
        <button class="refresh-btn" onclick="document.getElementById('wiki-prompt-modal').remove()">閉じる</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function _markdownToHtml(md) {
  const blocks = [];

  // 1. Extract <details>/<summary> blocks (editorial agent uses these for collapsibles)
  md = md.replace(/<details>([\s\S]*?)<\/details>/gi, (_, inner) => {
    const idx = blocks.length;
    const sum = inner.match(/<summary>([\s\S]*?)<\/summary>/i);
    const body = inner.replace(/<summary>[\s\S]*?<\/summary>/i, '').trim();
    const label = sum ? sum[1].trim() : 'Details';
    blocks.push(`<details><summary>${label}</summary><div style="padding:8px 0">${_markdownToHtml(body)}</div></details>`);
    return `\x00BLK${idx}\x00`;
  });

  // 2. Extract fenced code/mermaid blocks before any escaping
  md = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.length;
    const safe = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n$/,'');
    if (lang === 'mermaid') {
      blocks.push(`<div class="mermaid">${safe}</div>`);
    } else {
      const cls = lang ? ` class="language-${lang}"` : '';
      blocks.push(`<pre><code${cls}>${safe}</code></pre>`);
    }
    return `\x00BLK${idx}\x00`;
  });

  // 3. Fallback: bare "mermaid" keyword starting a line (context agent output without fences)
  md = md.replace(/^mermaid\r?\n([\s\S]*?)(?=\n(?:##|#|\n|$))/gm, (_, diagram) => {
    const idx = blocks.length;
    const safe = diagram.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trimEnd();
    blocks.push(`<div class="mermaid">${safe}</div>`);
    return `\x00BLK${idx}\x00`;
  });

  // HTML-escape remaining text
  md = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const out = [], lines = md.split('\n');
  let inUl = false, inOl = false, inPara = false, inBq = false;
  const flush = () => {
    if (inBq)  { out.push('</blockquote>'); inBq  = false; }
    if (inUl)  { out.push('</ul>');  inUl  = false; }
    if (inOl)  { out.push('</ol>');  inOl  = false; }
    if (inPara){ out.push('</p>');   inPara = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\x00BLK\d+\x00$/.test(line.trim())) { flush(); out.push(line.trim()); continue; }
    if (!line.trim()) { flush(); continue; }

    // Headings
    const hm = line.match(/^(#{1,6}) (.+)$/);
    if (hm) { flush(); out.push(`<h${hm[1].length}>${_inline(hm[2])}</h${hm[1].length}>`); continue; }

    // Blockquote — group consecutive > lines into one <blockquote>
    const bq = line.match(/^&gt; ?(.*)$/);
    if (bq) {
      if (inPara) { out.push('</p>'); inPara = false; }
      if (inUl)   { out.push('</ul>'); inUl = false; }
      if (inOl)   { out.push('</ol>'); inOl = false; }
      if (!inBq)  { out.push('<blockquote>'); inBq = true; }
      else out.push('<br>');
      out.push(_inline(bq[1]));
      continue;
    }
    if (inBq) { out.push('</blockquote>'); inBq = false; }

    // HR
    if (/^[-*_]{3,}$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }

    // Unordered list
    const ul = line.match(/^\s*[-*+] (.+)$/);
    if (ul) {
      if (inPara) { out.push('</p>'); inPara = false; }
      if (inOl)   { out.push('</ol>'); inOl = false; }
      if (!inUl)  { out.push('<ul>'); inUl = true; }
      out.push(`<li>${_inline(ul[1])}</li>`); continue;
    }

    // Ordered list
    const ol = line.match(/^\s*\d+\. (.+)$/);
    if (ol) {
      if (inPara) { out.push('</p>'); inPara = false; }
      if (inUl)   { out.push('</ul>'); inUl = false; }
      if (!inOl)  { out.push('<ol>'); inOl = true; }
      out.push(`<li>${_inline(ol[1])}</li>`); continue;
    }

    // Table header row (followed by separator)
    if (line.startsWith('|') && (lines[i+1]||'').match(/^\|[-| :]+\|$/)) {
      flush();
      const cols = line.split('|').slice(1,-1);
      out.push(`<table><thead><tr>${cols.map(c=>`<th>${_inline(c.trim())}</th>`).join('')}</tr></thead><tbody>`);
      i++; continue; // skip separator line
    }
    // Table body row
    if (line.startsWith('|') && line.endsWith('|') && out.length && (out[out.length-1].endsWith('</tr>') || out[out.length-1].endsWith('<tbody>'))) {
      const cols = line.split('|').slice(1,-1);
      out.push(`<tr>${cols.map(c=>`<td>${_inline(c.trim())}</td>`).join('')}</tr>`);
      if (!(lines[i+1]||'').startsWith('|')) out.push('</tbody></table>');
      continue;
    }

    // Regular paragraph text
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    if (!inPara) { out.push('<p>'); inPara = true; } else out.push('<br>');
    out.push(_inline(line));
  }
  flush();

  return out.join('').replace(/\x00BLK(\d+)\x00/g, (_, i) => blocks[+i]);
}

function _inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/* ═══════════════════════════════════════════════════════════
   TELEMETRY
══════════════════════════════════════════════════════════════ */
(function initTelemetry() {
  const FLUSH_INTERVAL = 30000, MAX_BATCH = 50;
  let _buf = [], _lastActive = Date.now(), _idle = false, _timer = null;
  const _isIdle = () => _idle;

  document.addEventListener('click', e => {
    _lastActive = Date.now(); _idle = false;
    const tgt = e.target.closest('[data-panel-id]');
    if (tgt) push('click', { panelId:tgt.dataset.panelId });
  });
  ['mousemove','keydown','scroll'].forEach(ev => document.addEventListener(ev, () => { _lastActive = Date.now(); _idle = false; }, { passive:true }));

  setInterval(() => { if (Date.now() - _lastActive > 60000) _idle = true; }, 10000);

  function push(type, data) {
    _buf.push({ type, ...data, ts: Date.now() });
    if (_buf.length >= MAX_BATCH) flush();
  }

  function flush() {
    if (!_buf.length || _isIdle()) return;
    const batch = _buf.splice(0, MAX_BATCH);
    const payload = JSON.stringify({ events: batch });
    // sendBeacon doesn't support headers; use keepalive fetch with Bearer token instead
    fetch(apiUrl('/api/activity'), { method:'POST', keepalive:true, headers:{..._authHeaders(),'Content-Type':'application/json'}, body:payload }).catch(()=>{});
  }

  _timer = setInterval(() => { if (!_isIdle()) flush(); }, FLUSH_INTERVAL);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // Panel dwell tracking
  const dwellStart = {};
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const id = en.target.dataset.panelId; if (!id) return;
      if (en.isIntersecting) { dwellStart[id] = Date.now(); push('panel_view', {panelId:id}); }
      else if (dwellStart[id]) { push('panel_dwell', {panelId:id, ms:Date.now()-dwellStart[id]}); delete dwellStart[id]; }
    });
  }, { threshold:0.2 });
  document.querySelectorAll('[data-panel-id]').forEach(el => obs.observe(el));
})();

/* ═══════════════════════════════════════════════════════════
   KEYBOARD / ESC
══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDetail();
    document.getElementById('mob-more-sheet')?.classList.remove('open');
    document.querySelectorAll('.ndrop').forEach(d => d.classList.remove('open'));
  }
});

/* ═══════════════════════════════════════════════════════════
   CHANNELS PAGE
   Manages Discord channel registry + live fetch from Discord API
══════════════════════════════════════════════════════════════ */
let _guildsData = [];         // cached from last _fetchDiscordGuilds call
let _selectedGuildId = null;

function _initChannelsPage() {
  _loadDiscordChannels();
  _fetchDiscordGuilds();
  _renderRoutingTable(window._routingRows || [], window._discordChannels || []);
}

function _renderRoutingTable(rows, _channels) {
  // Routing is now shown inline in the channel tree — store rows for re-render on guild fetch
  window._routingRows = rows;
  const el = document.getElementById('routing-table');
  if (!el) return; // element removed from HTML — routing is now integrated into channel tree
  const chKeys = [...new Set(channels.map(c => c.key).filter(Boolean))].sort();
  // Pretty task type labels
  const LABELS = {
    deep_context:'Deep Context', ingest:'Ingest', wiki_lint:'Wiki Lint', scout:'Scout',
    scout_external:'Scout (external)', develop:'Develop', review:'Review', db_audit:'DB Audit',
    system_audit:'System Audit', knowledge_query:'Knowledge Query', feed_health_check:'Feed Health',
    discover_source:'Discover Source', review_sources:'Review Sources', knowledge_init:'Knowledge Init',
    repo_audit:'Repo Audit', content:'Content', content_review:'Content Review', plan:'Plan',
    log_monitor:'Log Monitor', set_agent_level:'Set Agent Level', mail_check:'Mail Check',
    cost_report:'Cost Report', infer_location:'Infer Location',
  };
  const rows2 = (rows || []).sort((a,b) => a.channelKey.localeCompare(b.channelKey) || a.taskType.localeCompare(b.taskType));
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="border-bottom:1px solid var(--border)">
      <th style="padding:8px 12px;text-align:left;color:var(--m);font-weight:600">Task type</th>
      <th style="padding:8px 12px;text-align:left;color:var(--m);font-weight:600">Agent</th>
      <th style="padding:8px 12px;text-align:left;color:var(--m);font-weight:600">Channel</th>
    </tr></thead>
    <tbody>${rows2.map((r,i) => `
      <tr style="border-bottom:1px solid var(--border);background:${i%2?'transparent':'var(--card-bg)'}">
        <td style="padding:7px 12px;color:var(--txt)">${esc(LABELS[r.taskType]||r.taskType)}</td>
        <td style="padding:7px 12px;color:var(--m2)">${esc(r.agentId)}</td>
        <td style="padding:7px 12px">
          <select style="font-size:10px;padding:2px 6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:${r.overridden?'var(--acc)':'var(--txt)'}"
            onchange="_saveRouting('${r.taskType}',this.value)">
            <option value="tasks" ${r.channelKey==='tasks'?'selected':''}>tasks</option>
            <option value="log-monitoring" ${r.channelKey==='log-monitoring'?'selected':''}>log-monitoring</option>
            <option value="mails" ${r.channelKey==='mails'?'selected':''}>mails</option>
            <option value="bug-reports" ${r.channelKey==='bug-reports'?'selected':''}>bug-reports</option>
            <option value="billing" ${r.channelKey==='billing'?'selected':''}>billing</option>
            <option value="news" ${r.channelKey==='news'?'selected':''}>news</option>
            <option value="releases" ${r.channelKey==='releases'?'selected':''}>releases</option>
            ${chKeys.filter(k=>!['tasks','log-monitoring','mails','bug-reports','billing','news','releases'].includes(k)).map(k=>`<option value="${esc(k)}" ${r.channelKey===k?'selected':''}>${esc(k)}</option>`).join('')}
          </select>
          ${r.overridden?`<span style="font-size:9px;color:var(--acc);margin-left:4px">overridden</span>`:''}
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

async function _saveRouting(taskType, channelKey) {
  const res = await fetch(apiUrl('/api/routing'), {
    method:'PATCH', headers:{..._authHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ taskType, channelKey }),
  });
  if (!res.ok) showToast('Routing save failed', 'error');
  else showToast(`${taskType} → ${channelKey}`, 'success');
}

// ─── Forum channel tag management ──────────────────────────────────────────
function _showAddTagForm(channelId) {
  const existing = document.getElementById('tag-form-popup');
  if (existing) existing.remove();
  const pop = document.createElement('div');
  pop.id = 'tag-form-popup';
  pop.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--bg);box-shadow:var(--sh);border-radius:12px;padding:16px;min-width:240px';
  pop.innerHTML = `
    <div style="font-size:12px;font-weight:700;margin-bottom:10px">新しいタグを追加</div>
    <input id="tag-name-input" class="form-input" placeholder="タグ名" style="margin-bottom:8px;font-size:12px">
    <input id="tag-emoji-input" class="form-input" placeholder="絵文字 (例: 📌)" style="margin-bottom:12px;font-size:12px;width:100px">
    <div style="display:flex;gap:8px">
      <button class="save-btn" onclick="_createChannelTag('${esc(channelId)}')">追加</button>
      <button class="refresh-btn" onclick="document.getElementById('tag-form-popup')?.remove()">キャンセル</button>
    </div>
    <div id="tag-form-status" style="font-size:10px;color:var(--m);margin-top:6px"></div>
  `;
  document.body.appendChild(pop);
  pop.querySelector('#tag-name-input').focus();
}

async function _createChannelTag(channelId) {
  const name = document.getElementById('tag-name-input')?.value?.trim();
  const emoji = document.getElementById('tag-emoji-input')?.value?.trim() || undefined;
  const status = document.getElementById('tag-form-status');
  if (!name) { if (status) status.textContent = 'タグ名を入力してください'; return; }
  if (status) status.textContent = '追加中…';
  const res = await fetch(apiUrl(`/api/discord/channels/${channelId}/tags`), {
    method: 'POST',
    headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, emoji }),
  }).catch(() => null);
  if (!res?.ok) {
    const err = await res?.json().catch(() => ({}));
    if (status) status.textContent = err.error || 'エラーが発生しました';
    return;
  }
  document.getElementById('tag-form-popup')?.remove();
  showToast(`タグ「${name}」を追加しました`, 'success');
  // Refresh guild view
  const guild = _guildsData?.find(g => g.id === _selectedGuildId);
  if (guild) {
    const tag = (await res.json()).tags?.find(t => t.name === name);
    const ch = guild.channels.find(c => c.id === channelId);
    if (ch && tag) { ch.availableTags = (ch.availableTags || []); ch.availableTags.push(tag); _renderLiveChannels(guild); }
  }
}

async function _deleteChannelTag(channelId, tagId) {
  const res = await fetch(apiUrl(`/api/discord/channels/${channelId}/tags/${tagId}`), {
    method: 'DELETE', headers: _authHeaders(),
  }).catch(() => null);
  if (!res?.ok) { showToast('タグ削除に失敗しました', 'error'); return; }
  showToast('タグを削除しました', 'success');
  const guild = _guildsData?.find(g => g.id === _selectedGuildId);
  if (guild) {
    const ch = guild.channels.find(c => c.id === channelId);
    if (ch) { ch.availableTags = (ch.availableTags || []).filter(t => t.id !== tagId); _renderLiveChannels(guild); }
  }
}

async function _fetchDiscordGuilds() {
  const btn = document.getElementById('fetch-guilds-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
  try {
    const res = await fetch(apiUrl('/api/discord/guilds'), { headers: _authHeaders() });
    if (res.status === 401) { _handleUnauthorized(); return; }
    if (!res.ok) { showToast('Discord fetch failed: ' + res.status, 'error'); return; }
    const data = await res.json();
    _guildsData = data.guilds || [];
    if (!_guildsData.length) { showToast('Bot is not in any Discord server, or DISCORD_BOT_TOKEN is not set.', 'warn'); return; }
    _renderGuildPicker(_guildsData);
    if (_guildsData.length === 1) {
      _selectedGuildId = _guildsData[0].id;
      _renderLiveChannels(_guildsData[0]);
    }
    const createCard = document.getElementById('create-discord-ch-card');
    if (createCard) createCard.style.display = '';
  } catch (e) {
    showToast('Error fetching guilds: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Fetch from Discord'; }
  }
}

function _renderGuildPicker(guilds) {
  const picker = document.getElementById('guild-picker');
  const sel = document.getElementById('guild-select');
  if (!picker || !sel) return;
  sel.innerHTML = guilds.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  picker.style.display = guilds.length > 1 ? '' : 'none';
  if (guilds.length === 1) sel.value = guilds[0].id;
}

function _onGuildSelect(guildId) {
  _selectedGuildId = guildId;
  const guild = _guildsData.find(g => g.id === guildId);
  if (guild) _renderLiveChannels(guild);
}

const CH_TYPE_ICON = { 0:'#', 2:'🔊', 4:'📁', 5:'📢', 11:'🧵', 15:'🗂️' };

function _renderLiveChannels(guild) {
  const container = document.getElementById('discord-live-channels');
  const tree = document.getElementById('live-channel-tree');
  const parentSel = document.getElementById('new-discord-ch-parent');
  if (!container || !tree) return;

  // Populate category dropdown for new channel creation
  const cats = guild.channels.filter(c => c.type === 4).sort((a,b) => (a.position||0)-(b.position||0));
  if (parentSel) {
    parentSel.innerHTML = '<option value="">— no category —</option>'
      + cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }

  // Populate bot list for new channel creation
  _renderNewChannelBotList();

  const registeredChannelMap = new Map();
  for (const ch of _discordChannels) {
    registeredChannelMap.set(String(ch.id || ch.channelId || ''), ch);
  }
  const clickable = new Set([0, 5, 11, 15]);

  // Build task→channel map for routing indicators
  const routingByChKey = {};
  for (const row of (window._routingRows || [])) {
    if (!routingByChKey[row.channelKey]) routingByChKey[row.channelKey] = [];
    routingByChKey[row.channelKey].push(row.taskType);
  }

  function chItem(ch) {
    const icon = CH_TYPE_ICON[ch.type] || '#';
    const regCh = registeredChannelMap.get(String(ch.id));
    const isReg = !!regCh;
    const canInteract = clickable.has(ch.type);
    const isForum = ch.type === 15;
    const cls = ['ch-tree-item', isReg ? 'registered' : ''].filter(Boolean).join(' ');
    const agents = regCh?.agents || [];

    // Routing: show which task types route to this channel (via its key)
    const chKey = regCh?.key || '';
    const routedTasks = chKey ? (routingByChKey[chKey] || []) : [];
    const routePills = routedTasks.length
      ? `<div class="ch-tree-agents" style="margin-top:2px">${routedTasks.map(t=>`<span class="ch-tree-agent-pill" style="background:var(--accent-bg);color:var(--m2)">${esc(t.replace(/_/g,' '))}</span>`).join('')}</div>`
      : '';

    const agentPills = agents.length
      ? `<div class="ch-tree-agents">${agents.map(a => `<span class="ch-tree-agent-pill">${esc(a.replace('-agent',''))}</span>`).join('')}</div>`
      : '';

    // Forum channel: show tags + add-tag button
    const availTags = ch.availableTags || [];
    const tagSection = isForum
      ? `<div class="ch-tree-agents" style="margin-top:3px">
          ${availTags.map(tag=>`<span class="ch-tree-agent-pill" style="background:#1a1a2e;color:#a5b4fc" title="Tag ID: ${esc(tag.id)}">${tag.emoji?tag.emoji+' ':''}${esc(tag.name)}<button onclick="event.stopPropagation();_deleteChannelTag('${esc(ch.id)}','${esc(tag.id)}')" style="margin-left:3px;background:none;border:none;color:var(--m2);cursor:pointer;font-size:9px;padding:0" title="Remove"><i class="ni ni-close" aria-hidden="true"></i></button></span>`).join('')}
          <button class="ch-plus-btn" style="font-size:9px;padding:2px 6px" onclick="event.stopPropagation();_showAddTagForm('${esc(ch.id)}')" title="Add tag">${(_I18N[PROJECT_LANG]||_I18N.JP)['ch-add-tag']}</button>
        </div>`
      : '';

    const plusBtn = canInteract
      ? `<button class="ch-plus-btn" onclick="event.stopPropagation();_openAgentMenu('${esc(ch.id)}','${esc(ch.name)}',event)" title="Assign agents">+</button>`
      : '';

    return `<div class="${cls}" title="ID: ${esc(ch.id)}">
      <span style="flex-shrink:0">${icon}</span>
      <span class="ch-tree-item-name">${esc(ch.name)}</span>
      ${isReg ? `<span class="ch-tree-check" title="Key: ${esc(chKey)}">✓</span>` : ''}
      ${agentPills}
      ${routePills}
      ${tagSection}
      ${plusBtn}
    </div>`;
  }

  const sections = [];

  // Channels in categories
  for (const cat of cats) {
    const children = guild.channels
      .filter(c => c.parentId === cat.id)
      .sort((a,b) => (a.position||0)-(b.position||0));
    sections.push(`
      <div style="margin-bottom:2px">
        <div class="ch-tree-cat" role="button" tabindex="0" aria-expanded="true"
          onclick="this.classList.toggle('collapsed');this.setAttribute('aria-expanded', String(!this.classList.contains('collapsed')));this.nextElementSibling.classList.toggle('hidden')">
          <span class="ch-tree-cat-icon">▾</span>
          <span>📁 ${esc(cat.name)}</span>
          <span style="font-size:9px;color:var(--m2);margin-left:auto">${children.length}</span>
        </div>
        <div class="ch-tree-children">${children.map(chItem).join('') || '<div style="font-size:10px;color:var(--m2);padding:4px 8px">Empty</div>'}</div>
      </div>`);
  }

  // Orphan channels (no category)
  const orphans = guild.channels
    .filter(c => c.type !== 4 && !c.parentId)
    .sort((a,b) => (a.position||0)-(b.position||0));
  if (orphans.length) {
    sections.push(`<div class="ch-tree-children" style="padding-left:0">${orphans.map(chItem).join('')}</div>`);
  }

  tree.innerHTML = sections.join('') || `<div style="font-size:11px;color:var(--m)">${(_I18N[PROJECT_LANG]||_I18N.JP)['empty-channels']}</div>`;
  container.style.display = '';
}

let _agentMenuChannelId = null;

function _openAgentMenu(channelId, channelName, event) {
  const existing = document.getElementById('agent-menu-popup');
  if (existing) { existing.remove(); }
  if (_agentMenuChannelId === channelId) { _agentMenuChannelId = null; return; }
  _agentMenuChannelId = channelId;

  const regCh = _discordChannels.find(ch => String(ch.id || ch.channelId || '') === String(channelId));
  const assignedHere = new Set(regCh?.agents || []);

  // Build agent → current channel map for exclusivity display
  const agentCurrentKey = {};
  for (const ch of _discordChannels) {
    for (const aid of (ch.agents || [])) agentCurrentKey[aid] = ch.key;
  }

  const items = REGISTRY.map(reg => {
    const isHere = assignedHere.has(reg.id);
    const elsewhere = !isHere && agentCurrentKey[reg.id] ? agentCurrentKey[reg.id] : null;
    return `<label class="agent-menu-item">
      <input type="checkbox" ${isHere ? 'checked' : ''}
        onchange="_toggleAgentOnChannel('${esc(reg.id)}','${esc(channelId)}','${esc(channelName)}',this)">
      <span style="flex:1">${esc(reg.id.replace('-agent',''))}</span>
      ${elsewhere ? `<span class="agent-menu-elsewhere">#${esc(elsewhere)}</span>` : ''}
    </label>`;
  }).join('');

  const popup = document.createElement('div');
  popup.id = 'agent-menu-popup';
  popup.className = 'agent-menu-popup';
  popup.style.position = 'fixed';
  popup.style.zIndex = '9000';
  popup.innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--txt);margin-bottom:8px"># ${esc(channelName)}</div>${items}`;

  const btn = event.target.closest('button') || event.target;
  const rect = btn.getBoundingClientRect();
  popup.style.top = (rect.bottom + 6) + 'px';
  const left = Math.min(rect.left, window.innerWidth - 250);
  popup.style.left = Math.max(8, left) + 'px';
  document.body.appendChild(popup);

  setTimeout(() => document.addEventListener('click', _closeAgentMenuOutside, { capture: true, once: false }), 0);
}

function _closeAgentMenuOutside(e) {
  const popup = document.getElementById('agent-menu-popup');
  if (!popup) { document.removeEventListener('click', _closeAgentMenuOutside, { capture: true }); return; }
  if (!popup.contains(e.target)) {
    popup.remove();
    _agentMenuChannelId = null;
    document.removeEventListener('click', _closeAgentMenuOutside, { capture: true });
  }
}

async function _toggleAgentOnChannel(agentId, channelId, channelName, checkbox) {
  const isChecked = checkbox.checked;
  checkbox.disabled = true;
  try {
    // Auto-register channel if not yet registered
    let regCh = _discordChannels.find(ch => String(ch.id || ch.channelId || '') === String(channelId));
    let key = regCh?.key;
    if (!regCh) {
      key = channelName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || channelId;
      const res = await fetch(apiUrl('/api/channels'), {
        method: 'POST', headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, id: channelId })
      });
      if (!res.ok) { checkbox.checked = !isChecked; showToast('Failed to register channel', 'error'); return; }
    }
    await saveAgentChannel(agentId, isChecked ? key : '');
    await _loadDiscordChannels();
    // Re-render the live tree with updated data
    const guild = _guildsData.find(g => g.id === _selectedGuildId) || _guildsData[0];
    if (guild) _renderLiveChannels(guild);
  } catch (e) {
    checkbox.checked = !isChecked;
    showToast('Error: ' + e.message, 'error');
  } finally {
    checkbox.disabled = false;
  }
}

function _renderNewChannelBotList() {
  const el = document.getElementById('new-ch-bot-list');
  if (!el || !REGISTRY.length) return;
  el.innerHTML = REGISTRY.map(a => `
    <label style="font-size:10px;display:flex;align-items:center;gap:4px;cursor:pointer;padding:3px 8px;border-radius:6px;background:var(--bg);box-shadow:var(--sh-sm)">
      <input type="checkbox" data-agent-id="${esc(a.id)}" class="new-ch-bot-check">
      ${esc(a.id.replace('-agent',''))}
    </label>`).join('');
}

function _showCreateCategoryForm() {
  document.getElementById('create-cat-form').style.display = '';
  document.getElementById('create-ch-form').style.display = 'none';
  document.getElementById('new-cat-name')?.focus();
}

function _showCreateChannelForm() {
  document.getElementById('create-ch-form').style.display = '';
  document.getElementById('create-cat-form').style.display = 'none';
  document.getElementById('new-discord-ch-name')?.focus();
}

async function createDiscordCategory() {
  const name = document.getElementById('new-cat-name')?.value.trim();
  const statusEl = document.getElementById('create-cat-status');
  const btn = document.getElementById('create-cat-btn');
  if (!name) { showToast('カテゴリー名を入力してください。', 'warn'); return; }
  if (!_selectedGuildId) { showToast('先にDiscordから取得してください。', 'warn'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '作成中…'; }
  if (statusEl) statusEl.textContent = '';
  try {
    const res = await fetch(apiUrl('/api/discord/channels/create'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ guildId: _selectedGuildId, name, type: 4 })
    });
    const data = await res.json();
    if (!res.ok) { if (statusEl) statusEl.textContent = 'Error: ' + (data.error || res.status); return; }
    if (statusEl) statusEl.textContent = `✓ フォルダ「${data.channel.name}」を作成しました`;
    document.getElementById('new-cat-name').value = '';
    await _fetchDiscordGuilds();
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'フォルダを作成'; }
  }
}

function _prefillChannelForm(id, name) {
  // Auto-open the register form
  const form = document.getElementById('reg-ch-form');
  const toggleBtn = document.getElementById('reg-ch-toggle-btn');
  if (form) form.style.display = '';
  if (toggleBtn) toggleBtn.textContent = '✕ Cancel';
  const keyEl = document.getElementById('reg-ch-key');
  const idEl  = document.getElementById('reg-ch-id');
  if (keyEl && !keyEl.value) keyEl.value = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (idEl) idEl.value = id;
  form?.scrollIntoView({ behavior:'smooth', block:'center' });
}

async function createDiscordChannel() {
  const name = document.getElementById('new-discord-ch-name')?.value.trim();
  const type = Number(document.getElementById('new-discord-ch-type')?.value || 0);
  const parentId = document.getElementById('new-discord-ch-parent')?.value || undefined;
  const isPrivate = document.getElementById('new-discord-ch-private')?.checked || false;
  const statusEl = document.getElementById('create-discord-ch-status');
  const btn = document.getElementById('create-discord-ch-btn');

  if (!name) { showToast('チャンネル名を入力してください。', 'warn'); return; }
  if (!_selectedGuildId) { showToast('先にDiscordからサーバーを取得してください。', 'warn'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '作成中…'; }
  if (statusEl) statusEl.textContent = '';

  try {
    const res = await fetch(apiUrl('/api/discord/channels/create'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({
        guildId: _selectedGuildId, name, type, private: isPrivate,
        ...(parentId ? { parentId } : {})
      })
    });
    const data = await res.json();
    if (!res.ok) { if (statusEl) statusEl.textContent = 'Error: ' + (data.error || res.status); return; }
    if (statusEl) statusEl.textContent = `✓ #${data.channel.name} (${data.channel.id}) を作成しました — 下で登録してください。`;
    // Auto-register bots selected in the bot list
    const botChecks = document.querySelectorAll('.new-ch-bot-check:checked');
    const channelKey = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    for (const cb of botChecks) {
      await saveAgentChannel(cb.dataset.agentId, channelKey).catch(()=>{});
    }
    // Pre-fill the register form
    _prefillChannelForm(data.channel.id, data.channel.name);
    // Refresh live channels
    await _fetchDiscordGuilds();
    document.getElementById('create-ch-form').style.display = 'none';
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Discordに作成'; }
  }
}

/* ═══════════════════════════════════════════════════════════
   CONTEXT WINDOW SETTINGS
══════════════════════════════════════════════════════════════ */
let _ctxSettings = { maxContextMessages: 20, contextCompression: false, compressionModel: 'flash' };

async function _loadContextSettings() {
  if (!API_BASE) return;
  try {
    const res = await fetch(apiUrl('/api/project/context-settings'), { headers: _authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    _ctxSettings = data;
    _syncContextSettingsUI();
  } catch {}
}

function _syncContextSettingsUI() {
  const slider = document.getElementById('ctx-max-messages');
  const label  = document.getElementById('ctx-max-label');
  const btn    = document.getElementById('ctx-compress-btn');
  const model  = document.getElementById('ctx-compress-model');
  if (slider) { slider.value = _ctxSettings.maxContextMessages ?? 20; }
  if (label)  { label.textContent = _ctxSettings.maxContextMessages ?? 20; }
  if (btn)    {
    const on = !!_ctxSettings.contextCompression;
    btn.textContent = on ? 'On' : 'Off';
    btn.classList.toggle('active', on);
    btn.classList.toggle('inactive', !on);
  }
  if (model)  { model.value = _ctxSettings.compressionModel ?? 'flash'; }
}

function toggleContextCompression() {
  _ctxSettings.contextCompression = !_ctxSettings.contextCompression;
  _syncContextSettingsUI();
  saveContextSettings();
}

async function saveContextSettings() {
  const slider = document.getElementById('ctx-max-messages');
  const model  = document.getElementById('ctx-compress-model');
  const statusEl = document.getElementById('ctx-save-status');

  const maxContextMessages = Number(slider?.value || 20);
  const compressionModel = model?.value || 'flash';
  const contextCompression = !!_ctxSettings.contextCompression;

  if (statusEl) statusEl.textContent = '保存中…';
  try {
    const res = await fetch(apiUrl('/api/project/context-settings'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ maxContextMessages, contextCompression, compressionModel })
    });
    if (statusEl) statusEl.textContent = res.ok ? '✓ 保存しました' : 'Error: ' + res.status;
    if (res.ok) _ctxSettings = { maxContextMessages, contextCompression, compressionModel };
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  }
}

/* ═══════════════════════════════════════════════════════════
   REPOS PAGE
══════════════════════════════════════════════════════════════ */
let _repoSearchTimer = null;
let _reposInited = false;

const PINNED_REPOS = [
  { fullName:'hachi-admin/hachi-core',  label:'hachi-core',    desc:'Framework upstream — fork base for no-gem', icon:'⚙️',  url:'https://github.com/hachi-admin/hachi-core' },
  { fullName:'hachi-admin/no-gem-dash', label:'no-gem-dash',   desc:'This dashboard (GitHub Pages SPA)',          icon:'📊',  url:'https://github.com/hachi-admin/no-gem-dash' },
  { fullName:'hachi-admin/hachi-wiki',    label:'obsidian',      desc:'Knowledge management wiki repo',             icon:'📚',  url:'https://github.com/hachi-admin/hachi-wiki' },
  { fullName:'hachi-admin/hachi-public-1', label:'hachi-public-1', desc:'Second brain knowledge base',           icon:'🧠',  url:'https://github.com/hachi-admin/hachi-public-1' },
];

function _renderPinnedRepos() {
  const el = document.getElementById('pinned-repos');
  if (!el) return;
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
    ${PINNED_REPOS.map(r => `
      <a href="${esc(r.url)}" target="_blank" rel="noopener" style="text-decoration:none">
        <div style="background:var(--bg);box-shadow:var(--sh);border-radius:12px;padding:14px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='var(--sh-lg)'" onmouseout="this.style.boxShadow='var(--sh)'">
          <div style="font-size:18px;margin-bottom:6px">${r.icon}</div>
          <div style="font-size:13px;font-weight:700;color:var(--acc);margin-bottom:3px">${esc(r.label)}</div>
          <div style="font-size:10px;color:var(--m);line-height:1.4">${esc(r.desc)}</div>
          <div style="font-size:9px;color:var(--m2);margin-top:6px;font-family:monospace">${esc(r.fullName)}</div>
        </div>
      </a>`).join('')}
  </div>`;
}

function _initReposPage() {
  _renderPinnedRepos();
  if (!_reposInited) { _reposInited = true; _loadRepos(); }
}

function _debouncedRepoSearch() {
  clearTimeout(_repoSearchTimer);
  _repoSearchTimer = setTimeout(_loadRepos, 400);
}

async function _loadRepos() {
  const q = document.getElementById('repo-search')?.value.trim() || '';
  const listEl = document.getElementById('repo-list'); if (!listEl) return;
  listEl.innerHTML = '<div style="font-size:11px;color:var(--m);padding:12px">読み込み中…</div>';

  try {
    const res = await fetch(apiUrl(`/api/github/repos${q ? '?q=' + encodeURIComponent(q) : ''}`), { headers: _authHeaders() });
    if (res.status === 401) { _handleUnauthorized(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const hint = res.status === 500
        ? ' — Check that GITHUB_ACCESS_TOKEN is set in GCP Secret Manager with repo + read:org scopes.'
        : '';
      listEl.innerHTML = `<div style="font-size:11px;color:var(--error);padding:12px">Error: ${esc(err.error || res.status)}${esc(hint)}</div>`;
      return;
    }
    const data = await res.json();
    const repos = data.repos || [];
    if (!repos.length) {
      listEl.innerHTML = `<div style="font-size:11px;color:var(--m);padding:12px">${(_I18N[PROJECT_LANG]||_I18N.JP)['empty-repos']}</div>`;
      return;
    }
    listEl.innerHTML = repos.map(_repoRow).join('');
  } catch (e) {
    listEl.innerHTML = `<div style="font-size:11px;color:var(--error);padding:12px">Error: ${esc(e.message)}</div>`;
  }
}

function _repoRow(repo) {
  const age = relTime(repo.pushedAt || repo.updatedAt);
  const lang = repo.language ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--accent-bg);color:var(--acc)">${esc(repo.language)}</span>` : '';
  const priv = repo.private
    ? '<span style="font-size:9px;color:var(--m2);border:1px solid var(--div);padding:1px 5px;border-radius:3px">private</span>'
    : '<span style="font-size:9px;color:#34D399;border:1px solid #34D39933;padding:1px 5px;border-radius:3px">public</span>';
  const arch = repo.archived ? '<span style="font-size:9px;color:var(--m2)">[archived]</span>' : '';
  return `<div class="src-row" style="gap:10px">
    <div class="src-body" style="flex:1;min-width:0">
      <div class="src-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <a href="${esc(repo.url)}" target="_blank" rel="noopener" style="color:var(--acc)">${esc(repo.fullName)}</a>
        ${priv} ${arch} ${lang}
      </div>
      ${repo.description ? `<div class="src-meta" style="margin-top:2px">${esc(repo.description)}</div>` : ''}
      <div class="src-meta" style="margin-top:3px">
        ${repo.stars > 0 ? `⭐ ${repo.stars}  ` : ''}
        ${repo.forks > 0 ? `🍴 ${repo.forks}  ` : ''}
        <span style="color:var(--m)">${esc(repo.defaultBranch)}  ·  ${age}</span>
      </div>
    </div>
    <button class="act-btn" onclick="_viewCollaborators('${esc(repo.fullName)}')" style="font-size:9px;padding:3px 8px;white-space:nowrap">Collab</button>
  </div>`;
}

async function _viewCollaborators(fullName) {
  const [owner, repo] = fullName.split('/');
  document.getElementById('detail-content').innerHTML = `<div class="p-title">コラボレーター — ${esc(fullName)}</div><div style="padding:12px;color:var(--m);font-size:11px">読み込み中…</div>`;
  document.getElementById('detail-overlay').classList.add('open');
  try {
    const res = await fetch(apiUrl(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators`), { headers: _authHeaders() });
    const data = await res.json();
    if (data.limited) {
      document.getElementById('detail-content').innerHTML = `<div class="p-title">コラボレーター — ${esc(fullName)}</div><div style="padding:12px;color:var(--m);font-size:11px">コラボレーターの参照にはOrganizationの管理者権限が必要です。</div>`;
      return;
    }
    const collabs = data.collaborators || [];
    document.getElementById('detail-content').innerHTML = `
      <div class="p-title">コラボレーター — ${esc(fullName)}</div>
      <div style="margin-top:12px">
        ${collabs.length ? collabs.map(u => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--div)">
            <img src="${esc(u.avatarUrl)}" width="24" height="24" style="border-radius:50%">
            <div style="flex:1">
              <a href="${esc(u.url)}" target="_blank" rel="noopener" style="color:var(--acc);font-size:12px">${esc(u.login)}</a>
            </div>
            <span style="font-size:10px;color:var(--m)">${esc(u.role || 'write')}</span>
          </div>`).join('') : '<div style="color:var(--m);font-size:11px">コラボレーターが見つかりません。</div>'}
      </div>`;
  } catch (e) {
    document.getElementById('detail-content').innerHTML = `<div class="p-title">Error</div><div style="color:var(--error);font-size:11px;padding:12px">${esc(e.message)}</div>`;
  }
}

async function createRepo() {
  const name = document.getElementById('new-repo-name')?.value.trim();
  const desc = document.getElementById('new-repo-desc')?.value.trim() || '';
  const isPrivate = document.getElementById('new-repo-private')?.checked ?? true;
  const autoInit = document.getElementById('new-repo-init')?.checked ?? true;
  const statusEl = document.getElementById('create-repo-status');
  const btn = document.getElementById('create-repo-btn');

  if (!name) { showToast('Repository name is required.', 'warn'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  if (statusEl) statusEl.textContent = '';

  try {
    const res = await fetch(apiUrl('/api/github/repos'), {
      method:'POST', headers:{..._authHeaders(),'Content-Type':'application/json'},
      body: JSON.stringify({ name, description: desc, private: isPrivate, autoInit })
    });
    const data = await res.json();
    if (!res.ok) {
      if (statusEl) statusEl.textContent = 'Error: ' + (data.error || res.status);
      return;
    }
    if (statusEl) statusEl.textContent = `✓ Created: ${data.repo.fullName}`;
    document.getElementById('new-repo-name').value = '';
    document.getElementById('new-repo-desc').value = '';
    _loadRepos(); // refresh list
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create repository'; }
  }
}

/* ═══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
// Draw the sub-navigation for whichever destination we open on, so the strip is correct before
// the first click rather than only after one.
if (_openAt && _destOf(_openAt)) navTo(_openAt); else _renderDestSub(_activeDest, _activePage);
loadDashboard();
