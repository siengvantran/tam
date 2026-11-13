// Booking, Team Tables, the Party Wall, sponsorship enquiries, invitations
// and the fundraising total. Prices come from /shared/pricing.js, the same
// code the server charges with.

import { quote, ticketOptions, donationOf } from '/shared/pricing.js';
import { $, api, pageData, pounds, shrinkImage, formMessage, still } from './lib.js';

const data = pageData();
const B = data.booking;
const fest = data.festival;
let avail = { nights: [], tables: [], payments: 'invoice' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadAvailability() {
  const q = B && B.festival ? `?festival=${encodeURIComponent(B.festival)}` : '';
  try { avail = await api(`/api/availability${q}`); } catch { /* the form still works */ }
  return avail;
}

// ---------------- the booking form ----------------
const form = $('#book-form');
if (form && B && B.nights.length) {
  const state = { night: null, type: null, give: 0, giveOther: false };
  const qty = $('#b-qty');
  const nightsEl = $('#b-nights'), typesEl = $('#b-types');
  const findNight = (slug) => B.nights.find((n) => n.slug === slug);
  const availFor = (slug) => avail.nights.find((n) => n.slug === slug) || {};

  function renderNights() {
    if (!nightsEl) return;
    nightsEl.innerHTML = B.nights.map((n) => {
      const a = availFor(n.slug);
      const off = a.onSale === false || a.left === 0;
      const from = a.from ?? null;
      return `<button type="button" data-night="${esc(n.slug)}" aria-pressed="${state.night === n.slug}" ${off ? 'disabled' : ''}>
        ${esc(n.weekday.slice(0, 3))} ${n.day} ${esc(n.month.slice(0, 3))}<small>${esc(n.label || (B.nights.length > 1 && !B.festival ? n.title : ''))}</small>
        <b>${off ? (a.left === 0 ? 'Sold out' : 'Closed') : from !== null ? `${n.sale.mode === 'own' ? 'from ' : ''}${pounds(from)}` : ''}</b></button>`;
    }).join('');
  }

  function renderTypes() {
    const n = findNight(state.night);
    if (!n) { typesEl.innerHTML = '<p class="hint">Pick a night first.</p>'; return; }
    const a = availFor(n.slug);
    const opts = a.options || ticketOptions(n.sale);
    if (!opts.some((o) => o.id === state.type)) state.type = (opts.find((o) => o.left !== 0) || opts[0] || {}).id;
    typesEl.innerHTML = opts.map((o) => `<label class="type"><input type="radio" name="type" value="${esc(o.id)}" ${o.id === state.type ? 'checked' : ''} ${o.left === 0 ? 'disabled' : ''}>
      ${o.tag ? `<span class="tag">${esc(o.tag)}</span>` : ''}<h4>${esc(o.name)}</h4>
      <p class="tp">${o.price === 0 ? 'Free' : pounds(o.price)}${o.pack ? ' a head' : ''}${o.left !== null && o.left !== undefined && o.left < 30 ? ` · ${o.left} left` : ''}</p>
      ${o.blurb || (o.pack && o.pack.blurb) ? `<p>${esc(o.blurb || o.pack.blurb)}</p>` : ''}
      ${o.until ? `<p>This price until ${esc(new Date(o.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))}</p>` : ''}</label>`).join('');
    const note = $('#b-type-note');
    const tiers = n.sale.mode === 'standard' ? (n.sale.groupTiers || []) : [];
    note.textContent = tiers.length ? `Groups pay less: ${tiers.slice().sort((x, y) => x.min - y.min).map((t) => `${t.min}+ save ${Math.round(t.off * 100)}%`).join(', ')}.` : '';
  }

  function renderTables() {
    const pick = $('#b-tables');
    if (!pick) return;
    const n = findNight(state.night);
    const list = (avail.tables || []).filter((t) => n && t.night === n.slug && t.left > 0);
    const joinOpt = $('#b-join-opt');
    joinOpt.hidden = !list.length;
    $('#b-join-note').textContent = list.length ? `${list.length} table${list.length > 1 ? 's' : ''} open on this night.` : '';
    const mix = form.querySelector('[name="mix"]:checked').value;
    pick.hidden = mix !== 'join' || !list.length;
    pick.innerHTML = list.map((t, i) => `<label class="opt"><input type="radio" name="tableId" value="${esc(t.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(t.teams.map((x) => x.name).join(' + '))}<small>${t.left} seats left${t.teams[0] && t.teams[0].blurb ? ` · ${esc(t.teams[0].blurb)}` : ''}</small></span></label>`).join('');
    if (mix === 'join' && !list.length) form.querySelector('[name="mix"][value="none"]').checked = true;
  }

  function renderGive() {
    const el = $('#b-give');
    if (!el || !B.donation) return;
    const opts = [[0, 'No thanks'], ...B.donation.presets.map((p) => [p, pounds(p)]), ['other', 'Your amount']];
    el.innerHTML = opts.map(([v, l]) => `<button type="button" class="chip" data-give="${v}" aria-pressed="${state.giveOther ? v === 'other' : v === state.give}">${l}</button>`).join('');
    $('#b-give-other').hidden = !state.giveOther;
  }

  function donation() {
    if (!B.donation) return { amount: 0 };
    if (!state.giveOther) return { amount: state.give };
    const v = form.donationOther.value;
    return v === '' ? { amount: 0 } : donationOf(Math.round(Number(v) * 100), B.donation);
  }

  function update() {
    const n = findNight(state.night);
    const a = n ? availFor(n.slug) : {};
    const sold = n && n.sale.capacity && a.left !== null && a.left !== undefined ? n.sale.capacity - a.left : 0;
    const q = n ? quote(n.sale, state.type, Number(qty.value), { sold }) : { error: 'Pick a night.' };
    const opt = n && (a.options || ticketOptions(n.sale)).find((o) => o.id === state.type);
    const pack = opt && opt.pack;
    const mix = form.querySelector('[name="mix"]:checked');
    const teamy = Boolean(pack && pack.needsTeam) || (mix && mix.value !== 'none');
    $('#b-team-field').hidden = !teamy;
    $('#b-blurb-field').hidden = !(mix && mix.value !== 'none');
    $('#b-vip').hidden = !(opt && opt.tableRequest);
    if ($('#b-mix-step')) $('#b-mix-step').hidden = !n;
    $('#s-night').textContent = n ? `${n.weekday} ${n.day} ${n.month}${n.label ? ` · ${n.label}` : ''}` : 'Pick a night';
    const gift = donation();
    if (q.error) {
      $('#s-tix').textContent = '–'; $('#s-deal').textContent = '–'; $('#s-save').textContent = '–'; $('#s-total').textContent = '£0';
      $('#b-qty-hint').textContent = n ? q.error : '';
      $('#b-pay').disabled = true;
    } else {
      $('#s-tix').textContent = `${q.qty} × ${pounds(q.unit)}`;
      $('#s-deal').textContent = q.label || q.name || 'Standard';
      $('#s-save').textContent = q.saving ? pounds(q.saving) : '–';
      $('#s-total').textContent = q.total + (gift.amount || 0) === 0 ? 'Free' : pounds(q.total + (gift.amount || 0));
      $('#b-qty-hint').textContent = gift.error || '';
      $('#b-pay').disabled = Boolean(gift.error);
    }
    // free tickets (and no donation): nothing to pay, no invoice: the tickets come by email
    const free = !q.error && q.total + (gift.amount || 0) === 0;
    $('#b-pay').textContent = free ? 'Book free tickets' : avail.payments === 'card' ? 'Pay by card' : 'Book tickets';
    $('#b-pay-note').textContent = free ? 'Free entry: we’ll email your tickets straight away.' : avail.payments === 'card' ? 'You’ll pay securely with Stripe.' : 'We’ll hold your tickets and send an invoice.';
    const bar = $('#tbar');
    if (bar) bar.hidden = !n;
  }

  form.addEventListener('click', (e) => {
    const nb = e.target.closest('[data-night]');
    if (nb && nightsEl.contains(nb)) { state.night = nb.dataset.night; renderNights(); renderTypes(); renderTables(); update(); }
    const st = e.target.closest('[data-step]');
    if (st) { qty.value = Math.max(1, Number(qty.value || 1) + Number(st.dataset.step)); update(); }
    const g = e.target.closest('[data-give]');
    if (g) { state.giveOther = g.dataset.give === 'other'; state.give = state.giveOther ? 0 : Number(g.dataset.give); renderGive(); update(); }
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') state.type = e.target.value;
    if (e.target.name === 'mix') renderTables();
    update();
  });
  form.addEventListener('input', (e) => { if (e.target === qty || e.target.name === 'donationOther') update(); });

  // Calendar cells and night cards on the page pick a night here.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.cal a[data-night]');
    if (!a || !findNight(a.dataset.night)) return;
    e.preventDefault();
    state.night = a.dataset.night; renderNights(); renderTypes(); renderTables(); update();
    $('#book').scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#b-err');
    err.textContent = '';
    const f = new FormData(form);
    const gift = donation();
    const btn = $('#b-pay');
    btn.disabled = true;
    try {
      const r = await api('/api/bookings', { method: 'POST', body: {
        night: state.night, type: state.type, qty: Number(qty.value), name: f.get('name'), email: f.get('email'), company: f.get('company'),
        teamName: f.get('teamName'), blurb: f.get('blurb'), mix: f.get('mix') || 'none', tableId: f.get('tableId'),
        tableRequest: f.get('tableRequest') === 'on', tableNote: f.get('tableNote'), donation: gift.amount || 0, joinClub: f.get('joinClub') === 'on', ref: (() => { try { return sessionStorage.getItem('tam:ref') || ''; } catch { return ''; } })(), via: B.via || new URLSearchParams(location.search).get('via') || '',
      } });
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return; }
      showBooked(r.booking);
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });

  function showBooked(b) {
    const ok = $('#book-ok');
    ok.hidden = false;
    const paid = b.status === 'paid';
    ok.innerHTML = `<h3>${paid ? 'You’re in!' : b.status === 'cancelled' ? 'Payment cancelled' : 'Your tickets are held'}</h3>
      <p>Reference <b>${esc(b.id)}</b> · ${esc(b.nightTitle)} · ${b.qty} ticket${b.qty > 1 ? 's' : ''} · ${pounds(b.total)}</p>
      ${b.status === 'cancelled' ? '<p>No payment was taken. You can book again above.</p>' : `<p>${paid ? 'Your ticket is ready. We’ve emailed it to you too.' : 'We’ll be in touch about payment. Your ticket page has your QR code.'}</p>
      <p><a class="btn hot" href="${esc(b.ticket)}">Open your ticket</a></p>${fest && fest.features.partyWall ? '<p class="hint">Having a party? Pin your brand on the Party Wall with this reference.</p>' : ''}`}`;
    if (b.status !== 'cancelled') form.hidden = true;
    ok.focus();
  }

  // Back from Stripe?
  const params = new URLSearchParams(location.search);
  if (params.get('booking') && params.get('k')) {
    const q = new URLSearchParams({ ref: params.get('booking'), k: params.get('k') });
    if (params.get('session_id')) q.set('session_id', params.get('session_id'));
    if (params.get('cancelled')) q.set('cancelled', '1');
    api(`/api/bookings/confirm?${q}`).then((r) => showBooked(r.booking)).catch(() => {});
  }

  state.night = B.preselect || new URLSearchParams(location.search).get('night') || (B.nights.length === 1 ? B.nights[0].slug : null);
  renderGive();
  loadAvailability().then(() => {
    if (state.night && availFor(state.night).onSale === false) state.night = null;
    // Ask TAM's booking links arrive with the ticket and quantity chosen
    const want = new URLSearchParams(location.search);
    if (want.get('type')) state.type = want.get('type');
    if (Number(want.get('qty')) > 0) qty.value = Math.min(60, Math.floor(Number(want.get('qty'))));
    renderNights(); renderTypes(); renderTables(); update(); renderTeamTables(); renderRaised();
  });
  renderNights(); renderTypes(); update();
} else if (fest) {
  loadAvailability().then(() => { renderTeamTables(); renderRaised(); });
}

