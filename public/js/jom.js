// JOM, the Junior Open Mic microverse: one screen per young artist.
// Left and right move along Backstage | Lineup | Spotlight | Profile;
// on Spotlight, up and down move through the artists.
// Data: /api/jom (src/domain/openmic.js). Nothing here is trusted as HTML:
// every value goes in as text.

import { store, copyText } from './lib.js';

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'hue') el.style.setProperty('--h', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(3)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const root = $('jom');
if (root) start();

function start() {
  // ----- who you are: a random fan id, and the private key to your own profile -----
  let fan = store.get('jomFan', '');
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(fan)) {
    const b = new Uint8Array(18); crypto.getRandomValues(b);
    fan = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    store.set('jomFan', fan);
  }
  const q = new URLSearchParams(location.search);
  if (q.get('own') && /^JOM-[A-Z0-9]+\.[A-Za-z0-9_-]+$/.test(q.get('own'))) {
    const [id, key] = q.get('own').split('.');
    store.set('jomOwn', { id, key });
    history.replaceState(null, '', location.pathname + location.hash);
  }
  let own = store.get('jomOwn', null); // { id, key }

  // ----- state -----
  let artists = [], mine = { follows: {}, cheers: {} }, me = null, cheers = [], hues = [45];
  let loaded = false, loadErr = '';
  let col = 2, row = 0, curId = null, filter = 'all';
  let formPhoto, busy = false, confirmDel = false, justMade = null;
  const wantId = /^#a-(JOM-[A-Z0-9]+)$/.exec(location.hash);

  const rows = () => [null, ...artists, ...(me && me.state !== 'live' && !artists.some((a) => a.id === me.id) ? [me] : [])];
  const cur = () => rows().find((a) => a && a.id === curId) || null;
  const iFollow = (id) => Boolean(mine.follows[id]);
  const iCheer = (id, k) => Boolean((mine.cheers[id] || {})[k]);

  let toastT = 0;
  function toast(msg) { const t = $('jom-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3600); }

  async function call(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: { 'x-jom-fan': fan, ...(own ? { 'x-jom-own': `${own.id}.${own.key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
    return data;
  }
  async function load() {
    try {
      const d = await call('/api/jom');
      artists = d.artists; mine = d.mine; me = d.own; cheers = d.cheers; hues = d.hues;
      if (own && !me) { own = null; store.set('jomOwn', null); } // removed, or the key no longer fits
      loaded = true; loadErr = '';
    } catch (e) { if (!loaded) loadErr = 'The lineup didn’t load. Refresh to try again.'; }
    renderAll();
  }

  // ----- follow and cheer -----
  async function fanAct(a, body, optimistic) {
    if (a.own && a.state !== 'live') return toast('Fans can follow once the profile is live.');
    optimistic();
    renderAll();
    try {
      const r = await call('/api/jom/fan', { fan, artist: a.id, ...body });
      mine = r.mine;
      const t = artists.find((x) => x.id === r.artist);
      if (t) { t.followers = r.followers; t.cheers = r.cheers; }
    } catch (e) { toast(e.message); await load(); return; }
    renderAll();
  }
  const toggleFollow = (a) => { const on = !iFollow(a.id); fanAct(a, { follow: on }, () => { if (on) mine.follows[a.id] = true; else delete mine.follows[a.id]; a.followers = Math.max(0, a.followers + (on ? 1 : -1)); }); };
  const toggleCheer = (a, k) => { const on = !iCheer(a.id, k); fanAct(a, { cheer: k, on }, () => { const m = (mine.cheers[a.id] = mine.cheers[a.id] || {}); if (on) m[k] = true; else delete m[k]; a.cheers[k] = Math.max(0, (a.cheers[k] || 0) + (on ? 1 : -1)); }); };

  // ----- moving around -----
  const track = $('jom-track'), vtrack = $('jom-vtrack');
  const panels = [$('jom-p-back'), $('jom-p-line'), $('jom-p-spot'), $('jom-p-prof')];
  function place() {
    track.style.transform = `translateX(${-col * 25}%)`;
    vtrack.style.transform = `translateY(${-row * 100}%)`;
    panels.forEach((p, i) => { p.inert = i !== col; });
    [...vtrack.children].forEach((c, i) => { c.inert = i !== row; });
    document.querySelectorAll('.jom-tabs button').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.col === col)));
    const n = rows().length - 1;
    $('jom-pos').textContent = n ? `${String(row).padStart(2, '0')} / ${String(n).padStart(2, '0')}` : '';
  }
  function go(c, r) {
    const R = rows(), prev = curId;
    col = clamp(c, 0, 3); row = clamp(r, 0, R.length - 1); curId = R[row] ? R[row].id : null;
    if (curId !== prev) {
      renderProfile(); $('jom-p-prof').scrollTop = 0;
      history.replaceState(null, '', curId && !(R[row].own && R[row].state !== 'live') ? `#a-${curId}` : location.pathname);
    }
    place();
  }
  const goArtist = (id, c = 2) => { const i = rows().findIndex((a) => a && a.id === id); go(c, i < 0 ? 0 : i); };

  document.querySelector('.jom-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(+b.dataset.col, row); });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowLeft') go(col - 1, row); else if (e.key === 'ArrowRight') go(col + 1, row);
    else if (col === 2 && e.key === 'ArrowUp') { e.preventDefault(); go(col, row - 1); }
    else if (col === 2 && e.key === 'ArrowDown') { e.preventDefault(); go(col, row + 1); }
  });
  let wheelLock = 0;
  $('jom-p-spot').addEventListener('wheel', (e) => {
    const now = Date.now(); if (now < wheelLock) return;
    if (Math.abs(e.deltaY) > 24 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) { wheelLock = now + 520; go(col, row + (e.deltaY > 0 ? 1 : -1)); }
    else if (Math.abs(e.deltaX) > 24) { wheelLock = now + 520; go(col + (e.deltaX > 0 ? 1 : -1), row); }
  }, { passive: true });

  let g = null, swallow = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input,textarea,select,.jom-swatches')) return;
    g = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, dx: 0, dy: 0 };
  });
  track.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'y' && col !== 2) { g = null; return; }
      try { track.setPointerCapture(e.pointerId); } catch { /* fine */ }
      root.classList.add('jom-drag');
    }
    g.dx = dx; g.dy = dy;
    if (g.axis === 'x') {
      const d = ((col === 0 && dx > 0) || (col === 3 && dx < 0)) ? dx * 0.25 : dx;
      track.style.transform = `translateX(calc(${-col * 25}% + ${d}px))`;
    } else {
      const last = rows().length - 1, d = ((row === 0 && dy > 0) || (row === last && dy < 0)) ? dy * 0.25 : dy;
      vtrack.style.transform = `translateY(calc(${-row * 100}% + ${d}px))`;
    }
  });
  function endDrag() {
    if (!g) return; const s = g; g = null; root.classList.remove('jom-drag');
    if (!s.axis) return;
    swallow = true; setTimeout(() => { swallow = false; }, 60);
    if (s.axis === 'x') go(col + (s.dx < -48 ? 1 : s.dx > 48 ? -1 : 0), row);
    else go(col, row + (s.dy < -48 ? 1 : s.dy > 48 ? -1 : 0));
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);

  // ----- Spotlight -----
  const chev = (up) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', up ? 'M3 10.5 8 5.5l5 5' : 'M3 5.5 8 10.5l5-5'); s.append(p); return s; };
  const stateNote = (a) => (a.state === 'waiting' ? 'Waiting for TAM’s OK. Only you can see this for now.' : a.state === 'hidden' ? 'TAM has taken this profile off the lineup. Talk to the team at the next JOM.' : '');
  function houseCard() {
    const n = artists.length;
    return h('article', { class: 'jom-card jom-house' },
      h('div', null, h('p', { class: 'label', text: 'Temple of Art & Music · Elephant & Castle' }), h('h1', { class: 'jom-big' }, 'Junior ', h('em', { text: 'Open Mic' }))),
      h('p', { class: 'jom-lede', text: 'The young artists of TAM, one screen each. Find someone you like, follow them, and cheer them on.' }),
      h('div', { class: 'jom-compass', 'aria-label': 'How to move around' },
        h('button', { type: 'button', class: 'n', disabled: true, text: 'Up · previous artist' }),
        h('button', { type: 'button', class: 'w', onclick: () => go(1, row), text: '‹ Lineup' }),
        h('div', { class: 'hub' }, h('img', { src: '/img/tam-mark-96.png', alt: '', width: '40', height: '40' })),
        h('button', { type: 'button', class: 'e', onclick: () => go(3, row), text: 'About ›' }),
        h('button', { type: 'button', class: 's', disabled: rows().length < 2, onclick: () => go(2, 1), text: 'Down · next artist' })),
      h('div', { class: 'jom-cta' },
        n ? h('button', { type: 'button', class: 'btn hot', onclick: () => go(2, 1), text: 'Meet the artists' }) : null,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => go(0, row), text: me ? 'Edit your profile' : 'Create your profile' })),
      h('p', { class: 'muted small' }, !loaded ? (loadErr || 'Loading the lineup…') : n ? `${plural(n, 'artist', 'artists')} on the lineup. ` : 'Nobody is on the lineup yet. Be the first. ',
        root.dataset.nextHref ? h('a', { href: root.dataset.nextHref, text: `${root.dataset.next.replace('Next: ', 'Next JOM: ')} →` }) : null));
  }
  function artistCard(a, i, last) {
    const fol = iFollow(a.id), enc = iCheer(a.id, 'encore');
    return h('article', { class: 'jom-card', hue: a.hue },
      h('div', { class: 'jom-bg' }, a.photo ? h('img', { src: a.photo, alt: '', draggable: 'false' }) : null),
      a.photo ? null : h('div', { class: 'jom-mono', 'aria-hidden': 'true', text: initials(a.name) }),
      h('div', { class: 'jom-scrim' }),
      a.own && stateNote(a) ? h('p', { class: 'jom-flag', text: stateNote(a) }) : null,
      h('div', { class: 'jom-meta' },
        a.act ? h('p', { class: 'label', text: a.act }) : null,
        h('h2', { class: 'jom-name', text: a.name }),
        a.genres.length ? h('div', { class: 'chips' }, a.genres.map((x) => h('span', { class: 'chip', text: x }))) : null,
        a.bio ? h('p', { class: 'jom-bio', text: a.bio }) : null,
        h('button', { type: 'button', class: 'jom-more', onclick: () => go(3, row), text: 'Full profile ›' })),
      h('div', { class: 'jom-rail' },
        h('button', { type: 'button', class: `jom-act${fol ? ' on' : ''}`, 'aria-pressed': String(fol), onclick: () => toggleFollow(a) },
          h('span', { class: 'disc', text: fol ? '✓' : '+' }), h('span', { class: 'num', text: a.followers }), h('span', { text: fol ? 'Following' : 'Follow' })),
        h('button', { type: 'button', class: `jom-act${enc ? ' on' : ''}`, 'aria-pressed': String(enc), onclick: () => toggleCheer(a, 'encore') },
          h('span', { class: 'disc', text: '★' }), h('span', { class: 'num', text: a.cheers.encore || 0 }), h('span', { text: 'Encore' })),
        h('button', { type: 'button', class: 'jom-step', 'aria-label': 'Previous', onclick: () => go(2, i - 1) }, chev(true)),
        h('button', { type: 'button', class: 'jom-step', 'aria-label': 'Next artist', disabled: i >= last, onclick: () => go(2, i + 1) }, chev(false))));
  }
  function renderSpot() {
    const R = rows();
    vtrack.replaceChildren(...R.map((a, i) => (a ? artistCard(a, i, R.length - 1) : houseCard())));
  }

  // ----- Profile -----
  const sec = (title, ...kids) => h('section', { class: 'jom-sec' }, h('h3', { text: title }), kids);
  function renderProfile() {
    const a = cur(), box = $('jom-prof');
    if (!a) {
      box.replaceChildren(h('div', { class: 'jom-pad' },
        h('div', null, h('p', { class: 'label', text: 'About' }), h('h2', { class: 'jom-h', text: 'Junior Open Mic' })),
        h('p', { text: 'JOM is the open mic for young performers at TAM, the Temple of Art & Music, inside Mercato Metropolitano at 42 Newington Causeway, London SE1. Every artist gets a page of their own here, and everyone else gets a way to follow them.' }),
        root.dataset.nextHref ? h('p', null, h('a', { class: 'btn hot', href: root.dataset.nextHref, text: root.dataset.next.replace('Next: ', 'Next JOM: ') })) : null,
        sec('How it works', h('ul', { class: 'jom-list' },
          h('li', { text: 'Swipe up and down on Spotlight to move between artists.' }),
          h('li', { text: 'Swipe left for an artist’s full profile, right for the whole lineup.' }),
          h('li', { text: 'Follow the artists you like. The Lineup can show just the ones you follow.' }),
          h('li', { text: 'Performers make their own profile in Backstage.' }))),
        sec('How we keep it safe', h('ul', { class: 'jom-list' },
          h('li', { text: 'No messages and no comments. Fans can follow and send one of four cheers, nothing else.' }),
          h('li', { text: 'Stage names are fine. Nobody has to give a full name, school or address.' }),
          h('li', { text: 'A parent or guardian agrees before a profile is sent, and their email is seen only by TAM’s team.' }),
          h('li', { text: 'TAM approves every profile and every change before it appears, and can take one down at any time.' }))),
        h('p', null, h('a', { class: 'btn ghost', href: '/open-mic', text: 'All open mics at TAM' }), ' ', h('a', { href: '/privacy', class: 'small', text: 'Privacy' }))));
      return;
    }
    const fol = iFollow(a.id);
    box.replaceChildren(
      h('div', { class: 'jom-banner', hue: a.hue }),
      h('div', { class: 'jom-phead', hue: a.hue },
        h('div', { class: 'jom-avatar' }, a.photo ? h('img', { src: a.photo, alt: `Photo of ${a.name}` }) : initials(a.name)),
        h('h2', { class: 'jom-h', text: a.name }),
        a.act ? h('p', { class: 'jom-act-line', text: a.act }) : null,
        h('p', { class: 'muted small', text: `${plural(a.followers, 'follower', 'followers')} · Junior Open Mic, TAM` }),
        h('div', { class: 'jom-row' },
          h('button', { type: 'button', class: `btn ${fol ? 'ghost' : 'hot'}`, 'aria-pressed': String(fol), onclick: () => toggleFollow(a), text: fol ? '✓ Following' : '+ Follow' }),
          a.own ? null : h('button', { type: 'button', class: 'btn ghost', onclick: async () => { const ok = await copyText(`${location.origin}${location.pathname}#a-${a.id}`); toast(ok ? 'Link copied. Share it!' : `Share this page: ${location.host}${location.pathname}#a-${a.id}`); }, text: 'Share' }),
          me && me.id === a.id ? h('button', { type: 'button', class: 'btn ghost', onclick: () => go(0, row), text: 'Edit' }) : null)),
      h('div', { class: 'jom-pad' },
        a.own && stateNote(a) ? h('p', { class: 'jom-note', text: stateNote(a) }) : null,
        a.bio ? sec('About', h('p', { class: 'jom-long', text: a.bio }), a.genres.length ? h('div', { class: 'chips' }, a.genres.map((x) => h('span', { class: 'chip', text: x }))) : null) : null,
        sec('Cheer them on', h('div', { class: 'jom-cheers' }, cheers.map(([k, label]) => { const on = iCheer(a.id, k);
          return h('button', { type: 'button', class: `jom-cheer${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => toggleCheer(a, k) }, h('span', { text: label }), h('b', { text: a.cheers[k] || 0 })); })),
          h('p', { class: 'muted small', text: 'Cheers are the only thing fans can send. There are no comments or messages.' })),
        a.links.length ? sec('Watch & listen', a.links.map((l) => h('a', { class: 'jom-link', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { text: l.label }), h('span', { text: 'Open ↗' })))) : null,
        a.setlist.length ? sec('Setlist', h('ul', { class: 'jom-list' }, a.setlist.map((s) => h('li', { text: s })))) : null,
        a.stage.length ? sec('Stage time', h('ul', { class: 'jom-list' }, a.stage.map((s) => h('li', { text: s })))) : null));
  }

  // ----- Lineup -----
  function renderLineup() {
    const all = rows().filter(Boolean), list = filter === 'following' ? all.filter((a) => iFollow(a.id)) : all;
    const kids = [h('div', null, h('p', { class: 'label', text: 'Everyone on the bill' }), h('h2', { class: 'jom-h', text: 'The Lineup' })),
      h('div', { class: 'jom-row' },
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === 'all'), onclick: () => { filter = 'all'; renderLineup(); }, text: `All · ${all.length}` }),
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === 'following'), onclick: () => { filter = 'following'; renderLineup(); }, text: `Following · ${all.filter((a) => iFollow(a.id)).length}` }))];
    if (!loaded) kids.push(h('p', { class: 'jom-note', text: loadErr || 'Loading the lineup…' }));
    else if (!all.length) kids.push(h('div', { class: 'jom-note' }, h('p', null, h('strong', { text: 'Nobody is on the lineup yet. ' }), 'Performers add themselves in Backstage, and each profile appears here once TAM has approved it.'), h('p', null, h('button', { type: 'button', class: 'btn ghost', onclick: () => go(0, row), text: 'Create your profile' }))));
    else if (!list.length) kids.push(h('p', { class: 'jom-note', text: 'You aren’t following anyone yet. Tap + Follow on an artist and they’ll show up here.' }));
    else kids.push(h('div', { class: 'jom-grid' }, list.map((a) => h('button', { type: 'button', class: 'jom-tile', hue: a.hue, onclick: () => goArtist(a.id, 2) },
      a.photo ? h('img', { src: a.photo, alt: '', draggable: 'false' }) : null,
      iFollow(a.id) ? h('span', { class: 'mark', text: 'Following' }) : (a.own && a.state !== 'live' ? h('span', { class: 'mark', text: a.state === 'hidden' ? 'Hidden' : 'Waiting' }) : null),
      h('span', { class: 'in' }, h('span', { class: 'nm', text: a.name }), h('span', { class: 'sb', text: `${a.act ? `${a.act} · ` : ''}${a.followers} following` }))))));
    $('jom-line').replaceChildren(...kids);
  }

  // ----- Backstage -----
  const field = (id, label, hint, control) => h('label', { class: 'field', for: id }, h('span', { text: label }), control, hint ? h('small', { class: 'muted', text: hint }) : null);
  function buildBackstage() {
    const linkRow = (n) => h('div', { class: 'jom-two' },
      h('input', { type: 'text', id: `jf-l${n}label`, maxlength: '40', placeholder: 'Label', 'aria-label': `Link ${n} label` }),
      h('input', { type: 'url', id: `jf-l${n}url`, maxlength: '300', placeholder: 'https://…', 'aria-label': `Link ${n} address` }));
    $('jom-back').replaceChildren(
      h('div', null, h('p', { class: 'label', text: 'For performers' }), h('h2', { class: 'jom-h', text: 'Backstage' })),
      h('div', { id: 'jb-status' }),
      h('form', { id: 'jb-form', class: 'jom-form', novalidate: true, onsubmit: saveProfile },
        field('jf-name', 'Stage name', 'Your first name or a stage name is enough.', h('input', { type: 'text', id: 'jf-name', maxlength: '40', autocomplete: 'off' })),
        field('jf-act', 'What you do', 'For example: Singer and guitarist.', h('input', { type: 'text', id: 'jf-act', maxlength: '60' })),
        field('jf-bio', 'About you', 'What you play, what you love, what you’re working on.', h('textarea', { id: 'jf-bio', maxlength: '600', rows: '4' })),
        field('jf-genres', 'Styles', 'Up to five, separated by commas.', h('input', { type: 'text', id: 'jf-genres', maxlength: '120', placeholder: 'Soul, pop, blues' })),
        field('jf-setlist', 'Setlist', 'Songs you perform, one per line.', h('textarea', { id: 'jf-setlist', maxlength: '900', rows: '4' })),
        field('jf-stage', 'Stage time', 'Places you’ve played, one per line.', h('textarea', { id: 'jf-stage', maxlength: '1100', rows: '3', placeholder: 'Junior Open Mic, TAM' })),
        h('div', { class: 'field' }, h('span', { text: 'Watch & listen links' }), linkRow(1), linkRow(2), linkRow(3), h('small', { class: 'muted', text: 'Videos or songs of yours. Addresses must start with https://' })),
        h('div', { class: 'field', role: 'radiogroup', 'aria-label': 'Your colour' }, h('span', { text: 'Your colour' }),
          h('div', { class: 'jom-swatches' }, hues.map((x, i) => h('label', { hue: x }, h('input', { type: 'radio', name: 'jf-hue', id: `jf-hue${i}`, value: String(x), 'aria-label': `Colour ${i + 1}` }))))),
        h('div', { class: 'field' }, h('span', { text: 'Photo' }),
          h('div', { class: 'jom-photo' }, h('div', { class: 'thumb', id: 'jf-thumb' }),
            h('label', { class: 'btn ghost small', for: 'jf-photo', text: 'Choose a photo' }), h('input', { type: 'file', id: 'jf-photo', accept: 'image/*', class: 'sr', onchange: pickPhoto }),
            h('button', { type: 'button', class: 'btn ghost small', id: 'jf-nophoto', onclick: () => { formPhoto = ''; showThumb(); }, text: 'Remove' })),
          h('small', { class: 'muted', text: 'Optional. Without one, your initials go on a poster in your colour.' })),
        h('div', { id: 'jf-guardian-box' }, field('jf-gmail', 'Parent or guardian’s email', 'Only TAM’s team sees this. We send them the private link for changing the profile.', h('input', { type: 'email', id: 'jf-gmail', maxlength: '200', autocomplete: 'email' }))),
        h('label', { class: 'check', for: 'jf-guardian' }, h('input', { type: 'checkbox', id: 'jf-guardian' }), h('span', { text: 'If I’m under 18, my parent or guardian has seen this profile and is happy for it to be shown.' })),
        h('p', { class: 'err', id: 'jf-err', role: 'status', 'aria-live': 'polite' }),
        h('div', { class: 'jom-row' },
          h('button', { type: 'submit', class: 'btn hot', id: 'jf-save', text: 'Send profile' }),
          h('button', { type: 'button', class: 'btn ghost', id: 'jf-del', hidden: true, onclick: removeProfile, text: 'Take profile down' }))));
  }
  function showThumb() {
    const src = formPhoto === undefined ? (me && me.photo) || '' : formPhoto;
    $('jf-thumb').replaceChildren(...(src ? [h('img', { src, alt: 'Your photo' })] : []));
    $('jf-nophoto').hidden = !src;
  }
  function fillForm(a) {
    a = a || { name: '', act: '', bio: '', genres: [], setlist: [], stage: [], links: [], hue: hues[Math.floor(Math.random() * hues.length)] };
    $('jf-name').value = a.name; $('jf-act').value = a.act; $('jf-bio').value = a.bio;
    $('jf-genres').value = a.genres.join(', '); $('jf-setlist').value = a.setlist.join('\n'); $('jf-stage').value = a.stage.join('\n');
    [1, 2, 3].forEach((n) => { const l = a.links[n - 1]; $(`jf-l${n}label`).value = l ? l.label : ''; $(`jf-l${n}url`).value = l ? l.url : ''; });
    $(`jf-hue${Math.max(0, hues.indexOf(a.hue))}`).checked = true;
    $('jf-guardian').checked = false; formPhoto = undefined; showThumb(); $('jf-err').textContent = '';
  }
  async function pickPhoto(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const url = URL.createObjectURL(f), img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const W = 720, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
      const s = Math.max(W / img.width, H / img.height), w = img.width * s, hh = img.height * s;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - hh) / 3, w, hh); URL.revokeObjectURL(url);
      let q = 0.8, out; do { out = c.toDataURL('image/jpeg', q); q -= 0.12; } while (out.length > 380000 && q > 0.25);
      formPhoto = out; showThumb();
    } catch { toast('That photo couldn’t be read. Try a JPEG or PNG.'); }
  }
  const linesOf = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
  async function saveProfile(ev) {
    ev.preventDefault(); if (busy) return;
    const err = $('jf-err'), failAt = (m, id) => { err.textContent = m; if (id) $(id).focus(); };
    if (!$('jf-name').value.trim()) return failAt('Add a stage name.', 'jf-name');
    const links = [];
    for (const n of [1, 2, 3]) {
      const url = $(`jf-l${n}url`).value.trim(); if (!url) continue;
      if (!/^https:\/\/\S+$/i.test(url)) return failAt(`Link ${n} must start with https://`, `jf-l${n}url`);
      links.push({ label: $(`jf-l${n}label`).value.trim() || 'Link', url });
    }
    if (!me && !/^\S+@\S+\.\S{2,}$/.test($('jf-gmail').value.trim())) return failAt('Add a parent or guardian’s email. Only TAM’s team sees it.', 'jf-gmail');
    if (!$('jf-guardian').checked) return failAt('Tick the parent or guardian box to save.', 'jf-guardian');
    err.textContent = '';
    const hue = document.querySelector('input[name="jf-hue"]:checked');
    const body = { name: $('jf-name').value, act: $('jf-act').value, bio: $('jf-bio').value, genres: $('jf-genres').value.split(','),
      setlist: linesOf($('jf-setlist').value), stage: linesOf($('jf-stage').value), links, hue: hue ? +hue.value : hues[0], guardianOk: true,
      ...(formPhoto !== undefined ? { photo: formPhoto } : {}) };
    busy = true; $('jf-save').disabled = true;
    try {
      if (me) {
        const r = await call(`/api/jom/profile/${own.id}`, { ...body, key: own.key });
        me = r.own; toast('Saved. TAM checks changes before they show.');
      } else {
        const r = await call('/api/jom/profile', { ...body, guardianEmail: $('jf-gmail').value.trim() });
        own = { id: r.id, key: r.key }; store.set('jomOwn', own); me = r.own; justMade = { emailed: r.emailed };
        toast('Sent. It goes live once TAM approves it.');
      }
      fillForm(me); await load(); goArtist(me.id, 0); $('jom-p-back').scrollTop = 0;
    } catch (e) { failAt(e.message); }
    busy = false; $('jf-save').disabled = false;
  }
  async function removeProfile() {
    if (!me) return;
    if (!confirmDel) { confirmDel = true; $('jf-del').textContent = 'Tap again to take it down'; setTimeout(() => { confirmDel = false; if ($('jf-del')) $('jf-del').textContent = 'Take profile down'; }, 4000); return; }
    confirmDel = false;
    try { await call(`/api/jom/profile/${own.id}/remove`, { key: own.key }); own = null; me = null; justMade = null; store.set('jomOwn', null); fillForm(null); toast('Profile taken down.'); await load(); go(0, 0); } catch (e) { toast(e.message); }
  }
  function renderBackState() {
    const st = $('jb-status'); if (!st) return;
    const link = own ? `${location.origin}${location.pathname}?own=${own.id}.${own.key}` : '';
    const msg = !me ? [h('strong', { text: 'You’re not on the lineup yet. ' }), 'Fill this in and send it. TAM checks every profile before it appears.']
      : me.state === 'live' ? [h('strong', { text: 'You’re live on the lineup. ' }), 'TAM checks any changes you save before they show.']
      : me.state === 'changes-waiting' ? [h('strong', { text: 'Your changes are waiting for TAM’s OK. ' }), 'Your profile stays up as it was until then.']
      : me.state === 'hidden' ? [h('strong', { text: 'TAM has taken this profile off the lineup. ' }), 'Talk to the team at the next JOM.']
      : [h('strong', { text: 'Waiting for TAM’s OK. ' }), 'Your profile is saved. Only you can see it until it’s approved.'];
    st.replaceChildren(h('div', { class: 'jom-note' }, h('p', null, msg),
      me ? h('p', { class: 'small' }, justMade && justMade.emailed ? 'We’ve emailed your parent or guardian a private link for changing this profile. ' : 'Keep your private link: it is the only way to change this profile from another phone or computer. ',
        h('button', { type: 'button', class: 'linkish', onclick: async () => { toast((await copyText(link)) ? 'Private link copied. Keep it safe.' : 'Copy it from the address bar after opening Backstage.'); }, text: 'Copy my private link' })) : null));
    $('jf-guardian-box').hidden = Boolean(me);
    $('jf-del').hidden = !me;
    $('jf-save').textContent = me ? 'Save changes' : 'Send profile';
  }

  function renderAll() {
    const R = rows(); let i = curId ? R.findIndex((a) => a && a.id === curId) : 0; if (i < 0) i = Math.min(row, R.length - 1);
    row = i; curId = R[row] ? R[row].id : null;
    renderSpot(); renderProfile(); renderLineup(); renderBackState(); place();
  }

  buildBackstage(); fillForm(null); renderAll();
  load().then(() => {
    buildBackstage(); fillForm(me); renderAll();
    if (wantId) goArtist(wantId[1], 2);
    else if (q.get('own') && me) go(0, 0);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy && col !== 0) load(); });
}
