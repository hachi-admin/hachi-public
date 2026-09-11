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
  let state = { context: null, accountId: '', generation: 0, loadGeneration: 0, linkGeneration: 0, settings: null, link: null, linkStartPending: false, linkStatusPending: false, linkFinalizePending: false };
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
    retryState = new WeakMap();
    pendingWrites = new WeakSet();
    xJwt = '';
    browserProof = '';
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(PROOF_KEY);
    document.querySelectorAll('#page-x-affiliate input[type="password"]').forEach(input => { input.value = ''; });
    ['#x-accounts', '#x-members', '#x-tags', '#x-link', '#x-settings'].forEach(selector => {
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
    root.append(el('div', { className: 'page-hd' }, [el('div', {}, [el('div', { className: 'page-title', text: 'X投稿BOT 管理' }), el('div', { className: 'page-sub', text: 'アカウント・メンバー・タグ・投稿設定' })]) ]));
    if (!FEATURE_ENABLED) { root.append(card('利用停止中', el('p', { className: 'x-muted', text: 'X投稿BOT管理APIは現在無効です。商品登録、Skill、生成、レビュー、通知送信も未実装です。' }))); return; }
    if (!xJwt) { root.append(card('ログイン', el('div', {}, [el('p', { className: 'x-muted', text: 'GitHubでX BOT管理へログインしてください。' }), button('GitHubでログイン', login)]))); return; }
    const toolbar = el('div', { className: 'x-toolbar' }, [button('再読み込み', load), button('サインアウト', logout)]); root.append(toolbar);
    root.append(card('アカウント', el('div', { id: 'x-accounts' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])));
    root.append(card('メンバー', el('div', { id: 'x-members' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])));
    root.append(card('タグ（実値は保存後に消去）', el('div', { id: 'x-tags' }, [el('p', { className: 'x-muted', text: '読み込み中…' })])));
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
    try {
      const result = await api(`/api/x-affiliate/settings?accountId=${encodeURIComponent(accountId)}`);
      if (!isCurrentScope(accountId, generation)) return;
      renderSettings(result, accountId, generation);
      enforceMemberUI();
      await loadTags(accountId, generation);
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
