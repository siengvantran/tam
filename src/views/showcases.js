// TAM Sunday Showcases: a call-out for artists who want to play a future
// showcase. The way in is TAM's open mic circuit: come to an open night, meet
// the host, then register your interest (it lands in /admin as an enquiry,
// kind "perform", and is emailed to the box office). Words and the circuit
// are in content/showcases.json; the dates come live from the listings.

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout, when, times, nightHref } from './layout.js';

const PATH = '/sunday-showcases';

// The coming nights for one circuit regular, from everything on the site.
function nightsFor(ctx, r, limit = 4) {
  const rx = new RegExp(r.match, 'i');
  return ctx.content.upcoming(ctx.today()).filter((n) => !n.festival && (rx.test(`${n.title} ${n.label || ''}`) || (r.series && n.series === r.series))).slice(0, limit);
}

function page(ctx) {
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

export function routes(r, ctx) {
  if (!ctx.content.showcases) return;
  r.get(PATH, (req, res) => respond(res, page(ctx)));
  r.get('/showcases', (req, res) => redirect(res, PATH, 301));
}
