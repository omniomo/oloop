// note (note.com) adapter. BETA: not yet checked against the live site.
// Flow: title → body → 見出し画像 (the cover, or the first image) → stop at
// 「公開に進む」. Publishing on note is two pages (settings, then 投稿する),
// so this one always hands the last step to you.

(() => {
  const OL = globalThis.OL;

  const SEL = {
    title: ['textarea[placeholder*="タイトル"]', 'textarea[placeholder*="itle"]', 'input[placeholder*="タイトル"]'],
    body: ['.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'],
  };
  const L = {
    addImage: ['画像を追加', '見出し画像を追加', '見出し画像を設定', 'Add image', '画像を挿入'],
    upload: ['画像をアップロード', 'アップロード', 'Upload image'],
    save: ['保存', '適用', '完了', '決定', 'OK'],
    publish: ['公開に進む', '投稿する', '公開設定', 'Publish'],
    published: /公開しました|投稿しました|記事を公開|投稿が完了/,
  };

  const titleBox = () => OL.first(SEL.title);
  const publishButton = () => OL.findClickable(L.publish, document, 'button, [role="button"], a');

  async function setHeaderImage(image) {
    const add = OL.findClickable(L.addImage) || OL.byIcon(L.addImage);
    if (!add) return false;
    const before = Date.now();
    OL.click(add);
    // Either a menu (画像をアップロード / Unsplash …) or the picker straight away.
    const item = await OL.tryWaitFor(() => OL.findClickable(L.upload), { timeout: 3000 });
    const input = item
      ? await OL.openFileInput(item, { accept: 'image' })
      : OL.$$('input[type="file"]').find((i) => Number(i.getAttribute('data-oloop-captured') || 0) >= before - 50);
    if (!input) return false;
    const [file] = await OL.loadMedia([image], OL.t('header image'));
    OL.setFiles(input, [file]);
    const save = await OL.tryWaitFor(() => {
      const b = OL.findClickable(L.save, document, 'button');
      return b && !OL.isDisabled(b) ? b : null;
    }, { timeout: 15000 });
    if (save) OL.click(save);
    await OL.sleep(1500);
    return true;
  }

  OL.register('note', async (job) => {
    const { title = '', text = '', cover = null } = job.payload;

    OL.report('filling', OL.t('Waiting for the {platform} editor…', { platform: 'note' }));
    await OL.waitFor(titleBox, { timeout: 40000, what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} title box', { platform: 'note' }), platform: 'note' }) });
    await OL.ensureVisible();
    const t = titleBox();
    if (!(await OL.insertText(t, title))) throw new OL.Error(OL.t('The title didn’t go in'));
    OL.noRetry(); // note auto-saves a draft from here on

    OL.report('filling', OL.t('Filling in the body…'));
    const body = await OL.waitFor(() => OL.$$(SEL.body.join(',')).find((el) => OL.visible(el) && el !== t), {
      timeout: 15000,
      what: OL.t('the {platform} body editor', { platform: 'note' }),
    });
    if (!(await OL.insertText(body, text))) throw new OL.Error(OL.t('The body didn’t go in ({platform}’s editor may have changed)', { platform: 'note' }));

    if (cover) {
      OL.report('filling', OL.t('Setting the header image…'));
      if (!(await setHeaderImage(cover))) OL.note(OL.t('The header image wasn’t set. Add it on the page.'));
    }

    await OL.finish({
      waitingMessage: OL.t('Checking…'),
      readyTimeout: 60000,
      readyWhat: OL.t('the {button} button', { button: '公開に進む' }),
      readyMessage: OL.t('Ready. Press {button}, then {button2}.', { button: '公開に進む', button2: '投稿する' }),
      ready: () => publishButton(),
      verify: () => [],
      sendButton: publishButton,
      success: () => (L.published.test(OL.textOutsideEditors(document.body)) ? { message: OL.t('Posted'), url: /\/n\/n/.test(location.href) ? location.href : undefined } : null),
    });
  });
})();
