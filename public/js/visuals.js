// The living background: generative neon ribbons, like an oscilloscope made
// of light, drawn fresh every frame. They swell with the bass, shimmer with
// the treble and take the colour of the note being played (Tamalume's music,
// or the visitor playing the site). Every note sends a ripple of light out
// from where it happened. Stars (or snow, on festive pages) sit on top.

import { still, NOTE_COLOURS, setSyn } from './lib.js';

const cv = document.getElementById('ambient');
if (cv) {
  const x = cv.getContext('2d');
  // Phones get a lighter piece: native-resolution canvas, fewer lines, 30 frames a second.
  const small = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  const dpr = small ? 1 : Math.min(1.5, devicePixelRatio || 1);
  let skip = false;
  const snow = cv.dataset.kind === 'snow';
  const PALETTE = ['#ff3ea5', '#2ee6ff', '#a66bff', '#ffe14d', '#e8c77a'];
  let W = 0, H = 0, dots = [], ribbons = [], ripples = [];
  let accent = null, accentW = 0, pulse = 0;          // colour and energy from the latest note
  const pointer = { x: -1e4, y: 0, energy: 0 };       // the visitor's hand in the sound
  let running = false;

  const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const p = hexToRgb(a), q = hexToRgb(b); return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(',')})`; };

  function size() {
    W = cv.width = Math.round(innerWidth * dpr);
    H = cv.height = Math.round(innerHeight * dpr);
    const n = Math.round((innerWidth * innerHeight) / (snow ? 9000 : 9000));
    dots = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H, r: (Math.random() * (snow ? 2.1 : 1.1) + 0.35) * dpr,
      p: Math.random() * 6.28, f: Math.random() * 2 + 0.6, v: (Math.random() * 0.6 + 0.3) * dpr, w: Math.random(),
      h: ['#ffffff', '#ffd0ef', '#c8f4ff', '#fff3c4'][i % 4],
    }));
    ribbons = PALETTE.slice(0, small ? 3 : 5).map((colour, i) => ({
      colour, base: 0.52 + i * 0.085, amp: (26 + i * 9) * dpr, f1: 0.0016 + i * 0.00035, f2: 0.0041 - i * 0.0004,
      speed: 0.00022 + i * 0.00006, phase: i * 1.7, lines: small ? 2 : 4,
    }));
  }

  function drawRibbons(t, S) {
    const on = S && S.on;
    const energy = on ? S.energy : 0;
    const bass = Math.max(on ? S.bass : 0, pulse);
    const treb = on ? S.treb : 0;
    const step = 10 * dpr;
    x.globalCompositeOperation = 'lighter';
    for (const rb of ribbons) {
      const colour = accent && accentW > 0.01 ? mix(rb.colour, accent, Math.min(0.85, accentW)) : rb.colour;
      for (let k = 0; k < rb.lines; k++) {
        const off = k * 0.35, yOff = k * 7 * dpr;
        x.beginPath();
        for (let px = -step; px <= W + step; px += step) {
          const near = Math.exp(-((px - pointer.x) ** 2) / (2 * (140 * dpr) ** 2)) * pointer.energy;
          const y = rb.base * H + yOff
            + rb.amp * (1 + energy * 2.2 + bass * 1.4) * (0.62 * Math.sin(px * rb.f1 + t * rb.speed + rb.phase + off) + 0.38 * Math.sin(px * rb.f2 - t * rb.speed * 0.7 + rb.phase * 2 + off))
            + treb * 6 * dpr * Math.sin(px * 0.05 + t * 0.02 + k)
            - near * 46 * dpr * Math.sin(t * 0.004 + k);
          if (px === -step) x.moveTo(px, y); else x.lineTo(px, y);
        }
        const a = (0.55 - k * 0.11) * (0.55 + energy * 0.9 + pulse * 0.6);
        x.strokeStyle = colour;
        x.globalAlpha = a * 0.16; x.lineWidth = 9 * dpr; x.stroke();     // the halo
        x.globalAlpha = a; x.lineWidth = 1.3 * dpr; x.stroke();          // the tube
      }
    }
    x.globalCompositeOperation = 'source-over';
  }

  function drawRipples() {
    x.globalCompositeOperation = 'lighter';
    for (const r of ripples) {
      r.r += r.speed; r.life -= 0.016;
      for (const [w, a] of [[10, 0.12], [2, 0.8]]) {
        x.globalAlpha = Math.max(0, r.life) * a;
        x.strokeStyle = r.colour; x.lineWidth = w * dpr;
        x.beginPath(); x.arc(r.x, r.y, r.r, 0, 6.283); x.stroke();
        x.beginPath(); x.arc(r.x, r.y, r.r * 0.62, 0, 6.283); x.stroke();
      }
    }
    ripples = ripples.filter((r) => r.life > 0);
    x.globalCompositeOperation = 'source-over';
  }

  function drawDots(t, S) {
    const on = S && S.on;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      let a = still ? 0.6 : 0.2 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t / 1000 * d.f + d.p), 3), r = d.r;
      if (snow) {
        a = 0.5 + 0.4 * d.w;
        if (!still) { d.y += d.v * (1 + (on ? S.bass * 2 : 0)); d.x += Math.sin(t / 1400 + d.p) * 0.35 * dpr; if (d.y > H + 4) { d.y = -4; d.x = Math.random() * W; } }
      }
      if (on) { a = Math.min(1, a * (0.5 + S.treb * 1.8) + S.beat * 0.4); if (!still) r *= 1 + S.bass * (i % 2 ? 2 : 1); }
      x.globalAlpha = a; x.fillStyle = on && i % 3 === 0 ? S.color : snow ? '#ffffff' : d.h;
      x.beginPath(); x.arc(d.x, d.y, r, 0, 6.283); x.fill();
    }
  }

  function frame(t) {
    const S = window.SYN;
    if (small && !still) { skip = !skip; if (skip) { requestAnimationFrame(frame); return; } }
    x.clearRect(0, 0, W, H);
    drawRibbons(t, S);
    drawDots(t, S);
    drawRipples();
    x.globalAlpha = 1;
    // let the latest note fade, and glow the headlines with it when no song is playing
    accentW *= 0.985; pulse *= 0.93; pointer.energy *= 0.97;
    if (!(S && S.on)) {
      setSyn({ bass: pulse, color: accent || undefined });
    }
    if (still || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
  }
  const wake = () => { if (!running && !still) { running = true; requestAnimationFrame(frame); } };

  addEventListener('tam:note', (e) => {
    const { pc = 0, x: nx, y: ny, vel = 0.7 } = e.detail || {};
    accent = NOTE_COLOURS[((pc % 12) + 12) % 12]; accentW = 0.9; pulse = Math.max(pulse, vel * 0.8);
    if (still) { frame(performance.now()); return; }
    ripples.push({ x: (nx ?? innerWidth / 2) * dpr, y: (ny ?? innerHeight * 0.7) * dpr, r: 6 * dpr, speed: (3 + vel * 4) * dpr, life: 0.9, colour: accent });
    if (ripples.length > 24) ripples.shift();
    wake();
  });
  addEventListener('pointermove', (e) => { pointer.x = e.clientX * dpr; pointer.y = e.clientY * dpr; pointer.energy = Math.min(1, pointer.energy + 0.06); });
  addEventListener('syn:start', wake);
  document.addEventListener('visibilitychange', wake);
  addEventListener('resize', () => { size(); if (still) frame(performance.now()); });
  size();
  if (still) frame(performance.now()); else wake();
}
