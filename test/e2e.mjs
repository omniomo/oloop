// End-to-end test: loads the extension into Chrome, routes every platform's
// compose page to a mock (mocks.mjs, mocks2.mjs), publishes one draft to all
// eight platforms at once, plays the user where a click is needed, and checks
// what each page received: text, title, file bytes and order, cover, settings.
//
//   npm i -D playwright && npx playwright install chromium
//   node test/e2e.mjs            # auto-send on (BETA platforms still wait for the "user")
//   node test/e2e.mjs manual     # fill only; the test presses every send button
//
// Env: CHROME_PATH (optional browser binary), PLAYWRIGHT (module path override).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X_PAGE, IG_PAGE, YT_PAGE, YT_REDIRECT } from './mocks.mjs';
import * as M2 from './mocks2.mjs';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;

const MODE = process.argv[2] || 'auto';
const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '../extension');
const OUT = join(tmpdir(), 'oloop-e2e');
mkdirSync(OUT, { recursive: true });

// Two real images, a cover, and a 20 MB "video" (random bytes) so the chunked
// transfer (8 MB per message) is exercised. The mocks never decode the video.
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const JPG_1x1 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const write = (name, buf) => (writeFileSync(join(OUT, name), buf), join(OUT, name));
const MEDIA = [write('a.png', Buffer.from(PNG_1x1, 'base64')), write('b.jpg', Buffer.from(JPG_1x1, 'base64')), write('clip.mp4', randomBytes(20 * 1024 * 1024))];
const COVER = write('cover.png', Buffer.from(PNG_1x1, 'base64').reverse().reverse()); // same bytes, own file
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const [SHA_A, SHA_B, SHA_V] = MEDIA.map(sha);
const SHA_COVER = sha(COVER);

const TITLE = '京都咖啡馆 Vlog';
const TEXT = '周末去了京都的咖啡馆 ☕️\n\n第二段：光线很好。\nhttps://omo.example.com/kyoto #oloop';
const LINK = 'https://omo.example.com/kyoto';

const ctx = await chromium.launchPersistentContext('', {
  locale: process.env.LOCALE || 'zh-CN',
  executablePath: process.env.CHROME_PATH || undefined,
  headless: !process.env.HEADFUL, // HEADFUL=1 (e.g. under xvfb-run) gives real hidden background tabs
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  viewport: { width: 1280, height: 900 },
});

const html = (body) => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
const ROUTES = {
  'https://x.com/**': X_PAGE,
  'https://www.instagram.com/**': IG_PAGE,
  'https://www.youtube.com/upload': YT_REDIRECT,
  'https://studio.youtube.com/**': YT_PAGE,
  'https://www.threads.com/**': M2.THREADS_PAGE,
  'https://www.tiktok.com/**': M2.TIKTOK_PAGE,
  'https://www.pinterest.com/**': M2.PINTEREST_PAGE,
  'https://note.com/**': M2.NOTE_REDIRECT,
  'https://editor.note.com/**': M2.NOTE_EDITOR,
  'https://blog.naver.com/GoBlogWrite.naver': M2.NAVER_TOP,
  'https://blog.naver.com/PostWriteForm.naver**': M2.NAVER_EDITOR,
  'https://blog.naver.com/PostView.naver**': M2.NAVER_POSTVIEW,
  'https://creator.xiaohongshu.com/**': M2.XHS_PAGE,
  'https://member.bilibili.com/**': M2.BILI_PAGE,
};
for (const [pattern, body] of Object.entries(ROUTES)) await ctx.route(pattern, (r) => r.fulfill(html(body)));

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const errors = [];
ctx.on('page', (p) =>
  p.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) errors.push(`[${p.url().slice(0, 40)}] ${m.text()}`);
  }),
);

const panel = await ctx.newPage();
panel.on('pageerror', (e) => errors.push('[panel] ' + e.message));
await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
await panel.setViewportSize({ width: 400, height: 1000 });

