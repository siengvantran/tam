// Download TAM's Eventbrite history (past + upcoming) as JSON.
//
//   node scripts/fetch_eventbrite.mjs /tmp/eventbrite.json
//   python3 scripts/import_eventbrite.py /tmp/eventbrite.json
//
// Uses the same public endpoints as the organiser page
// (https://www.eventbrite.co.uk/o/temple-of-art-and-music-33409225909) from
// inside a real browser session, since Eventbrite blocks plain HTTP clients.
// Needs Playwright (`npx playwright install chromium` outside cloud sessions).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ORGANIZER = process.env.EVENTBRITE_ORGANIZER || '33409225909';
const out = process.argv[2] || 'eventbrite.json';
const executablePath = process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await (await browser.newContext({ locale: 'en-GB' })).newPage();
await page.goto(`https://www.eventbrite.co.uk/o/${ORGANIZER}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

const result = await page.evaluate(async (organizer) => {
  const base = `/organizer-profile/api/organizers/${organizer}`;
  const today = new Date().toISOString().slice(0, 10);
  const all = { fetchedAt: new Date().toISOString(), past: [], upcoming: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [kind, path] of [['past', 'past-events/?'], ['upcoming', `events-from-date/?from_date=${today}&`]]) {
    for (let n = 1; n < 400; n++) {
      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${base}/${path}page=${n}&pageSize=50`, { credentials: 'include' });
        if (res.ok) break;
        await sleep(2000 * (attempt + 1));
      }
      if (!res.ok) throw new Error(`${kind} page ${n}: HTTP ${res.status}`);
      const j = await res.json();
      const events = j.events || [];
      all[kind].push(...events);
      if (!j.hasMore || !events.length) break;
      await sleep(400);
    }
  }
  return all;
}, ORGANIZER);

writeFileSync(out, JSON.stringify(result));
console.log(`past ${result.past.length}, upcoming ${result.upcoming.length} -> ${out}`);
await browser.close();
