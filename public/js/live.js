// Self check-in on a phone (/checkin): how many, who for; then follow the
// act by email, pledge to see them at Christmas, join the TAM Club.

import { $, api, formMessage, pageData } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const form = $('#lv-checkin');
const acts = (() => { try { return JSON.parse($('#lv-acts').textContent); } catch { return []; } })();
const browser = () => {
  try { let id = localStorage.getItem('tam:browser'); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, ''); localStorage.setItem('tam:browser', id); } return id; }
  catch { return `${Date.now()}-${Math.random()}`.replace(/\W/g, ''); }
};

if (form) {
  const night = form.dataset.night, out = form.querySelector('output');
  let n = 1;
  form.addEventListener('click', (e) => { const s = e.target.closest('[data-step]'); if (!s) return; n = Math.max(1, Math.min(12, n + Number(s.dataset.step))); out.value = n; out.textContent = n; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const act = form.act ? form.act.value : '';
    try {
      const r = await api('/api/live/checkin', { method: 'POST', body: { night, id: browser(), n, act } });
      if (window.tamTrack) window.tamTrack('live_checkin', { night, act, people: n });
      done(r, acts.find((a) => a.slug === act));
    } catch (err) { formMessage(form, err.message); }
  });

  function done(r, a) {
    form.hidden = true;
    const box = $('#lv-done');
    box.hidden = false;
    const here = a ? (r.acts.find((x) => x.slug === a.slug) || {}).here || 0 : 0;
    box.innerHTML = `<div class="formbox lv-yes"><h2>You’re in! 🎉</h2><p>${n === 1 ? 'You’re' : `You’re ${n} of the`} <b>${r.people}</b> people here today.${a ? ` <b>${here}</b> are here for ${esc(a.name)}: watch the big screen!` : ''}</p></div>
      ${a ? `<div class="formbox"><h2>Support ${esc(a.name)}’s journey</h2>
        ${a.jom ? `<p><a class="btn hot lv-wrap" href="${esc(a.href)}">🎄 Pledge for Christmas</a></p><p class="small muted">See ${esc(a.name)} at The Best Christmas Ever: TAM’s programmers see every pledge.</p>` : `<p><a class="btn hot" href="${esc(a.href)}">See ${esc(a.name)}’s page</a></p>`}
        <form id="lv-follow"><p>Get an email when ${esc(a.name)} plays next.</p>
          <label class="field"><span>Your email</span><input name="email" type="email" required autocomplete="email"></label>
          <label class="check"><input type="checkbox" name="consent"> Yes, email me when ${esc(a.name)} plays next. Unsubscribe any time. <a href="/privacy">Privacy</a></label>
          <button class="btn ghost" type="submit">Follow ${esc(a.name)}</button><p class="err" role="status" aria-live="polite"></p></form></div>` : ''}
      <div class="formbox"><h2>Join the TAM Club</h2><p>What’s on, picked for you, and points toward a drink on us. <a class="btn ghost small" href="/club">Join free</a></p></div>`;
    const f = $('#lv-follow');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.consent.checked) return formMessage(f, 'Tick the box to say yes to the email.');
      try { await api('/api/live/follow', { method: 'POST', body: { night, act: a.slug, email: f.email.value, consent: true } }); f.innerHTML = `<p class="ok">You’re following ${esc(a.name)}. 💛</p>`; }
      catch (err) { formMessage(f, err.message); }
    });
  }
}
void pageData;
