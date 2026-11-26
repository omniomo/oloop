import { t, I18N } from '../lib/t.js';
import { PLATFORMS, PLATFORM_ORDER, FOLDED, STATUS, TERMINAL, mediaFor, mediaAccepts, mediaLimit, hashtags, textLength, titleFrom } from '../lib/platforms.js';
import { BRAND_PATHS } from '../lib/brands.js';
import { SUPPORT } from '../lib/support.js';
import { putMedia, getMedia, deleteMedia, clearMedia } from '../lib/db.js';

const COVER_ID = 'cover';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ── tiny DOM helpers ───────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
}
function svg(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstChild;
}
const stroke = (d, size = 16, w = 2) =>
  svg(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
const I = {
  more: () => svg('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>'),
  plus: (s = 20) => stroke('<path d="M12 5v14M5 12h14"/>', s, 1.8),
  close: () => stroke('<path d="M6 6l12 12M18 6L6 18"/>', 16),
  check: (s = 12) => stroke('<path d="M5 12.5l4.5 4.5L19 7.5"/>', s, 3),
  arrowUR: (s = 16) => stroke('<path d="M7 17L17 7M8 7h9v9"/>', s, 2.2),
  arrowR: () => stroke('<path d="M5 12h14M13 6l6 6-6 6"/>', 15, 2.2),
  copy: () => stroke('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>', 15),
  play: (s = 10) => svg(`<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>`),
  chevron: () => stroke('<path d="M9 6l6 6-6 6"/>', 15),
  sliders: () => stroke('<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>', 13, 2.2),
  grid: () => svg('<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="8" rx="2.5"/><rect x="3" y="13" width="8" height="8" rx="2.5"/><rect x="13" y="13" width="8" height="8" rx="2.5"/></svg>'),
  loop: () => stroke('<rect x="2.5" y="6.5" width="19" height="11" rx="5.5"/>', 16, 2.2),
  sun: () => stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 15),
  moon: () => stroke('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 15),
  globe: () => stroke('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>', 15),
  trash: () => stroke('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 15),
};
// Wordmark logos (小红书) sit in a wide, short band of their 24×24 box: crop to it.
const GLYPH_BOX = { xiaohongshu: [0, 7.2, 24, 9.6] };
// No CC0 glyph for these; their name stands in.
const GLYPH_WORD = { channels: '视频号' };
const glyph = (id, size = 20) => {
  if (GLYPH_WORD[id]) {
    const w = Math.round(size * 1.45);
    return svg(`<svg width="${w}" height="${Math.round((w * 12) / 30)}" viewBox="0 0 30 12" aria-hidden="true"><text x="15" y="10.2" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">${GLYPH_WORD[id]}</text></svg>`);
  }
  const box = GLYPH_BOX[id];
  const w = box ? Math.round(size * 1.45) : size;
  const h = box ? Math.round((w * box[3]) / box[2]) : size;
  return svg(`<svg width="${w}" height="${h}" viewBox="${(box || [0, 0, 24, 24]).join(' ')}" aria-hidden="true"><path fill="currentColor" d="${BRAND_PATHS[id]}"/></svg>`);
};
const MARK = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\" aria-hidden=\"true\"><defs><linearGradient id=\"olmt\" gradientUnits=\"userSpaceOnUse\" x1=\"91.94\" y1=\"143.82\" x2=\"36.06\" y2=\"-15.82\"><stop offset=\"0\" stop-color=\"#0e0e0f\"/><stop offset=\"1\" stop-color=\"#1d1d20\"/></linearGradient><linearGradient id=\"olmw\" gradientUnits=\"userSpaceOnUse\" x1=\"106.88\" y1=\"32.51\" x2=\"14.72\" y2=\"60.93\"><stop offset=\"0\" stop-color=\"#f6f5f1\"/><stop offset=\"1\" stop-color=\"#eeede9\"/></linearGradient><linearGradient id=\"olmk\" gradientUnits=\"userSpaceOnUse\" x1=\"80.00\" y1=\"52.86\" x2=\"85.01\" y2=\"59.48\"><stop offset=\"0\" stop-color=\"#cfccc6\"/><stop offset=\"1\" stop-color=\"#dcdad5\"/></linearGradient><clipPath id=\"olmc\"><path d=\"M474.257,-245.645 L-260.497,310.669 L-538.653,-56.708 L196.100,-613.021Z\"/></clipPath></defs><path d=\"M128.00,64.00 L128.00,54.39 L128.00,51.33 L127.99,49.09 L127.98,47.28 L127.98,45.72 L127.96,44.33 L127.95,43.09 L127.94,41.94 L127.92,40.88 L127.90,39.88 L127.88,38.95 L127.86,38.07 L127.84,37.23 L127.81,36.42 L127.78,35.66 L127.75,34.92 L127.72,34.21 L127.68,33.53 L127.65,32.87 L127.61,32.23 L127.57,31.61 L127.53,31.01 L127.48,30.42 L127.44,29.85 L127.39,29.30 L127.34,28.76 L127.29,28.24 L127.23,27.72 L127.18,27.22 L127.12,26.73 L127.06,26.25 L127.00,25.78 L126.93,25.32 L126.87,24.87 L126.80,24.42 L126.73,23.99 L126.66,23.56 L126.58,23.15 L126.51,22.74 L126.43,22.33 L126.35,21.94 L126.26,21.55 L126.18,21.16 L126.09,20.79 L126.00,20.42 L125.91,20.05 L125.82,19.69 L125.73,19.34 L125.63,18.99 L125.53,18.65 L125.43,18.31 L125.33,17.98 L125.22,17.66 L125.11,17.33 L125.00,17.02 L124.89,16.70 L124.78,16.40 L124.66,16.09 L124.54,15.79 L124.42,15.50 L124.30,15.21 L124.17,14.92 L124.05,14.64 L123.92,14.36 L123.78,14.08 L123.65,13.81 L123.51,13.54 L123.38,13.28 L123.23,13.02 L123.09,12.76 L122.95,12.51 L122.80,12.26 L122.65,12.01 L122.50,11.76 L122.34,11.52 L122.18,11.29 L122.02,11.05 L121.86,10.82 L121.70,10.59 L121.53,10.37 L121.36,10.15 L121.19,9.93 L121.01,9.71 L120.83,9.50 L120.65,9.29 L120.47,9.08 L120.29,8.88 L120.10,8.68 L119.91,8.48 L119.72,8.28 L119.52,8.09 L119.32,7.90 L119.12,7.71 L118.92,7.53 L118.71,7.35 L118.50,7.17 L118.29,6.99 L118.07,6.81 L117.85,6.64 L117.63,6.47 L117.41,6.30 L117.18,6.14 L116.95,5.98 L116.71,5.82 L116.48,5.66 L116.24,5.50 L115.99,5.35 L115.74,5.20 L115.49,5.05 L115.24,4.91 L114.98,4.77 L114.72,4.62 L114.46,4.49 L114.19,4.35 L113.92,4.22 L113.64,4.08 L113.36,3.95 L113.08,3.83 L112.79,3.70 L112.50,3.58 L112.21,3.46 L111.91,3.34 L111.60,3.22 L111.30,3.11 L110.98,3.00 L110.67,2.89 L110.34,2.78 L110.02,2.67 L109.69,2.57 L109.35,2.47 L109.01,2.37 L108.66,2.27 L108.31,2.18 L107.95,2.09 L107.58,2.00 L107.21,1.91 L106.84,1.82 L106.45,1.74 L106.06,1.65 L105.67,1.57 L105.26,1.49 L104.85,1.42 L104.44,1.34 L104.01,1.27 L103.58,1.20 L103.13,1.13 L102.68,1.07 L102.22,1.00 L101.75,0.94 L101.27,0.88 L100.78,0.82 L100.28,0.77 L99.76,0.71 L99.24,0.66 L98.70,0.61 L98.15,0.56 L97.58,0.52 L96.99,0.47 L96.39,0.43 L95.77,0.39 L95.13,0.35 L94.47,0.32 L93.79,0.28 L93.08,0.25 L92.34,0.22 L91.58,0.19 L90.77,0.16 L89.93,0.14 L89.05,0.12 L88.12,0.10 L87.12,0.08 L86.06,0.06 L84.91,0.05 L83.67,0.04 L82.28,0.02 L80.72,0.02 L78.91,0.01 L76.67,0.00 L73.61,0.00 L64.00,0.00 L54.39,0.00 L51.33,0.00 L49.09,0.01 L47.28,0.02 L45.72,0.02 L44.33,0.04 L43.09,0.05 L41.94,0.06 L40.88,0.08 L39.88,0.10 L38.95,0.12 L38.07,0.14 L37.23,0.16 L36.42,0.19 L35.66,0.22 L34.92,0.25 L34.21,0.28 L33.53,0.32 L32.87,0.35 L32.23,0.39 L31.61,0.43 L31.01,0.47 L30.42,0.52 L29.85,0.56 L29.30,0.61 L28.76,0.66 L28.24,0.71 L27.72,0.77 L27.22,0.82 L26.73,0.88 L26.25,0.94 L25.78,1.00 L25.32,1.07 L24.87,1.13 L24.42,1.20 L23.99,1.27 L23.56,1.34 L23.15,1.42 L22.74,1.49 L22.33,1.57 L21.94,1.65 L21.55,1.74 L21.16,1.82 L20.79,1.91 L20.42,2.00 L20.05,2.09 L19.69,2.18 L19.34,2.27 L18.99,2.37 L18.65,2.47 L18.31,2.57 L17.98,2.67 L17.66,2.78 L17.33,2.89 L17.02,3.00 L16.70,3.11 L16.40,3.22 L16.09,3.34 L15.79,3.46 L15.50,3.58 L15.21,3.70 L14.92,3.83 L14.64,3.95 L14.36,4.08 L14.08,4.22 L13.81,4.35 L13.54,4.49 L13.28,4.62 L13.02,4.77 L12.76,4.91 L12.51,5.05 L12.26,5.20 L12.01,5.35 L11.76,5.50 L11.52,5.66 L11.29,5.82 L11.05,5.98 L10.82,6.14 L10.59,6.30 L10.37,6.47 L10.15,6.64 L9.93,6.81 L9.71,6.99 L9.50,7.17 L9.29,7.35 L9.08,7.53 L8.88,7.71 L8.68,7.90 L8.48,8.09 L8.28,8.28 L8.09,8.48 L7.90,8.68 L7.71,8.88 L7.53,9.08 L7.35,9.29 L7.17,9.50 L6.99,9.71 L6.81,9.93 L6.64,10.15 L6.47,10.37 L6.30,10.59 L6.14,10.82 L5.98,11.05 L5.82,11.29 L5.66,11.52 L5.50,11.76 L5.35,12.01 L5.20,12.26 L5.05,12.51 L4.91,12.76 L4.77,13.02 L4.62,13.28 L4.49,13.54 L4.35,13.81 L4.22,14.08 L4.08,14.36 L3.95,14.64 L3.83,14.92 L3.70,15.21 L3.58,15.50 L3.46,15.79 L3.34,16.09 L3.22,16.40 L3.11,16.70 L3.00,17.02 L2.89,17.33 L2.78,17.66 L2.67,17.98 L2.57,18.31 L2.47,18.65 L2.37,18.99 L2.27,19.34 L2.18,19.69 L2.09,20.05 L2.00,20.42 L1.91,20.79 L1.82,21.16 L1.74,21.55 L1.65,21.94 L1.57,22.33 L1.49,22.74 L1.42,23.15 L1.34,23.56 L1.27,23.99 L1.20,24.42 L1.13,24.87 L1.07,25.32 L1.00,25.78 L0.94,26.25 L0.88,26.73 L0.82,27.22 L0.77,27.72 L0.71,28.24 L0.66,28.76 L0.61,29.30 L0.56,29.85 L0.52,30.42 L0.47,31.01 L0.43,31.61 L0.39,32.23 L0.35,32.87 L0.32,33.53 L0.28,34.21 L0.25,34.92 L0.22,35.66 L0.19,36.42 L0.16,37.23 L0.14,38.07 L0.12,38.95 L0.10,39.88 L0.08,40.88 L0.06,41.94 L0.05,43.09 L0.04,44.33 L0.02,45.72 L0.02,47.28 L0.01,49.09 L0.00,51.33 L0.00,54.39 L0.00,64.00 L0.00,73.61 L0.00,76.67 L0.01,78.91 L0.02,80.72 L0.02,82.28 L0.04,83.67 L0.05,84.91 L0.06,86.06 L0.08,87.12 L0.10,88.12 L0.12,89.05 L0.14,89.93 L0.16,90.77 L0.19,91.58 L0.22,92.34 L0.25,93.08 L0.28,93.79 L0.32,94.47 L0.35,95.13 L0.39,95.77 L0.43,96.39 L0.47,96.99 L0.52,97.58 L0.56,98.15 L0.61,98.70 L0.66,99.24 L0.71,99.76 L0.77,100.28 L0.82,100.78 L0.88,101.27 L0.94,101.75 L1.00,102.22 L1.07,102.68 L1.13,103.13 L1.20,103.58 L1.27,104.01 L1.34,104.44 L1.42,104.85 L1.49,105.26 L1.57,105.67 L1.65,106.06 L1.74,106.45 L1.82,106.84 L1.91,107.21 L2.00,107.58 L2.09,107.95 L2.18,108.31 L2.27,108.66 L2.37,109.01 L2.47,109.35 L2.57,109.69 L2.67,110.02 L2.78,110.34 L2.89,110.67 L3.00,110.98 L3.11,111.30 L3.22,111.60 L3.34,111.91 L3.46,112.21 L3.58,112.50 L3.70,112.79 L3.83,113.08 L3.95,113.36 L4.08,113.64 L4.22,113.92 L4.35,114.19 L4.49,114.46 L4.62,114.72 L4.77,114.98 L4.91,115.24 L5.05,115.49 L5.20,115.74 L5.35,115.99 L5.50,116.24 L5.66,116.48 L5.82,116.71 L5.98,116.95 L6.14,117.18 L6.30,117.41 L6.47,117.63 L6.64,117.85 L6.81,118.07 L6.99,118.29 L7.17,118.50 L7.35,118.71 L7.53,118.92 L7.71,119.12 L7.90,119.32 L8.09,119.52 L8.28,119.72 L8.48,119.91 L8.68,120.10 L8.88,120.29 L9.08,120.47 L9.29,120.65 L9.50,120.83 L9.71,121.01 L9.93,121.19 L10.15,121.36 L10.37,121.53 L10.59,121.70 L10.82,121.86 L11.05,122.02 L11.29,122.18 L11.52,122.34 L11.76,122.50 L12.01,122.65 L12.26,122.80 L12.51,122.95 L12.76,123.09 L13.02,123.23 L13.28,123.38 L13.54,123.51 L13.81,123.65 L14.08,123.78 L14.36,123.92 L14.64,124.05 L14.92,124.17 L15.21,124.30 L15.50,124.42 L15.79,124.54 L16.09,124.66 L16.40,124.78 L16.70,124.89 L17.02,125.00 L17.33,125.11 L17.66,125.22 L17.98,125.33 L18.31,125.43 L18.65,125.53 L18.99,125.63 L19.34,125.73 L19.69,125.82 L20.05,125.91 L20.42,126.00 L20.79,126.09 L21.16,126.18 L21.55,126.26 L21.94,126.35 L22.33,126.43 L22.74,126.51 L23.15,126.58 L23.56,126.66 L23.99,126.73 L24.42,126.80 L24.87,126.87 L25.32,126.93 L25.78,127.00 L26.25,127.06 L26.73,127.12 L27.22,127.18 L27.72,127.23 L28.24,127.29 L28.76,127.34 L29.30,127.39 L29.85,127.44 L30.42,127.48 L31.01,127.53 L31.61,127.57 L32.23,127.61 L32.87,127.65 L33.53,127.68 L34.21,127.72 L34.92,127.75 L35.66,127.78 L36.42,127.81 L37.23,127.84 L38.07,127.86 L38.95,127.88 L39.88,127.90 L40.88,127.92 L41.94,127.94 L43.09,127.95 L44.33,127.96 L45.72,127.98 L47.28,127.98 L49.09,127.99 L51.33,128.00 L54.39,128.00 L64.00,128.00 L73.61,128.00 L76.67,128.00 L78.91,127.99 L80.72,127.98 L82.28,127.98 L83.67,127.96 L84.91,127.95 L86.06,127.94 L87.12,127.92 L88.12,127.90 L89.05,127.88 L89.93,127.86 L90.77,127.84 L91.58,127.81 L92.34,127.78 L93.08,127.75 L93.79,127.72 L94.47,127.68 L95.13,127.65 L95.77,127.61 L96.39,127.57 L96.99,127.53 L97.58,127.48 L98.15,127.44 L98.70,127.39 L99.24,127.34 L99.76,127.29 L100.28,127.23 L100.78,127.18 L101.27,127.12 L101.75,127.06 L102.22,127.00 L102.68,126.93 L103.13,126.87 L103.58,126.80 L104.01,126.73 L104.44,126.66 L104.85,126.58 L105.26,126.51 L105.67,126.43 L106.06,126.35 L106.45,126.26 L106.84,126.18 L107.21,126.09 L107.58,126.00 L107.95,125.91 L108.31,125.82 L108.66,125.73 L109.01,125.63 L109.35,125.53 L109.69,125.43 L110.02,125.33 L110.34,125.22 L110.67,125.11 L110.98,125.00 L111.30,124.89 L111.60,124.78 L111.91,124.66 L112.21,124.54 L112.50,124.42 L112.79,124.30 L113.08,124.17 L113.36,124.05 L113.64,123.92 L113.92,123.78 L114.19,123.65 L114.46,123.51 L114.72,123.38 L114.98,123.23 L115.24,123.09 L115.49,122.95 L115.74,122.80 L115.99,122.65 L116.24,122.50 L116.48,122.34 L116.71,122.18 L116.95,122.02 L117.18,121.86 L117.41,121.70 L117.63,121.53 L117.85,121.36 L118.07,121.19 L118.29,121.01 L118.50,120.83 L118.71,120.65 L118.92,120.47 L119.12,120.29 L119.32,120.10 L119.52,119.91 L119.72,119.72 L119.91,119.52 L120.10,119.32 L120.29,119.12 L120.47,118.92 L120.65,118.71 L120.83,118.50 L121.01,118.29 L121.19,118.07 L121.36,117.85 L121.53,117.63 L121.70,117.41 L121.86,117.18 L122.02,116.95 L122.18,116.71 L122.34,116.48 L122.50,116.24 L122.65,115.99 L122.80,115.74 L122.95,115.49 L123.09,115.24 L123.23,114.98 L123.38,114.72 L123.51,114.46 L123.65,114.19 L123.78,113.92 L123.92,113.64 L124.05,113.36 L124.17,113.08 L124.30,112.79 L124.42,112.50 L124.54,112.21 L124.66,111.91 L124.78,111.60 L124.89,111.30 L125.00,110.98 L125.11,110.67 L125.22,110.34 L125.33,110.02 L125.43,109.69 L125.53,109.35 L125.63,109.01 L125.73,108.66 L125.82,108.31 L125.91,107.95 L126.00,107.58 L126.09,107.21 L126.18,106.84 L126.26,106.45 L126.35,106.06 L126.43,105.67 L126.51,105.26 L126.58,104.85 L126.66,104.44 L126.73,104.01 L126.80,103.58 L126.87,103.13 L126.93,102.68 L127.00,102.22 L127.06,101.75 L127.12,101.27 L127.18,100.78 L127.23,100.28 L127.29,99.76 L127.34,99.24 L127.39,98.70 L127.44,98.15 L127.48,97.58 L127.53,96.99 L127.57,96.39 L127.61,95.77 L127.65,95.13 L127.68,94.47 L127.72,93.79 L127.75,93.08 L127.78,92.34 L127.81,91.58 L127.84,90.77 L127.86,89.93 L127.88,89.05 L127.90,88.12 L127.92,87.12 L127.94,86.06 L127.95,84.91 L127.96,83.67 L127.98,82.28 L127.98,80.72 L127.99,78.91 L128.00,76.67 L128.00,73.61Z\" fill=\"url(#olmt)\"/><path d=\"M103.042,33.695 L27.802,56.894 A4.301,4.301 0 0 0 27.759,65.100 L49.435,72.037 A7.680,7.680 0 0 1 54.365,76.879 L63.847,104.765 A3.072,3.072 0 0 0 69.487,105.182 L105.043,36.083 A1.690,1.690 0 0 0 103.042,33.695Z\" fill=\"url(#olmk)\"/><path d=\"M103.042,33.695 L27.802,56.894 A4.301,4.301 0 0 0 27.759,65.100 L49.435,72.037 A7.680,7.680 0 0 1 54.365,76.879 L63.847,104.765 A3.072,3.072 0 0 0 69.487,105.182 L105.043,36.083 A1.690,1.690 0 0 0 103.042,33.695Z\" fill=\"url(#olmw)\" clip-path=\"url(#olmc)\"/><g fill=\"url(#olmt)\"><ellipse cx=\"60.062\" cy=\"55.306\" rx=\"3.256\" ry=\"4.116\" transform=\"rotate(28.00 60.062 55.306)\"/><ellipse cx=\"72.538\" cy=\"51.459\" rx=\"3.256\" ry=\"4.116\" transform=\"rotate(28.00 72.538 51.459)\"/></g></svg>";
const mark = (size = 26) => svg(MARK.replace('viewBox=', `width="${size}" height="${size}" viewBox=`));

// ── state ──────────────────────────────────────────────────────────────────────

function defaultDraft() {
  const d = {
    title: '',
    text: '',
    mediaOrder: [],
    platforms: Object.fromEntries(PLATFORM_ORDER.map((id) => [id, ['x', 'instagram'].includes(id)])),
    overrides: Object.fromEntries(PLATFORM_ORDER.map((id) => [id, { title: '', text: '' }])),
    options: {},
    mediaPick: {}, // platform id -> media ids chosen for that platform (absent = automatic)
    cover: { mode: 'auto', time: 0, videoId: null },
    coverSlots: {}, // 'bilibili:4x3' -> { name } when that slot has its own image
    autoSend: false,
  };
  for (const id of PLATFORM_ORDER) {
    d.options[id] = Object.fromEntries((PLATFORMS[id].options || []).map((o) => [o.key, o.default ?? '']));
  }
  return d;
}
function mergeDraft(saved) {
  const d = defaultDraft();
  if (!saved) return d;
  for (const k of ['title', 'text', 'mediaOrder', 'autoSend']) if (saved[k] != null) d[k] = saved[k];
  Object.assign(d.platforms, saved.platforms);
  Object.assign(d.cover, saved.cover);
  Object.assign(d.coverSlots, saved.coverSlots);
  Object.assign(d.mediaPick, saved.mediaPick);
  for (const id of PLATFORM_ORDER) {
    d.overrides[id] = { ...d.overrides[id], ...(saved.overrides || {})[id] };
    d.options[id] = { ...d.options[id], ...(saved.options || {})[id] };
  }
  return d;
}

let draft = defaultDraft();
let ui = { theme: 'light', view: 'cards', lang: 'auto' };
const media = new Map(); // id -> { id, name, type, size, url, duration }
let coverView = null; // { name, type, size, url }
const slotViews = new Map(); // 'bilibili:4x3' -> { name, type, size, url }
let run = null;
let boards = [];
let dragId = null;
let screen = null; // 'compose' | 'run'
let runSig = '';

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ draft }), 200);
}
function saveUi() {
  chrome.storage.local.set({ ui });
  try {
    localStorage.setItem('oloop-theme', ui.theme);
  } catch {}
}
function applyTheme() {
  document.documentElement.dataset.theme = ui.theme;
}
function applyLang() {
  I18N.set(ui.lang);
  document.documentElement.lang = I18N.lang;
  document.title = 'Oloop';
}
function setLang(code) {
  ui.lang = code;
  saveUi();
  applyLang();
  closeSheet();
  $('.menu')?.remove();
  runSig = '';
  mount(true);
}

