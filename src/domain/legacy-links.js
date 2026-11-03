// The old www.tam.tv: every one of its pages stays live at its address
// (src/app.js serves them), but the new site doesn't link to the ones only
// the old site has until staff reconnect them. From /admin → Old site, any
// old page can be put back in the header or footer navigation, with its own
// label. Reconnecting a page also brings back the new site's own links to it
// (the pathway cards that point at /singers, /private-parties and so on).

import { fail, send, readJson } from '../lib/http.js';

const PLACES = ['header', 'footer'];
const clean = (href) => (String(href || '').split(/[?#]/)[0].replace(/(.)\/$/, '$1')) || '/';

export function legacyLinks(ctx) {
  const { db, save, content: c } = ctx;
  if (!db.legacyNav || typeof db.legacyNav !== 'object') db.legacyNav = {};
  let oldOnly = new Set();

  // Which old pages only the old site has. A page the new site serves itself (the
  // home page, What's on, an artist with a new page, a festival) isn't one. Nor is
  // a venue's page: that's the new site's "Find us", built around the old page.
  function classify(router) {
    const venues = new Set(c.venues.map((v) => v.legacy).filter(Boolean));
    oldOnly = new Set(c.legacy.filter((p) => {
      if (p.path === '/home' || venues.has(p.path)) return false;
      const m = router.match('GET', p.path);
      if (!m) return true;
      if (/^\/artists\/[^/]+$/.test(p.path)) return !c.artistBy.get(p.path.slice(9)); // falls back to the old page
      return false;
    }).map((p) => p.path));
  }

  const isOldOnly = (href) => oldOnly.has(clean(href));
  // May the new site link here? Yes, unless it's an old-only page staff haven't reconnected.
  const linkable = (href) => !String(href).startsWith('/') || !isOldOnly(href) || Boolean(db.legacyNav[clean(href)]);
  const titleOf = (path) => (c.legacyBy.get(path) || {}).title || path;
  const navLinks = (place) => Object.entries(db.legacyNav)
    .filter(([p, v]) => v.place === place && c.legacyBy.get(p))
    .sort((a, b) => (a[1].at || '').localeCompare(b[1].at || ''))
    .map(([path, v]) => ({ path, label: v.label || titleOf(path) }));

  const list = () => c.legacy.filter((p) => p.path !== '/home').map((p) => ({
    path: p.path, title: p.title, oldOnly: oldOnly.has(p.path), nav: db.legacyNav[p.path] || null,
  }));

  function routes(r) {
    r.post('/api/admin/legacy', async (req, res) => {
      if (!ctx.isAdmin(req)) throw fail(401, 'Wrong admin token.');
      const b = await readJson(req);
      const path = clean(b.path);
      if (!c.legacyBy.get(path) || path === '/home') throw fail(404, 'That isn’t a page of the old site.');
      const place = String(b.place || 'off');
      if (place === 'off') delete db.legacyNav[path];
      else {
        if (!PLACES.includes(place)) throw fail(400, 'Choose header, footer or off.');
        const label = String(b.label || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        db.legacyNav[path] = { place, label, at: (db.legacyNav[path] || {}).at || new Date(ctx.now()).toISOString() };
      }
      await save();
      send(res, 200, { ok: true, nav: db.legacyNav[path] || null });
    });
  }

  return { classify, isOldOnly, linkable, navLinks, list, routes };
}
