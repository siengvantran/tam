// The food guide: filters on /food, claiming a listing, pre-orders, a customer's
// order, and the traders' own page (/food/me): profile, menu, pre-order settings,
// orders and each night's prep list.

import { $, $$, api, formMessage, shrinkImage, pounds } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = new URLSearchParams(location.search);

// ----- /food: filters -----
const grid = $('#fd-grid');
if (grid) {
  $$('.fd-filters .chip').forEach((b) => b.addEventListener('click', () => {
    $$('.fd-filters .chip').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    const [k, v] = b.dataset.f.split(':');
    let n = 0;
    $$('.fd-card', grid).forEach((c) => { const show = k === 'all' || (k === 'cat' ? c.dataset.cat === v : c.dataset.diet.split(' ').includes(v)); c.hidden = !show; n += show; });
    $('.fd-none').hidden = n > 0;
  }));
}

// ----- a listing: claim it -----
const claim = $('#fd-claim');
if (claim) {
  if (location.hash === '#claim') claim.closest('details').open = true;
  claim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(claim);
    if (!d.get('consent')) return formMessage(claim, 'Tick the box to confirm.');
    try {
      const r = await api(`/api/food/${claim.dataset.slug}/claim`, { method: 'POST', body: { ...Object.fromEntries(d), consent: true } });
      claim.innerHTML = `<p class="good">${r.already ? 'We already have your claim.' : 'Thanks: we’ve got your claim.'} TAM checks it, then emails you a link to manage your listing.</p>`;
    } catch (err) { formMessage(claim, err.message); }
  });
}

// ----- sign in, open the link -----
const signin = $('#fd-signin');
if (signin) signin.addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/food/sign-in', { method: 'POST', body: { email: signin.email.value } }); formMessage(signin, `If ${signin.email.value} manages a listing, a sign-in link is on its way.`, true); }
  catch (err) { formMessage(signin, err.message); }
});
const inBox = $('#fd-in');
if (inBox) $('button', inBox).addEventListener('click', async () => {
  try { const r = await api('/api/food/in', { method: 'POST', body: { t: q.get('t') } }); location.href = r.next; }
  catch (err) { formMessage(inBox, err.message); }
});

// ----- an invite from TAM -----
const join = $('#fd-join');
if (join) (async () => {
  try {
    const d = await api(`/api/food/join?t=${encodeURIComponent(q.get('t') || '')}`);
    const v = d.vendor || {};
    join.innerHTML = `<div class="formbox"><div class="fd-join-head">${v.photo ? `<img src="${esc(v.photo)}" alt="" width="120" height="90">` : ''}<div><h2>${esc(v.name)}</h2><p class="small muted">${esc(v.tagline)}</p></div></div>
      <p>We’ve made a draft listing for ${esc(v.name)} on TAM’s food guide from your Mercato Metropolitano page. Add your email to manage it: check your profile and menu, and turn on pre-orders for TAM nights if you’d like to take part. Nothing goes live until you and TAM are happy with it.</p>
      <form id="fd-join-f" novalidate><div class="fields"><label class="field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name"></label>
      <label class="field"><span>Your role</span><input name="role" maxlength="80" placeholder="Owner, manager…"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" value="${esc(d.email)}"></label>
      <label class="field"><span>Phone (optional, private)</span><input name="phone" type="tel" maxlength="30"></label>
      <label class="check full"><input type="checkbox" name="consent"> <span>I run or manage ${esc(v.name)}, and I’m happy for TAM to contact me about this listing and pre-orders.</span></label></div>
      <button class="btn hot" type="submit">Email me my sign-in link</button><p class="err" role="status" aria-live="polite"></p></form></div>`;
    const f = $('#fd-join-f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      if (!fd.get('consent')) return formMessage(f, 'Tick the box to confirm.');
      try { await api('/api/food/join', { method: 'POST', body: { ...Object.fromEntries(fd), consent: true, t: q.get('t') } }); f.innerHTML = `<p class="good">Done. Check ${esc(fd.get('email'))} for your sign-in link.</p>`; }
      catch (err) { formMessage(f, err.message); }
    });
  } catch (err) { join.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
})();

