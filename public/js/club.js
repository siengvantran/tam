// The TAM Club on every page (src/domain/club.js): the sign-up forms, the
// emailed-link pages, your card on /club, points for visiting and sharing,
// referral links, and the staff buttons on a card at the bar.

import { $, $$, api, shrinkImage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private */ } } };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };
const track = (name, p = {}) => { if (window.tamTrack) window.tamTrack(name, p); };
const signedIn = /(?:^|;\s*)tam_club_on=1/.test(document.cookie);
const today = new Date().toISOString().slice(0, 10);

// a little "+2" that floats up when points land
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'cl-toast', textContent: msg });
  t.setAttribute('role', 'status');
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2800);
}

// ---------- referral: someone opened a link a member shared ----------
const ref = new URLSearchParams(location.search).get('r');
if (ref && /^[A-Z0-9]{4,10}$/i.test(ref)) {
  ss.set('tam:ref', ref.toUpperCase());
  if (!ss.get(`tam:refv:${ref}`)) { ss.set(`tam:refv:${ref}`, '1'); api('/api/club/ref-visit', { method: 'POST', body: { r: ref } }).catch(() => {}); }
}

// ---------- joining ----------
for (const form of $$('[data-club-join]')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form), msg = form.querySelector('.err');
    msg.classList.remove('ok');
    if (!f.get('consent')) { msg.textContent = 'Tick the box to say yes to TAM’s emails.'; return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api('/api/club/join', { method: 'POST', body: {
        email: f.get('email'), name: f.get('name') || '', interests: f.getAll('interests'), frequency: f.get('frequency') || 'weekly',
        consent: true, source: form.dataset.source || 'tam.tv', ref: ss.get('tam:ref') || '',
      } });
      msg.classList.add('ok');
      msg.textContent = 'Nearly there: check your inbox and tap the link to confirm. That starts your card with 10 points.';
      form.querySelectorAll('input, button').forEach((x) => { x.disabled = true; });
      track('club_join', { source: form.dataset.source || 'tam.tv' });
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
}

// "Already in? Email me my card"
for (const b of $$('[data-club-signin]')) {
  b.addEventListener('click', () => {
    const f = document.createElement('form');
    f.className = 'cl-signin';
    f.innerHTML = '<label class="field"><span>Your email</span><input name="email" type="email" autocomplete="email" required></label><button class="btn ghost" type="submit">Email me my card</button><p class="err" role="status" aria-live="polite"></p>';
    b.closest('p').after(f);
    b.closest('p').remove();
    f.email.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/club/link', { method: 'POST', body: { email: f.email.value } }); f.querySelector('.err').classList.add('ok'); f.querySelector('.err').textContent = `If ${f.email.value} is on the list, your card link is on its way.`; }
      catch (err) { f.querySelector('.err').textContent = err.message; }
    });
  });
}

// ---------- the emailed links: confirm, open my card ----------
for (const [id, path] of [['#club-confirm', '/api/club/confirm'], ['#club-in', '/api/club/in']]) {
  const box = $(id);
  if (!box) continue;
  box.querySelector('button').addEventListener('click', async () => {
    try {
      const r = await api(path, { method: 'POST', body: { t: new URLSearchParams(location.search).get('t') || '' } });
      if (id === '#club-confirm') track('club_confirm');
      location.replace(r.next || '/club');
    } catch (err) { box.querySelector('.err').textContent = err.message; }
  });
}

// ---------- unsubscribe page ----------
const unsub = $('#club-unsub');
if (unsub) {
  unsub.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      const r = await api(`/api/club/unsubscribe?t=${encodeURIComponent(new URLSearchParams(location.search).get('t') || '')}`, { method: 'POST', body: { action: b.dataset.act } });
      unsub.innerHTML = r.emails ? `<p class="ok">Done: you’ll hear from us ${r.frequency === 'monthly' ? 'once a month' : 'only with big news'}.</p>` : '<p class="ok">You’re unsubscribed. Your TAM Club card and points are still yours: <a href="/club">open your card</a>.</p>';
    } catch (err) { unsub.querySelector('.err').textContent = err.message; }
  });
}

