// A festival's song: the trailer, its story layer, the remix effects, the
// card maker, and the card viewer (/card/<id>).

import { $, $$, api, pageData, youtube, store, shrinkImage, formMessage, still } from './lib.js';

const data = pageData();
const fest = data.festival;
const box = $('#vidbox');

if (fest && box && box.dataset.youtube) {
  const card = data.card || null;
  let themes = [];
  const polaroids = new Map((fest.polaroids || []).map((p) => [p.id, p]));
  let player, storyTimer, storyIdx = 0;
  let theme = card ? card.theme : store.get(`theme:${fest.slug}`, '');
  const urlTheme = new URLSearchParams(location.search).get('stories');
  let showStories = card ? card.stories : store.get(`stories:${fest.slug}`, true);

  // ----- the player -----
  async function ensurePlayer(autoplay) {
    if (player) return player;
    const YT = await youtube();
    return new Promise((resolve) => {
      new YT.Player($('#trailer-player'), {
        videoId: box.dataset.youtube, playerVars: { playsinline: 1, rel: 0, autoplay: autoplay ? 1 : 0 },
        events: {
          onReady: (e) => {
            player = e.target;
            window.TAMSONG = { play: () => player.playVideo(), pause: () => player.pauseVideo(), time: () => player.getCurrentTime() || 0 };
            resolve(player);
          },
          onStateChange: (e) => {
            if (e.data === 1) { box.classList.add('playing'); dispatchEvent(new Event('song:play')); startStories(); }
            if (e.data === 2 || e.data === 0) { dispatchEvent(new Event('song:pause')); stopStories(); }
          },
        },
      });
    });
  }
  const playBtn = $('.vplay', box);
  if (playBtn) playBtn.addEventListener('click', async () => { box.classList.add('playing'); (await ensurePlayer(true)).playVideo(); });
  // Let Tamalume start the trailer rather than a second hidden player.
  if (!card) ensurePlayer(false);

  // ----- the story layer: one story per few seconds while the song plays -----
  const book = $('#storybook');
  const current = () => themes.find((t) => t.id === theme) || themes[0];
  function showStory() {
    if (!book) return;
    const t = current();
    if (!t || !showStories) { book.innerHTML = ''; return; }
    const s = t.stories[storyIdx % t.stories.length];
    storyIdx++;
    const el = document.createElement('div');
    el.className = 'story';
    if (s.photo) { const img = document.createElement('img'); img.src = s.photo; img.alt = s.alt || ''; el.appendChild(img); }
    const k = document.createElement('div'); k.className = 'k'; k.textContent = s.quote ? 'In their words' : s.kicker || t.name; el.appendChild(k);
    const p = document.createElement('p'); p.textContent = s.text; el.appendChild(p);
    if (s.by) { const by = document.createElement('p'); by.textContent = `— ${s.by}`; by.style.fontStyle = 'italic'; el.appendChild(by); }
    book.replaceChildren(el);
  }
  function startStories() { if (storyTimer || !themes.length) return; showStory(); storyTimer = setInterval(showStory, 6500); }
  function stopStories() { clearInterval(storyTimer); storyTimer = null; }

  const chips = $('#theme-chips');
  if (fest.stories) {
    try { themes = (await api(`/api/stories/${encodeURIComponent(fest.stories)}`)).themes; } catch { themes = []; }
    if (!themes.some((t) => t.id === theme)) theme = themes[0] && themes[0].id;
    if (urlTheme && themes.some((t) => t.id === urlTheme)) theme = urlTheme;
  }
  if (chips && themes.length) {
    for (const t of themes) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = t.name; b.title = t.blurb || '';
      b.setAttribute('aria-pressed', String(t.id === theme));
      b.addEventListener('click', () => {
        theme = t.id; storyIdx = 0; store.set(`theme:${fest.slug}`, theme);
        $$('.chip', chips).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (storyTimer) showStory();
      });
      chips.appendChild(b);
    }
  }
  const toggle = $('#stories-toggle');
  if (toggle) {
    toggle.checked = showStories;
    toggle.addEventListener('change', () => { showStories = toggle.checked; store.set(`stories:${fest.slug}`, showStories); showStory(); });
  }

  // ----- remix effects over the video -----
  const layer = $('#fx-layer');
  let fxOn = new Set(card ? card.fx : []);
  let particles = null;
  function renderFx() {
    layer.replaceChildren();
    for (const k of ['glow', 'pop', 'leaks', 'pulse']) if (fxOn.has(k)) { const d = document.createElement('div'); d.className = `fx-${k}`; layer.appendChild(d); }
    if ((fxOn.has('snow') || fxOn.has('sparkle')) && !still) {
      const cv = document.createElement('canvas'); layer.appendChild(cv);
      startParticles(cv);
    } else particles = null;
    const pics = [...(card ? card.polaroids : pickedPolas).map((id) => polaroids.get(id)?.src).filter(Boolean), ...(card ? card.photos : ownPhotos)];
    if (pics.length) {
      const wrap = document.createElement('div'); wrap.className = 'fx-photos';
      for (const src of pics.slice(0, 7)) { const i = document.createElement('img'); i.src = src; i.alt = ''; wrap.appendChild(i); }
      layer.appendChild(wrap);
    }
  }
  function startParticles(cv) {
    const x = cv.getContext('2d');
    const token = {};
    particles = token;
    const ps = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 2 + 1, v: Math.random() * 0.002 + 0.001, s: Math.random() < 0.3 }));
    const draw = (t) => {
      if (particles !== token) return;
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
      const beat = (window.SYN && window.SYN.beat) || 0;
      for (const p of ps) {
        if (fxOn.has('snow') && !p.s) {
          p.y += p.v; p.x += Math.sin(t / 900 + p.r) * 0.0006;
          if (p.y > 1) { p.y = 0; p.x = Math.random(); }
          x.globalAlpha = 0.85; x.fillStyle = '#fff';
          x.beginPath(); x.arc(p.x * cv.width, p.y * cv.height, p.r, 0, 6.283); x.fill();
        }
        if (fxOn.has('sparkle') && p.s) {
          const a = Math.max(0, Math.sin(t / 300 + p.x * 20)) * (0.6 + beat);
          x.globalAlpha = Math.min(1, a); x.fillStyle = '#fff6c8';
          const cx = p.x * cv.width, cy = p.y * cv.height, r = 3 + beat * 5;
          x.fillRect(cx - r, cy - 0.7, r * 2, 1.4); x.fillRect(cx - 0.7, cy - r, 1.4, r * 2);
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  // ----- the card maker -----
  const form = $('#card-form');
  const pickedPolas = [];
  const ownPhotos = [];
  if (form && fest.cards) {
    const rules = fest.cards;
    const fxNames = { snow: 'Snow', sparkle: 'Sparkle', glow: 'Warm glow', pop: 'Pop art', leaks: 'Light leaks', pulse: 'Beat pulse' };
    const fxChips = $('#fx-chips');
    for (const k of rules.fx || []) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = fxNames[k] || k; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        fxOn.has(k) ? fxOn.delete(k) : fxOn.add(k);
        b.setAttribute('aria-pressed', String(fxOn.has(k)));
        renderFx();
      });
      fxChips.appendChild(b);
    }
    const pp = $('#pola-pick');
    if (pp) {
      for (const p of polaroids.values()) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pola'; b.setAttribute('aria-pressed', 'false'); b.title = p.caption;
        const img = document.createElement('img'); img.src = p.thumb || p.src; img.alt = p.alt || p.caption; img.loading = 'lazy'; b.appendChild(img);
        b.addEventListener('click', () => {
          const i = pickedPolas.indexOf(p.id);
          if (i >= 0) pickedPolas.splice(i, 1);
          else if (pickedPolas.length < rules.maxPolaroids) pickedPolas.push(p.id);
          else return formMessage(form, `Pick up to ${rules.maxPolaroids} Polaroids.`);
          b.setAttribute('aria-pressed', String(pickedPolas.includes(p.id)));
          formMessage(form, ''); renderFx();
        });
        pp.appendChild(b);
      }
    }
    const own = $('#own-file');
    if (own) {
      own.addEventListener('change', async () => {
        for (const f of own.files) {
          if (ownPhotos.length >= rules.maxOwnPhotos) { formMessage(form, `Add up to ${rules.maxOwnPhotos} of your own photos.`); break; }
          try {
            const url = await shrinkImage(f, 900, 0.8);
            ownPhotos.push(url);
            const img = document.createElement('img'); img.className = 'own-thumb'; img.src = url; img.alt = 'Your photo';
            $('#own-pick').appendChild(img);
          } catch (e) { formMessage(form, e.message); }
        }
        own.value = ''; renderFx();
      });
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; formMessage(form, 'Making your card…', true);
      try {
        const r = await api('/api/cards', { method: 'POST', body: {
          festival: fest.slug, to: f.get('to'), from: f.get('from'), text: f.get('text'),
          fx: [...fxOn], polaroids: pickedPolas, photos: ownPhotos, theme, stories: showStories,
        } });
        formMessage(form, '');
        const out = $('#card-out'); out.hidden = false;
        $('#card-link').value = r.url;
        const msg = `${f.get('from') ? `${f.get('from')} made you a card` : 'A card for you'}: ${r.url}`;
        $('#share-wa').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        $('#share-mail').href = `mailto:?subject=${encodeURIComponent('A card for you')}&body=${encodeURIComponent(msg)}`;
        $('#share-open').href = r.url;
        const native = $('#share-native');
        if (navigator.share) { native.hidden = false; native.onclick = () => navigator.share({ title: 'A card for you', url: r.url }).catch(() => {}); }
        out.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
      } catch (err) { formMessage(form, err.message); }
      btn.disabled = false;
    });
  }

  // ----- the card viewer: an envelope that opens onto the remix -----
  const env = $('#envelope');
  if (card && env) {
    env.addEventListener('click', async () => {
      env.hidden = true;
      $('#card-inside').hidden = false;
      renderFx();
      const p = await ensurePlayer(true);
      p.playVideo();
    });
  }
  renderFx();
}
