// The food and drink traders at Mercato Metropolitano Elephant & Castle, TAM's
// neighbours, as a directory on tam.tv (/food), and pre-orders for TAM nights.
//
// - Every listing starts as a draft (content/vendors.json, imported from MM's
//   site). Nothing is public until TAM approves it in /food/manage.
// - A trader claims their listing (TAM checks the claim) or opens an invite TAM
//   sent them by email or Instagram (the invite is the check). A claimed trader
//   signs in by email link and updates their profile and menu; TAM approves each
//   profile change before it shows.
// - Partners take pre-orders: people coming to a TAM night order ahead, pick a
//   collection time, and pay the trader when they collect. The trader sees each
//   night's prep list (how many of each dish) before the cut-off, so they can
//   cook the right amount, waste less and plan their time.
// - Traders' emails and phone numbers are never on a public page.

import crypto from 'node:crypto';
import { fail, send, readJson, text, email as cleanEmail, website, newId, rateLimiter } from '../lib/http.js';
import { clubShell, clubButton } from '../services/mailer.js';
import { escape as e } from '../views/html.js';
import { pounds } from '../../shared/pricing.js';

const COOKIE = 'tam_food';
const DAY = 86400000;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?\d[\s-]?){9,}/;
export const DIETARY = { vegetarian: 'Vegetarian', vegan: 'Vegan', halal: 'Halal', 'gluten-free': 'Gluten-free' };
export const CATEGORIES = { food: 'Food', dessert: 'Sweet things', drinks: 'Drinks' };
export const STATUSES = { draft: 'Draft: waiting for TAM', live: 'Live', hidden: 'Hidden' };
export const PARTNER = { none: 'Not contacted', invited: 'Invited', talking: 'Talking', partner: 'Partner', declined: 'Not now' };
export const ORDER_STATES = { new: 'New', confirmed: 'Confirmed', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled' };
const slugOf = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ’']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const RESERVED = ['manage', 'me', 'in', 'sign-in', 'join', 'preorder', 'order', 'claim'];
export const handleOf = (v) => {
  const s = text(v, 200).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : '';
};
const pence = (v) => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; };

// The words TAM sends a trader to offer a partnership: by email, or pasted into an Instagram DM.
export function pitch({ vendor, link, from = 'TAM' }) {
  return `Hi ${vendor.name} team,

We're TAM (the Temple of Art and Music), your neighbours at Mercato Metropolitano Elephant & Castle. We'd love to partner with you for our festivals and live nights, starting with The Best Christmas Ever this December.

The idea: people coming to a TAM night can pre-order your food before the event and collect it from you at a time they choose. You see every order and a prep list for each night before the cut-off, so you can cook the right amount, waste less and plan your staff and time. They pay you when they collect, and there's no cost to you.

We've made a draft listing for you on TAM's food guide from your MM page. Claim it here to check your profile and menu, and turn pre-orders on if you'd like to take part:
${link}

Nothing goes live until you're happy with it. Any questions, just reply.

${from}
TAM · Temple of Art & Music`;
}

