// Naver Blog adapter (SmartEditor ONE). BETA: not yet checked against the live site.
// The editor usually lives in the same-origin iframe #mainFrame, so every
// lookup goes through editorDoc(). Flow: dismiss popups → title → body →
// photos via the toolbar → stop at 발행 (Naver asks for settings in a second step).

(() => {
  const OL = globalThis.OL;

  const SEL = {
    editor: '.se-wrap, .se-content, .se-documentTitle',
    title: ['.se-documentTitle .se-text-paragraph', '.se-documentTitle [contenteditable="true"]', '.se-title-text'],
    body: ['.se-component.se-text .se-text-paragraph', '.se-section-text .se-text-paragraph', '.se-component-content .se-text-paragraph'],
    photo: ['button.se-image-toolbar-button', 'button[data-name="image"]', 'button[data-log="dot.img"]'],
    images: '.se-component.se-image',
    popupCancel: '.se-popup-button-cancel, .se-popup-alert-confirm .se-popup-button-cancel',
    helpClose: '.se-help-panel-close-button',
  };
  const L = {
    publish: ['발행', 'Publish'],
    single: ['개별사진', '개별 사진'],
  };

  function editorDoc() {
    const f = document.querySelector('iframe#mainFrame');
    try {
      if (f?.contentDocument?.querySelector(SEL.editor)) return f.contentDocument;
    } catch {}
    return document;
  }

  /** Put text into one SmartEditor paragraph (the editor host spans title and body). */
  async function fillParagraph(p, scope, text) {
    const doc = p.ownerDocument;
    const win = doc.defaultView;
    OL.click(p);
    await OL.sleep(250);
    const select = () => {
      const r = doc.createRange();
      r.selectNodeContents(p);
      const sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    };
    select();
    const dt = new win.DataTransfer();
    dt.setData('text/plain', text);
    p.dispatchEvent(new win.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await OL.sleep(600);
    if (OL.hasText(scope, text)) return true;
    select();
    doc.execCommand('insertText', false, text);
    await OL.sleep(600);
    return OL.hasText(scope, text);
  }

  const publishButton = () => OL.findClickable(L.publish, editorDoc(), 'button') || OL.findClickable(L.publish, document, 'button');

  OL.register(
    'naver',
    async (job) => {
      const { title = '', text = '', media = [] } = job.payload;

      OL.report('filling', OL.t('Waiting for the {platform} editor…', { platform: 'Naver' }));
      await OL.waitFor(() => editorDoc().querySelector(SEL.title.join(',')), {
        timeout: 40000,
        what: OL.t('{what} (make sure this browser is signed in to {platform})', { what: OL.t('the {platform} editor', { platform: 'Naver' }), platform: 'Naver' }),
      });
      await OL.ensureVisible();
      await OL.sleep(1500);
      let doc = editorDoc();
      for (const sel of [SEL.popupCancel, SEL.helpClose]) {
        const b = OL.$$(sel, doc).find(OL.visible);
        if (b) {
          OL.click(b); // "继续写上次的草稿？" → 取消；help panel → close
          await OL.sleep(500);
        }
      }

      OL.report('filling', OL.t('Filling in the title…'));
      const titleP = OL.first(SEL.title, doc);
      const titleScope = titleP.closest('.se-documentTitle') || titleP;
      if (!(await fillParagraph(titleP, titleScope, title))) throw new OL.Error(OL.t('The title didn’t go in ({platform}’s editor may have changed)', { platform: 'Naver' }));
      OL.noRetry(); // Naver auto-saves drafts

      OL.report('filling', OL.t('Filling in the body…'));
      const bodyP = OL.$$(SEL.body.join(','), doc).find((p) => OL.visible(p) && !p.closest('.se-documentTitle'));
      if (!bodyP) throw new OL.Error(OL.t('Couldn’t find the {platform} body area', { platform: 'Naver' }));
      const bodyScope = bodyP.closest('.se-component') || bodyP;
      if (!(await fillParagraph(bodyP, bodyScope, text))) throw new OL.Error(OL.t('The body didn’t go in ({platform}’s editor may have changed)', { platform: 'Naver' }));

      if (media.length) {
        OL.report('filling', OL.t('Adding images…'));
        doc = editorDoc();
        const before = OL.$$(SEL.images, doc).length;
        const btn = OL.first(SEL.photo, doc);
        const input = btn && (await OL.openFileInput(btn, { doc, accept: 'image' }));
        if (!input) {
          OL.note(OL.t('The images weren’t added (no {button} button found). Add them on the page.', { button: '사진' }));
        } else {
          OL.setFiles(input, await OL.loadMedia(media, OL.t('images')));
          await OL.sleep(1500);
          const single = OL.findClickable(L.single, doc, 'button, [role="button"], label');
          if (single) OL.click(single);
          const ok = await OL.tryWaitFor(() => OL.$$(SEL.images, editorDoc()).length >= before + media.length, { timeout: 60000 });
          if (!ok) OL.note(OL.t('Some images may be missing (expected {n})', { n: media.length }));
        }
      }

      await OL.finish({
        doc: editorDoc(),
        waitingMessage: OL.t('Checking…'),
        readyTimeout: 60000,
        readyWhat: OL.t('the {button} button', { button: '발행' }),
        readyMessage: OL.t('Ready. Press {button}, then {button2}.', { button: '발행', button2: '발행' }),
        ready: () => publishButton(),
        verify: () => [],
        sendButton: publishButton,
        success: () => {
          let href = '';
          try {
            href = document.querySelector('iframe#mainFrame')?.contentWindow.location.href || '';
          } catch {}
          if (/PostView|logNo=/.test(href) || /blog\.naver\.com\/[^/?#]+\/\d{6,}/.test(location.href)) {
            return { message: OL.t('Posted'), url: /\/\d{6,}/.test(location.href) ? location.href : undefined };
          }
          return null;
        },
      });
    },
    { doc: editorDoc },
  );
})();