// ── media ──────────────────────────────────────────────────────────────────────

const isVideo = (m) => m.type.startsWith('video/');
const orderedMedia = () => draft.mediaOrder.map((id) => media.get(id)).filter(Boolean);
const firstVideo = () => orderedMedia().find(isVideo) || null;
const meta = (m) => ({ id: m.id, name: m.name, type: m.type, size: m.size });

function addMediaView(rec) {
  const view = { id: rec.id, name: rec.name, type: rec.type, size: rec.size, url: URL.createObjectURL(rec.blob) };
  media.set(rec.id, view);
  if (isVideo(rec)) {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      view.duration = v.duration;
      if (screen === 'compose') renderMedia();
    };
    v.src = view.url;
  }
}

async function addFiles(files) {
  const list = Array.from(files || []).filter((f) => /^(image|video)\//.test(f.type));
  if (!list.length) return;
  for (const f of list) {
    const ext = (f.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('quicktime', 'mov');
    const rec = {
      id: crypto.randomUUID(),
      name: f.name && f.name !== 'image.png' ? f.name : `oloop-${Date.now()}.${ext}`,
      type: f.type,
      size: f.size,
      blob: f,
      addedAt: Date.now(),
    };
    await putMedia(rec);
    addMediaView(rec);
    draft.mediaOrder.push(rec.id);
  }
  save();
  refreshCompose();
}

async function removeMedia(id) {
  const view = media.get(id);
  if (view) URL.revokeObjectURL(view.url);
  media.delete(id);
  draft.mediaOrder = draft.mediaOrder.filter((x) => x !== id);
  for (const [pid, pick] of Object.entries(draft.mediaPick)) {
    const left = pick.filter((x) => x !== id);
    if (left.length || !pick.length) draft.mediaPick[pid] = left;
    else delete draft.mediaPick[pid];
  }
  await deleteMedia(id);
  save();
  refreshCompose();
}

function moveMedia(fromId, toId) {
  const order = draft.mediaOrder;
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return;
  order.splice(from, 1);
  order.splice(to, 0, fromId);
  save();
  refreshCompose();
}

const fmtTime = (s, precise = false) => {
  if (!isFinite(s)) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${(precise ? sec.toFixed(1) : String(Math.round(sec))).padStart(precise ? 4 : 2, '0')}`;
};

// ── cover ──────────────────────────────────────────────────────────────────────

function coverActive() {
  if (draft.cover.mode === 'auto' || !coverView) return false;
  if (draft.cover.mode === 'frame') return draft.cover.videoId === firstVideo()?.id;
  return true;
}
// Frame covers also carry where the frame is, for platforms that only let you pick a frame.
const coverMeta = () => ({
  id: COVER_ID, name: coverView.name, type: coverView.type, size: coverView.size,
  ...(draft.cover.mode === 'frame' ? { time: draft.cover.time, duration: draft.cover.duration || 0 } : {}),
});

async function asJpeg(file) {
  const bmp = await createImageBitmap(file);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return new File([blob], (file.name || 'cover').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

const slotId = (key) => `cover:${key}`;
async function storeSlot(key, file) {
  await putMedia({ id: slotId(key), name: file.name, type: file.type, size: file.size, blob: file, addedAt: Date.now() });
  if (slotViews.has(key)) URL.revokeObjectURL(slotViews.get(key).url);
  slotViews.set(key, { name: file.name, type: file.type, size: file.size, url: URL.createObjectURL(file) });
  draft.coverSlots[key] = { name: file.name };
  save();
}
async function dropSlot(key) {
  await deleteMedia(slotId(key)).catch(() => {});
  if (slotViews.has(key)) URL.revokeObjectURL(slotViews.get(key).url);
  slotViews.delete(key);
  delete draft.coverSlots[key];
  save();
}
/** Covers a platform takes per aspect ratio; a slot without its own image is null. */
function coversFor(id, used) {
  const slots = PLATFORMS[id].coverSlots;
  if (!slots || !used.some(isVideo)) return null;
  const out = {};
  for (const s of slots) {
    const v = slotViews.get(`${id}:${s.key}`);
    out[s.key] = v ? { id: slotId(`${id}:${s.key}`), name: v.name, type: v.type, size: v.size } : null;
  }
  return Object.values(out).some(Boolean) ? out : null;
}

async function storeCover(blob, name) {
  await putMedia({ id: COVER_ID, name, type: blob.type, size: blob.size, blob, addedAt: Date.now() });
  if (coverView) URL.revokeObjectURL(coverView.url);
  coverView = { name, type: blob.type, size: blob.size, url: URL.createObjectURL(blob) };
}

// ── draft analysis ─────────────────────────────────────────────────────────────

const orElse = (own, base) => (own.trim() ? own : base);
const ownTitle = (id) => orElse(draft.overrides[id].title, draft.title);
const ownText = (id) => orElse(draft.overrides[id].text, draft.text);
// Either box left empty borrows from the other: the title from the text's
// first line, the text from the title.
const titleFor = (id) => {
  const p = PLATFORMS[id].title;
  if (!p) return '';
  const raw = orElse(ownTitle(id), titleFrom(ownText(id), p.limit));
  return p.clean ? p.clean(raw) : raw;
};
/** What a field will carry, and how it counts against the platform's limit. */
const fieldUse = (id, field) => {
  const p = PLATFORMS[id];
  if (field === 'title') {
    const v = titleFor(id);
    return { len: [...v].length, limit: p.title?.limit };
  }
  return { len: textLength(id, textFor(id)), limit: p.body.limit };
};
const textFor = (id) => orElse(ownText(id), ownTitle(id));
const selectedIds = () => PLATFORM_ORDER.filter((id) => draft.platforms[id]);

function coverFor(id, used) {
  const p = PLATFORMS[id];
  if (p.headerImage) {
    if (coverActive()) return coverMeta();
    const img = orderedMedia().find((m) => !isVideo(m));
    return img ? meta(img) : null;
  }
  return p.cover && coverActive() && used.some(isVideo) ? coverMeta() : null;
}

function analyze() {
  const list = orderedMedia();
  const out = {};
  for (const id of PLATFORM_ORDER) {
    const p = PLATFORMS[id];
    const used = mediaFor(id, list, draft.mediaPick[id]);
    const title = titleFor(id);
    const text = textFor(id);
    const len = textLength(id, text);
    const problems = [];
    const warnings = [];
    if (p.media.required && !used.length) problems.push(p.media.video ? t('Needs a video') : t('Needs media'));
    if (p.title?.required && !title.trim()) problems.push(t('Needs a title'));
    if (p.title?.limit && [...title].length > p.title.limit) problems.push(t('Title over {n} characters', { n: p.title.limit }));
    if (p.title?.min && !title && (ownTitle(id).trim() || text.trim())) warnings.push(t('No {field}: it takes {min}–{max} characters', { field: p.title.label, min: p.title.min, max: p.title.limit }));
    if (id === 'youtube' && /[<>]/.test(title)) problems.push(t('No < or > in the title'));
    if (p.body.required && !text.trim()) problems.push(t('Needs text'));
    if (!p.media.required && !p.body.required && !text.trim() && !used.length) problems.push(t('Nothing to post'));
    if (p.body.limit && len > p.body.limit) (p.body.soft ? warnings : problems).push(t('Over {n} characters', { n: p.body.limit }));
    if (p.tags && !(draft.options[id].tags || '').trim() && !hashtags(text).length) warnings.push(t('No hashtags'));
    if (p.media.max && !draft.mediaPick[id]) {
      const takes = list.filter((m) => mediaAccepts(id, m)).length;
      if (used.length < takes) warnings.push(t('{n} of {total} used', { n: used.length, total: takes }));
      else if (p.media.images && list.some(isVideo)) warnings.push(t('Videos skipped'));
    }
    out[id] = { problems, warnings, used };
  }
  return out;
}

/** Group "<platform> <problem>" so the chips read "YouTube、note 需要标题". */
function groupIssues(info, key) {
  const groups = new Map();
  for (const id of selectedIds()) {
    for (const msg of info[id][key]) {
      if (!groups.has(msg)) groups.set(msg, []);
      groups.get(msg).push(id);
    }
  }
  return [...groups].map(([msg, ids]) => ({ ids, text: `${ids.map((i) => PLATFORMS[i].name).join('、')} ${msg}` }));
}

const isBlank = () => !draft.title.trim() && !draft.text.trim() && !draft.mediaOrder.length;
const hasIssue = (id, info) => !isBlank() && !!draft.platforms[id] && info[id].problems.length > 0;

const runActive = () => !!run && run.jobs.some((j) => !TERMINAL.has(j.status));

// ── shared pieces ──────────────────────────────────────────────────────────────

function header() {
  const menuBtn = h('button', { class: 'round', 'aria-label': t('More'), 'aria-haspopup': 'menu', onClick: (e) => toggleMenu(e.currentTarget) }, I.more());
  return h('header', { class: 'top' }, h('div', { class: 'brand' }, mark(26), h('span', { class: 'brand-name', text: 'Oloop' })), menuBtn);
}

function viewSwitch() {
  const btn = (view, label, icon) =>
    h('button', {
      'aria-label': label,
      'data-view': view,
      'aria-pressed': String(ui.view === view),
      onClick: () => {
        if (ui.view === view) return;
        ui.view = view;
        saveUi();
        mount(true);
      },
    }, icon);
  return h('div', { class: 'view-switch', role: 'group', 'aria-label': t('View') }, btn('cards', t('Cards'), I.grid()), btn('loop', t('Loop'), I.loop()));
}

/** Evenly spaced points on OMO's wide O (a capsule) — the loop view's stage. */
function stagePoints(w, hgt, n) {
  const x0 = 28, x1 = w - 28, y0 = 30, y1 = hgt - 30;
  const r = (y1 - y0) / 2;
  const ls = Math.max(0, x1 - x0 - 2 * r), la = Math.PI * r, P = 2 * ls + 2 * la, cy = (y0 + y1) / 2, mid = (x0 + x1) / 2;
  const pts = [];
  for (let k = 0; k < n; k++) {
    let s = (k / n) * P;
    const segs = [['tr', ls / 2], ['ar', la], ['b', ls], ['al', la], ['tl', ls / 2]];
    let name = 'tl';
    for (const [nm, l] of segs) {
      if (s <= l) { name = nm; break; }
      s -= l;
    }
    if (name === 'tr') pts.push([mid + s, y0]);
    else if (name === 'ar') { const a = (-90 + (180 * s) / la) * (Math.PI / 180); pts.push([x1 - r + r * Math.cos(a), cy + r * Math.sin(a)]); }
    else if (name === 'b') pts.push([x1 - r - s, y1]);
    else if (name === 'al') { const a = (90 + (180 * s) / la) * (Math.PI / 180); pts.push([x0 + r + r * Math.cos(a), cy + r * Math.sin(a)]); }
    else pts.push([x0 + r + s, y0]);
  }
  return { pts, ring: { x: x0, y: y0, w: x1 - x0, h: y1 - y0, r } };
}

function stage(width, buildNodes, center, n = PLATFORM_ORDER.length) {
  const hgt = Math.round(Math.min(width * 0.64, 260));
  const el = h('div', { class: 'stage', style: { height: `${hgt}px` } });
  const draw = (w) => {
    const geo = stagePoints(w, hgt, n);
    el.replaceChildren(
      svg(`<svg class="ring" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true"><rect x="${geo.ring.x}" y="${geo.ring.y}" width="${geo.ring.w}" height="${geo.ring.h}" rx="${geo.ring.r}" fill="none" stroke="var(--ring-line)" stroke-width="1.5"/></svg>`),
      ...center(w, hgt),
      ...buildNodes(geo.pts),
    );
  };
  draw(width);
  const ro = new ResizeObserver(([e]) => {
    if (!el.isConnected) return ro.disconnect();
    const w = Math.round(e.contentRect.width);
    if (w && w !== el._w) {
      el._w = w;
      draw(w);
    }
  });
  ro.observe(el);
  return el;
}

