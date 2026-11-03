// Staff sign-in shared by /admin, /door and /raffle-desk.

import { $, api, formMessage } from './lib.js';

// Calls `ready` once signed in (the cookie is checked by calling `probe`).
export async function signedIn(probe, ready) {
  const form = $('#staff-login');
  try { const r = await probe(); return ready(r); } catch (e) { if (!/401|code|token|Set /i.test(e.message)) { /* other errors still need sign-in */ } }
  form.hidden = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/staff/login', { method: 'POST', body: { token: form.token.value } });
      const r = await probe();
      form.hidden = true;
      ready(r);
    } catch (err) { formMessage(form, err.message); }
  });
}