// --- compose the draft like a user would
await panel.setInputFiles('#file-input', MEDIA);
await panel.waitForFunction(() => document.querySelectorAll('#media-grid .thumb').length === 3);
await panel.fill('#title', TITLE);
await panel.fill('#text', TEXT);
// X and Instagram start selected; turn on the other eight.
for (const id of ['threads', 'xiaohongshu', 'tiktok', 'youtube', 'bilibili', 'pinterest', 'note', 'naver']) await panel.click(`.tile[data-platform="${id}"]`);
// 小红书 takes images or one video: the image post by default, the video post in the manual run.
if (MODE === 'manual') {
  await panel.click('[data-settings="xiaohongshu"]');
  await panel.click('.sheet [data-picks] .pick:nth-child(3)');
  await panel.click('.sheet .primary');
}
// YouTube settings sheet: unlisted.
await panel.click('[data-settings="youtube"]');
await panel.click('[data-opt="visibility"] [data-value="UNLISTED"]');
await panel.click('.sheet .primary');
// Boards come from Pinterest's own picker; pretend an earlier run already read them.
await panel.evaluate(() => chrome.storage.local.set({ pinterestBoards: { names: ['Other', 'OMO'], at: Date.now() } }));
await panel.waitForTimeout(100);
await panel.click('[data-settings="pinterest"]');
await panel.click('[data-opt="board"] [data-value="OMO"]');
await panel.fill('[data-opt="link"]', LINK);
// Pinterest takes one item: the first image by default, the video in the manual run.
if (MODE === 'manual') await panel.click('.sheet [data-picks] .pick:nth-child(3)');
await panel.click('.sheet .primary');
// Cover: upload an image.
await panel.click('#cover-row');
await panel.click('[data-cover-mode="image"]');
await panel.setInputFiles('#cover-file', COVER);
await panel.waitForSelector('.sheet .preview img');
await panel.click('.sheet .primary');
await panel.waitForFunction(() => document.querySelector('#cover-row .val')?.textContent === globalThis.OLI18N.t('Image'));
if (MODE === 'auto') await panel.click('#auto-send');
await panel.waitForTimeout(400);
await panel.screenshot({ path: join(OUT, `panel-before-${MODE}.png`), fullPage: true });
console.log('button:', await panel.textContent('#publish'), '| issues:', await panel.textContent('#issues'));

await panel.click('#publish');

// --- watch the run
const URLS = {
  x: 'https://x.com/compose/post', threads: 'https://www.threads.com/', instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp', youtube: 'https://www.youtube.com/upload',
  pinterest: 'https://www.pinterest.com/pin-creation-tool/', note: 'https://note.com/notes/new', naver: 'https://blog.naver.com/GoBlogWrite.naver',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish?source=official', bilibili: 'https://member.bilibili.com/platform/upload/video/frame',
};
const pageFor = (host) => ctx.pages().find((p) => p.url().includes(host));
const readRun = () => panel.evaluate(() => chrome.storage.session.get('run').then((r) => r.run));
const TERMINAL = ['done', 'unknown', 'error', 'cancelled'];
const BETA_CLICKS = {
  threads: ['www.threads.com', '#post'],
  tiktok: ['www.tiktok.com', '#post'],
  pinterest: ['www.pinterest.com', '#pub'],
  note: ['editor.note.com', '#go', '#post'],
  xiaohongshu: ['creator.xiaohongshu.com', '#pub'],
  bilibili: ['member.bilibili.com', '#submit'],
};
const clicked = new Set();
const readyMessages = {};
const reloaded = new Set();

