// The Analogue Room: four locks, drawn here and checked by the server
// (/api/room). Progress is kept in this browser; the answers never are.
// Every word on the page comes from the server (info.ui and the room), so the
// room can be played in any language: the picker asks for another one.

import { $, api, store } from '/js/lib.js';
import { visit, signal } from '/js/room-invite.js';

const root = $('[data-room]');
const NUM = ['I', 'II', 'III', 'IV'];
let room = null, info = { ui: {} }, flash = {}, hint = false, busy = false;
let saved = store.get('room', { runs: {} });
if (!saved || !saved.runs) saved = { runs: {} };
// The language: the one they picked, or their browser's.
let lang = store.get('room-lang', '') || (navigator.languages && navigator.languages[0]) || navigator.language || 'en';

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c === null || c === undefined || c === false) continue; n.append(c.nodeType ? c : document.createTextNode(c)); }
  return n;
}
// A line of the game's own words, in their language, with {placeholders} filled.
const t = (key, vals = {}) => String(info.ui[key] || '').replace(/\{([a-z]+)\}/g, (m, k) => (vals[k] === undefined ? m : vals[k]));
const run = () => (saved.runs[room.date] = saved.runs[room.date] || { cards: {}, code: '', gates: {}, open: null, slips: 0, secs: 0 });
const keep = () => store.set('room', saved);
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const link = (s) => el('a', { href: s.u, target: '_blank', rel: 'noopener' }, s.t);

function progress() {
  const r = run();
  const l1 = room.cards.every((_, i) => r.cards[i]);
  const l2 = l1 && Boolean(r.code);
  const l3 = l2 && room.gates.every((_, i) => r.gates[i]);
  return [l1, l2, l3, l3 && Boolean(r.open)];
}
function slip(key, msg) { run().slips++; flash = { [key]: msg }; keep(); draw(); }

async function check(body, key) {
  if (busy) return null;
  busy = true;
  const r = run();
  if (!r.started) { r.started = true; keep(); signal('start'); } // the first move, once a room
  try { return await api('/api/room/check', { method: 'POST', body: { date: room.date, lang: info.lang, ...body } }); }
  catch (e) { flash = { [key]: e.message }; draw(); return null; }
  finally { busy = false; }
}

async function fileCard(i, value) {
  const got = await check({ lock: 'card', i, value }, `c${i}`);
  if (!got) return;
  if (got.ok) { run().cards[i] = { record: got.record, note: got.note, source: got.source }; flash = {}; keep(); draw(); }
  else slip(`c${i}`, t(value ? 'notReported' : 'isReported'));
}
async function turnDial() {
  const value = ($('#ar-dial').value || '').replace(/\D/g, '');
  const got = await check({ lock: 'code', value }, 'code');
  if (!got) return;
  if (got.ok) { run().code = value; flash = {}; keep(); draw(); } else slip('code', t('dialStuck'));
}
async function rule(i, value) {
  const got = await check({ lock: 'gate', i, value }, `g${i}`);
  if (!got) return;
  if (got.ok) { run().gates[i] = { pick: value, rule: got.rule, letter: got.letter }; flash = {}; keep(); draw(); } else slip(`g${i}`, got.why);
}
async function openDoors() {
  if (busy) return;
  const r = run();
  const word = ($('#ar-word').value || '').trim();
  busy = true;
  try {
    const got = await api('/api/room/open', { method: 'POST', body: {
      date: room.date, lang: info.lang, cards: room.cards.map((_, i) => r.cards[i].record), code: r.code, picks: room.gates.map((_, i) => r.gates[i].pick), word, ...visit() } });
    busy = false;
    if (!got.ok) return slip('word', t('doorsShut'));
    r.open = { word: word.toUpperCase(), epilogue: got.epilogue, points: got.points, member: got.member, artist: got.artist };
    flash = {}; keep(); draw();
    $('#ar-open').scrollIntoView({ block: 'start' });
  } catch (e) { busy = false; flash = { word: e.message }; draw(); }
}

