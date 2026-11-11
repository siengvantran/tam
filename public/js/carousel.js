// The featured show's carousel (src/views/featured.js): a 3D coverflow.
// The current slide faces you; the others fan out in depth on either side.
// Auto-advances, pauses on hover, focus or a hidden tab; swipe, arrows, dots
// and the keyboard all work. Reduced motion: a plain crossfade, no autoplay.

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const car of document.querySelectorAll('[data-carousel]')) {
  const slides = [...car.querySelectorAll('.fx-slide')];
  const dots = [...car.querySelectorAll('[data-go]')];
  const caption = car.querySelector('.fx-caption');
  const n = slides.length;
  let at = 0, timer = null, hold = false;
  if (still) car.classList.add('still');

  // Video slides play (muted, looping) only while they're at the front.
  function videos() {
    slides.forEach((s, k) => {
      const v = s.querySelector('video');
      if (!v) return;
      if (k === at && !still) { v.play().catch(() => {}); } else { v.pause(); }
    });
  }
  function show(i) {
    at = ((i % n) + n) % n;
    slides.forEach((s, k) => {
      let o = k - at;
      if (o > n / 2) o -= n;
      if (o < -n / 2) o += n;
      const a = Math.abs(o);
      s.style.setProperty('--o', o);
      s.style.setProperty('--a', a);
      s.style.zIndex = String(100 - a);
      s.classList.toggle('on', o === 0);
      s.toggleAttribute('aria-hidden', o !== 0);
      s.querySelector('a').tabIndex = o === 0 ? 0 : -1;
      s.style.visibility = a > 3 ? 'hidden' : 'visible';
    });
    dots.forEach((d, k) => d.setAttribute('aria-selected', String(k === at)));
    if (caption) caption.textContent = slides[at].querySelector('img').alt;
    videos();
  }
  const go = (d) => { show(at + d); restart(); };
  function restart() {
    clearTimeout(timer);
    if (still) return;
    // a video slide stays up a little longer, for the whole clip
    const step = () => { if (!hold && !document.hidden) show(at + 1); timer = setTimeout(step, slides[at].querySelector('video') ? 7000 : 4000); };
    timer = setTimeout(step, slides[at].querySelector('video') ? 7000 : 4000);
  }

  car.addEventListener('click', (e) => {
    const snd = e.target.closest('.fx-sound');
    if (snd) {
      e.preventDefault();
      const v = snd.closest('.fx-slide').querySelector('video');
      v.muted = !v.muted;
      if (!v.muted) v.play().catch(() => {});
      snd.setAttribute('aria-pressed', String(!v.muted)); snd.textContent = v.muted ? '🔇' : '🔊'; snd.setAttribute('aria-label', v.muted ? 'Sound on' : 'Sound off');
      hold = !v.muted; // keep the video up while someone's listening
      return;
    }
    const s0 = e.target.closest('.fx-slide.on.is-video');
    if (s0 && still) { e.preventDefault(); const v = s0.querySelector('video'); return v.paused ? v.play() : v.pause(); } // reduced motion: play on request
    const b = e.target.closest('[data-dir], [data-go]');
    if (b) { e.preventDefault(); return b.dataset.dir ? go(Number(b.dataset.dir)) : (show(Number(b.dataset.go)), restart()); }
    const s = e.target.closest('.fx-slide');
    if (s && !s.classList.contains('on')) { e.preventDefault(); show(Number(s.dataset.i)); restart(); } // a side slide comes to the front first
  });
  car.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  car.addEventListener('pointerenter', () => { hold = true; });
  car.addEventListener('pointerleave', () => { hold = false; });
  car.addEventListener('focusin', () => { hold = true; });
  car.addEventListener('focusout', () => { hold = false; });
  // swipe
  let x0 = null;
  car.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  car.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  });
  show(0);
  restart();
}
