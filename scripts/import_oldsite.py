"""Import the old www.tam.tv into content/legacy/ so no URL loses its search value.

    python3 scripts/crawl_oldsite.py /tmp/oldsite.json
    python3 scripts/import_oldsite.py /tmp/oldsite.json

Writes:
  content/legacy/pages.json  every old page: path, title, description, text
                             blocks, images, YouTube embeds, outbound links
  content/videos.json        TAM TV's own YouTube videos found on the old site,
                             with titles from YouTube oEmbed
  public/img/archive/        the old site's photos as WebP (max 1000px wide)
"""
import collections
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from import_eventbrite import load_performers, slugify  # noqa: E402

PREFIX = "TAM - Temple of Art and Music - "
TAM_CHANNEL = "TAM TV - Temple Of Art & Music"


def oembed(video_id):
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.load(r)
    except Exception:
        return {}


def save_image(src_dir, digest, out_dir):
    """Convert one downloaded image to WebP; return its public path."""
    name = f"{digest[:16]}.webp"
    dest = out_dir / name
    if not dest.exists():
        im = Image.open(src_dir / digest)
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        if im.width > 1000:
            im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
        im.save(dest, "WEBP", quality=74, method=6)
    return f"/img/archive/{name}"


def main(src):
    pages = [p for p in json.load(open(src, encoding="utf-8")) if p.get("status") == 200]
    src_dir = Path(src + ".images")
    img_out = ROOT / "public" / "img" / "archive"
    img_out.mkdir(parents=True, exist_ok=True)
    # Images on most pages are the old site's header/logo, not content.
    common = {i for i, c in collections.Counter(i for p in pages for i in set(p["images"])).items() if c >= len(pages) * 0.3}

    out = []
    for p in pages:
        title = p["title"].replace(PREFIX, "").strip() or "Temple of Art and Music"
        if p["path"] in ("/", "/home"):
            title = "Temple of Art and Music"
        blocks = [b for b in p["blocks"] if b["text"] not in (title,)]
        # Google Sites tab strips come through as all the headings run together.
        heads = "".join(b["text"] for b in blocks if b["type"].startswith("h"))
        blocks = [b for b in blocks if not (b["type"] == "p" and len(b["text"]) > 12 and b["text"].replace(" ", "") in heads.replace(" ", ""))]
        out.append({
            "path": p["path"],
            "title": title,
            "description": p["description"] if p["description"] and p["description"] != title else "",
            "blocks": blocks,
            "images": [save_image(src_dir, i, img_out) for i in p["images"] if i not in common],
            "youtube": p["youtube"],
            "links": [l for l in p["links"] if l != p["path"]],
            "external": p["external"],
        })
    legacy = ROOT / "content" / "legacy"
    legacy.mkdir(parents=True, exist_ok=True)
    (legacy / "pages.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # TAM TV's own videos become the video library.
    acts = load_performers(ROOT / "scripts" / "sources" / "performers.txt")
    found = collections.OrderedDict()
    for p in pages:
        for v in p["youtube"]:
            found.setdefault(v, []).append(p["path"])
    videos = []
    for vid, paths in found.items():
        meta = oembed(vid)
        if meta.get("author_name") != TAM_CHANNEL:
            continue
        title = re.sub(r"\s+", " ", meta.get("title", "")).strip()
        videos.append({
            "slug": slugify(title)[:80].rstrip("-"),
            "youtubeId": vid,
            "title": title,
            "kind": "episode" if "Globetrotting" in title else "performance",
            "show": "globetrotting-with-gillespie" if "Globetrotting" in title else None,
            # Globetrotting With Gillespie is Dana Gillespie's show.
            "artists": list(dict.fromkeys((["danagillespie"] if "Globetrotting" in title else [])
                                          + [a["slug"] for a in acts if any(rx.search(title) for rx in a["rx"])])),
            "pages": paths,
        })
    (ROOT / "content" / "videos.json").write_text(json.dumps(videos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(out)} legacy pages, {len(videos)} TAM TV videos")


if __name__ == "__main__":
    main(sys.argv[1])
