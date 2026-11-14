// The TAM Stage (src/domain/stage.js): ask to play, open your page from the
// emailed link, build and vet your microverse, boost acts, share them.

import { $, $$, api, shrinkImage, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const track = (n, p = {}) => { if (window.tamTrack) window.tamTrack(n, p); };
const STAGES = ['Signal', 'Orbit', 'Open Night', 'Showcase', 'Headline', 'Festival'];

// ---------- ask to play ----------
const apply = $('#st-apply');
if (apply) {
  apply.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(apply);
    if (!f.get('consent')) return formMessage(apply, 'Tick the box so we can email you about playing at TAM.');
    try {
      await api('/api/stage/apply', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), act: f.get('act'), plays: f.get('plays'), links: f.get('links'), circuit: f.get('circuit'), consent: true } });
      apply.innerHTML = `<h2 class="chrome gold">Check your inbox</h2><p>We’ve emailed <b>${esc(f.get('email'))}</b> a link to build your page on the TAM Stage. It works once, for 3 days.</p><p>Your first planet is <b>Signal</b>. Next: <b>Orbit</b>, when your page goes live.</p>`;
      track('stage_apply');
    } catch (err) { formMessage(apply, err.message); }
  });
}

// ---------- the emailed link ----------
const inBox = $('#st-in');
if (inBox) inBox.querySelector('button').addEventListener('click', async () => {
  try { const r = await api('/api/stage/in', { method: 'POST', body: { t: new URLSearchParams(location.search).get('t') || '' } }); location.replace(r.next); }
  catch (err) { inBox.querySelector('.err').textContent = err.message; }
});

// ---------- boost and share on a microverse ----------
const boost = $('[data-boost]');
if (boost) {
  let id = null;
  try { id = localStorage.getItem('tam:browser'); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, ''); localStorage.setItem('tam:browser', id); } } catch { id = `${Date.now()}-${Math.random()}`.replace(/\W/g, ''); }
  const msg = $('[data-boost-msg]');
  const slug = boost.dataset.boost;
  boost.addEventListener('click', async () => {
    boost.disabled = true;
    try {
      const r = await api(`/api/stage/${slug}/boost`, { method: 'POST', body: { id } });
      $('[data-boosts]').textContent = r.boosts;
      msg.textContent = r.already ? 'You’ve boosted them today. Come back tomorrow!' : r.member ? 'Boosted ✦ +1 point on your TAM Club card.' : 'Boosted ✦ Join the TAM Club to earn points for every act you back.';
      if (!r.already) { document.body.classList.add('st-boosted'); setTimeout(() => document.body.classList.remove('st-boosted'), 1600); track('stage_boost', { act: slug }); }
    } catch (err) { msg.textContent = err.message; }
    boost.disabled = false;
  });
  const share = $('[data-share]');
  const shared = () => api(`/api/stage/${slug}/share`, { method: 'POST', body: {} }).catch(() => {});
  const native = share.querySelector('[data-native]');
  if (navigator.share) { native.hidden = false; native.addEventListener('click', async () => { try { await navigator.share({ title: share.dataset.title, text: share.dataset.text, url: share.dataset.url }); shared(); } catch { /* cancelled */ } }); }
  share.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(share.dataset.url); msg.textContent = 'Link copied.'; shared(); } catch { msg.textContent = share.dataset.url; } });
  share.querySelector('a').addEventListener('click', shared);
}

// ---------- /stage: filter by planet ----------
for (const b of $$('[data-st-filter]')) b.addEventListener('click', () => {
  $$('[data-st-filter]').forEach((x) => x.classList.toggle('on', x === b));
  $$('#st-all [data-st]').forEach((x) => { x.hidden = b.dataset.stFilter !== 'all' && x.dataset.st !== b.dataset.stFilter; });
});

