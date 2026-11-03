// TAM's own box office: bookings on any night with a `sale`, Team Tables,
// charity donations, Stripe Checkout (or reserve-and-invoice without it),
// keyed ticket links with QR codes, payment links and door check-in.

import crypto from 'node:crypto';
import { quote, donationOf, ticketOptions, fromPrice } from '../../shared/pricing.js';
import { fail, send, readJson, readRaw, text, email, newId } from '../lib/http.js';
import { londonToday } from '../lib/content.js';
import { signatureOk } from '../services/stripe.js';
import { ticketEmail, paymentEmail } from '../services/mailer.js';

const LIVE = ['paid', 'reserved', 'processing', 'fulfilled'];

export function ticketsDomain(ctx) {
  const { db, save, content: c, cfg } = ctx;

  // A record holds stock while paid/reserved, or while its checkout is open.
  const holds = (r) => LIVE.includes(r.status) || (r.status === 'awaiting_payment' && Date.parse(r.holdUntil || 0) > ctx.now());

  function salesFor(slug) {
    const out = { sold: 0, typeSold: {}, tierSold: {} };
    for (const b of db.bookings) {
      if (b.night !== slug || !holds(b)) continue;
      out.sold += b.qty;
      out.typeSold[b.type] = (out.typeSold[b.type] || 0) + b.qty;
      if (b.tier) out.tierSold[b.tier] = (out.tierSold[b.tier] || 0) + b.qty;
    }
    return out;
  }

  const tableSeatsTaken = (id) => db.bookings.filter((b) => b.tableId === id && holds(b)).reduce((n, b) => n + b.qty, 0);
  function tablesFor(slug) {
    return db.tables.filter((t) => t.night === slug).map((t) => {
      const teams = db.bookings.filter((b) => b.tableId === t.id && holds(b)).map((b) => ({ name: b.teamName, blurb: b.blurb, people: b.qty }));
      return { id: t.id, night: t.night, seats: t.seats, left: Math.max(0, t.seats - teams.reduce((n, x) => n + x.people, 0)), teams };
    }).filter((t) => t.teams.length);
  }

  function nightAvailability(n) {
    const s = salesFor(n.slug);
    const ctxSold = { now: ctx.now(), ...s };
    return {
      slug: n.slug,
      left: n.sale && n.sale.capacity ? Math.max(0, n.sale.capacity - s.sold) : null,
      options: ticketOptions(n.sale, ctxSold),
      from: fromPrice(n.sale, ctxSold),
      onSale: Boolean(n.sale) && n.end > new Date(ctx.now()).toISOString(),
    };
  }

  // Tickets are opened by link: /ticket/REF?k=KEY, so references can't be guessed into tickets.
  const ticketKey = (id) => crypto.createHmac('sha256', ctx.secret).update(`ticket:${id}`).digest('base64url').slice(0, 16);
  const keyOk = (id, k) => {
    const want = Buffer.from(ticketKey(id)), got = Buffer.from(String(k || ''));
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };
  const ticketPath = (b) => `/ticket/${b.id}?k=${ticketKey(b.id)}`;
  const payPath = (b) => `/pay/${b.id}?k=${ticketKey(b.id)}`;

  function bookingView(b, withLink) {
    const n = c.nightBy.get(b.night);
    return {
      id: b.id, night: b.night, nightTitle: n ? n.title : b.night, date: n ? n.date : '', qty: b.qty,
      ticketName: b.ticketName, unit: b.unit, donation: b.donation, total: b.total, status: b.status,
      teamName: b.teamName, tableId: b.tableId, checkedIn: b.checkedIn || 0,
      ...(withLink ? { ticket: ticketPath(b) } : {}),
    };
  }

  function lineName(n, b) {
    return `${n.title} · ${n.weekday} ${n.day} ${n.month}${b.ticketName ? ` · ${b.ticketName}` : ''}`;
  }
  async function startCheckout(req, b) {
    const n = c.nightBy.get(b.night);
    const f = n.festival ? c.festivalBy.get(n.festival) : null;
    const lines = [[lineName(n, b), b.qty, b.unit]];
    if (b.donation) lines.push([`Donation to ${f.donation.charity.name}`, 1, b.donation]);
    const base = ctx.base(req);
    const back = `${base}/events/${n.slug}?booking=${b.id}&k=${ticketKey(b.id)}`;
    const s = await ctx.stripe.checkout({
      email: b.email, ref: b.id, kind: 'booking', lines, holdMinutes: cfg.holdMinutes,
      successUrl: `${back}&session_id={CHECKOUT_SESSION_ID}#book`, cancelUrl: `${back}&cancelled=1#book`,
    });
    b.stripeSession = s.id;
    b.stripeSessions = (b.stripeSessions || []).concat(s.id).slice(-10); // paying in an older tab still counts
    if (b.status === 'awaiting_payment') b.holdUntil = new Date(ctx.now() + (cfg.holdMinutes + 5) * 60000).toISOString();
    return s.url;
  }

  async function notify(b, force) {
    if (!ctx.mail.enabled()) return;
    const kind = b.status === 'paid' ? 'paid' : 'reserved';
    if (!force && (b.emails || {})[kind]) return;
    const n = c.nightBy.get(b.night);
    try {
      await ctx.mail.send(ticketEmail(b, n, `${cfg.siteUrl}${ticketPath(b)}`));
      b.emails = { ...(b.emails || {}), [kind]: new Date(ctx.now()).toISOString() };
    } catch (e) {
      b.emailError = e.message;
      console.warn(`Ticket email ${b.id}: ${e.message}`);
    }
    await save();
  }

  // Paid. If the hold had lapsed before the payment landed, flag an oversold night.
  function markPaid(b) {
    if (b.status === 'paid') return;
    const lapsed = !holds(b);
    b.status = 'paid';
    b.paidAt = new Date(ctx.now()).toISOString();
    const n = c.nightBy.get(b.night);
    if (lapsed && n && n.sale && n.sale.capacity && salesFor(b.night).sold > n.sale.capacity) {
      b.needsAttention = 'Paid after its hold lapsed and the night is now over capacity.';
    }
    notify(b);
  }

  // Which nights are "tonight" for the door and the raffle: today's, and last
  // night's until it ends (after-midnight finishes).
  function tonight() {
    const now = new Date(ctx.now()).toISOString(), today = londonToday(new Date(ctx.now()));
    return c.nights.filter((n) => n.date === today || (n.start <= now && n.end > now));
  }

  function doorView(b) {
    const n = c.nightBy.get(b.night);
    const problems = [];
    if (b.status === 'cancelled') problems.push('This booking was cancelled.');
    else if (!['paid', 'reserved', 'processing'].includes(b.status)) problems.push('This booking hasn’t been paid.');
    if (!tonight().some((t) => t.slug === b.night)) problems.push(`This ticket is for ${n ? `${n.weekday} ${n.day} ${n.month}` : 'another night'}, not tonight.`);
    if ((b.checkedIn || 0) >= b.qty) problems.push('Everyone on this booking is already in.');
    return { ...bookingView(b), name: b.name, ok: !problems.length, problems, reserved: b.status === 'reserved', tableRequest: b.tableRequest, tableNote: b.tableNote };
  }

  function routes(r) {
    r.get('/api/availability', (req, res, { url }) => {
      const fest = url.searchParams.get('festival');
      const list = fest ? c.nightsFor(fest) : c.upcoming();
      const f = fest ? c.festivalBy.get(fest) : null;
      const raised = f ? db.bookings.filter((b) => b.status === 'paid' && list.some((n) => n.slug === b.night)).reduce((t, b) => t + (b.donation || 0), 0) : 0;
      send(res, 200, {
        payments: ctx.stripe.enabled ? 'card' : 'invoice',
        nights: list.map(nightAvailability),
        tables: list.flatMap((n) => tablesFor(n.slug)),
        raised,
      });
    });

    r.post('/api/bookings', async (req, res) => {
      const body = await readJson(req, 20 * 1024);
      const n = c.nightBy.get(body.night);
      if (!n || !n.sale) throw fail(400, 'Pick a night that’s on sale here.');
      if (n.end <= new Date(ctx.now()).toISOString()) throw fail(400, 'That night has already happened.');
      const f = n.festival ? c.festivalBy.get(n.festival) : null;
      const features = (f && f.features) || {};
      const q = quote(n.sale, body.type, body.qty, { now: ctx.now(), ...salesFor(n.slug) });
      if (q.error) throw fail(q.error.includes('left') || q.error.includes('sold out') ? 409 : 400, q.error);
      const gift = donationOf(body.donation, features.donation ? f.donation : null);
      if (gift.error) throw fail(400, gift.error);

      const b = {
        id: newId('TAM'), createdAt: new Date(ctx.now()).toISOString(), night: n.slug, festival: n.festival,
        type: q.type, tier: q.tier || null, ticketName: q.ticket ? q.ticket.name : q.pack ? q.pack.name : q.tier ? q.name : '',
        qty: q.qty, unit: q.unit, full: q.full, donation: gift.amount, total: q.total + gift.amount,
        name: text(body.name, 80), email: email(body.email), company: text(body.company, 80),
        teamName: text(body.teamName, 60), blurb: text(body.blurb, 140), tableId: null,
        tableRequest: Boolean(q.ticket && q.ticket.tableRequest && body.tableRequest),
        tableNote: q.ticket && q.ticket.tableRequest && body.tableRequest ? text(body.tableNote, 300) : '',
        via: c.inviteBy.has(body.via) || c.artistBy.has(body.via) ? body.via : '',
        status: ctx.stripe.enabled ? 'awaiting_payment' : 'reserved',
      };
      if (!b.name) throw fail(400, 'Add the name for the booking.');
      if (!b.email) throw fail(400, 'Add a valid email address.');
      if (q.pack && q.pack.needsTeam && !b.teamName) throw fail(400, `The ${q.pack.name} needs a team name.`);

      if (body.mix === 'new' || body.mix === 'join') {
        if (!features.teamTables) throw fail(400, 'Team tables aren’t running on this night.');
        const rules = f.teamTables || { seats: 20, maxTeam: 15 };
        if (!b.teamName) throw fail(400, 'Add a team name so other teams know who you are.');
        if (b.qty > rules.maxTeam) throw fail(400, `Team tables are for teams of up to ${rules.maxTeam}.`);
        if (body.mix === 'join') {
          const t = db.tables.find((x) => x.id === body.tableId && x.night === n.slug);
          if (!t) throw fail(400, 'That table is not on this night. Pick another.');
          if (tableSeatsTaken(t.id) + b.qty > t.seats) throw fail(409, 'That table is now full. Start your own or pick another.');
          b.tableId = t.id;
        } else {
          const t = { id: newId('TBL'), night: n.slug, seats: rules.seats, createdAt: b.createdAt };
          db.tables.push(t);
          b.tableId = t.id;
        }
      }

      if (b.status === 'awaiting_payment') b.holdUntil = new Date(ctx.now() + (cfg.holdMinutes + 5) * 60000).toISOString();
      db.bookings.push(b);
      let checkoutUrl = null;
      if (ctx.stripe.enabled) {
        try { checkoutUrl = await startCheckout(req, b); } catch (e) { b.status = 'cancelled'; await save(); throw e; }
      }
      await save();
      if (b.status === 'reserved') notify(b);
      send(res, 201, { booking: bookingView(b, true), checkoutUrl });
    });

    // The buyer coming back from Stripe (or backing out). Needs the ticket key.
    r.get('/api/bookings/confirm', async (req, res, { url }) => {
      const b = db.bookings.find((x) => x.id === url.searchParams.get('ref'));
      if (!b || !keyOk(b.id, url.searchParams.get('k'))) throw fail(404, 'Booking not found.');
      if (url.searchParams.get('cancelled') && b.status === 'awaiting_payment') {
        b.status = 'cancelled';
        if (b.stripeSession) ctx.stripe.expire(b.stripeSession);
        await save();
      }
      const sid = url.searchParams.get('session_id');
      if (ctx.stripe.enabled && ['awaiting_payment', 'reserved'].includes(b.status) && sid && (b.stripeSessions || []).includes(sid)) {
        const s = await ctx.stripe.session(sid);
        if (s.payment_status !== 'unpaid') markPaid(b);
        else if (s.status === 'complete') b.status = 'processing';
        await save();
      }
      send(res, 200, { booking: bookingView(b, true) });
    });

    r.post('/api/stripe/webhook', async (req, res) => {
      if (!cfg.webhookSecret) throw fail(503, 'Set STRIPE_WEBHOOK_SECRET to receive Stripe webhooks.');
      const payload = await readRaw(req, 1024 * 1024);
      if (!signatureOk(payload, req.headers['stripe-signature'], cfg.webhookSecret)) throw fail(400, 'Bad signature.');
      let event;
      try { event = JSON.parse(payload.toString('utf8')); } catch { throw fail(400, 'Bad payload.'); }
      const s = event.data && event.data.object;
      if (!s || s.object !== 'checkout.session') return send(res, 200, { received: true });
      const meta = s.metadata || {};
      const kind = meta.booking ? 'booking' : meta.order ? 'order' : '';
      const list = kind === 'booking' ? db.bookings : kind === 'order' ? db.orders : [];
      const rec = list.find((x) => x.id === (meta.booking || meta.order) && (x.stripeSessions || []).includes(s.id));
      if (!rec) return send(res, 200, { received: true });
      const paidFn = kind === 'booking' ? markPaid : ctx.markOrderPaid;
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          if (s.payment_status !== 'unpaid') paidFn(rec);
          else if (rec.status === 'awaiting_payment') rec.status = 'processing';
          break;
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired':
          if (['awaiting_payment', 'processing'].includes(rec.status) && rec.stripeSession === s.id) rec.status = 'cancelled';
          break;
        default:
          return send(res, 200, { received: true });
      }
      rec.stripeEvents = (rec.stripeEvents || []).concat(event.type).slice(-10);
      await save();
      send(res, 200, { received: true });
    });

    // ----- door -----
    const door = (req) => { if (!ctx.isDoor(req)) throw fail(401, cfg.doorToken || cfg.adminToken ? 'Wrong door code.' : 'Set DOOR_TOKEN (8+ characters) to use the door page.'); };
    const findRef = (ref) => db.bookings.find((x) => x.id === String(ref || '').trim().toUpperCase());

    r.get('/api/door/lookup', (req, res, { url }) => {
      door(req);
      const b = findRef(url.searchParams.get('ref'));
      if (!b) throw fail(404, 'No booking with that reference.');
      const k = url.searchParams.get('k');
      if (k && !keyOk(b.id, k)) throw fail(400, 'That QR code isn’t valid. Check the reference by hand.');
      send(res, 200, { booking: doorView(b) });
    });

    r.post('/api/door/checkin', async (req, res) => {
      door(req);
      const body = await readJson(req, 2048);
      const b = findRef(body.ref);
      if (!b) throw fail(404, 'No booking with that reference.');
      const count = Number(body.count);
      if (!Number.isInteger(count) || count === 0) throw fail(400, 'Choose how many to check in.');
      if (count > 0 && !doorView(b).ok) throw fail(409, doorView(b).problems[0]);
      const now = (b.checkedIn || 0) + count;
      if (now > b.qty) throw fail(409, `Only ${b.qty - (b.checkedIn || 0)} left on this booking.`);
      if (now < 0) throw fail(400, 'Nothing to undo.');
      b.checkedIn = now;
      b.checkins = (b.checkins || []).concat({ at: new Date(ctx.now()).toISOString(), count }).slice(-20);
      await save();
      send(res, 200, { booking: doorView(b) });
    });

    r.get('/api/door/tonight', (req, res) => {
      door(req);
      const slugs = new Set(tonight().map((n) => n.slug));
      const list = db.bookings.filter((b) => slugs.has(b.night) && ['paid', 'reserved', 'processing'].includes(b.status));
      send(res, 200, {
        nights: tonight().map((n) => `${n.title} · ${n.weekday} ${n.day} ${n.month}`),
        expected: list.reduce((t, b) => t + b.qty, 0),
        arrived: list.reduce((t, b) => t + (b.checkedIn || 0), 0),
      });
    });
  }

  return { routes, holds, salesFor, tablesFor, nightAvailability, ticketKey, keyOk, ticketPath, payPath, bookingView, doorView, markPaid, notify, startCheckout, tonight, paymentEmail };
}
