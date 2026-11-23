// Platform definitions shared by the side panel and the background worker.
// Content-script adapters live in /content/<id>.js.
//
//   title:  null (platform has no title) | { required, limit }
//   body:   { required, limit, weighted (X counting), soft (over limit = warning only), label }
//   media:  { max, required, video (exactly one video), images (images only),
//             either (images, or one video — not both) }
//           max = what the platform's own composer takes (X 20 on the web since Nov 2026;
//           Instagram and Threads carousels 20)
//   cover:  can upload a custom cover image for the video
//   beta:   adapter not yet checked against the live site → always stops before sending
//   options: per-platform settings shown on the card

import { t } from './t.js';

export const PLATFORMS = {
  x: {
    id: 'x',
    name: 'X',
    composeUrl: 'https://x.com/compose/post',
    title: null,
    body: { limit: 280, weighted: true, soft: true },
    media: { max: 20 },
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    composeUrl: 'https://www.threads.com/',
    title: null,
    body: { limit: 500 },
    media: { max: 20 },
    beta: true,
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    composeUrl: 'https://www.instagram.com/',
    title: null,
    body: { limit: 2200 },
    media: { max: 20, required: true },
    cover: true,
    options: [{ key: 'keepOriginalRatio', get label() { return t('Keep original ratio'); }, type: 'checkbox', default: true }],
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    composeUrl: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
    title: null,
    body: { limit: 4000 },
    media: { max: 1, video: true, required: true },
    cover: true,
    beta: true,
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    composeUrl: 'https://www.youtube.com/upload',
    title: { required: true, limit: 100 },
    body: { limit: 5000, get label() { return t('Description'); } },
    media: { max: 1, video: true, required: true },
    cover: true,
    options: [
      { key: 'madeForKids', get label() { return t('Made for kids'); }, type: 'checkbox', default: true },
      {
        key: 'visibility',
        get label() { return t('Visibility'); },
        type: 'select',
        default: 'PUBLIC',
        get choices() {
          return [
            ['PUBLIC', t('Public')],
            ['UNLISTED', t('Unlisted')],
            ['PRIVATE', t('Private')],
          ];
        },
      },
    ],
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    composeUrl: 'https://www.pinterest.com/pin-creation-tool/',
    title: { required: false, limit: 100 },
    body: { limit: 500 },
    media: { max: 1, required: true },
    cover: true, // video Pins: "Edit cover"
    beta: true,
    options: [
      { key: 'board', label: 'Board', type: 'board', default: '' },
      { key: 'link', get label() { return t('Link'); }, type: 'text', placeholder: 'https://' },
    ],
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    get name() { return t('RedNote'); },
    composeUrl: 'https://creator.xiaohongshu.com/publish/publish?source=official',
    title: { limit: 20 },
    body: { limit: 1000 },
    media: { max: 18, required: true, either: true },
    cover: true,
    beta: true,
  },
  bilibili: {
    id: 'bilibili',
    name: 'Bilibili',
    composeUrl: 'https://member.bilibili.com/platform/upload/video/frame',
    title: { required: true, limit: 80 },
    body: { limit: 2000, get label() { return t('Description'); } },
    media: { max: 1, video: true, required: true },
    cover: true,
    beta: true,
    tags: true, // needs at least one tag
    options: [
      // Empty = the #话题 in the body.
      { key: 'tags', type: 'text', get label() { return t('Tags'); }, get placeholder() { return t('#topic'); }, default: '' },
    ],
  },
  note: {
    id: 'note',
    name: 'note',
    composeUrl: 'https://note.com/notes/new',
    title: { required: true },
    body: { required: true },
    media: { max: 0 }, // the cover (or the first image) becomes the 見出し画像
    headerImage: true,
    beta: true,
  },
  naver: {
    id: 'naver',
    get name() { return t('Naver Blog'); },
    composeUrl: 'https://blog.naver.com/GoBlogWrite.naver',
    title: { required: true, limit: 100 },
    body: { required: true },
    media: { max: 20, images: true },
    beta: true,
  },
};

export const PLATFORM_ORDER = ['x', 'threads', 'instagram', 'xiaohongshu', 'tiktok', 'youtube', 'bilibili', 'pinterest', 'note', 'naver'];

export const STATUS = {
  queued: { get label() { return t('Queued'); }, tone: 'idle' },
  opening: { get label() { return t('Opening'); }, tone: 'busy' },
  filling: { get label() { return t('Filling in'); }, tone: 'busy' },
  uploading: { get label() { return t('Processing'); }, tone: 'busy' },
  ready: { get label() { return t('Ready to send'); }, tone: 'wait' },
  sending: { get label() { return t('Sending'); }, tone: 'busy' },
  done: { get label() { return t('Posted'); }, tone: 'ok' },
  unknown: { get label() { return t('Ended'); }, tone: 'idle' },
  error: { get label() { return t('Failed'); }, tone: 'bad' },
  cancelled: { get label() { return t('Cancelled'); }, tone: 'idle' },
};

// A job in one of these states is still filling the form (needs a visible tab to go fast).
export const FOREGROUND = new Set(['opening', 'filling']);
export const TERMINAL = new Set(['done', 'unknown', 'error', 'cancelled']);

const isVideo = (m) => m.type.startsWith('video/');

/** Which of the draft's media a platform will use, in order. */
/** Can this platform take this item at all? */
export function mediaAccepts(platformId, item) {
  const m = PLATFORMS[platformId].media;
  if (!m.max) return false;
  if (m.video) return isVideo(item);
  if (m.images) return !isVideo(item);
  return true;
}

/** How many items this platform takes. */
export const mediaLimit = (platformId) => (PLATFORMS[platformId].media.video ? 1 : PLATFORMS[platformId].media.max);

/**
 * What a platform gets, in draft order. Without a pick: the first items it
 * accepts, up to its limit. With a pick (ids chosen for this platform): those,
 * if they still exist and fit; otherwise it falls back to the default.
 */
export function mediaFor(platformId, media, pick) {
  const ok = media.filter((x) => mediaAccepts(platformId, x));
  const limit = mediaLimit(platformId);
  let chosen = null;
  if (Array.isArray(pick)) {
    if (!pick.length) return []; // chosen: nothing for this platform
    chosen = ok.filter((x) => pick.includes(x.id));
    if (!chosen.length) chosen = null;
  }
  const list = chosen || ok;
  if (PLATFORMS[platformId].media.either) {
    // One video, or images only — whichever comes first.
    if (list[0] && isVideo(list[0])) return [list[0]];
    return list.filter((x) => !isVideo(x)).slice(0, limit);
  }
  return list.slice(0, limit);
}

/** Hashtags written in a body: "#京都 #oloop" → ['京都', 'oloop']. */
export function hashtags(text) {
  return [...new Set(((text || '').match(/#[^\s#]+/g) || []).map((t) => t.slice(1).replace(/[#，。,.!！?？]+$/, '')).filter(Boolean))];
}

/** X's weighted length (twitter-text v3 rules, close enough for a counter). */
export function xLength(text) {
  let len = 0;
  const rest = (text || '').replace(/https?:\/\/\S+/g, () => {
    len += 23;
    return '';
  });
  for (const ch of rest) {
    const cp = ch.codePointAt(0);
    const light =
      cp <= 4351 ||
      (cp >= 8192 && cp <= 8205) ||
      (cp >= 8208 && cp <= 8223) ||
      (cp >= 8242 && cp <= 8247);
    len += light ? 1 : 2;
  }
  return len;
}

export const textLength = (platformId, text) =>
  PLATFORMS[platformId].body.weighted ? xLength(text) : [...(text || '')].length;
