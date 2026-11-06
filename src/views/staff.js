// Staff pages: thin shells, the work happens in /js/admin.js, /js/door.js, /js/raffle.js.

import { html } from './html.js';
import { html as respond } from '../lib/http.js';
import { layout } from './layout.js';

const shell = (ctx, title, path, script, body) => layout(ctx, { title, path, noindex: true, ambient: null, scripts: [script], bodyClass: 'staff', body });

const signIn = (what) => html`<form class="formbox" id="staff-login" hidden>
  <h3>${what}</h3><label class="field"><span>Code</span><input name="token" type="password" autocomplete="current-password" required></label>
  <button class="btn hot" type="submit">Sign in</button><p class="err" role="status" aria-live="polite"></p></form>`;

// Sign in with an emailed link (named staff), or the admin code.
const linkSignIn = (next) => html`<div class="formbox" id="team-login" hidden>
  <h3>Sign in</h3><p class="small muted">Type your work email and we’ll send you a one-tap sign-in link.</p>
  <form id="team-link"><input type="hidden" name="next" value="${next}"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
  <button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form>
  <details class="small"><summary>Use the admin code instead</summary><form id="team-code"><label class="field"><span>Code</span><input name="token" type="password" autocomplete="current-password" required></label>
  <button class="btn ghost" type="submit">Sign in</button><p class="err" role="status" aria-live="polite"></p></form></details></div>`;

export function routes(r, ctx) {
  r.get('/shows', (req, res) => respond(res, shell(ctx, 'Shows', '/shows', '/js/shows.js', html`<section class="section shows-page"><div class="wrap wide">
    <div class="shows-top"><div><div class="label">TAM back office</div><h1 class="chrome gold">Shows</h1></div><div id="shows-who" class="small muted"></div></div>
    ${linkSignIn('/shows')}<div id="shows" hidden></div></div></section>`)));
  r.get('/staff/sign-in', (req, res) => respond(res, shell(ctx, 'Sign in', '/staff/sign-in', '/js/shows.js', html`<section class="section"><div class="wrap narrow">
    <h1 class="chrome gold">Sign in to TAM</h1><div class="formbox" id="use-link"><p>Press the button to finish signing in on this device.</p>
    <button class="btn hot" type="button" id="use-link-btn">Sign in</button><p class="err" role="status" aria-live="polite"></p></div></div></section>`)));
  r.get('/admin', (req, res) => respond(res, shell(ctx, 'Admin', '/admin', '/js/admin.js', html`<section class="section"><div class="wrap">
    <h1 class="chrome gold">Admin</h1>${signIn('Admin sign-in')}<div id="admin" hidden></div></div></section>`)));
  r.get('/door', (req, res) => respond(res, shell(ctx, 'Door', '/door', '/js/door.js', html`<section class="section"><div class="wrap narrow">
    <h1 class="chrome gold">Door</h1>${signIn('Door sign-in')}
    <div id="door" hidden>
      <p class="label" id="door-tonight"></p><p class="big-count"><b id="door-in">0</b> in of <span id="door-expected">0</span></p>
      <form class="formbox" id="door-lookup"><label class="field"><span>Reference</span><input name="ref" autocapitalize="characters" placeholder="TAM-XXXXXX"></label><button class="btn hot" type="submit">Find</button>
      <button class="btn ghost" type="button" id="door-scan" hidden>Scan a QR code</button><video id="door-video" playsinline hidden></video></form>
      <div id="door-panel" class="door-panel"></div>
      <p class="small muted">Tip: scan tickets with the phone's camera app. While you're signed in here, the ticket opens with the check-in buttons.</p>
    </div></div></section>`)));
  r.get('/raffle-desk', (req, res) => respond(res, shell(ctx, 'Raffle desk', '/raffle-desk', '/js/raffle.js', html`<section class="section"><div class="wrap narrow">
    <h1 class="chrome gold">Raffle desk</h1>${signIn('Door sign-in')}
    <div id="raffle" hidden>
      <p class="label" id="r-night"></p><p class="big-count"><b id="r-sold">0</b> tickets · <span id="r-takings">£0</span></p>
      <form class="formbox" id="r-sell"><div class="fields"><label class="field"><span>How many</span><input name="count" type="number" min="1" value="3" inputmode="numeric"></label>
        <label class="field"><span>Name (optional)</span><input name="name" maxlength="60"></label></div>
        <p id="r-price" class="price"></p><div class="row-btn"><button class="btn hot" name="method" value="cash">Cash</button><button class="btn hot" name="method" value="card">Card</button></div>
        <p class="err" role="status" aria-live="polite"></p></form>
      <div id="r-last" class="ok" hidden></div>
      <h2>Recent sales</h2><ul class="plain" id="r-recent"></ul>
      <form class="formbox" id="r-draw"><label class="field"><span>Prize</span><input name="prize" maxlength="120" required></label><button class="btn hot" type="submit">Draw a winner</button><p class="err" role="status"></p></form>
      <ul class="plain" id="r-draws"></ul>
    </div></div></section>`)));
}
