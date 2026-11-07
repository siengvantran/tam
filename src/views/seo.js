// sitemap.xml, robots.txt, .ics calendar files, health check.

import { send, fail } from '../lib/http.js';

const icsText = (s) => String(s || '').replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
const icsDate = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function seoRoutes(r, ctx) {
  const c = ctx.content;
  r.get('/healthz', (req, res) => send(res, 200, { ok: true }));
  r.get('/calendar.ics', (req, res) => send(res, 200, calendarFeed(ctx), { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=900' }));
  r.get('/robots.txt', (req, res) => {
    // A preview stays crawlable so search engines see its noindex header, but advertises no sitemap.
    if (!ctx.cfg.indexing || !req.indexable) return send(res, 200, 'User-agent: *\nAllow: /\n', { 'Content-Type': 'text/plain; charset=utf-8' });
    const rules = ['/admin', '/door', '/raffle-desk', '/ticket/', '/pay/', '/card/', '/api/', '/shows', '/staff/', '/great-british-blues-jam/manage'].map((p) => `Disallow: ${p}`).join('\n');
    // Search engines and AI assistants (Google's AI Mode and Gemini, ChatGPT, Claude, Perplexity, Apple) are all welcome to the public site.
    const bots = ['Googlebot', 'Google-Extended', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Applebot', 'Applebot-Extended', 'DuckAssistBot', '*'];
    send(res, 200, `# TAM, Temple of Art and Music. A guide for AI assistants: ${ctx.cfg.siteUrl}/llms.txt\n# Every upcoming night as data: ${ctx.cfg.siteUrl}/whats-on.json\n\n${bots.map((b) => `User-agent: ${b}`).join('\n')}\nAllow: /\n${rules}\n\nSitemap: ${ctx.cfg.siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
  });
  r.get('/sitemap.xml', (req, res) => {
    const urls = new Set(['/', '/whats-on', '/great-british-blues-jam', '/festivals', '/artists', '/archive', '/tv', '/verify', '/privacy']);
    for (const f of c.festivals) urls.add(f.path);
    for (const n of c.nights) urls.add(`/events/${n.slug}`);
    for (const a of c.artists) urls.add(`/artists/${a.slug}`);
    for (const p of c.legacy) if (p.path !== '/home') urls.add(p.path);
    for (const y of new Set(c.past.map((e) => e.year))) urls.add(`/archive/${y}`);
    for (const col of c.collections) urls.add(`/collections/${col.slug}`);
    for (const u of [...urls]) if (c.canonicalElsewhere.has(u)) urls.delete(u); // their home is another site
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u) => `<url><loc>${ctx.cfg.siteUrl}${encodeURI(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
    send(res, 200, body, { 'Content-Type': 'application/xml; charset=utf-8' });
  });
}

// /calendar.ics: every upcoming night at TAM, to subscribe to in Google or Apple Calendar.
export function calendarFeed(ctx) {
  const c = ctx.content;
  const stamp = icsDate(new Date(ctx.now()).toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TAM//TAM.TV//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:TAM · Temple of Art and Music', 'X-WR-TIMEZONE:Europe/London'];
  for (const n of c.upcoming(ctx.today()).slice(0, 400)) {
    const v = c.venueBy.get(n.venue);
    const when = n.timesTbc
      ? [`DTSTART;VALUE=DATE:${n.date.replace(/-/g, '')}`]
      : [`DTSTART:${icsDate(n.start)}`, `DTEND:${icsDate(n.end)}`];
    lines.push('BEGIN:VEVENT', `UID:${n.slug}@tam.tv`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${icsText(n.label && n.label !== n.title ? `${n.title}: ${n.label}` : n.title)}`,
      `LOCATION:${icsText(v ? `${v.name}, ${v.address}` : 'TAM')}`, `URL:${ctx.cfg.siteUrl}/events/${n.slug}`, `DESCRIPTION:${icsText(`${n.summary || ''}\n${ctx.cfg.siteUrl}/events/${n.slug}`.trim())}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR', '');
  return lines.map(fold).join('\r\n');
}
// Lines over 75 octets are folded, as calendars expect.
function fold(line) {
  const b = Buffer.from(line);
  if (b.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < b.length) {
    let end = Math.min(b.length, i + (i ? 74 : 75));
    while (end < b.length && (b[end] & 0xc0) === 0x80) end--; // never split a character
    out.push((i ? ' ' : '') + b.subarray(i, end).toString());
    i = end;
  }
  return out.join('\r\n');
}

// /events/<slug>.ics (called from the event page route)
export function serveIcs(ctx, res, slug) {
  const c = ctx.content;
  {
    const n = c.nightBy.get(slug);
    if (!n) throw fail(404, 'Not found.');
    const v = c.venueBy.get(n.venue);
    const when = n.timesTbc
      ? [`DTSTART;VALUE=DATE:${n.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${new Date(Date.parse(`${n.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10).replace(/-/g, '')}`]
      : [`DTSTART:${icsDate(n.start)}`, `DTEND:${icsDate(n.end)}`];
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TAM//TAM.TV//EN', 'BEGIN:VEVENT', `UID:${n.slug}@tam.tv`, `DTSTAMP:${icsDate(new Date(ctx.now()).toISOString())}`,
      ...when, `SUMMARY:${icsText(n.title)}`, `LOCATION:${icsText(v ? `${v.name}, ${v.address}` : 'TAM')}`, `URL:${ctx.cfg.siteUrl}/events/${n.slug}`,
      `DESCRIPTION:${icsText(n.summary)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
    send(res, 200, body, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${n.slug}.ics"` });
  }
}
