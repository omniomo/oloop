// Bilibili adapter (member.bilibili.com/platform/upload/video/frame). BETA.
// Checked against the live page in Nov 2026.
// Flow: video → title (replaces the file name B站 pre-fills) → tags → 简介 →
// covers (4:3 and 16:9) → wait for 上传完成 → stop at 立即投稿.
// 创作声明 is left to the user: it's a statement about the content, and B站
// doesn't let it be changed afterwards.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    title: ['input[maxlength="80"][type="text"]', 'input[placeholder*="标题"]', '.video-title input'],
    tags: ['input[placeholder*="回车"]', 'input[placeholder*="标签"]', '.tag-input-wrp input'],
    desc: ['.ql-editor[contenteditable="true"]', '.desc-container [contenteditable="true"]', 'div[contenteditable="true"]'],
    submit: ['span.submit-add', 'button.submit-add', '.submit-container .submit-add'],
  };
  // 「封面制作」: one fabric.js canvas per ratio (pressing one makes it the target of an
  // upload), a 双比例同步改动 checkbox that sends an upload to both, one image input
  // shared by both, and 完成 at the bottom right.
  const COVER = {
    trigger: ['.cover-main .cover-empty', '.cover-main .cover-img', '.cover-main .cover-slot', '.cover-main-img'],
    editor: '.cover-editor',
    canvas: (r) => `.editor_${r} canvas.upper-canvas`,
    pixels: (r) => `.editor_${r} canvas.lower-canvas`,
    active: (r) => `.cover-editor-panel-canvas > .active .editor_${r}`,
    sync: '.sync-checkbox-wrapper',
    input: '.cover-upload input[type="file"]',
    done: '.cover-editor-button .submit',
    cancel: '.cover-editor-button .button:not(.submit)',
  };
  const L = {
    submit: ['立即投稿'], // not 「投稿」: that is also the sidebar's menu item
    setCover: ['添加封面', '封面设置', '更换封面'],
    confirm: ['完成'],
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

  /** A few pixels of a ratio's canvas, to tell when an upload has landed in it. */
  function print(ed, ratio) {
    try {
      const c = OL.$(COVER.pixels(ratio), ed);
      const g = c.getContext('2d', { willReadFrequently: true });
      return [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6], [0.5, 0.2], [0.5, 0.8]]
        .map(([x, y]) => g.getImageData((c.width * x) | 0, (c.height * y) | 0, 1, 1).data.join(','))
        .join(';');
    } catch {
      return null;
    }
  }

  /**
   * Home feed (4:3) and profile (16:9) covers. One image for both goes in with 双比例
   * 同步改动 on, so B站 crops it for each; two different images go in one per canvas.
   */
  async function setCovers(c43, c169) {
    const trigger = await OL.tryWaitFor(() => OL.first(COVER.trigger) || OL.findText(L.setCover), { timeout: 15000 });
    if (!trigger) return false;
    OL.click(trigger);
    const ed = await OL.tryWaitFor(() => OL.$$(COVER.editor).find(OL.visible) || null, { timeout: 10000 });
    if (!ed) return false;
    const ready = await OL.tryWaitFor(() => OL.$(COVER.input, ed) && OL.$(COVER.canvas('4_3'), ed) && OL.$(COVER.canvas('16_9'), ed), { timeout: 10000 });
    const cancel = () => {
      const b = OL.$(COVER.cancel, ed);
      if (b) OL.click(b);
    };
    if (!ready) {
      cancel();
      return false;
    }
    await OL.sleep(600);

    const box = OL.$(COVER.sync, ed);
    const setSync = async (on) => {
      const cb = box && OL.$('input[type="checkbox"]', box);
      if (!cb || cb.checked === on) return;
      OL.click(OL.$('label', box) || box);
      await OL.tryWaitFor(() => cb.checked === on, { timeout: 2000 });
    };
    const put = async (ratio, cover) => {
      OL.click(OL.$(COVER.canvas(ratio), ed));
      if (!(await OL.tryWaitFor(() => OL.$(COVER.active(ratio), ed), { timeout: 3000 }))) return false;
      const before = print(ed, ratio);
      let [file] = await OL.loadMedia([cover], OL.t('cover'));
      if (!/^image\/(jpeg|png)$/.test(file.type)) file = await OL.toJpeg(file);
      OL.setFiles(OL.$(COVER.input, ed), [file]);
      if (before == null) {
        await OL.sleep(2500);
        return true;
      }
      return !!(await OL.tryWaitFor(() => { const now = print(ed, ratio); return now != null && now !== before; }, { timeout: 15000 }));
    };

    let ok;
    if (c43 && c169 && c43.id === c169.id) {
      await setSync(true);
      ok = await put('4_3', c43);
    } else {
      await setSync(false);
      ok = (!c43 || (await put('4_3', c43))) && (!c169 || (await put('16_9', c169)));
    }
    const done = ok && (OL.$(COVER.done, ed) || OL.findText(L.confirm, ed));
    if (!done) {
      cancel();
      return false;
    }
    await OL.sleep(500);
    OL.click(done);
    return !!(await OL.tryWaitFor(() => !OL.visible(ed) || null, { timeout: 15000 }));
  }

  /** The 创作声明 picker, when it's still empty. */
  const statementEmpty = () => {
    const i = OL.$('.creation-statement-container input');
    return !!i && !i.value.trim();
  };

  OL.register('bilibili', async (job) => {
    const { title = '', text = '', media = [], cover = null, covers = null, options = {} } = job.payload;
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

    const c43 = covers?.['4x3'] || cover;
    const c169 = covers?.['16x9'] || cover;
    if (c43 || c169) {
      OL.report('filling', OL.t('Setting the cover…'));
      if (!(await setCovers(c43, c169))) OL.note(OL.t('The cover wasn’t set, so {platform}’s default was used', { platform: 'Bilibili' }));
    }

    const field = '创作声明';
    const button = '立即投稿';
    const needs = statementEmpty();
    const readyMessage = !tags.length
      ? needs
        ? OL.t('Add a tag and choose {field}, then press {button}', { field, button })
        : OL.t('Add a tag, then press {button}', { button })
      : needs
        ? OL.t('Choose {field}, then press {button}', { field, button })
        : undefined;

    await OL.finish({
      waitingMessage: OL.t('Waiting for {platform} to finish uploading…', { platform: 'Bilibili' }),
      readyTimeout: OL.budget(OL.bytesOf(media), 5 * 60_000),
      progressText: () => OL.progressHint() || (OL.text(uploadArea()).match(/\d{1,3}(\.\d+)?\s*%/) || [''])[0],
      readyWhat: OL.t('{platform} to finish uploading and turn on {button}', { platform: 'Bilibili', button: '立即投稿' }),
      readyMessage,
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
