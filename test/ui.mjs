// Side panel UI test: day/night themes, cards/loop views, sheets, the frame
// cover picker on a real (decodable) video, the publish payload, and every
// run state — with screenshots of each. No platform pages are involved.
//
//   node test/ui.mjs
//
// Needs ffmpeg on PATH for the sample media. Env: CHROME_PATH, PLAYWRIGHT.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '../extension');
const OUT = join(tmpdir(), 'oloop-ui');
mkdirSync(OUT, { recursive: true });

// Sample media: two warm still images and a 4 s vertical clip.
const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const IMG_A = join(OUT, 'dusk.jpg');
const IMG_B = join(OUT, 'sand.jpg');
const CLIP = join(OUT, 'clip.webm');
ff('-f', 'lavfi', '-i', 'gradients=s=720x720:c0=0xe9c46a:c1=0x9c6644:x0=0:y0=0:x1=720:y1=720:d=1', '-frames:v', '1', IMG_A);
ff('-f', 'lavfi', '-i', 'gradients=s=720x900:c0=0xede0d4:c1=0xb08968:x0=0:y0=900:x1=720:y1=0:d=1', '-frames:v', '1', IMG_B);
ff('-f', 'lavfi', '-i', 'gradients=s=360x640:d=4:r=25:n=3:c0=0xd4a373:c1=0x6b705c:c2=0xffe8d6:speed=0.04', '-pix_fmt', 'yuv420p', '-c:v', 'libvpx', '-b:v', '900k', CLIP);

const ctx = await chromium.launchPersistentContext('', {
  locale: process.env.LOCALE || 'zh-CN',
  executablePath: process.env.CHROME_PATH || undefined,
  headless: !process.env.HEADFUL,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: Number(process.env.SCALE || 1),
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const errors = [];
const panel = await ctx.newPage();
panel.on('pageerror', (e) => errors.push(e.message));
panel.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load/.test(m.text()) && errors.push(m.text()));
await panel.setViewportSize({ width: 400, height: 860 });
await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
await panel.waitForSelector('.tiles');

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const shot = (name) => panel.screenshot({ path: join(OUT, `${name}.png`) });
const settle = () => panel.waitForTimeout(450);

// No blue anywhere: every painted colour of every element, both themes.
const blues = () =>
  panel.evaluate(() => {
    const out = new Set();
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const v of [cs.color, cs.backgroundColor, cs.borderTopColor, cs.fill, cs.stroke]) {
        const m = v && v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
        if (!m || (m[4] != null && Number(m[4]) < 0.05)) continue;
        const [r, g, b] = m.slice(1, 4).map(Number);
        if (b > r + 30 && b > g + 20) out.add(`${el.tagName.toLowerCase()}.${el.className?.baseVal ?? el.className} ${v}`);
      }
    }
    return [...out];
  });

// --- empty, day by default ---------------------------------------------------
check('day mode by default', (await panel.getAttribute('html', 'data-theme')) === 'light');
check('cards view by default: eight platforms, the rest behind 更多', (await panel.$$('.tile')).length === 8 && !(await panel.$('.stage')) && (await panel.textContent('.more-pf')) === '更多' && !(await panel.$('.tile[data-platform="pinterest"]')));
await settle();
await shot('01a-folded-day');
await panel.click('.more-pf');
check('更多 opens all eleven', (await panel.$$('.tile')).length === 11 && (await panel.textContent('.more-pf')) === '收起');
check('every platform shows its logo', (await panel.$$eval('.tile .disc svg path', (ps) => ps.filter((p) => p.getAttribute('d').length > 40).length)) === 10);
check('a blank draft shows no problems yet', (await panel.$$('#issues .issue')).length === 0 && !(await panel.$('.has-issue')) && (await panel.isDisabled('#publish')));
await settle();
await shot('01-empty-day');

