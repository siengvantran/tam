// The TAM Club: TAM's email list and its loyalty card in one.
//
// The list (the best of Buttondown and HubSpot that fits a music venue):
// double opt-in, interests and how often, one-click unsubscribe, a public
// archive with an RSS feed, Markdown issues with personal {{tokens}} and a
// "what's on for you" block, segments by interest and by engagement, an A/B
// subject line, test sends, scheduling, click counts (no tracking pixels),
// and a weekly digest drafted from the calendar.
//
// The card: points for what fans already do (visiting, sharing, bringing
// friends, backing showcase acts, booking, coming in, the bar), with daily
// caps so it can't be farmed. 100 points = half a pint on the house, shown
// as a code at the bar; staff pour it from the member's card page.
//
// Emails, cards and sign-in links are private. Only hashes of sign-in tokens
// are stored. Members can stop emails, keep their card, or delete it all.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, send, readJson, text, email as cleanEmail, newId } from '../lib/http.js';
import { markdown, plain } from '../lib/markdown.js';
import { clubShell, clubButton } from '../services/mailer.js';
import { escape as e } from '../views/html.js';
import { londonToday } from '../lib/content.js';

export const HALF = 108; // points for a drink on the house: half a pint, a glass of wine or infused water
// The drinks a member can choose when they claim (staff see which on the card).
export const DRINKS = { half: 'Half a pint', wine: 'A glass of wine', water: 'Infused water' };
export const DRINK_LINE = 'half a pint, a glass of wine or an infused water';
const REWARD_DAYS = 30; // a claimed drink is good for 30 days
const CLAIM_GAP_DAYS = 7; // one half a week, at most
const COOKIE = 'tam_club';
const SESSION_DAYS = 180;
const DAY = 86400000;

export const INTERESTS = {
  gigs: { label: 'Gigs and live bands', match: () => true },
  showcases: { label: 'Sunday Showcase and new acts', match: (n) => /showcase|singers|sunday spot|open mic|jom/i.test(n.title) },
  blues: { label: 'The Great British Blues Jam', match: (n) => /blues jam/i.test(n.title) },
  christmas: { label: 'Christmas at TAM', match: (n) => /christmas/i.test(`${n.title} ${n.festival || ''}`) },
  fridays: { label: 'Friday nights', match: (n) => new Date(`${n.date}T12:00:00Z`).getUTCDay() === 5 },
  immersive: { label: 'Immersive and creators', match: (n) => /immersive|creator/i.test(n.title) },
};
export const FREQUENCIES = {
  weekly: 'Every week: what’s on, and news',
  monthly: 'Once a month: the best bits',
  big: 'Only the big news',
};
const KINDS = { weekly: ['weekly'], monthly: ['monthly', 'big'], big: ['big'] }; // which issues each frequency gets
const ISSUE_KINDS = { weekly: 'Weekly (everyone on every week)', monthly: 'Monthly (weekly and monthly readers)', big: 'Big news (everyone)' };

// How points are earned. Spending at TAM (paid tickets, the bar) earns the
// most; everything else earns a little. Caps keep it fair: per day, week, month or ever.
export const RULES = {
  bar: { pts: 1, label: 'Every £1 at the TAM bar', unit: true, perDayPts: 30, hint: 'show your card', paid: true },
  spend: { pts: 1, label: 'Every £1 on tickets at tam.tv', unit: true, paid: true },
  booking: { pts: 10, label: 'Book paid tickets on tam.tv', paid: true, hint: 'plus the £1s' },
  freeBooking: { pts: 2, label: 'Book free tickets on tam.tv' },
  attend: { pts: 5, label: 'Come to a night at TAM', perDay: 1, hint: 'checked in at the door' },
  join: { pts: 10, label: 'Join the list (confirm your email)', max: 1 },
  profile: { pts: 2, label: 'Tell us what you’re into', max: 1 },
  referral: { pts: 5, label: 'A friend joins with your link', perMonth: 5 },
  blues: { pts: 3, label: 'Sign up to play the Blues Jam' },
  visit: { pts: 1, label: 'Visit tam.tv', perDay: 1, hint: 'once a day' },
  streak: { pts: 2, label: 'Visit on 3 days in a week', perWeek: 1, hint: 'bonus' },
  share: { pts: 1, label: 'Share a TAM page', perDay: 1, hint: 'once a day' },
  refVisit: { pts: 1, label: 'Someone opens a link you shared', perDay: 3, hint: 'up to 3 a day' },
  follow: { pts: 1, label: 'Follow an artist on tam.tv', max: 5 },
  social: { pts: 1, label: 'Follow TAM on Instagram and YouTube', max: 4, hint: 'each' },
  vote: { pts: 1, label: 'Back a Sunday Showcase act for Christmas', perDay: 3 },
  wall: { pts: 1, label: 'Leave a note on an artist’s wall', perDay: 1 },
  click: { pts: 1, label: 'Open a link in our newsletter', hint: 'each issue' },
  photo: { pts: 1, label: 'Add a photo to your card', max: 1 },
  half: { pts: -HALF, label: 'A drink on the house', hidden: true },
  refund: { pts: HALF, label: 'Unused drink: points back', hidden: true },
  gift: { pts: 0, label: 'From the TAM team', hidden: true, unit: true },
};
export const SOCIALS = ['instagram', 'tiktok', 'facebook', 'youtube'];
export const TIERS = [
  { name: 'Fan', at: 0 }, { name: 'Regular', at: 150 }, { name: 'Insider', at: 400 }, { name: 'Legend', at: 1000 },
];
const BADGES = [
  ['First night', '🎟️', (n) => n.attend >= 1], ['Front row', '🎸', (n) => n.attend >= 5],
  ['Scout', '🔭', (n) => n.vote >= 3], ['Connector', '🔗', (n) => n.referral >= 3],
  ['On a streak', '🔥', (n) => n.streak >= 1], ['Bar regular', '🍺', (n) => n.bar >= 3],
  ['On the house', '🏆', (n) => n.half >= 1], ['Wall writer', '✍️', (n) => n.wall >= 3],
];
export const SEGMENTS = {
  all: 'Everyone',
  active30: 'Active in the last 30 days',
  quiet60: 'Quiet for 60 days (win them back)',
  new30: 'Joined in the last 30 days',
  bookers: 'Has booked or come to a night',
  regulars: 'Regulars and up (150+ points earned)',
};

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const code = (n) => newId('', n).replace(/^-/, '');
const firstName = (m) => (String(m.name || '').trim().split(/\s+/)[0] || '');

