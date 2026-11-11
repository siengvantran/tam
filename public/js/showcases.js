// The Sunday Showcases call-out form: sent as a "Play at TAM" enquiry.

import { $, api, formMessage } from './lib.js';

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
const unwrap = (g) => { g.classList.add('open'); g.querySelector('.sc-wrap').setAttribute('aria-expanded', 'true'); };
document.querySelectorAll('.sc-g').forEach((g) => g.querySelector('.sc-wrap').addEventListener('click', () => unwrap(g)));
const all = document.getElementById('sc-unwrap-all');
if (all) all.addEventListener('click', () => document.querySelectorAll('.sc-g:not(.open)').forEach((g, i) => setTimeout(() => unwrap(g), i * 260)));
// an unwrapped act's full story appears under the tree
document.querySelectorAll('.sc-g').forEach((g) => g.querySelector('.sc-wrap').addEventListener('click', () => {
  const id = g.querySelector('.sc-card').id.replace('sc-act-', 'sc-p-');
  const p = document.getElementById(id); if (p) p.hidden = false;
}));
if (all) all.addEventListener('click', () => document.querySelectorAll('.sc-prof').forEach((p) => { p.hidden = false; }));