// ── compose screen ─────────────────────────────────────────────────────────────

function buildCompose() {
  const app = $('#app');
  app.replaceChildren(
    header(),
    h('div', { class: 'scroll', id: 'scroll' },
      h('div', { id: 'media-slot' }),
      buildEditor(),
      h('section', { class: 'card platforms', 'aria-label': t('Post to') },
        h('div', { class: 'head-row' }, h('h2', { class: 'h-sm' }, t('Post to'), h('sup', { class: 'sup', id: 'pf-count' })), viewSwitch()),
        h('div', { id: 'pf-slot' }),
      ),
    ),
    h('div', { class: 'issues', id: 'issues' }),
    h('footer', { class: 'bar' },
      h('button', {
        id: 'auto-send', class: 'pill-toggle', 'aria-pressed': String(draft.autoSend),
        onClick: (e) => {
          draft.autoSend = !draft.autoSend;
          e.currentTarget.setAttribute('aria-pressed', String(draft.autoSend));
          save();
        },
      }, h('span', { class: 'switch' }), h('span', { style: { fontSize: '14px', fontWeight: 500 }, text: t('Auto-send') })),
      h('button', { id: 'publish', class: 'primary', onClick: publish },
        h('span', { class: 'word', text: t('Post') }),
        h('sup', { class: 'sup', id: 'publish-count' })),
    ),
  );
  renderMedia();
  renderPlatforms();
  updateCompose();
}

