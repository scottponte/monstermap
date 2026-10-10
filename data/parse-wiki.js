// Parses the raw wikitext of the Night Harbor wiki page into structured data.
// Works in the browser (window.parseNightHarborWiki) and in Node (module.exports).
(function (root) {
  const WIKI_BASE = 'https://monstersandmemories.miraheze.org/wiki/';

  function wikiUrl(target) {
    return WIKI_BASE + encodeURIComponent(target.trim().replace(/ +/g, '_')).replace(/%2F/g, '/');
  }

  // Strip [[Target|Label]] / [[Target]] down to their visible label.
  function plain(text) {
    return (text || '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/'''?/g, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // All link targets in a cell, e.g. "[[A]], [[B|b]]" -> ["A", "B"].
  function links(text) {
    const out = [];
    (text || '').replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, t) => { out.push(t.trim()); });
    return out;
  }

  // Split one table row into cells. Pipes inside [[links]] are protected first.
  function splitRow(rowText, expected) {
    const guarded = rowText.replace(/\[\[[^\]]*\]\]/g, m => m.replace(/\|/g, '\u0001'));
    let cells = [];
    for (const line of guarded.split('\n')) {
      const l = line.trim();
      if (!l.startsWith('|') || l.startsWith('|-') || l.startsWith('|}') || l.startsWith('|+')) continue;
      cells.push(...l.replace(/^\|+/, '').split('||'));
    }
    // Some rows use single pipes as separators ("Top Floor | [[Ring]] | Guard").
    if (expected && cells.length < expected) {
      cells = cells.flatMap(c => c.split(/ \| /));
    }
    return cells.map(c => c.replace(/\u0001/g, '|').trim());
  }

  function parseTables(text) {
    const tables = [];
    const re = /\{\|([\s\S]*?)\n\|\}/g;
    let m;
    while ((m = re.exec(text))) {
      const body = m[1];
      const headerLine = body.split('\n').find(l => l.trim().startsWith('!')) || '';
      const headers = headerLine.replace(/^\s*!/, '').split('!!').map(h => plain(h.replace(/^[^|]*\|(?!\|)/, '')));
      const rows = body.split(/\n\|-/).slice(1)
        .map(r => splitRow(r, headers.length))
        .filter(r => r.length > 1);
      tables.push({ headers, rows, start: m.index });
    }
    return tables;
  }

  function parseInfobox(text) {
    const box = {};
    const m = text.match(/\{\{ZoneDetails([\s\S]*?)\n\}\}/);
    if (!m) return box;
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^\|\s*(\w+)\s*=\s*(.*)$/);
      if (kv) box[kv[1]] = kv[2].trim();
    }
    return box;
  }

  function section(text, title) {
    const re = new RegExp('==\\s*' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*==([\\s\\S]*?)(?=\\n==[^=])');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  }

  function parse(wikitext) {
    const text = wikitext.replace(/\r\n/g, '\n');
    const intro = text.split('{{ZoneDetails')[0]
      .replace(/__[A-Z]+__/g, '')
      .replace(/\[\[File:[^\]]*\]\]/g, '')
      .split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
    const infobox = parseInfobox(text);
    const tables = parseTables(text);

    const quests = [];
    const npcs = [];
    const items = [];
    const districts = [];

    for (const t of tables) {
      const h0 = t.headers[0] || '';
      if (h0 === 'Quest Name') {
        for (const r of t.rows) {
          quests.push({
            name: r[0], reward: r[1] || '', giver: r[2] || '', level: plain(r[3]), classes: r[4] || '',
            giverNames: links(r[2]).length ? links(r[2]) : [plain(r[2])],
          });
        }
      } else if (/NPC/i.test(h0) && t.headers.some(h => /^Level$/i.test(h))) {
        // "NPCs - <area>" tables (Night Harbor) or "Named NPCs" / "Common NPCs" (most other zones)
        const district = h0.replace(/^NPCs\s*-\s*/, '').trim();
        districts.push(district);
        for (const r of t.rows) {
          npcs.push({
            name: plain(r[0]), raw: r[0], district,
            race: plain(r[1]), cls: plain(r[2]), level: plain(r[3]),
            location: plain(r[4]), loot: r[5] || '', desc: r[6] || '',
          });
        }
      } else if (h0 === 'Item Name') {
        for (const r of t.rows) items.push({ name: r[0], dropsFrom: r[1] || '', slot: plain(r[2]) });
      }
    }

    return {
      intro, infobox, quests, npcs, items, districts,
      travel: section(text, "Traveling To and From"),
    };
  }

  const api = { parse, plain, links, wikiUrl, WIKI_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NHWiki = api;
})(typeof window !== 'undefined' ? window : globalThis);
