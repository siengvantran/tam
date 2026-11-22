// The projector (/sunday-showcases/screen): every 2 seconds, who's on and any new reactions.
// Reactions from phones float up the screen; counts tick up. Nothing personal is shown.

const $ = (s) => document.querySelector(s);
const B = document.body.dataset;
let last = -1, cur = '', total = 0;

function floatUp(emoji) {
  const el = document.createElement('span');
  el.className = 'ssc-bubble';
  el.textContent = emoji;
  el.style.left = `${8 + Math.random() * 84}%`;
  el.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
  el.style.fontSize = `${56 + Math.random() * 56}px`;
  $('#ssc-float').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function bump(el, to) {
  if (Number(el.textContent) === to) return;
  el.textContent = to;
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
}

function show(c) {
  const act = $('#ssc-act'), idle = $('#ssc-idle');
  if (!c) { act.hidden = true; idle.hidden = false; $('#ssc-bg').style.backgroundImage = ''; cur = ''; return; }
  if (c.slug !== cur) {
    cur = c.slug;
    const url = `${B.base}${c.href}?from=screen`;
    $('#ssc-img').src = c.photo || '/img/christmas/tam-logo-gold.png';
    $('#ssc-bg').style.backgroundImage = c.photo ? `url('${c.photo}')` : '';
    $('#ssc-n').textContent = c.n;
    $('#ssc-name').textContent = c.name;
    $('#ssc-plays').textContent = c.plays;
    $('#ssc-qr').src = `/live/qr.svg?u=${encodeURIComponent(url)}`;
    $('#ssc-url').textContent = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\?from=screen$/, '');
    act.hidden = false; idle.hidden = true;
    act.classList.remove('in'); void act.offsetWidth; act.classList.add('in');
  }
  total = Object.values(c.reacts || {}).reduce((t, n) => t + n, 0);
  bump($('#ssc-reacts'), total);
  bump($('#ssc-pledged'), c.pledged || 0);
}

async function tick() {
  try {
    const r = await fetch(`/api/showcases/${B.date}/live?after=${Math.max(0, last)}`, { cache: 'no-store' });
    if (r.ok) {
      const S = await r.json();
      show(S.current);
      // on first load, don't replay old reactions
      if (last >= 0) S.feed.filter((x) => S.current && x.slug === S.current.slug).forEach((x, i) => setTimeout(() => floatUp(x.emoji), i * 180));
      last = S.last;
    }
  } catch { /* try again */ }
  setTimeout(tick, 2000);
}
if (B.date) tick();
// keep the projector awake where the browser allows it
if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});
