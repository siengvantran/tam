// A small QR code encoder (byte mode, error correction level M, versions
// 1–10: up to 213 bytes, plenty for a ticket link), with SVG and PNG output.
// Written for this site so it stays dependency-free. Follows ISO/IEC 18004:
// Reed–Solomon error correction over GF(256), block interleaving, function
// patterns, the eight masks scored with the standard penalty rules, and BCH
// format and version information.

const zlib = require('zlib');

// Level M, versions 1–10: [ecc codewords per block, [blocks, data codewords per block]...]
const BLOCKS = [
  null,
  [10, [1, 16]],
  [16, [1, 28]],
  [26, [1, 44]],
  [18, [2, 32]],
  [24, [2, 43]],
  [16, [4, 27]],
  [18, [4, 31]],
  [22, [2, 38], [2, 39]],
  [22, [3, 36], [2, 37]],
  [26, [4, 43], [1, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const ECL_M_FORMAT_BITS = 0; // M = 00

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function dataCodewords(v) {
  return BLOCKS[v].slice(1).reduce((n, [count, len]) => n + count * len, 0);
}

// The data bits for byte mode, padded to the version's capacity.
function encodeData(bytes, v) {
  const cap = dataCodewords(v) * 8;
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < cap / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

// Splits data into blocks, adds error correction and interleaves them.
function withEcc(data, v) {
  const [eccLen, ...groups] = BLOCKS[v];
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  let k = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const dat = data.slice(k, k + len);
      k += len;
      blocks.push({ dat, ecc: rsRemainder(dat, divisor) });
    }
  }
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.dat.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.dat.length) out.push(b.dat[i]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(v, codewords, mask) {
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };

  // timing patterns
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finder patterns with separators
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  // alignment patterns
  const pos = ALIGN[v], last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // format information (with the dark module)
  const fdata = (ECL_M_FORMAT_BITS << 3) | mask;
  let rem = fdata;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fbits = ((fdata << 10) | rem) ^ 0x5412;
  const bit = (val, i) => ((val >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fbits, i));
  set(8, 7, bit(fbits, 6));
  set(8, 8, bit(fbits, 7));
  set(7, 8, bit(fbits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fbits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fbits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fbits, i));
  set(8, size - 8, true);
  // version information (7 and up)
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vbits = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit(vbits, i));
      set(b, a, bit(vbits, i));
    }
  }
  // data, in the zigzag order, masked
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        let dark = false;
        if (i < codewords.length * 8) dark = bit(codewords[i >>> 3], 7 - (i & 7));
        i++;
        m[y][x] = dark !== MASKS[mask](x, y);
      }
    }
  }
  return m;
}

// The standard penalty score: runs, 2×2 blocks, finder-like patterns, balance.
function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    const s = line.map((d) => (d ? '1' : '0')).join('');
    for (const pat of ['10111010000', '00001011101']) {
      for (let k = s.indexOf(pat); k !== -1; k = s.indexOf(pat, k + 1)) score += 40;
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }
  const dark = m.reduce((n, row) => n + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

// Returns the QR code as a square boolean matrix (true = dark), best mask.
function encode(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(v) * 8) v++;
  if (v > 10) throw new Error('Too long for a QR code here.');
  const codewords = withEcc(encodeData(bytes, v), v);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, codewords, mask);
    const s = penalty(m);
    if (s < bestScore) { best = m; bestScore = s; }
  }
  return best;
}

function toSvg(text, { margin = 4, dark = '#000', light = '#fff' } = {}) {
  const m = encode(text), n = m.length + margin * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + margin} ${y + margin}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

// PNG (8-bit greyscale) for email clients, which don't show SVG.
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function toPng(text, { scale = 8, margin = 4 } = {}) {
  const m = encode(text), n = (m.length + margin * 2) * scale;
  const raw = Buffer.alloc((n + 1) * n, 255);
  for (let y = 0; y < n; y++) {
    raw[y * (n + 1)] = 0; // filter: none
    const my = Math.floor(y / scale) - margin;
    for (let x = 0; x < n; x++) {
      const mx = Math.floor(x / scale) - margin;
      if (my >= 0 && mx >= 0 && my < m.length && mx < m.length && m[my][mx]) raw[y * (n + 1) + 1 + x] = 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { encode, toSvg, toPng };