function buildEditor() {
  const title = h('input', { id: 'title', class: 'title-input', type: 'text', placeholder: t('Title'), autocomplete: 'off' });
  const text = h('textarea', { id: 'text', class: 'body-input', placeholder: t('Text') });
  title.value = draft.title;
  text.value = draft.text;
  title.addEventListener('input', () => { draft.title = title.value; save(); updateCompose(); });
  text.addEventListener('input', () => { draft.text = text.value; save(); updateCompose(); });
  return h('section', { class: 'card editor', 'aria-label': t('Title and text') },
    h('label', {}, h('span', { class: 'sr', text: t('Title') }), title),
    h('div', { class: 'rule' }),
    h('label', {}, h('span', { class: 'sr', text: t('Text') }), text));
}

function renderMedia() {
  const slot = $('#media-slot');
  if (!slot) return;
  const list = orderedMedia();
  if (!list.length) {
    slot.replaceChildren(
      h('button', { class: 'card drop', id: 'dropzone', onClick: () => $('#file-input').click() },
        h('span', { class: 'drop-art' }, h('span', { class: 'a' }), h('span', { class: 'b' }), h('span', { class: 'c' }, I.plus(22))),
        h('span', { class: 'drop-title', text: t('Add images or videos') })));
    return;
  }
  const grid = h('div', { class: 'thumbs', id: 'media-grid' });
  list.forEach((m, i) => {
    const node = h('div', { class: 'thumb', draggable: 'true', 'data-id': m.id, title: m.name },
      isVideo(m) ? h('video', { src: m.url, muted: true, preload: 'metadata' }) : h('img', { src: m.url, alt: '' }),
      h('span', { class: 'num', text: String(i + 1) }),
      isVideo(m) && m.duration ? h('span', { class: 'dur', text: fmtTime(m.duration) }) : null,
      h('button', { class: 'rm', 'aria-label': t('Remove {name}', { name: m.name }), onClick: (e) => { e.stopPropagation(); removeMedia(m.id); } }, stroke('<path d="M6 6l12 12M18 6L6 18"/>', 11, 2.6)));
    node.addEventListener('dragstart', (e) => {
      dragId = m.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-oloop-media', m.id);
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => {
      dragId = null;
      node.classList.remove('dragging');
      $$('.thumb.target').forEach((n) => n.classList.remove('target'));
    });
    node.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); node.classList.add('target'); } });
    node.addEventListener('dragleave', () => node.classList.remove('target'));
    node.addEventListener('drop', (e) => { if (dragId) { e.preventDefault(); e.stopPropagation(); moveMedia(dragId, m.id); } });
    grid.append(node);
  });
  grid.append(h('button', { class: 'add-tile', 'aria-label': t('Add media'), onClick: () => $('#file-input').click() }, I.plus()));

  const video = firstVideo();
  let coverRow = null;
  if (video) {
    const mini = coverActive()
      ? h('img', { src: coverView.url, alt: '' })
      : h('video', { src: video.url, muted: true, preload: 'metadata' });
    const val = coverActive() ? (draft.cover.mode === 'frame' ? fmtTime(draft.cover.time, true) : t('Image')) : t('Default');
    coverRow = h('button', { class: 'row-btn', id: 'cover-row', onClick: openCoverSheet },
      h('span', { class: 'mini' }, mini), h('span', { class: 'label', text: t('Cover') }), h('span', { class: 'val', text: val }), I.chevron());
  }
  slot.replaceChildren(h('section', { class: 'card media', 'aria-label': t('Media') }, grid, coverRow));
}

