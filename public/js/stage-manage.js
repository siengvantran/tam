// Staff: /stage/manage. TAM's A&R board: who's waiting for review, every act
// on the path by planet with its score and the suggested next step, and each
// act's ratings, notes, history and decisions.

import { $, api, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#anr');
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const ACTIONS = { review: '👀 Review', advance: '⬆ Move up', rate: '★ Rate', nudge: '👋 Nudge', wait: '…', none: '' };
let D = null, tab = 'review', open = null;

function signIn() {
  $('#team-login').hidden = false;
  $('#team-link').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/staff/link', { method: 'POST', body: { email: e.target.email.value, next: e.target.next.value } }); formMessage(e.target, 'If you’re on TAM’s team, a sign-in link is on its way.', true); } catch (err) { formMessage(e.target, err.message); }
  });
  $('#team-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/staff/login', { method: 'POST', body: { token: e.target.token.value } }); location.reload(); } catch (err) { formMessage(e.target, err.message); }
  });
}

async function load() { D = await api('/api/stage/manage'); }
async function start() {
  try { await load(); } catch { return signIn(); }
  root.hidden = false;
  $('#anr-who').innerHTML = `${esc(D.me.name)} · <button class="linkish" type="button" id="anr-out">Sign out</button>`;
  $('#anr-out').onclick = async () => { await api('/api/staff/signout', { method: 'POST', body: {} }).catch(() => {}); location.reload(); };
  if (!D.counts.review) tab = 'path';
  draw();
}

const card = (a) => `<button type="button" class="anr-card" data-open="${a.id}">
  ${a.photo ? `<img src="${esc(a.photo)}" alt="" width="48" height="48">` : '<span class="anr-noimg">✦</span>'}
  <span><b>${esc(a.act)}</b><small>${esc(a.plays || '')}</small><small>✦ ${a.stats.boosts} · ★ ${a.stats.rating.avg || '–'} · ${a.stats.views} views</small>
  ${a.suggest.action !== 'wait' && ACTIONS[a.suggest.action] ? `<em class="anr-sug ${a.suggest.action}">${ACTIONS[a.suggest.action]}</em>` : ''}</span>
  <i class="anr-score" title="Score">${a.score}</i></button>`;

function draw() {
  const by = (st) => D.artists.filter((a) => a.status === st);
  root.innerHTML = `<nav class="cm-tabs">${[['review', `To review (${D.counts.review})`], ['path', `On the path (${D.counts.live})`], ['draft', `Building their page (${D.counts.draft})`], ['off', `Paused or declined (${D.counts.paused + D.counts.declined})`], ['how', 'How we decide']].map(([k, v]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</nav>
  <div class="anr-wrap"><div id="anr-list"></div><aside id="anr-detail" class="anr-detail"></aside></div>`;
  const list = $('#anr-list');
  if (tab === 'path') {
    list.innerHTML = `<div class="anr-board">${D.stages.slice(1).map((s, i) => `<section><h3>${esc(s.name)} <small>${D.artists.filter((a) => a.status === 'live' && a.stage === i + 1).length}</small></h3>
      ${D.artists.filter((a) => a.status === 'live' && a.stage === i + 1).map(card).join('') || '<p class="muted small">Nobody yet.</p>'}</section>`).join('')}</div>
      <p class="small"><button class="btn ghost small" type="button" data-import>Bring in the Sunday Showcase acts</button> <span class="muted">Adds this season’s showcase acts at the Showcase planet, with their pages.</span></p>`;
  } else if (tab === 'how') {
    list.innerHTML = `<div class="prose small"><h3>The score (0–100)</h3><ul><li><b>50</b>: TAM’s ratings (the average of everyone who rated them, out of 5)</li><li><b>25</b>: fan boosts, against the most-boosted act</li><li><b>15</b>: momentum: boosts in the last two weeks, and whether that’s rising</li><li><b>10</b>: how complete their page is</li></ul>
      <h3>The planets and their goals</h3><ol>${D.stages.map((s) => `<li><b>${esc(s.name)}</b>: ${esc(s.blurb)}</li>`).join('')}</ol>
      <p>Goals to reach each planet show on the act’s page and in their dashboard. When every goal is met, the board suggests moving them up, but it’s always our call. Moving an act up emails them, and gives every TAM Club member who boosted them a scout bonus.</p>
      <h3>Ratings</h3><ul>${Object.values(D.ratings).map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p>Rate after you’ve watched their video or seen them live. Each person’s ratings are kept separately and averaged.</p></div>`;
  } else {
    const rows = tab === 'off' ? by('paused').concat(by('declined')) : by(tab);
    list.innerHTML = rows.length ? `<div class="anr-col">${rows.map(card).join('')}</div>` : `<p class="muted">${tab === 'review' ? 'Nothing waiting for review.' : 'Nobody here.'}</p>`;
  }
  if (open) detail(open);
}

