// On every page: menu, the living background, countdowns, copy buttons, follow forms,
// "Bring them back" / "I was there", inline YouTube.

import { $, $$, api, copyText, formMessage } from './lib.js';

// ----- menu -----
const menu = $('.menu-btn'), nav = $('#nav');
if (menu) menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });

// ----- the living background: generative neon ribbons, ripples of light from every note -----
import './visuals.js';

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
