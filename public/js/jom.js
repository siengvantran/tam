// JOM at TAM (src/domain/jom.js): pledges, claims, concerns, sharing, and the
// parents' page where they update their act (TAM approves each change).

import { $, $$, api, shrinkImage, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const track = (n, p = {}) => { if (window.tamTrack) window.tamTrack(n, p); };
const browser = () => {
  try { let id = localStorage.getItem('tam:browser'); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, ''); localStorage.setItem('tam:browser', id); } return id; }
  catch { return `${Date.now()}-${Math.random()}`.replace(/\W/g, ''); }
};
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

// ---------- pledge to see them at The Best Christmas Ever ----------
const pledge = $('[data-pledge]');
if (pledge) {
  const slug = pledge.dataset.pledge, msg = pledge.querySelector('[data-msg]'), sel = pledge.querySelector('[data-n]');
  const mine = store.get(`tam:jom:${slug}`);
  if (mine) { sel.value = mine; pledge.querySelector('[data-go]').textContent = 'Update my pledge'; }
  pledge.querySelector('[data-go]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api(`/api/jom/${slug}/pledge`, { method: 'POST', body: { id: browser(), n: Number(sel.value) } });
      pledge.querySelector('[data-count]').textContent = r.pledges;
      store.set(`tam:jom:${slug}`, sel.value);
      msg.textContent = r.updated ? 'Pledge updated. Thank you!' : 'Thank you! 🎄 TAM’s programmers see every pledge. Share the page to get more people behind them.';
      e.target.textContent = 'Update my pledge';
      if (!r.updated) track('jom_pledge', { act: slug });
    } catch (err) { msg.textContent = err.message; }
    e.target.disabled = false;
  });
}

// ---------- share ----------
const share = $('[data-share]');
if (share) {
  const native = share.querySelector('[data-native]');
  if (navigator.share) { native.hidden = false; native.addEventListener('click', () => navigator.share({ title: share.dataset.title, text: share.dataset.text, url: share.dataset.url }).catch(() => {})); }
  share.querySelector('[data-copy]').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(share.dataset.url); e.target.textContent = 'Copied'; } catch { prompt('The link', share.dataset.url); } });
}

// ---------- claim, and concerns ----------
for (const f of $$('form[data-claim]')) f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(f);
  if (!d.get('consent')) return formMessage(f, 'Tick the box to confirm.');
  try {
    await api(`/api/jom/${f.dataset.claim}/claim`, { method: 'POST', body: { name: d.get('name'), email: d.get('email'), relation: d.get('relation'), note: d.get('note'), consent: true } });
    f.innerHTML = `<p class="ok"><b>Thank you.</b> We’ll check your claim and email <b>${esc(d.get('email'))}</b> a link to update the page.</p>`;
    track('jom_claim');
  } catch (err) { formMessage(f, err.message); }
});
for (const f of $$('form[data-concern]')) f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(f);
  try { await api(`/api/jom/${f.dataset.concern}/concern`, { method: 'POST', body: { name: d.get('name'), email: d.get('email'), message: d.get('message') } }); f.innerHTML = '<p class="ok">Thank you. TAM will look at this straight away.</p>'; }
  catch (err) { formMessage(f, err.message); }
});

// ---------- apply to play The Best Christmas Ever ----------
const xmas = $('#jm-xmas');
if (xmas) xmas.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(xmas);
  if (!d.get('consent')) return formMessage(xmas, 'Tick the box to confirm.');
  try {
    const r = await api('/api/jom/apply-christmas', { method: 'POST', body: { act: d.get('act'), group: d.get('group'), plays: d.get('plays'), members: d.get('members'), links: d.get('links'), played: d.get('played'), notes: d.get('notes'), name: d.get('name'), email: d.get('email'), relation: d.get('relation'), consent: true } });
    xmas.innerHTML = `<p class="ok"><b>Thank you!</b> We’ve got ${esc(d.get('act'))}’s application and emailed <b>${esc(d.get('email'))}</b>. The date is still to be announced: we’ll be in touch.</p>${r.page ? `<p>Share their page so fans can pledge to see them: <a href="${location.hostname.startsWith('jom.') ? '' : '/jom'}/${esc(r.page)}">their JOM page</a>.</p>` : ''}`;
    track('jom_christmas_apply');
  } catch (err) { formMessage(xmas, err.message); }
});

