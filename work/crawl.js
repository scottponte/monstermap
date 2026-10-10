// Crawl the M&M wiki for zone pages and their map images.
// Writes work/crawl.json: [{ page, title, wikitext, adjacent, images: [{name,url,width,height,score}] }]
// Usage: node crawl.js
const fs = require('fs');
const API = 'https://monstersandmemories.miraheze.org/w/api.php';
const UA = { 'User-Agent': 'NightHarborAtlas/1.0 (personal map project)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${API}?${q}`, { headers: UA });
    if (r.ok) return r.json();
    await sleep(1500);
  }
  throw new Error('API failed: ' + q);
}

const SCREEN_WIDTHS = [1280, 1366, 1440, 1600, 1920, 2560, 3440, 3840];
function score(name, w, h) {
  let s = w * h;
  if (/map|\bv\d+|draft|isometric/i.test(name)) s *= 3;
  if (/screenshot/i.test(name)) s *= 0.1;
  if (SCREEN_WIDTHS.includes(w)) s *= 0.2;
  if (/\.png$/i.test(name)) s *= 0.7;
  return s;
}

(async () => {
  const pages = new Set();
  for (const cat of ['Category:Zones', 'Category:Cities']) {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmlimit: '500' });
    j.query.categorymembers.filter(m => m.ns === 0).forEach(m => pages.add(m.title));
  }
  pages.delete('Starting City by Race, Class, and Deity');
  const out = [];
  for (const title of [...pages].sort()) {
    const parse = await api({ action: 'parse', page: title, prop: 'wikitext' });
    const wikitext = parse.parse?.wikitext || '';
    const imgs = await api({ action: 'query', generator: 'images', titles: title, gimlimit: '50', prop: 'imageinfo', iiprop: 'url|size' });
    const images = (imgs.query?.pages || []).filter(p => p.imageinfo?.[0]).map(p => {
      const i = p.imageinfo[0], name = p.title.replace(/^File:/, '');
      return { name, url: i.url, width: i.width, height: i.height, score: score(name, i.width, i.height) };
    }).sort((a, b) => b.score - a.score);
    const adj = (wikitext.match(/\|\s*AdjacentZones\s*=\s*(.*)/) || [, ''])[1];
    const adjacent = [...adj.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1].trim());
    out.push({ page: title.replace(/ /g, '_'), title, wikitext, adjacent, images });
    console.log(title.padEnd(32), images[0] ? `${images[0].name} ${images[0].width}x${images[0].height}` : '(no images)', '| adj:', adjacent.join(', '));
    await sleep(300);
  }
  fs.writeFileSync('crawl.json', JSON.stringify(out, null, 1));
})();
