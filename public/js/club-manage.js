// Staff: /club/manage. The TAM Club at a glance, the newsletter editor
// (segments, A/B subject, preview, test, schedule, results), members, points.

import { $, api, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#cm');
const STATUS = { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending…', sent: 'Sent', stopped: 'Stopped' };
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
let D = null, tab = 'overview', issue = null;

function signIn() {
  $('#team-login').hidden = false;
  $('#team-link').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api('/api/staff/link', { method: 'POST', body: { email: f.email.value, next: f.next.value } }); formMessage(f, `If ${f.email.value} is on TAM's team, a sign-in link is on its way.`, true); } catch (err) { formMessage(f, err.message); }
  });
  $('#team-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/staff/login', { method: 'POST', body: { token: e.target.token.value } }); location.reload(); } catch (err) { formMessage(e.target, err.message); }
  });
}

async function start() {
  try { D = await api('/api/club/manage'); } catch { return signIn(); }
  root.hidden = false;
  $('#cm-who').innerHTML = `${esc(D.me.name)} · <button class="linkish" type="button" id="cm-out">Sign out</button>`;
  $('#cm-out').onclick = async () => { await api('/api/staff/signout', { method: 'POST', body: {} }).catch(() => {}); location.reload(); };
  draw();
}

const bars = (obj, labels = {}) => {
  const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.length ? `<ul class="cm-bars">${rows.map(([k, v]) => `<li><span>${esc(labels[k] || k)}</span><i style="width:${(v / max) * 100}%"></i><b>${v}</b></li>`).join('')}</ul>` : '<p class="muted small">Nothing yet.</p>';
};

function draw() {
  root.innerHTML = `<nav class="cm-tabs">${[['overview', 'Overview'], ['issues', 'Newsletter'], ['members', 'Members'], ['points', 'Points and rewards']].map(([k, v]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</nav><div id="cm-body"></div>
  ${D.mail ? '' : '<p class="err">Email is off on this server (no RESEND_API_KEY): sign-ups are saved but no emails go out.</p>'}`;
  ({ overview, issues, members, points })[tab]();
}

function overview() {
  const s = D.stats;
  $('#cm-body').innerHTML = `<div class="cm-tiles">
    ${[['On the list', s.members], ['Getting emails', s.emailsOn], ['New this week', s.joined7], ['New in 30 days', s.joined30], ['Not confirmed yet', s.pending], ['Points earned this week', s.pointsWeek], ['Halves poured', s.rewards.poured], ['Halves waiting at the bar', s.rewards.live]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
  <div class="cm-cols"><section><h3>What they’re into</h3>${bars(s.byInterest, D.interests)}</section><section><h3>How often</h3>${bars(s.byFrequency, D.frequencies)}</section>
  <section><h3>Levels</h3>${bars(s.byTier)}</section><section><h3>Where they joined</h3>${bars(s.bySource)}</section></div>
  <h3>Latest points</h3><ul class="plain cm-recent">${s.recent.map((x) => `<li><b>${x.pts > 0 ? '+' : ''}${x.pts}</b> ${esc(x.who)} · ${esc(x.label)} <small class="muted">${esc(when(x.at))}</small></li>`).join('') || '<li class="muted">No points yet.</li>'}</ul>
  <p class="small muted">The sign-up is at the foot of every page, on <a href="/club" target="_blank">/club</a> and in the booking form. Issues go out from <b>tickets@tam.tv</b>.</p>`;
}

