import { loadContent } from '../src/lib/content.js';

const c = loadContent();
console.log(`content ok: ${c.nights.length} TAM nights, ${c.past.length} archived nights, ${c.artists.length} artists, ${c.festivals.length} festivals, ${c.legacy.length} old pages`);
