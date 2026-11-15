// Staff: /jom/manage. Check parents' claims, approve their changes before
// they go on an act's page, see pledges for The Best Christmas Ever, and add
// acts and sessions.

import { $, api, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#jmm');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
let D = null, tab = 'claims';

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
async function load() { D = await api('/api/jom/manage'); }
async function start() {
  try { await load(); } catch { return signIn(); }
  root.hidden = false;
  $('#jmm-who').innerHTML = `${esc(D.me.name)} · <button class="linkish" type="button" id="jmm-out">Sign out</button>`;
  $('#jmm-out').onclick = async () => { await api('/api/staff/signout', { method: 'POST', body: {} }).catch(() => {}); location.reload(); };
  if (!D.claims.length && D.changes.length) tab = 'changes';
  draw();
}

const diff = (label, was, now) => (String(was || '') === String(now || '') ? '' : `<div class="jmm-diff"><b>${label}</b><del>${esc(was || '(empty)')}</del><ins>${esc(now || '(empty)')}</ins></div>`);

function draw() {
  root.innerHTML = `<nav class="cm-tabs">${[['claims', `Claims to check (${D.claims.length})`], ['changes', `Changes to approve (${D.changes.length})`], ['xmas', `Christmas applications (${D.applications.length})`], ['acts', `Acts and pledges (${D.acts.length})`]].map(([k, v]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</nav><div id="jmm-body"></div>`;
  const b = $('#jmm-body');
  if (tab === 'claims') {
    b.innerHTML = D.claims.length ? D.claims.map((c) => `<div class="formbox jmm-item" data-claim="${c.id}"><h3>${esc(c.actName)}</h3>
      <p><b>${esc(c.name)}</b> · ${esc(D.relations[c.relation] || c.relation)} · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · ${esc(when(c.at))}</p>${c.note ? `<p class="small">“${esc(c.note)}”</p>` : ''}
      <p class="small muted">Check before approving: does JOM know them, or does the name match the act’s booking? If unsure, email them first.</p>
      <label class="field"><span>Note if you reject (optional; emailed only if you tick below)</span><input name="message" maxlength="600"></label>
      <div class="row-btn"><button class="btn hot small" data-do="approve">Approve: email them a sign-in link</button><button class="btn ghost small" data-do="reject">Reject</button><label class="check small"><input type="checkbox" name="email"> Email them the note</label></div></div>`).join('')
      : '<p class="muted">No claims waiting.</p>';
  } else if (tab === 'changes') {
    b.innerHTML = D.changes.length ? D.changes.map((p) => { const c = p.current || {}; const n = p.changes; return `<div class="formbox jmm-item" data-change="${p.id}"><h3>${esc(c.name)} <a class="small" href="/jom/${esc(p.act)}" target="_blank">page ↗</a></h3>
      <p class="small">From ${esc(p.by)} · ${esc(when(p.at))}</p>
      ${diff('Name', c.name, n.name)}${diff('Bio', c.bio, n.bio)}${diff('Links', (c.links || []).join('\n'), n.links.join('\n'))}
      ${n.posts && JSON.stringify((c.posts || []).map((x) => [x.kind, x.src || x.videoId || x.postId || x.href, x.caption])) !== JSON.stringify(n.posts.map((x) => [x.kind, x.src || x.videoId || x.postId || x.href, x.caption])) ? `<div class="jmm-diff"><b>Posts (${n.posts.length}): check every one</b><div class="jmm-posts">${n.posts.map((x) => `<figure>${x.kind === 'image' ? `<img src="${esc(x.src)}" alt="" width="160">` : x.kind === 'video' ? `<video src="${esc(x.src)}" controls playsinline preload="metadata" width="200"></video>` : `<a href="${esc(x.kind === 'youtube' ? `https://youtu.be/${x.videoId}` : x.kind === 'instagram' ? `https://www.instagram.com/${x.postType || 'p'}/${x.postId}/` : x.kind === 'tiktok' ? `https://www.tiktok.com/embed/v2/${x.videoId}` : x.href)}" target="_blank" rel="noopener">${esc({ youtube: 'YouTube video', instagram: 'Instagram post', tiktok: 'TikTok', facebook: 'Facebook post' }[x.kind])} ↗</a>`}${x.caption ? `<figcaption>${esc(x.caption)}</figcaption>` : ''}</figure>`).join('')}</div></div>` : ''}
      ${String(c.photos) !== String(n.photos) ? `<div class="jmm-diff"><b>Photos</b><div class="jm-thumbs">${n.photos.map((u) => `<img src="${esc(u)}" alt="" width="90" height="110">`).join('') || '<small>none</small>'}</div></div>` : ''}
      <p class="small muted">Check the photos and words are right for a young person’s public page: no schools, ages, addresses or contact details.</p>
      <label class="field"><span>Note if you reject (emailed to them)</span><input name="message" maxlength="600"></label>
      <div class="row-btn"><button class="btn hot small" data-do="approve">Approve: put it on the page</button><button class="btn ghost small" data-do="reject">Reject</button></div></div>`; }).join('')
      : '<p class="muted">No changes waiting.</p>';
  } else if (tab === 'xmas') {
    const ST = { new: 'New', shortlist: 'Shortlisted', booked: 'Booked', 'not-this-time': 'Not this time' };
    b.innerHTML = D.applications.length ? `<p class="small muted">Applications to play The Best Christmas Ever (JOM date to be announced). Pledges are the fans signed up on the act’s page.</p>
    <table class="cm-table"><thead><tr><th>Act</th><th>Pledged</th><th>Parent or guardian</th><th>Status</th></tr></thead><tbody>${D.applications.map((x) => `<tr><td><b>${esc(x.act)}</b>${x.slug ? ` <a class="small" href="/jom/${esc(x.slug)}" target="_blank">page ↗</a>` : ''}<br><small>${esc(D.groups[x.group] || x.group)} · ${x.members} in the act${x.plays ? ` · ${esc(x.plays)}` : ''}</small>
      ${x.played ? `<br><small class="muted">Played: ${esc(x.played)}</small>` : ''}${x.links.length ? `<br><small>${x.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https:\/\/(www\.)?/, '').slice(0, 40))}</a>`).join(' · ')}</small>` : ''}${x.notes ? `<br><small>“${esc(x.notes)}”</small>` : ''}</td>
      <td>${x.pledges}</td><td><small>${esc(x.name)} (${esc(D.relations[x.relation] || x.relation)})<br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a><br>${esc(when(x.at))}</small></td>
      <td><select data-app="${x.id}">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No applications yet. The form is on the JOM hub, under the acts.</p>';
  } else {
    b.innerHTML = `<p>${D.pledges} people pledged in all. <a class="btn ghost small" href="/api/jom/manage/pledges.csv">Download pledges (CSV)</a> <button class="btn ghost small" type="button" data-reset-all>Reset all pledges</button> <a class="btn ghost small" href="/jom" target="_blank">The JOM hub ↗</a></p>
    <table class="cm-table"><thead><tr><th>Act</th><th>Pledged</th><th>Parents</th><th></th></tr></thead><tbody>${D.acts.map((a) => `<tr><td><b>${esc(a.name)}</b>${a.hidden ? ' <small class="err">hidden</small>' : ''}<br><small class="muted">${esc(a.groupName)} · ${a.sessions.length} session(s)</small></td><td>${a.pledges}${a.pledges ? ` <button class="linkish small" data-reset="${esc(a.slug)}">Reset</button>` : ''}</td>
      <td><small>${a.parents.map(esc).join('<br>') || '–'}</small>${a.stage ? `<br><small>TAM Stage: <a href="/stage/manage" target="_blank">${esc(a.stage.planet)} · ${esc(a.stage.status)}</a></small>` : ''}</td><td class="small"><a href="/jom/${esc(a.slug)}" target="_blank">Page</a> · <button class="linkish" data-act="${esc(a.slug)}" data-a="${a.hidden ? 'show' : 'hide'}">${a.hidden ? 'Show' : 'Hide'}</button>${a.parents.length ? ` · <button class="linkish" data-act="${esc(a.slug)}" data-a="unclaim">Remove parents</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <form class="formbox" id="jmm-add"><h3>Add an act</h3><div class="fields"><label class="field"><span>Name</span><input name="name" maxlength="60" required></label>
      <label class="field"><span>Group</span><select name="group">${Object.entries(D.groups).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label class="field"><span>The night they played (its address, e.g. jom-sessions-2026-2026-11-15)</span><input name="session" maxlength="120"></label></div><button class="btn hot small" type="submit">Add</button><p class="err" role="status"></p></form>`;
  }
}

root.addEventListener('click', async (e) => {
  const t = e.target;
  try {
    if (t.dataset.tab) { tab = t.dataset.tab; draw(); return; }
    if (t.dataset.do) {
      const box = t.closest('.jmm-item');
      const msg = box.querySelector('[name="message"]').value, mail = box.querySelector('[name="email"]');
      if (box.dataset.claim) await api(`/api/jom/manage/claims/${box.dataset.claim}`, { method: 'POST', body: { action: t.dataset.do, message: msg, email: mail ? mail.checked : false } });
      else await api(`/api/jom/manage/changes/${box.dataset.change}`, { method: 'POST', body: { action: t.dataset.do, message: msg } });
      await load(); draw();
    }
    if (t.dataset.reset || t.closest('[data-reset-all]')) {
      const one = t.dataset.reset;
      if (!confirm(one ? 'Clear this act’s pledges? This can’t be undone.' : 'Clear every act’s pledges? This can’t be undone.')) return;
      const r = await api('/api/jom/manage/pledges/reset', { method: 'POST', body: one ? { slug: one } : { all: true } });
      await load(); draw(); alert(`${r.removed} pledge(s) cleared.`);
      return;
    }
    if (t.dataset.a) {
      if (t.dataset.a === 'unclaim' && !confirm('Remove the parents from this act? They won’t be able to update it.')) return;
      await api('/api/jom/manage/acts', { method: 'POST', body: { slug: t.dataset.act, action: t.dataset.a } }); await load(); draw();
    }
  } catch (err) { alert(err.message); }
});
root.addEventListener('change', async (e) => {
  if (!e.target.dataset.app) return;
  try { await api(`/api/jom/manage/applications/${e.target.dataset.app}`, { method: 'POST', body: { status: e.target.value } }); await load(); }
  catch (err) { alert(err.message); }
});
root.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try { await api('/api/jom/manage/acts', { method: 'POST', body: { name: f.name.value, group: f.group.value, session: f.session.value.trim() } }); await load(); draw(); }
  catch (err) { formMessage(f, err.message); }
});

start();
