// The Great British Blues Jam: TAM's Saturday afternoon jam.
//
//   /great-british-blues-jam          each Saturday's host and house band, the jam
//                                     sign-up list (name and instrument) and
//                                     The Great British Blues Wall
//   /great-british-blues-jam/screen   for the projector in the Temple: the title,
//                                     the TAM logo pulsing to the beat, who's on
//                                     stage, who's next, the wall
//   /great-british-blues-jam/manage   staff (Ops and Admin): set each Saturday's
//                                     host and band, run the jam list, approve
//                                     wall posts
//
// Stored in db.bluesJam:
//   nights:  { [date]: { host, band[{ name, instrument }], open, cap, note, onStage } }
//   signups: [{ id, date, name, instrument, email, at, order, status: waiting|played|removed, keyHash }]
//   wall:    [{ id, name, message, at, status: pending|shown|hidden }]
// Emails on sign-ups are for staff only; the public sees names and instruments.
// Wall posts wait for a staff approval while PIN_MODERATION is on (as the Party Wall).

import crypto from 'node:crypto';
import { fail, send, readJson, text, email as cleanEmail, newId, rateLimiter } from '../lib/http.js';
import { longDate, londonToUtc } from '../lib/content.js';

export const PATH = '/great-british-blues-jam';
export const INSTRUMENTS = ['Vocals', 'Guitar', 'Bass', 'Drums', 'Keys', 'Harmonica', 'Saxophone', 'Trumpet', 'Violin', 'Percussion', 'Other'];
const DEFAULT_CAP = 30;
const WEEKS = 6;
const START = '16:00', END = '19:00'; // as TAM lists it
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const isSat = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 6;
const isJam = (n) => /blues jam/i.test(`${n.title} ${n.label || ''}`) || n.series === 'great-british-blues-jam';

