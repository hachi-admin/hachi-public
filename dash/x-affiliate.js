/* global sessionStorage, TextEncoder */
/* X affiliate administration. Uses the verified dashboard identity to mint an isolated X session. */
(function () {
  'use strict';
  const API_ORIGIN = 'https://hachi-core-685554938840.asia-northeast1.run.app';
  const FEATURE_ENABLED = true;
  const VERIFIER_KEY = 'hachi-x-oauth-verifier';
  const PROOF_KEY = 'hachi-x-browser-proof';
  const pendingCode = new URLSearchParams(location.hash.slice(1)).get('x_code');
  if (pendingCode) history.replaceState({}, '', location.pathname + location.search + '#xentry');
  let xJwt = '';
  let browserProof = '';
  let sessionTimer = 0;
  let sharedAuthPending = false;
  let sharedAuthError = '';
  const PANEL_DEFINITIONS = [
    { id: 'products', label: '商品登録' },
    { id: 'templates', label: 'テンプレート' },
    { id: 'review', label: '投稿・レビュー' },
    { id: 'operations', label: '運用状況' },
    { id: 'account', label: 'アカウント設定' },
  ];
  let state = { context: null, accountId: '', activePanel: 'products', generation: 0, loadGeneration: 0, linkGeneration: 0, previewGeneration: 0, skillDrafts: new Map(), generationJobs: new Map(), draftJobs: new Map(), productCatalog: [], settings: null, budget: null, notifications: null, importResult: null, skillPreview: null, link: null, linkStartPending: false, linkStatusPending: false, linkFinalizePending: false };
  let retryState = new WeakMap();
  let pendingWrites = new WeakSet();
  async function keyFor(form, payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    const prior = retryState.get(form);
    if (prior?.fingerprint === fingerprint) return prior.key;
    const next = { fingerprint, key: random() };
    retryState.set(form, next);
    return next.key;
  }
  function clearRetry(form) { retryState.delete(form); }
  function beginWrite(form) { if (pendingWrites.has(form)) return false; pendingWrites.add(form); return true; }
  function endWrite(form) { pendingWrites.delete(form); }
  const el = (tag, props, children) => {
    const n = document.createElement(tag);
    if (tag === 'form') n.addEventListener('submit', event => event.preventDefault());
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else if (k === 'className') n.className = v; else if (k === 'disabled') n.disabled = v; else n.setAttribute(k, v); });
    (children || []).forEach(c => n.append(c));
    return n;
  };
  const cleanFragment = () => { if (location.hash.startsWith('#x_code')) history.replaceState({}, '', location.pathname + location.search); };
  const random = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); };
  async function challenge(v) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  const headers = () => { const h = { Accept: 'application/json' }; if (xJwt) h.Authorization = `Bearer ${xJwt}`; if (browserProof) h['X-XAuth-Browser-Proof'] = browserProof; return h; };
  const expired = () => { try { const p = JSON.parse(atob(xJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return !p.exp || p.exp <= Math.floor(Date.now() / 1000); } catch { return true; } };
  async function api(path, options) {
    if (!FEATURE_ENABLED) throw Object.assign(new Error('X投稿BOTは現在停止中です'), { code: 'disabled' });
    if (!xJwt || expired()) { logout(); throw Object.assign(new Error('認証の有効期限が切れました。再ログインしてください'), { code: 401 }); }
    const r = await fetch(`${API_ORIGIN}${path}`, { ...options, headers: { ...headers(), ...(options && options.headers || {}) } });
    let body = {}; try { body = await r.json(); } catch {}
    if (r.status === 401) { logout(); throw Object.assign(new Error('認証の有効期限が切れました。再ログインしてください'), { code: 401 }); }
    if (!r.ok) throw Object.assign(new Error(body.error?.message || `操作に失敗しました (${r.status})`), { code: r.status, body });
    return body;
  }
  function logout() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = 0;
    state.generation += 1;
    state.loadGeneration += 1;
    state.context = null;
    state.accountId = '';
    state.activePanel = 'products';
    state.linkGeneration += 1;
    state.previewGeneration += 1;
    state.link = null;
    state.linkStartPending = false;
    state.linkStatusPending = false;
    state.linkFinalizePending = false;
    state.settings = null;
    state.budget = null;
    state.notifications = null;
    state.importResult = null;
    state.skillPreview = null;
    state.productCatalog = [];
    state.skillDrafts.clear();
    state.generationJobs.clear(); state.draftJobs.clear();
    retryState = new WeakMap();
    pendingWrites = new WeakSet();
    xJwt = '';
    browserProof = '';
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(PROOF_KEY);
    document.querySelectorAll('#page-x-affiliate input[type="password"]').forEach(input => { input.value = ''; });
    ['#x-accounts', '#x-members', '#x-tags', '#x-products', '#x-skills', '#x-drafts', '#x-link', '#x-settings'].forEach(selector => {
      document.querySelector(selector)?.replaceChildren();
    });
    ['#x-budget', '#x-notifications'].forEach(selector => document.querySelector(selector)?.replaceChildren());
    const root = document.getElementById('page-x-affiliate');
    if (root?.classList.contains('active')) render(root);
  }
  function message(root, text, kind) { let m = root.querySelector('.x-status'); if (!m) { m = el('p', { className: 'x-status' }); root.prepend(m); } m.textContent = text; m.dataset.kind = kind || ''; }
  function syncNavigation(active) {
    const desktop = document.getElementById('x-affiliate-entry');
    const mobile = document.getElementById('x-affiliate-mobile-entry');
    [desktop, mobile].forEach(button => {
      if (!button) return;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (active) document.querySelectorAll('.nav-pill[data-dest], .mob-tab[data-dest]').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });
  }
  function isAdmin() { return state.context?.member?.role === 'admin'; }
  function enforceMemberUI() {
    if (isAdmin()) return;
    document.querySelector('#x-accounts form[data-admin-only]')?.remove();
    document.querySelector('#x-members form[data-admin-only]')?.remove();
    document.querySelector('#x-tags form[data-admin-only]')?.remove();
    document.querySelectorAll('#x-skills form[data-admin-only], #x-skills button[data-admin-only]').forEach(node => node.remove());
    document.querySelector('#x-settings [name="reviewChannelRef"]')?.closest('label')?.remove();
  }
  function field(label, type, name, value, placeholder) { const input = el(type === 'textarea' ? 'textarea' : 'input', { name, className: 'form-input', type: type === 'textarea' ? undefined : type, placeholder: placeholder || '' }); if (value != null) input.value = value; return el('label', { className: 'x-field' }, [el('span', { text: label }), input]); }
  function checkbox(label, name, checked) { const input = el('input', { name, className: 'form-input', type: 'checkbox' }); input.checked = checked === true; return el('label', { className: 'x-field x-check' }, [input, el('span', { text: label })]); }
  function selectField(label, name, value, options) { const select = el('select', { name, className: 'form-select' }, options.map(option => el('option', { text: option, value: option }))); select.value = value; return el('label', { className: 'x-field' }, [el('span', { text: label }), select]); }
  function button(text, fn, disabled) { const b = el('button', { className: 'act-btn', type: 'button', disabled }); b.textContent = text; b.addEventListener('click', fn); return b; }
  function card(title, content) { return el('article', { className: 'x-card' }, [el('h3', { text: title }), content]); }
  function activatePanel(panelId, focus = false) {
    if (!PANEL_DEFINITIONS.some(panel => panel.id === panelId)) return;
    state.activePanel = panelId;
    const root = document.getElementById('page-x-affiliate');
    if (!root) return;
    root.querySelectorAll('.x-section-tab').forEach(tab => {
      const active = tab.dataset.panel === panelId;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    root.querySelectorAll('.x-section-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== panelId; });
  }
  function sectionNavigation() {
    const tabs = PANEL_DEFINITIONS.map(panel => {
      const tab = el('button', {
        className: 'x-section-tab',
        type: 'button',
        role: 'tab',
        id: `x-tab-${panel.id}`,
        'aria-controls': `x-panel-${panel.id}`,
        'data-panel': panel.id,
        text: panel.label,
      });
      tab.addEventListener('click', () => activatePanel(panel.id));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = PANEL_DEFINITIONS.findIndex(item => item.id === panel.id);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? PANEL_DEFINITIONS.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + PANEL_DEFINITIONS.length) % PANEL_DEFINITIONS.length;
        activatePanel(PANEL_DEFINITIONS[next].id, true);
      });
      return tab;
    });
    return el('div', { className: 'x-section-tabs', role: 'tablist', 'aria-label': 'X BOT管理メニュー' }, tabs);
  }
  function sectionPanel(panelId, children) {
    const panel = el('section', {
      className: 'x-section-panel',
      role: 'tabpanel',
      id: `x-panel-${panelId}`,
      'aria-labelledby': `x-tab-${panelId}`,
      'data-panel': panelId,
    }, children);
    panel.hidden = panelId !== state.activePanel;
    return panel;
  }
  function render(root) {
    syncNavigation(true);
    document.querySelectorAll('.page.active').forEach(p => p.classList.remove('active'));
    root.classList.add('active'); root.hidden = false;
    root.replaceChildren();
    root.append(el('div', { className: 'page-hd' }, [el('div', {}, [el('div', { className: 'page-title', text: 'X投稿BOT 管理' }), el('div', { className: 'page-sub', text: 'アカウント・商品・Skill・メンバー・タグ・投稿設定' })]) ]));
    if (!FEATURE_ENABLED) { root.append(card('利用停止中', el('p', { className: 'x-muted', text: 'X投稿BOT管理APIは現在無効です。商品登録はローカル検証段階で、実商品取得、Skill、生成、レビュー、通知送信は有効化されていません。' }))); return; }
    if (!xJwt) {
      const text = sharedAuthPending ? 'サイトのログイン情報を引き継いでいます…' : (sharedAuthError || 'サイトへの再ログインが必要です。');
      const children = [el('p', { className: 'x-muted', text })];
      if (!sharedAuthPending) children.push(button('サイトへ再ログイン', login));
      root.append(card('ログイン', el('div', {}, children)));
      return;
    }
    const toolbar = el('div', { className: 'x-toolbar' }, [button('再読み込み', load), button('サインアウト', logout)]); root.append(toolbar);
    root.append(sectionNavigation());
    root.append(sectionPanel('account', [
      card('アカウント', el('div', { id: 'x-accounts' }, [
        el('p', { className: 'x-muted', text: '投稿先ごとの商品・タグ・下書きをまとめる管理枠です。Xへのログイン連携ではありません。' }),
        el('p', { className: 'x-muted', text: '読み込み中…' }),
      ])),
      card('タグ（実値は保存後に消去）', el('div', { id: 'x-tags' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
      card('Discord連携', el('div', { id: 'x-link' }, [el('p', { className: 'x-muted', text: '本人連携状態を確認中…' })])),
      card('メンバー', el('div', { id: 'x-members' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])),
    ]));
    root.append(sectionPanel('products', [
      card('商品（手入力）', el('div', { id: 'x-products' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
    ]));
    root.append(sectionPanel('templates', [
      card('プロフィール・テンプレート・通知先・定期', el('div', { id: 'x-settings' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
      card('テンプレート・Skill', el('div', { id: 'x-skills' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
    ]));
    root.append(sectionPanel('review', [
      card('候補文の生成・比較レビュー', el('div', { id: 'x-drafts' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
    ]));
    root.append(sectionPanel('operations', [
      card('予算・予約状況', el('div', { id: 'x-budget' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
      card('通知状況', el('div', { id: 'x-notifications' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
    ]));
    activatePanel(state.activePanel);
    renderLinkCard();
    load();
  }
  const formData = form => Object.fromEntries(new FormData(form).entries());
  function splitCsvList(value) {
    return String(value || '').split(/\r?\n|[|;、]/).map(item => item.trim()).filter(Boolean);
  }
  function splitTagList(value) {
    return String(value || '').split(/\r?\n|[,|;、]/).map(item => item.trim()).filter(Boolean);
  }
  function csvField(row, names) {
    for (const name of names) {
      const value = row[name];
      if (value !== undefined && String(value).trim()) return String(value).trim();
    }
    return '';
  }
  function parseCsv(text) {
    const rows = []; let row = []; let value = ''; let quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index]; const next = source[index + 1];
      if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted && (char === ',' || char === '\t')) { row.push(value); value = ''; continue; }
      if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(value); value = '';
        if (row.some(cell => String(cell).trim())) rows.push(row);
        row = []; continue;
      }
      value += char;
    }
    row.push(value);
    if (row.some(cell => String(cell).trim())) rows.push(row);
    if (rows.length < 2) throw new Error('CSVは見出し行とデータ行を1行以上入力してください');
    const headers = rows.shift().map(header => String(header).trim().toLowerCase());
    if (!headers.some(header => ['url', '商品url', 'amazonurl', 'asin'].includes(header))) throw new Error('CSVには url または asin 列が必要です');
    return rows.map(cells => Object.fromEntries(headers.map((header, column) => [header, String(cells[column] || '').trim()])));
  }
  function csvRows(text) {
    return parseCsv(text).map((row, index) => {
      const asin = csvField(row, ['asin']);
      let url = csvField(row, ['url', '商品url', 'amazonurl']);
      if (!url && /^[A-Za-z0-9]{10}$/.test(asin)) url = `https://www.amazon.co.jp/dp/${asin}`;
      if (!url) throw new Error(`${index + 2}行目: url または10桁の asin が必要です`);
      const fields = {};
      const name = csvField(row, ['name', '商品名']); if (name) fields.name = name;
      const features = splitCsvList(csvField(row, ['features', 'feature', '特徴'])); if (features.length) fields.features = features;
      const facts = splitCsvList(csvField(row, ['facts', 'fact', '事実'])).map(item => {
        const separator = item.indexOf('|') >= 0 ? item.indexOf('|') : item.indexOf(':');
        if (separator < 1 || separator === item.length - 1) throw new Error(`${index + 2}行目: facts は「種類 | 内容」で入力してください`);
        return { type: item.slice(0, separator).trim(), value: item.slice(separator + 1).trim() };
      });
      if (facts.length) fields.facts = facts;
      const tags = splitTagList(csvField(row, ['tags', 'tag', 'タグ'])); if (tags.length) fields.tags = tags;
      const sourceNote = csvField(row, ['source', 'sourcenote', '確認元', 'ソース']);
      if (Object.keys(fields).length && !sourceNote) throw new Error(`${index + 2}行目: 手入力項目には source（確認元・理由）が必要です`);
      const enabled = csvField(row, ['enabled', '利用']);
      if (enabled) fields.enabled = !['0', 'false', 'no', 'off', '停止'].includes(enabled.toLowerCase());
      const scheduleEnabled = csvField(row, ['scheduleenabled', '定期生成']);
      if (scheduleEnabled) fields.scheduleEnabled = ['1', 'true', 'yes', 'on', '有効'].includes(scheduleEnabled.toLowerCase());
      return { rowNumber: index + 2, url, fields, sourceNote };
    });
  }
  function invalidateSkillPreview() {
    state.previewGeneration += 1;
    state.skillPreview = null;
    document.querySelector('#x-skills .x-skill-preview')?.remove();
  }
  function draftValues(form) {
    const values = formData(form);
    form.querySelectorAll('input[type="checkbox"][name]').forEach(input => { values[input.name] = input.checked ? 'on' : 'off'; });
    return values;
  }
  function trackDraft(form, key, revision) {
    form.dataset.draftKey = key;
    form.dataset.revision = String(revision ?? '');
    const mark = () => {
      form.dataset.dirty = 'true';
      state.skillDrafts.set(key, { values: draftValues(form), revision: form.dataset.revision || String(revision ?? '') });
    };
    form.addEventListener('input', mark);
    form.addEventListener('change', mark);
  }
  function captureSkillDrafts() {
    document.querySelectorAll('#x-skills form[data-draft-key]').forEach(form => {
      if (form.dataset.dirty !== 'true') return;
      state.skillDrafts.set(form.dataset.draftKey, { values: draftValues(form), revision: form.dataset.revision || '' });
    });
  }
  function restoreDraft(form, key) {
    const draft = state.skillDrafts.get(key);
    if (!draft) return;
    form.dataset.revision = draft.revision;
    Object.entries(draft.values).forEach(([name, value]) => {
      const input = form.elements.namedItem(name);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = value === 'on';
      else input.value = value;
    });
    form.dataset.dirty = 'true';
  }
  function renderAccounts(data, loadGeneration) {
    const box = document.getElementById('x-accounts');
    if (!box) return;
    box.replaceChildren();
    box.append(el('p', { className: 'x-muted', text: 'ここで作るアカウントは、投稿先ごとの商品・タグ・下書きをまとめる管理枠です。1件だけ登録されている場合は自動で選択されます。' }));
    (data.accounts || []).forEach(a => {
      const b = button(`${a.label} (${a.accountId})`, () => {
        if (state.accountId !== a.accountId) { state.importResult = null; state.skillPreview = null; state.budget = null; state.notifications = null; state.generationJobs.clear(); state.draftJobs.clear(); }
        state.accountId = a.accountId;
        document.querySelectorAll('#x-accounts .x-account-select').forEach(item => {
          const selected = item.dataset.accountId === state.accountId;
          item.classList.toggle('selected', selected);
          item.setAttribute('aria-pressed', String(selected));
        });
        loadSettings();
      });
      b.classList.add('x-account-select');
      b.dataset.accountId = a.accountId;
      b.setAttribute('aria-pressed', String(state.accountId === a.accountId));
      if (state.accountId === a.accountId) b.classList.add('selected');
      const row = el('div', { className: 'x-row' }, [
        b,
        el('span', { className: 'x-muted', text: `${a.market} · ${a.enabled === false ? '停止' : '有効'}` }),
      ]);
      if (isAdmin()) {
        const f = el('form', { className: 'x-inline-form', 'data-admin-only': 'true' }, [
          field('表示名', 'text', 'label', a.label),
          checkbox('有効', 'enabled', a.enabled !== false),
          button('保存', async e => {
            e.preventDefault();
            if (!f.isConnected || !isCurrentLoad(loadGeneration) || !beginWrite(f)) return;
            const d = formData(f);
            const fields = { label: d.label, enabled: d.enabled === 'on' };
            const body = { expectedRevision: a.revision, fields };
            try {
              await api(`/api/x-affiliate/accounts/${encodeURIComponent(a.accountId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              clearRetry(f);
              endWrite(f);
              if (isCurrentLoad(loadGeneration)) await load();
            } catch (x) {
              endWrite(f);
              if (f.isConnected && isCurrentLoad(loadGeneration)) {
                message(f, x.message + (x.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
              }
            }
          }),
        ]);
        row.append(f);
      }
      box.append(row);
    });
    if (isAdmin()) {
      const f = el('form', { className: 'x-form', 'data-admin-only': 'true' }, [
        field('管理枠の表示名（例: メイン）', 'text', 'label'),
        el('select', { name: 'market', className: 'form-select' }, [el('option', { text: 'JP', value: 'JP' })]),
        button('アカウントを作成', async e => {
          e.preventDefault();
          if (!f.isConnected || !isCurrentLoad(loadGeneration) || !beginWrite(f)) return;
          const d = formData(f);
          if (!d.label) { endWrite(f); return; }
          let key;
          try {
            key = await keyFor(f, { operation: 'account-create', label: d.label, market: d.market });
          } catch (x) {
            endWrite(f);
            if (f.isConnected && isCurrentLoad(loadGeneration)) message(f, x.message, 'error');
            return;
          }
          if (!f.isConnected || !isCurrentLoad(loadGeneration)) { endWrite(f); return; }
          const body = { label: d.label, market: d.market, idempotencyKey: key };
          try {
            await api('/api/x-affiliate/accounts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            clearRetry(f);
            endWrite(f);
            if (isCurrentLoad(loadGeneration)) {
              f.reset();
              await load();
            }
          } catch (x) {
            endWrite(f);
            if (f.isConnected && isCurrentLoad(loadGeneration)) message(f, x.message, 'error');
          }
        }),
      ]);
      box.append(f);
    }
  }
  function renderMembers(data, loadGeneration) {
    const box = document.getElementById('x-members');
    if (!box) return;
    box.replaceChildren();
    box.append(el('p', { className: 'x-muted', text: 'X投稿BOTを使えるGitHubユーザーの権限設定です。adminはアカウント・メンバー・タグなどを管理し、memberは担当accountの登録・編集・候補文レビューを行います。' }));
    (data.members || []).forEach(m => {
      const row = el('div', { className: 'x-row' }, [
        el('span', { text: `${m.memberId} · ${m.status}` }),
        el('span', { className: 'x-muted', text: `${m.role} · ${(m.accountIds || []).join(', ')}` }),
      ]);
      if (m.status !== 'revoked') {
        const updateForm = el('form', { className: 'x-inline-form', 'data-admin-only': 'true' }, [
          selectField('権限', 'role', m.role, ['admin', 'member']),
          field('担当account IDs（カンマ区切り）', 'text', 'accountIds', (m.accountIds || []).join(',')),
          button('保存', async e => {
            e.preventDefault();
            if (!updateForm.isConnected || !isCurrentLoad(loadGeneration) || !beginWrite(updateForm)) return;
            const d = formData(updateForm);
            const fields = { role: d.role, accountIds: d.accountIds.split(',').map(x => x.trim()).filter(Boolean) };
            try {
              await api(`/api/x-affiliate/members/${encodeURIComponent(m.memberId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expectedRevision: m.revision, fields }),
              });
              clearRetry(updateForm);
              endWrite(updateForm);
              if (isCurrentLoad(loadGeneration)) await load();
            } catch (x) {
              endWrite(updateForm);
              if (updateForm.isConnected && isCurrentLoad(loadGeneration)) message(updateForm, x.message + (x.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
            }
          }),
        ]);
        const revokeForm = el('form', { className: 'x-inline-form', 'data-admin-only': 'true' }, [
          field('失効理由（必須）', 'text', 'reason'),
          button('失効', async e => {
            e.preventDefault();
            if (!revokeForm.isConnected || !isCurrentLoad(loadGeneration)) return;
            const d = formData(revokeForm);
            if (!d.reason || !window.confirm('このメンバーを失効しますか？')) return;
            if (!beginWrite(revokeForm)) return;
            try {
              await api(`/api/x-affiliate/members/${encodeURIComponent(m.memberId)}/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expectedRevision: m.revision, reason: d.reason }),
              });
              clearRetry(revokeForm);
              endWrite(revokeForm);
              if (isCurrentLoad(loadGeneration)) await load();
            } catch (x) {
              endWrite(revokeForm);
              if (revokeForm.isConnected && isCurrentLoad(loadGeneration)) message(revokeForm, x.message, 'error');
            }
          }),
        ]);
        row.append(updateForm, revokeForm);
      }
      box.append(row);
    });
    const f = el('form', { className: 'x-form', 'data-admin-only': 'true' }, [
      field('GitHub ID', 'text', 'githubUserId'),
      selectField('権限', 'role', 'member', ['admin', 'member']),
      field('担当account IDs（カンマ区切り）', 'text', 'accountIds'),
      button('メンバーを追加', async e => {
        e.preventDefault();
        if (!f.isConnected || !isCurrentLoad(loadGeneration) || !beginWrite(f)) return;
        const d = formData(f);
        const accountIds = d.accountIds.split(',').map(x => x.trim()).filter(Boolean);
        const payload = { githubUserId: d.githubUserId, role: d.role, accountIds };
        let key;
        try {
          key = await keyFor(f, { operation: 'member-create', ...payload });
        } catch (x) {
          endWrite(f);
          if (f.isConnected && isCurrentLoad(loadGeneration)) message(f, x.message, 'error');
          return;
        }
        if (!f.isConnected || !isCurrentLoad(loadGeneration)) { endWrite(f); return; }
        const body = { ...payload, idempotencyKey: key };
        try {
          await api('/api/x-affiliate/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          clearRetry(f);
          endWrite(f);
          if (isCurrentLoad(loadGeneration)) {
            f.reset();
            await load();
          }
        } catch (x) {
          endWrite(f);
          if (f.isConnected && isCurrentLoad(loadGeneration)) message(f, x.message, 'error');
        }
      }),
    ]);
    box.append(f);
  }
  function importResult(result, accountId, generation) {
    const list = el('div', { className: 'x-import-results' });
    (result.rows || []).forEach(row => list.append(el('div', { className: 'x-row' }, [
      el('span', { text: `${row.row}行目 · ${row.status}` }),
      el('span', { className: 'x-muted', text: row.productId || row.errorCode || '結果なし' }),
    ])));
    const retryable = (result.rows || []).filter(row => row.status === 'failed' || row.status === 'needs_completion').map(row => row.row);
    if (retryable.length) list.append(button('失敗・不足行を再試行', async () => {
      if (!isCurrentScope(accountId, generation)) return;
      try {
        await api(`/api/x-affiliate/imports/${encodeURIComponent(result.importId)}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIds: retryable, expectedRevision: result.revision }) });
        const refreshed = await api(`/api/x-affiliate/imports/${encodeURIComponent(result.importId)}`);
        if (!isCurrentScope(accountId, generation)) return;
        state.importResult = { accountId, result: refreshed };
        await loadProducts(accountId, generation);
      } catch (error) {
        if (isCurrentScope(accountId, generation)) message(list, error.message + (error.code === 409 ? ' 最新の受付結果を再確認してください。' : ''), 'error');
      }
    }));
    return list;
  }
  function renderProducts(data, accountId, generation) {
    const box = document.getElementById('x-products');
    if (!box || !isCurrentScope(accountId, generation)) return;
    state.productCatalog = data.products || [];
    const draftForm = document.querySelector('#x-drafts .x-generation-form');
    if (draftForm) syncProductPicker(draftForm.querySelector('[name="productPicker"]'), draftForm.querySelector('[name="productIds"]'));
    invalidateSkillPreview();
    box.replaceChildren();
    const importForm = el('form', { className: 'x-form x-product-import' }, [
      field('Amazon商品URL（1行1件・最大20件）', 'textarea', 'urls', null, 'https://www.amazon.co.jp/dp/...'),
      button('商品URLを登録', async event => {
        event.preventDefault();
        if (!importForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(importForm)) return;
        const urls = String(formData(importForm).urls || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        if (!urls.length || urls.length > 20) { endWrite(importForm); message(importForm, 'URLは1〜20件で入力してください', 'error'); return; }
        let clientRequestId;
        try { clientRequestId = await keyFor(importForm, { operation: 'product-import', accountId, urls }); }
        catch (error) { endWrite(importForm); if (isCurrentScope(accountId, generation)) message(importForm, error.message, 'error'); return; }
        if (!importForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(importForm); return; }
        try {
          const result = await api('/api/x-affiliate/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, urls, clientRequestId }) });
          clearRetry(importForm); endWrite(importForm);
          if (!isCurrentScope(accountId, generation)) return;
          importForm.querySelector('textarea').value = '';
          state.importResult = { accountId, result };
          await loadProducts(accountId, generation);
        } catch (error) {
          endWrite(importForm);
          if (importForm.isConnected && isCurrentScope(accountId, generation)) message(importForm, error.message + (error.code === 409 ? ' 同じ受付IDの入力が変わっています。入力は保持しています。' : ''), 'error');
        }
      }),
    ]);
    box.append(importForm);
    const csvFile = el('input', { name: 'csvFile', className: 'form-input', type: 'file', accept: '.csv,text/csv' });
    const csvForm = el('form', { className: 'x-form x-product-csv-import' }, [
      el('p', { className: 'x-muted', text: 'CSV列: url または asin, name, features, facts, source, tags, enabled, scheduleEnabled。featuresは「|」区切り、tagsは「|」またはカンマ区切り、factsは「種類 | 内容」を複数入力します。商品ごとのtagsは管理用ラベルです。Amazonアソシエイト追跡タグはアカウント設定で管理します。' }),
      el('label', { className: 'x-field' }, [el('span', { text: '商品CSV（UTF-8）' }), csvFile]),
      button('CSVを取り込む', async event => {
        event.preventDefault();
        if (!csvFile.files?.[0] || !csvForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(csvForm)) return;
        try {
          const rows = csvRows(await csvFile.files[0].text());
          if (rows.length > 200) throw new Error('CSVは一度に200行まで取り込めます');
          const imported = []; const failures = [];
          for (let offset = 0; offset < rows.length; offset += 20) {
            const chunk = rows.slice(offset, offset + 20);
            const result = await api('/api/x-affiliate/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, urls: chunk.map(row => row.url), clientRequestId: random() }) });
            (result.rows || []).forEach(item => {
              const row = chunk[item.row - 1];
              if (!row) return;
              if (item.productId) imported.push({ row, productId: item.productId });
              else failures.push(`${row.rowNumber}行目: ${item.errorCode || item.status}`);
            });
          }
          let catalog = []; let cursor = '';
          do {
            const query = new URLSearchParams({ accountId }); if (cursor) query.set('cursor', cursor);
            const page = await api(`/api/x-affiliate/products?${query}`); catalog.push(...(page.products || [])); cursor = page.nextCursor || '';
          } while (cursor);
          let patched = 0; const patchedIds = new Set();
          for (const item of imported) {
            if (patchedIds.has(item.productId)) { failures.push(`${item.row.rowNumber}行目: 同じ商品がCSV内で重複しています`); continue; }
            const current = catalog.find(candidate => candidate.product?.productId === item.productId);
            if (!current || !Object.keys(item.row.fields).length) continue;
            await api(`/api/x-affiliate/products/${encodeURIComponent(item.productId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: current.product.revision, expectedAccountRevision: current.accountProduct?.revision, fields: item.row.fields, sourceNote: item.row.sourceNote }) });
            patchedIds.add(item.productId);
            patched += 1;
          }
          clearRetry(csvForm); endWrite(csvForm);
          if (isCurrentScope(accountId, generation)) {
            message(csvForm, `${imported.length}件を受付、${patched}件にCSVの項目を反映しました${failures.length ? `。未取込 ${failures.length}件: ${failures.join(' / ')}` : '。'}`, failures.length ? 'warn' : 'success');
            await loadProducts(accountId, generation);
          }
        } catch (error) {
          endWrite(csvForm);
          if (csvForm.isConnected && isCurrentScope(accountId, generation)) message(csvForm, error.message, 'error');
        }
      }),
    ]);
    box.append(csvForm);
    if (state.importResult?.accountId === accountId) box.append(importResult(state.importResult.result, accountId, generation));
    const filter = el('form', { className: 'x-inline-form x-product-filter' }, [
      field('商品名・ASIN検索', 'search', 'q'),
      selectField('状態', 'status', '', ['', 'available', 'input_pending', 'paused', 'archived', 'invalid']),
      button('絞り込む', async event => {
        event.preventDefault();
        if (!isCurrentScope(accountId, generation)) return;
        const values = formData(filter);
        await loadProducts(accountId, generation, values);
      }),
    ]);
    box.append(filter);
    const items = el('div', { className: 'x-product-list' });
    (data.products || []).forEach(item => {
      const product = item.product || {};
      const accountProduct = item.accountProduct || {};
      const missing = (item.readiness?.missing || []).join(', ') || 'なし';
      const overridden = (product.overriddenFields || []).join(', ') || 'なし';
      const article = el('article', { className: 'x-product' }, [
        el('div', { className: 'x-product-head' }, [
          el('strong', { text: product.name || '商品名未入力' }),
          el('span', { className: 'x-muted', text: `${product.asin || 'ASIN不明'} · ${product.catalogStatus || '不明'} · 不足: ${missing} · 手修正: ${overridden}` }),
          ...(product.canonicalUrl ? [el('a', { className: 'x-product-link', href: product.canonicalUrl, target: '_blank', rel: 'noopener noreferrer', text: product.canonicalUrl })] : []),
        ]),
      ]);
      const edit = el('form', { className: 'x-form' }, [
        field('商品名', 'text', 'name', product.name || ''),
        field('特徴（1行1件）', 'textarea', 'features', (product.features || []).join('\n')),
        field('商品タグ（管理用・カンマ区切り）', 'text', 'tags', (product.tags || []).join(', ')),
        field('追加の確認済み事実（種類 | 内容、1行1件。name=商品名、category/classification=分類、feature=特徴、size=サイズ、audience=対象、comparison=比較軸、placement=設置場所、object=対象物、brand=ブランド、price=価格、availability=在庫、sale=セール）', 'textarea', 'facts', (product.facts || []).map(fact => `${fact.type} | ${fact.value}`).join('\n'), 'audience | 狭い机で使いたい人\ncomparison | 同じ条件でAは100g、参照Bは150g\nplacement | 卓上'),
        field('運用メモ', 'text', 'operatorNote', accountProduct.operatorNote || ''),
          checkbox('このaccountで利用', 'enabled', accountProduct.enabled !== false),
          checkbox('定期生成の対象', 'scheduleEnabled', accountProduct.scheduleEnabled === true),
        field('手修正の確認元・理由', 'text', 'sourceNote', null, '自分で確認した資料など'),
        button('保存', async event => {
          event.preventDefault();
          if (!edit.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(edit)) return;
          const values = formData(edit);
          const features = String(values.features || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
          const facts = [];
          const usedFactIds = new Set();
          for (const line of String(values.facts || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
            const separator = line.indexOf('|');
            if (separator < 1 || separator === line.length - 1) { endWrite(edit); message(edit, '事実は「種類 | 内容」で1行ずつ入力してください', 'error'); return; }
            const type = line.slice(0, separator).trim(); const value = line.slice(separator + 1).trim();
            const prior = (product.facts || []).find(fact => !usedFactIds.has(fact.factId) && fact.type === type && fact.value === value);
            if (prior) usedFactIds.add(prior.factId);
            facts.push(prior ? { factId: prior.factId, type, value } : { type, value });
          }
          const fields = { operatorNote: values.operatorNote || null, enabled: values.enabled === 'on', scheduleEnabled: values.scheduleEnabled === 'on' };
          if ((values.name || '') !== (product.name || '')) fields.name = values.name || null;
          if (JSON.stringify(features) !== JSON.stringify(product.features || [])) fields.features = features.length ? features : null;
          const tags = splitTagList(values.tags);
          if (JSON.stringify(tags) !== JSON.stringify(product.tags || [])) fields.tags = tags.length ? tags : null;
          const currentFacts = (product.facts || []).map(({ factId, ...fact }) => fact);
          if (JSON.stringify(facts.map(({ factId, ...fact }) => fact)) !== JSON.stringify(currentFacts)) fields.facts = facts.length ? facts : null;
          try {
            await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision, expectedAccountRevision: accountProduct.revision, fields, sourceNote: values.sourceNote }) });
            clearRetry(edit); endWrite(edit);
            if (isCurrentScope(accountId, generation)) await loadProducts(accountId, generation);
          } catch (error) {
            endWrite(edit);
            if (edit.isConnected && isCurrentScope(accountId, generation)) message(edit, error.message + (error.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
          }
        }),
      ]);
      edit.addEventListener('input', invalidateSkillPreview);
      edit.addEventListener('change', invalidateSkillPreview);
      article.append(edit);
      const actions = el('div', { className: 'x-inline-form' }, [
        button('取得を再試行', async () => {
          if (!isCurrentScope(accountId, generation)) return;
          try { await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision }) }); await loadProducts(accountId, generation); }
          catch (error) { if (isCurrentScope(accountId, generation)) message(article, error.body?.error?.code === 'PRODUCT_ADAPTER_NOT_CONFIGURED' ? '実商品取得adapterはまだ未接続です' : error.message, 'error'); }
        }),
      ]);
      if (isAdmin() && ['archived', 'paused', 'invalid'].includes(product.catalogStatus)) actions.append(button('復元して再確認', async () => {
        try { await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision, expectedAccountRevision: accountProduct.revision }) }); if (isCurrentScope(accountId, generation)) await loadProducts(accountId, generation); }
        catch (error) { if (isCurrentScope(accountId, generation)) message(article, error.message, 'error'); }
      }));
      if (isAdmin() && product.catalogStatus !== 'archived') actions.append(button('アーカイブ', async () => {
        if (!window.confirm('この商品をアーカイブしますか？')) return;
        try { await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision, fields: { catalogStatus: 'archived' } }) }); if (isCurrentScope(accountId, generation)) await loadProducts(accountId, generation); }
        catch (error) { if (isCurrentScope(accountId, generation)) message(article, error.message, 'error'); }
      }));
      article.append(actions); items.append(article);
    });
    if (!(data.products || []).length) items.append(el('p', { className: 'x-muted', text: '登録済み商品はありません' }));
    box.append(items);
  }
  async function loadProducts(accountId, generation, filter = {}) {
    if (!isCurrentScope(accountId, generation)) return;
    const query = new URLSearchParams({ accountId });
    if (filter.q) query.set('q', filter.q);
    if (filter.status) query.set('status', filter.status);
    try {
      const result = await api(`/api/x-affiliate/products?${query}`);
      if (isCurrentScope(accountId, generation)) renderProducts(result, accountId, generation);
    } catch (error) {
      const box = document.getElementById('x-products');
      if (box && isCurrentScope(accountId, generation)) message(box, error.message, 'error');
    }
  }
  function renderSkillPreview(result, root) {
    root.querySelector('.x-skill-preview')?.remove();
    const box = el('div', { className: 'x-skill-preview' });
    box.append(el('strong', { text: result.status === 'ready' ? '割当可能（合成検証範囲）' : '割当停止' }));
    if (result.status === 'ready') {
      (result.allocations || []).forEach(item => box.append(el('div', { className: 'x-row' }, [
        el('span', { text: `${item.variantId}: ${item.skillId}@${item.skillVersion}` }),
        el('span', { className: 'x-muted', text: `切り口 ${item.angleId} · 根拠 ${item.factRefs.length}件` }),
      ])));
      box.append(el('p', { className: 'x-muted', text: 'productionReady=false。下書き生成・費用予約・外部送信は行っていません。' }));
    } else {
      const reasons = (result.blockingReasons || []).map(item => item.code).join(', ') || '適合するSkillと切り口が不足しています';
      box.append(el('p', { className: 'x-status', text: reasons }));
    }
    root.append(box);
  }
  function renderSkills(data, accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-skills');
    if (!box) return;
    captureSkillDrafts();
    state.previewGeneration += 1;
    state.skillPreview = null;
    box.replaceChildren();
    box.append(el('p', { className: 'x-muted', text: `参照元 ${data.source?.repository || 'hachi-aff'} @ ${data.source?.commit || '未確認'}。候補11件のうち合成構造検証対象5件だけを取り込み、実生成は停止しています。` }));
    const decisions = el('details', { className: 'x-skill-decisions' }, [el('summary', { text: '候補11件の採用・保留理由' })]);
    (data.candidates || []).forEach(item => decisions.append(el('div', { className: 'x-row' }, [
      el('span', { text: `${item.id} · ${item.decision === 'adopt' ? '採用候補' : item.decision === 'hold' ? '保留' : '除外'}` }),
      el('span', { className: 'x-muted', text: item.reason }),
    ])));
    box.append(decisions);
    if (!data.imported) {
      box.append(el('p', { className: 'x-status', text: 'Skillはまだcoreへ取り込まれていません。アカウント割当は初期OFFで作成されます。' }));
      if (isAdmin()) {
        const importButton = button('採用候補5件を取り込む', async () => {
          if (!isCurrentScope(accountId, generation) || importButton.disabled) return;
          importButton.disabled = true;
          try {
            const idempotencyKey = await keyFor(importButton, { operation: 'skill-import', sourceCommit: data.source?.commit });
            await api('/api/x-affiliate/skills/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey }) });
            clearRetry(importButton);
            if (isCurrentScope(accountId, generation)) await loadSkills(accountId, generation);
          } catch (error) {
            importButton.disabled = false;
            if (isCurrentScope(accountId, generation)) message(box, error.message + (error.code === 409 ? ' 既存編集を上書きせず停止しました。' : ''), 'error');
          }
        });
        importButton.setAttribute('data-admin-only', 'true');
        box.append(importButton);
      }
      enforceMemberUI();
      return;
    }
    const list = el('div', { className: 'x-skill-list' });
    (data.skills || []).forEach(skill => {
      const article = el('article', { className: 'x-product x-skill' }, [
        el('div', { className: 'x-product-head' }, [
          el('strong', { text: `${skill.id} @ ${skill.version}` }),
          el('span', { className: 'x-muted', text: `${skill.status} · 共通優先度 ${skill.priority} · 構成見本 ${skill.exampleValidation?.valid ? 'OK' : 'NG'} · 本文${skill.bodyValidation?.verified ? '検証済み' : '未検証（既知hashなし）'} · ${skill.validationScope}` }),
        ]),
      ]);
      const assignment = el('form', { className: 'x-inline-form' }, [
        checkbox('このaccountで利用', 'enabled', skill.assignment?.enabled),
        field('account優先度（空欄=共通）', 'number', 'priority', skill.assignment?.priority == null ? '' : String(skill.assignment.priority)),
        button('割当を保存', async event => {
          event.preventDefault();
          if (!assignment.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(assignment)) return;
          const values = formData(assignment);
          const fields = { enabled: values.enabled === 'on', priority: values.priority === '' ? null : Number(values.priority) };
          const payload = { accountId, expectedRevision: Number(assignment.dataset.revision || skill.assignment?.revision || 0), fields };
          try {
            const idempotencyKey = await keyFor(assignment, { operation: 'skill-assignment', skillId: skill.id, ...payload });
            if (!assignment.isConnected || !isCurrentScope(accountId, generation)) { endWrite(assignment); return; }
            await api(`/api/x-affiliate/skills/${encodeURIComponent(skill.id)}/assignment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
            clearRetry(assignment); state.skillDrafts.delete(`${accountId}:${skill.id}:assignment`); assignment.dataset.dirty = 'false'; invalidateSkillPreview(); endWrite(assignment);
            if (isCurrentScope(accountId, generation)) await loadSkills(accountId, generation);
          } catch (error) {
            endWrite(assignment);
            if (assignment.isConnected && isCurrentScope(accountId, generation)) message(assignment, error.message + (error.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
          }
        }),
      ]);
      trackDraft(assignment, `${accountId}:${skill.id}:assignment`, skill.assignment?.revision ?? 0);
      restoreDraft(assignment, `${accountId}:${skill.id}:assignment`);
      article.append(assignment);
      const details = el('details', {}, [
        el('summary', { text: '本文・切り口・構成見本を確認' }),
        el('pre', { className: 'x-skill-body', text: skill.body }),
        el('p', { className: 'x-muted', text: `切り口: ${(skill.angles || []).map(angle => `${angle.id} (${angle.label})`).join(', ')}` }),
        el('pre', { className: 'x-skill-body', text: JSON.stringify(skill.example, null, 2) }),
      ]);
      article.append(details);
      if (isAdmin()) {
        article.append(el('p', { className: 'x-status', text: `共通本文・状態の変更は、このSkillを利用中の${skill.usage?.enabledAccountCount ?? 0} accountの次回割当に影響します。既存の版は保持されます。` }));
        const metaForm = el('form', { className: 'x-inline-form', 'data-admin-only': 'true' }, [
          selectField('共通状態', 'status', skill.status, ['active', 'paused', 'retired']),
          field('共通優先度', 'number', 'priority', String(skill.priority)),
          button('共通設定を保存', async event => {
            event.preventDefault();
            if (!metaForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(metaForm)) return;
            const values = formData(metaForm); const fields = { status: values.status, priority: Number(values.priority) };
            const payload = { expectedRevision: Number(metaForm.dataset.revision || skill.revision), fields };
            try {
              const idempotencyKey = await keyFor(metaForm, { operation: 'skill-meta', skillId: skill.id, ...payload });
              if (!metaForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(metaForm); return; }
              await api(`/api/x-affiliate/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
              clearRetry(metaForm); state.skillDrafts.delete(`${accountId}:${skill.id}:meta`); metaForm.dataset.dirty = 'false'; invalidateSkillPreview(); endWrite(metaForm);
              if (isCurrentScope(accountId, generation)) await loadSkills(accountId, generation);
            } catch (error) {
              endWrite(metaForm);
              if (metaForm.isConnected && isCurrentScope(accountId, generation)) message(metaForm, error.message + (error.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
            }
          }),
        ]);
        const versionForm = el('form', { className: 'x-form', 'data-admin-only': 'true' }, [
          field('新しい版（必須）', 'text', 'version', null, `現在 ${skill.version}（例: 1.1.0）`),
          field('Skill本文', 'textarea', 'body', skill.body),
          field('合成構成見本（JSON）', 'textarea', 'example', JSON.stringify(skill.example, null, 2)),
          button('新しい版として保存', async event => {
            event.preventDefault();
            if (!versionForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(versionForm)) return;
            const values = formData(versionForm); let example;
            try { example = JSON.parse(values.example); }
            catch { endWrite(versionForm); message(versionForm, '構成見本はJSONで入力してください', 'error'); return; }
            const fields = { version: values.version, body: values.body, example };
            const payload = { expectedRevision: Number(versionForm.dataset.revision || skill.revision), fields };
            try {
              const idempotencyKey = await keyFor(versionForm, { operation: 'skill-version', skillId: skill.id, ...payload });
              if (!versionForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(versionForm); return; }
              await api(`/api/x-affiliate/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
              clearRetry(versionForm); state.skillDrafts.delete(`${accountId}:${skill.id}:version`); versionForm.dataset.dirty = 'false'; invalidateSkillPreview(); endWrite(versionForm);
              if (isCurrentScope(accountId, generation)) await loadSkills(accountId, generation);
            } catch (error) {
              endWrite(versionForm);
              if (versionForm.isConnected && isCurrentScope(accountId, generation)) message(versionForm, error.message + (error.code === 409 ? ' 旧版を上書きせず停止しました。入力は保持しています。' : ''), 'error');
            }
          }),
        ]);
        trackDraft(metaForm, `${accountId}:${skill.id}:meta`, skill.revision);
        trackDraft(versionForm, `${accountId}:${skill.id}:version`, skill.revision);
        restoreDraft(metaForm, `${accountId}:${skill.id}:meta`);
        restoreDraft(versionForm, `${accountId}:${skill.id}:version`);
        article.append(metaForm, versionForm);
      }
      list.append(article);
    });
    box.append(list);
    const previewForm = el('form', { className: 'x-form x-skill-preview-form' }, [
      field('商品ID（カンマ区切り・1〜3件）', 'text', 'productIds'),
      selectField('案数', 'requestedVariantCount', '3', ['1', '2', '3']),
      button('適合と割当を確認', async event => {
        event.preventDefault();
        if (!previewForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(previewForm)) return;
        const values = formData(previewForm);
        const productIds = String(values.productIds || '').split(',').map(value => value.trim()).filter(Boolean);
        if (productIds.length < 1 || productIds.length > 3) { endWrite(previewForm); message(previewForm, '商品IDは1〜3件で入力してください', 'error'); return; }
        const payload = { accountId, productIds, requestedVariantCount: Number(values.requestedVariantCount) };
        const previewGeneration = state.previewGeneration;
        try {
          const idempotencyKey = await keyFor(previewForm, { operation: 'skill-allocation-preview', ...payload });
          if (!previewForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(previewForm); return; }
          const result = await api('/api/x-affiliate/skill-allocation-previews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
          clearRetry(previewForm); endWrite(previewForm);
          if (isCurrentScope(accountId, generation) && state.previewGeneration === previewGeneration) { state.skillPreview = { accountId, result }; renderSkillPreview(result, previewForm); }
        } catch (error) {
          endWrite(previewForm);
          if (previewForm.isConnected && isCurrentScope(accountId, generation)) message(previewForm, error.message + (error.code === 409 ? ' Skillまたは割当設定が変わりました。再確認してください。' : ''), 'error');
        }
      }),
    ]);
    previewForm.addEventListener('input', invalidateSkillPreview);
    previewForm.addEventListener('change', invalidateSkillPreview);
    box.append(previewForm);
    if (state.skillPreview?.accountId === accountId) renderSkillPreview(state.skillPreview.result, previewForm);
    enforceMemberUI();
  }
  async function loadSkills(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    try {
      const result = await api(`/api/x-affiliate/skills?accountId=${encodeURIComponent(accountId)}`);
      if (isCurrentScope(accountId, generation)) renderSkills(result, accountId, generation);
    } catch (error) {
      const box = document.getElementById('x-skills');
      if (box && isCurrentScope(accountId, generation)) message(box, error.message, 'error');
    }
  }
  function syncProductPicker(select, input) {
    if (!select || !input) return;
    const selected = new Set(String(input.value || '').split(',').map(value => value.trim()).filter(Boolean));
    select.replaceChildren();
    if (!state.productCatalog.length) {
      select.append(el('option', { text: '商品登録後に選択できます', value: '' }));
      select.disabled = true;
      return;
    }
    select.disabled = false;
    state.productCatalog.forEach(item => {
      const product = item.product || {};
      const option = el('option', { value: product.productId, text: `${product.name || '商品名未入力'} · ${product.asin || 'ASIN不明'} · ID: ${product.productId}` });
      option.selected = selected.has(product.productId);
      select.append(option);
    });
  }
  function renderDrafts(data, accountId, generation) {
    const box = document.getElementById('x-drafts');
    if (!box || !isCurrentScope(accountId, generation)) return;
    box.replaceChildren(el('p', { className: 'x-muted', text: '候補は人が確認して採用します。生成・再生成は予算を消費します。' }));
    const productIdField = field('対象商品ID（カンマ区切り・1〜3件）', 'text', 'productIds', null, '下の一覧から選ぶと自動入力');
    const productIdInput = productIdField.querySelector('[name="productIds"]');
    const productPicker = el('select', { name: 'productPicker', className: 'form-select', multiple: 'multiple', size: String(Math.min(5, Math.max(2, state.productCatalog.length))) });
    const productPickerField = el('label', { className: 'x-field' }, [el('span', { text: '商品一覧から選択（最大3件）' }), productPicker]);
    const generateForm = el('form', { className: 'x-form x-generation-form' }, [
      productIdField,
      productPickerField,
      el('p', { className: 'x-muted', text: '商品IDは画面内部の識別子です。商品名・ASIN・IDが一覧に表示されるので、通常は一覧から選択してください。' }),
      selectField('候補数', 'requestedVariantCount', '3', ['1', '2', '3']),
      button('候補を生成', async event => {
        event.preventDefault();
        if (!generateForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(generateForm)) return;
        const values = formData(generateForm); const productIds = String(values.productIds || '').split(',').map(value => value.trim()).filter(Boolean);
        if (productIds.length < 1 || productIds.length > 3) { endWrite(generateForm); message(generateForm, '商品IDは1〜3件で入力してください', 'error'); return; }
        const payload = { accountId, productIds, requestedVariantCount: Number(values.requestedVariantCount) };
        try {
          const idempotencyKey = await keyFor(generateForm, { operation: 'generation', ...payload });
          const result = await api('/api/x-affiliate/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
          clearRetry(generateForm); endWrite(generateForm);
          if (isCurrentScope(accountId, generation)) { message(generateForm, `受付 ${result.job.status} · ${result.draftIds.length}案`, result.job.status === 'completed' ? 'success' : 'warn'); await loadDrafts(accountId, generation); }
        } catch (error) {
          endWrite(generateForm); if (generateForm.isConnected && isCurrentScope(accountId, generation)) message(generateForm, error.body?.error?.code || error.message, 'error');
        }
      }),
    ]);
    syncProductPicker(productPicker, productIdInput);
    productPicker.addEventListener('change', () => {
      const selected = [...productPicker.selectedOptions].map(option => option.value).filter(Boolean);
      if (selected.length > 3) {
        productPicker.selectedOptions[productPicker.selectedOptions.length - 1].selected = false;
        return;
      }
      productIdInput.value = selected.join(',');
    });
    productIdInput.addEventListener('input', () => syncProductPicker(productPicker, productIdInput));
    box.append(generateForm);
    const groups = new Map();
    (data.drafts || []).forEach(draft => { if (!groups.has(draft.generationGroupId)) groups.set(draft.generationGroupId, []); groups.get(draft.generationGroupId).push(draft); });
    for (const [groupId, drafts] of groups) {
      const groupBusy = drafts.some(draft => Boolean(draft.regenerationLock || draft.regeneration?.status === 'running' || draft.regeneration?.status === 'queued'));
      const group = el('section', { className: 'x-draft-group' }, [el('strong', { text: `生成グループ ${groupId} · ${drafts.length}案${groupBusy ? ' · 再生成処理中' : ''}` })]);
      const comparison = el('div', { className: 'x-form x-draft-grid' });
      drafts.forEach(draft => {
        const edit = field('本文', 'textarea', 'body', draft.body); const textarea = edit.querySelector('textarea');
        const regeneration = draft.regeneration || draft.regenerationJob || state.draftJobs.get(draft.draftId) || {};
        const draftBusy = Boolean(draft.regenerationLock || regeneration.status === 'running' || regeneration.status === 'queued');
        const jobId = regeneration.jobId || draft.regenerationJobId;
        const article = el('article', { className: 'x-product x-draft' }, [
          el('div', { className: 'x-product-head' }, [el('strong', { text: `${draft.variantId} · ${draft.state}` }), el('span', { className: 'x-muted', text: `${draft.skillId}@${draft.skillVersion} · 切り口 ${draft.angleId}` })]),
          el('p', { className: draft.validation?.ok ? 'x-muted' : 'x-status', text: draft.validation?.ok ? '検証OK' : `検証NG: ${(draft.validation?.errors || []).join(', ')}` }),
          ...(regeneration.status ? [el('p', { className: 'x-status', text: draftBusy ? `再生成処理中です（${regeneration.status}）。本文編集・レビュー操作は一時停止しています。` : `再生成ジョブ: ${regeneration.status}` })] : []),
          edit,
        ]);
        textarea.disabled = draftBusy || draft.state === 'archived';
        const actions = el('div', { className: 'x-inline-form' });
        actions.append(button('編集を保存', async () => {
          try { const idempotencyKey = random(); await api(`/api/x-affiliate/drafts/${encodeURIComponent(draft.draftId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: draft.revision, body: textarea.value, idempotencyKey }) }); if (isCurrentScope(accountId, generation)) await loadDrafts(accountId, generation); }
          catch (error) { if (article.isConnected) message(article, error.message + (error.code === 409 ? ' 入力を残したまま最新状態を確認してください。' : ''), 'error'); }
        }, draftBusy || draft.state === 'archived'));
        if (draft.state === 'needs_review') {
          actions.append(button('採用', async () => reviewDraft(draft, 'approve', null, article, accountId, generation), groupBusy || draftBusy || !draft.validation?.ok));
          actions.append(button('見送り', async () => reviewDraft(draft, 'reject', 'not_this_time', article, accountId, generation), groupBusy || draftBusy));
          if (drafts.length > 1) actions.append(button('この案を採用し残りを見送り', async () => {
            if (draftBusy || !draft.validation?.ok || !window.confirm(`この案を採用し、同じグループの残り${drafts.length - 1}案を見送りますか？`)) return;
            try { await api(`/api/x-affiliate/draft-groups/${encodeURIComponent(groupId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, approvedDraftId: draft.draftId, expectedRevisions: drafts.map(item => ({ draftId: item.draftId, revision: item.revision })), entrypoint: 'public', idempotencyKey: random() }) }); if (isCurrentScope(accountId, generation)) await loadDrafts(accountId, generation); }
            catch (error) { if (article.isConnected) message(article, error.message + (error.code === 409 ? ' グループ内の状態が変わりました。再確認してください。' : ''), 'error'); }
          }, groupBusy || draftBusy));
        } else if (draft.state === 'approved') actions.append(button('採用を解除', async () => reviewDraft(draft, 'unapprove', null, article, accountId, generation), draftBusy));
        else if (draft.state === 'rejected') actions.append(button('再検討', async () => reviewDraft(draft, 'reopen', null, article, accountId, generation), draftBusy));
        if (draft.state !== 'archived') actions.append(button('保管', async () => reviewDraft(draft, 'archive', null, article, accountId, generation), draftBusy));
        if (draft.state === 'archived') actions.append(button('保管から復元', async () => reviewDraft(draft, 'restore', null, article, accountId, generation), draftBusy));
        const estimated = state.budget?.operation?.limitMicroJPY;
        const regenerationAllowed = draft.state !== 'archived' && !draftBusy && typeof estimated === 'number' && Number.isSafeInteger(estimated) && estimated >= 0;
        const regenerateForm = el('form', { className: 'x-inline-form x-regeneration-form', 'data-account-id': accountId, 'data-busy': String(draftBusy), 'data-archived': String(draft.state === 'archived') }, [
          el('p', { className: 'x-muted', 'data-regeneration-limit': 'true', text: regenerationAllowed ? `追加費用上限 ${microJPY(estimated)}（操作枠）` : '追加費用上限を確認できないため再生成できません。予算を再読み込みしてください。' }),
          field('修正意図（1〜2000文字）', 'textarea', 'instruction', '', '直したい点を具体的に入力'),
          button('この案を再生成', async event => {
            event.preventDefault();
            if (!regenerateForm.isConnected || draftBusy || !isCurrentScope(accountId, generation) || !beginWrite(regenerateForm)) return;
            const instruction = String(formData(regenerateForm).instruction || '').trim();
            if (!instruction || instruction.length > 2000) { endWrite(regenerateForm); message(regenerateForm, '修正意図は1〜2000文字で入力してください', 'error'); return; }
            const payload = { expectedRevision: draft.revision, instruction };
            try {
              const idempotencyKey = await keyFor(regenerateForm, { operation: 'draft-regenerate', draftId: draft.draftId, ...payload });
              if (!regenerateForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(regenerateForm); return; }
              const result = await api(`/api/x-affiliate/drafts/${encodeURIComponent(draft.draftId)}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
              endWrite(regenerateForm); clearRetry(regenerateForm);
              if (isCurrentScope(accountId, generation)) {
                if (result.job?.jobId) { state.generationJobs.set(result.job.jobId, result.job); state.draftJobs.set(draft.draftId, { ...result.job, draftId: draft.draftId }); }
                message(regenerateForm, `再生成を受付しました${result.job?.estimatedMaxMicroJPY ? `（追加費用上限 ${microJPY(result.job.estimatedMaxMicroJPY)}）` : ''}`, 'warn');
                if (result.job?.jobId) await refreshGenerationJob(result.job.jobId, accountId, generation);
                await loadDrafts(accountId, generation);
              }
            } catch (error) { endWrite(regenerateForm); if (regenerateForm.isConnected && isCurrentScope(accountId, generation)) message(regenerateForm, error.message + (error.code === 409 ? ' 入力は保持しています。処理中または最新状態を確認してください。' : ''), 'error'); }
          }, !regenerationAllowed),
        ]);
        regenerateForm.querySelector('button')?.setAttribute('data-regeneration-action', 'true');
        if (jobId) regenerateForm.append(button('ジョブ状態を更新', async () => { const job = await refreshGenerationJob(jobId, accountId, generation); if (job && isCurrentScope(accountId, generation)) { message(regenerateForm, `ジョブ状態: ${job.status}`, job.status === 'failed' || job.status === 'unknown' ? 'warn' : ''); await loadDrafts(accountId, generation); } }));
        if (draft.state === 'archived') regenerateForm.querySelectorAll('textarea,button').forEach(node => { node.disabled = true; });
        article.append(regenerateForm);
        article.append(actions); comparison.append(article);
      });
      group.append(comparison); box.append(group);
    }
    if (!(data.drafts || []).length) box.append(el('p', { className: 'x-muted', text: '候補文はまだありません' }));
  }
  async function reviewDraft(draft, action, reason, root, accountId, generation) {
    try {
      const payload = { expectedRevision: draft.revision, action, entrypoint: 'public', idempotencyKey: random() }; if (reason) payload.reason = reason;
      await api(`/api/x-affiliate/drafts/${encodeURIComponent(draft.draftId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (isCurrentScope(accountId, generation)) await loadDrafts(accountId, generation);
    } catch (error) { if (root.isConnected) message(root, error.message + (error.code === 409 ? ' 最新状態を再確認してください。' : ''), 'error'); }
  }
  async function refreshGenerationJob(jobId, accountId, generation) {
    if (!jobId || !isCurrentScope(accountId, generation)) return null;
    try { const result = await api(`/api/x-affiliate/generation-jobs/${encodeURIComponent(jobId)}`); if (isCurrentScope(accountId, generation) && result.job) { state.generationJobs.set(jobId, result.job); const draftId = result.job.draftId || [...state.draftJobs.entries()].find(([, value]) => value.jobId === jobId)?.[0]; if (draftId) state.draftJobs.set(draftId, { ...result.job, draftId }); } return isCurrentScope(accountId, generation) ? result.job : null; }
    catch (error) { if (isCurrentScope(accountId, generation)) message(document.getElementById('x-drafts') || document.body, `再生成ジョブ状態を取得できませんでした: ${error.message}`, 'warn'); return null; }
  }
  async function loadDrafts(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    try { const result = await api(`/api/x-affiliate/drafts?accountId=${encodeURIComponent(accountId)}`); if (isCurrentScope(accountId, generation)) { const ids = [...new Set((result.drafts || []).map(draft => draft.regenerationLock?.jobId).filter(Boolean))]; await Promise.all(ids.map(jobId => refreshGenerationJob(jobId, accountId, generation))); if (!isCurrentScope(accountId, generation)) return; (result.drafts || []).forEach(draft => { const jobId = draft.regenerationLock?.jobId; if (jobId && state.generationJobs.has(jobId)) { draft.regeneration = state.generationJobs.get(jobId); state.draftJobs.set(draft.draftId, draft.regeneration); } }); renderDrafts(result, accountId, generation); } }
    catch (error) { const box = document.getElementById('x-drafts'); if (box && isCurrentScope(accountId, generation)) message(box, error.message, 'error'); }
  }
  function isCurrentScope(accountId, generation) {
    return Boolean(xJwt) && state.accountId === accountId && state.generation === generation;
  }
  function isCurrentLoad(generation) {
    return Boolean(xJwt) && state.loadGeneration === generation;
  }
  function isLinkCurrent(generation) {
    return Boolean(xJwt) && state.linkGeneration === generation;
  }
  function linkExpired(link) {
    return !link || !Number.isFinite(Number(link.expiresAt)) || Number(link.expiresAt) <= Date.now();
  }
  function renderLinkCard() {
    const box = document.getElementById('x-link');
    if (!box) return;
    box.replaceChildren();
    const current = state.link;
    const selfLink = state.context?.selfLink;
    if (!current) {
      const connected = selfLink?.status === 'active';
      box.append(el('p', { className: 'x-muted', text: connected ? `連携済み: ${selfLink.discordDisplay || selfLink.discordUserId || '確認済み'}` : 'Discordアカウントは未連携です。' }));
      box.append(button(connected ? '再連携を開始' : 'Discord連携を開始', startLink));
      return;
    }
    if (current.status === 'issued' && linkExpired(current)) {
      current.status = 'expired';
      current.code = '';
    }
    if (current.status === 'issued') {
      box.append(el('p', { className: 'x-link-code', text: `Discordで「/x-link code:${current.code}」を実行してください。期限: ${new Date(current.expiresAt).toLocaleString()}` }));
      box.append(button('状態を確認', checkLinkStatus, state.linkStatusPending));
      box.append(button('再開始', startLink, state.linkStartPending));
      return;
    }
    if (current.status === 'expired') {
      box.append(el('p', { className: 'x-status', text: '連携コードの期限が切れました。再開始してください。' }));
      box.append(button('再連携を開始', startLink));
      return;
    }
    if (current.status !== 'discord_confirmed') {
      box.append(el('p', { className: 'x-status', text: current.error || '連携状態を確認できませんでした。再開始してください。' }));
      box.append(button('再連携を開始', startLink));
      return;
    }
    box.append(el('p', { className: 'x-muted', text: `Discord確認済み: ${current.discordDisplay || current.discordUserId || '確認済み'}` }));
    const confirmInput = el('input', { type: 'checkbox', name: 'discordConfirmed' });
    confirmInput.checked = current.confirmChecked === true;
    const finalizeButton = button('このDiscordアカウントで確定', () => finalizeLink(finalizeForm), state.linkFinalizePending || !confirmInput.checked);
    confirmInput.addEventListener('change', () => {
      current.confirmChecked = confirmInput.checked;
      finalizeButton.disabled = !confirmInput.checked || state.linkFinalizePending;
    });
    const finalizeForm = el('form', { className: 'x-inline-form' }, [
      el('label', { className: 'x-check' }, [confirmInput, el('span', { text: 'このDiscordアカウントを確認した' })]),
      finalizeButton,
    ]);
    box.append(finalizeForm);
    if (current.error) message(finalizeForm, current.error, 'error');
  }
  async function startLink() {
    if (state.linkStartPending) return;
    const generation = ++state.linkGeneration;
    state.link = null;
    state.linkStartPending = true;
    renderLinkCard();
    try {
      const result = await api('/api/x-auth/link/start', { method: 'POST' });
      if (!isLinkCurrent(generation)) return;
      if (!result?.challengeId || !result?.code || !Number.isFinite(Number(result.expiresAt))) throw new Error('連携開始応答が不正です');
      state.link = { challengeId: result.challengeId, code: result.code, expiresAt: Number(result.expiresAt), revision: result.revision, status: 'issued' };
    } catch (x) {
      if (isLinkCurrent(generation)) state.link = { status: 'error', error: x.message };
    } finally {
      if (isLinkCurrent(generation)) {
        state.linkStartPending = false;
        renderLinkCard();
      }
    }
  }
  async function checkLinkStatus() {
    const current = state.link;
    const generation = state.linkGeneration;
    if (!current || current.status !== 'issued' || state.linkStatusPending) return;
    if (linkExpired(current)) {
      current.status = 'expired'; current.code = ''; renderLinkCard(); return;
    }
    state.linkStatusPending = true;
    try {
      const result = await api(`/api/x-auth/link/status?challengeId=${encodeURIComponent(current.challengeId)}`);
      if (!isLinkCurrent(generation) || state.link !== current) return;
      current.status = result.status;
      current.revision = result.revision;
      current.discordDisplay = result.discordDisplay;
      current.discordUserId = result.discordUserId;
      if (result.status === 'discord_confirmed') current.code = '';
    } catch (x) {
      if (isLinkCurrent(generation) && state.link === current) {
        current.code = '';
        current.error = x.message;
        current.status = linkExpired(current) ? 'expired' : 'error';
      }
    } finally {
      if (isLinkCurrent(generation)) {
        state.linkStatusPending = false;
        renderLinkCard();
      }
    }
  }
  function releaseFinalizeIfCurrent(generation, current) {
    if (!isLinkCurrent(generation) || state.link !== current) return false;
    state.linkFinalizePending = false;
    renderLinkCard();
    return true;
  }
  async function finalizeLink(form) {
    const current = state.link;
    const generation = state.linkGeneration;
    if (!form?.isConnected || !current || current.status !== 'discord_confirmed' || !current.confirmChecked || state.linkFinalizePending) return;
    if (linkExpired(current)) { current.status = 'expired'; current.code = ''; renderLinkCard(); return; }
    state.linkFinalizePending = true;
    const payload = { challengeId: current.challengeId, expectedRevision: current.revision, confirm: true };
    if (state.context?.selfLink?.status === 'active') payload.expectedLinkRevision = state.context.selfLink.revision;
    let key;
    try {
      key = await keyFor(form, { operation: 'link-finalize', ...payload });
      if (!form.isConnected || !isLinkCurrent(generation) || state.link !== current) {
        releaseFinalizeIfCurrent(generation, current);
        return;
      }
      await api('/api/x-auth/link/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey: key }) });
      if (!isLinkCurrent(generation) || state.link !== current) return;
      if (!form.isConnected) {
        releaseFinalizeIfCurrent(generation, current);
        return;
      }
      clearRetry(form);
      state.link = null;
      state.linkGeneration += 1;
      state.linkFinalizePending = false;
      renderLinkCard();
      await load();
    } catch (x) {
      if (!isLinkCurrent(generation) || state.link !== current) return;
      if (!form.isConnected) {
        releaseFinalizeIfCurrent(generation, current);
        return;
      }
      state.linkFinalizePending = false;
      current.error = x.message;
      message(form, x.message + (x.code === 409 ? ' 状態を再確認してください。' : ''), 'error');
    }
  }
  function renderTags(data, accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-tags');
    if (!box) return;
    // The tags read carries the settings revision used by default-tag writes. Keep this
    // snapshot with the rendered form; never source it from a later settings refresh.
    const settingsRevision = data.settingsRevision;
    box.replaceChildren();
    (data.tags || []).forEach(t => {
      const row = el('div', { className: 'x-row' }, [
        el('span', { text: `${t.name} · ${t.enabled ? '有効' : '無効'}${t.default ? ' · 既定' : ''}` }),
        el('span', { className: 'x-muted', text: '実値は非表示' }),
      ]);
      if (isAdmin()) {
        const valueField = field('実値（空欄なら変更なし）', 'password', 'value');
        const valueInput = valueField.querySelector('input');
        const f = el('form', { className: 'x-inline-form', 'data-admin-only': 'true' }, [
          field('名前', 'text', 'name', t.name),
          valueField,
          checkbox('有効', 'enabled', t.enabled),
          checkbox('既定', 'default', t.default),
          button('保存', async e => {
            e.preventDefault();
            if (!f.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(f)) return;
            const d = formData(f);
            const fields = {
              name: d.name,
              enabled: d.enabled === 'on',
              default: d.default === 'on',
            };
            if (d.value) fields.value = d.value;
            const payload = { accountId, expectedRevision: t.revision, fields };
            if ((fields.default !== undefined || fields.enabled === false) && settingsRevision !== undefined) {
              payload.expectedSettingsRevision = settingsRevision;
            }
            let key;
            try {
              key = await keyFor(f, { operation: 'tag-update', tagId: t.tagId, ...payload });
            } catch (x) {
              endWrite(f);
              if (f.isConnected && isCurrentScope(accountId, generation)) message(f, x.message, 'error');
              return;
            }
            if (!f.isConnected || !isCurrentScope(accountId, generation)) { endWrite(f); return; }
            const body = { ...payload, idempotencyKey: key };
            try {
              await api(`/api/x-affiliate/tags/${encodeURIComponent(t.tagId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              valueInput.value = '';
              clearRetry(f);
              endWrite(f);
              if (isCurrentScope(accountId, generation)) {
                await loadTags(accountId, generation);
                if (fields.default !== undefined || fields.enabled !== undefined) await syncSettingsAfterTag(accountId, generation);
              }
            } catch (x) {
              endWrite(f);
              if (f.isConnected && isCurrentScope(accountId, generation)) {
                message(f, x.message + (x.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
              }
            }
          }),
        ]);
        row.append(f);
      }
      box.append(row);
    });
    if (isAdmin()) {
      const valueField = field('Amazonアソシエイトタグ（保存後は非表示）', 'password', 'value');
      const valueInput = valueField.querySelector('input');
      const f = el('form', { className: 'x-form', 'data-admin-only': 'true' }, [
        field('管理用の名前（例: メイン用）', 'text', 'name'),
        valueField,
        button('タグを保存', async e => {
          e.preventDefault();
          if (!f.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(f)) return;
          const d = formData(f);
          if (!d.name || !d.value) { endWrite(f); return; }
          const payload = { accountId, name: d.name, market: 'JP', value: d.value, enabled: true };
          let key;
          try {
            key = await keyFor(f, { operation: 'tag-create', ...payload });
          } catch (x) {
            endWrite(f);
            if (f.isConnected && isCurrentScope(accountId, generation)) message(f, x.message, 'error');
            return;
          }
          if (!f.isConnected || !isCurrentScope(accountId, generation)) { endWrite(f); return; }
          const body = { ...payload, idempotencyKey: key };
          try {
            await api('/api/x-affiliate/tags', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            valueInput.value = '';
            clearRetry(f);
            endWrite(f);
            if (isCurrentScope(accountId, generation)) {
              f.reset();
              await loadTags(accountId, generation);
            }
          } catch (x) {
            endWrite(f);
            if (f.isConnected && isCurrentScope(accountId, generation)) message(f, x.message, 'error');
          }
        }),
      ]);
      box.append(f);
    }
    enforceMemberUI();
  }
  async function syncSettingsAfterTag(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-settings');
    const currentForm = box?.querySelector('form');
    const dirty = currentForm?.dataset.dirty === 'true';
    try {
      const result = await api(`/api/x-affiliate/settings?accountId=${encodeURIComponent(accountId)}`);
      if (!isCurrentScope(accountId, generation)) return;
      const formAfterResponse = box?.querySelector('form');
      const dirtyAfterResponse = formAfterResponse?.dataset.dirty === 'true';
      if (currentForm && formAfterResponse !== currentForm) return;
      if ((dirty || dirtyAfterResponse) && currentForm?.isConnected) {
        message(box, 'タグ変更で設定版数が更新されました。入力を保持しています。保存時に再確認してください。', 'warn');
      } else {
        renderSettings(result, accountId, generation);
      }
    } catch (x) {
      if (box && isCurrentScope(accountId, generation)) message(box, `設定版数を同期できませんでした: ${x.message}`, 'warn');
    }
  }
  function renderSettings(data, accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-settings');
    if (!box) return;
    box.replaceChildren();
    const s = data.settings || {};
    state.settings = s;
    const p = s.profile || {};
    const children = [
      el('p', { className: 'x-muted', text: `定期状況: ${s.schedule?.enabled === true ? '有効' : '無効（初期OFF）'}${s.schedule?.nextRunAt ? ` · 次回 ${new Date(s.schedule.nextRunAt).toLocaleString('ja-JP')}` : ''}` }),
      field('トーン', 'text', 'tone', p.tone || ''),
      field('対象読者', 'text', 'target', p.target || ''),
      field('ジャンル', 'text', 'genre', p.genre || ''),
      field('ペルソナ', 'textarea', 'persona', p.persona || ''),
      field('メモ', 'textarea', 'notes', p.notes || ''),
      field('templateRefs（JSON）', 'text', 'templateRefs', JSON.stringify(s.templateRefs || [])),
    ];
    if (isAdmin()) children.push(field('通知先（channel metadata）', 'text', 'reviewChannelRef', s.reviewChannelRef || ''));
    if (isAdmin()) children.push(checkbox('定期生成を有効化（初期OFF）', 'scheduleEnabled', s.schedule?.enabled === true));
    children.push(button('設定を保存', async e => {
        e.preventDefault();
        if (!f.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(f)) return;
        const d = formData(f);
        let refs;
        try {
          refs = JSON.parse(d.templateRefs || '[]');
        } catch {
          endWrite(f);
          message(box, 'templateRefs はJSON配列で入力してください', 'error');
          return;
        }
        const profile = {};
        ['tone', 'target', 'genre', 'persona', 'notes'].forEach(k => {
          if (d[k]) profile[k] = d[k];
        });
        const patch = { profile, templateRefs: refs };
        if (d.reviewChannelRef) patch.reviewChannelRef = d.reviewChannelRef;
        if (isAdmin()) patch.schedule = { enabled: d.scheduleEnabled === 'on' };
        if (!isCurrentScope(accountId, generation)) { endWrite(f); return; }
        const payload = {
          accountId,
          // Pin the optimistic-lock revision to the form snapshot. A tag sync may observe a
          // newer server revision while this form is dirty; never silently rebase its save.
          expectedRevision: f.dataset.revision === '' ? s.revision : Number(f.dataset.revision),
          patch,
        };
        let key;
        try {
          key = await keyFor(f, { operation: 'settings-update', ...payload });
        } catch (x) {
          endWrite(f);
          if (f.isConnected && isCurrentScope(accountId, generation)) message(f, x.message, 'error');
          return;
        }
        if (!f.isConnected || !isCurrentScope(accountId, generation)) { endWrite(f); return; }
        try {
          await api('/api/x-affiliate/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, idempotencyKey: key }),
          });
          clearRetry(f);
          endWrite(f);
          if (isCurrentScope(accountId, generation)) await loadSettings();
        } catch (x) {
          endWrite(f);
          if (isCurrentScope(accountId, generation)) {
            message(box, x.message + (x.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
          }
        }
      }));
    const f = el('form', { className: 'x-form' });
    f.dataset.revision = String(s.revision ?? '');
    f.append(...children);
    f.addEventListener('input', () => { f.dataset.dirty = 'true'; });
    box.append(f);
    enforceMemberUI();
  }
  async function loadTags(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    try {
      const result = await api(`/api/x-affiliate/tags?accountId=${encodeURIComponent(accountId)}`);
      if (!isCurrentScope(accountId, generation)) return;
      renderTags(result, accountId, generation);
    } catch (x) {
      const b = document.getElementById('x-tags');
      if (b && isCurrentScope(accountId, generation)) message(b, x.message, 'error');
    }
  }
  function microJPY(value) {
    if (!Number.isFinite(Number(value))) return '不明';
    return `${(Number(value) / 1000000).toLocaleString('ja-JP')}円`;
  }
  function renderBudget(data, accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-budget'); if (!box) return;
    state.budget = data; box.replaceChildren();
    document.querySelectorAll('.x-regeneration-form[data-account-id]').forEach(form => {
      if (form.dataset.accountId !== accountId) return;
      const allowed = typeof data.operation?.limitMicroJPY === 'number' && Number.isSafeInteger(data.operation.limitMicroJPY) && data.operation.limitMicroJPY >= 0 && form.dataset.archived !== 'true' && form.dataset.busy !== 'true';
      const action = form.querySelector('[data-regeneration-action]'); if (action) action.disabled = !allowed;
      const note = form.querySelector('[data-regeneration-limit]'); if (note) note.textContent = allowed ? `追加費用上限 ${microJPY(data.operation.limitMicroJPY)}（操作枠）` : '追加費用上限を確認できないため再生成できません。予算を再読み込みしてください。';
    });
    const rows = [];
    const monthly = data.monthly || data.month || {};
    const daily = data.daily || data.day || {};
    const operation = data.operation || {};
    [['月次', monthly], ['日次', daily]].forEach(([label, item]) => {
      if (!item || Object.keys(item).length === 0) return;
      rows.push(el('div', { className: 'x-row' }, [el('strong', { text: label }), el('span', { className: 'x-muted', text: `実績 ${microJPY(item.spentMicroJPY)} · 予約 ${microJPY(item.reservedMicroJPY)} · 不明 ${microJPY(item.unknownMicroJPY)} · 上限 ${microJPY(item.limitMicroJPY)}` })]));
    });
    if (operation && Object.keys(operation).length) rows.push(el('div', { className: 'x-row' }, [el('strong', { text: '1操作' }), el('span', { className: 'x-muted', text: `上限 ${microJPY(operation.limitMicroJPY)}` })]));
    if (data.unreviewed) {
      const u = data.unreviewed;
      rows.push(el('div', { className: 'x-row' }, [el('strong', { text: '未レビュー枠' }), el('span', { className: 'x-muted', text: `${u.used ?? 0}件使用 · ${u.reserved ?? 0}件予約 · 上限 ${u.limit ?? '不明'}件` })]));
    }
    const alertState = data.alertState;
    if (daily.unknownMicroJPY > 0 || monthly.unknownMicroJPY > 0) rows.push(el('p', { className: 'x-status', text: `応答不明の費用: 日次 ${microJPY(daily.unknownMicroJPY)} · 月次 ${microJPY(monthly.unknownMicroJPY)}` }));
    if (alertState?.capacity) {
      const labels = { day: '日次', month: '月次', operation: '1操作' };
      const blocked = Object.entries(alertState.capacity).filter(([, value]) => value === true).map(([key]) => labels[key] || key);
      if (blocked.length) rows.push(el('p', { className: 'x-status', text: `予算枠不足: ${blocked.join(', ')}` }));
    }
    const reservations = data.reservations || [];
    const unknown = reservations.filter(item => item.status === 'unknown' || item.state === 'unknown').concat(data.unknownJobs || []);
    if (unknown.length) rows.push(el('p', { className: 'x-status', text: `応答不明の予約 ${unknown.length}件。照合まで保持されています。` }));
    unknown.forEach(item => {
      const id = item.jobId || item.reservationId; if (!id) return;
      const row = el('div', { className: 'x-row' }, [el('span', { className: 'x-muted', text: `照合ID: ${id}${item.reservationId && item.jobId ? ` · job ${item.jobId} · reservation ${item.reservationId}` : ''}` })]);
      if (isAdmin() && item.jobId && item.reservationId) {
        const details = el('div', { className: 'x-muted', text: '外部プロバイダの状態は確認できません。ここでは内部予約の整合性を確認します。' });
        const check = button('状態を確認', async () => {
          if (!beginWrite(check)) return; check.disabled = true;
          try { const result = await api(`/api/x-affiliate/generation-recoveries/${encodeURIComponent(item.jobId)}?accountId=${encodeURIComponent(accountId)}`); const observedAllowed = result.allowedResolutions?.some(option => option.id === 'settle_observed' && option.enabled); const observedOption = resolutionSelect.querySelector('[value="settle_observed"]'); if (observedOption) observedOption.disabled = !observedAllowed; details.textContent = `内部整合性: ${result.internalConsistency?.unknown && result.internalConsistency?.holdPresent ? '復旧待ち' : '要確認'} · 外部状態: 確認不可`; details.dataset.kind = 'ok'; }
          catch (error) { details.textContent = error.message; details.dataset.kind = 'error'; }
          finally { check.disabled = false; endWrite(check); }
        });
        const resolutionSelect = el('select', { name: 'resolution', className: 'form-select' }, [['settle_max_unknown', '不明のまま予約最大額で精算'], ['settle_observed', '保存済みの確認済み使用量で精算'], ['not_sent', '未送信として解放（証跡必須）']].map(([value, label]) => el('option', { value, text: label })));
        const resolution = el('label', { className: 'x-field' }, [el('span', { text: '解消方法' }), resolutionSelect]);
        const reason = field('理由', 'text', 'reason', '', '外部ログや運用判断を記録');
        const evidence = field('証跡参照', 'text', 'evidenceRef', '', 'not_sent の場合は必須');
        const form = el('form', { className: 'x-inline-form' }, [resolution, reason, evidence]);
        const submit = button('照合・復旧', async () => {
          if (!beginWrite(form)) return; submit.disabled = true;
          const selected = form.querySelector('[name="resolution"]')?.value || 'settle_max_unknown';
          const basePayload = { accountId, jobId: item.jobId, reservationId: item.reservationId, resolution: selected, reason: form.querySelector('[name="reason"]')?.value || '', evidenceRef: form.querySelector('[name="evidenceRef"]')?.value || undefined, expectedJobRevision: item.revision };
          try { const current = await api(`/api/x-affiliate/generation-recoveries/${encodeURIComponent(item.jobId)}?accountId=${encodeURIComponent(accountId)}`); basePayload.expectedJobRevision = current.job.revision; const idempotencyKey = await keyFor(form, basePayload); const payload = { ...basePayload, idempotencyKey }; await api('/api/x-affiliate/generation-recoveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); clearRetry(form); message(box, '予約を照合して解消しました。予算と未レビュー枠を再読み込みします。', 'ok'); await loadBudget(accountId, generation); }
          catch (error) { message(box, error.message, 'error'); }
          finally { submit.disabled = false; endWrite(form); }
        });
        row.append(el('div', { className: 'x-recovery-actions' }, [check, details, form, submit]));
      }
      rows.push(row);
    });
    const alerts = data.alerts || [];
    alerts.forEach(alert => rows.push(el('p', { className: 'x-status', text: typeof alert === 'string' ? alert : (alert.message || alert.code || '予算アラート') })));
    if (!rows.length) rows.push(el('p', { className: 'x-muted', text: '予算情報はありません' }));
    box.append(...rows);
  }
  async function loadBudget(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-budget');
    try { const result = await api(`/api/x-affiliate/budget?accountId=${encodeURIComponent(accountId)}`); if (isCurrentScope(accountId, generation)) renderBudget(result, accountId, generation); }
    catch (error) { if (box && isCurrentScope(accountId, generation)) message(box, error.message, error.code === 403 ? 'warn' : 'error'); }
  }
  function renderNotifications(data, accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-notifications'); if (!box) return;
    state.notifications = data; box.replaceChildren();
    const items = data.notifications || data.jobs || [];
    if (!items.length) { box.append(el('p', { className: 'x-muted', text: '通知履歴はありません' })); return; }
    items.forEach(item => {
      const id = item.notificationId || item.id || item.jobId;
      const row = el('div', { className: 'x-row' }, [
        el('span', { text: `${item.event || item.type || '通知'} · ${item.status || '不明'} · 試行 ${item.attempts ?? 0}` }),
      ]);
      if (item.status === 'failed' && id) {
        const retry = button('通知を再試行', async () => {
          if (!retry.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(retry)) return;
          retry.disabled = true;
          try {
            await api(`/api/x-affiliate/notification-jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedAttempts: Number(item.attempts || 0) }) });
            endWrite(retry); if (isCurrentScope(accountId, generation)) await loadNotifications(accountId, generation);
          } catch (error) { endWrite(retry); retry.disabled = false; if (retry.isConnected && isCurrentScope(accountId, generation)) message(row, error.message + (error.code === 409 ? ' 最新状態を確認してください。入力は保持しています。' : ''), 'error'); }
        });
        row.append(retry);
      }
      box.append(row);
    });
    if (data.nextCursor) box.append(button('次の通知を表示', async () => loadNotifications(accountId, generation, data.nextCursor)));
  }
  async function loadNotifications(accountId, generation, cursor = '') {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-notifications');
    try { const query = new URLSearchParams({ accountId }); if (cursor) query.set('cursor', cursor); const result = await api(`/api/x-affiliate/notifications?${query}`); if (isCurrentScope(accountId, generation)) renderNotifications(result, accountId, generation); }
    catch (error) { if (box && isCurrentScope(accountId, generation)) message(box, error.message, error.code === 403 ? 'warn' : 'error'); }
  }
  function renderScheduledRuns(data, accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const box = document.getElementById('x-budget'); if (!box) return;
    const runs = data.runs || data.results || [];
    if (!runs.length) return;
    box.append(el('h4', { text: '定期生成の運用結果' }));
    runs.slice(0, 20).forEach(run => box.append(el('div', { className: 'x-row' }, [el('span', { text: `${run.day || run.date || '日次'} · ${run.status || '不明'} · 商品 ${run.productId || '未選択'} · job ${run.jobId || '不明'} · reservation ${run.reservationId || '不明'}` })])));
  }
  async function loadScheduledRuns(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    try { const result = await api(`/api/x-affiliate/scheduled-runs?accountId=${encodeURIComponent(accountId)}`); if (isCurrentScope(accountId, generation)) renderScheduledRuns(result, accountId, generation); }
    catch (error) { if (error.code !== 404 && isCurrentScope(accountId, generation)) message(document.getElementById('x-budget') || document.body, `定期生成結果を取得できませんでした: ${error.message}`, 'warn'); }
  }
  async function loadSettings() {
    const accountId = state.accountId;
    if (!accountId) return;
    const generation = ++state.generation;
    state.productCatalog = [];
    invalidateSkillPreview();
    document.getElementById('x-settings')?.replaceChildren();
    document.getElementById('x-tags')?.replaceChildren();
    document.getElementById('x-products')?.replaceChildren();
    document.getElementById('x-skills')?.replaceChildren();
    document.getElementById('x-drafts')?.replaceChildren();
    document.getElementById('x-budget')?.replaceChildren();
    document.getElementById('x-notifications')?.replaceChildren();
    try {
      const result = await api(`/api/x-affiliate/settings?accountId=${encodeURIComponent(accountId)}`);
      if (!isCurrentScope(accountId, generation)) return;
      renderSettings(result, accountId, generation);
      enforceMemberUI();
      await Promise.all([loadTags(accountId, generation), loadProducts(accountId, generation), loadSkills(accountId, generation), loadDrafts(accountId, generation), loadBudget(accountId, generation), loadNotifications(accountId, generation), loadScheduledRuns(accountId, generation)]);
    } catch (x) {
      const b = document.getElementById('x-settings');
      if (b && isCurrentScope(accountId, generation)) message(b, x.message, 'error');
    }
  }
  async function load() {
    const loadGeneration = ++state.loadGeneration;
    state.generation += 1;
    try {
      const c = await api('/api/x-affiliate/context');
      if (!xJwt || state.loadGeneration !== loadGeneration) return;
      state.context = c;
      const accounts = c.accounts || [];
      if (state.accountId && !accounts.some(account => account.accountId === state.accountId)) state.accountId = '';
      if (!state.accountId && accounts.length === 1) state.accountId = accounts[0].accountId;
      renderAccounts({ accounts }, loadGeneration);
      renderLinkCard();
      if (c.member?.role === 'admin') {
        const members = await api('/api/x-affiliate/members');
        if (!xJwt || state.loadGeneration !== loadGeneration) return;
        renderMembers(members, loadGeneration);
      } else {
        if (!xJwt || state.loadGeneration !== loadGeneration) return;
        document.getElementById('x-members')?.replaceChildren(el('p', { className: 'x-muted', text: '管理者のみ表示できます' }));
      }
      if (!xJwt || state.loadGeneration !== loadGeneration) return;
      enforceMemberUI();
      if (state.accountId) await loadSettings();
    } catch (x) {
      const root = document.getElementById('page-x-affiliate');
      if (root && xJwt && state.loadGeneration === loadGeneration) message(root, x.message, x.code === 'disabled' ? 'warn' : 'error');
    }
  }
  function installSession(token, proof) { xJwt = token; browserProof = proof; sessionStorage.setItem(PROOF_KEY, proof); try { const p = JSON.parse(atob(xJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (sessionTimer) clearTimeout(sessionTimer); sessionTimer = setTimeout(logout, Math.max(0, p.exp * 1000 - Date.now())); } catch { logout(); throw new Error('認証トークンが不正です'); } }
  function dashboardIdentityToken() { const token = localStorage.getItem('dash-jwt') || ''; try { const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (/^[1-9][0-9]*$/.test(String(p.githubUserId || ''))) return token; const avatar = new URL(String(p.avatar || '')); return avatar.protocol === 'https:' && avatar.hostname === 'avatars.githubusercontent.com' && /^\/u\/[1-9][0-9]*$/.test(avatar.pathname) ? token : ''; } catch { return ''; } }
  async function exchangeDashboardSession() {
    if (!FEATURE_ENABLED || xJwt || pendingCode || sharedAuthPending) return;
    const dashboardJwt = dashboardIdentityToken();
    if (!dashboardJwt) { sharedAuthError = '現在のログイン情報は旧形式です。サイトへ一度だけ再ログインしてください。'; return; }
    sharedAuthPending = true; sharedAuthError = '';
    const root = document.getElementById('page-x-affiliate'); if (root && location.hash.startsWith('#xentry')) render(root);
    const proof = random();
    try {
      const r = await fetch(`${API_ORIGIN}/api/x-auth/dashboard-exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dashboardJwt}` }, body: JSON.stringify({ proof }) });
      let body = {}; try { body = await r.json(); } catch {}
      if (!r.ok) throw new Error(r.status === 403 ? 'このアカウントはX投稿BOTのメンバーに登録されていません。' : 'サイトへ再ログインしてください。');
      installSession(body.token || body.jwt || '', proof);
    } finally { sharedAuthPending = false; }
  }
  async function login() { if (!FEATURE_ENABLED) return; location.assign(`${API_ORIGIN}/auth/login?return=${encodeURIComponent(location.origin + location.pathname + '#xentry')}`); }
  async function callback() { const code = pendingCode; if (!code || !FEATURE_ENABLED) return; const verifier = sessionStorage.getItem(VERIFIER_KEY); sessionStorage.removeItem(VERIFIER_KEY); if (!verifier) return; const r = await fetch(`${API_ORIGIN}/api/x-auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) }); if (!r.ok) throw new Error('X認証コードを交換できませんでした'); const d = await r.json(); installSession(d.token || d.jwt || '', verifier); }
  async function authenticate() { if (pendingCode) await callback(); else await exchangeDashboardSession(); }
  function boot() { const root = document.getElementById('page-x-affiliate'); if (!root) return; const entry = document.getElementById('x-affiliate-entry'); const mobile = document.getElementById('x-affiliate-mobile-entry'); const open = () => { window._dashInvalidate?.(); location.hash = 'xentry'; render(root); exchangeDashboardSession().then(() => { if (location.hash.startsWith('#xentry')) render(root); }).catch(e => { sharedAuthError = e.message; if (location.hash.startsWith('#xentry')) render(root); }); root.scrollIntoView?.({ block: 'start' }); }; entry?.addEventListener('click', open); mobile?.addEventListener('click', open); if (location.hash.startsWith('#xentry')) render(root); authenticate().then(() => { if (location.hash.startsWith('#xentry')) render(root); }).catch(e => { sharedAuthError = e.message; if (location.hash.startsWith('#xentry')) render(root); }); }
  window.HachiXAffiliate = { api, login, logout, challenge, cleanFragment, isActive: () => location.hash.startsWith('#xentry'), setActive: syncNavigation, refresh: () => { const r = document.getElementById('page-x-affiliate'); if (r) render(r); }, signOut: logout };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
