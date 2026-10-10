"""Snap the hand-catalogued icons, paint them out of the map, and export the clean map.

Usage: python build.py <map-id>      (map ids are the keys of icons_manual.MAPS)

Outputs:
  ../assets/<map-id>-clean.jpg         full-res map without icons
  ../assets/<map-id>-clean-half.jpg    half-res version (faster to load)
  <map-id>-snapped.json                snapped icons (full-res px)
  <map-id>-mask.png                    painted-out area
  review_*.png                         before/after crops for checking
"""
import json, os, sys
import cv2
import numpy as np
from icons_manual import MAPS

MAP_ID = sys.argv[1] if len(sys.argv) > 1 else 'night-harbor'
CFG = MAPS[MAP_ID]
ICONS = CFG['icons']
IMG = cv2.imread(CFG['source'])
H, W = IMG.shape[:2]
GRAY = cv2.cvtColor(IMG, cv2.COLOR_BGR2GRAY)
HSV = cv2.cvtColor(IMG, cv2.COLOR_BGR2HSV)

HUE = {  # OpenCV HSV ranges for the level colours
    'blue':   [((97, 150, 140), (107, 255, 255))],
    'cyan':   [((78, 90, 160), (92, 255, 255))],
    'green':  [((35, 100, 110), (58, 255, 255))],
    'yellow': [((25, 170, 180), (35, 255, 255))],
    'orange': [((14, 200, 190), (25, 255, 255))],
    'red':    [((0, 170, 140), (7, 255, 255)), ((170, 170, 140), (180, 255, 255))],
}


def window(x, y, r):
    x0, y0 = max(0, x - r), max(0, y - r)
    return x0, y0, min(W, x + r), min(H, y + r)


def nearest_component(mask, x0, y0, px, py, min_area=150):
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask)
    best, bd = None, 1e9
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            continue
        cx, cy = cent[i]
        d = (cx + x0 - px) ** 2 + (cy + y0 - py) ** 2
        if d < bd:
            best, bd = i, d
    if best is None:
        return None
    return (lab == best).astype(np.uint8) * 255


def fill_holes(m):
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros_like(m)
    cv2.drawContours(out, cnts, -1, 255, -1)
    return out


MASK = np.zeros((H, W), np.uint8)
snapped = []

