// Video covers on a real (decodable) clip: a frame picked in the side panel
// lands on Pinterest's filmstrip at that time and goes to TikTok as a JPEG;
// a WebP image cover is stored as JPEG; Bilibili gets its own 4:3 image and
// the frame for 16:9. Stops at "ready", never posts.
//
//   node test/covers.mjs
//
// Needs ffmpeg on PATH for the clip. Env: CHROME_PATH, PLAYWRIGHT, HEADFUL.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIKTOK_PAGE, PINTEREST_PAGE, BILI_PAGE } from './mocks2.mjs';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '../extension');
const OUT = join(tmpdir(), 'oloop-covers');
mkdirSync(OUT, { recursive: true });
const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const CLIP = join(OUT, 'clip.webm');
const WEBP = join(OUT, 'cover.webp');
ff('-f', 'lavfi', '-i', 'gradients=s=360x640:d=6:r=25:n=3:c0=0xd4a373:c1=0x6b705c:c2=0xffe8d6:speed=0.04', '-pix_fmt', 'yuv420p', '-c:v', 'libvpx', '-b:v', '600k', CLIP);
ff('-f', 'lavfi', '-i', 'color=c=0xfbb040:s=360x640:d=1', '-frames:v', '1', WEBP);

const ctx = await chromium.launchPersistentContext('', {
  locale: 'zh-CN',
  executablePath: process.env.CHROME_PATH || undefined,
  headless: !process.env.HEADFUL,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  viewport: { width: 1280, height: 900 },
});
const html = (body) => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
await ctx.route('https://www.tiktok.com/**', (r) => r.fulfill(html(TIKTOK_PAGE)));
await ctx.route('https://www.pinterest.com/**', (r) => r.fulfill(html(PINTEREST_PAGE)));
await ctx.route('https://member.bilibili.com/**', (r) => r.fulfill(html(BILI_PAGE)));

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const panel = await ctx.newPage();
await panel.setViewportSize({ width: 400, height: 900 });
await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
await panel.waitForSelector('.tiles');

const storedCover = () =>
  panel.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('oloop-publisher'); q.onsuccess = () => r(q.result); });
    const rec = await new Promise((r) => { const q = db.transaction('media').objectStore('media').get('cover'); q.onsuccess = () => r(q.result); });
    return { type: rec?.type, name: rec?.name };
  });

// A WebP image cover is kept as JPEG (TikTok, Bilibili and YouTube take JPEG/PNG).
await panel.setInputFiles('#file-input', [CLIP]);
await panel.waitForFunction(() => document.querySelector('#media-grid .dur'));
await panel.fill('#title', 'Kyoto');
await panel.fill('#text', 'Morning light #oloop');
await panel.click('#cover-row');
await panel.click('[data-cover-mode="image"]');
await panel.setInputFiles('#cover-file', WEBP);
await panel.waitForSelector('.sheet .preview img');
const webp = await storedCover();
check('WebP cover stored as JPEG', webp.type === 'image/jpeg' && /\.jpg$/.test(webp.name), JSON.stringify(webp));
await panel.click('.sheet .primary');

// A frame at 3 s of the 6 s clip.
await panel.click('#cover-row');
await panel.click('[data-cover-mode="frame"]');
await panel.waitForFunction(() => document.querySelector('.sheet .preview video')?.readyState >= 2);
await panel.$eval('.scrub', (r) => {
  r.value = '3';
  r.dispatchEvent(new Event('input'));
});
await panel.waitForTimeout(500);
await panel.click('#cover-use');
await panel.waitForFunction(() => document.querySelector('#cover-row .val')?.textContent === '0:03.0');

// Only TikTok and Pinterest (X and Instagram start selected).
for (const id of ['x', 'instagram', 'tiktok', 'pinterest', 'bilibili']) await panel.click(`.tile[data-platform="${id}"]`);

// Bilibili: its own 4:3 image; 16:9 stays on the video cover.
await panel.click('[data-settings="bilibili"]');
await panel.click('[data-cover-row="bilibili"]');
await panel.waitForSelector('.slots [data-slot="16x9"]');
const [chooser] = await Promise.all([panel.waitForEvent('filechooser'), panel.click('[data-slot="4x3"]')]);
await chooser.setFiles(WEBP);
await panel.waitForSelector('.slot:first-child .rm');
const caps = await panel.$$eval('.slot-cap .v', (n) => n.map((x) => x.textContent));
const sizes = await panel.$$eval('.slot-face', (n) => n.map((x) => [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)]));
check('Bilibili sheet: 4:3 has its own image, 16:9 follows the video cover, same height', caps[0] === '图片' && caps[1] === '同视频封面' && Math.abs(sizes[0][1] - sizes[1][1]) <= 1 && sizes[0][0] < sizes[1][0], JSON.stringify({ caps, sizes }));
await panel.screenshot({ path: join(OUT, 'bilibili-covers.png') });
await panel.click('.sheet .primary');
await panel.evaluate(() => chrome.storage.local.set({ pinterestBoards: { names: ['Other', 'OMO'], at: Date.now() } }));
await panel.waitForTimeout(100);
await panel.click('[data-settings="pinterest"]');
await panel.click('[data-opt="board"] [data-value="OMO"]');
await panel.click('.sheet .primary');
await panel.click('#publish');

