// TAM Sunday Showcases: a call-out for artists who want to play a future
// showcase. The way in is TAM's open mic circuit: come to an open night, meet
// the host, then register your interest (it lands in /admin as an enquiry,
// kind "perform", and is emailed to the box office). Words and the circuit
// are in content/showcases.json; the dates come live from the listings.

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout, when, times, nightHref } from './layout.js';

const PATH = '/sunday-showcases';

// Lights on the tree: [left %, top %, colour, delay s], inside its outline.
const LIGHTS = [[50, 14, 'w', 0], [44, 24, 'r', .7], [57, 27, 'g', 1.2], [38, 37, 'w', .4], [62, 40, 'r', 1.7], [48, 43, 'g', .9], [32, 53, 'r', 1.4], [55, 55, 'w', .2],
  [68, 58, 'g', 2], [42, 62, 'w', 1.1], [26, 72, 'g', .6], [50, 73, 'r', 1.9], [74, 75, 'w', .3], [36, 80, 'r', 1.5], [62, 82, 'g', .8], [20, 88, 'w', 1.3], [48, 89, 'g', .1], [80, 89, 'r', 2.2]];

// This week's showcase: a Christmas tree with one present per act. Tap to unwrap.
export function treeSection(l) {
  if (!l || !l.count) return '';
  return html`<section class="section sc-xmas" id="this-sunday" aria-labelledby="sc-xmas-h"><div class="sc-snow" aria-hidden="true"></div><div class="wrap">
  <div class="head"><div class="label">This week’s showcase · ${l.count} acts</div><h2 class="chrome gold" id="sc-xmas-h">${l.when.replace(/ \d{4}$/, '')}</h2>
    <p class="muted">${l.night ? html`At <a href="${l.night.href}">${l.night.title}</a>${l.night.doors ? html`, doors ${l.night.doors}` : ''}. ` : ''}${l.count} acts are waiting under the tree. Tap a present to unwrap it and meet the act.</p>${l.note ? html`<p>${l.note}</p>` : ''}</div>
  <div class="sc-scene">
    <div class="sc-tree" aria-hidden="true">
      <img class="sc-star" src="/img/christmas/tam-logo-gold.png" alt="" width="120" height="120">
      <div class="sc-tiers"><i></i><i></i><i></i><i></i></div><div class="sc-trunk"></div>
      ${LIGHTS.map(([x, y, c, d]) => html`<span class="sc-light ${c}" style="left:${x}%;top:${y}%;animation-delay:${d}s"></span>`)}
    </div>
    <ul class="plain sc-gifts">${l.acts.map((a, i) => html`<li class="sc-g c${i % 6}${a.tba ? ' tba' : ''}">
      <button class="sc-wrap" type="button" aria-expanded="false" aria-controls="sc-act-${a.n}" aria-label="Unwrap act ${a.n}"><span class="g-lid"></span><span class="g-l"></span><span class="g-r"></span><span class="g-bow"></span><span class="g-tag">Act ${a.n}</span></button>
      <div class="sc-card" id="sc-act-${a.n}"><div class="label">Act ${a.n}</div>
        ${a.tba ? html`<h3>To be announced</h3><p class="small muted">This act is still under wraps. Check back soon.</p>`
          : html`<h3>${a.name}</h3>${a.plays ? html`<p class="sc-plays">${a.plays}</p>` : ''}${a.blurb ? html`<p class="small">${a.blurb}</p>` : ''}${a.link ? html`<a class="small" href="${a.link}" target="_blank" rel="noopener">Listen ↗</a>` : ''}`}
      </div></li>`)}</ul>
  </div>
  <p class="sc-all"><button class="btn ghost" type="button" id="sc-unwrap-all">Unwrap them all</button></p>
</div></section>`;
}

// The tree shows until the showcase night has been.
function thisWeek(ctx, showcase) {
  const l = showcase && showcase.lineup();
  return l && l.date >= ctx.today() ? treeSection(l) : '';
}

// The coming nights for one circuit regular, from everything on the site.
function nightsFor(ctx, r, limit = 4) {
  const rx = new RegExp(r.match, 'i');
  return ctx.content.upcoming(ctx.today()).filter((n) => !n.festival && (rx.test(`${n.title} ${n.label || ''}`) || (r.series && n.series === r.series))).slice(0, limit);
}

