import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { TextEncoder } from 'node:util';

const requireCore = createRequire(new URL('../../hachi-core/package.json', import.meta.url));
const { JSDOM } = requireCore('jsdom');
const source = fs.readFileSync(new URL('../dash/x-affiliate.js', import.meta.url), 'utf8');
const sharedUiSource = fs.readFileSync(new URL('../shared/ui.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../dash/app.js', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('../dash/index.html', import.meta.url), 'utf8');
const enabledSource = source.replace('const FEATURE_ENABLED = false;', 'const FEATURE_ENABLED = true;');
const doms = [];
afterEach(() => { while (doms.length) doms.pop().window.close(); });

function jwt(exp = Math.floor(Date.now() / 1000) + 3600) {
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ sub: 'x-user', exp })}.sig`;
}
function page(hash = '', enabled = false, fetchImpl = async () => { throw new Error('unexpected fetch'); }, options = {}) {
  const dom = new JSDOM(indexHtml, { url: `https://public.example/dash/${hash}`, runScripts: 'outside-only' });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: options.crypto || webcrypto, configurable: true });
  Object.defineProperty(window, 'TextEncoder', { value: TextEncoder, configurable: true });
  window.fetch = fetchImpl;
  window.atob = value => Buffer.from(value, 'base64').toString('binary');
  if (options.jwt) window.localStorage.setItem('dash-jwt', options.jwt);
  if (options.verifier) window.sessionStorage.setItem('hachi-x-oauth-verifier', options.verifier);
  if (options.api) window.localStorage.setItem('nogem-api', options.api);
  window.eval((enabled ? enabledSource : source));
  doms.push(dom);
  return dom;
}
function fullAppPage(hash = '#xentry', fetchImpl = async () => { throw new Error('unexpected fetch'); }, options = {}) {
  const search = options.search || '';
  const dom = new JSDOM(indexHtml, { url: `https://public.example/dash/${search}${hash}`, runScripts: 'outside-only' });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: options.crypto || webcrypto, configurable: true });
  Object.defineProperty(window, 'TextEncoder', { value: TextEncoder, configurable: true });
  window.fetch = fetchImpl;
  window.atob = value => Buffer.from(value, 'base64').toString('binary');
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, bezierCurveTo() {}, arc() {}, fill() {}, setLineDash() {} });
  window.mermaid = { initialize() {}, run: async () => {} };
  if (options.jwt) window.localStorage.setItem('dash-jwt', options.jwt);
  if (options.verifier) window.sessionStorage.setItem('hachi-x-oauth-verifier', options.verifier);
  if (options.api) window.localStorage.setItem('nogem-api', options.api);
  window.eval(sharedUiSource);
  window.eval(options.enabled ? enabledSource : source);
  window.eval(appSource);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  doms.push(dom);
  return dom;
}
const json = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};
async function selectFirstAccount(dom) {
  const button = dom.window.document.querySelector('#x-accounts .x-row button');
  assert.ok(button);
  button.click();
  await flush();
}

test('OFF: x_code is removed during evaluation and no fetch occurs', () => {
  let calls = 0;
  const dom = page('#x_code=secret', false, () => { calls++; return json({}); });
  assert.equal(dom.window.location.hash, '#xentry');
  assert.equal(calls, 0);
  assert.equal(dom.window.localStorage.getItem('dash-jwt'), null);
});

test('OFF: login never navigates or calls the network', async () => {
  let calls = 0;
  const dom = page('#xentry', false, () => { calls++; return json({}); });
  const before = dom.window.location.href;
  await dom.window.HachiXAffiliate.login();
  assert.equal(dom.window.location.href, before);
  assert.equal(calls, 0);
});