for idx, (typ, px, py, extra) in enumerate(ICONS):
    x0, y0, x1, y1 = window(px, py, 90)
    local = np.zeros((y1 - y0, x1 - x0), np.uint8)
    cx, cy, size = px, py, 66

    if typ in ('bank', 'shady', 'inn', 'stable', 'stall'):
        dark = (GRAY[y0:y1, x0:x1] < 70).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(dark, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        best, bd = None, 1e9
        for c in cnts:
            bx, by, bw, bh = cv2.boundingRect(c)
            lo = 30 if typ == 'stall' else 50
            if lo <= bw <= 82 and lo <= bh <= 82 and abs(bw - bh) <= 10:
                d = (bx + bw / 2 + x0 - px) ** 2 + (by + bh / 2 + y0 - py) ** 2
                if d < bd:
                    best, bd = (bx, by, bw, bh), d
        if best and bd < 45 ** 2:
            bx, by, bw, bh = best
        else:
            s = 46 if typ == 'stall' else 68
            bx, by, bw, bh = px - x0 - s // 2, py - y0 - s // 2, s, s
            print('fallback square', idx, typ)
        cv2.rectangle(local, (bx - 4, by - 4), (bx + bw + 4, by + bh + 4), 255, -1)
        cx, cy, size = x0 + bx + bw / 2, y0 + by + bh / 2, max(bw, bh)

    elif typ.startswith('ts_') or typ in ('masonry', 'skills'):
        g = cv2.medianBlur(GRAY[y0:y1, x0:x1], 5)
        circ = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1, minDist=20, param1=100, param2=18, minRadius=27, maxRadius=40)
        best, bd = None, 1e9
        if circ is not None:
            for ccx, ccy, r in circ[0]:
                d = (ccx + x0 - px) ** 2 + (ccy + y0 - py) ** 2
                if d < bd:
                    best, bd = (ccx, ccy, r), d
        if best and bd < 30 ** 2:
            ccx, ccy, r = best
        else:
            ccx, ccy, r = px - x0, py - y0, 34
            print('fallback badge', idx, typ)
        cv2.circle(local, (int(ccx), int(ccy)), int(r + 6), 255, -1)
        cx, cy, size = x0 + ccx, y0 + ccy, 2 * r

    elif typ in ('humanoid', 'goblin', 'ring', 'skull', 'ashira', 'giant'):
        hsv = HSV[y0:y1, x0:x1]
        m = np.zeros(hsv.shape[:2], np.uint8)
        for lo, hi in HUE[extra['color']]:
            m |= cv2.inRange(hsv, np.array(lo), np.array(hi))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        comp = nearest_component(m, x0, y0, px, py)
        if comp is None:
            print('fallback colour', idx, typ, extra)
            comp = np.zeros_like(m); cv2.circle(comp, (px - x0, py - y0), 36, 255, -1)
        # merge nearby pieces of the same colour (toes of a footprint, tips of Ashira ears)
        ys, xs = np.where(comp > 0)
        ccx, ccy = xs.mean(), ys.mean()
        n_, lab_, st_, ce_ = cv2.connectedComponentsWithStats(m)
        for j in range(1, n_):
            if st_[j, cv2.CC_STAT_AREA] >= 8 and (ce_[j][0] - ccx) ** 2 + (ce_[j][1] - ccy) ** 2 < 60 ** 2:
                comp |= (lab_ == j).astype(np.uint8) * 255
        if typ != 'ring':
            comp = fill_holes(comp)  # include letters drawn inside the head
        ys, xs = np.where(comp > 0)
        cx, cy = x0 + xs.mean(), y0 + ys.mean()
        size = max(xs.max() - xs.min(), ys.max() - ys.min())
        k = 19 if typ in ('ashira', 'giant') else 13
        local = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        if typ == 'ashira':  # thin black ear tips extend past the coloured fill
            near = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
            dark = ((GRAY[y0:y1, x0:x1] < 90) & (near > 0)).astype(np.uint8) * 255
            local |= cv2.dilate(dark, np.ones((9, 9), np.uint8))
        if extra.get('letter') == '+':
            # black cross drawn just right of the head
            gx0 = int(cx - x0) + 18
            box = np.zeros_like(local)
            box[max(0, int(cy - y0) - 40):int(cy - y0) + 40, gx0:gx0 + 75] = 255
            dark = (GRAY[y0:y1, x0:x1] < 90).astype(np.uint8) * 255 & box
            local |= cv2.dilate(dark, np.ones((11, 11), np.uint8))

    elif typ == 'star':
        dark = (GRAY[y0:y1, x0:x1] < 75).astype(np.uint8) * 255
        comp = nearest_component(dark, x0, y0, px, py, min_area=150)
        if comp is None:
            print('fallback star', idx)
            comp = np.zeros_like(dark); cv2.circle(comp, (px - x0, py - y0), 26, 255, -1)
        ys, xs = np.where(comp > 0)
        cx, cy = x0 + xs.mean(), y0 + ys.mean()
        size = max(xs.max() - xs.min(), ys.max() - ys.min())
        local = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))

    MASK[y0:y1, x0:x1] |= local
    snapped.append(dict(id=f"{CFG['prefix']}{idx + 1:03d}", type=typ, x=round(float(cx), 1), y=round(float(cy), 1), size=int(size), **extra))

# Extra map-key glyphs to remove (dark marks inside the given full-res rectangles).
for (a, b, c, d) in CFG.get('erase_dark', []):
    g = GRAY[b:d, a:c]
    dark = (g < 95).astype(np.uint8) * 255
    MASK[b:d, a:c] |= cv2.dilate(dark, np.ones((9, 9), np.uint8))

json.dump(snapped, open(f'{MAP_ID}-snapped.json', 'w'), indent=1)
cv2.imwrite(f'{MAP_ID}-mask.png', MASK)