export function vendorsDomain(ctx) {
  const { db, save, cfg, content: c } = ctx;
  const V = c.vendors || { market: {}, vendors: [] };
  for (const k of ['vendorClaims', 'vendorPending', 'vendorLinks', 'vendorSessions', 'vendorInvites', 'vendorOrders', 'vendorExtra', 'vendorOutreach']) if (!Array.isArray(db[k])) db[k] = [];
  if (!db.vendorState || typeof db.vendorState !== 'object') db.vendorState = {}; // per slug: { status, profile, claimedBy[], email, partner, preorder }
  const iso = (t = ctx.now()) => new Date(t).toISOString();
  const site = () => cfg.siteUrl;
  const claimLimited = rateLimiter({ max: 6 });
  const orderLimited = rateLimiter({ max: 12 });

  const stateOf = (slug) => (db.vendorState[slug] = db.vendorState[slug] || {});
  // every listing: the import plus traders staff add, with approved profile changes on top
  function all() {
    return V.vendors.concat(db.vendorExtra).map((v) => {
      const s = db.vendorState[v.slug] || {};
      const p = s.profile || {};
      const menu = (p.menu || v.menu || []).map((m, i) => ({ id: m.id || `${v.slug}-${i}`, section: m.section || '', name: m.name, description: m.description || '', price: Number.isInteger(m.price) ? m.price : null, dietary: m.dietary || [] }));
      const pre = s.preorder || {};
      return {
        slug: v.slug, name: p.name || v.name, tagline: p.tagline ?? v.tagline ?? '', category: p.category || v.category || 'food',
        description: p.description ?? v.description ?? '', dietary: p.dietary || v.dietary || [], instagram: p.instagram ?? v.instagram ?? '',
        website: p.website ?? v.website ?? '', menuLinks: v.menuLinks || [], photos: (p.photos || []).length ? p.photos : v.photo ? [v.photo] : [],
        menu, alsoAt: v.alsoAt || [], source: v.source || '', status: s.status || 'draft', claimed: Boolean((s.claimedBy || []).length),
        partner: s.partner || 'none',
        preorder: { enabled: Boolean(pre.enabled), nights: pre.nights || 'all', cutoffHours: Number.isFinite(pre.cutoffHours) ? pre.cutoffHours : 24, collect: pre.collect || '', maxOrders: pre.maxOrders || 0 },
      };
    });
  }
  const vendor = (slug) => all().find((v) => v.slug === slug);
  const live = () => all().filter((v) => v.status === 'live');
  const photo = (v) => v.photos[0] || '';

  // ---------- pre-orders: which nights, which traders, what's left ----------
  const orderable = (v) => v.status === 'live' && v.preorder.enabled && v.menu.some((m) => m.price !== null);
  const cutoffOf = (v, n) => Date.parse(n.start) - v.preorder.cutoffHours * 3600000;
  const takes = (v, n) => orderable(v) && (v.preorder.nights === 'all' || (Array.isArray(v.preorder.nights) && v.preorder.nights.includes(n.slug)));
  const ordersFor = (slug, night) => db.vendorOrders.filter((o) => o.vendor === slug && (!night || o.night === night) && o.status !== 'cancelled');
  const open = (v, n) => takes(v, n) && ctx.now() < cutoffOf(v, n) && (!v.preorder.maxOrders || ordersFor(v.slug, n.slug).length < v.preorder.maxOrders);
  // upcoming TAM nights (the next 60 days) with at least one trader taking pre-orders
  function nights() {
    const end = new Date(ctx.now() + 60 * DAY).toISOString().slice(0, 10);
    const vs = all().filter(orderable);
    return c.upcoming(ctx.today()).filter((n) => n.date <= end && !n.timesTbc && Date.parse(n.start) > ctx.now())
      .map((n) => ({ n, vendors: vs.filter((v) => open(v, n)) })).filter((x) => x.vendors.length);
  }
  // collection times: every 15 minutes from doors to an hour before the end (or 3 hours in)
  function slots(n) {
    const s = Date.parse(n.start), stop = Math.min(Date.parse(n.end) - 3600000, s + 3 * 3600000);
    const out = [];
    for (let t = s; t <= Math.max(s, stop); t += 15 * 60000) out.push(new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }));
    return out;
  }
  // what to cook for a night: each dish and how many, with the collection times
  function prep(slug, night) {
    const os = ordersFor(slug, night);
    const items = {};
    for (const o of os) for (const i of o.items) items[i.name] = (items[i.name] || 0) + i.qty;
    const bySlot = {};
    for (const o of os) bySlot[o.collect] = (bySlot[o.collect] || 0) + 1;
    return { orders: os.length, items, bySlot, total: os.reduce((t, o) => t + o.total, 0) };
  }

  // ---------- traders: sessions ----------
  const cookieOf = (req) => (new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '') || [])[1] || '';
  const secure = () => (cfg.siteUrl.startsWith('https:') ? '; Secure' : '');
  function traderOf(req) {
    const k = cookieOf(req);
    const s = k && db.vendorSessions.find((x) => x.hash === hash(k) && Date.parse(x.expires) > ctx.now());
    return s ? s.email : '';
  }
  const mine = (mail) => all().filter((v) => ((db.vendorState[v.slug] || {}).claimedBy || []).includes(mail));
  const needTrader = (req) => { const m = traderOf(req); if (!m) throw fail(401, 'Open your trader page from the link we emailed you.'); return m; };
  const mineOr403 = (req, slug) => { const m = needTrader(req); const v = mine(m).find((x) => x.slug === slug); if (!v) throw fail(403, 'That isn’t one of your listings.'); return { mail: m, v }; };

  const sendMail = (msg) => (ctx.mail.enabled() ? ctx.mail.send(msg).catch((err) => console.warn(`Food email: ${err.message}`)) : Promise.resolve());
  async function mailLink(mail, why = 'signin') {
    const t = token();
    db.vendorLinks = db.vendorLinks.filter((l) => Date.parse(l.expires) > ctx.now() && !l.usedAt).concat({ hash: hash(t), email: mail, expires: iso(ctx.now() + 3 * DAY) });
    await save();
    const url = `${site()}/food/in?t=${t}`;
    const names = mine(mail).map((v) => v.name).join(', ');
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">${why === 'approved' ? `You can now manage ${e(names)} on TAM` : 'Your trader page on TAM'}</h1>
      <p>Tap below to check your profile and menu, turn pre-orders on for TAM nights, and see your orders and prep lists. TAM checks profile changes before they go on your page.</p>
      ${clubButton('Open my trader page', url)}<p style="font-size:13px;color:#8a7f86">The link works once, for 3 days. For a new one: ${e(site())}/food/sign-in</p>`;
    await sendMail({ to: mail, subject: why === 'approved' ? `TAM food guide: ${names} is yours to manage` : 'TAM food guide: your sign-in link', html: clubShell(inner, { preheader: 'Your listing on TAM’s food guide.' }), text: `Open your trader page: ${url}` });
  }
  function tellTeam(subject, lines) {
    if (!cfg.enquiriesTo) return;
    const link = `${site()}/food/manage`;
    sendMail({ to: cfg.enquiriesTo, subject: `TAM food guide: ${subject}`,
      html: clubShell(`<h1 style="font-size:24px;margin:0 0 10px">${e(subject)}</h1>${lines.map((l) => `<p>${e(l)}</p>`).join('')}${clubButton('Open the food guide back office', link)}`),
      text: `${subject}\n\n${lines.join('\n')}\n\n${link}` });
  }
  const tellTraders = (slug, subject, inner, textBody) => {
    const to = (db.vendorState[slug] || {}).claimedBy || [];
    if (to.length) sendMail({ to, subject, html: clubShell(inner), text: textBody });
  };
  function claim(v, mail) {
    const s = stateOf(v.slug);
    s.claimedBy = [...new Set((s.claimedBy || []).concat(mail))];
    if (s.partner === 'none' || !s.partner) s.partner = 'talking';
  }

  // A trader's profile as sent (from them or from staff), cleaned. Throws on anything a public page can't carry.
  function cleanProfile(b, v) {
    const description = text(b.description, 1500);
    const tagline = text(b.tagline, 120);
    const contact = CONTACT.exec(`${description} ${tagline}`);
    if (contact) throw fail(400, `Please take “${contact[0].trim().slice(0, 40)}” out: phone numbers and email addresses can’t go on a public page. People pre-order through TAM instead.`);
    const menu = [];
    for (const m of (Array.isArray(b.menu) ? b.menu : []).slice(0, 80)) {
      const name = text(m && m.name, 80);
      if (!name) continue;
      const price = m.price === '' || m.price === null || m.price === undefined ? null : pence(m.price);
      if (price === null && m.price !== '' && m.price !== null && m.price !== undefined) throw fail(400, `Check the price for “${name}”: use pounds, like 9.50.`);
      menu.push({ id: text(m.id, 40) || newId('MI', 5), section: text(m.section, 40), name, description: text(m.description, 200), price, dietary: (Array.isArray(m.dietary) ? m.dietary : []).filter((d) => DIETARY[d]) });
    }
    const site0 = b.website ? website(b.website) : '';
    if (b.website && !site0) throw fail(400, 'That website address doesn’t look right.');
    const ig = b.instagram ? handleOf(b.instagram) : '';
    if (b.instagram && !ig) throw fail(400, 'Add the Instagram handle, like @yourname, or the profile link.');
    const own = new RegExp(`^/uploads/food-${v.slug}-[0-9a-f]+\\.(jpg|png|webp)$`);
    const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p) => typeof p === 'string' && (own.test(p) || v.photos.includes(p))).slice(0, 6);
    return { name: text(b.name, 60) || v.name, tagline, description, category: CATEGORIES[b.category] ? b.category : v.category,
      dietary: (Array.isArray(b.dietary) ? b.dietary : []).filter((d) => DIETARY[d]), instagram: ig, website: site0, photos, menu };
  }
  const pendingFor = (slug) => db.vendorPending.find((p) => p.vendor === slug && p.status === 'pending');

  function routes(r) {
    // ----- the public: directory data, claim, pre-order -----
    r.get('/api/food', (req, res) => send(res, 200, { market: V.market, vendors: live().map(publicView) }));
    r.post('/api/food/:slug/claim', async (req, res, { params }) => {
      const v = vendor(params.slug);
      if (!v || v.status === 'hidden') throw fail(404, 'No such listing.');
      if (claimLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 4096);
      const mail = cleanEmail(b.email);
      if (!text(b.name, 80)) throw fail(400, 'Add your name.');
      if (!mail) throw fail(400, 'Add a valid email address.');
      if (!text(b.role, 80)) throw fail(400, 'Tell us your role (owner, manager…).');
      if (b.consent !== true) throw fail(400, 'Tick the box to confirm.');
      if (db.vendorClaims.some((x) => x.vendor === v.slug && x.email === mail && x.status === 'pending')) return send(res, 200, { ok: true, already: true });
      db.vendorClaims.push({ id: newId('VC', 6), vendor: v.slug, name: text(b.name, 80), email: mail, role: text(b.role, 80), phone: text(b.phone, 30), note: text(b.note, 600), at: iso(), status: 'pending' });
      await save();
      tellTeam(`a claim for ${v.name} to check`, [`${text(b.name, 80)} (${text(b.role, 80)}) wants to manage ${v.name}’s listing.`]);
      send(res, 201, { ok: true });
    });
    // an invite TAM sent (email or Instagram): the trader adds their email and it's theirs to manage
    r.get('/api/food/join', (req, res, { url }) => {
      const inv = db.vendorInvites.find((x) => x.hash === hash(url.searchParams.get('t') || '') && Date.parse(x.expires) > ctx.now());
      if (!inv) throw fail(400, 'That invite has expired. Ask TAM for a new one.');
      const v = vendor(inv.vendor);
      send(res, 200, { vendor: v ? publicView(v, true) : null, email: inv.email || '' });
    });
    r.post('/api/food/join', async (req, res) => {
      if (claimLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 4096);
      const inv = db.vendorInvites.find((x) => x.hash === hash(String(b.t || '')) && Date.parse(x.expires) > ctx.now());
      if (!inv) throw fail(400, 'That invite has expired. Ask TAM for a new one.');
      const v = vendor(inv.vendor);
      if (!v) throw fail(404, 'No such listing.');
      const mail = cleanEmail(b.email);
      if (!text(b.name, 80)) throw fail(400, 'Add your name.');
      if (!mail) throw fail(400, 'Add a valid email address.');
      if (b.consent !== true) throw fail(400, 'Tick the box to confirm.');
      db.vendorClaims.push({ id: newId('VC', 6), vendor: v.slug, name: text(b.name, 80), email: mail, role: text(b.role, 80), phone: text(b.phone, 30), note: 'Joined from TAM’s invite', at: iso(), status: 'approved', decidedBy: `invite (${inv.channel})`, decidedAt: iso() });
      claim(v, mail);
      inv.usedAt = iso();
      inv.uses = (inv.uses || 0) + 1;
      await save();
      await mailLink(mail, 'approved');
      tellTeam(`${v.name} joined from your invite`, [`${text(b.name, 80)} (${text(b.role, 80) || 'role not given'}) opened the ${inv.channel} invite and now manages ${v.name}’s listing.`]);
      send(res, 201, { ok: true });
    });

    r.get('/api/food/preorder', (req, res, { url }) => {
      const want = url.searchParams.get('night');
      send(res, 200, { nights: nights().map(({ n, vendors }) => ({ slug: n.slug, title: n.title, date: n.date, weekday: n.weekday, day: n.day, month: n.month, doors: n.doors, slots: slots(n), selected: n.slug === want,
        vendors: vendors.map((v) => ({ ...publicView(v), menu: v.menu.filter((m) => m.price !== null), cutoff: iso(cutoffOf(v, n)), collect: v.preorder.collect })) })) });
    });
    r.post('/api/food/preorder', async (req, res) => {
      if (orderLimited(req)) throw fail(429, 'That’s a lot of orders. Try again in a few minutes.');
      const b = await readJson(req, 16 * 1024);
      const n = c.nightBy.get(text(b.night, 120));
      const v = vendor(text(b.vendor, 60));
      if (!n || !v || !takes(v, n)) throw fail(400, 'That trader isn’t taking pre-orders for this night.');
      if (ctx.now() >= cutoffOf(v, n)) throw fail(400, `Pre-orders for ${v.name} closed ${v.preorder.cutoffHours} hours before the night.`);
      if (!open(v, n)) throw fail(400, `${v.name} is fully booked for pre-orders this night.`);
      const mail = cleanEmail(b.email);
      const name = text(b.name, 80);
      if (!name) throw fail(400, 'Add your name, so they know whose order it is.');
      if (!mail) throw fail(400, 'Add a valid email address for your confirmation.');
      const collect = text(b.collect, 5);
      if (!slots(n).includes(collect)) throw fail(400, 'Pick a collection time.');
      const items = [];
      for (const x of Array.isArray(b.items) ? b.items : []) {
        const m = v.menu.find((y) => y.id === x.id && y.price !== null);
        const qty = Math.max(0, Math.min(20, parseInt(x.qty, 10) || 0));
        if (m && qty) items.push({ id: m.id, name: m.name, price: m.price, qty });
      }
      if (!items.length) throw fail(400, 'Add at least one dish.');
      const k = token();
      const o = { id: newId('FO', 6), key: hash(k), night: n.slug, vendor: v.slug, name, email: mail, phone: text(b.phone, 30), collect, notes: text(b.notes, 300),
        items, total: items.reduce((t, i) => t + i.price * i.qty, 0), at: iso(), status: 'new', booking: text(b.booking, 40) };
      db.vendorOrders.push(o);
      await save();
      const link = `${site()}/food/order/${o.id}?k=${k}`;
      const lines = items.map((i) => `${i.qty} × ${i.name} (${pounds(i.price * i.qty)})`);
      sendMail({ to: mail, subject: `Your pre-order from ${v.name} for ${n.title}`,
        html: clubShell(`<h1 style="font-size:26px;margin:0 0 10px">Your order is in</h1><p><b>${e(v.name)}</b> · ${e(n.title)}, ${e(`${n.weekday} ${n.day} ${n.month}`)} · collect at <b>${e(collect)}</b>${v.preorder.collect ? ` from ${e(v.preorder.collect)}` : ''}, Mercato Metropolitano Elephant &amp; Castle.</p>
          <p>${lines.map(e).join('<br>')}</p><p><b>Total ${e(pounds(o.total))}</b>: pay ${e(v.name)} when you collect.</p>${clubButton('See or cancel my order', link)}
          <p style="font-size:13px;color:#8a7f86">Plans changed? Cancel before ${e(new Date(cutoffOf(v, n)).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }))} so no food goes to waste.</p>`),
        text: `${v.name} · ${n.title} · collect at ${collect}\n${lines.join('\n')}\nTotal ${pounds(o.total)}, pay when you collect.\n${link}` });
      tellTraders(v.slug, `New pre-order: ${items.reduce((t, i) => t + i.qty, 0)} items for ${n.title} (${n.day} ${n.month})`,
        `<h1 style="font-size:24px;margin:0 0 10px">New pre-order</h1><p>${e(name)} · collect at <b>${e(collect)}</b> · ${e(n.title)}, ${e(`${n.weekday} ${n.day} ${n.month}`)}</p><p>${lines.map(e).join('<br>')}</p>${o.notes ? `<p>Note: “${e(o.notes)}”</p>` : ''}<p><b>${e(pounds(o.total))}</b> to take on collection.</p>${clubButton('See the prep list', `${site()}/food/me`)}`,
        `${name} · ${collect} · ${n.title}\n${lines.join('\n')}\n${pounds(o.total)}`);
      send(res, 201, { ok: true, id: o.id, total: o.total, link });
    });
    // the person who ordered: see it, cancel before the cut-off
    const orderByKey = (id, k) => { const o = db.vendorOrders.find((x) => x.id === id); if (!o || o.key !== hash(String(k || ''))) throw fail(404, 'We couldn’t find that order.'); return o; };
    r.get('/api/food/order/:id', (req, res, { params, url }) => {
      const o = orderByKey(params.id, url.searchParams.get('k'));
      const v = vendor(o.vendor), n = c.nightBy.get(o.night);
      send(res, 200, { order: { ...o, key: undefined, email: undefined }, vendor: v ? { name: v.name, slug: v.slug, collect: v.preorder.collect } : null, night: n ? { title: n.title, weekday: n.weekday, day: n.day, month: n.month } : null,
        canCancel: o.status !== 'cancelled' && o.status !== 'collected' && v && n && ctx.now() < cutoffOf(v, n) });
    });
    r.post('/api/food/order/:id/cancel', async (req, res, { params }) => {
      const b = await readJson(req, 1024);
      const o = orderByKey(params.id, b.k);
      const v = vendor(o.vendor), n = c.nightBy.get(o.night);
      if (o.status === 'cancelled') return send(res, 200, { ok: true });
      if (!v || !n || ctx.now() >= cutoffOf(v, n)) throw fail(400, `It’s past the cut-off, so ${v ? v.name : 'the trader'} has started preparing. Speak to them on the night.`);
      Object.assign(o, { status: 'cancelled', cancelledAt: iso(), cancelledBy: 'customer' });
      await save();
      tellTraders(v.slug, `Pre-order cancelled: ${n.title}`, `<p>${e(o.name)} cancelled their ${e(o.collect)} order (${e(pounds(o.total))}) for ${e(n.title)}.</p>`, `${o.name} cancelled their ${o.collect} order.`);
      send(res, 200, { ok: true });
    });

    // ----- traders: sign in, their listings, orders -----
    r.post('/api/food/sign-in', async (req, res) => {
      if (claimLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 1024);
      const mail = cleanEmail(b.email);
      if (mail && mine(mail).length) await mailLink(mail);
      send(res, 200, { ok: true }); // the same answer either way
    });
    r.post('/api/food/in', async (req, res) => {
      const b = await readJson(req, 1024);
      const l = db.vendorLinks.find((x) => x.hash === hash(String(b.t || '')) && !x.usedAt && Date.parse(x.expires) > ctx.now());
      if (!l) throw fail(400, 'That link has expired or was already used. Ask for a new one.');
      l.usedAt = iso();
      const t = token();
      db.vendorSessions = db.vendorSessions.filter((s) => Date.parse(s.expires) > ctx.now()).concat({ hash: hash(t), email: l.email, expires: iso(ctx.now() + 30 * DAY) });
      res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure()}`);
      await save();
      send(res, 200, { ok: true, next: '/food/me' });
    });
    r.post('/api/food/signout', async (req, res) => {
      const k = cookieOf(req);
      if (k) db.vendorSessions = db.vendorSessions.filter((s) => s.hash !== hash(k));
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
      await save();
      send(res, 200, { ok: true });
    });
    r.get('/api/food/me', (req, res) => {
      const mail = needTrader(req);
      const up = c.upcoming(ctx.today()).filter((n) => Date.parse(n.end) > ctx.now() - DAY).slice(0, 40);
      send(res, 200, { email: mail, dietary: DIETARY, categories: CATEGORIES, statuses: ORDER_STATES,
        nights: up.map((n) => ({ slug: n.slug, title: n.title, date: n.date, weekday: n.weekday, day: n.day, month: n.month, doors: n.doors, timesTbc: n.timesTbc })),
        vendors: mine(mail).map((v) => ({ ...v, pending: pendingFor(v.slug) || null, rejected: db.vendorPending.filter((p) => p.vendor === v.slug && p.status === 'rejected').slice(-1)[0] || null,
          orders: db.vendorOrders.filter((o) => o.vendor === v.slug && up.some((n) => n.slug === o.night)).map((o) => ({ ...o, key: undefined })),
          prep: Object.fromEntries(up.map((n) => [n.slug, prep(v.slug, n.slug)]).filter(([, p]) => p.orders)) })) });
    });
    r.post('/api/food/me/:slug/photo', async (req, res, { params }) => {
      mineOr403(req, params.slug);
      const b = await readJson(req, 900 * 1024);
      const url = await ctx.saveImage(b.photo, `food-${params.slug}-${crypto.randomBytes(6).toString('hex')}`, { what: 'Photos', maxKB: 600 });
      send(res, 200, { photo: url }); // not on the page until TAM approves the change with it
    });
    r.post('/api/food/me/:slug', async (req, res, { params }) => {
      const { mail, v } = mineOr403(req, params.slug);
      const b = await readJson(req, 64 * 1024);
      const changes = cleanProfile(b, v);
      const old = pendingFor(v.slug);
      if (old) old.status = 'replaced';
      const p = { id: newId('VP', 6), vendor: v.slug, by: mail, at: iso(), status: 'pending', changes };
      db.vendorPending.push(p);
      await save();
      tellTeam(`an update to ${v.name}’s listing to approve`, [`${v.name} sent a profile update (${changes.menu.length} menu items). It isn’t on the page until TAM approves it.`]);
      send(res, 201, { pending: p });
    });
    // pre-order settings take effect straight away: they're the trader's call
    r.post('/api/food/me/:slug/preorder', async (req, res, { params }) => {
      const { v } = mineOr403(req, params.slug);
      const b = await readJson(req, 8 * 1024);
      const nightsIn = b.nights === 'all' ? 'all' : (Array.isArray(b.nights) ? b.nights : []).map((x) => text(x, 120)).filter((x) => c.nightBy.has(x)).slice(0, 60);
      const s = stateOf(v.slug);
      s.preorder = { enabled: b.enabled === true, nights: nightsIn, cutoffHours: Math.max(2, Math.min(96, parseInt(b.cutoffHours, 10) || 24)), collect: text(b.collect, 120), maxOrders: Math.max(0, Math.min(500, parseInt(b.maxOrders, 10) || 0)) };
      if (s.preorder.enabled && s.partner !== 'partner') { s.partner = 'partner'; tellTeam(`${v.name} turned pre-orders on`, [`${v.name} is now taking pre-orders for ${nightsIn === 'all' ? 'every TAM night' : `${nightsIn.length} TAM night${nightsIn.length === 1 ? '' : 's'}`}, cut-off ${s.preorder.cutoffHours} hours before.`]); }
      await save();
      send(res, 200, { preorder: vendor(v.slug).preorder, live: v.status === 'live', priced: v.menu.some((m) => m.price !== null) });
    });
    r.post('/api/food/me/orders/:id', async (req, res, { params }) => {
      const mail = needTrader(req);
      const o = db.vendorOrders.find((x) => x.id === params.id);
      if (!o || !mine(mail).some((v) => v.slug === o.vendor)) throw fail(404, 'No such order.');
      const b = await readJson(req, 2048);
      if (!ORDER_STATES[b.status] || b.status === 'new') throw fail(400, 'Unknown status.');
      if (o.status === 'cancelled') throw fail(400, 'That order was cancelled.');
      o.status = b.status;
      o.updatedAt = iso();
      await save();
      const v = vendor(o.vendor), n = c.nightBy.get(o.night);
      if (b.status === 'cancelled') sendMail({ to: o.email, subject: `${v.name} couldn’t take your pre-order`, html: clubShell(`<h1 style="font-size:24px;margin:0 0 10px">Your pre-order was cancelled</h1><p>${e(v.name)} can’t make your ${e(o.collect)} order for ${e(n ? n.title : 'the night')}${b.message ? `: “${e(text(b.message, 300))}”` : '.'} You haven’t paid anything.</p>`), text: `${v.name} cancelled your pre-order. ${text(b.message, 300)}` });
      if (b.status === 'confirmed' && !o.confirmedMail) { o.confirmedMail = true; sendMail({ to: o.email, subject: `${v.name} confirmed your pre-order`, html: clubShell(`<h1 style="font-size:24px;margin:0 0 10px">Confirmed</h1><p>${e(v.name)} has your order and will have it ready at ${e(o.collect)}${n ? ` for ${e(n.title)}` : ''}.</p>`), text: `${v.name} confirmed your order for ${o.collect}.` }); await save(); }
      send(res, 200, { ok: true });
    });
    r.get('/api/food/me/:slug/orders.csv', (req, res, { params, url }) => {
      const { v } = mineOr403(req, params.slug);
      send(res, 200, csv(db.vendorOrders.filter((o) => o.vendor === v.slug && (!url.searchParams.get('night') || o.night === url.searchParams.get('night')))), csvHeaders(`${v.slug}-preorders.csv`));
    });

    // ----- staff: /food/manage -----
    const guard = (req) => ctx.team.guard(req, 'ops');
    r.get('/api/food/manage', (req, res) => {
      const who = guard(req);
      const vs = all();
      send(res, 200, {
        me: { name: who.name }, market: V.market, dietary: DIETARY, categories: CATEGORIES, statuses: STATUSES, partner: PARTNER, orderStates: ORDER_STATES,
        vendors: vs.map((v) => { const s = db.vendorState[v.slug] || {}; return { ...v, email: s.email || '', phone: s.phone || '', notes: s.notes || '', traders: s.claimedBy || [], approvedBy: s.approvedBy || '', approvedAt: s.approvedAt || '',
          outreach: db.vendorOutreach.filter((x) => x.vendor === v.slug), orders: ordersFor(v.slug).filter((o) => { const n = c.nightBy.get(o.night); return n && n.date >= ctx.today(); }).length }; }),
        claims: db.vendorClaims.filter((x) => x.status === 'pending').map((x) => ({ ...x, vendorName: (vs.find((v) => v.slug === x.vendor) || {}).name })),
        changes: db.vendorPending.filter((x) => x.status === 'pending').map((x) => ({ ...x, current: vs.find((v) => v.slug === x.vendor) })),
        orders: db.vendorOrders.filter((o) => { const n = c.nightBy.get(o.night); return n && n.date >= ctx.today(); }).map((o) => ({ ...o, key: undefined, vendorName: (vs.find((v) => v.slug === o.vendor) || {}).name, nightTitle: (c.nightBy.get(o.night) || {}).title })),
      });
    });
    r.post('/api/food/manage/vendors/:slug', async (req, res, { params }) => {
      const who = guard(req);
      const v = vendor(params.slug);
      if (!v) throw fail(404, 'No such listing.');
      const b = await readJson(req, 64 * 1024);
      const s = stateOf(v.slug);
      if (b.action === 'approve') {
        if (!v.description && !v.tagline) throw fail(400, 'Add a line about them before it goes live.');
        Object.assign(s, { status: 'live', approvedBy: who.name, approvedAt: iso() });
      } else if (b.action === 'hide') s.status = 'hidden';
      else if (b.action === 'draft') s.status = 'draft';
      else if (b.action === 'contact') { // private: how TAM reaches them
        if (b.email && !cleanEmail(b.email)) throw fail(400, 'That email doesn’t look right.');
        s.email = cleanEmail(b.email);
        s.phone = text(b.phone, 30);
        s.notes = text(b.notes, 1000);
        if (b.partner && PARTNER[b.partner]) s.partner = b.partner;
      } else if (b.action === 'edit') s.profile = cleanProfile(b.profile || {}, v); // staff edit: applies straight away
      else if (b.action === 'unclaim') s.claimedBy = [];
      else throw fail(400, 'Unknown action.');
      await save();
      send(res, 200, { vendor: vendor(v.slug) });
    });
    r.post('/api/food/manage/vendors', async (req, res) => {
      guard(req);
      const b = await readJson(req, 8 * 1024);
      const name = text(b.name, 60);
      if (!name) throw fail(400, 'Add the trader’s name.');
      let slug = slugOf(name), i = 2;
      while (vendor(slug) || RESERVED.includes(slug)) slug = `${slugOf(name)}-${i++}`;
      db.vendorExtra.push({ slug, name, tagline: text(b.tagline, 120), category: CATEGORIES[b.category] ? b.category : 'food', description: '', dietary: [], instagram: handleOf(b.instagram || ''), website: b.website ? website(b.website) : '', menuLinks: [], photo: '', alsoAt: [], source: 'added by TAM' });
      await save();
      send(res, 201, { slug });
    });
    r.post('/api/food/manage/claims/:id', async (req, res, { params }) => {
      const who = guard(req);
      const x = db.vendorClaims.find((y) => y.id === params.id && y.status === 'pending');
      if (!x) throw fail(404, 'No such claim.');
      const b = await readJson(req, 2048);
      const v = vendor(x.vendor);
      if (b.action === 'approve') {
        claim(v, x.email);
        Object.assign(x, { status: 'approved', decidedBy: who.name, decidedAt: iso() });
        const s = stateOf(v.slug);
        if (!s.email) s.email = x.email;
        await save();
        await mailLink(x.email, 'approved');
      } else if (b.action === 'reject') {
        Object.assign(x, { status: 'rejected', decidedBy: who.name, decidedAt: iso(), reason: text(b.message, 600) });
        if (b.email) sendMail({ to: x.email, subject: 'TAM food guide: your claim', html: clubShell(`<h1 style="font-size:24px;margin:0 0 10px">About your claim</h1><p>${e(b.message || 'We couldn’t confirm your claim for this listing. Reply to this email and we’ll help.')}</p>`), text: b.message || '' });
      } else throw fail(400, 'Approve or reject.');
      await save();
      send(res, 200, { ok: true });
    });
    r.post('/api/food/manage/changes/:id', async (req, res, { params }) => {
      const who = guard(req);
      const p = db.vendorPending.find((y) => y.id === params.id && y.status === 'pending');
      if (!p) throw fail(404, 'No such change.');
      const b = await readJson(req, 2048);
      const v = vendor(p.vendor);
      if (b.action === 'approve') {
        stateOf(p.vendor).profile = p.changes;
        Object.assign(p, { status: 'approved', decidedBy: who.name, decidedAt: iso() });
        sendMail({ to: p.by, subject: 'TAM food guide: your update is live', html: clubShell(`<h1 style="font-size:24px;margin:0 0 10px">Your update is approved</h1><p>Your changes to ${e(p.changes.name)} are ${v.status === 'live' ? `live on <a href="${e(site())}/food/${e(v.slug)}">your page</a>` : 'saved; your listing goes live once TAM publishes the food guide entry'}.</p>`), text: 'Your update is approved.' });
      } else if (b.action === 'reject') {
        Object.assign(p, { status: 'rejected', decidedBy: who.name, decidedAt: iso(), reason: text(b.message, 600) });
        sendMail({ to: p.by, subject: 'TAM food guide: about your update', html: clubShell(`<h1 style="font-size:24px;margin:0 0 10px">A change we couldn’t make</h1><p>${e(b.message || 'We couldn’t put this update on your page.')}</p><p>You can edit it and send it again.</p>`), text: b.message || '' });
      } else throw fail(400, 'Approve or reject.');
      await save();
      send(res, 200, { ok: true });
    });
    // Offer a partnership: an invite link (30 days) sent by email from TAM, or a message to paste into an Instagram DM.
    r.post('/api/food/manage/outreach/:slug', async (req, res, { params }) => {
      const who = guard(req);
      const v = vendor(params.slug);
      if (!v) throw fail(404, 'No such listing.');
      const b = await readJson(req, 16 * 1024);
      const s = stateOf(v.slug);
      const channel = b.channel === 'instagram' ? 'instagram' : b.channel === 'email' ? 'email' : '';
      if (!channel) throw fail(400, 'Email or Instagram?');
      const t = token();
      const to = channel === 'email' ? cleanEmail(b.email || s.email) : '';
      if (channel === 'email' && !to) throw fail(400, 'Add their email address first.');
      const ig = channel === 'instagram' ? handleOf(b.instagram || v.instagram) : '';
      if (channel === 'instagram' && !ig) throw fail(400, 'Add their Instagram handle first.');
      db.vendorInvites.push({ hash: hash(t), vendor: v.slug, channel, email: to, expires: iso(ctx.now() + 30 * DAY), by: who.name, at: iso() });
      const link = `${site()}/food/join?t=${t}`;
      const message = (text(b.message, 4000) || pitch({ vendor: v, link: '{link}', from: who.name === 'Admin' ? 'TAM' : who.name })).replace('{link}', link);
      if (channel === 'email') {
        if (!ctx.mail.enabled()) throw fail(503, 'Email isn’t set up on this server.');
        await ctx.mail.send({ to, subject: text(b.subject, 140) || `Partner with TAM for The Best Christmas Ever: pre-orders for ${v.name}`,
          html: clubShell(message.split(/\n{2,}/).map((para) => `<p>${e(para).replace(/\n/g, '<br>').replace(e(link), `<a href="${e(link)}">${e(link)}</a>`)}</p>`).join('') + clubButton('See my listing', link)), text: message });
        s.email = s.email || to;
      }
      db.vendorOutreach.push({ id: newId('VO', 5), vendor: v.slug, channel, to: to || `@${ig}`, by: who.name, at: iso(), note: text(b.note, 300) });
      if (!s.partner || s.partner === 'none') s.partner = 'invited';
      await save();
      send(res, 200, { ok: true, channel, link, message, dm: ig ? `https://ig.me/m/${ig}` : '', profile: ig ? `https://www.instagram.com/${ig}/` : '' });
    });
    r.get('/api/food/manage/pitch/:slug', (req, res, { params }) => {
      const who = guard(req);
      const v = vendor(params.slug);
      if (!v) throw fail(404, 'No such listing.');
      send(res, 200, { message: pitch({ vendor: v, link: '{link}', from: who.name === 'Admin' ? 'TAM' : who.name }) });
    });
    r.post('/api/food/manage/orders/:id', async (req, res, { params }) => {
      guard(req);
      const o = db.vendorOrders.find((x) => x.id === params.id);
      if (!o) throw fail(404, 'No such order.');
      const b = await readJson(req, 1024);
      if (!ORDER_STATES[b.status]) throw fail(400, 'Unknown status.');
      o.status = b.status;
      await save();
      send(res, 200, { ok: true });
    });
    r.get('/api/food/manage/orders.csv', (req, res) => { guard(req); send(res, 200, csv(db.vendorOrders), csvHeaders('tam-food-preorders.csv')); });
  }

  const nightTitle = (slug) => { const n = c.nightBy.get(slug); return n ? `${n.title} (${n.date})` : slug; };
  function csv(os) {
    const rows = [['Order', 'Night', 'Trader', 'Collect', 'Name', 'Phone', 'Items', 'Total', 'Status', 'Notes', 'Ordered']]
      .concat(os.map((o) => [o.id, nightTitle(o.night), (vendor(o.vendor) || {}).name || o.vendor, o.collect, o.name, o.phone, o.items.map((i) => `${i.qty} x ${i.name}`).join('; '), (o.total / 100).toFixed(2), o.status, o.notes, o.at]));
    return rows.map((r0) => r0.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }
  const csvHeaders = (name) => ({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });

  // what a public page can show (no emails, no phone numbers)
  function publicView(v, draftOk = false) {
    if (!draftOk && v.status !== 'live') return null;
    return { slug: v.slug, name: v.name, tagline: v.tagline, category: v.category, description: v.description, dietary: v.dietary, instagram: v.instagram, website: v.website,
      photo: photo(v), photos: v.photos, menuLinks: v.menuLinks, alsoAt: v.alsoAt, claimed: v.claimed, preorders: orderable(v) };
  }
  const nightsFor = (slug) => nights().filter((x) => x.vendors.some((v) => v.slug === slug)).map((x) => x.n);
  const forNight = (nightSlug) => { const x = nights().find((y) => y.n.slug === nightSlug); return x ? x.vendors : []; };
  return { routes, all, live, vendor, publicView, nights, nightsFor, forNight, orderable, slots, prep, market: V.market, V, traderOf };
}
