// showcase.tam.tv: join the Showcase Crew (name, email, fan or musician, consent).

import { api } from './lib.js';

const f = document.getElementById('crew');
if (f) f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = f.querySelector('[data-crew-msg]');
  try {
    await api('/api/showcases/crew', { method: 'POST', body: { name: f.name.value, email: f.email.value, role: (f.querySelector('[name=role]:checked') || {}).value, consent: f.consent.checked } });
    f.reset();
    msg.textContent = 'You’re in the crew! We’ll email you about the next showcase.';
    if (window.tamTrack) window.tamTrack('showcase_crew_join', {});
  } catch (err) { msg.textContent = err.message; }
});