// The language picker: the list in each language's own name, plus the browser's own if it isn't listed.
function picker() {
  const list = (info.languages || []).slice();
  let mine = '';
  try { mine = new Intl.Locale((navigator.languages && navigator.languages[0]) || navigator.language).language; } catch { /* odd tag */ }
  if (mine && !list.some(([c]) => c.split('-')[0] === mine)) {
    let name = mine;
    try { name = new Intl.DisplayNames([mine], { type: 'language' }).of(mine) || mine; } catch { /* no names */ }
    list.push([mine, name]);
  }
  return el('label', { class: 'ar-lang' }, el('span', { class: 'label' }, info.lang === 'en' ? 'Language' : `${t('language')} · Language`),
    el('select', { id: 'ar-lang', onchange: (e) => { lang = e.target.value; store.set('room-lang', lang); load(room && room.date); } },
      list.map(([c, name]) => el('option', { value: c, selected: c === info.lang, lang: c }, name))));
}

// The page's own lines (written in English by the server) in their language.
function header() {
  const set = (sel, text) => { const n = $(sel); if (n && text) n.textContent = text; };
  const pts = $('[data-room-points]');
  set('[data-room-note]', t('note'));
  set('[data-room-setting]', room.setting);
  if (pts) pts.textContent = t('pointsLine', { pts: pts.dataset.pts, half: pts.dataset.half });
  const b = $('[data-room-briefing]');
  if (b) b.replaceChildren(...room.briefing.map((p) => el('p', null, p)));
  const sec = root.closest('.ar');
  if (sec) { sec.setAttribute('dir', info.dir || 'ltr'); sec.setAttribute('lang', info.lang || 'en'); }
}

