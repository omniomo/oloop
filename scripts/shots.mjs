// Panel screenshots in every language, for the site and the store listing.
//
//   node scripts/shots.mjs [out-dir] [lang ...]     (default: /tmp/oloop-shots, all 9)
//
// Writes <out>/<lang>/{write,pick,post,done,night}.png at 2x. Needs ffmpeg for the
// sample media. Env: CHROME_PATH, PLAYWRIGHT.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const [outArg, ...langArgs] = process.argv.slice(2);
const OUT = outArg || '/tmp/oloop-shots';
const LANGS = langArgs.length ? langArgs : ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'pt'];

const SAMPLE = {
  en: ['Kyoto, an early café', 'Spent the weekend in Kyoto’s cafés. The morning light was perfect.\n\n#oloop #kyoto'],
  'zh-Hans': ['京都，清晨的咖啡馆', '周末去了京都的咖啡馆，光线很好。\n\n#oloop #京都'],
  'zh-Hant': ['京都，清晨的咖啡館', '週末去了京都的咖啡館，光線很好。\n\n#oloop #京都'],
  ja: ['京都、朝のカフェ', '週末は京都のカフェへ。朝の光がきれいでした。\n\n#oloop #京都'],
  ko: ['교토, 아침의 카페', '주말에 교토의 카페에 다녀왔어요. 아침 햇살이 좋았어요.\n\n#oloop #교토'],
  es: ['Kioto, café al alba', 'Fin de semana en los cafés de Kioto. La luz de la mañana era perfecta.\n\n#oloop #kioto'],
  fr: ['Kyoto, café du matin', 'Un week-end dans les cafés de Kyoto. La lumière du matin était parfaite.\n\n#oloop #kyoto'],
  de: ['Kyoto am Morgen', 'Ein Wochenende in Kyotos Cafés. Das Morgenlicht war perfekt.\n\n#oloop #kyoto'],
  pt: ['Kyoto, café cedo', 'Fim de semana nos cafés de Kyoto. A luz da manhã estava perfeita.\n\n#oloop #kyoto'],
};

// Sample media: warm stills and a short vertical clip.
const MEDIA = join(OUT, 'media');
mkdirSync(MEDIA, { recursive: true });
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const IMG_A = join(MEDIA, 'a.jpg'), IMG_B = join(MEDIA, 'b.jpg'), CLIP = join(MEDIA, 'c.webm');
if (!existsSync(IMG_A)) ff('-f', 'lavfi', '-i', 'gradients=s=720x720:c0=0xfbb040:c1=0xef197c:x0=0:y0=0:x1=720:y1=720:d=1', '-frames:v', '1', IMG_A);
if (!existsSync(IMG_B)) ff('-f', 'lavfi', '-i', 'gradients=s=720x900:c0=0xfffdde:c1=0xa2d159:x0=0:y0=900:x1=720:y1=0:d=1', '-frames:v', '1', IMG_B);
if (!existsSync(CLIP)) ff('-f', 'lavfi', '-i', 'gradients=s=360x640:d=4:r=25:n=3:c0=0x0e0e0f:c1=0xfb63da:c2=0xfffdde:speed=0.04', '-pix_fmt', 'yuv420p', '-c:v', 'libvpx', '-b:v', '900k', CLIP);

const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROME_PATH || undefined,
  headless: !process.env.HEADFUL,
  locale: 'en-US',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  viewport: { width: 400, height: 860 },
  deviceScaleFactor: 2,
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 400, height: 860 });
const URL_ = `chrome-extension://${extId}/sidepanel/sidepanel.html`;
await panel.goto(URL_);
await panel.waitForSelector('.tiles');
await panel.setInputFiles('#file-input', [IMG_A, CLIP, IMG_B]);
await panel.waitForFunction(() => document.querySelectorAll('#media-grid .thumb').length === 3);
const pause = (ms = 500) => panel.waitForTimeout(ms);
// The panel saves the draft after a short debounce: wait until the media is in it.
for (let i = 0; i < 50; i++) {
  const n = await panel.evaluate(() => chrome.storage.local.get('draft').then((r) => r.draft?.mediaOrder?.length || 0));
  if (n === 3) break;
  await pause(200);
}