// ---------- signed-in members: a point a day for visiting, points for sharing ----------
let me = null;
if (signedIn) {
  (async () => {
    if (ls.get('tam:club:ping') !== today) {
      try {
        const r = await api('/api/club/ping', { method: 'POST', body: {} });
        ls.set('tam:club:ping', today);
        if (r.got) toast(`+${r.got} point for visiting today · ${r.member.balance} on your card`);
      } catch { /* offline */ }
    }
  })();
  // share buttons anywhere on the site (act pages, events…)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-share] a, [data-share] button, [data-club-share]')) return;
    api('/api/club/share', { method: 'POST', body: { path: location.pathname } }).then((r) => { if (r.got) toast(`+${r.got} for sharing · ${r.balance} points`); }).catch(() => {});
  });
}

// your referral code goes on the links you share, so you get points when friends open them
function tagShares(code) {
  const add = (u) => { try { const x = new URL(u, location.origin); if (x.origin !== location.origin && !/tam\.tv$/.test(x.hostname)) return u; x.searchParams.set('r', code); return x.toString(); } catch { return u; } };
  for (const s of $$('[data-share]')) {
    const old = s.dataset.url;
    if (!old) continue;
    const nu = add(old);
    s.dataset.url = nu;
    s.querySelectorAll('a[href]').forEach((a) => { a.href = a.href.split(encodeURIComponent(old)).join(encodeURIComponent(nu)).split(old).join(nu); });
  }
}

// ---------- /club: your card ----------
const glassSvg = (fill) => `<div class="cl-glass" style="--fill:${Math.max(0, Math.min(2, fill))}" aria-hidden="true"><svg viewBox="0 0 120 170"><defs><clipPath id="cl-pint2"><path d="M14 8h92l-10 152a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z"/></clipPath>
  <linearGradient id="cl-beer2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36b"/><stop offset="1" stop-color="#e88a1a"/></linearGradient></defs>
  <g clip-path="url(#cl-pint2)"><rect class="cl-beer" x="0" y="0" width="120" height="170" fill="url(#cl-beer2)"/><rect class="cl-foam" x="0" y="0" width="120" height="10" fill="#fff6e0"/></g>
  <path d="M14 8h92l-10 152a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z" fill="none" stroke="currentColor" stroke-width="3"/>
  <line x1="18" y1="87" x2="102" y2="87" stroke="currentColor" stroke-dasharray="4 4" opacity=".6"/><text x="104" y="84" font-size="10" fill="currentColor" text-anchor="end" opacity=".8">½</text></svg></div>`;

const cardRoot = $('[data-club-card]');
const NET = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', facebook: 'Facebook' };
let INTERESTS = null, FREQ = null;

