// The projector (/sunday-showcases/screen): every 2 seconds, who's on and any new reactions.
// Reactions from phones float up the screen; counts tick up. Nothing personal is shown.

const $ = (s) => document.querySelector(s);
const B = document.body.dataset;
let last = -1, cur = '', total = 0;

function floatUp(emoji) {
  const el = document.createElement('span');
  el.className = 'ssc-bubble';
  el.innerHTML = '<i></i>'; // the <i> pulses with the music while the bubble rises
  if (emoji === 'tam') el.firstChild.innerHTML = '<img src="/img/tam-mark-96.png" alt="" class="ssc-tamr">';
  else if (emoji.startsWith('/')) { const im = new Image(); im.src = emoji; im.className = 'ssc-photo-r'; im.alt = ''; el.firstChild.appendChild(im); el.classList.add('is-photo'); }
  else el.firstChild.textContent = emoji;
  el.style.animationDuration = `${4.2 - Math.min(1.4, level * 2.5)}s`; // louder music, faster rise
  el.style.left = `${8 + Math.random() * 84}%`;
  el.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
  el.style.fontSize = `${56 + Math.random() * 56}px`;
  $('#ssc-float').appendChild(el);
  setTimeout(() => el.remove(), 4300);
}

// a message from the audience: a card that slides in, stays a while, and goes
const notes = [];
function note(x) {
  notes.push(x);
  if (notes.length === 1) nextNote();
}
function nextNote() {
  const x = notes[0]; if (!x) return;
  const el = document.getElementById('ssc-note');
  el.querySelector('p').textContent = `“${x.message}”`;
  el.querySelector('b').textContent = `— ${x.name}`;
  el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => { el.hidden = true; notes.shift(); nextNote(); }, 500); }, 9000);
}

// a photo from the audience: a big polaroid that drops in on the right, holds, and goes
const pics = [];
function pic(src) {
  pics.push(src);
  if (pics.length === 1) nextPic();
}
function nextPic() {
  const src = pics[0]; if (!src) return;
  const el = document.getElementById('ssc-pic');
  const im = el.querySelector('img');
  const go = () => {
    el.style.setProperty('--tilt', `${(Math.random() - 0.5) * 8}deg`);
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => { el.hidden = true; pics.shift(); nextPic(); }, 600); }, 7000);
  };
  im.onload = go; im.onerror = () => { pics.shift(); nextPic(); };
  im.src = src;
}

function bump(el, to) {
  if (Number(el.textContent) === to) return;
  el.textContent = to;
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
}

function show(c) {
  const act = $('#ssc-act'), idle = $('#ssc-idle');
  document.body.classList.toggle('is-idle', !c);
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
      if (last >= 0) S.feed.filter((x) => !S.current || !x.slug || x.slug === S.current.slug).forEach((x, i) => setTimeout(() => {
        if (x.kind === 'note') note(x); else if (x.kind === 'photo') pic(x.src); else floatUp(x.emoji);
      }, i * 180));
      last = S.last;
    }
  } catch { /* try again */ }
  setTimeout(tick, 2000);
}
if (B.date) tick();
// keep the projector awake where the browser allows it
if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});

// ----- chromesthesia: the TAM logo listens through the computer's mic -----
// The loudest note decides the colour (Scriabin's colours for the twelve notes), loudness the
// size of the glow, and every beat sends a ring of that colour out from the logo. Nothing is
// recorded or sent anywhere: the sound is only measured, in this browser.
const NOTE_COLOURS = ['#ff1e1e', '#9b30ff', '#ffe600', '#7a5cff', '#7fd4ff', '#b5122b', '#3b5bff', '#ff8a00', '#c13cff', '#2ee06b', '#9a8fa8', '#2f6bff'];
//                     C          C#/Db      D          D#/Eb      E          F          F#         G          G#/Ab      A          A#/Bb      B
const cv = document.getElementById('ssc-viz');
const g = cv.getContext('2d');
const logo = new Image(); logo.src = '/img/tam-logo-640.png';
const floatBox = document.getElementById('ssc-float');
let an = null, buf = null, fbuf = null, rate = 48000, level = 0, colour = '#e8c77a', rings = [], lastRing = 0, avg = 0;

function size() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
addEventListener('resize', size); size();

async function listen() {
  if (an) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ac = new AudioContext(); rate = ac.sampleRate;
    an = ac.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0.6;
    ac.createMediaStreamSource(stream).connect(an);
    buf = new Uint8Array(an.fftSize); fbuf = new Uint8Array(an.frequencyBinCount);
    document.getElementById('ssc-mic').hidden = true;
  } catch { document.getElementById('ssc-mic').textContent = 'Microphone blocked: allow it in the browser to make the logo dance'; }
}
document.getElementById('ssc-mic').addEventListener('click', listen);
// Chrome lets a page that already has mic permission start without a click
navigator.permissions?.query({ name: 'microphone' }).then((p) => { if (p.state === 'granted') listen(); }).catch(() => {});

function noteColour() {
  an.getByteFrequencyData(fbuf);
  const binHz = rate / an.fftSize;
  let best = 0, at = 0;
  for (let i = Math.floor(70 / binHz); i < Math.floor(2000 / binHz); i++) if (fbuf[i] > best) { best = fbuf[i]; at = i; }
  if (best < 90) return null;
  const hz = at * binHz;
  const note = ((Math.round(12 * Math.log2(hz / 440)) + 9) % 12 + 12) % 12; // 0 = C
  return NOTE_COLOURS[note];
}

