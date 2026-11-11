// Sunday Showcase line-ups, shown as presents under a Christmas tree on
// /sunday-showcases: visitors tap a present to unwrap it and meet that act.
// Staff (Ops and Admin) add showcases and fill in the acts at
// /sunday-showcases/manage; until an act is named its present reads
// "to be announced". The page shows the next showcase still to come.
//
// content/showcases.json "next": { date, night (event slug), acts } is a starting one.
// Stored in db.showcases: { [date]: { night, count, acts: [{ name, plays, photo, links[], blurb }], note, removed } }

import crypto from 'node:crypto';
import { fail, send, readJson, text, rateLimiter } from '../lib/http.js';
import { longDate } from '../lib/content.js';
import { PLACES, placeOf } from '../lib/places.js';

const MAX = 12, DEFAULT_ACTS = 6;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
// A web link: http(s) as given, a bare "site.com/…" gets https://, any other scheme (javascript:, data:…) is dropped.
const cleanLink = (u) => {
  const s = text(u, 300);
  if (/^https?:\/\//i.test(s)) return s;
  if (!s || /^[a-z][\w+.-]*:/i.test(s)) return '';
  return `https://${s.replace(/^\/+/, '')}`;
};
const PHOTO = /^\/(uploads|img)\/[\w./-]+\.(jpe?g|png|webp)$/i;
const VIDEO = /^\/(uploads|img)\/[\w./-]+\.(mp4|webm)$/i;
// More photos and videos of an act, shown on its profile: site files only.
const cleanMedia = (list) => (Array.isArray(list) ? list : []).slice(0, 8).map((m) => {
  const src = m && typeof m.src === 'string' ? m.src : '';
  if (VIDEO.test(src)) return { type: 'video', src, ...(PHOTO.test(m.poster || '') ? { poster: m.poster } : {}) };
  if (PHOTO.test(src)) return { type: 'image', src };
  return null;
}).filter(Boolean);
// Up to four links: a list, or one per line (the old single "link" still reads).
const cleanLinks = (a) => [].concat(a.links || [], a.link || []).flatMap((x) => String((x && typeof x === 'object' ? x.url : x) || '').split(/\s+/)).map(cleanLink).filter(Boolean).slice(0, 4);
const LINK_NAMES = [[/instagram\.com/, 'Instagram'], [/youtu\.?be/, 'YouTube'], [/spotify\.com/, 'Spotify'], [/soundcloud\.com/, 'SoundCloud'], [/tiktok\.com/, 'TikTok'], [/bandcamp\.com/, 'Bandcamp'], [/music\.apple\.com/, 'Apple Music'], [/facebook\.com/, 'Facebook']];
export const linkName = (u) => (LINK_NAMES.find(([rx]) => rx.test(u)) || [, 'Website'])[1];

// Each act's page has its own look: a vibe staff pick in the editor.
export const VIBES = {
  stage: 'TAM stage: gold and black',
  disco: 'Disco: glitter gold and pink',
  noir: 'Noir: crimson and shadow',
  campfire: 'Campfire: warm wood and forest green',
  mist: 'Mist: hazy teal and sage',
  spotlight: 'Spotlight: violet and white beams',
  riot: 'Riot: acid green and magenta',
};
// Each vibe's mark: its name and a sign, flashing on the act's page and the line-up.
export const VIBE_MARKS = { stage: ['Stage', '★'], disco: ['Disco', '✺'], noir: ['Noir', '☾'], campfire: ['Campfire', '✹'], mist: ['Mist', '≋'], spotlight: ['Spotlight', '✧'], riot: ['Riot', '✶'] };
const slugOf = (name) => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'act';

export function showcaseDomain(ctx) {
  const { db, save } = ctx;
  db.showcases = db.showcases || {};
  const seed = () => (ctx.content.showcases || {}).next || null;
  const nightsOn = (date) => ctx.content.nights.filter((x) => x.date === date && !x.festival);

  // Every showcase, in date order.
  function dates() {
    const all = new Set(Object.keys(db.showcases));
    if (seed() && seed().date) all.add(seed().date);
    return [...all].filter((d) => !(db.showcases[d] || {}).removed).sort();
  }
  const upcoming = (today = ctx.today()) => dates().filter((d) => d >= today);

  // One showcase with its acts in running order; unnamed ones are "to be announced".
  function lineup(date) {
    if (!date) return null;
    const n = seed() && seed().date === date ? seed() : {};
    const s = db.showcases[date] || {};
    const named = s.acts || [];
    const count = Math.max(named.length, s.count || n.acts || DEFAULT_ACTS);
    const slug = 'night' in s ? s.night : n.night;
    const night = (slug && ctx.content.nights.find((x) => x.slug === slug)) || (slug === undefined ? nightsOn(date)[0] : null);
    const seen = new Set();
    const wants = (db.showcaseWants || {})[date] || {};
    return {
      date, when: longDate(date), note: s.note || '', count,
      night: night ? { title: night.title, slug: night.slug, doors: night.doors || '', href: `/events/${night.slug}` } : null,
      acts: Array.from({ length: count }, (_, i) => {
        if (!(named[i] && named[i].name)) return { n: i + 1, tba: true };
        let slug = slugOf(named[i].name);
        if (seen.has(slug)) slug = `${slug}-${i + 1}`;
        seen.add(slug);
        return { n: i + 1, ...named[i], slug, href: `/sunday-showcases/${date}/${slug}`, vibe: VIBES[named[i].vibe] ? named[i].vibe : 'stage',
          wants: (wants[slug] || {}).count || 0, places: (named[i].from || []).map(placeOf).filter(Boolean), links: cleanLinks(named[i]).map((url) => ({ url, label: linkName(url) })), link: undefined };
      }),
    };
  }
  const act = (date, slug) => { const l = lineup(date); const a = l && l.acts.find((x) => x.slug === slug); return a ? { l, a } : null; };
  const next = () => lineup(upcoming()[0]);

  // "I want to see them at the Christmas Showcase Special": one per browser
  // (a random id the page keeps; only its hash is stored), rate-limited by address.
  db.showcaseWants = db.showcaseWants || {};
  const wantLimited = rateLimiter({ max: 30 });
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 32);

  return {
    lineup, next, upcoming, act, festival: () => ctx.content.festivals.find((f) => f.theme === 'christmas') || null,
    routes(r) {
      r.get('/api/showcases', (req, res) => send(res, 200, next() || {}));

      r.post('/api/showcases/:date/act/:slug/want', async (req, res, { params }) => {
        const x = act(params.date, params.slug);
        if (!x) throw fail(404, 'That act isn’t in this showcase.');
        if (wantLimited(req)) throw fail(429, 'That’s a lot of votes. Try again later.');
        const b = await readJson(req, 1024);
        const id = text(b.id, 80);
        if (id.length < 16) throw fail(400, 'Missing browser id.');
        const day = (db.showcaseWants[params.date] = db.showcaseWants[params.date] || {});
        const w = (day[params.slug] = day[params.slug] || { count: 0, ids: [] });
        const h = hash(id);
        const already = w.ids.includes(h);
        if (!already) { w.ids.push(h); w.count += 1; await save(); }
        send(res, 200, { ok: true, count: w.count, already });
      });

      r.get('/api/showcases/manage', (req, res) => {
        const me = ctx.team.guard(req, 'ops');
        const today = ctx.today();
        send(res, 200, {
          me, today, vibes: VIBES, places: Object.fromEntries(Object.entries(PLACES).map(([k, v]) => [k, v[0]])),
          showcases: upcoming(today).map((d) => ({ ...lineup(d), saved: db.showcases[d] || {} })),
          // the nights on the listings a showcase can sit on
          nights: ctx.content.upcoming(today).filter((x) => !x.festival).slice(0, 200).map((x) => ({ date: x.date, slug: x.slug, title: x.title })),
        });
      });

      // An act's photo (before /:date, which would take this path): a data URL from the editor, shrunk in the browser first.
      r.post('/api/showcases/photo', async (req, res) => {
        ctx.team.guard(req, 'ops');
        const b = await readJson(req, 2_000_000);
        const photo = await ctx.saveImage(b.image, `showcase-${Date.now().toString(36)}`, { maxKB: 900, what: 'The photo' });
        send(res, 200, { photo });
      });

      r.post('/api/showcases/:date', async (req, res, { params }) => {
        ctx.team.guard(req, 'ops');
        const date = params.date;
        if (!isDate(date)) throw fail(400, 'That isn’t a date.');
        if (date < ctx.today()) throw fail(400, 'That date has been.');
        const b = await readJson(req, 16384);
        const cur = db.showcases[date] || {};
        const acts = 'acts' in b ? (Array.isArray(b.acts) ? b.acts : []).slice(0, MAX).map((a) => ({
          name: text(a && a.name, 80), plays: text(a && a.plays, 80), links: cleanLinks(a || {}),
          photo: a && typeof a.photo === 'string' && PHOTO.test(a.photo) ? a.photo : '', blurb: text(a && a.blurb, 1200), media: cleanMedia(a && a.media),
          vibe: a && VIBES[a.vibe] ? a.vibe : 'stage',
          // press: up to four pieces about them, each a headline, where it ran, a link, and a line in our words
          press: (Array.isArray(a && a.press) ? a.press : []).slice(0, 4).map((p) => ({
            title: text(p && p.title, 160), source: text(p && p.source, 80), url: cleanLink(p && p.url), note: text(p && p.note, 300),
          })).filter((p) => p.title && /^https:\/\//.test(p.url)),
          from: [...new Set((Array.isArray(a && a.from) ? a.from : String((a && a.from) || '').split(/[\s,]+/)).map((c) => String(c).toUpperCase()).filter((c) => PLACES[c]))].slice(0, 3),
        })) : cur.acts || [];
        const count = Math.max(1, Math.min(MAX, parseInt(b.count, 10) || cur.count || acts.length || DEFAULT_ACTS));
        let night = 'night' in b ? text(b.night, 120) : cur.night;
        if (night && !nightsOn(date).some((x) => x.slug === night)) throw fail(400, 'That night isn’t on the listings for that date.');
        db.showcases[date] = {
          ...cur, count, acts: acts.slice(0, count), note: 'note' in b ? text(b.note, 200) : cur.note || '',
          ...(night !== undefined ? { night } : {}), removed: false,
        };
        await save();
        send(res, 200, { ok: true, ...lineup(date) });
      });

      r.post('/api/showcases/:date/remove', async (req, res, { params }) => {
        ctx.team.guard(req, 'ops');
        if (!dates().includes(params.date)) throw fail(404, 'There’s no showcase on that date.');
        db.showcases[params.date] = { ...(db.showcases[params.date] || {}), removed: true };
        await save();
        send(res, 200, { ok: true });
      });
    },
  };
}