for (const lang of LANGS) {
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  const [title, text] = SAMPLE[lang];
  // Leave the panel first: it saves its own copy of the draft when it unloads.
  await panel.goto('about:blank');
  await sw.evaluate(async ({ lang, title, text }) => {
    await chrome.storage.session.remove('run');
    const { draft } = await chrome.storage.local.get('draft');
    const pick = ['x', 'threads', 'instagram', 'xiaohongshu', 'youtube', 'tiktok', 'pinterest'];
    draft.title = title;
    draft.text = text;
    draft.platforms = Object.fromEntries(Object.keys(draft.platforms).map((id) => [id, pick.includes(id)]));
    draft.options.pinterest = { ...draft.options.pinterest, board: 'Kyoto' };
    await chrome.storage.local.set({ draft, ui: { theme: 'light', view: 'cards', lang } });
  }, { lang, title, text });
  await panel.goto(URL_);
  await panel.waitForSelector('.tiles');
  await pause(700);
  await panel.screenshot({ path: join(dir, 'write.png') });

  await panel.hover('.tile-wrap:has([data-platform="youtube"])');
  await panel.click('[data-settings="youtube"]');
  await panel.waitForSelector('.sheet');
  await pause(700);
  await panel.screenshot({ path: join(dir, 'pick.png') });
  await panel.keyboard.press('Escape');
  await pause(300);

  const now = Date.now();
  const run = (states) => panel.evaluate(({ states, now }) => {
    const t = globalThis.OLI18N.t;
    const msg = {
      done: t('Posted'),
      ready: t('Ready to send'),
      up62: t('Uploading {pct}%', { pct: 62 }),
      up80: t('Uploading {pct}%', { pct: 80 }),
      wait: t('Waiting for {platform} to finish uploading…', { platform: 'TikTok' }) + ' 38%',
      fill: t('Filling in the title and description…'),
      queued: t('Queued'),
    };
    const jobs = states.map(([platform, status, m, url], i) => ({
      id: `j${i}`, platform, status, message: msg[m] || '', url, tabId: 100 + i, updatedAt: now - 1000 * i,
    }));
    return chrome.storage.session.set({ run: { id: 'demo', startedAt: now - 83000, autoSend: false, jobs } });
  }, { states, now });
  await run([
    ['x', 'done', 'done', 'https://x.com/omniomo/status/1'],
    ['threads', 'ready', 'ready'],
    ['instagram', 'filling', 'up62'],
    ['xiaohongshu', 'uploading', 'up80'],
    ['tiktok', 'uploading', 'wait'],
    ['youtube', 'filling', 'fill'],
    ['pinterest', 'queued', 'queued'],
  ]);
  await panel.waitForSelector('.jobs');
  await pause(700);
  await panel.screenshot({ path: join(dir, 'post.png') });

  await run(['x', 'threads', 'instagram', 'xiaohongshu', 'tiktok', 'youtube', 'pinterest'].map((p) => [p, 'done', 'done', p === 'x' ? 'https://x.com/omniomo/status/1' : undefined]));
  await panel.waitForSelector('.hero');
  await pause(900);
  await panel.screenshot({ path: join(dir, 'done.png') });

  await panel.goto('about:blank');
  await sw.evaluate(async (lang) => {
    await chrome.storage.session.remove('run');
    await chrome.storage.local.set({ ui: { theme: 'dark', view: 'cards', lang } });
  }, lang);
  await panel.goto(URL_);
  await panel.waitForSelector('.tiles');
  await pause(700);
  await panel.screenshot({ path: join(dir, 'night.png') });
  console.log(`${lang}: write pick post done night`);
}
await ctx.close();
