// Brand assets.
//
// The TAM logo is a trademark and is only ever shown as the original artwork
// (public/img/tam-*.png, cut from tam-logo-original.jpg by
// scripts/extract_logo.py). Nothing here redraws, recolours or distorts it.
//
// Everything generative lives *around* the logo, never in it:
//   - artwork(): a record-sleeve image for each artist, event and film,
//   - archiveRings(): one ring per year of TAM around the untouched mark,
//   - daypart(): drives the halo and background colour by London time.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const LOGO = {
  // The full logo: mark, "Temple of Art and Music" arc and TAM wordmark.
  full: { src: '/img/tam-logo-640.png', src2x: '/img/tam-logo.png', w: 1060, h: 1116 },
  // The circular mark alone.
  mark: { src: '/img/tam-mark-96.png', src2x: '/img/tam-mark.png', w: 512, h: 512 },
  // The TAM wordmark alone.
  wordmark: { src: '/img/tam-wordmark-160.png', src2x: '/img/tam-wordmark.png', w: 442, h: 109 },
};

export function logo(variant = 'full', { width, cls = '', alt = 'TAM — Temple of Art and Music', eager = false } = {}) {
  const l = LOGO[variant];
  const height = Math.round((width * l.h) / l.w);
  return `<img class="tam-logo tam-logo-${variant} ${esc(cls)}" src="${l.src}" srcset="${l.src} 1x, ${l.src2x} 2x" width="${width}" height="${height}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

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

// Label colours by genre, all within the TAM gold-on-black world.
const GENRE_TONES = {
  blues: ['#7fa6cf', '#2b3a52'],
  jazz: ['#e9c77f', '#5a3b1c'],
  soul: ['#e8915f', '#5a2216'],
  folk: ['#cdbb7c', '#3b3420'],
  electronic: ['#86d6c0', '#173238'],
  rock: ['#d9704a', '#2b1510'],
  'hip-hop': ['#f0c94f', '#2a1c0c'],
};
const DEFAULT_TONES = [['#e6a75a', '#4a2c14'], ['#d98a5f', '#3d1d12'], ['#c9a46a', '#2e2412'], ['#f0b768', '#3a2410']];

const initials = (name) => String(name).split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

/**
 * Generative record artwork for anything with a name. The grooves encode the
 * name, like a record's run-out groove, so the same name always gives the same
 * record. Used until real photography exists. Deliberately not the TAM mark.
 */
export function artwork(name, { genre, size = 240, label = true } = {}) {
  const h = hash(name);
  const rand = rng(h);
  const [hi, lo] = GENRE_TONES[String(genre || '').toLowerCase()] || DEFAULT_TONES[h % DEFAULT_TONES.length];
  const id = `r${h.toString(36)}`;
  const sheen = Math.floor(rand() * 360);

  const grooves = [];
  for (let r = 34; r <= 96; r += 2.2) {
    const segs = [];
    const n = 2 + Math.floor(rand() * 6);
    for (let j = 0; j < n; j++) segs.push((4 + rand() * 60).toFixed(1), (1 + rand() * 6).toFixed(1));
    grooves.push(`<circle r="${r.toFixed(1)}" stroke-dasharray="${segs.join(' ')}" transform="rotate(${Math.floor(rand() * 360)})" opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`);
  }
  const caption = label ? `<text class="tam-art-label" y="114" text-anchor="middle">${esc(String(name).toUpperCase().slice(0, 28))}</text>` : '';
  return `<svg class="tam-art" viewBox="-104 -104 208 ${label ? 228 : 208}" width="${size}" height="${size}" role="img" aria-label="Record artwork for ${esc(name)}">`
    + `<defs><radialGradient id="${id}l"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></radialGradient>`
    + `<linearGradient id="${id}s" gradientTransform="rotate(${sheen} .5 .5)"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#ffe2b0" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
    + '<circle r="100" fill="#0d0a08" stroke="#2a2018"/>'
    + `<g fill="none" stroke="${hi}" stroke-width=".7">${grooves.join('')}</g>`
    + `<circle r="100" fill="url(#${id}s)"/>`
    + `<circle r="30" fill="url(#${id}l)"/>`
    + `<text class="tam-art-initials" y="6" text-anchor="middle" fill="${lo}">${esc(initials(name))}</text>`
    + '<circle r="2.4" fill="#0d0a08"/>'
    + caption
    + '</svg>';
}

/**
 * "Six years, six rings": one ring per year of TAM around the original mark.
 * Each ring's length is how much of that year is in the archive.
 */
export function archiveRings(years, { size = 420 } = {}) {
  const max = Math.max(1, ...years.map((y) => y.count));
  const arc = (from, to, r) => {
    const rad = (d) => (d * Math.PI) / 180;
    const p = (d) => `${(r * Math.cos(rad(d))).toFixed(2)} ${(r * Math.sin(rad(d))).toFixed(2)}`;
    return `M${p(from)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
  };
  const rings = years.map((y, i) => {
    const r = 108 + i * 8;
    const sweep = Math.max(6, (y.count / max) * 350);
    return `<circle r="${r}" fill="none" stroke="#3a2e22" stroke-width="1" opacity=".7"/>`
      + `<path d="${arc(-90, -90 + sweep, r)}" fill="none" stroke="url(#arch)" stroke-width="4" stroke-linecap="round"><title>${esc(y.year)}: ${y.count} archived</title></path>`
      + `<text class="tam-ring-year" x="-5" y="${(-r + 2).toFixed(1)}" text-anchor="end">${esc(y.year)}</text>`;
  }).join('');
  const outer = 108 + years.length * 8 + 6;
  return `<svg class="tam-archive" viewBox="${-outer} ${-outer} ${outer * 2} ${outer * 2}" width="${size}" height="${size}" role="img" aria-label="TAM archive by year, around the TAM mark">`
    + '<defs><linearGradient id="arch" gradientUnits="userSpaceOnUse" x1="-150" y1="-150" x2="150" y2="150"><stop offset="0" stop-color="#f6bd6c"/><stop offset="1" stop-color="#8a5a2c"/></linearGradient></defs>'
    + rings
    + `<image href="${LOGO.mark.src2x}" x="-100" y="-100" width="200" height="200"/>`
    + '</svg>';
}