function draw() {
  const r = run(), p = progress();
  const out = [];
  if (info.translates) out.push(picker());
  if (info.lang !== 'en') out.push(el('p', { class: 'small muted' }, t('autoTranslated')));
  out.push(el('div', { class: 'ar-status' },
    el('div', { class: 'ar-seals', role: 'img', 'aria-label': t('locksCleared', { n: p.filter(Boolean).length }) }, p.map((ok, i) => el('span', { class: `ar-seal${ok ? ' done' : ''}` }, NUM[i]))),
    el('span', { class: 'ar-timer', id: 'ar-timer' }, fmt(r.secs))));
  if (info.rooms && info.rooms.length > 1) out.push(el('div', { class: 'ar-days' }, info.rooms.slice().reverse().map((d) =>
    el('button', { class: `btn ghost small${d.date === room.date ? ' on' : ''}`, type: 'button', onclick: () => load(d.date) }, d.label))));

  out.push(el('section', { class: 'ar-lock' },
    el('header', null, el('h2', null, t('desk')), el('span', { class: 'label' }, t('lock', { n: NUM[0] }))),
    el('p', null, t('deskIntro', { n: room.cards.length })),
    el('div', { class: 'ar-cards' }, room.cards.map((c, i) => {
      const done = r.cards[i];
      if (done) return el('div', { class: `ar-card ${done.record ? 'rec' : 'sto'}` },
        el('span', { class: 'ar-tag' }, t(done.record ? 'onRecord' : 'story')), el('p', null, c.text),
        el('p', { class: 'small muted' }, done.note, done.source ? [' ', el('a', { href: done.source.u, target: '_blank', rel: 'noopener' }, t('source'))] : null));
      return el('div', { class: 'ar-card' }, el('p', null, c.text),
        el('div', { class: 'ar-row' },
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => fileCard(i, true) }, t('onRecord')),
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => fileCard(i, false) }, t('story'))),
        flash[`c${i}`] ? el('p', { class: 'err', role: 'alert' }, flash[`c${i}`]) : null);
    }))));

  out.push(el('section', { class: `ar-lock${p[0] ? '' : ' shut'}` },
    el('header', null, el('h2', null, t('dial')), el('span', { class: 'label' }, t('lock', { n: NUM[1] }))),
    el('p', null, room.code.clue),
    r.code ? el('p', { class: 'small muted' }, t('dialTurned', { code: r.code })) : [
      el('div', { class: 'ar-row' },
        el('input', { id: 'ar-dial', class: 'ar-input', inputmode: 'numeric', maxlength: '4', autocomplete: 'off', 'aria-label': t('codeLabel'), disabled: !p[0], onkeydown: (e) => { if (e.key === 'Enter') turnDial(); } }),
        el('button', { class: 'btn hot', type: 'button', disabled: !p[0], onclick: turnDial }, t('turnDial'))),
      !p[0] ? el('p', { class: 'small muted' }, t('opensDesk'))
        : room.code.hint ? el('button', { class: 'linkish', type: 'button', onclick: () => { hint = !hint; draw(); } }, t(hint ? 'hideHint' : 'askHint')) : null,
      hint && p[0] ? el('p', { class: 'small muted' }, room.code.hint) : null,
      flash.code ? el('p', { class: 'err', role: 'alert' }, flash.code) : null]));

  out.push(el('section', { class: `ar-lock${p[1] ? '' : ' shut'}` },
    el('header', null, el('h2', null, t('gate')), el('span', { class: 'label' }, t('lock', { n: NUM[2] }))),
    el('p', null, t('gateIntro')),
    !p[1] ? el('p', { class: 'small muted' }, t('opensDial')) : null,
    room.gates.map((g, i) => {
      const done = r.gates[i];
      if (done) return el('div', { class: 'ar-gate won' }, el('span', { class: 'ar-letter', dir: 'ltr' }, done.letter),
        el('div', null, g.clause ? el('span', { class: 'label' }, g.clause) : null, el('p', null, g.ask), el('p', { class: 'small muted' }, `${g.opts[done.pick]} ${done.rule}`)));
      return el('div', { class: 'ar-gate' }, g.clause ? el('span', { class: 'label' }, g.clause) : null, el('p', null, g.ask),
        g.opts.map((o, k) => el('button', { class: 'ar-opt', type: 'button', disabled: !p[1], onclick: () => rule(i, k) }, o)),
        flash[`g${i}`] ? el('p', { class: 'err', role: 'alert' }, flash[`g${i}`]) : null);
    })));

  out.push(el('section', { class: `ar-lock${p[2] ? '' : ' shut'}` },
    el('header', null, el('h2', null, t('doors')), el('span', { class: 'label' }, t('lock', { n: NUM[3] }))),
    el('p', null, room.wordClue),
    info.lang !== 'en' ? el('p', { class: 'small muted' }, t('wordNote')) : null,
    r.open ? el('p', { class: 'small muted' }, t('wordWas', { code: r.open.word })) : [
      el('div', { class: 'ar-row' },
        el('input', { id: 'ar-word', class: 'ar-input', maxlength: String(room.wordLength), autocomplete: 'off', autocapitalize: 'characters', 'aria-label': t('wordLabel'), disabled: !p[2], onkeydown: (e) => { if (e.key === 'Enter') openDoors(); } }),
        el('button', { class: 'btn hot', type: 'button', disabled: !p[2], onclick: openDoors }, t('openDoors'))),
      !p[2] ? el('p', { class: 'small muted' }, t('opensGate')) : null,
      flash.word ? el('p', { class: 'err', role: 'alert' }, flash.word) : null]));

  if (r.open) {
    const o = r.open;
    const club = o.points ? el('p', { class: 'ar-won' }, t('pointsWon', { pts: o.points }), ' ', el('a', { href: '/club' }, t('seeCard')))
      : o.member ? el('p', { class: 'small muted' }, t('hadPoints'))
        : el('p', { class: 'ar-won' }, t('joinLine', { pts: info.points }), ' ', el('a', { href: '/club' }, t('joinFree')));
    out.push(el('section', { class: 'ar-lock ar-open', id: 'ar-open' },
      el('header', null, el('h2', null, t('doorsOpen')), el('span', { class: 'label' }, `${fmt(r.secs)} · ${t('slips', { n: r.slips })}`)),
      o.epilogue.map((x) => el('p', null, x)), club,
      o.artist ? el('p', null, t('artistLine'), ' ', el('a', { href: '/for/musician' }, t('playAtTam'))) : null,
      el('p', { class: 'small muted' }, t('nextRoom'))));
  }
  out.push(el('div', { class: 'ar-sources small muted' }, t('sourcesToday'), el('ul', { dir: 'ltr' }, room.sources.map((s) => el('li', null, link(s))))));
  root.replaceChildren(...out);
}

async function load(date) {
  try {
    const q = new URLSearchParams({ lang });
    if (date) q.set('date', date);
    info = await api(`/api/room?${q}`);
    room = info.room;
    if (!room) { root.replaceChildren(el('p', { class: 'muted' }, t('quiet'))); return; }
    flash = {}; hint = false;
    header();
    draw();
  } catch (e) { root.replaceChildren(el('p', { class: 'err', role: 'alert' }, e.message)); }
}

if (root) {
  load();
  setInterval(() => {
    if (!room || document.hidden) return;
    const r = run();
    if (r.open) return;
    r.secs++;
    const tm = $('#ar-timer'); if (tm) tm.textContent = fmt(r.secs);
    if (r.secs % 5 === 0) keep();
  }, 1000);
}