const readRun = () => panel.evaluate(() => chrome.storage.session.get('run').then((r) => r.run));
const URLS = { tiktok: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp', pinterest: 'https://www.pinterest.com/pin-creation-tool/', bilibili: 'https://member.bilibili.com/platform/upload/video/frame' };
const reloaded = new Set();
const t0 = Date.now();
let run;
for (;;) {
  run = await readRun();
  if (run) {
    for (const j of run.jobs) {
      // Playwright can miss the first request of a background tab; reload it once.
      if (j.status === 'opening' && Date.now() - j.updatedAt > 3000 && !reloaded.has(j.id)) {
        reloaded.add(j.id);
        await sw.evaluate(({ tabId, url }) => chrome.tabs.update(tabId, { url }), { tabId: j.tabId, url: URLS[j.platform] });
      }
    }
    if (run.jobs.every((j) => ['ready', 'done', 'unknown', 'error', 'cancelled'].includes(j.status))) break;
  }
  if (Date.now() - t0 > 90000) {
    console.log('TIMEOUT', JSON.stringify(run?.jobs.map((j) => [j.platform, j.status, j.message])));
    break;
  }
  await new Promise((r) => setTimeout(r, 300));
}
const job = (id) => run.jobs.find((j) => j.platform === id) || {};
const pageFor = (host) => ctx.pages().find((p) => p.url().includes(host));
const state = (host, read) => pageFor(host)?.evaluate(read).catch(() => null);

const pin = await state('www.pinterest.com', () => ({ log: window.__log, at: coverTime, open: !document.getElementById('coverDlg').hidden }));
check('Pinterest: ready, no cover note', job('pinterest').status === 'ready' && !/封面/.test(job('pinterest').message || ''), job('pinterest').message);
check('Pinterest: the filmstrip window sits on the chosen frame (3 s ± 0.2)', !!pin && Math.abs(pin.at - 3) < 0.2 && pin.log.includes('cover-done') && !pin.open, JSON.stringify(pin));

const tt = await state('www.tiktok.com', async () => {
  const img = document.getElementById('coverImg');
  return { log: window.__log, src: img.src.slice(0, 5) };
});
check('TikTok: ready, no cover note', job('tiktok').status === 'ready' && !/封面/.test(job('tiktok').message || ''), job('tiktok').message);
check('TikTok: the frame went in as a JPEG and was saved', !!tt && tt.src === 'blob:' && tt.log.includes('cover-save') && !tt.log.some((l) => l.startsWith('cover-rejected')) && !tt.log.includes('CHECKS-TURNED-ON'), JSON.stringify(tt));

const sent = await panel.evaluate(() => chrome.storage.session.get('run').then((r) => r.run.jobs.find((j) => j.platform === 'bilibili').payload.covers));
check('Bilibili payload: 4:3 slot, no 16:9 slot', sent?.['4x3']?.type === 'image/jpeg' && sent['16x9'] === null, JSON.stringify(sent));
const bili = await state('member.bilibili.com', () => ({ log: window.__log }));
check('Bilibili: ready', job('bilibili').status === 'ready', job('bilibili').message);
// Press 立即投稿 as the user would, to read what the page kept.
await pageFor('member.bilibili.com').click('#submit');
await pageFor('member.bilibili.com').waitForFunction(() => window.__posted, null, { timeout: 5000 }).catch(() => {});
const kept = await state('member.bilibili.com', () => window.__posted);
check('Bilibili: two uploads, sync off; 4:3 = own JPEG, 16:9 = the frame', !!bili && !bili.log.includes('sync-on') && bili.log.includes('cover-upload:43') && bili.log.includes('cover-upload:169') && bili.log.includes('cover-done')
  && kept?.cover43?.name === 'cover.jpg' && /^cover-3/.test(kept?.cover169?.name || ''), JSON.stringify({ log: bili?.log, c43: kept?.cover43?.name, c169: kept?.cover169?.name }));

await ctx.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
