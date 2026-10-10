// Turn the crawl (crawl.json + wm/info.json + wm/ocr.json) into map definitions the app loads.
// Writes ../data/maps/wiki-zones.js (map definitions) and ../data/maps/wiki-zones-wiki.js (page snapshots).
// Usage: node gen_wiki_maps.js
const fs = require('fs');
const crawl = Object.fromEntries(require('./crawl.json').map(z => [z.title, z]));
const info = require('./wm/info.json');
const ocr = require('./wm/ocr.json');
const fixes = fs.existsSync('exit_fixes.json') ? require('./exit_fixes.json') : {};

const HAND_MADE = ['Night Harbor', 'Shaded Dunes']; // defined in their own files
const slug = s => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const today = new Date().toISOString().slice(0, 10);

// Adjacency in either direction: if A lists B, B gets an exit to A too.
const adj = {};
for (const z of Object.values(crawl)) {
  for (const b of z.adjacent) {
    if (b === z.title) continue;
    (adj[z.title] ||= new Set()).add(b);
    (adj[b] ||= new Set()).add(z.title);
  }
}

const maps = [];
for (const [zone, imgs] of Object.entries(info)) {
  if (HAND_MADE.includes(zone)) continue;
  const id = slug(zone);
  const [ww, wh] = imgs[0].webSize;
  const height = Math.round(1600 * wh / ww);
  const images = [
    ...imgs.map((im, n) => ({
      id: n ? `alt-${n}` : 'web',
      name: `${im.file}${n ? '' : ' (default)'}`,
      url: im.web,
      credit: `“${im.file}” from the Monsters & Memories wiki`,
    })),
    ...imgs.map((im, n) => ({
      id: `wiki-${n}`,
      name: `${im.file} – original on the wiki (${im.w}×${im.h})`,
      url: im.url,
      credit: `“${im.file}” from the Monsters & Memories wiki`,
    })),
  ];
  const found = Object.fromEntries((ocr[zone] || []).map(e => [e.to, e]));
  const found0 = (ocr[zone] || []).map(e => e.to);
  const pois = [...new Set([...(adj[zone] || []), ...found0, ...Object.keys(fixes[zone] || {})])].filter(t => t !== zone).sort().map(to => {
    const f = fixes[zone]?.[to] || found[to];
    const p = { id: `${id}-to-${slug(to)}`, name: `To ${to}`, cat: 'travel', toPage: to, wiki: to };
    if (f && Number.isFinite(f.x)) {
      // OCR coordinates are relative to the default image's width; images keep their aspect ratio
      p.x = f.x; p.y = f.y;
      p.desc = `Exit to ${to}${f.text ? ` (“${f.text}” on the map)` : ''}.`;
    } else {
      p.desc = `The wiki lists ${to} as next to ${zone}. Its position on this map isn't known yet.`;
    }
    return p;
  });
  maps.push({ id, name: zone, page: zone.replace(/ /g, '_'), width: 1600, height, source: 'wiki', images, pois });
}
maps.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync('../data/maps/wiki-zones.js',
  `// Zone maps crawled from the Monsters & Memories wiki (work/crawl.js → work/wiki_maps.py → work/gen_wiki_maps.js, ${today}).\n` +
  `// Each has the wiki's map image (local copy + original), and exits to its neighbouring zones. Exits whose spot on\n` +
  `// the map wasn't found have no x/y; place them in the app ("Place on map").\n` +
  `(window.NH_ATLAS_MAPS = window.NH_ATLAS_MAPS || []).push(\n` +
  maps.map(m => '  ' + JSON.stringify(m)).join(',\n') + ',\n);\n');

const snaps = {};
for (const m of maps) {
  const z = crawl[m.name];
  if (z?.wikitext) snaps[m.page] = { page: m.page, fetched: today, wikitext: z.wikitext };
}
fs.writeFileSync('../data/maps/wiki-zones-wiki.js',
  `// Offline copies of the crawled zone pages (raw wikitext). "Sync wiki" fetches the live version.\n` +
  `window.NH_WIKI_SNAPSHOTS = Object.assign(window.NH_WIKI_SNAPSHOTS || {}, ${JSON.stringify(snaps)});\n`);

const placed = maps.reduce((n, m) => n + m.pois.filter(p => Number.isFinite(p.x)).length, 0);
const total = maps.reduce((n, m) => n + m.pois.length, 0);
console.log(`${maps.length} maps, ${total} exits (${placed} placed)`);