// ----- pre-order -----
const pre = $('#fd-pre');
if (pre) (async () => {
  const D = await api(`/api/food/preorder${q.get('night') ? `?night=${encodeURIComponent(q.get('night'))}` : ''}`);
  if (!D.nights.length) { pre.innerHTML = '<p>No traders are taking pre-orders for the coming nights yet. <a href="/food">See every trader</a>.</p>'; return; }
  let night = D.nights.find((n) => n.selected) || D.nights[0];
  let vendor = night.vendors.find((v) => v.slug === q.get('vendor')) || null;
  const cart = {};
  const cut = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const draw = () => {
    const total = vendor ? vendor.menu.reduce((t, m) => t + (cart[m.id] || 0) * m.price, 0) : 0;
    pre.innerHTML = `<div class="fd-steps">
      <div class="formbox"><h2>1. Your night</h2><div class="row-btn">${D.nights.map((n) => `<button type="button" class="chip ${n.slug === night.slug ? 'on' : ''}" data-night="${esc(n.slug)}">${esc(n.title)} · ${esc(`${n.weekday} ${n.day} ${n.month}`)}</button>`).join('')}</div></div>
      <div class="formbox"><h2>2. A trader</h2><div class="fd-grid small">${night.vendors.map((v) => `<button type="button" class="fd-card ${vendor && vendor.slug === v.slug ? 'on' : ''}" data-vendor="${esc(v.slug)}"><div class="fd-pic">${v.photo ? `<img src="${esc(v.photo)}" alt="" width="240" height="180" loading="lazy">` : ''}</div><div class="fd-body"><b>${esc(v.name)}</b><small>${esc(v.tagline)}</small><small class="muted">Order by ${esc(cut(v.cutoff))}</small></div></button>`).join('')}</div></div>
      ${vendor ? `<form class="formbox" id="fd-pre-f" novalidate><h2>3. Your order from ${esc(vendor.name)}</h2>
        <ul class="fd-pick">${vendor.menu.map((m) => `<li><div><b>${esc(m.name)}</b>${m.description ? `<small>${esc(m.description)}</small>` : ''}</div><span>${pounds(m.price)}</span>
          <span class="fd-qty"><button type="button" data-dec="${esc(m.id)}" aria-label="One less ${esc(m.name)}">−</button><output>${cart[m.id] || 0}</output><button type="button" data-inc="${esc(m.id)}" aria-label="One more ${esc(m.name)}">+</button></span></li>`).join('')}</ul>
        <p class="fd-total">Total <b>${pounds(total)}</b> · pay ${esc(vendor.name)} when you collect</p>
        <div class="fields"><label class="field"><span>Collect at</span><select name="collect" required>${night.slots.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
          <label class="field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name"></label>
          <label class="field"><span>Email (for your confirmation)</span><input name="email" type="email" required autocomplete="email"></label>
          <label class="field"><span>Phone (optional, for the trader)</span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
          <label class="field"><span>TAM booking reference (optional)</span><input name="booking" maxlength="40"></label>
          <label class="field full"><span>Notes, like allergies (optional)</span><input name="notes" maxlength="300"></label></div>
        ${vendor.collect ? `<p class="small">Collect from: ${esc(vendor.collect)}</p>` : ''}
        <p class="small muted">Plans change? Cancel from your confirmation email before ${esc(cut(vendor.cutoff))}, so no food goes to waste.</p>
        <button class="btn hot" type="submit">Place my pre-order</button><p class="err" role="status" aria-live="polite"></p></form>` : '<p class="muted">Pick a trader to see what you can pre-order.</p>'}</div>`;
    $$('[data-night]', pre).forEach((b) => b.onclick = () => { night = D.nights.find((n) => n.slug === b.dataset.night); vendor = null; for (const k in cart) delete cart[k]; draw(); });
    $$('[data-vendor]', pre).forEach((b) => b.onclick = () => { vendor = night.vendors.find((v) => v.slug === b.dataset.vendor); for (const k in cart) delete cart[k]; draw(); $('#fd-pre-f').scrollIntoView({ behavior: 'smooth' }); });
    $$('[data-inc]', pre).forEach((b) => b.onclick = () => { cart[b.dataset.inc] = Math.min(20, (cart[b.dataset.inc] || 0) + 1); keep(draw); });
    $$('[data-dec]', pre).forEach((b) => b.onclick = () => { cart[b.dataset.dec] = Math.max(0, (cart[b.dataset.dec] || 0) - 1); keep(draw); });
    const f = $('#fd-pre-f');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const items = Object.entries(cart).filter(([, n]) => n).map(([id, qty]) => ({ id, qty }));
      if (!items.length) return formMessage(f, 'Add at least one dish.');
      try {
        const r = await api('/api/food/preorder', { method: 'POST', body: { ...Object.fromEntries(new FormData(f)), night: night.slug, vendor: vendor.slug, items } });
        pre.innerHTML = `<div class="formbox"><h2>Your order is in</h2><p>${esc(vendor.name)} will have it ready at ${esc(f.collect.value)} on ${esc(`${night.weekday} ${night.day} ${night.month}`)}. Total ${pounds(r.total)}, paid when you collect.</p><p>We’ve emailed your confirmation, with a link to change your mind.</p><p><a class="btn ghost" href="/food/preorder?night=${esc(night.slug)}">Order from another trader</a></p></div>`;
      } catch (err) { formMessage(f, err.message); }
    });
  };
  // keep what's typed in the form across a redraw
  const keep = (fn) => { const f = $('#fd-pre-f'); const vals = f ? Object.fromEntries(new FormData(f)) : {}; fn(); const g = $('#fd-pre-f'); if (g) for (const [k, v] of Object.entries(vals)) if (g[k]) g[k].value = v; };
  draw();
})().catch((err) => { pre.innerHTML = `<p class="err">${esc(err.message)}</p>`; });