test('enabled unauthenticated entry renders a GitHub login button', async () => {
  const dom = page('#xentry', true, () => json({ accounts: [], members: [] }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /GitHubでログイン/);
});

test('enabled callback exchanges against fixed origin with verifier proof', async () => {
  const requests = [];
  const exchangedToken = jwt();
  const dom = page('#x_code=one', true, (url, options) => { requests.push({ url: String(url), options }); return String(url).endsWith('/exchange') ? json({ token: exchangedToken }) : json({ apiVersion: 'x-affiliate/v1', accounts: [], member: { role: 'member' } }); }, { verifier: 'verifier-1', jwt: 'legacy', api: 'https://evil.example' });
  await new Promise(resolve => setTimeout(resolve, 0));
  await dom.window.HachiXAffiliate.api('/api/x-affiliate/context');
  const exchange = requests.find(r => r.url.endsWith('/exchange'));
  const context = requests.find(r => r.url.endsWith('/context'));
  assert.equal(exchange.url, 'https://hachi-core-685554938840.asia-northeast1.run.app/api/x-auth/exchange');
  assert.match(exchange.options.body, /verifier-1/);
  assert.equal(context.options.headers['X-XAuth-Browser-Proof'], 'verifier-1');
  assert.equal(context.options.headers.Authorization, `Bearer ${exchangedToken}`);
  assert.equal(dom.window.localStorage.getItem('dash-jwt'), 'legacy');
  assert.equal(dom.window.sessionStorage.getItem('hachi-x-browser-proof'), 'verifier-1');
});

test('legacy dash-jwt and api overrides are not touched', () => {
  const dom = page('#xentry', false, undefined, { jwt: 'legacy', api: 'https://evil.example' });
  assert.equal(dom.window.localStorage.getItem('dash-jwt'), 'legacy');
  assert.doesNotMatch(source, /localStorage\.getItem\(['"]nogem-api/);
});

test('401 clears X token, proof and verifier', async () => {
  let unauthorized = false;
  let calls = 0;
  const dom = page('#x_code=one', true, url => { calls += 1; if (String(url).endsWith('/exchange')) return json({ token: jwt() }); if (unauthorized) return json({ error: { message: 'no' } }, 401); return json({ apiVersion: 'x-affiliate/v1', accounts: [], member: { role: 'member' } }); }, { verifier: 'proof-v', jwt: 'legacy' });
  await new Promise(resolve => setTimeout(resolve, 0));
  await dom.window.HachiXAffiliate.api('/api/x-affiliate/context');
  unauthorized = true;
  await assert.rejects(() => dom.window.HachiXAffiliate.api('/api/x-affiliate/context'));
  const callsAfter401 = calls;
  await assert.rejects(() => dom.window.HachiXAffiliate.api('/api/x-affiliate/context'));
  assert.equal(calls, callsAfter401);
  assert.equal(dom.window.sessionStorage.getItem('hachi-x-browser-proof'), null);
  assert.equal(dom.window.sessionStorage.getItem('hachi-x-oauth-verifier'), null);
  assert.equal(dom.window.localStorage.getItem('dash-jwt'), 'legacy');
});

test('full production source X entry keeps legacy dashboard idle while feature is off', async () => {
  const legacyToken = 'legacy-full-entry-jwt';
  const requests = [];
  const dom = fullAppPage('#xentry', (url, options = {}) => {
    requests.push({ url: String(url), options });
    return json({});
  }, { jwt: legacyToken, search: '?api=https://legacy.example' });
  await flush();
  const root = dom.window.document.getElementById('page-x-affiliate');
  assert.equal(root.classList.contains('active'), true);
  assert.match(root.textContent, /利用停止中/);
  assert.equal(requests.length, 0);
  assert.equal(dom.window.localStorage.getItem('dash-jwt'), legacyToken);

  const scriptSrcs = [...dom.window.document.querySelectorAll('script[src]')].map(script => script.getAttribute('src'));
  const uiScriptIndex = scriptSrcs.findIndex(src => src.startsWith('../shared/ui.js?'));
  const xScriptIndex = scriptSrcs.findIndex(src => src.startsWith('x-affiliate.js?'));
  const appScriptIndex = scriptSrcs.findIndex(src => src.startsWith('app.js?'));
  assert.ok(uiScriptIndex >= 0); assert.ok(xScriptIndex >= 0); assert.ok(appScriptIndex >= 0); assert.ok(uiScriptIndex < xScriptIndex); assert.ok(xScriptIndex < appScriptIndex);
  assert.equal(scriptSrcs.filter(src => src.split('?')[0] === 'x-affiliate.js').length, 1);
  const appBuild = appSource.match(/const DASH_BUILD = '([^']+)'/)[1];
  assert.equal(new URL(`https://public.example/dash/${scriptSrcs[appScriptIndex]}`).searchParams.get('v'), appBuild);
  const cssRef = [...dom.window.document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.getAttribute('href')).find(ref => ref.startsWith('dashboard.css?'));
  assert.ok(cssRef); assert.ok(Number(new URL(`https://public.example/dash/${cssRef}`).searchParams.get('v')) >= 9);
  assert.match(source, /const FEATURE_ENABLED = false;/);
});

test('full production X page common logout and refresh preserve legacy auth without fetches', async () => {
  const legacyToken = 'legacy-common-jwt';
  const requests = [];
  const dom = fullAppPage('#xentry', (url, options = {}) => {
    requests.push({ url: String(url), options });
    return json({});
  }, { jwt: legacyToken, search: '?api=https://legacy.example' });
  await flush();
  dom.window.logoutUser();
  await flush();
  await dom.window.loadDashboard();
  await flush();
  assert.equal(requests.length, 0);
  assert.equal(dom.window.localStorage.getItem('dash-jwt'), legacyToken);
  assert.equal(dom.window.HachiXAffiliate.isActive(), true);
  assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /利用停止中/);
});

test('leaving the full production X page loads only legacy auth and dashboard data', async () => {
  const legacyToken = 'legacy-nav-jwt';
  const requests = [];
  const dom = fullAppPage('#xentry', (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (request.url.endsWith('/auth/verify')) return json({ user: { login: 'legacy-user' } });
    if (request.url.endsWith('/api/dashboard-data')) return json({});
    return json({});
  }, { jwt: legacyToken, search: '?api=https://legacy.example' });
  await flush();
  assert.equal(requests.length, 0);
  dom.window.navTo('today');
  await flush();
  assert.equal(dom.window.location.hash, '#tasks');
  assert.equal(dom.window.document.getElementById('page-tasks').classList.contains('active'), true);
  assert.equal(dom.window.document.getElementById('page-x-affiliate').classList.contains('active'), false);
  const authRequests = requests.filter(request => request.url.endsWith('/auth/verify'));
  const dashboardRequests = requests.filter(request => request.url.endsWith('/api/dashboard-data'));
  assert.equal(authRequests.length, 1);
  assert.equal(dashboardRequests.length, 1);
  assert.equal(requests.length, 2);
  assert.equal(authRequests[0].options.headers.Authorization, `Bearer ${legacyToken}`);
  assert.deepEqual(Object.keys(authRequests[0].options.headers).sort(), ['Authorization']);
  assert.deepEqual(Object.keys(dashboardRequests[0].options.headers).sort(), ['Authorization']);
  assert.equal(dashboardRequests[0].options.headers.Authorization, `Bearer ${legacyToken}`);
  assert.equal(requests.some(request => request.url.startsWith('https://hachi-core-')), false);
});

test('expired JWT is rejected before request', async () => {
  let calls = 0;
  const dom = page('#x_code=c', true, url => { if (String(url).endsWith('/exchange')) return json({ token: jwt(1) }); calls++; return json({}); }, { verifier: 'v' });
  await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(() => dom.window.HachiXAffiliate.api('/api/x-affiliate/context'), /有効期限/);
  assert.equal(calls, 0);
});

test('X entry activates its page and mobile entry uses the same route', async () => {
  const dom = page('', false);
  await new Promise(resolve => setTimeout(resolve, 0));
  const root = dom.window.document.getElementById('page-x-affiliate');
  dom.window.document.getElementById('x-affiliate-entry').click();
  assert.equal(dom.window.location.hash, '#xentry');
  assert.equal(root.classList.contains('active'), true);
  dom.window.document.getElementById('x-affiliate-mobile-entry').click();
  assert.equal(dom.window.location.hash, '#xentry');
});

test('member UI hides admin controls and omits reviewChannelRef from settings PATCH', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ apiVersion: 'x-affiliate/v1', accounts: [{ accountId: 'account1', label: 'A1', market: 'JP', enabled: true, revision: 2 }], member: { role: 'member', accountIds: ['account1'] } });
    if (path.includes('/settings') && options.method === 'PATCH') return json({ settings: { accountId: 'account1', revision: 2, profile: { tone: '新しいトーン' }, templateRefs: [] } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'account1', revision: 1, profile: { tone: '' }, templateRefs: [], reviewChannelRef: 'secret-channel' } });
    if (path.includes('/tags')) return json({ accountId: 'account1', tags: [{ tagId: 'tag1', name: 'tag', enabled: true, default: false, revision: 1 }] });
    return json({});
  };
  const dom = page('#x_code=member', true, router, { verifier: 'member-v' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const accountButton = dom.window.document.querySelector('#x-accounts .act-btn');
  assert.ok(accountButton);
  accountButton.click();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(dom.window.document.querySelector('#x-accounts form'), null);
  assert.equal(dom.window.document.querySelector('#x-tags form'), null);
  assert.equal([...dom.window.document.querySelectorAll('#x-tags .act-btn')].some(b => b.textContent === '更新'), false);
  assert.equal(dom.window.document.querySelector('#x-settings [name="reviewChannelRef"]'), null);
  const tone = dom.window.document.querySelector('#x-settings [name="tone"]');
  assert.ok(tone);
  tone.value = '新しいトーン';
  const settingsSave = dom.window.document.querySelector('#x-settings button[type="button"]');
  assert.ok(settingsSave);
  settingsSave.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  const patchRequest = requests.find(r => r.path.endsWith('/settings') && r.options.method === 'PATCH');
  const body = JSON.parse(patchRequest.options.body);
  assert.deepEqual(Object.keys(body.patch).sort(), ['profile', 'templateRefs']);
  assert.equal('reviewChannelRef' in body.patch, false);
});

test('account switching clears the previously rendered settings and tags forms', async () => {
  const dom = page('#x_code=switch', true, url => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }, { accountId: 'B', label: 'B' }], member: { role: 'member' } });
    if (path.includes('/settings')) return json({ settings: { revision: 1, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    return json({});
  }, { verifier: 'switch-v' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const buttons = dom.window.document.querySelectorAll('#x-accounts .act-btn');
  assert.equal(buttons.length, 2);
  buttons[0].click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(dom.window.document.querySelector('#x-settings form'));
  buttons[1].click();
  assert.equal(dom.window.document.querySelector('#x-settings form'), null);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(dom.window.document.querySelector('#x-settings form'));
  assert.equal(dom.window.document.querySelector('#x-tags form'), null);
});

test('account race keeps the newer B settings and binds B revision/account on save', async () => {
  const requests = [];
  const pendingA = deferred();
  const pendingB = deferred();
  let bSettingsReads = 0;
  const router = (url, options = {}) => {
    const path = String(url);
    requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) {
      return json({
        accounts: [
          { accountId: 'A', label: 'A', market: 'JP', revision: 11 },
          { accountId: 'B', label: 'B', market: 'JP', revision: 22 },
        ],
        member: { role: 'admin' },
      });
    }
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && options.method === 'PATCH') return json({ settings: { revision: 23, profile: { tone: '保存済みB' }, templateRefs: [] } });
    if (path.includes('/settings')) {
      const accountId = new URL(path).searchParams.get('accountId');
      if (accountId === 'A') return pendingA.promise;
      bSettingsReads += 1;
      if (bSettingsReads === 1) return pendingB.promise;
      return json({ settings: { accountId: 'B', revision: 23, profile: { tone: '保存済みB' }, templateRefs: [] } });
    }
    if (path.includes('/tags')) return json({ tags: [] });
    return json({});
  };
  const dom = page('#x_code=race', true, router, { verifier: 'race-v' });
  await flush();
  const rows = [...dom.window.document.querySelectorAll('#x-accounts .x-row')];
  const rowA = rows.find(row => row.querySelector('button').textContent.startsWith('A ('));
  const rowB = rows.find(row => row.querySelector('button').textContent.startsWith('B ('));
  assert.ok(rowA);
  assert.ok(rowB);
  rowA.querySelector('button').click();
  rowB.querySelector('button').click();
  pendingB.resolve(json({ settings: { accountId: 'B', revision: 22, profile: { tone: 'Bの設定' }, templateRefs: [] } }));
  await flush();
  pendingA.resolve(json({ settings: { accountId: 'A', revision: 11, profile: { tone: '古いAの設定' }, templateRefs: [] } }));
  await flush();
  assert.equal(dom.window.document.querySelector('#x-settings [name="tone"]').value, 'Bの設定');
  const tone = dom.window.document.querySelector('#x-settings [name="tone"]');
  tone.value = 'Bで更新';
  const save = dom.window.document.querySelector('#x-settings form button');
  assert.ok(save);
  save.click();
  await flush();
  const patch = requests.find(request => request.path.endsWith('/settings') && request.options.method === 'PATCH');
  assert.ok(patch);
  const body = JSON.parse(patch.options.body);
  assert.equal(body.accountId, 'B');
  assert.equal(body.expectedRevision, 22);
});

