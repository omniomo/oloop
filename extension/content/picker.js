// Runs in the page's own JS world (MAIN), before the page's scripts.
//
// Many "Upload" buttons don't keep an <input type="file"> in the DOM: they
// create one on the fly and call input.click() to open the OS file picker.
// Without a real user click Chrome won't open that picker anyway, so when that
// happens we keep the input instead: attach it to the DOM and mark it, so the
// adapter (in the isolated world) can find it and put our files into it.
// Real user clicks carry user activation and are left completely alone.
//
// It also hands files to inputs whose page checks `file instanceof File`
// against the window its scripts run in (视频号's wujie iframe): a File only
// passes if it's made, and first seen, in this world. The adapter marks the
// input and posts the files here.

(() => {
  if (window.__oloopPicker) return;
  window.__oloopPicker = true;

  const proto = HTMLInputElement.prototype;
  const origClick = proto.click;
  const origShowPicker = proto.showPicker;

  function capture(input) {
    if (input.type !== 'file' || navigator.userActivation?.isActive) return false;
    input.setAttribute('data-oloop-captured', String(Date.now()));
    if (!input.isConnected) {
      input.style.display = 'none';
      (document.body || document.documentElement).appendChild(input);
    }
    document.dispatchEvent(new CustomEvent('oloop:filechooser'));
    return true;
  }

  if (window.top === window) {
    const marked = (mark, root = document) => {
      const hit = root.querySelector(`[data-oloop-mark="${CSS.escape(mark)}"]`);
      if (hit) return hit;
      for (const el of root.querySelectorAll('*')) {
        const found = el.shadowRoot && marked(mark, el.shadowRoot);
        if (found) return found;
      }
      return null;
    };
    const appWindow = () => {
      for (const f of document.querySelectorAll('iframe')) {
        try {
          if (f.contentWindow?.__WUJIE) return f.contentWindow;
        } catch {}
      }
      return window;
    };
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window || d?.type !== 'oloop:set-files' || typeof d.mark !== 'string') return;
      const input = marked(d.mark);
      let ok = false;
      if (input && Array.isArray(d.files)) {
        const W = appWindow();
        const dt = new W.DataTransfer();
        for (const f of d.files) dt.items.add(new W.File([f], f.name, { type: f.type, lastModified: f.lastModified }));
        input.files = dt.files;
        input.dispatchEvent(new W.Event('change', { bubbles: true }));
        ok = true;
      }
      window.postMessage({ type: 'oloop:set-files:done', mark: d.mark, ok }, '*');
    });
  }

  proto.click = function (...args) {
    if (capture(this)) return undefined;
    return origClick.apply(this, args);
  };
  if (origShowPicker) {
    proto.showPicker = function (...args) {
      if (capture(this)) return undefined;
      return origShowPicker.apply(this, args);
    };
  }
})();
