/* global apiUrl, _authHeaders, _handleUnauthorized, showToast, calDownloadBundle */
/* exported saveBudget, estimateBudget, bulkImportUnpublished, markNoteImported */
/* ═══════════════════════════════════════════════════════════
   budget.js — 月間予算 (設定) and noteインポート (記事).

   月間予算: the Gemini monthly ceiling hachi-core enforces before every call
   (src/ai/spend-guard.js). The number set here is the number that stops spending — there is no
   second copy. hachi-core reserves each call's worst-case cost before sending it, so the month
   cannot pass the cap; it picks a new cap up within 30 seconds, no deploy. Backend: /api/spend.

   noteインポート: every article that is finished but not on note yet, gathered into as few import
   files as note accepts. Backend: /api/note-imports (GET …/unpublished, POST, …/:id/mark-imported,
   …/:id/file).

   Loaded after app.js; uses its apiUrl, _authHeaders, _handleUnauthorized, showToast,
   calDownloadBundle and shared/ui.js esc.
   ═══════════════════════════════════════════════════════════ */

const _yen = (n) => `¥${Math.round(Number(n) || 0).toLocaleString('ja-JP')}`;
const _usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

async function _budgetFetch(path, opts = {}) {
  const res = await fetch(apiUrl(path), { ...opts, headers: { ..._authHeaders(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (res.status === 401) { _handleUnauthorized(); throw new Error('ログインが必要です'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ── 月間予算 ───────────────────────────────────────────── */

function _budgetBar(pct, warn) {
  const w = Math.max(0, Math.min(100, pct));
  const color = warn ? 'var(--red,#c0392b)' : 'var(--acc)';
  return `<div style="height:8px;border-radius:4px;background:var(--bg2,rgba(0,0,0,.08));overflow:hidden">
    <div style="width:${w}%;height:100%;background:${color}"></div></div>`;
}

function _renderBudget(d) {
  const cur = d?.current ?? {};
  const fc = d?.forecast ?? {};
  const cap = Number(cur.capJpy) || 0;
  const spent = Number(cur.spentJpy) || 0;
  const pct = cap ? (spent / cap) * 100 : 0;
  const over = fc.projectedJpy > cap;
  const rows = (cur.byModel ?? []).map((m) => `
    <div class="set-line"><span>${esc(m.model || '')}</span>
      <span>${_yen(m.jpy)} · ${(m.calls ?? 0).toLocaleString('ja-JP')}回${m.images ? ` · 画像${m.images}枚` : ''}</span></div>`).join('')
    || '<div style="font-size:11px;color:var(--m)">今月の利用はまだありません</div>';
  const days = (cur.byDay ?? []).map((x) => `<span title="${esc(x.day)}日 ${_yen(x.jpy)}">${esc(x.day)}: ${_yen(x.jpy)}</span>`).join(' · ');
  const hist = (d?.history ?? []).map((h) => `${esc(h.month)} ${_yen(h.spentJpy)}`).join(' · ');
  return `
    <div class="qs-card" style="flex-direction:column;align-items:stretch;gap:10px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div style="font-size:12px;color:var(--m)">${esc(cur.month || '')} の利用（Gemini）</div>
        <div style="font-size:11px;color:var(--m)">残り ${_yen(cur.remainingJpy)}</div>
      </div>
      <div style="font-size:22px;font-weight:700">${_yen(spent)} <span style="font-size:13px;color:var(--m);font-weight:400">/ ${_yen(cap)}</span></div>
      ${_budgetBar(pct, pct >= 90)}
      <div style="font-size:11px;color:var(--m);line-height:1.6">
        月末の見込み: <b style="color:${over ? 'var(--red,#c0392b)' : 'inherit'}">${_yen(fc.projectedJpy)}</b>
        （1日 ${_yen((fc.dailyUsd ?? 0) * (d?.settings?.jpyPerUsd ?? 0))}、${fc.basis === 'ledger' ? '直近の実績から' : '記事の本数と単価から'}）<br>
        ${over ? `このペースだと${fc.capHitDay ? ` ${fc.capHitDay}日ごろ` : ''}上限に届き、そこから月末まで Gemini を使う処理は止まります。請求は ${_yen(fc.billedJpyAtMost)} を超えません。`
          : '上限の範囲に収まる見込みです。'}
        ${cur.capReachedAt ? '<br><b>今月は上限に達しています。</b>' : ''}
      </div>
    </div>

    <div class="section-hd">上限</div>
    <div class="qs-card" style="gap:10px;align-items:center;padding:12px;flex-wrap:wrap">
      <span style="font-size:12px">月の上限</span>
      <input id="budget-cap" class="form-input" type="number" min="0" step="500" value="${cap}" style="width:120px">
      <span style="font-size:12px">円</span>
      <button class="save-btn" onclick="saveBudget(this)">保存</button>
      <div style="flex-basis:100%;font-size:10px;color:var(--m2);line-height:1.5">
        保存すると30秒以内に反映されます。上限に達すると、その月は新しい Gemini の呼び出しを一切しません（呼び出しごとに最大額を先に確保するので、上限を超える請求は発生しません）。
        換算は ¥${esc(String(d?.settings?.jpyPerUsd ?? ''))}/$（実際の請求から決めた値）、安全率 ${Math.round((d?.settings?.safety ?? 1) * 100)}%。
        Google 側の安全策として、AI Studio の Spend 画面でも同じ金額を設定しておいてください。
      </div>
    </div>

    <div class="section-hd">モデル別（今月）</div>
    <div class="qs-card" style="flex-direction:column;align-items:stretch;gap:4px;padding:12px">${rows}
      <div style="font-size:10px;color:var(--m2);margin-top:6px">検索 ${(cur.searches ?? 0).toLocaleString('ja-JP')}回（無料枠の残り ${(cur.freeSearchesLeft ?? 0).toLocaleString('ja-JP')}回）・呼び出し中の確保 ${_usd(cur.heldUsd)}</div>
    </div>
    ${days ? `<div class="section-hd">日別</div><div style="font-size:11px;color:var(--m);line-height:1.8">${days}</div>` : ''}
    ${hist ? `<div class="section-hd">過去の月</div><div style="font-size:11px;color:var(--m)">${hist}</div>` : ''}

    <div class="section-hd">試算</div>
    <div class="qs-card" style="gap:8px;align-items:center;padding:12px;flex-wrap:wrap">
      <span style="font-size:12px">1日の記事</span>
      <input id="est-per-day" class="form-input" type="number" min="0" max="20" step="1" value="${esc(String(fc.articlesPerDay ?? 2))}" style="width:70px">
      <span style="font-size:12px">本・執筆モデル</span>
      <select id="est-writer" class="form-select" style="width:auto;font-size:11px">
        <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
      </select>
      <span style="font-size:12px">画像</span>
      <select id="est-image" class="form-select" style="width:auto;font-size:11px">
        <option value="gemini-3.1-flash-image">Nano Banana 2</option>
        <option value="gemini-3-pro-image">Nano Banana Pro</option>
      </select>
      <button class="act-btn" onclick="estimateBudget(this)">計算</button>
      <div id="est-out" style="flex-basis:100%;font-size:11px;color:var(--m)"></div>
    </div>`;
}

/* ── マガジン別の費用対効果 ─────────────────────────────────
   /api/spend/roi: what each magazine cost (Gemini, charged per article since 2026-11; earlier runs
   are estimated at today's prices) against what note shows for it, with a rule-based verdict. */
const _VERDICT_COLOR = { 'やめる候補': 'var(--red,#c0392b)', '見直し': 'var(--red,#c0392b)', '未インポート': 'var(--acc)',
  '反応が薄い': 'var(--m)', 'データ不足': 'var(--m2)', '続ける': 'inherit' };

function _renderRoi(r) {
  const mags = r?.magazines ?? [];
  if (!mags.length) return '<div style="font-size:11px;color:var(--m)">この期間の記事はありません</div>';
  const rows = mags.map((m) => `
    <div class="set-line" style="align-items:flex-start;gap:10px">
      <span style="flex:1;min-width:0">
        <b>${esc(m.name || '')}</b>${m.status && m.status !== 'active' ? ` <span style="color:var(--m2)">（${esc(m.status)}）</span>` : ''}<br>
        <span style="font-size:10px;color:var(--m)">着手${m.attempts ?? 0}・公開${m.published ?? 0}・失敗${m.failed ?? 0}・スキップ${m.skipped ?? 0}
          ／ note ${m.posts ?? 0}本・スキ${m.likes ?? 0}</span>
      </span>
      <span style="text-align:right;white-space:nowrap">
        ${_yen(m.costJpy)}${m.costEstimated ? '<span style="font-size:10px;color:var(--m2)">（推定）</span>' : ''}<br>
        <span style="font-size:11px;font-weight:600;color:${_VERDICT_COLOR[m.verdict] || 'inherit'}">${esc(m.verdict || '')}</span>
      </span>
    </div>
    <div style="font-size:10px;color:var(--m2);margin:-2px 0 6px">${esc(m.why || '')}</div>`).join('');
  const t = r?.totals ?? {};
  const a = r?.account ?? {};
  const follow = a.followersChange === null || a.followersChange === undefined ? ''
    : `・フォロワー ${a.followersStart}→${a.followersEnd}（${a.followersChange >= 0 ? '+' : ''}${a.followersChange}）`;
  return `
    <div style="font-size:11px;color:var(--m);margin-bottom:8px;line-height:1.6">
      直近${esc(String(r?.days ?? ''))}日: 費用 ${_yen(t.costJpy)}・note ${t.posts ?? 0}本・スキ ${t.likes ?? 0}
      ${t.costPerLikeJpy ? `・スキ1つ ${_yen(t.costPerLikeJpy)}` : ''}${follow}<br>
      <span style="color:var(--m2)">判定はルール: 見直し＝失敗・スキップが公開の2倍超 ／ 未インポート＝公開したのに note に半分未満 ／
      やめる候補＝¥300以上かけて1本あたりスキ0.5未満。「推定」は記事ごとの費用記録がない期間を今の単価で見積もった値。</span>
    </div>
    <div class="qs-card" style="flex-direction:column;align-items:stretch;gap:2px;padding:12px">${rows}</div>`;
}

async function _loadBudget() {
  const el = document.getElementById('budget-body');
  if (!el) return;
  el.innerHTML = '<div style="font-size:11px;color:var(--m)">読み込み中…</div>';
  try {
    el.innerHTML = _renderBudget(await _budgetFetch('/api/spend'))
      + '<div class="section-hd">マガジン別の費用対効果（直近28日）</div><div id="budget-roi"><div style="font-size:11px;color:var(--m)">読み込み中…</div></div>';
  } catch (e) {
    el.innerHTML = `<div style="font-size:11px;color:var(--red,#c0392b)">読み込みに失敗しました: ${esc(e.message || String(e))}</div>`;
    return;
  }
  const roiEl = document.getElementById('budget-roi');
  try {
    roiEl.innerHTML = _renderRoi(await _budgetFetch('/api/spend/roi?days=28'));
  } catch (e) {
    roiEl.innerHTML = `<div style="font-size:11px;color:var(--red,#c0392b)">読み込みに失敗しました: ${esc(e.message || String(e))}</div>`;
  }
}

async function saveBudget(btn) {
  const v = Number(document.getElementById('budget-cap')?.value);
  if (!Number.isFinite(v) || v < 0) { showToast('金額を入れてください', 'error'); return; }
  btn?.setAttribute('disabled', 'true');
  try {
    const d = await _budgetFetch('/api/spend', { method: 'PUT', body: JSON.stringify({ monthlyCapJpy: v }) });
    document.getElementById('budget-body').innerHTML = _renderBudget(d);
    showToast(`月の上限を ${_yen(v)} にしました`, 'success');
  } catch (e) {
    showToast(`保存できませんでした（${e.message}）`, 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

async function estimateBudget(btn) {
  const out = document.getElementById('est-out');
  const writer = document.getElementById('est-writer')?.value;
  btn?.setAttribute('disabled', 'true');
  try {
    const r = await _budgetFetch('/api/spend/estimate', { method: 'POST', body: JSON.stringify({
      articlesPerDay: Number(document.getElementById('est-per-day')?.value) || 0,
      models: { 'article-writer': writer, 'answer-researcher': writer },
      imageModel: document.getElementById('est-image')?.value,
    }) });
    if (out) {
      out.innerHTML = `記事1本 ${_yen(r.perArticleJpy)}・月 <b>${_yen(r.monthJpy)}</b>（上限 ${_yen(r.capJpy)}）`
        + ` ・検索 月${Math.round(r.monthSearches ?? 0).toLocaleString('ja-JP')}回`
        + (r.monthJpy > r.capJpy ? '<br><span style="color:var(--red,#c0392b)">上限を超えるため、月の途中で止まります。</span>' : '');
    }
  } catch (e) {
    if (out) out.textContent = `計算できませんでした（${e.message}）`;
  } finally {
    btn?.removeAttribute('disabled');
  }
}

/* ── noteインポート ─────────────────────────────────────── */

function _renderNoteImport(d) {
  const arts = d?.articles ?? [];
  const skipped = d?.skipped ?? [];
  const list = arts.map((a, i) => `<div class="set-line"><span>${i + 1}. ${esc(a.title || a.id)}</span><span style="color:var(--m)">${a.bundled ? 'ファイル作成済み' : ''}</span></div>`).join('');
  return `
    <div class="qs-card" style="flex-direction:column;align-items:stretch;gap:10px;padding:14px">
      <div style="font-size:13px"><b>${arts.length}本</b>の記事が、まだ note にありません。</div>
      <div style="font-size:11px;color:var(--m);line-height:1.6">
        まとめて1つのファイル（note の上限を超える分は複数）にします。note の「記事 → インポート」でアップロードすると、すべて下書きとして入ります。
        見出し画像・目次・マガジンは各記事で設定してください。アップロードしたら「インポート済みにする」を押すと、次から一覧に出ません。
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="save-btn" ${arts.length ? '' : 'disabled'} onclick="bulkImportUnpublished(this)">まとめてファイルを作る</button>
      </div>
      <div id="note-import-result"></div>
    </div>
    ${list ? `<div class="section-hd">対象の記事</div><div class="qs-card" style="flex-direction:column;align-items:stretch;gap:2px;padding:12px">${list}</div>` : ''}
    ${skipped.length ? `<div class="section-hd">ファイルにできない記事（${skipped.length}本）</div>
      <div style="font-size:11px;color:var(--m);line-height:1.6">インポート用の原稿が保存される前（2026-10-04 より前）に書かれたか、大きすぎる記事です。Wiki から手で移してください。<br>
      ${skipped.map((s) => esc(s.title || s.id)).join('・')}</div>` : ''}`;
}

function _renderBundles(r) {
  if (!r?.bundles?.length) return '<div style="font-size:11px;color:var(--m)">対象の記事はありませんでした。</div>';
  return r.bundles.map((b) => `
    <div class="set-line" style="align-items:center">
      <span>${esc(b.label)}（${b.count}本・${Math.ceil((b.bytes ?? 0) / 1024)}KB）</span>
      <span style="display:flex;gap:6px">
        <button class="act-btn" onclick="calDownloadBundle('${esc(b.id)}','${esc(b.fileName)}',this)">ファイルを保存</button>
        <button class="act-btn" onclick="markNoteImported('${esc(b.id)}',this)">インポート済みにする</button>
      </span>
    </div>`).join('');
}

async function _loadNoteImport() {
  const el = document.getElementById('note-import-body');
  if (!el) return;
  el.innerHTML = '<div style="font-size:11px;color:var(--m)">読み込み中…</div>';
  try {
    el.innerHTML = _renderNoteImport(await _budgetFetch('/api/note-imports/unpublished'));
  } catch (e) {
    el.innerHTML = `<div style="font-size:11px;color:var(--red,#c0392b)">読み込みに失敗しました: ${esc(e.message || String(e))}</div>`;
  }
}

async function bulkImportUnpublished(btn) {
  const out = document.getElementById('note-import-result');
  btn?.setAttribute('disabled', 'true');
  try {
    const r = await _budgetFetch('/api/note-imports', { method: 'POST', body: JSON.stringify({ includeBundled: true }) });
    if (out) out.innerHTML = _renderBundles(r);
    showToast(`${r.total}本を${r.bundles.length}ファイルにまとめました`, 'success');
  } catch (e) {
    showToast(`作れませんでした（${e.message}）`, 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

async function markNoteImported(id, btn) {
  btn?.setAttribute('disabled', 'true');
  try {
    const r = await _budgetFetch(`/api/note-imports/${encodeURIComponent(id)}/mark-imported`, { method: 'POST', body: '{}' });
    showToast(`${r.marked}本をインポート済みにしました`, 'success');
    _loadNoteImport();
  } catch (e) {
    showToast(`更新できませんでした（${e.message}）`, 'error');
    btn?.removeAttribute('disabled');
  }
}