test('detached A settings form cannot fetch after selecting B', async () => {
  const requests = [];
  const pendingB = deferred();
  const router = (url, options = {}) => {
    const path = String(url);
    requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }, { accountId: 'B', label: 'B' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) {
      const accountId = new URL(path).searchParams.get('accountId');
      if (accountId === 'B') return pendingB.promise;
      return json({ settings: { accountId: 'A', revision: 7, profile: { tone: 'Aの設定' }, templateRefs: [] } });
    }
    if (path.includes('/tags')) return json({ tags: [] });
    return json({});
  };
  const dom = page('#x_code=detached', true, router, { verifier: 'detached-v' });
  await flush();
  const rows = [...dom.window.document.querySelectorAll('#x-accounts .x-row')];
  const rowA = rows.find(row => row.querySelector('button').textContent.startsWith('A ('));
  const rowB = rows.find(row => row.querySelector('button').textContent.startsWith('B ('));
  assert.ok(rowA);
  assert.ok(rowB);
  rowA.querySelector('button').click();
  await flush();
  const oldForm = dom.window.document.querySelector('#x-settings form');
  const oldSave = oldForm.querySelector('button');
  assert.ok(oldForm);
  rowB.querySelector('button').click();
  assert.equal(oldForm.isConnected, false);
  const requestCountAfterBSelection = requests.length;
  oldSave.click();
  await flush();
  assert.equal(requests.length, requestCountAfterBSelection);
  assert.equal(requests.some(request => request.options.method === 'PATCH'), false);
});

test('logout invalidates pending context and settings responses', async () => {
  const pendingContext = deferred();
  const pendingSettings = deferred();
  let contextReads = 0;
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) {
      contextReads += 1;
      if (contextReads === 1) return json({ accounts: [{ accountId: 'A', label: 'A' }], member: { role: 'admin' } });
      return pendingContext.promise;
    }
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) return pendingSettings.promise;
    if (path.includes('/tags')) return json({ tags: [] });
    return json({});
  };
  const dom = page('#x_code=logout-race', true, router, { verifier: 'logout-race-v' });
  await flush();
  const accountButton = dom.window.document.querySelector('#x-accounts .x-row button');
  assert.ok(accountButton);
  accountButton.click();
  const toolbarButtons = [...dom.window.document.querySelectorAll('.x-toolbar button')];
  assert.equal(toolbarButtons.length, 2);
  toolbarButtons[0].click();
  toolbarButtons[1].click();
  pendingContext.resolve(json({ accounts: [{ accountId: 'A', label: '遅いA' }], member: { role: 'admin' } }));
  pendingSettings.resolve(json({ settings: { accountId: 'A', revision: 9, profile: { tone: '遅い設定' }, templateRefs: [] } }));
  await flush();
  assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /GitHubでログイン/);
  assert.equal(dom.window.document.querySelector('#x-accounts'), null);
  assert.equal(dom.window.document.querySelector('#x-settings form'), null);
  assert.doesNotMatch(dom.window.document.getElementById('page-x-affiliate').textContent, /遅いA|遅い設定/);
});

test('account inline form sends enabled and expected revision', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', enabled: true, revision: 4, market: 'JP' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.endsWith('/accounts/A') && options.method === 'PATCH') return json({ account: { accountId: 'A', revision: 5 } });
    return json({});
  };
  const dom = page('#x_code=account-inline', true, router, { verifier: 'account-inline-v' });
  await flush();
  const form = dom.window.document.querySelector('#x-accounts .x-inline-form');
  assert.ok(form);
  form.querySelector('[name="label"]').value = '更新A';
  form.querySelector('[name="enabled"]').checked = false;
  form.querySelector('button').click();
  await flush();
  const patch = requests.find(request => request.path.endsWith('/accounts/A') && request.options.method === 'PATCH');
  assert.ok(patch);
  assert.deepEqual(JSON.parse(patch.options.body), { expectedRevision: 4, fields: { label: '更新A', enabled: false } });
});

test('member inline role and assignment update, then revoke requires confirmation and reason', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'admin' } });
    if (path.endsWith('/members') && !options.method) return json({ members: [{ memberId: 'm1', role: 'admin', accountIds: ['A'], status: 'active', revision: 8 }] });
    if (path.endsWith('/members/m1') && options.method === 'PATCH') return json({ member: { memberId: 'm1', revision: 9 } });
    if (path.endsWith('/members/m1/revoke')) return json({ member: { memberId: 'm1', revision: 10, status: 'revoked' } });
    return json({});
  };
  const dom = page('#x_code=member-inline', true, router, { verifier: 'member-inline-v' });
  await flush();
  let forms = [...dom.window.document.querySelectorAll('#x-members .x-inline-form')];
  assert.equal(forms.length, 2);
  const update = forms[0];
  update.querySelector('[name="role"]').value = 'member';
  update.querySelector('[name="accountIds"]').value = 'B,C';
  update.querySelector('button').click();
  await flush();
  const updateRequest = requests.find(request => request.path.endsWith('/members/m1') && request.options.method === 'PATCH');
  assert.ok(updateRequest);
  assert.deepEqual(JSON.parse(updateRequest.options.body), { expectedRevision: 8, fields: { role: 'member', accountIds: ['B', 'C'] } });
  const revoke = [...dom.window.document.querySelectorAll('#x-members .x-inline-form')].find(form => form.querySelector('[name="reason"]'));
  assert.ok(revoke);
  revoke.querySelector('[name="reason"]').value = '不要になった';
  dom.window.confirm = () => false;
  revoke.querySelector('button').click();
  await flush();
  assert.equal(requests.some(request => request.path.endsWith('/revoke')), false);
  dom.window.confirm = () => true;
  revoke.querySelector('button').click();
  await flush();
  const revokeRequest = requests.find(request => request.path.endsWith('/members/m1/revoke'));
  assert.ok(revokeRequest);
  assert.deepEqual(JSON.parse(revokeRequest.options.body), { expectedRevision: 8, reason: '不要になった' });
});

test('tag inline form sends metadata/value and clears password after success', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', revision: 1 }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && !options.method) return json({ settings: { accountId: 'A', revision: 10, profile: {}, templateRefs: [] } });
    if (path.includes('/tags') && options.method === 'PATCH') return json({ tagId: 't1', name: 'new-tag', enabled: true, default: true, revision: 2 });
    if (path.includes('/tags')) return json({ accountId: 'A', tags: [{ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 1 }] });
    return json({});
  };
  const dom = page('#x_code=tag-inline', true, router, { verifier: 'tag-inline-v' });
  await flush();
  await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-tags .x-inline-form');
  assert.ok(form);
  form.querySelector('[name="name"]').value = 'new-tag';
  form.querySelector('[name="value"]').value = 'secret-value';
  form.querySelector('[name="enabled"]').checked = true;
  form.querySelector('[name="default"]').checked = true;
  const valueInput = form.querySelector('[name="value"]');
  form.querySelector('button').click();
  await flush();
  const patch = requests.find(request => request.options.method === 'PATCH' && request.path.includes('/tags/'));
  assert.ok(patch);
  const body = JSON.parse(patch.options.body);
  assert.equal(body.accountId, 'A');
  assert.equal(body.expectedRevision, 1);
  assert.deepEqual(body.fields, { name: 'new-tag', enabled: true, default: true, value: 'secret-value' });
  assert.equal(valueInput.value, '');
});

