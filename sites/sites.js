/* ═══════════════════════════════════════════════════════════
   sites.js — Hachi Sites (the fourth hachi public app).

   Make web pages from two layers of types — a design type (colours, fonts, voice) and section
   types (fields, template, CSS, writing guide) — let the model write the text, preview, approve,
   publish to Netlify. Backend: hachi-core /api/sites/* (docs/architecture/SITES_DESIGN.ja.md).

   Login is Dash's: GitHub OAuth, allowlisted users only. The token is stored in localStorage
   'dash-jwt' on this origin, so someone signed in to Dash is signed in here, and the reverse.
   ═══════════════════════════════════════════════════════════ */

const _params = new URLSearchParams(window.location.search);
const _DEFAULT_API = 'https://hachi-core-685554938840.asia-northeast1.run.app';
const API_BASE = (_params.get('api') || localStorage.getItem('nogem-api') || _DEFAULT_API).replace(/\/$/, '');
if (_params.get('api')) localStorage.setItem('nogem-api', _params.get('api'));

(function _authReturn() {
  const token = _params.get('token');
  if (!token) return;
  localStorage.setItem('dash-jwt', token);
  const clean = new URL(window.location.href);
  clean.searchParams.delete('token');
  window.history.replaceState({}, '', clean.toString());
})();