// ---------- parents: sign in ----------
const signin = $('#jm-signin');
if (signin) signin.addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/jom/sign-in', { method: 'POST', body: { email: signin.email.value } }); formMessage(signin, `If ${signin.email.value} has claimed a JOM page, a sign-in link is on its way.`, true); }
  catch (err) { formMessage(signin, err.message); }
});
const inBox = $('#jm-in');
if (inBox) inBox.querySelector('button').addEventListener('click', async () => {
  try { const r = await api('/api/jom/in', { method: 'POST', body: { t: new URLSearchParams(location.search).get('t') || '' } }); location.replace(location.hostname.startsWith('jom.') ? '/me' : r.next); }
  catch (err) { inBox.querySelector('.err').textContent = err.message; }
});

// ---------- parents: update their act ----------
const me = $('#jm-me');
const base = location.hostname.startsWith('jom.') ? '' : '/jom';
const photosOf = {}; // slug → the photos for the next change
const postsOf = {}; // slug → their posts for the next change (links, photos, videos)
const KINDS = { youtube: 'YouTube video', instagram: 'Instagram post', tiktok: 'TikTok', facebook: 'Facebook post', image: 'Photo', video: 'Video' };
function draw(d) {
  if (!d.acts.length) { me.innerHTML = '<h1 class="chrome gold">Nothing here yet</h1><p>Your claim is still being checked.</p>'; return; }
  me.innerHTML = `<div class="label">Parents and guardians · ${esc(d.email)}</div><h1 class="chrome gold">Update their page</h1>
    <p>Change anything below and send it to TAM. We check each update, then it goes on the page and we email you. Please keep out surnames you don’t want shown, schools, ages and where you live.</p>
    ${d.acts.map((a) => {
      const p = a.pending ? a.pending.changes : null;
      const v = p || a;
      photosOf[a.slug] = (p ? p.photos : a.photos).slice();
      postsOf[a.slug] = ((p && p.posts) || a.posts || []).map((x) => ({ ...x }));
      return `<form class="formbox jm-edit" data-act="${esc(a.slug)}"><h2>${esc(a.name)} <a class="small" href="${base}/${esc(a.slug)}" target="_blank">See their page ↗</a></h2>
        ${a.pending ? `<p class="jm-wait">Waiting for TAM to approve your update from ${esc(new Date(a.pending.at).toLocaleDateString('en-GB'))}. Sending another replaces it.</p>` : ''}
        ${a.rejected && !a.pending ? `<p class="err">TAM couldn’t make your last update${a.rejected.reason ? `: ${esc(a.rejected.reason)}` : '.'}</p>` : ''}
        <label class="field"><span>Name as shown</span><input name="name" value="${esc(v.name)}" maxlength="60"></label>
        <label class="field"><span>Short bio</span><textarea name="bio" rows="5" maxlength="1200" placeholder="What they play, who’s in the band, what they love about performing">${esc(v.bio)}</textarea></label>
        <label class="field"><span>Links to their music, one per line</span><textarea name="links" rows="3" placeholder="YouTube, Spotify, SoundCloud, Bandcamp, Instagram…">${esc((v.links || []).join('\n'))}</textarea></label>
        <div class="field"><span>Photos (up to 6; the first is the main one)</span><div class="jm-thumbs" data-thumbs></div>
          <label class="btn ghost small">Add a photo<input type="file" accept="image/*" data-photo class="sr"></label></div>
        <div class="field jm-posts-edit"><span>Posts on their page: Instagram, TikTok, Facebook or YouTube, or your own photos and videos</span>
          <ul class="plain jm-postlist" data-posts></ul>
          <div class="ar-row"><input name="posturl" placeholder="Paste a link: instagram.com/p/…, tiktok.com/@…/video/…, facebook.com/…, youtu.be/…" aria-label="Link to a post"><button class="btn ghost small" type="button" data-addpost>Add</button></div>
          <div class="ar-row"><label class="btn ghost small">Upload a photo<input type="file" accept="image/*" data-postphoto class="sr"></label><label class="btn ghost small">Upload a video<input type="file" accept="video/mp4,video/webm,video/quicktime" data-postvideo class="sr"></label><progress max="100" value="0" hidden></progress></div>
          <small class="muted">Videos up to 60 MB (MP4 plays everywhere). Nothing goes on the page until TAM approves it.</small></div>
        <button class="btn hot" type="submit">Send to TAM for approval</button><p class="err" role="status" aria-live="polite"></p></form>
        <div class="formbox jm-stage" data-stage="${esc(a.slug)}"><div class="label">TAM artist profile</div>
        ${a.stage ? `<h3>${esc(a.name)} is on the TAM Stage</h3><p>Planet: <b>${esc(a.stage.planet)}</b> · ${a.stage.status === 'live' ? `<a href="${esc(a.stage.href)}" target="_blank">See their profile ↗</a>` : 'TAM is reviewing it before it goes public.'}</p>
          <p class="small muted">It shows what TAM has approved on this page, and updates when your updates are approved. TAM will contact you about opportunities.</p><button class="linkish small" type="button" data-stage-out>Opt out</button>`
        : `<h3>Open doors across TAM</h3><p>Opt in to give ${esc(a.name)} a <b>TAM artist profile</b> on <a href="/stage" target="_blank">the TAM Stage</a>: TAM’s path for new acts, from open nights to the Sunday Showcase, TAM’s own nights and festival spots like <b>The Best Christmas Ever</b>. Fans can back them, and TAM’s team will see them when choosing who plays.</p>
          <p class="small muted">The profile shows only what TAM has approved on this page, starts at the Open Night planet (they’ve played TAM already), and TAM reviews it before it goes public. Opt out any time.</p>
          <label class="check"><input type="checkbox" data-stage-consent> I’m their parent or guardian (or I’m in the act and 18+). I agree to TAM showing ${esc(a.name)} on the TAM Stage and contacting me about opportunities to play at TAM.</label>
          <button class="btn hot" type="button" data-stage-in>Opt in to a TAM artist profile</button>`}<p class="err" role="status" aria-live="polite"></p></div>`;
    }).join('')}
    <p class="small"><button class="linkish" type="button" data-out>Sign out</button></p>`;
  for (const f of $$('form.jm-edit', me)) { thumbs(f); postList(f); }
}
function postList(f) {
  const list = postsOf[f.dataset.act];
  f.querySelector('[data-posts]').innerHTML = list.map((x, i) => `<li><span>${x.src && x.kind === 'image' ? `<img src="${esc(x.src)}" alt="" width="48" height="48" class="ar-thumb">` : ''}${esc(KINDS[x.kind] || 'Post')}</span>
    <input value="${esc(x.caption || '')}" maxlength="200" placeholder="A line about it (optional)" data-cap="${i}" aria-label="Caption"><button type="button" class="sh-x" data-rmpost="${i}" aria-label="Remove">×</button></li>`).join('') || '<li class="muted small">No posts yet.</li>';
}
function thumbs(f) {
  const list = photosOf[f.dataset.act];
  f.querySelector('[data-thumbs]').innerHTML = list.map((u, i) => `<figure><img src="${esc(u)}" alt="" width="90" height="110"><button type="button" class="linkish small" data-rm="${i}">Remove</button>${i ? `<button type="button" class="linkish small" data-first="${i}">Make main</button>` : '<small>Main</small>'}</figure>`).join('') || '<p class="small muted">No photos yet.</p>';
}
if (me) {
  const load = () => api('/api/jom/me').then(draw).catch((err) => { me.innerHTML = `<h1 class="chrome">Their JOM page</h1><p>${esc(err.message)}</p><p><a class="btn hot" href="${base}/sign-in">Get a new link</a></p>`; });
  load();
  me.addEventListener('input', (e) => { const c = e.target.dataset.cap; if (c !== undefined) postsOf[e.target.closest('form').dataset.act][Number(c)].caption = e.target.value; });
  me.addEventListener('change', async (e) => {
    if ((e.target.matches('[data-postphoto]') || e.target.matches('[data-postvideo]')) && e.target.files[0]) {
      const f = e.target.closest('form'), slug = f.dataset.act, file = e.target.files[0];
      try {
        if (postsOf[slug].length >= 12) throw new Error('Twelve posts at most: remove one first.');
        if (e.target.matches('[data-postphoto]')) {
          const r = await api(`/api/jom/me/${slug}/photo`, { method: 'POST', body: { photo: await shrinkImage(file, 1600, 0.85) } });
          postsOf[slug].push({ kind: 'image', src: r.photo, caption: '' });
        } else {
          if (file.size > 60 * 1024 * 1024) throw new Error('Videos can be up to 60 MB. Trim it, or post it and paste the link.');
          const bar = f.querySelector('.jm-posts-edit progress'); bar.hidden = false;
          const r = await new Promise((ok, no) => {
            const x = new XMLHttpRequest();
            x.open('POST', `/api/jom/me/${slug}/video`);
            x.setRequestHeader('Content-Type', file.type || 'video/mp4');
            x.upload.onprogress = (p) => { if (p.lengthComputable) bar.value = Math.round((p.loaded / p.total) * 100); };
            x.onload = () => { bar.hidden = true; try { const j = JSON.parse(x.responseText); if (x.status < 300) ok(j); else no(new Error(j.error)); } catch { no(new Error(`Upload failed (${x.status}).`)); } };
            x.onerror = () => { bar.hidden = true; no(new Error('Upload failed. Check your connection and try again.')); };
            x.send(file);
          });
          postsOf[slug].push({ kind: 'video', src: r.video, caption: '' });
        }
        postList(f); formMessage(f, 'Added. Send to TAM when you’re ready.', true);
      } catch (err) { formMessage(f, err.message); }
      e.target.value = '';
      return;
    }
    if (!e.target.matches('[data-photo]') || !e.target.files[0]) return;
    const f = e.target.closest('form');
    try {
      if (photosOf[f.dataset.act].length >= 6) throw new Error('Six photos at most: remove one first.');
      const r = await api(`/api/jom/me/${f.dataset.act}/photo`, { method: 'POST', body: { photo: await shrinkImage(e.target.files[0], 1200, 0.84) } });
      photosOf[f.dataset.act].push(r.photo);
      thumbs(f);
    } catch (err) { formMessage(f, err.message); }
    e.target.value = '';
  });
  me.addEventListener('click', async (e) => {
    const f = e.target.closest('form');
    if (e.target.dataset.rm) { photosOf[f.dataset.act].splice(Number(e.target.dataset.rm), 1); thumbs(f); }
    if (e.target.dataset.rmpost) { postsOf[f.dataset.act].splice(Number(e.target.dataset.rmpost), 1); postList(f); }
    if (e.target.closest('[data-addpost]')) {
      const u = f.posturl.value.trim();
      if (!u) return;
      try {
        if (postsOf[f.dataset.act].length >= 12) throw new Error('Twelve posts at most: remove one first.');
        const r = await api(`/api/jom/me/${f.dataset.act}/check-post`, { method: 'POST', body: { url: u } });
        postsOf[f.dataset.act].push({ ...r.post, url: u, caption: '' });
        f.posturl.value = ''; postList(f);
      } catch (err) { formMessage(f, err.message); }
    }
    if (e.target.dataset.first) { const l = photosOf[f.dataset.act]; l.unshift(l.splice(Number(e.target.dataset.first), 1)[0]); thumbs(f); }
    const st = e.target.closest('[data-stage]');
    if (st && (e.target.closest('[data-stage-in]') || e.target.closest('[data-stage-out]'))) {
      const optIn = Boolean(e.target.closest('[data-stage-in]'));
      if (optIn && !st.querySelector('[data-stage-consent]').checked) { st.querySelector('.err').textContent = 'Tick the box to confirm.'; return; }
      if (!optIn && !confirm('Take them off the TAM Stage? You can opt in again later.')) return;
      try { await api(`/api/jom/me/${st.dataset.stage}/stage`, { method: 'POST', body: { optIn, consent: optIn } }); await load(); }
      catch (err) { st.querySelector('.err').textContent = err.message; }
      return;
    }
    if (e.target.closest('[data-out]')) { await api('/api/jom/signout', { method: 'POST', body: {} }); location.href = `${base}/` || '/'; }
  });
  me.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, d = new FormData(f);
    try {
      await api(`/api/jom/me/${f.dataset.act}`, { method: 'POST', body: { name: d.get('name'), bio: d.get('bio'), links: d.get('links'), photos: photosOf[f.dataset.act], posts: postsOf[f.dataset.act] } });
      await load();
      formMessage($(`form[data-act="${f.dataset.act}"]`, me), 'Sent. We’ll email you when it’s on the page.', true);
    } catch (err) { formMessage(f, err.message); }
  });
}