function page(ctx, showcase) {
  const s = ctx.content.showcases;
  const circuit = s.circuit.map((r) => ({ ...r, nights: nightsFor(ctx, r) }));
  const desc = `${s.title}: want to play a showcase at TAM, Elephant & Castle? Start on the open mic circuit, meet the host, and register your interest.`;
  return layout(ctx, {
    title: s.title, path: PATH, description: desc, scripts: ['/js/showcases.js'], og: '/img/og.jpg',
    jsonLd: { '@context': 'https://schema.org', '@type': 'EventSeries', name: s.title, description: desc, url: `${ctx.cfg.siteUrl}${PATH}`,
      organizer: { '@type': 'Organization', name: 'TAM, Temple of Art and Music', url: ctx.cfg.siteUrl } },
    body: html`<section class="hero sc-hero"><div class="wrap">
  <div class="sc-spot" aria-hidden="true"></div>
  <div class="label">${s.kicker}</div>
  <h1 class="chrome gold">${s.title}</h1>
  <p class="lede">${s.lede}</p>
  <div class="ctas"><a class="btn hot" href="#circuit">Find an open night</a><a class="btn ghost" href="#register">Register your interest</a></div>
</div></section>
${thisWeek(ctx, showcase)}
<section class="section"><div class="wrap"><div class="head"><h2 class="chrome">How to get a showcase</h2></div>
  <ol class="sc-steps">${s.steps.map((st, i) => html`<li><span class="sc-n">${i + 1}</span><h3>${st.title}</h3><p>${st.text}</p></li>`)}</ol></div></section>
<section class="section" id="circuit"><div class="wrap"><div class="head"><h2 class="chrome">The open mic circuit</h2><p class="muted">Every showcase artist starts here. Come and play, then tell us you'd like a showcase.</p></div>
  <div class="sc-circuit">${circuit.map((r) => html`<article class="sc-night">
    <div class="label">${r.when}</div><h3>${r.name}</h3>${r.host ? html`<p class="sc-host">Hosted by <b>${r.host}</b></p>` : ''}<p>${r.for}</p>
    ${r.nights.length ? html`<ul class="plain sc-dates">${r.nights.map((n) => html`<li><a href="${r.link || nightHref(n)}">${when(n)}</a> <span class="muted">${n.timesTbc ? '' : times(n)}</span></li>`)}</ul>`
      : html`<p class="small muted">New dates are announced on <a href="/whats-on">What’s on</a>.</p>`}
  </article>`)}</div></div></section>
<section class="section" id="register"><div class="wrap narrow">
  <form class="formbox sc-form" id="sc-form" novalidate>
    <div class="label">The call-out</div><h2 class="chrome gold">Register your interest</h2>
    <p>Tell us about your act. The best way to a showcase is to play an open night first, so tell us which one you’ve played or are coming to.</p>
    <div class="fields">
      <label class="field"><span>Your name</span><input name="name" maxlength="80" required autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" maxlength="200" required autocomplete="email"></label>
      <label class="field"><span>Act or band name</span><input name="act" maxlength="80"></label>
      <label class="field"><span>What you play</span><input name="style" maxlength="120" placeholder="e.g. soul trio, acoustic singer-songwriter, blues band"></label>
      <label class="field full"><span>Links to your music</span><input name="links" maxlength="300" placeholder="Instagram, Spotify, YouTube, SoundCloud…"></label>
      <label class="field full"><span>Your open night</span><select name="circuit" required><option value="">Choose…</option>
        ${s.circuit.map((r) => html`<option>I’ve played ${r.name}</option>`)}${s.circuit.map((r) => html`<option>I’m coming to ${r.name}</option>`)}<option>Not yet: tell me which to come to</option></select></label>
      <label class="field full"><span>Anything else</span><textarea name="message" maxlength="1200" rows="3" placeholder="How many of you, what you’d like to play, when you’re free"></textarea></label>
    </div>
    <button class="btn hot" type="submit">Send</button><p class="err" role="status" aria-live="polite"></p>
  </form>
</div></section>`,
  });
}

// Staff: who's in this week's showcase, in running order.
function manage(ctx) {
  return layout(ctx, {
    title: 'Sunday Showcase: line-up', path: `${PATH}/manage`, noindex: true, ambient: null, scripts: ['/js/showcases-manage.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap narrow">
    <div class="label">TAM back office</div><h1 class="chrome gold">Sunday Showcase line-up</h1>
    <p><a class="btn ghost small" href="${PATH}#this-sunday" target="_blank" rel="noopener">See the tree ↗</a> <a class="btn ghost small" href="/shows">Shows</a></p>
    <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Sign in at <a href="/shows">/shows</a> with your work email, then come back here.</p></div>
    <div id="sc-manage" hidden></div></div></section>`,
  });
}

export function routes(r, ctx, showcase) {
  if (!ctx.content.showcases) return;
  r.get(PATH, (req, res) => respond(res, page(ctx, showcase)));
  r.get(`${PATH}/manage`, (req, res) => respond(res, manage(ctx)));
  r.get('/showcases', (req, res) => redirect(res, PATH, 301));
}