test('tag 409 keeps all inline inputs for correction', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && !options.method) return json({ settings: { accountId: 'A', revision: 2, profile: {}, templateRefs: [] } });
    if (path.includes('/tags') && options.method === 'PATCH') return json({ error: { message: 'revision conflict' } }, 409);
    if (path.includes('/tags')) return json({ accountId: 'A', tags: [{ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 3 }] });
    return json({});
  };
  const dom = page('#x_code=tag-409', true, router, { verifier: 'tag-409-v' });
  await flush();
  await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-tags .x-inline-form');
  assert.ok(form);
  form.querySelector('[name="name"]').value = 'corrected';
  form.querySelector('[name="value"]').value = 'keep-secret';
  form.querySelector('[name="enabled"]').checked = false;
  form.querySelector('button').click();
  await flush();
  assert.equal(form.isConnected, true);
  assert.equal(form.querySelector('[name="name"]').value, 'corrected');
  assert.equal(form.querySelector('[name="value"]').value, 'keep-secret');
  assert.equal(form.querySelector('[name="enabled"]').checked, false);
  assert.match(form.textContent, /最新状態を再確認/);
});

test('tag retry reuses key for same failed payload and changes it after editing', async () => {
  const keys = [];
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && !options.method) return json({ settings: { accountId: 'A', revision: 2, profile: {}, templateRefs: [] } });
    if (path.includes('/tags') && options.method === 'PATCH') { keys.push(JSON.parse(options.body).idempotencyKey); return json({ error: { message: 'retry me' } }, 500); }
    if (path.includes('/tags')) return json({ accountId: 'A', tags: [{ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 3 }] });
    return json({});
  };
  const dom = page('#x_code=tag-retry', true, router, { verifier: 'tag-retry-v' });
  await flush();
  await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-tags .x-inline-form');
  assert.ok(form);
  form.querySelector('[name="value"]').value = 'same';
  form.querySelector('button').click();
  await flush();
  form.querySelector('button').click();
  await flush();
  form.querySelector('[name="name"]').value = 'changed';
  form.querySelector('button').click();
  await flush();
  assert.equal(keys.length, 3);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test('pending tag save ignores duplicate click and sends one write', async () => {
  const pending = deferred();
  let writes = 0;
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && !options.method) return json({ settings: { accountId: 'A', revision: 2, profile: {}, templateRefs: [] } });
    if (path.includes('/tags') && options.method === 'PATCH') { writes += 1; return pending.promise; }
    if (path.includes('/tags')) return json({ accountId: 'A', tags: [{ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 3 }] });
    return json({});
  };
  const dom = page('#x_code=tag-pending', true, router, { verifier: 'tag-pending-v' });
  await flush();
  await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-tags .x-inline-form');
  assert.ok(form);
  form.querySelector('[name="value"]').value = 'pending-secret';
  form.querySelector('button').click();
  form.querySelector('button').click();
  await flush();
  assert.equal(writes, 1);
  pending.resolve(json({ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 4 }));
  await flush();
});

test('logout clears X password but preserves a password outside X page, and forms prevent submit', async () => {
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && !options.method) return json({ settings: { accountId: 'A', revision: 2, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ accountId: 'A', tags: [{ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 3 }] });
    return json({});
  };
  const dom = page('#x_code=logout-dom', true, router, { verifier: 'logout-dom-v' });
  await flush();
  await selectFirstAccount(dom);
  const xPassword = dom.window.document.querySelector('#x-tags .x-form [name="value"]');
  assert.ok(xPassword);
  xPassword.value = 'erase-me';
  const outside = dom.window.document.createElement('input');
  outside.type = 'password';
  outside.value = 'keep-me';
  dom.window.document.body.append(outside);
  const form = dom.window.document.querySelector('#x-settings form');
  const event = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  assert.equal(form.dispatchEvent(event), false);
  assert.equal(event.defaultPrevented, true);
  dom.window.HachiXAffiliate.logout();
  assert.equal(xPassword.value, '');
  assert.equal(outside.value, 'keep-me');
  assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /GitHubでログイン/);
});

test('digest completion after account switch does not send stale tag write', async () => {
  const digest = deferred();
  const cryptoStub = {
    getRandomValues: value => webcrypto.getRandomValues(value),
    subtle: { digest: () => digest.promise },
  };
  let writes = 0;
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }, { accountId: 'B', label: 'B' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && !options.method) return json({ settings: { accountId: 'A', revision: 2, profile: {}, templateRefs: [] } });
    if (path.includes('/tags') && options.method === 'PATCH') { writes += 1; return json({}); }
    if (path.includes('/tags')) return json({ accountId: new URL(path).searchParams.get('accountId'), tags: [{ tagId: 't1', name: 'tag', enabled: true, default: false, revision: 3 }] });
    return json({});
  };
  const dom = page('#x_code=digest-race', true, router, { verifier: 'digest-race-v', crypto: cryptoStub });
  await flush();
  await selectFirstAccount(dom);
  const tagForm = dom.window.document.querySelector('#x-tags .x-inline-form');
  assert.ok(tagForm);
  tagForm.querySelector('[name="value"]').value = 'stale';
  tagForm.querySelector('button').click();
  const rows = [...dom.window.document.querySelectorAll('#x-accounts .x-row')];
  const rowB = rows.find(row => row.querySelector('button').textContent.startsWith('B ('));
  assert.ok(rowB);
  rowB.querySelector('button').click();
  digest.resolve(new Uint8Array(32).buffer);
  await flush();
  assert.equal(writes, 0);
});

test('account create retry reuses key for same input and changes it after editing', async () => {
  const keys = [];
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.endsWith('/accounts') && options.method === 'POST') { keys.push(JSON.parse(options.body).idempotencyKey); return json({ error: { message: 'temporary' } }, 500); }
    return json({});
  };
  const dom = page('#x_code=account-retry', true, router, { verifier: 'account-retry-v' });
  await flush();
  const form = dom.window.document.querySelector('#x-accounts form');
  assert.ok(form);
  form.querySelector('[name="label"]').value = '同じ名前';
  form.querySelector('button').click();
  await flush();
  assert.equal(form.isConnected, true);
  form.querySelector('button').click();
  await flush();
  form.querySelector('[name="label"]').value = '別の名前';
  form.querySelector('button').click();
  await flush();
  assert.equal(keys.length, 3);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test('settings retry reuses key, changes after editing, and keeps account revision on failure', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings') && options.method === 'PATCH') return json({ error: { message: 'settings conflict' } }, 409);
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 12, profile: { tone: '初期' }, templateRefs: [] } });
    if (path.includes('/tags')) return json({ accountId: 'A', tags: [] });
    return json({});
  };
  const dom = page('#x_code=settings-retry', true, router, { verifier: 'settings-retry-v' });
  await flush();
  await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-settings form');
  assert.ok(form);
  form.querySelector('[name="tone"]').value = '同じトーン';
  form.querySelector('button').click();
  await flush();
  assert.equal(form.isConnected, true);
  assert.equal(form.querySelector('[name="tone"]').value, '同じトーン');
  assert.match(dom.window.document.getElementById('x-settings').textContent, /入力は保持しています/);
  form.querySelector('button').click();
  await flush();
  form.querySelector('[name="tone"]').value = '別のトーン';
  form.querySelector('button').click();
  await flush();
  const patches = requests.filter(request => request.path.endsWith('/settings') && request.options.method === 'PATCH');
  assert.equal(patches.length, 3);
  const bodies = patches.map(request => JSON.parse(request.options.body));
  assert.equal(bodies[0].accountId, 'A');
  assert.equal(bodies[0].expectedRevision, 12);
  assert.equal(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
  assert.notEqual(bodies[1].idempotencyKey, bodies[2].idempotencyKey);
  assert.equal(bodies[2].patch.profile.tone, '別のトーン');
});