export function clubDomain(ctx) {
  const { db, save, cfg, content: c } = ctx;
  for (const k of ['members', 'clubLedger', 'clubRewards', 'clubLinks', 'clubSessions', 'issues', 'clubVisitors']) if (!Array.isArray(db[k])) db[k] = [];
  const gap = Number.isFinite(cfg.mailGapMs) ? cfg.mailGapMs : 600; // Resend allows a couple a second
  const iso = (t = ctx.now()) => new Date(t).toISOString();
  const today = () => londonToday(new Date(ctx.now()));
  const site = () => cfg.siteUrl;
  const socials = () => SOCIALS.filter((k) => (c.site.socials || {})[k]); // the ones TAM is on

  // ---------- members ----------
  const byEmail = (mail) => db.members.find((m) => m.email === mail);
  const byId = (id) => db.members.find((m) => m.id === id);
  const sessionCookie = (req) => (new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '') || [])[1] || '';
  function memberOf(req) {
    if (req._member !== undefined) return req._member;
    const c0 = sessionCookie(req);
    const s = c0 && db.clubSessions.find((x) => x.hash === hash(c0) && Date.parse(x.expires) > ctx.now());
    req._member = (s && byId(s.member)) || null;
    return req._member;
  }
  const secure = () => (cfg.siteUrl.startsWith('https:') ? '; Secure' : '');
  function startSession(res, m) {
    const t = token();
    db.clubSessions = db.clubSessions.filter((s) => Date.parse(s.expires) > ctx.now());
    db.clubSessions.push({ hash: hash(t), member: m.id, expires: iso(ctx.now() + SESSION_DAYS * DAY) });
    // tam_club_on (no secret in it) tells the page script there's a card to count visits for
    res.setHeader('Set-Cookie', [`${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure()}`,
      `${COOKIE}_on=1; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure()}`]);
  }

  async function dropPhoto(m) {
    if (!m.photo) return;
    const file = path.join(ctx.uploadsDir || '', path.basename(m.photo));
    m.photo = '';
    if (ctx.uploadsDir) await fs.unlink(file).catch(() => {});
  }

  // ---------- points ----------
  const ledgerOf = (m) => db.clubLedger.filter((x) => x.m === m.id);
  const balanceOf = (m) => ledgerOf(m).reduce((t, x) => t + x.pts, 0);
  const earnedOf = (m) => ledgerOf(m).filter((x) => x.pts > 0 && x.rule !== 'refund').reduce((t, x) => t + x.pts, 0);
  const tierOf = (earned) => {
    const i = TIERS.reduce((k, t, j) => (earned >= t.at ? j : k), 0);
    return { name: TIERS[i].name, next: TIERS[i + 1] ? TIERS[i + 1].name : null, toNext: TIERS[i + 1] ? TIERS[i + 1].at - earned : 0 };
  };
  const weekOf = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

  // Adds points if the rule allows it now. Returns the entry, or null.
  function award(m, rule, key = '', { pts, note = '' } = {}) {
    const r = RULES[rule];
    if (!m || !r) return null;
    const mine = ledgerOf(m).filter((x) => x.rule === rule);
    key = String(key || '');
    if (key && mine.some((x) => x.key === key)) return null;
    const d = today();
    if (r.max && mine.length >= r.max) return null;
    if (r.perDay && mine.filter((x) => x.day === d).length >= r.perDay) return null;
    if (r.perWeek && mine.filter((x) => weekOf(x.day) === weekOf(d)).length >= r.perWeek) return null;
    if (r.perMonth && mine.filter((x) => Date.parse(x.at) > ctx.now() - 30 * DAY).length >= r.perMonth) return null;
    let p = r.unit ? Math.max(0, Math.floor(Number(pts) || 0)) : r.pts;
    if (r.perDayPts) p = Math.min(p, Math.max(0, r.perDayPts - mine.filter((x) => x.day === d).reduce((t, x) => t + x.pts, 0)));
    if (!p && rule !== 'gift') return null;
    const before = balanceOf(m);
    const entry = { id: newId('PT', 8), m: m.id, rule, key, pts: p, at: iso(), day: d, ...(note ? { note: text(note, 120) } : {}) };
    db.clubLedger.push(entry);
    if (rule === 'visit') {
      const days = new Set(ledgerOf(m).filter((x) => x.rule === 'visit' && weekOf(x.day) === weekOf(d)).map((x) => x.day));
      if (days.size >= 3) award(m, 'streak', weekOf(d));
    }
    save();
    if (before < HALF && before + p >= HALF && m.status === 'active') nudge(m);
    return entry;
  }
  const awardEmail = (mail, rule, key, opts) => { const m = byEmail(cleanEmail(mail)); return m ? award(m, rule, key, opts) : null; };
  const awardReq = (req, rule, key, opts) => award(memberOf(req), rule, key, opts);

  // Rewards: claim → a code for the bar; unused ones give the points back.
  function settle(m) {
    for (const r of db.clubRewards.filter((x) => x.m === m.id && !x.redeemedAt && !x.refundedAt && Date.parse(x.expires) <= ctx.now())) {
      r.refundedAt = iso();
      db.clubLedger.push({ id: newId('PT', 8), m: m.id, rule: 'refund', key: r.id, pts: HALF, at: iso(), day: today() });
      save();
    }
  }
  const liveReward = (m) => db.clubRewards.find((x) => x.m === m.id && !x.redeemedAt && !x.refundedAt && Date.parse(x.expires) > ctx.now());
  const nextClaim = (m) => {
    const last = db.clubRewards.filter((x) => x.m === m.id && !x.refundedAt).map((x) => Date.parse(x.issuedAt)).sort().pop();
    return last ? last + CLAIM_GAP_DAYS * DAY : 0;
  };

  function counts(m) {
    const n = {};
    for (const x of ledgerOf(m)) n[x.rule] = (n[x.rule] || 0) + 1;
    return n;
  }

  function view(m) {
    settle(m);
    const balance = balanceOf(m), earned = earnedOf(m), n = counts(m), d = today();
    const mine = ledgerOf(m);
    const live = liveReward(m);
    const next = nextClaim(m);
    const week = new Set(mine.filter((x) => x.rule === 'visit' && Date.parse(x.at) > ctx.now() - 7 * DAY).map((x) => x.day)).size;
    return {
      id: m.id, name: m.name, firstName: firstName(m), email: m.email, status: m.status, emails: m.emails, photo: m.photo || '',
      interests: m.interests, frequency: m.frequency, card: m.card,
      refLink: `${site()}/r/${m.refCode}`, cardUrl: `${site()}/club/card/${m.card}`,
      balance, earned, half: HALF, toHalf: Math.max(0, HALF - balance), tier: tierOf(earned),
      badges: BADGES.filter(([, , ok]) => ok(n)).map(([name, icon]) => ({ name, icon })),
      allBadges: BADGES.map(([name, icon]) => ({ name, icon })),
      streakDays: week,
      reward: live ? { code: live.code, expires: live.expires, drink: live.drink || 'half', drinkName: DRINKS[live.drink || 'half'] } : null, drinks: DRINKS,
      canClaim: !live && balance >= HALF && next <= ctx.now(), nextClaimAt: next > ctx.now() ? iso(next) : null,
      socials: mine.filter((x) => x.rule === 'social').map((x) => x.key), socialLinks: Object.fromEntries(socials().map((k) => [k, c.site.socials[k]])),
      missions: Object.entries(RULES).filter(([, r]) => !r.hidden).map(([id, r]) => {
        const mineR = mine.filter((x) => x.rule === id);
        const capped = (r.max && mineR.length >= r.max) || (r.perDay && mineR.filter((x) => x.day === d).length >= r.perDay)
          || (r.perWeek && mineR.filter((x) => weekOf(x.day) === weekOf(d)).length >= r.perWeek);
        return { id, label: r.label, pts: r.unit ? `${r.pts} per £1` : `+${r.pts}`, hint: r.hint || '', done: Boolean(capped), count: mineR.length };
      }),
      history: mine.slice(-25).reverse().map((x) => ({ at: x.at, pts: x.pts, label: RULES[x.rule].label, note: x.note || '' })),
    };
  }

  // ---------- emails ----------
  const footerFor = (m) => `You’re getting this because you joined the TAM list${m.source ? ` (${e(m.source)})` : ''}.
    <a href="${e(`${site()}/club`)}" style="color:#c9a8b8">Your card and settings</a> ·
    <a href="${e(`${site()}/club/unsubscribe?t=${m.unsub}`)}" style="color:#c9a8b8">Unsubscribe</a>`;
  const listHeaders = (m) => ({ 'List-Unsubscribe': `<${site()}/api/club/unsubscribe?t=${m.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

  async function mailLink(m, purpose, next = '/club') {
    const t = token();
    const minutes = purpose === 'confirm' ? 7 * 24 * 60 : 30;
    db.clubLinks = db.clubLinks.filter((l) => Date.parse(l.expires) > ctx.now() && !l.usedAt);
    db.clubLinks.push({ hash: hash(t), member: m.id, purpose, next, expires: iso(ctx.now() + minutes * 60000) });
    await save();
    if (!ctx.mail.enabled()) return;
    const url = `${site()}/club/${purpose === 'confirm' ? 'confirm' : 'in'}?t=${t}`;
    const msg = purpose === 'confirm'
      ? { subject: `Confirm you’re on the TAM list (and grab ${RULES.join.pts} points)`, heading: 'One tap and you’re in', body: `Confirm your email and we’ll start your TAM Club card with <b>${RULES.join.pts} points</b>. ${HALF} points is a drink on us at the TAM bar: ${DRINK_LINE}.`, button: 'Yes, I’m in' }
      : { subject: 'Your TAM Club card', heading: 'Here’s your card', body: 'Tap to open your TAM Club card on this phone. The link works once, for 30 minutes.', button: 'Open my card' };
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">${msg.heading}</h1><p>${msg.body}</p>${clubButton(msg.button, url)}
      <p style="font-size:13px;color:#8a7f86">Didn’t ask for this? Ignore it and nothing happens.</p>`;
    await ctx.mail.send({ to: m.email, subject: msg.subject, html: clubShell(inner, { preheader: msg.body.replace(/<[^>]+>/g, '') }), text: `${msg.heading}\n\n${msg.body.replace(/<[^>]+>/g, '')}\n\n${msg.button}: ${url}` });
  }

  function sendQuiet(msg, what) {
    if (!ctx.mail.enabled()) return;
    ctx.mail.send(msg).catch((err) => console.warn(`Club ${what}: ${err.message}`));
  }
  function welcome(m) {
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">You’re in${firstName(m) ? `, ${e(firstName(m))}` : ''} 🍻</h1>
      <p>Your TAM Club card has <b>${balanceOf(m)} points</b>. At <b>${HALF}</b> you get a drink on the house at the TAM bar: ${DRINK_LINE}.</p>
      <p><b>The quickest way:</b> show your card at the bar (a point for every £1) and book paid tickets on tam.tv (+${RULES.booking.pts}, plus a point for every £1).</p>
      <p><b>Little extras:</b> come to a night (+${RULES.attend.pts}), bring a friend who joins (+${RULES.referral.pts}), and a point a day for visiting tam.tv.</p>
      ${clubButton('Open my card', `${site()}/club`)}`;
    sendQuiet({ to: m.email, subject: 'Welcome to the TAM Club: your card is live', html: clubShell(inner, { preheader: `You have ${balanceOf(m)} points. ${HALF} = a drink on us.`, footer: footerFor(m) }), text: `You're in. Your card: ${site()}/club`, headers: listHeaders(m) }, 'welcome');
  }
  function nudge(m) {
    const inner = `<h1 style="font-size:28px;margin:0 0 10px">Your drink is ready 🍻</h1>
      <p>You’ve reached ${HALF} points. Choose ${DRINK_LINE} on your card, then show the code at the TAM bar on your next night.</p>${clubButton('Claim my drink', `${site()}/club`)}`;
    sendQuiet({ to: m.email, subject: 'You’ve earned a drink at TAM', html: clubShell(inner, { preheader: 'Choose it on your card and show the code at the bar.', footer: footerFor(m) }), text: `You've earned a drink on us. Claim it: ${site()}/club`, headers: listHeaders(m) }, 'nudge');
  }

  // ---------- joining ----------
  const pickInterests = (v) => [...new Set((Array.isArray(v) ? v : []).filter((k) => INTERESTS[k]))];
  async function join({ email: raw, name, interests, frequency, source, ref, consent }) {
    const mail = cleanEmail(raw);
    if (!mail) throw fail(400, 'Add a valid email address.');
    if (consent !== true) throw fail(400, 'Tick the box to say yes to TAM’s emails.');
    let m = byEmail(mail);
    if (m && m.status === 'active') {
      if (!m.emails) Object.assign(m, { emails: true, consentAt: iso() }); // back on the list
      await mailLink(m, 'signin').catch((err) => console.warn(`Club sign-in ${m.id}: ${err.message}`));
      return m;
    }
    if (!m) {
      const referrer = ref ? db.members.find((x) => x.refCode === String(ref).toUpperCase() && x.status === 'active') : null;
      m = {
        id: newId('M', 8), email: mail, name: text(name, 60), status: 'pending', emails: true,
        interests: pickInterests(interests), frequency: FREQUENCIES[frequency] ? frequency : 'weekly',
        source: text(source, 40) || 'tam.tv', ref: referrer ? referrer.id : null,
        card: code(10), refCode: code(6), unsub: crypto.randomBytes(16).toString('hex'),
        createdAt: iso(), consent: 'Yes, email me about nights at TAM and my TAM Club points.', consentAt: iso(),
      };
      db.members.push(m);
    } else {
      if (name && !m.name) m.name = text(name, 60);
      if (pickInterests(interests).length) m.interests = pickInterests(interests);
      if (Date.parse(m.confirmSentAt || 0) > ctx.now() - 2 * 60000) { await save(); return m; } // don't resend within 2 minutes
    }
    m.confirmSentAt = iso();
    await mailLink(m, 'confirm').catch((err) => console.warn(`Club confirm ${m.id}: ${err.message}`));
    return m;
  }

  function useLink(t, purpose) {
    const l = db.clubLinks.find((x) => x.hash === hash(t) && x.purpose === purpose && !x.usedAt && Date.parse(x.expires) > ctx.now());
    const m = l && byId(l.member);
    if (!m) throw fail(400, purpose === 'confirm' ? 'That link has expired or was already used. Join again to get a new one.' : 'That link has expired or was already used. Ask for a new one.');
    l.usedAt = iso();
    return { m, next: l.next || '/club' };
  }

  function confirm(m) {
    if (m.status === 'active') return;
    m.status = 'active';
    m.confirmedAt = iso();
    award(m, 'join');
    if (m.interests.length) award(m, 'profile');
    const r = m.ref && byId(m.ref);
    if (r && r.id !== m.id) award(r, 'referral', m.id, { note: firstName(m) || 'a friend' });
    welcome(m);
  }

  // ---------- issues (newsletters) ----------
  const engaged = (m, days) => db.clubLedger.some((x) => x.m === m.id && Date.parse(x.at) > ctx.now() - days * DAY && !['refund'].includes(x.rule));
  function inSegment(m, seg = {}) {
    const want = pickInterests(seg.interests);
    if (want.length && m.interests.length && !m.interests.some((k) => want.includes(k))) return false;
    switch (seg.engagement) {
      case 'active30': return engaged(m, 30);
      case 'quiet60': return !engaged(m, 60);
      case 'new30': return Date.parse(m.confirmedAt || m.createdAt) > ctx.now() - 30 * DAY;
      case 'bookers': return ledgerOf(m).some((x) => ['booking', 'attend'].includes(x.rule));
      case 'regulars': return earnedOf(m) >= TIERS[1].at;
      default: return true;
    }
  }
  const audience = (issue) => db.members.filter((m) => m.status === 'active' && m.emails && KINDS[m.frequency || 'weekly'].includes(issue.kind) && inSegment(m, issue.segment));

  function upcoming(m, max = 6) {
    const now = iso(), until = iso(ctx.now() + 21 * DAY);
    const all = c.nights.filter((n) => n.start > now && n.start < until);
    const wants = m && m.interests && m.interests.length ? m.interests : null;
    const mine = wants ? all.filter((n) => wants.some((k) => k !== 'gigs' && INTERESTS[k].match(n))) : [];
    const pick = (wants && !wants.includes('gigs') && mine.length ? mine : [...mine, ...all.filter((n) => !mine.includes(n))]);
    return pick.slice(0, max);
  }
  const nightHref = (n) => `${site()}${/blues jam/i.test(n.title) && !n.festival ? '/great-british-blues-jam#jam' : `/events/${n.slug}`}`;

  // An issue rendered for one member (or for the web, with m = null).
  function render(issue, m, { variant = 'a', track = true } = {}) {
    const bal = m ? balanceOf(m) : 0;
    const tokens = {
      first_name: (m && firstName(m)) || 'there', points: String(bal), to_half: String(Math.max(0, HALF - bal)),
      card_link: `${site()}/club`, join_link: `${site()}/club`,
    };
    const fill = (s) => String(s || '').replace(/\{\{\s*(\w+)\s*(?:\|\s*([^}]*))?\}\}/g, (all, k, dflt) => (k === 'first_name' && (!m || !firstName(m)) && dflt !== undefined ? dflt.trim() : tokens[k] ?? all));
    const link = (u) => {
      const abs = u.startsWith('/') ? `${site()}${u}` : u;
      if (!track || !m || !/^https?:/.test(abs)) return abs;
      const sig = crypto.createHmac('sha256', ctx.secret).update(`${issue.id}|${m.id}|${abs}`).digest('hex').slice(0, 16);
      return `${site()}/c/${issue.id}/${m.id}/${sig}?u=${encodeURIComponent(abs)}`;
    };
    const list = upcoming(m);
    const whatsOn = list.length ? `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${list.map((n) => `<tr><td style="padding:10px 0;border-bottom:1px solid #2a2026;vertical-align:top;width:92px;color:#f3c35b;font-weight:700">${e(n.weekday.slice(0, 3))} ${e(n.day)} ${e(n.month.slice(0, 3))}</td><td style="padding:10px 0;border-bottom:1px solid #2a2026"><a href="${e(link(nightHref(n)))}" style="color:#f6efe6;font-weight:700;text-decoration:none">${e(n.title)}</a><br><span style="color:#8a7f86;font-size:14px">Doors ${e(n.doors)}</span></td></tr>`).join('')}</table>` : '<p>New nights are on the way: keep an eye on <a href="https://www.tam.tv/whats-on" style="color:#ff5c8a">what’s on</a>.</p>';
    const card = m
      ? `<div style="background:#1a1116;border:1px solid #3a2a33;border-radius:16px;padding:16px 18px;margin:18px 0"><b style="color:#f3c35b">Your TAM Club card: ${bal} points</b><br>${bal >= HALF ? 'Your drink on us is ready to claim.' : `${HALF - bal} more for a drink on us.`} <a href="${e(`${site()}/club`)}" style="color:#ff5c8a">Open your card</a></div>`
      : `<div style="background:#1a1116;border:1px solid #3a2a33;border-radius:16px;padding:16px 18px;margin:18px 0"><b style="color:#f3c35b">Join the TAM Club</b><br>Get this in your inbox and earn your way to a drink on us. <a href="${e(`${site()}/club`)}" style="color:#ff5c8a">Join free</a></div>`;
    const body = markdown(fill(issue.body), { link, blocks: { whats_on: whatsOn, card } });
    const subject = fill(variant === 'b' && issue.subjectB ? issue.subjectB : issue.subject);
    const inner = `<h1 style="font-size:30px;line-height:1.15;margin:0 0 14px">${e(fill(issue.title || issue.subject))}</h1>${body}`;
    return {
      subject, inner, preheader: fill(issue.preheader),
      html: clubShell(inner, { preheader: fill(issue.preheader), footer: m ? `${footerFor(m)} · <a href="${e(`${site()}/newsletter/${issue.slug}`)}" style="color:#c9a8b8">Read on the web</a>` : '' }),
      text: `${fill(issue.title || issue.subject)}\n\n${plain(fill(issue.body)).replace(/\{\{\s*whats_on\s*\}\}/g, list.map((n) => `${n.weekday} ${n.day} ${n.month}: ${n.title} ${nightHref(n)}`).join('\n')).replace(/\{\{\s*card\s*\}\}/g, m ? `Your TAM Club card: ${bal} points. ${site()}/club` : `Join the TAM Club: ${site()}/club`)}\n\n${m ? `Unsubscribe: ${site()}/club/unsubscribe?t=${m.unsub}` : ''}`,
    };
  }

  const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'issue';
  const issueView = (x, full = false) => {
    const { recipients, ...rest } = x;
    const r = Object.values(recipients || {});
    const clicked = r.filter((y) => y.clicks);
    const per = (v) => ({ sent: r.filter((y) => y.v === v).length, clickers: clicked.filter((y) => y.v === v).length });
    return { ...rest, stats: { ...(x.stats || {}), sent: r.length, clickers: clicked.length, a: per('a'), b: per('b'), unsubscribed: db.members.filter((m) => m.unsubIssue === x.id).length }, ...(full ? {} : { body: undefined }) };
  };

  let sending = null;
  async function run(issue) {
    if (sending) return;
    sending = issue.id;
    try {
      issue.status = 'sending';
      issue.startedAt = issue.startedAt || iso();
      issue.recipients = issue.recipients || {};
      const list = audience(issue);
      issue.stats = { ...(issue.stats || {}), to: list.length, failed: issue.stats?.failed || 0 };
      await save();
      let i = 0;
      for (const m of list) {
        if (issue.status !== 'sending') break; // cancelled mid-send
        if (issue.recipients[m.id]) continue;
        const v = issue.subjectB ? (i++ % 2 ? 'b' : 'a') : 'a';
        const r = render(issue, m, { variant: v });
        try {
          await ctx.mail.send({ to: m.email, subject: r.subject, html: r.html, text: r.text, headers: listHeaders(m) });
          issue.recipients[m.id] = { v, at: iso(), clicks: 0 };
          m.lastEmailAt = iso();
        } catch (err) {
          issue.stats.failed++;
          issue.recipients[m.id] = { v, at: iso(), clicks: 0, error: String(err.message).slice(0, 120) };
        }
        if (Object.keys(issue.recipients).length % 20 === 0) await save();
        if (gap) await new Promise((ok) => setTimeout(ok, gap));
      }
      if (issue.status === 'sending') { issue.status = 'sent'; issue.sentAt = iso(); }
      await save();
    } finally { sending = null; }
  }
  // sign-ups never confirmed are removed after 30 days (the privacy notice says so)
  function prune() {
    const old = new Set(db.members.filter((m) => m.status === 'pending' && Date.parse(m.createdAt) < ctx.now() - 30 * DAY).map((m) => m.id));
    if (!old.size) return;
    db.members = db.members.filter((m) => !old.has(m.id));
    db.clubLedger = db.clubLedger.filter((x) => !old.has(x.m));
    db.clubLinks = db.clubLinks.filter((x) => !old.has(x.member));
    save();
  }
  prune();

  // scheduled issues, and any send cut off by a restart
  function tick() {
    prune();
    if (sending || !ctx.mail.enabled()) return;
    const due = db.issues.find((x) => x.status === 'sending') || db.issues.find((x) => x.status === 'scheduled' && Date.parse(x.sendAt) <= ctx.now());
    if (due) run(due).catch((err) => console.error(`Newsletter ${due.id}: ${err.message}`));
  }
  const timer = setInterval(tick, 60000);
  timer.unref?.();

  function digest(who) {
    const list = upcoming(null, 8);
    const first = list[0];
    const issue = {
      kind: 'weekly', subject: first ? `This week at TAM: ${first.title}${list.length > 1 ? ` and ${list.length - 1} more` : ''}` : 'This week at TAM',
      subjectB: '{{first_name|Hey}}, here’s your week at TAM 🎶', preheader: 'What’s on, picked for you, and how close you are to a drink on us.',
      title: 'This week at TAM',
      body: `Hey {{first_name|there}},\n\nHere’s what’s on at TAM, picked for what you’re into:\n\n{{whats_on}}\n\n## Bring a friend\n\nShow your TAM Club card at the bar: every £1 is a point toward a drink on us.\n\n{{card}}\n\nSee you at the bar,\nTAM`,
      segment: { interests: [], engagement: 'all' },
    };
    return saveIssue(issue, who);
  }

  function saveIssue(body, who) {
    let x = body.id ? db.issues.find((y) => y.id === body.id) : null;
    if (x && !['draft', 'scheduled'].includes(x.status)) throw fail(409, 'That issue has been sent: duplicate it to change it.');
    if (!x) {
      x = { id: newId('NL', 6), status: 'draft', createdAt: iso(), createdBy: who ? who.name : '', recipients: {}, stats: {} };
      db.issues.push(x);
    }
    const seg = body.segment || {};
    Object.assign(x, {
      subject: text(body.subject, 150) || x.subject || 'News from TAM', subjectB: text(body.subjectB, 150),
      title: text(body.title, 150), preheader: text(body.preheader, 200), body: String(body.body || '').slice(0, 30000),
      kind: ISSUE_KINDS[body.kind] ? body.kind : 'weekly', archive: body.archive !== false,
      segment: { interests: pickInterests(seg.interests), engagement: SEGMENTS[seg.engagement] ? seg.engagement : 'all' },
      updatedAt: iso(),
    });
    if (x.status === 'scheduled') x.status = 'draft'; // edits take it off the schedule until it's scheduled again
    const base = slugify(x.title || x.subject);
    if (!x.slug || x.status === 'draft') x.slug = db.issues.some((y) => y !== x && y.slug === base) ? `${base}-${x.id.slice(-4).toLowerCase()}` : base;
    save();
    return x;
  }

  // ---------- routes ----------
  const me = (req) => { const m = memberOf(req); if (!m) throw fail(401, 'Open your card from the link we emailed you.'); return m; };
  const visitor = (req) => hash(`${ctx.secret}|${today()}|${String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()}|${req.headers['user-agent'] || ''}`).slice(0, 24);

  function routes(r) {
    r.post('/api/club/join', async (req, res) => {
      const b = await readJson(req, 4096);
      await join({ ...b, source: b.source });
      send(res, 201, { ok: true, check: true, mail: ctx.mail.enabled() });
    });
    r.post('/api/club/link', async (req, res) => {
      const b = await readJson(req, 2048);
      const m = byEmail(cleanEmail(b.email));
      if (m && m.status === 'active') await mailLink(m, 'signin').catch((err) => console.warn(`Club sign-in ${m.id}: ${err.message}`));
      else if (m) { m.confirmSentAt = iso(); await mailLink(m, 'confirm').catch(() => {}); }
      send(res, 200, { ok: true }); // the same answer either way: nobody can test who's on the list
    });
    r.post('/api/club/confirm', async (req, res) => {
      const b = await readJson(req, 2048);
      const { m } = useLink(String(b.t || ''), 'confirm');
      confirm(m);
      startSession(res, m);
      await save();
      send(res, 200, { ok: true, next: '/club?welcome=1' });
    });
    r.post('/api/club/in', async (req, res) => {
      const b = await readJson(req, 2048);
      const { m, next } = useLink(String(b.t || ''), 'signin');
      startSession(res, m);
      await save();
      send(res, 200, { ok: true, next });
    });
    r.post('/api/club/signout', async (req, res) => {
      const c0 = sessionCookie(req);
      if (c0) db.clubSessions = db.clubSessions.filter((s) => s.hash !== hash(c0));
      res.setHeader('Set-Cookie', [`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`, `${COOKIE}_on=; Path=/; SameSite=Lax; Max-Age=0${secure()}`]);
      await save();
      send(res, 200, { ok: true });
    });
    r.get('/api/club/me', (req, res) => send(res, 200, { member: view(me(req)) }, { 'Cache-Control': 'no-store' }));
    r.post('/api/club/me', async (req, res) => {
      const m = me(req);
      const b = await readJson(req, 4096);
      if (b.name !== undefined) m.name = text(b.name, 60);
      if (b.interests !== undefined) { m.interests = pickInterests(b.interests); if (m.interests.length) award(m, 'profile'); }
      if (FREQUENCIES[b.frequency]) m.frequency = b.frequency;
      if (typeof b.emails === 'boolean') { m.emails = b.emails; if (b.emails) m.consentAt = iso(); }
      await save();
      send(res, 200, { member: view(m) });
    });
    // a photo on your card: so the bar knows it's you (shown to you and to staff who scan your card)
    r.post('/api/club/photo', async (req, res) => {
      const m = me(req);
      const b = await readJson(req, 700 * 1024);
      if (b.remove) { await dropPhoto(m); await save(); return send(res, 200, { member: view(m) }); }
      if (!b.photo) throw fail(400, 'Choose a photo.');
      const url = await ctx.saveImage(b.photo, `club-${m.id}-${crypto.randomBytes(6).toString('hex')}`, { what: 'Photos', maxKB: 500 });
      await dropPhoto(m);
      m.photo = url;
      if (m.status === 'active') award(m, 'photo');
      await save();
      send(res, 200, { member: view(m) });
    });
    r.post('/api/club/delete', async (req, res) => {
      const m = me(req);
      await dropPhoto(m);
      db.members = db.members.filter((x) => x.id !== m.id);
      db.clubLedger = db.clubLedger.filter((x) => x.m !== m.id);
      db.clubRewards = db.clubRewards.filter((x) => x.m !== m.id);
      db.clubSessions = db.clubSessions.filter((x) => x.member !== m.id);
      db.clubLinks = db.clubLinks.filter((x) => x.member !== m.id);
      for (const i of db.issues) if (i.recipients && i.recipients[m.id]) delete i.recipients[m.id];
      res.setHeader('Set-Cookie', [`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`, `${COOKIE}_on=; Path=/; SameSite=Lax; Max-Age=0${secure()}`]);
      await save();
      send(res, 200, { ok: true });
    });

    // engagement from the site (public/js/club.js)
    r.post('/api/club/ping', (req, res) => {
      const m = memberOf(req);
      const got = m && m.status === 'active' ? award(m, 'visit', today()) : null;
      send(res, 200, { member: m ? { balance: balanceOf(m) } : null, got: got ? got.pts : 0 });
    });
    r.post('/api/club/share', async (req, res) => {
      const m = me(req);
      const b = await readJson(req, 1024);
      const got = m.status === 'active' ? award(m, 'share', `${today()}:${text(b.path, 200)}`) : null;
      send(res, 200, { got: got ? got.pts : 0, balance: balanceOf(m) });
    });
    r.post('/api/club/ref-visit', async (req, res) => {
      const b = await readJson(req, 1024);
      const sharer = db.members.find((x) => x.refCode === String(b.r || '').toUpperCase() && x.status === 'active');
      const self = memberOf(req);
      if (sharer && (!self || self.id !== sharer.id) && !require_bot(req)) award(sharer, 'refVisit', `${today()}:${visitor(req)}`);
      send(res, 200, { ok: true });
    });
    r.post('/api/club/social', async (req, res) => {
      const m = me(req);
      const b = await readJson(req, 512);
      if (!socials().includes(b.platform)) throw fail(400, 'Pick one of TAM’s socials.');
      const got = m.status === 'active' ? award(m, 'social', b.platform) : null;
      send(res, 200, { got: got ? got.pts : 0, member: view(m) });
    });
    r.post('/api/club/claim', async (req, res) => {
      const m = me(req);
      if (m.status !== 'active') throw fail(409, 'Confirm your email first.');
      const v = view(m);
      if (v.reward) throw fail(409, 'You already have a drink waiting: show the code at the bar.');
      if (v.balance < HALF) throw fail(409, `You need ${HALF - v.balance} more points.`);
      if (v.nextClaimAt) throw fail(409, 'One drink a week: your next one unlocks soon.');
      const b = await readJson(req, 512).catch(() => ({}));
      const drink = DRINKS[b.drink] ? b.drink : 'half';
      const rw = { id: newId('HALF', 6), m: m.id, code: code(6), drink, issuedAt: iso(), expires: iso(ctx.now() + REWARD_DAYS * DAY) };
      db.clubRewards.push(rw);
      db.clubLedger.push({ id: newId('PT', 8), m: m.id, rule: 'half', key: rw.id, pts: -HALF, at: iso(), day: today() });
      await save();
      send(res, 201, { member: view(m) });
    });

    // the card at the bar or door: anyone sees a first name; staff get the buttons
    const staffCard = (req, card) => {
      if (!ctx.isDoor(req)) throw fail(401, 'Staff only: sign in to the door page first.');
      const m = db.members.find((x) => x.card === String(card).toUpperCase());
      if (!m) throw fail(404, 'No TAM Club card with that code.');
      return m;
    };
    const staffView = (m) => {
      const v = view(m);
      return { name: v.firstName || 'Member', photo: m.photo || '', tier: v.tier.name, balance: v.balance, reward: v.reward, status: m.status,
        today: ledgerOf(m).filter((x) => x.day === today()).map((x) => ({ label: RULES[x.rule].label, pts: x.pts })) };
    };
    r.get('/api/club/card/:card', (req, res, { params }) => send(res, 200, { card: staffView(staffCard(req, params.card)) }));
    r.post('/api/club/card/:card/here', async (req, res, { params }) => {
      const m = staffCard(req, params.card);
      const got = award(m, 'attend', `door:${today()}`);
      send(res, 200, { got: got ? got.pts : 0, card: staffView(m), note: got ? '' : 'Already counted tonight.' });
    });
    r.post('/api/club/card/:card/bar', async (req, res, { params }) => {
      const m = staffCard(req, params.card);
      const b = await readJson(req, 512);
      const pounds = Number(b.pounds);
      if (!(pounds > 0 && pounds <= 500)) throw fail(400, 'Type what they spent, in pounds.');
      const got = award(m, 'bar', newId('BAR', 6), { pts: pounds, note: `£${pounds.toFixed(2)}` });
      send(res, 200, { got: got ? got.pts : 0, card: staffView(m), note: got ? '' : 'They’ve had today’s 30 bar points.' });
    });
    r.post('/api/club/card/:card/pour', async (req, res, { params }) => {
      const m = staffCard(req, params.card);
      const b = await readJson(req, 512);
      const rw = liveReward(m);
      if (!rw) throw fail(409, 'No drink to pour on this card.');
      if (b.code && String(b.code).toUpperCase() !== rw.code) throw fail(400, 'That code doesn’t match their card.');
      rw.redeemedAt = iso();
      rw.by = (ctx.team.whoAmI(req) || {}).name || 'Door';
      await save();
      send(res, 200, { card: staffView(m), poured: true });
    });

    // one-click unsubscribe (RFC 8058) and the page's buttons
    r.post('/api/club/unsubscribe', async (req, res, { url }) => {
      let b = {};
      try { b = await readJson(req, 1024); } catch { /* a mail client posts a form body */ }
      const t = String(b.t || url.searchParams.get('t') || '');
      const m = t && db.members.find((x) => x.unsub === t);
      if (!m) throw fail(404, 'That link isn’t right. Open your card to change your emails.');
      if (b.action === 'monthly' || b.action === 'big') { m.frequency = b.action; m.emails = true; }
      else { m.emails = false; m.unsubscribedAt = iso(); const last = db.issues.filter((x) => x.recipients && x.recipients[m.id]).pop(); if (last) m.unsubIssue = last.id; }
      await save();
      send(res, 200, { ok: true, emails: m.emails, frequency: m.frequency });
    });

    // ----- staff -----
    const guard = (req) => ctx.team.guard(req, 'ops');
    r.get('/api/club/manage', (req, res) => {
      const who = guard(req);
      const active = db.members.filter((m) => m.status === 'active');
      const tally = (list, f) => list.reduce((o, x) => { for (const k of [].concat(f(x))) o[k] = (o[k] || 0) + 1; return o; }, {});
      const since = (d) => active.filter((m) => Date.parse(m.confirmedAt) > ctx.now() - d * DAY).length;
      for (const m of active) settle(m);
      send(res, 200, {
        me: { name: who.name, email: who.email, role: who.role }, mail: ctx.mail.enabled(),
        stats: {
          members: active.length, pending: db.members.filter((m) => m.status === 'pending').length,
          emailsOn: active.filter((m) => m.emails).length, joined7: since(7), joined30: since(30),
          bySource: tally(active, (m) => m.source || 'tam.tv'), byInterest: tally(active, (m) => (m.interests.length ? m.interests : ['(everything)'])),
          byFrequency: tally(active.filter((m) => m.emails), (m) => m.frequency), byTier: tally(active, (m) => tierOf(earnedOf(m)).name),
          rewards: { issued: db.clubRewards.length, poured: db.clubRewards.filter((x) => x.redeemedAt).length, live: db.clubRewards.filter((x) => !x.redeemedAt && !x.refundedAt && Date.parse(x.expires) > ctx.now()).length, expired: db.clubRewards.filter((x) => x.refundedAt).length },
          pointsWeek: db.clubLedger.filter((x) => x.pts > 0 && Date.parse(x.at) > ctx.now() - 7 * DAY).reduce((t, x) => t + x.pts, 0),
          byRule: tally(db.clubLedger.filter((x) => Date.parse(x.at) > ctx.now() - 30 * DAY), (x) => x.rule),
          recent: db.clubLedger.slice(-20).reverse().map((x) => ({ at: x.at, who: firstName(byId(x.m) || {}) || 'Member', label: RULES[x.rule].label, pts: x.pts })),
        },
        issues: db.issues.slice().reverse().map((x) => issueView(x)),
        interests: Object.fromEntries(Object.entries(INTERESTS).map(([k, v]) => [k, v.label])), frequencies: FREQUENCIES,
        kinds: ISSUE_KINDS, segments: SEGMENTS, rules: Object.fromEntries(Object.entries(RULES).filter(([, x]) => !x.hidden).map(([k, x]) => [k, { label: x.label, pts: x.pts, unit: Boolean(x.unit), hint: x.hint || '' }])),
        half: HALF, tiers: TIERS,
      });
    });
    r.get('/api/club/members', (req, res, { url }) => {
      guard(req);
      const q = String(url.searchParams.get('q') || '').toLowerCase().trim();
      const list = db.members.filter((m) => !q || m.email.includes(q) || String(m.name).toLowerCase().includes(q) || m.card === q.toUpperCase()).slice(-50).reverse();
      send(res, 200, { members: list.map((m) => ({ id: m.id, name: m.name, email: m.email, status: m.status, emails: m.emails, frequency: m.frequency, interests: m.interests, source: m.source, joined: m.confirmedAt || m.createdAt, balance: balanceOf(m), tier: tierOf(earnedOf(m)).name, card: m.card })) });
    });
    r.post('/api/club/members/:id/gift', async (req, res, { params }) => {
      const who = guard(req);
      const m = byId(params.id);
      if (!m) throw fail(404, 'No such member.');
      const b = await readJson(req, 1024);
      const pts = Math.floor(Number(b.points));
      if (!(pts > 0 && pts <= 100)) throw fail(400, 'Gift between 1 and 100 points.');
      award(m, 'gift', newId('G', 6), { pts, note: text(b.note, 80) || `from ${who.name}` });
      send(res, 200, { balance: balanceOf(m) });
    });
    r.get('/api/club/members.csv', (req, res) => {
      guard(req);
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['Name', 'Email', 'Status', 'Emails on', 'How often', 'Interests', 'Source', 'Joined', 'Points', 'Tier', 'Consent'],
        ...db.members.map((m) => [m.name, m.email, m.status, m.emails ? 'yes' : 'no', m.frequency, m.interests.join(' '), m.source, m.confirmedAt || m.createdAt, balanceOf(m), tierOf(earnedOf(m)).name, m.consent])];
      send(res, 200, rows.map((r0) => r0.map(q).join(',')).join('\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tam-club.csv"' });
    });
    r.get('/api/club/issues/:id', (req, res, { params }) => {
      guard(req);
      const x = db.issues.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'No such issue.');
      send(res, 200, { issue: { ...issueView(x, true), audience: audience(x).length, topLinks: Object.entries(x.links || {}).sort((a, b) => b[1] - a[1]).slice(0, 10) } });
    });
    r.post('/api/club/issues', async (req, res) => {
      const who = guard(req);
      const x = saveIssue(await readJson(req, 64 * 1024), who);
      await save();
      send(res, 200, { issue: { ...issueView(x, true), audience: audience(x).length } });
    });
    r.post('/api/club/issues/digest', async (req, res) => {
      const x = digest(guard(req));
      await save();
      send(res, 201, { issue: { ...issueView(x, true), audience: audience(x).length } });
    });
    r.post('/api/club/issues/:id/count', async (req, res) => {
      guard(req);
      const b = await readJson(req, 4096);
      send(res, 200, { to: audience({ kind: ISSUE_KINDS[b.kind] ? b.kind : 'weekly', segment: { interests: pickInterests((b.segment || {}).interests), engagement: (b.segment || {}).engagement } }).length });
    });
    r.get('/api/club/issues/:id/preview', (req, res, { params, url }) => {
      const who = guard(req);
      const x = db.issues.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'No such issue.');
      const sample = byEmail(who.email) || { id: 'preview', name: who.name, email: who.email, interests: [], unsub: 'preview', source: '' };
      const out = render(x, sample, { variant: url.searchParams.get('v') === 'b' ? 'b' : 'a', track: false });
      send(res, 200, out.html.replace('<body', `<body data-subject="${e(out.subject)}"`), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; img-src * data:; style-src 'unsafe-inline'" });
    });
    r.post('/api/club/issues/:id/test', async (req, res, { params }) => {
      const who = guard(req);
      if (!ctx.mail.enabled()) throw fail(409, 'Email is off: set RESEND_API_KEY.');
      const x = db.issues.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'No such issue.');
      const b = await readJson(req, 1024);
      const to = cleanEmail(b.to) || who.email;
      if (!to) throw fail(400, 'Add the address to send the test to.');
      const sample = byEmail(to) || { id: 'test', name: who.name, email: to, interests: [], unsub: 'test', source: 'test' };
      for (const v of x.subjectB ? ['a', 'b'] : ['a']) {
        const out = render(x, sample, { variant: v, track: false });
        await ctx.mail.send({ to, subject: `[Test${x.subjectB ? ` ${v.toUpperCase()}` : ''}] ${out.subject}`, html: out.html, text: out.text });
      }
      send(res, 200, { ok: true, to });
    });
    r.post('/api/club/issues/:id/send', async (req, res, { params }) => {
      guard(req);
      if (!ctx.mail.enabled()) throw fail(409, 'Email is off: set RESEND_API_KEY.');
      const x = db.issues.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'No such issue.');
      if (!['draft', 'scheduled'].includes(x.status)) throw fail(409, 'That issue has already gone.');
      const b = await readJson(req, 1024);
      const at = b.at ? Date.parse(b.at) : 0;
      if (b.at && !(at > ctx.now())) throw fail(400, 'Pick a time in the future.');
      if (!audience(x).length) throw fail(409, 'Nobody is in that audience yet.');
      if (at) { x.status = 'scheduled'; x.sendAt = iso(at); await save(); return send(res, 200, { issue: issueView(x) }); }
      if (sending) throw fail(409, 'Another issue is still sending. Try again in a few minutes.');
      x.sendAt = iso();
      run(x).catch((err) => console.error(`Newsletter ${x.id}: ${err.message}`));
      send(res, 202, { issue: issueView(x), to: audience(x).length });
    });
    r.post('/api/club/issues/:id/cancel', async (req, res, { params }) => {
      guard(req);
      const x = db.issues.find((y) => y.id === params.id);
      if (!x || !['scheduled', 'sending'].includes(x.status)) throw fail(409, 'Only a scheduled or sending issue can be stopped.');
      x.status = x.status === 'sending' ? 'stopped' : 'draft';
      await save();
      send(res, 200, { issue: issueView(x) });
    });
    r.post('/api/club/issues/:id/duplicate', async (req, res, { params }) => {
      const who = guard(req);
      const x = db.issues.find((y) => y.id === params.id);
      if (!x) throw fail(404, 'No such issue.');
      const copy = saveIssue({ ...x, id: null, subject: `${x.subject}` }, who);
      await save();
      send(res, 201, { issue: { ...issueView(copy, true), audience: audience(copy).length } });
    });
    r.post('/api/club/issues/:id/delete', async (req, res, { params }) => {
      guard(req);
      const x = db.issues.find((y) => y.id === params.id);
      if (!x || x.status !== 'draft') throw fail(409, 'Only drafts can be deleted.');
      db.issues = db.issues.filter((y) => y !== x);
      await save();
      send(res, 200, { ok: true });
    });
  }

  // On the site router (it isn't under /api/): src/app.js
  function pageRoutes(r) {
    // newsletter clicks: count, give the point, go
    r.get('/c/:issue/:member/:sig', async (req, res, { params, url }) => {
      const u = url.searchParams.get('u') || '';
      const ok = /^https?:\/\//.test(u) && crypto.createHmac('sha256', ctx.secret).update(`${params.issue}|${params.member}|${u}`).digest('hex').slice(0, 16) === params.sig;
      if (!ok) { res.writeHead(302, { Location: '/' }); return res.end(); }
      const issue = db.issues.find((x) => x.id === params.issue);
      const rec = issue && issue.recipients && issue.recipients[params.member];
      if (rec && !require_bot(req)) {
        rec.clicks = (rec.clicks || 0) + 1;
        issue.links = issue.links || {};
        issue.links[u] = (issue.links[u] || 0) + 1;
        const m = byId(params.member);
        if (m) award(m, 'click', issue.id);
        save();
      }
      res.writeHead(302, { Location: u, 'Cache-Control': 'no-store' });
      res.end();
    });

  }

  const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|embedly|curl|wget|python|headless|lighthouse|proofpoint|mimecast|barracuda/i;
  function require_bot(req) { return BOTS.test(req.headers['user-agent'] || ''); }

  const archive = () => db.issues.filter((x) => x.status === 'sent' && x.archive !== false).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));

  return {
    routes, pageRoutes, memberOf, view, award, awardEmail, awardReq, join, render, archive, tick, audience,
    byCard: (card) => db.members.find((m) => m.card === String(card).toUpperCase()),
    byRef: (ref) => db.members.find((m) => m.refCode === String(ref).toUpperCase() && m.status === 'active'),
    publicCard: (m) => { const v = view(m); return { firstName: v.firstName, photo: m.photo || '', tier: v.tier.name, badges: v.badges }; },
  };
}
