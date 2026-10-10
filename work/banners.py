"""Find the parchment name banners on each map and match them to places.

Writes ../data/maps/<map>-labels.js: { placeId: [x0, y0, x1, y1] } in map units, so the app can make the
banner itself the clickable place instead of covering its text with a marker.
Usage: python banners.py   (writes banners_<map>.png for review)
"""
import json
import cv2
import numpy as np

SRC = {'night-harbor': 'nh_full.jpg', 'shaded-dunes': 'sd_full.jpg'}
SCALE = 3.6
POIS = json.load(open('pois.json'))


def paper_mask(img):
    """1 where a pixel looks like banner parchment or the dark lettering on it."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    paper = (hsv[..., 0] >= 12) & (hsv[..., 0] <= 19) & (hsv[..., 1] >= 85) & (hsv[..., 1] <= 168) & (hsv[..., 2] >= 195)
    ink = gray < 80
    return (paper | ink).astype(np.float32), paper.astype(np.float32)


def run(profile, start, step, limit, thresh, patience=4):
    """Walk from start while the profile stays above thresh (tolerating short dips)."""
    i, last_good, bad = start, start, 0
    while 0 <= i < limit:
        if profile[i] >= thresh:
            last_good, bad = i, 0
        else:
            bad += 1
            if bad > patience:
                break
        i += step
    return last_good


def banner_at(masks, px, py):
    """Measure the banner around a place's point by scanning outwards; None if it isn't on a banner."""
    both, paper = masks
    H, W = both.shape
    px, py = int(px), int(py)
    # vertical extent: rows near the point that are mostly parchment/ink
    band = both[:, max(0, px - 50):px + 50]
    rows = band.mean(axis=1)
    if paper[max(0, py - 20):py + 20, max(0, px - 50):px + 50].mean() < 0.3:
        return None
    top = run(rows, py, -1, H, 0.62)
    bot = run(rows, py, 1, H, 0.62)
    h = bot - top
    if not 30 <= h <= 300:
        return None
    # horizontal extent: columns over those rows that are mostly parchment/ink
    cols = both[top:bot + 1].mean(axis=0)
    # a banner column has something else just above or below it; open sand of the same colour doesn't
    above = paper[max(0, top - 16):max(1, top - 4)].mean(axis=0)
    below = paper[bot + 4:bot + 16].mean(axis=0) if bot + 16 < H else np.zeros(W)
    cols = np.where(np.minimum(above, below) < 0.45, cols, 0)
    left = run(cols, px, -1, W, 0.55, patience=8)
    right = run(cols, px, 1, W, 0.55, patience=8)
    w = right - left
    if not (90 <= w <= 1500 and w >= 1.4 * h):
        return None
    # real banners carry lettering: dark ink in the middle band, on parchment
    mid = (both - paper)[top + h // 4:bot - h // 4, left + w // 8:right - w // 8]
    if mid.size == 0 or mid.mean() < 0.04:
        return None
    if any(a <= (left + right) / 2 <= c and b <= (top + bot) / 2 <= d for a, b, c, d in DECOR.get(CUR_MAP, [])):
        return None
    return [left, top, right, bot]


# Title, motto and credit banners (full-res boxes) are decoration, never a place.
DECOR = {
    'night-harbor': [(0, 0, 1300, 500), (4000, 3900, 5000, 4300), (1900, 650, 3000, 820)],
    'shaded-dunes': [(2360, 220, 3320, 520), (2420, 3180, 3460, 3320), (4900, 3140, 5520, 3320)],
}
# Places that have no banner of their own on the map art (they keep a normal marker).
NO_BANNER = {'noob-yard-west', 'noob-yard-north', 'sd-ashira-valley', 'sd-hunter-camp', 'sd-coastline', 'sd-shadow-ruins'}
# Banners too small for the detector, given in map units.
MANUAL = {'sd-wandering-giant': [711, 768, 783, 784]}
CUR_MAP = None

for map_id, src in SRC.items():
    CUR_MAP = map_id
    img = cv2.imread(src)
    masks = paper_mask(img)
    boxes, labels, used = [], {}, {}
    def nearby(p):
        # the place point may sit just beside its banner: try points around it, nearest first
        px, py = p['x'] * SCALE, p['y'] * SCALE
        offs = sorted(((dx, dy) for dx in range(-240, 241, 40) for dy in range(-240, 241, 30)), key=lambda o: o[0] ** 2 + o[1] ** 2)
        for dx, dy in offs[1:]:
            b = banner_at(masks, px + dx, py + dy)
            if b and b not in boxes:
                return b
        return None
    pending = []
    for p in POIS[map_id]:
        if p['id'] in NO_BANNER:
            continue
        if p['id'] in MANUAL:
            labels[p['id']] = MANUAL[p['id']]
            continue
        b = banner_at(masks, p['x'] * SCALE, p['y'] * SCALE)
        if not b:
            pending.append(p)
            continue
        if b in boxes:
            print(f'  {map_id}: {p["id"]} shares a banner with {used[boxes.index(b)]}; keeping its marker')
            continue
        boxes.append(b)
        used[len(boxes) - 1] = p['id']
        x0, y0, x1, y1 = b
        labels[p['id']] = [round(x0 / SCALE, 1), round(y0 / SCALE, 1), round(x1 / SCALE, 1), round(y1 / SCALE, 1)]
    for p in pending:  # second pass, after every exact match has claimed its banner
        b = nearby(p)
        if not b:
            continue
        boxes.append(b)
        used[len(boxes) - 1] = p['id']
        x0, y0, x1, y1 = b
        labels[p['id']] = [round(x0 / SCALE, 1), round(y0 / SCALE, 1), round(x1 / SCALE, 1), round(y1 / SCALE, 1)]
    vis = img.copy()
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        cv2.rectangle(vis, (x0, y0), (x1, y1), (0, 200, 0) if i in used else (0, 0, 255), 6)
        if i in used:
            cv2.putText(vis, used[i], (x0, y0 - 8), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 120, 0), 3)
    for p in POIS[map_id]:
        cv2.circle(vis, (int(p['x'] * SCALE), int(p['y'] * SCALE)), 14, (255, 0, 255) if p['id'] in labels else (255, 255, 0), -1)
    cv2.imwrite(f'banners_{map_id}.png', cv2.resize(vis, (vis.shape[1] // 4, vis.shape[0] // 4), interpolation=cv2.INTER_AREA))
    js = ('// Name banners painted on the map, matched to places (generated by work/banners.py).\n'
          '// [x0, y0, x1, y1] in map units: the banner is the clickable place, so no marker hides its text.\n'
          f"(window.NH_LABELS_BY_MAP = window.NH_LABELS_BY_MAP || {{}})['{map_id}'] = {json.dumps(labels, indent=1)};\n")
    open(f'../data/maps/{map_id}-labels.js', 'w', encoding='utf-8').write(js)
    print(map_id, len(labels), 'of', len(POIS[map_id]), 'places matched')
    print('  unmatched:', [p['id'] for p in POIS[map_id] if p['id'] not in labels])