// ----- a customer's order -----
const ord = $('#fd-order');
if (ord) (async () => {
  const id = location.pathname.split('/').pop();
  const k = q.get('k');
  const d = await api(`/api/food/order/${encodeURIComponent(id)}?k=${encodeURIComponent(k || '')}`);
  const o = d.order;
  ord.innerHTML = `<div class="formbox"><h2>${esc(d.vendor ? d.vendor.name : '')}</h2><p>${esc(d.night ? `${d.night.title} · ${d.night.weekday} ${d.night.day} ${d.night.month}` : '')} · collect at <b>${esc(o.collect)}</b>${d.vendor && d.vendor.collect ? ` from ${esc(d.vendor.collect)}` : ''}</p>
    <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)} · ${pounds(i.qty * i.price)}</li>`).join('')}</ul><p><b>Total ${pounds(o.total)}</b>, pay when you collect · <span class="fd-state">${esc(o.status)}</span></p>
    ${d.canCancel ? '<button class="btn ghost" type="button" id="fd-cancel">Cancel my order</button>' : ''}<p class="err" role="status" aria-live="polite"></p></div>`;
  const c = $('#fd-cancel');
  if (c) c.onclick = async () => {
    if (!confirm('Cancel this pre-order?')) return;
    try { await api(`/api/food/order/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { k } }); location.reload(); } catch (err) { formMessage(ord, err.message); }
  };
})().catch((err) => { ord.innerHTML = `<p class="err">${esc(err.message)}</p>`; });

