"""Build TAM's performance archive from Eventbrite.

Input:  a JSON dump of the organiser's events (scripts/fetch_eventbrite.mjs)
        and the curated performer list (scripts/sources/performers.txt).
Output: content/archive/events.json, performers.json, series.json, venues.json

    node scripts/fetch_eventbrite.mjs /tmp/eventbrite.json
    python3 scripts/import_eventbrite.py /tmp/eventbrite.json

Performers are matched by name in event titles (Eventbrite descriptions are
empty), so every link from an artist to a night is backed by a real listing.
"""
import collections
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "archive"


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


# ---------------------------------------------------------------- venues
VENUES = {
    "elephant-castle": {"name": "TAM Elephant & Castle", "place": "Mercato Metropolitano", "address": "42 Newington Causeway, London SE1 6DR", "postcodes": ["SE1 6DR", "SE16DR"], "legacy": "/locations/elephant-castle"},
    "canary-wharf": {"name": "TAM's Vineyard & Jazz Club", "place": "MMy Wood Wharf, Canary Wharf", "address": "Wood Wharf, London E14 9QG", "postcodes": ["E14 9QG", "E14  9QG"]},
    "smithfield": {"name": "TAM Smithfield", "place": "Smithfield & Farringdon", "address": "London EC1M", "postcodes": ["EC1M 6HA", "EC1M 6PR"], "legacy": "/locations/smithfield"},
    "dalston": {"name": "TAM Dalston", "place": "Dalston", "address": "33 Stoke Newington Road, London N16 8BJ", "postcodes": ["N16 8BJ"]},
    "mayfair": {"name": "TAM at Mercato Mayfair", "place": "St Mark's Church, Mayfair", "address": "North Audley Street, London W1K 6ZA", "postcodes": ["W1K 6ZA"]},
    "elephant-park": {"name": "TAM at MMy Elephant Park", "place": "Elephant Park", "address": "London SE17 1GA", "postcodes": ["SE17 1GA"]},
}
BY_POSTCODE = {pc: k for k, v in VENUES.items() for pc in v["postcodes"]}


def venue_of(e):
    v = e.get("primary_venue") or {}
    pc = ((v.get("address") or {}).get("postal_code") or "").strip()
    key = BY_POSTCODE.get(pc)
    return (key, None) if key else ("elsewhere", v.get("name") or "")


# ---------------------------------------------------------------- series
SERIES = [
    ("great-british-blues-jam", "The Great British Blues Jam", r"Great British Blues (?:Jam|Showcase|Brunch)", "blues"),
    ("singers-at-sunday-spot", "Singers @ Sunday Spot", r"Singers ?@ ?(?:The )?Sunday|Singers@Sunday|Sunday Spot", "soul"),
    ("word-of-mouth", "Word of Mouth Fusion Jazz", r"Word of Mouth", "jazz"),
    ("funk-me", "Funk Me, It's Friday / Saturday", r"Funk Me", "funk"),
    ("jazz-in-the-city", "Jazz in the City", r"Jazz in the City|Friday Jazz|Midweek Jazz", "jazz"),
    ("jazz-jam", "Jazz Jam in the TAM", r"Jazz Jam", "jazz"),
    ("saturday-spotlight", "Saturday Spotlight", r"Saturday Spotlight", None),
    ("thirsty-thursday", "Thirsty Thursday", r"Thirsty Thursday", None),
    ("mic-drop", "LondonJamSession x TAM MIC DROP", r"MIC DROP", None),
    ("tam-music-showcase", "TAM Music Showcase", r"TAM Music Showcase|TAM Open Mic Showcase|TAM Open Mic \+ Showcase", None),
    ("bunny-land-fest", "Bunny Land Fest", r"Bunny ?Land", "rock"),
    ("dove-and-lion", "Dove & Lion Variety Show", r"Dove (?:&|and) Lion", None),
    ("engine-room", "The Engine Room", r"Engine Room", "electronic"),
    ("junior-open-mic", "JOM Junior & Youth Open Mic", r"\bJOM\b|Junior (?:&|Open|Singers)", None),
    ("disney-hours", "Disney Hours", r"Disney Hours", None),
    ("bluescape", "Bluescape Festival", r"Bluescape", "blues"),
    ("festival-14", "Festival 14", r"Festival 14", None),
    ("innercity-blues-jam", "Innercity Blues Jam", r"Inner ?city Blues Jam", "blues"),
    ("city-of-london-blues-jam", "The City of London Blues Jam", r"City of London Blues Jam", "blues"),
    ("basement-sessions", "Basement & Bunker Sessions", r"Basement|Bunker", None),
    ("morley-college", "Morley College Nights", r"Morley", None),
    ("immersive-experience-network", "Immersive Experience Network", r"Immersive Experience Network|Live Immersive Creators", None),
    ("tam-summer-academy", "TAM Summer Academy", r"TAM Summer 2021 Academy|TAM Open Music Academy|TAM Academy", None),
    ("everywhere-at-once", "Everywhere At Once", r"Everywhere At Once", None),
    ("dana-gillespie-nights", "Dana Gillespie Nights", r"Dana Gillespie|Dana & Dino", "blues"),
    ("open-mic", "Open Mic at TAM", r"Open Mic", None),
    ("karaoke", "Karaoke at TAM", r"Karaoke", None),
    ("comedy", "Comedy at TAM", r"Comedy", "comedy"),
    ("latin-nights", "Latin Nights", r"Latin|Salsa|Bachata|Cumbia|Samba|Flamenco|Tango|Brazil", "latin"),
]

