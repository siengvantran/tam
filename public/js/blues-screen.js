// The Great British Blues Jam on the big screen in the Temple: the title, the
// TAM logo pulsing to the beat of the room (through the laptop's microphone),
// rings of light on every beat, who's on stage, who's next, the house band
// and the Great British Blues Wall. No microphone? A steady shuffle beat, or
// tap the tempo with the space bar.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const logo = $('#bj-logo');
const cv = $('#bj-rings');
const x = cv.getContext('2d');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLOURS = ['#d9a441', '#a3262a', '#efe0bd', '#c46a2b', '#d9a441', '#6b2d1e']; // mustard, oxblood, old paper, rust, mustard, burnt umber

let mode = null;                    // 'mic' | 'auto'
let analyser = null, bins = null;
let bpm = 76, nextBeat = 0, beatN = 0;
let pulse = 0, level = 0, avg = 0, lastBeat = 0;
let rings = [];
let taps = [];

function size() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', size); size();

function beat(strength = 1) {
  const t = performance.now();
  lastBeat = t;
  pulse = Math.min(1, 0.55 + strength * 0.45);
  beatN++;
  const r = logo.getBoundingClientRect();
  rings.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.42, a: 0.85 * strength, c: COLOURS[beatN % COLOURS.length], w: 4 + 10 * strength });
  if (rings.length > 18) rings.shift();
}

// Bass energy from the microphone (roughly 40–160 Hz), against its recent average.
function listen() {
  analyser.getByteFrequencyData(bins);
  const hz = analyser.context.sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(40 / hz)), hi = Math.ceil(160 / hz);
  let e = 0;
  for (let i = lo; i <= hi; i++) e += bins[i];
  e /= (hi - lo + 1) * 255;
  level = level * 0.7 + e * 0.3;
  avg = avg * 0.97 + e * 0.03;
  const t = performance.now();
  if (e > 0.12 && e > avg * 1.28 && t - lastBeat > 240) beat(Math.min(1, (e - avg) * 4 + 0.4));
}

function frame(t) {
  if (mode === 'mic' && analyser) listen();
  if (mode === 'auto' && t >= nextBeat) {
    // a shuffle: a strong beat on 1 and 3, lighter on 2 and 4
    beat(beatN % 2 === 0 ? 1 : 0.55);
    nextBeat = (nextBeat || t) + 60000 / bpm;
    if (nextBeat < t) nextBeat = t + 60000 / bpm;
    level = 0.25;
  }
  pulse *= 0.9;
  const amp = calm ? 0.35 : 1;
  const s = 1 + (0.11 * pulse + 0.05 * level) * amp;
  const glow = Math.round(18 + 70 * pulse * amp);
  logo.style.transform = `scale(${s.toFixed(4)})`;
  logo.style.filter = `drop-shadow(0 0 ${glow}px ${COLOURS[beatN % COLOURS.length]}aa) brightness(${(1 + 0.25 * pulse * amp).toFixed(3)})`;

  x.clearRect(0, 0, cv.width, cv.height);
  x.globalCompositeOperation = 'lighter';
  for (const r of rings) {
    r.r += 6 + 10 * r.a; r.a *= 0.955;
    x.globalAlpha = Math.max(0, r.a);
    x.strokeStyle = r.c; x.lineWidth = r.w;
    x.beginPath(); x.arc(r.x, r.y, r.r, 0, 6.283); x.stroke();
  }
  rings = rings.filter((r) => r.a > 0.02);
  x.globalCompositeOperation = 'source-over';
  requestAnimationFrame(frame);
}

async function start(kind) {
  $('#bj-start').hidden = true;
  if (kind === 'mic') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ac = new AudioContext();
      analyser = ac.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2;
      ac.createMediaStreamSource(stream).connect(analyser);
      bins = new Uint8Array(analyser.frequencyBinCount);
      mode = 'mic';
    } catch { mode = 'auto'; notice('No microphone: using a steady beat. Tap Space to set the tempo.'); }
  } else mode = 'auto';
  try { await document.documentElement.requestFullscreen(); } catch { /* the browser may refuse */ }
  try { await navigator.wakeLock.request('screen'); } catch { /* keeps going anyway */ }
}

function notice(msg) {
  const n = document.createElement('div');
  n.className = 'bj-s-notice'; n.textContent = msg;
  document.body.append(n);
  setTimeout(() => n.remove(), 5000);
}

document.addEventListener('click', (e) => { const b = e.target.closest('[data-start]'); if (b) start(b.dataset.start); });
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
  if (k === 'm') start('mic');
  if (k === 'a') { mode = 'auto'; $('#bj-start').hidden = true; notice(`Steady beat: ${Math.round(bpm)} bpm`); }
  if (k === 'h') document.body.classList.toggle('bare');
  if (e.code === 'Space') {
    e.preventDefault();
    const t = performance.now();
    taps = [...taps.filter((v) => t - v < 3000), t];
    if (taps.length >= 3) {
      const gaps = taps.slice(1).map((v, i) => v - taps[i]);
      bpm = Math.max(40, Math.min(200, 60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
      mode = 'auto'; nextBeat = t + 60000 / bpm;
      $('#bj-start').hidden = true;
      notice(`Tempo: ${Math.round(bpm)} bpm`);
    }
    beat(1);
  }
});

// The cursor hides when the mouse is still.
let idle;
addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 2500); });

// ----- what's on: refreshed every few seconds -----
let wall = [], wallI = 0;
async function refresh() {
  try {
    const r = await fetch('/api/blues/screen', { cache: 'no-store' });
    const d = await r.json();
    $('#s-date').textContent = `${d.when} · TAM, Elephant & Castle`;
    $('#s-host').innerHTML = d.host ? `Hosted by <b>${esc(d.host)}</b>` : '';
    const ha = d.hostArtist;
    $('#s-hostcard').hidden = !(ha && ha.photo);
    if (ha && ha.photo) { if ($('#s-hostimg').getAttribute('src') !== ha.photo) $('#s-hostimg').src = ha.photo; $('#s-hostname').textContent = d.host; }
    $('#s-now').hidden = !d.onStage;
    if (d.onStage) { $('#s-now-name').textContent = d.onStage.name; $('#s-now-inst').textContent = d.onStage.instrument; }
    $('#s-next').innerHTML = d.next.length ? d.next.map((j) => `<li><b>${esc(j.name)}</b> <span>${esc(j.instrument)}</span></li>`).join('') : '<li class="muted">Sign up with the QR code</li>';
    $('#s-band').innerHTML = d.band.map((b) => `<li><b>${esc(b.name)}</b> <span>${esc(b.instrument)}</span></li>`).join('') || '<li class="muted">The house band</li>';
    $('#s-url').textContent = d.signUp;
    wall = d.wall;
  } catch { /* keep showing what we had */ }
}
function showWall() {
  const box = $('#s-wall');
  if (!wall.length) { box.innerHTML = '<span>The Great British Blues Wall</span><p>Leave a message at tam.tv/blues</p>'; return; }
  const w = wall[wallI++ % wall.length];
  box.classList.remove('in');
  setTimeout(() => { box.innerHTML = `<span>The Great British Blues Wall</span><p>“${esc(w.message)}” <b>· ${esc(w.name)}</b></p>`; box.classList.add('in'); }, 400);
}
refresh(); setInterval(refresh, 8000);
setTimeout(showWall, 1500); setInterval(showWall, 8000);
requestAnimationFrame(frame);