test('Discord link start uses auth headers, exact endpoint, and keeps code only in memory/DOM', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-1', code: 'nonce-one', expiresAt: Date.now() + 600000, revision: 0 });
    return json({});
  };
  const dom = page('#x_code=link-start', true, router, { verifier: 'link-start-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start);
  start.click();
  await flush();
  const request = requests.find(item => item.path.endsWith('/link/start'));
  assert.ok(request);
  assert.equal(request.options.method, 'POST');
  assert.equal('body' in request.options, false);
  assert.match(request.options.headers.Authorization, /^Bearer /);
  assert.equal(request.options.headers['X-XAuth-Browser-Proof'], 'link-start-v');
  const linkText = dom.window.document.querySelector('#x-link').textContent;
  assert.match(linkText, /\/x-link code:nonce-one/);
  assert.equal(linkText.split('nonce-one').length - 1, 1);
  const sessionValues = Object.keys(dom.window.sessionStorage).map(key => [key, dom.window.sessionStorage.getItem(key)]);
  assert.equal(sessionValues.some(([key, value]) => key.includes('link') || value.includes('nonce-one')), false);
  assert.equal(dom.window.localStorage.getItem('x-link-challenge'), null);
});

test('issued Discord link status cannot finalize', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-issued', code: 'nonce-issued', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return json({ status: 'issued', revision: 0 });
    return json({});
  };
  const dom = page('#x_code=link-issued', true, router, { verifier: 'link-issued-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click(); await flush();
  assert.equal(dom.window.document.querySelector('#x-link [name="discordConfirmed"]'), null);
  assert.equal(requests.some(item => item.path.endsWith('/link/finalize')), false);
});

test('confirmed Discord link hides code and finalizes only after explicit checkbox', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-confirm', code: 'nonce-confirm', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return json({ status: 'discord_confirmed', revision: 1, discordDisplay: 'Alice#1', discordUserId: 'discord-1' });
    if (path.endsWith('/link/finalize')) return json({ status: 'active', discordUserId: 'discord-1', revision: 1 });
    return json({});
  };
  const dom = page('#x_code=link-confirm', true, router, { verifier: 'link-confirm-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click(); await flush();
  const linkBox = dom.window.document.querySelector('#x-link');
  assert.doesNotMatch(linkBox.textContent, /nonce-confirm/);
  assert.match(linkBox.textContent, /Alice#1/);
  const checkbox = linkBox.querySelector('[name="discordConfirmed"]');
  const finalize = [...linkBox.querySelectorAll('button')].find(button => button.textContent.includes('確定'));
  assert.ok(checkbox); assert.ok(finalize); assert.equal(finalize.disabled, true);
  checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(finalize.disabled, false);
  finalize.click(); await flush();
  const request = requests.find(item => item.path.endsWith('/link/finalize'));
  assert.ok(request);
  const body = JSON.parse(request.options.body);
  assert.equal(body.challengeId, 'challenge-confirm');
  assert.equal(body.expectedRevision, 1);
  assert.equal(body.confirm, true);
  assert.equal('expectedLinkRevision' in body, false);
  assert.match(body.idempotencyKey, /^[a-f0-9]+$/);
});

test('relink finalize includes current selfLink revision', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: { status: 'active', revision: 7, discordUserId: 'old-discord' } });
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-relink', code: 'nonce-relink', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return json({ status: 'discord_confirmed', revision: 1, discordDisplay: 'New#2', discordUserId: 'new-discord' });
    if (path.endsWith('/link/finalize')) return json({ status: 'active', discordUserId: 'new-discord', revision: 8 });
    return json({});
  };
  const dom = page('#x_code=link-relink', true, router, { verifier: 'link-relink-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('再連携'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click(); await flush();
  const checkbox = dom.window.document.querySelector('#x-link [name="discordConfirmed"]');
  assert.ok(checkbox); checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const finalize = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('確定'));
  assert.ok(finalize); finalize.click(); await flush();
  const request = requests.find(item => item.path.endsWith('/link/finalize'));
  assert.ok(request);
  assert.equal(JSON.parse(request.options.body).expectedLinkRevision, 7);
});

test('finalize 409 preserves confirmed metadata, retry key, and blocks duplicate write', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-409', code: 'nonce-409', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return json({ status: 'discord_confirmed', revision: 1, discordDisplay: 'Retry#3', discordUserId: 'retry-discord' });
    if (path.endsWith('/link/finalize')) return json({ error: { message: 'link conflict' } }, 409);
    return json({});
  };
  const dom = page('#x_code=link-409', true, router, { verifier: 'link-409-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click(); await flush();
  const checkbox = dom.window.document.querySelector('#x-link [name="discordConfirmed"]');
  assert.ok(checkbox); checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const finalize = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('確定'));
  assert.ok(finalize); finalize.click(); await flush();
  assert.match(dom.window.document.querySelector('#x-link').textContent, /Retry#3|状態を再確認/);
  assert.doesNotMatch(dom.window.document.querySelector('#x-link').textContent, /nonce-409/);
  finalize.click(); finalize.click(); await flush();
  const writes = requests.filter(item => item.path.endsWith('/link/finalize'));
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[0].options.body).idempotencyKey, JSON.parse(writes[1].options.body).idempotencyKey);
  assert.equal(dom.window.document.querySelector('#x-link [name="discordConfirmed"]').checked, true);
});

test('logout invalidates delayed link status without restoring challenge data', async () => {
  const pendingStatus = deferred();
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-logout', code: 'nonce-logout', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return pendingStatus.promise;
    return json({});
  };
  const dom = page('#x_code=link-logout', true, router, { verifier: 'link-logout-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click();
  dom.window.HachiXAffiliate.logout();
  pendingStatus.resolve(json({ status: 'discord_confirmed', revision: 1, discordDisplay: 'Late#4', discordUserId: 'late' }));
  await flush();
  assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /GitHubでログイン/);
  assert.doesNotMatch(dom.window.document.getElementById('page-x-affiliate').textContent, /nonce-logout|Late#4/);
});

test('logout invalidates delayed finalize without clearing the new login state or fetching context', async () => {
  const pendingFinalize = deferred();
  const requests = [];
  let contextReads = 0;
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) {
      contextReads += 1;
      return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    }
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-finalize-logout', code: 'nonce-finalize-logout', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return json({ status: 'discord_confirmed', revision: 1, discordDisplay: 'Late#5', discordUserId: 'late-finalize' });
    if (path.endsWith('/link/finalize')) return pendingFinalize.promise;
    return json({});
  };
  const dom = page('#x_code=link-finalize-logout', true, router, { verifier: 'link-finalize-logout-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click(); await flush();
  const checkbox = dom.window.document.querySelector('#x-link [name="discordConfirmed"]');
  assert.ok(checkbox); checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const finalize = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('確定'));
  assert.ok(finalize); finalize.click(); await flush();
  assert.equal(requests.filter(item => item.path.endsWith('/link/finalize')).length, 1);
  const contextBeforeResolve = contextReads;
  dom.window.HachiXAffiliate.logout();
  pendingFinalize.resolve(json({ status: 'active', discordUserId: 'late-finalize', revision: 2 }));
  await flush();
  assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /GitHubでログイン/);
  assert.doesNotMatch(dom.window.document.getElementById('page-x-affiliate').textContent, /Late#5|late-finalize|nonce-finalize-logout/);
  assert.equal(contextReads, contextBeforeResolve);
});

test('detached finalize form ignores a late success without reloading context', async () => {
  const pendingFinalize = deferred();
  const requests = [];
  let contextReads = 0;
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) {
      contextReads += 1;
      return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    }
    if (path.endsWith('/link/start')) return json({ challengeId: 'challenge-finalize-detached', code: 'nonce-finalize-detached', expiresAt: Date.now() + 600000, revision: 0 });
    if (path.includes('/link/status')) return json({ status: 'discord_confirmed', revision: 1, discordDisplay: 'Detached#6', discordUserId: 'detached-finalize' });
    if (path.endsWith('/link/finalize')) return pendingFinalize.promise;
    return json({});
  };
  const dom = page('#x_code=link-finalize-detached', true, router, { verifier: 'link-finalize-detached-v' });
  await flush();
  const start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  const status = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '状態を確認');
  assert.ok(status); status.click(); await flush();
  const checkbox = dom.window.document.querySelector('#x-link [name="discordConfirmed"]');
  assert.ok(checkbox); checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const finalize = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('確定'));
  assert.ok(finalize); finalize.click(); await flush();
  assert.equal(requests.filter(item => item.path.endsWith('/link/finalize')).length, 1);
  const contextBeforeResolve = contextReads;
  const oldLinkBox = dom.window.document.getElementById('x-link');
  oldLinkBox.replaceChildren();
  assert.equal(finalize.isConnected, false);
  pendingFinalize.resolve(json({ status: 'active', discordUserId: 'detached-finalize', revision: 2 }));
  await flush();
  assert.equal(contextReads, contextBeforeResolve);
  assert.equal(requests.filter(item => item.path.endsWith('/link/start')).length, 1);
  const newCheckbox = oldLinkBox.querySelector('[name="discordConfirmed"]');
  const newFinalize = [...oldLinkBox.querySelectorAll('button')].find(button => button.textContent.includes('確定'));
  assert.ok(newCheckbox); assert.ok(newFinalize);
  assert.match(oldLinkBox.textContent, /Detached#6/);
  assert.equal(newCheckbox.checked, true);
  assert.equal(newFinalize.disabled, false);
  newCheckbox.checked = false; newCheckbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(newFinalize.disabled, true);
  newCheckbox.checked = true; newCheckbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(newFinalize.disabled, false);
});

