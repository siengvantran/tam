// TAM's team: named staff who sign in with an emailed link, no codes to remember.
//
// Roles: `ops` (Vivian, the ops director: shows, tickets, publishing to
// Eventbrite, Facebook and Google, the door) and `admin` (everything,
// including the team itself). The admin code (ADMIN_TOKEN) still works and
// counts as admin.
//
// The team is seeded from STAFF on Railway, e.g.
//   STAFF="Vivian <vivian@example.com> ops; Sieng <sieng@example.com> admin"
// and admins can add or remove people in /admin → Team. Email addresses stay
// out of the repo.
//
// A sign-in link works once, for 20 minutes. It opens a page with a "Sign in"
// button, so a mail scanner that follows links can't use it up. Sessions last
// 30 days. Only hashes of link and session tokens are stored.

import crypto from 'node:crypto';
import { fail, send, readJson, text, email as cleanEmail, rateLimiter } from '../lib/http.js';

export const ROLES = { ops: 'Ops', admin: 'Admin' };
const RANK = { ops: 1, admin: 2 };
const LINK_MINUTES = 20;
const SESSION_DAYS = 30;
const COOKIE = 'tam_session';

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

// "Vivian <vivian@x.com> ops; Sieng <s@x.com> admin" → [{ name, email, role }]
export function parseStaff(spec) {
  return String(spec || '').split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?)<([^>]+)>\s*(\w+)?$/.exec(s) || /^()(\S+@\S+)\s*(\w+)?$/.exec(s);
    if (!m) return null;
    const mail = cleanEmail(m[2]);
    const role = ROLES[(m[3] || 'ops').toLowerCase()] ? (m[3] || 'ops').toLowerCase() : 'ops';
    return mail ? { name: m[1].trim() || mail.split('@')[0], email: mail, role } : null;
  }).filter(Boolean);
}

