// Pinterest adapter (pin-creation-tool). BETA.
// Flow: image/video → wait for Pinterest to process it (the form is disabled
// until then) → title → description → link → cover (video Pins) → board → stop at Publish.
//
// Boards: we only ever click an existing board whose name matches exactly —
// never "Create board". Each time the picker opens we save the list of your
// boards, so the side panel can offer them as a dropdown.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    fileInput: ['#storyboard-upload-input', 'input[type="file"][accept*="image"]', 'input[type="file"]'],
    title: ['#storyboard-selector-title', 'input[placeholder*="title" i]', 'textarea[placeholder*="title" i]', 'input[placeholder*="标题"]', 'input[placeholder*="標題"]'],
    description: [
      '#storyboard-selector-description[contenteditable="true"]',
      '#storyboard-selector-description [contenteditable="true"]',
      'textarea#storyboard-selector-description',
      '[data-test-id*="description"] [contenteditable="true"]',
      'div[contenteditable="true"][role="combobox"]',
      'div[contenteditable="true"][aria-label*="description" i]',
      'textarea[placeholder*="description" i]',
      'div[contenteditable="true"]',
    ],
    link: ['#WebsiteField', 'input[placeholder*="link" i]', 'input[placeholder*="链接"]', 'input[placeholder*="連結"]', 'input[type="url"]'],
    boardButton: ['[data-test-id="board-dropdown-select-button"]', '[data-test-id*="board-dropdown"] [role="button"]', '[data-test-id*="board-dropdown"] button'],
    boardSearch: ['#pickerSearchField', '[role="dialog"] input[placeholder*="Search" i]', 'input[placeholder*="搜索"]', 'input[placeholder*="搜尋"]'],
    boardRows: '[data-test-id^="board-row-"]',
    publish: ['[data-test-id="storyboard-creation-nav-done"] button', '[data-test-id="storyboard-creation-nav-done"] [role="button"]', 'button[data-test-id*="publish"]'],
  };
  const L = {
    publish: ['Publish', '发布', '發佈', '發布'],
    editCover: ['Edit cover', 'Edit cover image', 'Change cover', 'Cover', '编辑封面', '更改封面', '封面', '編輯封面', '變更封面', 'カバーを編集', '커버 편집', 'Editar portada', 'Modifier la couverture', 'Cover bearbeiten', 'Editar capa'],
    upload: ['Upload', 'Upload image', 'Upload cover', '上传', '上传图片', '上傳', '上傳圖片', 'アップロード', '업로드', 'Subir', 'Importer', 'Hochladen', 'Carregar', 'Enviar'],
    coverDone: ['Done', 'Save', 'Apply', '完成', '保存', '儲存', '套用', '完了', '保存する', '완료', '저장', 'Listo', 'Guardar', 'Terminé', 'Enregistrer', 'Fertig', 'Speichern', 'Concluído', 'Salvar'],
    notBoards: /^(create board|create|创建图板|建立圖版|search|搜索|搜尋|all boards|所有图板|top choices|save|保存|board|choose a board|选择图板|選擇圖版)$/i,
    noBoard: /choose a board|选择图板|選擇圖版|选择一个图板/i,
    published: /your pin (has been|was) (published|saved)|pin (has been )?published|已发布|已發佈|发布成功/i,
  };

  const enabled = (el) => !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getAttribute('contenteditable') !== 'false';
  const fileInput = () => {
    for (const s of SEL.fileInput) {
      const i = OL.$(s);
      if (i) return i;
    }
    return null;
  };
  const boardButton = () => OL.first(SEL.boardButton);
  const publishButton = () => OL.first(SEL.publish) || OL.findClickable(L.publish, document, 'button, [role="button"]');

  /** Board names currently shown by the open picker. */
  function boardRows() {
    let rows = OL.$$(SEL.boardRows).filter(OL.visible);
    if (!rows.length) {
      const search = OL.first(SEL.boardSearch);
      const pop = search?.closest('[role="dialog"], [role="listbox"], [data-test-id*="flyout"], [data-test-id*="picker"]');
      rows = pop ? OL.$$('[role="option"], [role="button"]', pop).filter(OL.visible) : [];
    }
    return rows
      .map((el) => ({ el, name: (OL.text(el).split('\n')[0] || el.getAttribute('title') || '').trim() }))
      .filter((r) => r.name && !L.notBoards.test(r.name));
  }

  async function openPicker() {
    const btn = boardButton();
    if (!enabled(btn)) return null;
    OL.click(btn);
    const rows = await OL.tryWaitFor(() => {
      const r = boardRows();
      return r.length ? r : null;
    }, { timeout: 6000 });
    if (rows) {
      const names = [...new Set(rows.map((r) => r.name))];
      chrome.storage.local.set({ pinterestBoards: { names, at: Date.now() } }).catch(() => {});
    }
    return rows;
  }

  function closePicker() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }

  async function pickBoard(name) {
    let rows = await openPicker();
    if (!rows) return false;
    const want = name.trim().toLowerCase();
    let row = rows.find((r) => r.name.toLowerCase() === want);
    if (!row) {
      // Long lists: narrow with the picker's own search box, still exact match only.
      const search = OL.first(SEL.boardSearch);
      if (search) {
        await OL.insertText(search, name);
        await OL.sleep(1200);
        rows = boardRows();
        row = rows.find((r) => r.name.toLowerCase() === want);
      }
    }
    if (!row) {
      closePicker();
      return false;
    }
    OL.click(row.el);
    await OL.sleep(700);
    return !L.noBoard.test(OL.text(boardButton()));
  }

  /** Put a slider at a fraction of its range: <input type=range>, or an ARIA slider by pointer. */
  function setSlider(el, fraction) {
    const f = Math.min(1, Math.max(0, fraction));
    if (el.tagName === 'INPUT') {
      const min = Number(el.min || 0), max = Number(el.max || 100);
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(min + (max - min) * f));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const track = el.closest('[data-test-id*="track" i], [class*="track" i]') || el.parentElement || el;
    const r = track.getBoundingClientRect();
    const x = r.left + r.width * f, y = r.top + r.height / 2;
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 };
    track.dispatchEvent(new PointerEvent('pointerdown', at));
    track.dispatchEvent(new MouseEvent('mousedown', at));
    track.dispatchEvent(new PointerEvent('pointermove', at));
    track.dispatchEvent(new MouseEvent('mousemove', at));
    track.dispatchEvent(new PointerEvent('pointerup', at));
    track.dispatchEvent(new MouseEvent('mouseup', at));
    track.dispatchEvent(new MouseEvent('click', at));
  }

  /** Press the timeline at x: Pinterest moves its frame window there on pointerdown. */
  function pressAt(el, x) {
    const r = el.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    const target = el.ownerDocument.elementFromPoint(x, at.clientY) || el;
    target.dispatchEvent(new PointerEvent('pointerdown', at));
    target.dispatchEvent(new MouseEvent('mousedown', at));
    const up = { ...at, buttons: 0 };
    target.dispatchEvent(new PointerEvent('pointerup', up));
    target.dispatchEvent(new MouseEvent('mouseup', up));
  }

  /**
   * "Pick a cover" (checked Nov 2026): a filmstrip with a frame-sized window over it; the
   * frame under the window becomes the cover. Pressing the strip centres the window on
   * the press, and the window's <video> seeks to that frame, so we press, read where it
   * landed and correct.
   */
  async function pickOnTimeline(dlg, cover) {
    const track = OL.$('[data-test-id*="timeline" i]', dlg);
    if (!track || !(cover.time >= 0)) return false;
    const video = () => OL.$('video', track) || OL.$('video', dlg);
    // Its video tells us where the window landed once it has loaded.
    const loaded = await OL.tryWaitFor(() => {
      const v = video();
      return v && v.readyState >= 1 && v.duration > 0 && Number.isFinite(v.duration) ? v : null;
    }, { timeout: 8000 });
    const duration = loaded?.duration || cover.duration || 0;
    if (!duration) return false;
    const r = track.getBoundingClientRect();
    if (!r.width) return false;
    const win = track.firstElementChild?.getBoundingClientRect().width || 0;
    let x = r.left + (cover.time / duration) * r.width + win / 2;
    for (let i = 0; i < 3; i++) {
      pressAt(track, Math.min(r.right - 1, Math.max(r.left + 1, x)));
      await OL.sleep(350);
      const t = loaded ? video()?.currentTime : undefined;
      if (!(t >= 0) || Math.abs(t - cover.time) < 0.1) break;
      x += ((cover.time - t) / duration) * r.width;
    }
    return true;
  }

  /** Older picker: a range input or ARIA slider. */
  async function pickOnSlider(dlg, cover) {
    const slider = OL.$$('input[type="range"], [role="slider"]', dlg).find(OL.visible);
    const video = OL.$('video', dlg);
    const duration = cover.duration || video?.duration || 0;
    if (!slider || !(cover.time >= 0) || !duration) return false;
    setSlider(slider, cover.time / duration);
    if (video) {
      try { video.currentTime = cover.time; } catch {}
    }
    await OL.sleep(800);
    return true;
  }

  /**
   * Video Pins: "Edit cover" opens a frame picker. Pinterest only takes a frame of the
   * video (no image upload), so a frame cover is matched; an uploaded image can't be.
   * If a future picker offers an upload, the image goes in as is.
   */
  async function setCover(cover) {
    const trigger = await OL.tryWaitFor(
      () =>
        OL.$$('[data-test-id$="edit-cover-button" i], [data-test-id*="cover" i] button, button[aria-label*="cover" i]').find((el) => OL.visible(el) && !OL.isDisabled(el)) ||
        OL.findClickable(L.editCover) ||
        OL.findClickable(L.editCover, document, 'div, span'),
      { timeout: 20000 },
    );
    if (!trigger) return false;
    const before = new Set(OL.$$('[role="dialog"], [aria-modal="true"]').filter(OL.visible));
    OL.click(trigger);
    const dlg = await OL.tryWaitFor(
      () => OL.$$('[role="dialog"], [aria-modal="true"]').find((d) => OL.visible(d) && (!before.has(d) || OL.$('[data-test-id*="timeline" i], input[type="range"], [role="slider"], video', d))),
      { timeout: 8000 },
    );
    if (!dlg) return false;
    await OL.sleep(600);
    const close = () => {
      const cancel = OL.$('[data-test-id*="cancel" i]', dlg);
      if (cancel) OL.click(cancel);
      else closePicker();
    };

    let ok = false;
    let input = OL.$$('input[type="file"]', dlg).find((i) => /image/.test(i.accept || ''));
    if (!input) {
      const up = OL.findClickable(L.upload, dlg);
      if (up) input = await OL.openFileInput(up, { accept: 'image' });
    }
    if (input) {
      const [file] = await OL.loadMedia([cover], OL.t('cover'));
      OL.setFiles(input, [file]);
      await OL.sleep(1500);
      ok = true;
    } else {
      ok = (await pickOnTimeline(dlg, cover)) || (await pickOnSlider(dlg, cover));
    }
    if (!ok) {
      close();
      return false;
    }
    const done = await OL.tryWaitFor(() => {
      const b = OL.$('[data-test-id*="done" i]', dlg) || OL.findClickable(L.coverDone, dlg, 'button, [role="button"]');
      return b && !OL.isDisabled(b) ? b : null;
    }, { timeout: 8000 });
    if (!done) {
      close();
      return false;
    }
    OL.click(done);
    await OL.tryWaitFor(() => !dlg.isConnected || !OL.visible(dlg), { timeout: 4000 });
    return true;
  }

  OL.register('pinterest', async (job) => {
    const { title = '', text = '', media = [], cover = null, options = {} } = job.payload;
    if (!media.length) throw new OL.Error(OL.t('{platform} needs one image or one video', { platform: 'Pinterest' }));

    OL.report('filling', OL.t('Waiting for the {platform} create page…', { platform: 'Pinterest' }));
    if (/\/login/.test(location.pathname)) throw new OL.Error(OL.t('Signed out of {platform}', { platform: 'Pinterest' }));
    await OL.waitFor(fileInput, { timeout: 30000, what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} upload button', { platform: 'Pinterest' }), platform: 'Pinterest' }) });
    const files = await OL.loadMedia(media);
    await OL.ensureVisible();

    // The whole form stays disabled until Pinterest has processed the upload.
    OL.report('filling', OL.t('Waiting for {platform} to process the media…', { platform: 'Pinterest' }));
    const titleBox = await OL.attachFiles({
      files,
      input: fileInput,
      check: () => {
        const t = OL.first(SEL.title);
        return enabled(t) ? t : null;
      },
      started: () => OL.previewCount(document) > 0 || OL.progressHint(),
      timeout: OL.budget(OL.bytesOf(media), 60_000),
      what: OL.t('the Pin form to unlock'),
    });
    OL.noRetry(); // Pinterest keeps a draft from here on

    OL.report('filling', OL.t('Filling in the title and description…'));
    if (title.trim() && !(await OL.insertText(titleBox, title))) throw new OL.Error(OL.t('The title didn’t go in'));
    if (text.trim()) {
      const desc = await OL.tryWaitFor(() => OL.$$(SEL.description.join(',')).find((el) => OL.visible(el) && enabled(el) && el !== titleBox), { timeout: 5000 });
      if (!desc || !(await OL.insertText(desc, text))) OL.note(OL.t('The description didn’t go in. Add it on the page.'));
    }
    if (options.link?.trim()) {
      const link = OL.first(SEL.link);
      if (!enabled(link) || !(await OL.insertText(link, options.link.trim()))) OL.note(OL.t('The link didn’t go in'));
    }

    if (cover && media.some((m) => /^video\//.test(m.type || ''))) {
      OL.report('filling', OL.t('Setting the cover…'));
      if (!(await setCover(cover)))
        OL.note(
          cover.time >= 0
            ? OL.t('The cover wasn’t set, so {platform}’s default was used', { platform: 'Pinterest' })
            : OL.t('{platform} only takes a frame of the video as the cover, so its default was used', { platform: 'Pinterest' }),
        );
    }

    if (options.board) {
      OL.report('filling', OL.t('Choosing the board “{board}”…', { board: options.board }));
      if (!(await pickBoard(options.board))) OL.note(OL.t('Board “{board}” not found. Pick one on the page. oloop never creates boards.', { board: options.board }));
    } else {
      // Just read the list for the side panel's dropdown, keep Pinterest's own choice.
      if (await openPicker()) closePicker();
      await OL.sleep(400);
    }

    await OL.finish({
      waitingMessage: OL.t('Checking…'),
      readyTimeout: 30000,
      readyWhat: OL.t('the {button} button', { button: 'Publish' }),
      ready: () => publishButton(),
      readyMessage: L.noBoard.test(OL.text(boardButton()))
        ? OL.t('Pick a board, then press {button}', { button: 'Publish' })
        : OL.t('Ready. Press {button}.', { button: 'Publish' }),
      verify: () => (title.trim() && !OL.hasText(OL.first(SEL.title), title) ? [OL.t('The title doesn’t match the draft')] : []),
      sendButton: publishButton,
      success: () => {
        const link = OL.$$('a[href*="/pin/"]').find((a) => OL.visible(a) && a.closest('[role="alert"], [data-test-id*="toast"], [role="dialog"]'));
        if (link) return { url: link.href, message: OL.t('Posted') };
        return L.published.test(OL.textOutsideEditors(document.body)) ? { message: OL.t('Posted') } : null;
      },
    });
  });
})();
