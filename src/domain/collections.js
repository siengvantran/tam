// Numbered verified collections: a fixed run of numbered copies (Dana's 108
// signed books, and later prints, vinyl or anything signed), each with a
// certificate code anyone can check at /verify.

import crypto from 'node:crypto';
import { quoteCollection } from '../../shared/pricing.js';
import { fail, send, readJson, text, email, newId } from '../lib/http.js';
import { orderEmail } from '../services/mailer.js';

export function collectionsDomain(ctx, tickets) {
  const { db, save, content: c, cfg } = ctx;
  const holds = tickets.holds;

  const certCode = (col, item, number) => {
    const sig = crypto.createHmac('sha256', ctx.secret).update(`cert:${col.slug}:${item}:${number}`).digest('hex').slice(0, 4).toUpperCase();
    return `${col.codePrefix || 'TAM'}-${item.toUpperCase().slice(0, 4)}-${String(number).padStart(3, '0')}-${sig}`;
  };
  const taken = (col, item, except) => {
    const s = new Set();
    for (const o of db.orders) if (o !== except && o.collection === col.slug && holds(o)) for (const x of o.copies) if (x.item === item) s.add(x.number);
    return s;
  };
  const left = (col) => Object.fromEntries(col.items.map((it) => [it.id, col.size - taken(col, it.id).size]));
  const orderView = (o) => ({ id: o.id, status: o.status, total: o.total, delivery: o.delivery, copies: o.copies.map(({ title, number, code }) => ({ title, number, code })) });

  async function notify(o) {
    if (!ctx.mail.enabled()) return;
    const col = c.collectionBy.get(o.collection);
    try { await ctx.mail.send(orderEmail(o, col, `${cfg.siteUrl}/verify`)); o.emailedAt = new Date(ctx.now()).toISOString(); }
    catch (e) { o.emailError = e.message; }
    await save();
  }

  // Paid after its hold lapsed? Copies whose numbers went to someone else get new ones.
  function markPaid(o) {
    if (o.status === 'paid' || o.status === 'fulfilled') return;
    const lapsed = !holds(o);
    o.status = 'paid';
    o.paidAt = new Date(ctx.now()).toISOString();
    if (lapsed) {
      const col = c.collectionBy.get(o.collection);
      for (const copy of o.copies) {
        const others = taken(col, copy.item, o);
        if (!others.has(copy.number)) continue;
        const mine = new Set(o.copies.filter((x) => x !== copy && x.item === copy.item).map((x) => x.number));
        let n = 1;
        while (n <= col.size && (others.has(n) || mine.has(n))) n++;
        if (n > col.size) { o.needsAttention = 'Paid after its hold lapsed and the collection had sold out: refund or resolve.'; continue; }
        copy.number = n;
        copy.code = certCode(col, copy.item, n);
        o.needsAttention = 'Paid after its hold lapsed: copies renumbered.';
      }
    }
    notify(o);
  }

  function routes(r) {
    r.get('/api/collections/:slug', (req, res, { params }) => {
      const col = c.collectionBy.get(params.slug);
      if (!col) throw fail(404, 'No such collection.');
      send(res, 200, { left: left(col), size: col.size, payments: ctx.stripe.enabled ? 'card' : 'invoice' });
    });

    r.post('/api/orders', async (req, res) => {
      const body = await readJson(req, 8 * 1024);
      const col = c.collectionBy.get(body.collection);
      if (!col) throw fail(400, 'Choose a collection.');
      const q = quoteCollection(col, body.items, body.delivery);
      if (q.error) throw fail(400, q.error);
      const o = {
        id: newId('ORD'), collection: col.slug, createdAt: new Date(ctx.now()).toISOString(), lines: q.lines, postage: q.postage, total: q.total,
        delivery: q.delivery, name: text(body.name, 80), email: email(body.email), phone: text(body.phone, 30),
        address: q.delivery === 'post' ? text(body.address, 300) : '', signedTo: text(body.signedTo, 40), copies: [],
        status: ctx.stripe.enabled ? 'awaiting_payment' : 'reserved',
      };
      if (!o.name) throw fail(400, 'Add your name.');
      if (!o.email) throw fail(400, 'Add a valid email address.');
      if (o.delivery === 'post' && o.address.length < 10) throw fail(400, 'Add your full UK postal address.');
      for (const l of q.lines) {
        const used = taken(col, l.id), free = [];
        for (let n = 1; n <= col.size && free.length < l.qty; n++) if (!used.has(n)) free.push(n);
        if (free.length < l.qty) throw fail(409, free.length ? `Only ${free.length} of ${l.title} left in the collection.` : `All ${col.size} of ${l.title} have gone.`);
        for (const number of free) o.copies.push({ item: l.id, title: l.title, number, code: certCode(col, l.id, number) });
      }
      if (o.status === 'awaiting_payment') o.holdUntil = new Date(ctx.now() + (cfg.holdMinutes + 5) * 60000).toISOString();
      db.orders.push(o);
      let checkoutUrl = null;
      if (ctx.stripe.enabled) {
        try {
          const lines = o.lines.map((l) => [`${l.title} · No. in ${col.name}`, l.qty, l.unit]);
          if (o.postage) lines.push(['UK post', 1, o.postage]);
          const back = `${ctx.base(req)}/collections/${col.slug}?order=${o.id}`;
          const s = await ctx.stripe.checkout({ email: o.email, ref: o.id, kind: 'order', lines, holdMinutes: cfg.holdMinutes, successUrl: `${back}&session_id={CHECKOUT_SESSION_ID}#order`, cancelUrl: `${back}&cancelled=1#order` });
          o.stripeSession = s.id;
          o.stripeSessions = [s.id];
          checkoutUrl = s.url;
        } catch (e) { o.status = 'cancelled'; await save(); throw e; }
      }
      await save();
      if (o.status === 'reserved') notify(o);
      send(res, 201, { order: orderView(o), checkoutUrl });
    });

    r.get('/api/orders/confirm', async (req, res, { url }) => {
      const o = db.orders.find((x) => x.id === url.searchParams.get('ref'));
      const sid = url.searchParams.get('session_id');
      if (!o || !sid || !(o.stripeSessions || []).includes(sid)) throw fail(404, 'Order not found.');
      if (url.searchParams.get('cancelled') && o.status === 'awaiting_payment') { o.status = 'cancelled'; ctx.stripe.expire(sid); }
      else if (ctx.stripe.enabled && o.status === 'awaiting_payment') {
        const s = await ctx.stripe.session(sid);
        if (s.payment_status !== 'unpaid') markPaid(o);
        else if (s.status === 'complete') o.status = 'processing';
      }
      await save();
      send(res, 200, { order: orderView(o) });
    });

    // Anyone can check a certificate: the number and item, nothing personal.
    r.get('/api/verify', (req, res, { url }) => {
      const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
      for (const o of db.orders) {
        if (!holds(o)) continue;
        const copy = o.copies.find((x) => x.code === code);
        if (copy) {
          const col = c.collectionBy.get(o.collection);
          return send(res, 200, { code, number: copy.number, size: col.size, title: copy.title, collection: col.name,
            status: ['paid', 'fulfilled'].includes(o.status) ? 'verified' : 'reserved', since: (o.paidAt || o.createdAt).slice(0, 10) });
        }
      }
      throw fail(404, 'That code isn’t in a TAM verified collection. Check it and try again.');
    });
  }

  return { routes, markPaid, left, orderView };
}
