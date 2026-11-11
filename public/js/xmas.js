// The Christmas home page dances to the song: while The Best Christmas Ever
// plays (the video or the Tamalume player), the beat (window.SYN, from
// tamalume.js) drives CSS variables the page reads: --beat (a pulse on every
// beat), --bass and --glow. The star flares, the lights flash, the headings
// glow. Quiet when the song is paused; still for reduced motion.

const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let beat = 0, bass = 0, last = 0, playing = false;

addEventListener('song:play', () => { playing = true; document.body.classList.add('xm-playing'); });
addEventListener('song:pause', () => { playing = false; document.body.classList.remove('xm-playing'); });

function frame() {
  const S = window.SYN;
  if (S && S.on) playing = true;
  const b = S && S.on ? Math.max(S.beat || 0, S.bass || 0) : 0;
  // a fresh beat kicks the pulse up; it then falls away
  if (b > beat + 0.25 || (b > 0.6 && performance.now() - last > 240)) { beat = 1; last = performance.now(); }
  beat *= 0.9;
  bass = bass * 0.8 + (S && S.on ? (S.bass || 0) : 0) * 0.2;
  const k = still ? 0.25 : 1;
  root.style.setProperty('--beat', (beat * k).toFixed(3));
  root.style.setProperty('--bass', (bass * k).toFixed(3));
  root.style.setProperty('--glow', ((playing ? 0.35 : 0.1) + beat * 0.65 * k).toFixed(3));
  requestAnimationFrame(frame);
}
if (document.querySelector('.xm-hero')) requestAnimationFrame(frame);
