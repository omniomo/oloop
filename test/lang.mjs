// Instagram and Threads in a language Oloop has no words for (Italian): the flow
// has to go by layout. And when a step that reads words times out on such a page,
// the error says the page's language may be why.
//
//   node test/lang.mjs
//
// Env: CHROME_PATH, PLAYWRIGHT, HEADFUL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IG_PAGE } from './mocks.mjs';
import { THREADS_PAGE } from './mocks2.mjs';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '../extension');
const OUT = join(tmpdir(), 'oloop-lang');
mkdirSync(OUT, { recursive: true });

const swap = (page, pairs) => pairs.reduce((s, [a, b]) => s.split(a).join(b), page).replace('<html lang="en">', '<html lang="it">');
const IG_IT = swap(IG_PAGE, [
  ['Create new post', 'Crea nuovo post'], ['aria-label="New post"', 'aria-label="Nuovo post"'], ['<span>Create</span>', '<span>Crea</span>'],
  ['Turn on Notifications', 'Attiva le notifiche'], ['Turn On', 'Attiva'], ['Not Now', 'Non ora'],
  ['Video posts are now shared as reels', 'I post video ora sono condivisi come reel'], ['>OK<', '>Va bene<'],
  ['Select from computer', 'Seleziona dal computer'], ['"Back"', '"Indietro"'], ['>Crop<', '>Ritaglia<'], ['>Next<', '>Avanti<'],
  ['>Edit<', '>Modifica<'], ['>Share<', '>Condividi<'], ['Original', 'Originale'], ['Select crop', 'Seleziona ritaglio'],
  ['Select zoom', 'Seleziona zoom'], ['Open media gallery', 'Apri galleria'], ['Write a caption...', 'Scrivi una didascalia...'],
  ['Your post has been shared.', 'Il tuo post è stato condiviso.'],
]);
const THREADS_IT = swap(THREADS_PAGE, [
  ['<span>New thread</span>', '<span>Nuovo thread</span>'], ['What’s new?', 'Novità?'], ['Empty text field. Type to compose a new post.', 'Campo di testo vuoto'],
  ['Attach media', 'Allega'], ['>Cancel<', '>Annulla<'], ['Add to thread', 'Aggiungi al thread'], ['Post options', 'Opzioni'],
  ['>Post<', '>Pubblica<'], ['<span>Posted</span>', '<span>Pubblicato</span>'],
]);
// No plus icon: nothing Oloop can find the composer by.
const THREADS_IT_NO_PLUS = THREADS_IT.replace(/<path d="M12 2a1 1[^"]*"\/>/, '<circle cx="12" cy="12" r="8"/>').replace('Novità?', 'Scrivi qualcosa');

const IMG = join(OUT, 'a.png');
writeFileSync(IMG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function run(platform, page, { url, wait = 60000 }) {
  const ctx = await chromium.launchPersistentContext('', {
    locale: 'zh-CN',
    executablePath: process.env.CHROME_PATH || undefined,
    headless: !process.env.HEADFUL,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
    viewport: { width: 1280, height: 900 },
  });
  await ctx.route(new URL(url).origin + '/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel/sidepanel.html`);
  await panel.waitForSelector('.tiles');
  await panel.setInputFiles('#file-input', [IMG]);
  await panel.waitForFunction(() => document.querySelectorAll('#media-grid .thumb').length === 1);
  await panel.fill('#text', 'Buongiorno da Kyoto #oloop');
  for (const id of ['x', 'instagram']) await panel.click(`.tile[data-platform="${id}"]`);
  await panel.click(`.tile[data-platform="${platform}"]`);
  await panel.click('#publish');
  const t0 = Date.now();
  let job;
  let reloaded = false;
  for (;;) {
    job = (await panel.evaluate(() => chrome.storage.session.get('run').then((r) => r.run)))?.jobs[0];
    if (job?.status === 'opening' && Date.now() - job.updatedAt > 3000 && !reloaded) {
      reloaded = true;
      await sw.evaluate(({ tabId, url }) => chrome.tabs.update(tabId, { url }), { tabId: job.tabId, url });
    }
    if (job && ['ready', 'done', 'unknown', 'error'].includes(job.status)) break;
    if (Date.now() - t0 > wait) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const tab = ctx.pages().find((p) => p.url().startsWith(new URL(url).origin));
  return { ctx, job: job || {}, tab };
}

// Instagram in Italian: create by the plus, Next/Share by the header, Original by elimination.
{
  const { ctx, job, tab } = await run('instagram', IG_IT, { url: 'https://www.instagram.com/' });
  check('Instagram (it): ready to share', job.status === 'ready', `${job.status} ${job.message}`);
  await tab.click('#share').catch(() => {});
  await tab.waitForFunction(() => window.__posted, null, { timeout: 5000 }).catch(() => {});
  const posted = await tab.evaluate(() => window.__posted).catch(() => null);
  check('Instagram (it): caption in, Original ratio, one image', posted?.caption?.includes('Buongiorno da Kyoto') && posted?.ratio === 'original' && posted?.files?.length === 1, JSON.stringify(posted && { caption: posted.caption, ratio: posted.ratio }));
  await ctx.close();
}

// Threads in Italian: composer by the plus, Post by position.
{
  const { ctx, job, tab } = await run('threads', THREADS_IT, { url: 'https://www.threads.com/' });
  check('Threads (it): ready to post', job.status === 'ready', `${job.status} ${job.message}`);
  await tab.click('#post').catch(() => {});
  await tab.waitForFunction(() => window.__posted, null, { timeout: 5000 }).catch(() => {});
  const posted = await tab.evaluate(() => window.__posted).catch(() => null);
  check('Threads (it): text and image in', posted?.text?.includes('Buongiorno da Kyoto') && posted?.files?.length === 1, JSON.stringify(posted && { text: posted.text, files: posted.files?.length }));
  await ctx.close();
}

// Nothing to go by: the error names the page language.
{
  const { ctx, job } = await run('threads', THREADS_IT_NO_PLUS, { url: 'https://www.threads.com/', wait: 120000 });
  check('Threads (it, no plus): the error says the page language may be why', job.status === 'error' && /it/.test(job.message || '') && /中文或英文/.test(job.message || ''), `${job.status} ${job.message}`);
  await ctx.close();
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
