// Live at TAM: the big screen and self check-in for tonight's night.
//
// The projector shows /screen: a big QR to check in at tam.tv/checkin, how
// many are here, a spotlight on each act (with a QR to follow them and back
// them), and which acts brought the biggest crowd. On a phone, /checkin asks
// only how many are in the group and who they've come to see (no ticket, no
// name needed: grandparents welcome), then offers to follow that act by email,
// pledge to see them at The Best Christmas Ever, and join the TAM Club.
// Nothing about any person is shown on the screen: only counts.

import crypto from 'node:crypto';
import { fail, send, readJson, text, email as cleanEmail, newId, rateLimiter } from '../lib/http.js';

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

export function liveDomain(ctx, tickets) {
  const { db, save, cfg, content: c } = ctx;
  for (const k of ['liveCheckins', 'liveFollows']) if (!Array.isArray(db[k])) db[k] = [];
  const iso = () => new Date(ctx.now()).toISOString();
  const limited = rateLimiter({ max: 40 });

  // tonight's night: the one running now, else today's first, else ?night=
  function nightFor(slug) {
    if (slug) { const n = c.nightBy.get(slug); if (n) return n; }
    const list = tickets.tonight();
    const now = iso();
    return list.find((n) => n.start <= now && n.end > now) || list[0] || null;
  }

  // the acts on the night: JOM acts with their permanent pages, else the line-up
  function actsFor(n) {
    if (!n) return [];
    if (ctx.jom && ctx.jom.forNight(n.slug)) {
      return ctx.jom.shown().filter((a) => a.sessions.includes(n.slug)).map((a) => ({
        slug: a.slug, name: a.name, photo: a.photo, group: a.groupName, href: `${cfg.siteUrl}/jom/${a.slug}`, short: `${cfg.jomHost}/${a.slug}`, pledges: a.pledges, jom: true,
      }));
    }
    const fromArtists = (n.artists || []).map((s) => c.artistBy.get(s)).filter(Boolean)
      .map((a) => ({ slug: a.slug, name: a.name, photo: a.photo || '', group: '', href: `${cfg.siteUrl}/artists/${a.slug}`, short: `tam.tv/artists/${a.slug}`, pledges: 0 }));
    const fromLineup = (n.lineup || []).filter((x) => !fromArtists.some((a) => a.name === x.name))
      .map((x) => ({ slug: x.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: x.name, photo: '', group: x.role || '', href: `${cfg.siteUrl}/events/${n.slug}`, short: '', pledges: 0 }));
    return fromArtists.concat(fromLineup);
  }

  function state(n) {
    const acts = actsFor(n);
    const list = db.liveCheckins.filter((x) => x.night === (n && n.slug));
    const by = {};
    for (const x of list) if (x.act) by[x.act] = (by[x.act] || 0) + x.n;
    return {
      night: n ? { slug: n.slug, title: n.title, when: `${n.weekday} ${n.day} ${n.month}`, from: n.doors, to: n.ends } : null,
      people: list.reduce((t, x) => t + x.n, 0), groups: list.length,
      lastTen: list.filter((x) => Date.parse(x.at) > ctx.now() - 10 * 60000).reduce((t, x) => t + x.n, 0),
      acts: acts.map((a) => ({ ...a, here: by[a.slug] || 0 })),
      crowd: acts.map((a) => ({ slug: a.slug, name: a.name, here: by[a.slug] || 0 })).filter((a) => a.here).sort((x, y) => y.here - x.here).slice(0, 5),
      checkinUrl: `${cfg.siteUrl}/checkin`,
    };
  }

  function routes(r) {
    r.get('/api/live', (req, res, { url }) => send(res, 200, state(nightFor(url.searchParams.get('night'))), { 'Cache-Control': 'no-store' }));

    // self check-in: one per phone per night (sending again updates it)
    r.post('/api/live/checkin', async (req, res) => {
      if (limited(req)) throw fail(429, 'Too many tries. Try again in a minute.');
      const b = await readJson(req, 2048);
      const n = nightFor(text(b.night, 120));
      if (!n) throw fail(404, 'There’s no TAM night on right now.');
      const id = text(b.id, 80);
      if (id.length < 16) throw fail(400, 'Missing browser id.');
      const people = Math.max(1, Math.min(12, parseInt(b.n, 10) || 1));
      const act = actsFor(n).some((a) => a.slug === b.act) ? b.act : '';
      const who = hash(`${id}|${n.slug}`);
      let x = db.liveCheckins.find((y) => y.night === n.slug && y.who === who);
      const again = Boolean(x);
      if (x) Object.assign(x, { n: people, act, updatedAt: iso() });
      else db.liveCheckins.push(x = { id: newId('CI', 6), night: n.slug, who, n: people, act, at: iso() });
      // TAM Club members: the "come to a night" points
      if (ctx.club) ctx.club.awardReq(req, 'attend', `door:${ctx.today()}`);
      await save();
      send(res, 200, { ok: true, again, ...state(n) });
    });

    // follow an act: an email when they play next (explicit consent)
    r.post('/api/live/follow', async (req, res) => {
      if (limited(req)) throw fail(429, 'Too many tries. Try again in a minute.');
      const b = await readJson(req, 2048);
      const n = nightFor(text(b.night, 120));
      const a = n && actsFor(n).find((y) => y.slug === b.act);
      if (!a) throw fail(400, 'Pick who you came to see.');
      const mail = cleanEmail(b.email);
      if (!mail) throw fail(400, 'Add a valid email address.');
      if (b.consent !== true) throw fail(400, 'Tick the box to say yes to the email.');
      if (!db.liveFollows.some((f) => f.act === a.slug && f.email === mail)) {
        db.liveFollows.push({ id: newId('LF', 6), act: a.slug, actName: a.name, jom: Boolean(a.jom), night: n.slug, email: mail, at: iso(), consent: `Yes, email me when ${a.name} plays next.` });
        await save();
      }
      send(res, 201, { ok: true });
    });

    // staff: who checked in (counts) and the follow list
    r.get('/api/live/report', (req, res, { url }) => {
      ctx.team.guard(req, 'ops');
      const n = nightFor(url.searchParams.get('night'));
      send(res, 200, { ...state(n), follows: db.liveFollows.filter((f) => !n || f.night === n.slug).map(({ actName, email, at }) => ({ actName, email, at })) });
    });
    r.get('/api/live/follows.csv', (req, res) => {
      ctx.team.guard(req, 'ops');
      const rows = [['Act', 'Email', 'When', 'Night', 'Consent'], ...db.liveFollows.map((f) => [f.actName, f.email, f.at, f.night, f.consent])];
      send(res, 200, rows.map((r0) => r0.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="follows.csv"' });
    });
  }

  return { routes, nightFor, actsFor, state };
}