// ---------- share a moment (/moments): a message, a photo or a video, and a pledge ----------
const mform = document.getElementById('jm-moment');
if (mform) {
  let photo = null, video = null;
  const label = mform.querySelector('[data-mfile]');
  mform.addEventListener('change', async (e) => {
    if (e.target.matches('[data-mphoto]') && e.target.files[0]) { try { photo = await shrinkImage(e.target.files[0], 1600, 0.85); video = null; label.textContent = 'Photo added'; } catch (err) { formMessage(mform, err.message); } }
    if (e.target.matches('[data-mvideo]') && e.target.files[0]) {
      const v = e.target.files[0];
      if (v.size > 60 * 1024 * 1024) { formMessage(mform, 'Videos can be up to 60 MB. Trim it and try again.'); e.target.value = ''; return; }
      video = v; photo = null; label.textContent = `Video added (${Math.round(v.size / 1048576)} MB)`;
    }
  });
  mform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(mform);
    if (!d.get('consent')) return formMessage(mform, 'Tick the box to confirm.');
    const act = d.get('act'), btn = mform.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (video) {
        const q = new URLSearchParams({ act, message: d.get('message') || '', name: d.get('name') || '', consent: 'yes' });
        const bar = mform.querySelector('progress'); bar.hidden = false;
        await new Promise((ok, no) => {
          const x = new XMLHttpRequest();
          x.open('POST', `/api/jom/moments/video?${q}`);
          x.setRequestHeader('Content-Type', video.type || 'video/mp4');
          x.upload.onprogress = (p) => { if (p.lengthComputable) bar.value = Math.round((p.loaded / p.total) * 100); };
          x.onload = () => { bar.hidden = true; try { const j = JSON.parse(x.responseText); if (x.status < 300) ok(j); else no(new Error(j.error)); } catch { no(new Error(`Upload failed (${x.status}).`)); } };
          x.onerror = () => { bar.hidden = true; no(new Error('Upload failed. Check your connection and try again.')); };
          x.send(video);
        });
      } else {
        await api('/api/jom/moments', { method: 'POST', body: { act, message: d.get('message') || '', name: d.get('name') || '', photo, consent: true } });
      }
      let pledged = '';
      if (act && d.get('pledge')) {
        try {
          const r = await api(`/api/jom/${act}/pledge`, { method: 'POST', body: { id: browser(), n: Number(d.get('n')) } });
          store.set(`tam:jom:${act}`, d.get('n'));
          pledged = ` You’ve pledged too: ${r.pledges} so far.`;
        } catch { /* the moment still went in */ }
      }
      mform.innerHTML = `<h2>Thank you! 💛</h2><p>Your moment is with TAM: it goes up once we’ve checked it.${pledged}</p><p><a class="btn ghost" href="">Share another</a></p>`;
      track('jom_moment', { act });
    } catch (err) { formMessage(mform, err.message); btn.disabled = false; }
  });
}
