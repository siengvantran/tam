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
//
// Invitations: every public page can show one line inviting the visitor to
// today's room. The wording is picked for who they are (an artist or the
// public) and where they came from (search, social, email…), and the site
// learns which wording gets doors opened. It counts totals only, by day:
// nothing about who anyone is, and no cookie.

import fs from 'node:fs';
import path from 'node:path';
import { fail, send, readJson, text } from '../lib/http.js';
import { RULES } from './club.js';

// Languages: the room can be played in any language. A day's room and the
// game's own words are translated once per language (src/services/
// room-translator.js) and kept here. The answers don't change: the dial is
// digits, and the letters spell the same English word everywhere.
export const UI = {
  note: 'The news in this room is real and sourced. The future it is set in is fiction.',
  pointsLine: 'Open the doors and TAM Club members bank +{pts} points, once a day. {half} points is a drink on the house.',
  lock: 'Lock {n}', locksCleared: '{n} of 4 locks cleared', language: 'Language',
  autoTranslated: 'Translated automatically from English. The linked sources are the originals.',
  desk: 'The sorting desk', deskIntro: '{n} lines came down the wire. File each one: is it on the record, or is it a story?',
  onRecord: 'On the record', story: 'Story', source: 'Source',
  notReported: 'Nobody has reported that. Look again.', isReported: 'That one is reported. Look again.',
  dial: 'The dial', dialTurned: 'The dial turned at {code}.', turnDial: 'Turn the dial', codeLabel: 'Four-digit code',
  opensDesk: 'Opens when the desk is clear.', askHint: 'Ask for a hint', hideHint: 'Hide the hint', dialStuck: 'The dial does not turn. Check the record.',
  gate: 'The gate', gateIntro: 'Things want to cross the wall tonight. Every crossing has a contract, and you are the one accountable for it. A right ruling stamps a letter in the brass.',
  opensDial: 'Opens when the dial has turned.',
  doors: 'The doors', wordNote: 'The letters spell a word in English. Type them in the order you earned them.', wordLabel: 'The word', wordWas: 'The word was {code}.',
  openDoors: 'Open the doors', opensGate: 'Opens when the gate has ruled.', doorsShut: 'The doors stay shut. Read the brass again, top to bottom.',
  doorsOpen: 'Doors open', slips: 'Slips: {n}',
  pointsWon: '+{pts} points on your TAM Club card.', seeCard: 'See your card', hadPoints: 'You have had today’s room points. A new room opens tomorrow morning.',
  joinLine: 'Join the TAM Club and the next room banks {pts} points.', joinFree: 'Join free',
  nextRoom: 'The next room is built tomorrow morning from the day’s news.',
  artistLine: 'The real room is on Newington Causeway in London, and it needs players.', playAtTam: 'Play at TAM',
  sourcesToday: 'On the record today:', quiet: 'The gatehouse is quiet today. A new room opens tomorrow morning.',
};
// The picker's list, each in its own name. Any other language a browser asks for works too.
export const LANGUAGES = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'], ['nl', 'Nederlands'],
  ['pl', 'Polski'], ['uk', 'Українська'], ['ru', 'Русский'], ['tr', 'Türkçe'], ['el', 'Ελληνικά'], ['ro', 'Română'], ['hu', 'Magyar'], ['cs', 'Čeština'],
  ['sv', 'Svenska'], ['da', 'Dansk'], ['no', 'Norsk'], ['fi', 'Suomi'], ['cy', 'Cymraeg'], ['ga', 'Gaeilge'],
  ['ar', 'العربية'], ['he', 'עברית'], ['fa', 'فارسی'], ['ur', 'اردو'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['pa', 'ਪੰਜਾਬੀ'], ['gu', 'ગુજરાતી'], ['mr', 'मराठी'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'],
  ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['tl', 'Filipino'],
  ['sw', 'Kiswahili'], ['am', 'አማርኛ'], ['yo', 'Yorùbá'], ['ig', 'Igbo'], ['ha', 'Hausa'], ['zu', 'isiZulu'], ['so', 'Soomaali']];
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ckb', 'ug']);
const NEW_LANGS_A_DAY = 60; // new translations a day, so nobody can run up the bill by asking for every language
const NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

// A browser's language tag → the one we translate into ('' for English or anything unknown).
export function langOf(tag) {
  try {
    const l = new Intl.Locale(Intl.getCanonicalLocales(String(tag || '').slice(0, 35))[0]);
    if (!l.language || l.language === 'en') return '';
    const code = l.language === 'zh' ? `zh-${l.maximize().script === 'Hant' ? 'Hant' : 'Hans'}` : l.language;
    const name = NAMES.of(code);
    return name && name !== code ? code : '';
  } catch { return ''; }
}
const tokens = (s) => (String(s).match(/\{[a-z]+\}/g) || []).sort().join();
// The translation, forced into the original's shape: anything missing, empty or with broken placeholders stays in English.
export function conform(orig, got) {
  if (typeof orig === 'string') return typeof got === 'string' && got.trim() && tokens(got) === tokens(orig) ? got.trim().slice(0, 2000) : orig;
  if (Array.isArray(orig)) return orig.map((x, i) => conform(x, Array.isArray(got) ? got[i] : undefined));
  if (orig && typeof orig === 'object') return Object.fromEntries(Object.entries(orig).map(([k, v]) => [k, conform(v, got && typeof got === 'object' ? got[k] : undefined)]));
  return orig;
}
// The words of a room that get translated (never the answers).
const wordsOf = (r) => ({
  setting: r.setting, briefing: r.briefing, cards: r.cards.map((c) => ({ text: c.text, note: c.note })),
  code: { clue: r.code.clue, hint: r.code.hint || '' },
  gates: r.gates.map((g) => ({ clause: g.clause || '', ask: g.ask, rule: g.rule, opts: g.opts.map((o) => ({ t: o.t, why: o.why || '' })) })),
  wordClue: r.wordClue, epilogue: r.epilogue,
});

// Where a visit came from, as the page works it out (public/js/room-invite.js).
export const SOURCES = ['direct', 'search', 'social', 'ai', 'email', 'tickets', 'tam', 'other'];
// The invitations. The first of each list is shown until the counts say otherwise.
export const INVITES = {
  public: [
    { id: 'points', text: 'Today’s escape room is open. Crack four locks and bank 2 TAM Club points.', cta: 'Play today’s room' },
    { id: 'news', text: 'Can you tell today’s real news from the story? Four locks stand between you and tonight’s show.', cta: 'Try the room' },
    { id: 'drink', text: 'Two points a day towards a drink on the house. Today’s room is open.', cta: 'Open the doors' },
  ],
  artist: [
    { id: 'stage', text: 'In TAM’s future the stage belongs to people. Keep the gate tonight and bank 2 TAM Club points.', cta: 'Play today’s room' },
    { id: 'once', text: 'A room where the set is played once and never copied. Could you keep its gate?', cta: 'Try the room' },
    { id: 'card', text: 'Artists earn TAM Club points too: 2 a day for cracking today’s room.', cta: 'Open the doors' },
  ],
};
const ARTIST_PAGES = /^\/(for\/musician|sunday-showcases|great-british-blues-jam|artists)(\/|$)/;
const VARIANTS = new Set([...INVITES.public, ...INVITES.artist].map((v) => v.id).concat(['home', 'none']));
const EXPLORE = 0.2; // one visitor in five sees a wording at random, so the counts keep learning
const ENOUGH = 60; // showings from one kind of source before it gets its own best wording
const KEEP_DAYS = 90;
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|python|headless|lighthouse/i;
const ZERO = () => ({ shown: 0, click: 0, start: 0, open: 0, points: 0 });

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

export function roomDomain(ctx, { dir, translator = null }) {
  const rooms = loadRooms(dir);
  const open = () => rooms.filter((r) => r.date <= ctx.today()); // a room dated tomorrow waits for tomorrow
  const pick = (date) => { const o = open(); return (date ? o.find((r) => r.date === date) : o[o.length - 1]) || null; };
  const must = (date) => { const r = pick(text(date, 10)); if (!r) throw fail(404, 'That room isn’t open.'); return r; };

  // ---------- languages ----------
  if (!ctx.db.roomLang || typeof ctx.db.roomLang !== 'object' || Array.isArray(ctx.db.roomLang)) ctx.db.roomLang = {};
  const kept = ctx.db.roomLang; // { 'date|lang': { ui, room, day } }
  const making = new Map();
  const peek = (r, lang) => (lang && kept[`${r.date}|${lang}`]) || null;
  async function words(r, lang) {
    if (!lang || !translator) return null;
    const key = `${r.date}|${lang}`;
    if (kept[key]) return kept[key];
    if (making.has(key)) return making.get(key);
    const day = ctx.today();
    if (Object.values(kept).filter((x) => x.day === day).length >= NEW_LANGS_A_DAY) return null;
    const job = (async () => {
      try {
        const orig = { ui: UI, room: wordsOf(r) };
        const got = conform(orig, await translator(lang, NAMES.of(lang), orig));
        const live = new Set(open().slice(-14).map((x) => x.date)); // keep the last fortnight's rooms
        for (const k of Object.keys(kept)) if (!live.has(k.split('|')[0])) delete kept[k];
        kept[key] = { ...got, day };
        ctx.save();
        return kept[key];
      } catch (e) { console.warn(`Room translation (${lang}): ${e.message}`); return null; } finally { making.delete(key); }
    })();
    making.set(key, job);
    return job;
  }

  // What the page may see: the puzzle, never the answers. `w` is the room's words in another language.
  const view = (r, w = wordsOf(r)) => ({
    date: r.date, label: r.label, setting: w.setting, briefing: w.briefing,
    cards: w.cards.map((c) => ({ text: c.text })),
    code: { clue: w.code.clue, hint: w.code.hint },
    gates: w.gates.map((g) => ({ clause: g.clause, ask: g.ask, opts: g.opts.map((o) => o.t) })),
    wordLength: r.word.length, wordClue: w.wordClue, sources: r.sources,
  });
  // ---------- invitations and their counts ----------
  if (!ctx.db.roomStats || typeof ctx.db.roomStats !== 'object' || Array.isArray(ctx.db.roomStats)) ctx.db.roomStats = {};
  const stats = ctx.db.roomStats; // { day: { 'audience|source|wording': { shown, click, start, open, points } } }
  const audienceOf = (req, page = '') => (/(?:^|;\s*)tam_path=musician(?:;|$)/.test(req.headers.cookie || '') || ARTIST_PAGES.test(String(page)) ? 'artist' : 'public');
  const clean = (b, req) => ({
    aud: b.aud === 'artist' || b.aud === 'public' ? b.aud : audienceOf(req, b.page),
    src: SOURCES.includes(b.src) ? b.src : 'other',
    variant: VARIANTS.has(b.variant) ? b.variant : 'none',
  });
  function count(type, { aud, src, variant }, req) {
    if (req && BOTS.test(req.headers['user-agent'] || '')) return;
    const day = ctx.today();
    const d = stats[day] || (stats[day] = {});
    const row = d[`${aud}|${src}|${variant}`] || (d[`${aud}|${src}|${variant}`] = ZERO());
    row[type] += 1;
    const oldest = new Date(Date.parse(`${day}T12:00:00Z`) - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(stats)) if (k < oldest) delete stats[k];
    ctx.save();
  }
  function totals(days = 30) {
    const from = new Date(Date.parse(`${ctx.today()}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
    const out = new Map();
    for (const [day, rows] of Object.entries(stats)) {
      if (day < from) continue;
      for (const [key, r] of Object.entries(rows)) {
        const t = out.get(key) || out.set(key, ZERO()).get(key);
        for (const k of Object.keys(t)) t[k] += r[k] || 0;
      }
    }
    return [...out].map(([key, r]) => { const [aud, src, variant] = key.split('|'); return { aud, src, variant, ...r }; });
  }
  // Doors opened per showing is what counts; a click is a quarter of a door. The +1 and +10 keep a
  // wording that has barely been shown from winning or losing on luck.
  const score = (r) => (r.open + 0.25 * r.click + 1) / (r.shown + 10);
  function choose(aud, src, rnd = Math.random) {
    const options = INVITES[aud] || INVITES.public;
    if (rnd() < EXPLORE) return options[Math.floor(rnd() * options.length)];
    const rows = totals().filter((r) => r.aud === aud);
    const sum = (id, s) => rows.filter((r) => r.variant === id && (!s || r.src === s)).reduce((t, r) => { for (const k of Object.keys(t)) t[k] += r[k]; return t; }, ZERO());
    const here = options.map((v) => sum(v.id, src));
    const use = here.reduce((n, r) => n + r.shown, 0) >= ENOUGH ? here : options.map((v) => sum(v.id)); // too few from this source yet: go by everyone
    const best = Math.max(...use.map(score));
    return options[use.findIndex((r) => score(r) === best)];
  }

  const banked = (m, r) => Boolean(m && ctx.db.clubLedger.some((x) => x.m === m.id && x.rule === 'room' && x.key === r.date));
  const solved = (r, b) => Array.isArray(b.cards) && r.cards.every((c, i) => b.cards[i] === c.record)
    && String(b.code || '') === r.code.answer
    && Array.isArray(b.picks) && r.gates.every((g, i) => Boolean(g.opts[b.picks[i]] && g.opts[b.picks[i]].ok))
    && String(b.word || '').trim().toUpperCase() === r.word;

  function routes(r) {
    r.get('/api/room', async (req, res, { url }) => {
      const room = pick(text(url.searchParams.get('date'), 10));
      const m = ctx.club.memberOf(req);
      const asked = langOf(url.searchParams.get('lang'));
      const w = room ? await words(room, asked) : null;
      send(res, 200, {
        lang: w ? asked : 'en', dir: w && RTL.has(asked.split('-')[0]) ? 'rtl' : 'ltr', ui: w ? w.ui : UI, languages: LANGUAGES, translates: Boolean(translator),
        room: room ? view(room, w ? w.room : undefined) : null, rooms: open().map((x) => ({ date: x.date, label: x.label })),
        member: Boolean(m && m.status === 'active'), banked: room ? banked(m, room) : false, points: RULES.room.pts,
      }, { 'Cache-Control': 'no-store' });
    });

    // The line that invites this visitor to today's room.
    r.get('/api/room/invite', (req, res, { url }) => {
      const room = pick();
      if (!room) return send(res, 200, { invite: null }, { 'Cache-Control': 'no-store' });
      const { aud, src } = clean({ src: url.searchParams.get('src'), page: url.searchParams.get('page') }, req);
      const v = choose(aud, src);
      send(res, 200, { invite: { id: v.id, text: v.text, cta: v.cta, href: '/analogue-room', aud, src, date: room.date } }, { 'Cache-Control': 'no-store' });
    });
    // Totals only: an invitation was shown or followed, or a room was started.
    r.post('/api/room/signal', async (req, res) => {
      const b = await readJson(req);
      if (!['shown', 'click', 'start'].includes(b.type)) throw fail(400, 'No such signal.');
      count(b.type, clean(b, req), req);
      send(res, 200, { ok: true });
    });
    r.get('/api/room/stats', (req, res) => {
      if (!ctx.isAdmin(req)) throw fail(401, 'Staff only.');
      send(res, 200, { days: 30, rows: totals() }, { 'Cache-Control': 'no-store' });
    });

    // One move: is this card filed right, does the dial turn, does this ruling stand?
    r.post('/api/room/check', async (req, res) => {
      const b = await readJson(req);
      const room = must(b.date);
      const i = Number(b.i);
      const w = (peek(room, langOf(b.lang)) || { room: wordsOf(room) }).room; // the words in their language, if we have them
      if (b.lock === 'card') {
        const c = room.cards[i];
        if (!c) throw fail(400, 'No such card.');
        return send(res, 200, b.value === c.record
          ? { ok: true, record: c.record, note: w.cards[i].note, source: c.src === undefined || c.src === null ? null : room.sources[c.src] }
          : { ok: false });
      }
      if (b.lock === 'code') return send(res, 200, { ok: String(b.value || '') === room.code.answer });
      if (b.lock === 'gate') {
        const g = room.gates[i];
        const o = g && g.opts[Number(b.value)];
        if (!o) throw fail(400, 'No such ruling.');
        const wo = w.gates[i].opts[Number(b.value)];
        return send(res, 200, o.ok ? { ok: true, rule: w.gates[i].rule, letter: g.letter } : { ok: false, why: wo.why || w.gates[i].rule });
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
      const from = clean(b, req);
      count('open', from, req);
      if (got) count('points', from, req);
      const w = peek(room, langOf(b.lang));
      send(res, 200, { ok: true, epilogue: w ? w.room.epilogue : room.epilogue, member: active, points: got ? got.pts : 0, artist: audienceOf(req) === 'artist' });
    });
  }

  return { routes, today: () => pick(), open, view, choose, count, totals, setTranslator: (f) => { translator = f; } };
}
