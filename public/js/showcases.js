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
