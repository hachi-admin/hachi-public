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

   Loaded before app.js (app.js opens the page in the URL hash while it loads, so these must already
   exist); it uses app.js's apiUrl, _authHeaders, _handleUnauthorized, showToast and calDownloadBundle,
   and shared/ui.js esc, only when called.
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

const _num = (n) => (Number(n) || 0).toLocaleString('ja-JP');
const _note = (t) => `<div class="bud-empty">${t}</div>`;

/* One stat tile: label, the number, one line of context. */
function _kpi(label, value, sub = '', tone = '') {
  return `<div class="bud-kpi"><div class="bud-kpi-label">${label}</div>
    <div class="bud-kpi-value${tone ? ` is-${tone}` : ''}">${value}</div>${sub ? `<div class="bud-kpi-sub">${sub}</div>` : ''}</div>`;
}

/* Daily spend for the month: one bar per day on a shared baseline, days still ahead drawn as an
   empty slot, and a dashed line at the even daily share of the cap (cap ÷ days in the month) so a
   day that ran over it stands out without a second colour. */
function _dailyChart(month, byDay, cap) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return '';
  const n = new Date(y, m, 0).getDate();
  const spent = Object.fromEntries((byDay ?? []).map((x) => [Number(x.day), Number(x.jpy) || 0]));
  const share = cap ? cap / n : 0;
  const top = Math.max(share * 1.25, ...Object.values(spent), 1);
  const last = Math.max(0, ...Object.keys(spent).map(Number));
  const bars = Array.from({ length: n }, (_, i) => {
    const d = i + 1;
    const v = spent[d];
    if (v === undefined) return `<div class="bud-bar is-future"${d <= last ? ' data-tip="' + d + '日 ¥0"' : ''}><i style="height:0"></i></div>`;
    return `<div class="bud-bar" data-tip="${d}日 ${_yen(v)}"><i style="height:${Math.max(2, (v / top) * 100).toFixed(1)}%"></i></div>`;
  }).join('');
  const ticks = [1, 10, 20, n].map((d) => `<span style="${d === n ? 'right:0;transform:none' : `left:${((d - 0.5) / n * 100).toFixed(2)}%`}">${d}日</span>`).join('');
  return `<div class="bud-card">
    <div class="bud-chart" role="img" aria-label="${esc(month)} の日別の利用">
      ${share ? `<div class="bud-share" style="bottom:${(share / top * 100).toFixed(1)}%"><span>1日の目安 ${_yen(share)}</span></div>` : ''}
      ${bars}
    </div>
    <div class="bud-ticks">${ticks}</div>
  </div>`;
}