// Folded platforms that showed this session stay put, so turning one off doesn't make it vanish.
const keepShown = new Set();
function shownIds() {
  const ids = PLATFORM_ORDER.filter((id) => !FOLDED.includes(id) || ui.allPlatforms || draft.platforms[id] || keepShown.has(id));
  for (const id of ids) if (FOLDED.includes(id)) keepShown.add(id);
  return ids;
}
function foldToggle(shown) {
  const hidden = PLATFORM_ORDER.length - shown.length;
  if (!hidden && !ui.allPlatforms) return null;
  const open = !!ui.allPlatforms;
  return h('button', {
    class: 'more-pf',
    'aria-expanded': String(open),
    onClick: () => {
      ui.allPlatforms = !open;
      if (open) keepShown.clear();
      saveUi();
      renderPlatforms();
    },
  }, h('span', { text: open ? t('Show fewer') : t('More') }), I.chevron());
}

function renderPlatforms() {
  const slot = $('#pf-slot');
  if (!slot) return;
  const info = analyze();
  const shown = shownIds();
  if (ui.view === 'loop') {
    const width = slot.clientWidth || 352;
    slot.replaceChildren(stage(width, (pts) => shown.map((id, i) => {
      const [x, y] = pts[i];
      const on = !!draft.platforms[id];
      const issue = hasIssue(id, info);
      return h('div', { class: `node-wrap${issue ? ' has-issue' : ''}`, style: { left: `${x}px`, top: `${y}px` } },
        h('button', { class: 'node', 'data-platform': id, 'aria-label': PLATFORMS[id].name, 'aria-pressed': String(on), onClick: () => togglePlatform(id) }, glyph(id, 20)),
        on ? h('button', { class: 'adjust', 'data-settings': id, 'aria-label': t('{platform} settings', { platform: PLATFORMS[id].name }), onClick: () => openPlatformSheet(id) }, I.sliders()) : null);
    }), (w, hgt) => [centerStack(w, hgt)], shown.length), foldToggle(shown) || '');
  } else {
    slot.replaceChildren(h('div', { class: 'tiles' }, shown.map((id) => {
      const on = !!draft.platforms[id];
      const issue = hasIssue(id, info);
      return h('div', { class: `tile-wrap${issue ? ' has-issue' : ''}` },
        h('button', { class: 'tile', 'data-platform': id, 'aria-pressed': String(on), onClick: () => togglePlatform(id) },
          h('span', { class: 'disc' }, glyph(id, 20)), h('span', { class: 'tile-name', text: PLATFORMS[id].name })),
        on ? h('button', { class: 'adjust', 'data-settings': id, 'aria-label': t('{platform} settings', { platform: PLATFORMS[id].name }), onClick: () => openPlatformSheet(id) }, I.sliders()) : null);
    })), foldToggle(shown) || '');
  }
}

function centerStack(w, hgt) {
  const list = orderedMedia();
  const style = { left: `${w / 2}px`, top: `${hgt / 2}px` };
  if (!list.length) return h('button', { class: 'stack-empty', style, 'aria-label': t('Add media'), onClick: () => $('#file-input').click() }, I.plus());
  const first = list[0];
  const face = coverActive() ? h('img', { src: coverView.url, alt: '' }) : isVideo(first) ? h('video', { src: first.url, muted: true, preload: 'metadata' }) : h('img', { src: first.url, alt: '' });
  return h('button', { class: 'stack', style, 'aria-label': t('Media ({n})', { n: list.length }), onClick: () => (firstVideo() ? openCoverSheet() : $('#file-input').click()) },
    h('span', { class: 's s1' }), h('span', { class: 's s2' }), h('span', { class: 'front' }, face),
    h('span', { class: 'num', text: String(list.length) }),
    firstVideo() ? h('span', { class: 'chip' }, I.play(9), coverActive() && draft.cover.mode === 'frame' ? fmtTime(draft.cover.time, true) : t('Cover')) : null);
}

/** Turn off platforms whose site access was taken away in chrome://extensions. */
async function dropRevoked() {
  let changed = false;
  for (const id of PLATFORM_ORDER) {
    const access = PLATFORMS[id].access;
    if (draft.platforms[id] && access && !(await chrome.permissions.contains({ origins: access }).catch(() => false))) {
      draft.platforms[id] = false;
      changed = true;
    }
  }
  return changed;
}

async function togglePlatform(id) {
  const on = !draft.platforms[id];
  const access = PLATFORMS[id].access;
  // Asked on the tap itself: Chrome only shows the prompt for a user gesture.
  if (on && access && !(await chrome.permissions.request({ origins: access }).catch(() => false))) return;
  draft.platforms[id] = on;
  save();
  renderPlatforms();
  updateCompose();
}

function updateCompose() {
  if (screen !== 'compose') return;
  const info = analyze();
  const sel = selectedIds();
  const problems = groupIssues(info, 'problems');
  const warnings = groupIssues(info, 'warnings');
  const blocked = !sel.length || problems.length > 0 || runActive();
  $('#pf-count').textContent = sel.length ? String(sel.length) : '';
  $('#publish-count').textContent = sel.length ? String(sel.length) : '';
  $('#publish').disabled = blocked;
  // issue dots follow the current problems
  for (const id of PLATFORM_ORDER) {
    const issue = hasIssue(id, info);
    $(`.tile[data-platform="${id}"]`)?.parentElement.classList.toggle('has-issue', issue);
    $(`.node[data-platform="${id}"]`)?.parentElement.classList.toggle('has-issue', issue);
  }
  const chips = [
    ...problems.map((p) => h('button', { class: 'issue', onClick: () => openPlatformSheet(p.ids[0]), text: p.text })),
    ...warnings.map((p) => h('button', { class: 'issue soft', onClick: () => openPlatformSheet(p.ids[0]), text: p.text })),
  ];
  if (!sel.length) chips.unshift(h('span', { class: 'issue soft', text: t('Pick a platform') }));
  $('#issues').replaceChildren(...(isBlank() ? [] : chips.slice(0, 3)));
}

function refreshCompose() {
  if (screen !== 'compose') return;
  renderMedia();
  renderPlatforms();
  updateCompose();
}

async function publish() {
  const list = orderedMedia();
  const jobs = selectedIds().map((id) => {
    const used = mediaFor(id, list, draft.mediaPick[id]);
    return {
      platform: id,
      payload: { title: titleFor(id), text: textFor(id), media: used.map(meta), cover: coverFor(id, used), covers: coversFor(id, used), options: { ...draft.options[id] } },
    };
  });
  $('#publish').disabled = true;
  const res = await chrome.runtime.sendMessage({ type: 'run:start', autoSend: draft.autoSend, jobs });
  if (res?.error) {
    $('#issues').replaceChildren(h('span', { class: 'issue', text: res.error }));
    updateCompose();
  }
}

// ── menu ───────────────────────────────────────────────────────────────────────

