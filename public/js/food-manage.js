// Staff: /food/manage. Approve listings before they go live, check claims and
// profile changes, contact traders (email or Instagram DM) about partnering for
// TAM's festivals, and see pre-orders.

import { $, $$, api, formMessage, copyText, pounds } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#fdm');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
let D = null, tab = 'listings', filter = 'all', open = null;

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
const load = async () => { D = await api('/api/food/manage'); };
async function start() {
  try { await load(); } catch { return signIn(); }
  root.hidden = false;
  $('#fdm-who').innerHTML = `${esc(D.me.name)} · <button class="linkish" type="button" id="fdm-out">Sign out</button>`;
  $('#fdm-out').onclick = async () => { await api('/api/staff/signout', { method: 'POST', body: {} }).catch(() => {}); location.reload(); };
  draw();
}
const act = async (url, body) => { await api(url, { method: 'POST', body }); await load(); draw(); };
const diff = (label, was, now) => (String(was ?? '') === String(now ?? '') ? '' : `<div class="jmm-diff"><b>${label}</b><del>${esc(was || '(empty)')}</del><ins>${esc(now || '(empty)')}</ins></div>`);
const menuText = (m) => (m || []).map((x) => `${x.section ? `[${x.section}] ` : ''}${x.name}${x.price !== null && x.price !== undefined ? ` ${pounds(x.price)}` : ''}${x.dietary && x.dietary.length ? ` (${x.dietary.join(', ')})` : ''}`).join('\n');

function draw() {
  const count = (s) => D.vendors.filter((v) => v.status === s).length;
  const partners = D.vendors.filter((v) => v.partner === 'partner').length;
  root.innerHTML = `<p class="small muted">${D.vendors.length} traders from ${esc(D.market.name)} · ${count('live')} live · ${count('draft')} waiting for approval · ${partners} taking part in pre-orders. Nothing shows on <a href="/food" target="_blank">tam.tv/food</a> until you approve it.</p>
    <nav class="cm-tabs">${[['listings', `Listings (${D.vendors.length})`], ['claims', `Claims (${D.claims.length})`], ['changes', `Profile changes (${D.changes.length})`], ['outreach', 'Partner outreach'], ['orders', `Pre-orders (${D.orders.filter((o) => o.status !== 'cancelled').length})`]].map(([k, v]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</nav><div id="fdm-body"></div>`;
  $$('[data-tab]', root).forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
  const b = $('#fdm-body');
  ({ listings, claims, changes, outreach, orders })[tab](b);
}