function _renderBudget(d) {
  const cur = d?.current ?? {};
  const fc = d?.forecast ?? {};
  const st = d?.settings ?? {};
  const cap = Number(cur.capJpy) || 0;
  const spent = Number(cur.spentJpy) || 0;
  const pct = cap ? Math.min(100, (spent / cap) * 100) : 0;
  const over = cap && fc.projectedJpy > cap;
  const reached = Boolean(cur.capReachedAt);
  const daily = (fc.dailyUsd ?? 0) * (st.jpyPerUsd ?? 0);

  const notice = reached
    ? `<div class="bud-notice is-bad"><b>今月は上限に達しました。</b>月末まで Gemini を使う処理は止まっています。続けるには上限を上げてください。</div>`
    : over
      ? `<div class="bud-notice is-warn"><b>このペースだと${fc.capHitDay ? `${esc(String(fc.capHitDay))}日ごろ` : '月の途中で'}上限に届きます。</b>
          そこから月末まで Gemini を使う処理は止まります。請求は ${_yen(fc.billedJpyAtMost)} を超えません。</div>`
      : '';

  const models = (cur.byModel ?? []).length
    ? `<div class="bud-card bud-table-wrap"><table class="bud-table">
        <thead><tr><th>モデル</th><th class="num">費用</th><th class="num">呼び出し</th><th class="num">画像</th></tr></thead>
        <tbody>${cur.byModel.map((x) => `<tr><td class="mono">${esc(x.model || '')}</td><td class="num">${_yen(x.jpy)}</td>
          <td class="num">${_num(x.calls)}回</td><td class="num">${x.images ? `${_num(x.images)}枚` : '—'}</td></tr>`).join('')}</tbody>
      </table>
      <div class="bud-foot">検索 ${_num(cur.searches)}回（無料枠の残り ${_num(cur.freeSearchesLeft)}回）・処理中の確保 ${_usd(cur.heldUsd)}</div></div>`
    : _note('今月の利用はまだありません');

  const hist = (d?.history ?? []).length
    ? `<div class="bud-hist">${d.history.map((h) => `<div class="bud-hist-item"><span>${esc(h.month)}</span><b>${_yen(h.spentJpy)}</b></div>`).join('')}</div>`
    : '';

  return `
    <div class="bud-kpis">
      ${_kpi(`${esc(cur.month || '')} の利用`, `${_yen(spent)}<small> / ${_yen(cap)}</small>`,
        `<span class="bud-meter${pct >= 90 ? ' is-bad' : ''}"><i style="width:${pct.toFixed(1)}%"></i></span>`)}
      ${_kpi('残り', _yen(cur.remainingJpy), reached ? '上限に達しました' : '上限まで', reached ? 'bad' : '')}
      ${_kpi('月末の見込み', _yen(fc.projectedJpy), fc.basis === 'ledger' ? '直近の実績から' : '記事の本数と単価から', over ? 'warn' : '')}
      ${_kpi('1日あたり', _yen(daily), over && fc.capHitDay ? `${esc(String(fc.capHitDay))}日ごろ上限` : '上限の範囲内', over ? 'warn' : '')}
    </div>
    ${notice}

    <div class="bud-split">
      <div>
        <div class="section-hd">上限</div>
        <div class="bud-card">
          <div class="bud-form">
            <label class="bud-field"><span>月の上限</span>
              <span class="bud-input"><input id="budget-cap" class="form-input" type="number" min="0" step="500" value="${cap}"><em>円</em></span></label>
            <button class="save-btn" onclick="saveBudget(this)">保存</button>
          </div>
          <p class="bud-help">保存すると30秒以内に反映されます。上限に達した月は、新しい Gemini の呼び出しをしません。
            呼び出しごとに最大額を先に確保するので、上限を超える請求は出ません。</p>
          <p class="bud-help">換算 ¥${esc(String(st.jpyPerUsd ?? ''))}/$・安全率 ${Math.round((st.safety ?? 1) * 100)}%。
            念のため AI Studio の Spend でも同じ金額を設定してください。</p>
        </div>
      </div>
      <div>
        <div class="section-hd">試算</div>
        <div class="bud-card">
          <div class="bud-form">
            <label class="bud-field"><span>1日の記事</span>
              <span class="bud-input"><input id="est-per-day" class="form-input" type="number" min="0" max="20" step="1" value="${esc(String(fc.articlesPerDay ?? 2))}"><em>本</em></span></label>
            <label class="bud-field"><span>執筆モデル</span>
              <select id="est-writer" class="form-select">
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
              </select></label>
            <label class="bud-field"><span>画像</span>
              <select id="est-image" class="form-select">
                <option value="gemini-3.1-flash-image">Nano Banana 2</option>
                <option value="gemini-3-pro-image">Nano Banana Pro</option>
              </select></label>
            <button class="act-btn" onclick="estimateBudget(this)">計算</button>
          </div>
          <div id="est-out" class="bud-est"></div>
        </div>
      </div>
    </div>

    <div class="section-hd">日別（${esc(cur.month || '今月')}）</div>
    ${_dailyChart(cur.month, cur.byDay, cap) || _note('データがありません')}

    <div class="section-hd">モデル別（今月）</div>
    ${models}
    ${hist ? `<div class="section-hd">過去の月</div>${hist}` : ''}`;
}

