// The Analogue Room: a daily escape room built from the day's news, set in a
// TAM of five years from now. One room per day lives in content/rooms.json.
//
// The page never gets the answers: it asks here whether each move is right,
// and the doors only open (and the points only land) when the whole room is
// sent back solved. Opening the doors is worth a couple of TAM Club points,
// once a day (RULES.room in src/domain/club.js).
//
// A room that doesn't pass validRoom() is skipped, and a rooms.json that
// won't parse means no rooms, so a bad morning's file can't take the site down.

import fs from 'node:fs';
import path from 'node:path';
import { fail, send, readJson, text } from '../lib/http.js';
import { RULES } from './club.js';

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const list = (v, min = 1) => Array.isArray(v) && v.length >= min;

export function validRoom(r) {
  return Boolean(r && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') && str(r.label) && str(r.setting)
    && list(r.briefing) && r.briefing.every(str)
    && list(r.sources) && r.sources.every((s) => s && str(s.t) && /^https:\/\//.test(s.u || ''))
    && list(r.cards, 4) && r.cards.every((c) => c && str(c.text) && typeof c.record === 'boolean' && str(c.note)
      && (c.src === undefined || c.src === null || Boolean(r.sources[c.src])))
    && r.cards.every((c) => !c.record || Boolean(r.sources[c.src])) // every fact carries its source
    && r.code && str(r.code.clue) && /^\d{4}$/.test(r.code.answer || '')
    && list(r.gates) && r.gates.every((g) => g && str(g.ask) && str(g.rule) && /^[A-Z]$/.test(g.letter || '')
      && list(g.opts, 2) && g.opts.every((o) => o && str(o.t)) && g.opts.filter((o) => o.ok).length === 1)
    && str(r.word) && r.word === r.gates.map((g) => g.letter).join('')
    && str(r.wordClue) && list(r.epilogue) && r.epilogue.every(str));
}

export function loadRooms(dir) {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(dir, 'rooms.json'), 'utf8'));
    return (Array.isArray(all) ? all : []).filter(validRoom).sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

export function roomDomain(ctx, { dir }) {
  const rooms = loadRooms(dir);
  const open = () => rooms.filter((r) => r.date <= ctx.today()); // a room dated tomorrow waits for tomorrow
  const pick = (date) => { const o = open(); return (date ? o.find((r) => r.date === date) : o[o.length - 1]) || null; };
  const must = (date) => { const r = pick(text(date, 10)); if (!r) throw fail(404, 'That room isn’t open.'); return r; };

  // What the page may see: the puzzle, never the answers.
  const view = (r) => ({
    date: r.date, label: r.label, setting: r.setting, briefing: r.briefing,
    cards: r.cards.map((c) => ({ text: c.text })),
    code: { clue: r.code.clue, hint: r.code.hint || '' },
    gates: r.gates.map((g) => ({ clause: g.clause || '', ask: g.ask, opts: g.opts.map((o) => o.t) })),
    wordLength: r.word.length, wordClue: r.wordClue, sources: r.sources,
  });
  const banked = (m, r) => Boolean(m && ctx.db.clubLedger.some((x) => x.m === m.id && x.rule === 'room' && x.key === r.date));
  const solved = (r, b) => Array.isArray(b.cards) && r.cards.every((c, i) => b.cards[i] === c.record)
    && String(b.code || '') === r.code.answer
    && Array.isArray(b.picks) && r.gates.every((g, i) => Boolean(g.opts[b.picks[i]] && g.opts[b.picks[i]].ok))
    && String(b.word || '').trim().toUpperCase() === r.word;

  function routes(r) {
    r.get('/api/room', (req, res, { url }) => {
      const room = pick(text(url.searchParams.get('date'), 10));
      const m = ctx.club.memberOf(req);
      send(res, 200, {
        room: room ? view(room) : null, rooms: open().map((x) => ({ date: x.date, label: x.label })),
        member: Boolean(m && m.status === 'active'), banked: room ? banked(m, room) : false, points: RULES.room.pts,
      }, { 'Cache-Control': 'no-store' });
    });

    // One move: is this card filed right, does the dial turn, does this ruling stand?
    r.post('/api/room/check', async (req, res) => {
      const b = await readJson(req);
      const room = must(b.date);
      const i = Number(b.i);
      if (b.lock === 'card') {
        const c = room.cards[i];
        if (!c) throw fail(400, 'No such card.');
        return send(res, 200, b.value === c.record
          ? { ok: true, record: c.record, note: c.note, source: c.src === undefined || c.src === null ? null : room.sources[c.src] }
          : { ok: false });
      }
      if (b.lock === 'code') return send(res, 200, { ok: String(b.value || '') === room.code.answer });
      if (b.lock === 'gate') {
        const g = room.gates[i];
        const o = g && g.opts[Number(b.value)];
        if (!o) throw fail(400, 'No such ruling.');
        return send(res, 200, o.ok ? { ok: true, rule: g.rule, letter: g.letter } : { ok: false, why: o.why || 'Not that one.' });
      }
      throw fail(400, 'No such lock.');
    });

    // The doors: the whole room, solved. Members bank the points, once a day.
    r.post('/api/room/open', async (req, res) => {
      const b = await readJson(req);
      const room = must(b.date);
      if (!solved(room, b)) return send(res, 200, { ok: false });
      const m = ctx.club.memberOf(req);
      const active = Boolean(m && m.status === 'active');
      const got = active ? ctx.club.award(m, 'room', room.date) : null;
      send(res, 200, { ok: true, epilogue: room.epilogue, member: active, points: got ? got.pts : 0 });
    });
  }

  return { routes, today: () => pick(), open, view };
}