let last = '';
let shot = false;
const t0 = Date.now();
for (;;) {
  const run = await readRun();
  if (!run) {
    if (Date.now() - t0 > 5000) throw new Error('no run; issues = ' + (await panel.textContent('#issues')));
    await new Promise((r) => setTimeout(r, 300));
    continue;
  }
  const line = run.jobs.map((j) => `${j.platform}:${j.status}`).join(' ');
  if (line !== last) {
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${line}`);
    last = line;
  }
  if (!shot && run.jobs.some((j) => j.status === 'ready')) {
    shot = true;
    await panel.waitForTimeout(200);
    await panel.screenshot({ path: join(OUT, `panel-run-${MODE}.png`) });
    await panel.click('.view-switch [data-view="loop"]');
    await panel.waitForTimeout(250);
    await panel.screenshot({ path: join(OUT, `panel-run-loop-${MODE}.png`) });
    await panel.click('.view-switch [data-view="cards"]');
  }
  for (const j of run.jobs) {
    // Test-harness quirk: Playwright can miss the very first request of a tab
    // opened in the background, so it hits the network. Reload such tabs once.
    if (j.status === 'opening' && Date.now() - j.updatedAt > 3000 && !reloaded.has(j.id)) {
      reloaded.add(j.id);
      await sw.evaluate(({ tabId, url }) => chrome.tabs.update(tabId, { url }), { tabId: j.tabId, url: URLS[j.platform] });
    }
    // Play the user: press send where the extension stopped and waits.
    if (j.status === 'ready' && !clicked.has(j.platform)) {
      clicked.add(j.platform);
      readyMessages[j.platform] = j.message;
      const [host, ...sels] = BETA_CLICKS[j.platform] || {
        x: ['x.com', '[data-testid=tweetButton]'], instagram: ['www.instagram.com', '#share'], youtube: ['studio.youtube.com', '#done-button'],
        naver: ['blog.naver.com', null],
      }[j.platform];
      const p = pageFor(host);
      for (const s of sels) {
        if (s) await p.click(s);
        else await p.frameLocator('#mainFrame').locator('#publish').click();
        await p.waitForTimeout(300);
      }
    }
  }
  if (run.jobs.every((j) => TERMINAL.includes(j.status))) break;
  if (Date.now() - t0 > 150000) {
    console.log('TIMEOUT');
    break;
  }
  await new Promise((r) => setTimeout(r, 300));
}

// --- what did each mock receive?
const got = {};
for (const [id, host] of Object.entries({
  x: 'x.com', threads: 'www.threads.com', instagram: 'www.instagram.com', tiktok: 'www.tiktok.com',
  youtube: 'studio.youtube.com', pinterest: 'www.pinterest.com', note: 'editor.note.com', naver: 'blog.naver.com',
  xiaohongshu: 'creator.xiaohongshu.com', bilibili: 'member.bilibili.com',
})) {
  const p = pageFor(host);
  got[id] = p ? await p.evaluate(() => ({ posted: window.__posted, log: window.__log })).catch(() => ({})) : {};
}
const norm = (s) => (s || '').replace(/[\s​]+/g, '');
const shas = (files) => JSON.stringify((files || []).map((f) => f.sha));
let failed = 0;
const check = (name, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
};

const { x, threads, instagram: ig, tiktok, youtube: yt, pinterest: pin, note, naver, xiaohongshu: xhs, bilibili: bili } = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.posted || {}]));
check('X: text, 3 files in order, bytes identical', norm(x.text) === norm(TEXT) && shas(x.files) === JSON.stringify([SHA_A, SHA_B, SHA_V]));
check('X: never clicked while disabled', !got.x.log?.includes('clicked-while-disabled'));
check('Threads: text + 3 files (input created on the fly)', norm(threads.text) === norm(TEXT) && shas(threads.files) === JSON.stringify([SHA_A, SHA_B, SHA_V]));
check('Instagram: caption, original ratio, 3 files', norm(ig.caption) === norm(TEXT) && ig.ratio === 'original' && shas(ig.files) === JSON.stringify([SHA_A, SHA_B, SHA_V]));
check('TikTok: caption replaced the file name', norm(tiktok.caption) === norm(TEXT));
check('TikTok: video bytes + uploaded cover', tiktok.files?.[0]?.sha === SHA_V && tiktok.cover?.sha === SHA_COVER);
check('TikTok: cover saved in the editor; content checks left alone', !!got.tiktok.log?.includes('cover-save') && !got.tiktok.log?.includes('CHECKS-TURNED-ON'));
if (MODE === 'auto') {
  const held = ['x', 'instagram', 'youtube'].filter((p) => clicked.has(p));
  check(`auto-send: X, Instagram, YouTube sent on their own${held.length ? ` (held: ${held.map((p) => `${p} — ${readyMessages[p]}`).join('; ')})` : ''}`, !held.length);
}
check('YouTube: title, description', yt.title === TITLE && norm(yt.description) === norm(TEXT));
check('YouTube: made for kids (default), unlisted', yt.kids === 'VIDEO_MADE_FOR_KIDS_MFK' && yt.visibility === 'UNLISTED');
check('YouTube: video bytes + custom thumbnail', yt.files?.[0]?.sha === SHA_V && yt.thumb?.sha === SHA_COVER);
check('YouTube: waited for the upload', !got.youtube.log?.includes('published-while-uploading'));
check('YouTube: video never went into the thumbnail input', !got.youtube.log?.includes('VIDEO-IN-THUMBNAIL-INPUT'));
check('Pinterest: never touched "Create board"', !got.pinterest.log?.includes('CREATED-BOARD'));
if (MODE === 'manual') {
  check('Pinterest: video Pin (picked), title, description, link, board', pin.title === TITLE && norm(pin.description) === norm(TEXT) && pin.link === LINK && pin.board === 'OMO' && pin.files?.[0]?.sha === SHA_V);
  // Pinterest covers are frames of the video; an uploaded image can't be used (test/covers.mjs picks a frame).
  check('Pinterest: image cover → picker cancelled, noted', !!got.pinterest.log?.includes('cover-cancel') && pin.coverTime == null && /只能用视频里的一帧/.test(readyMessages.pinterest || ''));
} else {
  check('Pinterest: title, description, link, board, first image', pin.title === TITLE && norm(pin.description) === norm(TEXT) && pin.link === LINK && pin.board === 'OMO' && pin.files?.[0]?.sha === SHA_A);
  check('Pinterest: no cover step for an image Pin', !got.pinterest.log?.includes('cover-open'));
}
check('note: survived the redirect; title, body, 見出し画像 = cover', note.title === TITLE && norm(note.body) === norm(TEXT) && note.header?.sha === SHA_COVER);
check('Naver: in iframe; title, body, 2 images only', norm(naver.title) === norm(TITLE) && norm(naver.body) === norm(TEXT) && shas(naver.files) === JSON.stringify([SHA_A, SHA_B]));
check('Naver: dismissed the "continue draft?" popup', !!got.naver.log?.includes('draft-cancel'));
if (MODE === 'manual') {
  check('小红书: video post (picked), title, body, cover (confirmed with 确定)', xhs.kind === 'video' && xhs.title === TITLE && norm(xhs.body) === norm(TEXT) && xhs.files?.[0]?.sha === SHA_V && xhs.cover?.sha === SHA_COVER && got.xiaohongshu.log?.includes('cover-ok'));
} else {
  check('小红书: image post, title, body, 2 images in order', xhs.kind === 'image' && xhs.title === TITLE && norm(xhs.body) === norm(TEXT) && shas(xhs.files) === JSON.stringify([SHA_A, SHA_B]));
}
check('小红书: the visible tab, never the sidebar 「发布笔记」', !got.xiaohongshu.log?.includes('SIDEBAR-CLICKED') && got.xiaohongshu.log?.some((l) => l.startsWith('tab-')));
check('Bilibili: title replaced the file name, tag from #话题', bili.title === TITLE && JSON.stringify(bili.tags) === '["oloop"]');
check('Bilibili: 简介, video bytes, one cover for both ratios (同步, 完成)', norm(bili.desc) === norm(TEXT) && bili.files?.[0]?.sha === SHA_V && bili.cover43?.sha === SHA_COVER && bili.cover169?.sha === SHA_COVER && !!got.bilibili.log?.includes('sync-on') && !!got.bilibili.log?.includes('cover-done'));
check('Bilibili: never submitted before 上传完成', !got.bilibili.log?.includes('SUBMIT-BEFORE-UPLOAD'));
check('Bilibili: ready message asks for 创作声明 (left to the user)', /创作声明/.test(readyMessages.bilibili || ''), readyMessages.bilibili);

const boards = await panel.evaluate(() => chrome.storage.local.get('pinterestBoards').then((r) => r.pinterestBoards?.names));
check('Pinterest: board list read from the picker', JSON.stringify(boards) === JSON.stringify(['Other', 'OMO']));
if (process.env.HEADFUL) console.log('X got files while hidden?', got.x.log?.includes('files-while-hidden') ? 'yes (bad)' : 'no — waited for the front');

const run = await readRun();
// The one expected note: Pinterest can't use an image cover on a video Pin (manual run).
const noted = (j) => /注意|note:|\(nota|remarque|Hinweis|observação|참고|注意：/.test((j.message || '').replace(/[（(]注意：Pinterest 只能用视频里的一帧做封面，已使用默认封面[)）]/, ''));
check('all ten finished as done, with no other notes', run.jobs.length === 10 && run.jobs.every((j) => j.status === 'done' && !noted(j)));
for (const j of run.jobs) console.log(`  ${j.platform.padEnd(9)} ${j.status.padEnd(7)} ${j.url || ''} ${j.message || ''}`);

await panel.bringToFront();
await panel.waitForTimeout(300);
await panel.screenshot({ path: join(OUT, `panel-after-${MODE}.png`) });
if (errors.length) console.log('console:', errors.slice(0, 20));
console.log(`screenshots in ${OUT}`);
await ctx.close();
process.exit(failed ? 1 : 0);