test('new link start replaces old challenge and expired challenge disables operations', async () => {
  let starts = 0;
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [], member: { role: 'member' }, selfLink: null });
    if (path.endsWith('/link/start')) {
      starts += 1;
      return json({ challengeId: `challenge-${starts}`, code: starts === 1 ? 'old-code' : 'expired-code', expiresAt: starts === 1 ? Date.now() + 600000 : Date.now() - 1, revision: 0 });
    }
    return json({});
  };
  const dom = page('#x_code=link-restart', true, router, { verifier: 'link-restart-v' });
  await flush();
  let start = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent.includes('開始'));
  assert.ok(start); start.click(); await flush();
  assert.match(dom.window.document.querySelector('#x-link').textContent, /old-code/);
  const restart = [...dom.window.document.querySelectorAll('#x-link button')].find(button => button.textContent === '再開始');
  assert.ok(restart); restart.click(); await flush();
  assert.doesNotMatch(dom.window.document.querySelector('#x-link').textContent, /old-code/);
  assert.match(dom.window.document.querySelector('#x-link').textContent, /期限が切れ/);
  assert.equal([...dom.window.document.querySelectorAll('#x-link button')].some(button => button.textContent === '状態を確認'), false);
  assert.equal(requests.filter(item => item.path.includes('/link/status')).length, 0);
});

test('dirty settings keeps form revision and tag settingsRevision snapshot', async () => {
  const requests = [];
  let settingsReads = 0;
  let tagReads = 0;
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', revision: 1, market: 'JP' }], member: { role: 'admin' } });
    if (path.includes('/settings') && options.method === 'PATCH') return json({ error: { message: 'conflict' } }, 409);
    if (path.includes('/settings')) { settingsReads += 1; return json({ settings: { accountId: 'A', revision: settingsReads === 1 ? 2 : 3, profile: { tone: settingsReads === 1 ? 'server' : 'other-change' }, templateRefs: [] } }); }
    if (path.includes('/tags') && options.method === 'PATCH') return json({ tagId: 't', revision: 2 });
    if (path.includes('/tags')) { tagReads += 1; return json({ accountId: 'A', settingsRevision: tagReads === 1 ? 2 : 3, tags: [{ tagId: 't', name: 'tag', enabled: true, default: false, revision: 1 }] }); }
    return json({});
  };
  const dom = page('#x_code=dirty-revision', true, router, { verifier: 'dirty-revision-v' });
  await flush(); await selectFirstAccount(dom);
  const settings = dom.window.document.querySelector('#x-settings form');
  const tags = dom.window.document.querySelector('#x-tags form');
  settings.querySelector('[name="tone"]').value = 'local';
  settings.querySelector('[name="tone"]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  tags.querySelector('[name="value"]').value = 'secret';
  tags.querySelector('button').click();
  await flush();
  settings.querySelector('button').click();
  await flush();
  const patch = requests.find(r => r.path.endsWith('/settings') && r.options.method === 'PATCH');
  const tagPatch = requests.find(r => r.path.includes('/tags/t') && r.options.method === 'PATCH');
  assert.equal(JSON.parse(patch.options.body).expectedRevision, 2);
  assert.equal(JSON.parse(tagPatch.options.body).expectedSettingsRevision, 2);
  assert.equal(settings.querySelector('[name="tone"]').value, 'local');
});

test('product import sends at most the entered rows, shows partial results, and retries only failed rows', async () => {
  const requests = [];
  const importResult = { importId: 'import-1', revision: 0, status: 'partial_success', rows: [
    { row: 1, status: 'needs_completion', productId: 'JP-B012345678', errorCode: 'PRODUCT_ADAPTER_NOT_CONFIGURED' },
    { row: 2, status: 'failed', productId: null, errorCode: 'URL_HOST_NOT_ALLOWED' },
  ] };
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.endsWith('/imports') && options.method === 'POST') return json(importResult);
    if (path.endsWith('/imports/import-1/retry')) return json({ importId: 'import-1', acceptedRows: [1], skippedRows: [2] });
    if (path.endsWith('/imports/import-1')) return json({ ...importResult, revision: 1 });
    return json({});
  };
  const dom = page('#x_code=products-import', true, router, { verifier: 'products-import-v' });
  await flush(); await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-products .x-product-import');
  assert.ok(form);
  form.querySelector('textarea').value = 'https://www.amazon.co.jp/dp/B012345678\nhttps://evil.example/item';
  form.querySelector('button').click(); await flush(); await flush();
  const create = requests.find(request => request.path.endsWith('/imports') && request.options.method === 'POST');
  const body = JSON.parse(create.options.body);
  assert.equal(body.accountId, 'A');
  assert.equal(body.urls.length, 2);
  assert.match(body.clientRequestId, /^[a-f0-9]{64}$/);
  assert.match(dom.window.document.querySelector('#x-products').textContent, /1行目 · needs_completion/);
  const retry = [...dom.window.document.querySelectorAll('#x-products button')].find(button => button.textContent === '失敗・不足行を再試行');
  assert.ok(retry); retry.click(); await flush();
  const retryRequest = requests.find(request => request.path.endsWith('/imports/import-1/retry'));
  assert.deepEqual(JSON.parse(retryRequest.options.body), { rowIds: [1, 2], expectedRevision: 0 });
});

test('product editor binds both revisions, sends only changed manual fields, and preserves input on conflict', async () => {
  const requests = [];
  const item = { product: { productId: 'JP-B012345678', asin: 'B012345678', name: '取得名', features: ['特徴A'], catalogStatus: 'available', revision: 4 }, accountProduct: { accountId: 'A', productId: 'JP-B012345678', enabled: true, operatorNote: '旧メモ', revision: 7 }, readiness: { missing: [], ready: true } };
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'member' } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [item] });
    if (path.includes('/products/JP-B012345678') && options.method === 'PATCH') return json({ error: { message: 'conflict' } }, 409);
    return json({});
  };
  const dom = page('#x_code=products-edit', true, router, { verifier: 'products-edit-v' });
  await flush(); await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-products .x-product form');
  form.querySelector('[name="name"]').value = '手修正名';
  form.querySelector('[name="features"]').value = '特徴A\n特徴B';
  form.querySelector('[name="operatorNote"]').value = '新メモ';
  form.querySelector('[name="sourceNote"]').value = '独自資料で確認';
  form.querySelector('button').click(); await flush();
  const patch = requests.find(request => request.path.includes('/products/JP-B012345678') && request.options.method === 'PATCH');
  const body = JSON.parse(patch.options.body);
  assert.equal(body.expectedRevision, 4);
  assert.equal(body.expectedAccountRevision, 7);
  assert.deepEqual(body.fields.features, ['特徴A', '特徴B']);
  assert.equal(body.fields.name, '手修正名');
  assert.equal(body.sourceNote, '独自資料で確認');
  assert.equal(form.querySelector('[name="name"]').value, '手修正名');
  assert.match(form.textContent, /最新状態を再確認/);
  assert.equal([...dom.window.document.querySelectorAll('#x-products button')].some(button => button.textContent === 'アーカイブ'), false);
});

