// Ticket pricing, shared by the server and the browser (served as
// /shared/pricing.js) so the price a buyer sees is the price they're charged.
// All amounts are whole pence. Pure functions: no I/O, no clock unless passed.
//
// Every night carries a `sale` (built by the content loader):
//   { mode: 'own',      tickets: [{ id, name, price, limit?, tableRequest? }] }
//   { mode: 'schedule', tiers: [{ id, name, price, until?, limit? }], door? }
//   { mode: 'flat',     price }
//   { mode: 'standard', price, groupTiers: [{ min, off, label }], packs: [{ id, name, min, max, off, needsTeam }] }
// plus { capacity, maxPerBooking } on all of them.

export const pounds = (p) => {
  const n = p / 100;
  return `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
};

// The tier on sale now in a price schedule: the first whose date hasn't
// passed and whose allocation hasn't sold out. `tierSold` maps tier id → sold.
export function currentTier(sale, now = Date.now(), tierSold = {}) {
  for (const t of sale.tiers || []) {
    if (t.until && now >= Date.parse(t.until)) continue;
    if (t.limit && (tierSold[t.id] || 0) >= t.limit) continue;
    return t;
  }
  return null;
}

// What a buyer can choose on a night: [{ id, name, price, blurb?, tag?, left? }]
export function ticketOptions(sale, { now = Date.now(), tierSold = {}, typeSold = {} } = {}) {
  if (!sale) return [];
  if (sale.mode === 'own') {
    return sale.tickets.map((t) => ({ ...t, left: t.limit ? Math.max(0, t.limit - (typeSold[t.id] || 0)) : null }));
  }
  if (sale.mode === 'schedule') {
    const t = currentTier(sale, now, tierSold);
    return t ? [{ id: t.id, name: t.name, price: t.price, until: t.until || null, left: t.limit ? t.limit - (tierSold[t.id] || 0) : null }] : [];
  }
  if (sale.mode === 'flat') return [{ id: 'standard', name: 'Ticket', price: sale.price }];
  return [
    { id: 'standard', name: 'Standard', price: sale.price },
    ...(sale.packs || []).map((p) => ({ id: p.id, name: p.name, price: Math.round(sale.price * (1 - p.off)), pack: p })),
  ];
}

// The cheapest way in, for "from £7" labels.
export function fromPrice(sale, ctx) {
  const opts = ticketOptions(sale, ctx).filter((o) => o.left !== 0);
  return opts.length ? Math.min(...opts.map((o) => o.price)) : null;
}

// Price a booking. Returns { type, name, qty, full, unit, off, label, total, saving } or { error }.
export function quote(sale, type, qty, { now = Date.now(), tierSold = {}, typeSold = {}, sold = 0 } = {}) {
  if (!sale) return { error: 'Tickets for this night are not on sale here.' };
  qty = Number(qty);
  if (!Number.isInteger(qty) || qty < 1) return { error: 'Choose how many tickets.' };
  const max = sale.maxPerBooking || 60;
  if (qty > max) return { error: `For more than ${max} tickets, ask us about a private party or sponsorship.` };
  if (sale.capacity && qty > sale.capacity - sold) {
    const left = Math.max(0, sale.capacity - sold);
    return { error: left ? `Only ${left} tickets left on this night.` : 'This night is sold out.' };
  }
  const plain = (t, extra = {}) => ({ type: t.id, name: t.name, qty, full: t.price, unit: t.price, off: 0, label: '', total: t.price * qty, saving: 0, ...extra });

  if (sale.mode === 'own') {
    const t = sale.tickets.find((x) => x.id === type);
    if (!t) return { error: 'Pick a ticket for this night.' };
    if (t.limit && qty > t.limit - (typeSold[t.id] || 0)) {
      const left = Math.max(0, t.limit - (typeSold[t.id] || 0));
      return { error: left ? `Only ${left} ${t.name} tickets left.` : `${t.name} tickets have sold out.` };
    }
    return plain(t, { ticket: t });
  }
  if (sale.mode === 'schedule') {
    const t = currentTier(sale, now, tierSold);
    if (!t) return { error: 'Online sales for this night have closed.' };
    if (t.limit && qty > t.limit - (tierSold[t.id] || 0)) {
      return { error: `Only ${t.limit - (tierSold[t.id] || 0)} left at the ${t.name} price. Book fewer, or wait for the next price.` };
    }
    const door = sale.door || t.price;
    return plain(t, { full: door, saving: (door - t.price) * qty, tier: t.id });
  }
  if (sale.mode === 'flat') return plain({ id: 'standard', name: 'Ticket', price: sale.price });

  // standard: group tiers, or a pack
  let off = 0, label = '';
  const pack = (sale.packs || []).find((p) => p.id === type);
  if (pack) {
    if (qty < pack.min) return { error: `The ${pack.name} starts at ${pack.min} people.` };
    if (pack.max && qty > pack.max) return { error: `The ${pack.name} is for up to ${pack.max} people. Book as a group instead.` };
    off = pack.off;
    label = pack.name;
  } else if (type === 'standard') {
    const tier = (sale.groupTiers || []).slice().sort((a, b) => b.min - a.min).find((t) => qty >= t.min);
    if (tier) { off = tier.off; label = tier.label; }
  } else {
    return { error: 'Unknown ticket type.' };
  }
  const unit = Math.round(sale.price * (1 - off));
  return { type, name: pack ? pack.name : 'Standard', pack: pack || null, qty, full: sale.price, unit, off, label, total: unit * qty, saving: (sale.price - unit) * qty };
}

// Optional charity donation. Blank or 0 is none. Returns { amount } or { error }.
export function donationOf(v, rules) {
  if (v === undefined || v === null || v === '') return { amount: 0 };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { error: 'Enter a donation of £0 or more.' };
  const amount = Math.round(n);
  if (!rules && amount) return { error: 'This night does not take donations.' };
  if (rules && amount > rules.max) return { error: `Donations are up to ${pounds(rules.max)} online.` };
  if (amount > 0 && amount < 100) return { error: 'Donations start at £1.' };
  return { amount };
}

// Raffle tickets: as many deals as fit, then singles.
export function rafflePrice(count, raffle) {
  const d = raffle.deal;
  const deals = d ? Math.floor(count / d.count) : 0;
  return deals * (d ? d.price : 0) + (count - deals * (d ? d.count : 0)) * raffle.price;
}

// A numbered collection order (signed books, prints, vinyl).
// items: { itemId: qty }. Returns { lines, copies, subtotal, postage, total, delivery } or { error }.
export function quoteCollection(collection, items, delivery) {
  const lines = [];
  const maxEach = collection.maxEach || 4;
  for (const it of collection.items) {
    const qty = Number((items || {})[it.id] || 0);
    if (!Number.isInteger(qty) || qty < 0 || qty > maxEach) return { error: `Up to ${maxEach} of each per order.` };
    if (qty) lines.push({ id: it.id, title: it.title, qty, unit: it.price, total: it.price * qty });
  }
  if (!lines.length) return { error: 'Choose something from the collection.' };
  if (delivery !== 'collect' && delivery !== 'post') return { error: 'Choose collection at TAM or UK post.' };
  const subtotal = lines.reduce((n, l) => n + l.total, 0);
  const postage = delivery === 'post' ? (collection.postage || 0) : 0;
  return { lines, copies: lines.reduce((n, l) => n + l.qty, 0), subtotal, postage, total: subtotal + postage, delivery };
}