function toggleMenu(anchor) {
  const open = $('.menu');
  if (open) return open.remove();
  const themeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('Appearance') },
    ['light', 'dark'].map((mode) => h('button', {
      role: 'radio', 'aria-checked': String(ui.theme === mode), 'data-theme-choice': mode,
      onClick: () => {
        ui.theme = mode;
        saveUi();
        applyTheme();
        $$('[data-theme-choice]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeChoice === mode)));
      },
    }, mode === 'light' ? I.sun() : I.moon(), mode === 'light' ? t('Light') : t('Dark'))));
  const clear = h('button', {
    class: 'menu-item', role: 'menuitem', id: 'clear-draft',
    onClick: () => {
      if (!clear.classList.contains('armed')) {
        clear.classList.add('armed');
        clear.lastChild.textContent = t('Clear it');
        return;
      }
      menu.remove();
      clearDraft();
    },
  }, I.trash(), h('span', { text: t('Clear draft') }));
  const support = SUPPORT.map((s) =>
    h('a', { class: 'menu-item', role: 'menuitem', href: s.url, target: '_blank', rel: 'noreferrer', 'data-support': s.id },
      svg(`<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${s.path}"/></svg>`), s.label));
  const langItem = h('button', {
    class: 'menu-item', role: 'menuitem', id: 'lang-menu',
    onClick: () => { menu.remove(); openLangSheet(); },
  }, I.globe(), h('span', { text: t('Language') }), h('span', { class: 'menu-val', text: ui.lang === 'auto' ? t('Automatic') : I18N.LANGS[ui.lang] }));
  const menu = h('div', { class: 'menu', role: 'menu' }, themeSeg, langItem, screen === 'compose' ? clear : null,
    support.length ? h('div', { class: 'menu-sep' }) : null, support);
  anchor.closest('.top').append(menu);
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target) && e.target !== anchor) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  }), 0);
}

function openLangSheet() {
  openSheet(t('Language'), (sheet) => {
    const choices = [['auto', `${t('Automatic')} · ${I18N.LANGS[I18N.resolve('auto')]}`], ...Object.entries(I18N.LANGS)];
    const list = h('div', { class: 'choice-list', role: 'radiogroup', 'aria-label': t('Language') },
      choices.map(([code, label]) => h('button', {
        class: 'choice', role: 'radio', 'aria-checked': String(ui.lang === code), 'data-lang': code,
        lang: code === 'auto' ? null : code,
        onClick: () => setLang(code),
      }, h('span', { text: label }), ui.lang === code ? I.check(14) : null)));
    sheet.append(h('div', { class: 'grabber' }), sheetHead(t('Language')), list);
  });
}

async function clearDraft() {
  for (const m of media.values()) URL.revokeObjectURL(m.url);
  media.clear();
  if (coverView) URL.revokeObjectURL(coverView.url);
  coverView = null;
  for (const v of slotViews.values()) URL.revokeObjectURL(v.url);
  slotViews.clear();
  await clearMedia();
  draft = { ...defaultDraft(), platforms: draft.platforms, options: draft.options, autoSend: draft.autoSend };
  await chrome.storage.local.set({ draft });
  mount(true);
}

// ── sheets ─────────────────────────────────────────────────────────────────────

function openSheet(label, build) {
  closeSheet();
  const sheet = h('section', { class: 'sheet', role: 'dialog', 'aria-label': label, 'aria-modal': 'true' });
  const backdrop = h('div', { class: 'backdrop', id: 'sheet', onClick: (e) => { if (e.target === backdrop) closeSheet(); } }, sheet);
  build(sheet);
  document.body.append(backdrop);
  backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  setTimeout(() => sheet.querySelector('input, textarea, button')?.focus({ preventScroll: true }), 50);
}
function closeSheet() {
  $('#sheet')?.remove();
  if (screen === 'compose') refreshCompose();
}
const sheetHead = (title, lead) =>
  h('div', { class: 'sheet-head' }, lead, h('h2', { text: title }), h('button', { class: 'round sunk', 'aria-label': t('Close'), onClick: closeSheet }, I.close()));
const done = (label = t('Done'), onClick = closeSheet) => h('button', { class: 'primary center', style: { marginTop: '6px', flex: 'none' }, onClick }, h('span', { class: 'word', text: label }));

function overrideRow(id, field, label, base, followLabel) {
  const input = field === 'title' ? h('input', { type: 'text', 'data-field': field }) : h('textarea', { 'data-field': field, rows: '1' });
  input.value = draft.overrides[id][field] || '';
  input.placeholder = (base || '').split('\n').find(Boolean) || label;
  const follow = h('span', { class: 'follow', text: followLabel });
  follow.hidden = !!input.value.trim();
  // How much of the platform's limit this field uses, as it will be sent.
  const count = h('span', { class: 'count', 'data-count': field });
  const tally = () => {
    const { len, limit } = fieldUse(id, field);
    count.hidden = !limit;
    count.textContent = limit ? `${len} / ${limit}` : '';
    count.classList.toggle('over', !!limit && len > limit);
  };
  tally();
  input.addEventListener('input', () => {
    draft.overrides[id][field] = input.value;
    follow.hidden = !!input.value.trim();
    tally();
    save();
  });
  return h('label', { class: 'field-row' }, h('span', { class: 'k', text: label }), input, follow, count);
}

function optionControl(id, o) {
  const value = draft.options[id][o.key];
  const set = (v) => { draft.options[id][o.key] = v; save(); };
  if (o.type === 'checkbox') {
    const sw = h('button', { class: 'switch-btn', role: 'switch', 'aria-checked': String(!!value), 'aria-label': o.label, 'data-opt': o.key },
      h('span', { class: 'switch', 'aria-checked': String(!!value) }));
    sw.addEventListener('click', () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      sw.firstChild.setAttribute('aria-checked', String(next));
      set(next);
    });
    return h('div', { class: 'opt-row' }, h('span', { class: 'k', text: o.label }), sw);
  }
  if (o.type === 'select') {
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label, 'data-opt': o.key },
      o.choices.map(([v, t]) => h('button', { role: 'radio', 'aria-checked': String(value === v), 'data-value': v, text: t.replace(/（.*）/, ''),
        onClick: (e) => {
          set(v);
          $$('button', e.currentTarget.parentElement).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
        } })));
    return h('div', { class: 'opt-col' }, h('span', { class: 'k', text: o.label }), seg);
  }
  if (o.type === 'board') {
    const names = [...new Set([...boards, ...(value ? [value] : [])])];
    const list = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Board', 'data-opt': o.key },
      [['', t('Last used')], ...names.map((n) => [n, n])].map(([v, t]) => h('button', { class: 'choice', role: 'radio', 'aria-checked': String((value || '') === v), 'data-value': v,
        onClick: (e) => {
          set(v);
          $$('.choice', e.currentTarget.parentElement).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
        } }, t, h('span', { class: 'tick' }, I.check(11)))));
    return h('div', { class: 'opt-col' }, h('span', { class: 'k', text: 'Board' }), list);
  }
  const input = h('input', { type: 'text', placeholder: o.placeholder?.replace(/（.*）/, '') || '', 'data-opt': o.key });
  input.value = value || '';
  input.addEventListener('input', () => set(input.value));
  return h('label', { class: 'field-row' }, h('span', { class: 'k', text: o.label }), input);
}

/** Which media this platform gets: tap to swap items in or out. */
function mediaPicker(id) {
  const list = orderedMedia();
  const limit = mediaLimit(id);
  const required = !!PLATFORMS[id].media.required;
  const either = !!PLATFORMS[id].media.either; // images, or one video
  const count = h('span', { class: 'count' });
  const grid = h('div', { class: 'picks', 'data-picks': id });
  const draw = () => {
    const used = mediaFor(id, list, draft.mediaPick[id]);
    const ids = used.map((m) => m.id);
    count.textContent = `${used.length} / ${Math.min(limit, list.filter((m) => mediaAccepts(id, m)).length)}`;
    grid.replaceChildren(...list.map((m) => {
      const ok = mediaAccepts(id, m);
      const at = ids.indexOf(m.id);
      const btn = h('button', {
        class: 'pick', 'data-id': m.id, 'aria-pressed': String(at >= 0), disabled: !ok, title: m.name,
        onClick: () => {
          let next;
          if (at >= 0) {
            if (required && ids.length === 1) return shake(btn);
            next = ids.filter((x) => x !== m.id);
          } else if (limit === 1 || (either && (isVideo(m) || used.some(isVideo)))) next = [m.id];
          else if (ids.length >= limit) return shake(btn);
          else next = [...ids, m.id];
          const auto = mediaFor(id, list).map((x) => x.id);
          const same = next.length === auto.length && auto.every((x) => next.includes(x));
          if (same) delete draft.mediaPick[id];
          else draft.mediaPick[id] = next;
          save();
          draw();
        },
      },
        isVideo(m) ? h('video', { src: m.url, muted: true, preload: 'metadata' }) : h('img', { src: m.url, alt: '' }),
        at >= 0 && limit > 1 ? h('span', { class: 'num', text: String(at + 1) }) : null,
        at >= 0 && limit === 1 ? h('span', { class: 'num' }, I.check(10)) : null);
      return btn;
    }));
  };
  draw();
  return h('div', { class: 'group' }, h('div', { class: 'opt-col' }, h('div', { class: 'head-row' }, h('span', { class: 'k', text: t('Media') }), count), grid));
}
function shake(node) {
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
}

