// Resilience tests: the things that go wrong on real pages and slow networks.
//
//   node test/resilience.mjs
//
// 1. waitFor: a slow but moving upload never times out; a stuck one does.
// 2. A page that comes up broken the first time → the job reloads it and succeeds.
// 3. A file input that gets re-rendered and drops the first files → attached on the 2nd try.
// 4. The platform rejects the file → error quotes the platform's own message, no pointless retry.
// 5. Not logged in → says so, no retry.
//
// Env: CHROME_PATH, PLAYWRIGHT (as in e2e.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X_PAGE } from './mocks.mjs';
import * as M2 from './mocks2.mjs';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '../extension');
const OUT = join(tmpdir(), 'oloop-resilience');
mkdirSync(OUT, { recursive: true });
const PNG = join(OUT, 'a.png');
writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`);
};
const html = (body) => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
const launch = () =>
  chromium.launchPersistentContext('', {
  locale: process.env.LOCALE || 'zh-CN',
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });

// --- 1. waitFor semantics, straight in a page with a stubbed runtime -------------
async function waitForSemantics() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent('<p>x</p>');
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({}) } };
  });
  await page.evaluate(readFileSync(join(EXT, 'content/core.js'), 'utf8'));
  const r = await page.evaluate(async () => {
    OL.phase = 'finishing';
    const t0 = Date.now();
    // Progress moves every 300 ms for 2.5 s; no-progress timeout is 1 s.
    const moving = await OL.waitFor(() => Date.now() - t0 > 2500, {
      timeout: 1000, interval: 100, progress: () => String(Math.floor((Date.now() - t0) / 300)),
    }).then(() => 'ok', (e) => e.message);
    const t1 = Date.now();
    // Progress stops after 0.5 s → should give up about 1 s later.
    const stuck = await OL.waitFor(() => false, {
      timeout: 1000, interval: 100, progress: () => String(Math.min(Math.floor((Date.now() - t1) / 250), 2)),
    }).then(() => 'ok', (e) => ({ code: e.code, after: Date.now() - t1 }));
    return { moving, stuck };
  });
  check('waitFor: slow but moving progress outlives the timeout', r.moving === 'ok', JSON.stringify(r.moving));
  check('waitFor: stuck progress times out', r.stuck.code === 'timeout' && r.stuck.after < 2500, JSON.stringify(r.stuck));
  await browser.close();
}

// --- helper: publish one draft to one platform and wait for the outcome -----------
async function publishOnce({ platform, routes, autoSend = false, timeout = 200000, after }) {
  const ctx = await launch();
  for (const [pattern, handler] of Object.entries(routes)) await ctx.route(pattern, handler);
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel/sidepanel.html`);
  await panel.setInputFiles('#file-input', [PNG]);
  await panel.waitForFunction(() => document.querySelectorAll('#media-grid .thumb').length === 1);
  await panel.fill('#title', '标题');
  await panel.fill('#text', '弹性测试 resilience');
  for (const id of ['x', 'instagram']) if (id !== platform) await panel.click(`.tile[data-platform="${id}"]`);
  if (!['x', 'instagram'].includes(platform)) await panel.click(`.tile[data-platform="${platform}"]`);
  if (autoSend) await panel.click('#auto-send');
  await panel.click('#publish');
  const t0 = Date.now();
  let job;
  for (;;) {
    const run = await panel.evaluate(() => chrome.storage.session.get('run').then((r) => r.run));
    job = run?.jobs[0];
    if (job && ['done', 'error', 'unknown', 'ready'].includes(job.status) && !(job.status === 'ready' && autoSend)) break;
    if (Date.now() - t0 > timeout) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const page = ctx.pages().find((p) => !p.url().startsWith('chrome-extension') && p.url() !== 'about:blank');
  const posted = page ? await page.evaluate(() => ({ posted: window.__posted, log: window.__log })).catch(() => ({})) : {};
  const extra = after ? await after(panel, job) : {};
  await ctx.close();
  return { job, ...posted, ...extra, secs: Math.round((Date.now() - t0) / 1000) };
}