// --- compose -----------------------------------------------------------------
await panel.setInputFiles('#file-input', [IMG_A, CLIP, IMG_B]);
await panel.waitForFunction(() => document.querySelectorAll('#media-grid .thumb').length === 3);
await panel.fill('#title', '京都，清晨的咖啡馆');
await panel.fill('#text', '周末去了京都的咖啡馆，光线很好。\n\n#oloop #kyoto');
for (const id of ['tiktok', 'youtube']) await panel.click(`.tile[data-platform="${id}"]`);
await panel.waitForFunction(() => document.querySelector('#media-grid .dur'));
check('video duration badge', (await panel.textContent('#media-grid .dur')) === '0:04');
check('publish counts the platforms', (await panel.textContent('#publish-count')) === '4' && !(await panel.isDisabled('#publish')));

// 视频号 asks for its site on the tap; a refusal leaves it off.
await panel.evaluate(() => {
  window.__asked = [];
  window.__allow = false;
  chrome.permissions.request = async (p) => (window.__asked.push(p.origins.join(',')), window.__allow);
});
await panel.click('.tile[data-platform="channels"]');
await panel.waitForTimeout(150);
const refused = await panel.evaluate(() => ({ asked: window.__asked, on: document.querySelector('.tile[data-platform="channels"]').getAttribute('aria-pressed') }));
await panel.evaluate(() => { window.__allow = true; });
await panel.click('.tile[data-platform="channels"]');
await panel.waitForTimeout(150);
const allowed = await panel.evaluate(() => document.querySelector('.tile[data-platform="channels"]').getAttribute('aria-pressed'));
check('视频号: asks for channels.weixin.qq.com on the tap; off if refused, on if allowed',
  refused.asked[0] === 'https://channels.weixin.qq.com/*' && refused.on === 'false' && allowed === 'true', JSON.stringify({ refused, allowed }));
await panel.click('.tile[data-platform="channels"]');
await panel.waitForTimeout(100);
await settle();
await shot('02-compose-cards-day');

// Drag to reorder: the clip moves to the front.
await panel.dragAndDrop('#media-grid .thumb:nth-child(2)', '#media-grid .thumb:nth-child(1)');
const order = await panel.evaluate(() => chrome.storage.local.get('draft').then((r) => r.draft.mediaOrder.length));
check('drag reorders media', (await panel.$eval('#media-grid .thumb:nth-child(1)', (n) => !!n.querySelector('video'))) && order === 3);

// Either box can stand in for the other: no title → the text's first line.
await panel.fill('#title', '');
await panel.waitForTimeout(100);
check('text alone gives YouTube a title', !(await panel.isDisabled('#publish')) && !(await panel.$$eval('#issues .issue', (n) => n.some((x) => /标题/.test(x.textContent)))));
// Problems show as chips: YouTube with neither.
await panel.fill('#text', '');
await panel.waitForTimeout(100);
const chips = await panel.$$eval('#issues .issue', (n) => n.map((x) => x.textContent));
check('missing title blocks publishing, grouped by problem', (await panel.isDisabled('#publish')) && chips.some((c) => /YouTube.*需要标题/.test(c)), JSON.stringify(chips));
check('platform with a problem is marked', !!(await panel.$('.tile-wrap.has-issue [data-settings="youtube"]')));
await shot('03-compose-issue-day');
await panel.fill('#title', '京都，清晨的咖啡馆');
await panel.fill('#text', '周末去了京都的咖啡馆，光线很好。\n\n#oloop #kyoto');

