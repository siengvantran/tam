// Minimal Stripe client for ticket payments (Checkout). Plain HTTPS, no SDK.
//
//   STRIPE_SECRET_KEY      sk_live_… / sk_test_…   (enables paid tickets)
//   STRIPE_WEBHOOK_SECRET  whsec_…                  (confirms payments even if
//                                                   the buyer closes the tab)

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export function createStripe({ secretKey = process.env.STRIPE_SECRET_KEY, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET, fetcher = fetch } = {}) {
  const call = async (method, path, body) => {
    const res = await fetcher(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body ? form(body).toString() : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Stripe error ${res.status}`);
      err.status = 502;
      throw err;
    }
    return data;
  };

  return {
    enabled: Boolean(secretKey),

    createCheckout({ order, title, successUrl, cancelUrl, now = Date.now() }) {
      return call('POST', '/checkout/sessions', {
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: order.email,
        client_reference_id: order.id,
        metadata: { order: order.id },
        // Stripe's minimum; matches how long TAM holds the tickets.
        expires_at: Math.floor(now / 1000) + 31 * 60,
        line_items: { 0: { quantity: order.qty, price_data: { currency: 'gbp', unit_amount: order.unitPrice, product_data: { name: title } } } },
      });
    },

    getCheckout(id) {
      return call('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
    },

    // Verify a webhook (Stripe-Signature: t=…,v1=…) and return the event.
    verifyWebhook(payload, header, { tolerance = 300, now = Date.now() } = {}) {
      if (!webhookSecret) throw Object.assign(new Error('Webhook secret not set'), { status: 503, expose: true });
      const items = String(header || '').split(',').map((p) => p.trim().split('='));
      const t = Number(items.find(([k]) => k === 't')?.[1]);
      const sigs = items.filter(([k, v]) => k === 'v1' && v).map(([, v]) => v);
      const bad = () => Object.assign(new Error('Bad signature'), { status: 400, expose: true });
      if (!t || !sigs.length || Math.abs(now / 1000 - t) > tolerance) throw bad();
      const expected = Buffer.from(createHmac('sha256', webhookSecret).update(`${t}.${payload}`).digest('hex'));
      const ok = sigs.some((sig) => { const b = Buffer.from(sig); return b.length === expected.length && timingSafeEqual(b, expected); });
      if (!ok) throw bad();
      return JSON.parse(payload);
    },
  };
}