GENRES = [
    ("blues", r"blues|boogie|delta"),
    ("jazz", r"jazz|swing|bebop|big band"),
    ("soul", r"soul|motown|r&b|rnb|gospel|neo-soul"),
    ("funk", r"funk"),
    ("rock", r"rock|punk|metal|indie|alt|garage|psychedelic|grunge"),
    ("folk", r"folk|americana|country|acoustic|roots"),
    ("latin", r"latin|salsa|bachata|cumbia|samba|flamenco|tango|brazil|chicha|bossa"),
    ("reggae", r"reggae|ska|calypso|dub"),
    ("electronic", r"electronic|electronica|techhouse|house|synth|edm|beats"),
    ("pop", r"\bpop\b|eurovision|abba"),
    ("comedy", r"comedy|stand ?up"),
    ("karaoke", r"karaoke"),
    ("open-mic", r"open mic|jam session|\bjam\b"),
]


def genres_of(title):
    return [g for g, rx in GENRES if re.search(rx, title, re.I)]


# ---------------------------------------------------------------- performers
def load_performers(path):
    acts, seen = [], {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|") if p.strip()]
        name, flags = parts[0], parts[1:]
        slug = next((f[6:] for f in flags if f.startswith("@slug=")), None) or slugify(name)
        note = next((f[6:] for f in flags if f.startswith("@note=")), None)
        aliases = [name] + [f for f in flags if not f.startswith(("@", "!"))]
        legend = "!legend" in flags
        if slug in seen:  # merge duplicate lines
            seen[slug]["aliases"] = list(dict.fromkeys(seen[slug]["aliases"] + aliases))
            seen[slug]["legend"] |= legend
            continue
        act = {"slug": slug, "name": name, "aliases": aliases, "legend": legend, **({"note": note} if note else {})}
        seen[slug] = act
        acts.append(act)
    for a in acts:
        a["rx"] = [compile_alias(x) for x in sorted(a["aliases"], key=len, reverse=True)]
    return acts


def compile_alias(alias):
    # Single words are matched case-sensitively ("Spread" not "spreading");
    # multi-word names case-insensitively.
    flags = 0 if " " not in alias.strip() else re.I
    return re.compile(r"(?<![\w])" + re.escape(alias) + r"(?![\w])", flags)


def norm_title(t):
    return re.sub(r"\s+", " ", t).strip()


def main(src):
    raw = json.load(open(src, encoding="utf-8"))
    events_in = raw["past"] + raw.get("upcoming", [])
    acts = load_performers(ROOT / "scripts" / "sources" / "performers.txt")

    events, used = [], set()
    for e in sorted(events_in, key=lambda e: (e["start_date"], e.get("start_time") or "")):
        if e["id"] in used or e.get("is_cancelled"):
            continue
        used.add(e["id"])
        title = norm_title(e["name"])
        venue, venue_name = venue_of(e)
        performers = [a["slug"] for a in acts if any(rx.search(title) for rx in a["rx"])]
        series = next((s for s, _, rx, _ in SERIES if re.search(rx, title, re.I)), None)
        img = (e.get("image") or {}).get("image_sizes", {}).get("medium") or (e.get("image") or {}).get("url") or ""
        events.append({
            "id": e["id"],
            "slug": f"{slugify(title)[:70].rstrip('-')}-{e['start_date']}",
            "title": title,
            "date": e["start_date"],
            "time": (e.get("start_time") or "")[:5],
            "venue": venue,
            **({"venueName": venue_name} if venue_name else {}),
            "url": e["url"],
            "image": img,
            "performers": performers,
            "series": series,
            "genres": genres_of(title),
            "free": bool((e.get("ticket_availability") or {}).get("is_free")),
        })

    # Make slugs unique.
    count = collections.Counter(ev["slug"] for ev in events)
    for ev in events:
        if count[ev["slug"]] > 1:
            ev["slug"] = f"{ev['slug']}-{ev['id'][-4:]}"

    perf = []
    for a in acts:
        mine = [ev for ev in events if a["slug"] in ev["performers"]]
        g = collections.Counter(x for ev in mine for x in ev["genres"] if x not in ("open-mic", "karaoke"))
        perf.append({
            "slug": a["slug"],
            "name": a["name"],
            "legend": a["legend"],
            **({"note": a["note"]} if a.get("note") else {}),
            "appearances": len(mine),
            "first": mine[0]["date"] if mine else None,
            "last": mine[-1]["date"] if mine else None,
            "genres": [x for x, _ in g.most_common(3)],
            "venues": [v for v, _ in collections.Counter(ev["venue"] for ev in mine).most_common()],
        })
    perf.sort(key=lambda p: (-p["appearances"], p["name"]))

    series = []
    for slug, name, _, genre in SERIES:
        mine = [ev for ev in events if ev["series"] == slug]
        if mine:
            series.append({"slug": slug, "name": name, "genre": genre, "count": len(mine), "first": mine[0]["date"], "last": mine[-1]["date"]})

    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    dump("events.json", events)
    dump("performers.json", perf)
    dump("series.json", series)
    dump("venues.json", [{"slug": k, **{x: y for x, y in v.items() if x != "postcodes"}} for k, v in VENUES.items()])

    linked = sum(1 for ev in events if ev["performers"])
    print(f"{len(events)} events, {sum(1 for p in perf if p['appearances'])} performers with appearances, {len(series)} series; "
          f"{linked} events linked to at least one performer")
    unmatched = [p["name"] for p in perf if not p["appearances"]]
    if unmatched:
        print("no Eventbrite match (old-site only?):", ", ".join(unmatched))


if __name__ == "__main__":
    main(sys.argv[1])
