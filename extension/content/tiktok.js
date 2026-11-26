// TikTok Studio adapter (tiktok.com/tiktokstudio/upload). BETA: not yet checked
// against the live site. Flow: video → caption (replaces the file name TikTok
// pre-fills) → optional cover upload → wait for the upload → Post.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    fileInput: 'input[type="file"][accept*="video"]',
    caption: ['.public-DraftEditor-content[contenteditable="true"]', 'div[contenteditable="true"][role="combobox"]', 'div[contenteditable="true"]'],
    post: 'button[data-e2e="post_video_button"]',
    editCover: ['[data-e2e="cover_container"] .cover-container', '[data-e2e="cover_container"] [class*="edit-container"]'],
    coverImage: '[data-e2e="cover_container"] img',
    removeUploaded: '[aria-label="Delete uploaded image"], [aria-label*="delete" i][aria-label*="upload" i], [aria-label*="删除"], [aria-label*="刪除"]',
    uploadArea: '[class*="ImageUpload__uploadArea"]',
    headerButton: 'button[class*="header-button"]', // the editor's Cancel, Save (in that order)
  };
  const L = {
    post: ['Post', '发布', '發佈', '發布'],
    editCover: ['Edit cover', '编辑封面', '編輯封面', 'Select cover', '选择封面', '選擇封面'],
    uploadCover: ['Upload cover', 'Upload cover image', '上传封面', '上傳封面', 'Upload image', '上传图片', '上傳圖片'],
    confirm: ['Save', '保存', '儲存', 'Confirm', '确认', '確認', 'Done', '完成', '저장', 'Guardar', 'Enregistrer', 'Speichern', 'Salvar'],
    cancel: ['Cancel', '取消', 'キャンセル', '취소', 'Cancelar', 'Annuler', 'Abbrechen'],
    posted: /(video|post) (has been|was) (posted|published|uploaded)|视频已发布|影片已發佈|已发布|已發佈|发布成功|投稿しました|게시되었습니다|se publicó|a été publiée|wurde gepostet|foi publicado/i,
  };

  /** Studio is top-level; the older uploader lived in a same-origin iframe. */
  function doc() {
    if (OL.$(SEL.fileInput)) return document;
    for (const f of OL.$$('iframe')) {
      try {
        if (f.contentDocument?.querySelector(SEL.fileInput)) return f.contentDocument;
      } catch {}
    }
    return document;
  }
  const caption = () => OL.first(SEL.caption, doc());
  const postButton = () => OL.$(SEL.post, doc()) || OL.findClickable(L.post, doc(), 'button');
  const uploading = () =>
    OL.$$('[class*="progress" i], [class*="upload" i]', doc()).some(
      (el) => OL.visible(el) && el.children.length < 8 && /\d{1,3}\s*%/.test(OL.text(el)),
    );

  /** The cover shown on the form; its src changes when a new cover is saved. */
  const coverImage = () => OL.$(SEL.coverImage, doc());

  /**
   * "Edit cover" (checked Nov 2026) opens a full-screen editor: a frame strip, an
   * "Upload cover" label wrapping an image input (JPEG/PNG only), and Cancel/Save in
   * its header. We upload our cover (the chosen frame or image) into that input, wait
   * for it to replace the frame, save, and count it only once the form's cover changed.
   */
  async function setCover(cover) {
    const d = doc();
    const edit = await OL.tryWaitFor(
      () => OL.first(SEL.editCover, d) || OL.findClickable(L.editCover, d) || OL.findText(L.editCover, d),
      { timeout: 20000 },
    );
    if (!edit) return false;
    const was = coverImage()?.src || '';
    const before = new Set(OL.$$('[role="dialog"]', d).filter(OL.visible));
    OL.click(edit);
    const imageInput = (root) => OL.$$('input[type="file"]', root).find((i) => /image/.test(i.accept || ''));
    const removeUploaded = (root) => OL.$(SEL.removeUploaded, root);
    const dlg = await OL.tryWaitFor(
      () => OL.$$('[role="dialog"]', d).find((x) => !before.has(x) && OL.visible(x) && (imageInput(x) || removeUploaded(x))) || null,
      { timeout: 10000 },
    );
    if (!dlg) return false;
    const headerButtons = () => OL.$$(SEL.headerButton, dlg).filter((b) => OL.visible(b) && OL.text(b));
    const cancel = () => {
      const b = OL.findClickable(L.cancel, dlg, 'button') || headerButtons()[0];
      if (b) OL.click(b);
    };
    // A cover uploaded earlier hides the upload input until it's removed.
    if (!imageInput(dlg)) {
      const rm = removeUploaded(dlg) || OL.$$('[class*="ImageUpload"] button', dlg).find(OL.visible);
      if (rm) OL.click(rm);
    }
    const input = await OL.tryWaitFor(() => imageInput(dlg), { timeout: 5000 });
    if (!input) {
      cancel();
      return false;
    }
    let [file] = await OL.loadMedia([cover], OL.t('cover'));
    if (input.accept && !input.accept.split(/\s*,\s*/).includes(file.type)) file = await OL.toJpeg(file);
    OL.setFiles(input, [file]);
    // The upload label gives way to the image once TikTok has taken it.
    const took = await OL.tryWaitFor(() => (!OL.findClickable(L.uploadCover, dlg) && !OL.$$(SEL.uploadArea, dlg).some(OL.visible)) || null, { timeout: 15000 });
    if (!took) {
      cancel();
      return false;
    }
    await OL.sleep(800);
    const save = await OL.tryWaitFor(() => {
      const b = OL.findClickable(L.confirm, dlg, 'button') || headerButtons().at(-1);
      return b && !OL.isDisabled(b) ? b : null;
    }, { timeout: 15000 });
    if (!save) {
      cancel();
      return false;
    }
    OL.click(save);
    return !!(await OL.tryWaitFor(() => (!OL.visible(dlg) && (coverImage()?.src || '') !== was) || null, { timeout: 15000 }));
  }

  OL.register('tiktok', async (job) => {
    const { text = '', media = [], cover = null } = job.payload;
    if (!media.length) throw new OL.Error(OL.t('No video'));

    OL.report('filling', OL.t('Waiting for the {platform} upload page…', { platform: 'TikTok' }));
    const input = await OL.waitFor(() => OL.$(SEL.fileInput, doc()), {
      timeout: 30000,
      what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} upload button', { platform: 'TikTok' }), platform: 'TikTok' }),
    });
    const files = await OL.loadMedia(media, OL.t('video'));
    await OL.ensureVisible();

    OL.report('filling', OL.t('Adding the video, waiting for the description box…'));
    const box = await OL.attachFiles({
      files,
      input: () => OL.$(SEL.fileInput, doc()) || input,
      check: caption,
      started: () => OL.progressHint(doc()),
      timeout: 90000,
      what: OL.t('the {platform} description box', { platform: 'TikTok' }),
    });
    await OL.sleep(1500); // TikTok drops the file name in first
    if (!(await OL.insertText(box, text))) throw new OL.Error(OL.t('The description didn’t go in ({platform}’s editor may have changed)', { platform: 'TikTok' }));

    if (cover) {
      OL.report('filling', OL.t('Setting the cover…'));
      if (!(await setCover(cover))) OL.note(OL.t('The cover wasn’t set, so {platform}’s default was used', { platform: 'TikTok' }));
    }

    await OL.finish({
      waitingMessage: OL.t('Waiting for {platform} to finish uploading…', { platform: 'TikTok' }),
      readyTimeout: OL.budget(OL.bytesOf(media), 5 * 60_000),
      progressText: () => OL.progressHint(doc()),
      readyWhat: OL.t('{platform} to finish uploading and turn on {button}', { platform: 'TikTok', button: 'Post' }),
      ready: () => {
        const b = postButton();
        return b && !OL.isDisabled(b) && !uploading();
      },
      verify: () => (OL.hasText(caption(), text) ? [] : [OL.t('The description doesn’t match the draft')]),
      sendButton: postButton,
      successTimeout: 5 * 60_000,
      success: () => {
        if (/\/tiktokstudio\/content|\/manage/.test(location.pathname)) return { message: OL.t('Posted') };
        return L.posted.test(OL.textOutsideEditors(doc().body)) && !OL.visible(postButton()) ? { message: OL.t('Posted') } : null;
      },
    });
  });
})();
