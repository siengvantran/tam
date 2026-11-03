// Play the site: turn it on and TAM.TV becomes an instrument. Every tile,
// card, button and link plays a note when you hover it (the same element
// always plays the same note, so moving around makes a melody), a click plays
// a chord, and the A–K keys play the scale. A soft electric-piano voice with
// a little echo, tuned to a pentatonic scale so nothing sounds wrong.
// Off until the visitor switches it on; the choice is remembered.

import { $, store } from './lib.js';

const btn = $('#play-site');
if (btn) {
  const SCALE = [0, 2, 4, 7, 9];                          // major pentatonic
  const NOTES = [];
  for (let o = 0; o < 3; o++) for (const s of SCALE) NOTES.push(57 + o * 12 + s); // from A3, three octaves
  const SEL = 'a, button, .path-tile, .night-card, .chip, .step-card, .ccard, .card, .pkg, .year, .artist-card';
  let ac, master, wet, on = store.get('play-site', false), lastEl = null, lastAt = 0;

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const noteIndex = (el) => hash((el.getAttribute('href') || '') + (el.textContent || '').trim().slice(0, 60)) % NOTES.length;
  const freq = (m) => 440 * 2 ** ((m - 69) / 12);

  function audio() {
    if (ac) return ac.resume();
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.16;
    const delay = ac.createDelay(1); delay.delayTime.value = 0.27;
    const fb = ac.createGain(); fb.gain.value = 0.33;
    wet = ac.createGain(); wet.gain.value = 0.28;
    const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
    master.connect(tone); tone.connect(ac.destination);
    tone.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ac.destination);
    return ac.resume();
  }

  // One note: a triangle body and a bell-like sine an octave up, shaped like an electric piano.
  function play(midi, { x, y, vel = 0.7, len = 1.1 } = {}) {
    if (!on || !ac) return;
    const t = ac.currentTime, g = ac.createGain();
    const body = ac.createOscillator(), bell = ac.createOscillator(), bellGain = ac.createGain();
    body.type = 'triangle'; body.frequency.value = freq(midi);
    bell.type = 'sine'; bell.frequency.value = freq(midi) * 2; bell.detune.value = 5;
    bellGain.gain.setValueAtTime(0.35 * vel, t); bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.28, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    body.connect(g); bell.connect(bellGain); bellGain.connect(g); g.connect(master);
    body.start(t); bell.start(t); body.stop(t + len + 0.05); bell.stop(t + len + 0.05);
    // ripple of light where the note was played
    dispatchEvent(new CustomEvent('tam:note', { detail: { pc: midi % 12, x, y, vel, source: 'site' } }));
  }

  function chord(i, at) {
    [0, 2, 4].forEach((step, k) => setTimeout(() => play(NOTES[Math.min(NOTES.length - 1, i + step)], { ...at, vel: 0.55 }), k * 45));
  }

  function set(state) {
    on = state;
    store.set('play-site', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.ps-label').textContent = on ? 'Playing' : 'Play';
    document.body.classList.toggle('site-playing', on);
    if (on) audio().then(() => [0, 2, 4, 5].forEach((k, n) => setTimeout(() => play(NOTES[5 + k], { x: innerWidth / 2, y: innerHeight * 0.6, vel: 0.5 }), n * 110)));
  }

  btn.addEventListener('click', () => set(!on));
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('.ps-label').textContent = on ? 'Playing' : 'Play';
  document.body.classList.toggle('site-playing', on);
  // Browsers only allow sound after a gesture: if it was left on, wake it on the first one.
  if (on) addEventListener('pointerdown', () => audio(), { once: true });

  document.addEventListener('pointerover', (e) => {
    if (!on || !ac || e.pointerType === 'touch') return;
    const el = e.target.closest(SEL);
    if (!el || el === lastEl || el === btn) return;
    const now = performance.now();
    if (now - lastAt < 70) return;
    lastEl = el; lastAt = now;
    play(NOTES[noteIndex(el)], { x: e.clientX, y: e.clientY, vel: 0.45 });
  });
  document.addEventListener('pointerout', (e) => { if (lastEl && !lastEl.contains(e.relatedTarget)) lastEl = null; });
  document.addEventListener('click', (e) => {
    if (!on || !ac) return;
    const el = e.target.closest(SEL);
    if (!el || el === btn) return;
    chord(noteIndex(el) % 10, { x: e.clientX, y: e.clientY });
  });

  const KEYS = 'asdfghjk';
  addEventListener('keydown', (e) => {
    if (!on || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = KEYS.indexOf(e.key.toLowerCase());
    if (k < 0) return;
    audio();
    play(NOTES[3 + k], { x: (innerWidth / (KEYS.length + 1)) * (k + 1), y: innerHeight * 0.72, vel: 0.6 });
  });
}
