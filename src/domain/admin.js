// Staff sign-in (admin and door) and the /admin API: sales per night,
// bookings, the Party Wall queue, sponsors, collection orders, artist stats,
// raffle totals, CSV exports and emailing followers.

import crypto from 'node:crypto';
import { fail, send, readJson, text, safeEqual } from '../lib/http.js';
import { paymentEmail, broadcastEmail } from '../services/mailer.js';

const csv = (rows) => rows.map((r) => r.map((v) => {
  const s = String(v ?? '');
  return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; // no spreadsheet formulas
}).join(',')).join('\n') + '\n';

export function staffAuth(cfg, secret) {
  const sign = (role, token) => `${role}.${crypto.createHmac('sha256', secret).update(`${role}:${token}`).digest('base64url')}`;
  const cookieOf = (req) => (/(?:^|;\s*)tam_staff=([^;]+)/.exec(req.headers.cookie || '') || [])[1] || '';
  const tokenOk = (given, token, min) => token && token.length >= min && given && safeEqual(given, token);
  const headerToken = (req) => String(req.headers['x-staff-token'] || '');

  const isAdmin = (req) => tokenOk(headerToken(req), cfg.adminToken, 12) || (cfg.adminToken.length >= 12 && safeEqual(cookieOf(req), sign('admin', cfg.adminToken)));
  const isDoor = (req) => isAdmin(req) || tokenOk(headerToken(req), cfg.doorToken, 8) || (cfg.doorToken.length >= 8 && safeEqual(cookieOf(req), sign('door', cfg.doorToken)));

  // Returns the Set-Cookie header for a correct token, or null.
  function login(token) {
    const secure = cfg.siteUrl.startsWith('https:') ? '; Secure' : '';
    const cookie = (role, t) => `tam_staff=${sign(role, t)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}`;
    if (tokenOk(token, cfg.adminToken, 12)) return { role: 'admin', cookie: cookie('admin', cfg.adminToken) };
    if (tokenOk(token, cfg.doorToken, 8)) return { role: 'door', cookie: cookie('door', cfg.doorToken) };
    return null;
  }
  return { isAdmin, isDoor, login };
}