const _jwt = () => localStorage.getItem('dash-jwt') || '';
const _login = () => { window.location.href = `${API_BASE}/auth/login?return=${encodeURIComponent(window.location.href)}`; };

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(_jwt() ? { Authorization: `Bearer ${_jwt()}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { _note('ログインが必要です。GitHub のログイン画面に移動します…'); setTimeout(_login, 900); throw new Error('ログインが必要です'); }
  if (res.status === 403) { _note('このアカウントには Hachi Sites（Dash）の利用権限がありません。'); throw new Error('権限がありません'); }
  if (raw) { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function _note(msg) { const el = document.getElementById('auth-note'); el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}
const $ = (id) => document.getElementById(id);
const STATUS_JA = { draft: '下書き', review: '確認待ち', approved: '承認済み', published: '公開中', unpublished: '取り下げ' };
const yen = (usd) => (typeof usd === 'number' ? `¥${Math.round(usd * 200).toLocaleString('ja-JP')}` : '—');

/* ── state ── */
const S = { data: null, siteId: localStorage.getItem('sites-site') || '', pageId: null, page: null, designId: null, blockId: null };

async function load() {
  if (!_jwt()) { _note('Dash と同じ GitHub アカウントでログインしてください。'); setTimeout(_login, 900); return; }
  S.data = await api('/api/sites/overview');
  if (!S.data.sites.some((s) => s.id === S.siteId)) S.siteId = S.data.sites[0]?.id || '';
  render();
}

function render() {
  renderPages(); renderDesigns(); renderBlocks(); renderRefs(); renderPublish();
}

document.querySelectorAll('#tabs .nav-pill').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(tab) {
  document.querySelectorAll('#tabs .nav-pill').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== `tab-${tab}`; });
  history.replaceState({}, '', `#${tab}`);
}

/* ═══ Pages ═══ */
function renderPages() {
  const el = $('tab-pages');
  const d = S.data;
  const site = d.sites.find((s) => s.id === S.siteId);
  const pages = d.pages.filter((p) => p.siteId === S.siteId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  el.innerHTML = `
    <div class="page-hd"><div class="page-title">ページ</div>
      <select class="form-select" id="site-sel" style="width:auto">${d.sites.map((s) => `<option value="${esc(s.id)}"${s.id === S.siteId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new">＋ 新しいサイト</option></select>
      ${site ? `<button class="act-btn" id="site-publish">${d.netlify.connected ? 'このサイトを公開' : '公開（Netlify 未接続）'}</button>${site.url ? `<a href="${esc(site.url)}" target="_blank" rel="noopener" class="muted">${esc(site.url)}</a>` : ''}` : ''}
    </div>
    ${site ? '' : `<div class="panel">${_siteForm()}</div>`}
    ${site ? `<div class="grid2">
      <div>
        <div class="panel" style="margin-bottom:12px">
          <div class="section-hd" style="margin-top:0">新しいページ</div>
          <div class="field"><label>タイトル（仮）</label><input class="form-input" id="np-title" placeholder="例: 朝の段取りアプリ"></div>
          <div class="field"><label>URL の一部（英数字。空ならタイトルから）</label><input class="form-input" id="np-slug" placeholder="morning-app"></div>
          <div class="field"><label>ブリーフ（このページで伝えること・読者にしてほしいこと・使ってよい事実）</label><textarea class="form-input" id="np-brief"></textarea></div>
          <button class="save-btn" id="np-create">作る</button>
        </div>
        <div class="list">${pages.map((p) => `
          <div class="item${p.id === S.pageId ? ' active' : ''}" data-page="${esc(p.id)}">
            <div><div class="t">${esc(p.title || p.slug || '（無題）')}</div><div class="muted" style="font-size:11px">/${esc(p.slug || '')}/ ・ ${p.sectionCount}セクション ・ 費用 ${yen(p.costUsd)}</div></div>
            <span class="chip ${esc(p.status)}">${STATUS_JA[p.status] || esc(p.status)}</span>
          </div>`).join('') || '<div class="muted">まだページがありません</div>'}</div>
      </div>
      <div id="page-editor">${S.pageId ? '<div class="muted">読み込み中…</div>' : '<div class="panel muted">左からページを選ぶか、新しく作ってください。</div>'}</div>
    </div>` : ''}`;
  $('site-sel').onchange = (e) => {
    if (e.target.value === '__new') { S.siteId = ''; S.pageId = null; renderPages(); return; }
    S.siteId = e.target.value; localStorage.setItem('sites-site', S.siteId); S.pageId = null; renderPages();
  };
  if (!site) { $('site-create').onclick = createSite; return; }
  $('site-publish').onclick = () => publishSite(site.id);
  $('np-create').onclick = createPage;
  el.querySelectorAll('[data-page]').forEach((it) => it.addEventListener('click', () => openPage(it.dataset.page)));
  if (S.pageId) openPage(S.pageId);
}

function _siteForm() {
  return `<div class="section-hd" style="margin-top:0">新しいサイト</div>
    <div class="field"><label>サイト名</label><input class="form-input" id="ns-name"></div>
    <div class="field"><label>目的（何のためのサイトか）</label><input class="form-input" id="ns-purpose"></div>
    <div class="field"><label>想定読者</label><input class="form-input" id="ns-audience"></div>
    <div class="field"><label>既定のデザインの型</label><select class="form-select" id="ns-design">${S.data.designs.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div>
    <button class="save-btn" id="site-create">サイトを作る</button>`;
}
async function createSite() {
  const s = await api('/api/sites/sites', { method: 'POST', body: { name: $('ns-name').value || '新しいサイト', purpose: $('ns-purpose').value, audience: $('ns-audience').value, designId: $('ns-design').value } });
  S.siteId = s.id; localStorage.setItem('sites-site', s.id);
  await load();
}
async function createPage() {
  const p = await api('/api/sites/pages', { method: 'POST', body: { siteId: S.siteId, title: $('np-title').value, slug: $('np-slug').value, brief: $('np-brief').value } });
  S.pageId = p.id; toast('ページを作りました', 'success');
  await load();
}

async function openPage(id) {
  S.pageId = id;
  document.querySelectorAll('[data-page]').forEach((it) => it.classList.toggle('active', it.dataset.page === id));
  S.page = await api(`/api/sites/pages/${encodeURIComponent(id)}`);
  renderEditor();
}

const _blocksById = () => Object.fromEntries(S.data.blocks.map((b) => [b.id, b]));

function _fieldInput(f, value, path) {
  const v = value ?? '';
  if (f.kind === 'list') {
    const items = Array.isArray(value) ? value : [];
    return `<div class="field"><label>${esc(f.label || f.key)}（${items.length}件）</label>
      ${items.map((it, i) => `<div class="list-item">${(f.itemFields || []).map((sf) => _fieldInput(sf, it?.[sf.key], `${path}.${i}.${sf.key}`)).join('')}
        <button class="act-btn cancel" data-del="${esc(`${path}.${i}`)}">この項目を消す</button></div>`).join('')}
      <button class="act-btn" data-add="${esc(path)}">＋ 項目を足す</button></div>`;
  }
  const hint = f.maxLength ? `（${f.maxLength}字目安）` : '';
  return `<div class="field"><label>${esc(f.label || f.key)}${hint}</label>${f.kind === 'longtext'
    ? `<textarea class="form-input" data-path="${esc(path)}">${esc(v)}</textarea>`
    : `<input class="form-input" data-path="${esc(path)}" value="${esc(v)}"${f.kind === 'url' ? ' placeholder="https://…"' : ''}>`}</div>`;
}

function renderEditor() {
  const p = S.page;
  const blocks = _blocksById();
  const el = $('page-editor');
  el.innerHTML = `<div class="panel">
    <div class="row" style="justify-content:space-between"><div class="page-title">${esc(p.title || '（無題）')}</div><span class="chip ${esc(p.status)}">${STATUS_JA[p.status] || esc(p.status)}</span></div>
    ${p.url ? `<div><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a></div>` : ''}
    <div class="field"><label>タイトル</label><input class="form-input" id="pe-title" value="${esc(p.title || '')}"></div>
    <div class="field"><label>URL の一部</label><input class="form-input" id="pe-slug" value="${esc(p.slug || '')}"></div>
    <div class="field"><label>ブリーフ（AI が事実として使ってよいのはここだけ）</label><textarea class="form-input" id="pe-brief" style="min-height:110px">${esc(p.brief || '')}</textarea></div>
    <div class="row">
      <div class="field" style="flex:1"><label>デザインの型</label><select class="form-select" id="pe-design"><option value="">サイトの既定</option>${S.data.designs.map((x) => `<option value="${esc(x.id)}"${x.id === p.designId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field" style="flex:1"><label>参考サイト（Ctrl/⌘で複数）</label><select class="form-select" id="pe-refs" multiple size="3">${S.data.refs.map((r) => `<option value="${esc(r.id)}"${(p.refIds || []).includes(r.id) ? ' selected' : ''}>${esc(r.title || r.url)}</option>`).join('')}</select></div>
    </div>
    ${p.generationNotes ? `<div class="notes">AI からの申し送り: ${esc(p.generationNotes)}</div>` : ''}
    <div class="section-hd">セクション</div>
    <div id="pe-sections">${(p.blocks || []).map((s, i) => {
      const b = blocks[s.blockId];
      return `<details class="sec-card"><summary>${i + 1}. ${esc(b?.name || s.blockId)}
        <span class="ctl"><button class="act-btn" data-up="${i}">↑</button><button class="act-btn" data-down="${i}">↓</button><button class="act-btn cancel" data-rm="${i}">削除</button></span></summary>
        ${(b?.fields || []).map((f) => _fieldInput(f, s.content?.[f.key], `${i}.${f.key}`)).join('') || '<div class="muted">この型は見つかりません</div>'}
      </details>`;
    }).join('')}</div>
    <div class="row"><select class="form-select" id="pe-addsel" style="width:auto">${S.data.blocks.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select><button class="act-btn" id="pe-add">＋ セクションを足す</button></div>
    <div class="row" style="margin-top:14px">
      <button class="save-btn" id="pe-save">保存</button>
      <button class="act-btn" id="pe-gen">AIで書く</button>
      <button class="act-btn" id="pe-prev">プレビュー</button>
      <button class="act-btn" id="pe-approve">承認</button>
      <button class="act-btn" id="pe-reopen">確認待ちに戻す</button>
      <button class="act-btn" id="pe-dl">ダウンロード</button>
      <button class="act-btn danger" id="pe-del">削除</button>
    </div>
    <div class="muted" style="font-size:11px;margin-top:6px">費用 ${yen(p.costUsd)}（${p.costCalls || 0}回）・承認したページだけが公開されます。承認後に内容を変えると確認待ちに戻ります。</div>
  </div>
  <iframe class="preview" id="pe-frame" title="プレビュー" sandbox="allow-same-origin" style="margin-top:12px"></iframe>`;
  _bindEditor();
  preview();
}

function _collect() {
  const p = S.page;
  const blocks = (p.blocks || []).map((s) => ({ ...s, content: structuredClone(s.content || {}) }));
  document.querySelectorAll('#pe-sections [data-path]').forEach((inp) => {
    const parts = inp.dataset.path.split('.');
    let o = blocks[Number(parts.shift())].content;
    while (parts.length > 1) {
      const k = parts.shift();
      const next = /^\d+$/.test(parts[0]) ? [] : {};
      o[k] = o[k] ?? next; o = o[k];
    }
    o[parts[0]] = inp.value;
  });
  return {
    title: $('pe-title').value, slug: $('pe-slug').value, brief: $('pe-brief').value,
    designId: $('pe-design').value || null,
    refIds: [...$('pe-refs').selectedOptions].map((o) => o.value),
    blocks,
  };
}

function _bindEditor() {
  const sec = $('pe-sections');
  const mutate = (fn) => { const c = _collect(); fn(c.blocks); S.page = { ...S.page, ...c }; renderEditor(); };
  sec.querySelectorAll('[data-up]').forEach((b) => b.onclick = (e) => { e.preventDefault(); mutate((bl) => { const i = +b.dataset.up; if (i > 0) [bl[i - 1], bl[i]] = [bl[i], bl[i - 1]]; }); });
  sec.querySelectorAll('[data-down]').forEach((b) => b.onclick = (e) => { e.preventDefault(); mutate((bl) => { const i = +b.dataset.down; if (i < bl.length - 1) [bl[i + 1], bl[i]] = [bl[i], bl[i + 1]]; }); });
  sec.querySelectorAll('[data-rm]').forEach((b) => b.onclick = (e) => { e.preventDefault(); mutate((bl) => bl.splice(+b.dataset.rm, 1)); });
  sec.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => mutate((bl) => {
    const [i, ...path] = b.dataset.add.split('.');
    let o = bl[+i].content;
    for (const k of path.slice(0, -1)) o = o[k] = o[k] ?? (/^\d+$/.test(k) ? [] : {});
    const k = path[path.length - 1];
    o[k] = [...(Array.isArray(o[k]) ? o[k] : []), {}];
  }));
  sec.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => mutate((bl) => {
    const [i, ...path] = b.dataset.del.split('.');
    let o = bl[+i].content;
    for (const k of path.slice(0, -2)) o = o[k];
    o[path[path.length - 2]].splice(+path[path.length - 1], 1);
  }));
  $('pe-add').onclick = () => mutate((bl) => bl.push({ blockId: $('pe-addsel').value, content: {} }));
  $('pe-save').onclick = savePage;
  $('pe-gen').onclick = generate;
  $('pe-prev').onclick = async () => { await savePage(); };
  $('pe-approve').onclick = () => setStatus('approve');
  $('pe-reopen').onclick = () => setStatus('reopen');
  $('pe-dl').onclick = download;
  $('pe-del').onclick = async () => {
    if (!confirm('このページを削除しますか？')) return;
    await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    S.pageId = null; await load();
  };
}

async function _busy(btn, fn) {
  btn?.setAttribute('disabled', 'true');
  try { return await fn(); } catch (e) { toast(e.message, 'error'); return null; } finally { btn?.removeAttribute('disabled'); }
}
async function savePage() {
  return _busy($('pe-save'), async () => {
    S.page = await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}`, { method: 'PUT', body: _collect() });
    toast('保存しました', 'success');
    await _refreshList(); renderEditor();
  });
}
async function generate() {
  await savePage();
  return _busy($('pe-gen'), async () => {
    toast('AI が書いています（10〜30秒）…');
    await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}/generate`, { method: 'POST', body: {} });
    S.page = await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}`);
    toast('書けました。内容を確かめて承認してください', 'success');
    await _refreshList(); renderEditor();
  });
}
async function setStatus(action) {
  return _busy(null, async () => {
    S.page = { ...S.page, ...(await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}/status`, { method: 'POST', body: { action } })) };
    toast(action === 'approve' ? '承認しました（公開はサイトの「公開」から）' : '確認待ちに戻しました', 'success');
    await _refreshList(); renderEditor();
  });
}
async function preview() {
  const html = await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}/html`, { raw: true }).catch((e) => `<p style="font:14px sans-serif;padding:20px">${esc(e.message)}</p>`);
  const f = $('pe-frame'); if (f) f.srcdoc = html;
}
async function download() {
  const html = await api(`/api/sites/pages/${encodeURIComponent(S.page.id)}/html`, { raw: true });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${S.page.slug || 'page'}.html` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function publishSite(siteId) {
  if (!S.data.netlify.connected) { showTab('publish'); return; }
  await _busy($('site-publish'), async () => {
    const r = await api(`/api/sites/sites/${encodeURIComponent(siteId)}/publish`, { method: 'POST', body: {} });
    toast(`公開しました（${r.pages.length}ページ）`, 'success');
    await load();
  });
}
async function _refreshList() {
  S.data = await api('/api/sites/overview');
  const keep = S.page;
  renderPages();
  S.page = keep;
}

