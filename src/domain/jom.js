// JOM Youth Music × TAM: the evergreen JOM hub (jom.tam.tv) and a permanent
// page for every act that plays a JOM session at TAM.
//
// These are young musicians, so:
// - A parent or guardian claims an act's page; TAM checks the claim before
//   anything changes (an approved claim emails them a sign-in link).
// - Every change a parent makes (name as shown, bio, links, photos) waits for
//   TAM to approve it before it shows. Bios can't carry email addresses or
//   phone numbers; links only go to music and video sites.
// - No surnames are required, no ages, schools or locations are asked for,
//   and nothing private (parents' emails) is ever on a page.
// - Anyone can ask TAM to take a page down.
// Fans can pledge to come and see an act at The Best Christmas Ever: a signal
// for TAM's programmers, counted once per browser per act.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, send, readJson, text, email as cleanEmail, newId, rateLimiter } from '../lib/http.js';
import { clubShell, clubButton } from '../services/mailer.js';
import { escape as e } from '../views/html.js';

const COOKIE = 'tam_jom';
const DAY = 86400000;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const MUSIC = /^https:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|bandcamp\.com|instagram\.com|tiktok\.com|music\.apple\.com|facebook\.com)\//i;
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?\d[\s-]?){9,}/;
const slugOf = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ’']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
export const RELATIONS = { parent: 'Parent', guardian: 'Guardian', adult: 'I’m in the act and 18 or over' };

