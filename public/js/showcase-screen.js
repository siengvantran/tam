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
      if (last >= 0) S.feed.filter((x) => S.current && x.slug === S.current.slug).forEach((x, i) => setTimeout(() => {
        if (x.kind === 'note') note(x); else floatUp(x.kind === 'photo' ? x.src : x.emoji);
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

function frame(t) {
  requestAnimationFrame(frame);
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
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
  const base = Math.min(W, H) * 0.34;
  for (const r of rings) {
    r.r += (6 + level * 30) * devicePixelRatio; r.a *= 0.968;
    g.beginPath(); g.arc(cx, cy, base * 0.55 + r.r, 0, Math.PI * 2);
    g.strokeStyle = r.c; g.globalAlpha = r.a; g.lineWidth = r.w * devicePixelRatio; g.shadowColor = r.c; g.shadowBlur = 24; g.stroke();
  }
  rings = rings.filter((r) => r.a > 0.03 && r.r < Math.max(W, H));
  if (logo.complete && logo.naturalWidth) {
    const s = base * (1 + level * 0.35);
    g.globalAlpha = 0.14 + level * 0.4; g.shadowColor = colour; g.shadowBlur = 30 + level * 160;
    g.drawImage(logo, cx - s, cy - s, s * 2, s * 2);
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
  // the reactions floating up pulse and glow with the same sound
  floatBox.style.setProperty('--lvl', level.toFixed(3));
  floatBox.style.setProperty('--col', colour);
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