// the line-up orbits the TAM logo: faster and wider when the music is loud, nearer acts bigger
const ring = [...document.querySelectorAll('#ssc-lineup li')];
const IDLE_X = 0.42, IDLE_Y = 0.43; // where the logo sits on the line-up, as a share of the screen
let spin = 0, lastT = 0;
function orbit(t) {
  const dt = Math.min(64, t - (lastT || t)); lastT = t;
  spin += dt * (0.00004 + level * 0.00016); // about a minute a lap with music playing
  const cx = innerWidth * IDLE_X, cy = innerHeight * IDLE_Y;
  const rx = Math.min(innerWidth * 0.27, innerHeight * 0.5) * (1 + level * 0.05), ry = innerHeight * 0.18 * (1 + level * 0.05);
  ring.forEach((li, i) => {
    const a = spin + (i / ring.length) * Math.PI * 2;
    const depth = (Math.sin(a) + 1) / 2; // 0 at the back (top), 1 at the front (bottom)
    const sc = 0.72 + depth * 0.4 + level * 0.18;
    li.style.transform = `translate(${cx + Math.cos(a) * rx}px, ${cy + Math.sin(a) * ry}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
    li.style.zIndex = String(Math.round(depth * 100));
    li.style.opacity = (0.65 + depth * 0.35).toFixed(2);
  });
}

function frame(t) {
  requestAnimationFrame(frame);
  const idle = document.body.classList.contains('is-idle');
  const W = cv.width, H = cv.height, cx = W * (idle ? IDLE_X : 0.5), cy = H * (idle ? IDLE_Y : 0.5);
  g.clearRect(0, 0, W, H);
  if (an) {
    an.getByteTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    level += (Math.min(1, rms * 4) - level) * 0.25;
    avg += (level - avg) * 0.02;
    const c = noteColour(); if (c) colour = c;
    // a beat: louder than the running average sends out a ring
    if (level > avg * 1.5 + 0.06 && t - lastRing > 260) { rings.push({ r: 0, c: colour, w: 3 + level * 12, a: 0.5 }); lastRing = t; }
  } else { level += ((0.12 + Math.sin(t / 900) * 0.05) - level) * 0.05; } // a gentle breath until the mic is on
  const base = Math.min(W, H) * (idle ? 0.22 : 0.34);
  for (const r of rings) {
    r.r += (6 + level * 30) * devicePixelRatio; r.a *= 0.968;
    g.beginPath(); g.arc(cx, cy, base * 0.55 + r.r, 0, Math.PI * 2);
    g.strokeStyle = r.c; g.globalAlpha = r.a; g.lineWidth = r.w * devicePixelRatio; g.shadowColor = r.c; g.shadowBlur = 24; g.stroke();
  }
  rings = rings.filter((r) => r.a > 0.03 && r.r < Math.max(W, H));
  if (logo.complete && logo.naturalWidth) {
    const s = base * (1 + level * 0.35);
    g.globalAlpha = idle ? Math.min(1, 0.8 + level * 0.4) : 0.14 + level * 0.4; g.shadowColor = colour; g.shadowBlur = (idle ? 50 : 30) + level * (idle ? 260 : 160);
    g.drawImage(logo, cx - s, cy - s, s * 2, s * 2);
    // on the line-up, a second pass in 'lighter' so the gold cuts through stage light on the projector
    if (idle) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 + level * 0.5; g.shadowBlur = 0; g.drawImage(logo, cx - s, cy - s, s * 2, s * 2); g.globalCompositeOperation = 'source-over'; }
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
  if (idle) orbit(t);
  // the reactions floating up pulse and glow with the same sound
  document.body.style.setProperty('--lvl', level.toFixed(3));
  document.body.style.setProperty('--col', colour);
}
requestAnimationFrame(frame);

// ----- control from this computer (the sound desk): arrow keys, space, L -----
// Works when this browser is signed in as TAM staff; the phone controller works too.
let order = null;
async function step(d) {
  try {
    if (!order) {
      const run = await fetch(`/api/showcases/${B.date}/run`, { cache: 'no-store' });
      const S = await (await fetch(`/api/showcases/${B.date}/live`, { cache: 'no-store' })).json();
      const ids = run.ok ? ((await run.json()).slots || []).map((x) => x.slug) : [];
      order = ids.length ? ids.filter((s) => S.acts.some((a) => a.slug === s)) : S.acts.map((a) => a.slug);
    }
    const i = order.indexOf(cur);
    const next = d === 0 ? null : order[Math.max(0, Math.min(order.length - 1, i < 0 ? (d > 0 ? 0 : order.length - 1) : i + d))];
    const r = await fetch(`/api/showcases/${B.date}/live`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current: next }) });
    const hint = document.getElementById('ssc-hint');
    if (r.status === 401) { hint.hidden = false; hint.textContent = 'To control from this computer, sign in at tam.tv/sunday-showcases/control first'; }
    else { hint.hidden = true; }
  } catch { /* try again */ }
}
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
  else if (e.key === 'l' || e.key === 'L' || e.key === 'Escape') step(0);
  else if (e.key === 'm' || e.key === 'M') listen();
  else if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.().catch(() => {});
});
