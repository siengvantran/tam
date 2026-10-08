// The TAM mark, rebuilt as code.
//
// The original logo is a circle split by an X into four letters: T at the top,
// A at the bottom and an M on each side. Here each letter owns one quadrant of
// the ring, so the four pieces can move independently:
//
//   T  = top arc (the crossbar) + vertical stem
//   M  = side arc + chevron (an M turned on its side), left and right
//   A  = chevron pointing up + crossbar
//
// Two things make it "live":
//   - time: the gold light sweeps round with the London clock, the palette
//     changes with the time of day, the lettering ring turns like a minute hand
//     and a dot on the rim ticks the seconds (see public/js/tam.js);
//   - generation: every artist, event and story gets its own deterministic
//     "sigil", a variant of the mark seeded from its name.

const R = 74; // ring radius
const W = 14; // stroke weight

const rad = (deg) => (deg * Math.PI) / 180;
const pt = (deg, r = R) => [+(r * Math.cos(rad(deg))).toFixed(2), +(r * Math.sin(rad(deg))).toFixed(2)];

function arc(from, to, r = R) {
  const [x1, y1] = pt(from, r);
  const [x2, y2] = pt(to, r);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

// Angles in SVG space (0° = east, 90° = south). The X-shaped gaps sit on the diagonals.
const GAP = 5;
// Chevron arms stop just inside the ring so their square ends hide under it.
const [rt, rb] = [pt(-45 + GAP, R - 3), pt(45 - GAP, R - 3)];
const [lt, lb] = [pt(-135 - GAP, R - 3), pt(135 + GAP, R - 3)];
const aL = pt(135 - GAP, R + 4);
const aR = pt(45 + GAP, R + 4);

export const PIECES = {
  t: `${arc(-135 + GAP, -45 - GAP)} M0 ${-R} L0 -8`,
  mr: `${arc(-45 + GAP, 45 - GAP)} M${rt[0]} ${rt[1]} L20 0 L${rb[0]} ${rb[1]}`,
  ml: `${arc(135 + GAP, 225 - GAP)} M${lt[0]} ${lt[1]} L-20 0 L${lb[0]} ${lb[1]}`,
  a: `M${aL[0]} ${aL[1]} L0 16 L${aR[0]} ${aR[1]} M-31 44 L31 44`,
};

export const PALETTES = {
  dawn: ['#f7cfa4', '#dc9273', '#7d4b3d'],
  day: ['#ffd88f', '#e6a75a', '#8a5a2c'],
  dusk: ['#f4a95c', '#c4733a', '#5e3420'],
  night: ['#eebd78', '#a56f3c', '#3f2717'],
};

// Genre tones for sigils: still TAM gold, but each genre leans a little.
const GENRE_PALETTES = {
  blues: ['#9fc3e8', '#c99a5b', '#3d2a4a'],
  jazz: ['#f0d9a0', '#b9824a', '#4a2c1a'],
  soul: ['#f7b98a', '#c4643f', '#4d1f17'],
  folk: ['#e9dca0', '#a8894c', '#3b3420'],
  electronic: ['#b7f0e0', '#c9a15c', '#1f2f3a'],
  rock: ['#f2c27a', '#b5552f', '#2b1510'],
  'hip-hop': ['#f5d36b', '#d07a2e', '#2a1c0c'],
};

export function daypart(hour) {
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

export function londonTime(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, Number(p.value)]),
  );
  return { hour: parts.hour, minute: parts.minute, second: parts.second };
}

// The light makes one full turn every 24h: noon light falls from above.
export function lightAngle({ hour, minute }) {
  return +((((hour + minute / 60) / 24) * 360 + 90) % 360).toFixed(2);
}