function openPlatformSheet(id) {
  const p = PLATFORMS[id];
  openSheet(t('{platform} settings', { platform: p.name }), (sheet) => {
    const content = h('div', { class: 'group' });
    if (p.title) content.append(overrideRow(id, 'title', p.title.label || t('Title'), titleFor(id) || orElse(draft.title, titleFrom(ownText(id), p.title.limit)), t('Same as draft')), h('div', { class: 'sep' }));
    content.append(overrideRow(id, 'text', p.body.label || t('Text'), orElse(draft.text, ownTitle(id)), t('Same as text')));

    const picker = p.media.max && orderedMedia().length ? mediaPicker(id) : null;
    const opts = (p.options || []).map((o) => optionControl(id, o));
    const optGroup = opts.length ? h('div', { class: 'group' }, opts.flatMap((o, i) => (i ? [h('div', { class: 'sep' }), o] : [o]))) : null;

    let coverRow = null;
    const video = firstVideo();
    const sends = mediaFor(id, orderedMedia(), draft.mediaPick[id]);
    if ((p.cover && sends.some(isVideo)) || (p.headerImage && (video || orderedMedia().length))) {
      const label = p.headerImage ? t('Header image') : id === 'youtube' ? t('Thumbnail') : t('Cover');
      const own = (p.coverSlots || []).filter((s) => slotViews.has(`${id}:${s.key}`));
      const face = own.length ? h('img', { src: slotViews.get(`${id}:${own[0].key}`).url, alt: '' })
        : coverActive() ? h('img', { src: coverView.url, alt: '' }) : video ? h('video', { src: video.url, muted: true }) : null;
      const val = own.length ? own.map((s) => s.ratio.join(':')).join(' · ')
        : coverActive() ? (draft.cover.mode === 'frame' ? fmtTime(draft.cover.time, true) : t('Image')) : t('Default');
      coverRow = h('button', { class: 'row-btn', 'data-cover-row': id, onClick: () => (p.coverSlots ? openSlotsSheet(id) : openCoverSheet()) },
        h('span', { class: 'mini' }, face), h('span', { class: 'label', text: label }), h('span', { class: 'val', text: val }), I.chevron());
    }
    sheet.append(...[h('div', { class: 'grabber' }), sheetHead(p.name, h('span', { class: 'glyph-disc' }, glyph(id, 22))), content, picker, optGroup, coverRow, done()].filter(Boolean));
  });
}

/** One tile per aspect ratio, drawn at the same height; tap one to give it its own image. */
function openSlotsSheet(id) {
  const p = PLATFORMS[id];
  const video = firstVideo();
  openSheet(t('Cover'), (sheet) => {
    const row = h('div', { class: 'slots' });
    const draw = () => row.replaceChildren(...p.coverSlots.map((s) => {
      const key = `${id}:${s.key}`;
      const own = slotViews.get(key);
      const face = own ? h('img', { src: own.url, alt: '' })
        : coverActive() ? h('img', { src: coverView.url, alt: '' })
        : video ? h('video', { src: video.url, muted: true, preload: 'metadata' }) : null;
      const pick = () => {
        const input = $('#cover-file');
        input.onchange = async (e) => {
          let f = e.target.files[0];
          e.target.value = '';
          if (!f) return;
          if (!/^image\/(jpeg|png)$/.test(f.type)) f = await asJpeg(f);
          await storeSlot(key, f);
          draw();
        };
        input.click();
      };
      const ratio = s.ratio.join(':');
      return h('div', { class: 'slot', style: { flex: `${s.ratio[0] / s.ratio[1]} 1 0` } },
        h('button', { class: 'slot-face', 'data-slot': s.key, style: { aspectRatio: s.ratio.join(' / ') }, 'aria-label': `${s.label} ${ratio}`, onClick: pick },
          face, h('span', { class: 'ratio', text: ratio })),
        own ? h('button', { class: 'rm', 'aria-label': t('Same as video cover'), onClick: async () => { await dropSlot(key); draw(); } }, stroke('<path d="M6 6l12 12M18 6L6 18"/>', 11, 2.6)) : null,
        h('div', { class: 'slot-cap' }, h('span', { class: 'k', text: s.label }), h('span', { class: 'v', text: own ? t('Image') : t('Same as video cover') })));
    }));
    draw();
    sheet.append(h('div', { class: 'grabber' }), sheetHead(t('Cover')), row, done());
  });
}

function openCoverSheet() {
  const video = firstVideo();
  if (!video) return;
  openSheet(t('Video cover'), (sheet) => {
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
    const modes = [['frame', t('Pick a frame')], ['image', t('Upload an image')], ['auto', t('Platform default')]];
    let mode = draft.cover.mode === 'auto' && !coverView ? 'frame' : draft.cover.mode;
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('Cover source') },
      modes.map(([m, t]) => h('button', { role: 'radio', 'data-cover-mode': m, 'aria-checked': String(mode === m), text: t,
        onClick: () => { mode = m; $$('[data-cover-mode]', seg).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.coverMode === m))); draw(); } })));

    const draw = () => {
      if (mode === 'frame') body.replaceChildren(...frameEditor(video));
      else if (mode === 'image') body.replaceChildren(...imagePicker());
      else body.replaceChildren(
        h('div', { class: 'preview' }, h('video', { src: video.url, muted: true, preload: 'auto' })),
        done(t('Use the platform default'), async () => { draft.cover = { ...draft.cover, mode: 'auto' }; save(); closeSheet(); }));
    };
    sheet.append(h('div', { class: 'grabber' }), sheetHead(t('Video cover')), seg, body);
    draw();
  });
}

