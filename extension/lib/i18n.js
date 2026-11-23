// Translations for the panel, the service worker and the content scripts.
//
// Keys are the English text. Each locale file adds a catalog to OL_CATALOGS;
// anything missing falls back to English. This file runs both as a classic
// content script and as an ES module import, so it only touches globalThis.
(function (g) {
  const LANGS = {
    en: 'English',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
    ja: '日本語',
    ko: '한국어',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    pt: 'Português',
  };
  const catalogs = g.OL_CATALOGS || (g.OL_CATALOGS = {});
  let lang = 'en';

  function fromBrowser() {
    const list = [...(g.navigator?.languages || []), g.navigator?.language || ''];
    for (const raw of list) {
      const l = String(raw).toLowerCase();
      if (!l) continue;
      if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
      const base = l.split('-')[0];
      if (LANGS[base]) return base;
    }
    return 'en';
  }
  /** 'auto' (or anything unknown) follows the browser. */
  function resolve(pref) {
    return pref && pref !== 'auto' && LANGS[pref] ? pref : fromBrowser();
  }
  function t(src, params) {
    let s = (lang !== 'en' && catalogs[lang]?.[src]) || src;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] == null ? m : String(params[k])));
    return s;
  }
  /** Read the saved choice and keep following it. Safe to call more than once. */
  let watching = false;
  async function load() {
    lang = fromBrowser();
    try {
      const { ui } = await g.chrome.storage.local.get('ui');
      lang = resolve(ui?.lang);
      if (!watching) {
        watching = true;
        g.chrome.storage.onChanged.addListener((ch, area) => {
          if (area === 'local' && ch.ui) lang = resolve(ch.ui.newValue?.lang);
        });
      }
    } catch {}
    return lang;
  }
  g.OLI18N = {
    LANGS,
    t,
    resolve,
    load,
    get lang() { return lang; },
    set(l) { lang = resolve(l); return lang; },
  };
})(globalThis);
