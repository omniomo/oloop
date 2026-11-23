// Instagram (instagram.com, desktop web) adapter.
// Flow: Create → (Post) → select files → crop → Next → edit → Next → caption → Share.
// Instagram has no stable test ids, so we match visible labels in English,
// Simplified and Traditional Chinese. Add your UI language here if it differs.

(() => {
  const OL = globalThis.OL;

  const L = {
    create: ['New post', 'Create', '新帖子', '创建', '新貼文', '建立', '发帖'],
    post: ['Post', '帖子', '貼文'],
    next: ['Next', '下一步', '繼續', '继续'],
    share: ['Share', '分享', '分享貼文', '发布', '發佈'],
    ok: ['OK', '确定', '確定', '好'],
    crop: ['Select crop', '选择裁剪', '選擇裁切', '選取裁切', 'Crop', '裁剪', '裁切'],
    original: ['Original', '原图', '原圖', '原始', '原始尺寸', '原尺寸', '原始比例'],
    fromComputer: ['Select from computer', '从电脑中选择', '從電腦選擇', '从电脑选择'],
  };
  const SHARED = /(post|reel|video)s? (has been |have been |was )?shared|shared your|已分享|已发布|已發佈|分享成功|发布成功|發佈成功/i;

  const dialogs = () => OL.$$('div[role="dialog"]').filter(OL.visible);

  /** The file input of an *open* create dialog (Instagram keeps hidden copies around). */
  function fileInput() {
    for (const d of dialogs()) {
      const i = d.querySelector('input[type="file"]');
      if (i) return i;
    }
    const i = OL.$('form[enctype="multipart/form-data"] input[type="file"]');
    return i && OL.visible(i.form) ? i : null;
  }

  /** The "Create new post" dialog, whichever step it is on. */
  function createDialog() {
    return (
      dialogs().find(
        (d) =>
          d.querySelector('input[type="file"]') ||
          d.querySelector('[contenteditable="true"]') ||
          OL.findClickable(L.next, d) ||
          OL.findClickable(L.share, d),
      ) || null
    );
  }

  const captionBox = () => {
    const d = createDialog();
    if (!d) return null;
    const boxes = OL.$$('[contenteditable="true"]', d).filter(OL.visible);
    return boxes.find((b) => b.getAttribute('role') === 'textbox') || boxes[0] || null;
  };
  const shareButton = () => {
    const d = createDialog();
    return d && OL.findClickable(L.share, d);
  };

  /** Visible dialog text, leaving out what's typed in editors (the caption could say "已分享"). */
  function dialogText() {
    let out = '';
    for (const d of dialogs()) {
      const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement?.closest('[contenteditable="true"]')) out += n.textContent + '\n';
      }
      for (const img of d.querySelectorAll('img[alt]')) out += img.alt + '\n';
    }
    return out;
  }

  async function dismissNags() {
    for (const d of dialogs()) {
      if (d.querySelector('input[type="file"]')) continue;
      const b = OL.findClickable(['Not Now', 'Not now', '以后再说', '以後再說', '稍後再說', '暂不'], d);
      if (b) {
        OL.click(b);
        await OL.sleep(600);
      }
    }
  }

  async function openCreate() {
    if (fileInput()) return;
    const trigger =
      OL.byIcon(L.create) || OL.findClickable(L.create, document, 'a, [role="link"], [role="button"], button');
    if (!trigger) throw new OL.Error(OL.t('Couldn’t find the {platform} Create button. Make sure you are signed in and the window isn’t too narrow.', { platform: 'Instagram' }));
    OL.click(trigger);

    // Newer layouts open a small menu first (Post / Live / Ad).
    const postItem = () =>
      OL.byIcon(L.post, document, 'a, [role="link"], [role="button"], [role="menuitem"], button') ||
      OL.findClickable(L.post, document, '[role="menuitem"], [role="menu"] a, [role="menu"] [role="button"], [role="dialog"] [role="button"]');
    const first = await OL.waitFor(() => fileInput() || postItem(), { timeout: 8000, what: OL.t('the Create menu') });
    if (first.tagName !== 'INPUT') OL.click(first);
    await OL.waitFor(fileInput, { timeout: 10000, what: OL.t('the file picker') });
  }

  /** Switch the crop from the default 1:1 to Original. Best effort. */
  async function keepOriginal() {
    const d = createDialog();
    const btn = d && OL.byIcon(L.crop, d, 'button, [role="button"]');
    if (!btn) return false;
    OL.click(btn);
    const opt = await OL.waitFor(() => OL.findClickable(L.original, createDialog() || document, 'button, [role="button"]'), {
      timeout: 3000,
      what: OL.t('the Original ratio'),
    }).catch(() => null);
    if (opt) OL.click(opt);
    await OL.sleep(400);
    return !!opt;
  }

  async function setReelCover(cover) {
    const d = createDialog();
    const entry = OL.findClickable(L.fromComputer, d);
    if (!entry) return false;
    const input = await OL.openFileInput(entry, { accept: 'image' });
    if (!input) return false;
    const [file] = await OL.loadMedia([cover], OL.t('cover'));
    OL.setFiles(input, [file]);
    await OL.sleep(1500);
    return true;
  }

  OL.register('instagram', async (job) => {
    const { text = '', media = [], cover = null, options = {} } = job.payload;
    const keepOriginalRatio = options.keepOriginalRatio !== false;
    const singleVideo = media.length === 1 && media[0].type.startsWith('video/');
    if (!media.length) throw new OL.Error(OL.t('{platform} needs at least one image or video', { platform: 'Instagram' }));

    OL.report('filling', OL.t('Waiting for {platform} to load…', { platform: 'Instagram' }));
    await OL.waitFor(() => OL.$('svg[aria-label]') || OL.$('input[name="username"]'), {
      timeout: 30000,
      what: OL.t('the {platform} page', { platform: 'Instagram' }),
    });
    if (OL.$('input[name="username"]')) throw new OL.Error(OL.t('Signed out of {platform}', { platform: 'Instagram' }));
    const files = await OL.loadMedia(media);
    await OL.ensureVisible();
    await OL.sleep(1200);
    await dismissNags();

    OL.report('filling', OL.t('Opening the create dialog…'));
    await openCreate();
    OL.report('filling', OL.t('Adding media ({n})…', { n: files.length }));

    // → crop step. Videos first show "video posts are now shared as reels" → OK.
    await OL.attachFiles({
      files,
      input: fileInput,
      check: () => {
        for (const d of dialogs()) {
          const ok = OL.findClickable(L.ok, d);
          if (ok) OL.click(ok);
        }
        const d = createDialog();
        return d && OL.findClickable(L.next, d);
      },
      started: () => OL.previewCount(createDialog() || document) > 0 || OL.progressHint(createDialog() || document),
      timeout: OL.budget(OL.bytesOf(media), 60_000),
      what: OL.t('Next on the crop step'),
    });
    if (keepOriginalRatio) {
      const ok = await keepOriginal();
      if (!ok) OL.report('filling', OL.t('No Original ratio option found, so {platform}’s default crop was used', { platform: 'Instagram' }));
    }

    // Next → Next until the caption box shows up. A single video is a Reel,
    // whose edit step has a "Cover photo → Select from computer" entry.
    let coverDone = !(cover && singleVideo);
    for (let i = 0; i < 5 && !captionBox(); i++) {
      const d = createDialog();
      const next = d && OL.findClickable(L.next, d);
      if (next) OL.click(next);
      await OL.sleep(1500);
      if (!coverDone && createDialog() && !captionBox()) coverDone = await setReelCover(cover);
    }
    if (!coverDone) OL.note(OL.t('The cover wasn’t set (no Reels cover option found), so {platform}’s default was used', { platform: 'Instagram' }));
    const box = await OL.waitFor(captionBox, { timeout: 20000, what: OL.t('the caption box') });

    if (text.trim()) {
      OL.report('filling', OL.t('Filling in the caption…'));
      const ok = await OL.insertText(box, text);
      if (!ok) throw new OL.Error(OL.t('The caption didn’t go in ({platform}’s editor may have changed)', { platform: 'Instagram' }));
    }

    await OL.finish({
      waitingMessage: OL.t('Checking…'),
      readyTimeout: 30000,
      readyWhat: OL.t('the Share button'),
      ready: () => {
        const b = shareButton();
        return b && !OL.isDisabled(b);
      },
      verify: () => (text.trim() && !OL.hasText(captionBox(), text) ? [OL.t('The caption doesn’t match the draft')] : []),
      sendButton: shareButton,
      successTimeout: OL.budget(OL.bytesOf(media), 5 * 60_000), // Instagram uploads after you press Share
      success: () => {
        if (captionBox()) return null;
        return SHARED.test(dialogText()) ? { message: OL.t('Shared') } : null;
      },
    });
  });
})();