// FNV-1a: small, fast, deterministic. Good enough for art, not for security.
export function hash(str) {
  let h = 0x811c9dc5;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function gradient(id, colors, angle) {
  const [a, b, c] = colors;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-100" y1="0" x2="100" y2="0" gradientTransform="rotate(${angle})">`
    + `<stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
}

function pieces(gradId, { dim = null } = {}) {
  return Object.entries(PIECES).map(([k, d]) =>
    `<path class="tam-piece tam-${k}" d="${d}" stroke="url(#${gradId})"${dim && dim !== k ? ' opacity=".5"' : ''}/>`,
  ).join('');
}

/**
 * The live, time-driven emblem used in the header and hero.
 * Server renders the current London state; public/js/tam.js keeps it moving.
 */
export function liveMark({ id = 'tam', size = 320, date = new Date(), ring = true, title = 'TAM — Temple of Art and Music' } = {}) {
  const t = londonTime(date);
  const part = daypart(t.hour);
  const g = `${id}-g`;
  const ringText = ring
    ? `<path id="${id}-arc" d="M-94 0 A94 94 0 1 1 94 0 A94 94 0 1 1 -94 0" fill="none"/>`
      + `<g class="tam-words" style="transform:rotate(${t.minute * 6}deg)"><text><textPath href="#${id}-arc" startOffset="2%">TEMPLE OF ART AND MUSIC · TEMPLE OF ART AND MUSIC ·</textPath></text></g>`
      + `<g class="tam-tick" style="transform:rotate(${t.second * 6}deg)"><circle cx="0" cy="-84" r="2.6"/></g>`
    : '';
  return `<svg class="tam-mark tam-live" data-live="${id}" data-daypart="${part}" viewBox="-110 -110 220 220" width="${size}" height="${size}" role="img" aria-label="${esc(title)}">`
    + `<title>${esc(title)}</title>`
    + `<defs>${gradient(g, PALETTES[part], lightAngle(t))}`
    + `<filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
    + ringText
    + `<g class="tam-pieces" fill="none" stroke-width="${W}" stroke-linejoin="miter" filter="${part === 'night' ? `url(#${id}-glow)` : ''}">${pieces(g)}</g>`
    + '</svg>';
}

/**
 * A deterministic generative variant of the mark for any named thing.
 * Same name in, same sigil out — so it works as a permanent avatar/poster.
 *   - the light angle comes from the name,
 *   - one letter is "lit" (the others dimmed),
 *   - the outer grooves encode the name like a record's run-out groove,
 *   - genre picks the colour lean.
 */
export function sigil(name, { genre, size = 240, label = true } = {}) {
  const h = hash(name);
  const rand = rng(h);
  const id = `s${h.toString(36)}`;
  const colors = GENRE_PALETTES[String(genre || '').toLowerCase()] || PALETTES[Object.keys(PALETTES)[h % 4]];
  const lit = ['t', 'a', 'ml', 'mr'][h % 4];
  const angle = Math.floor(rand() * 360);

  const grooves = [];
  for (let i = 0; i < 3; i++) {
    const r = 86 + i * 6;
    const segs = [];
    for (let j = 0; j < 6 + Math.floor(rand() * 10); j++) segs.push((2 + rand() * 18).toFixed(1), (2 + rand() * 9).toFixed(1));
    grooves.push(`<circle r="${r}" fill="none" stroke="url(#${id})" stroke-width="${(1 + rand() * 1.6).toFixed(2)}" stroke-dasharray="${segs.join(' ')}" transform="rotate(${Math.floor(rand() * 360)})" opacity="${(0.35 + rand() * 0.5).toFixed(2)}"/>`);
  }
  const initials = label ? `<text class="tam-sigil-label" y="117" text-anchor="middle">${esc(String(name).toUpperCase().slice(0, 28))}</text>` : '';
  return `<svg class="tam-mark tam-sigil" viewBox="-110 -110 220 ${label ? 234 : 220}" width="${size}" height="${size}" role="img" aria-label="Generative TAM sigil for ${esc(name)}">`
    + `<defs>${gradient(id, colors, angle)}</defs>`
    + grooves.join('')
    + `<g fill="none" stroke-width="${W}" stroke-linejoin="miter" transform="scale(.92)">${pieces(id, { dim: lit })}</g>`
    + initials
    + '</svg>';
}

/**
 * "Six years, six rings": the archive as concentric arcs around the mark.
 * Each year is one ring; its length is how much of that year is archived.
 */
export function archiveRings(years, { size = 420 } = {}) {
  const max = Math.max(1, ...years.map((y) => y.count));
  const id = 'arch';
  const rings = years.map((y, i) => {
    const r = 82 + i * 7;
    const sweep = Math.max(8, (y.count / max) * 350);
    return `<circle r="${r}" fill="none" stroke="#3a2e22" stroke-width="1" opacity=".7"/>`
      + `<path d="${arc(-90, -90 + sweep, r)}" fill="none" stroke="url(#${id})" stroke-width="3.5" stroke-linecap="round"><title>${esc(y.year)}: ${y.count} archived</title></path>`
      + `<text class="tam-ring-year" x="${(pt(-90, r)[0] - 4).toFixed(1)}" y="${(pt(-90, r)[1] + 1.5).toFixed(1)}" text-anchor="end">${esc(y.year)}</text>`;
  }).join('');
  const outer = 82 + years.length * 7 + 8;
  return `<svg class="tam-mark tam-archive" viewBox="${-outer} ${-outer} ${outer * 2} ${outer * 2}" width="${size}" height="${size}" role="img" aria-label="TAM archive by year">`
    + `<defs>${gradient(id, PALETTES.dusk, 30)}</defs>${rings}`
    + `<g fill="none" stroke-width="${W}" stroke-linejoin="miter" transform="scale(.9)">${pieces(id)}</g></svg>`;
}

/** Standalone favicon / social mark. */
export function staticMark({ part = 'dusk', angle = 30, background = true } = {}) {
  const id = 'f';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">`
    + (background ? '<rect x="-100" y="-100" width="200" height="200" fill="#0b0907"/>' : '')
    + `<defs>${gradient(id, PALETTES[part], angle)}</defs>`
    + `<g fill="none" stroke-width="${W}" stroke-linejoin="miter">${pieces(id)}</g></svg>`;
}
