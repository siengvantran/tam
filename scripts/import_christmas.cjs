// One-off import of The Best Christmas Ever (christmas.tam.tv, repo
// siengvantran/bestchristmas) into TAM.TV content: artist profiles,
// invitation cards, Dana's stories, Polaroids and the signed-book collection,
// plus the artwork they use. Re-run to refresh:
//
//   node scripts/import_christmas.cjs /path/to/bestchristmas
//
// Image paths move under /img/ (e.g. /dana/x.jpg → /img/dana/x.jpg).

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(process.argv[2] || '../bestchristmas');
const OUT = path.join(__dirname, '..');
const req = (f) => require(path.join(SRC, f));
const img = (p) => (p ? String(p).replace(/^\/(hootenanny|dana|polaroids|books)\//, '/img/$1/') : p);
const write = (f, v) => fs.writeFileSync(path.join(OUT, 'content', f), JSON.stringify(v, null, 2) + '\n');

// Christmas profile id → TAM.TV artist slug (old www.tam.tv URLs kept where they exist)
const SLUG = {
  band: 'bakers-dozen', hugh: 'hugh-baker', matt: 'matt-hootenanny-host', thomas: 'thomas-caulfield',
  queenie: 'queenie-slinger', molly: 'molly-chadwick', haydn: 'haydn-bardoe', ger: 'ger-ohanlon',
  felix: 'felix-cassell', dana: 'danagillespie', gemma: 'gemma-schito',
};
const EVENT = { hoot: 'big-christmas-hootenanny', dana: 'dana-gillespie-live' };

// ----- artists -----
const PROFILES = req('profiles.js');
const artists = Object.entries(PROFILES).map(([id, p]) => ({
  slug: SLUG[id] || id,
  name: p.name,
  role: p.role,
  photo: img(p.photo),
  bio: p.bio || [],
  links: (p.links || []).map(([label, url]) => ({ label, url })),
  legend: id === 'dana' || undefined,
  invite: p.invite || undefined,
}));
write('artists.json', artists);

// ----- invitation cards -----
const ARTISTS = req('artists.js');
const { invites: DANA } = req('dana-invites.js');
const invites = [];
for (const [id, a] of Object.entries(ARTISTS)) {
  invites.push({ id, event: EVENT.hoot, artist: SLUG[id] || id, name: a.name, role: a.role, photo: img(a.photo), line: a.line, preview: `/img/hootenanny/invite/${id}.jpg` });
}
for (const [id, a] of Object.entries(DANA)) {
  invites.push({
    id, event: EVENT.dana, artist: id === 'dana-gemma' ? 'gemma-schito' : 'danagillespie', name: a.name, role: a.role,
    fan: a.fan, photo: img(a.photo), line: a.line, polaroid: a.polaroid || undefined, tag: a.tag || undefined,
    preview: `/img/dana/invite/${id}.jpg`,
  });
}
write('invites.json', invites);

// ----- Dana's stories (the trailer and cards story layer) -----
global.window = {};
require(path.join(SRC, 'public', 'dana-stories.js'));
const themes = global.window.DANA_STORIES.map((t) => ({ ...t, stories: t.stories.map((s) => ({ ...s, photo: img(s.photo) })) }));
write('stories.json', [{ id: 'dana-gillespie', artist: 'danagillespie', title: 'Dana’s stories', source: 'Weren’t Born a Man (Hawksmoor, 2020), its draft I Rest My Case, and What Memories We Make (Hawksmoor, 2026)', themes }]);

// ----- Polaroids -----
const POLAROIDS = JSON.parse(fs.readFileSync(path.join(SRC, 'public', 'polaroids', 'index.json'), 'utf8'));
write('polaroids.json', POLAROIDS.map((p) => ({ ...p, src: img(p.src), thumb: img(p.thumb), owner: 'danagillespie', credit: '© Dana Gillespie' })));

// ----- the 108 Verified Collection (signed books) -----
const F = req('config.js');
write('collections.json', [{
  slug: 'dana-108',
  name: 'Dana’s 108 Verified Collection',
  artist: 'danagillespie',
  size: F.COLLECTION_SIZE,
  maxEach: F.BOOK_MAX_EACH,
  postage: F.BOOK_POSTAGE,
  codePrefix: 'D108',
  blurb: 'Signed copies of Dana Gillespie’s books, each with a limited edition Polaroid bookmark. Every copy is numbered: 108 of each book, with a certificate code anyone can check.',
  items: F.BOOKS.map((b) => ({ ...b, cover: img(b.cover) })),
}]);

// ----- artwork -----
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name), b = path.join(to, f.name);
    if (f.isDirectory()) copyDir(a, b);
    else if (/\.(jpe?g|png|webp)$/i.test(f.name)) fs.copyFileSync(a, b);
  }
}
for (const d of ['hootenanny', 'dana', 'polaroids', 'books']) copyDir(path.join(SRC, 'public', d), path.join(OUT, 'public', 'img', d));
const XMAS = path.join(OUT, 'public', 'img', 'christmas');
fs.mkdirSync(XMAS, { recursive: true });
for (const f of ['shard-tree.png', 'title-lockup.png', 'tam-logo-gold.png', 'og.jpg',
  'shard-pop-0.png', 'shard-pop-1.png', 'shard-pop-2.png', 'shard-pop-3.png',
  'logo-pop-0.jpg', 'logo-pop-1.jpg', 'logo-pop-2.jpg', 'logo-pop-3.jpg']) {
  fs.copyFileSync(path.join(SRC, 'public', f), path.join(XMAS, f));
}
console.log(`Imported ${artists.length} artists, ${invites.length} invites, ${themes.length} story themes, ${POLAROIDS.length} Polaroids.`);