// ---------------- Team Tables ----------------
function renderTeamTables() {
  const list = $('#table-list');
  if (!list) return;
  const only = list.dataset.night;
  const tables = (avail.tables || []).filter((t) => !only || t.night === only);
  if (!tables.length) return;
  const nightName = (slug) => { const n = B && B.nights.find((x) => x.slug === slug); return n ? `${n.weekday} ${n.day} ${n.month}` : ''; };
  list.innerHTML = tables.map((t) => `<article class="ttable"><div class="label">${esc(nightName(t.night))}</div><h4>${esc(t.teams.map((x) => x.name).join(' + '))}</h4>
    ${t.teams.map((x) => (x.blurb ? `<p>${esc(x.blurb)}</p>` : '')).join('')}<p class="muted">${t.left ? `${t.left} of ${t.seats} seats free` : 'Full'}</p></article>`).join('');
}

// ---------------- fundraising total ----------------
function renderRaised() {
  const el = $('#raised');
  if (el && avail.raised > 0) { el.hidden = false; el.textContent = `${pounds(avail.raised)} raised so far. Thank you.`; }
}

// ---------------- the Party Wall ----------------
const pins = $('#pins');
if (pins) {
  api(`/api/pins?festival=${encodeURIComponent(pins.dataset.festival)}`).then(({ pins: list }) => {
    pins.innerHTML = list.length ? list.map((p) => `<article class="pin${p.featured ? ' gold' : ''}">${p.logo ? `<img src="${esc(p.logo)}" alt="">` : ''}<h4>${esc(p.company)}</h4>
      ${p.tagline ? `<p>${esc(p.tagline)}</p>` : ''}${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener nofollow">${esc(p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}</article>`).join('')
      : '<p class="muted">No pins yet. Book your party and be the first on the wall.</p>';
  }).catch(() => {});
  const pf = $('#pin-form');
  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(pf);
    try {
      const file = pf.logo.files[0];
      const logo = file ? await shrinkImage(file, 600, 0.85) : '';
      const r = await api('/api/pins', { method: 'POST', body: { ref: f.get('ref'), email: f.get('email'), company: f.get('company'), website: f.get('website'), tagline: f.get('tagline'), logo } });
      formMessage(pf, r.status === 'approved' ? 'Pinned! Refresh to see it.' : 'Thanks! Your pin goes up once we’ve checked it.', true);
      pf.reset();
    } catch (err) { formMessage(pf, err.message); }
  });
}

