// The TAM Stage's pages (src/domain/stage.js): /stage to discover acts,
// /stage/apply, each act's microverse at /stage/:slug, the artist's own
// dashboard at /stage/me, and the A&R board at /stage/manage.

import { html, raw } from './html.js';
import { html as respond } from '../lib/http.js';
import { layout } from './layout.js';
import { STAGES } from '../domain/stage.js';
import { VIBE_MARKS } from '../domain/showcases.js';

const OPEN_NIGHTS = ['TAM Open Mic', 'The Original Singers Club', 'The Great British Blues Jam', 'Junior Open Mic / JOM'];

// The microverse: the act at the centre, six planets on their orbits, the
// ones reached lit up, the next one with its progress arc, and a star for
// every fan boost (up to 80).
export function microverse(v, { size = 560, label = true } = {}) {
  const c = 300, R = (i) => 62 + i * 40;
  const angle = (i) => (-90 + i * 52) * Math.PI / 180;
  const pos = (i) => [c + R(i) * Math.cos(angle(i)), c + R(i) * Math.sin(angle(i))];
  const next = v.stage + 1;
  const pct = Math.round((v.progress ?? 0) * 100);
  let seed = [...v.slug].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stars = Array.from({ length: Math.min(80, v.boosts) }, () => { const a = rnd() * Math.PI * 2, r = 40 + rnd() * 250; return [c + r * Math.cos(a), c + r * Math.sin(a), 0.8 + rnd() * 1.8]; });
  const arc = (i, f) => { const r = R(i), a0 = angle(i) - Math.PI / 2, a1 = a0 + Math.PI * 2 * Math.min(0.999, f); const [x0, y0] = [c + r * Math.cos(a0), c + r * Math.sin(a0)], [x1, y1] = [c + r * Math.cos(a1), c + r * Math.sin(a1)]; return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  return html`<figure class="mv" style="--mv-size:${size}px">
  <svg viewBox="0 0 600 600" role="img" aria-label="${v.act}’s microverse: ${STAGES[v.stage].name} reached${STAGES[next] ? `, ${pct}% of the way to ${STAGES[next].name}` : ', a festival act'}.">
    <defs><radialGradient id="mv-core-${v.slug}"><stop offset="0" stop-color="var(--v-1)"/><stop offset="1" stop-color="var(--v-2)" stop-opacity="0"/></radialGradient>
    <clipPath id="mv-face-${v.slug}"><circle cx="${c}" cy="${c}" r="34"/></clipPath></defs>
    <g class="mv-stars">${raw(stars.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join(''))}</g>
    ${STAGES.map((s, i) => html`<circle class="mv-orbit ${i <= v.stage ? 'on' : ''}" cx="${c}" cy="${c}" r="${R(i)}"/>`)}
    ${STAGES[next] ? html`<path class="mv-arc" d="${arc(next, Math.max(0.02, v.progress ?? 0))}"/>` : ''}
    <circle cx="${c}" cy="${c}" r="58" fill="url(#mv-core-${v.slug})" class="mv-core"/>
    ${v.photo ? html`<image href="${v.photo}" x="${c - 34}" y="${c - 34}" width="68" height="68" clip-path="url(#mv-face-${v.slug})" preserveAspectRatio="xMidYMid slice"/>` : html`<circle cx="${c}" cy="${c}" r="34" class="mv-me"/>`}
    <g class="mv-planets">${STAGES.map((s, i) => { const [x, y] = pos(i); const st = i < v.stage ? 'done' : i === v.stage ? 'here' : i === next ? 'next' : 'far'; return html`<g class="mv-planet ${st}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 5 ? 15 : 11}"/>${label ? html`<text x="${x.toFixed(1)}" y="${(y + (i === 5 ? 32 : 27)).toFixed(1)}">${s.name}</text>` : ''}</g>`; })}</g>
  </svg></figure>`;
}

const page = (ctx, o) => layout(ctx, { ambient: 'stars', scripts: ['/js/stage.js'], ...o });

function card(v) {
  return html`<a class="st-card vibe-${v.vibe}" href="${v.href}">
    <div class="st-pic">${v.photo ? html`<img src="${v.photo}" alt="" loading="lazy" width="320" height="320">` : html`<span>${(VIBE_MARKS[v.vibe] || ['', '★'])[1]}</span>`}</div>
    <div class="st-card-body"><span class="st-planet">${STAGES[v.stage].name}</span><h3>${v.act}</h3><p>${v.plays || ''}</p>
    <div class="st-bar" aria-hidden="true"><i style="width:${Math.round(v.progress * 100)}%"></i></div>
    <small>✦ ${v.boosts} boost${v.boosts === 1 ? '' : 's'}${STAGES[v.stage + 1] ? ` · ${Math.round(v.progress * 100)}% to ${STAGES[v.stage + 1].name}` : ''}</small></div></a>`;
}

const pathList = () => html`<ol class="st-path">${STAGES.map((s, i) => html`<li><b>${i + 1}</b><div><strong>${s.name}</strong><span>${s.blurb}</span></div></li>`)}</ol>`;

export function routes(r, ctx, stage) {
  const withProgress = (v) => ({ ...v, progress: stage.progress(v) });

  r.get('/stage', (req, res) => {
    const all = stage.live().map(withProgress);
    const rising = all.slice().sort((a, b) => stage.stats(stage.bySlug(b.slug)).recent - stage.stats(stage.bySlug(a.slug)).recent).slice(0, 4);
    respond(res, page(ctx, {
      title: 'The TAM Stage: discover, boost, and watch them rise', path: '/stage',
      description: 'New acts on their way to a TAM festival stage. Discover them, boost the ones you love, and watch them move from open nights to the Sunday Showcase to a festival spot.',
      body: html`<section class="section st-hero"><div class="wrap"><div class="label">TAM’s A&amp;R, out in the open</div>
        <h1 class="chrome gold">The TAM Stage</h1>
        <p class="lede">Every act that asks to play at TAM gets a microverse: their own page, and their path from a first signal to a festival stage. Discover them, boost the ones you love, and help us decide who plays next.</p>
        <p><a class="btn hot" href="/stage/apply">Ask to play at TAM</a> <a class="btn ghost" href="#acts">Discover acts</a></p></div></section>
      ${rising.length ? html`<section class="section"><div class="wrap"><h2 class="chrome">Rising this week</h2><div class="st-grid">${rising.map(card)}</div></div></section>` : ''}
      <section class="section" id="acts"><div class="wrap"><h2 class="chrome">Every act on the path</h2>
        ${all.length ? html`<div class="st-filter" role="group" aria-label="Show acts at">${[['all', 'All']].concat(STAGES.slice(1).map((s) => [s.id, s.name])).map(([k, v], i) => html`<button type="button" class="${i ? '' : 'on'}" data-st-filter="${k}">${v}</button>`)}</div>
        <div class="st-grid" id="st-all">${all.sort((a, b) => b.stage - a.stage || b.boosts - a.boosts).map((v) => html`<div data-st="${STAGES[v.stage].id}">${card(v)}</div>`)}</div>`
        : html`<p class="muted">The first acts are building their pages now.</p>`}</div></section>
      <section class="section"><div class="wrap st-how"><div><h2 class="chrome">The path</h2>${pathList()}</div>
        <div><h2 class="chrome">How you help</h2><ul class="st-help"><li><b>Boost</b> the acts you love: once a day each. It’s a signal TAM’s A&amp;R team watches.</li>
        <li><b>TAM Club members</b> earn a point for boosting, and a scout bonus every time an act you backed moves up a planet. <a href="/club">Join the club</a>.</li>
        <li><b>Come and see them</b> at the open nights and the Sunday Showcase, and bring a friend.</li></ul></div></div></section>`,
    }));
  });

  r.get('/stage/apply', (req, res) => respond(res, page(ctx, {
    title: 'Ask to play at TAM', path: '/stage/apply',
    description: 'Ask to play at TAM and get your own TAM Stage page: your path from an open night to a festival stage.',
    body: html`<section class="section"><div class="wrap st-apply"><div>
      <div class="label">The TAM Stage</div><h1 class="chrome gold">Ask to play at TAM</h1>
      <p class="lede">Every act gets its own page on the TAM Stage, your microverse, and a path to a festival spot. We email you a link to build it.</p>${pathList()}</div>
      <form class="formbox" id="st-apply" novalidate>
        <div class="fields"><label class="field"><span>Your name</span><input name="name" maxlength="80" required autocomplete="name"></label>
        <label class="field"><span>Email</span><input name="email" type="email" maxlength="200" required autocomplete="email"></label>
        <label class="field"><span>Act or band name</span><input name="act" maxlength="80" required></label>
        <label class="field"><span>What you play</span><input name="plays" maxlength="120" placeholder="e.g. soul trio, acoustic singer-songwriter"></label>
        <label class="field full"><span>Links to your music</span><textarea name="links" rows="2" maxlength="1200" placeholder="Instagram, Spotify, YouTube, SoundCloud: one per line"></textarea></label>
        <label class="field full"><span>Your open night</span><select name="circuit"><option value="">Choose…</option>${OPEN_NIGHTS.map((n) => html`<option>I’ve played ${n}</option>`)}${OPEN_NIGHTS.map((n) => html`<option>I’m coming to ${n}</option>`)}<option>Not yet: tell me which to come to</option></select></label></div>
        <label class="check"><input type="checkbox" name="consent" required> Yes, email me about playing at TAM and my TAM Stage page. <a href="/privacy#stage">Privacy</a></label>
        <button class="btn hot" type="submit">Start my page</button><p class="err" role="status" aria-live="polite"></p>
        <p class="small muted">Already asked? Use the same email and we’ll send your link again.</p></form></div></section>`,
  })));

  r.get('/stage/in', (req, res) => respond(res, page(ctx, {
    title: 'Your TAM Stage page', path: '/stage/in', noindex: true,
    body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome gold">Your TAM Stage page</h1><div class="formbox" id="st-in"><p>Open your page on this device.</p><button class="btn hot" type="button">Open my page</button><p class="err" role="status" aria-live="polite"></p></div></div></section>`,
  })));

  r.get('/stage/me', (req, res) => respond(res, page(ctx, {
    title: 'Your microverse', path: '/stage/me', noindex: true, bodyClass: 'st-me-page',
    body: html`<section class="section"><div class="wrap"><div id="st-me"><p class="muted">Loading your page…</p></div></div></section>`,
  }), 200, { 'Cache-Control': 'no-store' }));

  r.get('/stage/manage', (req, res) => respond(res, layout(ctx, {
    title: 'TAM Stage: A&R', path: '/stage/manage', noindex: true, ambient: null, scripts: ['/js/stage-manage.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap wide"><div class="shows-top"><div><div class="label">TAM back office</div><h1 class="chrome gold">TAM Stage: A&amp;R</h1></div><div id="anr-who" class="small muted"></div></div>
    <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Type your work email and we’ll send you a one-tap sign-in link.</p>
    <form id="team-link"><input type="hidden" name="next" value="/stage/manage"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
    <button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form>
    <details class="small"><summary>Use the admin code instead</summary><form id="team-code"><label class="field"><span>Code</span><input name="token" type="password" autocomplete="current-password" required></label>
    <button class="btn ghost" type="submit">Sign in</button><p class="err" role="status" aria-live="polite"></p></form></details></div>
    <div id="anr" hidden></div></div></section>`,
  })));

  // an act's microverse
  r.get('/stage/:slug', (req, res, { params }) => {
    const a = stage.bySlug(params.slug);
    const owner = a && stage.artistOf(req);
    const preview = a && a.status !== 'live' && ((owner && owner.id === a.id) || ctx.isDoor(req));
    if (!a || (a.status !== 'live' && !preview)) {
      return respond(res, page(ctx, { title: 'Not here', noindex: true, body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome">That act isn’t on the Stage</h1><p><a href="/stage">Discover the acts on the TAM Stage</a>.</p></div></section>` }), 404);
    }
    if (!preview) stage.viewed(a, req);
    const v = withProgress(stage.publicView(a));
    const next = STAGES[v.stage + 1];
    const url = `${ctx.cfg.siteUrl}/stage/${v.slug}`;
    respond(res, page(ctx, {
      title: `${v.act} · TAM Stage`, path: `/stage/${v.slug}`, og: v.photo || undefined, noindex: preview, bodyClass: `st-page vibe-${v.vibe}`, ambient: null,
      description: `${v.act}${v.plays ? `: ${v.plays}` : ''}. On the TAM Stage at ${STAGES[v.stage].name}${next ? `, on the way to ${next.name}` : ''}. Boost them.`,
      body: html`${preview ? html`<p class="st-preview">Preview: only you${owner ? '' : ' (TAM staff)'} can see this until TAM puts it live.</p>` : ''}
      <section class="st-top"><div class="wrap st-top-grid">
        <div class="st-id"><div class="label">TAM Stage · ${STAGES[v.stage].planet}</div><h1>${v.act}</h1>
          ${v.plays ? html`<p class="st-plays">${v.plays}</p>` : ''}${v.from ? html`<p class="small">From ${v.from}</p>` : ''}
          <div class="st-boost"><button class="btn hot" type="button" data-boost="${v.slug}">✦ Boost ${v.act}</button><b data-boosts>${v.boosts}</b><span>boosts</span></div>
          <p class="small muted" data-boost-msg role="status" aria-live="polite">One boost a day. TAM Club members earn a point, and a scout bonus when ${v.act} moves up.</p>
          <div class="st-share" data-share data-url="${url}" data-text="Boost ${v.act} on the TAM Stage: help them get to a festival stage" data-title="${v.act} · TAM Stage">
            <button class="btn ghost small" type="button" data-native hidden>Share</button><a class="btn ghost small" href="https://wa.me/?text=${encodeURIComponent(`Boost ${v.act} on the TAM Stage: ${url}`)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn ghost small" type="button" data-copy>Copy link</button></div>
        </div>
        <div>${microverse(v)}
          <div class="st-next">${next ? html`<p><b>${Math.round(v.progress * 100)}%</b> of the way to <b>${next.name}</b>: ${next.blurb}</p>
            <ul class="st-goals">${v.goals.map((g) => html`<li class="${g.done ? 'done' : ''}"><i style="--p:${g.part}"></i>${g.label}</li>`)}</ul>` : html`<p><b>A festival act.</b> They’ve reached the top of the TAM Stage.</p>`}</div></div>
      </div></section>
      <section class="section"><div class="wrap st-body">
        <div>${v.youtube ? html`<div class="aw-embed aw-yt st-video"><iframe src="https://www.youtube-nocookie.com/embed/${v.youtube}" title="${v.act}, live" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : ''}
          ${v.bio ? html`<div class="prose">${v.bio.split(/\n\s*\n/).map((p) => html`<p>${p}</p>`)}</div>` : ''}</div>
        <aside>${v.links.length ? html`<h2>Listen and follow</h2><ul class="st-links">${v.links.map((l) => html`<li><a href="${l}" target="_blank" rel="noopener">${(() => { try { return new URL(l).hostname.replace(/^www\./, ''); } catch { return l; } })()} ↗</a></li>`)}</ul>` : ''}
          ${v.backers.length ? html`<h2>Early backers</h2><p class="st-backers">${v.backers.join(' · ')}</p>` : ''}
          <p><a href="/stage">More acts on the TAM Stage</a> · <a href="/stage/apply">Ask to play</a></p></aside>
      </div></section>`,
    }));
  });
}
