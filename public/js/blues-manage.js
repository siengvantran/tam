// Running the Great British Blues Jam: each Saturday's host and house band,
// the jam list (order, on stage, played), and approving wall posts.

import { $, $$, api } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#bj-manage');
let data = null, pick = null;

const bandRow = (b = {}) => `<div class="sh-row" data-row="band"><input placeholder="Name" value="${esc(b.name)}" data-k="name" maxlength="60" aria-label="Name"><input placeholder="Instrument" value="${esc(b.instrument)}" data-k="instrument" maxlength="40" aria-label="Instrument"><button class="sh-x" type="button" data-del aria-label="Remove">×</button></div>`;

function render() {
  const n = data.nights.find((x) => x.date === pick) || data.nights[0];
  pick = n.date;
  const st = n.settings;
  const pending = data.wall.filter((w) => w.status === 'pending');
  root.innerHTML = `<div class="admin-tabs">${data.nights.map((x) => `<button class="chip" type="button" data-pick="${x.date}" aria-pressed="${x.date === pick}">${esc(x.when.replace(/ \d{4}$/, ''))}${x.signups.length ? ` (${x.signups.filter((s) => s.status !== 'removed').length})` : ''}</button>`).join('')}</div>
  <div class="bj-m-grid">
    <form class="sh-card" id="bj-night"><h3>${esc(n.when)}</h3>
      <label class="field"><span>Host</span><input name="host" value="${esc(st.host)}" maxlength="80" placeholder="Who’s hosting"></label>
      <div class="bj-k">House band</div><div id="band">${st.band.map(bandRow).join('')}</div><button class="btn ghost small" type="button" data-add-band>+ Add a player</button>
      <div class="fields"><label class="field"><span>Jam list size</span><input name="cap" inputmode="numeric" value="${esc(st.cap)}"></label>
        <label class="field sh-check" style="align-self:end"><input type="checkbox" name="open" ${st.open ? 'checked' : ''}> Sign-ups open</label></div>
      <label class="field"><span>Note on the page (optional)</span><input name="note" value="${esc(st.note)}" maxlength="200" placeholder="e.g. Drum kit and amps provided. Bring your own guitar."></label>
      <button class="btn hot" type="submit">Save</button> <span class="small muted" id="bj-saved"></span></form>
    <div class="sh-card"><h3>Jam list <span class="small muted">${n.signups.filter((s) => s.status === 'waiting').length} waiting</span></h3>
      ${n.onStage ? `<p class="bj-onstage">On stage: <b>${esc(n.onStage.name)}</b> · ${esc(n.onStage.instrument)} <button class="btn ghost small" type="button" data-act="played" data-id="${n.onStage.id}">Done</button></p>` : ''}
      ${n.signups.length ? `<ol class="bj-m-list">${n.signups.map((s) => `<li class="st-${s.status}${n.onStage && n.onStage.id === s.id ? ' on' : ''}"><div><b>${esc(s.name)}</b> <span class="muted">${esc(s.instrument)}</span>${s.email ? ` <a class="small" href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}${s.status === 'played' ? ' <span class="tag small">played</span>' : ''}</div>
        <div class="bj-m-btns">${s.status === 'waiting' ? `<button class="btn ghost small" type="button" data-act="stage" data-id="${s.id}">On stage</button><button class="sh-x" type="button" data-act="up" data-id="${s.id}" aria-label="Move up">↑</button><button class="sh-x" type="button" data-act="down" data-id="${s.id}" aria-label="Move down">↓</button><button class="sh-x" type="button" data-act="remove" data-id="${s.id}" aria-label="Remove">×</button>` : `<button class="btn ghost small" type="button" data-act="restore" data-id="${s.id}">Back on the list</button>`}</div></li>`).join('')}</ol>` : '<p class="muted">Nobody has signed up yet.</p>'}
    </div>
  </div>
  <div class="sh-card"><h3>The Great British Blues Wall ${pending.length ? `<span class="tag small">${pending.length} to check</span>` : ''}</h3>
    ${data.moderated ? '<p class="small muted">Posts go up once someone here shows them.</p>' : ''}
    ${data.wall.length ? `<ul class="plain bj-m-wall">${data.wall.map((w) => `<li class="st-${w.status}"><div><b>${esc(w.name)}</b>: ${esc(w.message)} <span class="small muted">${esc(w.at.slice(0, 16).replace('T', ' '))}</span></div>
      <div class="bj-m-btns">${w.status === 'pending' ? `<button class="btn hot small" type="button" data-wall="shown" data-id="${w.id}">Show</button>` : ''}<button class="btn ghost small" type="button" data-wall="hidden" data-id="${w.id}">Hide</button></div></li>`).join('')}</ul>` : '<p class="muted">No posts yet.</p>'}
  </div>`;
}

async function load() { data = await api('/api/blues/manage'); render(); }

if (root) {
  load().then(() => { root.hidden = false; }).catch(() => { $('#team-login').hidden = false; });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.pick) { pick = b.dataset.pick; return render(); }
      if (b.hasAttribute('data-add-band')) return $('#band').insertAdjacentHTML('beforeend', bandRow());
      if (b.hasAttribute('data-del')) return b.closest('.sh-row').remove();
      if (b.dataset.act) {
        if (b.dataset.act === 'remove' && !confirm('Take them off the list?')) return;
        await api(`/api/blues/signup/${b.dataset.id}/staff`, { method: 'POST', body: { action: b.dataset.act } });
        return load();
      }
      if (b.dataset.wall) { await api(`/api/blues/wall/${b.dataset.id}`, { method: 'POST', body: { status: b.dataset.wall } }); return load(); }
    } catch (err) { alert(err.message); }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'bj-night') return;
    e.preventDefault();
    const f = e.target;
    const band = $$('[data-row="band"]', f).map((r) => ({ name: r.querySelector('[data-k="name"]').value, instrument: r.querySelector('[data-k="instrument"]').value }));
    try {
      await api(`/api/blues/night/${pick}`, { method: 'POST', body: { host: f.host.value, band, cap: f.cap.value, open: f.open.checked, note: f.note.value } });
      await load();
      $('#bj-saved').textContent = 'Saved. It’s on the page and the screen.';
    } catch (err) { alert(err.message); }
  });
  // keep the list fresh while the jam is on
  setInterval(() => { if (!root.hidden && !root.contains(document.activeElement) ) load().catch(() => {}); }, 20000);
}
