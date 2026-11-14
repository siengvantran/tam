// The TAM Stage: TAM's A&R, as a game everyone can play.
//
// Every request to play at TAM (the Sunday Showcase call-out, the musician
// enquiry form, Ask TAM, or /stage/apply) becomes an artist with their own
// microverse: a page they build and vet themselves against a checklist,
// that staff approve before it goes public. The microverse shows the path to
// a festival spot as six planets: Signal → Orbit → Open Night → Showcase →
// Headline → Festival, with the goals for the next one.
//
// Fans discover acts on /stage and boost them (TAM Club members earn a
// point, and a scout bonus when an act they backed moves up). Staff rate
// acts in /stage/manage; the board blends ratings, fan signals, the page and
// momentum into a score and suggests the next step, with its reasons.
// Moving an act up or down is always a staff decision.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, send, readJson, text, email as cleanEmail, newId, rateLimiter } from '../lib/http.js';
import { clubShell, clubButton } from '../services/mailer.js';
import { escape as e } from '../views/html.js';
import { londonToday } from '../lib/content.js';
import { VIBES } from './showcases.js';

export const STAGES = [
  { id: 'signal', name: 'Signal', planet: 'Your first signal', blurb: 'You’ve asked to play. Build your page and send it for review.' },
  { id: 'orbit', name: 'Orbit', planet: 'In orbit', blurb: 'Your page is live. Fans can find you and boost you.' },
  { id: 'open', name: 'Open Night', planet: 'Open Night', blurb: 'Play one of TAM’s open nights: the open mic, Singers Club, the Blues Jam or JOM.' },
  { id: 'showcase', name: 'Showcase', planet: 'Sunday Showcase', blurb: 'A full set at the Sunday Showcase × TAM.' },
  { id: 'headline', name: 'Headline', planet: 'Your own TAM night', blurb: 'Your own night, or a main support, at TAM.' },
  { id: 'festival', name: 'Festival', planet: 'A festival stage', blurb: 'A spot at a TAM festival, like The Best Christmas Ever.' },
];
export const RATINGS = { music: 'Musicianship', presence: 'Stage presence', original: 'Originality', draw: 'Brings a crowd', ready: 'Ready and reliable' };
const DAY = 86400000;
const COOKIE = 'tam_stage';

// What it takes to reach each stage (shown to the artist and to staff). Staff still decide.
function goals(a, s) {
  const r = s.rating;
  const g = {
    orbit: [['Your page is complete', s.page >= 1], ['TAM has reviewed it', a.status === 'live']],
    open: [['Booked or played a TAM open night', Boolean(a.played && a.played.open)], ['10 boosts from fans', s.boosts >= 10, s.boosts / 10]],
    showcase: [['Played a TAM open night', Boolean(a.played && a.played.open)], ['25 boosts', s.boosts >= 25, s.boosts / 25], ['A&R rating 3.5 or more', r.avg >= 3.5, r.avg / 3.5]],
    headline: [['Played a Sunday Showcase', Boolean(a.played && a.played.showcase)], ['75 boosts', s.boosts >= 75, s.boosts / 75], ['A&R rating 4 or more', r.avg >= 4, r.avg / 4], ['Brings a crowd: 3.5 or more', (r.by.draw || 0) >= 3.5, (r.by.draw || 0) / 3.5]],
    festival: [['Headlined or supported at TAM', Boolean(a.played && a.played.headline)], ['150 boosts', s.boosts >= 150, s.boosts / 150], ['A&R rating 4.2 or more', r.avg >= 4.2, r.avg / 4.2], ['Ready and reliable: 4 or more', (r.by.ready || 0) >= 4, (r.by.ready || 0) / 4]],
  };
  return g[STAGES[a.stage + 1] ? STAGES[a.stage + 1].id : ''] || [];
}