/* ═══ Design types ═══ */
function _swatch(d) { const c = d.tokens?.colors || {}; return `<span class="swatches">${['primary', 'accent', 'background', 'surface', 'text'].map((k) => `<span style="background:${esc(c[k] || '#ccc')}"></span>`).join('')}</span>`; }
const DENSITY = { compact: '詰める', normal: 'ふつう', airy: 'ゆったり' };
const COLOR_LABELS = { primary: '主色', accent: '強調色', background: '背景', surface: '面', text: '文字', muted: '薄い文字', onPrimary: '主色の上の文字' };

function renderDesigns() {
  const el = $('tab-designs');
  const ds = S.data.designs;
  S.designId = S.designId && ds.some((x) => x.id === S.designId) ? S.designId : ds[0]?.id;
  const d = ds.find((x) => x.id === S.designId) || {};
  const t = d.tokens || {}; const c = t.colors || {};
  el.innerHTML = `<div class="page-hd"><div class="page-title">デザインの型</div><span class="muted">ページ全体の見た目と語り口</span></div>
  <div class="grid2"><div>
    <div class="list">${ds.map((x) => `<div class="item${x.id === S.designId ? ' active' : ''}" data-design="${esc(x.id)}"><div><div class="t">${esc(x.name)}</div><div class="muted" style="font-size:11px">${esc(x.description || '')}</div></div>${_swatch(x)}</div>`).join('')}</div>
    <div class="panel" style="margin-top:12px">
      <div class="field"><label>名前</label><input class="form-input" id="de-name" value="${esc(d.name || '')}"></div>
      <div class="field"><label>説明</label><input class="form-input" id="de-desc" value="${esc(d.description || '')}"></div>
      <div class="field"><label>語り口（AI への指示）</label><textarea class="form-input" id="de-tone">${esc(d.tone || '')}</textarea></div>
      <div class="field"><label>想定読者</label><input class="form-input" id="de-aud" value="${esc(d.audience || '')}"></div>
      <div class="row">${Object.entries(COLOR_LABELS).map(([k, lab]) => `<label class="field" style="width:96px"><span style="font-size:11px">${lab}</span><input type="color" data-color="${k}" value="${esc(c[k] || '#888888')}"></label>`).join('')}</div>
      <div class="row">
        <div class="field"><label>角の丸み(px)</label><input class="form-input" id="de-radius" type="number" min="0" max="40" value="${esc(String(t.radius ?? 12))}" style="width:90px"></div>
        <div class="field"><label>余白</label><select class="form-select" id="de-density">${Object.entries(DENSITY).map(([k, v]) => `<option value="${k}"${t.density === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>最大幅(px)</label><input class="form-input" id="de-max" type="number" min="600" max="1600" value="${esc(String(t.maxWidth ?? 1040))}" style="width:100px"></div>
      </div>
      <div class="row"><button class="save-btn" id="de-save">保存</button><button class="act-btn" id="de-copy">複製</button>${d.isSystem ? '<span class="muted" style="font-size:11px">初期収録（編集すると以後は上書きされません）</span>' : '<button class="act-btn danger" id="de-del">削除</button>'}</div>
    </div></div>
    <iframe class="preview" id="de-frame" title="見本" sandbox="allow-same-origin"></iframe></div>`;
  el.querySelectorAll('[data-design]').forEach((it) => it.onclick = () => { S.designId = it.dataset.design; renderDesigns(); });
  const draft = () => ({ ...d, name: $('de-name').value, description: $('de-desc').value, tone: $('de-tone').value, audience: $('de-aud').value,
    tokens: { ...t, colors: Object.fromEntries([...el.querySelectorAll('[data-color]')].map((i) => [i.dataset.color, i.value])),
      radius: Number($('de-radius').value), density: $('de-density').value, maxWidth: Number($('de-max').value) } });
  let timer;
  const sample = () => { clearTimeout(timer); timer = setTimeout(async () => { $('de-frame').srcdoc = await api('/api/sites/sample', { method: 'POST', body: { design: draft() }, raw: true }).catch((e) => esc(e.message)); }, 250); };
  el.querySelectorAll('input,select,textarea').forEach((i) => i.addEventListener('input', sample));
  sample();
  $('de-save').onclick = () => _busy($('de-save'), async () => { const { id: _id, ...body } = draft(); await api(`/api/sites/designs/${encodeURIComponent(d.id)}`, { method: 'PUT', body }); toast('保存しました', 'success'); await load(); });
  $('de-copy').onclick = () => _busy($('de-copy'), async () => { const r = await api('/api/sites/designs', { method: 'POST', body: { fromId: d.id } }); S.designId = r.id; await load(); });
  if ($('de-del')) $('de-del').onclick = () => _busy($('de-del'), async () => { if (!confirm('削除しますか？')) return; await api(`/api/sites/designs/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); S.designId = null; await load(); });
}

