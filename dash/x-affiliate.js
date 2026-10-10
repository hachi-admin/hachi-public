/* global Event, sessionStorage, TextEncoder */
/* X affiliate administration. Uses the verified dashboard identity to mint an isolated X session. */
(function () {
  'use strict';
  const API_ORIGIN = 'https://hachi-core-685554938840.asia-northeast1.run.app';
  const FEATURE_ENABLED = true;
  const VALIDATION_GUIDANCE = {
    structure_invalid: '本文（商品リンクと #PR を除く）の段落数がテンプレートと合いません。元の段落数を保ち、各段落の文章を直してください。',
    blocks_invalid: '本文の段落構成を確認できません。内容を確認し、必要なら新しい候補を作成してください。',
    assignment_mismatch: '候補に割り当てられたテンプレートや商品が一致しません。最新の条件で候補を作り直してください。',
    fact_ref_invalid: '商品に登録されている情報と結び付かない内容があります。登録済みの特徴に沿って書き直してください。',
    block_order_invalid: '段落の順番がテンプレートと異なります。テンプレートの順番に合わせてください。',
    product_count_invalid: 'このテンプレートで扱える商品数と選択数が合いません。商品数かテンプレートを見直してください。',
    angle_invalid: 'このテンプレートでは使えない切り口です。選べる切り口を指定してください。',
    unknown_fact_ref: '商品に登録されていない情報を根拠にしています。登録済みの商品情報に沿って書き直してください。',
    evidence_ref_missing: '商品情報に基づく説明に根拠がありません。登録済みの特徴を使って説明してください。',
    prohibited_exaggeration: '「絶対」「必ず」「最強」など、確認できない強い表現は使えません。事実に沿った表現に直してください。',
    unverified_experience: '実際に使ったと確認できない体験談は書けません。商品情報に基づく表現に直してください。',
    fixed_phrase_missing: 'このテンプレートに必要な決まり文句がありません。テンプレートの形式に合わせてください。',
    hook_length_invalid: '冒頭の紹介文の長さがテンプレートの範囲外です。短く調整してください。',
    period_not_allowed: 'このテンプレートでは「。」を使えません。句点を外してください。',
    monologue_too_long: 'つぶやき部分が長すぎます。20文字以内に短くしてください。',
    single_product_nsen_not_allowed: 'まとめ紹介には複数商品が必要です。複数商品を選ぶか、別のテンプレートを使ってください。',
    product_count_label_missing: '本文に書かれた紹介数と選択した商品数が合いません。数字を合わせてください。',
    measurement_missing: 'サイズや数量などの具体的な数値がありません。商品情報にある数値を加えてください。',
    single_comparison_axis_required: '比較の根拠を1つに特定できません。商品情報にある比較項目を確認してください。',
    pr_disclosure_invalid: '#PR は1回だけ必要です。削除や重複がないか確認してください。',
    extra_hashtag: '#PR 以外のハッシュタグは使えません。',
    product_link_missing: '商品リンクが不足または変更されています。本文末尾の商品リンクを残してください。',
    product_link_count_invalid: '選択した商品数とリンク数が合いません。余分なURLを削除し、各商品のリンクを残してください。',
    weighted_length_exceeded: '投稿全体がXの文字数上限を超えています。商品リンクなども含めて本文を短くしてください。',
    exact_duplicate: '同じグループに同じ内容の案があります。採用する案を選ぶか、それぞれの内容を変えてください。',
    skill_snapshot_invalid: 'この案のテンプレート情報が現在の状態と一致しません。最新のテンプレートで候補を作り直してください。',
    default_tag_not_configured: '商品リンクのタグ設定が確認できません。アカウント設定の商品リンクタグを確認してください。',
    generation_allocations_invalid: '選択したテンプレートと候補数が一致しません。案ごとの選択内容を確認してください。',
    variant_set_invalid: '候補の数が選択内容と一致しません。候補数と案ごとのテンプレートを確認してください。',
  };
  const validationMessage = code => VALIDATION_GUIDANCE[code] || '投稿ルールに沿っていない箇所があります。本文と選択したテンプレートを確認してください。';
  const validationMessages = codes => [...new Set((codes || []).filter(code => typeof code === 'string').map(validationMessage))];
  const draftStateLabel = state => ({ needs_review: 'レビュー待ち', approved: '採用済み', rejected: '見送り', archived: '保管' })[state] || '状態確認中';
  const productWorkspaceLabel = product => `${product?.name || '商品名未入力'}（ジャンル: ${product?.category || '未設定'}） · ASIN ${product?.asin || '不明'}`;
  const angleLabels = { feature: '確認済みの特徴', size: 'サイズ・省スペース', comparison: '比較', classification: '分類', placement: '配置場所', object: '片付け対象' };
  const ACTION_GUIDANCE = {
    generation_allocation_blocked: '選択した商品で使えるテンプレートがありません。商品の情報を補うか、別の商品を選んでください。',
    generation_adapter_not_configured: '投稿生成機能を現在利用できません。時間をおいてから再度お試しください。',
    generation_input_too_large: '選択内容が多く、候補を作成できませんでした。商品数または候補数を減らしてください。',
    generation_output_invalid: '生成結果が投稿ルールを満たしませんでした。表示されている修正点を確認してください。',
    generation_response_unknown: '生成結果を確認できませんでした。再生成の前に、予算画面の応答不明の予約を確認してください。',
    provider_response_unknown: '生成サービスから結果を確認できませんでした。再生成の前に、予算画面の応答不明の予約を確認してください。',
    operation_budget_exceeded: 'この操作の費用上限を超えるため実行できません。候補数を減らすか、管理者にご確認ください。',
    monthly_budget_exceeded: '今月の生成予算上限に達しています。予算設定を確認してください。',
    daily_budget_exceeded: '本日の生成予算上限に達しています。時間をおいてから再度お試しください。',
    review_slots_exceeded: 'レビュー待ちの上限に達しています。先に既存の候補を確認・整理してください。',
    draft_not_approvable: 'この候補は投稿ルールを満たしていません。上の指摘を修正して保存してください。',
    evidence_stale: '商品情報またはテンプレートが更新されています。最新の内容で候補を作り直してください。',
    job_in_progress: '生成または再生成の処理中です。完了してから操作してください。',
    revision_conflict: '別の更新が先に行われました。最新の内容を確認してから、もう一度操作してください。',
    group_snapshot_conflict: '同じグループの候補が更新されています。最新の候補を読み込み直してください。',
  };
  const actionErrorMessage = error => {
    const code = String(error?.body?.error?.code || '').toLowerCase();
    return ACTION_GUIDANCE[code] || error?.body?.error?.message || error?.message || '操作に失敗しました。最新の状態を読み込み直してください。';
  };
  const actionGuidanceForCode = code => ACTION_GUIDANCE[String(code || '').toLowerCase()] || (code ? `詳細コード: ${code}` : '');
  const jobStatusLabel = status => ({ queued: '受付済み', running: '処理中', completed: '完了', failed: '失敗', unknown: '結果を確認できません' })[status] || '状態確認中';
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
    { id: 'products', label: '商品ワークスペース' },
    { id: 'templates', label: 'テンプレート' },
    { id: 'operations', label: '運用状況' },
    { id: 'account', label: 'アカウント設定' },
  ];
  let state = { context: null, accountId: '', activePanel: 'products', generation: 0, loadGeneration: 0, productLoadGeneration: new Map(), draftLoadGeneration: new Map(), linkGeneration: 0, previewGeneration: 0, skillDrafts: new Map(), generationJobs: new Map(), draftJobs: new Map(), generationNotice: null, productCatalog: [], productCatalogByAccount: new Map(), workspaceSelections: new Map(), workspaceViews: new Map(), productEditDrafts: new Map(), draftEditDrafts: new Map(), generationFormState: new Map(), productFilters: new Map(), reviewFilters: new Map(), draftSnapshots: new Map(), settings: null, budget: null, notifications: null, importResult: null, skillPreview: null, link: null, linkStartPending: false, linkStatusPending: false, linkFinalizePending: false };
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
    if (!r.ok) {
      const diagnostic = [body.error?.code, body.error?.requestId ? `requestId ${body.error.requestId}` : ''].filter(Boolean).join(' · ');
      const message = body.error?.message || `操作に失敗しました (${r.status})`;
      throw Object.assign(new Error(diagnostic ? `${message} · ${diagnostic}` : message), { code: r.status, body });
    }
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
    state.productCatalogByAccount.clear(); state.workspaceSelections.clear(); state.workspaceViews.clear(); state.productEditDrafts.clear(); state.draftEditDrafts.clear(); state.generationFormState.clear();
    state.draftSnapshots.clear(); state.productLoadGeneration.clear(); state.draftLoadGeneration.clear();
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
  function focusedControl(container) {
    const active = document.activeElement;
    if (!container?.contains(active) || !active.dataset.workspaceFocusKey) return null;
    return { key: active.dataset.workspaceFocusKey, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection };
  }
  function restoreFocusedControl(container, saved) {
    if (!saved || !container) return;
    const target = [...container.querySelectorAll('[data-workspace-focus-key]')].find(node => node.dataset.workspaceFocusKey === saved.key);
    if (!target) return;
    target.focus();
    if (typeof saved.start === 'number' && typeof target.setSelectionRange === 'function') {
      try { target.setSelectionRange(saved.start, saved.end, saved.direction || 'none'); } catch {}
    }
  }
  function syncNavigation(active) {
    const desktop = document.getElementById('x-affiliate-entry');
    const mobile = document.getElementById('x-affiliate-mobile-entry');
    [desktop, mobile].forEach(button => {
      if (!button) return;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    // The section tabs belong to the dashboard page that was open before; X BOT has none of its own.
    const sub = document.getElementById('dest-sub'); if (sub) sub.style.display = active ? 'none' : '';
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
      el('div', { className: 'x-workspace-account-switch', id: 'x-workspace-account-switch' }, [el('label', { className: 'x-field' }, [el('span', { text: '投稿先アカウント' }), el('select', { className: 'form-select', name: 'workspaceAccountSelect', 'aria-label': '投稿先アカウント' })])]),
      el('div', { className: 'x-workspace-layout' }, [
        card('商品', el('div', { id: 'x-products' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
        el('div', { className: 'x-workspace-main' }, [
          card('選択中の商品', el('div', { id: 'x-product-detail' }, [el('p', { className: 'x-muted', text: '商品を選択してください' })])),
          card('投稿文・レビュー', el('div', { id: 'x-drafts' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
        ]),
      ]),
    ]));
    root.append(sectionPanel('templates', [
      card('プロフィール・テンプレート・通知先・定期', el('div', { id: 'x-settings' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
      card('テンプレート・Skill', el('div', { id: 'x-skills' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
    ]));
    root.append(sectionPanel('operations', [
      card('予算・予約状況', el('div', { id: 'x-budget' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])),
      card('直近の生成リクエスト', el('div', { id: 'x-generation-status' }, [el('p', { className: 'x-muted', text: 'この画面を開いてからの生成結果を表示します' })])),
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
    syncWorkspaceAccountSelector(data.accounts || []);
    (data.accounts || []).forEach(a => {
      const b = button(`${a.label} (${a.accountId})`, () => selectAccount(a.accountId));
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
  const productEditKey = (accountId, productId) => `${accountId}\u0000${productId}`;
  const generationFormKey = (accountId, productId = state.workspaceSelections.get(accountId) || '') => `${accountId}\u0000${productId}`;
  function renderProductItems(products, accountId, generation, drafts = []) {
    const items = el('div', { className: 'x-product-list', 'aria-label': '商品一覧' });
    items.dataset.accountId = accountId;
    const selectedId = state.workspaceSelections.get(accountId) || '';
    products.forEach(item => {
      const product = item.product || {};
      const related = drafts.filter(draft => (draft.productIds || []).includes(product.productId));
      const waiting = related.filter(draft => draft.state === 'needs_review').length;
      const approved = related.filter(draft => draft.state === 'approved').length;
      const info = item.readiness?.ready ? '情報: 完了' : `情報: 不足${item.readiness?.missing?.length ? ` (${item.readiness.missing.length})` : ''}`;
      const row = button('', () => {
        state.workspaceSelections.set(accountId, product.productId);
        const browse = document.querySelector('#x-products .x-product-browse-details');
        if (window.innerWidth <= 680 && browse) browse.open = false;
        items.querySelectorAll('.x-workspace-product').forEach(other => {
          const active = other === row;
          other.classList.toggle('is-selected', active); other.setAttribute('aria-pressed', String(active));
        });
        document.querySelector('#x-products .x-filter-selection-note')?.remove();
        renderProductEditor(item, accountId, generation);
        const snapshot = state.draftSnapshots.get(accountId);
        if (snapshot) renderDrafts(snapshot, accountId, generation);
      });
      row.className = `x-workspace-product${selectedId === product.productId ? ' is-selected' : ''}`;
      row.setAttribute('aria-pressed', String(selectedId === product.productId));
      row.removeAttribute('role');
      row.append(el('strong', { text: product.name || '商品名未入力' }),
        el('span', { className: 'x-product-category', text: `ジャンル: ${product.category || '未設定'}` }),
        el('span', { className: 'x-muted', text: `ASIN ${product.asin || '不明'}` }),
        el('span', { className: 'x-muted', text: `${info} · レビュー待ち ${waiting} · 採用済み ${approved}` }));
      items.append(row);
    });
    if (!products.length) items.append(el('p', { className: 'x-muted', text: '条件に一致する商品はありません' }));
    return items;
  }
  function renderProductEditor(item, accountId, generation) {
    const box = document.getElementById('x-product-detail');
    if (!box || !isCurrentScope(accountId, generation)) return;
    const savedFocus = focusedControl(box);
    const product = item.product || {};
    const accountProduct = item.accountProduct || {};
    const key = productEditKey(accountId, product.productId);
    const saved = state.productEditDrafts.get(key) || {};
    const initial = {
      name: product.name || '', category: product.category || '', features: (product.features || []).join('\n'), tags: (product.tags || []).join(', '),
      facts: (product.facts || []).map(fact => `${fact.type} | ${fact.value}`).join('\n'),
      operatorNote: accountProduct.operatorNote || '', sourceNote: '', enabled: accountProduct.enabled !== false, scheduleEnabled: accountProduct.scheduleEnabled === true,
    };
    const values = { ...initial, ...(saved.values || {}) };
    const missingLabels = { name: '商品名', category: '商品ジャンル', features: '特徴', facts: '確認済み事実', source: '確認元' };
    const missing = item.readiness?.missing || [];
    const form = el('form', { className: 'x-form x-product-editor' }, [
      el('p', { className: 'x-muted', text: `ASIN ${product.asin || '不明'} · ${{available:'利用中',input_pending:'情報入力待ち',paused:'停止中',archived:'アーカイブ',invalid:'要確認'}[product.catalogStatus] || '状態確認中'} · 不足: ${missing.map(value => missingLabels[value] || value).join('、') || 'なし'}` }),
      field('商品名', 'text', 'name', values.name),
      field('商品ジャンル（投稿候補の分類）', 'text', 'category', values.category, '例: キッチン用品、PC周辺機器'),
      field('確認済み特徴（1行1件）', 'textarea', 'features', values.features),
      field('タグ（カンマ区切り）', 'text', 'tags', values.tags),
      field('確認済み事実（種類 | 内容、1行1件）', 'textarea', 'facts', values.facts),
      field('運用メモ', 'text', 'operatorNote', values.operatorNote),
      checkbox('このaccountで利用', 'enabled', values.enabled),
      checkbox('定期生成の対象', 'scheduleEnabled', values.scheduleEnabled),
      field('手修正の確認元・理由', 'text', 'sourceNote', values.sourceNote, '確認した資料など'),
      button('商品情報を保存', async event => {
        event.preventDefault();
        if (!form.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(form)) return;
        const draft = state.productEditDrafts.get(key) || { values, productRevision: product.revision, accountRevision: accountProduct.revision };
        const fields = {};
        if (draft.values.name !== initial.name) fields.name = draft.values.name || null;
        if (draft.values.category !== initial.category) fields.category = draft.values.category || null;
        const features = String(draft.values.features || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        if (JSON.stringify(features) !== JSON.stringify(product.features || [])) fields.features = features.length ? features : null;
        const tags = splitTagList(draft.values.tags);
        if (JSON.stringify(tags) !== JSON.stringify(product.tags || [])) fields.tags = tags.length ? tags : null;
        if ((draft.values.operatorNote || '') !== initial.operatorNote) fields.operatorNote = draft.values.operatorNote || null;
        if (draft.values.enabled !== initial.enabled) fields.enabled = Boolean(draft.values.enabled);
        if (draft.values.scheduleEnabled !== initial.scheduleEnabled) fields.scheduleEnabled = Boolean(draft.values.scheduleEnabled);
        const facts = [];
        for (const line of String(draft.values.facts || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
          const separator = line.indexOf('|');
          if (separator < 1 || separator === line.length - 1) { endWrite(form); message(form, '事実は「種類 | 内容」で1行ずつ入力してください', 'error'); return; }
          const type = line.slice(0, separator).trim(); const value = line.slice(separator + 1).trim();
          const prior = (product.facts || []).find(fact => !facts.some(item => item.factId === fact.factId) && fact.type === type && fact.value === value);
          facts.push(prior ? { factId: prior.factId, type, value } : { type, value });
        }
        if (JSON.stringify(facts.map(({ factId, ...fact }) => fact)) !== JSON.stringify((product.facts || []).map(({ factId, ...fact }) => fact))) fields.facts = facts;
        if (!Object.keys(fields).length) { endWrite(form); message(form, '変更はありません', ''); return; }
        if (Object.hasOwn(fields, 'category') && !String(draft.values.sourceNote || '').trim()) { endWrite(form); message(form, '商品ジャンルを変更する場合は、手修正の確認元・理由を入力してください。', 'error'); return; }
        try {
          form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = true; });
          await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: draft.productRevision ?? product.revision, expectedAccountRevision: draft.accountRevision ?? accountProduct.revision, fields, sourceNote: draft.values.sourceNote }) });
          endWrite(form); state.productEditDrafts.delete(key);
          if (isCurrentScope(accountId, generation)) await loadProducts(accountId, generation);
        } catch (error) {
          endWrite(form); if (form.isConnected) { form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = false; }); message(form, `${actionErrorMessage(error)}${error.code === 409 ? ' 入力は保持しています。' : ''}`, 'error'); }
        }
      }),
    ]);
    form.addEventListener('input', event => {
      if (!event.target.name) return;
      const current = state.productEditDrafts.get(key) || { values: { ...values }, dirty: true, productRevision: product.revision, accountRevision: accountProduct.revision };
      current.values[event.target.name] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; current.dirty = true; state.productEditDrafts.set(key, current);
    });
    const infoDetails = el('details', { className: 'x-product-info-details' });
    infoDetails.append(el('summary', { text: missing.length ? `不足項目を補う（${missing.map(value => missingLabels[value] || value).join('、')}）` : '商品情報を確認・編集' }));
    infoDetails.open = missing.length > 0;
    const primaryNames = new Set(['name', 'category', 'features', 'facts', 'sourceNote']);
    const fields = [...form.querySelectorAll('.x-field')];
    const saveButton = form.querySelector('button');
    fields.forEach(node => node.remove()); saveButton?.remove();
    fields.filter(node => primaryNames.has(node.querySelector('[name]')?.name)).forEach(node => infoDetails.append(node));
    if (saveButton) infoDetails.append(saveButton);
    const optionalDetails = el('details', { className: 'x-product-optional-details' }, [el('summary', { text: 'その他の情報・運用設定' })]);
    fields.filter(node => !primaryNames.has(node.querySelector('[name]')?.name)).forEach(node => optionalDetails.append(node));
    form.append(infoDetails, optionalDetails);
    const actionRow = el('div', { className: 'x-inline-form x-product-actions' });
    actionRow.append(button('商品情報を取得し直す', async () => {
      try { await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision }) }); await loadProducts(accountId, generation); }
      catch (error) { if (actionRow.isConnected) { optionalDetails.open = true; message(actionRow, actionErrorMessage(error), 'error'); } }
    }));
    if (isAdmin() && ['archived', 'paused', 'invalid'].includes(product.catalogStatus)) actionRow.append(button('復元して再確認', async () => {
      try { await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision, expectedAccountRevision: accountProduct.revision }) }); await loadProducts(accountId, generation); }
      catch (error) { if (actionRow.isConnected) message(actionRow, actionErrorMessage(error), 'error'); }
    }));
    if (isAdmin() && product.catalogStatus !== 'archived') actionRow.append(button('アーカイブ', async () => {
      if (!window.confirm('この商品をアーカイブしますか？')) return;
      try { await api(`/api/x-affiliate/products/${encodeURIComponent(product.productId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, expectedRevision: product.revision, fields: { catalogStatus: 'archived' } }) }); await loadProducts(accountId, generation); }
      catch (error) { if (actionRow.isConnected) message(actionRow, actionErrorMessage(error), 'error'); }
    }));
    optionalDetails.append(actionRow);
    const title = el('div', { className: 'x-selected-product-title' }, [el('strong', { text: product.name || '商品名未入力' }), el('span', { className: 'x-product-category', text: `ジャンル: ${product.category || '未設定'}` }), el('span', { className: 'x-muted', text: `ASIN ${product.asin || '不明'}` })]);
    if (product.canonicalUrl) title.append(el('a', { className: 'x-product-link', href: product.canonicalUrl, target: '_blank', rel: 'noopener noreferrer', text: '商品ページを開く' }));
    box.replaceChildren(title, form);
    form.querySelectorAll('[name]').forEach(control => { control.dataset.workspaceFocusKey = `product:${product.productId}:${control.name}`; });
    restoreFocusedControl(box, savedFocus);
  }
  function renderProducts(data, accountId, generation) {
    const box = document.getElementById('x-products');
    if (!box || !isCurrentScope(accountId, generation)) return;
    state.productCatalogByAccount.set(accountId, data.products || []);
    state.productCatalog = data.products || [];
    const draftForm = document.querySelector('#x-drafts .x-generation-form');
    if (draftForm) syncProductPicker(draftForm.querySelector('[name="productPicker"]'), draftForm.querySelector('[name="productIds"]'), draftForm.querySelector('.x-generation-product-options'));
    invalidateSkillPreview();
    const existingItems = box.querySelector('.x-product-list');
    if (existingItems?.dataset.accountId === accountId) {
      const saved = state.productFilters.get(accountId) || { q: '', status: '', readiness: '', tag: '', review: '' };
      const snapshots = state.draftSnapshots.get(accountId)?.drafts || [];
      const visible = (data.products || []).filter(item => {
        const product = item.product || {};
        const drafts = snapshots.filter(draft => (draft.productIds || []).includes(product.productId));
        const query = String(saved.q || '').trim().toLowerCase();
        return (!query || `${product.name || ''} ${product.asin || ''}`.toLowerCase().includes(query))
          && (!saved.status || (product.catalogStatus || '') === saved.status)
          && (!saved.readiness || (saved.readiness === 'ready' ? item.readiness?.ready : !item.readiness?.ready))
          && (!saved.tag || (product.tags || []).includes(saved.tag))
          && (!saved.review || (saved.review === 'needs_review' ? drafts.some(draft => draft.state === 'needs_review') : saved.review === 'approved' ? drafts.some(draft => draft.state === 'approved') : true));
      });
      const selected = (data.products || []).find(item => item.product?.productId === state.workspaceSelections.get(accountId))
        || (data.products || []).find(item => snapshots.some(draft => draft.state === 'needs_review' && (draft.productIds || []).includes(item.product?.productId)))
        || (data.products || [])[0];
      if (selected) state.workspaceSelections.set(accountId, selected.product.productId);
      existingItems.replaceWith(renderProductItems(visible, accountId, generation, snapshots));
      const tagFilter = box.querySelector('[name="tag"]');
      if (tagFilter) {
        const selectedTag = tagFilter.value;
        const tags = [...new Set(data.availableTags || [])];
        if (selectedTag && !tags.includes(selectedTag)) tags.unshift(selectedTag);
        tagFilter.replaceChildren(...['', ...tags].map(tag => el('option', { value: tag, text: tag ? `${tag}${tag === selectedTag && !(data.availableTags || []).includes(tag) ? '（該当なし）' : ''}` : 'すべてのタグ' })));
        tagFilter.value = selectedTag;
      }
      const priorResult = box.querySelector('.x-import-results');
      const nextResult = state.importResult?.accountId === accountId ? importResult(state.importResult.result, accountId, generation) : null;
      if (priorResult && nextResult) priorResult.replaceWith(nextResult);
      else if (priorResult) priorResult.remove();
      else if (nextResult) box.querySelector('.x-product-csv-import')?.after(nextResult);
      const draftSnapshot = state.draftSnapshots.get(accountId);
      if (draftSnapshot) renderDrafts(draftSnapshot, accountId, generation);
      if (selected) renderProductEditor(selected, accountId, generation);
      const selectionNote = box.querySelector('.x-filter-selection-note');
      if (selected && !visible.some(item => item.product?.productId === selected.product.productId)) {
        if (!selectionNote) box.append(el('p', { className: 'x-status x-filter-selection-note', text: '選択中の商品は現在の絞り込み対象外ですが、右側の作業領域に表示しています。' }));
      } else selectionNote?.remove();
      return;
    }
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
          const firstImported = (result.rows || []).find(row => row.productId);
          if (firstImported) state.workspaceSelections.set(accountId, firstImported.productId);
          await loadProducts(accountId, generation);
        } catch (error) {
          endWrite(importForm);
          if (importForm.isConnected && isCurrentScope(accountId, generation)) message(importForm, error.message + (error.code === 409 ? ' 同じ受付IDの入力が変わっています。入力は保持しています。' : ''), 'error');
        }
      }),
    ]);
    const addDetails = el('details', { className: 'x-product-add-details' }, [el('summary', { text: 'URL・CSVから商品を追加' }), importForm]);
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
    addDetails.append(csvForm);
    box.append(addDetails);
    if (state.importResult?.accountId === accountId) box.append(importResult(state.importResult.result, accountId, generation));
    const savedFilter = state.productFilters.get(accountId) || { q: '', status: '', tag: '' };
    const catalogForAccount = state.productCatalogByAccount.get(accountId) || data.products || [];
    const snapshots = state.draftSnapshots.get(accountId)?.drafts || [];
    const selectedProduct = catalogForAccount.find(item => item.product?.productId === state.workspaceSelections.get(accountId))
      || catalogForAccount.find(item => snapshots.some(draft => draft.state === 'needs_review' && (draft.productIds || []).includes(item.product?.productId)))
      || catalogForAccount[0];
    if (selectedProduct) state.workspaceSelections.set(accountId, selectedProduct.product.productId);
    const tagOptions = ['', ...(data.availableTags || [])];
    const filter = el('form', { className: 'x-inline-form x-product-filter' }, [
      field('商品名・ASIN検索', 'search', 'q'),
      selectField('状態', 'status', '', ['', 'available', 'input_pending', 'paused', 'archived', 'invalid']),
      selectField('情報', 'readiness', savedFilter.readiness || '', ['', 'ready', 'missing']),
      selectField('レビュー', 'review', savedFilter.review || '', ['', 'needs_review', 'approved']),
      selectField('タグ', 'tag', '', tagOptions),
      button('絞り込む', async event => {
        event.preventDefault();
        if (!isCurrentScope(accountId, generation)) return;
        const values = formData(filter);
        const activeFilter = { q: values.q || '', status: values.status || '', readiness: values.readiness || '', tag: values.tag || '', review: values.review || '' };
        state.productFilters.set(accountId, activeFilter);
        renderProducts({ ...data, products: state.productCatalogByAccount.get(accountId) || data.products }, accountId, generation);
      }),
    ]);
    const optionLabels = {
      status: { '': 'すべての状態', available: '利用中', input_pending: '情報入力待ち', paused: '停止中', archived: 'アーカイブ', invalid: '要確認' },
      readiness: { '': 'すべて', ready: '情報入力済み', missing: '要入力' },
      review: { '': 'すべて', needs_review: 'レビュー待ち', approved: '採用済み' },
      tag: { '': 'すべてのタグ' },
    };
    Object.entries(optionLabels).forEach(([name, labels]) => filter.querySelectorAll(`[name="${name}"] option`).forEach(option => { if (labels[option.value]) option.textContent = labels[option.value]; }));
    const advancedFilters = el('details', { className: 'x-product-advanced-filters' }, [el('summary', { text: '状態・情報・タグで絞り込む' })]);
    ['status', 'readiness', 'tag'].forEach(name => {
      const fieldNode = filter.querySelector(`[name="${name}"]`)?.closest('.x-field');
      if (fieldNode) { fieldNode.remove(); advancedFilters.append(fieldNode); }
    });
    filter.append(advancedFilters);
    filter.querySelector('[name="q"]').value = savedFilter.q;
    filter.querySelector('[name="status"]').value = savedFilter.status;
    filter.querySelector('[name="tag"]').value = savedFilter.tag || '';
    const filterState = state.productFilters.get(accountId) || savedFilter;
    filter.querySelector('[name="readiness"]').value = filterState.readiness || '';
    filter.querySelector('[name="review"]').value = filterState.review || '';
    const query = String(filterState.q || '').trim().toLowerCase();
    const visible = (data.products || []).filter(item => {
      const product = item.product || {};
      const drafts = snapshots.filter(draft => (draft.productIds || []).includes(product.productId));
      return (!query || `${product.name || ''} ${product.asin || ''}`.toLowerCase().includes(query))
        && (!filterState.status || (product.catalogStatus || '') === filterState.status)
        && (!filterState.readiness || filterState.readiness === 'ready' && item.readiness?.ready || filterState.readiness === 'missing' && !item.readiness?.ready)
        && (!filterState.tag || (product.tags || []).includes(filterState.tag))
        && (!filterState.review || filterState.review === 'needs_review' && drafts.some(draft => draft.state === 'needs_review') || filterState.review === 'approved' && drafts.some(draft => draft.state === 'approved'));
    });
    const items = renderProductItems(visible, accountId, generation, snapshots);
    const browseDetails = el('details', { className: 'x-product-browse-details' }, [el('summary', { text: '検索・絞り込み・商品一覧' }), filter, items]);
    browseDetails.open = window.innerWidth > 680;
    box.append(browseDetails);
    if (selectedProduct && !visible.some(item => item.product?.productId === selectedProduct.product.productId)) box.append(el('p', { className: 'x-status x-filter-selection-note', text: '選択中の商品は現在の絞り込み対象外ですが、右側の作業領域に表示しています。' }));
    if (selectedProduct) renderProductEditor(selectedProduct, accountId, generation);
    else document.getElementById('x-product-detail')?.replaceChildren(el('p', { className: 'x-muted', text: '商品を追加するか、検索条件を変更してください' }));
    const draftSnapshot = state.draftSnapshots.get(accountId);
    if (draftSnapshot) renderDrafts(draftSnapshot, accountId, generation);
  }
  async function loadProducts(accountId, generation, filter) {
    if (!isCurrentScope(accountId, generation)) return;
    const requestGeneration = (state.productLoadGeneration.get(accountId) || 0) + 1;
    state.productLoadGeneration.set(accountId, requestGeneration);
    const activeFilter = filter ? { q: filter.q || '', status: filter.status || '', tag: filter.tag || '' } : (state.productFilters.get(accountId) || { q: '', status: '', tag: '' });
    state.productFilters.set(accountId, activeFilter);
    const query = new URLSearchParams({ accountId });
    try {
      let products = []; let availableTags = []; let cursor = ''; let lastPage = {};
      do {
        const pageQuery = new URLSearchParams(query);
        if (cursor) pageQuery.set('cursor', cursor);
        lastPage = await api(`/api/x-affiliate/products?${pageQuery}`);
        if (!isCurrentScope(accountId, generation) || state.productLoadGeneration.get(accountId) !== requestGeneration) return;
        products.push(...(lastPage.products || []));
        availableTags = [...new Set([...availableTags, ...(lastPage.availableTags || [])])];
        cursor = lastPage.nextCursor || '';
      } while (cursor && isCurrentScope(accountId, generation));
      const result = { ...lastPage, products, availableTags };
      if (isCurrentScope(accountId, generation) && state.productLoadGeneration.get(accountId) === requestGeneration) renderProducts(result, accountId, generation);
    } catch (error) {
      const box = document.getElementById('x-products');
      if (box && isCurrentScope(accountId, generation) && state.productLoadGeneration.get(accountId) === requestGeneration) message(box, error.message, 'error');
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
  function syncProductPicker(select, input, choices = null) {
    if (!select) return;
    const savedGeneration = state.generationFormState.get(generationFormKey(state.accountId)) || {};
    const selected = new Set(input
      ? String(input.value || '').split(',').map(value => value.trim()).filter(Boolean)
      : [...select.selectedOptions].map(option => option.value).filter(Boolean));
    if (!selected.size && !input) {
      (savedGeneration.productIds?.length ? savedGeneration.productIds : [state.workspaceSelections.get(state.accountId)]).filter(Boolean).forEach(id => selected.add(id));
    }
    select.replaceChildren();
    const ready = state.productCatalog.filter(item => item.product?.catalogStatus === 'available' && item.readiness?.ready === true && item.readiness?.requiresRecheck !== true && item.accountProduct?.enabled !== false && item.accountProduct?.scheduleEnabled !== true);
    if (!ready.length) {
      select.append(el('option', { text: state.productCatalog.length ? '投稿生成の準備ができた商品はありません' : '商品登録後に選択できます', value: '' }));
      select.disabled = true;
      choices?.replaceChildren(el('p', { className: 'x-muted', text: state.productCatalog.length ? '投稿生成に使える商品がありません。商品情報を確認してください。' : '商品登録後に選択できます。' }));
      return;
    }
    select.disabled = false;
    if (choices) choices.replaceChildren();
    ready.forEach(item => {
      const product = item.product || {};
      const label = productWorkspaceLabel(product);
      const option = el('option', { value: product.productId, text: `${label} · ID: ${product.productId}` });
      option.selected = selected.has(product.productId);
      select.append(option);
      if (choices) {
        const checkbox = el('input', { type: 'checkbox', name: 'productPickerChoice', value: product.productId, 'aria-label': label });
        checkbox.checked = selected.has(product.productId);
        choices.append(el('label', { className: 'x-generation-product-option' }, [checkbox, el('span', { text: label })]));
      }
    });
  }
  function syncWorkspaceAccountSelector(accounts = state.context?.accounts || []) {
    const select = document.querySelector('[name="workspaceAccountSelect"]');
    if (!select) return;
    const prior = state.accountId;
    select.replaceChildren(el('option', { value: '', text: 'アカウントを選択' }), ...accounts.map(account => el('option', { value: account.accountId, text: `${account.label || account.accountId} · ${account.market || ''}` })));
    select.value = prior;
    select.disabled = accounts.length === 0;
    select.onchange = () => { if (select.value) selectAccount(select.value); };
  }
  function selectAccount(accountId) {
    if (state.accountId !== accountId) { state.importResult = null; state.skillPreview = null; state.budget = null; state.notifications = null; state.generationJobs.clear(); state.draftJobs.clear(); }
    state.accountId = accountId;
    document.querySelectorAll('#x-accounts .x-account-select').forEach(item => {
      const selected = item.dataset.accountId === state.accountId;
      item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
    });
    syncWorkspaceAccountSelector();
    loadSettings();
  }
  function renderDrafts(data, accountId, generation) {
    const box = document.getElementById('x-drafts');
    if (!box || !isCurrentScope(accountId, generation)) return;
    const savedFocus = focusedControl(box);
    box.replaceChildren();
    renderGenerationNotice(document.getElementById('x-generation-status'), accountId);
    renderGenerationNotice(box, accountId);
    const approvedDrafts = [...new Map((data.drafts || []).filter(draft => draft.state === 'approved').map(draft => [draft.draftId, draft])).values()];
    const candidateCount = (data.drafts || []).filter(draft => draft.state === 'needs_review').length;
    const activeWorkspaceView = state.workspaceViews.get(accountId) || 'candidates';
    const candidateWorkspace = el('section', { id: 'x-candidate-workspace', role: 'tabpanel', 'aria-label': '候補を確認' });
    const approvedWorkspace = el('section', { id: 'x-approved-workspace', role: 'tabpanel', 'aria-label': '投稿待ち' });
    const setWorkspaceView = view => {
      state.workspaceViews.set(accountId, view);
      candidateWorkspace.hidden = view !== 'candidates';
      approvedWorkspace.hidden = view !== 'approved';
      candidateTab.setAttribute('aria-selected', String(view === 'candidates'));
      approvedTab.setAttribute('aria-selected', String(view === 'approved'));
      candidateTab.classList.toggle('is-active', view === 'candidates');
      approvedTab.classList.toggle('is-active', view === 'approved');
    };
    const candidateTab = button(`候補を確認（${candidateCount}件）`, () => setWorkspaceView('candidates'));
    const approvedTab = button(`投稿待ち（${approvedDrafts.length}件）`, () => setWorkspaceView('approved'));
    candidateTab.setAttribute('role', 'tab'); candidateTab.setAttribute('aria-controls', 'x-candidate-workspace');
    approvedTab.setAttribute('role', 'tab'); approvedTab.setAttribute('aria-controls', 'x-approved-workspace');
    const workspaceTabs = el('div', { className: 'x-workspace-tabs', role: 'tablist', 'aria-label': '作業内容' }, [candidateTab, approvedTab]);
    const approvedHeading = el('div', { className: 'x-approved-queue-heading' }, [
      el('strong', { text: `アカウント全体の投稿待ち · ${approvedDrafts.length}件` }),
      el('p', { className: 'x-muted', text: '採用済みの本文を確認・コピーしてXの投稿作成画面へ渡せます。ここで閲覧・コピーしても採用状態は変わらず、投稿済みにはなりません。' }),
    ]);
    approvedWorkspace.append(approvedHeading);
    approvedDrafts.forEach(draft => {
      const catalog = state.productCatalogByAccount.get(accountId) || state.productCatalog;
      const products = (draft.productIds || []).map(productId => catalog.find(item => item.product?.productId === productId)?.product).filter(Boolean);
      const productRows = products.length
        ? products.map(product => el('div', { className: 'x-product-review-post-head' }, [el('strong', { text: product.name || '商品名未入力' }), el('span', { className: 'x-product-category', text: `ジャンル: ${product.category || '未設定'}` }), el('span', { className: 'x-muted', text: `ASIN ${product.asin || '不明'}` })]))
        : [el('div', { className: 'x-product-review-post-head' }, [el('strong', { text: '商品情報を取得できません' }), el('span', { className: 'x-product-category', text: 'ジャンル: 未設定' }), el('span', { className: 'x-muted', text: 'ASIN 不明' })])];
      const card = el('article', { className: 'x-product-review-post x-approved-post' }, [
        el('div', { className: 'x-product-review-detail-head' }, [el('strong', { text: `${draft.variantId || '候補'} · 採用済み` }), el('span', { className: 'x-muted', text: `draft ${draft.draftId}` })]),
        ...productRows,
        el('div', { className: 'x-product-review-post-body', text: draft.body || '' }),
      ]);
      card.append(el('div', { className: 'x-inline-form' }, [
        button('本文をコピー', async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error('このブラウザーではクリップボードを利用できません');
            await navigator.clipboard.writeText(draft.body || '');
            message(card, '本文をコピーしました。採用状態はそのままです。', 'success');
          } catch (error) { message(card, error.message, 'error'); }
        }),
        el('a', { className: 'act-btn x-compose-link', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(draft.body || '')}`, target: '_blank', rel: 'noopener noreferrer', text: 'Xの投稿作成画面を開く' }),
      ]));
      approvedWorkspace.append(card);
    });
    if (!approvedDrafts.length) approvedWorkspace.append(el('p', { className: 'x-muted', text: '採用済みの投稿待ちはありません。候補を確認して採用すると、ここに表示されます。' }));
    box.append(workspaceTabs, candidateWorkspace, approvedWorkspace);
    setWorkspaceView(activeWorkspaceView);
    const productPicker = el('select', { name: 'productPicker', className: 'x-generation-product-picker-source', multiple: 'multiple', hidden: 'true', 'aria-hidden': 'true', tabindex: '-1' });
    const productOptions = el('div', { className: 'x-generation-product-options', role: 'group', 'aria-label': '投稿生成に使う商品' });
    const currentWorkspaceProduct = state.productCatalog.find(item => item.product?.productId === state.workspaceSelections.get(accountId))?.product;
    const productPickerField = el('div', { className: 'x-field x-generation-product-field' }, [el('span', { text: '投稿を作る商品' }), el('p', { className: 'x-muted x-primary-generation-product', text: currentWorkspaceProduct ? `${productWorkspaceLabel(currentWorkspaceProduct)} を生成対象にします。複数商品は追加操作から選べます。` : '商品を選択してください。' }), el('details', { className: 'x-generation-extra-products' }, [el('summary', { text: '複数商品をまとめて使う（最大3件）' }), productOptions]), el('span', { className: 'x-muted', text: '生成対象を追加する前に、商品名・ジャンル・ASINを確認してください。' }), productPicker]);
    const allocationStatus = el('p', { className: 'x-muted', text: '投稿生成できる商品を選ぶと、利用可能なテンプレートだけが表示されます。' });
    const allocationSlots = el('div', { className: 'x-generation-slots' });
    const allocationSummary = el('div', { className: 'x-skill-preview' });
    const skillLabels = {
      'text-amazon-hook-fixed': '特徴を短く紹介',
      'text-amazon-tsubuyaki': 'つぶやき風のおすすめ',
      'text-nsen-matome': '複数商品をまとめて紹介',
      'text-gadget-surprise': 'サイズ・省スペース紹介',
      'text-gadget-comparison': '比較軸で比較',
    };
    let skillCatalog = [];
    let eligibleOptions = [];
    let checkingEligibility = true;
    let eligibilityRequestId = 0;
    let finalPreviewSignature = '';
    let finalPreviewErrorSignature = '';
    let finalPreviewErrorMessage = '';
    const currentAllocations = () => [...allocationSlots.querySelectorAll('select')].map(select => {
      const [skillId, angleId] = String(select.value || '').split('::');
      return skillId && angleId ? { skillId, angleId } : null;
    });
    const currentPayload = () => {
      const productIds = [...productPicker.selectedOptions].map(option => option.value).filter(Boolean);
      const count = Number(generateForm.querySelector('[name="requestedVariantCount"]')?.value || 0);
      const requested = currentAllocations();
      if (!productIds.length || productIds.length > 3 || requested.length !== count || requested.some(item => !item)) return null;
      const allowed = new Set(eligibleOptions.map(option => option.value));
      const selected = requested.map(item => `${item.skillId}::${item.angleId}`);
      if (selected.some(value => !allowed.has(value)) || new Set(selected).size !== selected.length) return null;
      return { accountId, productIds, requestedVariantCount: count, requested };
    };
    const generateButton = button('割当を確認', async event => {
      event.preventDefault();
      if (!generateForm.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(generateForm)) return;
      const payload = currentPayload();
      if (!payload) { endWrite(generateForm); message(generateForm, '商品と案ごとのテンプレート／切り口を選択してください。', 'error'); return; }
      try {
        const signature = JSON.stringify(payload);
        if (finalPreviewSignature !== signature) {
          allocationStatus.textContent = '選択内容と割当を最終確認しています。';
          generateButton.disabled = true;
          const previewKey = random();
          const preflight = await api('/api/x-affiliate/skill-allocation-previews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey: previewKey }) });
          if (!isCurrentScope(accountId, generation) || !generateForm.isConnected) { endWrite(generateForm); return; }
          const allocations = preflight.allocations || [];
          const exactAllocations = allocations.length === payload.requested.length && allocations.every((item, index) => item.skillId === payload.requested[index].skillId && item.angleId === payload.requested[index].angleId);
          const exactProducts = !preflight.productIds || (preflight.productIds.length === payload.productIds.length && preflight.productIds.every((id, index) => id === payload.productIds[index]));
          const exactCount = preflight.requestedVariantCount == null || Number(preflight.requestedVariantCount) === payload.requestedVariantCount;
          if (JSON.stringify(currentPayload()) !== signature || preflight.status !== 'ready' || !exactAllocations || !exactProducts || !exactCount) {
            const reasons = (preflight.blockingReasons || []).map(item => actionGuidanceForCode(item.code) || item.message).filter(Boolean);
            finalPreviewErrorSignature = signature;
            finalPreviewErrorMessage = preflight.status !== 'ready' && reasons.length ? reasons.join(' / ') : '選択内容の最終確認が一致しません。生成は行っていません。商品とテンプレートを確認してください。';
            endWrite(generateForm); updateGenerationState(); return;
          }
          finalPreviewSignature = signature;
          allocationStatus.textContent = 'この商品・候補数・テンプレートの割当を確認しました。次のボタン操作で生成します。';
          endWrite(generateForm); updateGenerationState(); return;
        }
        const formKey = generationFormKey(accountId);
        const saved = state.generationFormState.get(formKey) || {};
        if (saved.generationFingerprint !== signature || !saved.generationIdempotencyKey) {
          saved.generationFingerprint = signature;
          saved.generationIdempotencyKey = random();
          state.generationFormState.set(formKey, saved);
        }
        const idempotencyKey = saved.generationIdempotencyKey;
        if (!isCurrentScope(accountId, generation) || !generateForm.isConnected || JSON.stringify(currentPayload()) !== signature) { endWrite(generateForm); return; }
        const result = await api('/api/x-affiliate/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
        clearRetry(generateForm); endWrite(generateForm);
        if (isCurrentScope(accountId, generation)) {
          saved.generationFingerprint = ''; saved.generationIdempotencyKey = ''; state.generationFormState.set(formKey, saved);
          finalPreviewSignature = '';
          state.generationNotice = { accountId, job: result.job || {}, draftCount: result.job?.createdDraftCount ?? result.draftIds?.length ?? 0 };
          renderGenerationNotice(document.getElementById('x-generation-status'), accountId);
          await loadDrafts(accountId, generation);
        }
      } catch (error) {
        endWrite(generateForm); if (generateForm.isConnected && isCurrentScope(accountId, generation)) message(generateForm, actionErrorMessage(error), 'error');
      }
    });
    generateButton.disabled = true;
    const generateForm = el('form', { className: 'x-form x-generation-form' }, [
      productPickerField,
      el('p', { className: 'x-muted', text: '生成準備ができた商品だけを表示します。商品に合うテンプレート／切り口を選ぶと、そのまま生成できます。' }),
      selectField('候補数', 'requestedVariantCount', '1', ['1', '2', '3']),
      allocationSlots,
      allocationStatus,
      generateButton,
      allocationSummary,
    ]);
    const countSelect = generateForm.querySelector('[name="requestedVariantCount"]');
    const formKey = generationFormKey(accountId);
    const savedGeneration = state.generationFormState.get(formKey) || {};
    if (savedGeneration.count) countSelect.value = String(savedGeneration.count);
    const updateGenerationState = () => {
      const payload = currentPayload();
      const signature = payload ? JSON.stringify(payload) : '';
      if (finalPreviewSignature && signature !== finalPreviewSignature) finalPreviewSignature = '';
      if (finalPreviewErrorSignature && signature !== finalPreviewErrorSignature) { finalPreviewErrorSignature = ''; finalPreviewErrorMessage = ''; }
      generateButton.textContent = finalPreviewSignature === signature && signature ? '確認した条件で候補を生成' : '割当を確認';
      generateButton.disabled = checkingEligibility || !payload;
      allocationSummary.replaceChildren(...(payload ? payload.requested.map((item, index) => {
        const option = eligibleOptions.find(entry => entry.value === `${item.skillId}::${item.angleId}`);
        return el('div', { className: 'x-row' }, [el('span', { text: `案 ${index + 1}: ${option?.label || item.skillId}` })]);
      }) : []));
      if (finalPreviewErrorSignature === signature && signature) allocationStatus.textContent = finalPreviewErrorMessage;
      else if (finalPreviewSignature === signature && signature) allocationStatus.textContent = 'この商品・候補数・テンプレートの割当を確認しました。次のボタン操作で生成します。';
      else if (payload) allocationStatus.textContent = '商品とテンプレートを選び、「割当を確認」してから生成します。';
    };
    const updateVariantCounts = () => {
      const maximum = Math.min(3, eligibleOptions.length);
      const previousCount = Number(countSelect.value || savedGeneration.count || 1);
      const choices = Array.from({ length: maximum }, (_, index) => index + 1);
      countSelect.replaceChildren(...(choices.length
        ? choices.map(count => el('option', { value: String(count), text: `${count}案` }))
        : [el('option', { value: '', text: '利用可能なテンプレートがありません' })]));
      countSelect.disabled = choices.length === 0;
      if (choices.length) countSelect.value = String(choices.includes(previousCount) ? previousCount : 1);
    };
    const updateAllocationSlots = (previous = []) => {
      const count = Number(countSelect.value || 0);
      const options = eligibleOptions;
      allocationSlots.replaceChildren();
      for (let index = 0; index < count; index++) {
        const select = el('select', { name: `allocation-${index}`, className: 'form-select', required: 'required' }, [
          el('option', { value: '', text: 'テンプレートと切り口を選択' }),
          ...options.map(option => el('option', { value: option.value, text: option.label })),
        ]);
        select.disabled = checkingEligibility || options.length === 0;
        select.value = previous[index] || '';
        select.addEventListener('change', () => {
          const chosen = [...allocationSlots.querySelectorAll('select')].map(item => item.value).filter(Boolean);
          if (new Set(chosen).size !== chosen.length) {
            select.value = '';
            allocationStatus.textContent = '同じテンプレートと切り口は重複して選べません。';
          }
          const saved = state.generationFormState.get(formKey) || {};
          saved.allocations = [...allocationSlots.querySelectorAll('select')].map(option => option.value);
          state.generationFormState.set(formKey, saved);
          updateGenerationState();
        });
        allocationSlots.append(el('label', { className: 'x-field' }, [el('span', { text: `案 ${index + 1}` }), select]));
      }
      updateGenerationState();
    };
    const refreshEligibleOptions = async () => {
      const requestId = ++eligibilityRequestId;
      const productIds = [...productPicker.selectedOptions].map(option => option.value).filter(Boolean);
      const saved = state.generationFormState.get(formKey) || {};
      const previousAllocations = [...allocationSlots.querySelectorAll('select')].map(select => select.value);
      checkingEligibility = true;
      eligibleOptions = [];
      updateVariantCounts();
      updateAllocationSlots(saved.allocations || previousAllocations);
      if (!productIds.length) {
        checkingEligibility = false;
        updateGenerationState();
        allocationStatus.textContent = productPicker.disabled
          ? '投稿生成の準備ができた商品がありません。商品情報を確認してください。'
          : '生成する商品を選択してください。';
        return;
      }
      allocationStatus.textContent = '選択した商品で利用できるテンプレートを確認中です。';
      try {
        const payload = { accountId, productIds, requestedVariantCount: 1, requested: [] };
        const idempotencyKey = await keyFor(generateForm, { operation: 'generation-template-options', ...payload });
        const result = await api('/api/x-affiliate/skill-allocation-previews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
        clearRetry(generateForm);
        if (!generateForm.isConnected || !isCurrentScope(accountId, generation) || requestId !== eligibilityRequestId) return;
        const skillById = new Map(skillCatalog.map(skill => [skill.id, skill]));
        eligibleOptions = (result.diagnostics || []).filter(item => item.eligible).flatMap(item => {
          const skill = skillById.get(item.skillId);
          return (item.angleIds || []).map(angleId => {
            const angle = skill?.angles?.find(entry => entry.id === angleId);
            return { value: `${item.skillId}::${angleId}`, label: `${skillLabels[item.skillId] || item.skillId} · ${angle?.label || angleId}` };
          });
        }).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
        checkingEligibility = false;
        updateVariantCounts();
        updateAllocationSlots(saved.allocations || previousAllocations);
        allocationStatus.textContent = eligibleOptions.length
          ? `${eligibleOptions.length}種類のテンプレート／切り口から選べます。`
          : '選択した商品で使えるテンプレートがありません。別の商品を選ぶか、商品情報を補完してください。';
        updateGenerationState();
      } catch (error) {
        if (requestId === eligibilityRequestId && generateForm.isConnected && isCurrentScope(accountId, generation)) {
          checkingEligibility = false;
          allocationStatus.textContent = `テンプレートを確認できませんでした。${actionErrorMessage(error)}`;
          updateGenerationState();
        }
      }
    };
    syncProductPicker(productPicker, null, productOptions);
    productOptions.addEventListener('change', event => {
      const selected = [...productOptions.querySelectorAll('input[name="productPickerChoice"]:checked')].map(input => input.value);
      if (selected.length > 3) {
        if (event.target?.matches?.('input[name="productPickerChoice"]')) event.target.checked = false;
        allocationStatus.textContent = '商品は最大3件まで選択できます。';
        return;
      }
      [...productPicker.options].forEach(option => { option.selected = selected.includes(option.value); });
      const saved = state.generationFormState.get(formKey) || {};
      saved.productIds = selected;
      state.generationFormState.set(formKey, saved);
      productPicker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    productPicker.addEventListener('change', () => {
      const selected = [...productPicker.selectedOptions].map(option => option.value).filter(Boolean);
      if (selected.length > 3) {
        productPicker.selectedOptions[productPicker.selectedOptions.length - 1].selected = false;
        syncProductPicker(productPicker, null, productOptions);
        allocationStatus.textContent = '商品は最大3件まで選択できます。';
        return;
      }
      syncProductPicker(productPicker, null, productOptions);
      const saved = state.generationFormState.get(formKey) || {};
      saved.productIds = selected;
      state.generationFormState.set(formKey, saved);
      refreshEligibleOptions();
    });
    countSelect.addEventListener('change', () => {
      const saved = state.generationFormState.get(formKey) || {};
      const priorAllocations = saved.allocations || currentAllocations().map(item => item ? `${item.skillId}::${item.angleId}` : '');
      const visibleAllocations = currentAllocations().map(item => item ? `${item.skillId}::${item.angleId}` : '');
      saved.count = Number(countSelect.value); saved.allocations = [...visibleAllocations.map((item, index) => item || priorAllocations[index] || ''), ...priorAllocations.slice(visibleAllocations.length)];
      state.generationFormState.set(formKey, saved);
      updateAllocationSlots(saved.allocations);
    });
    updateAllocationSlots(savedGeneration.allocations || []);
    api(`/api/x-affiliate/skills?accountId=${encodeURIComponent(accountId)}`).then(result => {
      if (!generateForm.isConnected || !isCurrentScope(accountId, generation)) return;
      skillCatalog = result.skills || [];
      refreshEligibleOptions();
    }).catch(error => {
      checkingEligibility = false;
      if (generateForm.isConnected && isCurrentScope(accountId, generation)) allocationStatus.textContent = `テンプレート一覧を読み込めませんでした。${actionErrorMessage(error)}`;
    });
    const generationSelectedProductId = state.workspaceSelections.get(accountId);
    const hasWaitingForSelected = (data.drafts || []).some(draft => draft.state === 'needs_review' && (draft.productIds || []).includes(generationSelectedProductId));
    const hasApprovedForSelected = (data.drafts || []).some(draft => draft.state === 'approved' && (draft.productIds || []).includes(generationSelectedProductId));
    const selectedProductReady = state.productCatalog.find(item => item.product?.productId === generationSelectedProductId)?.readiness?.ready === true;
    const generationDetails = el('details', { className: 'x-generation-details' }, [el('summary', { text: '投稿文を作る' }), generateForm]);
    generationDetails.open = selectedProductReady && !hasWaitingForSelected && !hasApprovedForSelected;
    const productDrafts = new Map();
    const allDraftGroups = new Map();
    (data.drafts || []).forEach(draft => {
      if (!allDraftGroups.has(draft.generationGroupId)) allDraftGroups.set(draft.generationGroupId, []);
      allDraftGroups.get(draft.generationGroupId).push(draft);
      (draft.productIds || []).forEach(productId => {
        const rows = productDrafts.get(productId) || []; rows.push(draft); productDrafts.set(productId, rows);
      });
    });
    const productRows = state.productCatalog.map(item => item.product || {});
    const draftRowsFor = product => productDrafts.get(product.productId) || [];
    const firstDraftProductId = (data.drafts || []).find(draft => draft.state === 'needs_review')?.productIds?.[0] || (data.drafts || [])[0]?.productIds?.[0] || '';
    const selectedProductId = state.workspaceSelections.get(accountId) || firstDraftProductId;
    if (selectedProductId && !state.workspaceSelections.has(accountId)) state.workspaceSelections.set(accountId, selectedProductId);
    const selectedProduct = productRows.find(product => product.productId === selectedProductId) || (selectedProductId ? { productId: selectedProductId, name: '商品情報を取得できません', asin: '不明' } : null);
    const matchingGroupIds = new Set((selectedProduct ? draftRowsFor(selectedProduct) : []).map(draft => draft.generationGroupId));
    if (!matchingGroupIds.size && selectedProductId) {
      (data.drafts || []).filter(draft => (draft.productIds || []).includes(selectedProductId)).forEach(draft => matchingGroupIds.add(draft.generationGroupId));
    }
    const groups = new Map([...allDraftGroups]
      .filter(([groupId]) => matchingGroupIds.has(groupId))
      .map(([groupId, drafts]) => [groupId, drafts.filter(draft => draft.state !== 'approved')])
      .filter(([, drafts]) => drafts.length));
    if (groups.size) candidateWorkspace.append(el('h4', { className: 'x-draft-list-title', text: '選択商品の候補' }));
    for (const [groupId, drafts] of groups) {
      const groupBusy = drafts.some(draft => Boolean(draft.regenerationLock || draft.regeneration?.status === 'running' || draft.regeneration?.status === 'queued'));
      const productIds = [...new Set(drafts.flatMap(draft => draft.productIds || []))];
      const productNames = productIds.map(productId => state.productCatalog.find(item => item.product?.productId === productId)?.product).filter(Boolean).map(productWorkspaceLabel);
      const group = el('details', { className: 'x-draft-group' });
      group.append(el('summary', { text: `${productNames.join('、') || `生成グループ ${groupId}`} · ${drafts.length}案${groupBusy ? ' · 再生成処理中' : ''}` }));
      const comparison = el('div', { className: 'x-form x-draft-grid' });
      const allGroupDrafts = allDraftGroups.get(groupId) || [];
      const groupCanBulkReview = drafts.length > 1 && drafts.length === allGroupDrafts.length && allGroupDrafts.every(item => item.state === 'needs_review');
      drafts.forEach(draft => {
        const draftKey = `${accountId}\u0000${draft.draftId}`;
        let savedDraftEdit = state.draftEditDrafts.get(draftKey);
        if (savedDraftEdit && !savedDraftEdit.dirty && Number.isSafeInteger(draft.revision) && draft.revision > (savedDraftEdit.revision ?? -1)) {
          savedDraftEdit = { body: draft.body || '', savedBody: draft.body || '', dirty: false, revision: draft.revision, validation: draft.validation };
          state.draftEditDrafts.set(draftKey, savedDraftEdit);
        }
        const edit = field('本文', 'textarea', 'body', savedDraftEdit?.body ?? draft.body); const textarea = edit.querySelector('textarea');
        textarea.dataset.draftId = draft.draftId;
        textarea.dataset.workspaceFocusKey = `draft:${draft.draftId}:body`;
        textarea.dataset.originalBody = draft.body || '';
        const resizeDraftBody = () => { textarea.style.height = 'auto'; textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`; };
        resizeDraftBody();
        const regeneration = draft.regeneration || draft.regenerationJob || state.draftJobs.get(draft.draftId) || {};
        const draftBusy = Boolean(draft.regenerationLock || regeneration.status === 'running' || regeneration.status === 'queued');
        const jobId = regeneration.jobId || draft.regenerationJobId;
        const providerDiagnostic = regeneration.providerDiagnostic || {};
        const stateLabel = draftStateLabel(draft.state);
        const draftProducts = (draft.productIds || []).map(productId => state.productCatalog.find(item => item.product?.productId === productId)?.product).filter(Boolean);
        const draftProductLabels = draftProducts.map(productWorkspaceLabel).join('、') || '商品情報を取得できません · ASIN 不明';
        const regenerationSummary = regeneration.status ? [
          draftBusy ? `再生成${jobStatusLabel(regeneration.status)}です。本文編集・レビュー操作は一時停止しています。` : `再生成: ${jobStatusLabel(regeneration.status)}`,
          jobId ? `確認ID: ${jobId}` : '',
          regeneration.errorCode ? `${actionGuidanceForCode(regeneration.errorCode)} (${regeneration.errorCode})` : '',
          Array.isArray(regeneration.validationErrors) && regeneration.validationErrors.length ? `修正点: ${validationMessages(regeneration.validationErrors).join(' / ')}` : '',
          providerDiagnostic.code || '',
          providerDiagnostic.message || '',
        ].filter(Boolean).join(' · ') : '';
        const validationErrors = validationMessages(draft.validation?.errors);
        const validationFeedback = draft.validation?.ok
          ? el('p', { className: 'x-muted', text: '検証OK' })
          : el('div', { className: 'x-status x-validation-feedback' }, [
            el('strong', { text: '採用前に、次の点を確認してください。' }),
            ...(validationErrors.length
              ? [el('ul', {}, validationErrors.map(text => el('li', { text })))]
              : [el('p', { text: '本文と選択したテンプレートを確認し、修正後に保存してください。' })]),
          ]);
        const comparisonCard = draft.regenerationComparison?.beforeBody != null
          ? el('div', { className: 'x-regeneration-comparison' }, [
            el('div', { className: 'x-row' }, [el('strong', { text: '再生成前（読み取り専用）' }), el('span', { className: 'x-muted', text: `内容revision ${draft.regenerationComparison.beforeContentRevision ?? '不明'}` })]),
            el('pre', { className: 'x-regeneration-before', text: draft.regenerationComparison.beforeBody }),
            el('p', { className: 'x-muted', text: `現在の候補 · 内容revision ${draft.regenerationComparison.afterContentRevision ?? draft.contentRevision ?? '不明'}` }),
          ])
          : null;
        const article = el('article', { className: 'x-product x-draft' }, [
          el('div', { className: 'x-product-head' }, [el('strong', { text: draftProductLabels }), el('span', { className: 'x-muted', text: `${draft.variantId || '候補'} · ${stateLabel} · ${skillLabels[draft.skillId] || 'テンプレート'} · 切り口 ${angleLabels[draft.angleId] || '選択内容'}` })]),
          validationFeedback,
          ...(regenerationSummary ? [el('p', { className: 'x-status', text: regenerationSummary })] : []),
          ...(comparisonCard ? [comparisonCard] : []),
          edit,
        ]);
        textarea.disabled = draftBusy || draft.state === 'archived';
        const actions = el('div', { className: 'x-inline-form' });
        let groupReviewButton = null;
        textarea.addEventListener('input', () => {
          resizeDraftBody();
          const latest = state.draftEditDrafts.get(draftKey);
          state.draftEditDrafts.set(draftKey, { body: textarea.value, dirty: textarea.value !== (latest?.savedBody ?? draft.body), revision: latest?.revision ?? draft.revision, savedBody: latest?.savedBody ?? draft.body });
          if (groupReviewButton) groupReviewButton.disabled = groupBusy || draftBusy || drafts.some(item => state.draftEditDrafts.get(`${accountId}\u0000${item.draftId}`)?.dirty);
        });
        actions.append(button('編集を保存', async () => saveDraftBody(draft, textarea.value, article, accountId, generation), draftBusy || draft.state === 'archived'));
        if (draft.state === 'needs_review') {
          if (groupBusy || draftBusy) actions.append(el('p', { className: 'x-muted x-review-action-hint', text: '再生成中は採用・見送り操作を行えません。完了後にもう一度お試しください。' }));
          else if (!draft.validation?.ok) actions.append(el('p', { className: 'x-muted x-review-action-hint', text: '採用するには、上の指摘を本文に反映して「編集を保存」してください。' }));
          const initialDirtyBody = Boolean(savedDraftEdit?.dirty || textarea.value !== draft.body);
          const approveButton = button(initialDirtyBody ? '保存して採用' : '採用', async () => {
            const editBuffer = state.draftEditDrafts.get(draftKey);
            const dirtyBody = editBuffer ? editBuffer.dirty : textarea.value !== draft.body;
            if (dirtyBody) {
              const saved = await saveDraftBody(draft, textarea.value, article, accountId, generation, false);
              if (!saved || saved.validation?.ok !== true) {
                if (article.isConnected && saved) {
                  approveButton.textContent = '採用';
                  approveButton.disabled = true;
                  message(article, validationMessages(saved.validation?.errors).join(' / ') || '保存した本文の検証が完了していないため採用できません。', 'error');
                }
                return;
              }
              textarea.dataset.originalBody = saved.body || textarea.value;
              approveButton.textContent = '採用';
              approveButton.disabled = groupBusy || draftBusy;
              const reviewed = await reviewDraft({ ...draft, revision: saved.revision, validation: saved.validation }, 'approve', null, article, accountId, generation);
              if (!reviewed && article.isConnected) message(article, '本文は保存済み、採用は未完了です。内容は再保存せず、最新の候補状態を確認して採用を再試行してください。', 'warn');
              return;
            }
            const current = state.draftEditDrafts.get(draftKey);
            if ((current?.validation || draft.validation)?.ok !== true) {
              approveButton.disabled = true;
              message(article, validationMessages((current?.validation || draft.validation)?.errors).join(' / ') || '検証NGの本文は採用できません。本文を修正して再保存してください。', 'error');
              return;
            }
            await reviewDraft({ ...draft, revision: current?.revision ?? draft.revision, validation: current?.validation || draft.validation }, 'approve', null, article, accountId, generation);
          }, groupBusy || draftBusy || (!initialDirtyBody && !draft.validation?.ok));
          approveButton.dataset.action = 'approve';
          textarea.addEventListener('input', () => {
            const buffer = state.draftEditDrafts.get(draftKey);
            const isDirty = buffer?.dirty ?? (textarea.value !== (textarea.dataset.originalBody || draft.body || ''));
            approveButton.textContent = isDirty ? '保存して採用' : '採用';
            approveButton.disabled = groupBusy || draftBusy || (!isDirty && !draft.validation?.ok);
          });
          actions.append(approveButton);
          actions.append(button('見送り', async () => reviewDraft(draft, 'reject', 'not_this_time', article, accountId, generation), groupBusy || draftBusy));
          if (groupCanBulkReview) { groupReviewButton = button('この案を採用し残りを見送り', async () => {
            if (drafts.some(item => state.draftEditDrafts.get(`${accountId}\u0000${item.draftId}`)?.dirty)) { message(article, '同じグループに未保存の本文があります。各本文を保存してからグループ操作してください。', 'error'); return; }
            if (draftBusy || !draft.validation?.ok || !window.confirm(`この案を採用し、同じグループの残り${drafts.length - 1}案を見送りますか？`)) return;
            if (!beginWrite(article)) return;
            const payload = { accountId, approvedDraftId: draft.draftId, expectedRevisions: drafts.map(item => ({ draftId: item.draftId, revision: item.revision })), entrypoint: 'public' };
            try {
              const idempotencyKey = await keyFor(article, { operation: 'draft-group-review', groupId, ...payload });
              if (!article.isConnected || !isCurrentScope(accountId, generation)) return;
              await api(`/api/x-affiliate/draft-groups/${encodeURIComponent(groupId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
              clearRetry(article); if (isCurrentScope(accountId, generation)) await loadDrafts(accountId, generation);
            }
            catch (error) { if (article.isConnected) message(article, `${actionErrorMessage(error)}${error.code === 409 ? ' グループ内の最新状態を確認してください。' : ''}`, 'error'); }
            finally { endWrite(article); }
          }, groupBusy || draftBusy || drafts.some(item => state.draftEditDrafts.get(`${accountId}\u0000${item.draftId}`)?.dirty)); actions.append(groupReviewButton); }
        } else if (draft.state === 'approved') actions.append(button('採用を解除', async () => reviewDraft(draft, 'unapprove', null, article, accountId, generation), draftBusy));
        else if (draft.state === 'rejected') actions.append(button('再検討', async () => reviewDraft(draft, 'reopen', null, article, accountId, generation), draftBusy));
        if (draft.state !== 'archived') actions.append(button('保管', async () => reviewDraft(draft, 'archive', null, article, accountId, generation), draftBusy));
        if (draft.state === 'archived') actions.append(button('保管から復元', async () => reviewDraft(draft, 'restore', null, article, accountId, generation), draftBusy));
        const estimated = state.budget?.operation?.limitMicroJPY;
        const regenerationAllowed = draft.state !== 'archived' && !draftBusy && typeof estimated === 'number' && Number.isSafeInteger(estimated) && estimated >= 0;
        const canRegenerateNow = () => draft.state !== 'archived' && !draftBusy && typeof state.budget?.operation?.limitMicroJPY === 'number' && Number.isSafeInteger(state.budget.operation.limitMicroJPY) && state.budget.operation.limitMicroJPY >= 0;
        const regenerateForm = el('form', { className: 'x-inline-form x-regeneration-form', 'data-account-id': accountId, 'data-busy': String(draftBusy), 'data-archived': String(draft.state === 'archived') }, [
          el('p', { className: 'x-muted', 'data-regeneration-limit': 'true', text: regenerationAllowed ? `追加費用上限 ${microJPY(estimated)}（操作枠）` : '追加費用上限を確認できないため再生成できません。予算を再読み込みしてください。' }),
          field('修正意図（1〜2000文字）', 'textarea', 'instruction', '', '直したい点を具体的に入力'),
          button('この案を再生成', async event => {
            event.preventDefault();
            if (!canRegenerateNow()) { message(regenerateForm, '予算上限または候補の状態を確認できないため、再生成を開始できません。', 'warn'); return; }
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
            } catch (error) { endWrite(regenerateForm); if (regenerateForm.isConnected && isCurrentScope(accountId, generation)) message(regenerateForm, `${actionErrorMessage(error)}${error.code === 409 ? ' 入力は保持しています。最新状態を確認してください。' : ''}`, 'error'); }
          }, !regenerationAllowed),
        ]);
        regenerateForm.querySelector('button')?.setAttribute('data-regeneration-action', 'true');
        if (jobId) regenerateForm.append(button('再生成の状態を更新', async () => {
          const job = await refreshGenerationJob(jobId, accountId, generation);
          if (job && isCurrentScope(accountId, generation)) {
            const diagnostic = job.providerDiagnostic || {};
            const details = [
              `再生成: ${jobStatusLabel(job.status)}`,
              `確認ID: ${job.jobId || jobId}`,
              job.errorCode ? actionGuidanceForCode(job.errorCode) : '',
              Array.isArray(job.validationErrors) && job.validationErrors.length ? `修正点: ${validationMessages(job.validationErrors).join(' / ')}` : '',
              diagnostic.code ? `詳細コード: ${diagnostic.code}` : '',
              diagnostic.message ? `詳細: ${diagnostic.message}` : '',
            ].filter(Boolean).join(' · ');
            message(regenerateForm, details, job.status === 'failed' || job.status === 'unknown' ? 'warn' : '');
            await loadDrafts(accountId, generation);
          }
        }));
        if (draft.state === 'archived') regenerateForm.querySelectorAll('textarea,button').forEach(node => { node.disabled = true; });
        article.append(el('details', { className: 'x-regeneration-details' }, [el('summary', { text: 'この候補を修正して再生成' }), regenerateForm]));
        article.append(actions); comparison.append(article);
      });
      group.append(comparison); candidateWorkspace.append(group);
      if (drafts.some(draft => draft.state === 'needs_review' || draft.state === 'approved' && (draft.productIds || []).includes(state.workspaceSelections.get(accountId)))) group.open = true;
    }
    candidateWorkspace.append(generationDetails);
    if (!(data.drafts || []).length && !state.productCatalog.length) candidateWorkspace.append(el('p', { className: 'x-muted', text: '商品と候補文はまだありません' }));
    restoreFocusedControl(box, savedFocus);
  }
  async function reviewDraft(draft, action, reason, root, accountId, generation) {
    if (!isCurrentScope(accountId, generation) || !beginWrite(root)) return false;
    const priorDisabled = [...root.querySelectorAll('button,input,textarea,select')].map(control => [control, control.disabled]);
    priorDisabled.forEach(([control]) => { control.disabled = true; });
    try {
      const payload = { expectedRevision: draft.revision, action, entrypoint: 'public' }; if (reason) payload.reason = reason;
      const idempotencyKey = await keyFor(root, { operation: 'draft-review', draftId: draft.draftId, ...payload });
      if (!root.isConnected || !isCurrentScope(accountId, generation)) return false;
      await api(`/api/x-affiliate/drafts/${encodeURIComponent(draft.draftId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
      clearRetry(root);
      if (isCurrentScope(accountId, generation)) await loadDrafts(accountId, generation);
      return true;
    } catch (error) { if (root.isConnected) { message(root, `${actionErrorMessage(error)}${error.code === 409 ? ' 最新状態を確認中です。入力は保持しています。' : ''}`, 'error'); if (error.code === 409) await loadDrafts(accountId, generation); } return false; }
    finally { endWrite(root); if (root.isConnected) priorDisabled.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; }); }
  }
  async function saveDraftBody(draft, body, root, accountId, generation, refresh = true) {
    const key = `${accountId}\u0000${draft.draftId}`;
    const buffered = state.draftEditDrafts.get(key);
    if (!String(body || '').trim()) { if (root?.isConnected) message(root, '本文が空のため保存・採用できません。', 'error'); return null; }
    if (!isCurrentScope(accountId, generation)) return null;
    if (!beginWrite(root)) return null;
    const priorDisabled = [...root.querySelectorAll('button,input,textarea,select')].map(control => [control, control.disabled]);
    priorDisabled.forEach(([control]) => { control.disabled = true; });
    try {
      const expectedRevision = buffered?.revision ?? draft.revision;
      const idempotencyKey = await keyFor(root, { operation: 'draft-save', draftId: draft.draftId, expectedRevision, body });
      if (!root.isConnected || !isCurrentScope(accountId, generation)) return null;
      const response = await api(`/api/x-affiliate/drafts/${encodeURIComponent(draft.draftId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision, body, idempotencyKey }) });
      if (!isCurrentScope(accountId, generation)) return null;
      const saved = response.publicDraft || response.draft || response;
      if (!Number.isSafeInteger(saved.revision) || !saved.validation) {
        if (root?.isConnected) message(root, '保存応答に最新の検証結果またはrevisionがありません。採用は行っていません。候補を再読み込みしてください。', 'error');
        return null;
      }
      const result = { ...saved, revision: saved.revision ?? draft.revision, validation: saved.validation || null };
      clearRetry(root);
      state.draftEditDrafts.set(key, { body: result.body || body, savedBody: result.body || body, dirty: false, revision: result.revision, validation: result.validation });
      const snapshot = state.draftSnapshots.get(accountId);
      if (snapshot?.drafts) {
        state.draftSnapshots.set(accountId, { ...snapshot, drafts: snapshot.drafts.map(item => item.draftId === draft.draftId ? { ...item, ...result } : item) });
      }
      if (refresh) await loadDrafts(accountId, generation);
      return result;
    } catch (error) {
      if (root?.isConnected) message(root, `${actionErrorMessage(error)}${error.code === 409 ? ' 入力は保持しています。最新状態を確認してください。' : ''}`, 'error');
      return null;
    } finally { endWrite(root); if (root?.isConnected) priorDisabled.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; }); }
  }
  async function refreshGenerationJob(jobId, accountId, generation) {
    if (!jobId || !isCurrentScope(accountId, generation)) return null;
    try { const result = await api(`/api/x-affiliate/generation-jobs/${encodeURIComponent(jobId)}`); if (isCurrentScope(accountId, generation) && result.job) { state.generationJobs.set(jobId, result.job); const draftId = result.job.draftId || [...state.draftJobs.entries()].find(([, value]) => value.jobId === jobId)?.[0]; if (draftId) state.draftJobs.set(draftId, { ...result.job, draftId }); } return isCurrentScope(accountId, generation) ? result.job : null; }
    catch (error) { if (isCurrentScope(accountId, generation)) message(document.getElementById('x-drafts') || document.body, `再生成ジョブ状態を取得できませんでした: ${error.message}`, 'warn'); return null; }
  }
  async function loadDrafts(accountId, generation) {
    if (!isCurrentScope(accountId, generation)) return;
    const requestGeneration = (state.draftLoadGeneration.get(accountId) || 0) + 1;
    state.draftLoadGeneration.set(accountId, requestGeneration);
    try { const result = await api(`/api/x-affiliate/drafts?accountId=${encodeURIComponent(accountId)}`); if (isCurrentScope(accountId, generation) && state.draftLoadGeneration.get(accountId) === requestGeneration) { const ids = [...new Set((result.drafts || []).map(draft => draft.regenerationLock?.jobId).filter(Boolean))]; await Promise.all(ids.map(jobId => refreshGenerationJob(jobId, accountId, generation))); if (!isCurrentScope(accountId, generation) || state.draftLoadGeneration.get(accountId) !== requestGeneration) return; (result.drafts || []).forEach(draft => { const jobId = draft.regenerationLock?.jobId; if (jobId && state.generationJobs.has(jobId)) { draft.regeneration = state.generationJobs.get(jobId); state.draftJobs.set(draft.draftId, draft.regeneration); } }); state.draftSnapshots.set(accountId, result); renderDrafts(result, accountId, generation); const catalog = state.productCatalogByAccount.get(accountId); if (catalog) renderProducts({ products: catalog, availableTags: [...new Set(catalog.flatMap(item => item.product?.tags || []))] }, accountId, generation); } }
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
  function renderGenerationNotice(box, accountId) {
    if (!box) return;
    box.replaceChildren();
    const notice = state.generationNotice;
    if (notice?.accountId !== accountId) {
      if (box.id === 'x-generation-status') box.append(el('p', { className: 'x-muted', text: 'この画面を開いてからの生成結果はありません' }));
      return;
    }
    const job = notice.job || {};
    const label = job.status === 'completed' ? '生成完了' : job.status === 'failed' ? '生成失敗' : job.status === 'unknown' ? '生成結果を確認できません' : `生成状態: ${job.status || '不明'}`;
    const diagnostic = job.providerDiagnostic || {};
    const details = [label, `${notice.draftCount}案`, job.jobId ? `job ${job.jobId}` : '', job.errorCode || '', diagnostic.code || '', diagnostic.message || ''].filter(Boolean).join(' · ');
    const status = el('p', { className: 'x-status', text: details });
    status.dataset.kind = job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : 'warn';
    box.append(status);
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
      await Promise.all([loadTags(accountId, generation), loadProducts(accountId, generation), loadSkills(accountId, generation), loadBudget(accountId, generation), loadNotifications(accountId, generation), loadScheduledRuns(accountId, generation), loadDrafts(accountId, generation)]);
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
