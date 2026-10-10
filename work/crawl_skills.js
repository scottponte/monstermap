// Fetch the leveling sources from the wiki: the Per-Level Hunting Guide, the Skills overview, and every skill page.
// Writes work/guides.json. Usage: node crawl_skills.js   (then: node gen_guides.js)
const fs = require('fs');
const API = 'https://monstersandmemories.miraheze.org/w/api.php';
const UA = { headers: { 'User-Agent': 'MonsterMap/1.0 (personal map project)' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${API}?${q}`, UA);
    if (r.ok) return r.json();
    await sleep(1500);
  }
  throw new Error('API failed ' + q);
}
const text = async title => (await api({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' })).parse?.wikitext || '';
// The wiki's own rendering, so tables and templates come through intact.
const html = async title => (await api({
  action: 'parse', page: title, prop: 'text', redirects: '1',
  disableeditsection: '1', disabletoc: '1', disablelimitreport: '1',
})).parse?.text || '';

(async () => {
  const out = {
    fetched: new Date().toISOString().slice(0, 10),
    hunting: await text('Per-Level Hunting Guide'),
    skillsOverview: await text('Skills'),
    skills: {}, html: {}, images: {},
  };
  const cats = {};
  for (const c of ['Skills', 'Tradeskills']) {
    const r = await api({ action: 'query', list: 'categorymembers', cmtitle: 'Category:' + c, cmlimit: '500' });
    cats[c] = r.query.categorymembers.filter(m => m.ns === 0).map(m => m.title);
  }
  out.tradeskills = cats.Tradeskills;
  for (const t of [...new Set([...cats.Skills, ...cats.Tradeskills])].sort()) {
    if (t === 'Skills') continue;
    out.skills[t] = await text(t);
    out.html[t] = await html(t);
    console.log(t, out.skills[t].length, out.html[t].length);
    await sleep(120);
  }
  // Thumbnails for the hunting guide's monster pictures.
  const files = [...new Set([...out.hunting.matchAll(/\|\s*image\s*=\s*([^\n|}]+)/g)].map(m => m[1].trim()).filter(Boolean))];
  for (let i = 0; i < files.length; i += 40) {
    const r = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '160', titles: files.slice(i, i + 40).map(f => 'File:' + f).join('|') });
    const from = Object.fromEntries((r.query.normalized || []).map(n => [n.to, n.from]));
    for (const pg of r.query.pages || []) {
      if (pg.imageinfo?.[0]) out.images[(from[pg.title] || pg.title).replace(/^File:/, '')] = pg.imageinfo[0].thumburl || pg.imageinfo[0].url;
    }
  }
  fs.writeFileSync('guides.json', JSON.stringify(out, null, 1));
})();