function detail(id) {
  open = id;
  const a = D.artists.find((x) => x.id === id);
  const box = $('#anr-detail');
  if (!a) { box.innerHTML = ''; return; }
  const mine = a.ratings[D.me.name] || {};
  const st = a.stats;
  box.innerHTML = `<button class="linkish small" type="button" data-close>Close</button>
    <div class="anr-head">${a.photo ? `<img src="${esc(a.photo)}" alt="" width="88" height="88">` : ''}<div><h2>${esc(a.act)}</h2><p class="small">${esc(a.plays || '')}${a.from ? ` · ${esc(a.from)}` : ''}</p>
    <p class="small">${esc(D.stages[a.stage].name)} · ${esc(a.status)} · came from ${esc(a.source)} · ${esc(when(a.createdAt))}</p>
    <p class="small"><a href="/stage/${esc(a.slug)}" target="_blank">Their microverse ↗</a>${a.youtube ? ` · <a href="https://www.youtube.com/watch?v=${esc(a.youtube)}" target="_blank" rel="noopener">Video ↗</a>` : ''}${a.email ? ` · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : ''}</p></div><i class="anr-score big">${a.score}</i></div>
    <p class="anr-suggest ${a.suggest.action}"><b>Suggested:</b> ${esc(a.suggest.text)}</p>
    <div class="cm-tiles small">${[['Boosts', st.boosts], ['Last 2 weeks', st.recent], ['Views', st.views], ['Shares', st.shares], ['Rating', st.rating.avg || '–'], ['Raters', st.rating.raters]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    ${a.goals.length ? `<h3>Goals for ${esc(D.stages[a.stage + 1].name)}</h3><ul class="st-goals">${a.goals.map((g) => `<li class="${g.done ? 'done' : ''}"><i style="--p:${g.part}"></i>${esc(g.label)}</li>`).join('')}</ul>` : ''}
    ${a.bio ? `<details><summary>Their story</summary><p class="small">${esc(a.bio)}</p></details>` : ''}
    ${a.circuit || a.message ? `<p class="small muted">${esc(a.circuit)} ${esc(a.message || '')}</p>` : ''}
    <h3>Decide</h3><form class="anr-decide" data-id="${a.id}"><label class="field"><span>Message to them (optional, goes in the email)</span><textarea name="message" rows="2" maxlength="1000"></textarea></label>
      <div class="row-btn">${a.status === 'review' || a.status === 'draft' ? '<button class="btn hot small" data-act="approve">Put their page live</button><button class="btn ghost small" data-act="sendBack">Send back with a note</button>' : ''}
      ${a.status === 'live' ? `${a.stage < 5 ? `<button class="btn hot small" data-act="advance">Move up to ${esc(D.stages[a.stage + 1].name)}</button>` : ''}${a.stage > 1 ? '<button class="btn ghost small" data-act="back">Move back a planet</button>' : ''}` : ''}
      ${a.status === 'live' || a.status === 'review' ? '<button class="btn ghost small" data-act="pause">Pause</button><button class="btn ghost small" data-act="decline">Not for now</button>' : ''}
      ${['paused', 'declined'].includes(a.status) ? '<button class="btn ghost small" data-act="restore">Put back on the path</button>' : ''}</div>
      <label class="check small"><input type="checkbox" name="email"> Email them when it’s “Not for now” (kindly)</label><p class="err" role="status"></p></form>
    <h3>They played</h3><p class="row-btn small">${[['open', 'An open night'], ['showcase', 'A Sunday Showcase'], ['headline', 'Headline or support']].map(([k, v]) => `<button class="btn ${a.played[k] ? 'hot' : 'ghost'} small" type="button" data-played="${k}" data-on="${a.played[k] ? '' : '1'}">${a.played[k] ? '✓ ' : ''}${v}${a.played[k] ? ` · ${esc(a.played[k])}` : ''}</button>`).join('')}</p>
    <h3>Your rating</h3><form class="anr-rate" data-id="${a.id}">${Object.entries(D.ratings).map(([k, v]) => `<label class="anr-stars"><span>${esc(v)}</span><select name="${k}"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option ${mine[k] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}<button class="btn hot small" type="submit">Save my rating</button></form>
    ${Object.keys(a.ratings).length ? `<p class="small muted">Rated by ${Object.entries(a.ratings).map(([n, r]) => `${esc(n)} (${esc(when(r.at))})`).join(', ')}</p>` : ''}
    <h3>Notes (TAM only)</h3><ul class="plain small">${a.notes.map((n) => `<li><b>${esc(n.by)}</b> ${esc(when(n.at))}: ${esc(n.text)}</li>`).join('') || '<li class="muted">No notes yet.</li>'}</ul>
    <form class="anr-note" data-id="${a.id}"><input name="note" maxlength="1000" placeholder="Add a note: saw them at the open mic, great crowd…" aria-label="Add a note"><button class="btn ghost small" type="submit">Add</button></form>
    ${a.decisions.length ? `<h3>History</h3><ul class="plain small">${a.decisions.slice().reverse().map((d) => `<li>${esc(when(d.at))} · ${esc(d.by)} · ${esc(d.action)}${Number.isInteger(d.to) ? ` → ${esc(D.stages[d.to].name)}` : ''}${d.message ? `: “${esc(d.message)}”` : ''}</li>`).join('')}</ul>` : ''}`;
  box.scrollIntoView({ block: 'nearest' });
}

async function act(id, body) {
  const r = await api(`/api/stage/manage/${id}`, { method: 'POST', body });
  await load();
  draw();
  detail(r.artist.id);
}

root.addEventListener('click', async (e) => {
  const t = e.target;
  try {
    if (t.dataset.tab) { tab = t.dataset.tab; open = null; draw(); }
    else if (t.closest('[data-open]')) detail(t.closest('[data-open]').dataset.open);
    else if (t.closest('[data-close]')) { open = null; $('#anr-detail').innerHTML = ''; }
    else if (t.closest('[data-import]')) { const r = await api('/api/stage/import-showcase', { method: 'POST', body: {} }); await load(); draw(); alert(`${r.added} showcase act(s) added.`); }
    else if (t.dataset.played) await act(open, { action: 'played', what: t.dataset.played, on: Boolean(t.dataset.on) });
    else if (t.dataset.act) {
      e.preventDefault();
      const f = t.closest('form');
      const verb = { approve: 'put their page live', sendBack: 'send it back', advance: 'move them up (they’ll get an email)', back: 'move them back', pause: 'pause them', decline: 'mark them “not for now”', restore: 'put them back on the path' }[t.dataset.act];
      if (!confirm(`Sure you want to ${verb}?`)) return;
      await act(f.dataset.id, { action: t.dataset.act, message: f.message.value, email: f.email.checked });
    }
  } catch (err) { alert(err.message); }
});
root.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    if (f.classList.contains('anr-rate')) await act(f.dataset.id, { action: 'rate', ratings: Object.fromEntries(Object.keys(D.ratings).map((k) => [k, Number(f[k].value)])) });
    if (f.classList.contains('anr-note')) await act(f.dataset.id, { action: 'note', note: f.note.value });
  } catch (err) { alert(err.message); }
});

start();