export function adminDomain(ctx, { tickets, collections, raffle }) {
  const { db, save, content: c, cfg } = ctx;
  const guard = (req) => { if (!ctx.isAdmin(req)) throw fail(401, cfg.adminToken ? 'Wrong admin token.' : 'Set ADMIN_TOKEN (12+ characters) to use the admin page.'); };
  const find = (list, id, what) => { const x = list.find((r) => r.id === id); if (!x) throw fail(404, `${what} not found.`); return x; };
  const week = () => new Date(ctx.now() - 7 * 86400000).toISOString().slice(0, 10);

  function overview() {
    const holding = db.bookings.filter(tickets.holds);
    const nights = c.nights.filter((n) => n.sale || db.bookings.some((b) => b.night === n.slug)).map((n) => {
      const list = holding.filter((b) => b.night === n.slug);
      const paid = list.filter((b) => b.status === 'paid');
      return {
        slug: n.slug, title: n.title, date: n.date, festival: n.festival, capacity: n.sale ? n.sale.capacity : 0,
        sold: list.reduce((t, b) => t + b.qty, 0), paidRevenue: paid.reduce((t, b) => t + b.total - b.donation, 0),
        donations: paid.reduce((t, b) => t + b.donation, 0), checkedIn: list.reduce((t, b) => t + (b.checkedIn || 0), 0),
        raffle: db.raffleSales.filter((x) => x.night === n.slug && !x.void).reduce((t, x) => t + x.amount, 0),
        winners: db.raffleDraws.filter((d) => d.night === n.slug),
      };
    });
    const visits = (key, since = '') => db.visits.filter((v) => v.key === key && v.day >= since).reduce((t, v) => t + v.n, 0);
    const artists = c.artists.filter((a) => !a.archive || a.photo || db.follows.some((f) => f.artist === a.slug)).map((a) => {
      const invites = c.invites.filter((i) => i.artist === a.slug).map((i) => i.id);
      const via = holding.filter((b) => b.via === a.slug || invites.includes(b.via));
      const followers = db.follows.filter((f) => f.artist === a.slug && !f.unsubscribedAt);
      return {
        slug: a.slug, name: a.name,
        pageVisits: visits(`artist:${a.slug}`), pageVisits7: visits(`artist:${a.slug}`, week()),
        inviteViews: invites.reduce((t, i) => t + visits(`invite:${i}`), 0),
        followers: followers.length, newFollowers7: followers.filter((f) => f.at.slice(0, 10) >= week()).length,
        bookings: via.length, tickets: via.reduce((t, b) => t + b.qty, 0),
        revenue: via.filter((b) => b.status === 'paid').reduce((t, b) => t + b.total - b.donation, 0),
      };
    }).filter((a) => a.pageVisits || a.followers || a.bookings || c.artistBy.get(a.slug).photo);
    return {
      stripe: ctx.stripe.enabled, mail: ctx.mail.enabled(), pinModeration: cfg.pinModeration,
      nights, artists,
      bookings: db.bookings.slice(-500).reverse().map((b) => ({ ...b, stripeSessions: undefined, ticket: tickets.ticketPath(b), pay: tickets.payPath(b) })),
      pins: db.pins.slice().reverse(), sponsors: db.sponsors.slice().reverse(),
      orders: db.orders.slice().reverse(), mailings: db.mailings.slice(-20).reverse(),
      demand: Object.entries(db.demand.reduce((m, d) => ((m[`${d.kind}|${d.target}`] = (m[`${d.kind}|${d.target}`] || 0) + 1), m), {}))
        .map(([k, n]) => ({ kind: k.split('|')[0], target: k.split('|')[1], n })).sort((a, b) => b.n - a.n).slice(0, 50),
      raffle: raffle.summary(raffle.tonight()),
      eventbrite: ctx.live ? ctx.live.status : null,
      legacy: ctx.links ? ctx.links.list() : [],
      enquiries: db.enquiries.slice().reverse(),
      agent: (() => {
        const log = db.agentLog;
        const week = log.filter((x) => x.at >= new Date(ctx.now() - 7 * 86400000).toISOString());
        const tools = {};
        for (const x of week) for (const t of x.tools) tools[t] = (tools[t] || 0) + 1;
        const paths = {};
        for (const x of week) paths[x.pathway || '(none)'] = (paths[x.pathway || '(none)'] || 0) + 1;
        return { enabled: Boolean(ctx.cfg.anthropicKey), model: ctx.cfg.aiModel, week: week.length, offline: week.filter((x) => x.mode !== 'agent').length,
          tools, pathways: paths, recent: log.slice(-60).reverse().map(({ at, pathway, question, tools: t, mode }) => ({ at, pathway, question, tools: t, mode })) };
      })(),
    };
  }

  // Sends a mailing in the background at a steady pace; history shows delivered/failed.
  async function runMailing(m, list, artist) {
    for (const f of list) {
      try {
        await ctx.mail.send(broadcastEmail(f, artist, m, `${cfg.siteUrl}/unfollow?t=${f.token}`));
        m.delivered++;
      } catch (e) { m.failed++; m.lastError = e.message; }
      await new Promise((r) => setTimeout(r, 600));
    }
    m.finishedAt = new Date(ctx.now()).toISOString();
    await save();
  }

  function routes(r) {
    r.post('/api/staff/login', async (req, res) => {
      const body = await readJson(req, 1024);
      const ok = ctx.login(String(body.token || ''));
      if (!ok) throw fail(401, 'That code isn’t right.');
      send(res, 200, { role: ok.role }, { 'Set-Cookie': ok.cookie });
    });
    r.post('/api/staff/logout', (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': 'tam_staff=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }));

    r.get('/api/admin/overview', (req, res) => { guard(req); send(res, 200, overview()); });

    r.post('/api/admin/bookings/:id', async (req, res, { params }) => {
      guard(req);
      const b = find(db.bookings, params.id, 'Booking');
      const { action } = await readJson(req, 1024);
      if (action === 'paid') tickets.markPaid(b);
      else if (action === 'cancel') b.status = 'cancelled';
      else if (action === 'email') { if (!ctx.mail.enabled()) throw fail(409, 'Email is off: set RESEND_API_KEY.'); await tickets.notify(b, true); }
      else if (action === 'paylink') {
        if (!ctx.stripe.enabled || !ctx.mail.enabled()) throw fail(409, 'Payment links need Stripe and email.');
        if (b.status !== 'reserved') throw fail(409, 'Only reserved bookings need a payment link.');
        await ctx.mail.send(paymentEmail(b, c.nightBy.get(b.night), `${cfg.siteUrl}${tickets.payPath(b)}`));
        b.payLinkSentAt = new Date(ctx.now()).toISOString();
      } else throw fail(400, 'Unknown action.');
      await save();
      send(res, 200, { ok: true, status: b.status });
    });

    r.post('/api/admin/pins/:id', async (req, res, { params }) => {
      guard(req);
      const p = find(db.pins, params.id, 'Pin');
      const { action } = await readJson(req, 1024);
      if (action === 'approve') p.status = 'approved';
      else if (action === 'hide') p.status = 'hidden';
      else if (action === 'feature' || action === 'unfeature') p.featured = action === 'feature';
      else throw fail(400, 'Unknown action.');
      await save();
      send(res, 200, { ok: true });
    });

    r.post('/api/admin/sponsors/:id', async (req, res, { params }) => {
      guard(req);
      const s = find(db.sponsors, params.id, 'Sponsor');
      const { status } = await readJson(req, 1024);
      if (!['enquiry', 'talking', 'confirmed', 'declined'].includes(status)) throw fail(400, 'Unknown status.');
      s.status = status;
      await save();
      send(res, 200, { ok: true });
    });

    r.post('/api/admin/orders/:id', async (req, res, { params }) => {
      guard(req);
      const o = find(db.orders, params.id, 'Order');
      const { action } = await readJson(req, 1024);
      if (action === 'paid') collections.markPaid(o);
      else if (action === 'fulfilled') o.status = 'fulfilled';
      else if (action === 'cancel') o.status = 'cancelled'; // frees its numbers
      else throw fail(400, 'Unknown action.');
      await save();
      send(res, 200, { ok: true, status: o.status });
    });

    r.get('/api/admin/bookings.csv', (req, res, { url }) => {
      guard(req);
      const night = url.searchParams.get('night');
      const rows = db.bookings.filter((b) => !night || b.night === night);
      send(res, 200, csv([
        ['Reference', 'Night', 'Status', 'Name', 'Email', 'Company', 'Ticket', 'Qty', 'Unit', 'Donation', 'Total', 'Team', 'Table', 'Table request', 'Via', 'Checked in', 'Booked'],
        ...rows.map((b) => [b.id, b.night, b.status, b.name, b.email, b.company, b.ticketName, b.qty, b.unit / 100, b.donation / 100, b.total / 100, b.teamName, b.tableId, b.tableNote, b.via, b.checkedIn || 0, b.createdAt]),
      ]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bookings${night ? `-${night}` : ''}.csv"` });
    });

    r.get('/api/admin/followers.csv', (req, res, { url }) => {
      guard(req);
      const artist = url.searchParams.get('artist');
      const rows = db.follows.filter((f) => !f.unsubscribedAt && (!artist || f.artist === artist));
      send(res, 200, csv([['Artist', 'Name', 'Email', 'Since', 'Consent'], ...rows.map((f) => [f.artist, f.name, f.email, f.at, f.consent])]),
        { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="followers.csv"' });
    });

    r.post('/api/admin/mailings', async (req, res) => {
      guard(req);
      if (!ctx.mail.enabled()) throw fail(409, 'Email is off: set RESEND_API_KEY.');
      const body = await readJson(req, 20 * 1024);
      const artist = c.artistBy.get(body.artist);
      if (!artist) throw fail(400, 'Pick an artist.');
      const m = { id: `ML-${Date.now()}`, artist: artist.slug, subject: text(body.subject, 120), message: text(body.message, 5000),
        link: /^https?:\/\//.test(body.link || '') ? text(body.link, 300) : '', linkLabel: text(body.linkLabel, 40) };
      if (!m.subject || !m.message) throw fail(400, 'Add a subject and a message.');
      if (body.test) {
        const to = text(body.testTo, 200);
        if (!to.includes('@')) throw fail(400, 'Add the address to send the test to.');
        await ctx.mail.send(broadcastEmail({ email: to, token: 'test' }, artist, m, `${cfg.siteUrl}/unfollow?t=test`));
        return send(res, 200, { ok: true, test: true });
      }
      const list = db.follows.filter((f) => f.artist === artist.slug && !f.unsubscribedAt);
      Object.assign(m, { to: list.length, delivered: 0, failed: 0, startedAt: new Date(ctx.now()).toISOString() });
      db.mailings.push(m);
      await save();
      runMailing(m, list, artist);
      send(res, 202, { ok: true, to: list.length });
    });
  }

  return { routes, overview };
}
