// Coloured vinyl for every artist, event and film.
//
// Each name is pressed once, deterministically: the same name always gets the
// same colourway and the same pressing style, so the record works as a
// permanent image until real photography exists.
//
// The colourways are deliberately rare: colours borrowed from minerals,
// deep-sea light, iridescence and astronomy, the kind you have never seen on a
// record but want to own.

// FNV-1a: small, fast, deterministic. Good enough for art, not for security.
export function hash(str) {
  let h = 0x811c9dc5;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// [base, accent 1, accent 2, accent 3], label colour, and a short story.
export const COLOURWAYS = [
  { name: 'Oil Slick', colours: ['#0b1a2a', '#2de1c2', '#8a3ffc', '#f9d342'], label: '#f9d342', note: 'Petrol rainbow on a wet black road.' },
  { name: 'Opal Fire', colours: ['#f3efe6', '#ff6b9a', '#4fd1c5', '#ffb347'], label: '#ff6b9a', note: 'Milk-white opal with fire trapped inside.' },
  { name: 'Bioluminescence', colours: ['#021622', '#00f5d4', '#00bbf9', '#9b5de5'], label: '#00f5d4', note: 'Plankton lighting up a midnight wave.' },
  { name: 'Labradorite', colours: ['#1d2b36', '#3a86ff', '#8ac926', '#ffbe0b'], label: '#3a86ff', note: 'A grey stone that flashes blue and gold when it turns.' },
  { name: 'Abalone', colours: ['#12343b', '#2ec4b6', '#c77dff', '#e0fbfc'], label: '#c77dff', note: 'The inside of a shell, all teal and violet.' },
  { name: 'Blood Moon', colours: ['#2b0504', '#ff4d00', '#b5121b', '#ffb703'], label: '#ffb703', note: 'A total eclipse, copper-red.' },
  { name: 'Cosmic Latte', colours: ['#fff8e7', '#f4d9b0', '#e8b4bc', '#b8d8d8'], label: '#e8b4bc', note: 'The average colour of the universe. Really.' },
  { name: 'Ube Swirl', colours: ['#6c3483', '#c39bd3', '#f5eef8', '#a569bd'], label: '#f5eef8', note: 'Purple yam ice cream, folded twice.' },
  { name: 'Absinthe Haze', colours: ['#0f2d1b', '#b6ff3b', '#7fff00', '#e9ff70'], label: '#e9ff70', note: 'Green fairy smoke in a Paris bar.' },
  { name: 'Sea Glass', colours: ['#cfe8e2', '#8fd3c7', '#5fb3a9', '#e8f6f3'], label: '#5fb3a9', translucent: true, note: 'Bottle glass tumbled soft by the tide.' },
  { name: 'Mars Dust', colours: ['#7a2e12', '#d35400', '#f0a35e', '#3b1a0d'], label: '#f0a35e', note: 'Rust-orange sky at Martian noon.' },
  { name: 'Hummingbird Throat', colours: ['#1b0a24', '#ff2e93', '#12e193', '#ffd166'], label: '#12e193', note: 'Magenta that turns emerald as it moves.' },
  { name: 'Glacier Core', colours: ['#e6fbff', '#9be7ff', '#4cc9f0', '#ffffff'], label: '#4cc9f0', translucent: true, note: 'Ten-thousand-year-old ice, lit from below.' },
  { name: 'Peacock Ore', colours: ['#2b1640', '#ff00a0', '#00c2ff', '#f5b700'], label: '#00c2ff', note: 'Bornite: copper that tarnishes into neon.' },
  { name: 'Aurora', colours: ['#04121f', '#39ff88', '#00d4ff', '#c84bff'], label: '#39ff88', note: 'Northern lights over a black fjord.' },
  { name: 'Lava Lamp', colours: ['#230033', '#ff3d00', '#ff9100', '#ff006e'], label: '#ff9100', note: '1968, slowly melting.' },
  { name: 'Saffron Smoke', colours: ['#ffb000', '#ff7b00', '#fff1b8', '#8a3b00'], label: '#8a3b00', note: 'Gold threads of the rarest spice.' },
  { name: 'Moon Jelly', colours: ['#0b0f2a', '#ff9ff3', '#48dbfb', '#feca57'], label: '#ff9ff3', note: 'A jellyfish drifting through torchlight.' },
  { name: 'Mother of Pearl', colours: ['#f6f1f8', '#d8e2ff', '#ffd6e8', '#d6fff6'], label: '#d8e2ff', note: 'Nacre: every pastel at once.' },
  { name: 'Ammolite', colours: ['#2a1b0e', '#ff3c00', '#00ff9c', '#2979ff'], label: '#00ff9c', note: 'A 70-million-year-old shell that turned to rainbow.' },
  { name: 'Tidepool', colours: ['#0d3b40', '#ff6f59', '#f2c14e', '#43aa8b'], label: '#ff6f59', note: 'Starfish and anemones at low tide.' },
  { name: 'Neon Moss', colours: ['#0e1a0b', '#9cff00', '#2dff96', '#f4ff61'], label: '#9cff00', note: 'Glowing forest floor after rain.' },
  { name: 'Dragonfruit', colours: ['#ff2d87', '#ffffff', '#1b1b1b', '#8fff3b'], label: '#1b1b1b', note: 'Hot pink skin, white flesh, black seeds.' },
  { name: 'Nebula', colours: ['#0a0420', '#ff4ecd', '#5e60ce', '#48bfe3'], label: '#ff4ecd', note: 'A star nursery, 7,000 light years out.' },
];

export const PRESSINGS = ['Marble', 'Splatter', 'Galaxy', 'Colour-in-Colour', 'Split', 'Pinwheel', 'Smoke'];

function rng(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const rad = (d) => (d * Math.PI) / 180;
const pt = (deg, r) => `${(r * Math.cos(rad(deg))).toFixed(2)} ${(r * Math.sin(rad(deg))).toFixed(2)}`;
const wedge = (from, to, r = 100) => `M0 0 L${pt(from, r)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(to, r)}Z`;

/** Which record a name gets: colourway + pressing style. */
export function pressing(name) {
  // FNV's low bits cluster for similar names; mix them (murmur3 finaliser).
  let h = hash(name);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16; h >>>= 0;
  const colourway = COLOURWAYS[h % COLOURWAYS.length];
  const style = PRESSINGS[(h >>> 8) % PRESSINGS.length];
  return { colourway, style, title: `${colourway.name} ${style}`, seed: h };
}

function pattern(style, [, a, b, c], rand, id) {
  const pick = () => [a, b, c][Math.floor(rand() * 3)];
  switch (style) {
    case 'Marble': {
      const bands = [];
      for (let i = 0; i < 9; i++) {
        bands.push(`<ellipse cx="${(rand() * 160 - 80).toFixed(1)}" cy="${(rand() * 160 - 80).toFixed(1)}" rx="${(30 + rand() * 70).toFixed(1)}" ry="${(6 + rand() * 18).toFixed(1)}" transform="rotate(${Math.floor(rand() * 180)})" fill="${pick()}" opacity="${(0.55 + rand() * 0.45).toFixed(2)}"/>`);
      }
      return `<g filter="url(#${id}m)">${bands.join('')}</g>`;
    }
    case 'Splatter': {
      const dots = [];
      for (let i = 0; i < 70; i++) {
        const r = Math.sqrt(rand()) * 98;
        const t = rand() * 360;
        const size = rand() < 0.15 ? 3 + rand() * 6 : 0.6 + rand() * 2.6;
        dots.push(`<circle cx="${(r * Math.cos(rad(t))).toFixed(1)}" cy="${(r * Math.sin(rad(t))).toFixed(1)}" r="${size.toFixed(2)}" fill="${pick()}"/>`);
      }
      return `<g filter="url(#${id}d)">${dots.join('')}</g>`;
    }
    case 'Galaxy': {
      const stars = [];
      for (let i = 0; i < 60; i++) {
        stars.push(`<circle cx="${(rand() * 200 - 100).toFixed(1)}" cy="${(rand() * 200 - 100).toFixed(1)}" r="${(0.3 + rand() * 0.9).toFixed(2)}" fill="#fff" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`);
      }
      return `<g filter="url(#${id}s)">`
        + `<ellipse cx="${(rand() * 60 - 30).toFixed(1)}" cy="${(rand() * 60 - 30).toFixed(1)}" rx="70" ry="34" transform="rotate(${Math.floor(rand() * 180)})" fill="${a}" opacity=".85"/>`
        + `<ellipse cx="${(rand() * 80 - 40).toFixed(1)}" cy="${(rand() * 80 - 40).toFixed(1)}" rx="46" ry="26" transform="rotate(${Math.floor(rand() * 180)})" fill="${b}" opacity=".8"/>`
        + `<circle cx="${(rand() * 60 - 30).toFixed(1)}" cy="${(rand() * 60 - 30).toFixed(1)}" r="22" fill="${c}" opacity=".6"/></g>`
        + stars.join('');
    }
    case 'Colour-in-Colour':
      return `<circle r="64" fill="${a}" filter="url(#${id}s)"/><circle r="48" fill="${b}" opacity=".7" filter="url(#${id}s)"/>`;
    case 'Split': {
      const turn = Math.floor(rand() * 360);
      return rand() < 0.5
        ? `<path d="${wedge(turn, turn + 180)}" fill="${a}"/>`
        : `<path d="${wedge(turn, turn + 120)}" fill="${a}"/><path d="${wedge(turn + 120, turn + 240)}" fill="${b}"/>`;
    }
    case 'Pinwheel': {
      const n = rand() < 0.5 ? 8 : 12;
      const turn = rand() * 360;
      const step = 360 / n;
      let out = '';
      for (let i = 0; i < n; i += 2) out += `<path d="${wedge(turn + i * step, turn + (i + 1) * step)}" fill="${i % 4 ? b : a}"/>`;
      return `<g filter="url(#${id}m)">${out}</g>`;
    }
    case 'Smoke':
    default: {
      const clouds = [];
      for (let i = 0; i < 6; i++) {
        clouds.push(`<circle cx="${(rand() * 140 - 70).toFixed(1)}" cy="${(rand() * 140 - 70).toFixed(1)}" r="${(18 + rand() * 30).toFixed(1)}" fill="${pick()}" opacity="${(0.5 + rand() * 0.4).toFixed(2)}"/>`);
      }
      return `<g filter="url(#${id}m)"><g filter="url(#${id}s)">${clouds.join('')}</g></g>`;
    }
  }
}

const initials = (name) => String(name).split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

// Dark or light text for the label, whichever reads better.
const ink = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#1a120a' : '#fdf6ec';
};

/**
 * Press a coloured vinyl record for a name.
 * Same name in, same record out.
 */
export function vinyl(name, { size = 240, label = true, legend = false } = {}) {
  const p = pressing(name);
  const { colours, translucent } = p.colourway;
  const [base] = colours;
  const rand = rng(p.seed);
  const id = `v${p.seed.toString(36)}`;
  const shine = Math.floor(rand() * 360);

  // Grooves: fine rings, with a few wider gaps between tracks.
  const tracks = new Set(Array.from({ length: 3 + Math.floor(rand() * 4) }, () => 40 + Math.floor(rand() * 26) * 2));
  let grooves = '';
  for (let r = 37; r <= 97; r += 2) {
    const gap = tracks.has(r);
    grooves += `<circle r="${r}" stroke-width="${gap ? 1.4 : 0.45}" opacity="${gap ? 0.45 : (0.1 + rand() * 0.14).toFixed(2)}"/>`;
  }

  // Legend Edition: cult legends get a gold-foil label and a gold rim.
  const labelColour = legend ? `url(#${id}g)` : p.colourway.label;
  const labelInk = legend ? '#2a1a06' : ink(p.colourway.label);
  const caption = label
    ? `<text class="tam-art-label" y="114" text-anchor="middle">${esc(String(name).toUpperCase().slice(0, 28))}</text>`
      + `<text class="tam-art-colourway" y="124" text-anchor="middle">${esc(p.title.toUpperCase())}${legend ? ' · LEGEND EDITION' : ''}</text>`
    : '';

  return `<svg class="tam-art tam-vinyl" viewBox="-104 -104 208 ${label ? 234 : 208}" width="${size}" height="${size}" role="img" aria-label="${esc(name)}: ${esc(p.title)} vinyl${legend ? ', Legend Edition' : ''}">`
    + '<defs>'
    + `<clipPath id="${id}c"><circle r="100"/></clipPath>`
    + `<filter id="${id}m" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="3" seed="${p.seed % 997}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="70" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".9"/></filter>`
    + `<filter id="${id}s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>`
    + `<filter id="${id}d" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".2" numOctaves="1" seed="${p.seed % 991}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3"/></filter>`
    + `<radialGradient id="${id}b"><stop offset=".3" stop-color="${base}"/><stop offset="1" stop-color="${base}" stop-opacity="${translucent ? 0.7 : 1}"/></radialGradient>`
    + `<linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + (legend ? `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe3a1"/><stop offset=".45" stop-color="#d4a24c"/><stop offset=".55" stop-color="#b8862f"/><stop offset="1" stop-color="#f1cf7a"/></linearGradient>` : '')
    + '</defs>'
    // The disc spins (on hover, see site.css); the light on it stays put.
    + '<g class="tam-disc">'
    + `<g clip-path="url(#${id}c)">`
    + `<circle r="100" fill="url(#${id}b)"/>`
    + pattern(p.style, colours, rand, id)
    + `<g fill="none" stroke="#000">${grooves}</g>`
    + '</g>'
    + '<circle r="99.5" fill="none" stroke="#fff" stroke-opacity=".18"/>'
    + `<circle r="33" fill="${labelColour}"/>`
    + '<circle r="33" fill="none" stroke="#000" stroke-opacity=".25"/>'
    + `<circle r="28" fill="none" stroke="${labelInk}" stroke-opacity=".25" stroke-width=".5"/>`
    + `<text class="tam-art-initials" y="-9" text-anchor="middle" fill="${labelInk}">${esc(initials(name))}</text>`
    + `<text class="tam-art-side" y="19" text-anchor="middle" fill="${labelInk}">${legend ? 'LEGEND EDITION' : 'SIDE A · 33⅓'}</text>`
    + '<circle r="2.6" fill="#0b0907"/>'
    + '</g>'
    + (legend ? '<circle r="101.5" fill="none" stroke="#e6b45c" stroke-width="1.6" opacity=".9"/>' : '')
    // Light catching the grooves on two opposite sides, like a real record.
    + `<g clip-path="url(#${id}c)" transform="rotate(${shine})"><path d="${wedge(-12, 12)}" fill="url(#${id}h)"/><path d="${wedge(168, 192)}" fill="url(#${id}h)" opacity=".7"/></g>`
    + caption
    + '</svg>';
}
