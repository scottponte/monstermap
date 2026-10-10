// Download the map images chosen in wiki_maps.json (originals) and record their sizes in wm/info.json.
// Usage: node download_maps.js   (then: python wiki_maps.py, node gen_wiki_maps.js)
const fs = require('fs');
const choices = require('./wiki_maps.json');
const UA = { headers: { 'User-Agent': 'NightHarborAtlas/1.0 (personal map project)' } };
(async () => {
  fs.mkdirSync('wm/orig', { recursive: true });
  const info = {};
  for (const [zone, files] of Object.entries(choices)) {
    if (zone.startsWith('_')) continue;
    info[zone] = [];
    for (const f of files) {
      const r = await (await fetch('https://monstersandmemories.miraheze.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size&format=json&formatversion=2&titles=' + encodeURIComponent('File:' + f), UA)).json();
      const i = r.query.pages[0].imageinfo[0];
      const local = 'wm/orig/' + f.replace(/[^\w.]/g, '_');
      if (!fs.existsSync(local)) fs.writeFileSync(local, Buffer.from(await (await fetch(i.url, UA)).arrayBuffer()));
      info[zone].push({ file: f, local, url: i.url, w: i.width, h: i.height });
    }
    console.log(zone, info[zone].length);
  }
  fs.writeFileSync('wm/info.json', JSON.stringify(info, null, 1));
})();