test('adapter-disabled refresh stays visibly unavailable and does not masquerade as success', async () => {
  const item = { product: { productId: 'JP-B012345678', asin: 'B012345678', catalogStatus: 'input_pending', revision: 0 }, accountProduct: { accountId: 'A', productId: 'JP-B012345678', enabled: true, revision: 0 }, readiness: { missing: ['name', 'features', 'source'], ready: false } };
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [item] });
    if (path.endsWith('/refresh') && options.method === 'POST') return json({ error: { code: 'PRODUCT_ADAPTER_NOT_CONFIGURED', message: 'Request failed' } }, 503);
    return json({});
  };
  const dom = page('#x_code=products-refresh', true, router, { verifier: 'products-refresh-v' });
  await flush(); await selectFirstAccount(dom);
  const refresh = [...dom.window.document.querySelectorAll('#x-products button')].find(button => button.textContent === '取得を再試行');
  assert.ok(refresh); refresh.click(); await flush();
  assert.match(dom.window.document.querySelector('#x-products').textContent, /実商品取得adapterはまだ未接続/);
});

test('full app history back from X redraws the same legacy page and reloads once', async () => {
  const pending = deferred(); const requests = [];
  const dom = fullAppPage('#tasks', (url, options = {}) => {
    requests.push(String(url));
    if (String(url).endsWith('/auth/verify')) return json({ user: { login: 'u' } });
    if (String(url).endsWith('/api/dashboard-data')) return pending.promise;
    return json({});
  }, { jwt: jwt(), search: '?api=https://legacy.example' });
  await flush();
  dom.window.location.hash = 'xentry'; await flush();
  dom.window.history.back(); await flush();
  pending.resolve(json({ registry: [], tasks: [], sources: [], settings: {} }));
  await flush();
  assert.equal(dom.window.location.hash, '#tasks');
  assert.equal(dom.window.document.getElementById('page-tasks').classList.contains('active'), true);
  assert.equal(requests.filter(url => url.endsWith('/api/dashboard-data')).length, 2);
});

test('legacy deferred auth/data responses cannot overwrite X entry', async () => {
  for (const phase of ['auth', 'dashboard']) for (const outcome of [200, 401, 403, 'reject']) {
    const gate = deferred(); const requests = []; const legacyToken = `legacy-${phase}-${outcome}`;
    const dom = fullAppPage('#tasks', (url) => {
      const path = String(url); requests.push(path);
      if (path.endsWith('/auth/verify')) return phase === 'auth' ? gate.promise : json({ user: { login: 'u' } });
      if (path.endsWith('/api/dashboard-data')) return phase === 'dashboard' ? gate.promise : json({});
      return json({});
    }, { jwt: legacyToken, search: '?api=https://legacy.example' });
    await flush();
    const dashboardBeforeX = requests.filter(path => path.endsWith('/api/dashboard-data')).length;
    dom.window.document.getElementById('x-affiliate-entry').click();
    if (outcome === 'reject') gate.reject(new Error('offline'));
    else gate.resolve(json(outcome === 403 ? { error: 'denied' } : {}, outcome));
    await flush();
    assert.match(dom.window.document.getElementById('page-x-affiliate').textContent, /利用停止中/);
    assert.equal(dom.window.localStorage.getItem('dash-jwt'), legacyToken);
    assert.equal(requests.filter(path => path.endsWith('/api/dashboard-data')).length, dashboardBeforeX);
    dom.window.close();
  }
});

const skillFixture = () => ({
  id: 'text-amazon-hook-fixed', version: '1.0.0', status: 'active', priority: 30, revision: 0,
  body: '# 構成テンプレート\n本文', validationScope: 'synthetic_only',
  angles: [{ id: 'feature', label: '確認済みの特徴' }],
  example: { angleId: 'feature', productIds: ['fixture-p1'], blocks: [
    { kind: 'hook', text: '机の配線、気にならない？Amazonで見つけた整理用品の気になる1品', factRefs: [] },
    { kind: 'product_fact', text: '合成商品は整理に使える', factRefs: ['f1'] },
  ] },
  exampleValidation: { valid: true, errors: [] }, assignment: { enabled: false, priority: null, revision: 0 }, usage: { enabledAccountCount: 2 },
});

test('Skill catalog shows all adoption decisions and imports only through an admin action', async () => {
  const requests = []; let imported = false;
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.endsWith('/skills/import')) { imported = true; return json({ imported: ['text-amazon-hook-fixed'], candidateCount: 11 }); }
    if (path.includes('/skills?')) return json({ imported, source: { repository: 'hachi-aff', commit: 'fixed-commit' }, candidates: [
      { id: 'text-amazon-hook-fixed', decision: 'adopt', reason: '合成構造検証済み' },
      { id: 'text-sale-alert', decision: 'hold', reason: '価格条件が未整備' },
      { id: 'text-fashion-room', decision: 'exclude', reason: 'Amazon用途外' },
    ], skills: imported ? [skillFixture()] : [] });
    return json({});
  };
  const dom = page('#x_code=skill-import', true, router, { verifier: 'skill-import-v' });
  await flush(); await selectFirstAccount(dom);
  const skillBox = dom.window.document.getElementById('x-skills');
  assert.match(skillBox.textContent, /候補11件の採用・保留理由/);
  assert.match(skillBox.textContent, /価格条件が未整備/);
  const importButton = [...skillBox.querySelectorAll('button')].find(button => button.textContent === '採用候補5件を取り込む');
  assert.ok(importButton); importButton.click(); await flush();
  const request = requests.find(item => item.path.endsWith('/skills/import'));
  assert.ok(request); assert.match(JSON.parse(request.options.body).idempotencyKey, /^[a-f0-9]{64}$/);
  assert.match(skillBox.textContent, /text-amazon-hook-fixed @ 1.0.0/);
});

test('member can change only the account Skill assignment and conflict keeps inputs', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'member' } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.includes('/assignment')) return json({ error: { message: 'conflict' } }, 409);
    if (path.includes('/skills?')) return json({ imported: true, source: {}, candidates: [], skills: [skillFixture()] });
    return json({});
  };
  const dom = page('#x_code=skill-member', true, router, { verifier: 'skill-member-v' });
  await flush(); await selectFirstAccount(dom);
  const skill = dom.window.document.querySelector('#x-skills .x-skill');
  assert.equal(skill.querySelectorAll('form[data-admin-only]').length, 0);
  const form = skill.querySelector('form');
  form.querySelector('[name="enabled"]').checked = true;
  form.querySelector('[name="priority"]').value = '72';
  form.querySelector('button').click(); await flush();
  const request = requests.find(item => item.path.includes('/assignment'));
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.fields, { enabled: true, priority: 72 }); assert.equal(body.expectedRevision, 0); assert.equal(body.accountId, 'A');
  assert.equal(form.querySelector('[name="priority"]').value, '72'); assert.match(form.textContent, /最新状態を再確認/);
});

test('Skill assignment reload preserves another dirty editor and its original revision', async () => {
  const requests = []; let skillReads = 0;
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.includes('/assignment')) return json({ assignment: { enabled: true, priority: null, revision: 1 } });
    if (path.includes('/skills/text-amazon-hook-fixed') && options.method === 'PATCH') return json({ error: { message: 'revision conflict' } }, 409);
    if (path.includes('/skills?')) { skillReads += 1; return json({ imported: true, source: {}, candidates: [], skills: [{ ...skillFixture(), revision: skillReads > 1 ? 1 : 0 }] }); }
    return json({});
  };
  const dom = page('#x_code=skill-draft', true, router, { verifier: 'skill-draft-v' });
  await flush(); await selectFirstAccount(dom);
  const skill = dom.window.document.querySelector('#x-skills .x-skill');
  const forms = skill.querySelectorAll('form[data-admin-only]');
  const versionForm = forms[1]; const assignment = skill.querySelector('form:not([data-admin-only])');
  versionForm.querySelector('[name="body"]').value = '編集中の本文';
  versionForm.querySelector('[name="body"]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assignment.querySelector('[name="enabled"]').checked = true;
  assignment.querySelector('button').click(); await flush();
  const nextVersionForm = dom.window.document.querySelectorAll('#x-skills .x-skill form[data-admin-only]')[1];
  assert.equal(nextVersionForm.querySelector('[name="body"]').value, '編集中の本文');
  const body = JSON.parse(requests.find(item => item.path.includes('/assignment')).options.body);
  assert.equal(body.expectedRevision, 0);
  nextVersionForm.querySelector('[name="version"]').value = '1.1.0';
  nextVersionForm.querySelector('button').click(); await flush();
  const versionRequest = requests.find(item => item.path.includes('/skills/text-amazon-hook-fixed') && item.options.method === 'PATCH');
  assert.equal(JSON.parse(versionRequest.options.body).expectedRevision, 0);
  assert.equal(nextVersionForm.querySelector('[name="body"]').value, '編集中の本文');
});

