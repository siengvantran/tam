// Charity raffle, sold in person on the night by door staff at /raffle-desk.
// Numbers run on per night and are never reused (voided sales keep theirs);
// draws pick a sold, unwon number with a cryptographic random.

import crypto from 'node:crypto';
import { rafflePrice } from '../../shared/pricing.js';
import { fail, send, readJson, text, newId } from '../lib/http.js';

export function raffleDomain(ctx, tickets) {
  const { db, save, content: c, cfg } = ctx;

  // Tonight's raffle: the first of tonight's nights whose festival runs one.
  function tonight() {
    for (const n of tickets.tonight()) {
      const f = n.festival && c.festivalBy.get(n.festival);
      if (f && f.features.raffle) return { night: n, raffle: f.raffle, festival: f };
    }
    return null;
  }

  function summary(t) {
    if (!t) return { night: null, nightLabel: 'No raffle tonight', sold: 0, takings: 0, cash: 0, card: 0, recent: [], draws: [] };
    const all = db.raffleSales.filter((x) => x.night === t.night.slug);
    const live = all.filter((x) => !x.void);
    const sum = (list) => list.reduce((n, x) => n + x.amount, 0);
    return {
      night: t.night.slug, nightLabel: `${t.night.title} · ${t.night.weekday} ${t.night.day} ${t.night.month}`, raffle: t.raffle,
      sold: live.reduce((n, x) => n + x.count, 0), takings: sum(live),
      cash: sum(live.filter((x) => x.method === 'cash')), card: sum(live.filter((x) => x.method === 'card')),
      recent: all.slice(-8).reverse(), draws: db.raffleDraws.filter((d) => d.night === t.night.slug),
    };
  }

  function routes(r) {
    const guard = (req) => {
      if (!ctx.isDoor(req)) throw fail(401, cfg.doorToken || cfg.adminToken ? 'Wrong door code.' : 'Set DOOR_TOKEN (8+ characters) to use the raffle desk.');
      return tonight();
    };

    r.get('/api/raffle/tonight', (req, res) => send(res, 200, summary(guard(req))));

    r.post('/api/raffle/sell', async (req, res) => {
      const t = guard(req);
      if (!t) throw fail(409, 'There’s no raffle tonight.');
      const body = await readJson(req, 2048);
      const count = Number(body.count);
      const max = t.raffle.maxPerSale || 50;
      if (!Number.isInteger(count) || count < 1 || count > max) throw fail(400, `Sell between 1 and ${max} tickets.`);
      if (!['cash', 'card'].includes(body.method)) throw fail(400, 'Cash or card?');
      const last = db.raffleSales.filter((x) => x.night === t.night.slug).reduce((m, x) => Math.max(m, x.to), 0);
      const sale = { id: newId('RF'), night: t.night.slug, from: last + 1, to: last + count, count, amount: rafflePrice(count, t.raffle),
        method: body.method, name: text(body.name, 60), at: new Date(ctx.now()).toISOString() };
      db.raffleSales.push(sale);
      await save();
      send(res, 201, { sale, ...summary(t) });
    });

    r.post('/api/raffle/void', async (req, res) => {
      const t = guard(req);
      const body = await readJson(req, 1024);
      const sale = t && db.raffleSales.find((x) => x.id === body.id && x.night === t.night.slug);
      if (!sale) throw fail(404, 'Sale not found tonight.');
      if (db.raffleDraws.some((d) => d.night === sale.night && d.number >= sale.from && d.number <= sale.to)) throw fail(409, 'A ticket from this sale has already won.');
      sale.void = true;
      await save();
      send(res, 200, summary(t));
    });

    r.post('/api/raffle/draw', async (req, res) => {
      const t = guard(req);
      if (!t) throw fail(409, 'There’s no raffle tonight.');
      const body = await readJson(req, 1024);
      const drawn = new Set(db.raffleDraws.filter((d) => d.night === t.night.slug).map((d) => d.number));
      const live = db.raffleSales.filter((x) => x.night === t.night.slug && !x.void);
      const pool = [];
      for (const x of live) for (let n = x.from; n <= x.to; n++) if (!drawn.has(n)) pool.push(n);
      if (!pool.length) throw fail(409, 'No tickets left to draw tonight.');
      const number = pool[crypto.randomInt(pool.length)];
      const sale = live.find((x) => number >= x.from && number <= x.to);
      const draw = { night: t.night.slug, number, prize: text(body.prize, 120), name: sale.name || '', at: new Date(ctx.now()).toISOString() };
      db.raffleDraws.push(draw);
      await save();
      send(res, 201, { draw, ...summary(t) });
    });
  }

  return { routes, summary, tonight };
}
