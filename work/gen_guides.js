// Build the in-app guides from work/guides.json (see crawl_skills.js).
//   ../data/guides/leveling.js        hunting spots by level, from the wiki's Per-Level Hunting Guide
//   ../data/guides/skills.js          index of every skill: group, summary, trainers, recipe tiers
//   ../data/guides/skills/<slug>.js   the skill's wiki page as HTML, loaded on demand
// Usage: node gen_guides.js
const fs = require('fs');
const g = require('./guides.json');
const WIKI = 'https://monstersandmemories.miraheze.org';
const slug = s => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = s => String(s || '')
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/'''?/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const links = s => [...String(s || '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim());

// "4-6", "3+", "12?", "Most Can't", "" -> { text, min, max }
function levelRange(raw) {
  const text = plain(raw).replace(/^-$/, '');
  const nums = (text.match(/\d+/g) || []).map(Number);
  if (!nums.length) return { text, min: null, max: null };
  if (nums.length >= 2) return { text, min: Math.min(...nums), max: Math.max(...nums) };
  return { text, min: nums[0], max: /\+/.test(text) ? nums[0] + 5 : nums[0] }; // "3+" = from 3, for a few levels
}

// ---------- leveling ----------
const spots = [];
let bracket = '';
for (const part of g.hunting.split(/(?=====\s*Hunting Spots)/)) {
  const h = part.match(/====\s*Hunting Spots\s*([\d]+)\s*-\s*([\d]+)\s*====/);
  if (!h) continue;
  bracket = `${h[1]}–${h[2]}`;
  for (const m of part.matchAll(/\{\{HuntingGuideSpot([\s\S]*?)\n\}\}/g)) {
    const f = {};
    for (const line of m[1].split(/\n\s*\|/)) {
      const kv = line.match(/^\s*\|?\s*(\w+)\s*=\s*([\s\S]*)$/);
      if (kv) f[kv[1]] = kv[2].trim();
    }
    const image = (f.image || '').trim();
    spots.push({
      bracket, bracketMin: +h[1], bracketMax: +h[2],
      solo: levelRange(f.soloLevel), group: levelRange(f.groupLevel),
      zones: links(f.zone).length ? links(f.zone) : [plain(f.zone)].filter(Boolean),
      area: plain(f.area), monsters: plain(f.monsters).replace(/\s+-\s+/g, ', '),
      notes: (f.notes || '').trim().replace(/^-$/, ''),
      image: g.images[image] || '',
    });
  }
}
const intro = g.hunting.split('====')[0].split('\n').map(l => l.trim()).filter(Boolean).map(l => l.replace(/'''/g, ''));
fs.mkdirSync('../data/guides/skills', { recursive: true });
fs.writeFileSync('../data/guides/leveling.js',
  `// Hunting spots by level, from the wiki's "Per-Level Hunting Guide" (work/gen_guides.js, ${g.fetched}).\n` +
  `(window.NH_GUIDES = window.NH_GUIDES || {}).leveling = ${JSON.stringify({ fetched: g.fetched, page: 'Per-Level_Hunting_Guide', intro, spots }, null, 1)};\n`);

// ---------- skills ----------
// Groups and one-line summaries from the "Skills" overview page.
const overview = {};
let grp = '';
for (const part of g.skillsOverview.split(/\n(?==)/)) {
  const g3 = part.match(/^===\s*([^=]+?)\s*===\s*$/m);
  if (g3 && !/^====/.test(part)) grp = g3[1].replace(/ Skills$/, '');
  const s4 = part.match(/^====\s*\[\[([^\]|]+)\|?([^\]]*)\]\]\s*====\s*([\s\S]*)$/);
  if (s4) overview[s4[1].replace(/_/g, ' ').trim()] = { group: grp, summary: plain(s4[3].split('\n\n')[0]) };
}
const ORDER = ['Tradeskills', 'Combat', 'Weapon', 'Spell', 'Innate', 'Non-Combat', 'Bard', 'Other'];

