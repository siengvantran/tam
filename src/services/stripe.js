// Stripe Checkout over plain HTTPS (no SDK), and webhook signature checks.

import crypto from 'node:crypto';
import { fail } from '../lib/http.js';

export function stripeClient(key, api = 'https://api.stripe.com/v1') {
  const base = api.replace(/\/$/, '');
  async function call(method, endpoint, params) {
    const res = await fetch(`${base}/${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params ? new URLSearchParams(params).toString() : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Stripe's own message can name keys and permissions: it stays in the log
      console.warn(`Stripe ${method} ${endpoint}: ${res.status} ${(json.error && json.error.message) || ''}`);
      throw fail(502, 'We couldn’t start the payment just now. Please try again in a moment.');
    }
    return json;
  }

  // lines: [[name, qty, unitPence]]
  async function checkout({ email, ref, kind, lines, successUrl, cancelUrl, holdMinutes }) {
    const params = {
      mode: 'payment',
      customer_email: email,
      client_reference_id: ref,
      [`metadata[${kind}]`]: ref,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Stripe needs at least 30 minutes; the stock hold outlasts it
      expires_at: String(Math.floor(Date.now() / 1000) + (Math.max(30, holdMinutes) + 1) * 60),
    };
    lines.forEach(([name, qty, unit], i) => {
      params[`line_items[${i}][quantity]`] = String(qty);
      params[`line_items[${i}][price_data][currency]`] = 'gbp';
      params[`line_items[${i}][price_data][unit_amount]`] = String(unit);
      params[`line_items[${i}][price_data][product_data][name]`] = name.slice(0, 250);
    });
    return call('POST', 'checkout/sessions', params);
  }

  return {
    enabled: Boolean(key),
    checkout,
    session: (id) => call('GET', `checkout/sessions/${encodeURIComponent(id)}`),
    expire: (id) => call('POST', `checkout/sessions/${encodeURIComponent(id)}/expire`).catch(() => {}),
  };
}

// Stripe-Signature: HMAC-SHA256 of "t.payload", signed in the last 5 minutes.
export function signatureOk(payload, header, secret, now = Date.now()) {
  const parts = {};
  for (const kv of String(header || '').split(',')) {
    const [k, v] = kv.split('=');
    (parts[k] = parts[k] || []).push(v);
  }
  const t = Number((parts.t || [])[0]);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const want = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.`).update(payload).digest('hex'));
  return (parts.v1 || []).some((sig) => {
    const got = Buffer.from(sig || '');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}
