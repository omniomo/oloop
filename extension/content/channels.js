// 视频号 adapter (channels.weixin.qq.com/platform/post/create). BETA.
// Checked against the live page in Nov 2026. The form is a wujie micro-app: its
// DOM sits in <wujie-app>'s shadow root and its scripts run in a hidden
// same-origin iframe. The cover picker checks `instanceof File` against that
// iframe, so the cover is handed over from the page's world (picker.js).
// Flow: video → 视频描述 → 短标题 → cover → location → wait for the upload → stop at 发表.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    video: 'input[type="file"][accept*="video"]',
    desc: ['.post-desc-box .input-editor[contenteditable]', '.input-editor[contenteditable]', '[contenteditable][data-placeholder="添加描述"]'],
    shortTitle: ['.post-short-title-wrap input', 'input[placeholder*="短标题"]'],
    progress: '.media-progress',
    coverImg: '.cover-preview-wrap img',
    coverEdit: '.cover-preview-wrap .edit-btn',
    dialog: '.weui-desktop-dialog__wrp',
    coverInput: 'input[type="file"][accept*="image"]',
    crop: 'canvas.cr-image',
    place: '.post-position-wrap .position-display',
    placeName: '.post-position-wrap .location-name',
    placeOption: '.post-position-wrap .option-item',
  };
  const L = {
    publish: ['发表'],
    confirm: ['确认'],
    cancel: ['取消'],
    noPlace: '不显示位置',
    posted: /发表成功|已发表/,
  };

  const root = () => document.querySelector('wujie-app')?.shadowRoot || null;
  const $ = (sel, r = root()) => (r ? OL.$(sel, r) : null);
  const $$ = (sel, r = root()) => (r ? OL.$$(sel, r) : []);
  const first = (sels, r = root()) => (r ? OL.first(sels, r) : null);
  const disabled = (b) => !b || OL.isDisabled(b) || /\bweui-desktop-btn_disabled\b/.test(b.className);
  const publishButton = () => (root() ? OL.findClickable(L.publish, root(), 'button') : null);
  const uploading = () => OL.visible($(SEL.progress));

  /** A few pixels of the crop canvas, to tell when an upload has landed in it. */
  function print(c) {
    try {
      const g = c.getContext('2d', { willReadFrequently: true });
      return [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6]].map(([x, y]) => g.getImageData((c.width * x) | 0, (c.height * y) | 0, 1, 1).data.join(',')).join(';');
    } catch {
      return null;
    }
  }

  /**
   * 「编辑封面」: frames of the video, or 上传封面 (JPEG/PNG), cropped to 3:4 for the
   * profile grid and share card. We upload our cover (the chosen frame or image),
   * confirm, and count it once the form's cover has changed.
   */
  async function setCover(cover) {
    const edit = await OL.tryWaitFor(() => $(SEL.coverEdit), { timeout: 20000 });
    if (!edit) return false;
    const was = $(SEL.coverImg)?.src || '';
    const before = new Set($$(SEL.dialog).filter(OL.visible));
    OL.click(edit);
    const dlg = await OL.tryWaitFor(() => $$(SEL.dialog).find((d) => OL.visible(d) && !before.has(d) && $(SEL.coverInput, d)) || null, { timeout: 10000 });
    if (!dlg) return false;
    const cancel = () => {
      const b = OL.findClickable(L.cancel, dlg, 'button');
      if (b) OL.click(b);
    };
    await OL.sleep(600);
    const crop = $(SEL.crop, dlg);
    const old = crop ? print(crop) : null;
    let [file] = await OL.loadMedia([cover], OL.t('cover'));
    if (!/^image\/(jpeg|png)$/.test(file.type)) file = await OL.toJpeg(file);
    const input = $(SEL.coverInput, dlg);
    input.value = '';
    // The picker checks `instanceof File` against the app's window: hand it over from the page's world.
    if (!(await OL.setFilesInPage(input, [file]))) OL.setFiles(input, [file]);
    const took = old == null
      ? await OL.sleep(2500).then(() => true)
      : await OL.tryWaitFor(() => { const now = print(crop); return now != null && now !== old; }, { timeout: 15000 });
    const ok = took && OL.findClickable(L.confirm, dlg, 'button');
    if (!ok) {
      cancel();
      return false;
    }
    OL.click(ok);
    return !!(await OL.tryWaitFor(() => (!OL.visible(dlg) && ($(SEL.coverImg)?.src || '') !== was) || null, { timeout: 20000 }));
  }

  /** 视频号 fills in the city it guesses; pick 不显示位置 unless asked to show it. */
  async function hidePlace() {
    const name = () => OL.text($(SEL.placeName));
    if (!$(SEL.place) || name() === L.noPlace) return true;
    OL.click($(SEL.place));
    const opt = await OL.tryWaitFor(() => $$(SEL.placeOption).find((o) => OL.visible(o) && OL.text(o).startsWith(L.noPlace)) || null, { timeout: 5000 });
    if (!opt) return false;
    OL.click(opt);
    return !!(await OL.tryWaitFor(() => name() === L.noPlace || !name() || null, { timeout: 3000 }));
  }

  OL.register('channels', async (job) => {
    const { title = '', text = '', media = [], cover = null, options = {} } = job.payload;
    if (!media.length) throw new OL.Error(OL.t('No video'));
    const name = OL.t('WeChat Channels');

    OL.report('filling', OL.t('Waiting for the {platform} upload page…', { platform: name }));
    const input = await OL.waitFor(
      () => (/\/login/.test(location.pathname) ? 'login' : $(SEL.video)),
      { timeout: 30000, what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} upload button', { platform: name }), platform: name }) },
    );
    if (input === 'login') throw new OL.Error(OL.t('Signed out, or the session expired'), 'login');
    const files = await OL.loadMedia(media, OL.t('video'));
    await OL.ensureVisible();

    OL.report('filling', OL.t('Adding the video…'));
    await OL.attachFiles({
      files,
      input: () => $(SEL.video) || input,
      check: () => $(SEL.coverEdit) || uploading(),
      started: () => uploading(),
      timeout: 90000,
    });

    const box = await OL.waitFor(() => first(SEL.desc), { what: OL.t('the {platform} description box', { platform: name }) });
    if (text && !(await OL.insertText(box, text))) throw new OL.Error(OL.t('The description didn’t go in ({platform}’s editor may have changed)', { platform: name }));

    if (title) {
      const st = first(SEL.shortTitle);
      if (!st || !(await OL.insertText(st, title))) OL.note(OL.t('The title didn’t go in'));
    }

    if (cover) {
      OL.report('filling', OL.t('Setting the cover…'));
      if (!(await setCover(cover))) OL.note(OL.t('The cover wasn’t set, so {platform}’s default was used', { platform: name }));
    }

    if (!options.showLocation && !(await hidePlace())) OL.note(OL.t('The location is still shown; change it before you post'));

    await OL.finish({
      waitingMessage: OL.t('Waiting for {platform} to finish uploading…', { platform: name }),
      readyTimeout: OL.budget(OL.bytesOf(media), 5 * 60_000),
      progressText: () => OL.progressHint(root() || document),
      readyWhat: OL.t('{platform} to finish uploading and turn on {button}', { platform: name, button: '发表' }),
      ready: () => !uploading() && !!$(SEL.coverImg) && !disabled(publishButton()),
      readyMessage: OL.t('Ready. Press {button}.', { button: '发表' }),
      verify: () => (!text || OL.hasText(first(SEL.desc), text) ? [] : [OL.t('The description doesn’t match the draft')]),
      sendButton: publishButton,
      successTimeout: 5 * 60_000,
      success: () => {
        if (/\/post\/list/.test(location.pathname)) return { message: OL.t('Posted') };
        const r = root();
        return r && L.posted.test(OL.text(r.querySelector('body') || r.firstElementChild)) && !OL.visible(publishButton()) ? { message: OL.t('Posted') } : null;
      },
    });
  });
})();
