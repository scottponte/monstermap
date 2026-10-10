"""Dungeon features painted on dungeon maps: numbered named mobs, lettered map connections, traps, wing banners.

Each feature is catalogued by hand (approximate position, read off the map) and snapped to the exact painted
mark, so the app can make the mark itself clickable instead of covering it with a marker.

Writes ../data/maps/dungeons.js. Usage: python dungeons.py   (needs the source images in work/tmp/)
"""
import json
import cv2
import numpy as np

UNITS = 1600

# kind, label, approx (x, y) in the catalogue image, extra fields
DUNGEONS = {
    'tomb-of-the-last-wyrmsbane': {
        'source': 'tmp/wyrm.png',          # WyrmsbaneCombined v0.91.png (2760x1710), map by Walabus
        'catalogue_width': 1840,           # the approximate positions below were read at this width
        'credit': 'Map by Walabus',
        'key': [  # number on the map -> wiki NPC, and the map key's note
            (1, 'Quartermaster Boothroy', '', (957, 933)),
            (2, 'Jakob Geffrey', 'Cloth', (1121, 762)),
            (3, 'Timmon Bell', 'Cloth', (645, 627)),
            (4, 'Bone Construct', '', (967, 348)),
            (5, 'Lieutenant Gregan Snyde', 'Plate', (1110, 437)),
            (6, 'Dario Numas', 'Chain', (1432, 871)),
            (7, 'Ariblast the Wicked', '', (1689, 984)),
            (8, 'Grandmaster Gildas', 'Leather', (1653, 276)),
            (9, 'Grandmaster Obadiah', 'Leather', (1653, 665)),
            (10, 'High Marshal Fionna', 'Plate', (1461, 469)),
            (11, 'Gerhardt Graves', 'Chain', (117, 589)),
        ],
        'connections': {  # letter -> the two boxes that join
            'A': [(646, 973), (1030, 973)], 'B': [(1068, 933), (1352, 951)], 'C': [(1212, 572), (1576, 752)],
            'D': [(1250, 650), (1616, 831)], 'E': [(527, 348), (1089, 590)], 'F': [(201, 404), (885, 648)],
            'G': [(285, 607), (39, 812)], 'H': [(322, 1013), (586, 1012)], 'I': [(1191, 509), (1779, 468)],
            'J': [(1576, 286), (1595, 530)], 'K': [(1576, 165), (1594, 407)], 'L': [(1353, 266), (1353, 548)],
            'M': [(1353, 185), (1355, 387)],
        },
        'traps': [(388, 569), (202, 751), (424, 972), (950, 1030), (1657, 711)],
        'sections': [  # wing banners
            ('1-3F, Plate & Cloth', (970, 232)), ('3-4F, Chain (west)', (258, 307)),
            ('3-4F, Chain (south-east)', (1415, 773)), ('5-6F, Plate & Leather', (1600, 70)),
        ],
        'exit_banners': {  # existing exit place id -> banner
            'tomb-of-the-last-wyrmsbane-to-ancient-crypt': (778, 985),
            'tomb-of-the-last-wyrmsbane-to-night-harbor': (1030, 1080),
        },
    },
}


