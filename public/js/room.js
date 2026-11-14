// The Analogue Room: four locks, drawn here and checked by the server
// (/api/room). Progress is kept in this browser; the answers never are.

import { $, api, store } from '/js/lib.js';

const root = $('[data-room]');
const NUM = ['I', 'II', 'III', 'IV'];
let room = null, info = {}, flash = {}, hint = false, busy = false;
let saved = store.get('room', { runs: {} });
if (!saved || !saved.runs) saved = { runs: {} };

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
  try { return await api('/api/room/check', { method: 'POST', body: { date: room.date, ...body } }); }
  catch (e) { flash = { [key]: e.message }; draw(); return null; }
  finally { busy = false; }
}

async function fileCard(i, value) {
  const got = await check({ lock: 'card', i, value }, `c${i}`);
  if (!got) return;
  if (got.ok) { run().cards[i] = { record: got.record, note: got.note, source: got.source }; flash = {}; keep(); draw(); }
  else slip(`c${i}`, value ? 'Nobody has reported that. Look again.' : 'That one is reported. Look again.');
}
async function turnDial() {
  const value = ($('#ar-dial').value || '').replace(/\D/g, '');
  const got = await check({ lock: 'code', value }, 'code');
  if (!got) return;
  if (got.ok) { run().code = value; flash = {}; keep(); draw(); } else slip('code', 'The dial does not turn. Check the record.');
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
      date: room.date, cards: room.cards.map((_, i) => r.cards[i].record), code: r.code, picks: room.gates.map((_, i) => r.gates[i].pick), word } });
    busy = false;
    if (!got.ok) return slip('word', 'The doors stay shut. Read the brass again, top to bottom.');
    r.open = { word: word.toUpperCase(), epilogue: got.epilogue, points: got.points, member: got.member };
    flash = {}; keep(); draw();
    $('#ar-open').scrollIntoView({ block: 'start' });
  } catch (e) { busy = false; flash = { word: e.message }; draw(); }
}

