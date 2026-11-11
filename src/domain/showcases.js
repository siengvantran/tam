// The line-up for a Sunday Showcase, shown as presents under a Christmas tree
// on /sunday-showcases: visitors tap a present to unwrap it and meet that act.
// Staff (Ops and Admin) fill in the acts at /sunday-showcases/manage; until an
// act is named its present reads "to be announced".
//
// content/showcases.json "next": { date, night (event slug), acts (how many) }
// Stored in db.showcases: { [date]: { acts: [{ name, plays, link, blurb }], note } }

import { fail, send, readJson, text } from '../lib/http.js';
import { longDate } from '../lib/content.js';

const MAX = 12;
const cleanLink = (u) => { const s = text(u, 300); return /^https?:\/\//i.test(s) ? s : s ? `https://${s.replace(/^\/+/, '')}` : ''; };

export function showcaseDomain(ctx) {
  const { db, save } = ctx;
  db.showcases = db.showcases || {};
  const next = () => (ctx.content.showcases || {}).next || null;

  // This week's showcase, with its acts in running order; unnamed ones are "to be announced".
  function lineup(date = next() && next().date) {
    if (!date) return null;
    const n = next() && next().date === date ? next() : {};
    const s = db.showcases[date] || {};
    const named = s.acts || [];
    const count = Math.max(named.length, s.count || n.acts || 0);
    const night = n.night && ctx.content.nights.find((x) => x.slug === n.night);
    return {
      date, when: longDate(date), note: s.note || '', count,
      night: night ? { title: night.title, slug: night.slug, doors: night.doors || '', href: `/events/${night.slug}` } : null,
      acts: Array.from({ length: count }, (_, i) => (named[i] && named[i].name ? { n: i + 1, ...named[i] } : { n: i + 1, tba: true })),
    };
  }

  return {
    lineup,
    routes(r) {
      r.get('/api/showcases', (req, res) => send(res, 200, lineup() || {}));
      r.get('/api/showcases/manage', (req, res) => {
        const me = ctx.team.guard(req, 'ops');
        const l = lineup();
        send(res, 200, { me, ...(l || {}), saved: l ? db.showcases[l.date] || {} : {} });
      });
      r.post('/api/showcases/:date', async (req, res, { params }) => {
        ctx.team.guard(req, 'ops');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) throw fail(400, 'That isn’t a date.');
        const b = await readJson(req, 16384);
        const acts = (Array.isArray(b.acts) ? b.acts : []).slice(0, MAX).map((a) => ({
          name: text(a && a.name, 80), plays: text(a && a.plays, 80), link: cleanLink(a && a.link), blurb: text(a && a.blurb, 240),
        }));
        const count = Math.max(1, Math.min(MAX, parseInt(b.count, 10) || acts.length || 1));
        db.showcases[params.date] = { acts: acts.slice(0, count), count, note: text(b.note, 200) };
        await save();
        send(res, 200, { ok: true, ...lineup(params.date) });
      });
    },
  };
}
