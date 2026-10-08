// Content layer. For the MVP the "CMS" is a folder of JSON files in /content,
// edited in GitHub. Everything else (pages, structured data, sitemap, the
// knowledge-graph export) is derived from these records, so swapping in a
// headless CMS or database later only means replacing this module.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = process.env.CONTENT_DIR || path.join(here, '..', '..', 'content');

const read = (name) => JSON.parse(readFileSync(path.join(CONTENT_DIR, `${name}.json`), 'utf8'));

export function loadContent() {
  const site = read('site');
  if (process.env.SITE_URL) site.url = process.env.SITE_URL.replace(/\/$/, '');
  const c = {
    site,
    strands: read('strands'),
    artists: read('artists'),
    events: read('events').sort((a, b) => a.start.localeCompare(b.start)),
    videos: read('videos').sort((a, b) => b.published.localeCompare(a.published)),
    stories: read('stories').sort((a, b) => b.published.localeCompare(a.published)),
    listen: read('listen'),
    legacy: read('archive'),
  };
  validate(c);
  return c;
}

// Fail fast on broken references: a typo in a slug should break the build,
// not silently drop an artist from an event page.
export function validate(c) {
  const errors = [];
  const slugs = (list) => new Set(list.map((x) => x.slug));
  const artists = slugs(c.artists);
  const events = slugs(c.events);
  const strands = slugs(c.strands);
  for (const kind of ['artists', 'events', 'videos', 'stories', 'strands']) {
    const seen = new Set();
    for (const item of c[kind]) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug || '')) errors.push(`${kind}: bad slug "${item.slug}"`);
      if (seen.has(item.slug)) errors.push(`${kind}: duplicate slug "${item.slug}"`);
      seen.add(item.slug);
    }
  }
  for (const a of c.artists) for (const r of a.related || []) if (!artists.has(r)) errors.push(`artist ${a.slug}: unknown related "${r}"`);
  for (const e of c.events) {
    if (!strands.has(e.strand)) errors.push(`event ${e.slug}: unknown strand "${e.strand}"`);
    if (Number.isNaN(Date.parse(e.start))) errors.push(`event ${e.slug}: bad start`);
    for (const a of e.artists) if (!artists.has(a)) errors.push(`event ${e.slug}: unknown artist "${a}"`);
  }
  for (const v of c.videos) {
    if (v.artist && !artists.has(v.artist)) errors.push(`video ${v.slug}: unknown artist "${v.artist}"`);
    if (v.event && !events.has(v.event)) errors.push(`video ${v.slug}: unknown event "${v.event}"`);
    if (v.youtubeId && !/^[\w-]{11}$/.test(v.youtubeId)) errors.push(`video ${v.slug}: bad youtubeId`);
  }
  for (const s of c.stories) {
    for (const a of s.related?.artists || []) if (!artists.has(a)) errors.push(`story ${s.slug}: unknown artist "${a}"`);
    for (const e of s.related?.events || []) if (!events.has(e)) errors.push(`story ${s.slug}: unknown event "${e}"`);
  }
  if (errors.length) throw new Error(`Content errors:\n  ${errors.join('\n  ')}`);
}

// Query helpers used by the views.
export function queries(c, now = new Date()) {
  const by = (list) => Object.fromEntries(list.map((x) => [x.slug, x]));
  const artistBy = by(c.artists);
  const eventBy = by(c.events);
  const strandBy = by(c.strands);
  const isPast = (e) => Date.parse(e.end || e.start) < now.getTime();
  return {
    artist: (s) => artistBy[s],
    event: (s) => eventBy[s],
    strand: (s) => strandBy[s],
    story: (s) => c.stories.find((x) => x.slug === s),
    video: (s) => c.videos.find((x) => x.slug === s),
    upcoming: () => c.events.filter((e) => !isPast(e)),
    past: () => c.events.filter(isPast).reverse(),
    isPast,
    eventsFor: (artist) => c.events.filter((e) => e.artists.includes(artist)),
    videosFor: ({ artist, event }) => c.videos.filter((v) => (artist && v.artist === artist) || (event && v.event === event)),
    storiesFor: ({ artist, event }) => c.stories.filter((s) => (artist && s.related?.artists?.includes(artist)) || (event && s.related?.events?.includes(event))),
    // Six years, six rings: legacy counts plus everything dated in that year.
    archiveByYear: () => c.legacy.map(({ year, count }) => ({
      year,
      count: count
        + c.events.filter((e) => isPast(e) && e.start.startsWith(String(year))).length
        + c.videos.filter((v) => v.published.startsWith(String(year))).length
        + c.stories.filter((s) => s.published.startsWith(String(year))).length,
    })),
  };
}
