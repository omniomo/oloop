// TikTok Studio adapter (tiktok.com/tiktokstudio/upload). BETA: not yet checked
// against the live site. Flow: video → caption (replaces the file name TikTok
// pre-fills) → optional cover upload → wait for the upload → Post.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    fileInput: 'input[type="file"][accept*="video"]',
    caption: ['.public-DraftEditor-content[contenteditable="true"]', 'div[contenteditable="true"][role="combobox"]', 'div[contenteditable="true"]'],
    post: 'button[data-e2e="post_video_button"]',
  };
  const L = {
    post: ['Post', '发布', '發佈', '發布'],
    editCover: ['Edit cover', '编辑封面', '編輯封面', 'Select cover', '选择封面', '選擇封面'],
    uploadCover: ['Upload cover', '上传封面', '上傳封面', 'Upload image', '上传图片', '上傳圖片'],
    confirm: ['Confirm', '确认', '確認', 'Save', '保存', 'Done', '完成'],
    posted: /(video|post) (has been|was) (posted|published|uploaded)|视频已发布|影片已發佈|已发布|已發佈|发布成功/i,
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

  async function setCover(cover) {
    const d = doc();
    const edit = OL.findClickable(L.editCover, d) || OL.findClickable(L.editCover, d, 'div, span');
    if (!edit) return false;
    OL.click(edit);
    const tab = await OL.tryWaitFor(() => OL.findClickable(L.uploadCover, d) || OL.findClickable(L.uploadCover, d, 'div, span'), { timeout: 6000 });
    if (!tab) return false;
    OL.click(tab);
    await OL.sleep(600);
    let input = OL.$$('input[type="file"]', d).find((i) => /image/.test(i.accept || ''));
    if (!input) {
      const zone = OL.findClickable(L.uploadCover, d) || tab;
      input = await OL.openFileInput(zone, { doc: d, accept: 'image' });
    }
    if (!input) return false;
    const [file] = await OL.loadMedia([cover], OL.t('cover'));
    OL.setFiles(input, [file]);
    await OL.sleep(2500);
    const ok = await OL.tryWaitFor(() => {
      const b = OL.findClickable(L.confirm, d, 'button');
      return b && !OL.isDisabled(b) ? b : null;
    }, { timeout: 15000 });
    if (!ok) return false;
    OL.click(ok);
    await OL.sleep(800);
    return true;
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
