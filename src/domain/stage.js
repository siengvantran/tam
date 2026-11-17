// The TAM Stage: TAM's A&R, as a game everyone can play.
//
// Every request to play at TAM (the Sunday Showcase call-out, the musician
// enquiry form, Ask TAM, or the application at /stage/apply, where they
// choose Open Mic, Junior & Youth Open Mic, Sunday Showcase, Friday Night Live, Festivals or propose a
// show, and tell us about their crowd and their story) becomes an artist with their own
// microverse: a page they build and vet themselves against a checklist,
// that staff approve before it goes public. The microverse shows the path to
// a festival spot as six planets: Signal → Orbit → Open Night → Showcase →
// Headline → Festival, with the goals for the next one.
//
// Applying through the form gives them a basic page straight away. Adults'
// pages can be shared at once (not listed on /stage until TAM reviews them),
// so fans can pledge to see them live: a pledge is someone saying they'll buy
// a ticket. Pledges count five times a boost on the path, and the artist and
// their fans can make a poster or a card to share it.
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
import { postOf, POST_HELP, saveVideo, saveImage as savePhoto, dropUpload } from '../lib/media-posts.js';

export const STAGES = [
  { id: 'signal', name: 'Signal', planet: 'Your first signal', blurb: 'You’ve asked to play. Build your page and send it for review.' },
  { id: 'orbit', name: 'Orbit', planet: 'In orbit', blurb: 'Your page is live. Fans can find you and boost you.' },
  { id: 'open', name: 'Open Night', planet: 'Open Night', blurb: 'Play one of TAM’s open nights: the open mic, Singers Club, the Blues Jam or JOM.' },
  { id: 'showcase', name: 'Showcase', planet: 'Sunday Showcase', blurb: 'A full set at the Sunday Showcase × TAM.' },
  { id: 'headline', name: 'Headline', planet: 'Your own TAM night', blurb: 'Your own night, or a main support, at TAM.' },
  { id: 'festival', name: 'Festival', planet: 'A festival stage', blurb: 'A spot at a TAM festival, like The Best Christmas Ever.' },
];
// What an act can apply for (one or more).
export const PATHWAYS = {
  openmic: { name: 'Open Mic', blurb: 'A few songs at TAM Open Mic, The Original Singers Club or the Blues Jam: the quickest way onto a TAM stage.' },
  jom: { name: 'Junior & Youth Open Mic', blurb: 'JOM with JOM Youth Music: a stage for young musicians under 18. A parent or guardian applies with them.' },
  showcase: { name: 'Sunday Showcase', blurb: 'A full set at the Sunday Showcase × TAM, to a listening crowd.' },
  friday: { name: 'Friday Night Live', blurb: 'A Friday night slot with Friday Night Live.' },
  festival: { name: 'Festivals', blurb: 'A spot at a TAM festival, like The Best Christmas Ever.' },
  show: { name: 'Propose a show', blurb: 'Your own night at TAM: your idea and your crowd, our stage.' },
};
export const PLEDGE_WEIGHT = 5; // a pledged fan counts as five boosts on the path
export const RATINGS = { music: 'Musicianship', presence: 'Stage presence', original: 'Originality', draw: 'Brings a crowd', ready: 'Ready and reliable' };
const DAY = 86400000;
const COOKIE = 'tam_stage';

// What it takes to reach each stage (shown to the artist and to staff). Staff still decide.
function goals(a, s) {
  const r = s.rating;
  const g = {
    orbit: [['Your page is complete', s.page >= 1], ['TAM has reviewed it', a.status === 'live']],
    open: [['Booked or played a TAM open night', Boolean(a.played && a.played.open)], [sup(25), s.support >= 25, s.support / 25]],
    showcase: [['Played a TAM open night', Boolean(a.played && a.played.open)], [sup(100), s.support >= 100, s.support / 100], ['A&R rating 3.5 or more', r.avg >= 3.5, r.avg / 3.5]],
    headline: [['Played a Sunday Showcase', Boolean(a.played && a.played.showcase)], [sup(300), s.support >= 300, s.support / 300], ['A&R rating 4 or more', r.avg >= 4, r.avg / 4], ['Brings a crowd: 3.5 or more', (r.by.draw || 0) >= 3.5, (r.by.draw || 0) / 3.5]],
    festival: [['Headlined or supported at TAM', Boolean(a.played && a.played.headline)], [sup(600), s.support >= 600, s.support / 600], ['A&R rating 4.2 or more', r.avg >= 4.2, r.avg / 4.2], ['Ready and reliable: 4 or more', (r.by.ready || 0) >= 4, (r.by.ready || 0) / 4]],
  };
  return g[STAGES[a.stage + 1] ? STAGES[a.stage + 1].id : ''] || [];
}

