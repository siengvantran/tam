// Emails through Resend. Without RESEND_API_KEY nothing is sent and the admin page says so.

import { escape as e } from '../views/html.js';
import { pounds } from '../../shared/pricing.js';

export function mailer({ key, from = 'TAM <tickets@tam.tv>', replyTo = '', api = 'https://api.resend.com' } = {}) {
  // `replyTo` on a single email overrides the default (an enquiry replies to the enquirer).
  async function send({ to, subject, html, text, headers, replyTo: replyOne }) {
    if (!key) throw new Error('Email is off: set RESEND_API_KEY.');
    const res = await fetch(`${api}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text, headers, ...(replyOne || replyTo ? { reply_to: replyOne || replyTo } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json && json.message) || `Resend ${res.status}`);
    return json.id;
  }
  return { enabled: () => Boolean(key), send };
}

function layout({ heading, intro, rows = [], button, after = '' }) {
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#8a7f86">${e(k)}</td><td style="padding:4px 0"><b>${e(v)}</b></td></tr>`).join('');
  const html = `<!doctype html><body style="margin:0;background:#0b0709;color:#f6efe6;font:16px/1.5 system-ui,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="letter-spacing:.2em;font-size:12px;color:#f3c35b">TEMPLE OF ART AND MUSIC</p>
<h1 style="font-size:26px;margin:0 0 12px">${e(heading)}</h1><p>${e(intro)}</p>
${table ? `<table style="margin:16px 0">${table}</table>` : ''}
${button ? `<p><a href="${e(button[1])}" style="display:inline-block;background:#ff2d6f;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${e(button[0])}</a></p>` : ''}
${after}<p style="color:#8a7f86;font-size:13px;margin-top:32px">TAM · Mercato Metropolitano · 42 Newington Causeway · London SE1 6DR</p></div></body>`;
  const text = [heading, '', intro, '', ...rows.map(([k, v]) => `${k}: ${v}`), button ? `\n${button[0]}: ${button[1]}` : ''].join('\n');
  return { html, text };
}

export function ticketEmail(b, night, link) {
  const paid = b.status === 'paid';
  const free = !b.total; // free tickets: booked, nothing to pay
  return {
    to: b.email,
    subject: `${paid || free ? 'Your tickets' : 'Booking reserved'}: ${night.title}, ${night.weekday} ${night.day} ${night.month} · ${b.id}`,
    ...layout({
      heading: paid || free ? 'Your tickets are ready' : 'Your booking is reserved',
      intro: paid ? 'Show the QR code on your ticket page at the door.' : free ? 'You’re booked in: entry is free. Show the QR code on your ticket page at the door.' : 'We’ve held your tickets. We’ll be in touch about payment.',
      rows: [['Reference', b.id], ['Night', `${night.title} · ${night.weekday} ${night.day} ${night.month}`], ['Tickets', `${b.qty} × ${b.ticketName || 'Ticket'}`], ['Total', free ? 'Free' : pounds(b.total)]],
      button: ['Open your ticket', link],
    }),
  };
}

export function paymentEmail(b, night, payUrl) {
  return {
    to: b.email,
    subject: `Pay for your booking ${b.id}: ${night.title}`,
    ...layout({ heading: 'Pay for your tickets', intro: 'Your tickets are held. Pay online to confirm them.', rows: [['Reference', b.id], ['Total', pounds(b.total)]], button: ['Pay now', payUrl] }),
  };
}

export function orderEmail(o, collection, link) {
  return {
    to: o.email,
    subject: `${collection.name}: order ${o.id}`,
    ...layout({
      heading: o.status === 'paid' ? 'Your numbered copies' : 'Your copies are reserved',
      intro: `Each copy is numbered in ${collection.name}, with a certificate code anyone can check.`,
      rows: o.copies.map((c) => [`${c.title} · No. ${c.number} of ${collection.size}`, c.code]),
      button: ['Check a certificate', link],
    }),
  };
}

export function followEmail(f, artist, pageUrl, unsubUrl) {
  return {
    to: f.email,
    subject: `You’re following ${artist.name} at TAM`,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    ...layout({ heading: `You’re following ${artist.name}`, intro: `We’ll email you about ${artist.name}’s gigs and news from TAM. Unsubscribe any time: ${unsubUrl}`, button: [`${artist.name} at TAM`, pageUrl] }),
  };
}

export function broadcastEmail(f, artist, { subject, message, link, linkLabel }, unsubUrl) {
  const paras = String(message).split(/\n\s*\n/).map((p) => `<p>${e(p)}</p>`).join('');
  const m = layout({ heading: subject, intro: '', button: link ? [linkLabel || 'Find out more', link] : null, after: `${paras}<p style="font-size:13px"><a href="${e(unsubUrl)}" style="color:#8a7f86">Unsubscribe from ${e(artist.name)}</a></p>` });
  return { to: f.email, subject, html: m.html, text: `${message}\n\nUnsubscribe: ${unsubUrl}`, headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}
