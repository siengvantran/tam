// /shows: TAM's show calendar and editor (src/domain/shows.js), and the
// /staff/sign-in page that finishes an emailed sign-in link.

import { $, $$, api, shrinkImage, copyText, formMessage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SOURCE = { show: 'TAM show', eventbrite: 'On Eventbrite', schedule: 'From the schedule', festival: 'Festival night', tam: 'TAM night' };
const STATUS = { draft: 'Draft', published: 'Live on tam.tv', cancelled: 'Cancelled' };
const ebStatus = { draft: 'Draft on Eventbrite', live: 'Live on Eventbrite', started: 'Started', ended: 'Ended', completed: 'Completed', canceled: 'Cancelled on Eventbrite', deleted: 'Deleted' };
const pounds = (p) => (p % 100 ? (p / 100).toFixed(2) : String(p / 100));
const longDay = (d) => { const x = new Date(`${d}T12:00:00Z`); return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
const addMonths = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// ---------- the emailed link: /staff/sign-in?t=… ----------
const useLink = $('#use-link');
if (useLink) {
  $('#use-link-btn').addEventListener('click', async () => {
    try {
      const r = await api('/api/staff/link/use', { method: 'POST', body: { t: new URLSearchParams(location.search).get('t') || '' } });
      location.replace(r.next || '/shows');
    } catch (e) { useLink.querySelector('.err').textContent = e.message; }
  });
}

// ---------- /shows ----------
const root = $('#shows');
let setup = null, ym = null, monthData = null, show = null, dirty = false, nightPick = null, suggestions = null;

async function start() {
  try { setup = await api('/api/shows/setup'); } catch (e) { return signIn(); }
  $('#team-login').hidden = true;
  root.hidden = false;
  $('#shows-who').innerHTML = `${esc(setup.me.name)} · ${esc(setup.me.role === 'admin' ? 'Admin' : 'Ops')} · <button class="linkish" type="button" id="sign-out">Sign out</button>`;
  ym = (new URLSearchParams(location.search).get('m') || setup.today.slice(0, 7));
  root.innerHTML = `<div class="sh-grid">
    <div class="sh-cal"><div class="sh-cal-head">
      <button class="btn ghost small" type="button" data-m="-1" aria-label="Previous month">‹</button><h2 id="sh-title"></h2>
      <button class="btn ghost small" type="button" data-m="1" aria-label="Next month">›</button><button class="btn ghost small" type="button" data-m="0">Today</button>
      <button class="btn hot small" type="button" data-new="${esc(setup.today)}">+ New show</button></div>
      <div class="sh-legend small">${Object.entries({ 'show st-published': 'TAM show, live', 'show st-draft': 'Draft', eventbrite: 'On Eventbrite', schedule: 'Schedule', festival: 'Festival' }).map(([k, v]) => `<span class="sh-chip src-${k}">${v}</span>`).join('')}<span class="muted">Mondays: rest day</span></div>
      <div class="sh-month" id="sh-month"></div>
      <p class="small muted">Everyone can subscribe to TAM's nights: <a href="/calendar.ics">tam.tv/calendar.ics</a> (Google or Apple Calendar → add by URL).</p>
    </div>
    <aside class="sh-editor" id="sh-editor"></aside></div>`;
  await loadMonth();
  const open = new URLSearchParams(location.search).get('show');
  if (open) await openShow(open); else home();
}

function signIn() {
  const box = $('#team-login');
  box.hidden = false;
  $('#team-link').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/staff/link', { method: 'POST', body: { email: f.email.value, next: f.next.value } });
      formMessage(f, `If ${f.email.value} is on TAM's team, a sign-in link is on its way. It works once, for 20 minutes.`, true);
    } catch (err) { formMessage(f, err.message); }
  });
  $('#team-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/staff/login', { method: 'POST', body: { token: e.target.token.value } }); location.reload(); } catch (err) { formMessage(e.target, err.message); }
  });
}