function infobox(wt) {
  const m = wt.match(/^\{\|[^\n]*float:\s*right[\s\S]*?\n\|\}/);
  if (!m) return {};
  const info = {};
  for (const row of m[0].split(/\n\|-/).slice(1)) {
    const k = row.match(/\n!\s*[^|\n]*\|\s*([^\n]+)/), v = row.match(/\n\|\s*[^|\n]*\|\s*([^\n]+)/);
    if (k && v) info[plain(k[1])] = plain(v[1].replace(/<br\s*\/?>/gi, ', '));
  }
  return info;
}

function cleanHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/^(<div class="mw-content-ltr[^>]*>)<table style="float: right[\s\S]*?<\/table>/, '$1') // the infobox: shown separately
    .replace(/\s(?:srcset|decoding|loading|data-file-width|data-file-height|style|bgcolor|cellpadding|cellspacing|cellborder|width|height|align|valign)="[^"]*"/gi, '')
    .replace(/\s(?:style|bgcolor|width|align)='[^']*'/gi, '')
    .replace(/(href|src)="\/\//g, '$1="https://')
    .replace(/(href|src)="\/(?!\/)/g, `$1="${WIKI}/`)
    .replace(/\n{2,}/g, '\n');
}

const index = [];
for (const [title, wt] of Object.entries(g.skills)) {
  const name = title.replace(/^Skill /, '');
  const o = overview[title] || {};
  const group = g.tradeskills.includes(title) ? 'Tradeskills' : (o.group || 'Other');
  const html = cleanHtml(g.html[title] || '');
  const firstPara = plain((html.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || '');
  const tiers = [...wt.matchAll(/^=+\s*Trivial\s*(\d+)\s*(?:[–-]\s*(\d+))?(\+)?[^=\n]*=+\s*$/gm)]
    .map(m => ({ title: plain(m[0].replace(/=/g, '')), min: +m[1], max: m[2] ? +m[2] : +m[1] }));
  const status = /\{\{NotImplemented/.test(wt) ? 'Not in the game yet'
    : /\{\{RemovedFromGame/.test(wt) ? 'Removed from the game'
    : /\{\{OutOfDate/.test(wt) ? 'Wiki page is out of date'
    : /\{\{NeedsInfo/.test(wt) ? 'Wiki page needs more info' : '';
  const text = plain(html);
  const s = {
    slug: slug(name), name, page: title.replace(/ /g, '_'), group,
    // one-liner from the Skills overview; pages without one open straight into their own first paragraph
    summary: o.summary || '', status, info: infobox(wt), tiers,
    words: text.split(' ').length,
    hasContent: text.length > 400 && !/\{\{NotImplemented/.test(wt),
  };
  index.push(s);
  fs.writeFileSync(`../data/guides/skills/${s.slug}.js`,
    `(window.NH_SKILL_PAGES = window.NH_SKILL_PAGES || {})[${JSON.stringify(s.slug)}] = ${JSON.stringify(html)};\n`);
}
index.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || a.name.localeCompare(b.name));
fs.writeFileSync('../data/guides/skills.js',
  `// Every skill on the wiki: group, summary, infobox and recipe tiers (work/gen_guides.js, ${g.fetched}).\n` +
  `// The full page for each skill is in skills/<slug>.js and is loaded when opened.\n` +
  `(window.NH_GUIDES = window.NH_GUIDES || {}).skills = ${JSON.stringify({ fetched: g.fetched, groups: ORDER, list: index }, null, 1)};\n`);

console.log(`${spots.length} hunting spots; ${index.length} skills`);
for (const o of ORDER) console.log(' ', o.padEnd(12), index.filter(s => s.group === o).map(s => s.name + (s.tiers.length ? `(${s.tiers.length})` : '') + (s.hasContent ? '' : '·')).join(', '));