// --- frame cover picker ---------------------------------------------------------
await panel.click('#cover-row');
await panel.waitForFunction(() => document.querySelector('.sheet .preview video')?.readyState >= 2);
await panel.waitForFunction(() => [...document.querySelectorAll('.strip canvas')].filter((c) => c.getContext('2d').getImageData(30, 35, 1, 1).data[3] > 0).length === 8, null, { timeout: 15000 });
check('cover sheet opens on "pick a frame" with a filmstrip', (await panel.getAttribute('[data-cover-mode="frame"]', 'aria-checked')) === 'true');
await panel.$eval('.scrub', (r) => {
  r.value = '2';
  r.dispatchEvent(new Event('input'));
});
await panel.waitForTimeout(500);
await shot('04-cover-sheet-day');
await panel.click('#cover-use');
await panel.waitForFunction(() => document.querySelector('#cover-row .val')?.textContent === '0:02.0');
await panel.waitForTimeout(300);
const cover = await panel.evaluate(async () => {
  const draft = (await chrome.storage.local.get('draft')).draft;
  const db = await new Promise((r) => { const q = indexedDB.open('oloop-publisher'); q.onsuccess = () => r(q.result); });
  const rec = await new Promise((r) => { const q = db.transaction('media').objectStore('media').get('cover'); q.onsuccess = () => r(q.result); });
  return { mode: draft.cover.mode, time: draft.cover.time, type: rec?.type, size: rec?.size };
});
check('chosen frame stored as a JPEG cover', cover.mode === 'frame' && Math.abs(cover.time - 2) < 0.05 && cover.type === 'image/jpeg' && cover.size > 2000, JSON.stringify(cover));

// --- platform sheet ----------------------------------------------------------------
await panel.click('[data-settings="youtube"]');
await panel.waitForSelector('.sheet');
check('YouTube: made for kids on by default', (await panel.getAttribute('[data-opt="madeForKids"]', 'aria-checked')) === 'true');
check('switch sits inside its row', await panel.$eval('[data-opt="madeForKids"] .switch', (n) => { const r = n.getBoundingClientRect(), g = n.closest('.group').getBoundingClientRect(); return r.width === 36 && r.right <= g.right; }));
check('YouTube: own title follows the draft until typed', (await panel.isVisible('.sheet [data-field="title"] ~ .follow')));
await panel.fill('.sheet [data-field="title"]', '京都 Vlog #1');
check('typing an override hides "follows"', !(await panel.isVisible('.sheet [data-field="title"] ~ .follow')));
await settle();
await shot('05-platform-sheet-day');
await panel.click('.sheet .primary');

// Pinterest board choices come from the picker list, never typed.
await panel.click('.tile[data-platform="pinterest"]');
await panel.evaluate(() => chrome.storage.local.set({ pinterestBoards: { names: ['Kyoto', 'OMO'], at: Date.now() } }));
await panel.waitForTimeout(100);
await panel.click('[data-settings="pinterest"]');
check('Pinterest board is a choice list', (await panel.$$('.sheet [data-opt="board"] .choice')).length === 3 && !(await panel.$('.sheet input[data-opt="board"]')));
await panel.click('[data-opt="board"] [data-value="OMO"]');
check('sheet has no stray text', !(await panel.$eval('.sheet', (n) => [...n.childNodes].some((c) => c.nodeType === 3))));
await settle();
await shot('06-pinterest-sheet-day');
await panel.click('.sheet .primary');

