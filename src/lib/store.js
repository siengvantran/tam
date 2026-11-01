// First-party data: one JSON file of collections in DATA_DIR, plus uploaded
// images. Writes are atomic (temp file + rename) and run one at a time, so a
// crash never leaves a half-written file. Swap for Postgres when it outgrows this.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';

export const COLLECTIONS = [
  'bookings', 'tables', 'pins', 'cards', 'sponsors', 'orders', 'follows',
  'raffleSales', 'raffleDraws', 'visits', 'mailings', 'demand',
];

export async function openStore(dir) {
  const file = path.join(dir, 'db.json');
  const uploads = path.join(dir, 'uploads');
  await fs.mkdir(uploads, { recursive: true });

  let db = {};
  if (fss.existsSync(file)) db = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
  if (!db.meta || typeof db.meta !== 'object') db.meta = {};

  let chain = Promise.resolve();
  let dirty = false;

  function save() {
    dirty = true;
    chain = chain.then(async () => {
      if (!dirty) return;
      dirty = false;
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db));
      await fs.rename(tmp, file);
    }).catch((e) => console.error(`Saving data failed: ${e.message}`));
    return chain;
  }

  // Images arrive as data: URLs already shrunk in the browser.
  async function saveImage(dataUrl, name, { maxKB = 500, what = 'Images' } = {}) {
    if (!dataUrl) return '';
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!m) throw Object.assign(new Error(`${what} must be PNG, JPG or WebP.`), { status: 400 });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > maxKB * 1024) throw Object.assign(new Error(`${what} must be under ${maxKB} KB.`), { status: 400 });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const fileName = `${name.replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
    await fs.writeFile(path.join(uploads, fileName), buf);
    return `/uploads/${fileName}`;
  }

  return { db, save, flush: () => chain, saveImage, uploads, file };
}
