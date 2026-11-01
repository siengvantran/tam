import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, ticketOptions, currentTier, donationOf, rafflePrice, quoteCollection, fromPrice, pounds } from '../shared/pricing.js';

const standard = {
  mode: 'standard', price: 2200, capacity: 250, maxPerBooking: 60,
  groupTiers: [{ min: 20, off: 0.15, label: 'Group of 20+' }, { min: 10, off: 0.10, label: 'Group of 10+' }, { min: 6, off: 0.05, label: 'Group of 6+' }],
  packs: [{ id: 'startup', name: 'Startup pack', min: 4, max: 15, off: 0.2, needsTeam: true }],
};

test('standard nights: group tiers apply by size', () => {
  assert.equal(quote(standard, 'standard', 2).total, 4400);
  assert.equal(quote(standard, 'standard', 6).unit, 2090);
  assert.equal(quote(standard, 'standard', 10).label, 'Group of 10+');
  const q = quote(standard, 'standard', 20);
  assert.equal(q.unit, 1870);
  assert.equal(q.saving, (2200 - 1870) * 20);
});

test('packs have a minimum and a maximum', () => {
  assert.match(quote(standard, 'startup', 3).error, /starts at 4/);
  assert.match(quote(standard, 'startup', 16).error, /up to 15/);
  assert.equal(quote(standard, 'startup', 5).total, 1760 * 5);
});

test('capacity and booking size are enforced', () => {
  assert.match(quote(standard, 'standard', 61).error, /more than 60/);
  assert.match(quote(standard, 'standard', 5, { sold: 247 }).error, /Only 3 tickets left/);
  assert.match(quote(standard, 'standard', 1, { sold: 250 }).error, /sold out/);
});

test('flat nights cost one price', () => {
  const q = quote({ mode: 'flat', price: 1000 }, 'standard', 7);
  assert.equal(q.total, 7000);
  assert.equal(q.off, 0);
});

test('own ticket types, with limits', () => {
  const own = { mode: 'own', tickets: [{ id: 'robin', name: 'Robin', price: 700, limit: 10 }, { id: 'vip', name: 'VIP', price: 1500 }] };
  assert.equal(quote(own, 'vip', 3).total, 4500);
  assert.match(quote(own, 'nope', 1).error, /Pick a ticket/);
  assert.match(quote(own, 'robin', 4, { typeSold: { robin: 8 } }).error, /Only 2 Robin/);
  assert.equal(fromPrice(own), 700);
  assert.equal(fromPrice(own, { typeSold: { robin: 10 } }), 1500);
});

test('price schedules move on by date or when a tier sells out', () => {
  const sale = { mode: 'schedule', door: 3000, tiers: [
    { id: 'early', name: 'Early Bird', price: 1500, limit: 50, until: '2026-11-01T23:59:59Z' },
    { id: 'advent', name: 'Advent', price: 2000, until: '2026-11-29T23:59:59Z' },
    { id: 'final', name: 'Final week', price: 3000 },
  ] };
  assert.equal(currentTier(sale, Date.parse('2026-10-20')).id, 'early');
  assert.equal(currentTier(sale, Date.parse('2026-10-20'), { early: 50 }).id, 'advent');
  assert.equal(currentTier(sale, Date.parse('2026-11-05')).id, 'advent');
  assert.equal(currentTier(sale, Date.parse('2026-12-10')).id, 'final');
  const q = quote(sale, 'any', 2, { now: Date.parse('2026-10-20') });
  assert.equal(q.total, 3000);
  assert.equal(q.saving, 3000);
  assert.match(quote(sale, 'any', 5, { now: Date.parse('2026-10-20'), tierSold: { early: 47 } }).error, /Only 3 left/);
  assert.equal(ticketOptions(sale, { now: Date.parse('2026-10-20') })[0].left, 50);
});

test('donations', () => {
  const rules = { max: 50000 };
  assert.deepEqual(donationOf('', rules), { amount: 0 });
  assert.deepEqual(donationOf(500, rules), { amount: 500 });
  assert.match(donationOf(50, rules).error, /start at £1/);
  assert.match(donationOf(60000, rules).error, /up to £500/);
  assert.match(donationOf(500, null).error, /does not take/);
});

test('raffle deals', () => {
  const r = { price: 200, deal: { count: 3, price: 500 } };
  assert.equal(rafflePrice(1, r), 200);
  assert.equal(rafflePrice(3, r), 500);
  assert.equal(rafflePrice(7, r), 1200);
});

test('collection orders', () => {
  const col = { items: [{ id: 'a', title: 'A', price: 2500 }, { id: 'b', title: 'B', price: 6500 }], postage: 495, maxEach: 4 };
  const q = quoteCollection(col, { a: 1, b: 2 }, 'post');
  assert.equal(q.total, 2500 + 13000 + 495);
  assert.equal(q.copies, 3);
  assert.match(quoteCollection(col, {}, 'collect').error, /Choose something/);
  assert.match(quoteCollection(col, { a: 5 }, 'collect').error, /Up to 4/);
  assert.equal(pounds(1760), '£17.60');
  assert.equal(pounds(1000), '£10');
});
