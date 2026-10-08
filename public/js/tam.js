// TAM.TV client: the living logo, countdowns, consent, light analytics, studio.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- time --------------------------------------------------------------
  const PALETTES = {
    dawn: ['#f7cfa4', '#dc9273', '#7d4b3d'],
    day: ['#ffd88f', '#e6a75a', '#8a5a2c'],
    dusk: ['#f4a95c', '#c4733a', '#5e3420'],
    night: ['#eebd78', '#a56f3c', '#3f2717'],
  };
  const LINES = {
    dawn: 'Dawn in London. The room is quiet; the archive is open.',
    day: 'Daytime in London. Catch up on last night’s sets.',
    dusk: 'Doors soon. Evening light at TAM.',
    night: 'Night in London. This is when TAM happens.',
  };
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const london = () => Object.fromEntries(fmt.formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, +p.value]));
  const daypart = (h) => (h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'dusk' : 'night');

  // Mirrors src/lib/logo.js liveMark(): light angle, palette, minute ring, second tick.
  function tickMarks() {
    const t = london();
    const part = daypart(t.hour);
    const angle = ((((t.hour + t.minute / 60 + t.second / 3600) / 24) * 360 + 90) % 360).toFixed(2);
    document.body.dataset.daypart = part;
    document.querySelectorAll('svg.tam-live').forEach((svg) => {
      svg.dataset.daypart = part;
      const grad = svg.querySelector('linearGradient');
      if (grad) {
        grad.setAttribute('gradientTransform', `rotate(${angle})`);
        grad.querySelectorAll('stop').forEach((s, i) => s.setAttribute('stop-color', PALETTES[part][i]));
      }
      const words = svg.querySelector('.tam-words');
      if (words) words.style.transform = `rotate(${(t.minute + t.second / 60) * 6}deg)`;
      const tick = svg.querySelector('.tam-tick');
      if (tick) tick.style.transform = `rotate(${t.second * 6}deg)`;
    });
    const time = document.querySelector('[data-clock-time]');
    if (time) time.textContent = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    const line = document.querySelector('[data-clock-line]');
    if (line) line.textContent = LINES[part];
  }

  function tickCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const ms = Date.parse(el.dataset.countdown) - Date.now();
      if (Number.isNaN(ms)) return;
      if (ms <= 0) { el.textContent = 'Happening now'; return; }
      const d = Math.floor(ms / 864e5);
      const h = Math.floor((ms % 864e5) / 36e5);
      const m = Math.floor((ms % 36e5) / 6e4);
      const s = Math.floor((ms % 6e4) / 1e3);
      el.textContent = d > 0 ? `In ${d}d ${h}h ${m}m` : `In ${h}h ${m}m ${String(s).padStart(2, '0')}s`;
    });
  }

  // Assemble: the four letters arrive from their own quadrant, once per visit.
  function assemble() {
    if (reduced) return;
    document.querySelectorAll('.hero-mark svg.tam-live, .logo-demo svg.tam-live').forEach((svg) => svg.classList.add('assemble'));
  }

  // The hero mark leans a little toward the pointer, like light catching metal.
  function tilt() {
    const hero = document.querySelector('.hero-mark');
    if (!hero || reduced) return;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
      hero.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    });
    hero.addEventListener('pointerleave', () => { hero.style.setProperty('--rx', '0deg'); hero.style.setProperty('--ry', '0deg'); });
  }

  // ---- consent + analytics ----------------------------------------------
  const cookie = (k) => document.cookie.split('; ').find((c) => c.startsWith(`${k}=`))?.split('=')[1];
  const setCookie = (k, v, days) => { document.cookie = `${k}=${v}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; };

  function track(type, extra = {}) {
    if (cookie('tam_consent') !== 'granted') return;
    const body = JSON.stringify({ type, path: location.pathname, ref: document.referrer, ...extra });
    navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' })) || fetch('/api/track', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-consent]');
    if (btn) {
      const v = btn.dataset.consent;
      setCookie('tam_consent', v, 365);
      if (v === 'granted' && !cookie('tam_vid')) setCookie('tam_vid', crypto.randomUUID(), 365);
      if (v === 'denied') setCookie('tam_vid', '', 0);
      document.querySelector('.consent')?.remove();
      if (v === 'granted') track('view');
      return;
    }
    const a = e.target.closest('a[href$=".ics"]');
    if (a) track('calendar');
  });

  // ---- nav ---------------------------------------------------------------
  const toggle = document.querySelector('.nav-toggle');
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelector('.site-nav')?.classList.toggle('open', open);
  });

  // ---- studio ------------------------------------------------------------
  const studio = document.querySelector('[data-studio]');
  if (studio) {
    const out = document.querySelector('[data-studio-out]');
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
    studio.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(studio);
      out.replaceChildren(el('p', 'The Production Agent is working on it…', 'muted'));
      try {
        const res = await fetch('/api/agent/production', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': f.get('token') },
          body: JSON.stringify({ artist: f.get('artist'), event: f.get('event'), notes: f.get('notes') }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        const blocks = [
          el('h2', data.headline),
          el('h3', 'Profile'), el('p', data.profile),
          el('h3', 'SEO'), el('p', `${data.seo.title} — ${data.seo.description}`),
          el('h3', 'Captions'),
          ...Object.entries(data.captions).flatMap(([k, v]) => [el('h4', k), el('p', v)]),
        ];
        for (const [title, key] of [['Clip ideas', 'clipIdeas'], ['Interview questions', 'interviewQuestions'], ['Story angles', 'storyAngles']]) {
          const ul = el('ul');
          data[key].forEach((x) => ul.append(el('li', x)));
          blocks.push(el('h3', title), ul);
        }
        out.replaceChildren(...blocks);
      } catch (err) {
        out.replaceChildren(el('p', `Couldn’t generate: ${err.message}`, 'error'));
      }
    });
  }

  // ---- go ----------------------------------------------------------------
  assemble();
  tilt();
  tickMarks();
  tickCountdowns();
  setInterval(() => { tickMarks(); tickCountdowns(); }, 1000);
  track('view');
})();