export function teamDomain(ctx, { isAdminCode, isDoorCode }) {
  const { db, save, cfg } = ctx;
  for (const k of ['staff', 'staffLinks', 'staffSessions']) if (!Array.isArray(db[k])) db[k] = [];
  // Seed from STAFF: adds people, never removes them (removing is done in /admin).
  for (const p of parseStaff(cfg.staff)) {
    const have = db.staff.find((s) => s.email === p.email);
    if (have) Object.assign(have, { role: p.role, name: have.name || p.name });
    else db.staff.push({ ...p, addedAt: new Date(ctx.now()).toISOString(), addedBy: 'STAFF setting' });
  }

  const cookieOf = (req) => (new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '') || [])[1] || '';
  const secure = () => (cfg.siteUrl.startsWith('https:') ? '; Secure' : '');

  // The signed-in person, or null: { name, email, role, via: 'link'|'code' }
  function whoAmI(req) {
    if (req._who !== undefined) return req._who;
    let who = null;
    const c = cookieOf(req);
    if (c) {
      const s = db.staffSessions.find((x) => x.hash === hash(c) && Date.parse(x.expires) > ctx.now());
      const p = s && db.staff.find((x) => x.email === s.email);
      if (p) who = { name: p.name, email: p.email, role: p.role, via: 'link' };
    }
    if (!who && isAdminCode(req)) who = { name: 'Admin', email: '', role: 'admin', via: 'code' };
    req._who = who;
    return who;
  }
  const can = (req, role) => { const w = whoAmI(req); return Boolean(w && RANK[w.role] >= RANK[role]); };
  const guard = (req, role = 'ops') => {
    if (!can(req, role)) throw fail(401, whoAmI(req) ? 'You don’t have access to this.' : 'Sign in first.');
    return whoAmI(req);
  };

  const prune = () => {
    const t = ctx.now();
    db.staffLinks = db.staffLinks.filter((l) => Date.parse(l.expires) > t && !l.usedAt);
    db.staffSessions = db.staffSessions.filter((s) => Date.parse(s.expires) > t);
  };

  async function sendLink(person, base, next) {
    const t = token();
    db.staffLinks.push({ hash: hash(t), email: person.email, next, expires: new Date(ctx.now() + LINK_MINUTES * 60000).toISOString() });
    await save();
    const url = `${base}/staff/sign-in?t=${t}`;
    if (!ctx.mail.enabled()) { console.warn(`Sign-in link for ${person.email} (email is off): ${url}`); return; }
    await ctx.mail.send({
      to: person.email, subject: 'Your TAM sign-in link',
      html: `<p>Hi ${person.name.replace(/[<>&]/g, '')},</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#e8c77a;color:#0b0709;border-radius:999px;text-decoration:none;font-weight:600">Sign in to TAM</a></p><p style="color:#8a7f86;font-size:13px">The link works once, for ${LINK_MINUTES} minutes. If you didn’t ask for it, ignore this email.</p>`,
      text: `Sign in to TAM: ${url}\n\nThe link works once, for ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
    });
  }

  const linkLimited = rateLimiter({ max: 8 });
  function routes(r) {
    r.get('/api/staff/me', (req, res) => {
      const w = whoAmI(req);
      if (!w) throw fail(401, 'Sign in first.');
      send(res, 200, { ...w, roleName: ROLES[w.role] });
    });
    // Always answers the same, so it never tells anyone who is on the team.
    r.post('/api/staff/link', async (req, res) => {
      if (linkLimited(req)) throw fail(429, 'Too many tries. Wait a few minutes.');
      const b = await readJson(req, 1024);
      const mail = cleanEmail(b.email);
      if (!mail) throw fail(400, 'Type your work email.');
      prune();
      const p = db.staff.find((s) => s.email === mail);
      const next = /^\/[a-z-]*$/.test(String(b.next || '')) ? b.next : '/shows';
      if (p) {
        try { await sendLink(p, ctx.base(req), next); } catch (e) { console.warn(`Sign-in link email: ${e.message}`); throw fail(502, 'The email didn’t send. Try again in a minute.'); }
      }
      send(res, 200, { ok: true });
    });
    r.post('/api/staff/link/use', async (req, res) => {
      const b = await readJson(req, 1024);
      const l = db.staffLinks.find((x) => x.hash === hash(String(b.t || '')));
      if (!l || l.usedAt || Date.parse(l.expires) <= ctx.now()) throw fail(400, 'This link has expired or was already used. Ask for a new one.');
      const p = db.staff.find((s) => s.email === l.email);
      if (!p) throw fail(400, 'You’re no longer on the team list.');
      l.usedAt = new Date(ctx.now()).toISOString();
      const s = token();
      db.staffSessions.push({ hash: hash(s), email: p.email, expires: new Date(ctx.now() + SESSION_DAYS * 86400000).toISOString() });
      p.lastSignIn = l.usedAt;
      prune();
      await save();
      send(res, 200, { ok: true, next: l.next || '/shows', name: p.name },
        { 'Set-Cookie': `${COOKIE}=${s}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure()}` });
    });
    r.post('/api/staff/signout', async (req, res) => {
      const c = cookieOf(req);
      if (c) { db.staffSessions = db.staffSessions.filter((s) => s.hash !== hash(c)); await save(); }
      send(res, 200, { ok: true }, { 'Set-Cookie': [`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`, 'tam_staff=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'] });
    });

    // The team, for admins (/admin → Team)
    r.post('/api/admin/team', async (req, res) => {
      const me = guard(req, 'admin');
      const b = await readJson(req, 2048);
      const mail = cleanEmail(b.email);
      if (!mail) throw fail(400, 'Add a valid email.');
      if (b.remove) {
        db.staff = db.staff.filter((s) => s.email !== mail);
        db.staffSessions = db.staffSessions.filter((s) => s.email !== mail);
      } else {
        const role = ROLES[b.role] ? b.role : 'ops';
        const name = text(b.name, 60) || mail.split('@')[0];
        const have = db.staff.find((s) => s.email === mail);
        if (have) Object.assign(have, { name, role });
        else db.staff.push({ name, email: mail, role, addedAt: new Date(ctx.now()).toISOString(), addedBy: me.name });
      }
      await save();
      send(res, 200, { team: list() });
    });
  }
  const list = () => db.staff.map((s) => ({ name: s.name, email: s.email, role: s.role, roleName: ROLES[s.role], lastSignIn: s.lastSignIn || null }));

  return {
    whoAmI, can, guard, list, routes,
    isAdmin: (req) => isAdminCode(req) || can(req, 'admin'),
    isDoor: (req) => isDoorCode(req) || can(req, 'ops'),
  };
}