async function loadMonth() {
  monthData = await api(`/api/shows/month?m=${ym}`);
  $('#sh-title').textContent = `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
  const first = new Date(`${ym}-01T12:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="sh-day pad" aria-hidden="true"></div>');
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const list = monthData.entries.filter((x) => x.date === date);
    const dow = (lead + d - 1) % 7;
    const past = date < monthData.today;
    cells.push(`<div class="sh-day${list.length ? ' has' : ''}${date === monthData.today ? ' today' : ''}${dow === 0 ? ' rest' : ''}${past ? ' past' : ''}" data-date="${date}">
      <div class="sh-dn"><b>${d}</b><span>${DAYS[dow]}${dow === 0 ? ' · rest day' : ''}</span>${past ? '' : `<button class="sh-add" type="button" data-new="${date}" title="New show on ${esc(longDay(date))}" aria-label="New show on ${esc(longDay(date))}">+</button>`}</div>
      ${list.map((x) => `<button type="button" class="sh-chip src-${x.source} st-${x.status}${show && x.showId === show.id ? ' on' : ''}" ${x.showId ? `data-show="${x.showId}"` : `data-night="${esc(x.slug)}"`} title="${esc(SOURCE[x.source] || '')}">${x.time ? `<i>${esc(x.time)}</i> ` : ''}${esc(x.title)}${x.status === 'draft' ? ' <em>draft</em>' : x.status === 'cancelled' ? ' <em>cancelled</em>' : ''}</button>`).join('')}
    </div>`);
  }
  $('#sh-month').innerHTML = `${DAYS.map((d) => `<div class="sh-wd">${d}</div>`).join('')}${cells.join('')}`;
}

function home() {
  show = null; nightPick = null;
  const up = setup.upcoming || [];
  $('#sh-editor').innerHTML = `<div class="sh-card"><h3>Hello ${esc(setup.me.name.split(' ')[0])}</h3>
    <p>Press <b>+</b> on a day to add a show, or pick a show to edit it. Nights from Eventbrite or the schedule can be brought in here too.</p>
    ${connections()}
    <p class="small">Running a regular? <a href="/great-british-blues-jam/manage">The Great British Blues Jam</a>: hosts, house band, jam list, wall and the big screen.</p></div>
    ${up.length ? `<div class="sh-card"><h3>Your shows coming up</h3><ul class="plain sh-up">${up.map((s) => `<li><button class="linkish" type="button" data-show="${s.id}">${esc(longDay(s.date))} · ${esc(s.title || 'Untitled')}</button> <span class="tag small">${esc(STATUS[s.status])}</span></li>`).join('')}</ul></div>` : ''}`;
}

function connections() {
  const c = setup.connections;
  const chip = (on, name) => `<span class="sh-conn ${on ? 'on' : 'off'}">${on ? '●' : '○'} ${name}</span>`;
  return `<p class="small">${chip(true, 'TAM box office')} ${chip(c.eventbrite, 'Eventbrite')} ${chip(c.facebook, 'Facebook Page')} ${chip(c.google, 'Google Business')} ${chip(c.writer, 'Writing help')}</p>
    ${c.eventbrite && c.facebook && c.google ? '' : '<p class="small muted">Not connected yet? Posts can still be written here, copied, and marked as posted by hand. An admin connects each one on Railway (see the README).</p>'}`;
}

// A night from Eventbrite or the schedule: show what it is, offer to manage it here.
function pickNight(slug) {
  const x = monthData.entries.find((e) => e.slug === slug);
  if (!x) return;
  show = null; nightPick = x;
  $('#sh-editor').innerHTML = `<div class="sh-card"><div class="label">${esc(SOURCE[x.source] || 'Night')}</div><h3>${esc(x.title)}</h3>
    <p>${esc(longDay(x.date))}${x.time ? ` · ${esc(x.time)}` : ''}</p>
    <p class="small muted">${x.source === 'eventbrite' ? 'This night comes from TAM’s Eventbrite listing.' : x.source === 'festival' ? 'This is a festival night.' : 'This night comes from TAM’s schedule.'} Bring it into Shows to add details, tickets and posts. Its page keeps working while you do.</p>
    <p><button class="btn hot" type="button" data-adopt="${esc(slug)}">Manage it in Shows</button> <a class="btn ghost" href="/events/${esc(slug)}" target="_blank" rel="noopener">View its page ↗</a></p></div>`;
}