// ----- traders: /food/me -----
const me = $('#fd-me');
if (me) {
  let D = null, slug = null, tab = 'orders';
  const load = async () => { D = await api('/api/food/me'); slug = slug && D.vendors.some((v) => v.slug === slug) ? slug : (D.vendors[0] || {}).slug; };
  const night = (s) => D.nights.find((n) => n.slug === s) || { title: s, weekday: '', day: '', month: '' };
  const nlabel = (n) => `${n.title} · ${n.weekday} ${n.day} ${n.month}`;
  const draw = () => {
    const v = D.vendors.find((x) => x.slug === slug);
    if (!v) { me.innerHTML = '<p>No listings yet.</p>'; return; }
    const upcomingOrders = v.orders.filter((o) => o.status !== 'cancelled');
    me.innerHTML = `<div class="shows-top"><div><div class="label">TAM food guide · ${esc(D.email)}</div><h1 class="chrome gold">${esc(v.name)}</h1>
      <p class="small">${v.status === 'live' ? `Live on <a href="/food/${esc(v.slug)}">tam.tv/food/${esc(v.slug)}</a>` : 'Not live yet: TAM is checking your listing.'}${v.pending ? ' · An update is waiting for TAM to approve.' : ''}</p></div>
      <div class="small">${D.vendors.length > 1 ? `<select id="fd-which">${D.vendors.map((x) => `<option value="${esc(x.slug)}" ${x.slug === slug ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select> · ` : ''}<button class="linkish" type="button" id="fd-out">Sign out</button></div></div>
      ${v.rejected && !v.pending ? `<p class="formbox small">TAM couldn’t publish your last update${v.rejected.reason ? `: “${esc(v.rejected.reason)}”` : '.'} Edit it below and send it again.</p>` : ''}
      <nav class="cm-tabs">${[['orders', `Orders and prep (${upcomingOrders.length})`], ['preorder', `Pre-orders: ${v.preorder.enabled ? 'on' : 'off'}`], ['profile', 'Profile and menu']].map(([k, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav><div id="fd-tab"></div>`;
    $('#fd-out').onclick = async () => { await api('/api/food/signout', { method: 'POST', body: {} }).catch(() => {}); location.href = '/food'; };
    if ($('#fd-which')) $('#fd-which').onchange = (e) => { slug = e.target.value; draw(); };
    $$('[data-tab]', me).forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
    const t = $('#fd-tab');
    if (tab === 'orders') drawOrders(t, v);
    else if (tab === 'preorder') drawPreorder(t, v);
    else drawProfile(t, v);
  };
  const drawOrders = (t, v) => {
    const nights = Object.keys(v.prep);
    t.innerHTML = nights.length ? nights.map((s) => { const p = v.prep[s]; const n = night(s); const os = v.orders.filter((o) => o.night === s);
      return `<section class="formbox fd-prep"><h2>${esc(nlabel(n))}</h2>
        <p><b>${p.orders}</b> order${p.orders === 1 ? '' : 's'} · ${pounds(p.total)} to take on collection · <a href="/api/food/me/${esc(v.slug)}/orders.csv?night=${esc(s)}">Download (CSV)</a></p>
        <div class="fd-prep-grid"><div><h3>Prep list</h3><ul>${Object.entries(p.items).sort((a, b) => b[1] - a[1]).map(([k, n0]) => `<li><b>${n0}</b> × ${esc(k)}</li>`).join('')}</ul></div>
        <div><h3>Collection times</h3><ul>${Object.entries(p.bySlot).sort().map(([k, n0]) => `<li>${esc(k)}: ${n0} order${n0 === 1 ? '' : 's'}</li>`).join('')}</ul></div></div>
        <table class="fd-orders"><thead><tr><th>Time</th><th>Name</th><th>Order</th><th>Total</th><th>Status</th></tr></thead><tbody>${os.sort((a, b) => a.collect.localeCompare(b.collect)).map((o) => `<tr class="${o.status === 'cancelled' ? 'muted' : ''}"><td>${esc(o.collect)}</td><td>${esc(o.name)}${o.phone ? `<br><small>${esc(o.phone)}</small>` : ''}</td>
          <td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join('<br>')}${o.notes ? `<br><small>“${esc(o.notes)}”</small>` : ''}</td><td>${pounds(o.total)}</td>
          <td>${o.status === 'cancelled' ? 'Cancelled' : `<select data-order="${esc(o.id)}">${Object.entries(D.statuses).filter(([k]) => k !== 'new' || o.status === 'new').map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table></section>`; }).join('')
      : `<p class="muted">No pre-orders yet.${v.preorder.enabled ? ' They’ll show here as they come in, with a prep list for each night.' : ' Turn pre-orders on to start taking them.'}</p>`;
    $$('[data-order]', t).forEach((s) => s.onchange = async () => {
      let message = '';
      if (s.value === 'cancelled') { message = prompt('Tell the customer why (optional):') ?? null; if (message === null) { s.value = 'new'; return; } }
      try { await api(`/api/food/me/orders/${s.dataset.order}`, { method: 'POST', body: { status: s.value, message } }); await load(); draw(); } catch (err) { alert(err.message); }
    });
  };
  const drawPreorder = (t, v) => {
    const P = v.preorder;
    const priced = v.menu.some((m) => m.price !== null);
    t.innerHTML = `<form class="formbox" id="fd-po"><h2>Pre-orders for TAM nights</h2>
      <p>People coming to a TAM night order from you ahead of time, pick a collection time and pay you when they collect. You get an email for each order, and a prep list for each night here, so you know what to cook before the doors open.</p>
      ${v.status !== 'live' ? '<p class="small">Your listing isn’t live yet: pre-orders start once TAM publishes it.</p>' : ''}${!priced ? '<p class="small"><b>Add prices to your menu</b> (Profile and menu) so people can order.</p>' : ''}
      <label class="check"><input type="checkbox" name="enabled" ${P.enabled ? 'checked' : ''}> <span><b>Take pre-orders</b></span></label>
      <div class="fields"><label class="field"><span>Close orders this many hours before the night starts</span><input name="cutoffHours" type="number" min="2" max="96" value="${P.cutoffHours}"></label>
      <label class="field"><span>Most orders per night (0 = no limit)</span><input name="maxOrders" type="number" min="0" max="500" value="${P.maxOrders}"></label>
      <label class="field full"><span>Where people collect (shown to them)</span><input name="collect" maxlength="120" value="${esc(P.collect)}" placeholder="e.g. our counter in the warehouse, say your name"></label></div>
      <fieldset class="fd-nights"><legend>Which nights</legend><label class="check"><input type="radio" name="which" value="all" ${P.nights === 'all' ? 'checked' : ''}> <span>Every TAM night</span></label>
      <label class="check"><input type="radio" name="which" value="some" ${P.nights !== 'all' ? 'checked' : ''}> <span>Only these:</span></label>
      <div class="fd-night-list">${D.nights.filter((n) => !n.timesTbc).map((n) => `<label class="check small"><input type="checkbox" name="night" value="${esc(n.slug)}" ${Array.isArray(P.nights) && P.nights.includes(n.slug) ? 'checked' : ''}> <span>${esc(nlabel(n))}</span></label>`).join('')}</div></fieldset>
      <button class="btn hot" type="submit">Save</button><p class="err" role="status" aria-live="polite"></p></form>`;
    const f = $('#fd-po');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nights = f.which.value === 'all' ? 'all' : $$('input[name=night]:checked', f).map((x) => x.value);
      try { await api(`/api/food/me/${v.slug}/preorder`, { method: 'POST', body: { enabled: f.enabled.checked, nights, cutoffHours: f.cutoffHours.value, maxOrders: f.maxOrders.value, collect: f.collect.value } }); await load(); draw(); formMessage($('#fd-po'), 'Saved.', true); }
      catch (err) { formMessage(f, err.message); }
    });
  };
  const drawProfile = (t, v) => {
    const P = v.pending ? { ...v, ...v.pending.changes } : v;
    let menu = P.menu.map((m) => ({ ...m, price: m.price === null ? '' : (m.price / 100).toFixed(2) }));
    let photos = [...P.photos];
    const dietBoxes = (name, list) => Object.entries(D.dietary).map(([k, l]) => `<label class="check small"><input type="checkbox" name="${name}" value="${k}" ${list.includes(k) ? 'checked' : ''}> <span>${l}</span></label>`).join('');
    const rows = () => menu.map((m, i) => `<div class="fd-mrow" data-i="${i}"><input name="section" value="${esc(m.section)}" placeholder="Section" maxlength="40"><input name="name" value="${esc(m.name)}" placeholder="Dish" maxlength="80"><input name="price" value="${esc(m.price)}" placeholder="£" inputmode="decimal" maxlength="7"><input name="description" value="${esc(m.description)}" placeholder="Short description" maxlength="200">
      <span class="fd-mdiet">${Object.keys(D.dietary).map((k) => `<label title="${D.dietary[k]}"><input type="checkbox" value="${k}" ${m.dietary.includes(k) ? 'checked' : ''}>${k === 'gluten-free' ? 'GF' : k[0].toUpperCase() + (k === 'vegan' ? 'e' : '')}</label>`).join('')}</span><button type="button" class="linkish" data-del="${i}" aria-label="Remove">✕</button></div>`).join('');
    t.innerHTML = `<form class="formbox" id="fd-prof" novalidate><h2>Your profile</h2><p class="small muted">TAM checks each update before it shows. Phone numbers and email addresses can’t go on the page.</p>
      <div class="fields"><label class="field"><span>Name</span><input name="name" maxlength="60" value="${esc(P.name)}"></label>
      <label class="field"><span>One line about you</span><input name="tagline" maxlength="120" value="${esc(P.tagline)}"></label>
      <label class="field"><span>Type</span><select name="category">${Object.entries(D.categories).map(([k, l]) => `<option value="${k}" ${P.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Instagram</span><input name="instagram" maxlength="60" value="${P.instagram ? `@${esc(P.instagram)}` : ''}" placeholder="@yourname"></label>
      <label class="field full"><span>Website</span><input name="website" maxlength="200" value="${esc(P.website)}"></label>
      <label class="field full"><span>About you</span><textarea name="description" rows="5" maxlength="1500">${esc(P.description)}</textarea></label>
      <div class="field full"><span>Dietary options you offer</span><div class="row-btn">${dietBoxes('dietary', P.dietary)}</div></div></div>
      <h3>Photos</h3><div class="jm-thumbs" id="fd-photos"></div><label class="btn ghost small">Add a photo<input type="file" accept="image/*" id="fd-photo" hidden></label>
      <h3>Menu</h3><p class="small muted">Dishes with a price can be pre-ordered. V = vegetarian, Ve = vegan, H = halal, GF = gluten-free.</p><div id="fd-menu">${rows()}</div>
      <button type="button" class="btn ghost small" id="fd-add">Add a dish</button>
      <p><button class="btn hot" type="submit">Send to TAM to approve</button></p><p class="err" role="status" aria-live="polite"></p></form>`;
    const f = $('#fd-prof');
    const readRows = () => { menu = $$('.fd-mrow', f).map((r0) => ({ id: (menu[r0.dataset.i] || {}).id || '', section: $('[name=section]', r0).value, name: $('[name=name]', r0).value, price: $('[name=price]', r0).value.replace('£', '').trim(), description: $('[name=description]', r0).value, dietary: $$('.fd-mdiet input:checked', r0).map((x) => x.value) })); };
    const redrawRows = () => { $('#fd-menu').innerHTML = rows(); bindRows(); };
    const bindRows = () => $$('[data-del]', f).forEach((b) => b.onclick = () => { readRows(); menu.splice(Number(b.dataset.del), 1); redrawRows(); });
    bindRows();
    const drawPhotos = () => { $('#fd-photos').innerHTML = photos.map((u, i) => `<figure><img src="${esc(u)}" alt="" width="120" height="90"><button type="button" class="linkish" data-rm="${i}">Remove</button></figure>`).join('') || '<small class="muted">No photos yet</small>'; $$('[data-rm]', f).forEach((b) => b.onclick = () => { photos.splice(Number(b.dataset.rm), 1); drawPhotos(); }); };
    drawPhotos();
    $('#fd-add').onclick = () => { readRows(); menu.push({ section: (menu[menu.length - 1] || {}).section || '', name: '', price: '', description: '', dietary: [] }); redrawRows(); };
    $('#fd-photo').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { const data = await shrinkImage(file, 1400); const r = await api(`/api/food/me/${v.slug}/photo`, { method: 'POST', body: { photo: data } }); photos.push(r.photo); drawPhotos(); }
      catch (err) { formMessage(f, err.message); }
    };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      readRows();
      const body = { name: f.name.value, tagline: f.tagline.value, category: f.category.value, instagram: f.instagram.value, website: f.website.value, description: f.description.value,
        dietary: $$('input[name=dietary]:checked', f).map((x) => x.value), photos, menu: menu.filter((m) => m.name.trim()) };
      try { await api(`/api/food/me/${v.slug}`, { method: 'POST', body }); await load(); tab = 'profile'; draw(); formMessage($('#fd-prof'), 'Sent. TAM will check it and email you when it’s live.', true); }
      catch (err) { formMessage(f, err.message); }
    });
  };
  load().then(draw).catch(() => { me.innerHTML = '<div class="formbox"><h2>Sign in</h2><p>Open your trader page from the link we emailed you, or <a href="/food/sign-in">get a new link</a>.</p></div>'; });
}