const slugOf = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'artist';
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const ytId = (u) => (/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(String(u || '')) || [])[1] || '';
const cleanLinks = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map((x) => String(x).trim()).filter((x) => /^https:\/\/[^\s<>"]+$/.test(x)).slice(0, 8);

export function stageDomain(ctx) {
  const { db, save, cfg } = ctx;
  for (const k of ['arArtists', 'arBoosts', 'arLinks', 'arSessions']) if (!Array.isArray(db[k])) db[k] = [];
  const iso = (t = ctx.now()) => new Date(t).toISOString();
  const today = () => londonToday(new Date(ctx.now()));
  const site = () => cfg.siteUrl;
  const linkLimited = rateLimiter({ max: 8 });
  const boostLimited = rateLimiter({ max: 40 });

  const bySlug = (slug) => db.arArtists.find((a) => a.slug === slug);
  const byEmail = (mail) => db.arArtists.find((a) => a.email === mail);
  const RESERVED = new Set(['apply', 'in', 'me', 'manage']);
  const uniqueSlug = (name) => { const b = RESERVED.has(slugOf(name)) ? `${slugOf(name)}-act` : slugOf(name); let s = b, i = 2; while (bySlug(s)) s = `${b}-${i++}`; return s; };

  // ---------- signals and the score ----------
  function stats(a) {
    const boosts = db.arBoosts.filter((b) => b.a === a.id);
    const recent = boosts.filter((b) => Date.parse(b.at) > ctx.now() - 14 * DAY).length;
    const before = boosts.filter((b) => Date.parse(b.at) <= ctx.now() - 14 * DAY && Date.parse(b.at) > ctx.now() - 28 * DAY).length;
    const raters = Object.values(a.ratings || {});
    const by = {};
    for (const k of Object.keys(RATINGS)) { const v = raters.map((x) => x[k]).filter(Number.isFinite); by[k] = v.length ? v.reduce((t, x) => t + x, 0) / v.length : 0; }
    const filled = Object.values(by).filter(Boolean);
    const avg = filled.length ? filled.reduce((t, x) => t + x, 0) / filled.length : 0;
    const checks = pageChecks(a);
    const page = checks.filter((c) => c.done).length / checks.length;
    return { boosts: boosts.length, recent, momentum: recent - before, views: Object.values(a.views || {}).reduce((t, x) => t + x, 0), shares: a.shares || 0,
      rating: { avg: Math.round(avg * 10) / 10, by, raters: raters.length }, page };
  }
  // 0–100: what the A&R board sorts by. Ratings count most; fans next; then momentum and the page.
  function score(a, s = stats(a)) {
    const live = db.arArtists.filter((x) => x.status === 'live');
    const most = Math.max(10, ...live.map((x) => db.arBoosts.filter((b) => b.a === x.id).length));
    const fan = Math.min(1, s.boosts / most);
    const mom = Math.max(0, Math.min(1, (s.recent + Math.max(0, s.momentum)) / 20));
    return Math.round(s.rating.avg / 5 * 50 + fan * 25 + mom * 15 + s.page * 10);
  }

  // The artist's own checklist: they vet their page before sending it in.
  function pageChecks(a) {
    return [
      { id: 'photo', label: 'A photo of you or the band', done: Boolean(a.photo), xp: 10 },
      { id: 'act', label: 'Your act’s name', done: Boolean(a.act), xp: 5 },
      { id: 'plays', label: 'What you play, in a line', done: Boolean(a.plays), xp: 5 },
      { id: 'bio', label: 'Your story (80 words is plenty)', done: String(a.bio || '').length >= 80, xp: 10 },
      { id: 'links', label: 'At least one link to your music', done: (a.links || []).length >= 1, xp: 10 },
      { id: 'video', label: 'A YouTube video of you playing live', done: Boolean(a.youtube), xp: 15 },
      { id: 'vibe', label: 'Your page’s vibe', done: Boolean(a.vibe), xp: 5 },
      { id: 'own', label: 'Everything here is yours to share, and you’re 18+ or have a parent’s OK', done: Boolean(a.ownWork), xp: 5 },
    ];
  }
  // XP: the page, fans, and what TAM has seen. A number to watch go up.
  function xpOf(a, s) {
    const page = pageChecks(a).filter((c) => c.done).reduce((t, c) => t + c.xp, 0);
    return page + s.boosts * 2 + Math.min(100, Math.floor(s.views / 5)) + a.stage * 100 + Math.round(s.rating.avg * 20);
  }

  function suggest(a, s = stats(a)) {
    if (a.status === 'review') return { action: 'review', text: 'Waiting for review: check the page and put it live, or send it back with a note.' };
    if (a.status !== 'live') return { action: 'none', text: a.status === 'draft' ? 'Still building their page.' : 'Not on the path right now.' };
    const g = goals(a, s);
    const next = STAGES[a.stage + 1];
    if (!next) return { action: 'none', text: 'At the top: a festival act.' };
    const missing = g.filter((x) => !x[1]).map((x) => x[0]);
    if (!s.rating.raters) return { action: 'rate', text: 'Nobody at TAM has rated them yet. Watch a video or catch them live, then rate them.' };
    if (!missing.length) return { action: 'advance', to: next.id, text: `Ready for ${next.name}: every goal is met. Book them and move them up.` };
    const lastSeen = Math.max(Date.parse(a.updatedAt || a.createdAt), ...db.arBoosts.filter((b) => b.a === a.id).map((b) => Date.parse(b.at)));
    if (lastSeen < ctx.now() - 30 * DAY) return { action: 'nudge', text: 'Quiet for a month: no boosts or page changes. Worth a nudge.' };
    return { action: 'wait', text: `On the way to ${next.name}. Still to do: ${missing.join('; ')}.` };
  }

  // ---------- views ----------
  function publicView(a) {
    const s = stats(a);
    return {
      slug: a.slug, act: a.act || a.name, plays: a.plays, from: a.from, bio: a.bio, links: a.links || [], youtube: a.youtube, photo: a.photo, vibe: a.vibe || 'stage',
      stage: a.stage, stageName: STAGES[a.stage].name, boosts: s.boosts, xp: xpOf(a, s),
      goals: goals(a, s).map(([label, done, part]) => ({ label, done, part: done ? 1 : Math.max(0, Math.min(0.99, part || 0)) })),
      backers: backers(a), href: `/stage/${a.slug}`,
    };
  }
  const progress = (v) => (v.goals.length ? v.goals.reduce((t, g) => t + g.part, 0) / v.goals.length : 1);
  function backers(a) {
    const seen = new Set(), out = [];
    for (const b of db.arBoosts.filter((x) => x.a === a.id && x.m)) {
      if (seen.has(b.m)) continue;
      seen.add(b.m);
      const m = db.members.find((x) => x.id === b.m);
      const first = m && String(m.name || '').trim().split(/\s+/)[0];
      if (first) out.push(first);
      if (out.length >= 12) break;
    }
    return out;
  }
  function ownerView(a) {
    const s = stats(a);
    return { ...publicView(a), name: a.name, email: a.email, status: a.status, ownWork: Boolean(a.ownWork), checks: pageChecks(a),
      canSubmit: a.status === 'draft' && pageChecks(a).every((c) => c.done), views: s.views, shares: s.shares, vibes: VIBES,
      messages: (a.decisions || []).filter((d) => d.message).map((d) => ({ at: d.at, message: d.message })).reverse(), shareUrl: `${site()}/stage/${a.slug}` };
  }
  function staffView(a) {
    const s = stats(a);
    return { ...ownerView(a), id: a.id, source: a.source, createdAt: a.createdAt, submittedAt: a.submittedAt, score: score(a, s), stats: s,
      suggest: suggest(a, s), ratings: a.ratings || {}, notes: a.notes || [], decisions: a.decisions || [], played: a.played || {}, circuit: a.circuit || '' };
  }

  // ---------- applying (from any play request) ----------
  async function apply(input, source) {
    const mail = cleanEmail(input.email);
    if (!mail) throw fail(400, 'Add a valid email address.');
    let a = byEmail(mail);
    if (!a) {
      const act = text(input.act || input.company, 80) || text(input.name, 80);
      if (!act) throw fail(400, 'Add your name or your act’s name.');
      a = {
        id: newId('AR', 6), slug: uniqueSlug(act), email: mail, name: text(input.name, 80), act, plays: text(input.plays || input.style, 120),
        from: '', bio: '', links: cleanLinks(input.links), youtube: ytId(input.youtube || (cleanLinks(input.links).find((l) => ytId(l)) || '')), photo: '', vibe: '',
        circuit: text(input.circuit, 120), message: text(input.message, 1200), status: 'draft', stage: 0, source: text(source, 40) || 'tam.tv',
        createdAt: iso(), updatedAt: iso(), views: {}, shares: 0, ratings: {}, notes: [], decisions: [], played: {},
      };
      db.arArtists.push(a);
    }
    await save();
    await mailLink(a).catch((err) => console.warn(`Stage link ${a.id}: ${err.message}`));
    return a;
  }

  async function mailLink(a) {
    const t = token();
    db.arLinks = db.arLinks.filter((l) => Date.parse(l.expires) > ctx.now() && !l.usedAt);
    db.arLinks.push({ hash: hash(t), a: a.id, expires: iso(ctx.now() + 3 * DAY) });
    await save();
    if (!ctx.mail.enabled()) return;
    const url = `${site()}/stage/in?t=${t}`;
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">Your TAM Stage page${a.act ? `: ${e(a.act)}` : ''}</h1>
      <p>Thanks for asking to play at TAM. Every act gets its own page on the TAM Stage: your <b>microverse</b>. It shows your music to TAM’s crowd and your path to a festival spot, planet by planet: Signal, Orbit, Open Night, Showcase, Headline, Festival.</p>
      <p>Tap below to build it: add a photo, your story, your links and a live video, tick the checklist, and send it to us to review. Fans can boost you once it’s live.</p>
      ${clubButton('Build my page', url)}<p style="font-size:13px;color:#8a7f86">The link works once, for 3 days. Ask for a new one any time at ${e(site())}/stage/apply.</p>`;
    await ctx.mail.send({ to: a.email, subject: 'Your TAM Stage page: build your microverse', html: clubShell(inner, { preheader: 'Your path to a festival spot at TAM starts here.' }), text: `Build your TAM Stage page: ${url}` });
  }
  function tell(a, subject, heading, body, button) {
    if (!ctx.mail.enabled()) return;
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">${e(heading)}</h1>${body}${button ? clubButton(button[0], button[1]) : ''}`;
    ctx.mail.send({ to: a.email, subject, html: clubShell(inner, { preheader: heading }), text: `${heading}\n\n${body.replace(/<[^>]+>/g, '')}${button ? `\n\n${button[1]}` : ''}` })
      .catch((err) => console.warn(`Stage email ${a.id}: ${err.message}`));
  }

  // ---------- sessions ----------
  const cookieOf = (req) => (new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '') || [])[1] || '';
  const secure = () => (cfg.siteUrl.startsWith('https:') ? '; Secure' : '');
  function artistOf(req) {
    const c = cookieOf(req);
    const s = c && db.arSessions.find((x) => x.hash === hash(c) && Date.parse(x.expires) > ctx.now());
    return (s && db.arArtists.find((a) => a.id === s.a)) || null;
  }
  const mine = (req) => { const a = artistOf(req); if (!a) throw fail(401, 'Open your page from the link we emailed you.'); return a; };

  async function dropPhoto(a) {
    if (!a.photo) return;
    const file = path.join(ctx.uploadsDir || '', path.basename(a.photo));
    a.photo = '';
    if (ctx.uploadsDir) await fs.unlink(file).catch(() => {});
  }

  function move(a, to, who, message) {
    const from = a.stage;
    a.stage = to;
    a.decisions = (a.decisions || []).concat({ at: iso(), by: who.name, action: to > from ? 'advance' : 'back', from, to, message: text(message, 1000) });
    a.updatedAt = iso();
    // fans who boosted them get a scout bonus on their TAM Club card when they move up
    if (to > from && ctx.club) {
      for (const m of new Set(db.arBoosts.filter((b) => b.a === a.id && b.m).map((b) => b.m))) {
        const mem = db.members.find((x) => x.id === m);
        if (mem) ctx.club.award(mem, 'scout', `${a.id}:${to}`, {});
      }
    }
  }

  function routes(r) {
    // ----- applying and signing in -----
    r.post('/api/stage/apply', async (req, res) => {
      if (linkLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 8 * 1024);
      if (b.consent !== true) throw fail(400, 'Tick the box so we can email you about playing at TAM.');
      await apply(b, 'stage');
      send(res, 201, { ok: true });
    });
    r.post('/api/stage/in', async (req, res) => {
      const b = await readJson(req, 1024);
      const l = db.arLinks.find((x) => x.hash === hash(String(b.t || '')) && !x.usedAt && Date.parse(x.expires) > ctx.now());
      const a = l && db.arArtists.find((x) => x.id === l.a);
      if (!a) throw fail(400, 'That link has expired or was already used. Ask for a new one on the apply page.');
      l.usedAt = iso();
      const t = token();
      db.arSessions = db.arSessions.filter((s) => Date.parse(s.expires) > ctx.now()).concat({ hash: hash(t), a: a.id, expires: iso(ctx.now() + 60 * DAY) });
      res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}${secure()}`);
      await save();
      send(res, 200, { ok: true, next: '/stage/me' });
    });
    r.post('/api/stage/signout', async (req, res) => {
      const c = cookieOf(req);
      if (c) db.arSessions = db.arSessions.filter((s) => s.hash !== hash(c));
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
      await save();
      send(res, 200, { ok: true });
    });

    // ----- the artist's own page -----
    r.get('/api/stage/me', (req, res) => send(res, 200, { artist: ownerView(mine(req)) }));
    r.post('/api/stage/me', async (req, res) => {
      const a = mine(req);
      const b = await readJson(req, 16 * 1024);
      if (b.act !== undefined) a.act = text(b.act, 80) || a.act;
      if (b.plays !== undefined) a.plays = text(b.plays, 120);
      if (b.from !== undefined) a.from = text(b.from, 80);
      if (b.bio !== undefined) a.bio = text(b.bio, 1500);
      if (b.links !== undefined) a.links = cleanLinks(b.links);
      if (b.youtube !== undefined) { a.youtube = ytId(b.youtube); if (b.youtube && !a.youtube) throw fail(400, 'That doesn’t look like a YouTube link.'); }
      if (b.vibe !== undefined && VIBES[b.vibe]) a.vibe = b.vibe;
      if (typeof b.ownWork === 'boolean') a.ownWork = b.ownWork;
      a.updatedAt = iso();
      await save();
      send(res, 200, { artist: ownerView(a) });
    });
    r.post('/api/stage/me/photo', async (req, res) => {
      const a = mine(req);
      const b = await readJson(req, 900 * 1024);
      if (b.remove) { await dropPhoto(a); await save(); return send(res, 200, { artist: ownerView(a) }); }
      const url = await ctx.saveImage(b.photo, `stage-${a.id}-${crypto.randomBytes(6).toString('hex')}`, { what: 'Photos', maxKB: 600 });
      await dropPhoto(a);
      a.photo = url;
      a.updatedAt = iso();
      await save();
      send(res, 200, { artist: ownerView(a) });
    });
    r.post('/api/stage/me/submit', async (req, res) => {
      const a = mine(req);
      if (a.status !== 'draft') throw fail(409, a.status === 'review' ? 'It’s with us: we’ll be in touch.' : 'Your page is already live.');
      const missing = pageChecks(a).filter((c) => !c.done);
      if (missing.length) throw fail(400, `Nearly there. Still to do: ${missing.map((c) => c.label.toLowerCase()).join('; ')}.`);
      a.status = 'review';
      a.submittedAt = iso();
      await save();
      send(res, 200, { artist: ownerView(a) });
    });

    // ----- fans -----
    r.post('/api/stage/:slug/boost', async (req, res, { params }) => {
      const a = bySlug(params.slug);
      if (!a || a.status !== 'live') throw fail(404, 'No such act.');
      if (boostLimited(req)) throw fail(429, 'That’s a lot of boosts. Try again later.');
      const b = await readJson(req, 1024);
      const id = text(b.id, 80);
      if (id.length < 16) throw fail(400, 'Missing browser id.');
      const member = ctx.club && ctx.club.memberOf(req);
      const who = member ? `m:${member.id}` : hash(id);
      // one boost per fan per act per day
      const already = db.arBoosts.some((x) => x.a === a.id && x.who === who && x.day === today());
      if (!already) {
        db.arBoosts.push({ a: a.id, who, m: member ? member.id : null, day: today(), at: iso() });
        if (member) ctx.club.award(member, 'boost', `${a.id}:${today()}`);
        await save();
      }
      send(res, 200, { boosts: db.arBoosts.filter((x) => x.a === a.id).length, already, member: Boolean(member) });
    });
    r.post('/api/stage/:slug/share', async (req, res, { params }) => {
      const a = bySlug(params.slug);
      if (a && a.status === 'live') { a.shares = (a.shares || 0) + 1; save(); }
      send(res, 200, { ok: true });
    });

    // ----- A&R: staff -----
    const guard = (req) => ctx.team.guard(req, 'ops');
    r.get('/api/stage/manage', (req, res) => {
      const who = guard(req);
      const list = db.arArtists.map(staffView).sort((x, y) => (y.status === 'review') - (x.status === 'review') || y.score - x.score);
      send(res, 200, { me: { name: who.name }, artists: list, stages: STAGES, ratings: RATINGS, vibes: VIBES,
        counts: Object.fromEntries(['draft', 'review', 'live', 'paused', 'declined'].map((k) => [k, db.arArtists.filter((a) => a.status === k).length])) });
    });
    r.post('/api/stage/manage/:id', async (req, res, { params }) => {
      const who = guard(req);
      const a = db.arArtists.find((x) => x.id === params.id);
      if (!a) throw fail(404, 'No such artist.');
      const b = await readJson(req, 8 * 1024);
      switch (b.action) {
        case 'rate': {
          const r0 = {};
          for (const k of Object.keys(RATINGS)) { const v = Number(b.ratings && b.ratings[k]); if (v >= 1 && v <= 5) r0[k] = Math.round(v); }
          if (!Object.keys(r0).length) throw fail(400, 'Give at least one rating from 1 to 5.');
          a.ratings = { ...(a.ratings || {}), [who.name]: { ...r0, at: iso() } };
          break;
        }
        case 'note': { const t = text(b.note, 1000); if (!t) throw fail(400, 'Write a note.'); a.notes = (a.notes || []).concat({ at: iso(), by: who.name, text: t }); break; }
        case 'approve':
          if (a.status === 'live') throw fail(409, 'Already live.');
          a.status = 'live';
          if (a.stage < 1) move(a, 1, who, b.message || '');
          tell(a, 'Your TAM Stage page is live', 'You’re in orbit 🪐', `<p>Your page is live on the TAM Stage. Share it: every boost from a fan moves you toward your next planet, the Open Night.</p>${b.message ? `<p>${e(b.message)}</p>` : ''}`, ['See my page', `${site()}/stage/${a.slug}`]);
          break;
        case 'sendBack':
          a.status = 'draft';
          a.decisions = (a.decisions || []).concat({ at: iso(), by: who.name, action: 'sendBack', message: text(b.message, 1000) });
          tell(a, 'Your TAM Stage page: a few changes', 'Nearly there', `<p>${e(b.message || 'We’d love a few changes before your page goes live.')}</p>`, ['Edit my page', `${site()}/stage/apply`]);
          break;
        case 'advance': case 'back': {
          if (a.status !== 'live') throw fail(409, 'Put their page live first.');
          const to = b.action === 'advance' ? Math.min(STAGES.length - 1, a.stage + 1) : Math.max(1, a.stage - 1);
          if (to === a.stage) throw fail(409, 'They’re already there.');
          move(a, to, who, b.message);
          if (b.action === 'advance') tell(a, `TAM Stage: you’ve reached ${STAGES[to].name}`, `Next planet: ${STAGES[to].name} ✦`, `<p>${e(STAGES[to].blurb)}</p>${b.message ? `<p>${e(b.message)}</p>` : ''}`, ['See my microverse', `${site()}/stage/${a.slug}`]);
          break;
        }
        case 'played': { const k = ['open', 'showcase', 'headline'].includes(b.what) ? b.what : ''; if (!k) throw fail(400, 'Played what?'); a.played = { ...(a.played || {}), [k]: b.on !== false ? (text(b.date, 20) || today()) : undefined }; break; }
        case 'pause': a.status = 'paused'; a.decisions = (a.decisions || []).concat({ at: iso(), by: who.name, action: 'pause', message: text(b.message, 1000) }); break;
        case 'decline':
          a.status = 'declined';
          a.decisions = (a.decisions || []).concat({ at: iso(), by: who.name, action: 'decline', message: text(b.message, 1000) });
          if (b.email) tell(a, 'Playing at TAM', 'Thanks for asking to play', `<p>${e(b.message || 'Thanks for sending us your music. It isn’t the right fit for TAM’s stages right now, but keep playing and come to an open night: we’d love to hear how you grow.')}</p>`);
          break;
        case 'restore': a.status = 'live'; break;
        default: throw fail(400, 'Unknown action.');
      }
      a.updatedAt = iso();
      await save();
      send(res, 200, { artist: staffView(a) });
    });
    r.post('/api/stage/import-showcase', async (req, res) => {
      const who = guard(req);
      let added = 0;
      for (const [date, sc] of Object.entries(db.showcases || {})) {
        for (const x of sc.acts || []) {
          if (!x.name || (x.email && byEmail(x.email)) || db.arArtists.some((a) => a.showcaseSlug === x.slug)) continue;
          db.arArtists.push({
            id: newId('AR', 6), slug: uniqueSlug(x.name), email: x.email || '', name: '', act: x.name, plays: x.plays || '', from: (x.from || []).join(', '),
            bio: x.blurb || '', links: (x.links || []).map((l) => l.url || l).filter((u) => /^https:/.test(u)), youtube: (x.song && x.song.youtubeId) || '', photo: x.photo || '',
            vibe: x.vibe || 'stage', ownWork: true, status: 'live', stage: 3, source: 'showcase', showcaseSlug: x.slug, createdAt: iso(), updatedAt: iso(),
            views: {}, shares: 0, ratings: {}, notes: [], played: { open: date, showcase: date }, decisions: [{ at: iso(), by: who.name, action: 'import', from: 0, to: 3, message: '' }],
          });
          added++;
        }
      }
      await save();
      send(res, 200, { added });
    });
  }

  // count a page view (not for the artist themselves or bots)
  function viewed(a, req) {
    if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|headless/i.test(req.headers['user-agent'] || '')) return;
    const me = artistOf(req);
    if (me && me.id === a.id) return;
    a.views = a.views || {};
    a.views[today()] = (a.views[today()] || 0) + 1;
    save();
  }

  const live = () => db.arArtists.filter((a) => a.status === 'live').map(publicView);
  return { routes, apply, publicView, ownerView, artistOf, bySlug, live, viewed, progress, stats, score, suggest };
}
