// Runs before first paint so the panel opens in the right theme without a flash.
// chrome.storage is async, so the choice is mirrored into localStorage.
try {
  document.documentElement.dataset.theme = localStorage.getItem('oloop-theme') === 'dark' ? 'dark' : 'light';
} catch {}