function draw() {
  const r = run(), p = progress();
  const out = [];
  out.push(el('div', { class: 'ar-status' },
    el('div', { class: 'ar-seals', role: 'img', 'aria-label': `${p.filter(Boolean).length} of 4 locks cleared` }, p.map((ok, i) => el('span', { class: `ar-seal${ok ? ' done' : ''}` }, NUM[i]))),
    el('span', { class: 'ar-timer', id: 'ar-timer' }, fmt(r.secs))));
  if (info.rooms && info.rooms.length > 1) out.push(el('div', { class: 'ar-days' }, info.rooms.slice().reverse().map((d) =>
    el('button', { class: `btn ghost small${d.date === room.date ? ' on' : ''}`, type: 'button', onclick: () => load(d.date) }, d.label))));

  out.push(el('section', { class: 'ar-lock' },
    el('header', null, el('h2', null, 'The sorting desk'), el('span', { class: 'label' }, 'Lock I')),
    el('p', null, `${room.cards.length} lines came down the wire. File each one: is it on the record, or is it a story?`),
    el('div', { class: 'ar-cards' }, room.cards.map((c, i) => {
      const done = r.cards[i];
      if (done) return el('div', { class: `ar-card ${done.record ? 'rec' : 'sto'}` },
        el('span', { class: 'ar-tag' }, done.record ? 'On the record' : 'Story'), el('p', null, c.text),
        el('p', { class: 'small muted' }, done.note, done.source ? [' ', el('a', { href: done.source.u, target: '_blank', rel: 'noopener' }, 'Source')] : null));
      return el('div', { class: 'ar-card' }, el('p', null, c.text),
        el('div', { class: 'ar-row' },
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => fileCard(i, true) }, 'On the record'),
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => fileCard(i, false) }, 'Story')),
        flash[`c${i}`] ? el('p', { class: 'err', role: 'alert' }, flash[`c${i}`]) : null);
    }))));

  out.push(el('section', { class: `ar-lock${p[0] ? '' : ' shut'}` },
    el('header', null, el('h2', null, 'The dial'), el('span', { class: 'label' }, 'Lock II')),
    el('p', null, room.code.clue),
    r.code ? el('p', { class: 'small muted' }, `The dial turned at ${r.code}.`) : [
      el('div', { class: 'ar-row' },
        el('input', { id: 'ar-dial', class: 'ar-input', inputmode: 'numeric', maxlength: '4', autocomplete: 'off', 'aria-label': 'Four-digit code', disabled: !p[0], onkeydown: (e) => { if (e.key === 'Enter') turnDial(); } }),
        el('button', { class: 'btn hot', type: 'button', disabled: !p[0], onclick: turnDial }, 'Turn the dial')),
      !p[0] ? el('p', { class: 'small muted' }, 'Opens when the desk is clear.')
        : room.code.hint ? el('button', { class: 'linkish', type: 'button', onclick: () => { hint = !hint; draw(); } }, hint ? 'Hide the hint' : 'Ask for a hint') : null,
      hint && p[0] ? el('p', { class: 'small muted' }, room.code.hint) : null,
      flash.code ? el('p', { class: 'err', role: 'alert' }, flash.code) : null]));

  out.push(el('section', { class: `ar-lock${p[1] ? '' : ' shut'}` },
    el('header', null, el('h2', null, 'The gate'), el('span', { class: 'label' }, 'Lock III')),
    el('p', null, 'Things want to cross the wall tonight. Every crossing has a contract, and you are the one accountable for it. A right ruling stamps a letter in the brass.'),
    !p[1] ? el('p', { class: 'small muted' }, 'Opens when the dial has turned.') : null,
    room.gates.map((g, i) => {
      const done = r.gates[i];
      if (done) return el('div', { class: 'ar-gate won' }, el('span', { class: 'ar-letter' }, done.letter),
        el('div', null, g.clause ? el('span', { class: 'label' }, g.clause) : null, el('p', null, g.ask), el('p', { class: 'small muted' }, `${g.opts[done.pick]} ${done.rule}`)));
      return el('div', { class: 'ar-gate' }, g.clause ? el('span', { class: 'label' }, g.clause) : null, el('p', null, g.ask),
        g.opts.map((t, k) => el('button', { class: 'ar-opt', type: 'button', disabled: !p[1], onclick: () => rule(i, k) }, t)),
        flash[`g${i}`] ? el('p', { class: 'err', role: 'alert' }, flash[`g${i}`]) : null);
    })));

  out.push(el('section', { class: `ar-lock${p[2] ? '' : ' shut'}` },
    el('header', null, el('h2', null, 'The doors'), el('span', { class: 'label' }, 'Lock IV')),
    el('p', null, room.wordClue),
    r.open ? el('p', { class: 'small muted' }, `The word was ${r.open.word}.`) : [
      el('div', { class: 'ar-row' },
        el('input', { id: 'ar-word', class: 'ar-input', maxlength: String(room.wordLength), autocomplete: 'off', 'aria-label': 'The word', disabled: !p[2], onkeydown: (e) => { if (e.key === 'Enter') openDoors(); } }),
        el('button', { class: 'btn hot', type: 'button', disabled: !p[2], onclick: openDoors }, 'Open the doors')),
      !p[2] ? el('p', { class: 'small muted' }, 'Opens when the gate has ruled.') : null,
      flash.word ? el('p', { class: 'err', role: 'alert' }, flash.word) : null]));

  if (r.open) {
    const o = r.open;
    const club = o.points ? el('p', { class: 'ar-won' }, `+${o.points} points on your TAM Club card. `, el('a', { href: '/club' }, 'See your card'))
      : o.member ? el('p', { class: 'small muted' }, 'You’ve had today’s room points. A new room opens tomorrow morning.')
        : el('p', { class: 'ar-won' }, `Join the TAM Club and the next room banks ${info.points} points. `, el('a', { href: '/club' }, 'Join free'));
    out.push(el('section', { class: 'ar-lock ar-open', id: 'ar-open' },
      el('header', null, el('h2', null, 'Doors open'), el('span', { class: 'label' }, `${fmt(r.secs)} · ${r.slips} ${r.slips === 1 ? 'slip' : 'slips'}`)),
      o.epilogue.map((t) => el('p', null, t)), club,
      el('p', { class: 'small muted' }, 'The next room is built tomorrow morning from the day’s news.')));
  }
  out.push(el('div', { class: 'ar-sources small muted' }, 'On the record today:', el('ul', null, room.sources.map((s) => el('li', null, link(s))))));
  root.replaceChildren(...out);
}

async function load(date) {
  try {
    info = await api(`/api/room${date ? `?date=${encodeURIComponent(date)}` : ''}`);
    room = info.room;
    if (!room) { root.replaceChildren(el('p', { class: 'muted' }, 'The gatehouse is quiet today. A new room opens tomorrow morning.')); return; }
    flash = {}; hint = false;
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
    const t = $('#ar-timer'); if (t) t.textContent = fmt(r.secs);
    if (r.secs % 5 === 0) keep();
  }, 1000);
}
