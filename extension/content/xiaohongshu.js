// 小红书 adapter (creator.xiaohongshu.com/publish/publish). BETA: written from
// public references, not yet checked against the live site.
// Flow: pick the tab (上传图文 for images, 上传视频 for one video) → files →
// title → body → cover (video) → wait for uploads → stop at 发布.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    title: ['input[placeholder*="标题"]', '.d-input input[type="text"]', 'input.d-text', 'input[type="text"]'],
    body: ['.tiptap.ProseMirror[contenteditable="true"]', '.ql-editor[contenteditable="true"]', '[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'],
  };
  const L = {
    imageTab: '上传图文',
    videoTab: '上传视频',
    publish: ['发布'], // exact: the sidebar's 「发布笔记」 is a different button
    setCover: ['设置封面', '修改封面', '编辑封面', '更换封面'],
    uploadCover: ['上传封面', '上传图片', '本地上传'],
    confirm: ['确定', '确认', '完成'],
    uploading: /上传中|上传失败|正在上传|处理中/,
    posted: /发布成功|已发布/,
  };

  const onScreen = (el) => {
    if (!OL.visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.right > 0 && r.left < innerWidth && r.bottom > 0;
  };

  /** The tab headers are plain elements with the tab name as their only text. */
  function tab(name) {
    return (
      OL.$$('.creator-tab, [class*="tab" i], span, div')
        .filter((el) => OL.text(el) === name && onScreen(el))
        .map((el) => el.closest('.creator-tab, [class*="tab" i]') || el)[0] || null
    );
  }

  function fileInput(kind) {
    const all = OL.$$('input[type="file"]').sort((a, b) => b.classList.contains('upload-input') - a.classList.contains('upload-input'));
    return (
      all.find((i) => {
        const a = (i.accept || '').toLowerCase();
        return kind === 'video' ? /video|mp4|mov/.test(a) : /image|jpg|jpeg|png|webp/.test(a);
      }) ||
      OL.$('input.upload-input') ||
      null
    );
  }

  const titleBox = () => OL.first(SEL.title);
  const bodyBox = () => OL.$$(SEL.body.join(',')).find((el) => onScreen(el)) || null;
  /** The form's own 发布 button: the lowest one on the page. */
  const publishButton = () =>
    OL.$$('button')
      .filter((b) => onScreen(b) && L.publish.includes(OL.text(b)))
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  const busy = () => {
    const t = OL.text(document.querySelector('.publish-page, main, #app') || document.body);
    return L.uploading.test(t.slice(0, 4000)) || !!OL.progressHint();
  };

  /** `main` is the input the video went into: the cover input is another one. */
  async function setCover(cover, main) {
    const edit = OL.findText(L.setCover);
    if (!edit) return false;
    OL.click(edit);
    const upload = await OL.tryWaitFor(() => OL.findText(L.uploadCover), { timeout: 6000 });
    if (upload) OL.click(upload);
    await OL.sleep(500);
    const coverInput = () => OL.$$('input[type="file"]').find((i) => i !== main && !i.classList.contains('upload-input') && /image/.test(i.accept || ''));
    let input = coverInput();
    if (!input && upload) input = await OL.openFileInput(upload, { accept: 'image' });
    if (!input) return false;
    const [file] = await OL.loadMedia([cover], OL.t('cover'));
    OL.setFiles(input, [file]);
    await OL.sleep(2500);
    const ok = await OL.tryWaitFor(() => {
      const b = OL.findText(L.confirm);
      return b && !OL.isDisabled(b) ? b : null;
    }, { timeout: 15000 });
    if (!ok) return false;
    OL.click(ok);
    await OL.sleep(800);
    return true;
  }

  OL.register('xiaohongshu', async (job) => {
    const { title = '', text = '', media = [], cover = null } = job.payload;
    if (!media.length) throw new OL.Error(OL.t('No media'));
    const kind = media[0].type.startsWith('video/') ? 'video' : 'image';

    OL.report('filling', OL.t('Waiting for the {platform} publish page…', { platform: OL.t('RedNote') }));
    const header = await OL.waitFor(() => tab(kind === 'video' ? L.videoTab : L.imageTab), {
      timeout: 40000,
      what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {tab} tab', { tab: kind === 'video' ? L.videoTab : L.imageTab }), platform: OL.t('the RedNote creator platform') }),
    });
    await OL.ensureVisible();
    OL.click(header);
    await OL.sleep(800);

    const files = await OL.loadMedia(media, kind === 'video' ? OL.t('video') : OL.t('images'));
    OL.report('filling', kind === 'video' ? OL.t('Adding the video…') : OL.t('Adding images ({n})…', { n: files.length }));
    let main = null;
    await OL.attachFiles({
      files,
      input: () => (main = fileInput(kind)),
      check: () => titleBox() && bodyBox(),
      started: () => OL.progressHint() || OL.previewCount(document) > 0,
      timeout: 90000,
      what: OL.t('the {platform} title and body boxes', { platform: OL.t('RedNote') }),
    });

    if (title.trim()) {
      const t = titleBox();
      if (!(await OL.insertText(t, title))) throw new OL.Error(OL.t('The title didn’t go in'));
    }
    OL.report('filling', OL.t('Filling in the body…'));
    if (text.trim() && !(await OL.insertText(bodyBox(), text))) throw new OL.Error(OL.t('The body didn’t go in ({platform}’s editor may have changed)', { platform: OL.t('RedNote') }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // the #话题 suggestion list

    if (cover && kind === 'video') {
      OL.report('filling', OL.t('Setting the cover…'));
      if (!(await setCover(cover, main))) OL.note(OL.t('The cover wasn’t set, so {platform}’s default was used', { platform: OL.t('RedNote') }));
    }

    await OL.finish({
      waitingMessage: kind === 'video' ? OL.t('Waiting for {platform} to finish uploading…', { platform: OL.t('RedNote') }) : OL.t('Waiting for the images to upload…'),
      readyTimeout: OL.budget(OL.bytesOf(media), 3 * 60_000),
      progressText: () => OL.progressHint(),
      readyWhat: OL.t('{platform} to finish uploading and turn on {button}', { platform: OL.t('RedNote'), button: '发布' }),
      ready: () => {
        const b = publishButton();
        return b && !OL.isDisabled(b) && !busy();
      },
      verify: () => {
        const out = [];
        if (title.trim() && !OL.hasText(titleBox(), title)) out.push(OL.t('The title doesn’t match the draft'));
        if (text.trim() && !OL.hasText(bodyBox(), text)) out.push(OL.t('The body doesn’t match the draft'));
        return out;
      },
      sendButton: publishButton,
      successTimeout: 2 * 60_000,
      success: () => {
        if (/\/publish\/success|\/new\/note-manager/.test(location.pathname)) return { message: OL.t('Posted') };
        return L.posted.test(OL.textOutsideEditors(document.body)) && !onScreen(publishButton()) ? { message: OL.t('Posted') } : null;
      },
    });
  });
})();