/* ═══ Section types ═══ */
function renderBlocks() {
  const el = $('tab-blocks');
  const bs = S.data.blocks;
  S.blockId = S.blockId && bs.some((x) => x.id === S.blockId) ? S.blockId : bs[0]?.id;
  const b = bs.find((x) => x.id === S.blockId) || {};
  el.innerHTML = `<div class="page-hd"><div class="page-title">セクションの型</div><span class="muted">ページを組み立てる部品。項目・テンプレート・CSS・書き方の指示</span></div>
  <div class="grid2"><div>
    <div class="list">${bs.map((x) => `<div class="item${x.id === S.blockId ? ' active' : ''}" data-block="${esc(x.id)}"><div><div class="t">${esc(x.name)}</div><div class="muted" style="font-size:11px">${esc(x.type)} ・ ${esc(x.description || '')}</div></div></div>`).join('')}</div>
    <div class="panel" style="margin-top:12px">
      <div class="row"><div class="field" style="flex:1"><label>名前</label><input class="form-input" id="be-name" value="${esc(b.name || '')}"></div>
        <div class="field" style="width:140px"><label>種類（type）</label><input class="form-input" id="be-type" value="${esc(b.type || '')}"></div></div>
      <div class="field"><label>説明</label><input class="form-input" id="be-desc" value="${esc(b.description || '')}"></div>
      <div class="field"><label>書き方の指示（AI へ）</label><textarea class="form-input" id="be-guide">${esc(b.guide || '')}</textarea></div>
      <div class="field"><label>項目（JSON: key・label・kind[text|longtext|url|list]・maxLength・itemFields）</label><textarea class="form-input code" id="be-fields">${esc(JSON.stringify(b.fields || [], null, 2))}</textarea></div>
      <div class="field"><label>テンプレート（{{key}}・{{#list}}…{{/list}}・{{?key}}…{{/key}}・{{^key}}…{{/key}}。値は自動でエスケープ）</label><textarea class="form-input code" id="be-tpl">${esc(b.template || '')}</textarea></div>
      <div class="field"><label>CSS（.blk-${esc(b.type || 'type')} から書く。var(--primary) などデザインの型の変数が使える）</label><textarea class="form-input code" id="be-css">${esc(b.css || '')}</textarea></div>
      <div class="field"><label>見本の値（JSON）</label><textarea class="form-input code" id="be-sample">${esc(JSON.stringify(b.sample || {}, null, 2))}</textarea></div>
      <div class="field"><label>見本を表示するデザインの型</label><select class="form-select" id="be-design">${S.data.designs.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div>
      <div class="row"><button class="save-btn" id="be-save">保存</button><button class="act-btn" id="be-copy">複製</button>${b.isSystem ? '<span class="muted" style="font-size:11px">初期収録（編集すると以後は上書きされません）</span>' : '<button class="act-btn danger" id="be-del">削除</button>'}</div>
      <div id="be-err" class="muted" style="color:var(--red)"></div>
    </div></div>
    <iframe class="preview" id="be-frame" title="見本" sandbox="allow-same-origin"></iframe></div>`;
  el.querySelectorAll('[data-block]').forEach((it) => it.onclick = () => { S.blockId = it.dataset.block; renderBlocks(); });
  const draft = () => {
    const parse = (id) => { try { return JSON.parse($(id).value || 'null'); } catch { throw new Error(`${id === 'be-fields' ? '項目' : '見本の値'} の JSON が正しくありません`); } };
    return { name: $('be-name').value, type: $('be-type').value.replace(/[^\w-]/g, ''), description: $('be-desc').value, guide: $('be-guide').value,
      fields: parse('be-fields') || [], template: $('be-tpl').value, css: $('be-css').value, sample: parse('be-sample') || {} };
  };
  let timer;
  const sample = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try { $('be-err').textContent = ''; $('be-frame').srcdoc = await api('/api/sites/sample', { method: 'POST', body: { block: { id: b.id, ...draft() }, designId: $('be-design').value }, raw: true }); }
    catch (e) { $('be-err').textContent = e.message; }
  }, 300); };
  el.querySelectorAll('input,select,textarea').forEach((i) => i.addEventListener('input', sample));
  sample();
  $('be-save').onclick = () => _busy($('be-save'), async () => { await api(`/api/sites/blocks/${encodeURIComponent(b.id)}`, { method: 'PUT', body: draft() }); toast('保存しました', 'success'); await load(); });
  $('be-copy').onclick = () => _busy($('be-copy'), async () => { const r = await api('/api/sites/blocks', { method: 'POST', body: { fromId: b.id } }); S.blockId = r.id; await load(); });
  if ($('be-del')) $('be-del').onclick = () => _busy($('be-del'), async () => { if (!confirm('削除しますか？')) return; await api(`/api/sites/blocks/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); S.blockId = null; await load(); });
}

/* ═══ Reference sites ═══ */
function renderRefs() {
  const el = $('tab-refs');
  el.innerHTML = `<div class="page-hd"><div class="page-title">参考サイト</div><span class="muted">真似たい点・避けたい点をメモしておき、ページに紐付けると AI に渡ります（中身は取得しません）</span></div>
    <div class="panel" style="margin-bottom:12px">
      <div class="row"><input class="form-input" id="rf-url" placeholder="https://…" style="flex:2"><input class="form-input" id="rf-title" placeholder="名前" style="flex:1"></div>
      <div class="field" style="margin-top:8px"><textarea class="form-input" id="rf-note" placeholder="参考にする点・避ける点"></textarea></div>
      <button class="save-btn" id="rf-add">登録</button>
    </div>
    <div class="list">${S.data.refs.map((r) => `<div class="item" style="cursor:default"><div><div class="t"><a href="${esc(/^https?:/.test(r.url) ? r.url : '#')}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a></div><div class="muted" style="font-size:12px;white-space:pre-line">${esc(r.note || '')}</div></div><button class="act-btn cancel" data-rfdel="${esc(r.id)}">削除</button></div>`).join('') || '<div class="muted">まだありません</div>'}</div>`;
  $('rf-add').onclick = () => _busy($('rf-add'), async () => { await api('/api/sites/refs', { method: 'POST', body: { url: $('rf-url').value, title: $('rf-title').value, note: $('rf-note').value } }); await load(); showTab('refs'); });
  el.querySelectorAll('[data-rfdel]').forEach((b) => b.onclick = () => _busy(b, async () => { await api(`/api/sites/refs/${encodeURIComponent(b.dataset.rfdel)}`, { method: 'DELETE' }); await load(); showTab('refs'); }));
}

/* ═══ Publishing ═══ */
function renderPublish() {
  const el = $('tab-publish');
  const ok = S.data.netlify.connected;
  el.innerHTML = `<div class="page-hd"><div class="page-title">公開設定</div></div>
    <div class="panel">
      <div class="row"><b>Netlify</b><span class="chip ${ok ? 'published' : 'unpublished'}">${ok ? '接続済み' : '未接続'}</span></div>
      ${ok ? '<p class="muted">サイトごとに Netlify のサイトが1つ作られ、承認済みのページが /URLの一部/ に公開されます。</p>'
        : `<p class="muted" style="line-height:1.7">まだ公開はできません。プレビューとダウンロードは使えます。接続するには:<br>
          1. Netlify のアカウントを作る<br>2. User settings → Applications → Personal access tokens で新しいトークンを作る<br>
          3. hachi-core の Secret Manager に <code>hachi-sec-024</code>（HACHI_NETLIFY_TOKEN）として保存し、Cloud Run に反映する</p>`}
    </div>
    <div class="section-hd">サイト</div>
    <div class="list">${S.data.sites.map((s) => `<div class="item" style="cursor:default"><div><div class="t">${esc(s.name)}</div><div class="muted" style="font-size:11px">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : '未公開'}${s.publishedAt ? ` ・ ${esc(String(s.publishedAt).slice(0, 16).replace('T', ' '))}` : ''}</div></div></div>`).join('') || '<div class="muted">まだありません</div>'}</div>`;
}

const _initial = (location.hash || '').slice(1);
load().then(() => { if (['pages', 'designs', 'blocks', 'refs', 'publish'].includes(_initial)) showTab(_initial); })
  .catch((e) => _note(`読み込めませんでした: ${e.message}`));
