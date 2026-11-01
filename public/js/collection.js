// Numbered collections (/collections/<slug>) and certificate checks (/verify).

import { quoteCollection } from '/shared/pricing.js';
import { $, api, pageData, pounds, formMessage } from './lib.js';

const { collection: col } = pageData();
const form = $('#order-form');
if (form && col) {
  const items = () => Object.fromEntries(col.items.map((it) => [it.id, Number(form[`item-${it.id}`].value || 0)]));
  const update = () => {
    const delivery = form.delivery.value;
    $('#addr-field').hidden = delivery !== 'post';
    const q = quoteCollection(col, items(), delivery);
    $('#o-total').textContent = q.error ? '£0' : pounds(q.total);
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const r = await api('/api/orders', { method: 'POST', body: {
        collection: col.slug, items: items(), delivery: f.get('delivery'), name: f.get('name'), email: f.get('email'),
        phone: f.get('phone'), signedTo: f.get('signedTo'), address: f.get('address'),
      } });
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return; }
      show(r.order);
    } catch (err) { formMessage(form, err.message); }
  });
  const show = (o) => {
    const out = $('#order');
    out.hidden = false;
    out.innerHTML = `<h3>${o.status === 'paid' ? 'Thank you! Your copies are numbered' : 'Your copies are reserved'}</h3><p>Order <b>${o.id}</b> · ${pounds(o.total)}</p>
      <ul class="plain">${o.copies.map((c) => `<li>${c.title} · No. ${c.number} of ${col.size} · certificate <code>${c.code}</code></li>`).join('')}</ul>`;
    form.hidden = o.status !== 'cancelled';
  };
  const p = new URLSearchParams(location.search);
  if (p.get('order') && p.get('session_id')) {
    api(`/api/orders/confirm?${new URLSearchParams({ ref: p.get('order'), session_id: p.get('session_id'), ...(p.get('cancelled') ? { cancelled: '1' } : {}) })}`).then((r) => show(r.order)).catch(() => {});
  }
  update();
}

const vf = $('#verify-form');
if (vf) {
  const run = async (code) => {
    const out = $('#verify-out');
    try {
      const r = await api(`/api/verify?code=${encodeURIComponent(code)}`);
      out.innerHTML = `<div class="ok"><h3>${r.status === 'verified' ? '✓ Verified' : 'Reserved (not yet paid)'}</h3><p><b>${r.title}</b>, No. ${r.number} of ${r.size}, in ${r.collection}. Since ${r.since}.</p></div>`;
      formMessage(vf, '');
    } catch (err) { out.innerHTML = ''; formMessage(vf, err.message); }
  };
  vf.addEventListener('submit', (e) => { e.preventDefault(); run(vf.code.value); });
  const c = new URLSearchParams(location.search).get('code');
  if (c) { vf.code.value = c; run(c); }
}