def nearest_box(mask, x, y, win, grow=7, pad=3):
    """Bounding box of the blob in `mask` nearest to (x, y), searching a window of +-win px."""
    H, W = mask.shape
    x0, y0, x1, y1 = max(0, x - win), max(0, y - win), min(W, x + win), min(H, y + win)
    sub = cv2.dilate(mask[y0:y1, x0:x1], np.ones((grow, grow), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(sub)
    best, bd = None, 1e9
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 40:
            continue
        d = (cen[i][0] + x0 - x) ** 2 + (cen[i][1] + y0 - y) ** 2
        if d < bd:
            best, bd = i, d
    if best is None:
        return None
    bx, by, bw, bh, _ = st[best]
    return [x0 + bx - pad, y0 + by - pad, x0 + bx + bw + pad, y0 + by + bh + pad]


out = {}
for map_id, d in DUNGEONS.items():
    img = cv2.imread(d['source'])
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    white = ((hsv[..., 2] > 200) & (hsv[..., 1] < 45)).astype(np.uint8) * 255
    red = (((hsv[..., 0] < 6) | (hsv[..., 0] > 174)) & (hsv[..., 1] > 170) & (hsv[..., 2] > 150)).astype(np.uint8) * 255
    paper = ((hsv[..., 0] >= 8) & (hsv[..., 0] <= 30) & (hsv[..., 1] >= 40) & (hsv[..., 1] <= 190) & (hsv[..., 2] > 150)).astype(np.uint8) * 255
    k = W / d['catalogue_width']          # catalogue px -> full-res px
    u = UNITS / W                         # full-res px -> map units
    full = lambda p: (int(p[0] * k), int(p[1] * k))
    units = lambda b: [round(v * u, 1) for v in b]
    misses = []

    def box(mask, p, win, name, **kw):
        b = nearest_box(mask, *full(p), win, **kw)
        if b is None:
            misses.append(name)
            x, y = full(p)
            b = [x - 18, y - 18, x + 18, y + 18]
        return units(b)

    pois = []
    for num, npc, note, p in d['key']:
        pois.append({'id': f'{map_id}-key-{num}', 'name': npc, 'cat': 'named', 'label': str(num), 'box': box(white, p, 26, f'key {num}', grow=9, pad=5),
                     'npcFilter': npc, 'wiki': npc,
                     'desc': f'Number {num} on the map key' + (f' ({note}: the armour type of the Wyrmsbane Armor Quest piece it drops).' if note else '.')})
    for letter, pts in d['connections'].items():
        for i, p in enumerate(pts):
            pois.append({'id': f'{map_id}-conn-{letter.lower()}{i + 1}', 'name': f'Connection {letter}', 'cat': 'connection', 'label': letter,
                         'pair': letter, 'box': box(white, p, 30, f'connection {letter}{i + 1}', grow=11, pad=3),
                         'desc': f'Map connection {letter}: this passage continues at the other box marked {letter}.'})
    for i, p in enumerate(d['traps']):
        pois.append({'id': f'{map_id}-trap-{i + 1}', 'name': 'Pit trap', 'cat': 'hazard', 'label': '☒', 'box': box(red, p, 30, f'trap {i + 1}', grow=5, pad=3),
                     'desc': 'Pit trap marked on the map.'})
    for i, (name, p) in enumerate(d['sections']):
        pois.append({'id': f'{map_id}-wing-{i + 1}', 'name': name, 'cat': 'section', 'box': box(paper, p, 170, name, grow=9, pad=0),
                     'desc': 'Wing banner. The level range and the armour types of the Wyrmsbane Armor Quest pieces found in this wing.'})
    patch = {pid: {'box': box(paper, p, 150, pid, grow=9, pad=0)} for pid, p in d['exit_banners'].items()}
    out[map_id] = {'type': 'dungeon', 'credit': d['credit'], 'pois': pois, 'patch': patch}
    print(map_id, len(pois), 'features;', 'not snapped:', misses or 'none')

    vis = img.copy()
    for p in pois + [dict(v, cat='exit') for v in patch.values()]:
        x0, y0, x1, y1 = [int(v / u) for v in p['box']]
        cv2.rectangle(vis, (x0, y0), (x1, y1), {'named': (0, 255, 255), 'connection': (255, 200, 0), 'hazard': (0, 0, 255), 'section': (0, 255, 0)}.get(p['cat'], (255, 0, 255)), 3)
    cv2.imwrite(f'tmp/{map_id}-check.jpg', cv2.resize(vis, (1840, int(1840 * H / W))), [cv2.IMWRITE_JPEG_QUALITY, 85])

lines = ['// Dungeon features painted on dungeon maps, as clickable places (generated by work/dungeons.py).',
         '//   named      – numbered named mobs from the map key, linked to the wiki',
         '//   connection – lettered boxes that join two parts of the map (same `pair` = same passage)',
         '//   hazard     – traps;  section – wing banners',
         '// `box` is the painted mark itself [x0, y0, x1, y1] in map units: it is the click target, nothing covers it.',
         '// `patch` adds fields to places the map already has (here: the exits\' banners).',
         'window.NH_MAP_EXTRAS = Object.assign(window.NH_MAP_EXTRAS || {}, {']
for map_id, e in out.items():
    lines.append(f'  {json.dumps(map_id)}: {{')
    lines.append(f'    type: {json.dumps(e["type"])}, credit: {json.dumps(e["credit"])},')
    lines.append(f'    patch: {json.dumps(e["patch"])},')
    lines.append('    pois: [')
    lines += ['      ' + json.dumps(p, ensure_ascii=False) + ',' for p in e['pois']]
    lines.append('    ],')
    lines.append('  },')
lines.append('});')
open('../data/maps/dungeons.js', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
