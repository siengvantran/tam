// On every page: menu, the night sky, countdowns, copy buttons, follow forms,
// "Bring them back" / "I was there", inline YouTube.

import { $, $$, api, still, copyText, formMessage } from './lib.js';

// ----- menu -----
const menu = $('.menu-btn'), nav = $('#nav');
if (menu) menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });

// ----- the night sky: stars or snow, swelling and taking colour from the music -----
const sky = $('#ambient');
if (sky) {
  const x = sky.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const snow = sky.dataset.kind === 'snow';
  let dots = [], running = true;
  const size = () => {
    sky.width = innerWidth * dpr; sky.height = innerHeight * dpr;
    const n = Math.round((innerWidth * innerHeight) / (snow ? 9000 : 6000));
    dots = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * sky.width, y: Math.random() * sky.height, r: (Math.random() * (snow ? 2.2 : 1.3) + 0.4) * dpr,
      p: Math.random() * 6.28, f: Math.random() * 2 + 0.6, v: (Math.random() * 0.6 + 0.3) * dpr, w: Math.random() * 0.8 + 0.2,
      h: ['#ffffff', '#ffe2b0', '#ffd0ef', '#c8f4ff'][i % 4],
    }));
  };
  const draw = (t) => {
    const S = window.SYN, on = S && S.on;
    x.clearRect(0, 0, sky.width, sky.height);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      let a = still ? 0.7 : 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t / 1000 * d.f + d.p), 3), r = d.r;
      if (snow) {
        a = 0.55 + 0.4 * d.w;
        if (!still) {
          d.y += d.v * (1 + (on ? S.bass * 2 : 0)); d.x += Math.sin(t / 1400 + d.p) * 0.35 * dpr;
          if (d.y > sky.height + 4) { d.y = -4; d.x = Math.random() * sky.width; }
        }
      }
      if (on) { a = Math.min(1, a * (0.5 + S.treb * 1.8) + S.beat * 0.5); if (!still) r = d.r * (1 + S.bass * (i % 2 ? 2.2 : 1.1)); }
      x.globalAlpha = a; x.fillStyle = on && i % 3 === 0 ? S.color : snow ? '#ffffff' : d.h;
      x.beginPath(); x.arc(d.x, d.y, r, 0, 6.283); x.fill();
    }
    if (!still || (window.SYN && window.SYN.on)) requestAnimationFrame(draw); else running = false;
  };
  addEventListener('syn:start', () => { if (!running) { running = true; requestAnimationFrame(draw); } });
  size(); addEventListener('resize', size); requestAnimationFrame(draw);
}

// ----- countdowns: to doors, "on now" during the night, a message after -----
for (const el of $$('[data-countdown]')) {
  const start = Date.parse(el.dataset.start), end = Date.parse(el.dataset.end);
  const tick = () => {
    const now = Date.now();
    if (now >= end) { el.innerHTML = '<span class="label">That’s a wrap. Thank you for coming.</span>'; return; }
    if (now >= start) { el.innerHTML = `<span class="label">On now</span>${el.dataset.href ? ` <a class="btn hot small" href="${el.dataset.href}">${el.dataset.link || 'See the night'}</a>` : ''}`; return setTimeout(tick, 30000); }
    let s = Math.floor((start - now) / 1000);
    const parts = [['days', Math.floor(s / 86400)], ['hours', Math.floor((s %= 86400) / 3600)], ['mins', Math.floor((s %= 3600) / 60)], ['secs', s % 60]];
    el.innerHTML = parts.map(([k, v]) => `<div class="cd-unit"><b>${String(v).padStart(2, '0')}</b><small>${k.toUpperCase()}</small></div>`).join('')
      + (el.dataset.link ? `<a href="${el.dataset.href}">${el.dataset.link.replace(/[<>&]/g, '')}</a>` : '');
    setTimeout(tick, 1000);
  };
  tick();
}

// ----- copy buttons -----
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy], [data-copy-text]');
  if (!b) return;
  const text = b.dataset.copyText || ($(b.dataset.copy) || {}).value || '';
  const label = b.textContent;
  b.textContent = (await copyText(text)) ? 'Copied' : 'Select and copy';
  setTimeout(() => { b.textContent = label; }, 1600);
});

// ----- inline YouTube: thumbnails become players on tap -----
document.addEventListener('click', (e) => {
  const a = e.target.closest('a.yt[data-yt]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(a.dataset.yt)}?autoplay=1&rel=0`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.title = a.textContent.trim() || 'TAM TV';
  a.replaceWith(f);
});

// ----- "Bring them back" / "I was there" -----
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-demand]');
  if (!b || b.disabled) return;
  b.disabled = true;
  try {
    const { count } = await api('/api/demand', { method: 'POST', body: { kind: b.dataset.demand, target: b.dataset.target } });
    b.textContent = b.dataset.demand === 'was-there' ? `You were there ✦ ${count} so far` : `Asked ✦ ${count} want them back`;
  } catch (err) { b.textContent = err.message; b.disabled = false; }
});

// ----- follow an artist -----
const follow = $('#follow-form');
if (follow) {
  follow.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(follow);
    try {
      const r = await api('/api/follow', { method: 'POST', body: { artist: follow.dataset.artist, name: f.get('name'), email: f.get('email'), consent: f.get('consent') === 'on' } });
      formMessage(follow, r.already ? 'You’re already following. Thanks!' : 'You’re following. Check your inbox.', true);
    } catch (err) { formMessage(follow, err.message); }
  });
}
