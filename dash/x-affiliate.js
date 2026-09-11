/* global sessionStorage, TextEncoder */
/* X affiliate administration. Deliberately isolated from the Note dashboard auth. */
(function () {
  'use strict';
  const API_ORIGIN = 'https://hachi-core-685554938840.asia-northeast1.run.app';
  const FEATURE_ENABLED = false; // build-time safe default; production enables this in a reviewed build
  const VERIFIER_KEY = 'hachi-x-oauth-verifier';
  const PROOF_KEY = 'hachi-x-browser-proof';
  const pendingCode = new URLSearchParams(location.hash.slice(1)).get('x_code');
  if (pendingCode) history.replaceState({}, '', location.pathname + location.search + '#xentry');
  let xJwt = '';
  let browserProof = '';
  let state = { context: null, accountId: '', generation: 0, loadGeneration: 0, linkGeneration: 0, settings: null, importResult: null, skillPreview: null, link: null, linkStartPending: false, linkStatusPending: false, linkFinalizePending: false };
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
    state.generation += 1;
    state.loadGeneration += 1;
    state.context = null;
    state.accountId = '';
    state.linkGeneration += 1;
    state.link = null;
    state.linkStartPending = false;
    state.linkStatusPending = false;
    state.linkFinalizePending = false;
    state.settings = null;
    state.importResult = null;
    state.skillPreview = null;
    retryState = new WeakMap();
    pendingWrites = new WeakSet();
    xJwt = '';
    browserProof = '';
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(PROOF_KEY);
    document.querySelectorAll('#page-x-affiliate input[type="password"]').forEach(input => { input.value = ''; });
    ['#x-accounts', '#x-members', '#x-tags', '#x-products', '#x-skills', '#x-link', '#x-settings'].forEach(selector => {
      document.querySelector(selector)?.replaceChildren();
    });
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
  function render(root) {
    syncNavigation(true);
    document.querySelectorAll('.page.active').forEach(p => p.classList.remove('active'));
    root.classList.add('active'); root.hidden = false;
    root.replaceChildren();
    root.append(el('div', { className: 'page-hd' }, [el('div', {}, [el('div', { className: 'page-title', text: 'X投稿BOT 管理' }), el('div', { className: 'page-sub', text: 'アカウント・商品・Skill・メンバー・タグ・投稿設定' })]) ]));
    if (!FEATURE_ENABLED) { root.append(card('利用停止中', el('p', { className: 'x-muted', text: 'X投稿BOT管理APIは現在無効です。商品登録はローカル検証段階で、実商品取得、Skill、生成、レビュー、通知送信は有効化されていません。' }))); return; }
    if (!xJwt) { root.append(card('ログイン', el('div', {}, [el('p', { className: 'x-muted', text: 'GitHubでX BOT管理へログインしてください。' }), button('GitHubでログイン', login)]))); return; }
    const toolbar = el('div', { className: 'x-toolbar' }, [button('再読み込み', load), button('サインアウト', logout)]); root.append(toolbar);
    root.append(card('アカウント', el('div', { id: 'x-accounts' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])));
    root.append(card('メンバー', el('div', { id: 'x-members' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])));
    root.append(card('タグ（実値は保存後に消去）', el('div', { id: 'x-tags' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])));
    root.append(card('商品（実取得は未接続）', el('div', { id: 'x-products' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])));
    root.append(card('Skill（合成検証のみ）', el('div', { id: 'x-skills' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])));
    root.append(card('Discord連携', el('div', { id: 'x-link' }, [el('p', { className: 'x-muted', text: '本人連携状態を確認中…' })])));
    root.append(card('プロフィール・テンプレート・通知先', el('div', { id: 'x-settings' }, [el('p', { className: 'x-muted', text: 'アカウントを選択してください' })])));
    renderLinkCard();
    load();
  }
  const formData = form => Object.fromEntries(new FormData(form).entries());
  function renderAccounts(data, loadGeneration) {
    const box = document.getElementById('x-accounts');
    if (!box) return;
    box.replaceChildren();
    (data.accounts || []).forEach(a => {
      const b = button(`${a.label} (${a.accountId})`, () => {
        if (state.accountId !== a.accountId) { state.importResult = null; state.skillPreview = null; }
        state.accountId = a.accountId;
        loadSettings();
      });
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
        field('表示名', 'text', 'label'),
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
        ]),
      ]);
      const edit = el('form', { className: 'x-form' }, [
        field('商品名', 'text', 'name', product.name || ''),
        field('特徴（1行1件）', 'textarea', 'features', (product.features || []).join('\n')),
        field('運用メモ', 'text', 'operatorNote', accountProduct.operatorNote || ''),
        checkbox('このaccountで利用', 'enabled', accountProduct.enabled !== false),
        field('手修正の確認元・理由', 'text', 'sourceNote', null, '自分で確認した資料など'),
        button('保存', async event => {
          event.preventDefault();
          if (!edit.isConnected || !isCurrentScope(accountId, generation) || !beginWrite(edit)) return;
          const values = formData(edit);
          const features = String(values.features || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
          const fields = { operatorNote: values.operatorNote || null, enabled: values.enabled === 'on' };
          if ((values.name || '') !== (product.name || '')) fields.name = values.name || null;
          if (JSON.stringify(features) !== JSON.stringify(product.features || [])) fields.features = features.length ? features : null;
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
          el('span', { className: 'x-muted', text: `${skill.status} · 共通優先度 ${skill.priority} · 構成見本 ${skill.exampleValidation?.valid ? 'OK' : 'NG'} · ${skill.validationScope}` }),
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
          const payload = { accountId, expectedRevision: skill.assignment?.revision || 0, fields };
          try {
            const idempotencyKey = await keyFor(assignment, { operation: 'skill-assignment', skillId: skill.id, ...payload });
            if (!assignment.isConnected || !isCurrentScope(accountId, generation)) { endWrite(assignment); return; }
            await api(`/api/x-affiliate/skills/${encodeURIComponent(skill.id)}/assignment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
            clearRetry(assignment); endWrite(assignment);
            if (isCurrentScope(accountId, generation)) await loadSkills(accountId, generation);
          } catch (error) {
            endWrite(assignment);
            if (assignment.isConnected && isCurrentScope(accountId, generation)) message(assignment, error.message + (error.code === 409 ? ' 最新状態を再確認してください。入力は保持しています。' : ''), 'error');
          }
        }),
      ]);
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
            const payload = { expectedRevision: skill.revision, fields };
            try {
              const idempotencyKey = await keyFor(metaForm, { operation: 'skill-meta', skillId: skill.id, ...payload });
              if (!metaForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(metaForm); return; }
              await api(`/api/x-affiliate/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
              clearRetry(metaForm); endWrite(metaForm);
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
            const payload = { expectedRevision: skill.revision, fields };
            try {
              const idempotencyKey = await keyFor(versionForm, { operation: 'skill-version', skillId: skill.id, ...payload });
              if (!versionForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(versionForm); return; }
              await api(`/api/x-affiliate/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
              clearRetry(versionForm); endWrite(versionForm);
              if (isCurrentScope(accountId, generation)) await loadSkills(accountId, generation);
            } catch (error) {
              endWrite(versionForm);
              if (versionForm.isConnected && isCurrentScope(accountId, generation)) message(versionForm, error.message + (error.code === 409 ? ' 旧版を上書きせず停止しました。入力は保持しています。' : ''), 'error');
            }
          }),
        ]);
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
        try {
          const idempotencyKey = await keyFor(previewForm, { operation: 'skill-allocation-preview', ...payload });
          if (!previewForm.isConnected || !isCurrentScope(accountId, generation)) { endWrite(previewForm); return; }
          const result = await api('/api/x-affiliate/skill-allocation-previews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey }) });
          clearRetry(previewForm); endWrite(previewForm);
          if (isCurrentScope(accountId, generation)) { state.skillPreview = { accountId, result }; renderSkillPreview(result, previewForm); }
        } catch (error) {
          endWrite(previewForm);
          if (previewForm.isConnected && isCurrentScope(accountId, generation)) message(previewForm, error.message + (error.code === 409 ? ' Skillまたは割当設定が変わりました。再確認してください。' : ''), 'error');
        }
      }),
    ]);
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
      const valueField = field('実値（保存後に消去）', 'password', 'value');
      const valueInput = valueField.querySelector('input');
      const f = el('form', { className: 'x-form', 'data-admin-only': 'true' }, [
        field('名前', 'text', 'name'),
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
      field('トーン', 'text', 'tone', p.tone || ''),
      field('対象読者', 'text', 'target', p.target || ''),
      field('ジャンル', 'text', 'genre', p.genre || ''),
      field('ペルソナ', 'textarea', 'persona', p.persona || ''),
      field('メモ', 'textarea', 'notes', p.notes || ''),
      field('templateRefs（JSON）', 'text', 'templateRefs', JSON.stringify(s.templateRefs || [])),
    ];
    if (isAdmin()) children.push(field('通知先（channel metadata）', 'text', 'reviewChannelRef', s.reviewChannelRef || ''));
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
  async function loadSettings() {
    const accountId = state.accountId;
    if (!accountId) return;
    const generation = ++state.generation;
    document.getElementById('x-settings')?.replaceChildren();
    document.getElementById('x-tags')?.replaceChildren();
    document.getElementById('x-products')?.replaceChildren();
    document.getElementById('x-skills')?.replaceChildren();
    try {
      const result = await api(`/api/x-affiliate/settings?accountId=${encodeURIComponent(accountId)}`);
      if (!isCurrentScope(accountId, generation)) return;
      renderSettings(result, accountId, generation);
      enforceMemberUI();
      await loadTags(accountId, generation);
      await loadProducts(accountId, generation);
      await loadSkills(accountId, generation);
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
      renderAccounts({ accounts: c.accounts || [] }, loadGeneration);
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
  async function login() { if (!FEATURE_ENABLED) return; const verifier = random(); sessionStorage.setItem(VERIFIER_KEY, verifier); const ch = await challenge(verifier); const u = `${API_ORIGIN}/auth/x-login?challenge=${encodeURIComponent(ch)}&return=${encodeURIComponent(location.origin + location.pathname)}`; location.assign(u); }
  async function callback() { const code = pendingCode; if (!code || !FEATURE_ENABLED) return; const verifier = sessionStorage.getItem(VERIFIER_KEY); sessionStorage.removeItem(VERIFIER_KEY); if (!verifier) return; const r = await fetch(`${API_ORIGIN}/api/x-auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) }); if (!r.ok) throw new Error('X認証コードを交換できませんでした'); const d = await r.json(); xJwt = d.token || d.jwt || ''; browserProof = verifier; sessionStorage.setItem(PROOF_KEY, verifier); try { const p = JSON.parse(atob(xJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); setTimeout(logout, Math.max(0, p.exp * 1000 - Date.now())); } catch { logout(); throw new Error('認証トークンが不正です'); } }
  function boot() { const root = document.getElementById('page-x-affiliate'); if (!root) return; const entry = document.getElementById('x-affiliate-entry'); const mobile = document.getElementById('x-affiliate-mobile-entry'); const open = () => { window._dashInvalidate?.(); location.hash = 'xentry'; render(root); root.scrollIntoView?.({ block: 'start' }); }; entry?.addEventListener('click', open); mobile?.addEventListener('click', open); if (location.hash.startsWith('#xentry')) render(root); callback().then(() => { if (xJwt && location.hash.startsWith('#xentry')) render(root); }).catch(e => { if (location.hash.startsWith('#xentry')) message(root, e.message, 'error'); }); }
  window.HachiXAffiliate = { api, login, logout, challenge, cleanFragment, isActive: () => location.hash.startsWith('#xentry'), setActive: syncNavigation, refresh: () => { const r = document.getElementById('page-x-affiliate'); if (r) render(r); }, signOut: logout };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
