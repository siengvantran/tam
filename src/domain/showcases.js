// Sunday Showcase line-ups, shown as presents under a Christmas tree on
// /sunday-showcases: visitors tap a present to unwrap it and meet that act.
// Staff (Ops and Admin) add showcases and fill in the acts at
// /sunday-showcases/manage; until an act is named its present reads
// "to be announced". The page shows the next showcase still to come.
//
// content/showcases.json "next": { date, night (event slug), acts } is a starting one.
// Stored in db.showcases: { [date]: { night, count, acts: [{ name, plays, photo, links[], blurb }], note, removed } }

import crypto from 'node:crypto';
import { fail, send, readJson, text, rateLimiter, newId, email as cleanEmail } from '../lib/http.js';
import { longDate } from '../lib/content.js';
import { PLACES, placeOf } from '../lib/places.js';
import { autoArrange, withTimes, checks, metrics, suggest, rewhy, isTime, DEFAULTS } from '../lib/running-order.js';

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
// A YouTube video for an act's page: a watch/short/embed link or the bare id; a title; a tempo for the lights.
const ytId = (v) => { const s = String(v || '').trim(); const m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(s); return m ? m[1] : /^[\w-]{11}$/.test(s) ? s : ''; };
export const songOf = (x) => {
  if (!x) return null;
  const youtubeId = ytId(typeof x === 'string' ? x : x.youtubeId || x.url);
  if (!youtubeId) return null;
  const bpm = parseInt(x.bpm, 10);
  return { youtubeId, title: text(x.title, 120), ...(bpm >= 50 && bpm <= 220 ? { bpm } : {}) };
};
export const linkName = (u) => (LINK_NAMES.find(([rx]) => rx.test(u)) || [, 'Website'])[1];

