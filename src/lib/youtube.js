// TAM TV, live: the latest uploads from TAM's YouTube channel, via the
// channel's public RSS feed (no API key). Refreshed in the background every
// 30 minutes; if YouTube can't be reached, the films archived in
// content/videos.json are shown instead, so the page never breaks.

const FEED = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
const TTL = 30 * 60e3;

const unescape = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }[e]));

export function parseFeed(xml) {
  const out = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    if (id && title) out.push({ youtubeId: id, title: unescape(title.trim()), published });
  }
  return out;
}

export function createTv({ channelId, archive = [], fetcher = fetch, now = () => Date.now() }) {
  let list = archive.map((v) => ({ ...v }));
  let fetchedAt = 0;
  let inFlight = null;

  const merge = (live) => {
    const byId = new Map(archive.map((v) => [v.youtubeId, v]));
    const seen = new Set();
    const merged = [];
    for (const v of live) {
      seen.add(v.youtubeId);
      const known = byId.get(v.youtubeId);
      merged.push({ ...known, ...v, slug: known?.slug, artists: known?.artists || [] });
    }
    for (const v of archive) if (!seen.has(v.youtubeId)) merged.push(v);
    return merged;
  };

  async function refresh() {
    if (!channelId) return list;
    try {
      const res = await fetcher(FEED(channelId), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const live = parseFeed(await res.text());
      if (live.length) list = merge(live);
    } catch (err) {
      console.warn('TAM TV feed unavailable:', err.message);
    }
    fetchedAt = now();
    return list;
  }

  return {
    // Returns what we have now and refreshes in the background when stale.
    list() {
      if (now() - fetchedAt > TTL && !inFlight) inFlight = refresh().finally(() => { inFlight = null; });
      return list;
    },
    // For start-up and tests: wait for one refresh.
    ready() {
      if (!inFlight && !fetchedAt) inFlight = refresh().finally(() => { inFlight = null; });
      return inFlight || Promise.resolve(list);
    },
  };
}
