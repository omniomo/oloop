// Chrome Web Store images: 1280×800 screenshots in every language, the 440×280 small
// promo tile and the 1400×560 marquee.
//
//   node scripts/store-images.mjs [shots-dir] [out-dir]
//   (defaults: /tmp/oloop-shots from scripts/shots.mjs, store/images)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[2] || '/tmp/oloop-shots';
const OUT = process.argv[3] || join(ROOT, 'store/images');
const H = JSON.parse(readFileSync(join(ROOT, 'store/headlines.json'), 'utf8'));
const FONTS = `file://${join(ROOT, 'extension/fonts')}`;
const LOGO = `file://${join(ROOT, 'extension/icons/logo.svg')}`;
const SHOT_NAMES = ['write', 'pick', 'post', 'done', 'night'];

const css = `
@font-face { font-family: 'Funnel Display'; src: url('${FONTS}/FunnelDisplay-latin.woff2'); font-weight: 500 700; }
@font-face { font-family: 'Funnel Sans'; src: url('${FONTS}/FunnelSans-latin.woff2'); font-weight: 300 800; }
* { box-sizing: border-box; margin: 0; }
html { --d: 'Funnel Display', 'Noto Sans CJK SC', sans-serif; --t: 'Funnel Sans', 'Noto Sans CJK SC', sans-serif; }
html:lang(ja) { --d: 'Funnel Display', 'Noto Sans CJK JP', sans-serif; --t: 'Funnel Sans', 'Noto Sans CJK JP', sans-serif; }
html:lang(ko) { --d: 'Funnel Display', 'Noto Sans CJK KR', sans-serif; --t: 'Funnel Sans', 'Noto Sans CJK KR', sans-serif; }
html:lang(zh-Hant) { --d: 'Funnel Display', 'Noto Sans CJK TC', sans-serif; --t: 'Funnel Sans', 'Noto Sans CJK TC', sans-serif; }
body { width: 1280px; height: 800px; overflow: hidden; background: #fff; color: #0a0a0b; font-family: var(--t); -webkit-font-smoothing: antialiased; }
.frame { position: relative; width: 1280px; height: 800px; }
.brand { position: absolute; left: 96px; top: 72px; display: flex; align-items: center; gap: 12px; font: 600 30px/1 var(--d); letter-spacing: -0.05em; }
.brand img { width: 40px; height: 40px; }
.copy { position: absolute; left: 96px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
h1 { font: 600 62px/1.06 var(--d); letter-spacing: -0.045em; text-wrap: balance; }
html:lang(ja) h1, html:lang(ja) p { word-break: auto-phrase; }
html:lang(ko) h1, html:lang(ko) p { word-break: keep-all; }
h1 .soft { color: #a3a3a0; }
p { font-size: 22px; line-height: 1.45; color: #55544f; max-width: 30em; text-wrap: pretty; }
.panel { position: absolute; top: 40px; width: 335px; height: 720px; border-radius: 24px; overflow: hidden; box-shadow: 0 0 0 1px rgba(10,10,11,.09); background: #fff; }
.panel img { width: 100%; height: 100%; display: block; }
.dot { position: absolute; width: 12px; height: 12px; border-radius: 50%; }
`;
const page = (lang, n) => {
  const [a, b] = H[lang][n];
  const shot = (name) => `file://${join(SHOTS, lang, `${name}.png`)}`;
  const panels = n === 4
    ? `<div class="panel" style="right:96px"><img src="${shot('night')}"></div><div class="panel" style="right:451px;top:60px;height:680px;width:316px"><img src="${shot('write')}"></div>`
    : `<div class="panel" style="right:120px"><img src="${shot(SHOT_NAMES[n])}"></div>`;
  const copyWidth = n === 4 ? 'width:430px' : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="frame">
<div class="brand"><img src="${LOGO}">oloop</div>
<div class="copy" style="${copyWidth}">${n === 0 || n === 4 ? `<h1>${a}<br><span class="soft">${b}</span></h1>` : `<h1>${a}</h1><p>${b}</p>`}</div>
${panels}
<span class="dot" style="left:96px;bottom:72px;background:#ef197c"></span><span class="dot" style="left:116px;bottom:72px;background:#fbb040"></span><span class="dot" style="left:136px;bottom:72px;background:#a2d159"></span>
</div></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const tmp = join(OUT, '.tmp.html');
mkdirSync(OUT, { recursive: true });
for (const lang of Object.keys(H)) {
  mkdirSync(join(OUT, lang), { recursive: true });
  for (let n = 0; n < 5; n++) {
    writeFileSync(tmp, page(lang, n));
    await p.goto(`file://${tmp}`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: join(OUT, lang, `${n + 1}-${SHOT_NAMES[n]}.png`) });
  }
  console.log(lang);
}

// Promo tile and marquee: no words but the name, so one image serves every language.
const promo = (w, h, icon, word) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{width:${w}px;height:${h}px;background:#fbb040}.c{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${Math.round(icon * 0.28)}px}
.c img{width:${icon}px;height:${icon}px}.c b{font:600 ${word}px/0.9 var(--d);letter-spacing:-0.05em;color:#0a0a0b}</style></head>
<body><div class="c"><img src="${LOGO}"><b>oloop</b></div></body></html>`;
for (const [name, w, h, icon, word, dir] of [['promo-small-440x280', 440, 280, 110, 68], ['promo-marquee-1400x560', 1400, 560, 220, 150], ['og', 1200, 630, 200, 136, join(ROOT, 'site/assets')]]) {
  await p.setViewportSize({ width: w, height: h });
  writeFileSync(tmp, promo(w, h, icon, word));
  await p.goto(`file://${tmp}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(dir || OUT, `${name}.png`) });
}
await browser.close();
console.log('promo tiles');
