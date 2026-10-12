import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createHash, createHmac } from 'node:crypto';
import QRCode from 'qrcode';

import { loadContent, queries } from './lib/content.js';
import { sitemap, robots, llmsTxt, graph, paths } from './lib/seo.js';
import { GENRE_NAMES } from './lib/content.js';
import { artwork } from './lib/brand.js';
import { append, validateSubmission, validateSignup, validateDemand, demandCounts, DATA_DIR } from './lib/store.js';
import { createTv } from './lib/youtube.js';
import { createBoxOffice } from './lib/tickets.js';
import { createStripe } from './lib/stripe.js';
import { aiEnabled, productionPackage } from './lib/ai.js';
import * as views from './views.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const MAX_BODY = 64 * 1024;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://i.ytimg.com https://img.evbuc.com",
  'frame-src https://www.youtube-nocookie.com',
  "connect-src 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

async function readRaw(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { const e = new Error('Payload too large'); e.status = 413; e.expose = true; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(req) {
  const text = await readRaw(req);
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    try { return JSON.parse(text || '{}'); } catch { const e = new Error('Invalid JSON'); e.status = 400; e.expose = true; throw e; }
  }
  const params = new URLSearchParams(text);
  const out = {};
  for (const k of new Set(params.keys())) {
    const all = params.getAll(k);
    out[k] = all.length > 1 ? all : all[0];
  }
  return out;
}

const tokenMatches = (given, expected) => {
  if (!expected || !given) return false;
  const a = createHash('sha256').update(String(given)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
};

function ics(c, e, venue) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escText = (t) => String(t).replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const end = new Date(Date.parse(e.start) + 3 * 3600e3).toISOString();
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TAM.TV//TAM//EN', 'BEGIN:VEVENT',
    `UID:${e.slug}@tam.tv`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escText(`${e.title} — TAM`)}`,
    `DESCRIPTION:${escText(`Tickets: ${e.url}`)}`,
    `LOCATION:${escText(venue ? `${venue.name}, ${venue.address}` : e.venueName || 'London')}`,
    `URL:${c.site.url}${paths.event(e.slug)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no spreadsheet formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ticket';

export function createApp({ content = loadContent(), clock = () => new Date(), tvFetcher = fetch, stripe = createStripe(), dataDir = DATA_DIR } = {}) {
  const c = content;
  const tv = createTv({ channelId: c.site.youtubeChannelId, archive: c.videos, fetcher: tvFetcher });
  const office = createBoxOffice({ dataDir, now: () => clock().getTime() });
  const payments = () => stripe.enabled;
  // Box office sessions: the cookie holds an HMAC of the token, never the token.
  const boCookie = () => (process.env.ADMIN_TOKEN ? createHmac('sha256', process.env.ADMIN_TOKEN).update('tam-box-office').digest('hex') : null);
  // Public "Bring them back" / "I was there" totals, loaded once, then kept in memory.
  let counts = new Map();
  const ready = Promise.all([demandCounts().then((m) => { counts = m; }), office.load(), tv.ready()]);
  // One press per person per target per day, without storing IPs.
  const recent = new Set();
  let recentDay = '';
  // Old URLs that now live elsewhere (301 keeps their search value).
  const MOVED = { '/home': '/', '/watch': '/tv', '/festival': '/whats-on', '/events': '/whats-on' };

  const send = (res, status, body, type = 'text/html; charset=utf-8', headers = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      ...(type.startsWith('text/html') ? { 'Content-Security-Policy': CSP, 'Cache-Control': 'no-cache' } : {}),
      ...headers,
    });
    res.end(body);
  };
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };
  const moved = (res, to) => { res.writeHead(301, { Location: to, 'Cache-Control': 'public, max-age=86400' }); res.end(); };
  let graphCache = null;

  async function serveStatic(res, urlPath) {
    const file = path.normalize(path.join(PUBLIC, urlPath));
    if (!file.startsWith(PUBLIC + path.sep)) return false;
    try {
      const s = await stat(file);
      if (!s.isFile()) return false;
      send(res, 200, await readFile(file), MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'public, max-age=3600' });
      return true;
    } catch { return false; }
  }

  const artName = (slug) => {
    const q = queries(c);
    const a = q.artist(slug);
    if (a) return { name: a.name, legend: a.legend };
    const e = q.event(slug);
    if (e) return { name: e.slug, label: false, legend: e.performers.some((x) => q.artist(x)?.legend) };
    return null;
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const now = clock();
    const cookies = parseCookies(req.headers.cookie);
    const ctx = { c, q: queries(c, now), now, path: p, consent: cookies.tam_consent, tv: tv.list() };
    const isStaff = () => Boolean(boCookie()) && tokenMatches(cookies.tam_bo, boCookie());
    const offerFor = (e) => (ctx.q.isPast(e) ? null : office.offer(e.slug, { paymentsEnabled: payments() }));
    const eventHtml = (e, opts = {}) => {
      const offer = offerFor(e);
      return views.eventPage(ctx, e, { counts, ticketing: offer ? String(views.ticketForm(ctx, e, offer, opts)) : null });
    };
    const qr = (text) => QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0b0907', light: '#ffffff' } });
    const page = (html, status = 200) => send(res, status, html);
    const m = (re) => re.exec(p);
    let match;

    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        await ready;
        const q = ctx.q;
        if (MOVED[p]) return moved(res, MOVED[p]);
        if ((match = m(/^\/watch\/([a-z0-9-]+)$/))) return moved(res, '/tv');
        if (p === '/') return page(views.home(ctx));
        if (p === '/whats-on') return page(views.whatsOn(ctx));
        if ((match = m(/^\/events\/([a-z0-9-]+)\.ics$/))) {
          const e = q.event(match[1]);
          if (e) return send(res, 200, ics(c, e, q.venue(e.venue)), 'text/calendar; charset=utf-8', { 'Content-Disposition': `attachment; filename="${e.slug}.ics"` });
        }
        if ((match = m(/^\/events\/([a-z0-9-]+)$/)) && q.event(match[1])) return page(eventHtml(q.event(match[1])));
        if (p === '/academy') return page(views.academy(ctx));
        if ((match = m(/^\/tickets\/(TAM-[A-Z0-9]{5}-[A-Z0-9]{5})$/))) {
          let o = office.byCode(match[1]);
          if (!o) return page(views.notFound(ctx), 404);
          let message = null;
          const sid = url.searchParams.get('session_id');
          if (o.status === 'pending' && sid && payments()) {
            const session = await stripe.getCheckout(sid);
            if (session.payment_status === 'paid' && session.metadata?.order === o.id && session.amount_total === o.total) {
              o = await office.markPaid(o.id, session.id);
              message = 'Payment received. Enjoy the night!';
            }
          } else if (url.searchParams.has('booked')) message = 'You’re booked. See you there!';
          return page(views.ticketPage(ctx, o, q.event(o.event), { qr: await qr(o.code), message, paymentsEnabled: payments() }));
        }
        // ---- box office (staff)
        if (p === '/box-office' || p.startsWith('/box-office/')) {
          if (!isStaff()) return page(views.boxOfficeLogin(ctx), p === '/box-office' ? 200 : 401);
          if (p === '/box-office') {
            return page(views.boxOfficeHome(ctx, { office, paymentsEnabled: payments(), error: url.searchParams.get('err') === 'notfound' ? 'No ticket with that code.' : null }));
          }
          if ((match = m(/^\/box-office\/e\/([a-z0-9-]+)\.csv$/)) && q.event(match[1])) {
            const rows = [['name', 'email', 'code', 'ticket', 'qty', 'total_gbp', 'status', 'checked_in', 'marketing_ok', 'booked_at']];
            for (const o of office.ordersFor(match[1])) rows.push([o.name, o.email, o.code, o.typeName, o.qty, (o.total / 100).toFixed(2), office.isLive(o) || o.status !== 'pending' ? o.status : 'expired', o.checkedIn, o.marketing ? 'yes' : 'no', o.createdAt]);
            return send(res, 200, rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${match[1]}-guests.csv"`, 'Cache-Control': 'no-store' });
          }
          if ((match = m(/^\/box-office\/e\/([a-z0-9-]+)$/)) && q.event(match[1])) {
            const msgs = { saved: 'Saved.', cancelled: 'Booking cancelled.' };
            const errs = { notfound: 'No ticket with that code.', bad: 'Check the ticket types: each needs a name, and prices and limits must be numbers.' };
            let message = msgs[url.searchParams.get('msg')];
            const inCode = url.searchParams.get('in');
            if (inCode) { const o = office.byCode(inCode); if (o) message = `Checked in: ${o.name} (${o.checkedIn} of ${o.qty}).`; }
            return page(views.boxOfficeEvent(ctx, q.event(match[1]), { office, paymentsEnabled: payments(), message, error: errs[url.searchParams.get('err')] || url.searchParams.get('why') && office.byCode(url.searchParams.get('code')) && `Not checked in: ${url.searchParams.get('why') === 'done' ? 'already checked in' : 'booking not confirmed'}.` }));
          }
        }
        if (p === '/artists') return page(views.artists(ctx));
        if ((match = m(/^\/artists\/([a-z0-9-]+)$/i)) && q.artist(match[1])) return page(views.artistPage(ctx, q.artist(match[1]), { counts }));
        if (p === '/archive') return page(views.archive(ctx));
        if ((match = m(/^\/archive\/(\d{4})$/)) && q.eventsInYear(match[1]).length) return page(views.archiveYear(ctx, match[1]));
        if (p === '/series') return page(views.seriesIndex(ctx));
        if ((match = m(/^\/series\/([a-z0-9-]+)$/)) && q.series(match[1])) return page(views.seriesPage(ctx, q.series(match[1])));
        if (p === '/genres') return page(views.genresIndex(ctx));
        if ((match = m(/^\/genres\/([a-z0-9-]+)$/)) && GENRE_NAMES[match[1]] && q.eventsInGenre(match[1]).length) return page(views.genrePage(ctx, match[1]));
        if (p === '/locations') return page(views.locations(ctx));
        if ((match = m(/^\/locations\/([a-z0-9-]+)$/)) && q.venue(match[1])) return page(views.venuePage(ctx, q.venue(match[1])));
        if (p === '/tv') return page(views.tv(ctx));
        if ((match = m(/^\/tv\/([a-z0-9-]+)$/)) && q.video(match[1])) return page(views.videoPage(ctx, q.video(match[1])));
        if (p === '/listen') return page(views.listen(ctx));
        if (p === '/stories') return page(views.stories(ctx));
        if ((match = m(/^\/stories\/([a-z0-9-]+)$/)) && q.story(match[1])) return page(views.storyPage(ctx, q.story(match[1])));
        if (p === '/about') return page(views.about(ctx));
        if (p === '/submit') return page(views.submit(ctx, { done: url.searchParams.has('thanks') }));
        if (p === '/privacy') return page(views.privacy(ctx));
        if (p === '/studio') return page(views.studio(ctx, { aiEnabled: aiEnabled() && Boolean(process.env.ADMIN_TOKEN) }));
        // Every other page of the old www.tam.tv, at its original address.
        if (q.legacy(p)) return page(views.legacyPage(ctx, q.legacy(p)));

        // Brand: the original logo files are served from /img; these are aliases.
        const svg = (body, maxAge = 86400) => send(res, 200, body, 'image/svg+xml', { 'Cache-Control': `public, max-age=${maxAge}` });
        if (p === '/favicon.ico' || p === '/favicon.png') return serveStatic(res, '/img/favicon-48.png');
        if (p === '/apple-touch-icon.png') return serveStatic(res, '/img/apple-touch-icon.png');
        if ((match = m(/^\/art\/([a-z0-9-]+)\.svg$/))) {
          const s = artName(match[1]);
          if (s) return svg(artwork(s.name, { genre: s.genre, size: 512, label: s.label !== false, legend: s.legend }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
        }
        if (p === '/chorus.json') return send(res, 200, JSON.stringify(c.chorus.songs.map(({ title, artist, year, chorus }) => ({ title, artist, year, chorus }))), 'application/json; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });

        // Discovery.
        if (p === '/robots.txt') return send(res, 200, robots(c.site), 'text/plain; charset=utf-8');
        if (p === '/sitemap.xml') return send(res, 200, sitemap(c, ctx.q), 'application/xml; charset=utf-8');
        if (p === '/llms.txt') return send(res, 200, llmsTxt(c, ctx.q), 'text/plain; charset=utf-8');
        if (p === '/graph.json') return send(res, 200, (graphCache ||= JSON.stringify(graph(c, ctx.q))), 'application/ld+json; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
        if (p === '/healthz') return json(res, 200, { ok: true });

        if (/^\/(css|js|img)\//.test(p) && await serveStatic(res, p)) return;
        return page(views.notFound(ctx), 404);
      }

      if (req.method === 'POST') {
        await ready;
        // Forms must come from this site.
        const origin = req.headers.origin;
        if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host && p !== '/api/stripe/webhook') return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
        const q = ctx.q;

        if ((match = m(/^\/events\/([a-z0-9-]+)\/book$/)) && q.event(match[1])) {
          const e = q.event(match[1]);
          const body = await readBody(req);
          const values = { type: String(body.type || ''), qty: Number(body.qty), name: String(body.name || '').trim().slice(0, 120), email: String(body.email || '').trim().toLowerCase().slice(0, 254), marketing: body.marketing === 'on' };
          let error = null;
          if (!offerFor(e)) error = 'Tickets for this night aren’t on sale here.';
          else if (!values.name) error = 'Please add a name for the door.';
          else if (!EMAIL.test(values.email)) error = 'Please add a valid email.';
          else if (body.terms !== 'on') error = 'Please confirm you’ve read the privacy notice.';
          let result;
          if (!error) {
            result = office.book({ event: e.slug, typeId: values.type, qty: values.qty, name: values.name, email: values.email, marketing: values.marketing }, { paymentsEnabled: payments() });
            error = result.error;
          }
          if (error) return page(eventHtml(e, { error, values }), 422);
          const { order } = result;
          await result.saved;
          if (values.marketing) await append('signups.jsonl', { email: values.email, interests: [`event:${e.slug}`], consent: true, source: 'tickets' });
          if (order.status === 'confirmed') return redirect(res, `/tickets/${order.code}?booked`);
          const session = await stripe.createCheckout({
            order, title: `${e.title} — ${order.typeName}`,
            successUrl: `${c.site.url}/tickets/${order.code}?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${c.site.url}/tickets/${order.code}`,
            now: clock().getTime(),
          });
          await office.setSession(order.id, session.id);
          return redirect(res, session.url);
        }
        if ((match = m(/^\/tickets\/(TAM-[A-Z0-9]{5}-[A-Z0-9]{5})\/pay$/))) {
          const o = office.byCode(match[1]);
          const e = o && q.event(o.event);
          if (!o || !e) return page(views.notFound(ctx), 404);
          if (o.status !== 'pending' || !payments()) return redirect(res, `/tickets/${o.code}`);
          if (!office.isLive(o)) return page(views.ticketPage(ctx, o, e, { qr: '', message: 'Your 30-minute hold has run out. Please book again from the night’s page.', paymentsEnabled: false }), 410);
          const session = await stripe.createCheckout({ order: o, title: `${e.title} — ${o.typeName}`, successUrl: `${c.site.url}/tickets/${o.code}?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${c.site.url}/tickets/${o.code}`, now: clock().getTime() });
          await office.setSession(o.id, session.id);
          return redirect(res, session.url);
        }
        if (p === '/api/stripe/webhook') {
          const raw = await readRaw(req);
          const event = stripe.verifyWebhook(raw, req.headers['stripe-signature'], { now: clock().getTime() });
          const session = event.data?.object;
          if (event.type === 'checkout.session.completed' && session?.payment_status === 'paid') {
            const o = office.get(session.metadata?.order);
            if (o && session.amount_total === o.total) await office.markPaid(o.id, session.id);
          }
          return json(res, 200, { received: true });
        }
        if (p === '/box-office/login') {
          const body = await readBody(req);
          if (!boCookie() || !tokenMatches(body.token, process.env.ADMIN_TOKEN)) return page(views.boxOfficeLogin(ctx, { error: boCookie() ? 'That token isn’t right.' : 'The box office isn’t set up: set ADMIN_TOKEN on the server.' }), 401);
          const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
          res.writeHead(303, { Location: '/box-office', 'Set-Cookie': `tam_bo=${boCookie()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 3600}${secure}` });
          return res.end();
        }
        if (p.startsWith('/box-office/')) {
          if (!isStaff()) return page(views.boxOfficeLogin(ctx), 401);
          const body = await readBody(req);
          const back = typeof body.back === 'string' && /^\/box-office[\w\-/]*$/.test(body.back) ? body.back : '/box-office';
          if ((match = m(/^\/box-office\/e\/([a-z0-9-]+)\/config$/)) && q.event(match[1])) {
            const slug = match[1];
            const int = (v) => (v === undefined || String(v).trim() === '' ? null : Number.parseInt(v, 10));
            const types = [];
            let bad = false;
            for (let i = 0; i < 4; i++) {
              const name = String(body[`type${i}_name`] || '').trim().slice(0, 60);
              const priceRaw = String(body[`type${i}_price`] ?? '').trim().replace(/^£/, '');
              const capacity = int(body[`type${i}_capacity`]);
              if (!name) { if (priceRaw || capacity != null) bad = true; continue; }
              const price = priceRaw === '' ? 0 : Math.round(Number(priceRaw) * 100);
              if (!Number.isFinite(price) || price < 0 || (capacity != null && (!Number.isInteger(capacity) || capacity < 0))) { bad = true; continue; }
              let id = String(body[`type${i}_id`] || '') || slugify(name);
              while (types.some((t) => t.id === id)) id = `${id}-2`;
              types.push({ id, name, price, capacity });
            }
            const capacity = int(body.capacity);
            if (bad || !types.length || (capacity != null && (!Number.isInteger(capacity) || capacity < 0))) return redirect(res, `/box-office/e/${slug}?err=bad`);
            await office.setConfig(slug, { open: body.open === 'on', capacity, types });
            return redirect(res, `/box-office/e/${slug}?msg=saved`);
          }
          if (p === '/box-office/checkin') {
            const r = await office.checkIn(body.code);
            const target = r.order ? `/box-office/e/${r.order.event}` : back;
            if (r.error) return redirect(res, r.order ? `${target}?why=${r.order.checkedIn >= r.order.qty ? 'done' : 'status'}&code=${r.order.code}` : `${target}?err=notfound`);
            return redirect(res, `${target}?in=${r.order.code}`);
          }
          if ((match = m(/^\/box-office\/orders\/([0-9a-f-]{36})\/cancel$/)) && office.get(match[1])) {
            const o = await office.cancel(match[1]);
            return redirect(res, `/box-office/e/${o.event}?msg=cancelled`);
          }
        }
        if (p === '/submit') {
          const body = await readBody(req);
          if (body.website) return redirect(res, '/submit?thanks'); // honeypot
          const r = validateSubmission(body);
          if (!r.ok) return page(views.submit(ctx, { values: { ...body, ...r.value }, errors: r.errors }), 422);
          await append('submissions.jsonl', { ...r.value, status: 'new' });
          if (r.value.newsletter) await append('signups.jsonl', { email: r.value.email, interests: [r.value.genre].filter(Boolean), consent: true, source: 'submission' });
          return redirect(res, '/submit?thanks');
        }
        if (p === '/signup') {
          const body = await readBody(req);
          const r = validateSignup(body);
          if (!r.ok) return page(views.signupResult(ctx, r), 422);
          await append('signups.jsonl', { ...r.value, source: String(body.from || '').slice(0, 200) });
          return page(views.signupResult(ctx, r));
        }
        if (p === '/demand') {
          await ready;
          const body = await readBody(req);
          const exists = (kind, slug) => Boolean(kind === 'artist' ? ctx.q.artist(slug) : ctx.q.event(slug));
          const r = validateDemand(body, exists);
          const wantsJson = (req.headers.accept || '').includes('application/json');
          const back = typeof body.back === 'string' && /^\/[\w\-/]*$/.test(body.back) ? body.back : '/';
          if (!r.ok) return wantsJson ? json(res, 422, { error: Object.values(r.errors).join(' ') }) : page(views.demandResult(ctx, { ok: false, errors: r.errors, back }), 422);
          const key = `${r.value.type}:${r.value.target}`;
          const today = new Date().toISOString().slice(0, 10);
          if (today !== recentDay) { recent.clear(); recentDay = today; }
          const who = createHash('sha256').update(`${req.socket.remoteAddress}|${req.headers['user-agent'] || ''}|${key}|${today}`).digest('base64');
          const repeat = recent.has(who) && !r.value.email;
          if (!repeat) {
            recent.add(who);
            await append('demand.jsonl', { ...r.value, visitor: typeof cookies.tam_vid === 'string' && cookies.tam_consent === 'granted' ? cookies.tam_vid.slice(0, 64) : undefined });
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          return wantsJson ? json(res, 200, { count: counts.get(key) || 0 }) : redirect(res, back);
        }
        if (p === '/api/track') {
          // Consent is enforced server-side too: without it, nothing is stored.
          if (cookies.tam_consent !== 'granted') { res.writeHead(204); return res.end(); }
          const body = await readBody(req);
          const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
          await append('events.jsonl', {
            visitor: str(cookies.tam_vid, 64),
            type: ['view', 'play', 'click', 'calendar'].includes(body.type) ? body.type : 'view',
            path: str(body.path, 300),
            ref: str(body.ref, 300),
          });
          res.writeHead(204);
          return res.end();
        }
        if (p === '/api/agent/production') {
          if (!tokenMatches(req.headers['x-admin-token'], process.env.ADMIN_TOKEN)) return json(res, 401, { error: 'Unauthorised' });
          const body = await readBody(req);
          const artist = ctx.q.artist(body.artist);
          if (!artist) return json(res, 400, { error: 'Unknown artist' });
          const found = body.event ? ctx.q.event(body.event) : null;
          const event = found ? { ...found, venueLabel: ctx.q.venue(found.venue)?.name || found.venueName } : null;
          const pkg = await productionPackage({
            artist, event, notes: String(body.notes || '').slice(0, 6000), pageUrl: `${c.site.url}${paths.artist(artist.slug)}`,
          });
          return json(res, 200, pkg);
        }
      }

      res.writeHead(405, { Allow: 'GET, HEAD, POST' });
      return res.end();
    } catch (err) {
      const status = err.status || 500;
      if (!err.expose) console.error(err);
      const message = err.expose ? err.message : 'Something went wrong';
      if (p.startsWith('/api/')) return json(res, status, { error: message });
      return send(res, status, message, 'text/plain; charset=utf-8');
    }
  };
}
