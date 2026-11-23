// ES-module entry to the translations: import { t } from './t.js'.
import './i18n.js';
import './locales/zh-Hans.js';
import './locales/zh-Hant.js';
import './locales/ja.js';
import './locales/ko.js';
import './locales/es.js';
import './locales/fr.js';
import './locales/de.js';
import './locales/pt.js';

export const I18N = globalThis.OLI18N;
export const t = (s, p) => I18N.t(s, p);
