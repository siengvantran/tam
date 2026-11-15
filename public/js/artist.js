// A Sunday Showcase artist's own page (/sunday-showcases/artist): sign in with
// the email TAM has for them (a one-time link by email), then for each act they
// play: add an Instagram, TikTok, Facebook or YouTube post, or upload their own
// photos and videos, and show, hide or remove posts, including fans' notes.

import { $, api, shrinkImage } from './lib.js';

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
const NAMES = { youtube: 'YouTube video', instagram: 'Instagram post', tiktok: 'TikTok', facebook: 'Facebook post', image: 'Photo', video: 'Video' };
const what = (w) => (w.kind === 'note' ? `<b>${esc(w.name)}</b>: ${esc(w.message)}`
  : w.kind === 'image' ? `<img src="${esc(w.src)}" alt="" width="64" height="64" class="ar-thumb"> Photo${w.caption ? `: ${esc(w.caption)}` : ''}`
  : w.kind === 'video' ? `<video src="${esc(w.src)}" muted playsinline preload="metadata" width="96" class="ar-thumb"></video> Video${w.caption ? `: ${esc(w.caption)}` : ''}`
  : `${NAMES[w.kind] || 'Post'}${w.caption ? `: ${esc(w.caption)}` : ''}`);
async function render(acts) {
  if (!acts.length) { home.innerHTML = '<p>You’re signed in, but there’s no coming Sunday Showcase with your email. Ask Vivian at TAM.</p>'; return; }
  home.innerHTML = `${acts.map((a) => `<section class="sh-card ar-act" data-date="${esc(a.date)}" data-slug="${esc(a.slug)}">
    <h2>${esc(a.name)}</h2><p class="muted">${esc(a.when)} · <a href="${esc(a.href)}#wall" target="_blank" rel="noopener">See your page ↗</a></p>
    <form class="ar-add" novalidate><label class="field"><span>Add a post: Instagram, TikTok, Facebook or YouTube</span><input name="url" placeholder="Paste the link: instagram.com/p/…, tiktok.com/@you/video/…, facebook.com/…, youtu.be/…"></label>
      <label class="field"><span>A line about it (optional)</span><input name="caption" maxlength="200"></label>
      <div class="ar-row"><button class="btn hot" type="submit">Add the link</button>
        <label class="btn ghost">Upload a photo<input type="file" accept="image/*" data-up="photo" class="sr"></label>
        <label class="btn ghost">Upload a video<input type="file" accept="video/mp4,video/webm,video/quicktime" data-up="video" class="sr"></label></div>
      <progress max="100" value="0" hidden></progress><span class="small muted" role="status" aria-live="polite" data-add-msg></span>
      <p class="small muted">Videos up to 60 MB (MP4 plays everywhere). Longer? Post it on Instagram, TikTok or YouTube and paste the link.</p></form>
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
// their own photos and videos
home && home.addEventListener('change', async (e) => {
  const input = e.target.closest('[data-up]'); if (!input || !input.files[0]) return;
  const f = input.closest('.ar-add'), box = f.closest('.ar-act'), msg = $('[data-add-msg]', f), file = input.files[0];
  try {
    if (input.dataset.up === 'photo') {
      msg.textContent = 'Uploading your photo…';
      await api(`${base(box)}/photo`, { method: 'POST', body: { image: await shrinkImage(file, 1600, 0.85), caption: f.caption.value } });
    } else {
      if (file.size > 60 * 1024 * 1024) throw new Error('Videos can be up to 60 MB. Trim it, or post it on Instagram, TikTok or YouTube and paste the link.');
      const bar = f.querySelector('progress'); bar.hidden = false;
      msg.textContent = 'Uploading your video…';
      await new Promise((ok, no) => {
        const x = new XMLHttpRequest();
        x.open('POST', `${base(box)}/video?caption=${encodeURIComponent(f.caption.value)}`);
        x.setRequestHeader('Content-Type', file.type || 'video/mp4');
        x.upload.onprogress = (p) => { if (p.lengthComputable) bar.value = Math.round((p.loaded / p.total) * 100); };
        x.onload = () => { bar.hidden = true; if (x.status < 300) ok(); else { try { no(new Error(JSON.parse(x.responseText).error)); } catch { no(new Error(`Upload failed (${x.status}).`)); } } };
        x.onerror = () => { bar.hidden = true; no(new Error('Upload failed. Check your connection and try again.')); };
        x.send(file);
      });
    }
    f.reset(); msg.textContent = 'Added. It’s on your wall now.'; loadWall(box);
  } catch (err) { msg.textContent = err.message; }
  input.value = '';
});
home && home.addEventListener('click', async (e) => {
  if (e.target.closest('[data-signout]')) { await api('/api/showcases/artist/signout', { method: 'POST', body: {} }); location.reload(); return; }
  const b = e.target.closest('[data-st]'); if (!b) return;
  const box = b.closest('.ar-act'), id = b.closest('.ar-w').dataset.id;
  if (b.dataset.st === 'removed' && !confirm('Remove this from your wall?')) return;
  await api(`${base(box)}/${id}`, { method: 'POST', body: { status: b.dataset.st } }); loadWall(box);
});
