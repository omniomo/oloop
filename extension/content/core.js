// Shared helpers for the platform adapters. Loaded right before each adapter
// (classic content scripts on a page share one isolated world).
//
// An adapter calls OL.register(platform, async (job) => {...}). On page load we
// ask the background worker whether this tab has a job waiting; if not, the
// script stays idle, so it never touches pages you open yourself.

(() => {
  if (globalThis.OL) return;
  const OL = (globalThis.OL = {});
  let aborted = false;
  OL.job = null;
  OL.notes = []; // non-fatal things the user should know ("cover not set")
  OL.lastMessage = '';
  OL.retryable = true; // a failed job may be retried from a fresh page (see OL.noRetry)
  // Messages follow the language chosen in the panel (lib/i18n.js loads first).
  OL.t = (s, p) => (globalThis.OLI18N
    ? globalThis.OLI18N.t(s, p)
    : s.replace(/\{(\w+)\}/g, (m, k) => (p?.[k] == null ? m : String(p[k]))));
  globalThis.OLI18N?.load();

  /**
   * code: 'timeout' | 'rejected' | 'login' | 'cancelled' | …
   * retryable: whether reloading the page and starting over could help.
   */
  class OLError extends Error {
    constructor(message, code, { retryable } = {}) {
      super(message);
      this.code = code;
      this.retryable = retryable;
    }
  }
  OL.Error = OLError;

  /** From here on a retry would duplicate something (e.g. a server-side draft). */
  OL.noRetry = () => {
    OL.retryable = false;
  };

  // --- timing ---------------------------------------------------------------

  OL.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  OL.checkAbort = () => {
    if (aborted) throw new OLError(OL.t('Cancelled'), 'cancelled');
  };

  // While filling the form, a hidden tab that keeps waiting asks to be brought
  // to the front: Chrome doesn't render hidden tabs, and many compose UIs
  // (media previews, dialogs) stall there.
  OL.phase = 'filling';
  let lastFocusAsk = 0;
  function maybeAskFocus(waitingSince) {
    const now = Date.now();
    if (OL.phase !== 'filling' || !document.hidden || !OL.job) return;
    if (now - waitingSince < 3000 || now - lastFocusAsk < 3000) return;
    lastFocusAsk = now;
    chrome.runtime.sendMessage({ type: 'job:needFocus', jobId: OL.job.id }).catch(() => {});
  }

  /**
   * Poll fn() until it returns something truthy.
   *
   *   timeout   how long we may wait *without progress*. Time doesn't count
   *             while the tab is hidden mid-form (the page can't move there)
   *             or while the network is down.
   *   progress  optional () => string; whenever its value changes the clock
   *             restarts — a slow but moving upload never times out.
   *   maxWait   wall-clock cap regardless of progress.
   */
  let lastBeat = 0;
  OL.waitFor = async (fn, { timeout = 20000, interval = 250, what = OL.t('a page element'), progress, maxWait } = {}) => {
    const t0 = Date.now();
    const cap = maxWait ?? (progress ? 6 * 3600_000 : Math.max(timeout * 4, 10 * 60_000));
    let counted = 0;
    let last = t0;
    let seen;
    for (;;) {
      OL.checkAbort();
      maybeAskFocus(t0);
      let v = null;
      try {
        v = await fn();
      } catch {
        v = null;
      }
      if (v) return v;
      const now = Date.now();
      const paused = (OL.phase === 'filling' && document.hidden) || navigator.onLine === false;
      if (!paused) counted += now - last;
      last = now;
      if (progress) {
        let p;
        try {
          p = progress();
        } catch {}
        if (p && p !== seen) {
          seen = p;
          counted = 0;
        }
      }
      if (OL.job && now - lastBeat > 40_000) {
        lastBeat = now; // keeps the background watchdog from giving up on a long wait
        chrome.runtime.sendMessage({ type: 'job:heartbeat', jobId: OL.job.id }).catch(() => {});
      }
      if (counted > timeout || now - t0 > cap) {
        throw new OLError(OL.t('Still waiting after {time} for {what}', { time: fmtWait(Math.min(counted, now - t0)), what }), 'timeout');
      }
      await OL.sleep(interval);
    }
  };
  const fmtWait = (ms) => (ms >= 90_000 ? OL.t('{n} min', { n: Math.round(ms / 60_000) }) : OL.t('{n} s', { n: Math.round(ms / 1000) }));

  /**
   * Time budget for something that depends on uploading these bytes: a base
   * plus the bytes at a slow-but-working connection (~150 KB/s ≈ 1.2 Mbit/s).
   */
  OL.budget = (bytes, base = 120_000) => base + Math.round((bytes || 0) / 150);
  OL.bytesOf = (list) => (list || []).reduce((s, m) => s + (m.size || 0), 0);

  /**
   * Wait for this tab to be the visible one before UI steps. The background
   * worker hands the front to one platform at a time (in turns).
   */
  OL.ensureVisible = async () => {
    if (!document.hidden) return;
    const t0 = Date.now();
    let shown = '';
    while (document.hidden) {
      OL.checkAbort();
      const r = await chrome.runtime.sendMessage({ type: 'job:needFocus', jobId: OL.job.id }).catch(() => null);
      const msg = r?.granted ? OL.t('Bringing the tab to the front…') : OL.t('Waiting for a turn at the front ({n} ahead)…', { n: r?.position || 1 });
      if (msg !== shown) {
        shown = msg;
        OL.report('filling', msg);
      }
      if (Date.now() - t0 > 15 * 60_000) throw new OLError(OL.t('Waited 15 minutes for a turn at the front'));
      await OL.sleep(r?.granted ? 400 : 1500);
    }
    await OL.sleep(300);
  };

  /** Like waitFor, but returns null on timeout instead of failing the job. */
  OL.tryWaitFor = (fn, opts) =>
    OL.waitFor(fn, opts).catch((e) => {
      if (e.code === 'cancelled') throw e;
      return null;
    });

  // --- DOM --------------------------------------------------------------------

  OL.$ = (sel, root = document) => root.querySelector(sel);
  OL.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  OL.visible = (el) =>
    !!el && el.isConnected && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

  OL.text = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');

  /** Text with all whitespace and zero-width characters removed. */
  OL.norm = (s) => (s || '').replace(/[\s​-‍﻿]+/g, '');

  /** Does the field contain the text we meant to put there? */
  OL.hasText = (el, text) => {
    if (!el) return false;
    const want = OL.norm(text);
    if (!want) return true;
    const isField = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    const have = OL.norm(isField ? el.value : el.innerText || el.textContent);
    if (have.includes(want)) return true;
    // Long captions: editors sometimes re-render links/hashtags; accept a close match.
    return want.length > 40 && have.includes(want.slice(0, 40)) && have.length >= want.length * 0.95;
  };

  /** Visible-ish text under root, skipping what's typed in editors (a caption could say "posted"). */
  OL.textOutsideEditors = (root = document.body) => {
    if (!root) return '';
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let out = '';
    for (let n = walker.nextNode(); n && out.length < 200000; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || p.closest('[contenteditable="true"], textarea, script, style, noscript')) continue;
      out += n.textContent + '\n';
    }
    return out;
  };

  /** Count local previews (blob: images and <video>) under root. */
  OL.previewCount = (root) =>
    new Set(OL.$$('img[src^="blob:"]', root).map((i) => i.src)).size + OL.$$('video', root).length;

  /** A percentage the page shows for an upload / processing step, if any. */
  OL.progressHint = (root = document) => {
    for (const el of OL.$$('[role="progressbar"], [aria-valuenow], [class*="progress" i]', root)) {
      if (!OL.visible(el)) continue;
      const v = el.getAttribute('aria-valuenow');
      if (v != null && v !== '') return `${Math.round(Number(v))}%`;
      const t = OL.text(el);
      const m = t.length < 60 && t.match(/(\d{1,3}(?:\.\d)?)\s*%/);
      if (m) return `${m[1]}%`;
    }
    return '';
  };

  /** What the platform itself is telling us: toasts, alerts, inline errors. */
  OL.platformMessages = (doc = document) => {
    const seen = new Set();
    for (const el of OL.$$('[role="alert"], [aria-live="assertive"], [data-testid="toast"], [data-test-id*="toast" i], [class*="toast" i], [class*="error" i]', doc)) {
      if (!OL.visible(el) || el.closest('[contenteditable="true"]')) continue;
      const t = OL.text(el).replace(/\s+/g, ' ');
      if (t.length >= 4 && t.length <= 200) seen.add(t);
      if (seen.size >= 2) break;
    }
    return [...seen].join(' / ');
  };

  /** Login / sign-up page instead of the compose page? */
  OL.looksLoggedOut = (doc = document) =>
    /\/(login|signin|sign_in|accounts\/login|i\/flow\/login|i\/jf\/onboarding)/i.test(doc.location.pathname) ||
    OL.$$('input[type="password"]', doc).some(OL.visible);

  const CLICKABLE = 'button, [role="button"], a, [role="link"], [role="menuitem"], [role="tab"]';
  OL.CLICKABLE = CLICKABLE;

  /** First visible clickable whose own text or aria-label equals one of labels. */
  const label = (s) => (s || '').trim().toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  OL.label = label;

  OL.findClickable = (labels, root = document, selector = CLICKABLE) => {
    const want = labels.map(label);
    return (
      OL.$$(selector, root).find((el) => {
        if (!OL.visible(el)) return false;
        return want.includes(label(OL.text(el))) || want.includes(label(el.getAttribute('aria-label')));
      }) || null
    );
  };

  /**
   * Innermost visible element whose text equals one of labels. For pages that
   * put the click handler on plain spans/divs: a wrapper with the same text
   * would match first otherwise, and a click on the wrapper never reaches the
   * span, while a click on the span bubbles up to every wrapper.
   */
  OL.findText = (labels, root = document, selector = 'button, [role="button"], [role="tab"], a, label, span, div') => {
    const want = labels.map(label);
    const hits = OL.$$(selector, root).filter(
      (el) => OL.visible(el) && (want.includes(label(OL.text(el))) || want.includes(label(el.getAttribute('aria-label')))),
    );
    return hits.find((el) => !hits.some((o) => o !== el && el.contains(o))) || null;
  };

  /** Element owning an <svg aria-label="..."> icon (Meta apps label their icons). */
  OL.byIcon = (labels, root = document, closest = CLICKABLE) => {
    const svg = OL.$$('svg[aria-label]', root).find(
      (s) => labels.includes(s.getAttribute('aria-label')) && OL.visible(s),
    );
    return svg ? svg.closest(closest) : null;
  };

  /**
   * A "create" control drawn as a plus, found by its icon's shape rather than its
   * (translated) label: Instagram's and Threads' plus paths as of Nov 2026.
   */
  const PLUS = ['M21 11h-8V3a1 1 0 1 0-2 0v8H3', 'M12 2a1 1 0 0 1 1 1v8h8'];
  OL.byPlusIcon = (root = document, closest = CLICKABLE) => {
    const path = OL.$$('svg path', root).find((p) => PLUS.some((d) => (p.getAttribute('d') || '').startsWith(d)) && OL.visible(p.closest('svg')));
    return path ? path.closest(closest) : null;
  };

  /** First visible element matching any of the selectors, in order of preference. */
  OL.first = (selectors, root = document) => {
    for (const sel of selectors) {
      const el = OL.$$(sel, root).find(OL.visible);
      if (el) return el;
    }
    return null;
  };

  OL.isDisabled = (el) =>
    !el || el.disabled === true || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

  OL.click = (el) => {
    el.scrollIntoView?.({ block: 'center', inline: 'center' });
    const win = el.ownerDocument.defaultView || window;
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, view: win, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0 };
    el.dispatchEvent(new win.PointerEvent('pointerdown', { ...opts, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new win.MouseEvent('mousedown', opts));
    el.dispatchEvent(new win.PointerEvent('pointerup', { ...opts, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new win.MouseEvent('mouseup', opts));
    el.click();
  };

  /** Put files into an <input type="file"> the way a user's file picker would. */
  OL.setFiles = (input, files) => {
    const win = input.ownerDocument.defaultView || window;
    const dt = new win.DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
  };

  /**
   * Set files from the page's own world, through picker.js, for pages that check
   * `instanceof File` against the window their scripts run in. True once it's done.
   */
  OL.setFilesInPage = (input, files, { timeout = 3000 } = {}) => {
    const mark = Math.random().toString(36).slice(2);
    input.setAttribute('data-oloop-mark', mark);
    return new Promise((resolve) => {
      const done = (ok) => {
        window.removeEventListener('message', on);
        clearTimeout(timer);
        input.removeAttribute('data-oloop-mark');
        resolve(ok);
      };
      const on = (e) => {
        if (e.source === window && e.data?.type === 'oloop:set-files:done' && e.data.mark === mark) done(!!e.data.ok);
      };
      const timer = setTimeout(() => done(false), timeout);
      window.addEventListener('message', on);
      window.postMessage({ type: 'oloop:set-files', mark, files }, '*');
    });
  };

  /** Fallback for drop zones without a reachable file input. */
  OL.dropFiles = (target, files) => {
    const win = target.ownerDocument.defaultView || window;
    const dt = new win.DataTransfer();
    for (const f of files) dt.items.add(f);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new win.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  };

  /**
   * Click an "upload" button and return the file input it opens. Inputs that
   * pages create on the fly are caught by picker.js (page world) and marked.
   */
  OL.openFileInput = async (trigger, { doc = document, accept = '', timeout = 5000 } = {}) => {
    const before = new Set(OL.$$('input[type="file"]', doc));
    const since = Date.now();
    OL.click(trigger);
    return OL.tryWaitFor(
      () => {
        const all = OL.$$('input[type="file"]', doc).filter((i) => !accept || (i.accept || '').includes(accept) || !i.accept);
        return (
          all.find((i) => Number(i.getAttribute('data-oloop-captured') || 0) >= since - 50) ||
          all.find((i) => !before.has(i)) ||
          null
        );
      },
      { timeout, what: OL.t('the upload button') },
    );
  };

  /**
   * Hand files to the page and wait until it reacts, with fallbacks:
   *   1. set them on the file input   2. once more on a freshly looked-up input
   *   (pages often re-render it)       3. drop them on the drop zone.
   * started() tells us the page *did* react (a preview, a progress bar…), in
   * which case we keep waiting instead of handing the files over a second time.
   */
  OL.attachFiles = async ({ files, input, check, started = () => false, dropTarget, timeout = 30000, what = OL.t('the media') }) => {
    const tries = [
      () => input(),
      () => input(),
      () => dropTarget?.(),
    ];
    for (let i = 0; i < tries.length; i++) {
      const target = await OL.tryWaitFor(tries[i], { timeout: i ? 3000 : 15000 });
      if (!target) continue;
      if (i) OL.report('filling', OL.t('The media didn’t attach. Trying another way ({i}/3)…', { i: i + 1 }));
      if (i < 2) OL.setFiles(target, files);
      else OL.dropFiles(target, files);
      const ok = await OL.tryWaitFor(check, { timeout: i ? Math.min(timeout, 20000) : timeout, what });
      if (ok) return ok;
      if (await OL.tryWaitFor(started, { timeout: 500 })) {
        // The page took the files and is still busy: wait (much) longer, never re-send.
        OL.report('filling', OL.t('The platform is processing the media…'));
        return OL.waitFor(check, { timeout: Math.max(timeout * 4, OL.budget(OL.bytesOf(files))), what, progress: () => OL.progressHint() });
      }
    }
    throw new OLError(OL.t('The media didn’t attach: never saw {what}. The format, size or length may not suit this platform.', { what }), 'rejected', { retryable: true });
  };

  /**
   * Replace the content of a field with text.
   * Rich editors (Draft.js, Lexical, ProseMirror, YouTube's textbox…) all accept
   * a paste; execCommand('insertText') is the fallback.
   */
  OL.insertText = async (el, text) => {
    OL.checkAbort();
    const doc = el.ownerDocument;
    const win = doc.defaultView || window;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      el.focus();
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
      return OL.hasText(el, text);
    }
    const selectAll = () => {
      el.focus();
      const range = doc.createRange();
      range.selectNodeContents(el);
      const sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };

    selectAll();
    await OL.sleep(80);
    const dt = new win.DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new win.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await OL.sleep(350);
    if (OL.hasText(el, text)) return true;

    selectAll();
    await OL.sleep(80);
    doc.execCommand('insertText', false, text);
    await OL.sleep(350);
    return OL.hasText(el, text);
  };

  /** Compact description of the page, for the side panel's "复制诊断" button. */
  OL.diagnose = (doc = document) => {
    const short = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    const ATTRS = ['id', 'name', 'type', 'role', 'aria-label', 'placeholder', 'data-testid', 'data-test-id', 'data-e2e', 'accept', 'contenteditable', 'disabled', 'aria-disabled', 'aria-checked'];
    const desc = (el) => {
      const parts = [el.tagName.toLowerCase()];
      for (const k of ATTRS) {
        const v = el.getAttribute(k);
        if (v != null) parts.push(v === '' ? k : `${k}=${short(v)}`);
      }
      const icon = !el.getAttribute('aria-label') && el.querySelector?.('svg[aria-label]');
      if (icon) parts.push(`svg=${short(icon.getAttribute('aria-label'))}`);
      const cls = short(typeof el.className === 'string' ? el.className : '');
      if (cls) parts.push(`.${cls.split(' ').slice(0, 3).join('.')}`);
      if (!/^(input|textarea)$/i.test(el.tagName)) {
        const t = short(el.innerText);
        if (t) parts.push(`"${t}"`);
      }
      return '  ' + parts.join(' ');
    };
    // Micro-apps (视频号's wujie) keep their form in a shadow root.
    const roots = [doc, ...OL.$$('*', doc).filter((e) => e.shadowRoot).map((e) => e.shadowRoot)];
    const all = (sel) => roots.flatMap((r) => OL.$$(sel, r));
    const dialogs = all('[role=dialog], [aria-modal=true], tp-yt-paper-dialog, .weui-desktop-dialog__wrp').filter(OL.visible);
    const inDialog = (el) => dialogs.some((d) => d.contains(el));
    const pick = (sel, n, every = false) =>
      all(sel)
        .filter((el) => every || OL.visible(el))
        .sort((a, b) => inDialog(b) - inDialog(a))
        .slice(0, n)
        .map((el) => (inDialog(el) ? '* ' : '') + desc(el));
    return [
      `url: ${doc.location.href}`,
      `lang: ${doc.documentElement.lang} · hidden: ${doc.hidden} · step: ${OL.lastMessage}`,
      '(* = inside a dialog)',
      'file inputs:', ...pick('input[type=file]', 10, true),
      'fields:', ...pick('[contenteditable="true"], textarea, input:not([type]), input[type=text], input[type=url], input[type=search]', 15),
      'buttons:', ...pick('button, [role=button], [role=tab], [role=menuitem], [role=option], [role=radio]', 50),
      'marked:', ...pick('[data-testid], [data-test-id], [data-e2e]', 25).filter((l) => !/^\*?\s*(button|input|textarea)\b/.test(l.trim())),
      'dialogs:', ...dialogs.slice(0, 4).map((d) => '  ' + d.tagName.toLowerCase() + ' ' + short(d.innerText)),
      'iframes:', ...OL.$$('iframe', doc).slice(0, 6).map((f) => '  ' + (f.id ? `#${f.id} ` : '') + (f.src || '').slice(0, 100)),
    ].join('\n').slice(0, 9000);
  };

  // --- talking to the background worker ---------------------------------------

  OL.report = (status, message, extra = {}) => {
    if (!OL.job) return Promise.resolve();
    if (message) OL.lastMessage = message;
    return chrome.runtime
      .sendMessage({ type: 'job:update', jobId: OL.job.id, status, message, ...extra })
      .catch(() => {});
  };

  /** Something didn't work but the post can still go out (e.g. no cover). */
  OL.note = (msg) => {
    if (!OL.notes.includes(msg)) OL.notes.push(msg);
  };
  const withNotes = (msg) => (OL.notes.length ? OL.t('{msg} (note: {notes})', { msg, notes: OL.notes.join(OL.t('; ')) }) : msg);

  function b64ToBytes(b64) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(b64);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Pull the job's media out of the extension, chunk by chunk, as File objects. */
  OL.getFiles = async (list, onProgress) => {
    const total = list.reduce((s, m) => s + (m.size || 0), 0) || 1;
    let got = 0;
    const files = [];
    for (const m of list) {
      const parts = [];
      for (let i = 0; ; i++) {
        OL.checkAbort();
        const r = await chrome.runtime.sendMessage({ type: 'media:chunk', mediaId: m.id, index: i });
        if (!r || r.error) throw new OLError(OL.t('Couldn’t read the media: {error}', { error: r?.error || OL.t('no response') }));
        const bytes = b64ToBytes(r.b64);
        parts.push(bytes);
        got += bytes.length;
        onProgress?.(got, total);
        if (r.done) break;
      }
      files.push(new File(parts, m.name, { type: m.type, lastModified: Date.now() }));
    }
    return files;
  };

  /** getFiles with a "读取素材 xx%" progress line. */
  OL.loadMedia = (list, label = OL.t('media')) =>
    OL.getFiles(list, (got, total) => OL.report('filling', OL.t('Reading {label} {pct}%', { label, pct: Math.round((got / total) * 100) })));

  /** Re-encode an image as JPEG, for cover inputs that only take JPEG/PNG (a WebP cover, say). */
  OL.toJpeg = async (file) => {
    const bmp = await createImageBitmap(file);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    return new File([blob], (file.name || 'cover').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  };

  /**
   * The common ending of every adapter:
   *   wait until the platform is ready to send → check what we filled →
   *   click send (auto mode) or wait for the user to → wait for the success sign.
   *
   * success() returns null while waiting, or { url?, message?, ok? }.
   */
  OL.finish = async (o) => {
    const job = OL.job;
    OL.phase = 'finishing';
    let last = '';
    let lastChange = Date.now();
    let warned = false;
    await OL.report('uploading', o.waitingMessage || OL.t('Waiting for the platform to process the media…'));
    await OL.waitFor(
      () => {
        const p = o.progressText?.();
        if (p && p !== last) {
          last = p;
          lastChange = Date.now();
          warned = false;
          OL.report('uploading', p);
        } else if (p && !warned && Date.now() - lastChange > 3 * 60_000) {
          warned = true; // don't give up on a slow network, but say so
          OL.report('uploading', OL.t('{progress} (no change for 3 minutes, the network may be slow)', { progress: p }));
        }
        if (navigator.onLine === false) OL.report('uploading', OL.t('Offline. Waiting for the network…'));
        return o.ready();
      },
      {
        timeout: o.readyTimeout ?? 120000,
        interval: 1000,
        what: o.readyWhat || OL.t('the send button to turn on'),
        progress: o.progressText,
        maxWait: o.maxWait,
      },
    );

    const problems = (await o.verify?.()) || [];
    const settle = (r) =>
      OL.report(r.ok === false ? 'unknown' : 'done', withNotes(r.message || OL.t('Posted')), r.url ? { url: r.url } : {});

    if (!job.autoSend || problems.length) {
      await OL.report(
        'ready',
        problems.length
          ? OL.t('Not sent automatically: {problems}', { problems: problems.join(OL.t('; ')) })
          : withNotes(o.readyMessage || OL.t('Ready to send')),
        problems.length ? { debug: OL.diagnose(o.doc) } : {},
      );
      const r = await OL.tryWaitFor(o.success, { timeout: 60 * 60_000, interval: 1500, what: OL.t('a sent confirmation') });
      return r ? settle(r) : OL.report('unknown', OL.t('No sent confirmation within an hour. Stopped tracking.'));
    }

    await OL.report('sending', OL.t('Pressing send…'));
    const btn = o.sendButton();
    if (OL.isDisabled(btn)) throw new OLError(OL.t('The send button turned off'));
    OL.click(btn);
    const r = await OL.tryWaitFor(o.success, {
      timeout: o.successTimeout ?? 120000,
      interval: 1000,
      progress: () => OL.progressHint(o.doc),
    });
    if (r) return settle(r);
    // We pressed send; never press it again. Tell the user what we know.
    const said = OL.platformMessages(o.doc);
    return OL.report('unknown', (said ? OL.t('Pressed send but saw no confirmation. The platform says: {said}. Check the page.', { said }) : OL.t('Pressed send but saw no confirmation. Check the page.')), { debug: OL.diagnose(o.doc) });
  };

  // --- diagnosis ------------------------------------------------------------------

  /** Turn an error into something a person can act on, and decide if a retry could help. */
  function explain(e, doc) {
    const base = e?.message || String(e);
    if (navigator.onLine === false) return { message: OL.t('Offline: {base}', { base }), retryable: true };
    if (e?.code === 'login' || OL.looksLoggedOut(doc)) {
      return { message: OL.t('Signed out, or the session expired'), retryable: false };
    }
    const said = OL.platformMessages(doc);
    if (said) {
      const transient = /try again|went wrong|稍后|再试|出错|network|网络|timeout|超时/i.test(said);
      return { message: OL.t('{base}. The platform says: {said}', { base, said }), retryable: transient };
    }
    if (e?.code === 'timeout' && doc.hidden) {
      return { message: OL.t('{base} (the tab stayed in the background, so the page may have paused)', { base }), retryable: true };
    }
    if (e?.code === 'timeout') {
      // Steps that read a button's words fail quietly in a language we don't know.
      const lang = (doc.documentElement?.lang || '').toLowerCase().split('-')[0];
      if (OL.langs && lang && !OL.langs.includes(lang)) {
        return { message: OL.t('{base}. {platform} is shown in a language Oloop may not read ({lang}). Switch {platform} to English or Chinese and try again.', { base, platform: OL.platformName, lang: doc.documentElement.lang }), retryable: true };
      }
      return { message: OL.t('{base}. The network may be slow, or the page changed. Copy the diagnostics and send them to the maintainers.', { base }), retryable: true };
    }
    return { message: base, retryable: e?.retryable ?? e instanceof OLError };
  }

  // --- lifecycle ----------------------------------------------------------------

  /**
   * langs: the page languages whose button words this adapter knows (only needed
   * where it reads words); with name, a timeout on a page in another language says so.
   */
  OL.register = (platform, adapter, { doc, langs, name } = {}) => {
    if (window.top !== window) return;
    OL.langs = langs || null;
    OL.platformName = name || platform;
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'job:abort' && OL.job && msg.jobId === OL.job.id) aborted = true;
    });
    (async () => {
      let job = null;
      try {
        job = await chrome.runtime.sendMessage({ type: 'job:claim', platform });
      } catch {
        return;
      }
      if (!job || job.error) return;
      OL.job = job;
      try {
        await adapter(job);
      } catch (e) {
        if (e?.code === 'cancelled') return;
        console.warn('[oloop]', e);
        const d = doc?.() || document;
        let debug = '';
        try {
          debug = OL.diagnose(d);
        } catch {}
        const why = explain(e, d);
        await OL.report('error', why.message, { debug, retry: why.retryable && OL.retryable && OL.phase === 'filling' });
      }
    })();
  };
})();
