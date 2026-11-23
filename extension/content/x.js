// X (x.com) adapter. Opens on https://x.com/compose/post.
// X marks its UI with data-testid attributes, which change rarely.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    editor: '[data-testid="tweetTextarea_0"]',
    fileInput: 'input[data-testid="fileInput"], input[type="file"][accept*="image"], input[type="file"][accept*="video"]',
    sendModal: '[data-testid="tweetButton"]',
    sendInline: '[data-testid="tweetButtonInline"]',
    attachments: '[data-testid="attachments"]',
    toastLink: '[data-testid="toast"] a[href*="/status/"]',
    removeMedia: '[aria-label="Remove media"], [aria-label="删除媒体"], [aria-label="移除媒体"], [aria-label="移除媒體"]',
  };

  function findEditor() {
    const hosts = OL.$$(SEL.editor).filter(OL.visible);
    const host = hosts.find((e) => e.closest('[role="dialog"]')) || hosts[0];
    if (!host) return null;
    return host.isContentEditable ? host : host.querySelector('[contenteditable="true"]');
  }

  /** Smallest ancestor holding both the editor and its send button. */
  function rootOf(editor) {
    for (let n = editor; n && n !== document.body; n = n.parentElement) {
      if (n.querySelector?.(`${SEL.sendModal}, ${SEL.sendInline}`)) return n;
    }
    return document.body;
  }

  const sendButton = (root) => OL.$(SEL.sendModal, root) || OL.$(SEL.sendInline, root);

  /** The attachments strip, only once it actually holds something. */
  const strip = (root) => {
    const s = OL.$(SEL.attachments, root);
    return s && s.querySelector('img, video, [role="group"], [data-testid]') ? s : null;
  };

  /** Media previews in the composer: local images show as blob: URLs, videos as <video>. */
  const previewCount = (root) => OL.previewCount(root);

  function uploadInfo(root) {
    const att = OL.$(SEL.attachments, root);
    if (!att) return '';
    const pct = OL.text(att).match(/(\d{1,3})\s*%/);
    if (pct) return OL.t('Uploading {pct}%', { pct: pct[1] });
    if (att.querySelector('[role="progressbar"]')) return OL.t('Uploading…');
    return '';
  }

  OL.register('x', async (job) => {
    const { text = '', media = [] } = job.payload;

    OL.report('filling', OL.t('Waiting for the {platform} composer…', { platform: 'X' }));
    await OL.waitFor(findEditor, {
      timeout: 30000,
      what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} composer', { platform: 'X' }), platform: 'X' }),
    });
    const files = media.length ? await OL.loadMedia(media) : [];

    await OL.ensureVisible(); // X only builds media previews in a visible tab
    const editor = findEditor();
    const root = rootOf(editor);

    if (files.length) {
      OL.report('filling', OL.t('Adding media ({n}), waiting for previews…', { n: files.length }));
      // Any of: blob: previews, the attachments strip, a "remove media" button,
      // or the Post button waking up (there's no text yet, so only media can do that).
      await OL.attachFiles({
        files,
        input: () => OL.$(SEL.fileInput, root) || OL.$(SEL.fileInput),
        check: () => {
          const b = sendButton(root);
          return previewCount(root) >= files.length || strip(root) || OL.$(SEL.removeMedia, root) || (b && !OL.isDisabled(b));
        },
        started: () => previewCount(root) > 0 || OL.progressHint(root),
        dropTarget: findEditor,
        timeout: 30000,
        what: OL.t('the media previews ({n})', { n: files.length }),
      });
      await OL.sleep(800);
    }

    if (text.trim()) {
      OL.report('filling', OL.t('Filling in the text…'));
      const ok = await OL.insertText(findEditor() || editor, text);
      if (!ok) throw new OL.Error(OL.t('The text didn’t go in ({platform}’s editor may have changed)', { platform: 'X' }));
    }

    const hasVideo = media.some((m) => m.type.startsWith('video/'));
    let emptiedAt = 0;

    await OL.finish({
      waitingMessage: media.length ? OL.t('Waiting for {platform} to finish uploading…', { platform: 'X' }) : OL.t('Checking…'),
      // No-progress window sized by the files; while X shows a moving percentage we keep waiting.
      readyTimeout: OL.budget(OL.bytesOf(media), hasVideo ? 5 * 60_000 : 90_000),
      readyWhat: OL.t('the Post button to turn on (it stays off over {n} characters or with media {platform} doesn’t accept)', { n: 280, platform: 'X' }),
      progressText: () => uploadInfo(root),
      ready: () => {
        const b = sendButton(root);
        return b && !OL.isDisabled(b) && !uploadInfo(root);
      },
      verify: () => {
        const problems = [];
        if (text.trim() && !OL.hasText(findEditor(), text)) problems.push(OL.t('The text doesn’t match the draft'));
        const n = previewCount(root);
        if (media.length && (n ? n < media.length : !strip(root))) problems.push(OL.t('Only {n} of {total} media showing', { n, total: media.length }));
        return problems;
      },
      sendButton: () => sendButton(root),
      success: () => {
        const link = OL.$(SEL.toastLink);
        if (link) return { url: link.href, message: OL.t('Posted') };
        // Composer closed or emptied without a toast we could read.
        const ed = findEditor();
        const gone = !ed || !root.isConnected || (!OL.norm(OL.text(ed)) && previewCount(root) === 0);
        if (!gone) {
          emptiedAt = 0;
          return null;
        }
        emptiedAt ||= Date.now();
        if (Date.now() - emptiedAt < 5000) return null; // give the toast a moment
        return { ok: false, message: OL.t('The composer closed without a sent notice. Check your profile.') };
      },
    });
  });
})();
