// Tamalume™: the music player that lights the page. It splits sound into
// bass, mids and treble, finds the strongest note and gives it a colour, and
// publishes all of it as window.SYN plus CSS variables (--syn-bass, --syn-beat,
// --syn-color…) that the sky, the chrome type and the cards react to.
//
// Sources: the theme song (YouTube), your own track, or the live mic.
// Browsers can't analyse an embedded YouTube video's audio, so for the theme
// song the visuals follow the song's tempo (song.bpm) and walk its chords
// (song.bars, pitch classes); your track and the mic are analysed for real.

import { $, pageData, youtube, still } from './lib.js';

const NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const COLOURS = ['#ff3030', '#9b30ff', '#ffe500', '#d0609a', '#7fe8ff', '#d0104a', '#5a84ff', '#ff8a00', '#c27bff', '#3ddc5a', '#c0708e', '#5fb8ff'];
const NAMES = ['red', 'violet', 'yellow', 'flesh', 'sky blue', 'crimson', 'bright blue', 'orange', 'purple', 'green', 'rose', 'azure'];

const bar = $('#syn');
if (bar) {
  const data = pageData();
  const song = (data.festival && data.festival.song) || {};
  const BPM = song.bpm || 110;
  const CHORDS = song.bars || [7, 4, 0, 2];
  const SYN = window.SYN = { on: false, bass: 0, mid: 0, treb: 0, energy: 0, beat: 0, note: -1, color: '#e8c77a' };
  const play = $('#syn-play'), srcSel = $('#syn-src'), fileIn = $('#syn-file'), now = $('#syn-now');
  const noteEl = $('#syn-note'), bars = $('#syn-bars'), bx = bars.getContext('2d');
  const root = document.documentElement.style;

  let source = 'song', playing = false, running = false;
  let ac, analyser, freq, audio, audioNode, mic, micNode, yt;
  let bassAvg = 0, lastBeat = 0, lastNoteChange = 0, lastBeatIdx = -1;
  const chroma = new Float32Array(12);
  const ease = (a, b, up, down) => a + (b - a) * (b > a ? up : down);

  function ripple(vel) {
    dispatchEvent(new CustomEvent('tam:note', { detail: { pc: Math.max(0, SYN.note), x: innerWidth * (0.15 + Math.random() * 0.7), y: innerHeight * (0.55 + Math.random() * 0.3), vel, source: 'music' } }));
  }

  function setNote(pc, label) {
    SYN.note = pc; SYN.color = COLOURS[pc];
    noteEl.querySelector('span').textContent = label;
    noteEl.querySelector('i').style.background = SYN.color;
  }

  function audioGraph() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ac.createAnalyser();
    analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.72;
    freq = new Uint8Array(analyser.frequencyBinCount);
  }

  // The theme song: the page's trailer if it has one (song.js), else a hidden player here.
  async function songPlayer() {
    if (window.TAMSONG) return window.TAMSONG;
    if (yt) return yt;
    const YT = await youtube();
    await new Promise((resolve) => {
      const p = new YT.Player($('#syn-yt').appendChild(document.createElement('div')), {
        videoId: bar.dataset.youtube, playerVars: { playsinline: 1, controls: 0, rel: 0 },
        events: { onReady: resolve, onStateChange: (e) => { if (e.data === 0) stop(); } },
      });
      yt = { play: () => p.playVideo(), pause: () => p.pauseVideo(), time: () => p.getCurrentTime() || 0, playing: () => p.getPlayerState() === 1 };
    });
    return yt;
  }

  async function start() {
    try {
      if (source === 'song') {
        (await songPlayer()).play();
      } else if (source === 'file') {
        if (!audio) { fileIn.click(); return; }
        audioGraph(); await ac.resume(); await audio.play();
      } else if (source === 'mic') {
        audioGraph(); await ac.resume();
        if (!mic) {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
          micNode = ac.createMediaStreamSource(mic);
        }
        micNode.connect(analyser);
        now.textContent = 'Live mic';
      }
      playing = true; SYN.on = true;
      play.setAttribute('aria-pressed', 'true'); play.setAttribute('aria-label', 'Pause');
      dispatchEvent(new Event('syn:start'));
      if (!running) { running = true; requestAnimationFrame(frame); }
    } catch (e) {
      now.textContent = source === 'mic' ? 'Mic not allowed' : 'Couldn’t play that';
    }
  }

  function stop() {
    playing = false;
    if (source === 'song') { const p = window.TAMSONG || yt; if (p) p.pause(); }
    if (audio) audio.pause();
    if (micNode) { try { micNode.disconnect(); } catch { /* not connected */ } }
    play.setAttribute('aria-pressed', 'false'); play.setAttribute('aria-label', 'Play');
    dispatchEvent(new Event('syn:stop'));
  }

  play.addEventListener('click', () => (playing ? stop() : start()));
  srcSel.addEventListener('change', () => {
    if (playing) stop();
    source = srcSel.value;
    if (source === 'file') fileIn.click();
    else if (source === 'song') now.textContent = bar.querySelector('.syn-now').dataset.song || now.textContent;
  });
  now.dataset.song = now.textContent;
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    if (!f) return;
    audioGraph();
    if (audio) audio.pause();
    audio = new Audio(URL.createObjectURL(f));
    audio.addEventListener('ended', stop);
    audioNode = ac.createMediaElementSource(audio);
    audioNode.connect(analyser); analyser.connect(ac.destination);
    now.textContent = f.name.replace(/\.[^.]+$/, '');
    start();
  });
  // The trailer playing or pausing drives the player too.
  addEventListener('song:play', () => { if (source === 'song' && !playing) { playing = true; SYN.on = true; play.setAttribute('aria-pressed', 'true'); dispatchEvent(new Event('syn:start')); if (!running) { running = true; requestAnimationFrame(frame); } } });
  addEventListener('song:pause', () => { if (source === 'song' && playing) { playing = false; play.setAttribute('aria-pressed', 'false'); } });

  function band(lo, hi, binHz) {
    let s = 0, n = 0;
    for (let i = Math.floor(lo / binHz); i < Math.min(freq.length, hi / binHz); i++) { s += freq[i]; n++; }
    return n ? s / n / 255 : 0;
  }

  // The theme song: follow the tempo, one colour per bar.
  function tempoFrame() {
    const p = window.TAMSONG || yt;
    const tm = p ? p.time() : performance.now() / 1000;
    const on = playing;
    const b = tm * BPM / 60, idx = Math.floor(b), ph = b - idx;
    SYN.bass = ease(SYN.bass, on ? Math.pow(1 - ph, 3) * (idx % 2 ? 0.7 : 1) : 0, 0.6, 0.22);
    SYN.mid = ease(SYN.mid, on ? 0.45 + 0.25 * Math.sin(tm * 1.7) : 0, 0.3, 0.1);
    SYN.treb = ease(SYN.treb, on ? 0.75 * Math.pow(Math.max(0, 1 - Math.abs(ph - 0.5) * 4), 2) : 0, 0.6, 0.15);
    if (on && idx !== lastBeatIdx) {
      lastBeatIdx = idx; SYN.beat = 1; ripple(0.55);
      if (idx % 4 === 0) { const pc = CHORDS[Math.floor(idx / 4) % CHORDS.length]; setNote(pc, `In time · ${NAMES[pc]}`); }
    }
  }

  // Your track or the mic: real analysis.
  function analysedFrame(t) {
    analyser.getByteFrequencyData(freq);
    const binHz = ac.sampleRate / analyser.fftSize;
    const bass = band(30, 160, binHz), mid = band(160, 2000, binHz), treb = band(2000, 9000, binHz);
    SYN.bass = ease(SYN.bass, Math.min(1, bass * 1.2), 0.6, 0.22);
    SYN.mid = ease(SYN.mid, Math.min(1, mid * 1.6), 0.4, 0.12);
    SYN.treb = ease(SYN.treb, Math.min(1, treb * 3), 0.6, 0.15);
    // the strongest pitch class between C2 and C7 picks the colour
    chroma.fill(0);
    for (let i = Math.floor(65 / binHz); i < Math.min(freq.length, 2100 / binHz); i++) {
      const v = freq[i];
      if (v < 40) continue;
      const pc = ((Math.round(69 + 12 * Math.log2((i * binHz) / 440)) % 12) + 12) % 12;
      chroma[pc] += v * v;
    }
    let best = 0;
    for (let n = 1; n < 12; n++) if (chroma[n] > chroma[best]) best = n;
    if (chroma[best] > 0 && best !== SYN.note && t - lastNoteChange > 140 && (SYN.note < 0 || chroma[best] > chroma[SYN.note] * 1.3)) {
      lastNoteChange = t; setNote(best, `${NOTES[best]} · ${NAMES[best]}`);
    }
    // a kick that jumps above the running bass level is a beat
    bassAvg = bassAvg * 0.95 + bass * 0.05;
    if (playing && bass > bassAvg * 1.3 && bass > 0.32 && t - lastBeat > 230) { lastBeat = t; SYN.beat = 1; ripple(0.4 + SYN.bass * 0.5); }
  }

  function frame(t) {
    if (source === 'song' || !analyser) tempoFrame(); else analysedFrame(t);
    if (!playing) { SYN.bass *= 0.9; SYN.mid *= 0.9; SYN.treb *= 0.9; }
    SYN.beat *= 0.88;
    SYN.energy = (SYN.bass + SYN.mid + SYN.treb) / 3;
    const k = still ? 0.3 : 1; // calmer for reduced motion
    root.setProperty('--syn-bass', (SYN.bass * k).toFixed(3));
    root.setProperty('--syn-mid', (SYN.mid * k).toFixed(3));
    root.setProperty('--syn-treb', (SYN.treb * k).toFixed(3));
    root.setProperty('--syn-beat', (SYN.beat * k).toFixed(3));
    root.setProperty('--syn-energy', SYN.energy.toFixed(3));
    root.setProperty('--syn-color', SYN.color);
    // the little spectrum
    bx.clearRect(0, 0, bars.width, bars.height);
    for (let i = 0; i < 16; i++) {
      const level = i < 4 ? SYN.bass : i < 11 ? SYN.mid * 0.8 : SYN.treb * 0.7;
      const h = Math.max(2, bars.height * level * (0.6 + 0.4 * Math.sin(t / 180 + i)));
      bx.fillStyle = i % 3 === 0 ? SYN.color : i % 3 === 1 ? '#ff2e88' : '#00d8ff';
      bx.fillRect(i * 12, bars.height - h, 8, h);
    }
    SYN.on = playing || SYN.energy > 0.01;
    if (playing || SYN.energy > 0.01) requestAnimationFrame(frame);
    else { running = false; SYN.on = false; }
  }
}
