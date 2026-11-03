// /admin: one overview call, rendered as tabs.

import { $, api, pounds } from './lib.js';
import { signedIn } from './staff.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#admin');
let data, tab = 'enquiries';

const table = (head, rows) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted">Nothing yet.</td></tr>`}</tbody></table></div>`;
const btn = (label, attrs) => `<button class="btn ghost small" type="button" ${attrs}>${label}</button>`;

const TABS = {
  nights: () => {
    const t = data.nights.reduce((a, n) => ({ sold: a.sold + n.sold, rev: a.rev + n.paidRevenue, don: a.don + n.donations, raf: a.raf + n.raffle }), { sold: 0, rev: 0, don: 0, raf: 0 });
    return `<div class="stat-row"><div class="stat"><b>${t.sold}</b>tickets held</div><div class="stat"><b>${pounds(t.rev)}</b>paid ticket revenue</div><div class="stat"><b>${pounds(t.don)}</b>donations (paid)</div><div class="stat"><b>${pounds(t.raf)}</b>raffle takings</div></div>
      <p class="small">${data.eventbrite ? (data.eventbrite.fetchedAt ? `Eventbrite listings: ${data.eventbrite.upcoming} upcoming, ${data.eventbrite.past} recent past, ${data.eventbrite.source === 'cache' ? 'from the saved copy' : 'live'}, updated ${esc(data.eventbrite.fetchedAt.slice(0, 16).replace('T', ' '))} UTC.` : 'Eventbrite listings: not fetched yet.') + (data.eventbrite.error ? ` <span class="err">Last refresh failed: ${esc(data.eventbrite.error)}</span>` : '') : ''}</p>
      <p class="small">${data.stripe ? 'Card payments are on.' : 'Card payments are off: bookings are reserved and invoiced.'} ${data.mail ? 'Emails are on.' : 'Emails are off (set RESEND_API_KEY).'}</p>
      ${table(['Night', 'Date', 'Sold', 'Capacity', 'Checked in', 'Paid revenue', 'Donations', 'Raffle', 'Winners', ''], data.nights.map((n) => `<tr><td>${esc(n.title)}</td><td>${n.date}</td><td>${n.sold}</td><td>${n.capacity || '–'}</td><td>${n.checkedIn}</td><td>${pounds(n.paidRevenue)}</td><td>${pounds(n.donations)}</td><td>${pounds(n.raffle)}</td><td>${n.winners.map((w) => `No. ${w.number}: ${esc(w.prize)}`).join('<br>')}</td><td>${btn('Guest list CSV', `data-csv="/api/admin/bookings.csv?night=${encodeURIComponent(n.slug)}"`)}</td></tr>`))}`;
  },
  bookings: () => `<p>${btn('All bookings CSV', 'data-csv="/api/admin/bookings.csv"')}</p>` + table(['Ref', 'Night', 'Status', 'Name', 'Tickets', 'Total', 'Team', 'Via', 'In', ''], data.bookings.map((b) => `<tr><td><a href="${esc(b.ticket)}">${b.id}</a>${b.needsAttention ? `<br><span class="err">${esc(b.needsAttention)}</span>` : ''}</td><td>${esc(b.night)}</td><td>${b.status}${b.emails ? `<br><small>emailed ${Object.keys(b.emails).join(', ')}</small>` : ''}</td>
    <td>${esc(b.name)}<br><small>${esc(b.email)}</small></td><td>${b.qty} × ${esc(b.ticketName || 'Ticket')}</td><td>${pounds(b.total)}${b.donation ? `<br><small>incl. ${pounds(b.donation)} donation</small>` : ''}</td><td>${esc(b.teamName)}${b.tableNote ? `<br><small>${esc(b.tableNote)}</small>` : ''}</td><td>${esc(b.via)}</td><td>${b.checkedIn || 0}</td>
    <td>${b.status !== 'paid' && b.status !== 'cancelled' ? btn('Mark paid', `data-b="${b.id}" data-a="paid"`) : ''}${b.status !== 'cancelled' ? btn('Cancel', `data-b="${b.id}" data-a="cancel"`) : ''}${data.mail ? btn('Email ticket', `data-b="${b.id}" data-a="email"`) : ''}${b.status === 'reserved' && data.stripe && data.mail ? btn('Send payment link', `data-b="${b.id}" data-a="paylink"`) : ''}</td></tr>`)),
  wall: () => table(['Company', 'Festival', 'Night', 'Status', 'Logo', ''], data.pins.map((p) => `<tr><td><b>${esc(p.company)}</b><br><small>${esc(p.tagline)} ${esc(p.website)}</small><br><small>${esc(p.ref)}</small></td><td>${esc(p.festival)}</td><td>${esc(p.night)}</td><td>${p.status}${p.featured ? ' · gold' : ''}</td><td>${p.logo ? `<img src="${esc(p.logo)}" alt="" style="max-height:40px">` : ''}</td>
    <td>${p.status !== 'approved' ? btn('Approve', `data-p="${p.id}" data-a="approve"`) : ''}${p.status !== 'hidden' ? btn('Hide', `data-p="${p.id}" data-a="hide"`) : ''}${btn(p.featured ? 'Unfeature' : 'Feature (gold)', `data-p="${p.id}" data-a="${p.featured ? 'unfeature' : 'feature'}"`)}</td></tr>`)),
  sponsors: () => table(['Ref', 'Company', 'Contact', 'Package', 'Night', 'Message', 'Status'], data.sponsors.map((s) => `<tr><td>${s.id}</td><td>${esc(s.company)}</td><td>${esc(s.name)}<br><small>${esc(s.email)} ${esc(s.phone)}</small></td><td>${esc(s.package)}</td><td>${esc(s.night)}</td><td>${esc(s.message)}</td>
    <td><select data-s="${s.id}">${['enquiry', 'talking', 'confirmed', 'declined'].map((x) => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td></tr>`)),
  orders: () => table(['Order', 'Status', 'Name', 'Copies', 'Delivery', 'Total', ''], data.orders.map((o) => `<tr><td>${o.id}${o.needsAttention ? `<br><span class="err">${esc(o.needsAttention)}</span>` : ''}</td><td>${o.status}</td><td>${esc(o.name)}<br><small>${esc(o.email)}</small>${o.signedTo ? `<br><small>Sign to: ${esc(o.signedTo)}</small>` : ''}</td>
    <td>${o.copies.map((c) => `${esc(c.title)} No. ${c.number} <small>${c.code}</small>`).join('<br>')}</td><td>${o.delivery}${o.address ? `<br><small>${esc(o.address)}</small>` : ''}</td><td>${pounds(o.total)}</td>
    <td>${!['paid', 'fulfilled', 'cancelled'].includes(o.status) ? btn('Mark paid', `data-o="${o.id}" data-a="paid"`) : ''}${o.status === 'paid' ? btn('Fulfilled', `data-o="${o.id}" data-a="fulfilled"`) : ''}${o.status !== 'cancelled' ? btn('Cancel (frees numbers)', `data-o="${o.id}" data-a="cancel"`) : ''}</td></tr>`)),
  artists: () => table(['Artist', 'Page visits', '7 days', 'Invite views', 'Followers', 'New (7d)', 'Bookings via', 'Tickets', 'Paid revenue', ''], data.artists.map((a) => `<tr><td><a href="/artists/${a.slug}">${esc(a.name)}</a></td><td>${a.pageVisits}</td><td>${a.pageVisits7}</td><td>${a.inviteViews}</td><td>${a.followers}</td><td>${a.newFollowers7}</td><td>${a.bookings}</td><td>${a.tickets}</td><td>${pounds(a.revenue)}</td><td>${a.followers ? btn('Followers CSV', `data-csv="/api/admin/followers.csv?artist=${a.slug}"`) : ''}</td></tr>`)),
  demand: () => `<p>What fans asked for: “Bring them back” on artist pages and “I was there” on past nights.</p>` + table(['Kind', 'Artist or night', 'Count'], data.demand.map((d) => `<tr><td>${d.kind}</td><td>${esc(d.target)}</td><td>${d.n}</td></tr>`)),
  enquiries: () => table(['When', 'Kind', 'Who', 'Details', 'Message', 'From', 'Status'], data.enquiries.map((e) => `<tr><td>${e.createdAt.slice(0, 16).replace('T', ' ')}<br><small>${e.id}</small></td><td>${esc(e.kind)}</td>
    <td>${esc(e.name)}<br><small><a href="mailto:${esc(e.email)}">${esc(e.email)}</a> ${esc(e.phone)}</small>${e.company ? `<br><small>${esc(e.company)}</small>` : ''}</td>
    <td>${[e.date && `Date: ${esc(e.date)}`, e.guests && `Guests: ${esc(e.guests)}`, e.budget && `Budget: ${esc(e.budget)}`].filter(Boolean).join('<br>')}</td><td>${esc(e.message)}</td><td>${e.source === 'agent' ? 'Ask TAM' : esc(e.pathway || 'form')}</td>
    <td><select data-enq="${e.id}">${['new', 'replied', 'quoted', 'booked', 'closed'].map((x) => `<option ${x === e.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td></tr>`)),
  agent: () => `<div class="stat-row"><div class="stat"><b>${data.agent.enabled ? 'On' : 'Off'}</b>${data.agent.enabled ? esc(data.agent.model) : 'set ANTHROPIC_API_KEY'}</div><div class="stat"><b>${data.agent.week}</b>questions (7 days)</div><div class="stat"><b>${data.agent.offline}</b>answered without the agent</div></div>
    <p><b>Pathways:</b> ${Object.entries(data.agent.pathways).map(([k, n]) => `${esc(k)} ${n}`).join(' · ') || '–'}<br><b>Tools used:</b> ${Object.entries(data.agent.tools).map(([k, n]) => `${esc(k)} ${n}`).join(' · ') || '–'}</p>
    ${table(['When', 'Pathway', 'Question', 'Tools', 'Mode'], data.agent.recent.map((x) => `<tr><td>${x.at.slice(0, 16).replace('T', ' ')}</td><td>${esc(x.pathway)}</td><td>${esc(x.question)}</td><td>${esc(x.tools.join(', '))}</td><td>${esc(x.mode)}</td></tr>`))}`,
  email: () => `<form class="formbox" id="mail-form"><h3>Email an artist's followers</h3>
    <div class="fields"><label class="field"><span>Artist</span><select name="artist">${data.artists.filter((a) => a.followers).map((a) => `<option value="${a.slug}">${esc(a.name)} (${a.followers})</option>`).join('')}</select></label>
    <label class="field"><span>Subject</span><input name="subject" maxlength="120" required></label>
    <label class="field full"><span>Message (blank line between paragraphs)</span><textarea name="message" rows="8" required></textarea></label>
    <label class="field"><span>Button link (optional)</span><input name="link" type="url"></label><label class="field"><span>Button label</span><input name="linkLabel" maxlength="40"></label>
    <label class="field"><span>Send a test to</span><input name="testTo" type="email"></label></div>
    <div class="row-btn"><button class="btn ghost" type="button" id="mail-test">Send a test</button><button class="btn hot" type="submit">Send to followers</button></div><p class="err" role="status"></p></form>
    <h3>History</h3>${table(['Sent', 'Artist', 'Subject', 'To', 'Delivered', 'Failed'], data.mailings.map((m) => `<tr><td>${m.startedAt}</td><td>${esc(m.artist)}</td><td>${esc(m.subject)}</td><td>${m.to}</td><td>${m.delivered}</td><td>${m.failed}</td></tr>`))}`,
};
const ORDER = ['enquiries', 'nights', 'bookings', 'wall', 'sponsors', 'orders', 'artists', 'agent', 'demand', 'email'];
const NAMES = { enquiries: 'Enquiries', agent: 'Ask TAM', nights: 'Nights', bookings: 'Bookings', wall: 'Party Wall', sponsors: 'Sponsors', orders: 'Collection orders', artists: 'Artists', demand: 'Demand', email: 'Email followers' };

function render() {
  root.innerHTML = `<div class="admin-tabs">${ORDER.map((k) => `<button class="chip" type="button" data-tab="${k}" aria-pressed="${k === tab}">${NAMES[k]}${k === 'wall' && data.pins.some((p) => p.status === 'pending') ? ` (${data.pins.filter((p) => p.status === 'pending').length})` : ''}</button>`).join('')}
    <button class="chip" type="button" id="logout">Sign out</button></div>${TABS[tab]()}`;
}
async function reload() { data = await api('/api/admin/overview'); render(); }

async function download(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) return alert('Download failed.');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (/filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '') || [])[1] || 'export.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

signedIn(() => api('/api/admin/overview'), (d) => {
  data = d; root.hidden = false; render();
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; return render(); }
    if (e.target.id === 'logout') { await api('/api/staff/logout', { method: 'POST' }); return location.reload(); }
    const csv = e.target.closest('[data-csv]');
    if (csv) return download(csv.dataset.csv);
    const act = e.target.closest('[data-a]');
    if (act) {
      const kind = act.dataset.b ? 'bookings' : act.dataset.p ? 'pins' : 'orders';
      const id = act.dataset.b || act.dataset.p || act.dataset.o;
      if (act.dataset.a === 'cancel' && !confirm('Cancel this? Its tickets or numbers are released.')) return;
      try { await api(`/api/admin/${kind}/${id}`, { method: 'POST', body: { action: act.dataset.a } }); await reload(); } catch (err) { alert(err.message); }
    }
    if (e.target.id === 'mail-test') {
      const f = Object.fromEntries(new FormData($('#mail-form')));
      try { await api('/api/admin/mailings', { method: 'POST', body: { ...f, test: true } }); alert('Test sent.'); } catch (err) { alert(err.message); }
    }
  });
  root.addEventListener('change', async (e) => {
    const q = e.target.closest('[data-enq]');
    if (q) { try { await api(`/api/admin/enquiries/${q.dataset.enq}`, { method: 'POST', body: { status: q.value } }); } catch (err) { alert(err.message); } return; }
    const s = e.target.closest('[data-s]');
    if (s) { try { await api(`/api/admin/sponsors/${s.dataset.s}`, { method: 'POST', body: { status: s.value } }); } catch (err) { alert(err.message); } }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'mail-form') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!confirm('Send this to every follower of that artist?')) return;
    try { const r = await api('/api/admin/mailings', { method: 'POST', body: f }); alert(`Sending to ${r.to} followers.`); await reload(); } catch (err) { alert(err.message); }
  });
});