// --- which media each platform gets ------------------------------------------------
await panel.waitForTimeout(150);
const soft = await panel.$$eval('#issues .issue.soft', (n) => n.map((x) => x.textContent));
check('left-out media shows as a soft hint, not a block', soft.some((t) => /Pinterest.*使用 1\/\d+ 个/.test(t)) && !(await panel.isDisabled('#publish')), JSON.stringify(soft));
await panel.click('[data-settings="pinterest"]');
check('Pinterest picker: one chosen, the others dimmed', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 1 && (await panel.$$('.sheet [data-picks] .pick[aria-pressed="false"]')).length === 2);
await panel.click('.sheet [data-picks] .pick:nth-child(3)');
check('Pinterest picker: tapping another swaps it in', (await panel.getAttribute('.sheet [data-picks] .pick:nth-child(3)', 'aria-pressed')) === 'true' && (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 1);
await settle();
await shot('06b-pinterest-media-day');
await panel.click('.sheet .primary');
check('a chosen pick clears the hint', !(await panel.$$eval('#issues .issue', (n) => n.some((x) => /Pinterest/.test(x.textContent)))));
await panel.click('[data-settings="x"]');
check('X takes all three (limit 20)', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 3);
await panel.click('.sheet [data-picks] .pick:nth-child(2)');
check('X: tap to leave one out', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 2);
await panel.click('.sheet .primary');
await panel.click('[data-settings="youtube"]');
check('YouTube: images cannot be picked', (await panel.$$('.sheet [data-picks] .pick:disabled')).length === 2);
await panel.click('.sheet [data-picks] .pick:not(:disabled)');
check('YouTube: the only video cannot be removed', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 1);
await panel.click('.sheet .primary');
await panel.click('.tile[data-platform="naver"]');
await panel.waitForTimeout(100);
check('Naver: videos left out says so', await panel.$$eval('#issues .issue.soft', (n) => n.some((x) => /Naver.*不含视频/.test(x.textContent))));
await panel.click('.tile[data-platform="naver"]');

// 小红书 takes images or one video; B站 wants a tag.
await panel.click('.tile[data-platform="xiaohongshu"]');
await panel.click('[data-settings="xiaohongshu"]');
check('小红书: the clip first means a video post', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 1);
await panel.click('.sheet [data-picks] .pick:nth-child(2)');
check('小红书: tapping an image switches to an image post', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 1 && (await panel.getAttribute('.sheet [data-picks] .pick:nth-child(2)', 'aria-pressed')) === 'true');
await panel.click('.sheet [data-picks] .pick:nth-child(3)');
check('小红书: then add more images', (await panel.$$('.sheet [data-picks] .pick[aria-pressed="true"]')).length === 2);
await settle();
await shot('06c-xiaohongshu-media-day');
await panel.click('.sheet .primary');
await panel.click('.tile[data-platform="bilibili"]');
await panel.waitForTimeout(100);
check('Bilibili: a tag comes from the #话题 in the body', !(await panel.$$eval('#issues .issue', (n) => n.some((x) => /Bilibili.*标签/.test(x.textContent)))));

// --- publish payload (intercepted) --------------------------------------------------
await panel.evaluate(() => {
  const real = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = async (m) => (m.type === 'run:start' ? ((window.__sent = m), { ok: true }) : real(m));
});
await panel.click('#publish');
const sent = await panel.evaluate(() => window.__sent);
const job = (id) => sent.jobs.find((j) => j.platform === id)?.payload;
check('payload: YouTube own title, frame cover, kids, video only', job('youtube').title === '京都 Vlog #1' && job('youtube').cover?.id === 'cover' && job('youtube').options.madeForKids === true && job('youtube').media.length === 1);
check('payload: TikTok + Instagram get the cover, X does not', job('tiktok').cover?.id === 'cover' && job('instagram').cover?.id === 'cover' && job('x').cover === null);
check('payload: Pinterest board by name, the picked image', job('pinterest').options.board === 'OMO' && job('pinterest').media.length === 1 && job('pinterest').media[0].name === 'sand.jpg', JSON.stringify(job('pinterest').media));
check('payload: X without the item left out', job('x').media.length === 2 && !job('x').media.some((m) => m.name === 'dusk.jpg'), JSON.stringify(job('x').media.map((m) => m.name)));
check('payload: X keeps media order (clip first)', job('x').media[0].type.startsWith('video/'));
check('payload: Instagram unaffected by other picks', job('instagram').media.length === 3);
check('payload: 小红书 two images, no cover; Bilibili the video + cover', job('xiaohongshu').media.length === 2 && job('xiaohongshu').cover === null && job('bilibili').media[0].type.startsWith('video/') && job('bilibili').cover?.id === 'cover');

// Title only: every platform's text falls back to it.
await panel.fill('#text', '');
await panel.click('#publish');
const titleOnly = await panel.evaluate(() => window.__sent);
const texts = Object.fromEntries(titleOnly.jobs.map((j) => [j.platform, j.payload.text]));
check('title only: every text is the title (YouTube: its own)', Object.entries(texts).every(([id, s]) => s === (id === 'youtube' ? '京都 Vlog #1' : '京都，清晨的咖啡馆')), JSON.stringify(texts));
// Text only: titles come from its first line, cut to each limit.
await panel.fill('#title', '');
await panel.fill('#text', '周末去了京都的咖啡馆，光线很好，咖啡也好喝，还有一只很亲人的猫。\n\n#oloop #kyoto');
await panel.click('#publish');
const textOnly = await panel.evaluate(() => window.__sent);
const titles = Object.fromEntries(textOnly.jobs.map((j) => [j.platform, j.payload.title]));
check('text only: titles from the first line', titles.xiaohongshu === '周末去了京都的咖啡馆，光线很好' && titles.bilibili === '周末去了京都的咖啡馆，光线很好，咖啡也好喝，还有一只很亲人的猫' && titles.youtube === '京都 Vlog #1' && titles.x === '', JSON.stringify(titles));
await panel.fill('#title', '京都，清晨的咖啡馆');
await panel.fill('#text', '周末去了京都的咖啡馆，光线很好。\n\n#oloop #kyoto');

// --- loop view + night ---------------------------------------------------------
await panel.click('.view-switch [data-view="loop"]');
await panel.waitForSelector('.stage .node');
check('loop view: 11 nodes on the ring', (await panel.$$('.stage .node')).length === 11);
await panel.click('.more-pf');
const folded = await panel.$$eval('.stage .node', (n) => n.map((x) => [x.dataset.platform, x.getAttribute('aria-pressed')]));
check('收起: only folded platforms that are on stay out', folded.length >= 8 && folded.filter(([id]) => ['pinterest', 'note', 'naver'].includes(id)).every(([, on]) => on === 'true'), JSON.stringify(folded));
await panel.click('.more-pf');
await settle();
await shot('07-compose-loop-day');
check('no blue in day mode', (await blues()).length === 0, JSON.stringify((await blues()).slice(0, 5)));

await panel.click('.top .round');
await panel.waitForTimeout(350);
check('menu links to Ko-fi and GitHub Sponsors', JSON.stringify(await panel.$$eval('.menu [data-support]', (n) => n.map((a) => a.href))) === JSON.stringify(['https://ko-fi.com/aerisz', 'https://github.com/sponsors/omniomo']));
await shot('07b-menu-day');
await panel.click('[data-theme-choice="dark"]');
await panel.click('.brand');
check('night mode applies at once', (await panel.getAttribute('html', 'data-theme')) === 'dark');
await settle();
await shot('08-compose-loop-night');
await panel.click('.view-switch [data-view="cards"]');
await settle();
await shot('09-compose-cards-night');
check('no blue in night mode', (await blues()).length === 0, JSON.stringify((await blues()).slice(0, 5)));

await panel.reload();
await panel.waitForSelector('.tiles');
check('theme and view survive a reload', (await panel.getAttribute('html', 'data-theme')) === 'dark' && !!(await panel.$('.tiles')));
check('draft survives a reload', (await panel.inputValue('#title')) === '京都，清晨的咖啡馆' && (await panel.$$('#media-grid .thumb')).length === 3);

// --- languages ------------------------------------------------------------------------
check('follows the browser language (zh-CN → 简体中文)', (await panel.getAttribute('html', 'lang')) === 'zh-Hans' && (await panel.textContent('#publish .word')) === '发布');
const pickLang = async (code) => {
  await panel.click('.top .round');
  await panel.click('#lang-menu');
  await panel.click(`.choice[data-lang="${code}"]`);
  await panel.waitForFunction((c) => document.documentElement.lang === (c === 'auto' ? 'zh-Hans' : c), code);
};
await pickLang('en');
check('English from the menu', (await panel.textContent('#publish .word')) === 'Post' && (await panel.textContent('.platforms .h-sm')).startsWith('Post to'));
await shot('16-compose-cards-night-en');
await pickLang('ja');
check('日本語 from the menu', (await panel.textContent('#publish .word')) === '投稿' && (await panel.textContent('.platforms .h-sm')).startsWith('投稿先'));
await shot('17-compose-cards-night-ja');
await panel.reload();
await panel.waitForSelector('.tiles');
check('the language survives a reload', (await panel.getAttribute('html', 'lang')) === 'ja');
await pickLang('auto');
check('back to automatic', (await panel.textContent('#publish .word')) === '发布');

// --- run states (a fake run written straight into session storage) ------------------
const now = Date.now();
const fakeRun = (overrides) => ({
  id: 'demo', startedAt: now - 83000, autoSend: false,
  jobs: [
    ['x', 'done', '已发布', 'https://x.com/omniomo/status/1'],
    ['threads', 'ready', '等你点发送'],
    ['instagram', 'filling', '上传中 62%'],
    ['xiaohongshu', 'uploading', '上传中 80%'],
    ['tiktok', 'uploading', '等 TikTok 传完视频… 38%'],
    ['youtube', 'filling', '填写标题'],
    ['bilibili', 'uploading', '等 B 站传完视频… 12%'],
    ['pinterest', 'error', '没登录，或登录过期了'],
    ['note', 'queued', ''],
    ['naver', 'opening', ''],
  ].map(([platform, status, message, url], i) => ({
    id: `j${i}`, platform, status, message, url, tabId: 100 + i, updatedAt: now - 1000 * i,
    debug: status === 'error' ? 'diagnostics…' : undefined, ...(overrides?.[platform] || {}),
  })),
});
const showRun = (run) => panel.evaluate((r) => chrome.storage.session.set({ run: r }), run);

await showRun(fakeRun());
await panel.waitForSelector('.jobs');
check('run: attention first (ready, error)', JSON.stringify(await panel.$$eval('.job', (n) => n.slice(0, 2).map((x) => x.dataset.status))) === '["ready","error"]');
check('run: progress ring follows the percentage', await panel.$eval('.job[data-job="instagram"] svg.r circle:last-child', (c) => /^[\d.]+ /.test(c.getAttribute('stroke-dasharray')) && parseFloat(c.getAttribute('stroke-dasharray')) > 80));
check('run: error has retry + diagnostics, ready has 切过去', !!(await panel.$('.job[data-job="pinterest"] [data-retry]')) && !!(await panel.$('.job[data-job="pinterest"] [data-copy]')) && !!(await panel.$('.job[data-job="threads"] [data-focus]')));
check('run: no "clear draft" while publishing', await panel.click('.top .round').then(() => panel.$('#clear-draft')).then((x) => !x));
await panel.click('.brand');
await settle();
await shot('10-run-cards-night');
await panel.click('.view-switch [data-view="loop"]');
await settle();
await shot('11-run-loop-night');

await panel.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
await panel.click('.top .round');
await panel.click('[data-theme-choice="light"]');
await panel.click('.brand');
await settle();
await shot('12-run-loop-day');
await panel.click('.view-switch [data-view="cards"]');
await settle();
await shot('13-run-cards-day');

const allDone = Object.fromEntries(['threads', 'instagram', 'xiaohongshu', 'tiktok', 'youtube', 'bilibili', 'pinterest', 'note', 'naver'].map((p) => [p, { status: 'done', message: '已发布', updatedAt: now }]));
await showRun(fakeRun(allDone));
await panel.waitForSelector('.hero');
check('done: hero says it went out', (await panel.textContent('.hero h1')) === '全部已发布');
await settle();
await shot('14-done-day');
await showRun(fakeRun({ ...allDone, pinterest: { status: 'error', message: '没登录，或登录过期了', updatedAt: now } }));
await panel.waitForFunction(() => document.querySelector('.hero h1')?.textContent === '已结束');
check('done with a failure: count + retry', (await panel.textContent('.hero .big')) === '9/10' && !!(await panel.$('[data-retry]')));
await settle();
await shot('15-done-mixed-day');

await panel.click('#keep-draft').catch(() => {});
await panel.evaluate(() => chrome.storage.session.remove('run'));
await panel.waitForSelector('.tiles');
check('after the run, the draft is still there', (await panel.$$('#media-grid .thumb')).length === 3);

check('no errors in the panel', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${failed ? `${failed} FAILED` : 'all passed'} — screenshots in ${OUT}`);
await ctx.close();
process.exit(failed ? 1 : 0);
