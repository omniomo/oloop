// Oloop — background service worker.
//
// Owns the "run": one publish action fanned out to several platforms.
// All platforms start at once, each in its own tab: pages load, media is read
// and uploads run in parallel. Chrome doesn't render hidden tabs, so the steps
// that need a visible page take turns at the front: a job asks for it
// (job:needFocus), waits in a queue, and gives it back when it is past the
// form (or after a 15 s slice if others are waiting).
//
// Run state lives in chrome.storage.session so it survives the worker being
// suspended; the side panel renders straight from it.

import { PLATFORMS, FOREGROUND, TERMINAL, accessScripts } from './lib/platforms.js';
import { t, I18N } from './lib/t.js';

I18N.load();
import { getMedia } from './lib/db.js';

const CHUNK = 8 * 1024 * 1024; // bytes of media per message (base64 ≈ 10.7 MB)
const WATCHDOG = 'oloop-watchdog';

const enablePanel = () =>
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(enablePanel);
chrome.runtime.onStartup.addListener(enablePanel);
enablePanel();

// --- platforms behind optional access ----------------------------------------
// Their content scripts are registered while the site is allowed, and dropped if
// the user takes access away in chrome://extensions.

async function syncAccessScripts() {
  if (!chrome.scripting?.registerContentScripts) return;
  const have = new Set((await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
  for (const p of Object.values(PLATFORMS)) {
    if (!p.access) continue;
    const allowed = await chrome.permissions.contains({ origins: p.access });
    const scripts = accessScripts(p.id);
    const missing = scripts.filter((s) => !have.has(s.id));
    const present = scripts.filter((s) => have.has(s.id)).map((s) => s.id);
    try {
      if (allowed && missing.length) await chrome.scripting.registerContentScripts(missing);
      if (!allowed && present.length) await chrome.scripting.unregisterContentScripts({ ids: present });
    } catch (e) {
      console.warn('[oloop] content scripts for', p.id, e);
    }
  }
}
chrome.runtime.onInstalled.addListener(syncAccessScripts);
chrome.runtime.onStartup.addListener(syncAccessScripts);
chrome.permissions.onAdded.addListener(syncAccessScripts);
chrome.permissions.onRemoved.addListener(syncAccessScripts);
syncAccessScripts();

// --- run state, serialized through one lock --------------------------------

let lock = Promise.resolve();

/** fn(state) may read/modify state.run (set to null to clear). */
function mutate(fn) {
  const p = lock.then(async () => {
    const { run = null } = await chrome.storage.session.get('run');
    const state = { run };
    const result = await fn(state);
    if (state.run) await chrome.storage.session.set({ run: state.run });
    else await chrome.storage.session.remove('run');
    return result;
  });
  lock = p.catch(() => {});
  return p;
}

const uid = () => crypto.randomUUID().slice(0, 8);

// Which platform gets the visible tab first: the one with the most UI steps.
const FRONT_PREFERENCE = ['instagram', 'xiaohongshu', 'naver', 'note', 'channels', 'tiktok', 'youtube', 'bilibili', 'pinterest', 'threads', 'x'];
const frontRank = (j) => (FRONT_PREFERENCE.indexOf(j.platform) + 100) % 100;

/** Open a tab for every queued job. Safe to call repeatedly. */
async function advance(state) {
  const run = state.run;
  if (!run) return;
  const queued = run.jobs.filter((j) => j.status === 'queued');
  if (queued.length) {
    const front = run.focusJob
      ? null
      : [...queued].sort((a, b) => frontRank(a) - frontRank(b))[0];
    for (const job of queued) {
      const p = PLATFORMS[job.platform];
      try {
        const tab = await chrome.tabs.create({ url: p.composeUrl, active: false });
        Object.assign(job, { status: 'opening', tabId: tab.id, message: t('Opening {platform}', { platform: p.name }), updatedAt: Date.now() });
      } catch (e) {
        Object.assign(job, { status: 'error', message: t('Couldn’t open a tab: {error}', { error: e.message }), updatedAt: Date.now() });
      }
    }
    if (front?.tabId) await giveFocus(run, front);
  }
  await scheduleFront(run);
  if (!run.jobs.some((j) => FOREGROUND.has(j.status))) chrome.alarms.clear(WATCHDOG);
}

const SLICE = 15_000;

/** Drop the front holder / queued jobs that are past the form, then hand the front on. */
async function scheduleFront(run) {
  const filling = (id) => FOREGROUND.has(run.jobs.find((j) => j.id === id)?.status);
  if (run.focusJob && !filling(run.focusJob)) run.focusJob = null;
  run.focusQueue = (run.focusQueue || []).filter(filling);
  if (!run.focusJob && run.focusQueue.length) {
    const next = run.jobs.find((j) => j.id === run.focusQueue[0]);
    run.focusQueue.shift();
    await giveFocus(run, next);
  }
}

async function giveFocus(run, job) {
  if (run.focusJob !== job.id) run.focusSince = Date.now();
  run.focusJob = job.id;
  try {
    const tab = await chrome.tabs.update(job.tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
}

// --- message handlers -------------------------------------------------------

const handlers = {
  // From the side panel: { autoSend, jobs: [{ platform, payload }] }
  'run:start': ({ autoSend, jobs }) =>
    mutate(async (state) => {
      if (state.run && state.run.jobs.some((j) => !TERMINAL.has(j.status))) {
        throw new Error(t('A run is still going. Stop it or wait for it to finish.'));
      }
      state.run = {
        id: uid(),
        startedAt: Date.now(),
        autoSend: !!autoSend,
        jobs: jobs.map((j) => ({
          id: uid(),
          platform: j.platform,
          payload: j.payload,
          autoSend: !!autoSend,
          status: 'queued',
          message: '',
          updatedAt: Date.now(),
        })),
      };
      chrome.alarms.create(WATCHDOG, { periodInMinutes: 0.5 });
      await advance(state);
      return { ok: true };
    }),

  // From a content script that just loaded: is there a job for this tab?
  // A job still filling the form can be claimed again: only the top frame
  // claims, so a new claim means the tab loaded a new page (redirect, reload)
  // and the old one is gone. The adapter simply starts over on the new page.
  'job:claim': ({ platform }, sender) =>
    mutate(async (state) => {
      const tabId = sender.tab?.id;
      const job = state.run?.jobs.find(
        (j) => j.tabId === tabId && j.platform === platform && FOREGROUND.has(j.status),
      );
      if (!job) return null;
      Object.assign(job, { status: 'filling', message: t('Page open'), updatedAt: Date.now() });
      const beta = !!PLATFORMS[job.platform].beta;
      return { id: job.id, platform: job.platform, payload: job.payload, beta, autoSend: job.autoSend && !beta };
    }),

  // From a content script: progress report.
  'job:update': ({ jobId, status, message, url, debug, retry }) =>
    mutate(async (state) => {
      const job = state.run?.jobs.find((j) => j.id === jobId);
      if (!job || TERMINAL.has(job.status)) return { ignored: true };
      if (status === 'error' && retry && (await retryJob(job, message))) {
        if (debug) job.debug = debug;
        await advance(state);
        return { retried: true };
      }
      if (status) job.status = status;
      if (message != null) job.message = message;
      if (url) job.url = url;
      if (debug) job.debug = debug;
      job.updatedAt = Date.now();
      await advance(state);
      return { ok: true };
    }),

  // From a content script: one chunk of a media file, base64-encoded
  // (extension messaging is JSON-only, so Blobs can't cross directly).
  'media:chunk': async ({ mediaId, index }) => {
    const rec = await getMedia(mediaId);
    if (!rec) return { error: t('The media is gone. Was the draft cleared?') };
    const start = index * CHUNK;
    const end = Math.min(start + CHUNK, rec.blob.size);
    const buf = await rec.blob.slice(start, end).arrayBuffer();
    return { b64: toBase64(buf), done: end >= rec.blob.size, size: rec.blob.size };
  },

  // From a content script in a long wait: still alive.
  'job:heartbeat': ({ jobId }) =>
    mutate(async (state) => {
      const job = state.run?.jobs.find((j) => j.id === jobId);
      if (job && !TERMINAL.has(job.status)) job.updatedAt = Date.now();
    }),

  // From a content script that needs a visible page for its next step.
  'job:needFocus': ({ jobId }) =>
    mutate(async (state) => {
      const run = state.run;
      const job = run?.jobs.find((j) => j.id === jobId);
      if (!job || !FOREGROUND.has(job.status)) return { granted: false };
      await scheduleFront(run);
      if (!run.focusJob || run.focusJob === job.id) {
        run.focusQueue = run.focusQueue.filter((id) => id !== job.id);
        await giveFocus(run, job);
        return { granted: true };
      }
      if (!run.focusQueue.includes(job.id)) run.focusQueue.push(job.id);
      // Time slice: the holder has had the front long enough and this job is next.
      if (run.focusQueue[0] === job.id && Date.now() - run.focusSince > SLICE) {
        run.focusQueue.shift();
        run.focusQueue.push(run.focusJob);
        await giveFocus(run, job);
        return { granted: true };
      }
      return { granted: false, position: run.focusQueue.indexOf(job.id) + 1 };
    }),

  'job:focus': async ({ jobId }) => {
    const { run } = await chrome.storage.session.get('run');
    const job = run?.jobs.find((j) => j.id === jobId);
    if (!job?.tabId) return { error: 'no tab' };
    const tab = await chrome.tabs.update(job.tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return { ok: true };
  },

  // From the side panel: the person asked to try a failed platform again.
  // Reuses its tab when it is still open, otherwise opens a new one.
  'job:retry': ({ jobId }) =>
    mutate(async (state) => {
      const job = state.run?.jobs.find((j) => j.id === jobId);
      if (!job || !['error', 'cancelled', 'unknown'].includes(job.status)) return { ignored: true };
      Object.assign(job, { attempts: 1, debug: undefined, url: undefined, updatedAt: Date.now() });
      let reused = false;
      if (job.tabId) {
        try {
          await chrome.tabs.update(job.tabId, { url: PLATFORMS[job.platform].composeUrl });
          Object.assign(job, { status: 'opening', message: t('Opening {platform}', { platform: PLATFORMS[job.platform].name }) });
          reused = true;
        } catch {}
      }
      if (!reused) Object.assign(job, { status: 'queued', tabId: undefined, message: '' });
      chrome.alarms.create(WATCHDOG, { periodInMinutes: 0.5 });
      await advance(state);
      return { ok: true };
    }),

  'run:cancel': () =>
    mutate(async (state) => {
      for (const j of state.run?.jobs || []) {
        if (TERMINAL.has(j.status)) continue;
        if (j.tabId) chrome.tabs.sendMessage(j.tabId, { type: 'job:abort', jobId: j.id }).catch(() => {});
        Object.assign(j, { status: 'cancelled', message: t('Cancelled'), updatedAt: Date.now() });
      }
      chrome.alarms.clear(WATCHDOG);
      return { ok: true };
    }),

  'run:clear': () =>
    mutate(async (state) => {
      if (state.run?.jobs.some((j) => !TERMINAL.has(j.status))) throw new Error(t('Some platforms are still running'));
      state.run = null;
      return { ok: true };
    }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(
      (res) => sendResponse(res ?? null),
      (err) => sendResponse({ error: String(err?.message || err) }),
    );
  return true;
});

// --- retries ------------------------------------------------------------------

const MAX_ATTEMPTS = 3;

/**
 * Start a job over on a fresh page (it hasn't touched anything server-side
 * yet — content scripts only ask for this while still filling the form).
 */
async function retryJob(job, reason) {
  const attempts = job.attempts || 1;
  if (attempts >= MAX_ATTEMPTS || !job.tabId) return false;
  job.attempts = attempts + 1;
  chrome.alarms.create(WATCHDOG, { periodInMinutes: 0.5 });
  Object.assign(job, {
    status: 'opening',
    message: t('Attempt {n} (last time: {reason})', { n: job.attempts, reason: (reason || '').slice(0, 80) }),
    updatedAt: Date.now(),
  });
  try {
    await chrome.tabs.update(job.tabId, { url: PLATFORMS[job.platform].composeUrl });
    return true;
  } catch {
    return false; // tab is gone
  }
}

// --- watchdogs ---------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== WATCHDOG) return;
  mutate(async (state) => {
    const run = state.run;
    if (!run) return chrome.alarms.clear(WATCHDOG);
    const now = Date.now();
    for (const j of run.jobs) {
      // Slow networks: give a page 90 s to load and connect, then reload it (up to 3 tries).
      if (j.status === 'opening' && now - j.updatedAt > 90_000) {
        if (!(await retryJob(j, t('The page didn’t load within 90 seconds')))) {
          Object.assign(j, {
            status: 'error',
            message: t('The page never connected. You may be signed out, or the network is slow.'),
            updatedAt: now,
          });
        }
      } else if (j.status === 'filling' && now - j.updatedAt > 5 * 60_000) {
        // No progress report and no heartbeat for 5 minutes: the page is gone or frozen.
        if (!(await retryJob(j, t('The page stopped responding for 5 minutes')))) {
          Object.assign(j, { status: 'error', message: t('The page stopped responding for 5 minutes'), updatedAt: now });
        }
      }
    }
    await advance(state);
    if (!run.jobs.some((j) => j.status === 'queued' || FOREGROUND.has(j.status))) {
      chrome.alarms.clear(WATCHDOG);
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  mutate(async (state) => {
    let changed = false;
    for (const j of state.run?.jobs || []) {
      if (j.tabId === tabId && !TERMINAL.has(j.status)) {
        Object.assign(j, { status: 'error', message: t('The tab was closed'), updatedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) await advance(state);
  });
});

// --- utils -------------------------------------------------------------------

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
