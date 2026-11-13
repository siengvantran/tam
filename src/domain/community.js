// The Party Wall, remix cards, sponsorship enquiries, following artists,
// "Bring them back" / "I was there", and visit counts for artist stats.

import crypto from 'node:crypto';
import { fail, send, readJson, text, email, website, newId } from '../lib/http.js';
import { followEmail } from '../services/mailer.js';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|embedly|curl|wget|python|headless|lighthouse/i;
export const isBot = (req) => BOT.test(req.headers['user-agent'] || '');

export function communityDomain(ctx) {
  const { db, save, content: c, cfg } = ctx;
  const feature = (slug, name) => {
    const f = c.festivalBy.get(slug);
    if (!f || !f.features[name]) throw fail(400, 'That isn’t running for this festival.');
    return f;
  };

  // Counted per day, for the artist stats in /admin. Link-preview bots don't count.
  function track(key, req) {
    if (isBot(req)) return;
    const day = new Date(ctx.now()).toISOString().slice(0, 10);
    let v = db.visits.find((x) => x.key === key && x.day === day);
    if (!v) db.visits.push(v = { key, day, n: 0 });
    v.n++;
    save();
  }

  const publicPin = ({ id, company, tagline, website: site, logo, night, featured, festival }) => ({ id, company, tagline, website: site, logo, night, featured, festival });
  const pinsFor = (festival) => db.pins.filter((p) => p.status === 'approved' && (!festival || p.festival === festival))
    .sort((a, b) => (b.featured - a.featured) || String(a.night).localeCompare(String(b.night))).map(publicPin);

  function routes(r) {
    // ----- the Party Wall -----
    r.get('/api/pins', (req, res, { url }) => send(res, 200, { pins: pinsFor(url.searchParams.get('festival')) }));

    r.post('/api/pins', async (req, res) => {
      const body = await readJson(req, 800 * 1024);
      const ref = text(body.ref, 20).toUpperCase();
      const who = email(body.email);
      const booking = db.bookings.find((b) => b.id === ref && b.email === who && ['paid', 'reserved', 'processing'].includes(b.status));
      const sponsor = db.sponsors.find((s) => s.id === ref && s.email === who && s.status === 'confirmed');
      if (!booking && !sponsor) throw fail(403, 'We could not match that booking reference and email.');
      const festival = booking ? booking.festival : sponsor.festival;
      if (!festival) throw fail(400, 'That booking isn’t part of a festival with a Party Wall.');
      feature(festival, 'partyWall');
      if (db.pins.some((p) => p.ref === ref && p.status !== 'hidden')) throw fail(409, 'That booking already has a pin on the wall.');
      const company = text(body.company, 60);
      if (!company) throw fail(400, 'Add your company name.');
      const id = newId('PIN');
      const pin = {
        id, ref, festival, createdAt: new Date(ctx.now()).toISOString(), company,
        tagline: text(body.tagline, 90), website: website(body.website),
        logo: await ctx.saveImage(body.logo, id, { what: 'Logos', maxKB: 500 }),
        night: booking ? booking.night : sponsor.night || '', featured: Boolean(sponsor),
        status: cfg.pinModeration ? 'pending' : 'approved',
      };
      db.pins.push(pin);
      await save();
      send(res, 201, { status: pin.status });
    });

    // ----- remix cards: someone's version of a festival's song, shared by link -----
    r.post('/api/cards', async (req, res) => {
      const body = await readJson(req, 2600 * 1024);
      const f = feature(body.festival, 'cards');
      const rules = f.cards || {};
      const pick = (list, allowed, max) => [...new Set((Array.isArray(list) ? list : []).filter((v) => allowed.includes(v)))].slice(0, max);
      const story = f.song && f.song.stories ? c.storyBy.get(f.song.stories) : null;
      const themes = story ? story.themes.map((t) => t.id) : [];
      const card = {
        id: newId('', 8), festival: f.slug, createdAt: new Date(ctx.now()).toISOString(),
        to: text(body.to, 40), from: text(body.from, 40), text: text(body.text, 200),
        fx: pick(body.fx, rules.fx || [], 6),
        stories: Boolean(story) && body.stories !== false,
        theme: themes.includes(body.theme) ? body.theme : themes[0] || '',
        polaroids: rules.polaroids ? pick(body.polaroids, c.polaroids.map((p) => p.id), rules.maxPolaroids || 4) : [],
        photos: [],
      };
      const own = (Array.isArray(body.photos) ? body.photos : []).slice(0, rules.maxOwnPhotos || 0);
      for (let i = 0; i < own.length; i++) card.photos.push(await ctx.saveImage(own[i], `card-${card.id}-${i + 1}`, { what: 'Photos', maxKB: 700 }));
      db.cards.push(card);
      await save();
      send(res, 201, { id: card.id, url: `${ctx.base(req)}/card/${card.id}` });
    });

    // ----- sponsorship enquiries -----
    r.post('/api/sponsors', async (req, res) => {
      const body = await readJson(req, 20 * 1024);
      const f = feature(body.festival, 'sponsorship');
      const pkg = f.sponsorship.packages.find((p) => p.id === body.package);
      if (!pkg) throw fail(400, 'Pick a sponsorship package.');
      const n = c.nightBy.get(body.night);
      const s = {
        id: newId('SPN'), festival: f.slug, createdAt: new Date(ctx.now()).toISOString(), package: pkg.id,
        company: text(body.company, 80), name: text(body.name, 80), email: email(body.email), phone: text(body.phone, 30),
        night: n && n.festival === f.slug ? n.slug : '', message: text(body.message, 1000), status: 'enquiry',
      };
      if (!s.company || !s.name) throw fail(400, 'Add your company and your name.');
      if (!s.email) throw fail(400, 'Add a valid email address.');
      db.sponsors.push(s);
      await save();
      send(res, 201, { id: s.id });
    });

    // ----- follow an artist (explicit consent, one-click unsubscribe) -----
    r.post('/api/follow', async (req, res) => {
      const body = await readJson(req, 2048);
      const a = c.artistBy.get(body.artist);
      if (!a) throw fail(400, 'Unknown artist.');
      const mail = email(body.email);
      if (!mail) throw fail(400, 'Add a valid email address.');
      if (body.consent !== true) throw fail(400, 'Tick the box to agree to emails.');
      let f = db.follows.find((x) => x.artist === a.slug && x.email === mail);
      if (f && !f.unsubscribedAt) return send(res, 200, { ok: true, already: true });
      if (f) { f.unsubscribedAt = null; f.at = new Date(ctx.now()).toISOString(); }
      else {
        f = { id: newId('FL'), artist: a.slug, name: text(body.name, 80), email: mail, at: new Date(ctx.now()).toISOString(),
          token: crypto.randomBytes(16).toString('hex'), consent: `Yes, email me about ${a.name}’s gigs and news from TAM.` };
        db.follows.push(f);
      }
      if (ctx.club) ctx.club.awardEmail(mail, 'follow', a.slug);
      await save();
      if (ctx.mail.enabled()) {
        ctx.mail.send(followEmail(f, a, `${cfg.siteUrl}/artists/${a.slug}`, `${cfg.siteUrl}/unfollow?t=${f.token}`))
          .catch((e) => console.warn(`Follow email ${f.id}: ${e.message}`));
      }
      send(res, 201, { ok: true });
    });

    // ----- story themes for a song's story layer (big, so not inlined in pages) -----
    r.get('/api/stories/:id', (req, res, { params }) => {
      const st = c.storyBy.get(params.id);
      if (!st) throw fail(404, 'No such stories.');
      send(res, 200, { themes: st.themes }, { 'Cache-Control': 'public, max-age=3600' });
    });

    // ----- first-party demand: who fans want back, who was there -----
    r.post('/api/demand', async (req, res) => {
      const body = await readJson(req, 1024);
      const kind = body.kind;
      const ok = (kind === 'bring-back' && c.artistBy.has(body.target)) || (kind === 'was-there' && (c.pastBy.has(body.target) || c.nightBy.has(body.target)));
      if (!ok) throw fail(400, 'Unknown artist or night.');
      db.demand.push({ kind, target: body.target, at: new Date(ctx.now()).toISOString() });
      await save();
      send(res, 201, { count: db.demand.filter((d) => d.kind === kind && d.target === body.target).length });
    });
  }

  function unfollow(token) {
    const f = db.follows.find((x) => x.token === token);
    if (f && !f.unsubscribedAt) { f.unsubscribedAt = new Date(ctx.now()).toISOString(); save(); }
    return f ? c.artistBy.get(f.artist) : null;
  }

  return { routes, track, pinsFor, unfollow };
}
