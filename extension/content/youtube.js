// YouTube Studio adapter. Opens https://www.youtube.com/upload, which redirects
// to the Studio upload dialog. Studio's ids and radio names are language-neutral.
// Flow: file → title/description → thumbnail → made-for-kids → Next ×3 →
// visibility → wait for the upload to finish → Publish.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    dialog: 'ytcp-uploads-dialog',
    fileInputs: 'ytcp-uploads-file-picker input[type="file"], ytcp-uploads-dialog input[type="file"], input[type="file"]',
    uploadIcon: '#upload-icon',
    createIcon: '#create-icon',
    uploadMenuItem: '#text-item-0',
    title: '#title-textarea #textbox',
    description: '#description-textarea #textbox',
    kidsYes: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]',
    kidsNo: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    thumbButton: '#select-button, ytcp-thumbnails-compact-editor-uploader button, ytcp-thumbnail-uploader button',
    next: '#next-button',
    done: '#done-button',
    progress: 'ytcp-video-upload-progress',
    published: 'ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog',
    prechecks: 'ytcp-prechecks-warning-dialog',
  };

  /** The video picker, never the thumbnail one (#file-loader accepts only images). */
  const videoInput = () =>
    OL.$$(SEL.fileInputs).find(
      (i) => i.name === 'Filedata' || /video|\.mp4|\.mov/i.test(i.accept || '') || (!i.accept && i.id !== 'file-loader'),
    ) || null;

  const inDialog = (sel) => {
    const d = OL.$(SEL.dialog);
    return (d && OL.$(sel, d)) || OL.$(sel);
  };
  const visRadio = (v) => inDialog(`tp-yt-paper-radio-button[name="${v}"]`);
  const isChecked = (r) =>
    !!r && (r.checked === true || r.hasAttribute('checked') || r.getAttribute('aria-checked') === 'true' || r.classList.contains('iron-selected'));

  function progressLabel() {
    const p = inDialog(SEL.progress);
    return p ? OL.text(p).replace(/\s+/g, ' ').slice(0, 90) : '';
  }
  // "Uploading 45% … 3 minutes left" / "正在上传 45%"; processing % doesn't count.
  const isUploading = () => {
    const t = progressLabel();
    return /\d+\s*%/.test(t) && /upload|上传|上傳/i.test(t);
  };

  function videoLink(root = document) {
    return (
      OL.$$('a[href]', root)
        .map((a) => a.href)
        .find((h) => /youtu\.be\/|youtube\.com\/(shorts\/|watch\?)/.test(h)) || ''
    );
  }

  async function openUploadDialog() {
    const icon = OL.$(SEL.uploadIcon);
    if (icon && OL.visible(icon)) {
      OL.click(icon);
      return;
    }
    const create = await OL.waitFor(() => OL.$(SEL.createIcon), {
      timeout: 15000,
      what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the Create button in {platform}', { platform: 'YouTube Studio' }), platform: 'YouTube Studio' }),
    });
    OL.click(create);
    const item = await OL.waitFor(() => OL.$(SEL.uploadMenuItem), { timeout: 5000, what: OL.t('the Upload videos menu item') });
    OL.click(item);
  }

  /** Custom thumbnail. Needs a channel with custom thumbnails enabled (phone-verified). */
  async function setThumbnail(cover) {
    const dlg = OL.$(SEL.dialog) || document;
    let input = OL.$$('input[type="file"]', dlg).find((i) => /image/.test(i.accept || ''));
    if (!input) {
      const btn = OL.$$(SEL.thumbButton, dlg).find(OL.visible);
      if (btn && !OL.isDisabled(btn)) input = await OL.openFileInput(btn, { accept: 'image' });
    }
    if (!input) {
      OL.note(OL.t('The custom thumbnail wasn’t set. The channel may need phone verification before it can upload thumbnails.'));
      return;
    }
    OL.report('filling', OL.t('Uploading the thumbnail…'));
    const [file] = await OL.loadMedia([cover], OL.t('cover'));
    OL.setFiles(input, [file]);
    await OL.sleep(1500);
  }

  OL.register('youtube', async (job) => {
    const { title = '', text: description = '', media = [], cover = null, options = {} } = job.payload;
    const visibility = options.visibility || 'PUBLIC';
    const kidsSel = options.madeForKids === false ? SEL.kidsNo : SEL.kidsYes;
    const kidsLabel = options.madeForKids === false ? OL.t('“No, it’s not made for kids”') : OL.t('“Yes, it’s made for kids”');
    if (!media.length) throw new OL.Error(OL.t('No video'));

    const files = await OL.loadMedia(media, OL.t('video'));
    await OL.ensureVisible(); // Studio's upload dialog doesn't render in a hidden tab

    OL.report('filling', OL.t('Waiting for the upload dialog…'));
    let input = await OL.tryWaitFor(videoInput, { timeout: 12000, what: OL.t('the upload dialog') });
    if (!input) {
      await openUploadDialog();
      input = await OL.waitFor(videoInput, { timeout: 15000, what: OL.t('the video upload dialog') });
    }
    const titleBox = await OL.attachFiles({
      files,
      input: () => videoInput() || input,
      check: () => {
        const t = inDialog(SEL.title);
        return t && OL.visible(t) ? t : null;
      },
      started: () => progressLabel(),
      timeout: 60000,
      what: OL.t('the title box'),
    });
    OL.noRetry(); // Studio has created a draft video; starting over would make a second one
    OL.report('filling', OL.t('Filling in the title and description…'));
    await OL.sleep(1200); // Studio drops the file name in as the title asynchronously
    if (!(await OL.insertText(titleBox, title))) throw new OL.Error(OL.t('The title didn’t go in'));

    const descBox = inDialog(SEL.description);
    if (description.trim() && descBox) {
      if (!(await OL.insertText(descBox, description))) throw new OL.Error(OL.t('The description didn’t go in'));
    }

    if (cover) await setThumbnail(cover);

    const kids = await OL.waitFor(() => inDialog(kidsSel), { timeout: 15000, what: OL.t('the option {label}', { label: kidsLabel }) });
    if (!isChecked(kids)) OL.click(kids);
    await OL.sleep(400);
    if (!isChecked(inDialog(kidsSel))) {
      OL.click(inDialog(kidsSel));
      await OL.sleep(400);
    }
    // Studio unmounts the details step once you go Next, so the title and the
    // made-for-kids choice are checked here; later we re-check only what's still on the page.
    const details = { title: OL.hasText(inDialog(SEL.title), title), kids: isChecked(inDialog(kidsSel)) };

    let url = videoLink(OL.$(SEL.dialog) || document);

    OL.report('filling', OL.t('Next…'));
    for (let i = 0; i < 5 && !(visRadio(visibility) && OL.visible(visRadio(visibility))); i++) {
      const next = inDialog(SEL.next);
      if (next && !OL.isDisabled(next)) OL.click(next);
      await OL.sleep(1500);
    }
    const radio = await OL.waitFor(() => {
      const r = visRadio(visibility);
      return r && OL.visible(r) ? r : null;
    }, { timeout: 15000, what: OL.t('the visibility options') });
    OL.click(radio);
    await OL.sleep(400);
    url ||= videoLink(OL.$(SEL.dialog) || document);

    let closedAt = 0;
    await OL.finish({
      waitingMessage: OL.t('Waiting for {platform} to finish uploading…', { platform: 'YouTube' }),
      readyTimeout: 20 * 60_000, // no movement in the progress line for 20 min
      readyWhat: OL.t('the video upload to finish'),
      progressText: () => (progressLabel() ? `YouTube：${progressLabel()}` : ''),
      ready: () => {
        const done = inDialog(SEL.done);
        return done && !OL.isDisabled(done) && !isUploading();
      },
      verify: () => {
        const problems = [];
        const titleBox = inDialog(SEL.title);
        const kidsRadio = inDialog(kidsSel);
        if (!(titleBox ? OL.hasText(titleBox, title) : details.title)) problems.push(OL.t('The title doesn’t match the draft'));
        if (!(kidsRadio ? isChecked(kidsRadio) : details.kids)) problems.push(OL.t('{label} isn’t selected', { label: kidsLabel }));
        if (!isChecked(visRadio(visibility))) problems.push(OL.t('Visibility isn’t selected'));
        return problems;
      },
      sendButton: () => inDialog(SEL.done),
      successTimeout: 5 * 60_000,
      success: () => {
        const pub = OL.$$(SEL.published).find(OL.visible);
        if (pub) return { url: videoLink(pub) || url, message: OL.t('Posted') };
        // "Checks are still running" → only confirm it if we pressed Publish ourselves.
        const pre = OL.$$(SEL.prechecks).find(OL.visible);
        if (pre && job.autoSend) {
          const go = OL.$('#publish-button, #primary-action-button', pre) || OL.findClickable(['Publish', 'Publish anyway', '发布', '仍然发布', '發布'], pre);
          if (go) OL.click(go);
          return null;
        }
        const dlg = OL.$(SEL.dialog);
        const open = dlg && OL.visible(OL.$('tp-yt-paper-dialog', dlg) || dlg);
        if (open) {
          closedAt = 0;
          return null;
        }
        closedAt ||= Date.now();
        if (Date.now() - closedAt < 4000) return null;
        return { ok: false, url, message: OL.t('The upload dialog closed without a published notice. It may have been saved as a draft.') };
      },
    });
  });
})();