export function jomDomain(ctx) {
  const { db, save, cfg, content: c } = ctx;
  const J = c.jom || { acts: [], groups: {}, sessions: [] };
  for (const k of ['jomClaims', 'jomPending', 'jomLinks', 'jomSessions', 'jomPledges', 'jomExtra', 'jomApplications']) if (!Array.isArray(db[k])) db[k] = [];
  if (!db.jomActs || typeof db.jomActs !== 'object') db.jomActs = {}; // per-act overrides: { name, photos[], bio, links[], claimedBy[], hidden }
  const iso = (t = ctx.now()) => new Date(t).toISOString();
  const site = () => cfg.siteUrl;
  const pledgeLimited = rateLimiter({ max: 30 });
  const claimLimited = rateLimiter({ max: 6 });

  // every act: the line-up in content/jom.json, plus acts staff add later, with any approved changes on top
  function all() {
    const base = J.acts.concat(db.jomExtra);
    return base.map((a) => {
      const o = db.jomActs[a.slug] || {};
      const photos = (o.photos || []).length ? o.photos : a.photo ? [a.photo] : [];
      return { slug: a.slug, name: o.name || a.name, group: a.group, groupName: J.groups[a.group] || '', sessions: [...new Set((a.sessions || []).concat(o.sessions || []))],
        photos, photo: photos[0] || '', bio: o.bio || '', links: o.links || [], claimed: Boolean((o.claimedBy || []).length), hidden: Boolean(o.hidden),
        pledges: db.jomPledges.filter((p) => p.act === a.slug).reduce((t, p) => t + p.n, 0) };
    });
  }
  const act = (slug) => all().find((a) => a.slug === slug);
  const shown = () => all().filter((a) => !a.hidden);
  const sessionOf = (slug) => J.sessions.find((s) => s.slug === slug) || (() => { const n = c.nightBy.get(slug); return n ? { slug, date: n.date, title: n.title } : null; })();

  // the next JOM session on TAM's listings
  function nextSession() {
    const now = iso();
    // a JOM session named in content/jom.json comes first; then any JOM night on the listings
    const named = J.sessions.map((x) => c.nightBy.get(x.slug)).filter((n) => n && n.end > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    return named || c.upcoming(ctx.today()).find((n) => /junior|\bjom\b/i.test(n.title) && n.end > now) || null;
  }
  const festival = () => c.festivalBy.get(J.festival || 'best-christmas-ever') || null;

  // ---------- parents: sessions ----------
  const cookieOf = (req) => (new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '') || [])[1] || '';
  const secure = () => (cfg.siteUrl.startsWith('https:') ? '; Secure' : '');
  function parentOf(req) {
    const k = cookieOf(req);
    const s = k && db.jomSessions.find((x) => x.hash === hash(k) && Date.parse(x.expires) > ctx.now());
    return s ? s.email : '';
  }
  const mine = (email) => all().filter((a) => ((db.jomActs[a.slug] || {}).claimedBy || []).includes(email));
  const needParent = (req) => { const p = parentOf(req); if (!p) throw fail(401, 'Open your JOM page from the link we emailed you.'); return p; };

  async function mailLink(email, why = 'signin') {
    const t = token();
    db.jomLinks = db.jomLinks.filter((l) => Date.parse(l.expires) > ctx.now() && !l.usedAt).concat({ hash: hash(t), email, expires: iso(ctx.now() + 3 * DAY) });
    await save();
    if (!ctx.mail.enabled()) return;
    const url = `${site()}/jom/in?t=${t}`;
    const acts = mine(email).map((a) => a.name).join(', ');
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">${why === 'approved' ? 'You can now update their JOM page' : 'Your JOM page'}</h1>
      <p>${why === 'approved' ? `Thanks for claiming ${e(acts)} on JOM × TAM. ` : ''}Tap below to add photos, a short bio and links to their music. TAM checks each change before it goes on the page.</p>
      ${clubButton('Open their page', url)}<p style="font-size:13px;color:#8a7f86">The link works once, for 3 days. For a new one: ${e(site())}/jom/sign-in</p>`;
    await ctx.mail.send({ to: email, subject: why === 'approved' ? `JOM × TAM: your claim for ${acts} is approved` : 'JOM × TAM: your sign-in link', html: clubShell(inner, { preheader: 'Update their JOM page at TAM.' }), text: `Open their JOM page: ${url}` });
  }
  function tell(email, subject, heading, body) {
    if (!ctx.mail.enabled() || !email) return;
    ctx.mail.send({ to: email, subject, html: clubShell(`<h1 style="font-size:26px;margin:0 0 10px">${e(heading)}</h1>${body}`), text: `${heading}\n\n${body.replace(/<[^>]+>/g, '')}` }).catch((err) => console.warn(`JOM email: ${err.message}`));
  }

  async function dropFile(url) {
    if (!url || !url.startsWith('/uploads/') || !ctx.uploadsDir) return;
    await fs.unlink(path.join(ctx.uploadsDir, path.basename(url))).catch(() => {});
  }

  const pendingFor = (slug) => db.jomPending.find((p) => p.act === slug && p.status === 'pending');

  function routes(r) {
    // ----- fans: pledge to see them at The Best Christmas Ever -----
    r.post('/api/jom/:slug/pledge', async (req, res, { params }) => {
      const a = act(params.slug);
      if (!a || a.hidden) throw fail(404, 'No such act.');
      if (pledgeLimited(req)) throw fail(429, 'That’s a lot of pledges. Try again later.');
      const b = await readJson(req, 1024);
      const id = text(b.id, 80);
      if (id.length < 16) throw fail(400, 'Missing browser id.');
      const n = Math.max(1, Math.min(8, parseInt(b.n, 10) || 1));
      const who = hash(`${id}|${a.slug}`);
      const was = db.jomPledges.find((p) => p.act === a.slug && p.who === who);
      if (was) was.n = n; else db.jomPledges.push({ act: a.slug, who, n, at: iso() });
      await save();
      send(res, 200, { pledges: act(a.slug).pledges, updated: Boolean(was) });
    });
    // anyone can ask TAM to take a page down, or raise a concern (it lands in /admin as an enquiry)
    r.post('/api/jom/:slug/concern', async (req, res, { params }) => {
      const a = act(params.slug);
      if (!a) throw fail(404, 'No such act.');
      if (claimLimited(req)) throw fail(429, 'Try again in a few minutes.');
      const b = await readJson(req, 4096);
      const msg = text(b.message, 1500);
      if (!msg) throw fail(400, 'Tell us what’s wrong.');
      db.enquiries.push({ id: newId('ENQ'), createdAt: iso(), source: 'jom', kind: 'other', name: text(b.name, 80) || 'JOM page concern', email: cleanEmail(b.email) || '', phone: '', date: '', guests: '', budget: '', company: '', message: `JOM page concern about ${a.name} (${site()}/jom/${a.slug}): ${msg}`, pathway: 'jom', status: 'new' });
      await save();
      send(res, 201, { ok: true });
    });

    // ----- applications to play The Best Christmas Ever (a parent or guardian applies for under-18s) -----
    r.post('/api/jom/apply-christmas', async (req, res) => {
      if (claimLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 8 * 1024);
      const mail = cleanEmail(b.email);
      const actName = text(b.act, 80);
      if (!actName) throw fail(400, 'Add the act’s name.');
      if (!text(b.name, 80)) throw fail(400, 'Add your name.');
      if (!mail) throw fail(400, 'Add a valid email address.');
      if (!RELATIONS[b.relation]) throw fail(400, 'Tell us how you’re connected to the act.');
      if (!['junior', 'youth'].includes(b.group)) throw fail(400, 'Pick Junior (4 to 15) or Youth (12 to 18).');
      if (b.consent !== true) throw fail(400, 'Tick the box to confirm.');
      const links = (Array.isArray(b.links) ? b.links : String(b.links || '').split(/[\n,\s]+/)).map((x) => String(x).trim()).filter(Boolean);
      const bad = links.find((l) => !MUSIC.test(l));
      if (bad) throw fail(400, `Links can go to YouTube, Spotify, SoundCloud, Bandcamp, Apple Music, Instagram, TikTok or Facebook. This one can’t: ${bad.slice(0, 80)}`);
      const known = all().find((x) => x.name.toLowerCase().replace(/[’']/g, '') === actName.toLowerCase().replace(/[’']/g, ''));
      const a = { id: newId('JX', 6), at: iso(), act: actName, slug: known ? known.slug : '', group: b.group, plays: text(b.plays, 160), members: Math.max(1, Math.min(12, parseInt(b.members, 10) || 1)),
        links: links.slice(0, 6), played: text(b.played, 300), notes: text(b.notes, 1000), name: text(b.name, 80), email: mail, relation: b.relation, status: 'new' };
      db.jomApplications.push(a);
      await save();
      tell(mail, 'JOM × TAM: your application for The Best Christmas Ever', 'Thanks for applying', `<p>We’ve got ${e(actName)}’s application to play The Best Christmas Ever at TAM. The JOM date is still to be announced: we’ll be in touch with JOM once it’s set.</p>${known ? `<p>Fans can pledge to see ${e(actName)} on their page: <a href="${e(site())}/jom/${e(known.slug)}">${e(site())}/jom/${e(known.slug)}</a>. Share it!</p>` : ''}`);
      send(res, 201, { ok: true, page: known ? known.slug : null });
    });

    // ----- parents: claim a page -----
    r.post('/api/jom/:slug/claim', async (req, res, { params }) => {
      const a = act(params.slug);
      if (!a || a.hidden) throw fail(404, 'No such act.');
      if (claimLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 4096);
      const mail = cleanEmail(b.email);
      if (!text(b.name, 80)) throw fail(400, 'Add your name.');
      if (!mail) throw fail(400, 'Add a valid email address.');
      if (!RELATIONS[b.relation]) throw fail(400, 'Tell us how you’re connected to the act.');
      if (b.consent !== true) throw fail(400, 'Tick the box to confirm.');
      if (db.jomClaims.some((x) => x.act === a.slug && x.email === mail && x.status === 'pending')) return send(res, 200, { ok: true, already: true });
      db.jomClaims.push({ id: newId('JC', 6), act: a.slug, name: text(b.name, 80), email: mail, relation: b.relation, note: text(b.note, 600), at: iso(), status: 'pending' });
      await save();
      send(res, 201, { ok: true });
    });
    r.post('/api/jom/sign-in', async (req, res) => {
      if (claimLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 1024);
      const mail = cleanEmail(b.email);
      if (mail && mine(mail).length) await mailLink(mail).catch((err) => console.warn(`JOM link: ${err.message}`));
      send(res, 200, { ok: true }); // the same answer either way
    });
    r.post('/api/jom/in', async (req, res) => {
      const b = await readJson(req, 1024);
      const l = db.jomLinks.find((x) => x.hash === hash(String(b.t || '')) && !x.usedAt && Date.parse(x.expires) > ctx.now());
      if (!l) throw fail(400, 'That link has expired or was already used. Ask for a new one.');
      l.usedAt = iso();
      const t = token();
      db.jomSessions = db.jomSessions.filter((s) => Date.parse(s.expires) > ctx.now()).concat({ hash: hash(t), email: l.email, expires: iso(ctx.now() + 30 * DAY) });
      res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure()}`);
      await save();
      send(res, 200, { ok: true, next: '/jom/me' });
    });
    r.post('/api/jom/signout', async (req, res) => {
      const k = cookieOf(req);
      if (k) db.jomSessions = db.jomSessions.filter((s) => s.hash !== hash(k));
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
      await save();
      send(res, 200, { ok: true });
    });

    // ----- parents: their acts, and changes for TAM to approve -----
    r.get('/api/jom/me', (req, res) => {
      const email = needParent(req);
      send(res, 200, { email, acts: mine(email).map((a) => ({ ...a, pending: pendingFor(a.slug) || null, rejected: db.jomPending.filter((p) => p.act === a.slug && p.status === 'rejected').slice(-1)[0] || null })) });
    });
    r.post('/api/jom/me/:slug/photo', async (req, res, { params }) => {
      const email = needParent(req);
      if (!mine(email).some((a) => a.slug === params.slug)) throw fail(403, 'That isn’t one of your acts.');
      const b = await readJson(req, 900 * 1024);
      const url = await ctx.saveImage(b.photo, `jom-${params.slug}-${crypto.randomBytes(6).toString('hex')}`, { what: 'Photos', maxKB: 600 });
      send(res, 200, { photo: url }); // not on the page until a change with it is approved
    });
    r.post('/api/jom/me/:slug', async (req, res, { params }) => {
      const email = needParent(req);
      const a = mine(email).find((x) => x.slug === params.slug);
      if (!a) throw fail(403, 'That isn’t one of your acts.');
      const b = await readJson(req, 16 * 1024);
      const bio = text(b.bio, 1200);
      if (CONTACT.test(bio)) throw fail(400, 'Please leave email addresses and phone numbers out of the bio: it’s a public page.');
      const links = (Array.isArray(b.links) ? b.links : String(b.links || '').split(/[\n,]+/)).map((x) => String(x).trim()).filter(Boolean);
      const bad = links.find((l) => !MUSIC.test(l));
      if (bad) throw fail(400, `Links can go to YouTube, Spotify, SoundCloud, Bandcamp, Apple Music, Instagram, TikTok or Facebook. This one can’t: ${bad.slice(0, 80)}`);
      const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p) => typeof p === 'string' && (/^\/uploads\/jom-[\w-]+\.(jpg|png|webp)$/.test(p) || a.photos.includes(p))).slice(0, 6);
      const name = text(b.name, 60) || a.name;
      const old = pendingFor(a.slug);
      if (old) old.status = 'replaced';
      const p = { id: newId('JP', 6), act: a.slug, by: email, at: iso(), status: 'pending', changes: { name, bio, links: links.slice(0, 6), photos } };
      db.jomPending.push(p);
      await save();
      send(res, 201, { pending: p });
    });

    // ----- staff -----
    const guard = (req) => ctx.team.guard(req, 'ops');
    r.get('/api/jom/manage', (req, res) => {
      const who = guard(req);
      const acts = all();
      send(res, 200, {
        me: { name: who.name }, groups: J.groups, relations: RELATIONS,
        claims: db.jomClaims.filter((x) => x.status === 'pending').map((x) => ({ ...x, actName: (acts.find((a) => a.slug === x.act) || {}).name })),
        changes: db.jomPending.filter((x) => x.status === 'pending').map((x) => ({ ...x, current: acts.find((a) => a.slug === x.act) })),
        acts: acts.map((a) => ({ ...a, parents: (db.jomActs[a.slug] || {}).claimedBy || [] })).sort((x, y) => y.pledges - x.pledges),
        pledges: db.jomPledges.reduce((t, p) => t + p.n, 0),
        applications: db.jomApplications.slice().reverse().map((x) => ({ ...x, pledges: x.slug ? (acts.find((a) => a.slug === x.slug) || {}).pledges || 0 : 0 })),
      });
    });
    r.post('/api/jom/manage/claims/:id', async (req, res, { params }) => {
      const who = guard(req);
      const x = db.jomClaims.find((y) => y.id === params.id && y.status === 'pending');
      if (!x) throw fail(404, 'No such claim.');
      const b = await readJson(req, 2048);
      if (b.action === 'approve') {
        const o = (db.jomActs[x.act] = db.jomActs[x.act] || {});
        o.claimedBy = [...new Set((o.claimedBy || []).concat(x.email))];
        Object.assign(x, { status: 'approved', by: who.name, decidedAt: iso() });
        await save();
        await mailLink(x.email, 'approved').catch((err) => console.warn(`JOM link: ${err.message}`));
      } else if (b.action === 'reject') {
        Object.assign(x, { status: 'rejected', by: who.name, decidedAt: iso(), reason: text(b.message, 600) });
        if (b.email) tell(x.email, 'JOM × TAM: your claim', 'About your claim', `<p>${e(b.message || 'We couldn’t confirm your claim for this page. Reply to this email and we’ll help.')}</p>`);
      } else throw fail(400, 'Approve or reject.');
      await save();
      send(res, 200, { ok: true });
    });
    r.post('/api/jom/manage/changes/:id', async (req, res, { params }) => {
      const who = guard(req);
      const p = db.jomPending.find((y) => y.id === params.id && y.status === 'pending');
      if (!p) throw fail(404, 'No such change.');
      const b = await readJson(req, 2048);
      if (b.action === 'approve') {
        const o = (db.jomActs[p.act] = db.jomActs[p.act] || {});
        const gone = (o.photos || []).filter((u) => !p.changes.photos.includes(u));
        Object.assign(o, { name: p.changes.name, bio: p.changes.bio, links: p.changes.links, photos: p.changes.photos });
        Object.assign(p, { status: 'approved', by: who.name, decidedAt: iso() });
        for (const u of gone) await dropFile(u);
        tell(p.by, 'JOM × TAM: your update is live', 'Your update is live', `<p>Your changes to ${e(o.name || p.act)}’s page are now on <a href="${e(site())}/jom/${e(p.act)}">their page</a>.</p>`);
      } else if (b.action === 'reject') {
        Object.assign(p, { status: 'rejected', by: who.name, decidedAt: iso(), reason: text(b.message, 600) });
        tell(p.by, 'JOM × TAM: about your update', 'A change we couldn’t make', `<p>${e(b.message || 'We couldn’t put this update on the page.')}</p><p>You can edit it and send it again.</p>`);
      } else throw fail(400, 'Approve or reject.');
      await save();
      send(res, 200, { ok: true });
    });
    r.post('/api/jom/manage/acts', async (req, res) => {
      guard(req);
      const b = await readJson(req, 2048);
      if (b.slug && b.action) {
        const a = act(b.slug);
        if (!a) throw fail(404, 'No such act.');
        const o = (db.jomActs[a.slug] = db.jomActs[a.slug] || {});
        if (b.action === 'hide') o.hidden = true;
        else if (b.action === 'show') o.hidden = false;
        else if (b.action === 'session') { const s = text(b.session, 120); if (!c.nightBy.has(s)) throw fail(400, 'Pick a night from the listings.'); o.sessions = [...new Set((o.sessions || []).concat(s))]; }
        else if (b.action === 'unclaim') o.claimedBy = [];
        else throw fail(400, 'Unknown action.');
      } else {
        const name = text(b.name, 60);
        if (!name) throw fail(400, 'Add the act’s name.');
        let slug = slugOf(name), i = 2;
        while (act(slug) || ['me', 'in', 'sign-in', 'manage', 'claim'].includes(slug)) slug = `${slugOf(name)}-${i++}`;
        db.jomExtra.push({ slug, name, group: J.groups[b.group] ? b.group : 'youth', sessions: c.nightBy.has(b.session) ? [b.session] : [] });
      }
      await save();
      send(res, 200, { ok: true });
    });
    r.post('/api/jom/manage/applications/:id', async (req, res, { params }) => {
      guard(req);
      const x = db.jomApplications.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'No such application.');
      const b = await readJson(req, 1024);
      if (!['new', 'shortlist', 'booked', 'not-this-time'].includes(b.status)) throw fail(400, 'Unknown status.');
      x.status = b.status;
      await save();
      send(res, 200, { ok: true });
    });
    r.get('/api/jom/manage/pledges.csv', (req, res) => {
      guard(req);
      const rows = [['Act', 'Group', 'Pledged people', 'Claimed'], ...all().sort((x, y) => y.pledges - x.pledges).map((a) => [a.name, a.groupName, a.pledges, a.claimed ? 'yes' : 'no'])];
      send(res, 200, rows.map((r0) => r0.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="jom-pledges.csv"' });
    });
  }

  // the event page links each JOM act in its line-up to their page
  const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').trim();
  const byName = (name) => shown().find((a) => norm(a.name) === norm(name)) || null;
  const forNight = (slug) => shown().some((a) => a.sessions.includes(slug));
  return { routes, all, shown, act, sessionOf, nextSession, festival, parentOf, byName, forNight, J };
}
