// 视频号 end to end on a mock of its wujie page, with site access granted the way
// a user would (the copy under test lists the site as a host permission, so
// Chrome grants it at install). Stops at "ready", then plays the user's 发表.
//
//   node test/channels.mjs
//
// Needs ffmpeg on PATH for the clip. Env: CHROME_PATH, PLAYWRIGHT, HEADFUL.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNELS_PAGE, CHANNELS_EMPTY } from './mocks2.mjs';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(tmpdir(), 'oloop-channels');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// The extension as shipped, except that 视频号 is already allowed.
const EXT = join(OUT, 'extension');
cpSync(resolve(HERE, '../extension'), EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...(manifest.host_permissions || []), ...manifest.optional_host_permissions];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));

const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const CLIP = join(OUT, 'clip.webm');
const COVER = join(OUT, 'cover.webp');
ff('-f', 'lavfi', '-i', 'gradients=s=360x640:d=4:r=25:n=3:c0=0xd4a373:c1=0x6b705c:c2=0xffe8d6:speed=0.04', '-pix_fmt', 'yuv420p', '-c:v', 'libvpx', '-b:v', '600k', CLIP);
ff('-f', 'lavfi', '-i', 'color=c=0xfbb040:s=600x800:d=1', '-frames:v', '1', COVER);

const ctx = await chromium.launchPersistentContext('', {
  locale: 'zh-CN',
  executablePath: process.env.CHROME_PATH || undefined,
  headless: !process.env.HEADFUL,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  viewport: { width: 1280, height: 900 },
});
const html = (body) => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
await ctx.route('https://channels.weixin.qq.com/**', (r) => r.fulfill(html(/\/empty\.html/.test(r.request().url()) ? CHANNELS_EMPTY : CHANNELS_PAGE)));

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// The site is allowed, so its scripts are registered.
await new Promise((r) => setTimeout(r, 500));
const registered = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts().then((l) => l.map((s) => s.id)));
check('site allowed → 视频号 scripts registered', registered.includes('channels') && registered.includes('channels-picker'), JSON.stringify(registered));

const panel = await ctx.newPage();
await panel.setViewportSize({ width: 400, height: 900 });
panel.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
await panel.waitForSelector('.tiles');

await panel.setInputFiles('#file-input', [CLIP]);
await panel.waitForFunction(() => document.querySelector('#media-grid .dur'));
await panel.fill('#title', '京都，清晨的咖啡馆！');
await panel.fill('#text', '周末去了京都的咖啡馆，光线很好。#oloop');
await panel.click('#cover-row');
await panel.click('[data-cover-mode="image"]');
await panel.setInputFiles('#cover-file', COVER);
await panel.waitForSelector('.sheet .preview img');
await panel.click('.sheet .primary');
for (const id of ['x', 'instagram', 'channels']) await panel.click(`.tile[data-platform="${id}"]`);
await panel.waitForTimeout(200);
check('视频号 turns on (access already granted)', (await panel.getAttribute('.tile[data-platform="channels"]', 'aria-pressed')) === 'true');

// Its settings: the short title as it will go out, with its count.
await panel.click('[data-settings="channels"]');
const field = await panel.evaluate(() => {
  const row = document.querySelector('.sheet [data-field="title"]').closest('.field-row');
  return { label: row.querySelector('.k').textContent, placeholder: row.querySelector('input').placeholder, count: row.querySelector('.count').textContent };
});
check('settings: 短标题 shows the cleaned title and its count', field.label === '短标题' && field.placeholder === '京都 清晨的咖啡馆' && field.count === '9 / 16', JSON.stringify(field));
const loc = await panel.getAttribute('.sheet [data-opt="showLocation"]', 'aria-checked');
check('settings: location hidden by default', loc === 'false', loc);
await panel.waitForTimeout(700);
await panel.screenshot({ path: join(OUT, 'channels-settings.png') });
await panel.click('.sheet .primary');

await panel.click('#publish');
const readRun = () => panel.evaluate(() => chrome.storage.session.get('run').then((r) => r.run));
const t0 = Date.now();
let run;
let reloaded = false;
for (;;) {
  run = await readRun();
  const j = run?.jobs[0];
  if (j?.status === 'opening' && Date.now() - j.updatedAt > 3000 && !reloaded) {
    reloaded = true;
    await sw.evaluate(({ tabId }) => chrome.tabs.update(tabId, { url: 'https://channels.weixin.qq.com/platform/post/create' }), { tabId: j.tabId });
  }
  if (j && ['ready', 'done', 'unknown', 'error', 'cancelled'].includes(j.status)) break;
  if (Date.now() - t0 > 90000) break;
  await new Promise((r) => setTimeout(r, 300));
}
const job = run?.jobs[0] || {};
check('视频号: ready, asks for 发表', job.status === 'ready' && /发表/.test(job.message || '') && !/注意/.test(job.message || ''), `${job.status} ${job.message}`);

const page = ctx.pages().find((p) => p.url().includes('channels.weixin.qq.com'));
const state = await page.evaluate(() => {
  const sr = document.querySelector('wujie-app').shadowRoot;
  return { log: window.__log, desc: sr.getElementById('desc').innerText, st: sr.getElementById('st').value, place: sr.getElementById('ln').textContent };
});
check('视频号: description pasted, short title cleaned (commas → spaces, ！ dropped)', state.desc === '周末去了京都的咖啡馆，光线很好。#oloop' && state.st === '京都 清晨的咖啡馆', JSON.stringify({ desc: state.desc, st: state.st }));
check('视频号: cover made in the app’s window, uploaded and confirmed', state.log.includes('cover-upload') && state.log.includes('cover-done') && !state.log.includes('cover-wrong-realm') && !state.log.some((l) => l.startsWith('cover-rejected')), JSON.stringify(state.log));
check('视频号: location set to 不显示位置', state.place === '不显示位置', state.place);
check('视频号: 发表 never pressed while uploading', !state.log.includes('PUBLISH-WHILE-DISABLED'));

// The user presses 发表.
await page.evaluate(() => document.querySelector('wujie-app').shadowRoot.getElementById('pub').click());
await page.waitForFunction(() => window.__posted, null, { timeout: 5000 }).catch(() => {});
const posted = await page.evaluate(() => window.__posted);
check('视频号: the cover kept is ours (JPEG)', posted?.cover?.type === 'image/jpeg' && posted?.files?.[0]?.type === 'video/webm', JSON.stringify(posted && { cover: posted.cover?.type, video: posted.files?.[0]?.type }));
const t1 = Date.now();
while (Date.now() - t1 < 15000 && (await readRun())?.jobs[0]?.status !== 'done') await new Promise((r) => setTimeout(r, 300));
check('视频号: done after 发表', (await readRun())?.jobs[0]?.status === 'done');

// Access taken away → scripts dropped, platform turned off.
await sw.evaluate(() => chrome.permissions.remove({ origins: ['https://channels.weixin.qq.com/*'] }).catch(() => false));
await new Promise((r) => setTimeout(r, 800));
const after = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts().then((l) => l.map((s) => s.id)));
// Chrome won't remove a permission the manifest requires; only check when it did.
const removed = !(await sw.evaluate(() => chrome.permissions.contains({ origins: ['https://channels.weixin.qq.com/*'] })));
if (removed) check('access removed → scripts unregistered', !after.includes('channels'), JSON.stringify(after));

await ctx.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
