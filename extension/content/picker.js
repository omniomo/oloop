// Runs in the page's own JS world (MAIN), before the page's scripts.
//
// Many "Upload" buttons don't keep an <input type="file"> in the DOM: they
// create one on the fly and call input.click() to open the OS file picker.
// Without a real user click Chrome won't open that picker anyway, so when that
// happens we keep the input instead: attach it to the DOM and mark it, so the
// adapter (in the isolated world) can find it and put our files into it.
// Real user clicks carry user activation and are left completely alone.

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