/* ── マガジン別の費用対効果 ─────────────────────────────────
   /api/spend/roi: what each magazine cost (Gemini, charged per article since 2026-11; earlier runs
   are estimated at today's prices) against what note shows for it, with a rule-based verdict. */
const _VERDICT_CHIP = { 'やめる候補': 'chip-failed', '見直し': 'chip-failed', '未インポート': 'chip-queued',
  '反応が薄い': 'chip-scheduled', 'データ不足': 'chip-idle', '続ける': 'chip-done' };

const _STATUS_JA = { paused: '停止中', blocked: '停止中', suggested: '提案中' };

function _renderRoi(r) {
  const mags = r?.magazines ?? [];
  if (!mags.length) return _note('この期間の記事はありません');
  const t = r?.totals ?? {};
  const a = r?.account ?? {};
  const hasFollow = a.followersChange !== null && a.followersChange !== undefined;
  const rows = mags.map((m) => `
    <tr>
      <td class="bud-mag"><b>${esc(m.name || '')}</b>${m.status && m.status !== 'active' ? `<span class="chip chip-idle">${esc(_STATUS_JA[m.status] || m.status)}</span>` : ''}
        <div class="bud-why">${esc(m.why || '')}</div></td>
      <td class="num">${m.published ?? 0}<small> / ${m.attempts ?? 0}</small></td>
      <td class="num">${(m.failed ?? 0) + (m.skipped ?? 0) || '—'}</td>
      <td class="num">${m.posts ?? 0}</td>
      <td class="num">${m.likes ?? 0}</td>
      <td class="num">${_yen(m.costJpy)}${m.costEstimated ? '<small>推定</small>' : ''}</td>
      <td><span class="chip ${_VERDICT_CHIP[m.verdict] || 'chip-idle'}">${esc(m.verdict || '—')}</span></td>
    </tr>`).join('');
  return `
    <div class="bud-kpis">
      ${_kpi(`費用（直近${esc(String(r?.days ?? ''))}日）`, _yen(t.costJpy))}
      ${_kpi('note に載った記事', `${_num(t.posts)}本`)}
      ${_kpi('スキ', _num(t.likes), t.costPerLikeJpy ? `1つあたり ${_yen(t.costPerLikeJpy)}` : '')}
      ${_kpi('フォロワー', hasFollow ? _num(a.followersEnd) : '—',
        hasFollow ? `${a.followersChange >= 0 ? '+' : ''}${a.followersChange}（${_num(a.followersStart)} から）` : '')}
    </div>
    <div class="bud-card bud-table-wrap"><table class="bud-table">
      <thead><tr><th>マガジン</th><th class="num">公開 / 着手</th><th class="num">失敗・スキップ</th><th class="num">note</th>
        <th class="num">スキ</th><th class="num">費用</th><th>判定</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <details class="bud-rules"><summary>判定のルール</summary>
        <p>見直し: 失敗・スキップが公開の2倍より多い／未インポート: 公開したのに note に半分も載っていない／
        やめる候補: ¥300以上かけて、1本あたりのスキが0.5未満／反応が薄い: 1本あたりのスキが少ない。</p>
        <p>「推定」は、記事ごとの費用の記録がない期間を今の単価で見積もった値です。</p>
      </details>
    </div>`;
}

