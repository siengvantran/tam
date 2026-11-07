// The Great British Blues Jam page: Saturdays (host, house band, who's jamming),
// sign up to jam, and the Great British Blues Wall.

import { $, api, store, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mine = () => store.get('bluesSignups', {}); // id → key, to cancel your own sign-up
let data = null;

const pounds = (p) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;

function nightCard(n, i) {
  const me = mine();
  const instruments = data.instruments.map((x) => `<option>${esc(x)}</option>`).join('');
  return `<article class="bj-night${i === 0 ? ' next' : ''}" id="sat-${n.date}">
    <header><div class="label">${esc(n.start)}</div><h3>${esc(n.when)}</h3>
      ${n.page ? `<a class="small" href="${esc(n.page)}">Details</a>` : ''}${n.tickets ? ` · <a class="small" href="${esc(n.tickets)}" target="_blank" rel="noopener">Tickets${n.price !== null && n.price !== undefined ? ` from ${pounds(n.price)}` : ''} ↗</a>` : ''}</header>
    <div class="bj-who">
      <div><div class="bj-k">Host</div><p class="bj-host">${n.host ? esc(n.host) : '<span class="muted">Announced soon</span>'}</p></div>
      <div><div class="bj-k">House band</div>${n.band.length ? `<ul class="bj-band">${n.band.map((b) => `<li><b>${esc(b.name)}</b>${b.instrument ? ` <span class="muted">${esc(b.instrument)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Announced soon</p>'}</div>
    </div>
    ${n.note ? `<p class="bj-note">${esc(n.note)}</p>` : ''}
    <div class="bj-k">Jamming${n.jammers.length ? ` (${n.jammers.length})` : ''}</div>
    ${n.jammers.length ? `<ol class="bj-jammers">${n.jammers.map((j) => `<li class="${j.played ? 'played' : ''}${n.onStage && n.onStage.id === j.id ? ' on' : ''}"><b>${esc(j.name)}</b> <span class="muted">${esc(j.instrument)}</span>${me[j.id] ? ` <button class="linkish small" type="button" data-cancel="${j.id}">cancel</button>` : ''}</li>`).join('')}</ol>` : '<p class="muted small">Nobody yet. Be the first!</p>'}
    ${n.open ? `<form class="bj-signup" data-date="${n.date}"><div class="fields three">
        <label class="field"><span>Name</span><input name="name" maxlength="40" required autocomplete="name" placeholder="Or stage name"></label>
        <label class="field"><span>Instrument</span><select name="instrument" required><option value="">Choose…</option>${instruments}</select></label>
        <label class="field bj-other" hidden><span>Which?</span><input name="other" maxlength="30"></label>
        <label class="field"><span>Email <small class="muted">(optional, staff only)</small></span><input name="email" type="email" autocomplete="email"></label></div>
        <button class="btn hot small" type="submit">Sign up to jam</button> <span class="small muted">${n.spotsLeft} spots left</span><p class="err" role="status" aria-live="polite"></p></form>`
      : '<p class="small muted">Sign-ups for this Saturday are closed. Come down and ask the host.</p>'}
  </article>`;
}

function wallHtml() {
  if (!data.wall.length) return '<p class="muted">The wall is empty. Say something nice about the jam!</p>';
  return data.wall.map((w) => `<figure class="bj-post"><blockquote>${esc(w.message)}</blockquote><figcaption>${esc(w.name)}</figcaption></figure>`).join('');
}

async function load() {
  data = await api('/api/blues');
  $('#bj-nights').innerHTML = data.nights.map(nightCard).join('');
  $('#bj-wall').innerHTML = wallHtml();
}

if ($('#bj-nights')) {
  load().catch(() => { $('#bj-nights').innerHTML = '<p class="err">The jam list didn’t load. Refresh to try again.</p>'; });
  $('#bj-nights').addEventListener('change', (e) => {
    if (e.target.name === 'instrument') { const o = e.target.form.querySelector('.bj-other'); o.hidden = e.target.value !== 'Other'; }
  });
  $('#bj-nights').addEventListener('submit', async (e) => {
    const f = e.target.closest('.bj-signup');
    if (!f) return;
    e.preventDefault();
    try {
      const r = await api('/api/blues/signup', { method: 'POST', body: { date: f.dataset.date, ...Object.fromEntries(new FormData(f)) } });
      store.set('bluesSignups', { ...mine(), [r.id]: r.key });
      await load();
      const card = $(`#sat-${r.night.date}`);
      card.insertAdjacentHTML('afterbegin', `<p class="good bj-done">You’re on the list: number ${r.position}. See you Saturday!</p>`);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { formMessage(f, err.message); }
  });
  $('#bj-nights').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b || !confirm('Take your name off the list?')) return;
    try {
      await api(`/api/blues/signup/${b.dataset.cancel}/cancel`, { method: 'POST', body: { key: mine()[b.dataset.cancel] } });
      const m = mine(); delete m[b.dataset.cancel]; store.set('bluesSignups', m);
      await load();
    } catch (err) { alert(err.message); }
  });
  $('#bj-wall-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('/api/blues/wall', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
      f.message.value = '';
      formMessage(f, r.status === 'pending' ? 'Thanks! It goes up once the team has seen it.' : 'It’s on the wall!', true);
      await load();
    } catch (err) { formMessage(f, err.message); }
  });
}
