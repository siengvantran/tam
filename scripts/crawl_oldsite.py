"""Crawl www.tam.tv (the old Google Sites site) and save every internal page.

    python3 scripts/crawl_oldsite.py /tmp/oldsite.json
    python3 scripts/import_oldsite.py /tmp/oldsite.json

Google Sites image URLs are signed and expire, so images are downloaded during
the crawl (into <output>.images/, named by content hash) and the page records
the hash, not the URL.
"""
import hashlib, json, os, re, sys, time, html as H, urllib.request
from html.parser import HTMLParser

BASE = "https://www.tam.tv"
OUT = sys.argv[1]
IMG_DIR = OUT + ".images"
os.makedirs(IMG_DIR, exist_ok=True)


def download(url):
    """Fetch an image now (its URL expires) and return its content hash."""
    url = re.sub(r"=[a-z][^/=]*$", "", url) + "=w1600"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            data = r.read()
    except Exception as e:
        print("  image failed", e, file=sys.stderr)
        return None
    digest = hashlib.sha1(data).hexdigest()
    path = os.path.join(IMG_DIR, digest)
    if not os.path.exists(path):
        open(path, "wb").write(data)
    return digest
UA = {"User-Agent": "Mozilla/5.0 (compatible; TAM-site-migration/1.0)"}

def fetch(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, BASE + path, ""

class Text(HTMLParser):
    """Collect visible text blocks from the main content, skipping nav/scripts."""
    SKIP = {"script", "style", "noscript", "svg", "nav", "header", "footer"}
    BLOCK = {"p", "h1", "h2", "h3", "h4", "li", "div", "span", "a", "br"}
    def __init__(self):
        super().__init__(); self.depth = 0; self.blocks = []; self.cur = []; self.tag = []
    kind = "p"
    href = None
    def handle_starttag(self, t, a):
        if t in self.SKIP: self.depth += 1
        if t in ("p", "h1", "h2", "h3", "h4", "li", "br"):
            self.flush(); self.kind = "p" if t == "br" else t
        if t == "a":
            self.href = dict(a).get("href")
    def handle_endtag(self, t):
        if t in self.SKIP and self.depth: self.depth -= 1
        if t in ("p", "h1", "h2", "h3", "h4", "li"): self.flush(); self.kind = "p"
        if t == "a": self.href = None
    def handle_data(self, d):
        if not self.depth: self.cur.append(d)
    def flush(self, t=None):
        s = re.sub(r"\s+", " ", "".join(self.cur)).strip()
        if s: self.blocks.append({"type": self.kind, "text": s})
        self.cur = []

def parse(path, doc):
    title = H.unescape((re.findall(r"<title>(.*?)</title>", doc, re.S) or [""])[0]).strip()
    desc = H.unescape((re.findall(r'<meta (?:name|property)="(?:og:)?description" content="([^"]*)"', doc) or [""])[0])
    og_img = (re.findall(r'<meta property="og:image" content="([^"]*)"', doc) or [""])[0]
    body = doc.split('role="main"', 1)[-1] if 'role="main"' in doc else doc
    p = Text(); p.feed(body); p.flush()
    JUNK = ("tabindex=", "Google Sites", "Report abuse", "Page details", "Page updated", "Search this site", "Skip to main", "Skip to navigation", "Embedded Files")
    blocks, seen_text = [], set()
    for b in p.blocks:
        if len(b["text"]) < 2 or any(j in b["text"] for j in JUNK) or b["text"] in seen_text: continue
        seen_text.add(b["text"]); blocks.append(b)
    urls = list(dict.fromkeys(re.findall(r'(https://lh\d-[a-z]+\.googleusercontent\.com/[^"\'\s)=]+)', doc)))
    imgs = [h for h in dict.fromkeys(download(u) for u in urls) if h]
    yt = list(dict.fromkeys(re.findall(r'(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{11})', doc)))
    links = sorted(set(re.findall(r'href="(/[^"#?]*)"', doc)) | set(re.findall(r'href="https://www\.tam\.tv(/[^"#?]*)"', doc)))
    ext = sorted(set(u for u in re.findall(r'href="(https?://[^"]+)"', H.unescape(doc)) if "tam.tv" not in u and "google" not in u and "gstatic" not in u))
    return {"path": path, "title": title, "description": desc, "ogImage": og_img, "blocks": blocks,
            "images": imgs, "youtube": yt, "links": links, "external": ext}

seen, queue, pages = set(), ["/"], []
while queue:
    path = queue.pop(0)
    path = path.rstrip("/") or "/"
    if path in seen: continue
    seen.add(path)
    status, final, doc = fetch(path)
    print(status, path, file=sys.stderr)
    if status != 200: pages.append({"path": path, "status": status}); continue
    page = parse(path, doc); page["status"] = status; pages.append(page)
    for l in page["links"]:
        l = l.rstrip("/") or "/"
        if l not in seen and not l.startswith(("/_", "/u/")): queue.append(l)
    time.sleep(0.3)
json.dump(pages, open(OUT, "w"), indent=1, ensure_ascii=False)
print(len(pages), "pages", file=sys.stderr)