function frameEditor(video) {
  const v = h('video', { src: video.url, muted: true, playsinline: true, preload: 'auto' });
  const strip = h('div', { class: 'strip' });
  const head = h('div', { class: 'playhead' });
  const time = h('div', { class: 'playtime' });
  const range = h('input', { class: 'scrub', type: 'range', min: '0', step: '0.04', value: '0', 'aria-label': t('Choose a frame') });
  const place = (at) => {
    const d = v.duration || 1;
    const pct = Math.min(100, Math.max(0, (at / d) * 100));
    head.style.left = `${pct}%`;
    time.style.left = `clamp(28px, ${pct}%, calc(100% - 28px))`;
    time.textContent = fmtTime(at, true);
  };
  const preview = h('div', { class: 'preview' }, v);
  v.addEventListener('loadedmetadata', async () => {
    if (v.videoWidth) preview.style.setProperty('--ar', `${v.videoWidth} / ${v.videoHeight}`);
    range.max = String(v.duration || 0);
    const at = draft.cover.mode === 'frame' && draft.cover.videoId === video.id ? draft.cover.time : Math.min(1, (v.duration || 0) / 3);
    range.value = String(at);
    v.currentTime = at;
    place(at);
    fillStrip(video.url, strip);
  });
  range.addEventListener('input', () => { v.currentTime = Number(range.value); place(Number(range.value)); });
  const use = done(t('Use this frame'), async () => {
    if (!v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    await storeCover(blob, `cover-${Math.round(v.currentTime * 10) / 10}s.jpg`);
    draft.cover = { mode: 'frame', time: v.currentTime, duration: v.duration || 0, videoId: video.id };
    save();
    closeSheet();
  });
  use.id = 'cover-use';
  return [preview, h('div', { class: 'strip-wrap' }, time, strip, head, range), use];
}

/** Eight evenly spaced frames for the filmstrip, drawn from a second hidden video. */
async function fillStrip(url, strip) {
  const cells = Array.from({ length: 8 }, () => h('canvas', { width: '60', height: '70' }));
  strip.replaceChildren(...cells);
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  await new Promise((r) => { v.onloadeddata = r; v.onerror = r; });
  if (!v.duration || !v.videoWidth) return;
  for (let i = 0; i < 8; i++) {
    if (!strip.isConnected) return;
    v.currentTime = (v.duration * (i + 0.5)) / 8;
    await new Promise((r) => { v.onseeked = r; setTimeout(r, 1500); });
    const c = cells[i];
    const ctx = c.getContext('2d');
    const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
    const w = v.videoWidth * s, hh = v.videoHeight * s;
    ctx.drawImage(v, (c.width - w) / 2, (c.height - hh) / 2, w, hh);
  }
}

function imagePicker() {
  const preview = h('div', { class: 'preview' });
  const show = () => preview.replaceChildren(draft.cover.mode === 'image' && coverView ? h('img', { src: coverView.url, alt: '' }) : h('span'));
  show();
  const input = $('#cover-file');
  input.onchange = async (e) => {
    let f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    // TikTok, Bilibili and YouTube covers take JPEG or PNG only.
    if (!/^image\/(jpeg|png)$/.test(f.type)) f = await asJpeg(f);
    await storeCover(f, f.name || 'cover.jpg');
    draft.cover = { mode: 'image', time: 0, videoId: null };
    save();
    show();
  };
  return [preview, h('button', { class: 'secondary', style: { width: '100%' }, onClick: () => input.click(), text: t('Choose an image') }), done()];
}

// ── run screens ────────────────────────────────────────────────────────────────

const pct = (msg) => {
  const m = (msg || '').match(/(\d{1,3})\s*%/);
  return m ? Math.min(1, Number(m[1]) / 100) : null;
};

/** How one job looks: ring, words, actions. */
function jobLook(j) {
  const s = j.status;
  const p = pct(j.message);
  const look = { ring: 'var(--fg)', frac: 1, spin: false, dashed: false, done: false, text: j.message || STATUS[s]?.label || s, cls: '' };
  if (s === 'queued') Object.assign(look, { ring: 'var(--faint)', dashed: true, text: t('Queued') });
  else if (['opening', 'filling', 'uploading', 'sending'].includes(s)) Object.assign(look, p != null ? { frac: p } : { frac: 0.25, spin: true });
  else if (s === 'ready') Object.assign(look, { ring: 'var(--wait)', cls: 'wait' });
  else if (s === 'done') Object.assign(look, { done: true, text: j.message && j.message !== t('Posted') ? j.message : t('Posted') });
  else if (s === 'error') Object.assign(look, { ring: 'var(--bad)', cls: 'bad' });
  else if (s === 'cancelled') Object.assign(look, { ring: 'var(--faint)', dashed: true, text: t('Cancelled') });
  else if (s === 'unknown') Object.assign(look, { ring: 'var(--faint)' });
  if (s === 'opening') look.text = t('Opening');
  if (s === 'sending') look.text = t('Sending');
  return look;
}

function ringSvg(size, r, look) {
  const C = 2 * Math.PI * r;
  const dash = look.dashed ? '2 7' : `${(look.frac * C).toFixed(1)} ${C.toFixed(1)}`;
  return svg(`<svg class="r${look.spin ? ' spin' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-rest)" stroke-width="2.5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${look.ring}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${dash}"/></svg>`);
}

function jobActions(j) {
  const s = j.status;
  const out = [];
  if (s === 'done' && j.url) out.push(h('a', { class: 'chip-btn', href: j.url, target: '_blank', rel: 'noreferrer' }, t('Open'), I.arrowUR(12)));
  if (s === 'ready') out.push(h('button', { class: 'chip-btn inv', 'data-focus': j.id, onClick: () => send('job:focus', { jobId: j.id }), text: t('Go to tab') }));
  if (s === 'error') {
    if (j.debug) out.push(h('button', { class: 'round sunk', 'aria-label': t('Copy diagnostics'), title: t('Copy diagnostics'), 'data-copy': j.id, onClick: (e) => copyDiagnostics(j, e.currentTarget) }, I.copy()));
    out.push(h('button', { class: 'chip-btn', 'data-retry': j.id, onClick: () => send('job:retry', { jobId: j.id }), text: t('Retry') }));
  }
  if (['opening', 'filling', 'uploading', 'sending', 'unknown'].includes(s) && j.tabId) {
    out.push(h('button', { class: 'round sunk', 'aria-label': t('Go to this tab'), onClick: () => send('job:focus', { jobId: j.id }) }, I.arrowR()));
  }
  return out;
}

function jobRow(j) {
  const look = jobLook(j);
  return h('li', { class: 'job', 'data-job': j.platform, 'data-status': j.status },
    h('span', { class: `ringed${look.done ? ' done' : ''}` }, ringSvg(48, 22, look), h('span', { class: 'core' }, glyph(j.platform, 18)),
      look.done ? h('span', { class: 'badge' }, I.check(10)) : null),
    h('span', { class: 'job-main' }, h('span', { class: 'job-name', text: PLATFORMS[j.platform].name }), h('span', { class: `job-status ${look.cls}`, text: look.text, title: look.text })),
    h('span', { class: 'job-actions' }, jobActions(j)));
}

const RANK = { ready: 0, error: 1, sending: 2, uploading: 3, filling: 4, opening: 5, queued: 6, unknown: 7, done: 8, cancelled: 9 };

function buildRun() {
  const app = $('#app');
  const active = runActive();
  const jobs = run.jobs;
  const okCount = jobs.filter((j) => j.status === 'done').length;
  const badCount = jobs.filter((j) => ['error', 'unknown', 'cancelled'].includes(j.status)).length;
  const sorted = [...jobs].sort((a, b) => RANK[a.status] - RANK[b.status]);

  let top;
  if (active) {
    top = h('div', { class: 'run-title' },
      h('h1', {}, t('Posting'), h('span', { class: 'of', text: `${okCount} / ${jobs.length}` })), viewSwitch());
  } else {
    const secs = Math.max(1, Math.round((Math.max(...jobs.map((j) => j.updatedAt)) - run.startedAt) / 1000));
    const dur = secs >= 60 ? t('{m} min {s} s', { m: Math.floor(secs / 60), s: secs % 60 }) : t('{n} s', { n: secs });
    const stopped = !okCount && jobs.every((j) => j.status === 'cancelled');
    top = h('div', { class: 'hero' },
      h('span', { class: `big${badCount ? ' mixed' : ''}` }, badCount ? `${okCount}/${jobs.length}` : I.check(38)),
      h('h1', { text: stopped ? t('Stopped') : badCount ? t('Finished') : t('All posted') }),
      h('p', { text: badCount ? t('{ok} posted · {bad} failed', { ok: okCount, bad: badCount }) : t('{n} platforms · {time}', { n: jobs.length, time: dur }) }));
  }

  let main;
  if (ui.view === 'loop' && active) {
    const attention = sorted.filter((j) => ['ready', 'error'].includes(j.status));
    main = h('div', { class: 'scroll' },
      h('section', { class: 'card platforms', 'aria-label': t('Progress') },
        stage(352, (pts) => {
          const n = jobs.length;
          const N = PLATFORM_ORDER.length;
          const step = N / n;
          return jobs.map((j, i) => {
            const [x, y] = pts[Math.round(i * step) % N];
            const look = jobLook(j);
            return h('span', { class: `node-ring${look.done ? ' done' : ''}`, role: 'img', 'aria-label': `${PLATFORMS[j.platform].name}：${look.text}`, style: { left: `${x}px`, top: `${y}px` } },
              ringSvg(64, 28, look), h('span', { class: 'core' }, glyph(j.platform, 20)));
          });
        }, () => [h('div', { class: 'loop-center' }, h('span', { class: 'n' }, String(okCount), h('span', { text: `/${jobs.length}` })))])),
      attention.length ? h('ul', { class: 'card jobs' }, attention.map(jobRow)) : null);
  } else {
    main = h('div', { class: 'scroll' }, h('ul', { class: 'card jobs', id: 'jobs' }, sorted.map(jobRow)));
  }

  const bar = active
    ? h('footer', { class: 'bar' }, h('button', { class: 'secondary', id: 'stop', onClick: () => send('run:cancel'), text: t('Stop') }))
    : h('footer', { class: 'bar' },
        h('button', { class: 'secondary', id: 'keep-draft', onClick: () => send('run:clear'), text: t('Keep draft') }),
        h('button', { class: 'primary center', id: 'new-draft', onClick: async () => { await send('run:clear'); await clearDraft(); } }, h('span', { class: 'word', text: t('New draft') })));

  app.replaceChildren(header(), top, main, bar);
}

async function copyDiagnostics(job, button) {
  const text = [
    t('Oloop {version} diagnostics', { version: chrome.runtime.getManifest().version }),
    t('Platform: {platform}', { platform: PLATFORMS[job.platform].name }),
    t('Status: {status} — {message}', { status: STATUS[job.status]?.label || job.status, message: job.message || '' }),
    t('Browser: {ua}', { ua: navigator.userAgent }),
    '---',
    job.debug || '',
  ].join('\n');
  await navigator.clipboard.writeText(text);
  button.classList.add('copied');
  button.replaceChildren(I.check(14));
}

async function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

// ── mounting ───────────────────────────────────────────────────────────────────

function mount(force = false) {
  const next = run ? 'run' : 'compose';
  if (next === 'compose') {
    if (force || screen !== 'compose') {
      screen = 'compose';
      buildCompose();
    } else updateCompose();
  } else {
    const sig = JSON.stringify([ui.view, ui.theme, run.jobs.map((j) => [j.id, j.status, j.message, j.url, !!j.debug, !!j.tabId])]);
    if (!force && screen === 'run' && sig === runSig) return;
    runSig = sig;
    screen = 'run';
    closeSheet();
    buildRun();
  }
}

const isFileDrag = (e) => !dragId && Array.from(e.dataTransfer?.types || []).includes('Files');

async function init() {
  const stored = await chrome.storage.local.get(['draft', 'ui', 'pinterestBoards']);
  draft = mergeDraft(stored.draft);
  ui = { ...ui, ...(stored.ui || {}) };
  boards = stored.pinterestBoards?.names || [];
  applyTheme();
  applyLang();
  try { localStorage.setItem('oloop-theme', ui.theme); } catch {}

  const alive = [];
  for (const id of draft.mediaOrder) {
    const rec = await getMedia(id).catch(() => null);
    if (rec) {
      addMediaView(rec);
      alive.push(id);
    }
  }
  draft.mediaOrder = alive;
  const cover = await getMedia(COVER_ID).catch(() => null);
  if (cover) coverView = { name: cover.name, type: cover.type, size: cover.size, url: URL.createObjectURL(cover.blob) };
  for (const key of Object.keys(draft.coverSlots)) {
    const rec = await getMedia(slotId(key)).catch(() => null);
    if (rec) slotViews.set(key, { name: rec.name, type: rec.type, size: rec.size, url: URL.createObjectURL(rec.blob) });
    else delete draft.coverSlots[key];
  }
  await dropRevoked();
  chrome.permissions.onRemoved?.addListener(async () => {
    if (await dropRevoked()) {
      save();
      renderPlatforms();
      updateCompose();
    }
  });

  $('#file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  const flush = () => { clearTimeout(saveTimer); chrome.storage.local.set({ draft }); };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  document.addEventListener('dragover', (e) => {
    if (!isFileDrag(e) || screen !== 'compose') return;
    e.preventDefault();
    $('#dropzone')?.classList.add('active');
  });
  document.addEventListener('dragleave', (e) => { if (e.target === document.documentElement) $('#dropzone')?.classList.remove('active'); });
  document.addEventListener('drop', (e) => {
    $('#dropzone')?.classList.remove('active');
    if (!isFileDrag(e) || screen !== 'compose') return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length && screen === 'compose') {
      e.preventDefault();
      addFiles(files);
    }
  });

  const { run: current } = await chrome.storage.session.get('run');
  run = current || null;
  mount(true);

  chrome.storage.session.onChanged.addListener((changes) => {
    if (!changes.run) return;
    run = changes.run.newValue || null;
    mount();
  });
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.pinterestBoards) boards = changes.pinterestBoards.newValue?.names || [];
  });
}

init();