// ---------------- sponsorship ----------------
const sf = $('#spon-form');
if (sf) {
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(sf));
    try {
      const r = await api('/api/sponsors', { method: 'POST', body: { ...f, festival: sf.dataset.festival } });
      formMessage(sf, `Thank you. Your reference is ${r.id}. We’ll be in touch within two working days.`, true);
      sf.reset();
    } catch (err) { formMessage(sf, err.message); }
  });
}

// ---------------- invitations ----------------
const dlg = $('#invite-dialog');
if (dlg) {
  let current = '';
  const iform = $('#invite-form');
  const link = () => {
    const f = new FormData(iform);
    const q = new URLSearchParams();
    for (const k of ['to', 'from', 'm']) if (f.get(k)) q.set(k, f.get(k));
    return `${location.origin}/invite/${current}${q.toString() ? `?${q}` : ''}`;
  };
  const refresh = () => {
    const url = link();
    $('#invite-link').value = url;
    $('#invite-wa').href = `https://wa.me/?text=${encodeURIComponent(`You’re invited: ${url}`)}`;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-invite]');
    if (!b) return;
    current = b.dataset.invite; refresh();
    if (dlg.showModal) dlg.showModal(); else location.href = link();
  });
  iform.addEventListener('input', refresh);
  const share = $('#invite-share');
  if (navigator.share) { share.hidden = false; share.addEventListener('click', () => navigator.share({ title: 'You’re invited', url: link() }).catch(() => {})); }
}

