// TAM's own ticketing.
//
// Box office settings (which nights are on sale, ticket types, prices,
// capacity) live in DATA_DIR/box-office.json. Orders are an append-only log in
// DATA_DIR/orders.jsonl ("create", "status", "checkin" entries) replayed at
// start-up, so nothing is ever overwritten.
//
// Free tickets are confirmed at once. Paid tickets are held for 30 minutes
// while the buyer pays on Stripe Checkout, then confirmed when Stripe says
// paid (on return to the site, or by webhook if they close the tab).
//
// A night can also carry a price schedule in its content ("pricing" in
// content/events.json): one ticket whose price steps up through tiers, each
// ending on a date or when its allocation sells out, whichever comes first.
// The price is fixed when the ticket is booked.

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

export const HOLD_MS = 30 * 60e3;
export const MAX_PER_ORDER = 8;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

export function ticketCode() {
  const b = randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `TAM-${s.slice(0, 5)}-${s.slice(5)}`;
}

const pounds = (pence) => (pence === 0 ? 'Free' : `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`);
export { pounds };

export function createBoxOffice({ dataDir, now = () => Date.now(), schedules = {} }) {
  const configFile = path.join(dataDir, 'box-office.json');
  const logFile = path.join(dataDir, 'orders.jsonl');
  let config = {};
  const orders = new Map();
  const byCode = new Map();
  let writeChain = Promise.resolve();

  const apply = (entry) => {
    if (entry.op === 'create') {
      orders.set(entry.order.id, { ...entry.order, checkedIn: 0 });
      byCode.set(entry.order.code, entry.order.id);
    } else if (entry.op === 'status') {
      const o = orders.get(entry.id);
      if (o) Object.assign(o, { status: entry.status, ...(entry.session ? { session: entry.session } : {}) });
    } else if (entry.op === 'checkin') {
      const o = orders.get(entry.id);
      if (o) o.checkedIn = Math.min(o.qty, entry.count);
    }
  };

  // Serialise writes so log order matches the order of changes.
  const log = (entry) => {
    apply(entry);
    const line = `${JSON.stringify({ at: new Date(now()).toISOString(), ...entry })}\n`;
    writeChain = writeChain.then(async () => {
      await mkdir(dataDir, { recursive: true });
      await appendFile(logFile, line, 'utf8');
    });
    return writeChain;
  };

  async function load() {
    try { config = JSON.parse(await readFile(configFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try {
      for (const l of (await readFile(logFile, 'utf8')).split('\n')) if (l) apply(JSON.parse(l));
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  const live = (o) => o.status === 'confirmed' || o.status === 'paid' || (o.status === 'pending' && now() - Date.parse(o.createdAt) < HOLD_MS);

  function taken(event, typeId, tierId) {
    let n = 0;
    for (const o of orders.values()) if (o.event === event && (!typeId || o.type === typeId) && (!tierId || o.tier === tierId) && live(o)) n += o.qty;
    return n;
  }

  // The settings in force for a night: the box office's, or its price schedule.
  // On a scheduled night staff can still close sales or set a room capacity.
  function cfgOf(event) {
    const sch = schedules[event];
    if (!sch) return config[event];
    const saved = config[event];
    return {
      open: saved ? saved.open : Boolean(sch.onSale),
      capacity: saved?.capacity ?? sch.capacity ?? null,
      types: [{ id: 'ticket', name: sch.name || 'Ticket', capacity: null, schedule: sch }],
      scheduled: true,
    };
  }

  // Where a night is on its price schedule right now.
  function ladder(event) {
    const sch = schedules[event];
    if (!sch) return null;
    const t = now();
    let current = -1;
    const tiers = sch.tiers.map((tier, i) => {
      const sold = taken(event, 'ticket', tier.id);
      const expired = tier.until && t >= Date.parse(tier.until);
      const soldOut = tier.limit != null && sold >= tier.limit;
      const state = expired || soldOut ? 'gone' : current === -1 ? 'now' : 'later';
      if (state === 'now') current = i;
      return { ...tier, state, why: expired ? 'ended' : soldOut ? 'sold out' : null, left: tier.limit != null ? Math.max(0, tier.limit - sold) : null };
    });
    return { name: sch.name, door: sch.door ?? null, tiers, current: tiers[current] || null, next: current >= 0 ? tiers[current + 1] || null : null };
  }

  // A ticket type as it stands now: a scheduled type takes its current tier's price.
  function resolve(event, type) {
    if (!type.schedule) return type;
    const tier = ladder(event).current;
    if (!tier) return null;
    return { ...type, price: tier.price, tier: tier.id, tierName: tier.name, tierLeft: tier.left };
  }

  function remaining(event, typeId) {
    const cfg = cfgOf(event);
    if (!cfg) return 0;
    const type = cfg.types.find((t) => t.id === typeId);
    if (!type) return 0;
    const caps = [];
    if (type.capacity != null) caps.push(type.capacity - taken(event, typeId));
    if (cfg.capacity != null) caps.push(cfg.capacity - taken(event));
    return caps.length ? Math.max(0, Math.min(...caps)) : MAX_PER_ORDER * 100;
  }

  return {
    load,
    config: (event) => cfgOf(event) || null,
    allConfig: () => config,
    ladder,

    // Public view of what's on sale for a night.
    offer(event, { paymentsEnabled }) {
      const cfg = cfgOf(event);
      if (!cfg?.open) return null;
      const types = cfg.types
        .map((t) => resolve(event, t))
        .filter((t) => t && (t.price === 0 || paymentsEnabled))
        .map((t) => ({ ...t, left: remaining(event, t.id) }));
      return types.length ? { types, soldOut: types.every((t) => t.left <= 0) } : null;
    },

    async setConfig(event, { open, capacity, types }) {
      config = { ...config, [event]: { open: Boolean(open), capacity: capacity ?? null, types: types || [] } };
      await mkdir(dataDir, { recursive: true });
      const tmp = `${configFile}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(config, null, 1));
      await rename(tmp, configFile);
    },

    // Reserve tickets. Capacity is checked and claimed synchronously, so two
    // buyers can never take the last ticket at once.
    book({ event, typeId, qty, name, email, marketing }, { paymentsEnabled }) {
      const cfg = cfgOf(event);
      if (!cfg?.open) return { error: 'Tickets for this night aren’t on sale here.' };
      const base = cfg.types.find((t) => t.id === typeId);
      const type = base && resolve(event, base);
      if (!type || (type.price > 0 && !paymentsEnabled)) return { error: 'Please choose a ticket.' };
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PER_ORDER) return { error: `You can book 1 to ${MAX_PER_ORDER} tickets at a time.` };
      const left = remaining(event, typeId);
      if (left < qty) return { error: left ? `Only ${left} left.` : 'Sold out.' };
      if (type.tierLeft != null && type.tierLeft < qty) return { error: `Only ${type.tierLeft} left at the ${type.tierName} price. Book ${type.tierLeft === 1 ? 'it' : 'those'} now, then the rest at the next price.` };
      let code;
      do code = ticketCode(); while (byCode.has(code));
      const order = {
        id: randomUUID(), code, event, type: type.id, typeName: type.tierName ? `${type.name} (${type.tierName})` : type.name, qty,
        ...(type.tier ? { tier: type.tier } : {}),
        unitPrice: type.price, total: type.price * qty, name, email, marketing: Boolean(marketing),
        status: type.price === 0 ? 'confirmed' : 'pending', createdAt: new Date(now()).toISOString(),
      };
      const saved = log({ op: 'create', order: { ...order } });
      return { order: orders.get(order.id), saved };
    },

    get: (id) => orders.get(id),
    byCode: (code) => orders.get(byCode.get(String(code || '').toUpperCase().trim())),
    ordersFor: (event) => [...orders.values()].filter((o) => o.event === event).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    taken,
    isLive: live,

    // A paid Stripe session for this order -> confirm it.
    async markPaid(id, session) {
      const o = orders.get(id);
      if (!o || o.status === 'paid' || o.status === 'confirmed') return o;
      if (o.status === 'cancelled') return o;
      await log({ op: 'status', id, status: 'paid', session });
      return orders.get(id);
    },
    async setSession(id, session) {
      const o = orders.get(id);
      if (o) await log({ op: 'status', id, status: o.status, session });
    },
    async cancel(id) {
      if (orders.has(id)) await log({ op: 'status', id, status: 'cancelled' });
      return orders.get(id);
    },
    async checkIn(code, count) {
      const o = this.byCode(code);
      if (!o) return { error: 'No ticket with that code.' };
      if (!(o.status === 'paid' || o.status === 'confirmed')) return { error: `This booking is ${o.status}.`, order: o };
      if (o.checkedIn >= o.qty) return { error: `Already checked in (${o.qty} of ${o.qty}).`, order: o };
      await log({ op: 'checkin', id: o.id, count: count == null ? o.qty : Math.min(o.qty, o.checkedIn + count) });
      return { order: o };
    },
    flush: () => writeChain,
  };
}