// --- 2. broken first load → reload → success -------------------------------------
async function flakyFirstLoad() {
  let hits = 0;
  const r = await publishOnce({
    platform: 'threads',
    routes: {
      'https://www.threads.com/**': (route) =>
        route.fulfill(html(++hits === 1 ? '<!doctype html><body><div>Loading…</div></body>' : M2.THREADS_PAGE)),
    },
  });
  check('flaky page: reloaded and finished', r.job?.status === 'ready' && r.job?.attempts === 2, `${r.job?.status} attempts=${r.job?.attempts} (${r.secs}s) ${r.job?.message}`);
}

// --- 3. re-rendered file input drops the first files ------------------------------
async function rerenderedInput() {
  const page = X_PAGE.replace(
    "document.querySelector('[data-testid=fileInput]').addEventListener('change',async e=>{",
    `let firstChange=true;
document.querySelector('[data-testid=fileInput]').addEventListener('change',async e=>{
  if(firstChange){firstChange=false;__log.push('dropped-first');const old=e.target,fresh=old.cloneNode();old.replaceWith(fresh);fresh.addEventListener('change',arguments.callee);return}`,
  );
  // arguments.callee doesn't exist in arrow functions: re-register the handler by name instead.
  const fixed = page.replace('async e=>{\n  if(firstChange)', 'async function onFiles(e){\n  if(firstChange)').replace('fresh.addEventListener(\'change\',arguments.callee)', "fresh.addEventListener('change',onFiles)");
  const r = await publishOnce({ platform: 'x', autoSend: true, routes: { 'https://x.com/**': (route) => route.fulfill(html(fixed)) } });
  check('re-rendered input: files attached on the second try', r.job?.status === 'done' && r.log?.includes('dropped-first') && r.posted?.files?.length === 1, `${r.job?.status} (${r.secs}s) ${r.job?.message}`);
}

// --- 4. platform rejects the file ----------------------------------------------------
async function rejectedFile() {
  const page = M2.PINTEREST_PAGE.replace(
    "$('storyboard-upload-input').onchange=e=>{file=e.target.files[0];",
    "$('storyboard-upload-input').onchange=e=>{file=e.target.files[0];document.body.insertAdjacentHTML('beforeend','<div role=\"alert\">Image is too small. Please use an image at least 200 x 300 pixels.</div>');return;",
  );
  const r = await publishOnce({ platform: 'pinterest', routes: { 'https://www.pinterest.com/**': (route) => route.fulfill(html(page)) } });
  check(
    'rejected file: quotes the platform, no retry',
    r.job?.status === 'error' && /平台提示：Image is too small/.test(r.job?.message || '') && !r.job?.attempts,
    `${r.job?.status} attempts=${r.job?.attempts || 1} (${r.secs}s) ${r.job?.message}`,
  );
}

// --- 5. not logged in -----------------------------------------------------------------
async function loggedOut() {
  const page = '<!doctype html><body><h1>Log in to Threads</h1><input name="username"><input type="password"><button>Log in</button></body>';
  // After the error, press 重试 in the panel: the same tab starts over and fails the same way.
  const after = async (panel) => {
    await panel.evaluate(() => {
      window.__statuses = [];
      chrome.storage.session.onChanged.addListener((c) => {
        const j = c.run?.newValue?.jobs[0];
        if (j && j.status !== window.__statuses.at(-1)) window.__statuses.push(j.status);
      });
    });
    await panel.click('[data-retry]');
    const statuses = await panel
      .waitForFunction(() => window.__statuses.length > 1 && window.__statuses.at(-1) === 'error' && window.__statuses, null, { timeout: 60000 })
      .then((h) => h.jsonValue(), () => panel.evaluate(() => window.__statuses));
    return { retried: statuses, tabs: panel.context().pages().filter((p) => p.url().includes('threads')).length };
  };
  const r = await publishOnce({ platform: 'threads', after, routes: { 'https://www.threads.com/**': (route) => route.fulfill(html(page)) } });
  check('logged out: says so, no retry', r.job?.status === 'error' && /未登录/.test(r.job?.message || '') && !r.job?.attempts, `${r.job?.status} (${r.secs}s) ${r.job?.message}`);
  check('manual retry: same tab starts over', r.retried?.some((s) => s !== 'error') && r.tabs === 1, `${r.retried} tabs=${r.tabs}`);
}

await waitForSemantics();
await Promise.all([flakyFirstLoad(), rerenderedInput(), rejectedFile(), loggedOut()]);
process.exit(failed ? 1 : 0);