async function _loadBudget() {
  const el = document.getElementById('budget-body');
  if (!el) return;
  el.innerHTML = _note('読み込み中…');
  try {
    el.innerHTML = _renderBudget(await _budgetFetch('/api/spend'))
      + `<div class="section-hd">マガジン別の費用対効果（直近28日）</div><div id="budget-roi">${_note('読み込み中…')}</div>`;
  } catch (e) {
    el.innerHTML = `<div class="bud-empty is-bad">読み込めませんでした（${esc(e.message || String(e))}）</div>`;
    return;
  }
  const roiEl = document.getElementById('budget-roi');
  try {
    roiEl.innerHTML = _renderRoi(await _budgetFetch('/api/spend/roi?days=28'));
  } catch (e) {
    roiEl.innerHTML = `<div class="bud-empty is-bad">読み込めませんでした（${esc(e.message || String(e))}）</div>`;
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
      const overCap = r.monthJpy > r.capJpy;
      out.innerHTML = `<div class="bud-est-row"><span>記事1本</span><b>${_yen(r.perArticleJpy)}</b></div>
        <div class="bud-est-row"><span>1か月</span><b class="${overCap ? 'is-warn' : ''}">${_yen(r.monthJpy)}</b></div>
        <div class="bud-est-row"><span>検索（1か月）</span><b>${_num(Math.round(r.monthSearches ?? 0))}回</b></div>
        <p class="bud-help${overCap ? ' is-warn' : ''}">${overCap ? `上限 ${_yen(r.capJpy)} を超えるため、月の途中で止まります。` : `上限 ${_yen(r.capJpy)} の範囲に収まります。`}</p>`;
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
  const bundled = arts.filter((x) => x.bundled).length;
  return `
    <div class="bud-kpis">
      ${_kpi('まだ note にない記事', `${arts.length}本`, bundled ? `うち ${bundled}本はファイル作成済み` : '')}
      ${skipped.length ? _kpi('ファイルにできない記事', `${skipped.length}本`, 'Wiki から手で移す') : ''}
    </div>
    <div class="bud-card">
      <div class="bud-form">
        <button class="save-btn" ${arts.length ? '' : 'disabled'} onclick="bulkImportUnpublished(this)">まとめてファイルを作る</button>
      </div>
      <p class="bud-help">1つのファイルにまとめます（note の上限を超える分は複数）。note の「記事 → インポート」でアップロードすると、
        すべて下書きとして入ります。見出し画像・目次・マガジンは各記事で設定してください。</p>
      <p class="bud-help">アップロードしたら「インポート済みにする」を押すと、次から一覧に出ません。</p>
      <div id="note-import-result"></div>
    </div>
    ${arts.length ? `<div class="section-hd">対象の記事</div>
      <div class="bud-card bud-table-wrap"><table class="bud-table">
        <thead><tr><th class="num">#</th><th>タイトル</th><th>状態</th></tr></thead>
        <tbody>${arts.map((x, i) => `<tr><td class="num">${i + 1}</td><td>${esc(x.title || x.id)}</td>
          <td>${x.bundled ? '<span class="chip chip-done">ファイル作成済み</span>' : '<span class="chip chip-idle">未作成</span>'}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}
    ${skipped.length ? `<div class="section-hd">ファイルにできない記事（${skipped.length}本）</div>
      <div class="bud-card"><p class="bud-help">インポート用の原稿が保存される前（2026-10-04 より前）に書かれたか、大きすぎる記事です。Wiki から手で移してください。</p>
        <ul class="bud-list">${skipped.map((x) => `<li>${esc(x.title || x.id)}</li>`).join('')}</ul></div>` : ''}`;
}

function _renderBundles(r) {
  if (!r?.bundles?.length) return _note('対象の記事はありませんでした。');
  return `<div class="bud-bundles">${r.bundles.map((b) => `
    <div class="bud-bundle">
      <div><b>${esc(b.label)}</b><div class="bud-why">${b.count}本・${Math.ceil((b.bytes ?? 0) / 1024)}KB</div></div>
      <div class="bud-actions">
        <button class="act-btn" onclick="calDownloadBundle('${esc(b.id)}','${esc(b.fileName)}',this)">ファイルを保存</button>
        <button class="act-btn" onclick="markNoteImported('${esc(b.id)}',this)">インポート済みにする</button>
      </div>
    </div>`).join('')}</div>`;
}

async function _loadNoteImport() {
  const el = document.getElementById('note-import-body');
  if (!el) return;
  el.innerHTML = _note('読み込み中…');
  try {
    el.innerHTML = _renderNoteImport(await _budgetFetch('/api/note-imports/unpublished'));
  } catch (e) {
    el.innerHTML = `<div class="bud-empty is-bad">読み込めませんでした（${esc(e.message || String(e))}）</div>`;
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
