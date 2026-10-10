import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createHash } from 'node:crypto';

import { loadContent, queries } from './lib/content.js';
import { sitemap, robots, llmsTxt, graph, paths } from './lib/seo.js';
import { GENRE_NAMES } from './lib/content.js';
import { artwork } from './lib/brand.js';
import { append, validateSubmission, validateSignup, validateDemand, demandCounts } from './lib/store.js';
import { aiEnabled, productionPackage } from './lib/ai.js';
import * as views from './views.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const MAX_BODY = 64 * 1024;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://i.ytimg.com https://img.evbuc.com",
  'frame-src https://www.youtube-nocookie.com',
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { const e = new Error('Payload too large'); e.status = 413; e.expose = true; throw e; }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    try { return JSON.parse(text || '{}'); } catch { const e = new Error('Invalid JSON'); e.status = 400; e.expose = true; throw e; }
  }
  const params = new URLSearchParams(text);
  const out = {};
  for (const k of new Set(params.keys())) {
    const all = params.getAll(k);
    out[k] = all.length > 1 ? all : all[0];
  }
  return out;
}

const tokenMatches = (given, expected) => {
  if (!expected || !given) return false;
  const a = createHash('sha256').update(String(given)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
};

function ics(c, e, venue) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escText = (t) => String(t).replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const end = new Date(Date.parse(e.start) + 3 * 3600e3).toISOString();
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TAM.TV//TAM//EN', 'BEGIN:VEVENT',
    `UID:${e.slug}@tam.tv`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escText(`${e.title} — TAM`)}`,
    `DESCRIPTION:${escText(`Tickets: ${e.url}`)}`,
    `LOCATION:${escText(venue ? `${venue.name}, ${venue.address}` : e.venueName || 'London')}`,
    `URL:${c.site.url}${paths.event(e.slug)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export function createApp({ content = loadContent(), clock = () => new Date() } = {}) {
  const c = content;
  // Public "Bring them back" / "I was there" totals, loaded once, then kept in memory.
  let counts = new Map();
  const ready = demandCounts().then((m) => { counts = m; });
  // One press per person per target per day, without storing IPs.
  const recent = new Set();
  let recentDay = '';
  // Old URLs that now live elsewhere (301 keeps their search value).
  const MOVED = { '/home': '/', '/watch': '/tv', '/festival': '/whats-on', '/events': '/whats-on' };

  const send = (res, status, body, type = 'text/html; charset=utf-8', headers = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      ...(type.startsWith('text/html') ? { 'Content-Security-Policy': CSP, 'Cache-Control': 'no-cache' } : {}),
      ...headers,
    });
    res.end(body);
  };
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };
  const moved = (res, to) => { res.writeHead(301, { Location: to, 'Cache-Control': 'public, max-age=86400' }); res.end(); };
  let graphCache = null;

  async function serveStatic(res, urlPath) {
    const file = path.normalize(path.join(PUBLIC, urlPath));
    if (!file.startsWith(PUBLIC + path.sep)) return false;
    try {
      const s = await stat(file);
      if (!s.isFile()) return false;
      send(res, 200, await readFile(file), MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'public, max-age=3600' });
      return true;
    } catch { return false; }
  }

  const artName = (slug) => {
    const q = queries(c);
    const a = q.artist(slug);
    if (a) return { name: a.name, legend: a.legend };
    const e = q.event(slug);
    if (e) return { name: e.slug, label: false, legend: e.performers.some((x) => q.artist(x)?.legend) };
    return null;
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const now = clock();
    const cookies = parseCookies(req.headers.cookie);
    const ctx = { c, q: queries(c, now), now, path: p, consent: cookies.tam_consent };
    const page = (html, status = 200) => send(res, status, html);
    const m = (re) => re.exec(p);
    let match;

    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        await ready;
        const q = ctx.q;
        if (MOVED[p]) return moved(res, MOVED[p]);
        if ((match = m(/^\/watch\/([a-z0-9-]+)$/))) return moved(res, '/tv');
        if (p === '/') return page(views.home(ctx));
        if (p === '/whats-on') return page(views.whatsOn(ctx));
        if ((match = m(/^\/events\/([a-z0-9-]+)\.ics$/))) {
          const e = q.event(match[1]);
          if (e) return send(res, 200, ics(c, e, q.venue(e.venue)), 'text/calendar; charset=utf-8', { 'Content-Disposition': `attachment; filename="${e.slug}.ics"` });
        }
        if ((match = m(/^\/events\/([a-z0-9-]+)$/)) && q.event(match[1])) return page(views.eventPage(ctx, q.event(match[1]), { counts }));
        if (p === '/artists') return page(views.artists(ctx));
        if ((match = m(/^\/artists\/([a-z0-9-]+)$/i)) && q.artist(match[1])) return page(views.artistPage(ctx, q.artist(match[1]), { counts }));
        if (p === '/archive') return page(views.archive(ctx));
        if ((match = m(/^\/archive\/(\d{4})$/)) && q.eventsInYear(match[1]).length) return page(views.archiveYear(ctx, match[1]));
        if (p === '/series') return page(views.seriesIndex(ctx));
        if ((match = m(/^\/series\/([a-z0-9-]+)$/)) && q.series(match[1])) return page(views.seriesPage(ctx, q.series(match[1])));
        if (p === '/genres') return page(views.genresIndex(ctx));
        if ((match = m(/^\/genres\/([a-z0-9-]+)$/)) && GENRE_NAMES[match[1]] && q.eventsInGenre(match[1]).length) return page(views.genrePage(ctx, match[1]));
        if (p === '/locations') return page(views.locations(ctx));
        if ((match = m(/^\/locations\/([a-z0-9-]+)$/)) && q.venue(match[1])) return page(views.venuePage(ctx, q.venue(match[1])));
        if (p === '/tv') return page(views.tv(ctx));
        if ((match = m(/^\/tv\/([a-z0-9-]+)$/)) && q.video(match[1])) return page(views.videoPage(ctx, q.video(match[1])));
        if (p === '/listen') return page(views.listen(ctx));
        if (p === '/stories') return page(views.stories(ctx));
        if ((match = m(/^\/stories\/([a-z0-9-]+)$/)) && q.story(match[1])) return page(views.storyPage(ctx, q.story(match[1])));
        if (p === '/about') return page(views.about(ctx));
        if (p === '/submit') return page(views.submit(ctx, { done: url.searchParams.has('thanks') }));
        if (p === '/privacy') return page(views.privacy(ctx));
        if (p === '/studio') return page(views.studio(ctx, { aiEnabled: aiEnabled() && Boolean(process.env.ADMIN_TOKEN) }));
        // Every other page of the old www.tam.tv, at its original address.
        if (q.legacy(p)) return page(views.legacyPage(ctx, q.legacy(p)));

        // Brand: the original logo files are served from /img; these are aliases.
        const svg = (body, maxAge = 86400) => send(res, 200, body, 'image/svg+xml', { 'Cache-Control': `public, max-age=${maxAge}` });
        if (p === '/favicon.ico' || p === '/favicon.png') return serveStatic(res, '/img/favicon-48.png');
        if (p === '/apple-touch-icon.png') return serveStatic(res, '/img/apple-touch-icon.png');
        if ((match = m(/^\/art\/([a-z0-9-]+)\.svg$/))) {
          const s = artName(match[1]);
          if (s) return svg(artwork(s.name, { genre: s.genre, size: 512, label: s.label !== false, legend: s.legend }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
        }
        if (p === '/chorus.json') return send(res, 200, JSON.stringify(c.chorus.songs.map(({ title, artist, year, chorus }) => ({ title, artist, year, chorus }))), 'application/json; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });

        // Discovery.
        if (p === '/robots.txt') return send(res, 200, robots(c.site), 'text/plain; charset=utf-8');
        if (p === '/sitemap.xml') return send(res, 200, sitemap(c, ctx.q), 'application/xml; charset=utf-8');
        if (p === '/llms.txt') return send(res, 200, llmsTxt(c, ctx.q), 'text/plain; charset=utf-8');
        if (p === '/graph.json') return send(res, 200, (graphCache ||= JSON.stringify(graph(c, ctx.q))), 'application/ld+json; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
        if (p === '/healthz') return json(res, 200, { ok: true });

        if (/^\/(css|js|img)\//.test(p) && await serveStatic(res, p)) return;
        return page(views.notFound(ctx), 404);
      }

      if (req.method === 'POST') {
        if (p === '/submit') {
          const body = await readBody(req);
          if (body.website) return redirect(res, '/submit?thanks'); // honeypot
          const r = validateSubmission(body);
          if (!r.ok) return page(views.submit(ctx, { values: { ...body, ...r.value }, errors: r.errors }), 422);
          await append('submissions.jsonl', { ...r.value, status: 'new' });
          if (r.value.newsletter) await append('signups.jsonl', { email: r.value.email, interests: [r.value.genre].filter(Boolean), consent: true, source: 'submission' });
          return redirect(res, '/submit?thanks');
        }
        if (p === '/signup') {
          const body = await readBody(req);
          const r = validateSignup(body);
          if (!r.ok) return page(views.signupResult(ctx, r), 422);
          await append('signups.jsonl', { ...r.value, source: String(body.from || '').slice(0, 200) });
          return page(views.signupResult(ctx, r));
        }
        if (p === '/demand') {
          await ready;
          const body = await readBody(req);
          const exists = (kind, slug) => Boolean(kind === 'artist' ? ctx.q.artist(slug) : ctx.q.event(slug));
          const r = validateDemand(body, exists);
          const wantsJson = (req.headers.accept || '').includes('application/json');
          const back = typeof body.back === 'string' && /^\/[\w\-/]*$/.test(body.back) ? body.back : '/';
          if (!r.ok) return wantsJson ? json(res, 422, { error: Object.values(r.errors).join(' ') }) : page(views.demandResult(ctx, { ok: false, errors: r.errors, back }), 422);
          const key = `${r.value.type}:${r.value.target}`;
          const today = new Date().toISOString().slice(0, 10);
          if (today !== recentDay) { recent.clear(); recentDay = today; }
          const who = createHash('sha256').update(`${req.socket.remoteAddress}|${req.headers['user-agent'] || ''}|${key}|${today}`).digest('base64');
          const repeat = recent.has(who) && !r.value.email;
          if (!repeat) {
            recent.add(who);
            await append('demand.jsonl', { ...r.value, visitor: typeof cookies.tam_vid === 'string' && cookies.tam_consent === 'granted' ? cookies.tam_vid.slice(0, 64) : undefined });
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          return wantsJson ? json(res, 200, { count: counts.get(key) || 0 }) : redirect(res, back);
        }
        if (p === '/api/track') {
          // Consent is enforced server-side too: without it, nothing is stored.
          if (cookies.tam_consent !== 'granted') { res.writeHead(204); return res.end(); }
          const body = await readBody(req);
          const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
          await append('events.jsonl', {
            visitor: str(cookies.tam_vid, 64),
            type: ['view', 'play', 'click', 'calendar'].includes(body.type) ? body.type : 'view',
            path: str(body.path, 300),
            ref: str(body.ref, 300),
          });
          res.writeHead(204);
          return res.end();
        }
        if (p === '/api/agent/production') {
          if (!tokenMatches(req.headers['x-admin-token'], process.env.ADMIN_TOKEN)) return json(res, 401, { error: 'Unauthorised' });
          const body = await readBody(req);
          const artist = ctx.q.artist(body.artist);
          if (!artist) return json(res, 400, { error: 'Unknown artist' });
          const found = body.event ? ctx.q.event(body.event) : null;
          const event = found ? { ...found, venueLabel: ctx.q.venue(found.venue)?.name || found.venueName } : null;
          const pkg = await productionPackage({
            artist, event, notes: String(body.notes || '').slice(0, 6000), pageUrl: `${c.site.url}${paths.artist(artist.slug)}`,
          });
          return json(res, 200, pkg);
        }
      }

      res.writeHead(405, { Allow: 'GET, HEAD, POST' });
      return res.end();
    } catch (err) {
      const status = err.status || 500;
      if (!err.expose) console.error(err);
      const message = err.expose ? err.message : 'Something went wrong';
      if (p.startsWith('/api/')) return json(res, status, { error: message });
      return send(res, status, message, 'text/plain; charset=utf-8');
    }
  };
}
