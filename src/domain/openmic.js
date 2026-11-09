// Open mics at TAM: the hub, its three nights, and JOM (Junior Open Mic),
// where each young artist has a profile people can follow and cheer.
//
//   /open-mic                 the front door to all three
//   /open-mic/international   Tuesdays (openmic.tam.tv comes here)
//   /open-mic/singers         Sundays (singers.tam.tv comes here)
//   /jom                      the Junior Open Mic microverse (jom.tam.tv comes here)
//   /jom/manage               staff (Ops and Admin): approve, hide, add and edit profiles
//
// Dates and tickets are TAM's own nights (the box office, Eventbrite and the
// schedule, through ctx.content.nights): nothing about a night is stored here.
//
// Stored in db.openMic:
//   artists: [{ id, keyHash, guardianEmail, at, updatedAt, by, status: pending|live|hidden,
//               live: fields|null, draft: fields|null }]
//     fields = { name, act, bio, genres[], setlist[], stage[], links[{ label, url }], hue, photo }
//   fans:    { [fanId]: { follows: { [artistId]: true }, cheers: { [artistId]: { [cheer]: true } }, at } }
//
// The artists are children, so:
//   - nothing a family sends is public until a member of staff approves it; an edit
//     to a live profile waits as a draft while the approved version stays up
//   - there are no comments or messages: a fan can follow, and send one of four cheers
//   - the parent or guardian's email is for staff only and never leaves the staff API
//   - a profile is edited with a private key (kept in the browser, and in the link
//     emailed to the guardian), never with an account

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, send, readJson, text, email as cleanEmail, newId, rateLimiter } from '../lib/http.js';
import { escape as e } from '../views/html.js';

export const HUB = '/open-mic';
export const JOM = '/jom';
export const CHEERS = [['encore', 'Encore'], ['goosebumps', 'Goosebumps'], ['brave', 'So brave'], ['star', 'Star quality']];
export const HUES = [45, 270, 190, 340, 150, 18];
const CHEER_KEYS = new Set(CHEERS.map((c) => c[0]));
const MAX_ARTISTS = 500;
const MAX_FANS = 50000;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// The three open mics. `match` finds each one's nights among TAM's nights;
// `host` is the address that lands on its page.
export const SERIES = [
  { slug: 'international', path: `${HUB}/international`, host: 'openmic.tam.tv', name: 'International Open Mic', short: 'Tue', rhythm: 'Tuesdays', tone: 'cyan',
    match: (n) => /open mic/i.test(n.title) && !/junior|\bjom\b/i.test(n.title),
    blurb: 'Any language, any style, any instrument. Showcase your talent, or come and hear who turns up from around the world.' },
  { slug: 'singers', path: `${HUB}/singers`, host: 'singers.tam.tv', name: 'Singers at TAM', short: 'Sun', rhythm: 'Sundays', tone: 'violet',
    match: (n) => /singer/i.test(n.title),
    blurb: 'Open voices first, shared work later. Songs given time, held in a room that listens.' },
  { slug: 'jom', path: JOM, host: 'jom.tam.tv', name: 'Junior Open Mic', short: 'JOM', rhythm: 'Under 18s', tone: 'gold',
    match: (n) => /junior open mic|\bjom\b/i.test(n.title),
    blurb: 'The stage for young performers. Meet the artists, follow the ones you like and cheer them on.' },
];
export const seriesBy = new Map(SERIES.map((s) => [s.slug, s]));
// jom.tam.tv → /jom, and so on.
export const hostPath = (host) => { const s = SERIES.find((x) => x.host === host); return s ? s.path : host === 'open-mic.tam.tv' ? HUB : null; };

const lines = (v, n, len) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => text(x, len)).filter(Boolean).slice(0, n);
const httpsUrl = (v) => { const s = text(v, 300); try { const u = new URL(s); return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : ''; } catch { return ''; } };