function issues() {
  $('#cm-body').innerHTML = `<div class="row-btn"><button class="btn hot" type="button" data-new>+ New issue</button><button class="btn ghost" type="button" data-digest>Draft this week’s digest from the calendar</button>
    <a class="btn ghost" href="/newsletter" target="_blank">Public archive ↗</a></div>
  <table class="cm-table"><thead><tr><th>Issue</th><th>Status</th><th>Sent</th><th>Clicked</th><th>A/B</th><th></th></tr></thead><tbody>
  ${D.issues.map((x) => `<tr><td><b>${esc(x.subject)}</b><br><small class="muted">${esc(D.kinds[x.kind] || x.kind)}</small></td><td>${STATUS[x.status] || x.status}${x.sendAt && x.status === 'scheduled' ? `<br><small>${esc(when(x.sendAt))}</small>` : ''}${x.sentAt ? `<br><small>${esc(when(x.sentAt))}</small>` : ''}</td>
    <td>${x.stats.sent || 0}${x.stats.failed ? ` <small class="err">${x.stats.failed} failed</small>` : ''}</td><td>${x.stats.clickers || 0} <small>${pct(x.stats.clickers, x.stats.sent)}</small></td>
    <td>${x.subjectB ? `A ${pct(x.stats.a.clickers, x.stats.a.sent)} · B ${pct(x.stats.b.clickers, x.stats.b.sent)}` : '–'}</td><td><button class="btn ghost small" type="button" data-open="${x.id}">${['draft', 'scheduled'].includes(x.status) ? 'Edit' : 'Results'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No issues yet: start with this week’s digest.</td></tr>'}</tbody></table>`;
}

async function openIssue(id) {
  issue = id ? (await api(`/api/club/issues/${id}`)).issue : { id: '', subject: '', subjectB: '', preheader: '', title: '', body: 'Hey {{first_name|there}},\n\n\n\n{{whats_on}}\n\n{{card}}', kind: 'weekly', segment: { interests: [], engagement: 'all' }, archive: true, status: 'draft', stats: {}, audience: 0 };
  editor();
}

function editor() {
  const x = issue, edit = ['draft', 'scheduled'].includes(x.status);
  const dis = edit ? '' : 'disabled';
  $('#cm-body').innerHTML = `<p><button class="linkish" type="button" data-back>← All issues</button></p>
  <div class="cm-editor"><form id="cm-issue">
    <div class="fields"><label class="field"><span>Kind</span><select name="kind" ${dis}>${Object.entries(D.kinds).map(([k, v]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    <label class="field"><span>Engagement</span><select name="engagement" ${dis}>${Object.entries(D.segments).map(([k, v]) => `<option value="${k}" ${x.segment.engagement === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
    <fieldset class="cl-chips"><legend>Only people into… <small>(none ticked: everyone; people who haven’t picked get everything)</small></legend>${Object.entries(D.interests).map(([k, v]) => `<label class="cl-chip"><input type="checkbox" name="interests" value="${k}" ${x.segment.interests.includes(k) ? 'checked' : ''} ${dis}><span>${esc(v)}</span></label>`).join('')}</fieldset>
    <p class="cm-aud">Goes to <b id="cm-count">${x.audience}</b> people.</p>
    <label class="field"><span>Subject</span><input name="subject" value="${esc(x.subject)}" maxlength="150" required ${dis}></label>
    <label class="field"><span>Subject B <small>(optional: half get A, half get B; compare clicks)</small></span><input name="subjectB" value="${esc(x.subjectB)}" maxlength="150" ${dis}></label>
    <label class="field"><span>Preview text <small>(shown after the subject in the inbox)</small></span><input name="preheader" value="${esc(x.preheader)}" maxlength="200" ${dis}></label>
    <label class="field"><span>Heading <small>(defaults to the subject)</small></span><input name="title" value="${esc(x.title)}" maxlength="150" ${dis}></label>
    <label class="field"><span>Body</span><textarea name="body" rows="16" ${dis}>${esc(x.body)}</textarea></label>
    <p class="small muted">Markdown: <code>## heading</code>, <code>**bold**</code>, <code>[link](https://…)</code>, <code>![photo](/img/…)</code> (photos on tam.tv show everywhere), <code>- list</code>. Personal: <code>{{first_name|there}}</code>, <code>{{points}}</code>, <code>{{to_half}}</code>. On a line of their own: <code>{{whats_on}}</code> (the next three weeks, picked for each reader’s interests) and <code>{{card}}</code> (their points).</p>
    <label class="check"><input type="checkbox" name="archive" ${x.archive !== false ? 'checked' : ''} ${dis}> Show it in the public archive once it’s sent</label>
    ${edit ? `<div class="row-btn"><button class="btn hot" type="submit">Save draft</button><button class="btn ghost" type="button" data-test>Send me a test</button></div>
    <div class="cm-send"><label class="field"><span>Send later</span><input type="datetime-local" name="at"></label><button class="btn ghost" type="button" data-schedule>Schedule</button><button class="btn hot" type="button" data-send>Send now</button>
    ${x.status === 'scheduled' ? `<button class="btn ghost" type="button" data-cancel>Unschedule (${esc(when(x.sendAt))})</button>` : ''}${x.id && x.status === 'draft' ? '<button class="linkish" type="button" data-delete>Delete draft</button>' : ''}</div>`
    : `<div class="cm-results"><h3>Results</h3><p>Sent to <b>${x.stats.sent}</b> · clicked by <b>${x.stats.clickers}</b> (${pct(x.stats.clickers, x.stats.sent)}) · unsubscribed after it: <b>${x.stats.unsubscribed || 0}</b>${x.stats.failed ? ` · <span class="err">${x.stats.failed} failed</span>` : ''}</p>
      ${x.subjectB ? `<p>A “${esc(x.subject)}”: ${x.stats.a.clickers}/${x.stats.a.sent} clicked (${pct(x.stats.a.clickers, x.stats.a.sent)})<br>B “${esc(x.subjectB)}”: ${x.stats.b.clickers}/${x.stats.b.sent} clicked (${pct(x.stats.b.clickers, x.stats.b.sent)})</p>` : ''}
      ${(x.topLinks || []).length ? `<h4>Top links</h4><ul class="plain small">${x.topLinks.map(([u, n]) => `<li><b>${n}</b> ${esc(u)}</li>`).join('')}</ul>` : ''}
      <div class="row-btn">${x.status === 'sending' ? '<button class="btn ghost" type="button" data-cancel>Stop sending</button>' : ''}<button class="btn ghost" type="button" data-dup>Duplicate as a new draft</button>${x.status === 'sent' && x.archive !== false ? `<a class="btn ghost" href="/newsletter/${esc(x.slug)}" target="_blank">On the web ↗</a>` : ''}</div></div>`}
    <p class="err" role="status" aria-live="polite"></p></form>
    <div class="cm-preview">${x.id ? `<div class="row-btn small">Preview ${x.subjectB ? '<button class="linkish" type="button" data-v="a">A</button> · <button class="linkish" type="button" data-v="b">B</button>' : ''}</div><p class="small" id="cm-subj"></p><iframe id="cm-frame" title="Email preview" src="/api/club/issues/${x.id}/preview" sandbox="allow-same-origin"></iframe>` : '<p class="muted">Save the draft to see the preview.</p>'}</div></div>`;
  const fr = $('#cm-frame');
  if (fr) fr.onload = () => { try { $('#cm-subj').textContent = `Subject: ${fr.contentDocument.body.dataset.subject || ''}`; } catch { /* fine */ } };
}

const formBody = () => {
  const f = new FormData($('#cm-issue'));
  return { id: issue.id || undefined, kind: f.get('kind'), subject: f.get('subject'), subjectB: f.get('subjectB'), preheader: f.get('preheader'), title: f.get('title'), body: f.get('body'),
    archive: f.get('archive') === 'on', segment: { interests: f.getAll('interests'), engagement: f.get('engagement') } };
};
const msg = (t, ok) => { const p = $('#cm-issue .err'); p.textContent = t; p.classList.toggle('ok', Boolean(ok)); };
async function saveDraft() { issue = (await api('/api/club/issues', { method: 'POST', body: formBody() })).issue; return issue; }

async function refreshCount() {
  try { $('#cm-count').textContent = (await api(`/api/club/issues/${issue.id || 'new'}/count`, { method: 'POST', body: formBody() })).to; } catch { /* fine */ }
}

let memberQ = '';
async function members() {
  const r = await api(`/api/club/members?q=${encodeURIComponent(memberQ)}`);
  $('#cm-body').innerHTML = `<form id="cm-search" class="cm-search"><input name="q" value="${esc(memberQ)}" placeholder="Search name, email or card code" aria-label="Search members"><button class="btn ghost" type="submit">Search</button><a class="btn ghost" href="/api/club/members.csv">Download CSV</a></form>
  <table class="cm-table"><thead><tr><th>Member</th><th>Status</th><th>Emails</th><th>Points</th><th>Joined</th><th></th></tr></thead><tbody>
  ${r.members.map((m) => `<tr><td><b>${esc(m.name || '–')}</b><br><small>${esc(m.email)}</small></td><td>${m.status === 'active' ? esc(m.tier) : 'Not confirmed'}</td><td>${m.emails ? esc(D.frequencies[m.frequency] || m.frequency) : 'Off'}<br><small class="muted">${esc(m.interests.map((k) => D.interests[k]).join(', '))}</small></td>
    <td><b>${m.balance}</b></td><td><small>${esc(when(m.joined))}<br>${esc(m.source)}</small></td><td><a class="btn ghost small" href="/club/card/${esc(m.card)}" target="_blank">Card</a> <button class="btn ghost small" type="button" data-gift="${m.id}">Gift points</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nobody yet.</td></tr>'}</tbody></table>
  <p class="small muted">Emails are private: don’t share this list outside TAM.</p>`;
}

function points() {
  const s = D.stats;
  $('#cm-body').innerHTML = `<div class="cm-tiles">${[['Halves claimed', s.rewards.issued], ['Poured', s.rewards.poured], ['Waiting at the bar', s.rewards.live], ['Expired, points back', s.rewards.expired]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
  <h3>Ways to earn <small class="muted">(last 30 days)</small></h3><table class="cm-table"><thead><tr><th>What</th><th>Points</th><th>Times</th></tr></thead><tbody>
  ${Object.entries(D.rules).map(([k, r]) => `<tr><td>${esc(r.label)}${r.hint ? ` <small class="muted">${esc(r.hint)}</small>` : ''}</td><td>${r.unit ? `${r.pts} per £1` : `+${r.pts}`}</td><td>${s.byRule[k] || 0}</td></tr>`).join('')}</tbody></table>
  <h3>At the bar</h3><ol class="small"><li>The member opens their card on tam.tv/club (or scans their QR with the bar phone).</li><li>Staff signed in to the door page see the buttons: <b>They’re here tonight</b> (+15), <b>Bar spend</b> (a point per £1, up to 30 a day), and <b>Poured it</b> for a claimed half.</li>
  <li>Check the code on their phone matches the one on the staff screen. One half a week; a claimed half is good for 30 days.</li></ol>
  <p class="small muted">Levels: ${D.tiers.map((t) => `${esc(t.name)} ${t.at}+`).join(' · ')}. ${D.half} points = half a pint.</p>`;
}

root.addEventListener('click', async (e) => {
  const t = e.target;
  try {
    if (t.dataset.tab) { tab = t.dataset.tab; issue = null; draw(); }
    else if (t.closest('[data-new]')) await openIssue('');
    else if (t.closest('[data-digest]')) { issue = (await api('/api/club/issues/digest', { method: 'POST', body: {} })).issue; editor(); }
    else if (t.dataset.open) await openIssue(t.dataset.open);
    else if (t.closest('[data-back]')) { D = await api('/api/club/manage'); tab = 'issues'; draw(); }
    else if (t.closest('[data-test]')) { await saveDraft(); const r = await api(`/api/club/issues/${issue.id}/test`, { method: 'POST', body: {} }); editor(); msg(`Test sent to ${r.to}.`, true); }
    else if (t.closest('[data-schedule]')) {
      const at = $('#cm-issue').at.value;
      if (!at) return msg('Pick a date and time first.');
      await saveDraft();
      await api(`/api/club/issues/${issue.id}/send`, { method: 'POST', body: { at: new Date(at).toISOString() } });
      await openIssue(issue.id); msg('Scheduled.', true);
    } else if (t.closest('[data-send]')) {
      await saveDraft();
      if (!confirm(`Send “${issue.subject}” to ${issue.audience} people now?`)) return;
      const r = await api(`/api/club/issues/${issue.id}/send`, { method: 'POST', body: {} });
      await openIssue(issue.id); msg(`Sending to ${r.to} people. It takes a few minutes; refresh for results.`, true);
    } else if (t.closest('[data-cancel]')) { await api(`/api/club/issues/${issue.id}/cancel`, { method: 'POST', body: {} }); await openIssue(issue.id); }
    else if (t.closest('[data-dup]')) { issue = (await api(`/api/club/issues/${issue.id}/duplicate`, { method: 'POST', body: {} })).issue; editor(); }
    else if (t.closest('[data-delete]') && confirm('Delete this draft?')) { await api(`/api/club/issues/${issue.id}/delete`, { method: 'POST', body: {} }); D = await api('/api/club/manage'); tab = 'issues'; draw(); }
    else if (t.dataset.v) { $('#cm-frame').src = `/api/club/issues/${issue.id}/preview?v=${t.dataset.v}`; }
    else if (t.dataset.gift) {
      const n = prompt('How many points? (1–100)');
      if (!n) return;
      const note = prompt('What for? (they’ll see this)') || '';
      await api(`/api/club/members/${t.dataset.gift}/gift`, { method: 'POST', body: { points: Number(n), note } });
      members();
    }
  } catch (err) { if ($('#cm-issue')) msg(err.message); else alert(err.message); }
});
root.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'cm-search') { memberQ = e.target.q.value; return members(); }
  if (e.target.id === 'cm-issue') { try { await saveDraft(); editor(); msg('Saved.', true); } catch (err) { msg(err.message); } }
});
root.addEventListener('change', (e) => { if (e.target.closest('#cm-issue') && ['kind', 'engagement', 'interests'].includes(e.target.name)) refreshCount(); });

start();
