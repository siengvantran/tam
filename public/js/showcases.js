// The Sunday Showcases call-out form: sent as a "Play at TAM" enquiry.

import { $, api, formMessage } from './lib.js';
import { signal } from './track.js';

const f = $('#sc-form');
if (f) {
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    if (!v.circuit) return formMessage(f, 'Tell us which open night you’ve played or are coming to.');
    const message = [
      'Sunday Showcase: register of interest',
      v.act && `Act: ${v.act}`, v.style && `Plays: ${v.style}`, v.links && `Links: ${v.links}`,
      `Open night: ${v.circuit}`, v.message && `\n${v.message}`,
    ].filter(Boolean).join('\n');
    try {
      await api('/api/enquiries', { method: 'POST', body: { kind: 'perform', name: v.name, email: v.email, company: v.act, message, pathway: 'showcase' } });
      f.reset();
      formMessage(f, 'Thanks! We’ve got it. Come and say hello at an open night: the hosts recommend acts for the showcases.', true);
    } catch (err) { formMessage(f, err.message); }
  });
}

// This week's showcase: tap a present under the tree to unwrap it.
const unwrap = (g) => { if (!g.classList.contains('open') && g.dataset.signal) signal(g.dataset.signal, 'unwrap'); g.classList.add('open'); g.querySelector('.sc-wrap').setAttribute('aria-expanded', 'true'); };
document.querySelectorAll('.sc-g').forEach((g) => g.querySelector('.sc-wrap').addEventListener('click', () => unwrap(g)));
const all = document.getElementById('sc-unwrap-all');
if (all) all.addEventListener('click', () => document.querySelectorAll('.sc-g:not(.open)').forEach((g, i) => setTimeout(() => unwrap(g), i * 260)));
// an unwrapped act's full story appears under the tree
document.querySelectorAll('.sc-g').forEach((g) => g.querySelector('.sc-wrap').addEventListener('click', () => {
  const id = g.querySelector('.sc-card').id.replace('sc-act-', 'sc-p-');
  const p = document.getElementById(id); if (p) p.hidden = false;
}));
if (all) all.addEventListener('click', () => document.querySelectorAll('.sc-prof').forEach((p) => { p.hidden = false; }));

// tapping an act in the line-up carousel opens its present and its story
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-unwrap]');
  if (!a || !a.dataset.unwrap || !a.closest('.fx-slide.on')) return;
  const card = document.getElementById(`sc-act-${a.dataset.unwrap}`);
  if (card) unwrap(card.closest('.sc-g'));
  const p = document.getElementById(`sc-p-${a.dataset.unwrap}`);
  if (p) p.hidden = false;
});

// on the night: a message for the big screen, from the line-up page
const live = document.querySelector('[data-live-note]');
if (live) live.addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = live.querySelector('.err');
  try {
    const r = await fetch(live.dataset.liveNote, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: live.name.value, message: live.message.value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'That didn’t work. Try again.');
    live.reset(); out.classList.add('ok');
    out.textContent = j.screen === 'shown' ? 'Sent! Look up: it’s on its way to the big screen.' : 'Sent! It goes up on the screen once TAM has had a quick look.';
  } catch (err) { out.classList.remove('ok'); out.textContent = err.message; }
});