function listings(b) {
  const vs = D.vendors.filter((v) => filter === 'all' || v.status === filter);
  b.innerHTML = `<div class="row-btn">${[['all', 'All'], ['draft', 'Waiting for approval'], ['live', 'Live'], ['hidden', 'Hidden']].map(([k, l]) => `<button type="button" class="chip ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
    <button type="button" class="btn ghost small" id="fdm-new">Add a trader</button></div>
    <table class="fd-orders fdm-list"><thead><tr><th></th><th>Trader</th><th>Status</th><th>Menu</th><th>Contact</th><th>Partner</th><th></th></tr></thead><tbody>
    ${vs.map((v) => `<tr data-slug="${esc(v.slug)}"><td>${v.photos[0] ? `<img src="${esc(v.photos[0])}" alt="" width="64" height="48">` : ''}</td>
      <td><b>${esc(v.name)}</b><br><small>${esc(v.tagline)}</small>${v.traders.length ? `<br><small>Managed by ${v.traders.map(esc).join(', ')}</small>` : ''}</td>
      <td>${esc(D.statuses[v.status])}${v.approvedBy && v.status === 'live' ? `<br><small>by ${esc(v.approvedBy)}</small>` : ''}</td>
      <td>${v.menu.length} dishes${v.menu.length ? `, ${v.menu.filter((m) => m.price !== null).length} priced` : ''}</td>
      <td>${v.instagram ? `<a href="https://www.instagram.com/${esc(v.instagram)}/" target="_blank" rel="noopener">@${esc(v.instagram)}</a>` : '<small class="muted">no Instagram</small>'}<br>${v.email ? esc(v.email) : '<small class="muted">no email</small>'}</td>
      <td>${esc(D.partner[v.partner])}${v.preorder.enabled ? '<br><small>pre-orders on</small>' : ''}${v.orders ? `<br><small>${v.orders} upcoming orders</small>` : ''}</td>
      <td class="row-btn">${v.status !== 'live' ? '<button class="btn hot small" data-do="approve">Approve: go live</button>' : '<button class="btn ghost small" data-do="hide">Hide</button>'}
        <a class="btn ghost small" href="/food/${esc(v.slug)}" target="_blank">${v.status === 'live' ? 'View' : 'Preview'}</a><button class="btn ghost small" data-open>Details</button></td></tr>
      ${open === v.slug ? `<tr class="fdm-detail"><td colspan="7">${detail(v)}</td></tr>` : ''}`).join('')}</tbody></table>`;
  $$('[data-filter]', b).forEach((x) => x.onclick = () => { filter = x.dataset.filter; draw(); });
  $('#fdm-new').onclick = async () => { const name = prompt('Trader name'); if (!name) return; const tagline = prompt('One line about them (e.g. “Neapolitan pizza”)') || ''; try { const r = await api('/api/food/manage/vendors', { method: 'POST', body: { name, tagline } }); open = r.slug; filter = 'all'; await load(); draw(); } catch (err) { alert(err.message); } };
  $$('tr[data-slug]', b).forEach((tr) => {
    const slug = tr.dataset.slug;
    $$('[data-do]', tr).forEach((x) => x.onclick = () => act(`/api/food/manage/vendors/${slug}`, { action: x.dataset.do }).catch((err) => alert(err.message)));
    $('[data-open]', tr).onclick = () => { open = open === slug ? null : slug; draw(); };
  });
  const f = $('#fdm-contact');
  if (f) {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await act(`/api/food/manage/vendors/${open}`, { action: 'contact', email: f.email.value, phone: f.phone.value, notes: f.notes.value, partner: f.partner.value }); } catch (err) { formMessage(f, err.message); }
    });
    const ef = $('#fdm-edit');
    ef.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = D.vendors.find((x) => x.slug === open);
      try {
        const menu = ef.menu.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => { const m = /^(?:\[([^\]]*)\]\s*)?(.*?)(?:\s+£(\d+(?:\.\d{1,2})?))?(?:\s+\(([^)]*)\))?$/.exec(l); const was = v.menu[i] || {}; return { id: was.name === m[2] ? was.id : '', section: m[1] || '', name: m[2], price: m[3] || '', description: was.name === m[2] ? was.description : '', dietary: (m[4] || '').split(',').map((s) => s.trim()).filter(Boolean) }; });
        await act(`/api/food/manage/vendors/${open}`, { action: 'edit', profile: { name: ef.name.value, tagline: ef.tagline.value, category: ef.category.value, description: ef.description.value, instagram: ef.instagram.value, website: ef.website.value, dietary: $$('input[name=diet]:checked', ef).map((x) => x.value), photos: v.photos, menu } });
      } catch (err) { formMessage(ef, err.message); }
    });
    for (const ch of ['email', 'instagram']) { const btn = $(`[data-reach="${ch}"]`); if (btn) btn.onclick = () => { tab = 'outreach'; outreachFor = open; draw(); }; }
  }
}
function detail(v) {
  return `<div class="fdm-detail-grid"><form class="formbox" id="fdm-contact"><h3>Private: how TAM reaches them</h3>
      <label class="field"><span>Email</span><input name="email" type="email" value="${esc(v.email)}"></label><label class="field"><span>Phone</span><input name="phone" value="${esc(v.phone)}"></label>
      <label class="field"><span>Partnership</span><select name="partner">${Object.entries(D.partner).map(([k, l]) => `<option value="${k}" ${v.partner === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(v.notes)}</textarea></label>
      <div class="row-btn"><button class="btn hot small" type="submit">Save</button><button class="btn ghost small" type="button" data-reach="email">Contact them</button></div><p class="err" role="status" aria-live="polite"></p>
      ${v.outreach.length ? `<p class="small">${v.outreach.map((o) => `${esc(when(o.at))}: ${esc(o.channel)} to ${esc(o.to)} by ${esc(o.by)}`).join('<br>')}</p>` : ''}
      ${v.source ? `<p class="small muted">Imported from <a href="${esc(v.source)}" target="_blank" rel="noopener">their MM page</a>${v.menuLinks.length ? ` · ${v.menuLinks.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">menu ${i + 1}</a>`).join(' ')}` : ''}</p>` : ''}</form>
    <form class="formbox" id="fdm-edit"><h3>Listing (your edits go live straight away)</h3><div class="fields">
      <label class="field"><span>Name</span><input name="name" value="${esc(v.name)}"></label><label class="field"><span>One line</span><input name="tagline" value="${esc(v.tagline)}"></label>
      <label class="field"><span>Type</span><select name="category">${Object.entries(D.categories).map(([k, l]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Instagram</span><input name="instagram" value="${v.instagram ? `@${esc(v.instagram)}` : ''}"></label><label class="field full"><span>Website</span><input name="website" value="${esc(v.website)}"></label>
      <label class="field full"><span>About</span><textarea name="description" rows="4">${esc(v.description)}</textarea></label>
      <div class="field full"><span>Dietary</span><div class="row-btn">${Object.entries(D.dietary).map(([k, l]) => `<label class="check small"><input type="checkbox" name="diet" value="${k}" ${v.dietary.includes(k) ? 'checked' : ''}> <span>${l}</span></label>`).join('')}</div></div>
      <label class="field full"><span>Menu: one dish a line, “[Section] Dish £9.50 (vegan, halal)”</span><textarea name="menu" rows="8">${esc(menuText(v.menu))}</textarea></label></div>
      <button class="btn hot small" type="submit">Save the listing</button><p class="err" role="status" aria-live="polite"></p></form></div>`;
}

function claims(b) {
  b.innerHTML = D.claims.length ? D.claims.map((c) => `<div class="formbox jmm-item" data-claim="${c.id}"><h3>${esc(c.vendorName)}</h3>
    <p><b>${esc(c.name)}</b> · ${esc(c.role)} · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.phone ? ` · ${esc(c.phone)}` : ''} · ${esc(when(c.at))}</p>${c.note ? `<p class="small">“${esc(c.note)}”</p>` : ''}
    <p class="small muted">Check before approving: does the email match their business, or can you confirm with them at their stall or on Instagram?</p>
    <label class="field"><span>Note if you reject</span><input name="message" maxlength="600"></label>
    <div class="row-btn"><button class="btn hot small" data-do="approve">Approve: email them a sign-in link</button><button class="btn ghost small" data-do="reject">Reject</button><label class="check small"><input type="checkbox" name="email"> Email them the note</label></div></div>`).join('') : '<p class="muted">No claims waiting.</p>';
  $$('[data-claim]', b).forEach((el) => $$('[data-do]', el).forEach((x) => x.onclick = () => act(`/api/food/manage/claims/${el.dataset.claim}`, { action: x.dataset.do, message: $('[name=message]', el).value, email: $('[name=email]', el).checked }).catch((err) => alert(err.message))));
}

function changes(b) {
  b.innerHTML = D.changes.length ? D.changes.map((p) => { const c = p.current || {}; const n = p.changes; return `<div class="formbox jmm-item" data-change="${p.id}"><h3>${esc(c.name)} <a class="small" href="/food/${esc(p.vendor)}" target="_blank">page ↗</a></h3>
    <p class="small">From ${esc(p.by)} · ${esc(when(p.at))}</p>
    ${diff('Name', c.name, n.name)}${diff('One line', c.tagline, n.tagline)}${diff('About', c.description, n.description)}${diff('Type', c.category, n.category)}${diff('Dietary', (c.dietary || []).join(', '), n.dietary.join(', '))}
    ${diff('Instagram', c.instagram, n.instagram)}${diff('Website', c.website, n.website)}${diff('Menu', menuText(c.menu), menuText(n.menu))}
    ${String(c.photos) !== String(n.photos) ? `<div class="jmm-diff"><b>Photos</b><div class="jm-thumbs">${n.photos.map((u) => `<img src="${esc(u)}" alt="" width="120" height="90">`).join('') || '<small>none</small>'}</div></div>` : ''}
    <label class="field"><span>Note if you reject (emailed to them)</span><input name="message" maxlength="600"></label>
    <div class="row-btn"><button class="btn hot small" data-do="approve">Approve: put it on the page</button><button class="btn ghost small" data-do="reject">Reject</button></div></div>`; }).join('') : '<p class="muted">No changes waiting.</p>';
  $$('[data-change]', b).forEach((el) => $$('[data-do]', el).forEach((x) => x.onclick = () => act(`/api/food/manage/changes/${el.dataset.change}`, { action: x.dataset.do, message: $('[name=message]', el).value }).catch((err) => alert(err.message))));
}

let outreachFor = null;
async function outreach(b) {
  const vs = D.vendors;
  const v = vs.find((x) => x.slug === outreachFor) || null;
  b.innerHTML = `<p>Offer a trader a partnership for TAM’s festivals: pre-orders from people coming to TAM nights. Each message carries a personal invite link (30 days): when they open it and add their email, the listing is theirs to manage, with no claim to check.</p>
    <div class="row-btn"><select id="fdm-who-v"><option value="">Choose a trader…</option>${vs.map((x) => `<option value="${esc(x.slug)}" ${x.slug === outreachFor ? 'selected' : ''}>${esc(x.name)} · ${esc(D.partner[x.partner])}</option>`).join('')}</select></div>
    ${v ? `<div class="fdm-detail-grid"><form class="formbox" id="fdm-mail"><h3>By email</h3><label class="field"><span>To</span><input name="email" type="email" value="${esc(v.email)}" placeholder="their email"></label>
      <label class="field"><span>Subject</span><input name="subject" value="Partner with TAM for The Best Christmas Ever: pre-orders for ${esc(v.name)}"></label>
      <label class="field"><span>Message ({link} becomes their invite link)</span><textarea name="message" rows="14"></textarea></label>
      <button class="btn hot small" type="submit">Send from tickets@tam.tv</button><p class="err" role="status" aria-live="polite"></p></form>
    <form class="formbox" id="fdm-ig"><h3>By Instagram DM</h3><label class="field"><span>Instagram</span><input name="instagram" value="${v.instagram ? `@${esc(v.instagram)}` : ''}" placeholder="@handle"></label>
      <p class="small muted">Instagram doesn’t let websites send DMs for you. This makes their invite link, copies the message, and opens a DM to them: paste and send it from TAM’s account (@templeartmusic).</p>
      <label class="field"><span>Message</span><textarea name="message" rows="14"></textarea></label>
      <button class="btn hot small" type="submit">Copy the message and open their DM</button><p class="err" role="status" aria-live="polite"></p><p class="small" id="fdm-ig-out"></p></form></div>
      ${v.outreach.length ? `<p class="small">Contacted: ${v.outreach.map((o) => `${esc(when(o.at))} ${esc(o.channel)} (${esc(o.to)}, ${esc(o.by)})`).join(' · ')}</p>` : ''}` : ''}
    <h3>Who to contact next</h3><ul class="small">${vs.filter((x) => ['none', 'invited'].includes(x.partner)).map((x) => `<li><button class="linkish" data-pick="${esc(x.slug)}">${esc(x.name)}</button> · ${esc(D.partner[x.partner])} · ${x.email ? 'email ✓' : 'no email'} · ${x.instagram ? `@${esc(x.instagram)}` : 'no Instagram'}</li>`).join('') || '<li>Everyone’s been contacted.</li>'}</ul>`;
  $('#fdm-who-v').onchange = (e) => { outreachFor = e.target.value; draw(); };
  $$('[data-pick]', b).forEach((x) => x.onclick = () => { outreachFor = x.dataset.pick; draw(); });
  if (!v) return;
  const { message } = await api(`/api/food/manage/pitch/${v.slug}`);
  $('#fdm-mail').message.value = message;
  $('#fdm-ig').message.value = message;
  $('#fdm-mail').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    if (!confirm(`Send this to ${f.email.value}?`)) return;
    try { await api(`/api/food/manage/outreach/${v.slug}`, { method: 'POST', body: { channel: 'email', email: f.email.value, subject: f.subject.value, message: f.message.value } }); await load(); formMessage(f, 'Sent.', true); } catch (err) { formMessage(f, err.message); }
  });
  $('#fdm-ig').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const w = window.open('about:blank', '_blank'); // opened now, so the browser allows it
    try {
      const r = await api(`/api/food/manage/outreach/${v.slug}`, { method: 'POST', body: { channel: 'instagram', instagram: f.instagram.value, message: f.message.value } });
      const copied = await copyText(r.message);
      if (w) w.location = r.dm;
      $('#fdm-ig-out').innerHTML = `${copied ? 'Copied.' : 'Copy the message below.'} DM: <a href="${esc(r.dm)}" target="_blank" rel="noopener">${esc(r.dm)}</a> · <a href="${esc(r.profile)}" target="_blank" rel="noopener">profile</a><br>Invite link: <code>${esc(r.link)}</code>`;
      f.message.value = r.message;
      await load();
    } catch (err) { if (w) w.close(); formMessage(f, err.message); }
  });
}

function orders(b) {
  const os = D.orders.slice().sort((a, x) => (a.night + a.collect).localeCompare(x.night + x.collect));
  b.innerHTML = `<p class="small"><a href="/api/food/manage/orders.csv">Download every pre-order (CSV)</a></p>${os.length ? `<table class="fd-orders"><thead><tr><th>Night</th><th>Trader</th><th>Time</th><th>Name</th><th>Order</th><th>Total</th><th>Status</th></tr></thead><tbody>
    ${os.map((o) => `<tr class="${o.status === 'cancelled' ? 'muted' : ''}"><td>${esc(o.nightTitle)}</td><td>${esc(o.vendorName)}</td><td>${esc(o.collect)}</td><td>${esc(o.name)}<br><small>${esc(o.email)}</small></td><td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join('<br>')}</td><td>${pounds(o.total)}</td>
      <td><select data-order="${esc(o.id)}">${Object.entries(D.orderStates).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No pre-orders for upcoming nights yet.</p>'}`;
  $$('[data-order]', b).forEach((s) => s.onchange = () => act(`/api/food/manage/orders/${s.dataset.order}`, { status: s.value }).catch((err) => alert(err.message)));
}

start();
