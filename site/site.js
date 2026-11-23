// Store link: set once the extension is live on the Chrome Web Store.
const STORE_URL = '';

// ── Get button: the store once it's live; on phones, send the page to a computer. ──
const mobile = navigator.userAgentData ? navigator.userAgentData.mobile : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
for (const a of document.querySelectorAll('.get')) {
  if (STORE_URL) {
    a.href = STORE_URL;
    a.textContent = a.dataset.storeLabel;
  }
  if (mobile && a.dataset.sendLabel) {
    a.textContent = a.dataset.sendLabel;
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = location.origin + location.pathname;
      try {
        if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
        await navigator.clipboard.writeText(url);
        a.textContent = a.dataset.copiedLabel;
      } catch { /* dismissed */ }
    });
  }
}

// ── Language menu ──
const menu = document.querySelector('details.lang');
if (menu) {
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
}

// ── The run: one publish across ten tabs, every 14 seconds. ──
const run = document.getElementById('run');
if (run) {
  const L = JSON.parse(document.getElementById('run-i18n').textContent);
  const P = [...document.querySelectorAll('.plats li')].map((li) => {
    const svg = li.querySelector('svg');
    return {
      id: li.dataset.id,
      domain: li.dataset.domain,
      auto: li.dataset.auto === '1',
      dur: Number(li.dataset.dur),
      wide: li.classList.contains('wide'),
      name: svg.getAttribute('aria-label'),
      icon: `<svg class="ic" viewBox="${svg.getAttribute('viewBox')}" aria-hidden="true">${svg.innerHTML}</svg>`,
    };
  });
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ring = (size, r, dash) => `<svg class="ring" viewBox="0 0 ${size} ${size}" aria-hidden="true">${dash ? `<circle class="dash" cx="${size / 2}" cy="${size / 2}" r="${r}"/>` : ''}<circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" pathLength="100"/></svg>`;

  run.innerHTML = `
<div class="chrome"><span class="dots"><i></i><i></i><i></i></span><span class="tabs">${P.map((p) => `<span class="tab q${p.wide ? ' wide' : ''}">${ring(22, 9)}${p.icon}</span>`).join('')}<span class="plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span></span></div>
<div class="bar"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><svg class="fwd" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg><span class="omni"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span class="url"></span></span><span class="ext"><img src="/assets/logo.svg" alt=""></span><span class="avatar"></span></div>
<div class="body">
  <div class="page"><div class="card">
    <div class="who"><span class="av"></span><span class="lines"><i style="width:110px"></i><i style="width:64px;height:7px;background:#efeee9"></i></span></div>
    <div class="text"><i></i><i style="width:90%"></i><i style="width:56%"></i></div>
    <div class="media"><i style="background:#fbb040"></i><i style="background:#ef197c"></i><i style="background:#a2d159"></i></div>
    <div class="prog"><i></i></div>
    <div class="foot"><i style="width:64px;background:#efeee9"></i><span class="post"></span></div>
  </div></div>
  <div class="side">
    <div class="ph"><img src="/assets/logo.svg" alt=""><b>Oloop</b><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></div>
    <div class="pt"><b>${esc(L.title)}</b><span class="count"></span></div>
    <ol class="rows">${P.map((p) => `<li class="row q${p.wide ? ' wide' : ''}"><span class="rg">${ring(30, 13.5, true)}<span class="disc">${p.icon}</span><span class="badge"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></span><span class="txt"><b>${esc(p.name)}</b><span class="st"></span></span><span class="act"><span class="go">${esc(L.go)}</span><span class="open">${esc(L.open)}<svg viewBox="0 0 24 24"><path d="M8 16L16 8M9 8h7v7"/></svg></span><span class="arrow"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></span></li>`).join('')}</ol>
  </div>
</div>`;

  const tabs = [...run.querySelectorAll('.tab')];
  const rows = [...run.querySelectorAll('.row')];
  const url = run.querySelector('.url');
  const count = run.querySelector('.count');
  const av = run.querySelector('.av');
  const bar = run.querySelector('.prog i');
  const post = run.querySelector('.post');
  const CYCLE = 140; // ticks of 100 ms
  const CLS = { queued: 'q', opening: 'w', uploading: 'w', filling: 'w', sending: 'w', ready: 'r', done: 'd' };

  const state = (p, i, t) => {
    const s0 = 0.4 + i * 0.35;
    if (t < s0) return { st: 'queued', prog: 0, at: -1 };
    let u = t - s0;
    if (u < 0.6) return { st: 'opening', prog: 0.05, at: s0 };
    u -= 0.6;
    if (u < p.dur) return { st: 'uploading', prog: Math.max(0.05, u / p.dur), pct: Math.floor((u / p.dur) * 100), at: s0 + 0.6 };
    u -= p.dur;
    if (u < 0.8) return { st: 'filling', prog: 1, at: s0 + 0.6 + p.dur };
    u -= 0.8;
    if (p.auto && u < 0.5) return { st: 'sending', prog: 1, at: s0 + 1.4 + p.dur };
    return { st: p.auto ? 'done' : 'ready', prog: 1, at: s0 + 1.4 + p.dur + (p.auto ? 0.5 : 0) };
  };

  let active = -1;
  const render = (k) => {
    const t = k / 10;
    const S = P.map((p, i) => state(p, i, t));
    let a = 0;
    let best = -1;
    S.forEach((s, i) => { if ((s.st === 'opening' || s.st === 'filling') && s.at > best) { best = s.at; a = i; } });
    if (best < 0) S.forEach((s, i) => { if (s.at > best) { best = s.at; a = i; } });
    let posted = 0;
    S.forEach((s, i) => {
      if (s.st === 'done') posted += 1;
      const cls = CLS[s.st];
      const off = String(100 * (1 - s.prog));
      const row = rows[i];
      const tab = tabs[i];
      for (const el of [row, tab]) {
        if (!el.classList.contains(cls)) { el.classList.remove('q', 'w', 'r', 'd'); el.classList.add(cls); }
        el.querySelector('.arc').style.strokeDashoffset = off;
      }
      const text = s.st === 'uploading' ? L.uploading.replace('{pct}', s.pct) : s.st === 'done' ? L.posted : L[s.st];
      const st = row.querySelector('.st');
      if (st.textContent !== text) st.textContent = text;
    });
    if (a !== active) {
      if (active >= 0) tabs[active].classList.remove('on');
      tabs[a].classList.add('on');
      url.textContent = P[a].domain;
      av.className = `av${P[a].wide ? ' wide' : ''}`;
      av.innerHTML = P[a].icon;
      active = a;
    }
    const s = S[a];
    bar.style.width = `${s.st === 'queued' ? 0 : s.st === 'opening' || s.st === 'uploading' ? Math.round(s.prog * 100) : 100}%`;
    post.className = `post${s.st === 'done' ? ' d' : s.st === 'ready' ? ' r' : ''}`;
    count.textContent = `${posted}/${P.length}`;
  };

  // Size: the whole window beside the headline, the side panel alone on a phone.
  const stage = run.parentElement;
  const narrow = matchMedia('(max-width: 699px)');
  const fit = () => {
    run.classList.toggle('panel', narrow.matches);
    run.style.zoom = String(Math.min(1, stage.clientWidth / (narrow.matches ? 350 : 760)));
  };
  new ResizeObserver(fit).observe(stage);
  narrow.addEventListener('change', fit);
  fit();

  let k = 0;
  let timer = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  render(still ? 120 : 0);
  if (!still) {
    const play = (on) => {
      clearInterval(timer);
      if (on) timer = setInterval(() => { k = (k + 1) % CYCLE; render(k); }, 100);
    };
    let seen = true;
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; play(seen && !document.hidden); }).observe(run);
    document.addEventListener('visibilitychange', () => play(seen && !document.hidden));
  }
}