test('late preview response is discarded after preview input changes', async () => {
  const gate = deferred();
  const router = (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'member' } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.includes('/skills?')) return json({ imported: true, source: {}, candidates: [], skills: [skillFixture()] });
    if (path.endsWith('/skill-allocation-previews')) return gate.promise;
    return json({});
  };
  const dom = page('#x_code=skill-preview-late', true, router, { verifier: 'skill-preview-late-v' });
  await flush(); await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-skills .x-skill-preview-form');
  form.querySelector('[name="productIds"]').value = 'p1'; form.querySelector('[name="requestedVariantCount"]').value = '1';
  form.querySelector('button').click(); await flush();
  form.querySelector('[name="productIds"]').value = 'p2';
  form.querySelector('[name="productIds"]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  gate.resolve(json({ status: 'ready', productionReady: false, allocations: [] })); await flush();
  assert.equal(dom.window.document.querySelector('#x-skills .x-skill-preview'), null);
});

test('admin Skill body edit always creates a named version with its matching structure example', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'admin' } });
    if (path.endsWith('/members')) return json({ members: [] });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.includes('/skills/text-amazon-hook-fixed') && options.method === 'PATCH') return json({ skill: { version: '1.1.0' }, revision: 1 });
    if (path.includes('/skills?')) return json({ imported: true, source: {}, candidates: [], skills: [skillFixture()] });
    return json({});
  };
  const dom = page('#x_code=skill-version', true, router, { verifier: 'skill-version-v' });
  await flush(); await selectFirstAccount(dom);
  const forms = dom.window.document.querySelectorAll('#x-skills .x-skill form[data-admin-only]');
  const form = forms[1]; assert.ok(form);
  assert.match(dom.window.document.querySelector('#x-skills .x-skill').textContent, /利用中の2 account/);
  form.querySelector('[name="version"]').value = '1.1.0';
  form.querySelector('[name="body"]').value += '\n更新';
  form.querySelector('button').click(); await flush();
  const request = requests.find(item => item.path.includes('/skills/text-amazon-hook-fixed') && item.options.method === 'PATCH');
  const body = JSON.parse(request.options.body);
  assert.equal(body.expectedRevision, 0); assert.equal(body.fields.version, '1.1.0'); assert.match(body.fields.body, /更新/); assert.equal(body.fields.example.angleId, 'feature');
});

test('allocation preview shows the exact Skill and does not call a generation endpoint', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ accounts: [{ accountId: 'A', label: 'A', market: 'JP' }], member: { role: 'member' } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'A', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ tags: [] });
    if (path.includes('/products?')) return json({ products: [] });
    if (path.includes('/skills?')) return json({ imported: true, source: {}, candidates: [], skills: [skillFixture()] });
    if (path.endsWith('/skill-allocation-previews')) return json({ status: 'ready', productionReady: false, allocations: [{ variantId: 'variant-1', skillId: 'text-amazon-hook-fixed', skillVersion: '1.0.0', angleId: 'feature', factRefs: ['f1'] }] });
    return json({});
  };
  const dom = page('#x_code=skill-preview', true, router, { verifier: 'skill-preview-v' });
  await flush(); await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-skills .x-skill-preview-form');
  form.querySelector('[name="productIds"]').value = 'JP-B012345678';
  form.querySelector('[name="requestedVariantCount"]').value = '1';
  form.querySelector('button').click(); await flush();
  const request = requests.find(item => item.path.endsWith('/skill-allocation-previews'));
  assert.deepEqual(JSON.parse(request.options.body).productIds, ['JP-B012345678']);
  assert.match(form.textContent, /text-amazon-hook-fixed@1.0.0/);
  assert.match(form.textContent, /productionReady=false/);
  assert.equal(requests.some(item => item.path.includes('/generation-jobs')), false);
});

test('L4 generation form keeps variant count separate and sends one grouped request', async () => {
  const requests = [];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ apiVersion: 'x-affiliate/v1', accounts: [{ accountId: 'a1', label: 'A', market: 'JP', enabled: true, revision: 0 }], member: { role: 'member', accountIds: ['a1'] } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'a1', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ accountId: 'a1', tags: [] });
    if (path.includes('/products')) return json({ products: [] });
    if (path.includes('/skills')) return json({ imported: false, skills: [], candidates: [] });
    if (path.endsWith('/generations')) return json({ job: { status: 'completed' }, draftIds: ['d1', 'd2'] });
    if (path.includes('/drafts?')) return json({ drafts: [] });
    return json({});
  };
  const dom = page('#x_code=l4', true, router, { verifier: 'l4-v' }); await flush(); await selectFirstAccount(dom);
  const form = dom.window.document.querySelector('#x-drafts .x-generation-form'); assert.ok(form);
  form.elements.productIds.value = 'p1,p2'; form.elements.requestedVariantCount.value = '2'; form.querySelector('button').click(); await flush();
  const request = requests.find(item => item.path.endsWith('/api/x-affiliate/generations')); assert.ok(request); const body = JSON.parse(request.options.body);
  assert.deepEqual(body.productIds, ['p1', 'p2']); assert.equal(body.requestedVariantCount, 2); assert.equal(typeof body.idempotencyKey, 'string');
});

test('L4 comparison shows grouped drafts and review uses the displayed revision', async () => {
  const requests = []; const drafts = [{ draftId: 'd1', generationGroupId: 'g1', variantId: 'variant-1', state: 'needs_review', skillId: 's1', skillVersion: '1.0.0', angleId: 'a1', productIds: ['p1'], revision: 4, validation: { ok: true, errors: [] }, body: '本文\nhttps://www.amazon.co.jp/dp/B012345678?tag=x-22\n#PR' }, { draftId: 'd2', generationGroupId: 'g1', variantId: 'variant-2', state: 'needs_review', skillId: 's2', skillVersion: '1.0.0', angleId: 'a2', productIds: ['p1'], revision: 7, validation: { ok: false, errors: ['fact_ref_invalid'] }, body: '作業版\n#PR' }];
  const router = (url, options = {}) => {
    const path = String(url); requests.push({ path, options });
    if (path.endsWith('/exchange')) return json({ token: jwt() });
    if (path.endsWith('/context')) return json({ apiVersion: 'x-affiliate/v1', accounts: [{ accountId: 'a1', label: 'A', market: 'JP', enabled: true, revision: 0 }], member: { role: 'member', accountIds: ['a1'] } });
    if (path.includes('/settings')) return json({ settings: { accountId: 'a1', revision: 0, profile: {}, templateRefs: [] } });
    if (path.includes('/tags')) return json({ accountId: 'a1', tags: [] });
    if (path.includes('/products')) return json({ products: [] });
    if (path.includes('/skills')) return json({ imported: false, skills: [], candidates: [] });
    if (path.includes('/drafts?')) return json({ drafts });
    if (path.includes('/drafts/d1/review')) return json({ ...drafts[0], state: 'approved', revision: 5 });
    return json({});
  };
  const dom = page('#x_code=l4-review', true, router, { verifier: 'l4-review-v' }); await flush(); await selectFirstAccount(dom);
  const cards = dom.window.document.querySelectorAll('#x-drafts .x-draft'); assert.equal(cards.length, 2); assert.match(cards[1].textContent, /fact_ref_invalid/);
  const approve = [...cards[0].querySelectorAll('button')].find(button => button.textContent === '採用'); approve.click(); await flush();
  const request = requests.find(item => item.path.includes('/drafts/d1/review')); assert.ok(request); const body = JSON.parse(request.options.body); assert.equal(body.expectedRevision, 4); assert.equal(body.entrypoint, 'public');
  const invalidApprove = [...cards[1].querySelectorAll('button')].find(button => button.textContent === '採用'); assert.equal(invalidApprove.disabled, true);
});