// Each act's page has its own look: a vibe staff pick in the editor.
export const VIBES = {
  stage: 'TAM stage: gold and black',
  disco: 'Disco: glitter gold and pink',
  pop: 'Pop: candy pink and electric blue',
  noir: 'Noir: crimson and shadow',
  campfire: 'Campfire: warm wood and forest green',
  mist: 'Mist: hazy teal and sage',
  spotlight: 'Spotlight: violet and white beams',
  riot: 'Riot: acid green and magenta',
};
// Each vibe's mark: its name and a sign, flashing on the act's page and the line-up.
export const VIBE_MARKS = { stage: ['Stage', '★'], disco: ['Disco', '✺'], pop: ['Pop', '♥'], noir: ['Noir', '☾'], campfire: ['Campfire', '✹'], mist: ['Mist', '≋'], spotlight: ['Spotlight', '✧'], riot: ['Riot', '✶'] };
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
    // the night it's part of; if that listing has been replaced (e.g. by a ticketed show), whatever is on that night now
    const night = (slug && ctx.content.nights.find((x) => x.slug === slug)) || (slug === '' ? null : nightsOn(date)[0] || null);
    const seen = new Set();
    const wants = (db.showcaseWants || {})[date] || {};
    // set times go public only once the running order is published (after sound check)
    const pub = s.run && s.run.status === 'published' ? withTimes(s.run) : null;
    const timeOf = new Map(pub ? pub.slots.map((x) => [x.slug, { on: x.on, off: x.off }]) : []);
    return {
      date, when: longDate(date), note: s.note || '', count,
      run: pub ? { published: true, start: pub.start, finish: pub.finish, intervalAt: pub.intervalAt, order: pub.slots.map((x) => ({ slug: x.slug, on: x.on, off: x.off })) } : null,
      night: night ? { title: night.title, slug: night.slug, doors: night.doors || '', href: `/events/${night.slug}`, onSale: Boolean(night.sale), donate: night.donate || null } : null,
      acts: Array.from({ length: count }, (_, i) => {
        if (!(named[i] && named[i].name)) return { n: i + 1, tba: true };
        // the act's address is kept once made, so a new name (a band's name arriving later) keeps its page, votes and numbers
        let slug = /^[a-z0-9-]{1,60}$/.test(named[i].slug || '') ? named[i].slug : slugOf(named[i].name);
        if (seen.has(slug)) slug = `${slug}-${i + 1}`;
        seen.add(slug);
        const { email: _private, ...pub } = named[i];
        return { n: i + 1, ...pub, slug, href: `/sunday-showcases/${date}/${slug}`, vibe: VIBES[named[i].vibe] ? named[i].vibe : 'stage', ...(timeOf.get(slug) || {}),
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

  // ----- each act's wall -----
  // db.showcaseWall[date][slug] = [{ id, kind: note|youtube|instagram, name, message | videoId | postId,
  //   caption, at, status: pending|shown|hidden|removed, by: fan|artist|staff }]
  // artists sign in by email: db.showcaseArtistLinks (one-time links), db.showcaseArtistSessions
  db.showcaseWall = db.showcaseWall || {};
  db.showcaseArtistLinks = db.showcaseArtistLinks || [];
  db.showcaseArtistSessions = db.showcaseArtistSessions || [];
  const ARTIST_COOKIE = 'tam_artist', LINK_MINUTES = 20, SESSION_DAYS = 30;
  const artistCookie = (req) => (/(?:^|;\s*)tam_artist=([^;]+)/.exec(req.headers.cookie || '') || [])[1] || '';
  const artistEmail = (req) => { const c = artistCookie(req); const s = c && db.showcaseArtistSessions.find((x) => x.hash === hash(`s:${c}`) && Date.parse(x.expires) > ctx.now()); return s ? s.email : ''; };
  // every coming showcase act with this email (an artist may play more than one)
  const actsFor = (mail) => !mail ? [] : upcoming().flatMap((d) => ((db.showcases[d] || {}).acts || []).filter((a) => a && a.email === mail).map((a) => {
    const l = lineup(d); const x = l.acts.find((y) => !y.tba && y.name === a.name); return x ? { date: d, when: l.when, slug: x.slug, name: x.name, href: x.href } : null;
  })).filter(Boolean);
  const wallLimited = rateLimiter({ max: 6 });
  const crewLimited = rateLimiter({ max: 6 });
  db.showcaseCrew = Array.isArray(db.showcaseCrew) ? db.showcaseCrew : [];
  // everyone who has played (or is playing) a Sunday Showcase, newest first
  const alumni = () => dates().slice().reverse().flatMap((d) => { const l = lineup(d); return l.acts.filter((a) => !a.tba).map((a) => ({ ...a, date: d, when: l.when })); });
  // the newest shown notes and posts from every act's wall
  const latestWall = (n = 12) => Object.entries(db.showcaseWall).flatMap(([d, bySlug]) => Object.entries(bySlug).flatMap(([slug, list]) => {
    const x = act(d, slug); return x ? list.filter((w) => w.status === 'shown').map((w) => ({ ...w, act: { name: x.a.name, href: x.a.href, vibe: x.a.vibe } })) : [];
  })).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, n);
  const artistLinkLimited = rateLimiter({ max: 8 });
  const wallOf = (date, slug) => { const d = (db.showcaseWall[date] = db.showcaseWall[date] || {}); return (d[slug] = d[slug] || []); };
  const artistOk = (date, slug, req) => actsFor(artistEmail(req)).some((a) => a.date === date && a.slug === slug);
  const staffOk = (req) => { try { ctx.team.guard(req, 'ops'); return true; } catch { return false; } };
  // a YouTube video or an Instagram post (or reel), from any link form
  const postOf = (u) => {
    const s = String(u || '').trim();
    const yt = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(s);
    if (yt && /youtu/.test(s)) return { kind: 'youtube', videoId: yt[1] };
    const ig = /instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]{5,40})/.exec(s);
    if (ig) return { kind: 'instagram', postId: ig[2], postType: ig[1] === 'tv' ? 'p' : ig[1] };
    return null;
  };

  // ----- the running order (staff), and how visitors react to each act -----
  db.showcaseSignals = db.showcaseSignals || {};
  const signalLimited = rateLimiter({ max: 120 });
  const nightTimes = (l) => { const n = l.night && ctx.content.nights.find((x) => x.slug === l.night.slug); return { doors: (n && n.doors) || '19:30', ends: (n && n.ends) || '22:30' }; };
  // The saved draft, kept in step with the line-up: new acts join the end, removed ones drop out.
  function runFor(date) {
    const l = lineup(date);
    if (!l) return null;
    const s = (db.showcases[date] = db.showcases[date] || {});
    const named = l.acts.filter((a) => !a.tba);
    if (!s.run || !s.run.slots) return autoArrange(named, nightTimes(l));
    const slugs = new Set(named.map((a) => a.slug));
    const run = { ...s.run, slots: s.run.slots.filter((x) => slugs.has(x.slug)) };
    for (const a of named) if (!run.slots.some((x) => x.slug === a.slug)) run.slots.push({ slug: a.slug, mins: DEFAULTS.mins, changeover: DEFAULTS.changeover, soundcheck: false, why: '' });
    if (run.interval.after >= run.slots.length - 1) run.interval = { ...run.interval, after: Math.max(-1, Math.ceil(run.slots.length / 2) - 1) };
    return rewhy(run, named);
  }
  function runView(date) {
    const l = lineup(date), run = runFor(date);
    if (!run) return null;
    const named = l.acts.filter((a) => !a.tba);
    const rows = metrics(named, db.showcaseSignals[date] || {}, (db.showcaseWants || {})[date] || {});
    return { ...withTimes(run), checks: checks(run, named), metrics: rows, suggestions: suggest(run, named, rows),
      principles: [
        'Loudness only goes up: the quiet, acoustic sets play while the room is listening and before the drums and amps arrive.',
        'Each half ends on a high, so people go to the bar, and home, talking about it.',
        'Genres take turns, so no two similar acts play back to back.',
        'The biggest changeover (the full band) happens once, at the end.',
        'Nothing is public until every act has sound-checked and the order is published.',
      ] };
  }
  const cleanRun = (b, l) => {
    const named = l.acts.filter((a) => !a.tba), slugs = new Set(named.map((a) => a.slug));
    const seen = new Set();
    const slots = (Array.isArray(b.slots) ? b.slots : []).filter((x) => x && slugs.has(x.slug) && !seen.has(x.slug) && seen.add(x.slug)).map((x) => ({
      slug: x.slug, mins: Math.max(1, Math.min(90, parseInt(x.mins, 10) || DEFAULTS.mins)), changeover: Math.max(0, Math.min(45, parseInt(x.changeover, 10) || 0)),
      soundcheck: Boolean(x.soundcheck), why: text(x.why, 400), whyCustom: Boolean(x.whyCustom),
    }));
    if (slots.length !== named.length) throw fail(400, 'The running order must have every act once.');
    const t = nightTimes(l);
    return { status: 'draft', start: isTime(b.start) ? b.start : autoArrange(named, t).start, end: isTime(b.end) ? b.end : t.ends,
      interval: { after: (() => { const v = parseInt(b.interval && b.interval.after, 10); return Number.isNaN(v) ? Math.ceil(slots.length / 2) - 1 : Math.max(-1, Math.min(slots.length - 2, v)); })(), mins: Math.max(0, Math.min(60, parseInt(b.interval && b.interval.mins, 10) || 0)) }, slots };
  };

  return {
    lineup, next, upcoming, act, runView, alumni, latestWall, crewCount: () => db.showcaseCrew.length, wallShown: (date, slug) => wallOf(date, slug).filter((w) => w.status === 'shown').slice(-60).reverse(), festival: () => ctx.content.festivals.find((f) => f.theme === 'christmas') || null,
    routes(r) {
      r.get('/api/showcases', (req, res) => send(res, 200, next() || {}));

      // How visitors react to an act: counted per day for the running order (no cookies, nothing personal).
      r.post('/api/showcases/:date/act/:slug/signal', async (req, res, { params }) => {
        if (!act(params.date, params.slug)) throw fail(404, 'That act isn’t in this showcase.');
        const b = await readJson(req, 512);
        if (!['view', 'invite', 'follow', 'play', 'unwrap'].includes(b.type)) throw fail(400, 'Unknown signal.');
        if (signalLimited(req)) return send(res, 202, { ok: true });
        const day = (db.showcaseSignals[params.date] = db.showcaseSignals[params.date] || {});
        const s = (day[params.slug] = day[params.slug] || {});
        s[b.type] = (s[b.type] || 0) + 1;
        await save();
        send(res, 202, { ok: true });
      });

      // ----- staff: the running order -----
      r.get('/api/showcases/:date/run', (req, res, { params }) => {
        ctx.team.guard(req, 'ops');
        const v = runView(params.date);
        if (!v) throw fail(404, 'There’s no showcase on that date.');
        send(res, 200, v);
      });
      r.post('/api/showcases/:date/run', async (req, res, { params }) => {
        const me = ctx.team.guard(req, 'ops');
        const l = lineup(params.date);
        if (!l) throw fail(404, 'There’s no showcase on that date.');
        const b = await readJson(req, 32768);
        const s = (db.showcases[params.date] = db.showcases[params.date] || {});
        const named = l.acts.filter((a) => !a.tba);
        let run;
        if (b.auto) run = autoArrange(named, nightTimes(l));
        else run = rewhy(cleanRun(b, l), named);
        // a sound check recorded stays with the act, wherever it moves
        const before = new Map(((s.run && s.run.slots) || []).map((x) => [x.slug, x]));
        run.slots.forEach((x) => { const p = before.get(x.slug); if (x.soundcheck && !(p && p.soundcheck)) { x.soundcheckAt = new Date(ctx.now()).toISOString(); x.soundcheckBy = me.name || me.email || 'staff'; } else if (x.soundcheck && p) { x.soundcheckAt = p.soundcheckAt; x.soundcheckBy = p.soundcheckBy; } if (b.auto && p) { x.soundcheck = p.soundcheck; x.soundcheckAt = p.soundcheckAt; x.soundcheckBy = p.soundcheckBy; } });
        s.run = { ...run, updatedAt: new Date(ctx.now()).toISOString(), updatedBy: me.name || me.email || 'staff' };
        await save();
        send(res, 200, runView(params.date));
      });
      // Publish: every act sound-checked; the line-up takes this order and the times go public.
      r.post('/api/showcases/:date/run/publish', async (req, res, { params }) => {
        const me = ctx.team.guard(req, 'ops');
        const l = lineup(params.date), run = runFor(params.date);
        if (!run) throw fail(404, 'There’s no showcase on that date.');
        const s = db.showcases[params.date];
        if (!s.run) throw fail(400, 'Save the running order first.');
        const missing = run.slots.filter((x) => !x.soundcheck);
        if (missing.length) throw fail(409, `Not sound-checked yet: ${missing.map((x) => (l.acts.find((a) => a.slug === x.slug) || {}).name || x.slug).join(', ')}.`);
        const bySlugAct = new Map(l.acts.filter((a) => !a.tba).map((a) => [a.slug, a]));
        const keep = (a) => Object.fromEntries(['slug', 'name', 'plays', 'photo', 'links', 'blurb', 'media', 'vibe', 'from', 'press'].map((k) => [k, k === 'links' ? (a.links || []).map((x) => x.url || x) : a[k]]));
        const emailOf = (a) => ((s.acts || []).find((x) => x && x.name === a.name) || {}).email;
        s.acts = [...run.slots.map((x) => { const a = bySlugAct.get(x.slug); return { ...keep(a), ...(emailOf(a) ? { email: emailOf(a) } : {}) }; }), ...(s.acts || []).filter((a) => !a || !a.name)];
        s.run = { ...run, status: 'published', publishedAt: new Date(ctx.now()).toISOString(), publishedBy: me.name || me.email || 'staff' };
        await save();
        send(res, 200, runView(params.date));
      });
      r.post('/api/showcases/:date/run/unpublish', async (req, res, { params }) => {
        ctx.team.guard(req, 'ops');
        const s = db.showcases[params.date];
        if (!s || !s.run) throw fail(404, 'Nothing published.');
        s.run = { ...s.run, status: 'draft' };
        await save();
        send(res, 200, runView(params.date));
      });

      // ----- each act's wall: notes from fans, and the act's own YouTube and Instagram posts -----
      r.get('/api/showcases/:date/act/:slug/wall', (req, res, { params, url }) => {
        if (!act(params.date, params.slug)) throw fail(404, 'That act isn’t in this showcase.');
        const own = artistOk(params.date, params.slug, req) || staffOk(req);
        send(res, 200, { items: wallOf(params.date, params.slug).filter((w) => own ? w.status !== 'removed' : w.status === 'shown').slice(-150).reverse(), moderated: ctx.cfg.pinModeration, own });
      });
      r.post('/api/showcases/:date/act/:slug/wall', async (req, res, { params }) => {
        if (!act(params.date, params.slug)) throw fail(404, 'That act isn’t in this showcase.');
        if (wallLimited(req)) throw fail(429, 'That’s a lot of notes. Try again in a bit.');
        const b = await readJson(req, 4096);
        const name = text(b.name, 40), message = text(b.message, 280);
        if (!name || !message) throw fail(400, 'Add your name and a note.');
        const w = { id: newId('W'), kind: 'note', name, message, at: new Date(ctx.now()).toISOString(), status: ctx.cfg.pinModeration ? 'pending' : 'shown', by: 'fan' };
        wallOf(params.date, params.slug).push(w);
        await save();
        send(res, 201, { ok: true, status: w.status });
      });
      // the act (with their private link) or staff: add a YouTube video or an Instagram post
      r.post('/api/showcases/:date/act/:slug/wall/post', async (req, res, { params }) => {
        const b = await readJson(req, 4096);
        if (!act(params.date, params.slug)) throw fail(404, 'That act isn’t in this showcase.');
        if (!artistOk(params.date, params.slug, req) && !staffOk(req)) throw fail(403, 'This link isn’t valid any more. Ask TAM for a new one.');
        const p = postOf(b.url);
        if (!p) throw fail(400, 'Paste a YouTube video or an Instagram post link.');
        const w = { id: newId('W'), ...p, caption: text(b.caption, 200), at: new Date(ctx.now()).toISOString(), status: 'shown', by: staffOk(req) ? 'staff' : 'artist' };
        wallOf(params.date, params.slug).push(w);
        await save();
        send(res, 201, { ok: true, item: w });
      });
      // show, hide or remove a post: the act or staff
      r.post('/api/showcases/:date/act/:slug/wall/:id', async (req, res, { params }) => {
        const b = await readJson(req, 1024);
        if (!artistOk(params.date, params.slug, req) && !staffOk(req)) throw fail(403, 'This link isn’t valid any more. Ask TAM for a new one.');
        const w = wallOf(params.date, params.slug).find((x) => x.id === params.id);
        if (!w) throw fail(404, 'That post isn’t on the wall.');
        if (!['shown', 'hidden', 'removed'].includes(b.status)) throw fail(400, 'Show, hide or remove.');
        w.status = b.status;
        await save();
        send(res, 200, { ok: true });
      });
      // ----- artists sign in with their email (Vivian adds it in the editor); a one-time link by email -----
      // Always answers the same, so it never says whose email is on a line-up.
      r.post('/api/showcases/artist/link', async (req, res) => {
        if (artistLinkLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
        const b = await readJson(req, 1024);
        const mail = cleanEmail(b.email);
        if (!mail) throw fail(400, 'Type the email TAM has for you.');
        const t = Date.now();
        db.showcaseArtistLinks = db.showcaseArtistLinks.filter((l) => Date.parse(l.expires) > t && !l.usedAt);
        const mine = actsFor(mail);
        if (mine.length) {
          const tok = crypto.randomBytes(24).toString('base64url');
          db.showcaseArtistLinks.push({ hash: hash(`l:${tok}`), email: mail, expires: new Date(ctx.now() + LINK_MINUTES * 60000).toISOString() });
          await save();
          const url = `${ctx.base(req)}/sunday-showcases/artist/sign-in?t=${tok}`;
          const name = mine[0].name.replace(/[<>&]/g, '');
          if (!ctx.mail.enabled()) console.warn(`Artist sign-in link for ${mail} (email is off): ${url}`);
          else {
            try {
              await ctx.mail.send({ to: mail, subject: 'Your TAM artist page: sign in',
                html: `<p>Hi ${name},</p><p>Sign in to your Sunday Showcase page to add your YouTube and Instagram posts to your wall, and see what fans are saying.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#d4ff3c;color:#111;border-radius:999px;text-decoration:none;font-weight:700">Sign in to your artist page</a></p><p style="color:#8a7f86;font-size:13px">The link works once, for ${LINK_MINUTES} minutes. If you didn’t ask for it, ignore this email.</p>`,
                text: `Hi ${name},\n\nSign in to your Sunday Showcase page: ${url}\n\nThe link works once, for ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.` });
            } catch (e) { console.warn(`Artist sign-in email: ${e.message}`); throw fail(502, 'The email didn’t send. Try again in a minute.'); }
          }
        }
        send(res, 200, { ok: true });
      });
      r.post('/api/showcases/artist/link/use', async (req, res) => {
        const b = await readJson(req, 1024);
        const l = db.showcaseArtistLinks.find((x) => x.hash === hash(`l:${String(b.t || '')}`));
        if (!l || l.usedAt || Date.parse(l.expires) <= ctx.now()) throw fail(400, 'This link has expired or was already used. Ask for a new one.');
        l.usedAt = new Date(ctx.now()).toISOString();
        const sess = crypto.randomBytes(24).toString('base64url');
        db.showcaseArtistSessions = db.showcaseArtistSessions.filter((x) => Date.parse(x.expires) > ctx.now());
        db.showcaseArtistSessions.push({ hash: hash(`s:${sess}`), email: l.email, expires: new Date(ctx.now() + SESSION_DAYS * 86400000).toISOString() });
        await save();
        const secure = /^https:/.test(ctx.cfg.siteUrl) ? '; Secure' : '';
        send(res, 200, { ok: true, acts: actsFor(l.email) }, { 'Set-Cookie': `${ARTIST_COOKIE}=${sess}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}` });
      });
      r.get('/api/showcases/artist/me', (req, res) => {
        const mail = artistEmail(req);
        if (!mail) throw fail(401, 'Sign in first.');
        send(res, 200, { acts: actsFor(mail) });
      });
      r.post('/api/showcases/artist/signout', async (req, res) => {
        const c = artistCookie(req);
        if (c) { db.showcaseArtistSessions = db.showcaseArtistSessions.filter((x) => x.hash !== hash(`s:${c}`)); await save(); }
        send(res, 200, { ok: true }, { 'Set-Cookie': `${ARTIST_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
      });

      // ----- the Showcase Crew: the community around the showcases (showcase.tam.tv) -----
      // Fans and musicians who want to hear about showcases: name, email, which they are, and their consent.
      r.post('/api/showcases/crew', async (req, res) => {
        if (crewLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
        const b = await readJson(req, 2048);
        const mail = cleanEmail(b.email), name = text(b.name, 60);
        if (!name || !mail) throw fail(400, 'Add your name and email.');
        if (b.consent !== true) throw fail(400, 'Tick the box so we can email you.');
        const role = ['fan', 'musician'].includes(b.role) ? b.role : 'fan';
        const have = db.showcaseCrew.find((x) => x.email === mail);
        if (have) Object.assign(have, { name, role, at: have.at });
        else db.showcaseCrew.push({ name, email: mail, role, at: new Date(ctx.now()).toISOString(), consent: 'Yes, email me about TAM’s Sunday Showcases.' });
        await save();
        send(res, 201, { ok: true, count: db.showcaseCrew.length });
      });
      // staff: the crew list, for emailing
      r.get('/api/showcases/crew.csv', (req, res) => {
        ctx.team.guard(req, 'ops');
        const q = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        const rows = [['Name', 'Email', 'Fan or musician', 'Joined', 'Consent'], ...db.showcaseCrew.map((x) => [x.name, x.email, x.role, x.at, x.consent])];
        send(res, 200, rows.map((r) => r.map(q).join(',')).join('\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="showcase-crew.csv"' });
      });

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
          showcases: upcoming(today).map((d) => { const l = lineup(d), sv = db.showcases[d] || {};
            return { ...l, saved: sv, acts: l.acts.map((a) => (a.tba ? a : { ...a, email: ((sv.acts || []).find((x) => x && x.name === a.name) || {}).email || '' })) }; }),
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
          // the act's email: private (never on the site), for signing in to their artist page
          ...(cleanEmail(a && a.email) ? { email: cleanEmail(a.email) } : {}),
          // a song for their page: a YouTube video played through Tamalume, the page pulsing to it
          ...(songOf(a && a.song) ? { song: songOf(a.song) } : {}),
          ...(a && /^[a-z0-9-]{1,60}$/.test(a.slug || '') ? { slug: a.slug } : {}),
          // press: up to four pieces about them, each a headline, where it ran, a link, and a line in our words
          press: (Array.isArray(a && a.press) ? a.press : []).slice(0, 4).map((p) => ({
            title: text(p && p.title, 160), source: text(p && p.source, 80), url: cleanLink(p && p.url), note: text(p && p.note, 300),
          })).filter((p) => p.title && /^https:\/\//.test(p.url)),
          from: [...new Set((Array.isArray(a && a.from) ? a.from : String((a && a.from) || '').split(/[\s,]+/)).map((c) => String(c).toUpperCase()).filter((c) => PLACES[c]))].slice(0, 3),
        })) : cur.acts || [];
        // an act saved without an email field (e.g. from the public line-up) keeps the one it had
        if ('acts' in b) acts.forEach((a, i) => { const src = b.acts[i] || {}; if (!('email' in src) && !a.email) { const was = (cur.acts || []).find((x) => x && x.email && ((a.slug && x.slug === a.slug) || x.name === a.name)); if (was) a.email = was.email; } });
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
