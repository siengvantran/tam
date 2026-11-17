// The TAM Stage (src/domain/stage.js): ask to play, open your page from the
// emailed link, build and vet your microverse, boost acts, share them.

import { $, $$, api, shrinkImage, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const track = (n, p = {}) => { if (window.tamTrack) window.tamTrack(n, p); };
const STAGES = ['Signal', 'Orbit', 'Open Night', 'Showcase', 'Headline', 'Festival'];

// ---------- ask to play ----------
const apply = $('#st-apply');
if (apply) {
  const showBox = apply.querySelector('[data-show-only]');
  apply.addEventListener('change', (e) => {
    showBox.hidden = !apply.querySelector('input[name="paths"][value="show"]').checked;
    // the Junior & Youth Open Mic is for under-18s: choosing it sets the age, and a parent applies
    if (e.target.value === 'jom' && e.target.checked) apply.age.value = 'under18';
    apply.querySelector('[data-u18-note]').hidden = apply.age.value !== 'under18';
  });
  apply.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(apply);
    const paths = f.getAll('paths');
    if (!paths.length) return formMessage(apply, 'Choose what you’d like to play.');
    if (!f.get('age')) return formMessage(apply, 'Tell us if you’re 18 or over.');
    if (!f.get('consent')) return formMessage(apply, 'Tick the box so we can email you about playing at TAM.');
    const g = (k) => f.get(k) || '';
    try {
      const r = await api('/api/stage/apply', { method: 'POST', body: {
        name: g('name'), email: g('email'), act: g('act'), plays: g('plays'), from: g('from'), age: g('age'), links: g('links'), about: g('about'), paths, consent: true,
        draw: Object.fromEntries(['instagram', 'tiktok', 'spotify', 'youtube', 'mailing', 'bring', 'lastGig', 'biggest', 'sold'].map((k) => [k, g(k)])),
        story: { hook: g('hook'), now: g('now'), filmed: f.get('filmed') === 'on' },
        show: { title: g('showTitle'), idea: g('showIdea'), when: g('showWhen'), crowd: g('showCrowd'), price: g('showPrice') },
      } });
      track('stage_apply', { paths: paths.join(',') });
      if (r.next) { location.href = r.next; return; }
      apply.innerHTML = `<h2 class="chrome gold">Check your inbox</h2><p>You’ve applied before with <b>${esc(f.get('email'))}</b>, so we’ve added this to your application and emailed you a link to your page. It works once, for 3 days.</p>`;
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

// ---------- pledge to see them live ----------
const pledge = $('[data-pledge]');
if (pledge) pledge.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(pledge);
  if (!f.get('consent')) return formMessage(pledge, 'Tick the box so we can email you when they play at TAM.');
  try {
    const r = await api(`/api/stage/${pledge.dataset.pledge}/pledge`, { method: 'POST', body: { name: f.get('name'), email: f.get('email'), n: f.get('n'), consent: true } });
    $$('[data-pledged]').forEach((x) => { x.textContent = r.pledged; });
    pledge.innerHTML = `<p class="ok"><b>${r.updated ? 'Pledge updated.' : 'Thank you!'}</b> We’ll email you when they’re booked at TAM. Now share their page, or make them a poster, so your friends pledge too.</p><p><button class="btn ghost small" type="button" data-poster>🖼 Make a poster</button></p>`;
    track('stage_pledge', { act: pledge.dataset.pledge });
  } catch (err) { formMessage(pledge, err.message); }
});

// ---------- /stage: filter by planet ----------
for (const b of $$('[data-st-filter]')) b.addEventListener('click', () => {
  $$('[data-st-filter]').forEach((x) => x.classList.toggle('on', x === b));
  $$('#st-all [data-st]').forEach((x) => { x.hidden = b.dataset.stFilter !== 'all' && x.dataset.st !== b.dataset.stFilter; });
});

// ---------- /stage/me: build and vet your page ----------
const me = $('#st-me');
let A = null;
const welcome = new URLSearchParams(location.search).has('welcome');
function draw(a) {
  A = a;
  window.tamCardData = { act: a.act, plays: a.plays || '', photo: a.photo || '', slug: a.slug, url: a.shareUrl, planet: a.stageName, next: STAGES[a.stage + 1] || '', pledged: a.pledged, paths: a.paths || [] };
  const status = { draft: 'Building: not public yet', review: 'With TAM for review', live: 'Live on the TAM Stage', paused: 'Paused', declined: 'Not on the path right now' }[a.status];
  const done = a.checks.filter((c) => c.done).length;
  me.innerHTML = `<div class="st-dash">
    <div class="st-dash-top"><div><div class="label">Your microverse · ${esc(status)}</div><h1 class="chrome gold">${esc(a.act)}</h1>
      <p>Planet <b>${a.stage + 1} of 6: ${esc(STAGES[a.stage])}</b> · <b>${a.xp}</b> XP · 🎟 <b>${a.pledged}</b> pledged · ✦ ${a.boosts} boosts · ${a.views} views</p>
      ${a.paths.length ? `<p class="small">You applied for: <b>${a.paths.map(esc).join(' · ')}</b> · <a href="/stage/apply">apply for more</a></p>` : ''}
      <p><a class="btn ghost small" href="/stage/${esc(a.slug)}" target="_blank">${a.shareable ? 'See my page ↗' : 'Preview my page ↗'}</a>
      ${a.shareable ? '<button class="btn hot small" type="button" data-copy-me>Copy my link</button> <button class="btn hot small" type="button" data-poster>🖼 Make my poster</button>' : ''} <button class="linkish small" type="button" data-out>Sign out</button></p></div></div>
    ${!a.shareable && a.age !== 'under18' && ['draft', 'review'].includes(a.status) ? `<form class="st-msg st-adults" data-adults><b>Share your page and gather pledges.</b> Confirm everyone in the act is 18 or over and your page can be shared straight away, so fans, friends and family can pledge to see you live. (Under 18? A parent or guardian should get in touch, and TAM checks the page first.)<label class="check"><input type="checkbox" name="confirm"> Everyone in the act is 18 or over</label><button class="btn hot small" type="submit">Make my page shareable</button><p class="err" role="status" aria-live="polite"></p></form>` : ''}
    ${welcome ? `<div class="st-msg"><b>Welcome to the TAM Stage!</b> This is your page. ${a.shareable ? 'It’s up already, so share it and make a poster: friends, fans and family can pledge to see you live. ' : 'TAM checks pages for under-18s before anyone else can see them. '}Add a photo, your story and a live video, then send it to TAM. We’ve emailed you a link to get back here.</div>` : ''}
    ${a.messages.length ? `<div class="st-msg"><b>From TAM:</b> ${esc(a.messages[0].message)}</div>` : ''}
    <div class="st-dash-grid">
      <section class="cl-panel"><h2>Vet your page</h2><p class="small">${done} of ${a.checks.length} done. Tick them all to send your page to TAM.</p>
        <ul class="st-checks">${a.checks.map((c) => `<li class="${c.done ? 'done' : ''}"><i>${c.done ? '✓' : ''}</i>${esc(c.label)} <small>+${c.xp} XP</small></li>`).join('')}</ul>
        ${a.status === 'draft' ? `<button class="btn hot" type="button" data-submit ${a.canSubmit ? '' : 'disabled'}>Send my page to TAM</button>` : ''}
        ${a.status === 'review' ? '<p class="ok">It’s with us. We’ll email you when it’s live.</p>' : ''}
        <h3>Speed up your path</h3><p class="small">A pledged fan counts as five boosts. The more you add and share, the faster you move.</p>
        <ul class="st-goals">${a.boosters.map((b) => `<li class="${b.done ? 'done' : ''}"><i style="--p:${b.part}"></i>${esc(b.label)} <small>+${b.xp} XP</small></li>`).join('')}</ul>
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
      <section class="cl-panel st-posts-edit"><h2>Your posts</h2><p class="small">Add your Instagram, TikTok, Facebook or YouTube posts, or upload your own photos and videos. They show on your page under your story.</p>
        <form id="st-post"><label class="field"><span>Paste a link</span><input name="url" placeholder="instagram.com/p/…, tiktok.com/@you/video/…, facebook.com/…, youtu.be/…"></label>
          <label class="field"><span>A line about it (optional)</span><input name="caption" maxlength="200"></label>
          <div class="ar-row"><button class="btn hot" type="submit">Add the link</button><label class="btn ghost">Upload a photo<input type="file" accept="image/*" data-up="photo" class="sr"></label>
          <label class="btn ghost">Upload a video<input type="file" accept="video/mp4,video/webm,video/quicktime" data-up="video" class="sr"></label></div>
          <progress max="100" value="0" hidden></progress><p class="err" role="status" aria-live="polite"></p><p class="small muted">Videos up to 60 MB (MP4 plays everywhere).</p></form>
        <ul class="plain st-postlist">${a.posts.map((p) => `<li><span>${esc({ youtube: 'YouTube video', instagram: 'Instagram post', tiktok: 'TikTok', facebook: 'Facebook post', image: 'Photo', video: 'Video' }[p.kind] || 'Post')}${p.caption ? `: ${esc(p.caption)}` : ''}</span><button class="sh-x" type="button" data-rm-post="${esc(p.id)}" aria-label="Remove">×</button></li>`).join('') || '<li class="muted">No posts yet.</li>'}</ul></section>
    </div></div>`;
}
if (me) {
  api('/api/stage/me').then((r) => draw(r.artist)).catch((err) => { me.innerHTML = `<h1 class="chrome">Your TAM Stage page</h1><p>${esc(err.message)}</p><p><a class="btn hot" href="/stage/apply">Get a new link</a></p>`; });
  me.addEventListener('submit', async (e) => {
    if (e.target.id === 'st-post') {
      e.preventDefault();
      try { draw((await api('/api/stage/me/post', { method: 'POST', body: { url: e.target.url.value, caption: e.target.caption.value } })).artist); }
      catch (err) { formMessage(e.target, err.message); }
      return;
    }
    if (e.target.matches('[data-adults]')) {
      e.preventDefault();
      try { draw((await api('/api/stage/me/adults', { method: 'POST', body: { confirm: e.target.confirm.checked } })).artist); } catch (err) { formMessage(e.target, err.message); }
      return;
    }
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
    const up = e.target.closest('[data-up]');
    if (up && up.files[0]) {
      const f = up.closest('form'), file = up.files[0];
      try {
        if (up.dataset.up === 'photo') draw((await api('/api/stage/me/post-photo', { method: 'POST', body: { image: await shrinkImage(file, 1600, 0.85), caption: f.caption.value } })).artist);
        else {
          if (file.size > 60 * 1024 * 1024) throw new Error('Videos can be up to 60 MB. Trim it, or post it and paste the link.');
          const bar = f.querySelector('progress'); bar.hidden = false;
          const r = await new Promise((ok, no) => {
            const x = new XMLHttpRequest();
            x.open('POST', `/api/stage/me/post-video?caption=${encodeURIComponent(f.caption.value)}`);
            x.setRequestHeader('Content-Type', file.type || 'video/mp4');
            x.upload.onprogress = (p) => { if (p.lengthComputable) bar.value = Math.round((p.loaded / p.total) * 100); };
            x.onload = () => { try { const j = JSON.parse(x.responseText); x.status < 300 ? ok(j) : no(new Error(j.error)); } catch { no(new Error(`Upload failed (${x.status}).`)); } };
            x.onerror = () => no(new Error('Upload failed. Check your connection and try again.'));
            x.send(file);
          });
          draw(r.artist);
        }
      } catch (err) { formMessage(f, err.message); }
      return;
    }
    if (!e.target.matches('[data-photo]') || !e.target.files[0]) return;
    try { draw((await api('/api/stage/me/photo', { method: 'POST', body: { photo: await shrinkImage(e.target.files[0], 1000, 0.84) } })).artist); }
    catch (err) { alert(err.message); }
  });
  me.addEventListener('click', async (e) => {
    if (e.target.closest('[data-submit]')) { try { draw((await api('/api/stage/me/submit', { method: 'POST', body: {} })).artist); track('stage_submit'); } catch (err) { alert(err.message); } }
    const rm = e.target.closest('[data-rm-post]');
    if (rm && confirm('Remove this post from your page?')) { try { draw((await api(`/api/stage/me/post/${rm.dataset.rmPost}/remove`, { method: 'POST', body: {} })).artist); } catch (err) { alert(err.message); } }
    if (e.target.closest('[data-copy-me]')) { try { await navigator.clipboard.writeText(A.shareUrl); e.target.textContent = 'Copied'; } catch { prompt('Your link', A.shareUrl); } }
    if (e.target.closest('[data-out]')) { await api('/api/stage/signout', { method: 'POST', body: {} }); location.href = '/stage'; }
  });
}
