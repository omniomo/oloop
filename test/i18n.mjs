// Every t('…') key in the extension has a translation in every catalog, with the
// same {placeholders}; manifest _locales cover the same languages. No browser needed.
//
//   node test/i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '../extension');
await import(join(EXT, 'lib/i18n.js'));
const { LANGS } = globalThis.OLI18N;
for (const code of Object.keys(LANGS)) if (code !== 'en') await import(join(EXT, `lib/locales/${code}.js`));
const catalogs = globalThis.OL_CATALOGS;

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const keys = new Set();
for (const f of walk(EXT).filter((f) => f.endsWith('.js') && !f.includes('/locales/'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?<![\w.])(?:OL\.)?t\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
}
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let failed = 0;
for (const code of Object.keys(LANGS).filter((c) => c !== 'en')) {
  const cat = catalogs[code] || {};
  const missing = [...keys].filter((k) => !(k in cat));
  const bad = [...keys].filter((k) => k in cat && ph(k) !== ph(cat[k]));
  const unused = Object.keys(cat).filter((k) => !keys.has(k));
  const ok = !missing.length && !bad.length;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${code}: ${keys.size} keys${missing.length ? `, missing ${missing.length}: ${missing.slice(0, 3).join(' | ')}` : ''}${bad.length ? `, placeholders differ: ${bad.slice(0, 3).join(' | ')}` : ''}${unused.length ? `  (unused: ${unused.length})` : ''}`);
}
const locales = readdirSync(join(EXT, '_locales')).sort().join(' ');
const wantLocales = 'de en es fr ja ko pt_BR pt_PT zh_CN zh_TW';
console.log(`${locales === wantLocales ? 'PASS' : 'FAIL'}  manifest _locales: ${locales}`);
if (locales !== wantLocales) failed++;
for (const l of readdirSync(join(EXT, '_locales'))) {
  const d = JSON.parse(readFileSync(join(EXT, '_locales', l, 'messages.json'), 'utf8')).description.message;
  if (d.length > 132) { failed++; console.log(`FAIL  ${l} description is ${d.length} > 132 characters`); }
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