// ---------- /stage/me: build and vet your page ----------
const me = $('#st-me');
let A = null;
function draw(a) {
  A = a;
  const status = { draft: 'Building: not public yet', review: 'With TAM for review', live: 'Live on the TAM Stage', paused: 'Paused', declined: 'Not on the path right now' }[a.status];
  const done = a.checks.filter((c) => c.done).length;
  me.innerHTML = `<div class="st-dash">
    <div class="st-dash-top"><div><div class="label">Your microverse · ${esc(status)}</div><h1 class="chrome gold">${esc(a.act)}</h1>
      <p>Planet <b>${a.stage + 1} of 6: ${esc(STAGES[a.stage])}</b> · <b>${a.xp}</b> XP · ✦ ${a.boosts} boosts · ${a.views} views</p>
      <p><a class="btn ghost small" href="/stage/${esc(a.slug)}" target="_blank">${a.status === 'live' ? 'See my page ↗' : 'Preview my page ↗'}</a>
      ${a.status === 'live' ? '<button class="btn hot small" type="button" data-copy-me>Copy my link</button>' : ''} <button class="linkish small" type="button" data-out>Sign out</button></p></div></div>
    ${a.messages.length ? `<div class="st-msg"><b>From TAM:</b> ${esc(a.messages[0].message)}</div>` : ''}
    <div class="st-dash-grid">
      <section class="cl-panel"><h2>Vet your page</h2><p class="small">${done} of ${a.checks.length} done. Tick them all to send your page to TAM.</p>
        <ul class="st-checks">${a.checks.map((c) => `<li class="${c.done ? 'done' : ''}"><i>${c.done ? '✓' : ''}</i>${esc(c.label)} <small>+${c.xp} XP</small></li>`).join('')}</ul>
        ${a.status === 'draft' ? `<button class="btn hot" type="button" data-submit ${a.canSubmit ? '' : 'disabled'}>Send my page to TAM</button>` : ''}
        ${a.status === 'review' ? '<p class="ok">It’s with us. We’ll email you when it’s live.</p>' : ''}
        ${a.status === 'live' && a.goals.length ? `<h3>Your next planet: ${esc(STAGES[a.stage + 1])}</h3><ul class="st-goals">${a.goals.map((g) => `<li class="${g.done ? 'done' : ''}"><i style="--p:${g.part}"></i>${esc(g.label)}</li>`).join('')}</ul>` : ''}</section>
      <section class="cl-panel"><h2>Your page</h2><form id="st-edit">
        <div class="st-photo">${a.photo ? `<img src="${esc(a.photo)}" alt="" width="96" height="96">` : '<span>📷</span>'}<label class="btn ghost small">${a.photo ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" data-photo class="sr"></label></div>
        <label class="field"><span>Act or band name</span><input name="act" value="${esc(a.act)}" maxlength="80"></label>
        <label class="field"><span>What you play, in a line</span><input name="plays" value="${esc(a.plays)}" maxlength="120"></label>
        <label class="field"><span>Where you’re from</span><input name="from" value="${esc(a.from)}" maxlength="80"></label>
        <label class="field"><span>Your story</span><textarea name="bio" rows="6" maxlength="1500">${esc(a.bio)}</textarea></label>
        <label class="field"><span>Links to your music, one per line (https://…)</span><textarea name="links" rows="3">${esc(a.links.join('\n'))}</textarea></label>
        <label class="field"><span>A YouTube video of you playing live</span><input name="youtube" value="${a.youtube ? `https://www.youtube.com/watch?v=${esc(a.youtube)}` : ''}" placeholder="https://www.youtube.com/watch?v=…"></label>
        <label class="field"><span>Your page’s vibe</span><select name="vibe">${Object.entries(a.vibes).map(([k, v]) => `<option value="${k}" ${a.vibe === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="ownWork" ${a.ownWork ? 'checked' : ''}> Everything here is mine to share, and I’m 18+ (or have a parent’s OK)</label>
        <button class="btn hot" type="submit">Save</button><p class="err" role="status" aria-live="polite"></p></form></section>
    </div></div>`;
}
if (me) {
  api('/api/stage/me').then((r) => draw(r.artist)).catch((err) => { me.innerHTML = `<h1 class="chrome">Your TAM Stage page</h1><p>${esc(err.message)}</p><p><a class="btn hot" href="/stage/apply">Get a new link</a></p>`; });
  me.addEventListener('submit', async (e) => {
    if (e.target.id !== 'st-edit') return;
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/api/stage/me', { method: 'POST', body: { act: f.get('act'), plays: f.get('plays'), from: f.get('from'), bio: f.get('bio'), links: f.get('links'), youtube: f.get('youtube'), vibe: f.get('vibe'), ownWork: f.get('ownWork') === 'on' } });
      draw(r.artist);
      formMessage($('#st-edit'), 'Saved.', true);
    } catch (err) { formMessage(e.target, err.message); }
  });
  me.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-photo]') || !e.target.files[0]) return;
    try { draw((await api('/api/stage/me/photo', { method: 'POST', body: { photo: await shrinkImage(e.target.files[0], 1000, 0.84) } })).artist); }
    catch (err) { alert(err.message); }
  });
  me.addEventListener('click', async (e) => {
    if (e.target.closest('[data-submit]')) { try { draw((await api('/api/stage/me/submit', { method: 'POST', body: {} })).artist); track('stage_submit'); } catch (err) { alert(err.message); } }
    if (e.target.closest('[data-copy-me]')) { try { await navigator.clipboard.writeText(A.shareUrl); e.target.textContent = 'Copied'; } catch { prompt('Your link', A.shareUrl); } }
    if (e.target.closest('[data-out]')) { await api('/api/stage/signout', { method: 'POST', body: {} }); location.href = '/stage'; }
  });
}