export function bluesDomain(ctx) {
  const { db, save, content: c, cfg } = ctx;
  db.bluesJam = db.bluesJam || {};
  const B = db.bluesJam;
  B.nights = B.nights || {}; B.signups = B.signups || []; B.wall = B.wall || [];

  // The schedule names a host for some Saturdays: the default until staff set one.
  const scheduleHost = new Map(c.schedule.filter((e) => e.series === 'great-british-blues-jam' && e.host).map((e) => [e.date, e.host]));

  // The jam's day: today if it's a Saturday (until it ends), else the next one.
  function jamDay() {
    const today = ctx.today();
    const ended = isSat(today) && new Date(ctx.now()).toISOString() > londonToUtc(today, END);
    let d = today;
    if (ended) d = addDays(d, 1);
    while (!isSat(d)) d = addDays(d, 1);
    return d;
  }

  // The coming Saturdays: every jam night on the site, plus the weekly rhythm.
  function saturdays() {
    const first = jamDay();
    const dates = new Set();
    for (let i = 0; i < WEEKS; i++) dates.add(addDays(first, 7 * i));
    for (const n of c.nights) if (isJam(n) && n.date >= first && n.date <= addDays(first, 7 * WEEKS)) dates.add(n.date);
    return [...dates].sort().slice(0, WEEKS + 2);
  }

  const nightOf = (date) => c.nights.find((n) => n.date === date && isJam(n)) || null;
  const settings = (date) => {
    const s = B.nights[date] || {};
    return { host: s.host ?? scheduleHost.get(date) ?? '', band: s.band || [], open: s.open !== false, cap: s.cap || DEFAULT_CAP, note: s.note || '', onStage: s.onStage || null };
  };
  const queue = (date) => B.signups.filter((x) => x.date === date && x.status !== 'removed').sort((a, b) => a.order - b.order);
  const closed = (date) => new Date(ctx.now()).toISOString() > londonToUtc(date, END);

  // What the public sees for one Saturday.
  function publicNight(date) {
    const s = settings(date);
    const n = nightOf(date);
    const list = queue(date);
    const waiting = list.filter((x) => x.status === 'waiting');
    return {
      date, when: longDate(date), start: n && !n.festival && !n.timesTbc ? n.doors : START, // a festival night's doors are its evening show page: n ? `/events/${n.slug}` : null,
      tickets: n ? (n.eventbrite && n.eventbrite.url) || n.url || null : null, price: n && n.eventbrite && Number.isFinite(n.eventbrite.from) ? n.eventbrite.from : null,
      host: s.host, band: s.band, note: s.note,
      open: s.open && !closed(date), spotsLeft: Math.max(0, s.cap - list.length),
      onStage: (() => { const x = s.onStage && list.find((y) => y.id === s.onStage); return x ? { id: x.id, name: x.name, instrument: x.instrument } : null; })(),
      jammers: list.map((x) => ({ id: x.id, name: x.name, instrument: x.instrument, played: x.status === 'played' })),
      waiting: waiting.length,
    };
  }
  const shownWall = (n = 60) => B.wall.filter((w) => w.status === 'shown').slice(-n).reverse().map((w) => ({ id: w.id, name: w.name, message: w.message, at: w.at }));

  const signupLimited = rateLimiter({ max: 10 });
  const wallLimited = rateLimiter({ max: 6 });

  function routes(r) {
    const guard = (req) => ctx.team.guard(req, 'ops');

    // ----- public -----
    r.get('/api/blues', (req, res) => send(res, 200, {
      instruments: INSTRUMENTS, jamDay: jamDay(), nights: saturdays().map(publicNight), wall: shownWall(), moderated: cfg.pinModeration,
    }));

    r.post('/api/blues/signup', async (req, res) => {
      if (signupLimited(req)) throw fail(429, 'Too many sign-ups from here. Try again later.');
      const b = await readJson(req, 4096);
      const date = String(b.date || '');
      if (!saturdays().includes(date)) throw fail(400, 'Pick one of the coming Saturdays.');
      const s = settings(date);
      if (!s.open || closed(date)) throw fail(400, 'Sign-ups for that Saturday are closed.');
      const name = text(b.name, 40);
      const instrument = INSTRUMENTS.includes(b.instrument) ? (b.instrument === 'Other' ? text(b.other, 30) || 'Other' : b.instrument) : '';
      const mail = b.email ? cleanEmail(b.email) : '';
      if (!name) throw fail(400, 'Add your name (or your stage name).');
      if (!instrument) throw fail(400, 'Pick your instrument.');
      if (b.email && !mail) throw fail(400, 'That email doesn’t look right (or leave it empty).');
      const list = queue(date);
      if (list.length >= s.cap) throw fail(409, 'That Saturday’s jam list is full. Try the next one, or come and ask the host.');
      const same = (x) => (mail && x.email === mail) || (x.name.toLowerCase() === name.toLowerCase() && x.instrument === instrument);
      if (list.some(same)) throw fail(409, 'You’re already on the list for that Saturday.');
      const key = crypto.randomBytes(16).toString('base64url');
      const x = { id: newId('JAM', 5), date, name, instrument, email: mail, at: new Date(ctx.now()).toISOString(), order: (list.at(-1)?.order || 0) + 1, status: 'waiting', keyHash: hash(key) };
      B.signups.push(x);
      await save();
      send(res, 201, { id: x.id, key, position: list.length + 1, night: publicNight(date) });
    });

    r.post('/api/blues/signup/:id/cancel', async (req, res, { params }) => {
      const b = await readJson(req, 1024);
      const x = B.signups.find((y) => y.id === params.id);
      if (!x || x.keyHash !== hash(String(b.key || ''))) throw fail(404, 'That sign-up isn’t here.');
      x.status = 'removed';
      await save();
      send(res, 200, { ok: true, night: publicNight(x.date) });
    });

    r.post('/api/blues/wall', async (req, res) => {
      if (wallLimited(req)) throw fail(429, 'You’ve posted a lot. Give it a few minutes.');
      const b = await readJson(req, 4096);
      const name = text(b.name, 40), message = text(b.message, 200);
      if (!name || !message) throw fail(400, 'Add your name and a message.');
      if (/https?:\/\/|www\./i.test(message)) throw fail(400, 'No links on the wall, please.');
      const w = { id: newId('BW', 5), name, message, at: new Date(ctx.now()).toISOString(), status: cfg.pinModeration ? 'pending' : 'shown' };
      B.wall.push(w);
      if (B.wall.length > 2000) B.wall.splice(0, B.wall.length - 2000);
      await save();
      send(res, 201, { status: w.status });
    });

    // For the projector: refreshed every few seconds.
    r.get('/api/blues/screen', (req, res) => {
      const date = jamDay();
      const n = publicNight(date);
      const next = queue(date).filter((x) => x.status === 'waiting' && x.id !== (n.onStage && n.onStage.id)).slice(0, 5).map((x) => ({ name: x.name, instrument: x.instrument }));
      send(res, 200, { ...n, next, wall: shownWall(12), signUp: `${cfg.siteUrl.replace(/^https?:\/\//, '')}/blues` }, { 'Cache-Control': 'no-store' });
    });

    // ----- staff -----
    r.get('/api/blues/manage', (req, res) => {
      const me = guard(req);
      send(res, 200, {
        me, instruments: INSTRUMENTS, jamDay: jamDay(),
        nights: saturdays().map((d) => ({ ...publicNight(d), settings: settings(d), signups: queue(d).map((x) => ({ id: x.id, name: x.name, instrument: x.instrument, email: x.email, at: x.at, status: x.status })) })),
        wall: B.wall.filter((w) => w.status !== 'hidden').slice(-150).reverse(), moderated: cfg.pinModeration,
      });
    });

    r.post('/api/blues/night/:date', async (req, res, { params }) => {
      guard(req);
      const date = params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isSat(date)) throw fail(400, 'That isn’t a Saturday.');
      const b = await readJson(req, 8192);
      const cur = B.nights[date] || {};
      B.nights[date] = {
        ...cur,
        ...('host' in b ? { host: text(b.host, 80) } : {}),
        ...('band' in b ? { band: (Array.isArray(b.band) ? b.band : []).slice(0, 12).map((x) => ({ name: text(x && x.name, 60), instrument: text(x && x.instrument, 40) })).filter((x) => x.name) } : {}),
        ...('open' in b ? { open: Boolean(b.open) } : {}),
        ...('cap' in b ? { cap: Math.max(1, Math.min(100, parseInt(b.cap, 10) || DEFAULT_CAP)) } : {}),
        ...('note' in b ? { note: text(b.note, 200) } : {}),
      };
      await save();
      send(res, 200, { ok: true });
    });

    // Running the jam list: move up/down, put on stage, mark played, remove, restore.
    r.post('/api/blues/signup/:id/staff', async (req, res, { params }) => {
      guard(req);
      const x = B.signups.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'That sign-up isn’t here.');
      const b = await readJson(req, 1024);
      const night = (B.nights[x.date] = B.nights[x.date] || {});
      const list = queue(x.date);
      const i = list.findIndex((y) => y.id === x.id);
      switch (b.action) {
        case 'up': case 'down': {
          const j = b.action === 'up' ? i - 1 : i + 1;
          if (i >= 0 && list[j]) [x.order, list[j].order] = [list[j].order, x.order];
          break;
        }
        case 'stage': night.onStage = x.id; x.status = 'waiting'; break;
        case 'played': x.status = 'played'; if (night.onStage === x.id) night.onStage = null; break;
        case 'remove': x.status = 'removed'; if (night.onStage === x.id) night.onStage = null; break;
        case 'restore': x.status = 'waiting'; break;
        case 'offstage': night.onStage = null; break;
        default: throw fail(400, 'Unknown action.');
      }
      await save();
      send(res, 200, { ok: true });
    });

    r.post('/api/blues/wall/:id', async (req, res, { params }) => {
      guard(req);
      const w = B.wall.find((y) => y.id === params.id);
      if (!w) throw fail(404, 'That post isn’t here.');
      const b = await readJson(req, 512);
      if (!['shown', 'hidden'].includes(b.status)) throw fail(400, 'Show or hide.');
      w.status = b.status;
      await save();
      send(res, 200, { ok: true });
    });
  }

  return { routes, jamDay, saturdays, publicNight };
}
