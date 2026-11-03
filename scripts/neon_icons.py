# Regenerate: python3 scripts/neon_icons.py public/img/neon
"""Generate TAM's neon modern-art icon set: glowing tube strokes (a colour
halo plus a pale core, like a real neon sign) over abstract Bauhaus-style
shapes. One shared recipe, so every icon has the same weight and glow."""
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

C = {  # tube colour, pale core
    'pink': ('#ff3ea5', '#ffe3f2'),
    'cyan': ('#2ee6ff', '#e2fbff'),
    'acid': ('#ffe14d', '#fffbe0'),
    'violet': ('#a66bff', '#f0e6ff'),
}

def tube(d, colour, w=3.2):
    tone, core = C[colour]
    return (f'<path d="{d}" stroke="{tone}" stroke-width="{w}" filter="url(#glow)"/>'
            f'<path d="{d}" stroke="{core}" stroke-width="{w * 0.34:.2f}"/>')

def shape(d, colour, opacity=.16):
    return f'<path d="{d}" fill="{C[colour][0]}" fill-opacity="{opacity}" stroke="none"/>'

def svg(name, title, parts, bg=False):
    body = ''.join(parts)
    backdrop = '<circle cx="32" cy="32" r="31" fill="#0d0811"/>' if bg else ''
    OUT.joinpath(f'{name}.svg').write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{title}">
<title>{title}</title>
<defs><filter id="glow" filterUnits="userSpaceOnUse" x="-16" y="-16" width="96" height="96"><feGaussianBlur stdDeviation="1.8" result="a"/><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
{backdrop}<g fill="none" stroke-linecap="round" stroke-linejoin="round">{body}</g>
</svg>
''')

# I want to hear live music: a beamed note over a cyan half-moon and an acid dot
svg('live-music', 'Live music', [
    shape('M8 54 A22 22 0 0 1 52 54 Z', 'cyan', .14),
    tube('M10 54 A20 20 0 0 1 50 54', 'cyan', 2.4),
    tube('M27 44 V16 L47 12 V40', 'pink'),
    tube('M27 16 L47 12 M27 22 L47 18', 'pink', 2.6),
    tube('M27 44 a5.5 4.5 -20 1 1 -0.1 0', 'pink'),
    tube('M47 40 a5.5 4.5 -20 1 1 -0.1 0', 'pink'),
    tube('M54 22 a2.2 2.2 0 1 1 -0.1 0', 'acid', 2.2),
])

# I'm a musician: a cut-out guitar, pink body, cyan neck, acid sound hole
svg('musician', 'Musician', [
    shape('M4 40 A18 18 0 0 1 40 40 Z', 'violet', .16),
    tube('M21 34 a9 9 0 1 0 9 9 a6 6 0 0 0 -3 -11 a6 6 0 0 0 -6 2 Z', 'pink'),
    tube('M29 35 L52 12', 'cyan'),
    tube('M50 8 L56 14 L53 17 L47 11 Z', 'cyan', 2.6),
    tube('M21 43 a3.2 3.2 0 1 1 -0.1 0', 'acid', 2.4),
    tube('M14 50 L18 46', 'acid', 2.2),
])

# I want to hire the venue: a proscenium arch, a spotlight, the stage edge
svg('venue-hire', 'Venue hire', [
    shape('M14 52 V28 A18 18 0 0 1 50 28 V52 Z', 'violet', .13),
    tube('M14 52 V28 A18 18 0 0 1 50 28 V52', 'violet'),
    tube('M8 52 H56', 'pink'),
    tube('M32 14 L22 46 M32 14 L42 46', 'acid', 2.2),
    tube('M22 46 Q32 50 42 46', 'acid', 2.2),
    tube('M32 10 a2.4 2.4 0 1 1 -0.1 0', 'acid', 2.4),
])

# I'm planning a party: a cocktail with an olive, and two sparkles
svg('party', 'Party', [
    shape('M32 4 A16 16 0 0 1 32 36 A16 16 0 0 1 32 4 Z', 'pink', .12),
    tube('M16 16 H48 L32 34 Z', 'cyan'),
    tube('M32 34 V50 M23 52 H41', 'cyan'),
    tube('M40 20 a3 3 0 1 1 -0.1 0', 'pink', 2.6),
    tube('M38 22 L50 8', 'pink', 2.2),
    tube('M11 40 V48 M7 44 H15', 'acid', 2.2),
    tube('M53 30 V38 M49 34 H57', 'acid', 2.2),
])

# I'm a brand or sponsor: a star in a spotlight ring, Bauhaus quarter-circle
svg('brand', 'Brand', [
    shape('M8 8 H36 A28 28 0 0 1 8 36 Z', 'cyan', .14),
    tube('M32 32 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0', 'violet', 2.6),
    tube('M32 16 L36.5 27 L48 27.5 L39 35 L42 46.5 L32 40 L22 46.5 L25 35 L16 27.5 L27.5 27 Z', 'acid'),
])

# Sponsorship gift: a neon box, ribbon and bow
svg('gift', 'Gift', [
    shape('M10 26 H54 V54 H10 Z', 'pink', .12),
    tube('M12 28 H52 V54 H12 Z', 'pink'),
    tube('M9 21 H55 V28 H9 Z', 'pink', 2.6),
    tube('M32 21 V54', 'cyan'),
    tube('M32 21 C26 10 16 14 22 21 M32 21 C38 10 48 14 42 21', 'acid', 2.6),
])

# Charity: a heart with a pulse running through it
svg('heart', 'Heart', [
    shape('M32 54 C10 40 6 26 14 18 C21 11 29 14 32 21 C35 14 43 11 50 18 C58 26 54 40 32 54 Z', 'pink', .14),
    tube('M32 54 C10 40 6 26 14 18 C21 11 29 14 32 21 C35 14 43 11 50 18 C58 26 54 40 32 54 Z', 'pink'),
    tube('M4 34 H20 L24 26 L30 42 L35 30 L38 34 H60', 'cyan', 2.4),
])

# Ask TAM: a neon microphone on a dark disc, sound waves either side
svg('ask-tam', 'Ask TAM', [
    tube('M32 32 m-27.5 0 a27.5 27.5 0 1 0 55 0 a27.5 27.5 0 1 0 -55 0', 'pink', 2.4),
    shape('M24 12 H40 V36 A8 8 0 0 1 24 36 Z', 'cyan', .18),
    tube('M24 20 A8 8 0 0 1 40 20 V30 A8 8 0 0 1 24 30 Z', 'cyan'),
    tube('M28 18 V31 M32 16 V32 M36 18 V31', 'cyan', 1.8),
    tube('M19 30 A13 13 0 0 0 45 30', 'acid', 2.6),
    tube('M32 43 V50 M25 51 H39', 'acid', 2.6),
    tube('M14 22 Q10 28 14 34 M50 22 Q54 28 50 34', 'pink', 2.2),
], bg=True)

print('icons:', sorted(p.name for p in OUT.iterdir()))