# ---- Paint the icons out with ShiftMap (copies real texture from nearby).
# Parchment banners are also marked "unknown" so they are never used as a source,
# but only the icon pixels are taken from the result.
P = ((HSV[..., 1] >= 25) & (HSV[..., 1] <= 115) & (HSV[..., 2] >= 175) & (HSV[..., 0] >= 8) & (HSV[..., 0] <= 28)).astype(np.uint8) * 255
P = cv2.morphologyEx(P, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
P = cv2.dilate(P, np.ones((31, 31), np.uint8))
nP, labP, statsP, _ = cv2.connectedComponentsWithStats(P)
BANNER = np.zeros_like(P)
for i in range(1, nP):  # keep only big parchment blobs (banners), not sand highlights
    if statsP[i, cv2.CC_STAT_AREA] > 12000:
        BANNER[labP == i] = 255
# Lettering: dark pixels sitting on light parchment. Never copy these into a hole.
dk = ((GRAY < 80) & (HSV[..., 1] < 140)).astype(np.float32)
lt = ((HSV[..., 2] > 165) & (HSV[..., 1] < 130)).astype(np.float32)
near_light = cv2.blur(lt, (25, 25))
TEXT = ((dk > 0) & (near_light > 0.35)).astype(np.uint8) * 255
TEXT = cv2.dilate(TEXT, np.ones((41, 41), np.uint8))
BANNER |= TEXT

clean = IMG.copy()
n, lab, stats, _ = cv2.connectedComponentsWithStats(MASK)
for i in range(1, n):
    x, y, w, h = stats[i, :4]
    for pad in (110, 190, 300, 450):
        X0, Y0, X1, Y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
        m = (lab[Y0:Y1, X0:X1] == i).astype(np.uint8) * 255
        unknown = m | (BANNER[Y0:Y1, X0:X1] & ~cv2.dilate(m, np.ones((5, 5), np.uint8)))
        unknown |= (MASK[Y0:Y1, X0:X1] > 0).astype(np.uint8) * 255  # neighbouring icons aren't sources either
        if (unknown == 0).mean() >= 0.4:
            break
    sub = clean[Y0:Y1, X0:X1].copy()
    if (unknown == 0).mean() < 0.2:  # hopeless -> Telea
        filled = cv2.inpaint(sub, m, 9, cv2.INPAINT_TELEA)
    else:
        labi = cv2.cvtColor(sub, cv2.COLOR_BGR2Lab)
        outl = np.zeros_like(labi)
        cv2.xphoto.inpaint(labi, 255 - unknown, outl, cv2.xphoto.INPAINT_SHIFTMAP)
        filled = cv2.cvtColor(outl, cv2.COLOR_Lab2BGR)
    # Poisson-blend the patch so its colours meet the surroundings without a visible seam.
    mm = cv2.dilate(m, np.ones((9, 9), np.uint8))
    mm[:2, :] = 0; mm[-2:, :] = 0; mm[:, :2] = 0; mm[:, -2:] = 0
    ys, xs = np.where(mm > 0)
    bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
    centre = ((bx0 + bx1 + 1) // 2, (by0 + by1 + 1) // 2)
    try:
        blended = cv2.seamlessClone(filled, sub, mm, centre, cv2.NORMAL_CLONE)
    except cv2.error:
        blended = filled
    soft = cv2.GaussianBlur(cv2.dilate(m, np.ones((3, 3), np.uint8)), (7, 7), 0)[..., None] / 255.0
    clean[Y0:Y1, X0:X1] = (blended * soft + sub * (1 - soft)).astype(np.uint8)

os.makedirs('../assets/icons', exist_ok=True)
cv2.imwrite(f'../assets/{MAP_ID}-clean.jpg', clean, [cv2.IMWRITE_JPEG_QUALITY, 88])
cv2.imwrite(f'../assets/{MAP_ID}-clean-half.jpg', cv2.resize(clean, (W // 2, H // 2), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 86])

# ---- Before/after review sheet.
cells = []
for s in snapped:
    r = 70
    x, y = int(s['x']), int(s['y'])
    a = IMG[max(0, y - r):y + r, max(0, x - r):x + r]
    b = clean[max(0, y - r):y + r, max(0, x - r):x + r]
    if a.shape[:2] != (2 * r, 2 * r):
        a = cv2.resize(a, (2 * r, 2 * r)); b = cv2.resize(b, (2 * r, 2 * r))
    cell = np.hstack([a, b])
    cv2.putText(cell, s['id'][-3:], (3, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3)
    cv2.putText(cell, s['id'][-3:], (3, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cells.append(cv2.copyMakeBorder(cell, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(40, 40, 40)))
while len(cells) % 5:
    cells.append(np.full_like(cells[0], 40))
rows = [np.hstack(cells[i:i + 5]) for i in range(0, len(cells), 5)]
for k in range(0, len(rows), 7):
    cv2.imwrite(f'review_{k // 7}.png', np.vstack(rows[k:k + 7]))
print('icons', len(snapped), 'components', n - 1)
