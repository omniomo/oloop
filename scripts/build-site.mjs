// Builds the static site in every OMO language from site/src.
//
//   node scripts/build-site.mjs
//
// Pages: / (English), /zh/, /zh-hant/, /ja/, /ko/, /es/, /fr/, /de/, /pt/ — the same
// paths as ooooomo.com — plus /privacy/ (English) and /zh/privacy/ (简体中文).
// Panel screenshots come from scripts/shots.mjs into site/assets/shots/<lang>/
// ({pick,post,night}.webp are used on the page).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../site');
const src = (f) => readFileSync(join(SITE, 'src', f), 'utf8');
const S = JSON.parse(src('strings.json'));
const PLATFORMS = JSON.parse(src('platforms.json'));
const LANGS = [
  ['en', '/', 'English'], ['zh-Hans', '/zh/', '简体中文'], ['zh-Hant', '/zh-hant/', '繁體中文'],
  ['ja', '/ja/', '日本語'], ['ko', '/ko/', '한국어'], ['es', '/es/', 'Español'],
  ['fr', '/fr/', 'Français'], ['de', '/de/', 'Deutsch'], ['pt', '/pt/', 'Português'],
];
const PRIVACY = { en: '/privacy/', 'zh-Hans': '/zh/privacy/' };
const fill = (tpl, v) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const NAMES = { x: 'X', threads: 'Threads', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', bilibili: 'Bilibili', pinterest: 'Pinterest', note: 'note' };
const platformName = (id, run) => (id === 'xiaohongshu' ? run.rednote : id === 'naver' ? run.naver : NAMES[id]);
const icon = (p, name) => {
  const wide = p.id === 'xiaohongshu';
  return `                <li data-id="${p.id}" data-domain="${p.domain}" data-auto="${p.auto ? 1 : 0}" data-dur="${p.dur}"${wide ? ' class="wide"' : ''}>`
    + `<svg viewBox="${wide ? '0 7.2 24 9.6' : '0 0 24 24'}" role="img" aria-label="${esc(name)}"><path fill="currentColor" d="${p.d}" /></svg></li>`;
};

const shared = {
  github_icon: src('github-icon.svg').trim(),
  omo_logo: src('omo-logo.svg').trim(),
};
const write = (path, html) => {
  const dir = join(SITE, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log(join(path, 'index.html'));
};
const langLinks = (lang, hrefOf) => LANGS
  .map(([l, p, n]) => `<a href="${hrefOf(l, p)}" lang="${l}" hreflang="${l}"${l === lang ? ' aria-current="page"' : ''}>${n}</a>`)
  .join('');

for (const [lang, path, name] of LANGS) {
  const s = S[lang];
  const v = {
    ...shared, ...s, lang, path, home: path, lang_name: name,
    title: esc(s.title), desc: esc(s.desc),
    privacy_href: PRIVACY[lang] || PRIVACY.en,
    alternates: LANGS.map(([l, p]) => `    <link rel="alternate" hreflang="${l}" href="https://oloop.ooooomo.com${p}" />`).join('\n')
      + `\n    <link rel="alternate" hreflang="x-default" href="https://oloop.ooooomo.com/" />`,
    lang_links: langLinks(lang, (l, p) => p),
    platform_icons: PLATFORMS.map((p) => icon(p, platformName(p.id, s.run))).join('\n'),
    h1_lines: s.h1.map((line) => `<span>${esc(line)}</span>`).join(' '),
    run_aria: esc(s.run.aria),
    run_json: JSON.stringify(s.run).replace(/</g, '\\u003c'),
  };
  v.main = fill(src('home.html'), v);
  write(path, fill(src('page.html'), v));
}
for (const [lang, path] of Object.entries(PRIVACY)) {
  const [, home, name] = LANGS.find(([l]) => l === lang);
  const s = S[lang];
  const v = {
    ...shared, ...s, lang, path, home, lang_name: name,
    title: esc(`${s.privacy} — oloop`), desc: esc(s.desc),
    privacy_href: path,
    alternates: Object.entries(PRIVACY).map(([l, p]) => `    <link rel="alternate" hreflang="${l}" href="https://oloop.ooooomo.com${p}" />`).join('\n'),
    lang_links: langLinks(lang, (l, p) => PRIVACY[l] || p),
    main: `      <main>\n        <article class="doc">\n${src(`privacy.${lang}.html`)}        </article>\n      </main>`,
  };
  write(path, fill(src('page.html'), v));
}