export function openMicDomain(ctx) {
  const { db, save, content: c, cfg } = ctx;
  db.openMic = db.openMic || {};
  const O = db.openMic;
  O.artists = O.artists || []; O.fans = O.fans || {};

  // ----- nights: from TAM's own listings -----
  const nightsFor = (slug, limit = 8) => {
    const s = seriesBy.get(slug);
    return s ? c.upcoming(ctx.today()).filter(s.match).slice(0, limit) : [];
  };

  // ----- JOM profiles -----
  function cleanFields(b, old = null) {
    const name = text(b.name, 40);
    if (!name) throw fail(400, 'Add a stage name.');
    const links = [];
    for (const l of (Array.isArray(b.links) ? b.links : []).slice(0, 3)) {
      if (!l || !text(l.url, 300)) continue;
      const url = httpsUrl(l.url);
      if (!url) throw fail(400, 'Links must start with https://');
      links.push({ label: text(l.label, 40) || 'Link', url });
    }
    return {
      name, act: text(b.act, 60), bio: text(b.bio, 600),
      genres: lines(Array.isArray(b.genres) ? b.genres : String(b.genres || '').split(','), 5, 24),
      setlist: lines(b.setlist, 12, 80), stage: lines(b.stage, 12, 100), links,
      hue: HUES.includes(Number(b.hue)) ? Number(b.hue) : HUES[0],
      photo: old ? old.photo : '',
    };
  }
  // A new photo arrives as a data: URL shrunk in the browser; `photo: ''` removes it.
  async function takePhoto(a, fields, b) {
    if (typeof b.photo === 'string' && b.photo.startsWith('data:')) {
      fields.photo = await ctx.saveImage(b.photo, `jom-${a.id}-${ctx.now().toString(36)}`, { maxKB: 300, what: 'Photos' });
    } else if (b.photo === '') fields.photo = '';
  }
  async function dropPhotos(a, keep = []) {
    for (const f of [a.live, a.draft]) {
      if (!f || !f.photo || keep.includes(f.photo) || !/^\/uploads\/jom-[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(f.photo)) continue;
      await fs.unlink(path.join(cfg.dataDir, f.photo.slice(1))).catch(() => {});
    }
  }

  const find = (id) => O.artists.find((a) => a.id === id);
  const owns = (a, key) => Boolean(a && key && a.keyHash === hash(key));
  const fanCounts = () => {
    const out = {};
    const at = (id) => (out[id] = out[id] || { followers: 0, cheers: {} });
    for (const f of Object.values(O.fans)) {
      for (const id of Object.keys(f.follows || {})) at(id).followers++;
      for (const [id, cs] of Object.entries(f.cheers || {})) for (const k of Object.keys(cs)) at(id).cheers[k] = (at(id).cheers[k] || 0) + 1;
    }
    return out;
  };
  const publicArtist = (a, counts) => ({ id: a.id, ...a.live, at: a.at, followers: (counts[a.id] || {}).followers || 0, cheers: (counts[a.id] || {}).cheers || {} });
  const liveArtists = () => O.artists.filter((a) => a.status === 'live' && a.live).sort((x, y) => (x.at < y.at ? -1 : 1));
  // What the owner sees: their latest version, and where it stands.
  const ownView = (a) => ({ id: a.id, ...(a.draft || a.live), at: a.at, followers: 0, cheers: {}, own: true,
    state: a.status === 'hidden' ? 'hidden' : a.status === 'live' ? (a.draft ? 'changes-waiting' : 'live') : 'waiting' });

  const staffName = (req) => { const w = ctx.team.whoAmI(req); return w ? w.name : ''; };
  const guardianMail = (a, key, base) => ({
    to: a.guardianEmail, subject: 'A Junior Open Mic profile at TAM',
    html: `<!doctype html><body style="margin:0;background:#0b0709;color:#f6efe6;font:16px/1.5 system-ui,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="letter-spacing:.2em;font-size:12px;color:#f3c35b">TEMPLE OF ART AND MUSIC</p><h1 style="font-size:26px;margin:0 0 12px">${e((a.draft || a.live).name)}’s Junior Open Mic profile</h1>
<p>A profile for ${e((a.draft || a.live).name)} was sent to TAM’s Junior Open Mic with this address as the parent or guardian. It isn’t public yet: TAM’s team checks every profile first.</p>
<p>Keep this private link. It is the only way to change the profile or take it down:</p>
<p><a href="${e(`${base}${JOM}?own=${a.id}.${key}`)}" style="display:inline-block;background:#f3c35b;color:#120a0a;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Edit or remove the profile</a></p>
<p>If you didn’t expect this, reply to this email and we’ll remove it.</p>
<p style="color:#8a7f86;font-size:13px;margin-top:32px">TAM · Mercato Metropolitano · 42 Newington Causeway · London SE1 6DR</p></div></body>`,
    text: `A Junior Open Mic profile for ${(a.draft || a.live).name} was sent to TAM with this address as the parent or guardian. It isn't public until TAM's team has checked it.\n\nKeep this private link to change the profile or take it down:\n${base}${JOM}?own=${a.id}.${key}\n\nIf you didn't expect this, reply to this email and we'll remove it.`,
  });

  const profileLimited = rateLimiter({ max: 8 });
  const fanLimited = rateLimiter({ max: 240 });

  function routes(r) {
    const guard = (req) => ctx.team.guard(req, 'ops');

    // ----- public -----
    // Everyone live, with counts. `x-jom-fan` returns that fan's own follows and cheers;
    // `x-jom-own: <id>.<key>` returns the caller's own profile, whatever its state.
    r.get('/api/jom', (req, res) => {
      const counts = fanCounts();
      const fan = O.fans[String(req.headers['x-jom-fan'] || '')];
      const [ownId, ownKey] = String(req.headers['x-jom-own'] || '').split('.');
      const own = find(ownId);
      send(res, 200, {
        artists: liveArtists().map((a) => publicArtist(a, counts)),
        mine: fan ? { follows: fan.follows || {}, cheers: fan.cheers || {} } : { follows: {}, cheers: {} },
        own: owns(own, ownKey) ? ownView(own) : null,
        cheers: CHEERS, hues: HUES,
        nights: nightsFor('jom', 4).map((n) => ({ title: n.title, date: n.date, when: `${n.weekday} ${n.day} ${n.month}`, page: `/events/${n.slug}` })),
      });
    });

    // A family sends a profile: saved as a draft, shown once staff approve it.
    r.post('/api/jom/profile', async (req, res) => {
      if (profileLimited(req)) throw fail(429, 'Too many profiles from here. Try again later.');
      const b = await readJson(req, 600 * 1024);
      if (b.guardianOk !== true) throw fail(400, 'Tick the parent or guardian box to send the profile.');
      const mail = cleanEmail(b.guardianEmail);
      if (!mail) throw fail(400, 'Add a parent or guardian’s email. Only TAM’s team sees it.');
      if (O.artists.length >= MAX_ARTISTS) throw fail(409, 'The lineup is full for now. Ask TAM’s team at the next Junior Open Mic.');
      const key = crypto.randomBytes(18).toString('base64url');
      const now = new Date(ctx.now()).toISOString();
      const a = { id: newId('JOM', 6), keyHash: hash(key), guardianEmail: mail, at: now, updatedAt: now, by: 'family', status: 'pending', live: null, draft: null };
      a.draft = cleanFields(b);
      await takePhoto(a, a.draft, b);
      O.artists.push(a);
      await save();
      if (ctx.mail.enabled()) {
        ctx.mail.send(guardianMail(a, key, ctx.base(req))).catch((err) => console.warn(`JOM guardian email ${a.id}: ${err.message}`));
        if (cfg.enquiriesTo) ctx.mail.send({ to: cfg.enquiriesTo, subject: `JOM: a new profile to check (${a.draft.name})`, text: `${a.draft.name} sent a Junior Open Mic profile. Approve or hide it at ${cfg.siteUrl}${JOM}/manage`, html: `<p>${e(a.draft.name)} sent a Junior Open Mic profile.</p><p><a href="${e(`${cfg.siteUrl}${JOM}/manage`)}">Approve or hide it</a></p>` }).catch(() => {});
      }
      send(res, 201, { id: a.id, key, own: ownView(a), emailed: ctx.mail.enabled() });
    });

    r.post('/api/jom/profile/:id', async (req, res, { params }) => {
      if (profileLimited(req)) throw fail(429, 'Too many changes from here. Try again later.');
      const b = await readJson(req, 600 * 1024);
      const a = find(params.id);
      if (!owns(a, b.key)) throw fail(404, 'That profile isn’t here, or this isn’t its private link.');
      if (b.guardianOk !== true) throw fail(400, 'Tick the parent or guardian box to save.');
      const before = a.draft || a.live;
      const fields = cleanFields(b, before);
      await takePhoto(a, fields, b);
      const old = a.draft;
      a.draft = fields;
      if (old) await dropPhotos({ draft: old }, [fields.photo, a.live && a.live.photo]);
      a.updatedAt = new Date(ctx.now()).toISOString();
      await save();
      send(res, 200, { own: ownView(a) });
    });

    r.post('/api/jom/profile/:id/remove', async (req, res, { params }) => {
      const b = await readJson(req, 1024);
      const a = find(params.id);
      if (!owns(a, b.key)) throw fail(404, 'That profile isn’t here, or this isn’t its private link.');
      await dropPhotos(a);
      O.artists.splice(O.artists.indexOf(a), 1);
      for (const f of Object.values(O.fans)) { if (f.follows) delete f.follows[a.id]; if (f.cheers) delete f.cheers[a.id]; }
      await save();
      send(res, 200, { ok: true });
    });

    // Follow or cheer. A fan is a random id kept in the visitor's browser: no account, no email.
    r.post('/api/jom/fan', async (req, res) => {
      if (fanLimited(req)) throw fail(429, 'That’s a lot of cheering. Give it a few minutes.');
      const b = await readJson(req, 1024);
      const id = String(b.fan || '');
      if (!/^[A-Za-z0-9_-]{20,40}$/.test(id)) throw fail(400, 'Refresh the page and try again.');
      const a = find(String(b.artist || ''));
      if (!a || a.status !== 'live') throw fail(404, 'That artist isn’t on the lineup.');
      let f = O.fans[id];
      if (!f) {
        if (Object.keys(O.fans).length >= MAX_FANS) throw fail(409, 'Following is full for now.');
        f = O.fans[id] = { follows: {}, cheers: {}, at: new Date(ctx.now()).toISOString() };
      }
      if ('follow' in b) { if (b.follow) f.follows[a.id] = true; else delete f.follows[a.id]; }
      if (b.cheer !== undefined) {
        if (!CHEER_KEYS.has(b.cheer)) throw fail(400, 'Unknown cheer.');
        const mine = (f.cheers[a.id] = f.cheers[a.id] || {});
        if (b.on) mine[b.cheer] = true; else delete mine[b.cheer];
        if (!Object.keys(mine).length) delete f.cheers[a.id];
      }
      await save();
      const counts = fanCounts()[a.id] || { followers: 0, cheers: {} };
      send(res, 200, { artist: a.id, followers: counts.followers, cheers: counts.cheers, mine: { follows: f.follows, cheers: f.cheers } });
    });

    // ----- staff -----
    r.get('/api/jom/manage', (req, res) => {
      const me = guard(req);
      const counts = fanCounts();
      send(res, 200, {
        me, hues: HUES,
        artists: O.artists.map((a) => ({ id: a.id, status: a.status, at: a.at, updatedAt: a.updatedAt, by: a.by, guardianEmail: a.guardianEmail,
          live: a.live, draft: a.draft, followers: (counts[a.id] || {}).followers || 0 })).sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1)),
      });
    });

    // approve (publish the waiting version), hide, show, discard a waiting edit, remove
    r.post('/api/jom/manage/:id', async (req, res, { params }) => {
      guard(req);
      const a = find(params.id);
      if (!a) throw fail(404, 'That profile isn’t here.');
      const b = await readJson(req, 1024);
      switch (b.action) {
        case 'approve':
          if (a.draft) { const old = a.live; a.live = a.draft; a.draft = null; if (old) await dropPhotos({ live: old }, [a.live.photo]); }
          if (!a.live) throw fail(400, 'There’s nothing to publish.');
          a.status = 'live'; break;
        case 'hide': a.status = a.live ? 'hidden' : 'pending'; break;
        case 'show': if (!a.live) throw fail(400, 'Approve it first.'); a.status = 'live'; break;
        case 'discard': if (a.draft && a.live) { await dropPhotos({ draft: a.draft }, [a.live.photo]); a.draft = null; } break;
        case 'remove':
          await dropPhotos(a);
          O.artists.splice(O.artists.indexOf(a), 1);
          for (const f of Object.values(O.fans)) { if (f.follows) delete f.follows[a.id]; if (f.cheers) delete f.cheers[a.id]; }
          break;
        default: throw fail(400, 'Unknown action.');
      }
      a.updatedAt = new Date(ctx.now()).toISOString();
      await save();
      send(res, 200, { ok: true });
    });

    // Staff add an artist, or edit one: live straight away.
    r.post('/api/jom/manage', async (req, res) => {
      guard(req);
      const b = await readJson(req, 600 * 1024);
      const now = new Date(ctx.now()).toISOString();
      let a = b.id ? find(String(b.id)) : null;
      if (b.id && !a) throw fail(404, 'That profile isn’t here.');
      if (!a) {
        if (O.artists.length >= MAX_ARTISTS) throw fail(409, 'The lineup is full.');
        a = { id: newId('JOM', 6), keyHash: '', guardianEmail: '', at: now, updatedAt: now, by: `staff:${staffName(req)}`, status: 'live', live: null, draft: null };
        O.artists.push(a);
      }
      if ('guardianEmail' in b) a.guardianEmail = b.guardianEmail ? cleanEmail(b.guardianEmail) : '';
      const old = a.live;
      const fields = cleanFields(b, a.draft || a.live);
      await takePhoto(a, fields, b);
      await dropPhotos({ live: old, draft: a.draft }, [fields.photo]);
      a.live = fields; a.draft = null; a.status = 'live'; a.updatedAt = now;
      await save();
      send(res, b.id ? 200 : 201, { id: a.id });
    });
  }

  return { routes, nightsFor, liveArtists: () => liveArtists().map((a) => ({ id: a.id, name: a.live.name, act: a.live.act })) };
}
