"""Make web copies of the crawled wiki maps and find their exits with OCR.

Inputs : wm/info.json (from the download step), crawl.json (zone pages, adjacent zones)
Outputs: ../assets/maps/<id>-<n>.jpg   web copies (max 4096 px wide)
         wm/ocr.json                    exits found: {zone: [{to, x, y, text}]} in map units (1600 wide)
"""
import json, re, difflib
import cv2
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

Image.MAX_IMAGE_PIXELS = None
INFO = json.load(open('wm/info.json', encoding='utf-8'))
CRAWL = {z['title']: z for z in json.load(open('crawl.json', encoding='utf-8'))}
ALL_ZONES = list(CRAWL)
ocr = RapidOCR()

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower().replace("'", '')).strip('-')


def load(path):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return cv2.cvtColor(np.array(im.convert('RGB')), cv2.COLOR_RGB2BGR)


def match_zone(text, candidates):
    t = re.sub(r'^(to|To|TO)\s+', '', text).strip(" .:-~>'\"")
    if len(t) < 4:
        return None, 0
    best, bs = None, 0
    for z in candidates:
        s = difflib.SequenceMatcher(None, t.lower(), z.lower()).ratio()
        if s > bs:
            best, bs = z, s
    return best, bs


found = {}
for zone, imgs in INFO.items():
    zid = slug(zone)
    for n, im in enumerate(imgs):
        out = f'../assets/maps/{zid}-{n + 1}.jpg'
        img = load(im['local'])
        h, w = img.shape[:2]
        if w > 4096:
            img = cv2.resize(img, (4096, round(h * 4096 / w)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        im['web'] = out[3:]
        im['webSize'] = [img.shape[1], img.shape[0]]
        if n:
            continue
        # OCR the default map at <=3000 px, in overlapping tiles so small text survives
        scale = min(1, 3000 / img.shape[1])
        o = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else img
        H, W = o.shape[:2]
        T = 1100
        hits = []
        for y0 in range(0, max(1, H - 200), T - 200):
            for x0 in range(0, max(1, W - 200), T - 200):
                res, _ = ocr(o[y0:y0 + T, x0:x0 + T])
                for box, text, conf in res or []:
                    xs = [p[0] for p in box]; ys = [p[1] for p in box]
                    hits.append((text, conf, x0 + sum(xs) / 4, y0 + sum(ys) / 4))
        cands = [z for z in set(CRAWL[zone]['adjacent'] + ALL_ZONES) if z != zone]
        exits = {}
        for text, conf, x, y in hits:
            z, s = match_zone(text, cands)
            is_to = bool(re.match(r'^\s*to\s', text, re.I))
            if z and (s >= 0.82 or (is_to and s >= 0.7)):
                k = (z, round(x / 60), round(y / 60))
                ux, uy = x / W * 1600, y / W * 1600
                if z not in exits or (is_to and not exits[z]['is_to']):
                    exits[z] = {'to': z, 'x': round(ux, 1), 'y': round(uy, 1), 'text': text, 'score': round(s, 2), 'is_to': is_to}
        found[zone] = list(exits.values())
        print(f'{zone:28s} {len(hits):4d} words  exits: ' + ', '.join(f"{e['to']} ({e['text']!r})" for e in found[zone]))

json.dump(found, open('wm/ocr.json', 'w', encoding='utf-8'), indent=1)
json.dump(INFO, open('wm/info.json', 'w', encoding='utf-8'), indent=1)