const sup = (n) => `${n} support: a pledged fan is ${PLEDGE_WEIGHT}, a boost is 1`;
const num = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? Math.min(n, 100000000) : null; };
const slugOf = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'artist';
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const ytId = (u) => (/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(String(u || '')) || [])[1] || '';
const cleanLinks = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map((x) => String(x).trim()).filter((x) => /^https:\/\/[^\s<>"]+$/.test(x)).slice(0, 8);

export function stageDomain(ctx) {
  const { db, save, cfg } = ctx;
  for (const k of ['arArtists', 'arBoosts', 'arLinks', 'arSessions', 'arPledges']) if (!Array.isArray(db[k])) db[k] = [];
  const iso = (t = ctx.now()) => new Date(t).toISOString();
  const today = () => londonToday(new Date(ctx.now()));
  const site = () => cfg.siteUrl;
  const linkLimited = rateLimiter({ max: 8 });
  const boostLimited = rateLimiter({ max: 40 });
  const pledgeLimited = rateLimiter({ max: 20 });
  // public: live, or an adult's new page they can share while TAM reviews it (not listed on /stage)
  const isPublic = (a) => Boolean(a) && (a.status === 'live' || (a.shareable && ['draft', 'review'].includes(a.status)));

  const bySlug = (slug) => db.arArtists.find((a) => a.slug === slug);
  const byEmail = (mail) => db.arArtists.find((a) => a.email === mail && !a.jom); // a JOM act's profile belongs to its JOM page, not to an email
  const RESERVED = new Set(['apply', 'in', 'me', 'manage']);
  const uniqueSlug = (name) => { const b = RESERVED.has(slugOf(name)) ? `${slugOf(name)}-act` : slugOf(name); let s = b, i = 2; while (bySlug(s)) s = `${b}-${i++}`; return s; };

  // ---------- signals and the score ----------
  function stats(a) {
    const boosts = db.arBoosts.filter((b) => b.a === a.id);
    const pl = db.arPledges.filter((p) => p.a === a.id);
    const pledged = pl.reduce((t, p) => t + p.n, 0);
    const recent = boosts.filter((b) => Date.parse(b.at) > ctx.now() - 14 * DAY).length;
    const before = boosts.filter((b) => Date.parse(b.at) <= ctx.now() - 14 * DAY && Date.parse(b.at) > ctx.now() - 28 * DAY).length;
    const raters = Object.values(a.ratings || {});
    const by = {};
    for (const k of Object.keys(RATINGS)) { const v = raters.map((x) => x[k]).filter(Number.isFinite); by[k] = v.length ? v.reduce((t, x) => t + x, 0) / v.length : 0; }
    const filled = Object.values(by).filter(Boolean);
    const avg = filled.length ? filled.reduce((t, x) => t + x, 0) / filled.length : 0;
    const checks = pageChecks(a);
    const page = checks.filter((c) => c.done).length / checks.length;
    return { boosts: boosts.length, pledged, pledgers: pl.length, support: boosts.length + pledged * PLEDGE_WEIGHT, recent, momentum: recent - before, views: Object.values(a.views || {}).reduce((t, x) => t + x, 0), shares: a.shares || 0,
      rating: { avg: Math.round(avg * 10) / 10, by, raters: raters.length }, page };
  }
  // 0–100: what the A&R board sorts by. Ratings count most; fans next; then momentum and the page.
  function score(a, s = stats(a)) {
    const live = db.arArtists.filter((x) => x.status === 'live');
    const most = Math.max(25, ...live.map((x) => db.arBoosts.filter((b) => b.a === x.id).length + db.arPledges.filter((p) => p.a === x.id).reduce((t, p) => t + p.n, 0) * PLEDGE_WEIGHT));
    const fan = Math.min(1, s.support / most);
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
  // Speed-ups on the path: things they can do now, beyond the checklist.
  function boosters(a, s) {
    return [
      { id: 'posts', label: 'Add 3 posts: clips, photos, your socials', done: (a.posts || []).length >= 3, xp: 30 },
      { id: 'poster', label: 'Make your poster or card and share it', done: (a.posters || 0) + (a.shares || 0) > 0, xp: 20 },
      { id: 'pledge5', label: 'Your first 5 pledged fans', done: s.pledged >= 5, xp: 50, part: s.pledged / 5 },
      { id: 'pledge25', label: '25 pledged fans: that’s a crowd', done: s.pledged >= 25, xp: 100, part: s.pledged / 25 },
      { id: 'pledge60', label: '60 pledged fans: a headline crowd', done: s.pledged >= 60, xp: 200, part: s.pledged / 60 },
    ].map((b) => ({ ...b, part: b.done ? 1 : Math.max(0, Math.min(0.99, b.part || 0)) }));
  }
  function xpOf(a, s) {
    const page = pageChecks(a).filter((c) => c.done).reduce((t, c) => t + c.xp, 0);
    const more = boosters(a, s).filter((b) => b.done).reduce((t, b) => t + b.xp, 0);
    return page + more + s.boosts * 2 + s.pledged * 10 + Math.min(100, Math.floor(s.views / 5)) + a.stage * 100 + Math.round(s.rating.avg * 20);
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
      stage: a.stage, stageName: STAGES[a.stage].name, boosts: s.boosts, pledged: s.pledged, support: s.support, xp: xpOf(a, s), live: a.status === 'live',
      paths: (a.paths || []).filter((k) => PATHWAYS[k]).map((k) => PATHWAYS[k].name),
      goals: goals(a, s).map(([label, done, part]) => ({ label, done, part: done ? 1 : Math.max(0, Math.min(0.99, part || 0)) })),
      backers: backers(a), href: `/stage/${a.slug}`, posts: (a.posts || []).slice().reverse(),
      jom: a.jom ? { slug: a.jomSlug, group: a.plays } : null,
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
    return { ...publicView(a), name: a.name, email: a.email, status: a.status, ownWork: Boolean(a.ownWork), checks: pageChecks(a), boosters: boosters(a, s), shareable: isPublic(a),
      canSubmit: a.status === 'draft' && pageChecks(a).every((c) => c.done), views: s.views, shares: s.shares, vibes: VIBES,
      messages: (a.decisions || []).filter((d) => d.message).map((d) => ({ at: d.at, message: d.message })).reverse(), shareUrl: `${site()}/stage/${a.slug}` };
  }
  function staffView(a) {
    const s = stats(a);
    return { ...ownerView(a), id: a.id, source: a.source, createdAt: a.createdAt, submittedAt: a.submittedAt, score: score(a, s), stats: s,
      suggest: suggest(a, s), ratings: a.ratings || {}, notes: a.notes || [], decisions: a.decisions || [], played: a.played || {}, circuit: a.circuit || '',
      applications: a.applications || [], age: a.age || '', invitedAt: a.invitedAt || '', enquiry: a.enquiry || '' };
  }

  // ---------- applying (from any play request) ----------
  // The application form's answers: what they want to play, whether they can
  // sell tickets, and the story that will travel on social media.
  function applicationOf(input) {
    const paths = (Array.isArray(input.paths) ? input.paths : []).filter((k) => PATHWAYS[k]);
    const d = input.draw || {}, st = input.story || {}, sh = input.show || {};
    const app = {
      at: iso(), paths,
      draw: { instagram: num(d.instagram), tiktok: num(d.tiktok), spotify: num(d.spotify), youtube: num(d.youtube), mailing: num(d.mailing), bring: num(d.bring),
        lastGig: text(d.lastGig, 200), biggest: text(d.biggest, 200), sold: ['yes', 'some', 'no'].includes(d.sold) ? d.sold : '' },
      story: { hook: text(st.hook, 200), now: text(st.now, 400), filmed: st.filmed === true },
      show: paths.includes('show') ? { title: text(sh.title, 100), idea: text(sh.idea, 1200), when: text(sh.when, 120), crowd: num(sh.crowd), price: text(sh.price, 40) } : null,
    };
    if (paths.includes('show') && !app.show.idea) throw fail(400, 'Tell us your idea for the show.');
    return app;
  }

  async function apply(input, source) {
    const mail = cleanEmail(input.email);
    if (!mail) throw fail(400, 'Add a valid email address.');
    const form = source === 'stage' && Array.isArray(input.paths);
    if (form && !input.paths.some((k) => PATHWAYS[k])) throw fail(400, 'Choose what you’d like to play.');
    if (form && !['18+', 'under18'].includes(input.age)) throw fail(400, 'Tell us if you’re 18 or over.');
    const application = form ? applicationOf(input) : null;
    let a = byEmail(mail);
    const created = !a;
    if (a && application) {
      // applying again (for another stage, say) adds to their application; it never changes their page
      a.applications = (a.applications || []).concat(application).slice(-10);
      a.paths = [...new Set([...(a.paths || []), ...application.paths])];
      a.updatedAt = iso();
    }
    if (!a) {
      const act = text(input.act || input.company, 80) || text(input.name, 80);
      if (!act) throw fail(400, 'Add your name or your act’s name.');
      a = {
        id: newId('AR', 6), slug: uniqueSlug(act), email: mail, name: text(input.name, 80), act, plays: text(input.plays || input.style, 120),
        from: '', bio: '', links: cleanLinks(input.links), youtube: ytId(input.youtube || (cleanLinks(input.links).find((l) => ytId(l)) || '')), photo: '', vibe: '',
        circuit: text(input.circuit, 120), message: text(input.message, 1200), status: 'draft', stage: 0, source: text(source, 40) || 'tam.tv',
        createdAt: iso(), updatedAt: iso(), views: {}, shares: 0, ratings: {}, notes: [], decisions: [], played: {},
      };
      if (application) {
        // the basic page, from the form: theirs to build on. An adult's can be shared at once.
        Object.assign(a, { from: text(input.from, 80), bio: text(input.about, 1500), applications: [application], paths: application.paths, age: input.age, shareable: input.age === '18+' });
      }
      db.arArtists.push(a);
    }
    await save();
    await mailLink(a, created && application).catch((err) => console.warn(`Stage link ${a.id}: ${err.message}`));
    return { a, created };
  }

  async function mailLink(a, fresh) {
    const t = token();
    db.arLinks = db.arLinks.filter((l) => Date.parse(l.expires) > ctx.now() && !l.usedAt);
    db.arLinks.push({ hash: hash(t), a: a.id, expires: iso(ctx.now() + 3 * DAY) });
    await save();
    if (!ctx.mail.enabled()) return;
    const url = `${site()}/stage/in?t=${t}`;
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">Your TAM Stage page${a.act ? `: ${e(a.act)}` : ''}</h1>
      <p>Thanks for asking to play at TAM. Every act gets its own page on the TAM Stage: your <b>microverse</b>. It shows your music to TAM’s crowd and your path to a festival spot, planet by planet: Signal, Orbit, Open Night, Showcase, Headline, Festival.</p>
      ${fresh && a.shareable ? `<p>Your basic page is up already: <a href="${e(site())}/stage/${e(a.slug)}">${e(site())}/stage/${e(a.slug)}</a>. Share it, and make a poster for it, so friends, fans and family can <b>pledge to see you live</b>. Every pledge moves you along the path five times as fast as a boost.</p>` : ''}
      <p>Tap below to build it: add a photo, your story, your links and a live video, tick the checklist, and send it to us to review. The more you add, and the more pledges you get, the faster you move.</p>
      ${clubButton('Build my page', url)}<p style="font-size:13px;color:#8a7f86">The link works once, for 3 days. Ask for a new one any time at ${e(site())}/stage/apply.</p>`;
    await ctx.mail.send({ to: a.email, subject: 'Your TAM Stage page: build your microverse', html: clubShell(inner, { preheader: 'Your path to a festival spot at TAM starts here.' }), text: `Build your TAM Stage page: ${url}` });
  }
  // TAM made this page from the artist's enquiry: send them their page and a link to update it.
  async function mailInvite(a) {
    const t = token();
    db.arLinks = db.arLinks.filter((l) => Date.parse(l.expires) > ctx.now() && !l.usedAt);
    db.arLinks.push({ hash: hash(t), a: a.id, expires: iso(ctx.now() + 14 * DAY) });
    a.invitedAt = iso();
    await save();
    if (!ctx.mail.enabled()) return;
    const url = `${site()}/stage/in?t=${t}`, page = `${site()}/stage/${a.slug}`;
    const young = a.age === 'under18';
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">Your TAM artist page${a.act ? `: ${e(a.act)}` : ''}</h1>
      <p>Thank you for getting in touch about playing at TAM. We’ve made you an artist page on the <b>TAM Stage</b> from what you sent us. It’s yours to update and share.</p>
      ${young ? `<p>Because the performer is under 18, the page stays private until TAM has checked it, and a parent or guardian looks after it. The <b>Junior &amp; Youth Open Mic</b> (with JOM Youth Music) is the usual first stage for young performers at TAM.</p>`
    : `<p><b>Share it</b> with fans, friends, family and the TAM community so they can <b>pledge to see you live</b>. A pledge tells us people will come, and you can make a poster or story card for it in one tap. (First, tick the box on your page to confirm everyone in the act is 18 or over: then the page can be shared.)</p>`}
      <p><b>Update it</b> any time: add a photo, your story, links, a live video and your Instagram, TikTok or YouTube posts. The more you add, and the more pledges you get, the better we can plan your show.</p>
      ${clubButton('Open my page', url)}
      <p>TAM’s team will use everything you share, and your pledges, to find the best show format at TAM for you: an open night, the Sunday Showcase, Friday Night Live, your own night or a festival spot.</p>
      ${young ? '' : `<p style="font-size:14px">Your page: <a href="${e(page)}">${e(page)}</a></p>`}
      <p style="font-size:13px;color:#8a7f86">The button works once, for 14 days. Ask for a new link any time at ${e(site())}/stage/apply (use this email).</p>`;
    await ctx.mail.send({ to: a.email, subject: `Your TAM artist page${a.act ? `: ${a.act}` : ''}`, html: clubShell(inner, { preheader: 'Your page on the TAM Stage: update it, share it, and gather pledges to see you live.' }), text: `Your TAM artist page: ${url}${young ? '' : `\nShare: ${page}`}` });
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
  async function startSession(res, a) {
    const t = token();
    db.arSessions = db.arSessions.filter((s) => Date.parse(s.expires) > ctx.now()).concat({ hash: hash(t), a: a.id, expires: iso(ctx.now() + 60 * DAY) });
    res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}${secure()}`);
    await save();
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
      const { a, created } = await apply(b, 'stage');
      // a brand-new applicant goes straight to their basic page on this device; anyone else gets the emailed link
      if (created) { await startSession(res, a); return send(res, 201, { ok: true, next: '/stage/me?welcome=1' }); }
      send(res, 201, { ok: true });
    });
    r.post('/api/stage/in', async (req, res) => {
      const b = await readJson(req, 1024);
      const l = db.arLinks.find((x) => x.hash === hash(String(b.t || '')) && !x.usedAt && Date.parse(x.expires) > ctx.now());
      const a = l && db.arArtists.find((x) => x.id === l.a);
      if (!a) throw fail(400, 'That link has expired or was already used. Ask for a new one on the apply page.');
      l.usedAt = iso();
      await startSession(res, a);
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
    // their posts: Instagram, TikTok, Facebook or YouTube links, and their own photos and videos
    const addPost = async (a, p, caption) => {
      if ((a.posts || []).length >= 24) throw fail(400, 'Your page has 24 posts: remove one to add another.');
      a.posts = (a.posts || []).concat({ id: newId('P', 6), ...p, caption: text(caption, 200), at: iso() });
      a.updatedAt = iso();
      await save();
    };
    r.post('/api/stage/me/post', async (req, res) => {
      const a = mine(req);
      const b = await readJson(req, 4096);
      const p = postOf(b.url);
      if (!p) throw fail(400, POST_HELP);
      await addPost(a, p, b.caption);
      send(res, 201, { artist: ownerView(a) });
    });
    r.post('/api/stage/me/post-photo', async (req, res) => {
      const a = mine(req);
      const b = await readJson(req, 1300 * 1024);
      await addPost(a, { kind: 'image', src: await savePhoto(ctx, b.image, `stage-${a.id}`) }, b.caption);
      send(res, 201, { artist: ownerView(a) });
    });
    r.post('/api/stage/me/post-video', async (req, res, { url }) => {
      const a = mine(req);
      await addPost(a, { kind: 'video', src: await saveVideo(ctx, req, `stage-${a.id}`) }, url.searchParams.get('caption'));
      send(res, 201, { artist: ownerView(a) });
    });
    r.post('/api/stage/me/post/:id/remove', async (req, res, { params }) => {
      const a = mine(req);
      const p = (a.posts || []).find((x) => x.id === params.id);
      if (!p) throw fail(404, 'That post isn’t on your page.');
      if (p.src) await dropUpload(ctx, p.src);
      a.posts = a.posts.filter((x) => x !== p);
      await save();
      send(res, 200, { artist: ownerView(a) });
    });
    r.post('/api/stage/me/adults', async (req, res) => {
      const a = mine(req);
      const b = await readJson(req, 512);
      if (b.confirm !== true) throw fail(400, 'Tick the box to confirm everyone in the act is 18 or over.');
      if (a.age === 'under18') throw fail(409, 'Pages for under-18s are checked by TAM before they can be shared.');
      Object.assign(a, { age: '18+', shareable: true, updatedAt: iso() });
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
      if (!isPublic(a)) throw fail(404, 'No such act.');
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
      const b = await readJson(req, 256).catch(() => ({}));
      if (isPublic(a)) { if (b.poster) a.posters = (a.posters || 0) + 1; else a.shares = (a.shares || 0) + 1; save(); }
      send(res, 200, { ok: true });
    });
    // a pledge: "I'll come and see them live". The email stays with TAM, to tell them when the act plays.
    r.post('/api/stage/:slug/pledge', async (req, res, { params }) => {
      const a = bySlug(params.slug);
      if (!isPublic(a)) throw fail(404, 'No such act.');
      if (pledgeLimited(req)) throw fail(429, 'That’s a lot of pledges. Try again later.');
      const b = await readJson(req, 2048);
      const mail = cleanEmail(b.email);
      if (!mail) throw fail(400, 'Add your email, so we can tell you when they play.');
      if (b.consent !== true) throw fail(400, 'Tick the box so we can email you when they play at TAM.');
      if (mail === a.email) throw fail(400, 'That’s the act’s own email: share your page so fans can pledge.');
      const n = Math.max(1, Math.min(10, parseInt(b.n, 10) || 1));
      const was = db.arPledges.find((p) => p.a === a.id && p.email === mail);
      if (was) Object.assign(was, { n, name: text(b.name, 40) || was.name, at: iso() });
      else db.arPledges.push({ id: newId('PL', 6), a: a.id, email: mail, name: text(b.name, 40), n, at: iso() });
      a.updatedAt = iso();
      await save();
      send(res, 200, { pledged: stats(a).pledged, updated: Boolean(was) });
    });

    // ----- A&R: staff -----
    const guard = (req) => ctx.team.guard(req, 'ops');
    r.get('/api/stage/manage', (req, res) => {
      const who = guard(req);
      const list = db.arArtists.map(staffView).sort((x, y) => (y.status === 'review') - (x.status === 'review') || y.score - x.score);
      send(res, 200, { me: { name: who.name }, artists: list, stages: STAGES, ratings: RATINGS, vibes: VIBES, pathways: PATHWAYS,
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
          tell(a, 'Your TAM Stage page: a few changes', 'Nearly there', `<p>${e(b.message || 'We’d love a few changes before your page goes live.')}</p>`, ['Edit my page', a.jom ? `${site()}/jom/me` : `${site()}/stage/apply`]);
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
    // who pledged for an act: to tell them when it's on sale
    r.get('/api/stage/manage/:id/pledges.csv', (req, res, { params }) => {
      guard(req);
      const a = db.arArtists.find((x) => x.id === params.id);
      if (!a) throw fail(404, 'No such artist.');
      const rows = [['Name', 'Email', 'People', 'Pledged'], ...db.arPledges.filter((p) => p.a === a.id).map((p) => [p.name, p.email, p.n, p.at.slice(0, 10)])];
      send(res, 200, rows.map((r0) => r0.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="pledges-${a.slug}.csv"` });
    });
    // Staff: a page from a play enquiry (fills only what's empty, so the artist's own edits stay), then invite them.
    r.post('/api/stage/invite', async (req, res) => {
      const who = guard(req);
      const b = await readJson(req, 16 * 1024);
      const mail = cleanEmail(b.email);
      if (!mail) throw fail(400, 'Add the artist’s email.');
      let a = byEmail(mail);
      if (!a) {
        const act = text(b.act, 80) || text(b.name, 80);
        if (!act) throw fail(400, 'Add the act’s name.');
        a = { id: newId('AR', 6), slug: uniqueSlug(act), email: mail, name: text(b.name, 80), act, plays: '', from: '', bio: '', links: [], youtube: '', photo: '', vibe: '',
          status: 'draft', stage: 0, source: text(b.source, 40) || 'Play at TAM enquiry', createdAt: iso(), updatedAt: iso(), views: {}, shares: 0, ratings: {}, notes: [], decisions: [], played: {} };
        db.arArtists.push(a);
      }
      const fill = (k, v) => { if (v && !a[k]) a[k] = v; };
      if (b.act && (a.act === a.name || !a.act)) a.act = text(b.act, 80) || a.act;
      fill('name', text(b.name, 80));
      fill('plays', text(b.plays, 120));
      fill('from', text(b.from, 80));
      fill('bio', text(b.bio, 1500));
      if (!(a.links || []).length) a.links = cleanLinks(b.links);
      fill('youtube', ytId(b.youtube));
      a.paths = [...new Set([...(a.paths || []), ...(Array.isArray(b.paths) ? b.paths : []).filter((k) => PATHWAYS[k])])];
      if (['18+', 'under18'].includes(b.age)) a.age = b.age;
      if (a.age === 'under18') a.shareable = false;
      if (b.enquiry) a.enquiry = text(b.enquiry, 20);
      if (b.note) a.notes = (a.notes || []).concat({ at: iso(), by: who.name, text: text(b.note, 1000) });
      a.decisions = (a.decisions || []).concat({ at: iso(), by: who.name, action: 'invite', message: '' });
      a.updatedAt = iso();
      await save();
      if (b.send !== false) await mailInvite(a).catch((err) => console.warn(`Stage invite ${a.id}: ${err.message}`));
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

  // ---------- JOM acts: a TAM artist profile, if their parent or guardian opts in ----------
  // The profile shows only what TAM has already approved on the act's JOM page,
  // and follows it: an approved JOM update updates the profile. It starts at
  // the Open Night planet (they've played a TAM session) and waits for TAM to
  // review it before it's public. The parent is the contact; they never sign in
  // here: they keep updating the JOM page.
  const byJom = (slug) => db.arArtists.find((a) => a.jom && a.jomSlug === slug);
  function fromJom(j) {
    const yt = (j.posts || []).find((p) => p.kind === 'youtube');
    return {
      act: j.name, plays: j.groupName || 'JOM Youth Music', bio: j.bio || '', photo: j.photo || '',
      links: (j.links || []).filter((l) => /^https:\/\//.test(l)).slice(0, 8), youtube: yt ? yt.videoId : '', posts: (j.posts || []).slice(0, 24),
    };
  }
  function linkJom(j, email, who) {
    let a = byJom(j.slug);
    const firstNight = (j.sessions || []).map((s) => (ctx.content.nightBy.get(s) || {}).date).filter(Boolean).sort()[0] || today();
    if (!a) {
      a = { id: newId('AR', 6), slug: uniqueSlug(j.name), jom: true, jomSlug: j.slug, email, name: who || '', from: '', vibe: 'pop', ownWork: true,
        status: 'review', stage: 2, source: 'JOM opt-in', createdAt: iso(), submittedAt: iso(), views: {}, shares: 0, ratings: {}, notes: [], played: { open: firstNight },
        decisions: [{ at: iso(), by: who || 'Parent or guardian', action: 'jom-opt-in', from: 0, to: 2, message: '' }] };
      db.arArtists.push(a);
    } else if (a.status === 'paused' && a.optedOut) {
      Object.assign(a, { status: 'review', optedOut: false, submittedAt: iso(), email });
    }
    Object.assign(a, fromJom(j), { updatedAt: iso() });
    save();
    return a;
  }
  function syncJom(j) {
    const a = byJom(j.slug);
    if (!a || a.optedOut) return;
    Object.assign(a, fromJom(j), { updatedAt: iso() });
    save();
  }
  function unlinkJom(slug) {
    const a = byJom(slug);
    if (!a) return;
    Object.assign(a, { status: 'paused', optedOut: true, updatedAt: iso() });
    a.decisions = (a.decisions || []).concat({ at: iso(), by: 'Parent or guardian', action: 'jom-opt-out', message: '' });
    save();
  }
  const jomStatus = (slug) => { const a = byJom(slug); return a && !a.optedOut ? { slug: a.slug, status: a.status, planet: STAGES[a.stage].name, href: `/stage/${a.slug}` } : null; };

  const live = () => db.arArtists.filter((a) => a.status === 'live').map(publicView);
  return { routes, apply, publicView, ownerView, artistOf, bySlug, isPublic, live, viewed, progress, stats, score, suggest, linkJom, syncJom, unlinkJom, jomStatus };
}