function renderCard(m) {
  me = m;
  tagShares(m.refLink.split('/').pop());
  const fill = m.balance / m.half;
  const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const reward = m.reward
    ? `<div class="cl-reward live"><div class="label">Your drink on us · ${esc(m.reward.drinkName)}</div><p class="cl-code">${esc(m.reward.code)}</p><p>Show this code and your card at the TAM bar. Good until ${esc(when(m.reward.expires))}.</p></div>`
    : m.canClaim ? `<div class="cl-reward ready"><p><b>Your drink is ready.</b> Pick one, then show the code at the bar.</p><div class="row-btn cl-drinks">${Object.entries(m.drinks).map(([k, v]) => `<button class="btn hot" type="button" data-claim="${k}">${{ half: '🍺', wine: '🍷', water: '🫗' }[k] || ''} ${esc(v)}</button>`).join('')}</div></div>`
      : m.nextClaimAt ? `<div class="cl-reward"><p>One drink a week: your next one unlocks ${esc(when(m.nextClaimAt))}.</p></div>`
        : `<div class="cl-reward"><p><b>${m.toHalf}</b> more point${m.toHalf === 1 ? '' : 's'} to a drink on us: half a pint, a glass of wine or an infused water.</p></div>`;
  const socials = Object.entries(m.socialLinks || {});
  cardRoot.innerHTML = `
  ${m.status !== 'active' ? '<p class="cl-pending">Check your inbox and tap the link to confirm your email: that starts your card with 10 points.</p>' : ''}
  <div class="cl-card">
    ${glassSvg(fill)}
    <div class="cl-card-main"><div class="cl-who">
      <label class="cl-face-btn" title="${m.photo ? 'Change your photo' : 'Add your photo'}">${m.photo ? `<img class="cl-face" src="${esc(m.photo)}" alt="Your photo" width="72" height="72">` : '<span class="cl-face empty" aria-hidden="true">📷</span>'}
        <input type="file" accept="image/*" data-photo class="sr"><span class="sr">${m.photo ? 'Change your photo' : 'Add your photo'}</span></label>
      <div><div class="label">TAM Club · ${esc(m.tier.name)}</div>
      <h1 class="chrome gold">${m.firstName ? `${esc(m.firstName)}’s card` : 'Your card'}</h1></div></div>
      ${m.photo ? '' : '<p class="small muted cl-photo-hint">Add a photo so the bar knows it’s you (+1). Only you and TAM staff see it. <button class="linkish" type="button" data-pick-photo>Add a photo</button></p>'}
      <p class="cl-points"><b data-count="${m.balance}">${m.balance}</b> points</p>
      <div class="cl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.half}" aria-valuenow="${Math.min(m.half, m.balance)}" aria-label="Points toward a drink on us"><i style="width:${Math.min(100, (m.balance / m.half) * 100)}%"></i></div>
      ${reward}
      <p class="small muted">${m.streakDays ? `🔥 ${m.streakDays} day${m.streakDays > 1 ? 's' : ''} this week${m.streakDays < 3 ? ` · visit on ${3 - m.streakDays} more for +2` : ''} · ` : ''}${m.tier.next ? `${m.tier.toNext} points earned to ${esc(m.tier.next)}` : 'Top level: Legend'}</p>
    </div>
    <div class="cl-qr"><img src="/club/card/${esc(m.card)}/qr.svg" alt="Your TAM Club card QR code" width="150" height="150"><small>Show this at the bar and door · ${esc(m.card)}</small></div>
  </div>

  <div class="cl-grid">
    <section class="cl-panel"><h2>Bring your friends</h2><p>Share your link: <b>+1</b> when someone opens it, <b>+5</b> when a friend joins.</p>
      <div class="cl-ref"><input readonly value="${esc(m.refLink)}" aria-label="Your link"><button class="btn ghost small" type="button" data-copy-ref>Copy</button>${navigator.share ? '<button class="btn hot small" type="button" data-share-ref data-club-share>Share</button>' : ''}</div>
      ${socials.length ? `<h3>Follow TAM</h3><p class="cl-socials">${socials.map(([k, u]) => `<a class="btn ghost small ${m.socials.includes(k) ? 'done' : ''}" href="${esc(u)}" target="_blank" rel="noopener" data-social="${k}">${m.socials.includes(k) ? '✓ ' : ''}${NET[k] || k}${m.socials.includes(k) ? '' : ' · +1'}</a>`).join('')}</p>` : ''}
    </section>
    <section class="cl-panel"><h2>Ways to earn</h2><ul class="cl-ways">${m.missions.map((x) => `<li class="${x.done ? 'done' : ''}"><b>${esc(x.pts)}</b><span>${esc(x.label)}${x.hint ? ` <small>${esc(x.hint)}</small>` : ''}</span>${x.done ? '<i aria-label="done for now">✓</i>' : ''}</li>`).join('')}</ul></section>
    <section class="cl-panel"><h2>Badges</h2><ul class="cl-badges">${m.allBadges.map((b) => `<li class="${m.badges.some((x) => x.name === b.name) ? 'got' : ''}"><span>${b.icon}</span>${esc(b.name)}</li>`).join('')}</ul>
      <h2>Lately</h2><ul class="cl-history">${m.history.map((h) => `<li><b class="${h.pts < 0 ? 'neg' : ''}">${h.pts > 0 ? '+' : ''}${h.pts}</b> ${esc(h.label)}${h.note ? ` <small>${esc(h.note)}</small>` : ''}<small>${esc(when(h.at))}</small></li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul></section>
    <section class="cl-panel"><h2>Your emails</h2><form id="cl-prefs">
      <label class="field"><span>First name</span><input name="name" value="${esc(m.name)}" maxlength="60"></label>
      <fieldset class="cl-chips"><legend>What you’re into</legend>${Object.entries(INTERESTS).map(([k, v]) => `<label class="cl-chip"><input type="checkbox" name="interests" value="${k}" ${m.interests.includes(k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</fieldset>
      <fieldset class="cl-chips"><legend>How often</legend>${Object.entries(FREQ).map(([k, v]) => `<label class="cl-chip"><input type="radio" name="frequency" value="${k}" ${m.frequency === k ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</fieldset>
      <label class="check"><input type="checkbox" name="emails" ${m.emails ? 'checked' : ''}> Send me TAM’s emails</label>
      <button class="btn hot" type="submit">Save</button><p class="err" role="status" aria-live="polite"></p></form>
      ${m.photo ? '<p class="small"><button class="linkish" type="button" data-remove-photo>Remove my photo</button></p>' : ''}
      <p class="small"><button class="linkish" type="button" data-signout>Sign out on this device</button> · <button class="linkish" type="button" data-delete>Delete my card and data</button></p>
      <p class="small muted">Read every issue in <a href="/newsletter">the archive</a>.</p></section>
  </div>`;
}

if (cardRoot) {
  INTERESTS = { gigs: 'Gigs and live bands', showcases: 'Sunday Showcase and new acts', blues: 'The Great British Blues Jam', christmas: 'Christmas at TAM', fridays: 'Friday nights', immersive: 'Immersive and creators' };
  FREQ = { weekly: 'Every week', monthly: 'Once a month', big: 'Only big news' };
  const load = async () => { try { renderCard((await api('/api/club/me')).member); } catch (err) { cardRoot.innerHTML = `<p>${esc(err.message)} <a href="/club" data-signout>Join or get a new link</a>.</p>`; } };
  load().then(() => { if (new URLSearchParams(location.search).get('welcome')) toast('Welcome to the TAM Club: +10 points 🍻'); });
  cardRoot.addEventListener('click', async (e) => {
    const t = e.target;
    const pick = t.closest('[data-claim]');
    if (pick) {
      try { renderCard((await api('/api/club/claim', { method: 'POST', body: { drink: pick.dataset.claim } })).member); track('club_claim_drink', { drink: pick.dataset.claim }); } catch (err) { toast(err.message); }
    }
    if (t.closest('[data-pick-photo]')) cardRoot.querySelector('[data-photo]').click();
    if (t.closest('[data-remove-photo]')) { try { renderCard((await api('/api/club/photo', { method: 'POST', body: { remove: true } })).member); toast('Photo removed'); } catch (err) { toast(err.message); } }
    if (t.closest('[data-copy-ref]')) { try { await navigator.clipboard.writeText(me.refLink); toast('Link copied: send it to a friend'); } catch { /* old browser */ } }
    if (t.closest('[data-share-ref]')) { try { await navigator.share({ title: 'TAM', text: 'Come to a night at TAM with me, and join the TAM list:', url: me.refLink }); } catch { /* cancelled */ } }
    const soc = t.closest('[data-social]');
    if (soc && !soc.classList.contains('done')) {
      setTimeout(async () => { try { const r = await api('/api/club/social', { method: 'POST', body: { platform: soc.dataset.social } }); if (r.got) toast(`+${r.got} for following TAM`); renderCard(r.member); } catch { /* fine */ } }, 1500);
    }
    if (t.closest('[data-signout]')) { e.preventDefault(); await api('/api/club/signout', { method: 'POST', body: {} }).catch(() => {}); location.href = '/club'; }
    if (t.closest('[data-delete]') && confirm('Delete your TAM Club card, points and email preferences? This can’t be undone.')) {
      await api('/api/club/delete', { method: 'POST', body: {} }); location.href = '/club';
    }
  });
  cardRoot.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-photo]')) return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      const photo = await shrinkImage(file, 600, 0.82);
      const before = me.balance;
      const r = await api('/api/club/photo', { method: 'POST', body: { photo } });
      renderCard(r.member);
      toast(r.member.balance > before ? `Looking good · +${r.member.balance - before}` : 'Photo saved');
    } catch (err) { toast(err.message); }
  });
  cardRoot.addEventListener('submit', async (e) => {
    if (e.target.id !== 'cl-prefs') return;
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/api/club/me', { method: 'POST', body: { name: f.get('name'), interests: f.getAll('interests'), frequency: f.get('frequency'), emails: f.get('emails') === 'on' } });
      const before = me.balance;
      renderCard(r.member);
      toast(r.member.balance > before ? `Saved · +${r.member.balance - before} points` : 'Saved');
    } catch (err) { e.target.querySelector('.err').textContent = err.message; }
  });
} else if (signedIn && $('[data-share]')) {
  api('/api/club/me').then((r) => tagShares(r.member.refLink.split('/').pop())).catch(() => {});
}

// ---------- a card at the bar: staff buttons ----------
const staff = $('#club-staff');
if (staff) {
  const code = staff.dataset.card;
  const draw = (c, note = '') => {
    staff.innerHTML = `<div class="formbox cl-staff">${c.photo ? '' : '<p class="small muted">No photo on this card.</p>'}<p class="label">Staff · ${esc(c.name)} · ${esc(c.tier)} · <b>${c.balance}</b> points</p>
      ${c.reward ? `<div class="cl-reward live"><p class="cl-code">${esc(c.reward.code)}</p><p><b>${esc(c.reward.drinkName)}</b> to pour. Check the code on their phone matches.</p><button class="btn hot" type="button" data-pour>Poured it ✓</button></div>` : '<p class="muted">No drink to pour right now.</p>'}
      <div class="row-btn"><button class="btn ghost" type="button" data-here>They’re here tonight (+5)</button></div>
      <form data-bar class="cl-barform"><label class="field"><span>Bar spend (£)</span><input name="pounds" type="number" min="0.5" step="0.01" inputmode="decimal" required></label><button class="btn hot" type="submit">Add points</button></form>
      ${c.today.length ? `<p class="small">Today: ${c.today.map((x) => `${esc(x.label)} (${x.pts > 0 ? '+' : ''}${x.pts})`).join(' · ')}</p>` : ''}
      <p class="err" role="status" aria-live="polite">${esc(note)}</p></div>`;
  };
  const act = async (path, body = {}) => { try { const r = await api(`/api/club/card/${code}/${path}`, { method: 'POST', body }); draw(r.card, r.note || (r.got ? `+${r.got} points added.` : r.poured ? 'Enjoy! Marked as poured.' : '')); } catch (err) { staff.querySelector('.err').textContent = err.message; } };
  api(`/api/club/card/${code}`).then((r) => draw(r.card)).catch(() => { /* not staff: nothing to show */ });
  staff.addEventListener('click', (e) => {
    if (e.target.closest('[data-pour]')) act('pour');
    if (e.target.closest('[data-here]')) act('here');
  });
  staff.addEventListener('submit', (e) => { e.preventDefault(); act('bar', { pounds: Number(e.target.pounds.value) }); });
}
