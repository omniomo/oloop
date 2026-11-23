// Bilibili adapter (member.bilibili.com/platform/upload/video/frame). BETA:
// written from public references, not yet checked against the live site.
// Flow: video → title (replaces the file name B站 pre-fills) → 自制 → tags →
// 简介 → cover → wait for 上传完成 → stop at 立即投稿.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    title: ['input[maxlength="80"][type="text"]', 'input[placeholder*="标题"]', '.video-title input'],
    tags: ['input[placeholder*="回车"]', 'input[placeholder*="标签"]', '.tag-input-wrp input'],
    desc: ['.ql-editor[contenteditable="true"]', '.desc-container [contenteditable="true"]', 'div[contenteditable="true"]'],
    submit: ['span.submit-add', 'button.submit-add', '.submit-container .submit-add'],
  };
  const L = {
    original: ['自制'],
    submit: ['立即投稿'], // not 「投稿」: that is also the sidebar's menu item
    setCover: ['更换封面', '封面设置', '上传封面', '设置封面'],
    uploadCover: ['上传封面', '本地上传', '上传图片'],
    confirm: ['完成', '确定', '确认'],
    done: /上传完成/,
    uploading: /上传中|正在上传|剩余时间|\d{1,3}(\.\d+)?\s*%/,
    posted: /稿件投递成功|投稿成功|提交成功/,
  };

  const onScreen = (el) => {
    if (!OL.visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.right > 0 && r.left < innerWidth;
  };

  const videoInput = () =>
    OL.$$('input[type="file"]').find((i) => {
      const a = (i.accept || '').toLowerCase();
      return !a || /video|mp4|flv|mov|mkv/.test(a);
    }) || null;
  const titleBox = () => OL.first(SEL.title);
  const descBox = () => OL.$$(SEL.desc.join(',')).find(onScreen) || null;
  const submitButton = () => OL.first(SEL.submit) || OL.findText(L.submit);
  const uploadArea = () => OL.$('.file-list, .upload-list, [class*="upload-status" i], [class*="file-item" i]') || document.body;
  const uploaded = () => L.done.test(OL.text(uploadArea()));

  /** Tags go in one at a time, each confirmed with Enter. */
  async function addTags(tags) {
    const input = OL.first(SEL.tags);
    if (!input) return 0;
    const box = input.closest('[class*="tag" i]') || input.parentElement;
    let added = 0;
    for (const tag of tags.slice(0, 10)) {
      if (OL.norm(OL.text(box)).includes(OL.norm(tag))) {
        added++;
        continue;
      }
      await OL.insertText(input, tag);
      for (const type of ['keydown', 'keypress', 'keyup']) {
        input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }
      await OL.sleep(700);
      if (OL.norm(OL.text(box)).includes(OL.norm(tag))) added++;
    }
    return added;
  }

  async function setCover(cover) {
    const edit = OL.findText(L.setCover) || OL.$('.cover-main-img, .cover-main .img');
    if (!edit) return false;
    OL.click(edit);
    const upload = await OL.tryWaitFor(() => OL.findText(L.uploadCover), { timeout: 6000 });
    if (upload) OL.click(upload);
    await OL.sleep(500);
    let input = OL.$$('input[type="file"]').find((i) => /image/.test(i.accept || ''));
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

  OL.register('bilibili', async (job) => {
    const { title = '', text = '', media = [], cover = null, options = {} } = job.payload;
    if (!media.length) throw new OL.Error(OL.t('No video'));
    const tags = (options.tags || '').trim()
      ? options.tags.split(/[,，、\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean)
      : [...new Set((text.match(/#[^\s#]+/g) || []).map((t) => t.slice(1).replace(/[#，。,.!！?？]+$/, '')).filter(Boolean))];

    OL.report('filling', OL.t('Waiting for the {platform} upload page…', { platform: 'Bilibili' }));
    const input = await OL.waitFor(videoInput, { timeout: 40000, what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} upload button', { platform: 'Bilibili' }), platform: 'Bilibili' }) });
    const files = await OL.loadMedia(media, OL.t('video'));
    await OL.ensureVisible();

    OL.report('filling', OL.t('Adding the video, waiting for the details form…'));
    const t = await OL.attachFiles({
      files,
      input: () => videoInput() || input,
      check: titleBox,
      started: () => OL.progressHint() || L.uploading.test(OL.text(uploadArea())),
      timeout: 90000,
      what: OL.t('the {platform} title box', { platform: 'Bilibili' }),
    });
    await OL.sleep(800); // B站 drops the file name in first
    if (!(await OL.insertText(t, title))) throw new OL.Error(OL.t('The title didn’t go in'));

    const own = OL.findText(L.original);
    if (own) OL.click(own);

    if (tags.length) {
      OL.report('filling', OL.t('Adding tags…'));
      const n = await addTags(tags);
      if (n < tags.length) OL.note(OL.t('Only {n} of {total} tags were added', { n, total: tags.length }));
    }

    if (text.trim()) {
      OL.report('filling', OL.t('Filling in the description…'));
      const d = await OL.tryWaitFor(descBox, { timeout: 8000 });
      if (!d || !(await OL.insertText(d, text))) OL.note(OL.t('The description didn’t go in. Add it on the page.'));
    }

    if (cover) {
      OL.report('filling', OL.t('Setting the cover…'));
      if (!(await setCover(cover))) OL.note(OL.t('The cover wasn’t set, so {platform}’s default was used', { platform: 'Bilibili' }));
    }

    await OL.finish({
      waitingMessage: OL.t('Waiting for {platform} to finish uploading…', { platform: 'Bilibili' }),
      readyTimeout: OL.budget(OL.bytesOf(media), 5 * 60_000),
      progressText: () => OL.progressHint() || (OL.text(uploadArea()).match(/\d{1,3}(\.\d+)?\s*%/) || [''])[0],
      readyWhat: OL.t('{platform} to finish uploading and turn on {button}', { platform: 'Bilibili', button: '立即投稿' }),
      readyMessage: tags.length ? undefined : OL.t('Add a tag, then press {button}', { button: '立即投稿' }),
      ready: () => {
        const b = submitButton();
        return b && !OL.isDisabled(b) && uploaded();
      },
      verify: () => {
        const out = [];
        if (!OL.hasText(titleBox(), title)) out.push(OL.t('The title doesn’t match the draft'));
        return out;
      },
      sendButton: submitButton,
      successTimeout: 2 * 60_000,
      success: () => (L.posted.test(OL.textOutsideEditors(document.body)) ? { message: OL.t('Posted') } : null),
    });
  });
})();
