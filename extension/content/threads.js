// Threads (threads.com) adapter. BETA: not yet checked against the live site.
// Flow: open the composer → attach media → type the post → Post.

(() => {
  const OL = globalThis.OL;

  const L = {
    create: ['New thread', 'Create', '新串文', '新帖子', '创建', '建立', '新建'],
    prompt: ["What's new?", '有什么新鲜事？', '有什么新鲜事?', '有什麼新鮮事？', '有什麼新鮮事?', 'Empty text field. Type to compose a new post.'],
    attach: ['Attach media', 'Add media', 'Add photos and videos', '附加媒体', '附加媒體', '添加媒体', '新增媒體'],
    post: ['Post', '发布', '發佈', '發布', '发帖'],
    posted: /^(Posted|已发布|已發佈|已发帖|已發布)$/m,
  };

  const dialogs = () => OL.$$('div[role="dialog"]').filter(OL.visible);
  const composer = () => dialogs().find((d) => d.querySelector('[contenteditable="true"]')) || null;
  const editor = () => {
    const d = composer();
    return d && OL.$$('[contenteditable="true"]', d).find(OL.visible);
  };
  const postButton = () => {
    const d = composer();
    if (!d) return null;
    const want = L.post.map((x) => x.toLowerCase());
    const all = OL.$$(OL.CLICKABLE, d).filter((el) => OL.visible(el) && want.includes(OL.text(el).toLowerCase()));
    return all[all.length - 1] || null; // the main Post button sits at the bottom
  };

  async function openComposer() {
    if (composer()) return;
    // The nav's "New thread" opens the composer dialog; the feed's "What's new?" box is a fallback.
    const trigger = await OL.waitFor(
      () =>
        OL.findClickable(L.create, document, '[role="button"], a, button') ||
        OL.byIcon(L.create) ||
        OL.findClickable(L.prompt, document, '[role="button"], div[tabindex], span, a'),
      { timeout: 30000, what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} create button', { platform: 'Threads' }), platform: 'Threads' }) },
    );
    OL.click(trigger);
    await OL.waitFor(composer, { timeout: 10000, what: OL.t('the {platform} composer', { platform: 'Threads' }) });
  }

  OL.register('threads', async (job) => {
    const { text = '', media = [] } = job.payload;

    if (/\/login/.test(location.pathname)) throw new OL.Error(OL.t('Signed out of {platform}', { platform: 'Threads' }));
    const files = media.length ? await OL.loadMedia(media) : [];
    await OL.ensureVisible();
    OL.report('filling', OL.t('Opening the composer…'));
    await openComposer();

    if (files.length) {
      OL.report('filling', OL.t('Adding media ({n}), waiting for previews…', { n: files.length }));
      let captured = null;
      const input = async () => {
        const d = composer();
        const existing = d && OL.$('input[type="file"]', d);
        if (existing) return existing;
        if (captured?.isConnected) return captured;
        const btn = d && (OL.byIcon(L.attach, d) || OL.findClickable(L.attach, d));
        captured = btn ? await OL.openFileInput(btn) : null;
        return captured;
      };
      await OL.attachFiles({
        files,
        input,
        check: () => OL.previewCount(composer()) >= files.length,
        started: () => OL.previewCount(composer()) > 0,
        dropTarget: editor,
        timeout: 30000,
        what: OL.t('the media previews ({n})', { n: files.length }),
      });
    }

    if (text.trim()) {
      OL.report('filling', OL.t('Filling in the text…'));
      if (!(await OL.insertText(editor(), text))) throw new OL.Error(OL.t('The text didn’t go in ({platform}’s editor may have changed)', { platform: 'Threads' }));
    }

    let closedAt = 0;
    await OL.finish({
      waitingMessage: media.length ? OL.t('Waiting for {platform} to process the media…', { platform: 'Threads' }) : OL.t('Checking…'),
      readyTimeout: OL.budget(OL.bytesOf(media), 90_000),
      progressText: () => OL.progressHint(composer() || document),
      readyWhat: OL.t('the Post button to turn on (it stays off over {n} characters or with media {platform} doesn’t accept)', { n: 500, platform: 'Threads' }),
      ready: () => {
        const b = postButton();
        return b && !OL.isDisabled(b) && !OL.$('[role="progressbar"]', composer());
      },
      verify: () => {
        const p = [];
        if (text.trim() && !OL.hasText(editor(), text)) p.push(OL.t('The text doesn’t match the draft'));
        const n = OL.previewCount(composer());
        if (media.length && n < media.length) p.push(OL.t('Only {n} of {total} media showing', { n, total: media.length }));
        return p;
      },
      sendButton: postButton,
      success: () => {
        if (composer()) {
          closedAt = 0;
          return null;
        }
        closedAt ||= Date.now();
        const toast = OL.$$('div, span').find((el) => OL.visible(el) && L.posted.test(OL.text(el)) && OL.text(el).length < 40);
        const link = toast?.parentElement?.closest('div')?.querySelector('a[href*="/post/"]');
        if (toast) return { url: link?.href, message: OL.t('Posted') };
        if (Date.now() - closedAt < 6000) return null;
        return { ok: false, message: OL.t('The composer closed without a posted notice. Check your profile.') };
      },
    });
  });
})();
