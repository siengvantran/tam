// A Sunday Showcase artist's own page (/sunday-showcases/artist): sign in with
// the email TAM has for them (a one-time link by email), then for each act they
// play: add a YouTube video or an Instagram post to their wall, and show, hide
// or remove posts, including fans' notes waiting to be checked.

import { $, api } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const login = $('#ar-login'), home = $('#ar-home');

// ----- signing in -----
if (login) {
  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-ar-msg]', login);
    try {
      await api('/api/showcases/artist/link', { method: 'POST', body: { email: login.email.value } });
      msg.textContent = 'If that email is on a Sunday Showcase line-up, a sign-in link is on its way. Check your inbox (and spam).';
    } catch (err) { msg.textContent = err.message; }
  });
}
const t = new URLSearchParams(location.search).get('t');
if (t) {
  api('/api/showcases/artist/link/use', { method: 'POST', body: { t } })
    .then(() => { location.replace('/sunday-showcases/artist'); })
    .catch((err) => { $('#ar-signing').textContent = err.message; login.hidden = false; });
} else if (home) {
  api('/api/showcases/artist/me').then(({ acts }) => { login.hidden = true; home.hidden = false; render(acts); }).catch(() => { /* not signed in: the form shows */ });
}

// ----- their acts and walls -----
const what = (w) => (w.kind === 'note' ? `<b>${esc(w.name)}</b>: ${esc(w.message)}` : w.kind === 'youtube' ? `YouTube video ${esc(w.videoId)}` : `Instagram post ${esc(w.postId)}`);
async function render(acts) {
  if (!acts.length) { home.innerHTML = '<p>You’re signed in, but there’s no coming Sunday Showcase with your email. Ask Vivian at TAM.</p>'; return; }
  home.innerHTML = `${acts.map((a) => `<section class="sh-card ar-act" data-date="${esc(a.date)}" data-slug="${esc(a.slug)}">
    <h2>${esc(a.name)}</h2><p class="muted">${esc(a.when)} · <a href="${esc(a.href)}#wall" target="_blank" rel="noopener">See your page ↗</a></p>
    <form class="ar-add" novalidate><label class="field"><span>Add a YouTube video or an Instagram post</span><input name="url" placeholder="https://www.instagram.com/p/… or https://youtu.be/…" required></label>
      <label class="field"><span>A line about it (optional)</span><input name="caption" maxlength="200"></label>
      <button class="btn hot" type="submit">Add to my wall</button> <span class="small muted" role="status" aria-live="polite" data-add-msg></span></form>
    <h3>Your wall</h3><ul class="plain ar-wall"><li class="muted">Loading…</li></ul></section>`).join('')}
  <p><button class="btn ghost small" type="button" data-signout>Sign out</button></p>`;
  for (const box of home.querySelectorAll('.ar-act')) loadWall(box);
}
const base = (box) => `/api/showcases/${box.dataset.date}/act/${box.dataset.slug}/wall`;
async function loadWall(box) {
  const { items } = await api(base(box));
  $('.ar-wall', box).innerHTML = items.length ? items.map((w) => `<li class="ar-w st-${w.status}" data-id="${esc(w.id)}"><div>${what(w)} <span class="small muted">${esc(w.status === 'pending' ? 'waiting for you or TAM to check' : w.status)}</span></div>
    <div class="ar-btns">${w.status !== 'shown' ? '<button class="btn hot small" type="button" data-st="shown">Show</button>' : ''}${w.status === 'shown' ? '<button class="btn ghost small" type="button" data-st="hidden">Hide</button>' : ''}<button class="sh-x" type="button" data-st="removed" aria-label="Remove">×</button></div></li>`).join('') : '<li class="muted">Nothing on your wall yet.</li>';
}
home && home.addEventListener('submit', async (e) => {
  const f = e.target.closest('.ar-add'); if (!f) return;
  e.preventDefault();
  const box = f.closest('.ar-act'), msg = $('[data-add-msg]', f);
  try { await api(`${base(box)}/post`, { method: 'POST', body: { url: f.url.value, caption: f.caption.value } }); f.reset(); msg.textContent = 'Added. It’s on your wall now.'; loadWall(box); }
  catch (err) { msg.textContent = err.message; }
});
home && home.addEventListener('click', async (e) => {
  if (e.target.closest('[data-signout]')) { await api('/api/showcases/artist/signout', { method: 'POST', body: {} }); location.reload(); return; }
  const b = e.target.closest('[data-st]'); if (!b) return;
  const box = b.closest('.ar-act'), id = b.closest('.ar-w').dataset.id;
  if (b.dataset.st === 'removed' && !confirm('Remove this from your wall?')) return;
  await api(`${base(box)}/${id}`, { method: 'POST', body: { status: b.dataset.st } }); loadWall(box);
});