async function openShow(id) {
  if (dirty && !confirm('You have unsaved changes. Leave them?')) return;
  try { show = await api(`/api/shows/${encodeURIComponent(id)}`); } catch (e) { return toast(e.message, true); }
  dirty = false; suggestions = null;
  history.replaceState(null, '', `/shows?m=${show.date ? show.date.slice(0, 7) : ym}&show=${show.id}`);
  if (show.date && show.date.slice(0, 7) !== ym) { ym = show.date.slice(0, 7); await loadMonth(); } else $$('.sh-chip.on').forEach((c) => c.classList.remove('on'));
  $$(`.sh-chip[data-show="${show.id}"]`).forEach((c) => c.classList.add('on'));
  editor();
}

async function newShow(date) {
  if (dirty && !confirm('You have unsaved changes. Leave them?')) return;
  try {
    const s = await api('/api/shows', { method: 'POST', body: { date, title: '', doors: '19:30', ends: '23:00' } });
    dirty = false;
    await loadMonth();
    await openShow(s.id);
    $('#f-title') && $('#f-title').focus();
  } catch (e) { toast(e.message, true); }
}

// ---------- the editor ----------
const field = (id, label, input, hint = '') => `<label class="field" for="${id}"><span>${label}</span>${input}${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
const rowLineup = (x = {}) => `<div class="sh-row" data-row="lineup"><input aria-label="Name" placeholder="Name" value="${esc(x.name)}" data-k="name" maxlength="80"><input aria-label="Role" placeholder="Role (e.g. host, band)" value="${esc(x.role)}" data-k="role" maxlength="80"><label class="small sh-check"><input type="checkbox" data-k="revealed" ${x.revealed === false ? '' : 'checked'}> Revealed</label><button type="button" class="sh-x" data-del aria-label="Remove">×</button></div>`;
const rowSchedule = (x = ['', '']) => `<div class="sh-row" data-row="schedule"><input aria-label="Time" placeholder="19:30" value="${esc(x[0])}" data-k="0" maxlength="5" class="t"><input aria-label="What happens" placeholder="Doors / first set / headliner…" value="${esc(x[1])}" data-k="1" maxlength="140"><button type="button" class="sh-x" data-del aria-label="Remove">×</button></div>`;
const rowTicket = (t = {}) => `<div class="sh-row sh-ticket" data-row="ticket"><input type="hidden" data-k="id" value="${esc(t.id)}"><input aria-label="Ticket name" placeholder="General admission" value="${esc(t.name)}" data-k="name" maxlength="60">
  <span class="sh-money">£<input aria-label="Price in pounds" inputmode="decimal" placeholder="10" value="${t.price === undefined ? '' : pounds(t.price)}" data-k="price"></span>
  <input aria-label="Limit (optional)" placeholder="Limit" inputmode="numeric" value="${esc(t.limit || '')}" data-k="limit" class="t"><input aria-label="Description" placeholder="What it includes (optional)" value="${esc(t.blurb)}" data-k="blurb" maxlength="300" class="wide"><button type="button" class="sh-x" data-del aria-label="Remove">×</button></div>`;

function editor() {
  const s = show, sl = s.sales, eb = s.eventbrite, so = s.social || {}, c = setup.connections;
  const st = s.stats || {};
  const mode = sl.mode;
  const live = s.status === 'published';
  $('#sh-editor').innerHTML = `<form id="sh-form" novalidate>
  <div class="sh-bar"><div><span class="tag st-${s.status}">${esc(STATUS[s.status])}</span> ${s.page ? `<a class="small" href="${s.page}" target="_blank" rel="noopener">View page ↗</a>` : ''}</div>
    <div class="sh-bar-btns"><span class="small muted" id="sh-saved">${dirty ? 'Unsaved changes' : 'All saved'}</span><button class="btn hot small" type="submit">Save</button></div></div>
  <div id="sh-toast" role="status" aria-live="polite"></div>

  <section class="sh-card"><h3>The show</h3>
    ${field('f-title', 'Title', `<input id="f-title" name="title" value="${esc(s.title)}" maxlength="120" required placeholder="e.g. Word of Mouth Fusion Jazz">`)}
    ${field('f-presenters', 'Presented by (optional)', `<input id="f-presenters" name="presenters" value="${esc(s.presenters)}" maxlength="160">`)}
    <div class="fields three">${field('f-date', 'Date', `<input id="f-date" name="date" type="date" value="${esc(s.date)}" required>`)}
      ${field('f-doors', 'Starts', `<input id="f-doors" name="doors" type="time" value="${esc(s.doors)}" required>`)}
      ${field('f-ends', 'Ends', `<input id="f-ends" name="ends" type="time" value="${esc(s.ends)}">`, 'After midnight is fine.')}</div>
    ${s.date && new Date(`${s.date}T12:00:00Z`).getUTCDay() === 1 ? '<p class="small warn">That’s a Monday, TAM’s usual rest day. Fine for a special project.</p>' : ''}
    ${field('f-summary', `Short summary <small class="muted" id="sum-count">${(s.summary || '').length}/140</small>`, `<textarea id="f-summary" name="summary" rows="2" maxlength="300" placeholder="One or two sentences: what it is and why come.">${esc(s.summary)}</textarea>`, 'Shown on cards and Eventbrite (140 characters there).')}
    ${field('f-description', 'Full description (optional)', `<textarea id="f-description" name="description" rows="5" maxlength="6000" placeholder="Paragraphs, separated by a blank line.">${esc(s.description)}</textarea>`)}
    <div class="sh-write">${c.writer ? `<details${suggestions ? ' open' : ''}><summary>✨ Write it for me</summary>
      <p class="small muted">Jot down anything (who, what, the vibe). Claude drafts the summary, description and posts from what’s on this page. Nothing changes until you press Use.</p>
      <textarea id="w-notes" rows="2" placeholder="e.g. monthly jazz jam, house band + open jam after 9, bring your instrument"></textarea>
      <button class="btn ghost small" type="button" data-write>Write drafts</button>
      <div id="w-out">${suggestions ? suggestionsHtml() : ''}</div></details>` : ''}</div>
    <div class="sh-image">${s.image ? `<img src="${esc(s.image)}" alt="">` : '<div class="sh-noimg">No image yet</div>'}
      <label class="btn ghost small">${s.image ? 'Change image' : 'Add an image'}<input type="file" accept="image/jpeg,image/png" id="f-image" hidden></label>
      <small class="muted">A wide photo works best (Eventbrite crops to 2:1).</small></div>
    ${field('f-video', 'YouTube video (optional)', `<input id="f-video" name="video" value="${s.video ? `https://youtu.be/${esc(s.video)}` : ''}" placeholder="https://youtu.be/…">`)}
  </section>

  <section class="sh-card"><h3>Line-up</h3><p class="small muted">Untick “Revealed” to keep a name secret: the page says “+1 to be revealed” until you tick it.</p>
    <div id="lineup">${(s.lineup || []).map(rowLineup).join('')}</div><button class="btn ghost small" type="button" data-add="lineup">+ Add a name</button>
    ${setup.artists.length ? `<p class="small" style="margin-top:12px">Link TAM artist pages: <select id="f-artist"><option value="">Choose…</option>${setup.artists.map((a) => `<option value="${esc(a.slug)}">${esc(a.name)}</option>`).join('')}</select>
      <span id="artists">${(s.artists || []).map((a) => artistChip(a)).join('')}</span></p>` : ''}
  </section>

  <section class="sh-card"><h3>Running order (optional)</h3><div id="schedule">${(s.schedule || []).map(rowSchedule).join('')}</div>
    <button class="btn ghost small" type="button" data-add="schedule">+ Add a line</button></section>

  <section class="sh-card"><h3>Tickets</h3>
    <div class="sh-modes">${Object.entries(setup.modes).map(([k, v]) => `<label class="sh-mode${mode === k ? ' on' : ''}"><input type="radio" name="mode" value="${k}" ${mode === k ? 'checked' : ''}><b>${esc(v)}</b><small>${esc(MODE_HINT[k])}</small></label>`).join('')}</div>
    <div class="fields three">${['tam', 'both', 'eventbrite', 'rsvp'].includes(mode) ? field('f-capacity', 'Capacity', `<input id="f-capacity" name="capacity" inputmode="numeric" value="${esc(sl.capacity || '')}" placeholder="120">`, 'How many people in the room.') : ''}
      ${mode === 'both' ? field('f-alloc', 'On Eventbrite', `<input id="f-alloc" name="eventbriteAllocation" inputmode="numeric" value="${esc(sl.eventbriteAllocation || '')}" placeholder="40">`, 'Comes out of the capacity.') : ''}
      ${['tam', 'both', 'rsvp'].includes(mode) ? field('f-max', 'Max per booking', `<input id="f-max" name="maxPerBooking" inputmode="numeric" value="${esc(sl.maxPerBooking || 10)}">`, 'Tickets in one order.') : ''}</div>
    ${['tam', 'both', 'eventbrite'].includes(mode) ? `<div id="tickets">${(sl.tickets || []).map(rowTicket).join('')}</div><button class="btn ghost small" type="button" data-add="ticket">+ Add a ticket type</button>
      <p class="small muted">Price 0 makes a free ticket (a supporter ticket next to it works well).</p>` : ''}
    ${st.boxOffice || st.sold ? `<p class="sh-stats"><b>${st.sold}</b> booked on tam.tv${st.left !== null && st.left !== undefined ? ` · <b>${st.left}</b> left` : ''}${eb ? ` · <b>${st.eventbriteSold}</b> sold on Eventbrite` : ''}</p>` : ''}
  </section>

  <section class="sh-card"><h3>Publish on tam.tv</h3>
    ${s.problems.length ? `<p class="small warn">Before it goes live, add ${esc(s.problems.join(', '))}.</p>` : live ? '' : '<p class="small good">Ready to go live.</p>'}
    <p>${live ? `<button class="btn ghost" type="button" data-status="draft">Unpublish</button> <button class="btn ghost" type="button" data-status="cancelled">Cancel the show</button>`
      : s.status === 'cancelled' ? '<button class="btn ghost" type="button" data-status="draft">Restore as a draft</button>'
      : `<button class="btn hot" type="button" data-status="published" ${s.problems.length ? 'disabled' : ''}>Publish on tam.tv</button>`}</p>
  </section>

  <section class="sh-card"><h3>Share it</h3>
    <div class="sh-net"><h4>Eventbrite ${eb ? `<span class="tag small">${esc(ebStatus[eb.status] || eb.status)}</span>` : ''}</h4>
      ${!['both', 'eventbrite', 'rsvp'].includes(mode) ? '<p class="small muted">Tickets are TAM box office only. Choose “TAM box office + Eventbrite” to list it there too.</p>'
        : !c.eventbrite ? '<p class="small muted">Eventbrite isn’t connected yet (an admin adds EVENTBRITE_TOKEN on Railway).</p>'
        : !eb ? `<p class="small">Creates a draft listing with this page’s title, times, words, image and tickets${mode === 'both' ? `, with ${esc(sl.eventbriteAllocation || 0)} tickets` : ''}.</p><button class="btn ghost small" type="button" data-eb="create">Create the Eventbrite listing</button>`
        : `<p class="small">${eb.url ? `<a href="${esc(eb.url)}" target="_blank" rel="noopener">Open on Eventbrite ↗</a> · ` : ''}${eb.linked ? 'Linked to an existing listing' : `${esc(eb.allocation)} tickets`}${eb.syncedAt ? ` · synced ${esc(eb.syncedAt.slice(11, 16))}` : ''}</p>
          ${eb.error ? `<p class="small warn">${esc(eb.error)}</p>` : ''}${eb.imageNote ? `<p class="small warn">Image: ${esc(eb.imageNote)}</p>` : ''}${eb.mediaNote ? `<p class="small warn">${esc(eb.mediaNote)}</p>` : ''}
          <p class="sh-btns">${!['canceled', 'deleted'].includes(eb.status) ? `<button class="btn ghost small" type="button" data-eb="update">Update with these details</button>
            ${eb.status === 'draft' ? `<button class="btn hot small" type="button" data-eb="publish" ${live ? '' : 'disabled title="Publish on tam.tv first"'}>Publish on Eventbrite</button>` : ''}
            <button class="btn ghost small" type="button" data-eb="refresh">Sync sales</button><button class="btn ghost small" type="button" data-eb="cancel">Cancel on Eventbrite</button>` : ''}</p>`}
      <p class="small muted">Eventbrite can also put each published listing on TAM’s Facebook Page as a Facebook Event: connect the Page once in Eventbrite (Account settings → Facebook).</p></div>
    ${['facebook', 'google'].map((net) => netCard(net, so[net], live, c[net])).join('')}
  </section>

  <section class="sh-card"><h3>Copy or repeat</h3>
    <div class="fields three">${field('c-date', 'Copy to a date', '<input id="c-date" type="date">')}
      ${field('c-weeks', 'Or repeat weekly for', '<select id="c-weeks"><option value="">…</option>' + [2, 3, 4, 6, 8, 12, 26].map((n) => `<option value="${n}">${n} weeks</option>`).join('') + '</select>')}</div>
    <button class="btn ghost small" type="button" data-copy>Make copies</button> <span class="small muted">Copies are drafts with the same details and tickets.</span></section>

  <section class="sh-card"><h3>History</h3><ul class="plain small sh-hist">${(s.history || []).map((h) => `<li><span class="muted">${esc(h.at.slice(0, 16).replace('T', ' '))}</span> ${esc(h.by)}: ${esc(h.what)}</li>`).join('')}</ul>
    ${s.status !== 'published' ? '<p><button class="linkish small" type="button" data-delete>Delete this show</button></p>' : ''}</section>
  </form>`;
  bindEditor();
}

const MODE_HINT = {
  tam: 'Sold on tam.tv. TAM keeps the buyer and the fees.',
  both: 'Sold on tam.tv and Eventbrite from one capacity, so it never oversells.',
  eventbrite: 'Sold on Eventbrite. tam.tv links to the listing.',
  rsvp: 'Free. People book a guest-list place on tam.tv.',
  none: 'Free, just turn up. Nothing to book.',
};
const artistChip = (slug) => { const a = setup.artists.find((x) => x.slug === slug); return a ? `<span class="sh-artist" data-artist="${esc(slug)}">${esc(a.name)} <button type="button" class="sh-x" data-unartist aria-label="Unlink">×</button></span>` : ''; };

function netCard(net, done, live, connected) {
  const name = net === 'facebook' ? 'Facebook Page post' : 'Google Business event';
  const text = done && done.message ? done.message : (show.drafts || {})[net] || '';
  return `<div class="sh-net" data-net="${net}"><h4>${name} ${done ? `<span class="tag small">Posted ${esc((done.at || '').slice(0, 10))}${done.manual ? ' (by hand)' : ''}</span>` : ''}</h4>
    ${done && done.url ? `<p class="small"><a href="${esc(done.url)}" target="_blank" rel="noopener">See the post ↗</a></p>` : ''}
    <textarea rows="${net === 'facebook' ? 6 : 4}" data-post="${net}" maxlength="1500">${esc(text)}</textarea>
    <p class="sh-btns">${connected ? `<button class="btn ghost small" type="button" data-post-go="${net}" ${live ? '' : 'disabled title="Publish on tam.tv first"'}>${done ? 'Post again' : `Post to ${net === 'facebook' ? 'Facebook' : 'Google'}`}</button>` : `<span class="small muted">Not connected: copy it and post by hand.</span>`}
      <button class="btn ghost small" type="button" data-post-copy="${net}">Copy text</button><button class="btn ghost small" type="button" data-post-manual="${net}" ${live ? '' : 'disabled'}>Mark as posted</button></p></div>`;
}

function suggestionsHtml() {
  const s = suggestions;
  const box = (k, label) => `<div class="sh-sugg"><b>${label}</b><p>${esc(s[k]).replace(/\n/g, '<br>')}</p><button class="btn ghost small" type="button" data-use="${k}">Use</button></div>`;
  return box('summary', 'Summary') + box('description', 'Description') + box('facebook', 'Facebook post') + box('google', 'Google post');
}

function collect() {
  const f = $('#sh-form');
  const rows = (name) => $$(`[data-row="${name}"]`, f);
  const val = (r, k) => { const el = r.querySelector(`[data-k="${k}"]`); return el.type === 'checkbox' ? el.checked : el.value; };
  const mode = (f.querySelector('input[name="mode"]:checked') || {}).value || show.sales.mode;
  const num = (n) => (f[n] ? f[n].value : undefined);
  return {
    title: f.title.value, presenters: f.presenters.value, date: f.date.value, doors: f.doors.value, ends: f.ends.value,
    summary: f.summary.value, description: f.description.value, video: f.video.value,
    lineup: rows('lineup').map((r) => ({ name: val(r, 'name'), role: val(r, 'role'), revealed: val(r, 'revealed') })),
    schedule: rows('schedule').map((r) => [val(r, '0'), val(r, '1')]),
    artists: $$('[data-artist]', f).map((x) => x.dataset.artist),
    sales: {
      mode, capacity: num('capacity') ?? show.sales.capacity, maxPerBooking: num('maxPerBooking') ?? show.sales.maxPerBooking,
      eventbriteAllocation: num('eventbriteAllocation') ?? show.sales.eventbriteAllocation,
      tickets: f.querySelector('#tickets') ? rows('ticket').map((r) => ({ id: val(r, 'id'), name: val(r, 'name'), price: val(r, 'price'), blurb: val(r, 'blurb'), limit: val(r, 'limit') }))
        : (show.sales.tickets || []).map((t) => ({ ...t, price: pounds(t.price) })),
    },
  };
}

async function saveShow(quiet) {
  const body = collect();
  show = await api(`/api/shows/${show.id}`, { method: 'POST', body });
  dirty = false;
  await loadMonth();
  $$(`.sh-chip[data-show="${show.id}"]`).forEach((c) => c.classList.add('on'));
  if (!quiet) { editor(); toast('Saved.'); }
}
const markDirty = () => { dirty = true; const s = $('#sh-saved'); if (s) s.textContent = 'Unsaved changes'; };

function toast(msg, bad) {
  const t = $('#sh-toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.className = bad ? 'err' : 'good';
  if (!bad) setTimeout(() => { if (t.textContent === msg) t.textContent = ''; }, 3000);
}

async function run(fn, busyBtn) {
  if (busyBtn) { busyBtn.disabled = true; busyBtn.dataset.label = busyBtn.textContent; busyBtn.textContent = 'Working…'; }
  try { await fn(); } catch (e) { toast(e.message, true); if (busyBtn && document.contains(busyBtn)) { busyBtn.disabled = false; busyBtn.textContent = busyBtn.dataset.label; } }
}

function bindEditor() {
  const f = $('#sh-form');
  f.addEventListener('input', (e) => { if (!e.target.closest('[data-post], #w-notes, #c-date, #c-weeks')) markDirty(); if (e.target.id === 'f-summary') $('#sum-count').textContent = `${e.target.value.length}/140`; });
  f.addEventListener('change', async (e) => {
    if (e.target.name === 'mode') { const body = collect(); show = { ...show, ...body, sales: { ...show.sales, ...body.sales, tickets: body.sales.tickets.map((t) => ({ ...t, price: Math.round(Number(t.price || 0) * 100) })) } }; markDirty(); editor(); return; }
    if (e.target.id === 'f-artist' && e.target.value) { if (!$(`[data-artist="${e.target.value}"]`)) $('#artists').insertAdjacentHTML('beforeend', artistChip(e.target.value)); e.target.value = ''; markDirty(); }
    if (e.target.id === 'f-image' && e.target.files[0]) {
      await run(async () => {
        if (dirty) await saveShow(true);
        const data = await shrinkImage(e.target.files[0], 1600, 0.85);
        show = await api(`/api/shows/${show.id}/image`, { method: 'POST', body: { image: data } });
        editor(); toast('Image added.');
      });
    }
  });
  f.addEventListener('submit', (e) => { e.preventDefault(); run(() => saveShow(), f.querySelector('button[type="submit"]')); });
  f.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add) { const html = { lineup: rowLineup, schedule: rowSchedule, ticket: rowTicket }[b.dataset.add](); $(`#${b.dataset.add === 'ticket' ? 'tickets' : b.dataset.add}`).insertAdjacentHTML('beforeend', html); markDirty(); return; }
    if (b.hasAttribute('data-del')) { b.closest('.sh-row').remove(); markDirty(); return; }
    if (b.hasAttribute('data-unartist')) { b.closest('[data-artist]').remove(); markDirty(); return; }
    if (b.dataset.status) {
      const to = b.dataset.status;
      if (to === 'cancelled' && !confirm('Cancel this show? It comes off tam.tv. People who booked are not refunded automatically.')) return;
      return run(async () => {
        if (dirty) await saveShow(true);
        try { show = await api(`/api/shows/${show.id}/status`, { method: 'POST', body: { status: to } }); }
        catch (err) { if (!/Confirm/.test(err.message) || !confirm(err.message)) throw err; show = await api(`/api/shows/${show.id}/status`, { method: 'POST', body: { status: to, confirm: true } }); }
        await loadMonth(); editor(); toast(to === 'published' ? 'It’s live on tam.tv.' : 'Done.');
      }, b);
    }
    if (b.dataset.eb) {
      const act = b.dataset.eb;
      if (act === 'cancel' && !confirm('Cancel the Eventbrite listing? Eventbrite emails anyone who bought there.')) return;
      return run(async () => {
        if (dirty) await saveShow(true);
        show = await api(`/api/shows/${show.id}/eventbrite/${act}`, { method: 'POST', body: {} });
        await loadMonth(); editor(); toast({ create: 'Draft listing made on Eventbrite. Check it, then publish.', update: 'Eventbrite updated.', publish: 'Live on Eventbrite.', refresh: 'Synced.', cancel: 'Cancelled on Eventbrite.' }[act]);
      }, b);
    }
    if (b.dataset.postGo) {
      const net = b.dataset.postGo;
      return run(async () => { show = await api(`/api/shows/${show.id}/post/${net}`, { method: 'POST', body: { text: $(`[data-post="${net}"]`).value } }); editor(); toast('Posted.'); }, b);
    }
    if (b.dataset.postCopy) { copyText($(`[data-post="${b.dataset.postCopy}"]`).value).then((ok) => toast(ok ? 'Copied. Paste it into the post.' : 'Select the text and copy it.')); return; }
    if (b.dataset.postManual) {
      const net = b.dataset.postManual;
      const url = prompt(`Paste the link to the ${net === 'facebook' ? 'Facebook' : 'Google'} post (optional):`, '');
      if (url === null) return;
      return run(async () => { show = await api(`/api/shows/${show.id}/post/${net}`, { method: 'POST', body: { manual: true, url } }); editor(); toast('Marked as posted.'); }, b);
    }
    if (b.hasAttribute('data-write')) {
      return run(async () => {
        if (dirty) await saveShow(true);
        suggestions = await api(`/api/shows/${show.id}/write`, { method: 'POST', body: { notes: $('#w-notes').value } });
        $('#w-out').innerHTML = suggestionsHtml(); b.disabled = false; b.textContent = 'Write again';
      }, b);
    }
    if (b.dataset.use) {
      const k = b.dataset.use;
      if (k === 'summary' || k === 'description') { f[k].value = suggestions[k]; markDirty(); if (k === 'summary') $('#sum-count').textContent = `${f.summary.value.length}/140`; }
      else $(`[data-post="${k}"]`).value = suggestions[k];
      toast(k === 'facebook' || k === 'google' ? 'Put in the post below.' : 'Used. Press Save to keep it.');
      return;
    }
    if (b.hasAttribute('data-copy')) {
      const date = $('#c-date').value, weeks = $('#c-weeks').value;
      if (!date && !weeks) return toast('Pick a date or a number of weeks.', true);
      return run(async () => {
        if (dirty) await saveShow(true);
        const r = await api(`/api/shows/${show.id}/copy`, { method: 'POST', body: weeks ? { weekly: weeks } : { dates: [date] } });
        await loadMonth(); toast(`${r.made.length} draft ${r.made.length === 1 ? 'copy' : 'copies'} made. Publish each when it’s ready.`);
        b.disabled = false; b.textContent = 'Make copies';
      }, b);
    }
    if (b.hasAttribute('data-delete')) {
      if (!confirm('Delete this show? This can’t be undone.')) return;
      return run(async () => { await api(`/api/shows/${show.id}/delete`, { method: 'POST' }); dirty = false; await loadMonth(); home(); history.replaceState(null, '', `/shows?m=${ym}`); }, b);
    }
  });
}

if (root) {
  start();
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.m !== undefined) {
      if (dirty && !confirm('You have unsaved changes. Leave them?')) return;
      ym = b.dataset.m === '0' ? setup.today.slice(0, 7) : addMonths(ym, Number(b.dataset.m));
      dirty = false; await loadMonth(); history.replaceState(null, '', `/shows?m=${ym}`); if (!show) home();
      return;
    }
    if (b.dataset.new) return newShow(b.dataset.new);
    if (b.dataset.show) return openShow(b.dataset.show);
    if (b.dataset.night) { if (dirty && !confirm('You have unsaved changes. Leave them?')) return; dirty = false; return pickNight(b.dataset.night); }
    if (b.dataset.adopt) {
      return run(async () => { const s = await api('/api/shows', { method: 'POST', body: { fromNight: b.dataset.adopt } }); await loadMonth(); await openShow(s.id); }, b);
    }
  });
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
}
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'sign-out') return;
  await api('/api/staff/signout', { method: 'POST' }).catch(() => {});
  location.href = '/shows';
});
