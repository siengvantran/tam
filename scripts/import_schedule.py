"""Import TAM's Elephant & Castle performance schedule (the "TAM E&C
Performance Schedule" Google Sheet, one tab per month, a calendar grid) into
content/schedule.json: public nights only.

    python3 scripts/import_schedule.py /path/to/schedule.xlsx      # needs openpyxl

The sheet is TAM's internal calendar, so this keeps it private by design:
  * private hires, bookings, birthdays, rehearsals, shoots, workshops,
    corporate and college hires, closures and anything mentioning money
    are left out entirely;
  * staff names in brackets or after a dash, sound-engineer notes and
    other venues (Mayfair, Canary Wharf) are stripped;
  * regular nights get one consistent public name.
Never commit the spreadsheet itself. Review the output before publishing.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / 'content' / 'schedule.json'

# Optional, never committed: extra names to strip or drop, one per line, in
# scripts/private/schedule-denylist.txt ("staff: Name" or "drop: text").
LOCAL = Path(__file__).resolve().parent / 'private' / 'schedule-denylist.txt'
STAFF, DENY = set(), set()
if LOCAL.exists():
    for line in LOCAL.read_text().splitlines():
        kind, _, value = line.partition(':')
        (STAFF if kind.strip() == 'staff' else DENY).add(value.strip().lower())
NAMEISH = re.compile(r"^[A-Z][a-z]+(?:\s*(?:&|,|and)\s*[A-Z][a-z]+)*$")  # "Sam", "Sam & Jo": a staff note

DROP = re.compile(r'£|\bmin(imum)? spend|\bhire\b|hiring|private|booking|deposit|birthday|\bbday\b|anniversary|wedding|rehears|practice|'
                  r'photoshoot|video shoot|filming|\bfilm\b|music video|recording|sound check|meeting|workshop|holiday|uni projects|college|collage|'
                  r'school|council|consulting|corporate|tel\b|\d{5} ?\d{6}|cancel|closed|^close$|fire|power cut|covid|'
                  r'\?|^\d+(\.\d+)?$|^\s*$|mayfair|canary wharf|\(cw\)|\(mf\)|^tam c$|networking|tarot|party \(|own music|own dj|xmas party|'
                  r'christmas party|karaoke party|dating|huddle|screening|memorial|split|token|drinks tab|no need|get in|to move|mabel|'
                  r'^bday|^blues$|^singer$|^soul$|^ska$|^reggae$|^dom$|^dino$|^harry|^hari$|^carlos$|^juan|^arif|^cris|^frank|^ben$|^baz$|'
                  r'^toby$|^zac$|^rosie$|^gio$|^echo$|^karlo$|^luis$|^francis$|^charmain|^denis|^tom$|^marcus$|^jade$|^chelsea$|^artur|^callum$|'
                  r'^leroy$|^kenta$|^valerie$|^heidi$|^samuel|^sebastian|^paolo|^humbert|^rohit$|^gemma$|^iris|^priyanka|^mircha|^a#$|^217',
                  re.I)

# Regular nights: one public name each (first match wins).
SERIES = [
    (r'^(the )?great british blues jam|^gbbj|^blues jam|^mark blues jam|^blue jam', 'great-british-blues-jam', 'The Great British Blues Jam'),
    (r'sunday spot|^singers|^wom brunch\s+singers', 'singers-sunday-spot', 'Singers @ Sunday Spot'),
    (r'karaoke|karoake', 'tam-karaoke', 'TAM Karaoke'),
    (r'^(asha )?wom\b|word of mouth|^wom brunch', 'word-of-mouth', 'Word of Mouth'),
    (r'patrick.*open mic|open mic.*patrick|^open mic\b', 'open-mic', 'Open Mic with Patrick Hinds'),
    (r'^jom\b|junior open mic', 'junior-open-mic', 'Junior Open Mic'),
    (r'^latin (jam|afternoon|sunday)', 'latin-jam', 'Latin Jam'),
    (r'^latin brunch', 'latin-brunch', 'Latin Brunch'),
    (r'jazz jam', 'jazz-jam', 'Jazz Jam at the TAM'),
    (r'new orleans jam', 'new-orleans-jam', 'New Orleans Jam'),
    (r'^soul jam', 'soul-jam', 'Soul Jam'),
    (r'^mic drop', 'mic-drop', 'Mic Drop'),
    (r'singalong', 'singalong', 'Singalong'),
    (r'^bachata', 'bachata', 'Bachata Night'),
    (r'tech tuesday', 'tech-tuesday-jam', 'Tech Tuesday Jam'),
    (r'project culture', 'project-culture', 'Project Culture'),
    (r'blues brunch|blue brunch', 'blues-brunch', 'Blues Brunch'),
    (r'^ogg\b', 'ogg', 'OGG'),
]
PRIVATE = re.compile(r'private|min(imum)? spend|£|hire|hiring|booking|deposit', re.I)
THEMED = re.compile(r'^singers\s*[-–]\s*(.+)$', re.I)  # "Singers - Quincy Jones" → a themed Sunday Spot
HOSTED = re.compile(r'hosted by ([^)]+)', re.I)


def clean(part):
    s = re.sub(r'\s+', ' ', part).strip(' -–:;,+')
    s = re.sub(r'^\d+[.:]\s*', '', s)                      # "1. Thirsty Thursday", "2nd:"
    s = re.sub(r'^(1st|2nd|3rd):\s*', '', s, flags=re.I)
    s = re.sub(r'^\(?(\d{1,2}(:\d\d)?\s*(-|to)\s*\d{1,2}(:\d\d)?\s*(am|pm)?)\)?:?\s*', '', s, flags=re.I)  # leading time ranges
    def bracket(m):
        inner = m.group(1).strip()
        return '' if inner.lower() in STAFF or NAMEISH.match(inner) or re.search(r'\d|sound|engineer|onsite|arrival|start|people|from|till|until|holiday|full day', inner, re.I) else m.group(0)
    s = re.sub(r'\(([^)]*)\)', bracket, s)
    s = re.sub(r'\s+[-–]\s+[A-Z][a-z]+(?:\s*(?:&|,)\s*[A-Z][a-z]+)*\s*$', '', s)   # "Act - Sam": a staff note
    s = re.sub(r'\s*\((?:[^()]*)$', '', s)                    # unclosed bracket tails
    return re.sub(r'\s+', ' ', s).strip(' -–:;,+')


JUNK = re.compile(r'^[(\d]|\)$|^(2 )?support$|^guest$|^each\b|sound|engineer|^quartet$|^david\b|^steve$|rehersal|drum$|\(drums\)|'
                  r'\bparty\b|bingo|www\.|^dana dino|^dino harry|^morley|^tris & martin|^sara and jimmy|^diego & shunak|^karina|^ranjith|'
                  r'^georgia|^raft|^hugh$|^inventive|^dino, harry|^marcus jack$|^patrick ariff|^vince|^matilda|^kim\)|^jam!$|^nazarene$|^luigi$|^kalila$|^william blake$|^folk trio$', re.I)


def classify(raw):
    s = clean(raw)
    if not s or DROP.search(raw) or DROP.search(s) or JUNK.search(s) or len(s) < 3 or any(d in raw.lower() for d in DENY):
        return None
    host = HOSTED.search(raw)
    m = THEMED.match(s)
    for rx, slug, name in SERIES:
        if re.search(rx, s, re.I):
            ev = {'series': slug, 'title': name}
            if m and slug == 'singers-sunday-spot':
                ev['theme'] = clean(m.group(1))
            if host and slug in ('great-british-blues-jam', 'singers-sunday-spot'):
                ev['host'] = clean(host.group(1))
            return ev
    return {'title': s}


def month_of(ws):
    v = ws.cell(row=1, column=2).value
    if hasattr(v, 'year'):
        return v.year, v.month
    m = re.match(r'([A-Za-z]+?)(\d{4})$', ws.title)
    months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    return int(m.group(2)), months.index(m.group(1)[:3].lower()) + 1


def main(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    events, seen, private_names = [], set(), set()
    for ws in wb.worksheets:
        year, month = month_of(ws)
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        for i in range(2, len(rows) - 1, 2):
            days, cells = rows[i], rows[i + 1]
            for col, d in enumerate(days):
                try:
                    day = int(float(d))
                except (TypeError, ValueError):
                    continue
                cell = cells[col] if col < len(cells) else None
                if not cell:
                    continue
                try:
                    iso = date(year, month, day).isoformat()
                except ValueError:
                    continue
                for part in re.split(r'\n+', str(cell)):
                    if PRIVATE.search(part):
                        stem = clean(re.split(r'\s[-–(]|\s\d|\sprivate|\sbirthday|\smin', part, maxsplit=1, flags=re.I)[0]).lower()
                        if len(stem) > 3:
                            private_names.add(stem)
                for part in re.split(r'\n+|\s*;\s*|\s*/\s*|\s*\+\s*\n?|\s+\d\.\s*', str(cell)):
                    ev = classify(part)
                    if not ev:
                        continue
                    key = (iso, ev.get('series') or ev['title'].lower())
                    if key in seen:
                        continue
                    seen.add(key)
                    events.append({'date': iso, **ev})
    # A one-word name seen once or twice is usually a person's private booking:
    # keep single words only for acts that recur or that TAM already lists.
    known = set()
    perf = OUT.parent / 'archive' / 'performers.json'
    if perf.exists():
        known = {p['name'].lower() for p in json.loads(perf.read_text())}
    counts = {}
    for e in events:
        counts[e['title'].lower()] = counts.get(e['title'].lower(), 0) + 1
    # Never show anyone the sheet ever marks as a private booking, hire or minimum spend.
    events = [e for e in events if e.get('series') or not any(e['title'].lower().startswith(n) for n in private_names)]
    events = [e for e in events if e.get('series') or ' ' in e['title'].strip() or counts[e['title'].lower()] >= 3 or e['title'].lower() in known]
    events.sort(key=lambda e: (e['date'], e['title']))
    OUT.write_text(json.dumps(events, indent=1, ensure_ascii=False) + '\n')
    print(f'{len(events)} public events from {len(wb.worksheets)} months → {OUT}')


if __name__ == '__main__':
    main(sys.argv[1])
