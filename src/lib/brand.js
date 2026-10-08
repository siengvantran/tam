// Brand assets.
//
// The TAM logo is a trademark and is only ever shown as the original artwork
// (public/img/tam-*.png, cut from tam-logo-original.jpg by
// scripts/extract_logo.py). Nothing here redraws, recolours or distorts it.
//
// Everything generative lives *around* the logo, never in it:
//   - artwork(): a coloured vinyl record for each artist, event and film,
//   - archiveRings(): one ring per year of TAM around the untouched mark,
//   - daypart(): drives the halo and background colour by London time.

import { vinyl } from './vinyl.js';

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

export { hash } from './vinyl.js';

/**
 * Artwork for an artist, event or film: a coloured vinyl record pressed from
 * its name (see vinyl.js). Deliberately not the TAM mark.
 */
export function artwork(name, { size = 240, label = true } = {}) {
  return vinyl(name, { size, label });
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
