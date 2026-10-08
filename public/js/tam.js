// TAM.TV client: London-time light, falling choruses, countdowns, consent, analytics, studio.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- time --------------------------------------------------------------
  // The logo itself never changes. London time only moves the light around it:
  // body[data-daypart] drives the halo and the site's gold (see site.css).
  const LINES = {
    dawn: 'Dawn in London. The room is quiet; the archive is open.',
    day: 'Daytime in London. Catch up on last night’s sets.',
    dusk: 'Doors soon. Evening light at TAM.',
    night: 'Night in London. This is when TAM happens.',
  };
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const london = () => Object.fromEntries(fmt.formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, +p.value]));
  const daypart = (h) => (h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'dusk' : 'night');

  function tickClock() {
    const t = london();
    const part = daypart(t.hour);
    document.body.dataset.daypart = part;
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

  // ---- the TAM 108: choruses falling from the top -------------------------
  function chorusRain() {
    const canvas = document.querySelector('[data-chorus]');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const toggle = document.querySelector('[data-chorus-toggle]');
    const store = { get: () => { try { return localStorage.getItem('tam_chorus'); } catch { return null; } }, set: (v) => { try { localStorage.setItem('tam_chorus', v); } catch { /* private mode */ } } };
    let paused = reduced || store.get() === 'paused';
    let songs = [];
    let queue = [];
    let drops = [];
    let w = 0;
    let h = 0;
    let last = 0;
    let raf = 0;

    const css = getComputedStyle(document.documentElement);
    const display = css.getPropertyValue('--display').trim() || 'sans-serif';
    const gold = () => getComputedStyle(document.body).getPropertyValue('--gold-hi').trim() || '#f0b768';

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function nextSong() {
      if (!queue.length) queue = songs.slice().sort(() => Math.random() - 0.5);
      return queue.pop();
    }

    function makeDrop(song, y) {
      const z = 0.3 + Math.random() * 0.7; // depth: near drops are bigger, brighter, faster
      const size = Math.round(13 + z * (w < 600 ? 9 : 17));
      const lines = song.chorus && song.chorus.length ? song.chorus : [song.title];
      const caption = song.chorus && song.chorus.length ? `${song.title} · ${song.artist}` : `${song.artist}${song.year ? ` · ${song.year}` : ''}`;
      ctx.font = `600 ${size}px ${display}`;
      const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const x = Math.max(8, Math.random() * Math.max(8, w - width - 8));
      return { lines, caption, size, z, x, y: y ?? -size * (lines.length + 2), speed: 10 + z * 26, sway: Math.random() * Math.PI * 2, color: gold() };
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (const d of drops) {
        const fadeIn = Math.min(1, (d.y + d.size * 3) / (h * 0.25));
        const fadeOut = Math.min(1, (h - d.y) / (h * 0.3));
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * (0.06 + d.z * 0.16);
        const x = d.x + Math.sin(t / 2400 + d.sway) * 6 * d.z;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = d.color;
        ctx.font = `600 ${d.size}px ${display}`;
        d.lines.forEach((line, i) => ctx.fillText(line, x, d.y + i * d.size * 1.25));
        ctx.globalAlpha = alpha * 0.8;
        ctx.font = `400 ${Math.round(d.size * 0.55)}px ${display}`;
        ctx.fillText(d.caption.toUpperCase(), x, d.y + d.lines.length * d.size * 1.25 + d.size * 0.1);
      }
      ctx.globalAlpha = 1;
    }

    const target = () => Math.max(4, Math.min(12, Math.round(w / 160)));

    function frame(t) {
      const dt = Math.min(0.1, (t - (last || t)) / 1000);
      last = t;
      for (const d of drops) d.y += d.speed * dt;
      drops = drops.filter((d) => d.y < h + d.size * 2);
      // Stagger new drops so they don't arrive in waves.
      if (drops.length < target() && Math.random() < 0.03) drops.push(makeDrop(nextSong()));
      draw(t);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = 0;
      if (paused) { draw(0); return; } // a still frame: the choruses hang in place
      raf = requestAnimationFrame(frame);
    }

    function setPaused(v, remember) {
      paused = v;
      if (remember) store.set(v ? 'paused' : 'playing');
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(v));
        toggle.textContent = v ? 'Play the falling choruses' : 'Pause the falling choruses';
      }
      start();
    }

    Promise.all([fetch('/chorus.json').then((r) => r.json()), document.fonts?.ready]).then(([list]) => {
      songs = list;
      resize();
      // Seed the screen so it isn't empty on arrival.
      for (let i = 0; i < target(); i++) drops.push(makeDrop(nextSong(), Math.random() * h * 0.9));
      setPaused(paused, false);
    }).catch(() => {});

    toggle?.addEventListener('click', () => setPaused(!paused, true));
    window.addEventListener('resize', () => { resize(); if (paused) draw(0); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!paused) start();
    });
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
  tickClock();
  tickCountdowns();
  chorusRain();
  setInterval(() => { tickClock(); tickCountdowns(); }, 1000);
  track('view');
})();
