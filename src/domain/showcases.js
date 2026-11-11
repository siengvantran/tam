// Sunday Showcase line-ups, shown as presents under a Christmas tree on
// /sunday-showcases: visitors tap a present to unwrap it and meet that act.
// Staff (Ops and Admin) add showcases and fill in the acts at
// /sunday-showcases/manage; until an act is named its present reads
// "to be announced". The page shows the next showcase still to come.
//
// content/showcases.json "next": { date, night (event slug), acts } is a starting one.
// Stored in db.showcases: { [date]: { night, count, acts: [{ name, plays, link, blurb }], note, removed } }

import { fail, send, readJson, text } from '../lib/http.js';
import { longDate } from '../lib/content.js';

const MAX = 12, DEFAULT_ACTS = 6;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const cleanLink = (u) => { const s = text(u, 300); return /^https?:\/\//i.test(s) ? s : s ? `https://${s.replace(/^\/+/, '')}` : ''; };

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
    return {
      date, when: longDate(date), note: s.note || '', count,
      night: night ? { title: night.title, slug: night.slug, doors: night.doors || '', href: `/events/${night.slug}` } : null,
      acts: Array.from({ length: count }, (_, i) => (named[i] && named[i].name ? { n: i + 1, ...named[i] } : { n: i + 1, tba: true })),
    };
  }
  const next = () => lineup(upcoming()[0]);

  return {
    lineup, next, upcoming,
    routes(r) {
      r.get('/api/showcases', (req, res) => send(res, 200, next() || {}));

      r.get('/api/showcases/manage', (req, res) => {
        const me = ctx.team.guard(req, 'ops');
        const today = ctx.today();
        send(res, 200, {
          me, today,
          showcases: upcoming(today).map((d) => ({ ...lineup(d), saved: db.showcases[d] || {} })),
          // the nights on the listings a showcase can sit on
          nights: ctx.content.upcoming(today).filter((x) => !x.festival).slice(0, 200).map((x) => ({ date: x.date, slug: x.slug, title: x.title })),
        });
      });

      r.post('/api/showcases/:date', async (req, res, { params }) => {
        ctx.team.guard(req, 'ops');
        const date = params.date;
        if (!isDate(date)) throw fail(400, 'That isn’t a date.');
        if (date < ctx.today()) throw fail(400, 'That date has been.');
        const b = await readJson(req, 16384);
        const cur = db.showcases[date] || {};
        const acts = 'acts' in b ? (Array.isArray(b.acts) ? b.acts : []).slice(0, MAX).map((a) => ({
          name: text(a && a.name, 80), plays: text(a && a.plays, 80), link: cleanLink(a && a.link), blurb: text(a && a.blurb, 240),
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
